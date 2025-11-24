import { Hono } from 'hono';

import { RoomManager } from './room.ts';

const app = new Hono();
const roomManager = new RoomManager();

// Map to store active WebSocket connections: roomId -> Set<WebSocket>
const activeConnections = new Map<string, Set<WebSocket>>();

app.get('/', (c) => c.text('Dark Beast Chess Server is Running!'));

app.get('/ws', (c) => {
  const { response, socket: ws } = Deno.upgradeWebSocket(c.req.raw);
  const sessionId = crypto.randomUUID();
  let currentRoomId: string | null = null;

  ws.onopen = () => {
    console.log(`Client connected: ${sessionId}`);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      if (msg.type === 'CREATE_ROOM') {
          const roomId = await roomManager.createRoom();
          currentRoomId = roomId;

          // Auto join
          await roomManager.joinRoom(roomId, sessionId);

          addToActiveConnections(roomId, ws);

          ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId, sessionId }));
      }
      else if (msg.type === 'JOIN_ROOM') {
          const { roomId } = msg;
          const result = await roomManager.joinRoom(roomId, sessionId);

          if (result.success) {
              currentRoomId = roomId;
              addToActiveConnections(roomId, ws);

              const room = await roomManager.getRoom(roomId);
              const seatIndex = room?.seats.indexOf(sessionId);

              ws.send(JSON.stringify({
                  type: 'JOINED',
                  roomId,
                  sessionId,
                  seatIndex,
                  gameState: room?.gameState
              }));

              // Broadcast to others that someone joined
              broadcastToRoom(roomId, { type: 'PLAYER_JOINED', count: room?.seats.filter(s => s).length });

              // Refetch room to get updated status
              const updatedRoom = await roomManager.getRoom(roomId);
              if (updatedRoom?.status === 'PLAYING') {
                   broadcastToRoom(roomId, { type: 'GAME_START', gameState: updatedRoom.gameState });
              }
          } else {
              ws.send(JSON.stringify({ type: 'ERROR', message: result.error }));
          }
      }
      else if (msg.type === 'ACTION') {
          if (!currentRoomId) return;
          const room = await roomManager.getRoom(currentRoomId);
          if (!room) return;

          // Check if it's this player's turn
          const seatIndex = room.seats.indexOf(sessionId);
          if (seatIndex === -1) return;

          const engine = roomManager.hydrateEngine(room.gameState);

          // Check turn
          let isTurn = false;
          if (engine.phase === 'COLOR_SELECTION') {
              isTurn = true; // Anyone can start
          } else {
              const myColor = room.playerColors[sessionId];
              if (myColor && engine.currentPlayer === myColor) {
                  isTurn = true;
              }
          }

          if (!isTurn) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
              return;
          }

          // Execute Action
          const { action, payload } = msg;
          let result;

          if (action === 'FLIP') {
              if (engine.phase === 'COLOR_SELECTION') {
                  result = engine.processColorSelection(payload.row, payload.col);
              } else {
                  result = engine.processFlip(payload.row, payload.col);
              }
          } else if (action === 'MOVE') {
              result = engine.executeMove(payload.fromRow, payload.fromCol, payload.targetRow, payload.targetCol);
          }

          if (result && result.success) {
              // Save state
              await roomManager.updateRoomState(currentRoomId, engine);

              broadcastToRoom(currentRoomId, {
                  type: 'STATE_UPDATE',
                  gameState: roomManager.serializeEngine(engine),
                  lastAction: { action, payload, result }
              });
          } else {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid move' }));
          }
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  };

  ws.onclose = () => {
    console.log(`Client disconnected: ${sessionId}`);
    if (currentRoomId) {
        const conns = activeConnections.get(currentRoomId);
        if (conns) {
            conns.delete(ws);
            if (conns.size === 0) activeConnections.delete(currentRoomId);
        }
    }
  };

  return response;
});

function addToActiveConnections(roomId: string, ws: WebSocket) {
    if (!activeConnections.has(roomId)) {
        activeConnections.set(roomId, new Set());
    }
    activeConnections.get(roomId)!.add(ws);
}

function broadcastToRoom(roomId: string, message: any) {
    const conns = activeConnections.get(roomId);
    if (conns) {
        const msgStr = JSON.stringify(message);
        for (const ws of conns) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msgStr);
            }
        }
    }
}

Deno.serve(app.fetch);
