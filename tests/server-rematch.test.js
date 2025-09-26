import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server/index.js";
import { io as createClient } from "socket.io-client";

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test("Socket 流程：创建房间 → 准备 → 再战", async (t) => {
  const { server } = await startServer(0);
  const { port } = server.address();
  const url = `http://localhost:${port}`;

  t.after(() => server.close());

  const clientA = createClient(url, { transports: ["websocket"] });
  const clientB = createClient(url, { transports: ["websocket"] });

  t.after(() => {
    clientA.close();
    clientB.close();
  });

  await Promise.all([
    new Promise((resolve) => clientA.on("connect", resolve)),
    new Promise((resolve) => clientB.on("connect", resolve)),
  ]);

  clientA.emit("room:create", { roomName: "测试房间", nickname: "Alice" });
  const created = await once(clientA, "room:created");
  const roomId = created.roomId;

  clientB.emit("room:join", { roomId, nickname: "Bob" });
  await once(clientB, "room:update");

  clientA.emit("room:ready", { roomId, ready: true });
  clientB.emit("room:ready", { roomId, ready: true });

  const initPayload = await once(clientA, "game:init");
  assert.equal(initPayload.roomId, roomId);
  assert.ok(initPayload.seed);

  clientA.emit("game:flip", { roomId, row: 0, col: 0 });
  const update = await once(clientA, "game:update");
  assert.equal(update.roomId, roomId);

  clientA.emit("game:over", { roomId, winner: "red", reason: "test" });
  const overPayload = await once(clientA, "game:over");
  assert.equal(overPayload.reason, "test");

  clientA.emit("room:rematch", { roomId });
  const resetPayload = await once(clientA, "game:reset");
  assert.equal(resetPayload.roomId, roomId);
  assert.ok(resetPayload.seed);
  assert.notEqual(resetPayload.seed, initPayload.seed);
});
