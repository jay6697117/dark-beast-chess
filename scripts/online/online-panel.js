import { OnlineMatchClient } from "./socket-client.js";
import { RemoteBoardRenderer } from "./board-renderer.js";

function defaultServerUrl() {
  if (window.SOCKET_URL) return window.SOCKET_URL;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = protocol === "https:" ? 443 : 3001;  // 修改为3001端口
  return `${protocol}//${hostname}:${port}`;
}

function formatRoomInfo(room, sessionToken) {
  const statusMap = {
    waiting: "等待加入",
    ready: "等待准备",
    playing: "对战进行中",
    finished: "已结束",
    dissolved: "已解散",
  };
  const lines = [
    `房间号：${room.roomId}`,
    `房间昵称：${room.roomName}`,
    `当前状态：${statusMap[room.status] || room.status}`,
    "玩家信息：",
  ];
  room.players.forEach((player) => {
    const current = player.sessionToken === sessionToken ? "(我)" : "";
    const readyText = player.ready ? "✅ 准备" : "❌ 未准备";
    lines.push(`- ${player.nickname} ${current} | 座位 ${player.seat} | ${readyText}`);
  });
  return lines.join("\n");
}

function appendMessage(text, type = "info") {
  const container = document.getElementById("gameMessages");
  if (!container) return;
  const item = document.createElement("div");
  item.className = `message-item ${type}`;
  item.textContent = text;
  container.appendChild(item);
  if (container.children.length > 20) {
    container.removeChild(container.firstChild);
  }
  container.scrollTop = container.scrollHeight;
}

export class OnlineBattlePanel {
  constructor() {
    this.dom = {
      status: document.getElementById("onlineStatus"),
      nickname: document.getElementById("onlineNickname"),
      connectBtn: document.getElementById("onlineConnectBtn"),
      lobby: document.getElementById("onlineLobby"),
      roomName: document.getElementById("onlineRoomName"),
      roomCode: document.getElementById("onlineRoomCode"),
      createRoomBtn: document.getElementById("createRoomBtn"),
      joinRoomBtn: document.getElementById("joinRoomBtn"),
      roomList: document.getElementById("roomList"),
      roomPanel: document.getElementById("onlineRoom"),
      roomInfo: document.getElementById("onlineRoomInfo"),
      readyBtn: document.getElementById("readyToggleBtn"),
      rematchBtn: document.getElementById("rematchBtn"),
      leaveBtn: document.getElementById("leaveRoomBtn"),
      board: document.getElementById("gameBoard"),
    };

    const boardRenderer = new RemoteBoardRenderer({
      boardElement: this.dom.board,
      onFlip: ({ row, col }) => this.handleFlip(row, col),
      onMove: ({ from, to }) => this.handleMove(from, to),
      messageSink: appendMessage,
    });
    this.boardRenderer = boardRenderer;

    this.client = new OnlineMatchClient({ baseUrl: defaultServerUrl() });
    if (this.client.sessionToken) {
      this.boardRenderer.setSessionToken(this.client.sessionToken);
    }
    this.currentRoom = null;
    this.currentReady = false;
    this.nickname = "";
    this._bindDomEvents();
    this._bindClientEvents();
  }

  _bindDomEvents() {
    if (this.dom.connectBtn) {
      this.dom.connectBtn.addEventListener("click", () => {
        this.nickname = this.getNickname();
        appendMessage(`尝试连接服务器，昵称：${this.nickname}`);
        this.client.connect();
      });
    }

    if (this.dom.createRoomBtn) {
      this.dom.createRoomBtn.addEventListener("click", () => {
        const roomName = this.dom.roomName.value.trim() || `${this.nickname || "匿名玩家"}的房间`;
        this.client.createRoom({ roomName, nickname: this.getNickname() });
      });
    }

    if (this.dom.joinRoomBtn) {
      this.dom.joinRoomBtn.addEventListener("click", () => {
        const roomId = this.dom.roomCode.value.trim();
        if (!roomId) {
          appendMessage("请输入房间号再加入", "warning");
          return;
        }
        
        const nickname = this.getNickname();
        appendMessage(`尝试加入房间: ${roomId}`, "info");
        
        // 确保连接后再尝试加入
        if (!this.client.socket.connected) {
          appendMessage("连接已断开，正在重新连接...", "warning");
          this.client.connect();
          const onConnect = () => {
            this.client.socket.off("connect", onConnect);
            setTimeout(() => {
              this.client.joinRoom({ roomId, nickname });
            }, 100); // 给连接一点时间稳定
          };
          this.client.socket.once("connect", onConnect);
        } else {
          this.client.joinRoom({ roomId, nickname });
        }
      });
    }

    if (this.dom.readyBtn) {
      this.dom.readyBtn.addEventListener("click", () => {
        const nextReady = !this.currentReady;
        this.client.toggleReady({ roomId: this.currentRoom?.roomId, ready: nextReady });
      });
    }

    if (this.dom.rematchBtn) {
      this.dom.rematchBtn.addEventListener("click", () => {
        this.client.rematch();
      });
    }

    if (this.dom.leaveBtn) {
      this.dom.leaveBtn.addEventListener("click", () => {
        this.client.leaveRoom();
        this.exitRoom();
      });
    }
  }

  _bindClientEvents() {
    this.client.on("connection", ({ status, reason, message }) => {
      switch (status) {
        case "connected":
          this.updateStatus("已连接服务器");
          if (this.dom.lobby) this.dom.lobby.hidden = false;
          break;
        case "disconnected":
          this.updateStatus(`连接已断开：${reason || "未知原因"}`);
          this.exitRoom();
          break;
        case "error":
          this.updateStatus(`连接错误：${message}`);
          break;
        default:
          this.updateStatus(`状态：${status}`);
      }
    });

    this.client.on("session", ({ sessionToken }) => {
      appendMessage(`会话已同步，Token：${sessionToken.slice(0, 8)}...`);
      this.boardRenderer.setSessionToken(sessionToken);
    });

    this.client.on("room-list", (rooms) => {
      this.renderRoomList(rooms);
    });

    this.client.on("lobby-room-update", (room) => {
      this.upsertRoomListItem(room);
    });

    this.client.on("room-created", (payload) => {
      appendMessage(`房间创建成功：${payload.roomId}`);
      this.enterRoom(payload.roomId);
      this.client.requestRoomList();
    });

    this.client.on("room-joined", (payload) => {
      appendMessage(`成功加入房间：${payload.roomName} (${payload.roomId})`, "important");
      this.enterRoom(payload.roomId);
      // 立即显示房间信息
      this.currentRoom = payload;
      this.renderRoomInfo(payload);
      const me = payload.players.find((player) => player.sessionToken === this.client.sessionToken);
      this.currentReady = me ? !!me.ready : false;
      this.updateReadyButton();
      this.updateRematchButton(payload);
      this.boardRenderer.setMode("online");
    });

    this.client.on("room-update", (room) => {
      if (!room) return;
      
      // 检查我是否在这个房间中
      const me = room.players.find((player) => player.sessionToken === this.client.sessionToken);
      
      if (me) {
        // 我在房间中，确保显示房间界面
        if (!this.client.currentRoomId || this.client.currentRoomId !== room.roomId) {
          appendMessage(`已加入房间：${room.roomName} (${room.roomId})`, "important");
          this.enterRoom(room.roomId);
        }
        
        this.currentRoom = room;
        this.renderRoomInfo(room);
        this.currentReady = !!me.ready;
        this.updateReadyButton();
        this.updateRematchButton(room);
        this.boardRenderer.setMode("online");
        
        // 添加详细的状态日志
        appendMessage(`房间状态更新：${room.status} - 玩家${room.players.length}/2`, "info");
      }
    });

    this.client.on("room-dissolved", (payload) => {
      appendMessage(`房间已解散：${payload.reason || "未知原因"}`, "warning");
      this.exitRoom();
    });

    this.client.on("game-init", (payload) => {
      appendMessage("🎮 服务器已初始化棋局，游戏开始！", "important");
      this.boardRenderer.setMode("online");
      if (this.client.sessionToken) {
        this.boardRenderer.setSessionToken(this.client.sessionToken);
      }
      this.boardRenderer.applySnapshot(payload.snapshot);
      
      // 检查自己的回合
      const isMyTurn = payload.snapshot?.currentPlayer === this.boardRenderer.getPlayerSide();
      if (isMyTurn) {
        appendMessage("轮到您行动了！", "important");
      } else {
        appendMessage("等待对手行动...", "info");
      }
    });

    this.client.on("game-update", (payload) => {
      if (!payload?.snapshot) return;
      const actionType = payload.action?.type || "update";
      if (actionType === "flip") {
        appendMessage("玩家翻开了一枚棋子");
      } else if (actionType === "move") {
        appendMessage("玩家完成走棋");
      } else if (actionType === "repetition_defeat") {
        appendMessage("检测到重复移动，自动判负", "warning");
      }
      this.boardRenderer.applySnapshot(payload.snapshot);
    });

    this.client.on("game-reset", (payload) => {
      appendMessage("房间已重置，等待双方准备");
      this.boardRenderer.resetBoard();
      this.updateRematchButton({ status: "waiting" });
    });

    this.client.on("game-sync", (payload) => {
      appendMessage("已从服务器同步局面");
      if (payload.snapshot) {
        this.boardRenderer.applySnapshot(payload.snapshot);
      }
    });

    this.client.on("game-over", (payload) => {
      const winner = payload.winner ? (payload.winner === "red" ? "红方" : "蓝方") : "未知";
      appendMessage(`对局结束，${winner}获胜 (${payload.reason || ""})`, "important");
      if (payload.snapshot) {
        this.boardRenderer.applySnapshot(payload.snapshot);
      }
      this.updateRematchButton({ status: "finished" });
    });

    this.client.on("error", (payload) => {
      let errorMessage = `服务器错误：${payload.message}`;
      
      // 提供更具体的错误信息
      switch(payload.code) {
        case "room_not_found":
          errorMessage = "房间不存在或已被解散";
          this.exitRoom();
          break;
        case "room_full":
          errorMessage = "房间已满，无法加入";
          break;
        case "room_not_joinable":
          errorMessage = "房间当前状态不允许加入";
          break;
        case "room_id_required":
          errorMessage = "请提供有效的房间号";
          break;
        default:
          // 保持原有消息
          break;
      }
      
      appendMessage(errorMessage, payload.recoverable ? "warning" : "error");
    });
  }

  updateStatus(text) {
    if (this.dom.status) {
      this.dom.status.textContent = text;
    }
  }

  getNickname() {
    const value = this.dom.nickname?.value?.trim();
    if (value) return value;
    if (this.nickname) return this.nickname;
    const fallback = `玩家${Math.floor(Math.random() * 9999)}`;
    this.nickname = fallback;
    if (this.dom.nickname) this.dom.nickname.value = fallback;
    return fallback;
  }

  renderRoomList(rooms = []) {
    if (!this.dom.roomList) return;
    this.dom.roomList.innerHTML = "";
    if (!rooms.length) {
      const empty = document.createElement("li");
      empty.textContent = "暂无可加入房间";
      empty.style.color = "var(--text-tertiary)";
      this.dom.roomList.appendChild(empty);
      return;
    }
    rooms.forEach((room) => {
      this.addRoomListItem(room);
    });
  }

  addRoomListItem(room) {
    const li = document.createElement("li");
    const info = document.createElement("span");
    info.textContent = `${room.roomName} (${room.players?.length || 0}/2) - ${room.status}`;
    const joinBtn = document.createElement("button");
    joinBtn.className = "btn btn-secondary";
    joinBtn.textContent = "加入";
    joinBtn.addEventListener("click", () => {
      this.client.joinRoom({ roomId: room.roomId, nickname: this.getNickname() });
    });
    li.appendChild(info);
    li.appendChild(joinBtn);
    li.dataset.roomId = room.roomId;
    this.dom.roomList.appendChild(li);
  }

  upsertRoomListItem(room) {
    if (!this.dom.roomList) return;
    let li = this.dom.roomList.querySelector(`li[data-room-id="${room.roomId}"]`);
    if (!li) {
      this.addRoomListItem(room);
      return;
    }
    if (!room || room.status === "dissolved") {
      li.remove();
      return;
    }
    const info = li.querySelector("span");
    if (info) {
      info.textContent = `${room.roomName} (${room.players?.length || 0}/2) - ${room.status}`;
    }
  }

  renderRoomInfo(room) {
    if (!this.dom.roomInfo) return;
    this.dom.roomInfo.textContent = formatRoomInfo(room, this.client.sessionToken);
    if (this.dom.roomPanel) this.dom.roomPanel.hidden = false;
    if (this.dom.lobby) this.dom.lobby.hidden = true;
  }

  updateReadyButton() {
    if (!this.dom.readyBtn) return;
    this.dom.readyBtn.textContent = this.currentReady ? "取消准备" : "准备";
    this.dom.readyBtn.disabled = !this.currentRoom || this.currentRoom.status === "playing";
    
    // 添加状态调试信息
    if (this.currentRoom) {
      const readyCount = this.currentRoom.players.filter(p => p.ready).length;
      const totalPlayers = this.currentRoom.players.length;
      appendMessage(`准备状态：${readyCount}/${totalPlayers} 玩家已准备`, "info");
      
      if (readyCount === 2 && totalPlayers === 2) {
        appendMessage("双方已准备，正在启动游戏...", "important");
      }
    }
  }

  updateRematchButton(room) {
    if (!this.dom.rematchBtn) return;
    const status = room?.status || this.currentRoom?.status;
    this.dom.rematchBtn.disabled = status !== "finished";
  }

  enterRoom(roomId) {
    this.client.currentRoomId = roomId;
    this.boardRenderer.setMode("online");
    appendMessage(`已进入房间 ${roomId}`);
  }

  exitRoom() {
    this.currentRoom = null;
    this.currentReady = false;
    if (this.dom.roomPanel) this.dom.roomPanel.hidden = true;
    if (this.dom.lobby) this.dom.lobby.hidden = false;
    this.boardRenderer.setMode("idle");
    if (window.gameController && typeof window.gameController.resetGame === "function") {
      window.gameController.resetGame();
    }
  }

  handleFlip(row, col) {
    this.client.sendFlip({ row, col });
  }

  handleMove(fromRowCol, toRowCol) {
    this.client.sendMove({ from: fromRowCol, to: toRowCol });
  }
}
