import { useNetworkStore } from '../store/networkStore'

export function RoomPage() {
  const { currentRoom, playerId, leaveRoom, toggleReady } = useNetworkStore()

  if (!currentRoom) return null

  const isReady = currentRoom.players.find(p => p.id === playerId)?.isReady ?? false

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #071525, #0a1a35)' }}>
      <div className="flex flex-col items-center gap-6 p-8 rounded-2xl min-w-[360px]"
        style={{ background: 'rgba(7, 20, 40, 0.8)', border: '1px solid rgba(160, 214, 255, 0.15)' }}>
        <h1 className="text-2xl font-bold text-white">
          {currentRoom.id} · {currentRoom.mode === 'ai' ? 'AI 对局' : '玩家对局'}
        </h1>

        {/* Player list */}
        <div className="flex flex-col gap-3 w-full">
          {currentRoom.players.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: i === 0 ? 'linear-gradient(135deg, #ef4444, #dc2626)' :
                      i === 1 ? 'linear-gradient(135deg, #22c55e, #16a34a)' :
                        'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white',
                  }}>
                  {p.name[0]}
                </div>
                <span className="text-white font-medium">{p.name}</span>
                {p.id === playerId && (
                  <span className="text-xs text-white/40">(你)</span>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${p.isReady ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                {p.isReady ? '已准备' : '未准备'}
              </span>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, currentRoom.maxPlayers - currentRoom.players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center p-3 rounded-lg gap-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.2)' }}>
                ?
              </div>
              <span className="text-white/20 text-sm">等待玩家加入...</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={toggleReady}
            className={`px-8 py-3 rounded-full font-bold text-base cursor-pointer transition-all ${
              isReady ? 'opacity-70' : ''
            }`}
            style={{
              background: isReady
                ? 'linear-gradient(180deg, #6a7c95, #4d5d73)'
                : 'linear-gradient(180deg, #71d47b, #2fa85f)',
              color: 'white',
            }}
          >
            {isReady ? '取消准备' : '准备'}
          </button>
          <button
            onClick={leaveRoom}
            className="px-8 py-3 rounded-full font-bold text-base cursor-pointer"
            style={{ background: 'linear-gradient(180deg, #6a7c95, #4d5d73)', color: 'white' }}
          >
            离开
          </button>
        </div>

        {currentRoom.mode === 'ai' && (
          <p className="text-white/30 text-xs">AI 对局模式：准备后立即开始</p>
        )}
        {currentRoom.mode === 'pvp' && (
          <p className="text-white/30 text-xs">玩家对局：3 人准备后自动开始</p>
        )}
      </div>
    </div>
  )
}
