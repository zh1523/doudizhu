import { useEffect, useState } from 'react'
import { useNetworkStore } from '../store/networkStore'

export function LobbyPage() {
  const { rooms, history, playerName, playerId, createRoom, joinRoom, socket } = useNetworkStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmMode, setConfirmMode] = useState<'pvp' | 'ai'>('ai')

  useEffect(() => {
    if (socket?.connected) {
      socket.emit('lobby:history')
    }
  }, [socket?.connected])

  const historyList = (Array.isArray(history) ? history : []) as Array<Record<string, unknown>>

  const handleSelectMode = (mode: 'pvp' | 'ai') => {
    setConfirmMode(mode)
    setShowCreateModal(false)
    setShowConfirmModal(true)
  }

  const handleEnter = () => {
    createRoom(confirmMode)
    setShowConfirmModal(false)
  }

  const formatMode = (mode: string) => (mode === 'ai' ? 'AI 对局' : '玩家对局')
  const formatTime = (value: unknown) => String(value ?? '').slice(0, 16).replace('T', ' ')

  type HistoryPlayer = { name: string; isLandlord: boolean; won: boolean }
  function parsePlayers(raw: unknown): HistoryPlayer[] {
    try { return JSON.parse(String(raw ?? '[]')) as HistoryPlayer[] }
    catch { return [] }
  }

  return (
    <div className="lobby-root">
      <div className="lobby-bg" />

      <header className="lobby-header">
        <div className="lobby-brand">
          <span className="lobby-brand__icon">♦</span>
          <div>
            <h1 className="lobby-brand__title">斗地主</h1>
            <span className="lobby-brand__sub">DOU DI ZHU</span>
          </div>
        </div>

        <div className="lobby-header__right">
          <button onClick={() => setShowCreateModal(true)} className="lobby-btn lobby-btn--gold">
            + 创建房间
          </button>
          <div className="lobby-user">
            <div className="lobby-user__avatar">{playerName.slice(0, 1)}</div>
            <span className="lobby-user__name">{playerName}</span>
            <span className="lobby-user__dot" />
          </div>
        </div>
      </header>

      <div className="lobby-main">
        <section className="lobby-stage">
          <div className="lobby-table-wrap">
            <table className="lobby-room-table">
              <thead>
                <tr>
                  <th>房间号</th>
                  <th>模式</th>
                  <th>人数</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(room => {
                  const displayRoomId = room.id.replace(/^room_/, '')
                  const isPlaying = room.phase === 'playing'
                  const isFull = room.playerCount >= room.maxPlayers
                  const joinable = !isPlaying && !isFull
                  const statusText = isPlaying ? '游戏中' : isFull ? '已满' : '可加入'
                  const actionText = joinable ? '加入' : statusText

                  return (
                    <tr key={room.id}>
                      <td className="mono">#{displayRoomId}</td>
                      <td>{formatMode(room.mode)}</td>
                      <td>{room.playerCount} / {room.maxPlayers}</td>
                      <td>
                        <span className={`room-status ${joinable ? 'is-open' : isPlaying ? 'is-playing' : 'is-full'}`}>
                          {statusText}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`room-action ${joinable ? 'is-enabled' : 'is-disabled'}`}
                          disabled={!joinable}
                          onClick={() => joinable && playerId && joinRoom(room.id)}>
                          {actionText}
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {rooms.length === 0 && (
                  <tr className="lobby-room-table__empty">
                    <td colSpan={5}>
                      <div className="lobby-room-table__empty-content">
                        <span className="lobby-room-table__empty-icon">🂠</span>
                        <span className="lobby-room-table__empty-text">暂无对局</span>
                        <span className="lobby-room-table__empty-hint">点击右上角「创建房间」开始</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="lobby-sidebar">
          <div className="lobby-sidebar__head">
            <span>历史对局</span>
            <span className="lobby-sidebar__count">{historyList.length}</span>
          </div>
          <div className="lobby-sidebar__list">
            {historyList.length > 0 ? (
              historyList.map((h, i) => (
                <div key={i} className="lobby-history-row">
                  <div className="lobby-history-row__main">
                    <span className="lobby-history-row__mode">{formatMode(String(h.mode ?? 'pvp'))}</span>
                    <div className="flex flex-wrap gap-x-2 gap-y-0 text-xs" style={{ color: 'rgba(23,51,86,0.6)' }}>
                      {parsePlayers(h.players).map((p, j) => (
                        <span key={j}>{p.name}{p.isLandlord ? '👑' : ''}{p.won ? '✓' : '✗'}</span>
                      ))}
                    </div>
                    <span className="lobby-history-row__time">{formatTime(h.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="lobby-sidebar__empty">暂无对局记录</div>
            )}
          </div>
        </aside>
      </div>

      {showCreateModal && (
        <div className="lobby-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="lobby-modal" onClick={e => e.stopPropagation()}>
            <h2 className="lobby-modal__title">创建房间</h2>
            <p className="lobby-modal__sub">选择对局模式</p>
            <div className="lobby-modal__actions">
              <button onClick={() => handleSelectMode('ai')} className="lobby-modal__btn lobby-modal__btn--ai">
                <span className="lobby-modal__btn-icon">🤖</span>
                <div>
                  <div className="lobby-modal__btn-label">AI 对局</div>
                  <div className="lobby-modal__btn-desc">与电脑对战，随时开始</div>
                </div>
              </button>
              <button onClick={() => handleSelectMode('pvp')} className="lobby-modal__btn lobby-modal__btn--pvp">
                <span className="lobby-modal__btn-icon">👥</span>
                <div>
                  <div className="lobby-modal__btn-label">玩家对局</div>
                  <div className="lobby-modal__btn-desc">等待 3 名玩家，准备后开始</div>
                </div>
              </button>
            </div>
            <button onClick={() => setShowCreateModal(false)} className="lobby-modal__cancel">取消</button>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="lobby-modal-overlay" onClick={() => { setShowConfirmModal(false); setShowCreateModal(true) }}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h2 className="confirm-modal__title">{confirmMode === 'ai' ? 'AI 对局' : '玩家对局'}</h2>
            <p className="confirm-modal__sub">确认房间信息</p>

            <div className="confirm-modal__seats">
              {[0, 1, 2].map(seat => {
                const isSelf = seat === 0
                return (
                  <div key={seat} className={`confirm-seat ${isSelf ? 'confirm-seat--self' : 'confirm-seat--empty'}`}>
                    <div className="confirm-seat__avatar"
                      style={{
                        background: isSelf
                          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                          : 'rgba(255,255,255,0.06)',
                        opacity: isSelf ? 1 : 0.5,
                      }}>
                      {isSelf ? playerName.slice(0, 1) : '?'}
                    </div>
                    <div className="confirm-seat__name">{isSelf ? playerName : '虚位以待'}</div>
                    {isSelf && <span className="confirm-seat__tag">你</span>}
                  </div>
                )
              })}
            </div>

            <div className="confirm-modal__info">
              <span className="confirm-modal__info-item">
                <span className="opacity-50">模式</span> {confirmMode === 'ai' ? '🤖 AI 对局' : '👥 玩家对局'}
              </span>
              <span className="confirm-modal__info-item">
                <span className="opacity-50">规则</span> {confirmMode === 'ai' ? '准备后立即开始' : '3人准备后开始'}
              </span>
            </div>

            <div className="confirm-modal__actions">
              <button onClick={handleEnter} className="confirm-modal__btn confirm-modal__btn--enter">
                进入
              </button>
              <button onClick={() => { setShowConfirmModal(false); setShowCreateModal(true) }} className="confirm-modal__btn confirm-modal__btn--back">
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
