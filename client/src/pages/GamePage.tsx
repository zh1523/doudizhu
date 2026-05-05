import { useEffect, useState } from 'react'
import { useNetworkStore } from '../store/networkStore'
import { findHintPlay } from '../engine/ai'
import { CardView } from '../components/Card'
import { GameControls } from '../components/GameControls'
import { PlayerHand } from '../components/PlayerHand'
import { PlayerBadge } from '../components/GameInfo'
import { BiddingPanel } from '../components/BiddingPanel'
import type { Card } from '../engine/card'

export function GamePage() {
  const gameState = useNetworkStore(s => s.gameState)
  const currentRoom = useNetworkStore(s => s.currentRoom)
  const playerId = useNetworkStore(s => s.playerId)
  const gameOver = useNetworkStore(s => s.gameOver)
  const toggleReady = useNetworkStore(s => s.toggleReady)
  const leaveRoom = useNetworkStore(s => s.leaveRoom)
  const sendBid = useNetworkStore(s => s.sendBid)
  const sendPlay = useNetworkStore(s => s.sendPlay)
  const sendPass = useNetworkStore(s => s.sendPass)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  if (!currentRoom) return null

  // === Pre-game state: waiting for game to start ===
  if (!gameState) {
    const players = currentRoom.players
    const onlinePlayers = players.filter(p => p.isOnline)
    const selfPlayer = players.find(p => p.id === playerId)
    const selfReady = selfPlayer?.isReady ?? false
    const maxPlayers = currentRoom.maxPlayers
    const isAI = currentRoom.mode === 'ai'
    const getSeatPlayer = (seat: number) => players.find(p => p.seat === seat)
    const seat1Player = getSeatPlayer(1)
    const seat2Player = getSeatPlayer(2)

    return (
      <div className="table-shell">
        <div className="table-shell__background" />

        <div className="table-layout">
          <header className="table-header">
            <div className="table-brand">
              <span className="table-brand__eyebrow">{isAI ? 'AI 对局' : '玩家对局'}</span>
              <h1>房间 {currentRoom.id.replace('room_', '')}</h1>
            </div>
            <div className="table-status">
              <span>{onlinePlayers.length}/{maxPlayers} 人在线</span>
            </div>
            <div className="bottom-pile">
              <div className="bottom-pile__label">操作</div>
              <div className="flex gap-2">
                <button onClick={leaveRoom}
                  className="px-4 py-1.5 rounded-full font-bold text-xs cursor-pointer text-white"
                  style={{ background: 'linear-gradient(180deg, #6a7c95, #4d5d73)' }}>
                  离开
                </button>
              </div>
            </div>
          </header>

          <aside className="seat-panel seat-panel--left">
            {seat1Player ? (
              <PlayerBadge playerId={1} currentPlayerId={-1}
                name={seat1Player.name} cardCount={0}
                isLandlord={false} phase="idle" />
            ) : (
              <div className="player-badge" style={{ opacity: 0.4 }}>
                <div className="player-badge__avatar" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>?</div>
                <div className="player-badge__meta"><span className="player-badge__name">虚位以待</span></div>
              </div>
            )}
            {seat1Player && (
              <div className="seat-stage seat-stage--left">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${seat1Player.isReady ? 'text-yellow-400 bg-yellow-500/10' : 'text-white/30 bg-white/5'}`}>
                  {seat1Player.isReady ? '已准备' : '未准备'}
                </span>
              </div>
            )}
          </aside>

          <main className="table-center">
            <div className="table-emblem">
              <div className="table-emblem__ring" />
              <div className="table-emblem__text">DOU DIZHU</div>
            </div>
            <div className="table-center__panel">
              <div className="table-center__title">等待开始</div>
              <div className="table-center__subtitle">
                {isAI ? '准备后立即开始' : `${onlinePlayers.length}/${maxPlayers} 人，全部准备后开始`}
              </div>
              <div className="action-bar" style={{ marginTop: 12 }}>
                <button onClick={toggleReady} className="action-button"
                  style={{
                    background: selfReady
                      ? 'linear-gradient(180deg, #6a7c95, #4d5d73)'
                      : 'linear-gradient(180deg, #ffcf66, #f28c35)',
                  }}>
                  {selfReady ? '取消准备' : '准 备'}
                </button>
              </div>
            </div>
          </main>

          <aside className="seat-panel seat-panel--right">
            {seat2Player ? (
              <PlayerBadge playerId={2} currentPlayerId={-1}
                name={seat2Player.name} cardCount={0}
                isLandlord={false} phase="idle" />
            ) : (
              <div className="player-badge" style={{ opacity: 0.4 }}>
                <div className="player-badge__avatar" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>?</div>
                <div className="player-badge__meta"><span className="player-badge__name">虚位以待</span></div>
              </div>
            )}
            {seat2Player && (
              <div className="seat-stage seat-stage--right" style={{ paddingTop: 12 }}>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${seat2Player.isReady ? 'text-yellow-400 bg-yellow-500/10' : 'text-white/30 bg-white/5'}`}>
                  {seat2Player.isReady ? '已准备' : '未准备'}
                </span>
              </div>
            )}
          </aside>

          <footer className="player-dock">
            <div className="self-badge-corner">
              <PlayerBadge playerId={0} currentPlayerId={-1}
                name={selfPlayer?.name ?? '你'} cardCount={0}
                isLandlord={false} phase="idle" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${selfReady ? 'text-yellow-400 bg-yellow-500/10' : 'text-white/30 bg-white/5'}`}>
                {selfReady ? '已准备' : '未准备'}
              </span>
            </div>
          </footer>
        </div>

        {gameOver && (
          <div className="result-overlay">
            <div className="result-panel">
              <h1 className={`result-panel__title ${gameOver.winner === 0 ? 'is-win' : 'is-loss'}`}>
                {gameOver.winner === 0 ? '你赢了！' : '你输了'}
              </h1>
              <div className="result-panel__stats"><span>倍数 ×{gameOver.multiplier}</span></div>
              <button onClick={leaveRoom} className="result-panel__button">返回大厅</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // === In-game state: dealing / bidding / playing ===
  const { phase, players: gsPlayers, bottom, playing, bidding, dealing } = gameState
  const selfPlayer = gsPlayers[0]
  const leftPlayer = gsPlayers[1]
  const rightPlayer = gsPlayers[2]

  const currentTurnId = phase === 'bidding' ? bidding.currentBidder
    : phase === 'playing' ? playing.currentPlayer
    : -1
  const isMyTurn = currentTurnId === 0

  const getPlayerName = (seat: number) => {
    const p = currentRoom.players.find(pl => pl.seat === seat)
    return p?.name ?? `玩家${seat + 1}`
  }

  const toggleCard = (id: string) => {
    if (phase !== 'playing' || !isMyTurn) return
    const next = new Set(selectedIds)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    setSelectedIds(next)
  }

  const handlePlay = () => {
    if (selectedIds.size === 0) return
    sendPlay(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  const handleHint = () => {
    if (phase !== 'playing' || !isMyTurn) return
    const hint = findHintPlay(selfPlayer.hand, playing.lastPlay)
    if (hint) setSelectedIds(new Set(hint.cards.map(c => c.id)))
  }

  // Reset selection when phase or turn changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [phase, isMyTurn])

  const hintAvailable = phase === 'playing' && isMyTurn
    && findHintPlay(selfPlayer.hand, playing.lastPlay) !== null

  const leftVisible = phase === 'dealing' ? dealing.visibleCounts[leftPlayer.id] : leftPlayer.hand.length
  const rightVisible = phase === 'dealing' ? dealing.visibleCounts[rightPlayer.id] : rightPlayer.hand.length
  const selfVisible = phase === 'dealing' ? dealing.visibleCounts[0] : selfPlayer.hand.length
  const selfCards = phase === 'dealing'
    ? dealing.previewHands[0].slice(0, selfVisible)
    : selfPlayer.hand

  const centerStatus = (() => {
    if (phase === 'dealing') return `发牌中 ${dealing.dealtCount} / 51`
    if (phase === 'bidding') {
      return bidding.currentBidder === 0
        ? '轮到你叫地主'
        : `等待 ${getPlayerName(bidding.currentBidder)} 叫地主`
    }
    if (phase === 'playing') {
      if (playing.lastPlay === null) {
        return playing.currentPlayer === 0 ? '新的一轮，请出牌' : '等待其他玩家出牌'
      }
      return playing.currentPlayer === 0
        ? '轮到你出牌'
        : `等待 ${getPlayerName(playing.currentPlayer)} 出牌`
    }
    return ''
  })()

  return (
    <div className="table-shell">
      <div className="table-shell__background" />

      <div className="table-layout">
        <header className="table-header">
          <div className="table-brand">
            <span className="table-brand__eyebrow">
              {currentRoom.mode === 'ai' ? 'AI 对局' : '玩家对局'}
            </span>
            <h1>房间 {currentRoom.id.replace('room_', '')}</h1>
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
          <div className="bottom-pile">
            <div className="bottom-pile__label">底牌</div>
            <div className="bottom-pile__cards">
              {(phase === 'playing' ? bottom : [{ suit: 'spade', rank: '', value: 0, id: 'b1' } as Card, { suit: 'spade', rank: '', value: 0, id: 'b2' } as Card, { suit: 'spade', rank: '', value: 0, id: 'b3' } as Card]).map(card => (
                <CardView key={card.id} card={card} faceDown={phase !== 'playing'} width={42} />
              ))}
            </div>
          </div>
        </header>

        {/* Left: seat 1 */}
        <aside className="seat-panel seat-panel--left">
          <PlayerBadge playerId={1} currentPlayerId={currentTurnId}
            name={getPlayerName(1)} cardCount={leftVisible}
            isLandlord={leftPlayer.isLandlord} phase={phase} />
          <div className="seat-stage seat-stage--left">
            <PlayerHand cards={leftPlayer.hand} layout="side" faceDown
              countOverride={leftVisible} align="left" />
            <div className="seat-table-slot seat-table-slot--left">
              {phase === 'playing' && playing.lastPlay && playing.lastPlayPlayer === 1 && (
                <div className="flex gap-0.5">
                  {playing.lastPlay.cards.map((c: Card) => <CardView key={c.id} card={c} width={68} topOnly />)}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center */}
        <main className="table-center">
          <div className="table-emblem">
            <div className="table-emblem__ring" />
            <div className="table-emblem__text">DOU DIZHU</div>
          </div>

          {phase === 'dealing' && (
            <div className="table-center__panel">
              <div className="table-center__title">发牌中</div>
              <div className="deal-progress">
                <div className="deal-progress__track">
                  <div className="deal-progress__fill"
                    style={{ width: `${(dealing.dealtCount / 51) * 100}%` }} />
                </div>
                <span>{dealing.dealtCount} / 51</span>
              </div>
            </div>
          )}

          {phase === 'bidding' && (
            <div className="table-center__panel">
              <div className="table-center__title">叫地主阶段</div>
              <div className="table-center__subtitle">
                当前最高分 {bidding.highestBid}，由 {bidding.highestBidder >= 0 ? getPlayerName(bidding.highestBidder) : '暂无'} 持有
              </div>
              {bidding.currentBidder === 0 ? (
                <BiddingPanel isCurrentBidder highestBid={bidding.highestBid} onBid={sendBid} />
              ) : (
                <div className="bidding-panel bidding-panel--waiting">
                  <span className="status-dot" />
                  <span>{getPlayerName(bidding.currentBidder)} 正在考虑</span>
                </div>
              )}
            </div>
          )}

          {phase === 'playing' && (
            <div className="table-center__panel table-center__panel--compact">
              <div className="table-center__title">对局进行中</div>
              <div className="table-center__subtitle">{centerStatus}</div>
            </div>
          )}
        </main>

        {/* Right: seat 2 */}
        <aside className="seat-panel seat-panel--right">
          <PlayerBadge playerId={2} currentPlayerId={currentTurnId}
            name={getPlayerName(2)} cardCount={rightVisible}
            isLandlord={rightPlayer.isLandlord} phase={phase} />
          <div className="seat-stage seat-stage--right">
            <div className="seat-table-slot seat-table-slot--right">
              {phase === 'playing' && playing.lastPlay && playing.lastPlayPlayer === 2 && (
                <div className="flex gap-0.5">
                  {playing.lastPlay.cards.map((c: Card) => <CardView key={c.id} card={c} width={68} topOnly />)}
                </div>
              )}
            </div>
            <PlayerHand cards={rightPlayer.hand} layout="side" faceDown
              countOverride={rightVisible} align="right" />
          </div>
        </aside>

        {/* Bottom: self (seat 0) */}
        <footer className="player-dock">
          <div className="player-dock__topline">
            {phase === 'playing' && playing.lastPlay && playing.lastPlayPlayer === 0 && (
              <div className="flex gap-0.5">
                {playing.lastPlay.cards.map((c: Card) => <CardView key={c.id} card={c} width={68} topOnly />)}
              </div>
            )}
          </div>

          {phase === 'playing' && isMyTurn && (
            <GameControls canPlay canPass={playing.lastPlay !== null} canHint={hintAvailable}
              onPlay={handlePlay} onPass={sendPass} onHint={handleHint} selectedCount={selectedIds.size} />
          )}

          <div className="self-badge-corner">
            <PlayerBadge playerId={0} currentPlayerId={currentTurnId}
              name={getPlayerName(0)} cardCount={selfVisible}
              isLandlord={selfPlayer.isLandlord} phase={phase} />
          </div>

          <PlayerHand cards={selfCards}
            selectedIds={phase === 'playing' ? selectedIds : new Set()}
            onToggleCard={toggleCard}
            disabled={phase !== 'playing' || !isMyTurn}
            layout="self" availableWidth={800} />
        </footer>
      </div>

      {gameOver && (
        <div className="result-overlay">
          <div className="result-panel">
            <h1 className={`result-panel__title ${gameOver.winner === 0 ? 'is-win' : 'is-loss'}`}>
              {gameOver.winner === 0 ? '你赢了！' : '你输了'}
            </h1>
            <div className="result-panel__stats"><span>倍数 ×{gameOver.multiplier}</span></div>
            <button onClick={leaveRoom} className="result-panel__button">返回大厅</button>
          </div>
        </div>
      )}
    </div>
  )
}
