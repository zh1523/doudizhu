import type { GameState } from '../engine/game.js'
import type { Player } from './player.js'

export type RoomMode = 'pvp' | 'ai'
export type RoomPhase = 'waiting' | 'playing'

export interface Room {
  id: string
  mode: RoomMode
  phase: RoomPhase
  players: Player[]
  gameState: GameState | null
  createdAt: Date
  gameStartTime: Date | null
}

export function createRoom(id: string, mode: RoomMode): Room {
  return {
    id,
    mode,
    phase: 'waiting',
    players: [],
    gameState: null,
    createdAt: new Date(),
    gameStartTime: null,
  }
}

export const MAX_ROOMS = 20
export const MAX_PLAYERS = 3
