import { motion } from 'framer-motion'
import type { Card } from '../engine/card'
import { CardView } from './Card'

type HandLayout = 'self' | 'side'

interface PlayerHandProps {
  cards: Card[]
  selectedIds?: Set<string>
  onToggleCard?: (id: string) => void
  disabled?: boolean
  layout: HandLayout
  faceDown?: boolean
  countOverride?: number
  availableWidth?: number
  align?: 'left' | 'right' | 'center'
  className?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildPlaceholders(count: number): Card[] {
  return Array.from({ length: count }, (_, index) => ({
    suit: 'spade',
    rank: '',
    value: 0,
    id: `placeholder_${index}`,
  }))
}

export function PlayerHand({
  cards,
  selectedIds = new Set<string>(),
  onToggleCard,
  disabled = false,
  layout,
  faceDown = false,
  countOverride,
  availableWidth = 960,
  align = 'center',
  className = '',
}: PlayerHandProps) {
  const count = countOverride ?? cards.length
  if (count === 0) {
    return <div className={`hand-empty ${className}`}>暂无手牌</div>
  }

  const displayCards = faceDown ? buildPlaceholders(count) : cards

  if (layout === 'side') {
    const cardWidth = 60
    const cardHeight = Math.round(cardWidth * 1.48)
    const maxHeight = 430
    const step = count > 1 ? Math.min(22, Math.max(12, (maxHeight - cardHeight) / (count - 1))) : 0
    const totalHeight = cardHeight + step * Math.max(0, count - 1)

    return (
      <div
        className={`side-hand side-hand--${align} ${className}`}
        style={{ width: cardWidth + 16, height: totalHeight }}
      >
        {displayCards.map((card, index) => (
          <motion.div
            key={card.id}
            className="side-hand__card"
            initial={false}
            animate={{ top: index * step }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          >
            <CardView card={card} faceDown width={cardWidth} />
          </motion.div>
        ))}
      </div>
    )
  }

  const safeWidth = clamp(availableWidth, 560, 1140)
  const cardWidth = clamp(Math.floor(safeWidth / (count * 0.66 + 0.9)), 56, 88)
  const cardHeight = Math.round(cardWidth * 1.48)
  const maxStep = cardWidth * 0.74
  const step = count > 1 ? Math.min(maxStep, (safeWidth - cardWidth) / (count - 1)) : 0
  const totalWidth = cardWidth + step * Math.max(0, count - 1)

  return (
    <div
      className={`self-hand ${className}`}
      style={{
        width: Math.min(totalWidth, safeWidth),
        height: cardHeight + 32,
      }}
    >
      {displayCards.map((card, index) => {
        const selected = !faceDown && selectedIds.has(card.id)
        return (
          <motion.div
            key={card.id}
            className="self-hand__card"
            initial={false}
            animate={{
              left: index * step,
              bottom: selected ? 18 : 0,
            }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ zIndex: selected ? count + 10 : index + 1 }}
          >
            <CardView
              card={card}
              selected={selected}
              faceDown={faceDown}
              width={cardWidth}
              onClick={!faceDown && !disabled && onToggleCard ? () => onToggleCard(card.id) : undefined}
            />
          </motion.div>
        )
      })}
    </div>
  )
}
