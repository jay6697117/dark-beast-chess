import { createGame } from "../shared/game-engine.js";

export class GameStateStore {
  constructor() {
    this.games = new Map();
  }

  create(roomId, options) {
    const game = createGame(options);
    this.games.set(roomId, game);
    return game;
  }

  get(roomId) {
    return this.games.get(roomId) || null;
  }

  remove(roomId) {
    this.games.delete(roomId);
  }
}
