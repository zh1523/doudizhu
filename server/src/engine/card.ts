export type Suit = 'spade' | 'heart' | 'club' | 'diamond' | 'joker'

export interface Card {
  suit: Suit
  rank: string
  value: number
  id: string
}

const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond']
const RANKS = [
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
  { rank: 'A', value: 14 },
  { rank: '2', value: 15 },
]

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const { rank, value } of RANKS) {
      deck.push({ suit, rank, value, id: `${rank}_${suit}` })
    }
  }
  deck.push({ suit: 'joker', rank: 'SJ', value: 16, id: 'small_joker' })
  deck.push({ suit: 'joker', rank: 'BJ', value: 17, id: 'big_joker' })
  return deck
}

export function shuffle(deck: Card[]): Card[] {
  const cards = [...deck]
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]]
  }
  return cards
}

export interface DealResult {
  hands: Card[][]
  bottom: Card[]
}

export function deal(deck: Card[]): DealResult {
  const hands: Card[][] = [[], [], []]
  for (let index = 0; index < 51; index += 1) {
    hands[index % 3].push(deck[index])
  }
  return {
    hands,
    bottom: deck.slice(51, 54),
  }
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => left.value - right.value)
}

export function formatCards(cards: Card[]): string {
  return cards.map((card) => `${card.rank}${suitSymbol(card.suit)}`).join(' ')
}

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'spade':
      return '♠'
    case 'heart':
      return '♥'
    case 'club':
      return '♣'
    case 'diamond':
      return '♦'
    case 'joker':
      return ''
  }
}
