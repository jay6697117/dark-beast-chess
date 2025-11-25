import { ref, reactive, computed } from 'vue';
import { DarkBeastChess, PlayerColor } from '../game/DarkBeastChess';
import { GameClient } from '../game/network/GameClient';

const game = reactive(new DarkBeastChess());
const client = new GameClient();

// Online state
const isOnline = ref(false);
const inLocalRoom = ref(false);
const roomId = ref<string | null>(null);
const sessionId = ref<string | null>(null);
const isConnecting = ref(false);
const connectionError = ref<string | undefined>(undefined);
const myColor = ref<PlayerColor | null>(null);
const mySeatIndex = ref<number | null>(null);
const playersReady = ref(false);
const roomList = ref<Array<{ id: string; status: string; seats: number; createdAt: number }>>([]);
let roomListPoller: ReturnType<typeof setInterval> | null = null;
const toast = ref<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const showToast = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
  toast.value = { text, type };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 2200);
};

const apiBase = (() => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    // @ts-ignore
    return import.meta.env.VITE_API_URL as string;
  }
  if (typeof location !== 'undefined') {
    if (location.port === '5173' || location.port === '4173') {
      return 'http://localhost:8000';
    }
    return `${location.protocol}//${location.host}`;
  }
  return 'http://localhost:8000';
})();

export function useGameLogic() {
  const board = computed(() => {
    const cells = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const piece = game.board[row][col];
        cells.push({
          id: row * 4 + col,
          row,
          col,
          piece
        });
      }
    }
    return cells;
  });

  const turn = computed(() => game.turn);
  const currentPlayer = computed(() => game.currentPlayer);
  const status = computed(() => game.phase);
  const selectedCellId = computed(() => {
    if (!game.selectedPiece) return null;
    return game.selectedPiece.row * 4 + game.selectedPiece.col;
  });
  const messages = computed(() => [...game.messages].reverse());

  const redPiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.red;
  });

  const bluePiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.blue;
  });

  const gameStarted = computed(() => game.phase !== 'SETUP');
  const isCreator = computed(() => mySeatIndex.value === 0);

  const initGame = () => {
    if (isOnline.value) {
      if (game.phase === 'SETUP' && isCreator.value && playersReady.value) {
        client.startGame();
      } else if (game.phase === 'GAME_OVER') {
        game.addMessage('暂不支持在线重开，请刷新页面重新创建', 'error');
      }
      return;
    }

    startLocalGame();
  };

  const startLocalGame = () => {
    inLocalRoom.value = true;
    isOnline.value = false;
    playersReady.value = false;
    myColor.value = null;
    mySeatIndex.value = null;
    stopRoomPolling();
    game.resetGame();
    game.startGame();
    showToast('单机对局已开始', 'success');
  };

  const handleCellClick = (row: number, col: number) => {
    if (isOnline.value) {
        if (game.phase === 'SETUP') {
            if (playersReady.value) {
                // 两人已就位但房主未开局
                showToast(isCreator.value ? '房主请开始游戏' : '等待房主开始游戏', 'info');
            } else {
                // 仅一人时提示等待对手
                showToast('等待对手加入', 'info');
            }
            return;
        }
        const piece = game.board[row][col];

        if (game.phase === 'COLOR_SELECTION') {
            if (piece && !piece.revealed) {
                client.sendAction('FLIP', { row, col });
            }
        } else if (game.phase === 'PLAYING') {
            if (game.selectedPiece) {
                if (game.selectedPiece.row === row && game.selectedPiece.col === col) {
                    game.clearSelection();
                } else {
                    client.sendAction('MOVE', {
                        fromRow: game.selectedPiece.row,
                        fromCol: game.selectedPiece.col,
                        targetRow: row,
                        targetCol: col
                    });
                    game.clearSelection();
                }
            } else if (piece && piece.revealed && piece.color === game.currentPlayer) {
                if (myColor.value && piece.color === myColor.value) {
                     game.selectPiece(row, col);
                }
            } else if (piece && !piece.revealed) {
                client.sendAction('FLIP', { row, col });
            }
        }
        return;
    }

    game.handleCellClick(row, col);
  };

  const resetGame = () => {
    game.resetGame();
    isOnline.value = false;
    inLocalRoom.value = false;
    roomId.value = null;
    sessionId.value = null;
    myColor.value = null;
    mySeatIndex.value = null;
    playersReady.value = false;
    startRoomPolling();
  };

  if (client.handlers.size === 0) {
      client.on('ROOM_CREATED', (_type, payload) => {
          isOnline.value = true;
          roomId.value = payload.roomId;
          sessionId.value = payload.sessionId;
          mySeatIndex.value = 0;
          playersReady.value = false;
          game.resetGame();
          game.addMessage(`房间已创建：${payload.roomId}，等待对手加入...`);
          stopRoomPolling();
      });

      client.on('JOINED', (_type, payload) => {
          isOnline.value = true;
          roomId.value = payload.roomId;
          sessionId.value = payload.sessionId;
          mySeatIndex.value = payload.seatIndex;
          if (payload.gameState) {
              syncGameState(payload.gameState);
              if (payload.gameState.phase !== 'SETUP') {
                   playersReady.value = true;
              }
          } else {
              game.resetGame();
              playersReady.value = false;
          }
          game.addMessage(`已加入房间：${payload.roomId}`);
          stopRoomPolling();
      });

      client.on('PLAYER_JOINED', (_type, payload) => {
          playersReady.value = payload?.count === 2;
          game.addMessage(`玩家加入，当前人数：${payload.count}`);
      });

      client.on('PLAYER_LEFT', (_type, payload) => {
          playersReady.value = false;
          game.addMessage(`玩家离开，当前人数：${payload?.count ?? 0}`);
      });

      client.on('PLAYERS_READY', () => {
          playersReady.value = true;
          game.addMessage('玩家已就绪，等待房主开始游戏...');
      });

      client.on('GAME_START', (_type, payload) => {
          playersReady.value = true;
          game.addMessage('游戏开始！房主请先手翻牌');
          if (payload.gameState) syncGameState(payload.gameState);
      });

      client.on('ROOM_CLOSED', () => {
          isOnline.value = false;
          inLocalRoom.value = false;
          roomId.value = null;
          sessionId.value = null;
          mySeatIndex.value = null;
          myColor.value = null;
          playersReady.value = false;
          game.addMessage('房主已退出，房间已解散', 'error');
          startRoomPolling();
      });

      client.on('STATE_UPDATE', (_type, payload) => {
          if (payload.lastAction) {
              const { action, payload: actionPayload, result } = payload.lastAction;
              if (action === 'FLIP') {
                  const piece = game.board[actionPayload.row][actionPayload.col];
                  if (piece) {
                      piece.isFlipping = true;
                      setTimeout(() => {
                          piece.isFlipping = false;
                          syncGameState(payload.gameState);
                      }, 400);
                      return;
                  }
              } else if (action === 'MOVE') {
                  const { fromRow, fromCol, targetRow, targetCol } = actionPayload;
                  if (result && result.result) {
                       game.executeBattleWithAnimation(fromRow, fromCol, targetRow, targetCol, result.result);
                       setTimeout(() => {
                            syncGameState(payload.gameState);
                       }, 1000);
                       return;
                  } else {
                      game.executeMoveWithAnimation(fromRow, fromCol, targetRow, targetCol);
                      setTimeout(() => {
                           syncGameState(payload.gameState);
                      }, 400);
                      return;
                  }
              }
          }
          syncGameState(payload.gameState);
      });

      client.on('ERROR', (_type, payload) => {
          game.addMessage(payload.message, 'error');
      });

      client.on('DISCONNECTED', () => {
          isOnline.value = false;
          roomId.value = null;
          sessionId.value = null;
          mySeatIndex.value = null;
          myColor.value = null;
          playersReady.value = false;
          game.addMessage('与服务器断开连接', 'error');
          startRoomPolling();
      });
  }

  const fetchRooms = async () => {
      try {
          const res = await fetch(`${apiBase}/rooms`, { mode: 'cors' });
          if (!res.ok) return;
          const data = await res.json();
          roomList.value = data.rooms ?? [];
      } catch (_e) {
          // 静默失败，避免打扰用户
      }
  };

  const startRoomPolling = () => {
      if (roomListPoller !== null) return;
      fetchRooms();
      roomListPoller = setInterval(() => {
          if (!isOnline.value && !gameStarted.value && !inLocalRoom.value) {
              fetchRooms();
          }
      }, 3000);
  };

  const stopRoomPolling = () => {
      if (roomListPoller !== null) {
          clearInterval(roomListPoller);
          roomListPoller = null;
      }
  };

  if (typeof window !== 'undefined') {
      startRoomPolling();
  }

  const connectToServer = async () => {
      isConnecting.value = true;
      connectionError.value = undefined;
      try {
          await client.connect();
          return true;
      } catch (_e) {
          connectionError.value = '连接服务器失败，请检查后端是否启动';
          return false;
      } finally {
          isConnecting.value = false;
      }
  };

  const createRoom = async () => {
      const ok = await connectToServer();
      if (ok) {
          client.createRoom();
      }
  };

  const joinRoom = async (id: string) => {
      const ok = await connectToServer();
      if (ok) {
          client.joinRoom(id);
      }
  };

  const leaveRoom = () => {
      if (!isOnline.value) return;
      client.disconnect();
      isOnline.value = false;
      inLocalRoom.value = false;
      roomId.value = null;
      sessionId.value = null;
      myColor.value = null;
      mySeatIndex.value = null;
      playersReady.value = false;
      game.resetGame();
      startRoomPolling();
      showToast('已退出房间', 'info');
  };

  const exitLocalRoom = () => {
      if (!inLocalRoom.value) return;
      inLocalRoom.value = false;
      game.resetGame();
      myColor.value = null;
      mySeatIndex.value = null;
      playersReady.value = false;
      startRoomPolling();
      showToast('已退出单机房间', 'info');
  };

  const syncGameState = (state: any) => {
      game.board = state.board;
      game.phase = state.phase;
      game.currentPlayer = state.currentPlayer;
      game.playerColors = state.playerColors;
      game.turn = state.turn;
      game.revealedPieces = new Set(state.revealedPieces);
      game.moveHistory = state.moveHistory;

      if (mySeatIndex.value !== null && state.playerColors) {
          if (mySeatIndex.value === 0) {
              myColor.value = state.playerColors.player1;
          } else if (mySeatIndex.value === 1) {
              myColor.value = state.playerColors.player2;
          }
      }

      if (state.phase !== 'SETUP') {
          playersReady.value = true;
      }
  };

  return {
    game,
    board,
    turn,
    currentPlayer,
    status,
    selectedCellId,
    messages,
    redPiecesCount,
    bluePiecesCount,
    initGame,
    handleCellClick,
    resetGame,
    isOnline,
    inLocalRoom,
    roomId,
    isConnecting,
    connectionError,
    myColor,
    createRoom,
    joinRoom,
    gameStarted,
    startLocalGame,
    isCreator,
    playersReady,
    roomList,
    fetchRooms,
    toast,
    showToast,
    leaveRoom,
    exitLocalRoom
  };
}
