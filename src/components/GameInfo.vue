<script setup lang="ts">
import type { PlayerColor } from '../types/game';

defineProps<{
  turn: number;
  currentPlayer: PlayerColor;
  redCount: number;
  blueCount: number;
  messages: string[];
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
}>();
</script>

<template>
  <div class="game-info">
    <div class="stats-panel">
      <div class="player-stat red" :class="{ active: currentPlayer === 'red' }">
        <span class="label">红方</span>
        <span class="count">{{ redCount }}</span>
      </div>

      <div class="turn-display">
        <div class="turn-number">第 {{ turn }} 回合</div>
        <button class="reset-btn" @click="emit('reset')">重新开始</button>
      </div>

      <div class="player-stat blue" :class="{ active: currentPlayer === 'blue' }">
        <span class="label">蓝方</span>
        <span class="count">{{ blueCount }}</span>
      </div>
    </div>

    <div class="message-log">
      <div v-for="(msg, index) in messages" :key="index" class="message">
        {{ msg }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-info {
  width: 100%;
  max-width: 500px;
  margin-top: 20px;
}

.stats-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 15px;
  border-radius: 12px;
  margin-bottom: 15px;
}

.player-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 20px;
  border-radius: 8px;
  transition: all 0.3s;
  opacity: 0.6;
}

.player-stat.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}

.player-stat.red { color: #e74c3c; }
.player-stat.blue { color: #3498db; }

.label { font-size: 0.9rem; margin-bottom: 4px; }
.count { font-size: 1.5rem; font-weight: bold; }

.turn-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.turn-number {
  font-size: 1.1rem;
  font-weight: bold;
}

.reset-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.message-log {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px;
  height: 100px;
  overflow-y: auto;
  font-size: 0.9rem;
  text-align: left;
}

.message {
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.message:first-child {
  color: #f1c40f;
  font-weight: bold;
}
</style>
