import type { Server, Socket } from 'socket.io'
import type { Player } from '../models/player.js'
import { createPlayer } from '../models/player.js'
import { createRoom, MAX_ROOMS, type Room, type RoomMode } from '../models/room.js'
import { startRoomGame, type GameCallbacks } from '../services/gameRunner.js'
import { syncRoom, removeRoom as removeRedisRoom, type RoomRedisData } from '../services/redis.js'
import { broadcastLobby, type LobbyContext } from './lobby.js'

interface RoomCtx {
  roomCounter: { value: number }
}

function toRoomRedisData(room: Room): RoomRedisData {
  return {
    id: room.id,
    mode: room.mode,
    phase: room.phase,
    playerCount: room.players.length,
    maxPlayers: 3,
    players: room.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isReady: p.isReady, isOnline: p.isOnline,
    })),
  }
}

export function roomInfo(room: Room) {
  return {
    id: room.id,
    mode: room.mode,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isReady: p.isReady, isOnline: p.isOnline,
    })),
    maxPlayers: 3,
  }
}

export function registerRoomHandlers(
  io: Server,
  socket: Socket,
  lobbyCtx: LobbyContext,
  roomCtx: RoomCtx,
  gameCallbacks: GameCallbacks,
) {
  // === 创建房间 ===
  socket.on('room:create', ({ mode }: { mode: RoomMode }) => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player) return

    if (lobbyCtx.rooms.size >= MAX_ROOMS) {
      socket.emit('error', { message: '房间已满（最多20个）' })
      return
    }
    if (player.roomId) {
      socket.emit('error', { message: '你已在房间中' })
      return
    }

    roomCtx.roomCounter.value++
    const roomId = `room_${roomCtx.roomCounter.value}`
    const room = createRoom(roomId, mode)
    player.roomId = roomId
    player.seat = 0
    player.isReady = false
    room.players.push(player)

    // AI mode: add 2 AI virtual players (always ready)
    if (mode === 'ai') {
      room.players.push(
        createPlayer(`ai_1_${roomId}`, '', '电脑1'),
        createPlayer(`ai_2_${roomId}`, '', '电脑2'),
      )
      room.players[1].roomId = roomId
      room.players[1].seat = 1
      room.players[1].isReady = true
      room.players[2].roomId = roomId
      room.players[2].seat = 2
      room.players[2].isReady = true
    }

    lobbyCtx.rooms.set(roomId, room)
    syncRoom(roomId, toRoomRedisData(room))
    socket.join(roomId)

    socket.emit('room:joined', roomInfo(room))
    broadcastLobby(io, lobbyCtx)
  })

  // === 加入房间 ===
  socket.on('room:join', ({ roomId }: { roomId: string }) => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player) return
    if (player.roomId) { socket.emit('error', { message: '你已在房间中' }); return }

    const room = lobbyCtx.rooms.get(roomId)
    if (!room) { socket.emit('error', { message: '房间不存在' }); return }
    if (room.phase !== 'waiting') { socket.emit('error', { message: '游戏已开始' }); return }
    if (room.players.length >= 3) { socket.emit('error', { message: '房间已满' }); return }

    player.roomId = roomId
    player.seat = room.players.length
    room.players.push(player)
    socket.join(roomId)

    syncRoom(roomId, toRoomRedisData(room))
    socket.emit('room:joined', roomInfo(room))
    io.to(roomId).emit('room:update', roomInfo(room))
    broadcastLobby(io, lobbyCtx)
  })

  // === 离开房间 ===
  socket.on('room:leave', () => {
    leaveRoom(socket, io, lobbyCtx)
  })

  // === 准备 ===
  socket.on('room:ready', () => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player || !player.roomId) return
    const room = lobbyCtx.rooms.get(player.roomId)
    if (!room || room.phase !== 'waiting') return

    player.isReady = !player.isReady
    syncRoom(room.id, toRoomRedisData(room))
    io.to(room.id).emit('room:update', roomInfo(room))

    if (room.mode === 'ai') {
      if (player.isReady) startRoomGame(room, gameCallbacks)
    } else {
      if (room.players.length === 3 && room.players.every(p => p.isReady)) {
        startRoomGame(room, gameCallbacks)
      }
    }
  })
}

export function leaveRoom(
  socket: Socket,
  io: Server,
  lobbyCtx: LobbyContext,
) {
  const player = lobbyCtx.players.get(socket.id)
  if (!player || !player.roomId) return

  const room = lobbyCtx.rooms.get(player.roomId)
  if (!room) return

  const idx = room.players.findIndex(p => p.id === player.id)
  if (idx >= 0) room.players.splice(idx, 1)

  player.roomId = null
  player.seat = -1
  player.isReady = false
  socket.leave(room.id)
  socket.emit('room:left')

  // AI room: delete when human leaves (AI can't play alone)
  if (room.players.length === 0 || room.mode === 'ai') {
    room.players.length = 0
    removeRedisRoom(room.id)
    lobbyCtx.rooms.delete(room.id)
  } else {
    // PvP: if game was in progress, reset to waiting (game can't continue with missing player)
    if (room.phase === 'playing') {
      room.phase = 'waiting'
      room.gameState = null
      room.gameStartTime = null
      room.players.forEach(p => { p.isReady = false })
    }
    room.players.forEach((p, i) => { p.seat = i })
    syncRoom(room.id, toRoomRedisData(room))
    io.to(room.id).emit('room:update', roomInfo(room))
  }
  broadcastLobby(io, lobbyCtx)
}

export function handleDisconnect(
  socket: Socket,
  io: Server,
  lobbyCtx: LobbyContext,
) {
  const player = lobbyCtx.players.get(socket.id)
  if (!player) return

  player.isOnline = false

  if (player.roomId) {
    leaveRoom(socket, io, lobbyCtx)
  }

  lobbyCtx.players.delete(socket.id)
  lobbyCtx.socketToPlayer.delete(socket.id)
  broadcastLobby(io, lobbyCtx)
}
