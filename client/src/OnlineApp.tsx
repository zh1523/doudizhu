import { useEffect } from 'react'
import { useNetworkStore } from './store/networkStore'
import { LobbyPage } from './pages/LobbyPage'
import { GamePage } from './pages/GamePage'

export default function OnlineApp() {
  const socket = useNetworkStore(s => s.socket)
  const currentRoom = useNetworkStore(s => s.currentRoom)

  // Auto-connect on mount
  useEffect(() => {
    if (!socket) {
      const name = `玩家${Math.floor(Math.random() * 9000) + 1000}`
      useNetworkStore.getState().connect(name)
    }
  }, [])

  // In room (pre-game ready state or game in progress)
  if (socket && currentRoom) {
    return <GamePage />
  }

  // Default: lobby (will auto-connect)
  return <LobbyPage />
}
