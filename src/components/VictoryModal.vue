<script setup lang="ts">
defineProps<{
  winner: 'red' | 'blue' | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <dialog class="modal" :open="!!winner">
    <div class="modal-content">
      <h2>游戏结束</h2>
      <p class="winner-text">
        <span :class="winner === 'red' ? 'text-red' : 'text-blue'">
          {{ winner === 'red' ? '红方' : '蓝方' }}
        </span>
        获胜！
      </p>
      <button class="btn-primary" @click="emit('close')">再来一局</button>
    </div>
  </dialog>
</template>

<style scoped>
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #2c3e50;
  color: white;
  border: 2px solid #34495e;
  border-radius: 16px;
  padding: 0;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.modal::backdrop {
  background: rgba(0, 0, 0, 0.7);
}

.modal-content {
  padding: 30px 50px;
  text-align: center;
}

h2 { margin-top: 0; }

.winner-text {
  font-size: 1.5rem;
  margin: 20px 0;
}

.text-red { color: #e74c3c; font-weight: bold; }
.text-blue { color: #3498db; font-weight: bold; }

.btn-primary {
  background: #27ae60;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2ecc71;
}
</style>
