import type { Card } from '../engine/card.js'
import { sortCards } from '../engine/card.js'
import {
  createInitialState,
  startDealing,
  dealOneCard,
  completeDealing,
  submitBid,
  playCards,
  pass,
  type GameState,
} from '../engine/game.js'
import { aiDecideCards, aiDecideBid } from '../engine/ai.js'
import type { Room } from '../models/room.js'
import { beginGame } from './history.js'
import { syncRoom } from './redis.js'

function rotateForViewer(state: GameState, viewerSeat: number): GameState {
  if (viewerSeat === 0) return state
  const rot = viewerSeat
  const players = [
    { ...state.players[rot] },
    { ...state.players[(rot + 1) % 3] },
    { ...state.players[(rot + 2) % 3] },
  ]
  players[0].id = 0
  players[1].id = 1
  players[2].id = 2

  const oldToNew = new Map<number, number>()
  oldToNew.set(rot, 0)
  oldToNew.set((rot + 1) % 3, 1)
  oldToNew.set((rot + 2) % 3, 2)

  const newState: GameState = {
    ...state,
    players: players as GameState['players'],
    playing: {
      ...state.playing,
      currentPlayer: oldToNew.get(state.playing.currentPlayer) ?? 0,
      lastPlayPlayer: state.playing.lastPlayPlayer >= 0
        ? (oldToNew.get(state.playing.lastPlayPlayer) ?? -1)
        : -1,
    },
    bidding: {
      ...state.bidding,
      currentBidder: oldToNew.get(state.bidding.currentBidder) ?? 0,
      highestBidder: state.bidding.highestBidder >= 0
        ? (oldToNew.get(state.bidding.highestBidder) ?? -1)
        : -1,
    },
  }

  return newState
}

export interface GameCallbacks {
  broadcastState: (room: Room) => void
  onGameOver: (room: Room, winner: number) => void
}

export function startRoomGame(room: Room, callbacks: GameCallbacks): Room {
  const state = createInitialState()

  room.players.forEach((p, i) => { p.seat = i; p.isReady = false })
  room.phase = 'playing'
  room.gameStartTime = new Date()

  // Phase 1: start dealing
  let gs = startDealing(state)
  room.gameState = gs

  // Write game start record (status='playing')
  beginGame(room.id, room.mode,
    room.players.map(p => ({ name: p.name, isLandlord: false, won: false })),
    gs.baseScore,
  )

  // Sync room state to Redis
  syncRoom(room.id, {
    id: room.id, mode: room.mode, phase: room.phase,
    playerCount: room.players.length, maxPlayers: 3,
    players: room.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isReady: p.isReady, isOnline: p.isOnline,
    })),
  })

  callbacks.broadcastState(room)

  // Phase 2: deal cards progressively (3 cards per tick, ~50ms per tick, 17 ticks ≈ 0.85s)
  let dealt = 0
  const dealInterval = setInterval(() => {
    for (let i = 0; i < 3 && dealt < 51; i++) {
      const result = dealOneCard(gs)
      if (result === 'done') break
      gs = result
      dealt++
    }
    room.gameState = gs
    callbacks.broadcastState(room)

    if (dealt >= 51) {
      clearInterval(dealInterval)
      // Phase 3: complete dealing → bidding
      gs = completeDealing(gs)
      room.gameState = gs
      callbacks.broadcastState(room)
      scheduleAITurnIfNeeded(room, callbacks)
    }
  }, 50)

  return room
}

export function handleBid(room: Room, playerId: string, score: number, callbacks: GameCallbacks): Room {
  if (!room.gameState || room.phase !== 'playing') return room
  const gs = room.gameState
  if (gs.phase !== 'bidding') return room

  const player = room.players.find(p => p.id === playerId)
  if (!player || gs.bidding.currentBidder !== player.seat) return room

  const newState = submitBid(gs, player.seat, score)
  room.gameState = newState

  if (newState.phase === 'dealing') {
    // All passed — re-deal, skip animation
    const bidState = completeDealing(newState)
    room.gameState = bidState
    callbacks.broadcastState(room)
    scheduleAITurnIfNeeded(room, callbacks)
  } else if (newState.phase === 'playing') {
    callbacks.broadcastState(room)
    scheduleAITurnIfNeeded(room, callbacks)
  } else if (newState.phase === 'bidding') {
    callbacks.broadcastState(room)
  }

  return room
}

export function handlePlay(room: Room, playerId: string, cardIds: string[], callbacks: GameCallbacks): Room {
  if (!room.gameState || room.phase !== 'playing') return room
  const gs = room.gameState
  if (gs.phase !== 'playing') return room

  const player = room.players.find(p => p.id === playerId)
  if (!player || gs.playing.currentPlayer !== player.seat) return room

  const cards: Card[] = []
  for (const cid of cardIds) {
    const card = gs.players[player.seat].hand.find((c: Card) => c.id === cid)
    if (card) cards.push(card)
  }
  if (cards.length === 0) return room

  const result = playCards(gs, player.seat, cards)
  if (result === 'invalid') return room

  room.gameState = result

  if (result.phase === 'game_over') {
    callbacks.broadcastState(room)
    callbacks.onGameOver(room, result.winner ?? -1)
  } else {
    callbacks.broadcastState(room)
    scheduleAITurnIfNeeded(room, callbacks)
  }

  return room
}

export function handlePass(room: Room, playerId: string, callbacks: GameCallbacks): Room {
  if (!room.gameState || room.phase !== 'playing') return room
  const gs = room.gameState
  if (gs.phase !== 'playing') return room
  if (!gs.playing.lastPlay) return room

  const player = room.players.find(p => p.id === playerId)
  if (!player || gs.playing.currentPlayer !== player.seat) return room

  const newState = pass(gs, player.seat)
  room.gameState = newState
  callbacks.broadcastState(room)
  scheduleAITurnIfNeeded(room, callbacks)

  return room
}

function scheduleAITurnIfNeeded(room: Room, callbacks: GameCallbacks) {
  if (room.mode !== 'ai') return
  if (!room.gameState) return

  const gs = room.gameState

  if (gs.phase === 'bidding') {
    const aiSeat = gs.bidding.currentBidder
    if (aiSeat === 0) return
    setTimeout(() => runAIBid(room, aiSeat, callbacks), 800 + Math.random() * 700)
    return
  }

  if (gs.phase === 'playing') {
    const aiSeat = gs.playing.currentPlayer
    if (aiSeat === 0) return
    setTimeout(() => runAIPlay(room, aiSeat, callbacks), 1000 + Math.random() * 500)
  }
}

function runAIBid(room: Room, aiSeat: number, callbacks: GameCallbacks) {
  if (!room.gameState || room.gameState.phase !== 'bidding') return
  const gs = room.gameState
  const hand = gs.players[aiSeat].hand
  const score = aiDecideBid(hand, gs.bidding.highestBid)

  const newState = submitBid(gs, aiSeat, score)
  room.gameState = newState
  callbacks.broadcastState(room)

  if (newState.phase === 'dealing') {
    // All passed — re-deal, skip animation
    const bidState = completeDealing(newState)
    room.gameState = bidState
    callbacks.broadcastState(room)
    scheduleAITurnIfNeeded(room, callbacks)
  } else if (newState.phase === 'bidding') {
    scheduleAITurnIfNeeded(room, callbacks)
  } else if (newState.phase === 'playing') {
    scheduleAITurnIfNeeded(room, callbacks)
  }
}

function runAIPlay(room: Room, aiSeat: number, callbacks: GameCallbacks) {
  if (!room.gameState || room.gameState.phase !== 'playing') return
  const gs = room.gameState
  if (gs.playing.currentPlayer !== aiSeat) return

  const hand = gs.players[aiSeat].hand
  const isLandlord = gs.players[aiSeat].isLandlord
  const landlordSeat = gs.players.findIndex((p) => p.isLandlord)
  const allSeats = [0, 1, 2]
  const partnerSeat = isLandlord ? -1 : allSeats.find(s => s !== aiSeat && s !== landlordSeat) ?? -1
  let partnerHandLen = 0
  if (!isLandlord && partnerSeat >= 0) {
    partnerHandLen = gs.players[partnerSeat].hand.length
  }

  const handCounts = gs.players.map((p) => p.hand.length)
  const play = aiDecideCards(hand, gs.playing.lastPlay, isLandlord, partnerHandLen,
    gs.playing.lastPlayPlayer, aiSeat, handCounts, landlordSeat)

  if (play) {
    const result = playCards(gs, aiSeat, play.cards)
    if (result !== 'invalid') {
      room.gameState = result
      if (result.phase === 'game_over') {
        callbacks.broadcastState(room)
        callbacks.onGameOver(room, result.winner ?? -1)
        return
      }
      callbacks.broadcastState(room)
      scheduleAITurnIfNeeded(room, callbacks)
      return
    }
  }

  if (gs.playing.lastPlay) {
    const passState = pass(gs, aiSeat)
    room.gameState = passState
    callbacks.broadcastState(room)
    scheduleAITurnIfNeeded(room, callbacks)
  }
}

export { rotateForViewer }
