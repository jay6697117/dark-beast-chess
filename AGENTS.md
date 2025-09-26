# Repository Guidelines

## Project Structure & Module Organization
Dark Beast Chess is a static web app served from the project root. `index.html` wires the layout and loads `styles.css` plus `game.js`, which contains the entire gameplay engine (board state, UI hooks, move rules). Reference guides live in `game-rules.md`, `websocket-online-battle-plan.md`, and `CLAUDE.md`; keep future docs alongside them. When adding new JS modules, place them under a `scripts/` folder and import them via `<script type="module">` tags to keep the root uncluttered.

## Build, Test, and Development Commands
- `open index.html` — quickest path for manual exploration on macOS.
- `python3 -m http.server 5173` — launches a local server; visit `http://localhost:5173` to avoid CORS pitfalls when loading assets.
- `npx eslint game.js` — run linting once dependencies are installed (`npm i eslint`).

## Coding Style & Naming Conventions
Stick to modern ES modules, `const`/`let`, and 4-space indentation identical to `game.js`. Use `camelCase` for variables/functions, `PascalCase` for classes, and kebab-case for CSS class names. Keep UI text and comments bilingual when expanding existing Chinese notes. Run `eslint --fix` before opening a PR if configuration is present; otherwise justify style decisions in the PR description.

## Testing Guidelines
There is no automated test harness yet, so pair code changes with reproducible manual steps. Validate color selection, move legality, capture resolution, and stalemate prevention in both players’ turns. If you add automated coverage, place specs in `tests/` using Vitest or Jest and document the new command in this guide. Include console screenshots whenever you fix bugs or adjust rules.

## Commit & Pull Request Guidelines
Write descriptive, imperative commit messages (e.g., `Add stalemate repetition safeguard`). Squash trivial checkpoints locally. For pull requests, provide: a succinct summary, linked issue or context, before/after visuals for UI tweaks, and testing notes (manual and automated). Highlight any new commands or assets so reviewers can reproduce your setup quickly.

## 工作进度节点（存档）— WebSocket 两人对战功能核对

时间：2025-09-19（本地）

目标：核对“WebSocket 在线两人对战”各功能是否按《websocket-online-battle-plan.md》完成，实现差距与后续行动项沉淀。

计划状态（供续作接力）：
- [已完成] 盘点仓库与核心文件
- [进行中] 提炼文档功能清单
- [待办] 检索与阅读代码实现（细化映射每个事件 → 代码位置）
- [待办] 逐项对照与标注状态（已实现/部分/缺失）
- [待办] 输出差距与补全建议（含最小改造路径）

阶段结论（当前快照）：
- 后端已具备 Socket.IO 服务与核心事件流：`server/index.js`, `server/events.js`, `server/room-directory.js`, `server/room-event-log.js`, `server/game-state-store.js`。
- 共享对局引擎齐备：`shared/game-engine.js`（开局翻棋定色、走子/吃子、重复走子判负、局面快照）。
- 前端在线模块齐备：`scripts/online/socket-client.js`, `scripts/online/online-panel.js`, `scripts/online/board-renderer.js`，并通过 `index.html` 引入。
- 基础测试存在：`tests/game-engine.test.js`, `tests/room-event-log.test.js`, `tests/server-rematch.test.js`（node --test）。

初步发现与风险：
- 端口不一致：前端默认 `scripts/online/online-panel.js` 使用 `3001`，服务端缺省 `server/index.js` 为 `3000`，`pm2.config.cjs` 也为 `3000`。需统一（或在 `index.html` 设置 `window.SOCKET_URL`）。
- 断线重连仅部分完成：
  - 服务器在 `connect` 时仅发 `server:heartbeat`；客户端未在重连后自动 `room:join` 与 `game:sync-request`，且未重新 `socket.join(roomId)`（服务器端广播 `game:update` 使用 `io.to(roomId)`）。
  - 客户端虽会接收大厅级别的 `room:update`（服务器有 `io.emit`），但若未重新加入房间，将收不到 `game:*` 房间内广播。
- 事件契约缺口：
  - 文档列出的 `game:resign` 未在 `server/events.js` 与前端实现。
  - 文档的 `client:heartbeat`（RTT/延迟监控）未实现；仅有服务端心跳。
  - “基于版本号的防作弊校验与操作节流”未落地（目前通过事件序号 `sequence` 与快照回放提供同步能力）。
- 持久化：`RoomEventLog` 为内存实现，未按文档持久化（MVP 可接受，需标记为后续项）。
- 输入与安全：暂无房名敏感词过滤、频率限制、黑名单等（文档建议作为后续安全加固）。

下一步建议（续作优先级）：
1) 统一端口：将 `scripts/online/online-panel.js` 默认端口与 `server/index.js`/`pm2.config.cjs` 对齐；或在 `index.html`/部署层统一注入 `window.SOCKET_URL`。
2) 自动重连与同步：客户端在 `connect` 或 `reconnect` 后，若持有 `currentRoomId` 与 `sessionToken`，自动发送 `room:join` → 成功后立即 `game:sync-request`（附 `lastSequence`）。
3) 增加 `game:resign`：服务器校验操作者归属并触发 `game:over`，前端在 UI 中提供“认输”入口。
4) 心跳与延迟：实现 `client:heartbeat` 与 RTT 计算，UI 提示弱网/重连中。
5) 基线校验：按版本号/序号进行简单的并发冲突检测与节流（重复/过期操作拒绝）。
6) 日志持久化（可选）：为 `RoomEventLog` 增加文件/SQLite 落地，便于断线重放与赛后仲裁。

复现/验证（本地）：
- 启动服务：`npm run dev:server`（默认端口 `3000`）。
- 打开页面：直接打开 `index.html` 或 `python3 -m http.server 5173` 后访问 `http://localhost:5173`。
- 连接在线：必要时在控制台设置 `window.SOCKET_URL = 'http://localhost:3000'`，再点击“连接服务器”。
- 运行测试：`npm test`（基于 `node --test`）。

相关文件（参考）：
- 前端：`index.html`, `scripts/online/bootstrap.js`, `scripts/online/online-panel.js`, `scripts/online/socket-client.js`, `scripts/online/board-renderer.js`, `scripts/vendor/socket.io.esm.min.js`
- 后端：`server/index.js`, `server/events.js`, `server/room-directory.js`, `server/room-event-log.js`, `server/game-state-store.js`
- 规则与计划：`websocket-online-battle-plan.md`, `两人对战实现方案.md`, `game-rules.md`
- 测试：`tests/*.js`

备注：本节点仅保存现状与差距，未执行新的代码变更或测试运行，便于下次从“端口统一 & 自动重连”切入继续。
