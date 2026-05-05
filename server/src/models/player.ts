export interface Player {
  id: string
  socketId: string
  name: string
  roomId: string | null
  seat: number // 0-2, assigned when room is created/joined
  isReady: boolean
  isOnline: boolean
}

export function createPlayer(id: string, socketId: string, name: string): Player {
  return { id, socketId, name, roomId: null, seat: -1, isReady: false, isOnline: true }
}
