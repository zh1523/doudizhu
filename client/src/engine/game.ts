import type { Card } from './card'
import { createDeck, shuffle, deal, sortCards } from './card'
import { detectHand, type PlayResult } from './hand'
import { canBeat } from './compare'

export type Phase = 'idle' | 'dealing' | 'bidding' | 'playing' | 'game_over'

export interface PlayerState {
  id: number
  hand: Card[]
  isLandlord: boolean
}

export interface BiddingState {
  currentBidder: number
  highestBid: number
  highestBidder: number
  bids: number[]
  passesSinceRaise: number
  turnCount: number
}

export interface PlayingState {
  currentPlayer: number
  lastPlay: PlayResult | null
  lastPlayPlayer: number
  passCount: number
  bombCount: number
  springPlayerLandlord: boolean
  springPlayerFarmer: boolean
}

export interface DealingState {
  deck: Card[]
  bottom: Card[]
  previewHands: Card[][]
  dealtCount: number
  firstBidder: number
  visibleCounts: [number, number, number]
}

export interface GameState {
  phase: Phase
  players: PlayerState[]
  bottom: Card[]
  bidding: BiddingState
  playing: PlayingState
  dealing: DealingState
  winner: number | null
  baseScore: number
  multiplier: number
}

export function createInitialState(): GameState {
  return {
    phase: 'idle',
    players: [
      { id: 0, hand: [], isLandlord: false },
      { id: 1, hand: [], isLandlord: false },
      { id: 2, hand: [], isLandlord: false },
    ],
    bottom: [],
    dealing: {
      deck: [],
      bottom: [],
      previewHands: [[], [], []],
      dealtCount: 0,
      firstBidder: 0,
      visibleCounts: [0, 0, 0],
    },
    bidding: {
      currentBidder: 0,
      highestBid: 0,
      highestBidder: -1,
      bids: [-1, -1, -1],
      passesSinceRaise: 0,
      turnCount: 0,
    },
    playing: {
      currentPlayer: 0,
      lastPlay: null,
      lastPlayPlayer: -1,
      passCount: 0,
      bombCount: 0,
      springPlayerLandlord: true,
      springPlayerFarmer: true,
    },
    winner: null,
    baseScore: 1,
    multiplier: 1,
  }
}

export function startDealing(state: GameState): GameState {
  const deck = shuffle(createDeck())
  const { hands, bottom } = deal(deck)
  const next = { ...state }
  next.phase = 'dealing'
  next.dealing = {
    deck,
    bottom,
    previewHands: hands.map((hand) => sortCards(hand)),
    dealtCount: 0,
    firstBidder: Math.floor(Math.random() * 3),
    visibleCounts: [0, 0, 0],
  }
  next.players = state.players.map((player) => ({
    ...player,
    hand: [],
    isLandlord: false,
  }))
  next.bottom = []
  next.winner = null
  next.baseScore = 1
  next.multiplier = 1
  next.bidding = {
    currentBidder: 0,
    highestBid: 0,
    highestBidder: -1,
    bids: [-1, -1, -1],
    passesSinceRaise: 0,
    turnCount: 0,
  }
  next.playing = {
    currentPlayer: 0,
    lastPlay: null,
    lastPlayPlayer: -1,
    passCount: 0,
    bombCount: 0,
    springPlayerLandlord: true,
    springPlayerFarmer: true,
  }
  return next
}

export function dealOneCard(state: GameState): GameState | 'done' {
  if (state.phase !== 'dealing') return 'done'

  const dealtCount = state.dealing.dealtCount
  if (dealtCount >= 51) return 'done'

  const playerIdx = dealtCount % 3
  const visibleCounts = [...state.dealing.visibleCounts] as [number, number, number]
  visibleCounts[playerIdx] += 1

  return {
    ...state,
    dealing: {
      ...state.dealing,
      dealtCount: dealtCount + 1,
      visibleCounts,
    },
  }
}

export function completeDealing(state: GameState): GameState {
  const hands = state.dealing.previewHands
  const bottom = state.dealing.bottom
  return {
    ...state,
    phase: 'bidding',
    players: state.players.map((player, index) => ({
      ...player,
      hand: sortCards(hands[index]),
      isLandlord: false,
    })),
    bottom,
    bidding: {
      currentBidder: state.dealing.firstBidder,
      highestBid: 0,
      highestBidder: -1,
      bids: [-1, -1, -1],
      passesSinceRaise: 0,
      turnCount: 0,
    },
    playing: {
      currentPlayer: 0,
      lastPlay: null,
      lastPlayPlayer: -1,
      passCount: 0,
      bombCount: 0,
      springPlayerLandlord: true,
      springPlayerFarmer: true,
    },
    winner: null,
    baseScore: 1,
    multiplier: 1,
  }
}

export function startGame(state: GameState): GameState {
  return startDealing(state)
}

export function submitBid(state: GameState, playerId: number, score: number): GameState {
  const next = {
    ...state,
    bidding: {
      ...state.bidding,
      bids: [...state.bidding.bids],
    },
  }
  const bid = next.bidding

  bid.bids[playerId] = score
  bid.turnCount += 1

  let didRaise = false
  if (score > bid.highestBid) {
    bid.highestBid = score
    bid.highestBidder = playerId
    bid.passesSinceRaise = 0
    didRaise = true
  } else {
    bid.passesSinceRaise += 1
  }

  if (score >= 3) {
    return assignLandlord(next, playerId, score)
  }

  if (bid.highestBid === 0 && bid.turnCount >= 3 && bid.passesSinceRaise >= 3) {
    return startDealing(createInitialState())
  }

  if (bid.highestBid > 0 && !didRaise && bid.passesSinceRaise >= 2) {
    return assignLandlord(next, bid.highestBidder, bid.highestBid)
  }

  bid.currentBidder = nextPlayer(playerId)
  return next
}

function assignLandlord(state: GameState, landlordId: number, bidScore: number): GameState {
  const next = {
    ...state,
    phase: 'playing' as Phase,
    players: state.players.map((player) => ({
      ...player,
      isLandlord: player.id === landlordId,
      hand: player.id === landlordId
        ? sortCards([...player.hand, ...state.bottom])
        : [...player.hand],
    })),
    playing: {
      currentPlayer: landlordId,
      lastPlay: null,
      lastPlayPlayer: -1,
      passCount: 0,
      bombCount: 0,
      springPlayerLandlord: true,
      springPlayerFarmer: true,
    },
    baseScore: bidScore,
    multiplier: 1,
    winner: null,
  }

  return next
}

export function playCards(state: GameState, playerId: number, cards: Card[]): GameState | 'invalid' {
  const hand = detectHand(cards)
  if (!hand) return 'invalid'

  if (!canBeat(hand, state.playing.lastPlay)) return 'invalid'

  const next = { ...state }
  const player = { ...next.players[playerId] }
  const handIds = new Set(cards.map((card) => card.id))
  player.hand = player.hand.filter((card) => !handIds.has(card.id))
  next.players = next.players.map((candidate, index) => (index === playerId ? player : candidate))

  const play = { ...next.playing }
  play.lastPlay = hand
  play.lastPlayPlayer = playerId
  play.passCount = 0

  if (hand.type === 'bomb' || hand.type === 'rocket') {
    play.bombCount += 1
  }

  if (player.hand.length === 0) {
    next.phase = 'game_over'
    next.winner = player.isLandlord ? 0 : 1
    next.multiplier = next.baseScore * Math.pow(2, play.bombCount)

    const farmers = next.players.filter((candidate) => !candidate.isLandlord)
    if (next.winner === 0) {
      if (farmers.every((farmer) => farmer.hand.length === 17)) {
        next.multiplier *= 2
      }
    } else {
      const landlord = next.players.find((candidate) => candidate.isLandlord)
      if (landlord && landlord.hand.length === 20) {
        next.multiplier *= 2
      }
    }
  } else {
    play.currentPlayer = nextPlayer(playerId)
  }

  next.playing = play
  return next
}

export function pass(state: GameState, playerId: number): GameState {
  const play = { ...state.playing }
  play.passCount += 1
  play.springPlayerLandlord = false
  play.springPlayerFarmer = false
  play.currentPlayer = nextPlayer(playerId)

  if (play.passCount >= 2) {
    play.lastPlay = null
    play.lastPlayPlayer = -1
    play.passCount = 0
  }

  return {
    ...state,
    playing: play,
  }
}

function nextPlayer(currentPlayer: number): number {
  return (currentPlayer + 1) % 3
}
