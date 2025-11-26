<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameLogic } from './composables/useGameLogic';
import BoardCell from './components/BoardCell.vue';
import Lobby from './components/Lobby.vue';

const {
  board,
  currentPlayer,
  status,
  selectedCellId,
  redPiecesCount,
  bluePiecesCount,
  initGame,
  handleCellClick,
  gameStarted,
  isOnline,
  isConnecting,
  connectionError,
  createRoom,
  joinRoom,
  isCreator,
  playersReady,
  myColor,
  turn,
  messages,
  roomList,
  fetchRooms,
  toast,
  leaveRoom,
  inLocalRoom,
  exitLocalRoom
} = useGameLogic();

const exitRoom = () => {
  if (isOnline.value) {
    leaveRoom();
  } else {
    exitLocalRoom();
  }
};

const isMyTurn = computed(() => {
  if (!currentPlayer.value) return false;
  if (!myColor.value) return false;
  return currentPlayer.value === myColor.value;
});

const turnText = computed(() => {
  if (!currentPlayer.value) return '点击开始游戏';
  if (myColor.value) {
    return currentPlayer.value === myColor.value ? '等待您的操作' : '等待对方操作';
  }
  return `等待${currentPlayer.value === 'red' ? '红方' : '蓝方'}操作`;
});

const turnTextChars = computed(() => turnText.value.split(''));

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
  if (redPiecesCount.value === 0) return '恭喜蓝方获胜！';
  if (bluePiecesCount.value === 0) return '恭喜红方获胜！';
  return '游戏结束！';
});

const showRules = ref(false);
const openRules = () => { showRules.value = true; };
const closeRules = () => { showRules.value = false; };
</script>

<template>
  <div class="game-container" role="application" aria-label="暗兽棋游戏">
    <div class="toast-container" aria-live="assertive">
      <transition name="toast-fade">
        <div v-if="toast" class="toast" :class="toast.type">
          {{ toast.text }}
        </div>
      </transition>
    </div>

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
      <div class="turn-visual" :class="[{ 'is-your-turn': isMyTurn, 'is-opponent-turn': currentPlayer && !isMyTurn }]" aria-hidden="true">
        <div class="star-orbit">
          <span v-for="n in 10" :key="n" class="star-particle" :style="{ '--i': n }"></span>
        </div>
        <div class="turn-core" :class="currentPlayer"></div>
      </div>
      <span
        id="playerText"
        class="turn-text"
        :class="[{ 'is-your-turn': isMyTurn, 'is-opponent-turn': currentPlayer && !isMyTurn }]">
        <span
          v-for="(char, index) in turnTextChars"
          :key="index"
          class="wave-char"
          :style="{ '--char-index': index }">
          {{ char === ' ' ? '\u00A0' : char }}
        </span>
      </span>
    </div>

        <div v-if="isOnline && myColor" class="my-color-info" :class="myColor">
            您是：{{ myColor === 'red' ? '红方' : '蓝方' }}
        </div>
      </section>

      <section class="game-controls" aria-labelledby="controls-heading">
        <h2 id="controls-heading" class="sr-only">游戏控制</h2>
        <button class="btn btn-primary"
                id="startBtn"
                @click="initGame"
                :disabled="isOnline ? (gameStarted || !isCreator || !playersReady) : false">
          {{ isOnline ? (gameStarted ? '游戏进行中' : (playersReady ? (isCreator ? '开始游戏' : '等待房主开始') : '等待玩家加入')) : (inLocalRoom ? '单机重开' : '单机开始') }}
        </button>
        <button
          v-if="isOnline || inLocalRoom"
          class="btn btn-secondary"
          type="button"
          @click="exitRoom">
          {{ isOnline ? '退出房间' : '退出单机房间' }}
        </button>
      </section>

      <div class="sidebar-flex-spacer" aria-hidden="true"></div>

      <button class="rules-btn" type="button" @click="openRules" aria-haspopup="dialog" aria-controls="rulesModal">
        <span class="rules-btn-glow"></span>
        <span class="rules-btn-label">游戏规则</span>
        <span class="rules-btn-sub">Dark Beast Protocol</span>
      </button>
    </aside>

    <main class="game-main" role="main" aria-label="游戏主区域">
      <!-- 联机大厅（未进入房间时独占显示） -->
      <div v-if="!isOnline && !inLocalRoom" class="lobby-overlay">
         <Lobby
           :connecting="isConnecting"
           :error="connectionError"
           :rooms="roomList"
           @create-room="createRoom"
           @join-room="joinRoom"
           @refresh-rooms="fetchRooms"
         />

      </div>

      <!-- 棋盘与消息，仅在进入房间或本地游戏时显示 -->
      <template v-else>
        <div class="game-board-container" :class="[boardClass]">
          <div class="game-board" role="grid" aria-label="游戏棋盘">
              <BoardCell
                v-for="cell in board"
                :key="cell.id"
                :piece="cell.piece"
                :row="cell.row"
                :col="cell.col"
                :is-selected="selectedCellId === cell.id"
                :is-valid-move="false"
                @click="handleCellClick(cell.row, cell.col)"
              />
          </div>
        </div>


      </template>
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
            <span class="stat-value">{{ turn }}</span>
          </div>
        </div>
      </section>

      <!-- 游戏消息日志 -->
      <section class="game-messages-section" aria-labelledby="messages-section-heading">
        <h2 id="messages-section-heading" class="section-title">操作日志</h2>
        <div class="game-messages" role="log" aria-live="polite">
            <div class="message-list">
            <div v-for="(msg, index) in messages" :key="index" :class="['message-item', msg.type]">
              <span class="bullet">•</span> {{ msg.text }}
            </div>
          </div>
        </div>
      </section>
    </aside>

    <!-- 胜利结算弹窗 -->
    <div v-if="showVictoryModal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <div class="modal-content victory-modal">
        <h2 id="victory-title" class="victory-title">游戏结束</h2>
        <p class="victory-message">{{ victoryMessage }}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="initGame">再来一局</button>
        </div>
      </div>
    </div>

    <!-- 规则弹窗 -->
    <div
      v-if="showRules"
      id="rulesModal"
      class="rules-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      @click.self="closeRules">
      <div class="rules-modal">
        <header class="rules-modal-header">
          <div class="rules-title-wrap">
            <span class="rules-title-accent"></span>
            <h2 id="rules-title">暗兽棋规则</h2>
            <p class="rules-subtitle">Dark Beast Protocol</p>
          </div>
          <button class="rules-close" type="button" @click="closeRules" aria-label="关闭规则">×</button>
        </header>

        <div class="rules-content" role="document">
          <section class="rule-block">
            <h3>吃法</h3>
            <ul>
              <li>强吃弱：战斗力由弱到强依次为 鼠 &lt; 猫 &lt; 狗 &lt; 狼 &lt; 豹 &lt; 虎 &lt; 狮 &lt; 象，强者可吃弱者。</li>
              <li>鼠特例：鼠能吃象，象不能吃鼠。</li>
              <li>互吃：同级相遇可互吃（同归于尽）。</li>
              <li>总结：鼠吃鼠/象；猫吃猫/鼠；狗吃狗/猫/鼠；狼吃狼/狗/猫/鼠；豹吃豹/狼/狗/猫/鼠；虎吃虎/豹/狼/狗/猫/鼠；狮吃狮/虎/豹/狼/狗/猫/鼠；象吃象/狮/虎/豹/狼/狗/猫。</li>
            </ul>
          </section>

          <section class="rule-block">
            <h3>胜负判定</h3>
            <ul>
              <li>一方所有兽被吃光，对方获胜。</li>
              <li>一方中途离开游戏，视为逃跑，对方获胜。</li>
            </ul>
          </section>

          <section class="rule-block">
            <h3>违例处理</h3>
            <p>暂无额外违例规则，默认遵循公平竞赛与体育精神。</p>
          </section>
        </div>

        <div class="rules-actions">
          <button class="btn btn-secondary" type="button" @click="closeRules">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global styles are imported in main.ts from style.css */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal-content {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 16px;
  text-align: center;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  max-width: 90%;
  width: 400px;
}

.victory-title {
  font-size: 2rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.victory-message {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.my-color-info {
    margin-top: 1rem;
    padding: 0.5rem;
    border-radius: 8px;
    text-align: center;
    font-weight: bold;
    font-size: 1.2rem;
}

.my-color-info.red {
    background-color: rgba(255, 0, 0, 0.2);
    color: #ff4d4d;
    border: 1px solid #ff4d4d;
}

.my-color-info.blue {
    background-color: rgba(0, 0, 255, 0.2);
    color: #4d4dff;
    border: 1px solid #4d4dff;
}

.player-name {
  font-weight: bold;
  padding: 0 4px;
}

.player-name.red {
  color: #ff4757;
}

.player-name.blue {
  color: #5352ed;
}
</style>
