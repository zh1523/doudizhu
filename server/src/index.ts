import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Player } from './models/player.js'
import type { Room } from './models/room.js'
import { initRedis, clearAllRooms } from './services/redis.js'
import { recordGame } from './services/history.js'
import { syncRoom } from './services/redis.js'
import { rotateForViewer } from './services/gameRunner.js'
import { registerLobbyHandlers, type LobbyContext } from './socket/lobby.js'
import { registerRoomHandlers, handleDisconnect, roomInfo } from './socket/room.js'
import { registerGameHandlers } from './socket/game.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000,
})

// === 状态 ===
const rooms = new Map<string, Room>()
const roomCounter = { value: 0 }

const lobbyCtx: LobbyContext = {
  players: new Map<string, Player>(),
  socketToPlayer: new Map<string, string>(),
  rooms,
}

// === 游戏回调 ===
function broadcastState(room: Room) {
  for (const player of room.players) {
    if (!player.isOnline) continue
    const socket = io.sockets.sockets.get(player.socketId)
    if (!socket) continue
    const state = room.gameState
    if (state) {
      const rotated = rotateForViewer(state, player.seat)
      socket.emit('game:state', { gameState: rotated, yourSeat: 0 })
    }
  }
}

function onGameOver(room: Room, winner: number) {
  if (!room.gameState) return
  const gs = room.gameState
  const duration = room.gameStartTime
    ? Math.floor((Date.now() - room.gameStartTime.getTime()) / 1000)
    : 0

  const playerRecords = room.players.map(p => {
    const gsPlayer = gs.players[p.seat]
    return {
      name: p.name,
      isLandlord: gsPlayer.isLandlord,
      won: gsPlayer.isLandlord ? winner === 0 : winner === 1,
    }
  })

  recordGame(room.id, room.mode, playerRecords, gs.baseScore, gs.multiplier, gs.playing.bombCount, winner, duration)

  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId)
    if (socket) {
      socket.emit('game:over', {
        winner,
        players: playerRecords,
        multiplier: gs.multiplier,
        baseScore: gs.baseScore,
      })
    }
  }

  // Reset room
  room.phase = 'waiting'
  room.gameState = null
  room.gameStartTime = null
  room.players.forEach(p => { p.isReady = false })
  if (room.mode === 'ai') {
    room.players.forEach(p => { if (p.id.startsWith('ai_')) p.isReady = true })
  }
  io.to(room.id).emit('room:update', roomInfo(room))

  // Sync to Redis
  syncRoom(room.id, {
    id: room.id, mode: room.mode, phase: room.phase,
    playerCount: room.players.length, maxPlayers: 3,
    players: room.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isReady: p.isReady, isOnline: p.isOnline,
    })),
  })

  broadcastLobbyAfterGameOver(io, lobbyCtx)
}

async function broadcastLobbyAfterGameOver(io: Server, lobbyCtx: LobbyContext) {
  const { broadcastLobby } = await import('./socket/lobby.js')
  broadcastLobby(io, lobbyCtx)
}

const gameCallbacks = { broadcastState, onGameOver }

// === 静态文件 ===
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist')
app.use(express.static(clientDist))
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

// === Socket.io ===
io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`)

  registerLobbyHandlers(io, socket, lobbyCtx)
  registerRoomHandlers(io, socket, lobbyCtx, { roomCounter }, gameCallbacks)
  registerGameHandlers(io, socket, lobbyCtx, (roomId) => lobbyCtx.rooms.get(roomId) ?? rooms.get(roomId), gameCallbacks)

  socket.on('disconnect', (reason: string) => {
    console.log(`[断开] ${socket.id} (${reason})`)
    handleDisconnect(socket, io, lobbyCtx, reason)
  })
})

// === 启动 ===
async function start() {
  await initRedis()
  await clearAllRooms()
  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, () => {
    console.log(`斗地主服务端启动 http://localhost:${PORT}`)
  })
}

start()
