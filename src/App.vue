<script setup lang="ts">
import { onMounted } from 'vue';
import { useGameLogic } from './composables/useGameLogic';
import GameBoard from './components/GameBoard.vue';
import GameInfo from './components/GameInfo.vue';
import VictoryModal from './components/VictoryModal.vue';

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

onMounted(() => {
  initGame();
});

const winner = computed(() => {
  if (status.value === 'red_won') return 'red';
  if (status.value === 'blue_won') return 'blue';
  return null;
});

import { computed } from 'vue';
</script>

<template>
  <div class="app-container">
    <header>
      <h1>暗兽棋</h1>
      <p class="subtitle">Dark Beast Chess</p>
    </header>

    <main class="game-layout">
      <div class="board-container">
        <GameBoard
          :board="board"
          :selected-cell-id="selectedCellId"
          @cell-click="handleCellClick"
        />
      </div>

      <div class="info-container">
        <GameInfo
          :turn="turn"
          :current-player="currentPlayer"
          :red-count="redPiecesCount"
          :blue-count="bluePiecesCount"
          :messages="messages"
          @reset="resetGame"
        />

        <div class="rules-card">
          <h3>规则说明</h3>
          <ul>
            <li>翻开第一枚棋子决定颜色</li>
            <li>每回合可选择翻棋或走棋 (上下左右一格)</li>
            <li><strong>大小规则:</strong> 象 > 狮 > 虎 > 豹 > 狼 > 狗 > 猫 > 鼠</li>
            <li><strong>特殊规则:</strong> 鼠 > 象</li>
            <li>同级相遇同归于尽</li>
          </ul>
        </div>
      </div>
    </main>

    <VictoryModal
      :winner="winner"
      @close="resetGame"
    />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  color: white;
  background-color: #0d1117;
  padding: 20px;
}

header {
  margin-bottom: 30px;
}

h1 {
  margin: 0;
  font-size: 2.5rem;
  background: linear-gradient(45deg, #e74c3c, #3498db);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  margin: 5px 0 0;
  color: #8b949e;
  font-size: 1rem;
  letter-spacing: 2px;
}

.game-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 1000px;
}

.board-container {
  flex: 0 0 auto;
}

.info-container {
  flex: 1;
  min-width: 300px;
  max-width: 400px;
}

.rules-card {
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 12px;
  margin-top: 20px;
  text-align: left;
}

.rules-card h3 {
  margin-top: 0;
  color: #f1c40f;
  font-size: 1.1rem;
}

.rules-card ul {
  padding-left: 20px;
  margin-bottom: 0;
  color: #c9d1d9;
  font-size: 0.9rem;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .game-layout {
    flex-direction: column;
    align-items: center;
  }

  .info-container {
    width: 100%;
  }
}
</style>
