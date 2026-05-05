import type { Card } from './card'

export type HandType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_one'
  | 'triple_two'
  | 'straight'
  | 'straight_pairs'
  | 'plane'
  | 'plane_singles'
  | 'plane_pairs'
  | 'bomb'
  | 'rocket'

export interface PlayResult {
  type: HandType
  weight: number // primary value for comparison
  cards: Card[]
}

// Returns a frequency map: value -> count
function freqMap(cards: Card[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const c of cards) {
    map.set(c.value, (map.get(c.value) || 0) + 1)
  }
  return map
}

// Returns entries sorted by value ascending
function sortedEntries(freq: Map<number, number>): [number, number][] {
  return [...freq.entries()].sort((a, b) => a[0] - b[0])
}

// Check if values form a consecutive sequence
function isConsecutive(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] !== 1) return false
  }
  return true
}

export function detectHand(cards: Card[]): PlayResult | null {
  if (cards.length === 0) return null

  const freq = freqMap(cards)
  const entries = sortedEntries(freq)

  // Rocket: small joker + big joker
  if (cards.length === 2 && freq.get(16) === 1 && freq.get(17) === 1) {
    return { type: 'rocket', weight: 17, cards }
  }

  // Bomb: 4 of same value
  if (cards.length === 4 && freq.size === 1) {
    const val = entries[0][0]
    return { type: 'bomb', weight: val, cards }
  }

  // Triple (no wings): 3 cards same value
  if (cards.length === 3 && freq.size === 1) {
    const val = entries[0][0]
    return { type: 'triple', weight: val, cards }
  }

  // Triple + one: 3+1
  if (cards.length === 4 && freq.size === 2) {
    const triple = entries.find(([, c]) => c === 3)
    if (triple) {
      return { type: 'triple_one', weight: triple[0], cards }
    }
  }

  // Triple + two: 3+2
  if (cards.length === 5 && freq.size === 2) {
    const triple = entries.find(([, c]) => c === 3)
    const pair = entries.find(([, c]) => c === 2)
    if (triple && pair) {
      return { type: 'triple_two', weight: triple[0], cards }
    }
  }

  // Single
  if (cards.length === 1) {
    return { type: 'single', weight: cards[0].value, cards }
  }

  // Pair
  if (cards.length === 2 && freq.size === 1) {
    const val = entries[0][0]
    return { type: 'pair', weight: val, cards }
  }

  // Straight: ≥5 consecutive, values 3-14 only
  if (cards.length >= 5 && freq.size === cards.length) {
    const values = entries.map(([v]) => v)
    if (values.every(v => v >= 3 && v <= 14) && isConsecutive(values)) {
      return { type: 'straight', weight: values[values.length - 1], cards }
    }
  }

  // Consecutive pairs: ≥3 consecutive pairs, values 3-14 only
  if (cards.length >= 6 && cards.length % 2 === 0) {
    const allPairs = entries.every(([, c]) => c === 2)
    if (allPairs) {
      const values = entries.map(([v]) => v)
      if (values.every(v => v >= 3 && v <= 14) && isConsecutive(values)) {
        return { type: 'straight_pairs', weight: values[values.length - 1], cards }
      }
    }
  }

  // Plane detection (consecutive triples, with or without wings)
  const planeValues = entries.filter(([, c]) => c >= 3).map(([v]) => v)

  if (planeValues.length >= 2) {
    // Try to find consecutive triples
    planeValues.sort()
    // Find consecutive sequences of triples
    for (let start = 0; start < planeValues.length; start++) {
      const seq: number[] = [planeValues[start]]
      for (let i = start + 1; i < planeValues.length; i++) {
        if (planeValues[i] - seq[seq.length - 1] === 1) {
          seq.push(planeValues[i])
        } else {
          break
        }
      }
      if (seq.length >= 2) {
        const mainPerValue = seq.length
        const mainCount = mainPerValue * 3
        const kickers = cards.filter(c => !seq.includes(c.value))

        // Plane without wings
        if (cards.length === mainCount) {
          return { type: 'plane', weight: seq[seq.length - 1], cards }
        }

        // Plane + singles
        if (cards.length === mainCount + mainPerValue && kickers.length === mainPerValue) {
          return { type: 'plane_singles', weight: seq[seq.length - 1], cards }
        }

        // Plane + pairs
        if (cards.length === mainCount + mainPerValue * 2 && kickers.length === mainPerValue * 2) {
          const kickerFreq = freqMap(kickers)
          const allKickerPairs = [...kickerFreq.values()].every(c => c === 2)
          if (allKickerPairs) {
            return { type: 'plane_pairs', weight: seq[seq.length - 1], cards }
          }
        }
      }
    }
  }

  return null
}
