<template>
<div class="lobby-container">
  <h2 class="lobby-title">联机对战大厅</h2>

  <div class="lobby-actions">
    <button class="action-btn create-btn" @click="$emit('create-room')" :disabled="connecting">
      {{ connecting ? '连接中...' : '创建房间' }}
    </button>

    <div class="join-section">
      <input
        v-model="roomIdInput"
        type="text"
        placeholder="输入房间号"
        class="room-input"
        @keyup.enter="joinRoom"
      />
      <button class="action-btn join-btn" @click="joinRoom" :disabled="!roomIdInput || connecting">
        加入房间
      </button>
    </div>
  </div>

  <div v-if="error" class="error-message">
    {{ error }}
  </div>

  <div class="room-list">
    <div class="room-list-header">
      <span>房间列表</span>
      <button class="refresh-btn" @click="$emit('refresh-rooms')" :disabled="connecting">刷新</button>
    </div>
    <div v-if="rooms.length === 0" class="room-empty">暂无房间，创建一个吧</div>
    <div v-else class="room-items">
      <div v-for="room in rooms" :key="room.id" class="room-item">
        <div class="room-meta">
          <div class="room-id">房间号：{{ room.id }}</div>
          <div class="room-status">状态：{{ room.status === 'WAITING' ? '等待中' : room.status === 'PLAYING' ? '进行中' : '已结束' }}</div>
        </div>
        <div class="room-actions">
          <span class="room-seats">人数：{{ room.seats }}/2</span>
          <button class="action-btn join-btn" @click="$emit('join-room', room.id)" :disabled="connecting || room.seats >= 2">加入</button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  connecting: boolean;
  error?: string;
  rooms: { id: string; status: string; seats: number; createdAt: number }[];
}>();

const emit = defineEmits<{
  (e: 'create-room'): void;
  (e: 'join-room', roomId: string): void;
  (e: 'refresh-rooms'): void;
}>();

const roomIdInput = ref('');

const joinRoom = () => {
  if (roomIdInput.value) {
    emit('join-room', roomIdInput.value.toUpperCase());
  }
};
</script>

<style scoped>
.lobby-container {
  background: rgba(30, 30, 40, 0.95);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  text-align: center;
  max-width: 400px;
  width: 100%;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.lobby-title {
  color: #fbbf24;
  margin-bottom: 2rem;
  font-size: 1.8rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.lobby-actions {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.action-btn {
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #1a1a1a;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.create-btn {
  background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
}

.create-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(251, 191, 36, 0.4);
}

.join-section {
  display: flex;
  gap: 0.5rem;
}

.room-input {
  flex: 1;
  padding: 0.8rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 1rem;
  text-transform: uppercase;
}

.room-input:focus {
  outline: none;
  border-color: #fbbf24;
}

.join-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  white-space: nowrap;
}

.join-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.error-message {
  margin-top: 1rem;
  color: #ef4444;
  font-size: 0.9rem;
  background: rgba(239, 68, 68, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
}

.room-list {
  margin-top: 1.5rem;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 1rem;
  text-align: left;
}

.room-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fbbf24;
  margin-bottom: 0.8rem;
}

.refresh-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fbbf24;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(251, 191, 36, 0.1);
}

.room-empty {
  color: #cbd5f5;
  font-size: 0.95rem;
}

.room-items {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.room-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #e5e7eb;
}

.room-id {
  font-weight: 700;
  letter-spacing: 0.5px;
}

.room-status {
  font-size: 0.9rem;
  color: #cbd5f5;
}

.room-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.room-seats {
  color: #cbd5f5;
  font-size: 0.95rem;
}
</style>
