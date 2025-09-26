import { randomUUID } from "crypto";

const STATUS = {
  WAITING: "waiting",
  READY: "ready",
  PLAYING: "playing",
  FINISHED: "finished",
  DISSOLVED: "dissolved",
};

const SEATS = ["A", "B"];

function now() {
  return new Date().toISOString();
}

function clonePlayers(players) {
  return players.map((player) => ({ ...player }));
}

export class RoomDirectory {
  constructor() {
    this.rooms = new Map();
  }

  createRoom({ roomName, ownerToken, ownerNickname, socketId }) {
    const roomId = randomUUID();
    const createdAt = now();
    const room = {
      roomId,
      roomName,
      ownerToken,
      status: STATUS.WAITING,
      version: 1,
      seed: randomUUID(),
      players: [
        {
          sessionToken: ownerToken,
          nickname: ownerNickname || "匿名玩家",
          socketId,
          seat: "A",
          ready: false,
          lastSeen: Date.now(),
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };
    this.rooms.set(roomId, room);
    return this._cloneRoom(room);
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    return room ? this._cloneRoom(room) : null;
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((room) => this._toSummary(room));
  }

  joinRoom({ roomId, sessionToken, nickname, socketId }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("room_not_found");
    
    // 检查是否为已存在玩家的重新连接
    const existingPlayer = room.players.find((player) => player.sessionToken === sessionToken);
    if (existingPlayer) {
      // 重新连接逻辑：更新昵称、socket ID和最后活跃时间
      existingPlayer.nickname = nickname;
      existingPlayer.socketId = socketId;
      existingPlayer.lastSeen = Date.now();
      room.version += 1;
      room.updatedAt = now();
      console.log(`[REJOIN] Player ${sessionToken.slice(0, 8)} rejoined room ${roomId}`);
      return this._cloneRoom(room);
    }

    // 检查房间是否已满
    if (room.players.length >= SEATS.length) throw new Error("room_full");
    
    // 更宽松的状态检查：允许更多状态下加入
    if (![STATUS.WAITING, STATUS.READY, STATUS.FINISHED].includes(room.status)) {
      throw new Error("room_not_joinable");
    }

    // 如果房间处于finished状态，自动重置为waiting状态
    if (room.status === STATUS.FINISHED) {
      room.status = STATUS.WAITING;
      room.players.forEach(player => {
        player.ready = false;
      });
      console.log(`[RESET] Room ${roomId} auto-reset from finished to waiting for new player`);
    }

    const seat = SEATS.find(
      (candidate) => !room.players.some((player) => player.seat === candidate),
    );

    room.players.push({
      sessionToken,
      nickname: nickname || "匿名玩家",
      socketId,
      seat,
      ready: false,
      lastSeen: Date.now(),
    });
    room.version += 1;
    room.updatedAt = now();
    console.log(`[JOIN] New player ${sessionToken.slice(0, 8)} joined room ${roomId} in seat ${seat}`);
    return this._cloneRoom(room);
  }

  setReady({ roomId, sessionToken, ready }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("room_not_found");
    const player = room.players.find((p) => p.sessionToken === sessionToken);
    if (!player) throw new Error("player_not_found");
    if (![STATUS.WAITING, STATUS.READY, STATUS.PLAYING].includes(room.status)) {
      throw new Error("invalid_status_for_ready");
    }

    player.ready = Boolean(ready);
    player.lastSeen = Date.now();

    const allReady = room.players.length === SEATS.length && room.players.every((p) => p.ready);
    if (allReady) {
      room.status = STATUS.PLAYING;
    } else if (room.players.some((p) => p.ready)) {
      if (room.status === STATUS.WAITING) {
        room.status = STATUS.READY;
      }
    } else {
      room.status = STATUS.WAITING;
    }

    room.version += 1;
    room.updatedAt = now();
    return {
      room: this._cloneRoom(room),
      allReady,
    };
  }

  finishGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("room_not_found");
    room.status = STATUS.FINISHED;
    room.players.forEach((player) => {
      player.ready = false;
    });
    room.version += 1;
    room.updatedAt = now();
    return this._cloneRoom(room);
  }

  resetForRematch(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("room_not_found");
    room.status = STATUS.WAITING;
    room.seed = randomUUID();
    room.players.forEach((player) => {
      player.ready = false;
    });
    room.version += 1;
    room.updatedAt = now();
    return this._cloneRoom(room);
  }

  leaveRoom({ roomId, sessionToken }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("room_not_found");
    const index = room.players.findIndex((p) => p.sessionToken === sessionToken);
    if (index === -1) throw new Error("player_not_found");
    const [removed] = room.players.splice(index, 1);

    if (removed.sessionToken === room.ownerToken || room.players.length === 0) {
      room.status = STATUS.DISSOLVED;
      this.rooms.delete(roomId);
      return { room: null, dissolved: true };
    }

    room.status = STATUS.WAITING;
    room.version += 1;
    room.updatedAt = now();
    return { room: this._cloneRoom(room), dissolved: false };
  }

  _cloneRoom(room) {
    return {
      ...room,
      players: clonePlayers(room.players),
    };
  }

  _toSummary(room) {
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      ownerToken: room.ownerToken,
      status: room.status,
      playerCount: room.players.length,
      players: clonePlayers(room.players),
      version: room.version,
      seed: room.seed,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }
}

export const ROOM_STATUS = STATUS;
