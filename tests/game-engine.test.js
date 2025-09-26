import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../shared/game-engine.js";

function setupSimpleGame() {
  const game = createGame({ seed: "unit" , players: ["playerA", "playerB"] });
  // 自定义棋盘，便于测试
  game.phase = "PLAYING";
  game.currentColor = "red";
  game.playerColors.set("playerA", "red");
  game.playerColors.set("playerB", "blue");
  game.colorPlayers.set("red", "playerA");
  game.colorPlayers.set("blue", "playerB");
  game.board = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => null),
  );
  const redCat = { id: "piece-0-0", type: "cat", color: "red", revealed: true, position: { row: 0, col: 0 } };
  const blueMouse = { id: "piece-0-1", type: "mouse", color: "blue", revealed: true, position: { row: 0, col: 1 } };
  game.board[0][0] = redCat;
  game.board[0][1] = blueMouse;
  return { game, redCat, blueMouse };
}

test("flipPiece 应在开局分配颜色并进入 PLAYING 阶段", () => {
  const game = createGame({ seed: "seed", players: ["playerA", "playerB"] });
  const action = game.flipPiece({ row: 0, col: 0, actorToken: "playerA", opponentToken: "playerB" });
  const summary = game.getStateSummary();
  assert.ok(action.snapshot);
  assert.equal(summary.phase, "PLAYING");
  assert.equal(summary.currentColor, action.snapshot.currentColor);
  const colors = new Set(Object.values(summary.sessionColors));
  assert.equal(colors.size, 2);
  assert.ok(colors.has("red"));
  assert.ok(colors.has("blue"));
});

test("movePiece 应允许合法走子并更新棋盘", () => {
  const { game } = setupSimpleGame();
  const action = game.movePiece({
    from: { row: 0, col: 0 },
    to: { row: 1, col: 0 },
    actorToken: "playerA",
  });
  assert.equal(game.board[1][0]?.type, "cat");
  assert.equal(game.board[0][0], null);
  assert.equal(action.battleResult, null);
  assert.equal(game.getStateSummary().turn, 2);
});

test("movePiece 连续三次重复应判负", () => {
  const { game } = setupSimpleGame();
  game.board[1][0] = null;
  game.board[1][1] = null;
  game.consecutiveMoves.set("0-0-1-0", 2);

  const result = game.movePiece({
    from: { row: 0, col: 0 },
    to: { row: 1, col: 0 },
    actorToken: "playerA",
  });

  assert.equal(result.type, "repetition_defeat");
  assert.equal(game.getStateSummary().winner, "blue");
});
