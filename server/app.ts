import { Hono } from 'hono';
import { cors } from 'hono/middleware.ts';

import { RoomManager } from './room.ts';

declare const Deno: any;

export function createApp() {
  const app = new Hono();
  const roomManager = new RoomManager();

  // Map to store active WebSocket connections: roomId -> Set<WebSocket>
  const activeConnections = new Map<string, Set<WebSocket>>();

  app.get('/', (c) => c.text('Dark Beast Chess Server is Running!'));

  // 允许前端开发环境跨域访问房间列表
  app.use('*', cors());

  app.get('/rooms', async (c) => {
    const rooms = await roomManager.listRooms();
    return c.json({ rooms });
  });

  app.get('/ws', (c) => {
    const { response, socket: ws } = Deno.upgradeWebSocket(c.req.raw);
    const sessionId = crypto.randomUUID();
    let currentRoomId: string | null = null;

    ws.onopen = () => {
      console.log(`Client connected: ${sessionId}`);
    };

    ws.onmessage = async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'CREATE_ROOM') {
          const roomId = await roomManager.createRoom();
          currentRoomId = roomId;

          // Auto join
          await roomManager.joinRoom(roomId, sessionId);

          addToActiveConnections(roomId, ws);

          ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId, sessionId }));
        } else if (msg.type === 'JOIN_ROOM') {
          const { roomId } = msg;
          const result = await roomManager.joinRoom(roomId, sessionId);

          if (result.success) {
            currentRoomId = roomId;
            addToActiveConnections(roomId, ws);

            const room = await roomManager.getRoom(roomId);
            const seatIndex = room?.seats.indexOf(sessionId);

            ws.send(
              JSON.stringify({
                type: 'JOINED',
                roomId,
                sessionId,
                seatIndex,
                gameState: room?.gameState,
              }),
            );

            // Broadcast to others that someone joined
            const playerCount = room?.seats.filter((s) => s).length;
            broadcastToRoom(roomId, { type: 'PLAYER_JOINED', count: playerCount });

            // If room is full, notify that players are ready (but don't start game yet)
            if (playerCount === 2) {
              broadcastToRoom(roomId, { type: 'PLAYERS_READY' });
            }

            // If joining a game already in progress
            if (room?.status === 'PLAYING') {
              broadcastToRoom(roomId, { type: 'GAME_START', gameState: room.gameState });
            }
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', message: result.error }));
          }
        } else if (msg.type === 'START_GAME') {
          if (!currentRoomId) return;
          const room = await roomManager.getRoom(currentRoomId);
          if (!room) return;

          // Only creator (seat 0) can start
          if (room.seats[0] !== sessionId) {
            ws.send(JSON.stringify({ type: 'ERROR', message: '只有房主可以开始游戏' }));
            return;
          }

          const engine = roomManager.hydrateEngine(room.gameState);
          if (engine.phase === 'SETUP') {
            engine.startGame();
            await roomManager.updateRoomState(currentRoomId, engine);

            const startedRoom = await roomManager.getRoom(currentRoomId);
            broadcastToRoom(currentRoomId, { type: 'GAME_START', gameState: startedRoom?.gameState });
          }
        } else if (msg.type === 'ACTION') {
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
            // Only creator (seat 0) can start the first move
            if (room.seats[0] === sessionId) {
              isTurn = true;
            } else {
              ws.send(JSON.stringify({ type: 'ERROR', message: '等待房主先手翻牌' }));
              return;
            }
          } else {
            const myColor = room.playerColors[sessionId];
            if (myColor && engine.currentPlayer === myColor) {
              isTurn = true;
            }
          }

          if (!isTurn) {
            ws.send(JSON.stringify({ type: 'ERROR', message: '不是你的回合' }));
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
              lastAction: { action, payload, result },
            });
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', message: '无效操作' }));
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

  return app;
}
