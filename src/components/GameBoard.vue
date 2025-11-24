<script setup lang="ts">
import BoardCell from './BoardCell.vue';
import type { Cell } from '../types/game';

defineProps<{
  board: Cell[];
  selectedCellId: number | null;
}>();

const emit = defineEmits<{
  (e: 'cell-click', id: number): void;
}>();
</script>

<template>
  <div class="game-board">
    <BoardCell
      v-for="cell in board"
      :key="cell.id"
      :piece="cell.piece"
      :is-selected="selectedCellId === cell.id"
      @click="emit('cell-click', cell.id)"
    />
  </div>
</template>

<style scoped>
.game-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 500px;
  padding: 20px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}
</style>
