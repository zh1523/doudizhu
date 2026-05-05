interface BiddingPanelProps {
  isCurrentBidder: boolean
  highestBid: number
  onBid: (score: number) => void
}

export function BiddingPanel({ isCurrentBidder, highestBid, onBid }: BiddingPanelProps) {
  if (!isCurrentBidder) {
    return (
      <div className="bidding-panel bidding-panel--waiting">
        <span className="status-dot" />
        <span>等待其他玩家叫地主</span>
      </div>
    )
  }

  const availableBids = [1, 2, 3].filter((score) => score > highestBid)

  return (
    <div className="bidding-panel">
      <div className="bidding-panel__title">
        {highestBid > 0 ? `当前最高 ${highestBid} 分` : '请叫地主'}
      </div>
      <div className="bidding-panel__actions">
        <button type="button" onClick={() => onBid(0)} className="bid-button bid-button--pass">
          不叫
        </button>
        {availableBids.map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onBid(score)}
            className={`bid-button bid-button--score bid-button--score-${score}`}
          >
            {score} 分
          </button>
        ))}
      </div>
    </div>
  )
}
