import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

export function useAITurn() {
  const gameState = useGameStore((state) => state.gameState)
  const playerId = useGameStore((state) => state.playerId)
  const isProcessing = useGameStore((state) => state.isProcessing)
  const runAITurn = useGameStore((state) => state.runAITurn)

  useEffect(() => {
    if (isProcessing) return
    if (gameState.phase !== 'bidding' && gameState.phase !== 'playing') return

    const isPlayerTurn =
      (gameState.phase === 'bidding' && gameState.bidding.currentBidder === playerId) ||
      (gameState.phase === 'playing' && gameState.playing.currentPlayer === playerId)

    if (isPlayerTurn) return

    const delay = gameState.phase === 'bidding'
      ? 850 + Math.random() * 650
      : 900 + Math.random() * 450

    const timer = setTimeout(() => {
      runAITurn()
    }, delay)

    return () => clearTimeout(timer)
  }, [
    gameState.phase,
    gameState.bidding.currentBidder,
    gameState.playing.currentPlayer,
    isProcessing,
    playerId,
    runAITurn,
  ])
}
