export class GameRoomState {
  constructor({ seed }) {
    this.seed = seed;
    this.turn = null;
    this.boardState = null; // 具体棋盘状态由游戏引擎注入
    this.history = [];
  }

  init({ boardState, firstPlayer }) {
    this.turn = firstPlayer;
    this.boardState = boardState;
    this.history = [];
  }

  reset(seed) {
    this.seed = seed;
    this.turn = null;
    this.boardState = null;
    this.history = [];
  }

  applyEvent(event) {
    this.history.push(event);
    this.turn = event.nextTurn ?? this.turn;
    if (event.boardState) {
      this.boardState = event.boardState;
    }
  }
}
