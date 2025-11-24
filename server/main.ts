import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/deno';
import { RoomManager } from './room.ts';

const app = new Hono();
const roomManager = new RoomManager();

// Map to store active WebSocket connections: roomId -> Set<WebSocket>
const activeConnections = new Map<string, Set<WebSocket>>();

app.get('/', (c) => c.text('Dark Beast Chess Server is Running!'));

app.get('/ws', upgradeWebSocket((c) => {
  const sessionId = crypto.randomUUID();
  let currentRoomId: string | null = null;

  return {
    onOpen(_event, ws) {
      console.log(`Client connected: ${sessionId}`);
    },
    async onMessage(event, ws) {
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

                if (room?.status === 'PLAYING') {
                     broadcastToRoom(roomId, { type: 'GAME_START', gameState: room.gameState });
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
            // If colors are assigned, check color
            // If colors NOT assigned (first flip), anyone can flip?
            // Actually CoreEngine handles the logic of "who can move".
            // But we need to ensure the WebSocket sender matches the `currentPlayer` color.

            // If phase is COLOR_SELECTION, anyone can flip.
            // If phase is PLAYING, check color.

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
                // We need to handle the "Color Selection" special case in CoreEngine
                // CoreEngine.processColorSelection vs processFlip
                // Actually CoreEngine separates them.
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

                // Broadcast update
                // We need to send specific info to each client?
                // Or just broadcast and let client figure out?
                // Client knows its sessionId.
                // But client doesn't know which color belongs to which session unless we tell it.
                // Let's send the playerColors map (session -> color) or just map seats to colors.
                // engine.playerColors has { player1: Color, player2: Color }.
                // Seat 0 is player1, Seat 1 is player2.
                // So client just needs to know its Seat Index.

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
    },
    onClose(_event, ws) {
      console.log(`Client disconnected: ${sessionId}`);
      if (currentRoomId) {
          const conns = activeConnections.get(currentRoomId);
          if (conns) {
              conns.delete(ws);
              if (conns.size === 0) activeConnections.delete(currentRoomId);
          }
      }
    },
  };
}));

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
