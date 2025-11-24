<script setup lang="ts">
import { computed } from 'vue';
import { useGameLogic } from './composables/useGameLogic';
import BoardCell from './components/BoardCell.vue';
import Lobby from './components/Lobby.vue';

const {
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
  gameStarted,
  startLocalGame,
  isOnline,
  isConnecting,
  connectionError,
  createRoom,
  joinRoom,
  game
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
  // We can infer winner from messages or state, but let's just use generic message or check last message
  // Or better, check who has 0 pieces? No, could be stalemate.
  // Let's just say "Game Over" or check the last important message.
  // Actually, let's just show "Game Over" and the winner is usually in the message log.
  // But to be precise, we can check pieces count if one is 0.
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
      </section>

      <section class="game-controls" aria-labelledby="controls-heading">
        <h2 id="controls-heading" class="sr-only">游戏控制</h2>
        <button class="btn btn-primary"
                id="startBtn"
                @click="initGame"
                :disabled="status !== 'SETUP'">
          {{ status === 'SETUP' ? '开始游戏' : '重新开始' }}
        </button>
      </section>

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

      <div class="game-board-container" :class="{ 'blur-bg': !isOnline && !gameStarted }">
        <div class="board-grid" role="grid" aria-label="游戏棋盘">
          <div
            v-for="(row, rowIndex) in game.board"
            :key="rowIndex"
            class="board-row"
            role="row"
          >
            <BoardCell
              v-for="(piece, colIndex) in row"
              :key="`${rowIndex}-${colIndex}`"
              :piece="piece"
              :row="rowIndex"
              :col="colIndex"
              :is-selected="game.selectedPiece?.row === rowIndex && game.selectedPiece?.col === colIndex"
              :is-valid-move="false"
              @click="handleCellClick(rowIndex, colIndex)"
            />
          </div>
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
          </button>
          <!-- Close button just hides modal visually but state is still game over -->
          <!-- We can implement a close method if needed, but reset is better -->
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global styles are imported in main.ts from style.css */
</style>
