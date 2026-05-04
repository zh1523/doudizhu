import type { Card as CardType } from '../engine/card'

const suitSymbols: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
  joker: '★',
}

function suitColor(suit: string, value: number): string {
  if (suit === 'joker') return value === 17 ? '#d83b54' : '#10162f'
  return suit === 'heart' || suit === 'diamond' ? '#d83b54' : '#10162f'
}

interface CardProps {
  card: CardType
  selected?: boolean
  faceDown?: boolean
  width?: number
  topOnly?: boolean
  onClick?: () => void
  className?: string
}

export function CardView({
  card,
  selected = false,
  faceDown = false,
  width = 82,
  topOnly = false,
  onClick,
  className = '',
}: CardProps) {
  const height = Math.round(width * 1.46)
  const radius = Math.max(8, Math.round(width * 0.12))
  const borderWidth = Math.max(1.2, width * 0.022)

  if (faceDown) {
    return (
      <div
        onClick={onClick}
        className={`card-face card-back ${onClick ? 'is-clickable' : ''} ${className}`}
        style={{ width, height, borderRadius: radius, borderWidth }}
      >
        <div className="card-back__frame">
          <div className="card-back__crest" />
        </div>
      </div>
    )
  }

  const isJoker = card.suit === 'joker'
  const color = suitColor(card.suit, card.value)
  const rankSize = Math.max(12, Math.round(width * 0.22))
  const cornerSize = Math.max(10, Math.round(width * 0.16))
  const centerSize = Math.max(18, Math.round(width * 0.3))

  return (
    <div
      onClick={onClick}
      className={`card-face card-front ${selected ? 'is-selected' : ''} ${onClick ? 'is-clickable' : ''} ${className}`}
      style={{ width, height, borderRadius: radius, borderWidth }}
    >
      {isJoker ? (
        <>
          <div className="card-corner card-corner--top" style={{ color, fontSize: Math.max(10, rankSize - 4) }}>
            <span className="card-rank-joker">JOKER</span>
          </div>
          <div className="card-center" style={{ color, fontSize: centerSize + 4 }}>
            {card.rank === 'BJ' ? '♛' : '♚'}
          </div>
          {!topOnly && (
            <div className="card-corner card-corner--bottom" style={{ color, fontSize: Math.max(11, rankSize - 3) }}>
              <span>{card.rank}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card-corner card-corner--top" style={{ color }}>
            <span className="card-rank" style={{ fontSize: rankSize }}>{card.rank}</span>
            <span className="card-suit" style={{ fontSize: cornerSize }}>{suitSymbols[card.suit]}</span>
          </div>
          <div className="card-center" style={{ color, fontSize: centerSize }}>
            {suitSymbols[card.suit]}
          </div>
          {!topOnly && (
            <div className="card-corner card-corner--bottom" style={{ color }}>
              <span className="card-rank" style={{ fontSize: rankSize }}>{card.rank}</span>
              <span className="card-suit" style={{ fontSize: cornerSize }}>{suitSymbols[card.suit]}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
