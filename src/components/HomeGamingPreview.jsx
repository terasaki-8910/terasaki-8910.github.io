import { useEffect, useState } from 'react'

/** 分を「8分」「3.3時間」「47時間」のように出す(10時間未満は小数1桁まで) */
function formatPlaytime(minutes) {
  if (minutes < 60) return `${minutes}分`
  if (minutes < 600) return `${(minutes / 60).toFixed(1)}時間`
  return `${Math.round(minutes / 60)}時間`
}

/**
 * /gaming-archive/ のプレビュー。最近2週間に遊んだゲームを、Spotify のプレビューと同じ行の形で出す
 * (確認シート16回目 R16-47)。データはページと同じ public/steam-data.json。
 * 2週間で1本も遊んでいないときは、ライブラリのプレイ時間順の上から出す。
 * 画像は API が返す 32px のアイコンしか確実に取れない(ストアの画像は新しいゲームだと URL が変わる)ので、
 * ページと同じ 40px で出す。
 */
export default function HomeGamingPreview({ limit = 3 }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/steam-data.json')
      .then((res) => {
        if (!res.ok) throw new Error('取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const recent = data.recentlyPlayed || []
        const rows =
          recent.length > 0
            ? recent.slice(0, limit).map((g) => ({ ...g, value: g.playtime2weeksMinutes, label: '2週間', total: g.playtimeForeverMinutes }))
            : (data.library || []).slice(0, limit).map((g) => ({ ...g, value: g.playtimeForeverMinutes, label: '合計', total: null }))
        setState({ status: 'ready', rows })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  if (state.status === 'loading') {
    return (
      <div className="space-y-3">
        {Array.from({ length: limit }).map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-line rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (state.status === 'error' || state.rows.length === 0) {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">Steam</div>
  }

  return (
    <div className="border-t border-line">
      {state.rows.map((game) => (
        <div key={game.appid} className="flex items-center gap-4 py-3 border-b border-line">
          {game.iconUrl ? (
            <img src={game.iconUrl} alt="" className="w-10 h-10 rounded shrink-0" loading="lazy" />
          ) : (
            <div className="w-10 h-10 rounded bg-line shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-ink font-medium text-sm truncate">{game.name}</p>
            {game.total != null && <p className="text-muted text-xs truncate mt-0.5">合計 {formatPlaytime(game.total)}</p>}
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            <div className="font-mono">{formatPlaytime(game.value)}</div>
            <div className="mt-0.5">{game.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
