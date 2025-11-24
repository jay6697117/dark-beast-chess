<script setup lang="ts">
import { computed } from 'vue';
import { useGameLogic } from './composables/useGameLogic';
import BoardCell from './components/BoardCell.vue';

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
  resetGame
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
                :disabled="status !== 'SETUP'"
                aria-describedby="start-btn-desc">
          开始游戏
        </button>
        <div id="start-btn-desc" class="sr-only">开始新的暗兽棋游戏</div>

        <button class="btn btn-secondary"
                id="resetBtn"
                @click="resetGame"
                aria-describedby="reset-btn-desc">
          重新开始
        </button>
        <div id="reset-btn-desc" class="sr-only">重置当前游戏到初始状态</div>
      </section>

      <section class="rules-section" aria-labelledby="rules-section-heading-left">
        <details class="game-rules" open>
          <summary>
            <h2 id="rules-section-heading-left">游戏规则</h2>
          </summary>
          <ul role="list">
            <li>翻开第一枚棋子决定颜色</li>
            <li>每回合可选择翻棋或走棋</li>
            <li>食物链规则：象>狮>虎>豹>狼>狗>猫>鼠</li>
            <li>特殊：鼠可以吃象</li>
            <li>同类相遇同归于尽</li>
          </ul>
        </details>
      </section>
    </aside>

    <!-- 中间棋盘区域 -->
    <main class="game-main" id="main-game" role="main" aria-labelledby="board-heading">
      <h2 id="board-heading" class="sr-only">游戏棋盘</h2>

      <div class="game-board"
           id="gameBoard"
           role="grid"
           aria-label="4×4游戏棋盘"
           aria-describedby="board-instructions"
           :class="boardClass">

        <BoardCell
          v-for="cell in board"
          :key="cell.id"
          :piece="cell.piece"
          :is-selected="selectedCellId === cell.id"
          @click="handleCellClick(cell.id)"
        />

      </div>
      <div id="board-instructions" class="sr-only">
        使用鼠标点击或键盘导航来选择和移动棋子。
      </div>
    </main>

    <!-- 右侧信息面板 -->
    <aside class="game-sidebar-right" role="complementary" aria-label="游戏信息和消息面板">


      <!-- 游戏统计 -->
      <section class="game-stats-section" aria-labelledby="stats-section-heading">
        <h2 id="stats-section-heading">游戏统计</h2>
        <div class="game-stats" aria-labelledby="stats-heading">
          <h3 id="stats-heading" class="sr-only">统计数据</h3>
          <div class="stat-item">
            <span class="stat-label">红方棋子:</span>
            <span class="stat-value" id="redPieces" aria-label="红方剩余棋子数量">{{ redPiecesCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">蓝方棋子:</span>
            <span class="stat-value" id="bluePieces" aria-label="蓝方剩余棋子数量">{{ bluePiecesCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">回合数:</span>
            <span class="stat-value" id="turnCount" aria-label="当前回合数">{{ Math.floor((turn - 1) / 2) + 1 }}</span>
          </div>
        </div>
      </section>

      <!-- 游戏消息 -->
      <section class="game-messages"
               id="gameMessages"
               role="log"
               aria-live="polite"
               aria-labelledby="messages-heading"
               aria-describedby="messages-desc">
        <h3 id="messages-heading" class="sr-only">游戏消息</h3>
        <div id="messages-desc" class="sr-only">显示游戏进程和操作反馈的消息区域</div>
        <div v-for="(msg, index) in messages"
             :key="index"
             class="message-item"
             :class="msg.type"
             role="listitem">
          {{ msg.text }}
        </div>
      </section>
    </aside>

    <!-- 胜利对话框 -->
    <div class="modal"
         id="victoryModal"
         role="dialog"
         aria-modal="true"
         aria-labelledby="victory-title"
         aria-describedby="victory-message"
         :class="{ show: showVictoryModal }">
      <div class="modal-content">
        <h2 id="victory-title">游戏结束</h2>
        <p id="victory-message">{{ victoryMessage }}</p>
        <div class="modal-buttons" role="group" aria-label="游戏结束选项">
          <button class="btn btn-primary"
                  @click="resetGame"
                  aria-label="开始新游戏">
            再来一局
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
