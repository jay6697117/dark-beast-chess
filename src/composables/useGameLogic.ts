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
  // ... (existing computed properties)

  const isCreator = computed(() => mySeatIndex.value === 0);

  const initGame = () => {
    if (isOnline.value) {
        if (game.phase === 'SETUP' && isCreator.value && playersReady.value) {
            client.startGame();
        } else if (game.phase === 'GAME_OVER') {
            // For now, restart just resets local and maybe sends restart if implemented
            // client.send('RESTART', {});
             game.addMessage('暂不支持在线重开，请刷新页面重新创建', 'error');
        }
    } else {
        if (game.phase === 'SETUP') {
            game.startGame();
        } else if (game.phase === 'GAME_OVER') {
            game.resetGame();
        }
    }
  };

  // ... (existing functions)

  const resetGame = () => {
    game.resetGame();
    isOnline.value = false;
    roomId.value = null;
    sessionId.value = null;
    myColor.value = null;
    mySeatIndex.value = null;
    playersReady.value = false;
  };

  // Network handlers
      client.on('ROOM_CREATED', (_type, payload) => {
          isOnline.value = true;
          roomId.value = payload.roomId;
          sessionId.value = payload.sessionId;
          mySeatIndex.value = 0;
          game.resetGame();
          playersReady.value = false;
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
          game.addMessage('游戏开始！房主请先手翻牌');
          if (payload.gameState) syncGameState(payload.gameState);
      });

      // ... (rest of handlers)

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
