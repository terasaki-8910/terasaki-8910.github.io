import { useEffect, useState } from 'react'
import Stars from './movies/Stars'
import { IMG, formatDate, kindLabel, sortItems, titleOf } from './movies/movieData'

/**
 * /movies/ のプレビュー。観た作品を最近観た順に3つ、Spotify のプレビューと同じ行の形で出す
 * (確認シート16回目 R16-47)。並びはページの「視聴順」と同じ(sortItems)。
 * ポスターは行の高さ(Spotify のアルバムアートと同じ 56px)に合わせ、TMDb の一番小さい w92 を読む。
 */
export default function HomeMoviesPreview({ limit = 3 }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/trakt/movies.json')
      .then((res) => {
        if (!res.ok) throw new Error('取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', items: sortItems(data.watched || [], 'watched').slice(0, limit) })
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

  if (state.status === 'error' || state.items.length === 0) {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">Trakt</div>
  }

  return (
    <div className="border-t border-line">
      {state.items.map((m) => (
        <div key={`${m.type}-${m.trakt}`} className="flex items-center gap-4 py-3 border-b border-line">
          <div className="h-14 aspect-[2/3] shrink-0 rounded overflow-hidden bg-line">
            {m.details?.poster && (
              <img src={`${IMG}w92${m.details.poster}`} alt="" className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-ink font-medium text-sm truncate">{titleOf(m)}</p>
            <p className="text-muted text-xs truncate mt-0.5">{[m.year, kindLabel(m)].filter(Boolean).join(' / ')}</p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            <Stars rating={m.rating} />
            {m.lastWatchedAt && <div className="font-mono mt-0.5">{formatDate(m.lastWatchedAt)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
