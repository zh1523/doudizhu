import type { PlayResult } from './hand'

// Returns true if "play" can beat "lastPlay".
// lastPlay is null when opening a new round.
export function canBeat(play: PlayResult, lastPlay: PlayResult | null): boolean {
  if (!lastPlay) return true // opening a new round

  // Rocket beats everything
  if (play.type === 'rocket') return true
  if (lastPlay.type === 'rocket') return false

  // Bomb beats non-bomb
  if (play.type === 'bomb') {
    if (lastPlay.type !== 'bomb') return true
    // Bomb vs bomb: higher weight
    return play.weight > lastPlay.weight
  }

  // Non-bomb can't beat bomb
  if (lastPlay.type === 'bomb') return false

  // Same type: higher weight wins
  if (play.type === lastPlay.type) {
    if (play.cards.length !== lastPlay.cards.length) return false
    return play.weight > lastPlay.weight
  }

  // Different non-bomb types: can't beat
  return false
}
