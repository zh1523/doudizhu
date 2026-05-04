import { AnimatePresence, motion } from 'framer-motion'
import type { GameState } from '../engine/game'

interface GameResultProps {
  gameState: GameState
  playerId: number
  onRestart: () => void
}

export function GameResult({ gameState, playerId, onRestart }: GameResultProps) {
  const player = gameState.players[playerId]
  const isLandlordWin = gameState.winner === 0
  const playerWon =
    (player.isLandlord && isLandlordWin) || (!player.isLandlord && !isLandlordWin)

  return (
    <AnimatePresence>
      {gameState.phase === 'game_over' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="result-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 18 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="result-panel"
          >
            <div className={`result-panel__title ${playerWon ? 'is-win' : 'is-loss'}`}>
              {playerWon ? '本局获胜' : '本局失利'}
            </div>
            <div className="result-panel__subtitle">
              {isLandlordWin ? '地主胜利' : '农民胜利'}
            </div>
            <div className="result-panel__stats">
              <span>底分 {gameState.baseScore}</span>
              <span>倍数 {gameState.multiplier}</span>
              <span>炸弹 {gameState.playing.bombCount}</span>
            </div>
            <button type="button" onClick={onRestart} className="result-panel__button">
              再来一局
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
