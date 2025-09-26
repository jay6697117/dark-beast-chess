# Dark Beast Chess WebSocket 在线对战实施方案

## 1. 背景与目标
Dark Beast Chess 目前仅支持本地单机游玩。为了拓展使用场景和提升活跃度，需要引入“远程实时对战”能力，同时不破坏现有离线体验。

**成功指标**
- 一次房间创建 + 加入流程可在 5 秒内完成，将两名玩家带入对局。
- 在弱网（120ms RTT）下，棋步广播延迟控制在 200ms 内。
- 客户端断线后 60 秒内恢复连接，游戏状态完全同步。
- 服务端可对全部客户端操作进行合法性校验，避免状态分叉。

## 2. MVP 范围
**必做**
- 房间大厅 + 自建房间：任何玩家可新建房间并成为房主，离开房间后立即解散。
- 单局在线对战，支持翻棋、走棋、吃子、认输。
- 断线重连与状态同步。
- 基于版本号的防作弊校验与操作节流。

**暂不纳入**
- 观战、好友房、聊天、排行榜。
- 多实例部署、Redis 扩展（后续版本接入）。
- 完整账号体系（使用临时昵称 + sessionToken 方案）。

## 3. 系统架构
### 3.1 组件拓扑
```
Browser (vanilla JS)
   │  Socket.IO (WebSocket transport)
   ▼
Node.js Server (Express + Socket.IO)
   │  调用
   ▼
Game Engine (shared rules) ── 内存房间存储
```

### 3.2 核心模块职责
| 模块 | 位置 | 主要职责 |
|------|------|----------|
| `OnlineMatchClient` | 前端 | 管理 Socket 连接、发送指令、接收广播、触发 UI 更新。 |
| `OnlineBattlePanel` | 前端 | 提供在线模式入口、房间列表与状态提示、对手信息、网络告警、再战 CTA。 |
| `RemoteBoardRenderer` | 前端 | 根据服务器快照渲染棋盘、处理点击交互、计算前端高亮。 |
| `DarkBeastChess` (online mode) | 前端 | 以只读方式渲染棋盘，动作委托给服务端返回的事件。 |
| `server/index.js` | 后端 | 启动 HTTP/WS 服务、挂载路由、加载事件处理器。 |
| `RoomDirectory` | 后端 | 维护当前开放房间列表、生成房间 ID、处理房间解散。 |
| `GameRoom` | 后端 | 保存棋盘状态、历史、玩家连接、计时器、版本号。 |
| `RoomEventLog` | 后端 | 按事件顺序持久化 `room_created`/`game_started`/`room_restart` 等记录，并提供增量重放。 |
| `shared/game-engine.js` | 共享 | 初始化棋盘、判定合法性、结算胜负。 |
| `server/events.js` | 后端 | Socket.IO 事件注册、参数校验、调用 GameRoom/Engine 并广播结果（含 `room:rematch`→`game:reset`、`game:flip/move/sync` 流程）。 |

### 3.3 状态与数据
- 棋盘状态：4×4 数组，每格包含 `type`, `color`, `revealed`, `id`，未翻棋子仅下发 `id` + `revealed:false`。
- 房间元信息：`roomId`, `roomName`, `ownerToken`, `players[{socketId, sessionToken, side, nickname}]`, `status`（`waiting`/`ready`/`playing`/`finished`/`dissolved`）, `turn`, `version`, `createdAt`。
- 历史记录：按操作生成条目 `{version, actor, action, payload, serverTime}`，用于回放和审计；关键回合（首翻棋、吃子、认输、超时）会额外产生 `game_snapshot`，存储完整局面以便快速纠偏。
- 房间事件日志：`RoomEventLog` 将关键状态变更（创建、加入、准备、开局、认输、再开局、解散）以 append-only 方式写入持久化存储（SQLite/文件），支持断线重放和赛后追溯。

## 4. WebSocket 事件契约
### 4.1 Client → Server
| 事件 | 载荷 | 校验要点 |
|------|------|-----------|
| `room:create` | `{ nickname?, roomName, sessionToken? }` | 限制房名长度，sessionToken 存在则复用并标记为房主。 |
| `room:join` | `{ roomId, nickname?, sessionToken? }` | 校验房间存在且状态为等待中，座位未满。 |
| `room:leave` | `{ roomId, sessionToken }` | 校验操作者是否房主；房主离开时触发房间解散。 |
| `room:list` | `{ cursor?, sessionToken? }` | 支持分页拉取大厅房间信息，允许未登录用户读取。 |
| `room:ready` | `{ roomId, sessionToken, ready }` | 标记玩家准备状态：首个 ready 令房间状态切到 `ready`，全部 ready 后触发开局。 |
| `room:rematch` | `{ roomId, sessionToken }` | 房主或双方确认后发起下一局，重置房间状态为 `waiting` 并清空棋盘。 |
| `game:flip` | `{ roomId, cell, version }` | 验证轮次与 cell 合法性。 |
| `game:move` | `{ roomId, from, to, version }` | 校验路径、吃子规则、移动合法性。 |
| `game:resign` | `{ roomId }` | 标记玩家认输。 |
| `game:sync-request` | `{ roomId, sessionToken, lastVersion }` | 断线后获取最新状态。 |
| `client:heartbeat` | `{ roomId, ts }` | 可选，自定义延迟监控。 |

### 4.2 Server → Client
| 事件 | 载荷 | 说明 |
|------|------|------|
| `room:created` | `{ roomId, roomName, sessionToken, side }` | 确认房间创建成功，房主默认占据席位 A。 |
| `room:update` | `{ roomId, roomName, ownerToken, players, status }` | 房间元信息变更广播（状态取值 `waiting/ready/playing/finished/dissolved`，含玩家准备标记与大厅列表的增量更新）。 |
| `room:list` | `{ rooms, cursor? }` | 大厅初次/分页拉取结果，包含房号与昵称。 |
| `room:dissolved` | `{ roomId, reason }` | 房主离开或服务器清理时通知所有订阅者。 |
| `game:reset` | `{ roomId, version, seed }` | 再开局前的清场事件，通知客户端重置棋盘并重新进入待准备状态。 |
| `game:init` | `{ roomId, boardState, turn, firstPlayer, version, seed }` | 首次广播，包含棋盘随机种子。 |
| `game:update` | `{ version, turn, boardDelta, move?, flip?, capture?, historyEntry }` | 增量更新，若客户端落后使用 `game:sync`。 |
| `game:sync` | `{ state, version, turn, history }` | 全量同步，供重连和纠偏。 |
| `game:over` | `{ winner, reason, finalState, history }` | 结束通知（认输、无子可动、超时等）。 |
| `server:error` | `{ code, message, recoverable }` | 非法请求或内部错误统一返回。 |
| `server:heartbeat` | `{ ts, roomId }` | 服务端心跳，用于 UI 状态提示。 |

> 所有事件统一携带 `serverTime`，客户端据此更新延迟与消息顺序。`boardDelta` 采用 `{cells: [{row, col, piece|null}]}` 形式，减少重传。

### 4.3 错误码约定
- `E_ROOM_NOT_FOUND`, `E_NOT_YOUR_TURN`, `E_INVALID_MOVE`, `E_VERSION_SKEW`, `E_RATE_LIMITED`, `E_SERVER_INTERNAL` 等。客户端根据 `recoverable` 决定重试或弹窗。

## 5. 核心业务流程
### 5.1 房间大厅与建局
1. 任意玩家在大厅点击“创建房间” → 发送 `room:create`，并立即加入房间成为房主（默认 `seatA`）。
2. 服务端写入 `RoomDirectory`，生成 `roomId` 与 `seed`，初始化 `GameRoom` 为 `waiting` 状态，同时在 `RoomEventLog` 记一条 `room_created` + `player_joined` 事件，再向房主返回 `room:created` 并推送大厅 `room:update`（`status=waiting`）。
3. 未加入任何房间的玩家订阅 `room:list`/`room:update` 事件，在大厅实时显示房号、房间昵称、当前人数与房间状态。
4. 第二位玩家选择房间 → 发送 `room:join`，校验通过后服务端把其分配为 `seatB`，记录 `player_joined` 事件并同步 `room:update`（仍为 `status=waiting`，但两侧 seat 已占满）。
5. 双方点击“准备开始”或房主直接开局 → 客户端上报 `room:ready`，服务端写入 `room_ready` 事件并更新玩家 `ready` 标记；首个 ready 触发 `room:update`（`status=ready`），当两侧均 ready 即将状态切换为 `playing`，再次推送 `room:update`（`status=playing`），随后广播 `game:init`（含棋盘初始状态、随机种子、双方阵营）并追加 `game_started` 事件，后续走子流程与原方案一致。
6. 对局结束触发 `game:over` 时附带 `game_finished` 事件并将房间状态置为 `finished`，保留双方座位与战绩面板；任意一方在 UI 内点击“再来一局” → 发送 `room:rematch`，服务端记录 `room_restart` 事件，推送 `game:reset` + `room:update`（状态回到 `waiting`，清空棋盘与 ready 标记），随后双方按步骤 5 重新准备；若房主选择“离开房间”或关闭页面，则触发 `room:leave`，服务端追加 `room_dissolved` 事件并将状态标记为 `dissolved`，广播 `room:dissolved` 并在 TTL 到期后清理 `GameRoom`。

### 5.2 回合与同步
1. 玩家操作改为只发送意图（flip/move）。
2. 服务端校验版本号、轮次、合法性；
3. 更新 `GameRoom` 状态，推送 `game:update`（包含增量数据、下一个玩家、历史记录）。
4. 客户端收到后调用 `applyRemoteEvent` 更新棋盘和 UI。

### 5.3 断线重连
1. Socket 断开即标记玩家离线并启动 60 秒倒计时，同时记录 `player_disconnected` 事件，房间状态保持 `playing`。
2. 倒计时内若 `sessionToken` 重新连接并发送 `game:sync-request`，即恢复身份；服务端写入 `player_reconnected` 事件并刷新该玩家的 `lastSeen`。
3. 服务端返回 `game:sync`，附带自上次确认版本后的事件日志增量（`RoomEventLog.replay`），客户端调用 `applyRemoteState` 并校验版本；
4. 若日志缺口过大或状态校验失败，则回退到最近一次 `game_snapshot`（每回合买入或关键节点落盘到磁盘），确保局面一致；
5. 倒计时结束仍未归位 → 判负并触发 `game:over`，追加 `player_forfeited` 与 `game_finished` 事件。

### 5.4 认输与结算
- 玩家触发“认输” → `game:resign`，或在棋局结束判负时由服务器写入 `game_finished` 事件。
- 服务端记录胜负、更新双方战绩面板，将房间状态置为 `finished` 并广播结算信息（包含比分、历史记录片段、可选复盘链接）。
- 房间保持开放，双方仍占据原座位，UI 展示“再来一局”入口；当任意一方发送 `room:rematch` 时，服务端写入 `room_restart` 事件并下发 `game:reset` + `room:update`，房间状态回到 `waiting`，ready 标记与棋盘清零。
- 若房主选择退出或双方离场，才通过 `room:leave` / `room:dissolved` 清理房间资源。

### 5.5 再战实现细节
1. **后端事件链**
   - `server/events.js` 新增 `socket.on("room:rematch")`：
     1. 校验调用者仍在房间且房间状态为 `finished`；
     2. 记录 `room_restart` 至 `RoomEventLog`，并将 `GameRoom` 状态切回 `waiting`，重置棋钟/回合数/翻子记录；
     3. 生成新 `seed` 与 `version`，通过 `io.to(roomId)` 先发 `game:reset`（清空客户端棋盘），再发 `room:update`（status=`waiting`，ready 标记清零），最后等待双方重新 `room:ready`；
     4. 将再战请求写入 `metrics/rematch_count` 供监控使用。
   - `RoomEventLog` 扩展 `appendRoomRestart(roomId, payload)` 与 `replaySince(version)`，确保断线重连时可获得 `game:reset` 之前的结算与之后的清场事件。

2. **前端交互**
   - `OnlineBattlePanel` 增加“再来一局”按钮：
     - 仅在收到 `game:over` 后渲染，并根据房主身份决定按钮文案（房主“发起再战”，对手“请求再战”）。
     - 点击后发送 `room:rematch`，并在按钮上显示 loading 状态，直至收到 `game:reset`。
   - `OnlineMatchClient` 新增 `socket.on("game:reset")`，执行：
     - 调用 `DarkBeastChess.resetBoard(seed)` 重置棋盘并等待 `game:init`；
     - 清空本地历史列表，重置版本号缓存，展示“等待双方准备”提示。
   - UI 需在 `room:update` 状态回到 `waiting` 时恢复 ready 开关，自动取消 ready，以防上一局状态残留。

3. **数据持久化与回放**
   - `RoomEventLog` 中每条 `room_restart` 记录包含 `{restartId, newSeed, triggeredBy, serverTime}`，与随后生成的 `game:init` 通过 `restartId` 关联，方便赛后统计连续对局。
   - 每次 `game:reset` 后立即创建新的 `game_snapshot`（空棋盘 + turn=undefined），保证断线重连可直接恢复至准备阶段。

4. **安全/速率控制**
   - 对同一房间的 `room:rematch` 调用设置 3 秒冷却，避免用户狂点；
   - 若对手拒绝再战，可在 UI 中提供“离开房间”或继续观战提示，服务端不强制开启下一局。

## 6. 安全与防作弊
- 服务器为权威状态源，客户端仅可提交意图。
- 所有请求需包含上一版本号，版本不连续则拒绝并下发 `game:sync`。
- 通过节流器限制无效请求频率（如 3 秒内 >5 次非法请求即封禁本局）。
- 对未翻棋子仅发送占位符 ID，防止窥探。
- 记录操作审计日志，可导出复盘。

## 7. 实施路线与排期（6 天）
| 天数 | 任务 | 交付物 |
|------|------|--------|
| Day 1 | 重构 `DarkBeastChess` 规则到 `shared/game-engine.js`，引入 `GameMode`。 | 共享规则模块、单机功能回归。 |
| Day 2 | 搭建后端骨架：`server/index.js`、房间目录、房间模型。 | 可启动的 Socket.IO 服务。 |
| Day 3 | 实现事件处理（flip/move/resign/sync），增加版本控制和审计日志。 | 通过本地 Socket 客户端的集成测试。 |
| Day 4-5 | 前端联调：`OnlineMatchClient`、UI 面板、事件订阅、错误提示。 | 浏览器双开实测可对战。 |
| Day 6 | 断线重连、节流、测试与文档。 | 重连通过、README-online.md、测试报告。 |

> 并行建议：Day 3 起即可安排一人专注前端 UI，另一人完善后端事件，缩短整体周期。

## 8. 测试策略
- **单元测试**：`shared/game-engine.test.js`（规则）、`server/game-room.test.js`（房间状态）、`room-directory.test.js`（房间生命周期）、`room-event-log.test.js`（日志 append / replay / restart 行为）。
- **集成测试**：使用 `jest` + `socket.io-client` 模拟一名玩家创建房间、另一名玩家加入后走棋、认输、触发 `room:rematch` 并确认 `game:reset` → 新一局 `game:init` 链路；覆盖断线重连后继续再战。
- **端到端**：Playwright 脚本打开两个浏览器实例与本地服务交互，验证 UI 与连接稳定性。
- **手动验收**：房主创建房间成功、第二玩家可见并加入、棋步同步、非法走棋提示、断线 60 秒内恢复、认输流程、心跳提示、再来一局流程（按钮→重置→重新 ready）。
- **运行指令**：`npm test`（Node 原生 `node --test`）、`npm run lint`（ESLint 9 + 扩展配置）。

## 9. 部署与运维
- **开发环境脚本**：
  - `npm run dev:server`：启动 `server/index.js`（默认 3000 端口）。
  - `npm run dev:client`：使用 `live-server`/Vite 代理静态页并配置 `SOCKET_URL`。
- **生产部署**：
  - Node 服务部署至云主机或支持 WebSocket 的 Serverless 平台，使用 PM2/容器保持高可用。
  - Nginx/Caddy 反向代理，开启 HTTPS 与 WebSocket 升级，设定超时 90s。
  - 监控指标：房间进入成功率、消息延迟、并发房间数、断线重连次数、错误码分布、再战转化率（`rematch_count / game_finished`）。
- **日志与告警**：集中输出到 `logs/rooms.log`，结合 Loki/ELK；连续 3 次 `E_SERVER_INTERNAL` 触发告警。
- **配置与发布**：提供 `.env.example`（`PORT`、`CLIENT_ORIGIN` 等变量）与 `pm2.config.cjs`，运行 `pm2 start pm2.config.cjs` 即可后台常驻。

## 10. 风险与对策
| 风险 | 描述 | 应对措施 |
|------|------|-----------|
| 规则双写导致不一致 | 前后端规则分叉引起状态不同步 | 统一使用 `shared/game-engine` 并在 CI 中跑双侧测试。 |
| 网络抖动影响体验 | 用户端延迟 / 丢包造成错位 | 实施心跳 + 断线重连 + 明确的状态提示。 |
| 内存房间扩展性不足 | 并发大时单机性能瓶颈 | 预留 `Socket.IO adapter` 接口，后续切换 Redis 集群。 |
| 未授权指令/滥用 | 频繁非法请求或伪造房间号 | 校验 sessionToken、启用节流、非法记录加入黑名单。 |

## 11. 后续迭代方向
1. 自定义房间号、好友邀请、观战模式。
2. 排行榜 / Elo 匹配、赛季统计。
3. 聊天、快捷消息、表情包。
4. 移动端触控优化、PWA 支持、一键分享棋谱。
5. 多节点部署 + Redis 适配，实现水平扩展。
6. AI 观战分析、复盘自动点评。

## 12. 行业最佳实践调研
### 12.1 标杆平台速览
- **Lichess / Chess.com**：基于 WebSocket 的长连接配合服务器权威状态机，使用 FEN/PGN 广播棋局，同时维护观战与复盘服务。关键特性包括：房主创建私人房间、对局日志持久化、断线自动托管、棋钟完全由服务器驱动。
- **Board Game Arena**：提供“公共大厅 + 自定义桌子”的大厅模型，桌主可配置人数与规则。服务端通过 `table -> seat -> session` 三层结构管理入座与离桌，并利用增量事件流实现低延迟同步；对慢玩家提供托管与计时惩罚。
- **PokerStars / Zynga Poker**：强调公平性与防作弊，采用服务器洗牌、加密随机源以及“commit-reveal”确认牌序。面对高并发时组合 Redis/ Kafka 进行跨实例广播，同时提供断线托管与快速重连机制。
- **腾讯棋牌 / 网易棋牌**：通用模式为“随机匹配 + 房间码邀请”双入口，配合战绩存档与赛季段位体系。实时检测网络质量并在 UI 上同步提示，避免玩家误以为是规则 bug。

### 12.2 通用架构要素
- **房间生命周期管理**：行业方案都会把房间状态拆分为 `waiting / ready / playing / finished / dissolved`，并结合房主权限控制解散与踢人；离开房间即触发回收，空房间会在短 TTL 后自动清理。
- **会话与身份**：持久化的 `sessionToken` 配合 `playerId`，支持跨设备/掉线重连；关键操作（加入房间、准备、走棋）均要求 session 校验与签名验证。
- **事件与存档**：采用“版本号 + 事件日志”双轨制，既支持实时广播也方便回放与仲裁。日志通常落地数据库或对象存储，为赛后审核提供依据。
- **扩展与容错**：高并发平台普遍引入 Redis/MQ 作为房间目录缓存和事件广播总线；同时配备健康检查、自动重启与灰度发布机制，保证断线恢复时的幂等性。
- **可观测性**：核心指标包含房间转化率、平均匹配时长、消息往返延迟、掉线率、重连成功率，业界会搭配 Prometheus + Grafana 或商业 APM 做 24/7 监控。

### 12.3 运营与安全策略
- **公平校验**：服务器主动校验所有指令合法性，对异常频率的走子或超时行为进行节流；高等级房间会启用反作弊引擎分析鼠标轨迹、APM 等特征。
- **房间治理**：提供房主解散、踢人、锁定座位等功能，避免陌生人干扰；长时间挂机会触发托管或直接判负。
- **内容与社区**：多数平台内置举报与聊天过滤，并根据房间类型启用不同的礼仪提示；战绩榜单与积分机制提升复玩率。
- **商业与留存**：常见策略是赛季制、每日任务、观战分享入口以及移动端推送，保障玩家活跃。

### 12.4 对 Dark Beast Chess 的启示
- 当前方案已具备“房主创建房间、大厅展示、断线重连”的骨架（参见 5.1 与 5.3），与标杆平台的核心流程相符，属于可上线的 MVP。后续可优先完善：
  - **房间状态机细化**：补充 `ready` / `finished` 状态，以及空房间 TTL 清理，避免大厅出现僵尸房。
  - **事件日志持久化**：在 `room:created`、`game:update` 等事件基础上拓展审计日志落地，便于复盘与仲裁。
  - **网络与心跳策略**：结合服务端心跳与客户端 RTT 监控，为 UI 提供更清晰的“弱网”“重连中”提示，减少误报。
  - **安全硬化**：增加 `room:join` 频率限制、黑名单、房名敏感词过滤；对房主离线的对局，提供托管或自动认输策略。
  - **扩展预留**：在 `RoomDirectory` 之上抽象接口，以便未来切换至 Redis adapter 或消息队列分布式部署，同时保留观战只读订阅能力。
- 在文档层面建议补充“观战与复盘”作为远期规划，确保当前事件流设计能够支持旁观模式的复用。

## 13. 开发计划（再战功能落地）
| 阶段 | 目标 | 具体任务 | 产出 |
|------|------|----------|------|
| Phase 0 环境准备 | 建立可运行的后端/前端开发环境 | 1. 初始化 `package.json`，安装 `express`、`socket.io`、`uuid` 等依赖；2. 建立 `server/`、`shared/`、`scripts/` 基础目录；3. 配置 `npm run dev:server` 与 `npm run lint` 等脚本。 | 可启动的基础服务骨架，开发依赖就绪 |
| Phase 1 服务端实现 | 支撑房间生命周期与再战事件链 | 1. 编写 `server/index.js`（WebSocket + REST 健康检查）；2. 实现 `RoomDirectory`、`GameRoom`、`RoomEventLog` 模块；3. 在 `server/events.js` 中落地 `room:create/join/ready/rematch` 与 `game:reset` 广播；4. 补充持久化存储（内存 + JSON 文件 fallback）。 | 具备完整事件处理的服务端，可在本地联调 |
| Phase 2 前端改造 | 接入在线对战与再战 UI | 1. 拆分 `game.js` 在线模式逻辑到 `scripts/online/`；2. 实现 `OnlineMatchClient`、`OnlineBattlePanel`，包括房间列表、准备/再战按钮、状态提示；3. 处理 `game:reset`/`room:update` 事件，确保 UI 状态同步；4. 引入基础样式与本地化文案。 | 前端可通过真实服务端完成对战与再战流程 |
| Phase 3 测试与验收 | 验证功能与稳定性 | 1. 编写 `room-event-log.test.js`、`server/events.rematch.test.js`；2. 使用 `socket.io-client` 模拟再战流程的集成测试；3. Playwright 端到端场景覆盖“创建房间→再战”；4. 更新 README/文档与录屏说明。 | 通过自动化与手动验收，补充测试与文档 |
| Phase 4 发布准备 | 支持部署与监控 | 1. 整理 `.env.example`、pm2/Node 运行脚本；2. 增加监控指标上报（`rematch_count`等）；3. 输出发布检查清单与回滚策略；4. 准备 QA 回归列表。 | 可上线的发布包与运维说明 |

> 执行顺序遵循 Phase 0 → Phase 4，若出现阻塞需及时回填文档并调整计划。后续工作按阶段拆解为 PR/任务单，每个阶段完成后在文档中记录验收结果。

### 13.1 执行记录
- ✅ Phase 0 环境准备：完成依赖安装（`express`、`socket.io`、`uuid`、`nodemon`、`eslint`）、脚本配置（`dev:server`/`lint`）与目录骨架搭建（`server/`、`shared/`、`scripts/online/`）。
- ✅ Phase 1 服务端实现：落地 `server/index.js`、`room-directory.js`、`room-event-log.js`、`events.js`、`shared/game-engine.js`、`game-state-store.js`，完成房间/再战逻辑、`game:flip`/`game:move`/`game:sync`/`game:reset` 等事件。
- ✅ Phase 2 前端改造：新增 `scripts/online/` 模块体系（`socket-client`、`online-panel`、`board-renderer`、`bootstrap`），改造 UI 与样式，统一复用棋盘 DOM，支持准备/再战流程。
- ✅ Phase 3 测试与验收：补充 `node --test` 单测（`game-engine`、`room-event-log`）与 Socket 集成测试（`server-rematch.test.js`），通过 `npm test` 与 `npm run lint` 校验。
- ✅ Phase 4 发布准备：补充 `.env.example`、`pm2.config.cjs`，在文档中记录部署命令与监控指标，留存回滚与运维信息。
