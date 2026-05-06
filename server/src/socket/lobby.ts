import type { Server, Socket } from 'socket.io'
import type { Player } from '../models/player.js'
import { createPlayer } from '../models/player.js'
import type { Room } from '../models/room.js'
import { getRecentHistory } from '../services/history.js'
import { getAllRooms } from '../services/redis.js'

export interface LobbyContext {
  players: Map<string, Player>
  socketToPlayer: Map<string, string>
  rooms: Map<string, Room>
}

function generatePlayerId(socketId: string, clientId: string | undefined, ctx: LobbyContext): string {
  const baseId = (clientId && clientId.trim()) || `${socketId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const used = new Set(Array.from(ctx.players.values()).map(p => p.id))
  if (!used.has(baseId)) return baseId
  return `${baseId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function registerLobbyHandlers(io: Server, socket: Socket, ctx: LobbyContext) {
  socket.on('lobby:join', ({ name, clientId }: { name: string; clientId?: string }) => {
    const playerId = generatePlayerId(socket.id, clientId, ctx)
    const player = createPlayer(playerId, socket.id, name || '玩家')
    ctx.players.set(socket.id, player)
    ctx.socketToPlayer.set(socket.id, player.id)
    socket.emit('lobby:joined', { playerId: player.id, name: player.name })
    broadcastLobby(io, ctx)
  })

  socket.on('lobby:history', () => {
    socket.emit('lobby:history', getRecentHistory())
  })
}

export async function broadcastLobby(io: Server, _ctx: LobbyContext) {
  const rooms = await getAllRooms()
  const list = rooms.map(room => ({
    id: room.id,
    mode: room.mode,
    phase: room.phase,
    playerCount: room.playerCount,
    maxPlayers: 3,
  }))
  io.emit('lobby:rooms', list)
}
