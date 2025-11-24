<script setup lang="ts">
import { computed } from 'vue';
import type { Piece } from '../types/game';

const props = defineProps<{
  piece: Piece | null;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const pieceName = computed(() => {
  if (!props.piece) return '';
  const names: Record<string, string> = {
    rat: '鼠', cat: '猫', dog: '狗', wolf: '狼',
    leopard: '豹', tiger: '虎', lion: '狮', elephant: '象'
  };
  return names[props.piece.type];
});

const pieceClass = computed(() => {
  if (!props.piece) return '';
  return `piece-${props.piece.color}`;
});
</script>

<template>
  <div
    class="cell"
    :class="{ selected: isSelected }"
    @click="emit('click')"
  >
    <div class="card" :class="{ flipped: piece && piece.isRevealed }">
      <!-- Back of the card (Hidden) -->
      <div class="card-face card-back">
        <div class="pattern"></div>
      </div>

      <!-- Front of the card (Revealed) -->
      <div class="card-face card-front" v-if="piece">
        <div class="piece-content" :class="pieceClass">
          {{ pieceName }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cell {
  width: 100%;
  aspect-ratio: 1;
  perspective: 1000px;
  cursor: pointer;
}

.card {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s;
}

.card.flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.card-back {
  background: linear-gradient(135deg, #2c3e50, #34495e);
  border: 2px solid #4a6278;
}

.pattern {
  width: 60%;
  height: 60%;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.card-front {
  background-color: #ecf0f1;
  transform: rotateY(180deg);
  border: 2px solid #bdc3c7;
}

.piece-content {
  font-size: 2rem;
  font-weight: bold;
  width: 80%;
  height: 80%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 3px solid currentColor;
}

.piece-red {
  color: #e74c3c;
  border-color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.1);
}

.piece-blue {
  color: #3498db;
  border-color: #3498db;
  background-color: rgba(52, 152, 219, 0.1);
}

.selected .card-front {
  box-shadow: 0 0 15px #f1c40f;
  border-color: #f1c40f;
}
</style>
