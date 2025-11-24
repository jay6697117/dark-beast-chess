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

export function useGameLogic() {
  const board = computed(() => {
    // Flatten the 2D board for the template which expects a flat list or we can adapt the template
    // But since GameBoard.vue uses v-for, a flat list with IDs is easier if we want to keep it simple.
    // However, the original GameBoard.vue expected a flat array of cells.
    // Let's map the 2D board to a flat array of cells.
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
  const messages = computed(() => [...game.messages].reverse()); // Newest first

  const redPiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.red;
  });

  const bluePiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.blue;
  });

  const initGame = () => {
    if (isOnline.value) {
        // In online mode, "Start Game" might mean "Ready" or just waiting for server
        // For now, let's say if we are in SETUP, we send a ready signal?
        // Or actually, the server starts the game when 2 players join.
        // But we might want a "Rematch" button.
        if (game.phase === 'GAME_OVER') {
            client.send('RESTART', {});
        }
    } else {
        if (game.phase === 'SETUP') {
            game.startGame();
        } else if (game.phase === 'GAME_OVER') {
            game.resetGame();
        }
    }
  };

  const gameStarted = computed(() => game.phase !== 'SETUP');

  const startLocalGame = () => {
      isOnline.value = false;
      game.startGame();
  };

  const handleCellClick = (row: number, col: number) => {
    if (isOnline.value) {
        // Online mode: Send action to server
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
                    // Move action
                    client.sendAction('MOVE', {
                        fromRow: game.selectedPiece.row,
                        fromCol: game.selectedPiece.col,
                        targetRow: row,
                        targetCol: col
                    });
                    game.clearSelection(); // Clear selection optimistically
                }
            } else if (piece && piece.revealed && piece.color === game.currentPlayer) {
                // Select own piece (local only)
                if (myColor.value && piece.color === myColor.value) {
                     game.selectPiece(row, col);
                }
            } else if (piece && !piece.revealed) {
                // Flip action
                client.sendAction('FLIP', { row, col });
            }
        }
    } else {
        game.handleCellClick(row, col);
    }
  };

  const resetGame = () => {
    game.resetGame();
    isOnline.value = false;
    roomId.value = null;
    sessionId.value = null;
    myColor.value = null;
    mySeatIndex.value = null;
  };

  // Network handlers - Registered once
      client.on('ROOM_CREATED', (_type, payload) => {
          isOnline.value = true;
          roomId.value = payload.roomId;
          sessionId.value = payload.sessionId;
          mySeatIndex.value = 0; // Creator is always seat 0 (player1)
          game.resetGame(); // Reset local board to clean state
          game.addMessage(`房间已创建：${payload.roomId}，等待对手加入...`);
      });

      client.on('JOINED', (_type, payload) => {
          isOnline.value = true;
          roomId.value = payload.roomId;
          sessionId.value = payload.sessionId;
          mySeatIndex.value = payload.seatIndex;
          if (payload.gameState) {
              syncGameState(payload.gameState);
          } else {
              game.resetGame();
          }
          game.addMessage(`已加入房间：${payload.roomId}`);
      });

      client.on('PLAYER_JOINED', (_type, payload) => {
          game.addMessage(`玩家加入，当前人数：${payload.count}`);
      });

      client.on('GAME_START', (_type, payload) => {
          game.addMessage('游戏开始！');
          if (payload.gameState) syncGameState(payload.gameState);
      });

      client.on('STATE_UPDATE', (_type, payload) => {
          // Handle animation based on lastAction
          if (payload.lastAction) {
              const { action, payload: actionPayload, result } = payload.lastAction;
              if (action === 'FLIP') {
                  // Trigger flip animation locally then sync
                  const piece = game.board[actionPayload.row][actionPayload.col];
                  if (piece) {
                      piece.isFlipping = true;
                      setTimeout(() => {
                          piece.isFlipping = false;
                          syncGameState(payload.gameState);
                      }, 400);
                      return; // Defer sync
                  }
              } else if (action === 'MOVE') {
                  // Trigger move animation
                  const { fromRow, fromCol, targetRow, targetCol } = actionPayload;
                  if (result && result.result) {
                       game.executeBattleWithAnimation(fromRow, fromCol, targetRow, targetCol, result.result);
                       setTimeout(() => {
                            syncGameState(payload.gameState);
                       }, 1000); // Wait for animation
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
          game.addMessage('与服务器断开连接', 'error');
      });

  const connectToServer = async () => {
      isConnecting.value = true;
      connectionError.value = undefined;
      try {
          await client.connect();
      } catch (e) {
          connectionError.value = '连接服务器失败';
          isConnecting.value = false;
      } finally {
          isConnecting.value = false;
      }
  };

  const createRoom = () => {
      connectToServer().then(() => client.createRoom());
  };

  const joinRoom = (id: string) => {
      connectToServer().then(() => client.joinRoom(id));
  };

  const syncGameState = (state: any) => {
      // Update local game instance with server state
      game.board = state.board;
      game.phase = state.phase;
      game.currentPlayer = state.currentPlayer;
      game.playerColors = state.playerColors;
      game.turn = state.turn;
      game.revealedPieces = new Set(state.revealedPieces);
      game.moveHistory = state.moveHistory;

      // Determine my color
      if (mySeatIndex.value !== null && state.playerColors) {
          if (mySeatIndex.value === 0) {
              myColor.value = state.playerColors.player1;
          } else if (mySeatIndex.value === 1) {
              myColor.value = state.playerColors.player2;
          }
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
    startLocalGame
  };
}
