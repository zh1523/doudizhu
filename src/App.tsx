import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { findHintPlay } from './engine/ai'
import type { Card } from './engine/card'
import { BiddingPanel } from './components/BiddingPanel'
import { CardView } from './components/Card'
import { GameControls } from './components/GameControls'
import { PlayerBadge } from './components/GameInfo'
import { GameResult } from './components/GameResult'
import { PlayerHand } from './components/PlayerHand'
import { useAITurn } from './hooks/useAITurn'
import { useGameStore } from './store/gameStore'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getPlayerName(playerId: number, selfId: number) {
  return playerId === selfId ? '你' : `电脑${playerId + 1}`
}

function PlayedCards({
  cards,
  align = 'center',
}: {
  cards: Card[]
  align?: 'left' | 'center' | 'right'
}) {
  const width = 68
  const count = cards.length
  const step = count > 1 ? Math.min(width * 0.56, 42) : 0
  const totalWidth = width + step * Math.max(0, count - 1)

  return (
    <div className={`played-fan played-fan--${align}`} style={{ width: totalWidth, height: 126 }}>
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          className="played-fan__card"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1, left: index * step }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <CardView card={card} width={width} topOnly />
        </motion.div>
      ))}
    </div>
  )
}

export default function App() {
  const gameState = useGameStore((state) => state.gameState)
  const selectedCardIds = useGameStore((state) => state.selectedCardIds)
  const playerId = useGameStore((state) => state.playerId)
  const seatAction = useGameStore((state) => state.seatAction)
  const clearSeatAction = useGameStore((state) => state.clearSeatAction)
  const startNewGame = useGameStore((state) => state.startNewGame)
  const toggleCard = useGameStore((state) => state.toggleCard)
  const playerBid = useGameStore((state) => state.playerBid)
  const playerPlayCards = useGameStore((state) => state.playerPlayCards)
  const playerPass = useGameStore((state) => state.playerPass)
  const playerHint = useGameStore((state) => state.playerHint)

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [showBottomReveal, setShowBottomReveal] = useState(false)

  const previousPhase = useRef(gameState.phase)

  useAITurn()

  useEffect(() => {
    if (gameState.phase === 'idle') startNewGame()
  }, [gameState.phase, startNewGame])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!seatAction) return
    const timer = window.setTimeout(() => {
      clearSeatAction()
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [seatAction, clearSeatAction])

  useEffect(() => {
    if (previousPhase.current !== 'playing' && gameState.phase === 'playing') {
      setShowBottomReveal(true)
      const timer = window.setTimeout(() => setShowBottomReveal(false), 1600)
      previousPhase.current = gameState.phase
      return () => window.clearTimeout(timer)
    }
    previousPhase.current = gameState.phase
  }, [gameState.phase])

  const { phase, players, playing, bottom, dealing, bidding } = gameState
  const humanPlayer = players[playerId]
  const leftPlayer = players[(playerId + 1) % 3]
  const rightPlayer = players[(playerId + 2) % 3]
  const currentTurnId = phase === 'bidding' ? bidding.currentBidder : playing.currentPlayer
  const selfHandWidth = clamp(viewportWidth - 420, 620, 1100)

  const leftVisibleCount = phase === 'dealing' ? dealing.visibleCounts[leftPlayer.id] : leftPlayer.hand.length
  const rightVisibleCount = phase === 'dealing' ? dealing.visibleCounts[rightPlayer.id] : rightPlayer.hand.length
  const selfVisibleCount = phase === 'dealing' ? dealing.visibleCounts[playerId] : humanPlayer.hand.length

  const selfDealingCards =
    phase === 'dealing'
      ? dealing.previewHands[playerId].slice(0, selfVisibleCount)
      : humanPlayer.hand

  const effectivePlayCards =
    phase === 'playing' && playing.lastPlay && playing.lastPlayPlayer >= 0
      ? playing.lastPlay.cards
      : null

  const hiddenBottomCards: Card[] = Array.from({ length: 3 }, (_, index) => ({
    suit: 'spade',
    rank: '',
    value: 0,
    id: `bottom_back_${index}`,
  }))

  const seatLabel = (targetPlayerId: number) => (
    seatAction && seatAction.playerId === targetPlayerId ? seatAction : null
  )

  const centerStatus = (() => {
    if (phase === 'dealing') return `发牌中 ${dealing.dealtCount} / 51`
    if (phase === 'bidding') {
      return bidding.currentBidder === playerId
        ? '轮到你叫地主'
        : `等待 ${getPlayerName(bidding.currentBidder, playerId)} 叫地主`
    }
    if (phase === 'playing') {
      if (playing.lastPlay === null) {
        return playing.currentPlayer === playerId ? '新的一轮，请先出牌' : '等待下一位出牌'
      }
      return playing.currentPlayer === playerId
        ? '轮到你接牌'
        : `等待 ${getPlayerName(playing.currentPlayer, playerId)} 出牌`
    }
    return ''
  })()

  const hintAvailable = phase === 'playing'
    && playing.currentPlayer === playerId
    && findHintPlay(humanPlayer.hand, playing.lastPlay) !== null

  return (
    <div className="table-shell">
      <div className="table-shell__background" />

      <div className="table-layout">
        <header className="table-header">
          <div className="table-brand">
            <span className="table-brand__eyebrow">现代牌桌</span>
            <h1>斗地主</h1>
          </div>

          <div className="table-status">
            <span>{centerStatus}</span>
            {phase === 'playing' && (
              <>
                <span>底分 {gameState.baseScore}</span>
                <span>倍数 {gameState.multiplier}</span>
                <span>炸弹 {playing.bombCount}</span>
              </>
            )}
          </div>

          <motion.div
            className={`bottom-pile ${showBottomReveal ? 'is-revealed' : ''}`}
            layout
          >
            <div className="bottom-pile__label">
              {phase === 'playing' ? '地主底牌' : '底牌'}
            </div>
            <div className="bottom-pile__cards">
              {(phase === 'playing' ? bottom : hiddenBottomCards).map((card) => (
                <motion.div key={card.id} layout>
                  <CardView card={card} faceDown={phase !== 'playing'} width={42} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </header>

        <aside className="seat-panel seat-panel--left">
          <PlayerBadge
            playerId={leftPlayer.id}
            currentPlayerId={currentTurnId}
            name={getPlayerName(leftPlayer.id, playerId)}
            cardCount={leftVisibleCount}
            isLandlord={leftPlayer.isLandlord}
            phase={phase}
          />

          <div className="seat-stage seat-stage--left">
            <PlayerHand
              cards={leftPlayer.hand}
              layout="side"
              faceDown
              countOverride={leftVisibleCount}
              align="left"
            />

            <div className="seat-table-slot seat-table-slot--left">
              <AnimatePresence>
                {effectivePlayCards && playing.lastPlayPlayer === leftPlayer.id ? (
                  <motion.div
                    key={`left-play-${effectivePlayCards.map((card) => card.id).join('_')}`}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="seat-play-anchor"
                  >
                    <PlayedCards cards={effectivePlayCards} align="left" />
                  </motion.div>
                ) : seatLabel(leftPlayer.id) ? (
                  <motion.div
                    key={`left-label-${seatLabel(leftPlayer.id)?.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="seat-bubble"
                  >
                    {seatLabel(leftPlayer.id)?.label}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        <main className="table-center">
          <div className="table-emblem">
            <div className="table-emblem__ring" />
            <div className="table-emblem__text">DOU DIZHU</div>
          </div>

          {phase === 'bidding' && (
            <div className="table-center__panel">
              <div className="table-center__title">叫地主阶段</div>
              <div className="table-center__subtitle">
                当前最高分 {bidding.highestBid}，由 {bidding.highestBidder >= 0 ? getPlayerName(bidding.highestBidder, playerId) : '暂无'} 持有
              </div>
              {bidding.currentBidder === playerId ? (
                <BiddingPanel
                  isCurrentBidder
                  highestBid={bidding.highestBid}
                  onBid={playerBid}
                />
              ) : (
                <div className="bidding-panel bidding-panel--waiting">
                  <span className="status-dot" />
                  <span>{getPlayerName(bidding.currentBidder, playerId)} 正在考虑</span>
                </div>
              )}
            </div>
          )}

          {phase === 'dealing' && (
            <div className="table-center__panel">
              <div className="table-center__title">发牌中</div>
              <div className="table-center__subtitle">手牌会从 0 张逐步增长到完整手牌</div>
              <div className="deal-progress">
                <div className="deal-progress__track">
                  <motion.div
                    className="deal-progress__fill"
                    animate={{ width: `${(dealing.dealtCount / 51) * 100}%` }}
                  />
                </div>
                <span>{dealing.dealtCount} / 51</span>
              </div>
            </div>
          )}

          {phase === 'playing' && (
            <div className="table-center__panel table-center__panel--compact">
              <div className="table-center__title">对局进行中</div>
              <div className="table-center__subtitle">{centerStatus}</div>
            </div>
          )}
        </main>

        <aside className="seat-panel seat-panel--right">
          <PlayerBadge
            playerId={rightPlayer.id}
            currentPlayerId={currentTurnId}
            name={getPlayerName(rightPlayer.id, playerId)}
            cardCount={rightVisibleCount}
            isLandlord={rightPlayer.isLandlord}
            phase={phase}
          />

          <div className="seat-stage seat-stage--right">
            <div className="seat-table-slot seat-table-slot--right">
              <AnimatePresence>
                {effectivePlayCards && playing.lastPlayPlayer === rightPlayer.id ? (
                  <motion.div
                    key={`right-play-${effectivePlayCards.map((card) => card.id).join('_')}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="seat-play-anchor"
                  >
                    <PlayedCards cards={effectivePlayCards} align="right" />
                  </motion.div>
                ) : seatLabel(rightPlayer.id) ? (
                  <motion.div
                    key={`right-label-${seatLabel(rightPlayer.id)?.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="seat-bubble seat-bubble--right"
                  >
                    {seatLabel(rightPlayer.id)?.label}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <PlayerHand
              cards={rightPlayer.hand}
              layout="side"
              faceDown
              countOverride={rightVisibleCount}
              align="right"
            />
          </div>
        </aside>

        <footer className="player-dock">
          <div className="player-dock__topline">
            <AnimatePresence>
              {effectivePlayCards && playing.lastPlayPlayer === playerId ? (
                <motion.div
                  key={`self-play-${effectivePlayCards.map((card) => card.id).join('_')}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <PlayedCards cards={effectivePlayCards} />
                </motion.div>
              ) : seatLabel(playerId) ? (
                <motion.div
                  key={`self-label-${seatLabel(playerId)?.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="seat-bubble"
                >
                  {seatLabel(playerId)?.label}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {phase === 'playing' && playing.currentPlayer === playerId && (
            <GameControls
              canPlay
              canPass={playing.lastPlay !== null}
              canHint={hintAvailable}
              onPlay={playerPlayCards}
              onPass={playerPass}
              onHint={playerHint}
              selectedCount={selectedCardIds.size}
            />
          )}

          <div className="self-badge-corner">
            <PlayerBadge
              playerId={humanPlayer.id}
              currentPlayerId={currentTurnId}
              name={getPlayerName(humanPlayer.id, playerId)}
              cardCount={selfVisibleCount}
              isLandlord={humanPlayer.isLandlord}
              phase={phase}
            />
          </div>

          <PlayerHand
            cards={selfDealingCards}
            selectedIds={phase === 'playing' ? selectedCardIds : new Set()}
            onToggleCard={toggleCard}
            disabled={phase !== 'playing' || playing.currentPlayer !== playerId}
            layout="self"
            faceDown={false}
            countOverride={selfVisibleCount}
            availableWidth={selfHandWidth}
          />
        </footer>
      </div>

      <GameResult gameState={gameState} playerId={playerId} onRestart={startNewGame} />
    </div>
  )
}
