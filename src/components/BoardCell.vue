<script setup lang="ts">
import { computed } from 'vue';
import type { Piece } from '../game/DarkBeastChess';

const props = defineProps<{
  piece: Piece | null;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const pieceClasses = computed(() => {
  if (!props.piece) return [];
  const classes = ['piece'];

  if (props.piece.revealed) {
    classes.push(props.piece.color);
    classes.push(`piece-${props.piece.type}`);
  } else {
    classes.push('hidden');
  }

  if (props.piece.isFlipping) classes.push('flipping');
  if (props.piece.isMoving) classes.push('moving');
  if (props.piece.isEaten) classes.push('eaten');
  if (props.piece.isVictory) classes.push('victory');
  if (props.piece.isInvalid) classes.push('invalid-move');
  if (props.piece.isAppearing) classes.push('appearing');

  return classes;
});

const cellClasses = computed(() => {
  const classes = ['board-cell'];
  if (props.isSelected) classes.push('selected');
  return classes;
});
const pieceText = computed(() => {
  if (!props.piece || !props.piece.revealed) return '';
  const names: Record<string, string> = {
    elephant: '象',
    lion: '狮',
    tiger: '虎',
    leopard: '豹',
    wolf: '狼',
    dog: '狗',
    cat: '猫',
    mouse: '鼠'
  };
  return names[props.piece.type] || '';
});
</script>

<template>
  <div
    :class="cellClasses"
    @click="emit('click')"
  >
    <div v-if="piece" :class="pieceClasses" :id="piece.id">
        <template v-if="piece.revealed">
            <span class="piece-text-corner top-left">{{ pieceText }}</span>
            <span class="piece-text-corner bottom-right">{{ pieceText }}</span>
        </template>
    </div>
  </div>
</template>

<style scoped>
/* Styles are imported globally in style.css, but we can add scoped overrides if needed */
/* The global styles.css expects .board-cell and .piece classes */
.piece-text-corner {
  position: absolute;
  font-size: 1.2rem;
  font-weight: bold;
  color: inherit;
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
  pointer-events: none;
  line-height: 1;
  z-index: 10;
}

.top-left {
  top: 6px;
  left: 6px;
}

.bottom-right {
  bottom: 6px;
  right: 6px;
  transform: rotate(180deg);
}

.piece.red .piece-text-corner {
  color: #ff4757;
}

.piece.blue .piece-text-corner {
  color: #5352ed;
}
</style>
