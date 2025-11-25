import { Hono } from 'hono';
import { cors } from 'hono/middleware.ts';

import { RoomManager } from './room.ts';
import type { PlayerColor } from '../src/game/core/types.ts';
import type { Room } from './room.ts';

declare const Deno: any;

export function createApp() {
  const app = new Hono();
  const roomManager = new RoomManager();

  // Map to store active WebSocket connections: roomId -> Set<WebSocket>
  const activeConnections = new Map<string, Set<WebSocket>>();
  // KV 作为跨实例共享状态，这里维护本实例的快照和轮询任务，确保在不同实例之间也能感知房间状态变更
  const roomSnapshots = new Map<string, { lastUpdated: number; seatsCount: number; phase: string; status: Room['status'] }>();
  const roomPollers = new Map<string, ReturnType<typeof setInterval>>();

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
    let gameStarted = false;

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

          // 缓存快照，避免后续轮询重复推送
          const createdRoom = await roomManager.getRoom(roomId);
          if (createdRoom) cacheRoomSnapshot(createdRoom);

          ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId, sessionId }));
        } else if (msg.type === 'JOIN_ROOM') {
          const { roomId } = msg;
          const result = await roomManager.joinRoom(roomId, sessionId);

          if (result.success) {
            currentRoomId = roomId;
            addToActiveConnections(roomId, ws);

            const room = await roomManager.getRoom(roomId);
            const seatIndex = room?.seats.indexOf(sessionId);
            gameStarted = room?.gameState?.phase !== 'SETUP';

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

            if (room) cacheRoomSnapshot(room);
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', message: result.error }));
          }
        } else if (msg.type === 'START_GAME') {
          if (!currentRoomId) return;
          const room = await roomManager.getRoom(currentRoomId);
          if (!room) return;
          gameStarted = true;

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
            if (startedRoom) cacheRoomSnapshot(startedRoom);
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

            const updatedRoom = await roomManager.getRoom(currentRoomId);
            if (updatedRoom) cacheRoomSnapshot(updatedRoom);

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
      if (!currentRoomId) return;
      handleDisconnect(currentRoomId, sessionId, ws, gameStarted);
    };

    return response;
  });

  function addToActiveConnections(roomId: string, ws: WebSocket) {
    if (!activeConnections.has(roomId)) {
      activeConnections.set(roomId, new Set());
    }
    activeConnections.get(roomId)!.add(ws);
    ensureRoomSync(roomId);
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

  async function closeRoom(roomId: string) {
    const conns = activeConnections.get(roomId);
    broadcastToRoom(roomId, { type: 'ROOM_CLOSED' });
    if (conns) {
      for (const sock of conns) {
        if (sock.readyState === WebSocket.OPEN) {
          sock.close();
        }
      }
      activeConnections.delete(roomId);
    }
    stopRoomSync(roomId);
    await roomManager.deleteRoom(roomId);
  }

  async function handleDisconnect(roomId: string, sessionId: string, ws: WebSocket, startedFlag: boolean) {
    const conns = activeConnections.get(roomId);
    if (conns) conns.delete(ws);

    const room = await roomManager.getRoom(roomId);
    if (!room) {
      if (conns && conns.size === 0) activeConnections.delete(roomId);
      if (!conns || conns.size === 0) stopRoomSync(roomId);
      return;
    }

    // Remove leaver from seats and compute remaining
    const seatIndex = room.seats.indexOf(sessionId);
    if (seatIndex === -1) {
      if (conns && conns.size === 0) activeConnections.delete(roomId);
      if (!conns || conns.size === 0) stopRoomSync(roomId);
      return;
    }
    const isCreator = seatIndex === 0;
    room.seats[seatIndex] = null;
    delete room.playerColors[sessionId];
    const remainingSessions = room.seats.filter((s): s is string => !!s);
    const remainingCount = remainingSessions.length;
    const hasStarted = startedFlag || room.gameState.phase !== 'SETUP';

    // Case 1: 房间无人或仅一人且是当前离开者 -> 解散
    if (remainingCount === 0) {
      await closeRoom(roomId);
      return;
    }

    // Case 2: 未开局
    if (!hasStarted) {
      if (isCreator) {
        await closeRoom(roomId);
        return;
      } else {
        // 非房主离开，回到等待状态
        room.status = 'WAITING';
        room.lastUpdated = Date.now();
        await roomManager.saveRoom(room);
        cacheRoomSnapshot(room);
        broadcastToRoom(roomId, { type: 'PLAYER_LEFT', count: remainingCount });
        return;
      }
    }

    // Case 3: 已开局，提前退出判负
    const winnerSession = remainingSessions[0];
    const winnerSeatIndex = room.seats.indexOf(winnerSession);
    const mappedColor =
      room.playerColors[winnerSession] ??
      (winnerSeatIndex === 0 ? room.gameState.playerColors.player1 : room.gameState.playerColors.player2);
    // 如果仍未确定颜色，按座位兜底指定红/蓝，确保能结算胜负
    const winnerColor: PlayerColor | null = (mappedColor as PlayerColor | null) ?? (winnerSeatIndex === 0 ? 'red' : 'blue');

    if (winnerColor) {
      room.playerColors[winnerSession] = winnerColor;
      const engine = roomManager.hydrateEngine(room.gameState);
      engine.endGame(winnerColor);
      room.gameState = roomManager.serializeEngine(engine);
    }
    room.status = 'FINISHED';
    room.lastUpdated = Date.now();
    await roomManager.saveRoom(room);
    cacheRoomSnapshot(room);

    broadcastToRoom(roomId, {
      type: 'STATE_UPDATE',
      gameState: room.gameState,
      lastAction: { action: 'FORFEIT', payload: { leaver: sessionId }, result: null },
    });

    setTimeout(() => {
      closeRoom(roomId);
    }, 3000);
  }

  function cacheRoomSnapshot(room: Room) {
    roomSnapshots.set(room.id, {
      lastUpdated: room.lastUpdated,
      seatsCount: room.seats.filter(Boolean).length,
      phase: room.gameState.phase,
      status: room.status,
    });
  }

  async function syncRoomFromKv(roomId: string) {
    const room = await roomManager.getRoom(roomId);
    const conns = activeConnections.get(roomId);
    if (!room) {
      if (conns && conns.size > 0) {
        broadcastToRoom(roomId, { type: 'ROOM_CLOSED' });
      }
      stopRoomSync(roomId);
      return;
    }

    const seatsCount = room.seats.filter(Boolean).length;
    const snapshot = roomSnapshots.get(roomId);
    const prevCount = snapshot?.seatsCount ?? 0;

    if (
      snapshot &&
      snapshot.lastUpdated === room.lastUpdated &&
      snapshot.seatsCount === seatsCount &&
      snapshot.phase === room.gameState.phase &&
      snapshot.status === room.status
    ) {
      return;
    }

    cacheRoomSnapshot(room);

    if (seatsCount !== prevCount) {
      const type = seatsCount > prevCount ? 'PLAYER_JOINED' : 'PLAYER_LEFT';
      broadcastToRoom(roomId, { type, count: seatsCount });
    }
    if (seatsCount === 2) {
      broadcastToRoom(roomId, { type: 'PLAYERS_READY' });
    }
    if (room.gameState.phase !== 'SETUP' || room.status === 'PLAYING') {
      broadcastToRoom(roomId, { type: 'GAME_START', gameState: room.gameState });
    }
  }

  function ensureRoomSync(roomId: string) {
    if (roomPollers.has(roomId)) return;

    const timer = setInterval(() => {
      const conns = activeConnections.get(roomId);
      if (!conns || conns.size === 0) {
        stopRoomSync(roomId);
        return;
      }
      syncRoomFromKv(roomId);
    }, 1500);

    roomPollers.set(roomId, timer);
    // 立即拉取一次，减少首轮延迟
    syncRoomFromKv(roomId);
  }

  function stopRoomSync(roomId: string) {
    const timer = roomPollers.get(roomId);
    if (timer) {
      clearInterval(timer);
    }
    roomPollers.delete(roomId);
    roomSnapshots.delete(roomId);
  }

  return app;
}
