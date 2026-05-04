import { create } from 'zustand'
import type { Card } from '../engine/card'
import type { GameState } from '../engine/game'
import {
  completeDealing,
  createInitialState,
  dealOneCard,
  pass,
  playCards,
  startDealing,
  submitBid,
} from '../engine/game'
import { aiDecideBid, aiDecideCards, findHintPlay } from '../engine/ai'

export interface SeatAction {
  id: number
  playerId: number
  label: string
  tone?: 'neutral' | 'accent' | 'warning'
}

export interface GameStore {
  gameState: GameState
  selectedCardIds: Set<string>
  playerId: number
  isProcessing: boolean
  bombTrigger: number
  dealTimerId: ReturnType<typeof setInterval> | null
  seatAction: SeatAction | null
  actionSerial: number

  startNewGame: () => void
  toggleCard: (cardId: string) => void
  clearSelection: () => void
  clearSeatAction: () => void
  playerBid: (score: number) => void
  playerPlayCards: () => void
  playerPass: () => void
  playerHint: () => void
  runAITurn: () => void
}

function startDealingLoop(set: (partial: Partial<GameStore>) => void, get: () => GameStore, initialState: GameState) {
  const existing = get().dealTimerId
  if (existing) clearInterval(existing)

  set({
    gameState: initialState,
    selectedCardIds: new Set(),
    isProcessing: true,
    seatAction: null,
  })

  const timer = setInterval(() => {
    const { gameState } = get()
    if (gameState.phase !== 'dealing') {
      clearInterval(timer)
      set({ dealTimerId: null })
      return
    }

    const result = dealOneCard(gameState)
    if (result === 'done') {
      clearInterval(timer)
      set({
        gameState: completeDealing(gameState),
        isProcessing: false,
        dealTimerId: null,
      })
      return
    }

    set({ gameState: result })
  }, 70)

  set({ dealTimerId: timer })
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: createInitialState(),
  selectedCardIds: new Set<string>(),
  playerId: 0,
  isProcessing: false,
  bombTrigger: 0,
  dealTimerId: null,
  seatAction: null,
  actionSerial: 0,

  startNewGame: () => {
    const dealingState = startDealing(createInitialState())
    startDealingLoop(set, get, dealingState)
  },

  toggleCard: (cardId: string) => {
    const { selectedCardIds, gameState, playerId } = get()
    const player = gameState.players[playerId]
    if (!player || !player.hand.some((card) => card.id === cardId)) return

    const next = new Set(selectedCardIds)
    if (next.has(cardId)) next.delete(cardId)
    else next.add(cardId)
    set({ selectedCardIds: next })
  },

  clearSelection: () => {
    set({ selectedCardIds: new Set() })
  },

  clearSeatAction: () => {
    set({ seatAction: null })
  },

  playerBid: (score: number) => {
    const { gameState, playerId, actionSerial } = get()
    if (gameState.phase !== 'bidding') return
    if (gameState.bidding.currentBidder !== playerId) return
    if (score < gameState.bidding.highestBid + 1 && score !== 0) return

    const newState = submitBid(gameState, playerId, score)
    const seatAction = {
      id: actionSerial + 1,
      playerId,
      label: score === 0 ? '不叫' : `${score}分`,
      tone: score === 0 ? 'neutral' as const : 'accent' as const,
    }

    if (newState.phase === 'dealing') {
      set({ actionSerial: actionSerial + 1, seatAction })
      startDealingLoop(set, get, newState)
      return
    }

    set({
      gameState: newState,
      seatAction,
      actionSerial: actionSerial + 1,
    })
  },

  playerPlayCards: () => {
    const { gameState, selectedCardIds, playerId, bombTrigger, actionSerial } = get()
    if (gameState.phase !== 'playing') return
    if (gameState.playing.currentPlayer !== playerId) return

    const player = gameState.players[playerId]
    const cards: Card[] = []
    for (const id of selectedCardIds) {
      const card = player.hand.find((candidate) => candidate.id === id)
      if (card) cards.push(card)
    }
    if (cards.length === 0) return

    const result = playCards(gameState, playerId, cards)
    if (result === 'invalid') return

    const isBomb = result.playing.lastPlay?.type === 'bomb' || result.playing.lastPlay?.type === 'rocket'
    set({
      gameState: result,
      selectedCardIds: new Set(),
      bombTrigger: isBomb ? bombTrigger + 1 : bombTrigger,
      seatAction: {
        id: actionSerial + 1,
        playerId,
        label: isBomb ? '炸弹' : '出牌',
        tone: 'accent',
      },
      actionSerial: actionSerial + 1,
    })
  },

  playerPass: () => {
    const { gameState, playerId, actionSerial } = get()
    if (gameState.phase !== 'playing') return
    if (gameState.playing.currentPlayer !== playerId) return
    if (!gameState.playing.lastPlay) return

    set({
      gameState: pass(gameState, playerId),
      selectedCardIds: new Set(),
      seatAction: {
        id: actionSerial + 1,
        playerId,
        label: '不出',
        tone: 'neutral',
      },
      actionSerial: actionSerial + 1,
    })
  },

  playerHint: () => {
    const { gameState, playerId } = get()
    if (gameState.phase !== 'playing') return
    if (gameState.playing.currentPlayer !== playerId) return

    const humanPlayer = gameState.players[playerId]
    let partnerHandLen = 0
    for (let index = 0; index < 3; index += 1) {
      if (index !== playerId && gameState.players[index].isLandlord === humanPlayer.isLandlord) {
        partnerHandLen = gameState.players[index].hand.length
      }
    }

    const hintedPlay = aiDecideCards(
      humanPlayer.hand,
      gameState.playing.lastPlay,
      humanPlayer.isLandlord,
      partnerHandLen,
      gameState.playing.lastPlayPlayer,
      playerId,
      gameState.players.map((player) => player.hand.length),
      gameState.players.find((player) => player.isLandlord)?.id ?? -1,
    )

    const fallbackPlay = hintedPlay ?? findHintPlay(humanPlayer.hand, gameState.playing.lastPlay)
    if (!fallbackPlay) {
      set({ selectedCardIds: new Set() })
      return
    }

    set({
      selectedCardIds: new Set(fallbackPlay.cards.map((card) => card.id)),
    })
  },

  runAITurn: () => {
    const { gameState, playerId, bombTrigger, actionSerial } = get()
    set({ isProcessing: true })

    if (gameState.phase === 'bidding') {
      const aiId = gameState.bidding.currentBidder
      if (aiId === playerId) {
        set({ isProcessing: false })
        return
      }

      const aiPlayer = gameState.players[aiId]
      const bid = aiDecideBid(aiPlayer.hand, gameState.bidding.highestBid)
      const newState = submitBid(gameState, aiId, bid)
      const seatAction = {
        id: actionSerial + 1,
        playerId: aiId,
        label: bid === 0 ? '不叫' : `${bid}分`,
        tone: bid === 0 ? 'neutral' as const : 'accent' as const,
      }

      if (newState.phase === 'dealing') {
        set({ isProcessing: false, seatAction, actionSerial: actionSerial + 1 })
        startDealingLoop(set, get, newState)
        return
      }

      set({
        gameState: newState,
        isProcessing: false,
        seatAction,
        actionSerial: actionSerial + 1,
      })
      return
    }

    if (gameState.phase === 'playing') {
      const aiId = gameState.playing.currentPlayer
      if (aiId === playerId) {
        set({ isProcessing: false })
        return
      }

      const aiPlayer = gameState.players[aiId]
      let partnerHandLen = 0
      for (let index = 0; index < 3; index += 1) {
        if (index !== aiId && gameState.players[index].isLandlord === aiPlayer.isLandlord) {
          partnerHandLen = gameState.players[index].hand.length
        }
      }

      const aiPlay = aiDecideCards(
        aiPlayer.hand,
        gameState.playing.lastPlay,
        aiPlayer.isLandlord,
        partnerHandLen,
        gameState.playing.lastPlayPlayer,
        aiId,
        gameState.players.map((player) => player.hand.length),
        gameState.players.find((player) => player.isLandlord)?.id ?? -1,
      )

      if (aiPlay) {
        const result = playCards(gameState, aiId, aiPlay.cards)
        if (result !== 'invalid') {
          const isBomb = result.playing.lastPlay?.type === 'bomb' || result.playing.lastPlay?.type === 'rocket'
          set({
            gameState: result,
            isProcessing: false,
            bombTrigger: isBomb ? bombTrigger + 1 : bombTrigger,
            seatAction: {
              id: actionSerial + 1,
              playerId: aiId,
              label: isBomb ? '炸弹' : '出牌',
              tone: 'accent',
            },
            actionSerial: actionSerial + 1,
          })
          return
        }
      }

      if (gameState.playing.lastPlay) {
        set({
          gameState: pass(gameState, aiId),
          isProcessing: false,
          seatAction: {
            id: actionSerial + 1,
            playerId: aiId,
            label: '不出',
            tone: 'neutral',
          },
          actionSerial: actionSerial + 1,
        })
        return
      }
    }

    set({ isProcessing: false })
  },
}))
