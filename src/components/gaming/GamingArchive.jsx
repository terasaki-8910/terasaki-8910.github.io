import { useEffect, useState } from 'react'

const LIBRARY_INITIAL_COUNT = 12

function formatHours(minutes) {
  return Math.round(minutes / 60)
}

export default function GamingArchive() {
  const [state, setState] = useState({ status: 'loading' })
  const [showAllLibrary, setShowAllLibrary] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/steam-data.json')
      .then((res) => {
        if (!res.ok) throw new Error('取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 border border-line rounded" />
        <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square border border-line rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="max-w-md border border-line rounded p-6 text-center">
        <p className="text-sm text-muted">Steamデータを読み込めませんでした。時間をおいて再度お試しください。</p>
      </div>
    )
  }

  const { player, ownedGamesCount, recentlyPlayed, library, achievements } = state.data
  const visibleLibrary = showAllLibrary ? library : library.slice(0, LIBRARY_INITIAL_COUNT)

  return (
    <div>
      {/* プレイヤー情報 */}
      <a
        href={player.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-4 border border-line rounded p-4 mb-10 hover:border-accent transition-colors"
      >
        <img src={player.avatarUrl} alt="" className="w-14 h-14 rounded shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-lg text-ink group-hover:text-accent transition-colors truncate">
            {player.personaname}
          </p>
          <p className="font-mono text-xs text-muted">所持ゲーム {ownedGamesCount}本</p>
        </div>
      </a>

      {/* 最近プレイしたゲーム */}
      {recentlyPlayed.length > 0 && (
        <div className="mb-12">
          <h2 className="font-mono text-xs tracking-wider text-muted mb-4">最近プレイしたゲーム(2週間)</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recentlyPlayed.map((game) => (
              <div key={game.appid} className="flex items-center gap-3 shrink-0 border border-line rounded px-4 py-3">
                <img src={game.iconUrl} alt="" className="w-10 h-10 rounded shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate max-w-[10rem]">{game.name}</p>
                  <p className="font-mono text-xs text-muted">{formatHours(game.playtime2weeksMinutes)}時間</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ライブラリ */}
      <div className="mb-12">
        <h2 className="font-mono text-xs tracking-wider text-muted mb-4">ライブラリ(プレイ時間順)</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {visibleLibrary.map((game) => (
            <div key={game.appid} className="border border-line rounded p-3 text-center">
              {game.iconUrl ? (
                <img src={game.iconUrl} alt="" className="w-10 h-10 rounded mx-auto mb-2" />
              ) : (
                <div className="w-10 h-10 rounded bg-line mx-auto mb-2" aria-hidden="true" />
              )}
              <p className="text-xs text-ink truncate">{game.name}</p>
              <p className="font-mono text-[10px] text-muted mt-0.5">{formatHours(game.playtimeForeverMinutes)}時間</p>
            </div>
          ))}
        </div>
        {library.length > LIBRARY_INITIAL_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllLibrary((v) => !v)}
            className="inline-block mt-4 text-xs font-mono text-muted hover:text-accent transition-colors"
          >
            {showAllLibrary ? 'ライブラリを閉じる' : `ライブラリをすべて見る（${library.length}本）`}
          </button>
        )}
      </div>

      {/* 実績 */}
      {achievements.length > 0 && (
        <div>
          <h2 className="font-mono text-xs tracking-wider text-muted mb-4">実績</h2>
          <div className="border-t border-line">
            {achievements.map((game) => (
              <div key={game.appid} className="py-5 border-b border-line">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-base text-ink truncate">{game.gameName}</h3>
                  <span className="font-mono text-xs text-muted shrink-0">
                    {game.unlocked} / {game.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-2 mb-3">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${(game.unlocked / game.total) * 100}%` }}
                  />
                </div>
                {game.recentUnlocks.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {game.recentUnlocks.map((ach) => (
                      <div
                        key={ach.name}
                        title={ach.description || ach.name}
                        className="flex items-center gap-2 border border-line rounded px-2 py-1"
                      >
                        {ach.iconUrl && <img src={ach.iconUrl} alt="" className="w-6 h-6 rounded shrink-0" />}
                        <span className="text-xs text-ink">{ach.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
