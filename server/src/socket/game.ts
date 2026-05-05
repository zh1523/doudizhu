import type { Server, Socket } from 'socket.io'
import type { LobbyContext } from './lobby.js'
import type { Room } from '../models/room.js'
import {
  handleBid,
  handlePlay,
  handlePass,
  type GameCallbacks,
} from '../services/gameRunner.js'

export function registerGameHandlers(
  io: Server,
  socket: Socket,
  lobbyCtx: LobbyContext,
  getRoom: (roomId: string) => Room | undefined,
  callbacks: GameCallbacks,
) {
  // === 叫分 ===
  socket.on('game:bid', ({ score }: { score: number }) => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player || !player.roomId) return
    const room = getRoom(player.roomId)
    if (!room) return
    handleBid(room, player.id, score, callbacks)
  })

  // === 出牌 ===
  socket.on('game:play', ({ cardIds }: { cardIds: string[] }) => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player || !player.roomId) return
    const room = getRoom(player.roomId)
    if (!room) return
    handlePlay(room, player.id, cardIds, callbacks)
  })

  // === 不出 ===
  socket.on('game:pass', () => {
    const player = lobbyCtx.players.get(socket.id)
    if (!player || !player.roomId) return
    const room = getRoom(player.roomId)
    if (!room) return
    handlePass(room, player.id, callbacks)
  })
}
