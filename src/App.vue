<script setup lang="ts">
import { computed } from 'vue';
import { useGameLogic } from './composables/useGameLogic';
import BoardCell from './components/BoardCell.vue';
import Lobby from './components/Lobby.vue';

const {
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
  gameStarted,
  startLocalGame,
  isOnline,
  isConnecting,
  connectionError,
  createRoom,
  joinRoom,
  isCreator,
  playersReady,
  myColor
} = useGameLogic();

const phaseText = computed(() => {
  switch (status.value) {
    case 'SETUP': return '游戏准备中';
    case 'COLOR_SELECTION': return '翻棋定色';
    case 'PLAYING': return '游戏进行中';
    case 'GAME_OVER': return '游戏结束';
    default: return '';
  }
});

const phaseClass = computed(() => {
  switch (status.value) {
    case 'SETUP': return 'phase-setup';
    case 'COLOR_SELECTION': return 'phase-color-selection';
    case 'PLAYING': return 'phase-playing';
    case 'GAME_OVER': return 'phase-game-over';
    default: return '';
  }
});

const boardClass = computed(() => {
  if (status.value === 'PLAYING' && currentPlayer.value) {
    return `turn-${currentPlayer.value}`;
  }
  return '';
});

const showVictoryModal = computed(() => status.value === 'GAME_OVER');
const victoryMessage = computed(() => {
  if (redPiecesCount.value === 0) return '恭喜蓝方获胜！';
  if (bluePiecesCount.value === 0) return '恭喜红方获胜！';
  return '游戏结束！';
});
</script>

<template>
  <div class="game-container" role="application" aria-label="暗兽棋游戏">
    <!-- 左侧控制面板 -->
    <aside class="game-sidebar-left" role="complementary" aria-label="游戏控制面板">
      <header class="game-header">
        <h1 class="game-title" id="game-title">暗兽棋</h1>
        <p class="game-subtitle">Dark Beast Chess</p>
      </header>

      <section class="game-info" aria-labelledby="game-status-heading">
        <h2 id="game-status-heading" class="sr-only">游戏状态信息</h2>

        <div class="phase-indicator"
             id="phaseIndicator"
             role="status"
             aria-live="polite"
             aria-label="当前游戏阶段"
             :class="phaseClass">
          {{ phaseText }}
        </div>

        <div class="current-player"
             id="currentPlayerInfo"
             role="status"
             aria-live="polite"
             aria-label="当前玩家信息">
          <div class="player-indicator" :class="currentPlayer" aria-hidden="true"></div>
          <span id="playerText">
            {{ currentPlayer ? `当前玩家：${currentPlayer === 'red' ? '红' : '蓝'}方` : '点击开始游戏' }}
          </span>
        </div>

        <div v-if="isOnline && myColor" class="my-color-info" :class="myColor">
            您是：{{ myColor === 'red' ? '红方' : '蓝方' }}
        </div>
      </section>

      <section class="game-controls" aria-labelledby="controls-heading">
        <h2 id="controls-heading" class="sr-only">游戏控制</h2>
        <button class="btn btn-primary"
                id="startBtn"
                @click="initGame"
                :disabled="isOnline ? (gameStarted || !isCreator || !playersReady) : status !== 'SETUP'">
          {{ isOnline ? (gameStarted ? '游戏进行中' : (playersReady ? (isCreator ? '开始游戏' : '等待房主开始') : '等待玩家加入')) : (status === 'SETUP' ? '开始游戏' : '重新开始') }}
        </button>
      </section>
    </aside>

    <main class="game-main" role="main" aria-label="游戏主区域">
      <!-- 联机大厅 -->
      <div v-if="!isOnline && !gameStarted" class="lobby-overlay">
         <Lobby
           :connecting="isConnecting"
           :error="connectionError"
           @create-room="createRoom"
           @join-room="joinRoom"
         />
         <div class="local-play-option">
             <button class="text-btn" @click="startLocalGame">单机试玩</button>
         </div>
      </div>

        <div class="game-board-container" :class="[{ 'blur-bg': !isOnline && !gameStarted }, boardClass]">
          <div class="game-board" role="grid" aria-label="游戏棋盘">
              <BoardCell
                v-for="cell in board"
                :key="cell.id"
                :piece="cell.piece"
                :row="cell.row"
                :col="cell.col"
                :is-selected="selectedCellId === cell.id"
                :is-valid-move="false"
                @click="handleCellClick(cell.row, cell.col)"
              />
          </div>
        </div>

      <!-- 底部消息区域 -->
      <div class="game-messages" role="log" aria-live="polite">
        <div class="message-list">
          <div v-for="(msg, index) in game.messages.slice(-3)" :key="index" :class="['message-item', msg.type]">
            <span class="bullet">•</span> {{ msg.text }}
          </div>
        </div>
      </div>
    </main>

    <!-- 右侧信息面板 -->
    <aside class="game-sidebar-right" role="complementary" aria-label="游戏信息和消息面板">


      <!-- 游戏统计 -->
      <section class="game-stats-section" aria-labelledby="stats-section-heading">
        <h2 id="stats-section-heading" class="section-title">游戏统计</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">红方棋子:</span>
            <span class="stat-value red">{{ redPiecesCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">蓝方棋子:</span>
            <span class="stat-value blue">{{ bluePiecesCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">回合数:</span>
            <span class="stat-value">{{ game.turn }}</span>
          </div>
        </div>
      </section>
    </aside>

    <!-- 胜利结算弹窗 -->
    <div v-if="showVictoryModal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <div class="modal-content victory-modal">
        <h2 id="victory-title" class="victory-title">游戏结束</h2>
        <p class="victory-message">{{ victoryMessage }}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="initGame">再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global styles are imported in main.ts from style.css */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal-content {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 16px;
  text-align: center;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  max-width: 90%;
  width: 400px;
}

.victory-title {
  font-size: 2rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.victory-message {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.my-color-info {
    margin-top: 1rem;
    padding: 0.5rem;
    border-radius: 8px;
    text-align: center;
    font-weight: bold;
    font-size: 1.2rem;
}

.my-color-info.red {
    background-color: rgba(255, 0, 0, 0.2);
    color: #ff4d4d;
    border: 1px solid #ff4d4d;
}

.my-color-info.blue {
    background-color: rgba(0, 0, 255, 0.2);
    color: #4d4dff;
    border: 1px solid #4d4dff;
}
</style>
