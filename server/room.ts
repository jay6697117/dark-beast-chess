import { CoreEngine } from '../src/game/core/CoreEngine.ts';
import { GamePhase, PlayerColor } from '../src/game/core/types.ts';

export interface Room {
  id: string;
  // Store session IDs of the two players
  seats: (string | null)[];
  // Map session ID to color (once determined)
  playerColors: Record<string, PlayerColor | null>;

  gameState: {
    board: any[][]; // Simplified board representation
    phase: GamePhase;
    currentPlayer: PlayerColor | null;
    playerColors: { player1: PlayerColor | null; player2: PlayerColor | null };
    turn: number;
    revealedPieces: string[]; // Array of IDs
    moveHistory: any[];
  };
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  createdAt: number;
  lastUpdated: number;
}

const kv = await Deno.openKv();
const ROOM_TTL_MS = 5 * 60 * 1000; // 5分钟未更新则清理房间，防止幽灵房间

export class RoomManager {
  // In-memory cache for active rooms (since we have sticky WS connections usually)
  // But to be safe and "stateless", we should read from KV.
  // For this MVP, we will rely on KV for source of truth.

  async createRoom(): Promise<string> {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const engine = new CoreEngine();

    const room: Room = {
      id: roomId,
      seats: [null, null],
      playerColors: {},
      gameState: this.serializeEngine(engine),
      status: 'WAITING',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    await kv.set(['rooms', roomId], room);
    return roomId;
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const res = await kv.get<Room>(['rooms', roomId]);
    return res.value;
  }

  async joinRoom(roomId: string, sessionId: string): Promise<{ success: boolean; seatIndex?: number; error?: string }> {
    // Use atomic transaction to prevent race conditions on joining
    let res = { ok: false };
    let retries = 0;

    while (!res.ok && retries < 3) {
        const roomRes = await kv.get<Room>(['rooms', roomId]);
        const room = roomRes.value;

        if (!room) return { success: false, error: 'Room not found' };

        // Check if already in
        const existingIndex = room.seats.indexOf(sessionId);
        if (existingIndex !== -1) {
            return { success: true, seatIndex: existingIndex };
        }

        // Find empty seat
        const emptyIndex = room.seats.indexOf(null);
        if (emptyIndex === -1) {
            return { success: false, error: 'Room is full' };
        }

        room.seats[emptyIndex] = sessionId;
        // 保持 WAITING，真正开局时由 updateRoomState 依据 phase 更新为 PLAYING
        room.lastUpdated = Date.now();

        res = await kv.atomic()
            .check(roomRes)
            .set(['rooms', roomId], room)
            .commit();

        if (res.ok) {
            return { success: true, seatIndex: emptyIndex };
        }
        retries++;
    }

    return { success: false, error: 'Failed to join due to contention' };
  }

  async updateRoomState(roomId: string, engine: CoreEngine) {
      const room = await this.getRoom(roomId);
      if (!room) return;

      room.gameState = this.serializeEngine(engine);
      room.lastUpdated = Date.now();

      // 根据引擎状态更新房间状态
      room.status = engine.phase === 'SETUP' ? 'WAITING' : 'PLAYING';

      // Update player colors map based on engine state
      // engine.playerColors has { player1: Color, player2: Color }
      // room.seats has [session1, session2]
      // We map them: seat 0 -> player1, seat 1 -> player2
      if (room.seats[0]) room.playerColors[room.seats[0]] = engine.playerColors.player1;
      if (room.seats[1]) room.playerColors[room.seats[1]] = engine.playerColors.player2;

      await kv.set(['rooms', roomId], room);
  }

  // Helper to serialize
  serializeEngine(engine: CoreEngine) {
    return {
      board: engine.board,
      phase: engine.phase,
      currentPlayer: engine.currentPlayer,
      playerColors: engine.playerColors,
      turn: engine.turn,
      revealedPieces: Array.from(engine.revealedPieces),
      moveHistory: engine.moveHistory
    };
  }

  // Helper to deserialize
  hydrateEngine(data: any): CoreEngine {
    const engine = new CoreEngine();
    engine.board = data.board;
    engine.phase = data.phase;
    engine.currentPlayer = data.currentPlayer;
    engine.playerColors = data.playerColors;
    engine.turn = data.turn;
    engine.revealedPieces = new Set(data.revealedPieces);
    engine.moveHistory = data.moveHistory;
    return engine;
  }

  async saveRoom(room: Room) {
      await kv.set(['rooms', room.id], room);
  }

  async deleteRoom(roomId: string) {
      await kv.delete(['rooms', roomId]);
  }

  async leaveRoom(roomId: string, sessionId: string): Promise<{ removed: boolean; deleted: boolean }> {
      const roomRes = await kv.get<Room>(['rooms', roomId]);
      const room = roomRes.value;
      if (!room) return { removed: false, deleted: false };

      const seatIndex = room.seats.indexOf(sessionId);
      if (seatIndex === -1) return { removed: false, deleted: false };

      // 房主（seat 0）离开则直接解散房间
      const isCreator = seatIndex === 0;

      room.seats[seatIndex] = null;
      delete room.playerColors[sessionId];
      room.lastUpdated = Date.now();

      // 房主离开或房间无人时删除房间
      const occupied = room.seats.filter(Boolean).length;
      if (isCreator || occupied === 0) {
          await kv.delete(['rooms', roomId]);
          return { removed: true, deleted: true };
      }

      room.status = 'WAITING';
      room.lastUpdated = Date.now();
      await kv.set(['rooms', roomId], room);
      return { removed: true, deleted: false };
  }

  async listRooms(): Promise<Array<{ id: string; status: Room['status']; seats: number; createdAt: number }>> {
      const rooms: Array<{ id: string; status: Room['status']; seats: number; createdAt: number }> = [];
      const now = Date.now();
      const iter = kv.list<Room>({ prefix: ['rooms'] });

      for await (const entry of iter) {
          const r = entry.value;
          // 清理长时间未更新的房间，避免幽灵房间
          if (now - r.lastUpdated > ROOM_TTL_MS) {
              await kv.delete(['rooms', r.id]);
              continue;
          }
          rooms.push({
              id: r.id,
              status: r.status,
              seats: r.seats.filter(Boolean).length,
              createdAt: r.createdAt,
          });
      }

      // 按创建时间倒序，最新的在前
      rooms.sort((a, b) => b.createdAt - a.createdAt);
      return rooms;
  }
}
