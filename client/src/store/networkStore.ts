import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import type { GameState } from '../engine/game'

interface RoomInfo {
  id: string
  mode: string
  phase: string
  playerCount: number
  maxPlayers: number
}

interface RoomPlayer {
  id: string
  name: string
  seat: number
  isReady: boolean
  isOnline: boolean
}

interface RoomData {
  id: string
  mode: string
  phase: string
  players: RoomPlayer[]
  maxPlayers: number
}

interface GameOverData {
  winner: number
  players: { name: string; isLandlord: boolean; won: boolean }[]
  multiplier: number
  baseScore: number
}

type Page = 'lobby' | 'room' | 'game'

interface NetworkStore {
  socket: Socket | null
  page: Page
  playerName: string
  playerId: string
  rooms: RoomInfo[]
  currentRoom: RoomData | null
  gameState: GameState | null
  gameOver: GameOverData | null
  history: unknown[]
  notification: string | null

  connect: (name: string) => void
  setPage: (page: Page) => void
  createRoom: (mode: 'pvp' | 'ai') => void
  joinRoom: (roomId: string) => void
  leaveRoom: () => void
  toggleReady: () => void
  sendBid: (score: number) => void
  sendPlay: (cardIds: string[]) => void
  sendPass: () => void
  disconnect: () => void
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  socket: null,
  page: 'lobby',
  playerName: '',
  playerId: '',
  rooms: [],
  currentRoom: null,
  gameState: null,
  gameOver: null,
  history: [],
  notification: null,

  connect: (name: string) => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      const safeUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      const clientId = `web_${safeUUID}`
      socket.emit('lobby:join', { name, clientId })
    })

    // Clean disconnect on tab close (avoid ping timeout wait)
    window.addEventListener('beforeunload', () => {
      if (socket.connected) {
        socket.disconnect()
      }
    })

    socket.on('lobby:joined', ({ playerId, name: _name }) => {
      set({ playerId, playerName: name })
    })

    socket.on('lobby:rooms', (rooms: RoomInfo[]) => {
      set({ rooms })
    })

    socket.on('lobby:history', (history) => {
      set({ history })
    })

    socket.on('room:joined', (room: RoomData) => {
      set({ currentRoom: room, page: 'room' })
    })

    socket.on('room:update', (room: RoomData) => {
      // Clear gameState when room goes back to waiting, but keep gameOver for win/loss display
      set({ currentRoom: room, gameState: room.phase === 'waiting' ? null : get().gameState })
    })

    socket.on('room:player_left', ({ name, reason }: { name: string; reason?: string }) => {
      const reasonText = reason === 'ping timeout' ? '连接超时' : '退出'
      set({ notification: `玩家 ${name} 已离开（${reasonText}）` })
      setTimeout(() => set({ notification: null }), 4000)
    })

    socket.on('room:left', () => {
      set({ currentRoom: null, gameState: null, gameOver: null, page: 'lobby' })
    })

    socket.on('game:state', ({ gameState }: { gameState: GameState }) => {
      set({ gameState, gameOver: null, page: 'game' })
    })

    socket.on('game:over', (data: GameOverData) => {
      set({ gameOver: data, gameState: null })
    })

    socket.on('error', ({ message }: { message: string }) => {
      console.error('Server error:', message)
    })

    socket.on('disconnect', () => {
      set({ page: 'lobby', currentRoom: null, gameState: null, gameOver: null })
    })

    set({ socket })
  },

  setPage: (page: Page) => set({ page }),

  createRoom: (mode: 'pvp' | 'ai') => {
    get().socket?.emit('room:create', { mode })
  },

  joinRoom: (roomId: string) => {
    get().socket?.emit('room:join', { roomId })
  },

  leaveRoom: () => {
    get().socket?.emit('room:leave')
  },

  toggleReady: () => {
    get().socket?.emit('room:ready')
  },

  sendBid: (score: number) => {
    get().socket?.emit('game:bid', { score })
  },

  sendPlay: (cardIds: string[]) => {
    get().socket?.emit('game:play', { cardIds })
  },

  sendPass: () => {
    get().socket?.emit('game:pass')
  },

  disconnect: () => {
    get().socket?.disconnect()
    set({ socket: null, page: 'lobby' })
  },
}))
