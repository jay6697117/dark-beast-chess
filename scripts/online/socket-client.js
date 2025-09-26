import { io } from "../vendor/socket.io.esm.min.js";

const STORAGE_KEY = "dbc.sessionToken";

function loadSessionToken() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSessionToken(token) {
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // 忽略持久化失败
  }
}

class EventBus {
  constructor() {
    this.target = new EventTarget();
  }

  on(eventName, handler) {
    const wrapped = (event) => handler(event.detail);
    this.target.addEventListener(eventName, wrapped);
    return () => this.target.removeEventListener(eventName, wrapped);
  }

  emit(eventName, detail) {
    this.target.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export class OnlineMatchClient {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
    this.events = new EventBus();
    this.sessionToken = loadSessionToken();
    this.socket = io(baseUrl, {
      autoConnect: false,
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    this.currentRoomId = null;
    this.lastSequence = 0;
    this._registerSocketEvents();
  }

  on(eventName, handler) {
    return this.events.on(eventName, handler);
  }

  connect() {
    if (this.socket.connected || this.socket.connecting) {
      return;
    }
    this.socket.connect();
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  createRoom({ roomName, nickname }) {
    if (!this.socket.connected) this.connect();
    this.socket.emit("room:create", {
      roomName,
      nickname,
      sessionToken: this.sessionToken,
    });
  }

  joinRoom({ roomId, nickname }) {
    const doJoin = () => {
      this.socket.emit("room:join", {
        roomId,
        nickname,
        sessionToken: this.sessionToken,
      });
    };

    if (!this.socket.connected) {
      // 等待连接建立后再发送加入请求
      const onConnect = () => {
        this.socket.off("connect", onConnect);
        doJoin();
      };
      this.socket.once("connect", onConnect);
      this.connect();
    } else {
      doJoin();
    }
  }

  requestRoomList() {
    if (!this.socket.connected) this.connect();
    this.socket.emit("room:list");
  }

  toggleReady({ roomId, ready }) {
    if (!roomId) roomId = this.currentRoomId;
    if (!roomId) return;
    this.socket.emit("room:ready", {
      roomId,
      ready,
      sessionToken: this.sessionToken,
    });
  }

  rematch(roomId = this.currentRoomId) {
    if (!roomId) return;
    this.socket.emit("room:rematch", {
      roomId,
      sessionToken: this.sessionToken,
    });
  }

  leaveRoom(roomId = this.currentRoomId) {
    if (!roomId) return;
    this.socket.emit("room:leave", {
      roomId,
      sessionToken: this.sessionToken,
    });
    this.currentRoomId = null;
  }

  sendFlip({ roomId = this.currentRoomId, row, col }) {
    if (roomId == null) return;
    this.socket.emit("game:flip", {
      roomId,
      row,
      col,
      sessionToken: this.sessionToken,
    });
  }

  sendMove({ roomId = this.currentRoomId, from, to }) {
    if (roomId == null) return;
    this.socket.emit("game:move", {
      roomId,
      from,
      to,
      sessionToken: this.sessionToken,
    });
  }

  requestSync({ roomId = this.currentRoomId, lastSequence = this.lastSequence }) {
    if (roomId == null) return;
    this.socket.emit("game:sync-request", {
      roomId,
      lastSequence,
      sessionToken: this.sessionToken,
    });
  }

  _registerSocketEvents() {
    this.socket.on("connect", () => {
      this.events.emit("connection", { status: "connected" });
      this.requestRoomList();
    });

    this.socket.on("disconnect", (reason) => {
      this.events.emit("connection", { status: "disconnected", reason });
    });

    this.socket.on("connect_error", (error) => {
      this.events.emit("connection", { status: "error", message: error.message });
    });

    this.socket.on("room:list", (payload) => {
      this.events.emit("room-list", payload.rooms || []);
    });

    this.socket.on("room:update", (payload) => {
      // 检查我是否在这个房间中
      const me = payload.players?.find((player) => player.sessionToken === this.sessionToken);
      
      if (me && payload.roomId !== this.currentRoomId) {
        // 我在房间中，但当前没有设置房间ID，说明刚加入成功
        this.currentRoomId = payload.roomId;
        this.events.emit("room-joined", payload);
      }
      
      if (payload.roomId === this.currentRoomId) {
        this.events.emit("room-update", payload);
      }
      // 大厅的房间更新
      this.events.emit("lobby-room-update", payload);
    });

    this.socket.on("room:created", (payload) => {
      this._updateSessionToken(payload.sessionToken);
      this.currentRoomId = payload.roomId;
      this.events.emit("room-created", payload);
    });

    this.socket.on("room:dissolved", (payload) => {
      if (payload.roomId === this.currentRoomId) {
        this.currentRoomId = null;
        this.events.emit("room-dissolved", payload);
      }
      this.requestRoomList();
    });

    this.socket.on("game:init", (payload) => {
      this.lastSequence = payload.version || 0;
      this.events.emit("game-init", payload);
    });

    this.socket.on("game:update", (payload) => {
      this.lastSequence = payload.sequence ?? this.lastSequence;
      this.events.emit("game-update", payload);
    });

    this.socket.on("game:reset", (payload) => {
      this.lastSequence = payload.version || 0;
      this.events.emit("game-reset", payload);
    });

    this.socket.on("game:over", (payload) => {
      this.lastSequence = payload.sequence || this.lastSequence;
      this.events.emit("game-over", payload);
    });

    this.socket.on("game:sync", (payload) => {
      if (payload.events?.length) {
        const maxSeq = payload.events.reduce((max, item) => Math.max(max, item.sequence), 0);
        this.lastSequence = Math.max(this.lastSequence, maxSeq);
      }
      this.events.emit("game-sync", payload);
    });

    this.socket.on("server:heartbeat", (payload) => {
      this.events.emit("heartbeat", payload);
    });

    this.socket.on("server:error", (payload) => {
      this.events.emit("error", payload);
    });
  }

  _updateSessionToken(token) {
    if (token && token !== this.sessionToken) {
      this.sessionToken = token;
      saveSessionToken(token);
      this.events.emit("session", { sessionToken: token });
    }
  }
}
