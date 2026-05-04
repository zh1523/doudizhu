export function PlayerBadge({
  playerId,
  currentPlayerId,
  name,
  cardCount,
  isLandlord,
  phase,
}: {
  playerId: number
  currentPlayerId: number
  name: string
  cardCount: number
  isLandlord: boolean
  phase: string
}) {
  const isCurrentTurn =
    (phase === 'bidding' || phase === 'playing') && playerId === currentPlayerId

  return (
    <div className={`player-badge ${isCurrentTurn ? 'is-active' : ''}`}>
      <div className={`player-badge__avatar ${isLandlord ? 'is-landlord' : 'is-farmer'}`}>
        {name.slice(0, 1)}
      </div>
      <div className="player-badge__meta">
        <div className="player-badge__name">{name}</div>
        <div className="player-badge__tags">
          <span className={`player-role ${isLandlord ? 'is-landlord' : 'is-farmer'}`}>
            {isLandlord ? '地主' : '农民'}
          </span>
          <span className="player-count">{cardCount} 张</span>
        </div>
      </div>
    </div>
  )
}
