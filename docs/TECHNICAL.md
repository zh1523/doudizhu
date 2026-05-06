# 斗地主技术设计文档

## 1. 游戏流程

```
┌──────────────────────────────────────────────────────────────────┐
│ 玩家进入                                                         │
│   │                                                              │
│   ▼                                                              │
│ 大厅 (LobbyPage)                                                 │
│   │  → 创建房间弹窗 → 确认信息卡 → 点"进入"                       │
│   ▼                                                              │
│ GamePage 准备阶段 ┄ 牌桌背景 + 玩家位 + 准备按钮                   │
│   │  → AI: 玩家准备 → 立即开局                                    │
│   │  → PvP: 3人满+全部准备 → 开局                                 │
│   ▼                                                              │
│ GamePage 发牌阶段 ┄ 51张牌渐进发牌，0.84秒                        │
│   ▼                                                              │
│ GamePage 叫地主 ┄ 轮流叫分(0/1/2/3)，最高叫分者成为地主            │
│   │  → 全员不叫 → 重新发牌                                         │
│   ▼                                                              │
│ GamePage 出牌 ┄ 地主先出，逆时针轮流接牌                           │
│   │  → 连续2人不出 → 新一轮                                        │
│   │  → 手牌清空 → 游戏结束                                         │
│   ▼                                                              │
│ 游戏结束 ┄ 顶部浮动提示 + 房间回到准备状态                          │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 客户端技术实现细节

### 2.1 页面路由 (OnlineApp.tsx)

单一条件渲染，无路由库：

```typescript
if (socket && currentRoom) return <GamePage />  // 游戏中/准备中
return <LobbyPage />                             // 大厅
```

`GamePage` 内部再判断：`!gameState` → 准备阶段；有 `gameState` → 发牌/叫地主/出牌。

### 2.2 网络状态 (networkStore.ts)

Zustand 单 store 管理所有联机状态。

**核心数据流**：

```
Socket.io 事件 → store.set() → React 重渲染 → GamePage 切换状态
```

**关键事件处理**：

| 事件 | store 操作 | UI 效果 |
|------|-----------|---------|
| `lobby:rooms` | `set({ rooms })` | 大厅房间列表刷新 |
| `room:joined` | `set({ currentRoom })` | 进入 GamePage |
| `room:update` | `set({ currentRoom })` + 清 gameState（若 waiting） | 准备状态更新/回等待 |
| `game:state` | `set({ gameState })` | 发牌/叫地主/出牌画面 |
| `game:over` | `set({ gameOver, gameState: null })` | 游戏结束提示 |

**断线处理**：

```
客户端 beforeunload → socket.disconnect() → 服务端立即感知
服务端 pingTimeout(10s) → disconnect 事件 → handleDisconnect
```

### 2.3 牌桌布局 (GamePage.tsx)

复用 `App.tsx` 单机版的完整布局，CSS Grid 三栏结构：

```
┌──────────────────────────────────────────┐
│  Header: 品牌 + 房间号 + 底牌/操作        │
├────────────┬─────────────┬───────────────┤
│ 左对手      │   中心区域    │  右对手       │
│ PlayerBadge │  发牌进度条  │  PlayerBadge  │
│ 手牌(盖)    │  叫地主面板  │  手牌(盖)     │
│ 出牌区      │  出牌信息    │  出牌区       │
├────────────┴─────────────┴───────────────┤
│  Dock: 自己出牌区 + 操作按钮 + 手牌(亮)    │
└──────────────────────────────────────────┘
```

**视角旋转 (rotateForViewer)**：服务端给每个玩家发送旋转后的 `GameState`，玩家的原始座位映射到旋转后的座位 0（自己永远在下方）：

```
服务端: rotateForViewer(state, player.seat)
  state.players[rot]       → rotated[0]  (自己)
  state.players[(rot+1)%3] → rotated[1]  (左对手)
  state.players[(rot+2)%3] → rotated[2]  (右对手)
```

客户端用 `rotatedRoomPlayers` 数组反推玩家名：
```typescript
const mySeat = currentRoom.players.find(p => p.id === playerId)?.seat ?? 0
const rotatedRoomPlayers = [
  currentRoom.players.find(p => p.seat === (mySeat + 0) % 3),  // 我
  currentRoom.players.find(p => p.seat === (mySeat + 1) % 3),  // 左
  currentRoom.players.find(p => p.seat === (mySeat + 2) % 3),  // 右
]
```

### 2.4 纸牌渲染 (CardView)

- 正面：白底 + suit 颜色（♠♣ 黑，♥♦ 红）+ rank 字符
- 背面：蓝底 + 金色星徽
- 大小王：角标 ♛（大王 BJ）/ ♚（小王 SJ）
- 选中态：金色边框 + 上移 + 发光阴影
- `width` prop 控制大小，高度 = width × 1.46

### 2.5 手牌布局 (PlayerHand)

- `layout="self"`：水平扇形，根据可用宽度动态计算牌间距
- `layout="side"`：竖直堆叠，面向左或右
- `countOverride` 控制可见牌数（发牌动画用）
- 使用 `framer-motion` 的 `motion.div` 做牌移动画

### 2.6 叫地主面板 (BiddingPanel)

- `highestBid` 决定可选分数（只能叫更高分）
- "不叫" = score 0
- 未轮到自己时显示等待状态（呼吸点 + "XXX 正在考虑"）

### 2.7 出牌操作 (GameControls)

- **出牌**：`selectedIds.size > 0` 才可点，发送 `game:play`
- **不出**：仅当有上家出牌时可用，发送 `game:pass`
- **提示**：调用 `findHintPlay()` 选中推荐牌，再点取消选中

### 2.8 动画系统

| 动画 | 实现 | 时机 |
|------|------|------|
| 发牌进度条 | `motion.div animate={{ width }}` | dealing 阶段 |
| 底牌揭示 | `showBottomReveal` state + `is-revealed` 类 | playing 开始时 1.6s |
| 出牌展示 | `PlayedCards` 组件 + `motion.div` 弹簧动画 | 每次出牌 |
| 牌展开 | `AnimatePresence` + `exit` 动画 | 出牌被覆盖/清除 |

### 2.9 手牌提示 (findHintPlay)

**客户端纯本地计算**，不经过服务端。

定向生成（非 2^N 枚举）：
1. 按牌值分组排序
2. 无上家出牌 → 选最小单张
3. 有上家出牌 → 同类型找最小能压的 → 不行找炸弹 → 不行返回 null
4. 每种牌型用 switch 分别处理（single/pair/triple/straight/...），O(N) 复杂度

---

## 3. 数据结构设计

### 3.1 牌 (Card)

```typescript
interface Card {
  suit: 'spade' | 'heart' | 'club' | 'diamond' | 'joker'
  rank: string       // '3'~'10','J','Q','K','A','2','SJ','BJ'
  value: number      // 3~17，用于比较大小
  id: string         // 唯一标识，如 "3_spade", "small_joker"
}
```

牌力排序：3(3) < 4(4) < ... < K(13) < A(14) < 2(15) < 小王(16) < 大王(17)

### 3.2 牌型 (PlayResult)

```typescript
type HandType = 'single' | 'pair' | 'triple' | 'triple_one' | 'triple_two'
  | 'straight' | 'straight_pairs' | 'plane' | 'plane_singles' | 'plane_pairs'
  | 'bomb' | 'rocket'

interface PlayResult {
  type: HandType
  weight: number     // 主牌值（用于比较）
  cards: Card[]      // 组成牌型的所有牌
}
```

### 3.3 游戏状态 (GameState)

```typescript
type Phase = 'idle' | 'dealing' | 'bidding' | 'playing' | 'game_over'

interface GameState {
  phase: Phase
  players: PlayerState[]      // 3个玩家
  bottom: Card[]              // 底牌（3张）
  bidding: BiddingState       // 叫地主状态
  playing: PlayingState       // 出牌状态
  dealing: DealingState       // 发牌状态
  winner: number | null       // 0=地主赢, 1=农民赢
  baseScore: number           // 底分
  multiplier: number          // 最终倍数
}

interface PlayerState {
  id: number          // 0/1/2
  hand: Card[]
  isLandlord: boolean
}

interface BiddingState {
  currentBidder: number       // 当前叫分者
  highestBid: number          // 最高叫分 (0-3)
  highestBidder: number       // 最高叫分者 (-1=无)
  bids: number[]              // 每人叫分 [-1,-1,-1]
  passesSinceRaise: number    // 最近一次加注后连续不叫次数
  turnCount: number           // 总叫分轮数
}

interface PlayingState {
  currentPlayer: number       // 当前出牌者
  lastPlay: PlayResult | null // 上家出牌
  lastPlayPlayer: number      // 上家座位号
  passCount: number           // 连续不出次数
  bombCount: number           // 炸弹总数
  springPlayerLandlord: boolean
  springPlayerFarmer: boolean
}

interface DealingState {
  deck: Card[]                // 牌堆
  bottom: Card[]              // 底牌
  previewHands: Card[][]      // 发牌预览（3人手牌）
  dealtCount: number          // 已发张数 (0-51)
  firstBidder: number         // 首位叫分者（随机）
  visibleCounts: [number, number, number]
}
```

### 3.4 房间与玩家 (Room & Player)

```typescript
// 房间
type RoomMode = 'pvp' | 'ai'
type RoomPhase = 'waiting' | 'playing'

interface Room {
  id: string
  mode: RoomMode
  phase: RoomPhase
  players: Player[]
  gameState: GameState | null
  createdAt: Date
  gameStartTime: Date | null
  _dealTimer?: ReturnType<typeof setInterval> | null
}

// 玩家
interface Player {
  id: string           // UUID（客户端生成，服务端去重）
  socketId: string     // Socket.io 连接 ID（AI 为空）
  name: string         // 显示名
  roomId: string | null
  seat: number         // 0/1/2，-1 表示未入座
  isReady: boolean
  isOnline: boolean
}
```

### 3.5 玩家状态组合派生

5 个有效状态由字段组合确定：

| roomId | isOnline | room.phase | isReady | 状态 |
|--------|----------|------------|---------|------|
| null | true | — | — | lobby (大厅) |
| set | true | waiting | false | unready (待准备) |
| set | true | waiting | true | ready (已准备) |
| set | true | playing | — | playing (游戏中) |
| any | false | any | — | disconnected (已断线) |

---

## 4. 重点业务流程图

### 4.1 房间状态机

```
                createRoom
[不存在] ──────────────────→ waiting ──────────────────────────┐
                               │   ↑                            │
         AI: 玩家准备          │   │  game over                  │
         PvP: 3人全准备        │   │  PvP 有人离开 (剩余>0)       │
                               ↓   │                            │
                             playing ───────────────────────────┘
                               │
         最后一人离开           │
                               ↓
                          [删除房间]
```

### 4.2 服务端游戏调度

```
startRoomGame()
  │
  ├─ createInitialState()
  ├─ startDealing()              phase ← 'dealing'
  ├─ beginGame()                 SQLite INSERT (status='playing')
  ├─ syncRoom()                  Redis HSET
  ├─ broadcastState()            发送 game:state
  │
  ├─ setInterval(50ms) ───┐
  │   ├─ dealOneCard() ×3 │     渐进发牌
  │   ├─ broadcastState()  │
  │   └─ dealt >= 51? ──→ clearInterval
  │                       └─ completeDealing()  phase ← 'bidding'
  │                          broadcastState()
  │                          scheduleAITurnIfNeeded()
  │
  ▼ 进入叫地主

handleBid(score)
  ├─ submitBid()                 纯函数，返回新 GameState
  ├─ broadcastState()
  ├─ phase='bidding'? → scheduleAITurnIfNeeded()
  ├─ phase='playing'? → scheduleAITurnIfNeeded()
  └─ phase='dealing'? → completeDealing() (全员不叫重发)

handlePlay(cardIds)
  ├─ playCards()                 纯函数
  ├─ phase='game_over'? → onGameOver()
  └─ else → broadcastState() + scheduleAITurnIfNeeded()

handlePass()
  ├─ pass()                      纯函数
  ├─ broadcastState()
  └─ scheduleAITurnIfNeeded()

onGameOver(winner)
  ├─ recordGame()                SQLite UPDATE (status='finished')
  ├─ emit game:over              发送给每个玩家
  ├─ room.phase ← 'waiting'      重置房间
  ├─ room.gameState ← null
  └─ emit room:update
```

### 4.3 AI 调度与决策

```
scheduleAITurnIfNeeded(room)
  │
  ├─ room.mode !== 'ai'? ──→ return
  │
  ├─ phase='bidding'?
  │   ├─ currentBidder === 0? → return (人类回合)
  │   └─ setTimeout(800-1500ms) → runAIBid()
  │       └─ aiDecideBidV2() → submitBid() → broadcast → scheduleAI
  │
  └─ phase='playing'?
      ├─ currentPlayer === 0? → return (人类回合)
      └─ setTimeout(1000-1500ms) → runAIPlay()
          └─ aiDecideCardsV2() → playCards/pass → broadcast → scheduleAI
```

### 4.4 AI V2 手牌分解流程

```
decompose(hand)
  │
  ├─ 1. 提取炸弹 (4张同值)
  ├─ 2. 提取火箭 (大小王)
  ├─ 3. 提取飞机 (连续三条 ≥2组)
  │     └─ 优先 pair kicker > single kicker > 无 kicker
  ├─ 4. 提取连对 (连续对子 ≥3组)
  ├─ 5. 提取顺子 (连续单牌 ≥5张)
  ├─ 6. 提取三带 (剩余三条 + kicker)
  ├─ 7. 提取对子
  └─ 8. 剩余单牌

selectOpeningPlay(decomposed)
  └─ 从拆牌结果中选最小权重的非炸弹牌型

selectBeatingPlay(decomposed, lastPlay)
  ├─ 同类型中找最小权重大于上家的牌
  ├─ 不同类型中找能压的牌
  ├─ 找炸弹
  └─ 都不行 → bruteForceBeat() 回退到 V1 暴力搜索
```

### 4.5 客户端-服务端交互时序 (AI 对局)

```
客户端(浏览器)                    服务端
    │                              │
    ├─ lobby:join ────────────────→│ 创建玩家
    │←─ lobby:joined ──────────────┤
    │                              │
    ├─ room:create {mode:'ai'} ──→│ 创建房间 + AI虚拟玩家
    │←─ room:joined ──────────────┤
    │                              │
    ├─ room:ready ────────────────→│ 触发 startRoomGame
    │                              ├─ beginGame() SQLite
    │←─ game:state (dealing) ──────┤
    │←─ game:state (dealt=3) ──────┤ 渐进发牌
    │←─ game:state (dealt=6) ──────┤
    │    ...                       │
    │←─ game:state (bidding) ──────┤ 发牌完成
    │                              │
    │   [AI 叫地主]                ├─ runAIBid()
    │←─ game:state (bidding) ──────┤
    │                              │
    ├─ game:bid {score:2} ────────→│ 人类叫分
    │←─ game:state (playing) ──────┤ 地主确定
    │                              │
    │   [AI 出牌/不出]             ├─ runAIPlay()
    │←─ game:state ────────────────┤
    │                              │
    ├─ game:play {cardIds:[...]} ─→│ 人类出牌
    │←─ game:state ────────────────┤
    │                              │
    │←─ game:state (game_over) ────┤ 手牌清空
    │←─ game:over ─────────────────┤
    │←─ room:update (waiting) ──────┤ 房间重置
```

---

## 5. 存储方案

### 5.1 Redis — 房间状态

```
Key: lobby:rooms (Hash)
  room_1 → {"id":"room_1","mode":"ai","phase":"playing","playerCount":3,...}
  room_2 → {"id":"room_2","mode":"pvp","phase":"waiting","playerCount":1,...}
```

- 房间创建/更新/删除时同步
- 大厅广播从 Redis 读取
- Redis 不可用时自动降级为内存 Map
- 启动时清空残留数据

### 5.2 SQLite — 游戏历史

```sql
game_history:   游戏记录 (INSERT at start, UPDATE at end)
player_stats:   玩家统计 (UPSERT on game end, by name)
```

- `status` 字段：`'playing'` → `'finished'`
- 历史列表只返回 `status='finished'` 的最近 50 条
- 使用 WAL 模式，嵌入式存储

---

## 6. 安全与边界处理

| 场景 | 处理 |
|------|------|
| 玩家断线 | `beforeunload` 主动断开 → 10s ping timeout 兜底 |
| 全员不叫 | `submitBid` 返回 `startDealing`，服务端 `completeDealing` 跳转 |
| PvP 游戏中离开 | `leaveRoom` 重置 room 为 waiting，通知剩余玩家 |
| AI 房间人类离开 | 整个房间删除 |
| 无效出牌 | `playCards` 返回 `'invalid'`，忽略操作 |
| 并发 AI 调度 | `runAIBid/runAIPlay` 检查 phase/currentPlayer guard |
| 发牌中离开 | `clearInterval(room._dealTimer)` 停止发牌动画 |
| Socket.io 房间残留 | `socket.leave(room.id)` 清理 |
| Redis 不可用 | 自动降级为内存 Map |
| 服务器重启 | Redis `lobby:rooms` 清空，SQLite 历史数据安全 |

---

## 7. 关键文件索引

| 文件 | 职责 |
|------|------|
| `server/src/index.ts` | 服务端入口，Express + Socket.io 启动，游戏回调 |
| `server/src/services/gameRunner.ts` | 游戏调度核心：发牌、叫分、出牌、AI 回合 |
| `server/src/socket/room.ts` | 房间事件：创建/加入/离开/准备/断线 |
| `server/src/socket/lobby.ts` | 大厅事件：加入大厅/广播房间列表 |
| `server/src/engine/game.ts` | 纯函数游戏引擎：状态机、叫分、出牌、不出 |
| `server/src/engine/ai_v2.ts` | AI V2：手牌分解 + 规划 + V1 回退 |
| `server/src/engine/hand.ts` | 牌型检测 (`detectHand`) |
| `server/src/engine/compare.ts` | 牌型比较 (`canBeat`) |
| `client/src/pages/GamePage.tsx` | 游戏牌桌页面：准备/发牌/叫地主/出牌 |
| `client/src/pages/LobbyPage.tsx` | 大厅页面：房间列表/历史/创建/加入 |
| `client/src/store/networkStore.ts` | 联机状态管理 |
| `client/src/engine/ai.ts` | 客户端 AI：手牌提示 (`findHintPlay`) |
| `client/src/components/PlayerHand.tsx` | 手牌布局组件 |
| `client/src/components/Card.tsx` | 单张牌渲染组件 |
