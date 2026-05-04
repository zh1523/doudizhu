import type { Card } from './card'
import { detectHand, type PlayResult } from './hand'
import { canBeat } from './compare'

interface AIDecisionContext {
  hand: Card[]
  lastPlay: PlayResult | null
  lastPlayPlayer: number
  selfPlayerId: number
  isLandlord: boolean
  handCounts: number[]
  landlordPlayerId: number
}

function generateAllPlays(hand: Card[]): PlayResult[] {
  const results: PlayResult[] = []
  const size = hand.length

  for (let mask = 1; mask < (1 << size); mask += 1) {
    const selected: Card[] = []
    for (let index = 0; index < size; index += 1) {
      if (mask & (1 << index)) selected.push(hand[index])
    }
    const result = detectHand(selected)
    if (result) results.push(result)
  }
  return results
}

function deduplicatePlays(plays: PlayResult[]): PlayResult[] {
  const seen = new Map<string, PlayResult>()
  for (const play of plays) {
    const cardsKey = [...play.cards].map((card) => card.id).sort().join(',')
    const key = `${play.type}_${play.weight}_${cardsKey}`
    if (!seen.has(key)) seen.set(key, play)
  }
  return [...seen.values()]
}

function countSingles(cards: Card[]): number {
  const counts = new Map<number, number>()
  for (const card of cards) {
    counts.set(card.value, (counts.get(card.value) || 0) + 1)
  }
  let singles = 0
  for (const count of counts.values()) {
    if (count === 1) singles += 1
  }
  return singles
}

function rankPressure(value: number): number {
  if (value >= 16) return 7
  if (value >= 15) return 6
  if (value >= 14) return 4
  if (value >= 13) return 3
  if (value >= 11) return 2
  return 0
}

function partnerOf(selfPlayerId: number, landlordPlayerId: number): number {
  for (let playerId = 0; playerId < 3; playerId += 1) {
    if (playerId !== selfPlayerId && playerId !== landlordPlayerId) return playerId
  }
  return selfPlayerId
}

function shouldFarmerPassForPartner(context: AIDecisionContext): boolean {
  if (context.isLandlord) return false
  if (context.lastPlayPlayer < 0) return false
  if (context.lastPlayPlayer === context.landlordPlayerId) return false
  if (context.lastPlayPlayer === context.selfPlayerId) return false

  const teammateId = partnerOf(context.selfPlayerId, context.landlordPlayerId)
  if (context.lastPlayPlayer !== teammateId) return false

  const teammateHandCount = context.handCounts[teammateId]
  const landlordHandCount = context.handCounts[context.landlordPlayerId]

  if (teammateHandCount <= 2) return true
  if (landlordHandCount > 3) return true
  return false
}

function scoreOpeningPlay(play: PlayResult, hand: Card[], isLandlord: boolean): number {
  const remainingCards = hand.filter((card) => !new Set(play.cards.map((item) => item.id)).has(card.id))
  const singlesBefore = countSingles(hand)
  const singlesAfter = countSingles(remainingCards)
  const singlesDelta = singlesBefore - singlesAfter

  let score = play.cards.length * 16

  if (play.type === 'straight') score += 34 + play.cards.length * 2
  if (play.type === 'straight_pairs') score += 38 + play.cards.length * 2
  if (play.type === 'plane') score += 42
  if (play.type === 'plane_singles' || play.type === 'plane_pairs') score += 48
  if (play.type === 'triple' || play.type === 'triple_one' || play.type === 'triple_two') score += 20
  if (play.type === 'pair') score += 9
  if (play.type === 'single') score -= rankPressure(play.weight) * 2

  score += singlesDelta * 11

  if (play.type === 'bomb' || play.type === 'rocket') score -= 120
  if (remainingCards.length <= 4) score += 26
  if (!isLandlord && play.type === 'single' && play.weight >= 15) score -= 16

  return score
}

function scoreBeatingPlay(play: PlayResult, context: AIDecisionContext): number {
  const remainingCards = context.hand.filter((card) => !new Set(play.cards.map((item) => item.id)).has(card.id))
  const singlesBefore = countSingles(context.hand)
  const singlesAfter = countSingles(remainingCards)
  const singlesDelta = singlesBefore - singlesAfter
  const landlordHandCount = context.handCounts[context.landlordPlayerId]
  const isBlockingLandlord = !context.isLandlord && context.lastPlayPlayer === context.landlordPlayerId
  const teammateId = context.isLandlord ? -1 : partnerOf(context.selfPlayerId, context.landlordPlayerId)
  const teammateAlmostOut = teammateId >= 0 && context.handCounts[teammateId] <= 2

  let score = play.cards.length * 10
  score -= Math.max(0, play.weight - (context.lastPlay?.weight ?? 0)) * 4
  score += singlesDelta * 10

  if (play.type === 'pair') score += 8
  if (play.type === 'triple' || play.type === 'triple_one' || play.type === 'triple_two') score += 14
  if (play.type === 'straight' || play.type === 'straight_pairs') score += 22
  if (play.type === 'plane' || play.type === 'plane_singles' || play.type === 'plane_pairs') score += 28
  if (play.type === 'bomb' || play.type === 'rocket') score -= 95
  if (play.type === 'single') score -= rankPressure(play.weight) * 3

  if (remainingCards.length <= 3) score += 32
  if (landlordHandCount <= 2 && isBlockingLandlord) score += 30
  if (teammateAlmostOut && !context.isLandlord) score -= 18

  return score
}

export function aiDecideCards(
  hand: Card[],
  lastPlay: PlayResult | null,
  isLandlord: boolean,
  partnerHandLen: number,
  lastPlayPlayer = -1,
  selfPlayerId = -1,
  handCounts: number[] = [hand.length, hand.length, hand.length],
  landlordPlayerId = -1,
): PlayResult | null {
  const allPlays = deduplicatePlays(generateAllPlays(hand))
  allPlays.sort((left, right) => {
    if (left.type === 'rocket') return 1
    if (right.type === 'rocket') return -1
    if (left.type === 'bomb' && right.type !== 'bomb') return 1
    if (right.type === 'bomb' && left.type !== 'bomb') return -1
    if (left.cards.length !== right.cards.length) return right.cards.length - left.cards.length
    return left.weight - right.weight
  })

  if (!lastPlay) {
    const normalPlays = allPlays.filter((play) => play.type !== 'bomb' && play.type !== 'rocket')
    const candidatePlays = normalPlays.length > 0 ? normalPlays : allPlays

    let bestPlay: PlayResult | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const play of candidatePlays) {
      const score = scoreOpeningPlay(play, hand, isLandlord)
      if (score > bestScore) {
        bestScore = score
        bestPlay = play
      }
    }
    return bestPlay
  }

  const beatPlays = allPlays.filter((play) => canBeat(play, lastPlay))
  if (beatPlays.length === 0) return null

  const context: AIDecisionContext = {
    hand,
    lastPlay,
    lastPlayPlayer,
    selfPlayerId,
    isLandlord,
    handCounts,
    landlordPlayerId,
  }

  if (shouldFarmerPassForPartner(context)) return null

  const nonBombPlays = beatPlays.filter((play) => play.type !== 'bomb' && play.type !== 'rocket')
  const candidatePlays = nonBombPlays.length > 0 ? nonBombPlays : beatPlays

  let bestPlay: PlayResult | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const play of candidatePlays) {
    const score = scoreBeatingPlay(play, context)
    if (score > bestScore) {
      bestScore = score
      bestPlay = play
    }
  }

  if (!bestPlay) return null

  if ((bestPlay.type === 'bomb' || bestPlay.type === 'rocket') && hand.length > 5) {
    const landlordThreat = landlordPlayerId >= 0 && handCounts[landlordPlayerId] <= 2
    if (!landlordThreat) return null
  }

  if (!isLandlord && partnerHandLen <= 2 && lastPlayPlayer !== landlordPlayerId) {
    return null
  }

  return bestPlay
}

export function aiDecideBid(hand: Card[], currentHighestBid: number): number {
  let score = 0
  const counts = new Map<number, number>()

  for (const card of hand) {
    counts.set(card.value, (counts.get(card.value) || 0) + 1)
  }

  let bombs = 0
  for (const count of counts.values()) {
    if (count === 4) bombs += 1
  }
  if (counts.get(16) === 1 && counts.get(17) === 1) bombs += 1

  let highCards = 0
  for (const card of hand) {
    if (card.value >= 13) highCards += 1
  }

  score = bombs + Math.floor(highCards / 3)

  if (score >= currentHighestBid + 1) return Math.min(score, 3)
  if (currentHighestBid >= 3) return 0
  if (score >= 2 && currentHighestBid <= 1) return 2
  if (score >= 1 && currentHighestBid <= 0) return 1
  return 0
}

export function findHintPlay(hand: Card[], lastPlay: PlayResult | null): PlayResult | null {
  const allPlays = deduplicatePlays(generateAllPlays(hand))
  const legalPlays = allPlays.filter((play) => canBeat(play, lastPlay))
  if (legalPlays.length === 0) return null

  legalPlays.sort((left, right) => {
    if (left.type === 'rocket') return 1
    if (right.type === 'rocket') return -1
    if (left.type === 'bomb' && right.type !== 'bomb') return 1
    if (right.type === 'bomb' && left.type !== 'bomb') return -1
    if (left.cards.length !== right.cards.length) return right.cards.length - left.cards.length
    return left.weight - right.weight
  })

  const normalPlay = legalPlays.find((play) => play.type !== 'bomb' && play.type !== 'rocket')
  return normalPlay ?? legalPlays[0]
}
