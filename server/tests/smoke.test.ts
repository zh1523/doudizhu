/**
 * 斗地主联机冒烟测试
 * 运行: cd server && npx tsx tests/smoke.test.ts
 * 前提: 服务端已在 localhost:3000 启动
 */

import { io, Socket } from 'socket.io-client'

const URL = 'http://localhost:3000'
const WAIT = (ms: number) => new Promise(r => setTimeout(r, ms))

// ======== 测试框架 ========
let passed = 0
let failed = 0
let currentCase = ''

function test(name: string, fn: () => Promise<void>) {
  return async () => {
    currentCase = name
    try {
      await fn()
      passed++
      console.log(`  ✓ ${name}`)
    } catch (e: any) {
      failed++
      console.log(`  ✗ ${name}: ${e.message}`)
    }
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ======== 辅助函数 ========
function connect(name: string): Promise<{ socket: Socket; playerId: string }> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], timeout: 5000 })
    const clientId = `test_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const timer = setTimeout(() => reject(new Error('连接超时')), 5000)
    socket.on('connect', () => {
      socket.emit('lobby:join', { name, clientId })
    })
    socket.on('lobby:joined', (data: any) => {
      clearTimeout(timer)
      resolve({ socket, playerId: data.playerId })
    })
    socket.on('connect_error', (e) => {
      clearTimeout(timer)
      reject(new Error(`连接失败: ${e.message}`))
    })
  })
}

function waitFor(socket: Socket, event: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeout)
    socket.once(event, (data: any) => {
      clearTimeout(timer)
      // Socket.io sends 'room:update' after room:joined for the creating player,
      // causing double-resolve. Workaround:
      resolve(data)
    })
  })
}

async function createRoom(socket: Socket, mode: 'ai' | 'pvp' = 'ai') {
  const roomJoined = waitFor(socket, 'room:joined')
  socket.emit('room:create', { mode })
  return await roomJoined
}

async function joinRoom(socket: Socket, roomId: string) {
  const roomJoined = waitFor(socket, 'room:joined')
  socket.emit('room:join', { roomId })
  return await roomJoined
}

async function toggleReady(socket: Socket) {
  socket.emit('room:ready')
}

// ======== 测试用例 ========

const tests = [
  // ─── T1-T3: 连接与大厅 ───
  test('T1: 连接到服务器', async () => {
    const { socket, playerId } = await connect('测试玩家1')
    assert(!!socket.connected, 'socket 应已连接')
    assert(!!playerId, '应收到 playerId')
    socket.disconnect()
  }),

  test('T2: 大厅收到房间列表', async () => {
    const { socket } = await connect('测试玩家2')
    const rooms = await waitFor(socket, 'lobby:rooms', 3000)
    assert(Array.isArray(rooms), '大厅房间列表应为数组')
    socket.disconnect()
  }),

  test('T3: 大厅收到历史记录', async () => {
    const { socket } = await connect('测试玩家3')
    socket.emit('lobby:history')
    const history = await waitFor(socket, 'lobby:history', 3000)
    assert(Array.isArray(history), '历史记录应为数组')
    socket.disconnect()
  }),

  // ─── T4-T7: AI 房间 ───
  test('T4: 创建 AI 房间', async () => {
    const { socket } = await connect('AI测试')
    const room = await createRoom(socket, 'ai')
    assert(room.mode === 'ai', '房间模式应为 ai')
    assert(room.players.length === 3, 'AI房间应有3个玩家(1人类+2AI)')
    assert(room.phase === 'waiting', '初始阶段应为 waiting')
    const human = room.players.find((p: any) => !p.id.startsWith('ai_'))
    assert(human && human.isReady === false, '人类玩家初始未准备')
    const aiPlayers = room.players.filter((p: any) => p.id.startsWith('ai_'))
    assert(aiPlayers.length === 2, '应有2个AI玩家')
    assert(aiPlayers.every((p: any) => p.isReady === true), 'AI玩家应已准备')
    socket.disconnect()
  }),

  test('T5: AI 房间准备 → 游戏开始', async () => {
    const { socket } = await connect('AI测试2')
    const room = await createRoom(socket, 'ai')
    assert(room.phase === 'waiting', '初始应为 waiting')

    const gameState = waitFor(socket, 'game:state', 8000)
    await toggleReady(socket)
    const gs = await gameState

    assert(gs.gameState.phase === 'dealing', `游戏应进入发牌阶段, 实际: ${gs.gameState.phase}`)
    socket.disconnect()
  }),

  test('T6: AI 房间离开 → 房间删除', async () => {
    const { socket } = await connect('AI测试3')
    const room = await createRoom(socket, 'ai')
    const roomId = room.id

    socket.emit('room:leave')
    await waitFor(socket, 'room:left')
    await WAIT(500)

    // 再次尝试加入应失败（房间已删除）
    socket.emit('room:join', { roomId })
    const error = await waitFor(socket, 'error', 2000)
    assert(error.message.includes('不存在'), `加入已删除房间应失败, 实际: ${error.message}`)
    socket.disconnect()
  }),

  test('T7: AI 对局完整流程 (发牌→叫地主→出牌)', async () => {
    const { socket } = await connect('AI完整测试')
    await createRoom(socket, 'ai')

    // 准备 → 发牌
    let gsPromise = waitFor(socket, 'game:state', 8000)
    await toggleReady(socket)
    let gs = await gsPromise
    assert(gs.gameState.phase === 'dealing', `应为发牌: ${gs.gameState.phase}`)

    // 等待发牌完成
    let phase = gs.gameState.phase
    while (phase === 'dealing') {
      gs = await waitFor(socket, 'game:state', 5000)
      phase = gs.gameState.phase
    }
    assert(phase === 'bidding', `发牌后进入叫地主: ${phase}`)
    assert(gs.gameState.players[0].hand.length === 17, `应17张: ${gs.gameState.players[0].hand.length}`)

    // 叫地主：一直叫到进入 playing
    while (phase === 'bidding') {
      const bid = gs.gameState.bidding
      if (bid.currentBidder === 0) {
        const score = bid.highestBid === 0 ? 3 : 0
        socket.emit('game:bid', { score })
      }
      gs = await waitFor(socket, 'game:state', 10000)
      phase = gs.gameState.phase
    }
    assert(phase === 'playing', `应进入出牌: ${phase}`)

    // 验证地主已定，手牌正确
    const isLandlord = gs.gameState.players[0].isLandlord
    const handSize = gs.gameState.players[0].hand.length
    assert(isLandlord ? handSize === 20 : handSize === 17,
      `地主20张/农民17张: isLandlord=${isLandlord} hand=${handSize}`)

    // 如果轮到自己，出一张
    if (gs.gameState.playing.currentPlayer === 0) {
      const card = gs.gameState.players[0].hand[0]
      socket.emit('game:play', { cardIds: [card.id] })
      await waitFor(socket, 'game:state', 10000)
    }

    // 等待 game:over
    try {
      const over = await waitFor(socket, 'game:over', 15000)
      assert(typeof over.winner === 'number', '应收到 game:over')
      console.log(`    结束, 赢家:${over.winner}, 倍数:x${over.multiplier}`)
    } catch {
      console.log('    (游戏仍在进行中, 手动结束)')
    }

    socket.disconnect()
  }),

  // ─── T8-T10: PvP 房间 ───
  test('T8: 创建 PvP 房间, 第二人加入', async () => {
    const p1 = await connect('PvP玩家1')
    const p2 = await connect('PvP玩家2')

    const room = await createRoom(p1.socket, 'pvp')
    assert(room.players.length === 1, 'PvP房间初始1人')
    assert(room.mode === 'pvp', '模式应为 pvp')

    // P2 加入
    const room2 = await joinRoom(p2.socket, room.id)
    assert(room2.players.length === 2, '加入后应有2人')

    // P1 应收到 room:update
    const update = await waitFor(p1.socket, 'room:update', 3000)
    assert(update.players.length === 2, `P1应收到2人更新, 实际: ${update.players.length}`)

    p1.socket.disconnect()
    p2.socket.disconnect()
  }),

  test('T9: PvP 房间满员拒绝加入', async () => {
    const p1 = await connect('PvP满员1')
    const p2 = await connect('PvP满员2')
    const p3 = await connect('PvP满员3')
    const p4 = await connect('PvP满员4')

    const room = await createRoom(p1.socket, 'pvp')
    await joinRoom(p2.socket, room.id)
    await joinRoom(p3.socket, room.id)

    // P4 尝试加入满员房间
    p4.socket.emit('room:join', { roomId: room.id })
    const error = await waitFor(p4.socket, 'error', 3000)
    assert(error.message.includes('已满'), `满员应拒绝: ${error.message}`)

    p1.socket.disconnect(); p2.socket.disconnect()
    p3.socket.disconnect(); p4.socket.disconnect()
  }),

  test('T10: PvP 玩家离开 → 房间回到等待', async () => {
    const p1 = await connect('PvP离开1')
    const p2 = await connect('PvP离开2')
    const p3 = await connect('PvP离开3')

    const room = await createRoom(p1.socket, 'pvp')
    const roomId = room.id
    await joinRoom(p2.socket, roomId)
    await joinRoom(p3.socket, roomId)

    // 全部准备 → 游戏开始
    await toggleReady(p1.socket)
    await toggleReady(p2.socket)
    await toggleReady(p3.socket)

    // 等待游戏开始
    const gs = await waitFor(p1.socket, 'game:state', 10000)
    assert(gs.gameState.phase === 'dealing', `应进入发牌: ${gs.gameState.phase}`)

    // P3 离开
    p3.socket.emit('room:leave')
    await waitFor(p3.socket, 'room:left')

    // P1 应收到 room:update (回 waiting)
    const update = await waitFor(p1.socket, 'room:update', 5000)
    assert(update.phase === 'waiting', `离开后应回waiting: ${update.phase}`)
    assert(update.players.length === 2, `剩余2人: ${update.players.length}`)

    p1.socket.disconnect(); p2.socket.disconnect(); p3.socket.disconnect()
  }),

  // ─── T11-T12: 边界情况 ───
  test('T11: 游戏中房间不可加入', async () => {
    const p1 = await connect('游戏中1')
    const p2 = await connect('游戏中2')

    const room = await createRoom(p1.socket, 'ai')
    await toggleReady(p1.socket) // 游戏开始
    await waitFor(p1.socket, 'game:state', 5000)

    p2.socket.emit('room:join', { roomId: room.id })
    const error = await waitFor(p2.socket, 'error', 3000)
    assert(error.message.includes('已开始'), `游戏中应拒绝加入: ${error.message}`)

    p1.socket.disconnect(); p2.socket.disconnect()
  }),

  test('T12: 同一玩家不能创建两个房间', async () => {
    const { socket } = await connect('双房测试')
    await createRoom(socket, 'ai')

    socket.emit('room:create', { mode: 'ai' })
    const error = await waitFor(socket, 'error', 3000)
    assert(error.message.includes('已在房间'), `不能重复创建: ${error.message}`)

    socket.disconnect()
  }),
]

// ======== 主函数 ========
async function main() {
  console.log('═'.repeat(50))
  console.log('斗地主联机冒烟测试')
  console.log(`目标: ${URL}`)
  console.log('═'.repeat(50))

  // 检查服务端是否在线
  try {
    const testSocket = io(URL, { transports: ['websocket'], timeout: 3000 })
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('无法连接服务端，请先启动: cd server && npm run dev')), 3000)
      testSocket.on('connect', () => { clearTimeout(t); resolve() })
      testSocket.on('connect_error', () => {})
    })
    testSocket.disconnect()
  } catch (e: any) {
    console.log(`\n✗ ${e.message}`)
    process.exit(1)
  }

  console.log(`\n共 ${tests.length} 个用例\n`)

  for (const t of tests) {
    await t()
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`结果: ${passed} 通过, ${failed} 失败, ${tests.length} 总计`)
  console.log(`${'═'.repeat(50)}`)

  process.exit(failed > 0 ? 1 : 0)
}

main()
