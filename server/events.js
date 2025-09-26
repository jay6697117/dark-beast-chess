import { randomUUID } from "crypto";
import { ROOM_STATUS } from "./room-directory.js";

const metrics = {
  rematchCount: 0,
};

function now() {
  return new Date().toISOString();
}

function safeEmit(target, event, payload) {
  target.emit(event, { ...payload, serverTime: now() });
}

function ensureSessionToken(socket, sessionToken) {
  if (sessionToken) {
    socket.data.sessionToken = sessionToken;
    return sessionToken;
  }
  const token = randomUUID();
  socket.data.sessionToken = token;
  return token;
}

function setSocketRoom(socket, roomId) {
  socket.data.currentRoomId = roomId;
}

function getSocketRoom(socket) {
  return socket.data.currentRoomId;
}

function sendError(socket, code, message, recoverable = true) {
  safeEmit(socket, "server:error", { code, message, recoverable });
}

function broadcastRoomList(io, roomDirectory) {
  const rooms = roomDirectory.listRooms();
  io.emit("room:list", { rooms, serverTime: now() });
}

function broadcastRoomUpdate(io, room) {
  const summary = {
    roomId: room.roomId,
    roomName: room.roomName,
    ownerToken: room.ownerToken,
    players: room.players,
    status: room.status,
    seed: room.seed,
    version: room.version,
    updatedAt: room.updatedAt,
  };
  io.to(room.roomId).emit("room:update", { ...summary, serverTime: now() });
  io.emit("room:update", { ...summary, serverTime: now() });
}

function startGame(io, room, eventLog, gameStore) {
  const players = room.players.map((player) => player.sessionToken);
  const game = gameStore.create(room.roomId, { seed: room.seed, players });
  eventLog.append(room.roomId, "game_started", {
    seed: room.seed,
    firstPlayer: players[0] ?? null,
  });
  const snapshot = game.getStateSummary();
  io.to(room.roomId).emit("game:init", {
    roomId: room.roomId,
    snapshot,
    version: room.version,
    seed: room.seed,
    serverTime: now(),
  });
}

function ensureGame(gameStore, roomDirectory, roomId, seed, players) {
  let game = gameStore.get(roomId);
  if (!game) {
    game = gameStore.create(roomId, { seed, players });
  }
  return game;
}

function broadcastGameUpdate(io, roomId, action, metadata = {}) {
  io.to(roomId).emit("game:update", {
    roomId,
    action,
    snapshot: action.snapshot,
    ...metadata,
    serverTime: now(),
  });
}

export function registerSocketEvents({ io, socket, roomDirectory, eventLog, gameStore }) {
  safeEmit(socket, "server:heartbeat", { roomId: null });

  socket.on("room:create", (payload = {}) => {
    try {
      const roomName = (payload.roomName || "好友房").slice(0, 32);
      const nickname = (payload.nickname || "匿名玩家").slice(0, 16);
      const sessionToken = ensureSessionToken(socket, payload.sessionToken);
      const room = roomDirectory.createRoom({
        roomName,
        ownerToken: sessionToken,
        ownerNickname: nickname,
        socketId: socket.id,
      });
      socket.join(room.roomId);
      setSocketRoom(socket, room.roomId);

      eventLog.append(room.roomId, "room_created", {
        roomName,
        ownerToken: sessionToken,
      });
      eventLog.append(room.roomId, "player_joined", {
        sessionToken,
        nickname,
        seat: "A",
      });

      safeEmit(socket, "room:created", {
        roomId: room.roomId,
        roomName,
        sessionToken,
        side: "A",
      });
      broadcastRoomUpdate(io, room);
      broadcastRoomList(io, roomDirectory);
    } catch (error) {
      sendError(socket, error.message || "room_create_failed", false);
    }
  });

  socket.on("room:join", (payload = {}) => {
    try {
      const { roomId } = payload;
      if (!roomId) throw new Error("room_id_required");
      const nickname = (payload.nickname || "匿名玩家").slice(0, 16);
      const sessionToken = ensureSessionToken(socket, payload.sessionToken);
      
      // 添加调试日志
      console.log(`[JOIN] Socket ${socket.id} attempting to join room ${roomId} with token ${sessionToken.slice(0, 8)}...`);
      
      const room = roomDirectory.joinRoom({
        roomId,
        sessionToken,
        nickname,
        socketId: socket.id,
      });
      socket.join(room.roomId);
      setSocketRoom(socket, room.roomId);

      console.log(`[JOIN] Success: Socket ${socket.id} joined room ${roomId}`);

      eventLog.append(room.roomId, "player_joined", {
        sessionToken,
        nickname,
      });

      broadcastRoomUpdate(io, room);
      broadcastRoomList(io, roomDirectory);
    } catch (error) {
      console.error(`[JOIN] Error: Socket ${socket.id} failed to join room: ${error.message}`);
      sendError(socket, error.message || "room_join_failed", false);
    }
  });

  socket.on("room:list", () => {
    safeEmit(socket, "room:list", { rooms: roomDirectory.listRooms() });
  });

  socket.on("room:ready", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const sessionToken = ensureSessionToken(socket, payload.sessionToken || socket.data.sessionToken);
      const { room, allReady } = roomDirectory.setReady({
        roomId,
        sessionToken,
        ready: Boolean(payload.ready),
      });

      eventLog.append(room.roomId, "player_ready", {
        sessionToken,
        ready: Boolean(payload.ready),
      });

      broadcastRoomUpdate(io, room);
      if (allReady) {
        startGame(io, room, eventLog, gameStore);
      }
    } catch (error) {
      sendError(socket, error.message || "room_ready_failed", true);
    }
  });

  socket.on("room:rematch", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const room = roomDirectory.getRoom(roomId);
      if (!room) throw new Error("room_not_found");
      if (room.status !== ROOM_STATUS.FINISHED) {
        throw new Error("room_not_finished");
      }
      const sessionToken = ensureSessionToken(socket, payload.sessionToken || socket.data.sessionToken);
      const restartedRoom = roomDirectory.resetForRematch(roomId);
      const players = restartedRoom.players.map((player) => player.sessionToken);
      gameStore.create(roomId, { seed: restartedRoom.seed, players });

      metrics.rematchCount += 1;
      const record = eventLog.appendRoomRestart(roomId, {
        triggeredBy: sessionToken,
        newSeed: restartedRoom.seed,
      });

      io.to(roomId).emit("game:reset", {
        roomId,
        version: restartedRoom.version,
        seed: restartedRoom.seed,
        restartSequence: record.sequence,
        serverTime: now(),
      });
      broadcastRoomUpdate(io, restartedRoom);
    } catch (error) {
      sendError(socket, error.message || "room_rematch_failed", true);
    }
  });

  socket.on("game:over", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const winner = payload.winner ?? null;
      const reason = payload.reason || "player_reported";
      const room = roomDirectory.finishGame(roomId);
      const record = eventLog.appendGameFinished(roomId, {
        winner,
        reason,
      });
      io.to(roomId).emit("game:over", {
        roomId,
        winner,
        reason,
        version: room.version,
        sequence: record.sequence,
        serverTime: now(),
      });
      broadcastRoomUpdate(io, room);
    } catch (error) {
      sendError(socket, error.message || "game_over_failed", true);
    }
  });

  socket.on("game:flip", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const room = roomDirectory.getRoom(roomId);
      if (!room) throw new Error("room_not_found");
      const sessionToken = ensureSessionToken(socket, payload.sessionToken || socket.data.sessionToken);
      const opponent = room.players.find((p) => p.sessionToken !== sessionToken)?.sessionToken ?? null;
      const game = ensureGame(gameStore, roomDirectory, roomId, room.seed, room.players.map((p) => p.sessionToken));
      const action = game.flipPiece({
        row: payload.row,
        col: payload.col,
        actorToken: sessionToken,
        opponentToken: opponent,
      });
      const record = eventLog.append(roomId, "piece_flipped", {
        sessionToken,
        row: payload.row,
        col: payload.col,
      });
      broadcastGameUpdate(io, roomId, action, { sequence: record.sequence });
    } catch (error) {
      sendError(socket, error.message || "game_flip_failed", true);
    }
  });

  socket.on("game:move", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const room = roomDirectory.getRoom(roomId);
      if (!room) throw new Error("room_not_found");
      const sessionToken = ensureSessionToken(socket, payload.sessionToken || socket.data.sessionToken);
      const game = ensureGame(gameStore, roomDirectory, roomId, room.seed, room.players.map((p) => p.sessionToken));
      const action = game.movePiece({
        from: payload.from,
        to: payload.to,
        actorToken: sessionToken,
      });
      const record = eventLog.append(roomId, "piece_moved", {
        sessionToken,
        from: payload.from,
        to: payload.to,
        battleResult: action.battleResult,
      });
      broadcastGameUpdate(io, roomId, action, { sequence: record.sequence });

      if (action.snapshot.winner) {
        const roomAfterFinish = roomDirectory.finishGame(roomId);
        const finishRecord = eventLog.appendGameFinished(roomId, {
          winner: action.snapshot.winner,
          reason: "move_resolved",
        });
        broadcastRoomUpdate(io, roomAfterFinish);
        io.to(roomId).emit("game:over", {
          roomId,
          winner: action.snapshot.winner,
          reason: "move_resolved",
          snapshot: action.snapshot,
          serverTime: now(),
          sequence: finishRecord.sequence,
        });
      }
    } catch (error) {
      sendError(socket, error.message || "game_move_failed", true);
    }
  });

  socket.on("game:sync-request", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const room = roomDirectory.getRoom(roomId);
      if (!room) throw new Error("room_not_found");
      const game = ensureGame(gameStore, roomDirectory, roomId, room.seed, room.players.map((p) => p.sessionToken));
      const snapshot = game.getStateSummary();
      const events = eventLog.replaySince(roomId, payload.lastSequence ?? 0);
      safeEmit(socket, "game:sync", {
        roomId,
        snapshot,
        events,
      });
    } catch (error) {
      sendError(socket, error.message || "game_sync_failed", true);
    }
  });

  socket.on("room:leave", (payload = {}) => {
    try {
      const roomId = payload.roomId || getSocketRoom(socket);
      if (!roomId) throw new Error("room_id_required");
      const sessionToken = ensureSessionToken(socket, payload.sessionToken || socket.data.sessionToken);
      const { room, dissolved } = roomDirectory.leaveRoom({ roomId, sessionToken });
      socket.leave(roomId);
      setSocketRoom(socket, null);
      eventLog.append(roomId, "player_left", { sessionToken });
      if (dissolved) {
        eventLog.append(roomId, "room_dissolved", { reason: "owner_left" });
        io.to(roomId).emit("room:dissolved", { roomId, reason: "owner_left", serverTime: now() });
        broadcastRoomList(io, roomDirectory);
      } else {
        broadcastRoomUpdate(io, room);
        broadcastRoomList(io, roomDirectory);
      }
    } catch (error) {
      sendError(socket, error.message || "room_leave_failed", true);
    }
  });

  socket.on("disconnect", () => {
    const roomId = getSocketRoom(socket);
    if (roomId) {
      eventLog.append(roomId, "player_disconnected", {
        sessionToken: socket.data.sessionToken,
        socketId: socket.id,
      });
    }
  });
}
