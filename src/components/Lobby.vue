<template>
<div class="lobby-container">
  <h2 class="lobby-title">联机对战大厅</h2>

  <div class="lobby-content">
    <!-- 左侧：操作区域 -->
    <div class="lobby-actions-panel">
      <div class="action-group create-group">
        <h3>创建新游戏</h3>
        <p class="action-desc">创建一个新房间，等待朋友加入</p>
        <button class="action-btn create-btn" @click="$emit('create-room')" :disabled="connecting">
          {{ connecting ? '连接中...' : '创建房间' }}
        </button>
      </div>

      <div class="divider">
        <span>OR</span>
      </div>

      <div class="action-group join-group">
        <h3>加入游戏</h3>
        <p class="action-desc">输入房间号加入现有对局</p>
        <div class="join-input-wrapper">
          <input
            v-model="roomIdInput"
            type="text"
            placeholder="输入房间号"
            class="room-input"
            @keyup.enter="joinRoom"
          />
          <button class="action-btn join-btn" @click="joinRoom" :disabled="!roomIdInput || connecting">
            加入
          </button>
        </div>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>

    <!-- 右侧：房间列表 -->
    <div class="lobby-rooms-panel">
      <div class="room-list-header">
        <h3>房间列表</h3>
        <button class="refresh-btn" @click="$emit('refresh-rooms')" :disabled="connecting">
          <span class="icon">↻</span> 刷新
        </button>
      </div>

      <div class="room-list-container">
        <div v-if="rooms.length === 0" class="room-empty">
          <div class="empty-icon">📭</div>
          <p>暂无房间，创建一个吧</p>
        </div>
        <div v-else class="room-items">
          <div v-for="room in rooms" :key="room.id" class="room-item">
            <div class="room-info">
              <div class="room-id">
                <span class="label">ID:</span>
                <span class="value">{{ room.id }}</span>
              </div>
              <div class="room-status-badge" :class="room.status.toLowerCase()">
                {{ room.status === 'WAITING' ? '等待中' : room.status === 'PLAYING' ? '进行中' : '已结束' }}
              </div>
            </div>
            <div class="room-meta">
              <span class="room-seats">👤 {{ room.seats }}/2</span>
              <span class="room-time">{{ formatTime(room.createdAt) }}</span>
            </div>
            <button class="action-btn item-join-btn" @click="$emit('join-room', room.id)" :disabled="connecting || room.seats >= 2">
              加入
            </button>
          </div>
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

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};
</script>

<style scoped>
.lobby-container {
  background: rgba(22, 27, 34, 0.95);
  padding: 3rem;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  text-align: center;
  max-width: 1100px;
  width: 95%;
  min-height: 600px;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.lobby-title {
  font-size: 2rem;
  font-weight: 800;
  background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
  letter-spacing: 2px;
  text-shadow: 0 2px 10px rgba(255, 215, 0, 0.2);
}

.lobby-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  text-align: left;
  flex: 1;
  height: 100%;
}

/* Top Panel: Actions */
.lobby-actions-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  border-right: none;
  padding-right: 0;
}

.action-group {
  flex: 1;
  background: rgba(255, 255, 255, 0.02);
  padding: 1.5rem;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.action-group h3 {
  font-size: 1.1rem;
  color: #e6edf3;
  margin-bottom: 0.5rem;
}

.action-desc {
  font-size: 0.85rem;
  color: #8b949e;
  margin-bottom: 1rem;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: #484f58;
  font-size: 0.8rem;
  font-weight: bold;
  margin: 0.5rem 0;
  flex-direction: row;
  justify-content: center;
  width: 100%;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  width: auto;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: none;
}

.divider span {
  padding: 0 10px;
}

.join-input-wrapper {
  display: flex;
  gap: 0.8rem;
}

.room-input {
  flex: 1;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 1rem;
  transition: all 0.3s ease;
  font-family: monospace;
  letter-spacing: 1px;
}

.room-input:focus {
  outline: none;
  border-color: #ffd700;
  background: rgba(0, 0, 0, 0.4);
  box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1);
}

/* Buttons */
.action-btn {
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.create-btn {
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  color: #1a1a1a;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.2);
}

.create-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 215, 0, 0.3);
}

.join-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.join-btn:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.1);
  border-color: #ffd700;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* Bottom Panel: Room List */
.lobby-rooms-panel {
  display: flex;
  flex-direction: column;
  flex: 1; /* Fill remaining vertical space */
  min-height: 0; /* Allow flex child to scroll */
}

.room-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.room-list-header h3 {
  font-size: 1.1rem;
  color: #e6edf3;
  margin: 0;
}

.refresh-btn {
  background: transparent;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  color: #ffd700;
  background: rgba(255, 255, 255, 0.05);
}

.room-list-container {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1rem;
  overflow-y: auto;
  /* Remove fixed height constraints to let flex handle it */
}

.room-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8b949e;
  gap: 1rem;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.room-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); /* Grid layout for room items */
  gap: 1rem;
}

.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  transition: all 0.2s ease;
}

.room-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.room-info {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.room-id .label {
  color: #8b949e;
  font-size: 0.8rem;
  margin-right: 6px;
}

.room-id .value {
  color: #e6edf3;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 1px;
}

.room-status-badge {
  display: inline-block;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.room-status-badge.waiting {
  background: rgba(46, 213, 115, 0.15);
  color: #2ed573;
}

.room-status-badge.playing {
  background: rgba(255, 71, 87, 0.15);
  color: #ff4757;
}

.room-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  margin-right: 1rem;
}

.room-seats {
  color: #e6edf3;
  font-size: 0.9rem;
  font-weight: 600;
}

.room-time {
  color: #8b949e;
  font-size: 0.8rem;
}

.item-join-btn {
  padding: 0.5rem 1.2rem;
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.item-join-btn:hover:not(:disabled) {
  background: #2ed573;
  border-color: #2ed573;
  color: white;
}

.error-message {
  margin-top: 1rem;
  color: #ff4757;
  font-size: 0.9rem;
  background: rgba(255, 71, 87, 0.1);
  padding: 0.8rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 71, 87, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Responsive Design */
@media (max-width: 768px) {
  .lobby-actions-panel {
    flex-direction: column;
    gap: 1rem;
  }

  .divider {
    flex-direction: row;
    margin: 0.5rem 0;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    width: 100%;
  }

  .divider span {
    padding: 0 10px;
  }

  .lobby-container {
    padding: 1.5rem;
  }
}
</style>
