import test from "node:test";
import assert from "node:assert/strict";
import { RoomEventLog } from "../server/room-event-log.js";

test("RoomEventLog 应按序记录并重放事件", () => {
  const log = new RoomEventLog();
  const first = log.append("room-1", "player_joined", { nickname: "Alice" });
  const second = log.appendRoomRestart("room-1", { triggeredBy: "tokenA" });
  const third = log.appendGameFinished("room-1", { winner: "red" });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(third.sequence, 3);

  const replay = log.replaySince("room-1", 1);
  assert.equal(replay.length, 2);
  assert.equal(replay[0].type, "room_restart");
  assert.equal(replay[1].payload.winner, "red");
});
