import { ref, reactive, computed } from 'vue';
import { DarkBeastChess, PlayerColor } from '../game/DarkBeastChess';
import { GameClient } from '../game/network/GameClient';

const game = reactive(new DarkBeastChess());
const client = new GameClient();

// Online state
const isOnline = ref(false);
const roomId = ref<string | null>(null);
const sessionId = ref<string | null>(null);
const isConnecting = ref(false);
const connectionError = ref<string | undefined>(undefined);
const myColor = ref<PlayerColor | null>(null);
const mySeatIndex = ref<number | null>(null);
const playersReady = ref(false);

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

    if (game.phase === 'SETUP') {
      game.startGame();
    } else if (game.phase === 'GAME_OVER') {
      game.resetGame();
    }
  };

  const startLocalGame = () => {
    isOnline.value = false;
    playersReady.value = false;
    myColor.value = null;
    mySeatIndex.value = null;
    game.startGame();
  };

  const handleCellClick = (row: number, col: number) => {
    if (isOnline.value) {
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
    roomId.value = null;
    sessionId.value = null;
    myColor.value = null;
    mySeatIndex.value = null;
    playersReady.value = false;
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
      });

      client.on('PLAYER_JOINED', (_type, payload) => {
          game.addMessage(`玩家加入，当前人数：${payload.count}`);
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
          playersReady.value = false;
          game.addMessage('与服务器断开连接', 'error');
      });
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
    roomId,
    isConnecting,
    connectionError,
    myColor,
    createRoom,
    joinRoom,
    gameStarted,
    startLocalGame,
    isCreator,
    playersReady
  };
}
