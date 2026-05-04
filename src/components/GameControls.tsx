interface GameControlsProps {
  canPlay: boolean
  canPass: boolean
  canHint: boolean
  onPlay: () => void
  onPass: () => void
  onHint?: () => void
  selectedCount: number
}

export function GameControls({
  canPlay,
  canPass,
  canHint,
  onPlay,
  onPass,
  onHint,
  selectedCount,
}: GameControlsProps) {
  return (
    <div className="action-bar">
      <button
        type="button"
        onClick={onPlay}
        disabled={!canPlay || selectedCount === 0}
        className="action-button action-button--primary"
      >
        出牌
      </button>

      {onHint && (
        <button
          type="button"
          onClick={onHint}
          disabled={!canHint}
          className="action-button action-button--secondary"
        >
          提示
        </button>
      )}

      <button
        type="button"
        onClick={onPass}
        disabled={!canPass}
        className="action-button action-button--ghost"
      >
        不出
      </button>
    </div>
  )
}
