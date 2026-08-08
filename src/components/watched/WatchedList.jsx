import { useEffect, useState } from 'react'
import GenreChart from './GenreChart'
import StarRating from './StarRating'

/**
 * 観た映画/ドラマ/アニメの一覧。データは public/watched/{dataFile} に、
 * scripts/add-watch-entry.mjs で観るたびに手で追記していく運用
 * (レビューは本人が書く一次データのため、Spotify/GitHub活動のような
 * Actions定期取得ではない)。
 */
export default function WatchedList({ dataFile, emptyMessage }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`/watched/${dataFile}`)
      .then((res) => {
        if (!res.ok) throw new Error('取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', entries: data.entries || [] })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'ready', entries: [] })
      })
    return () => {
      cancelled = true
    }
  }, [dataFile])

  if (state.status === 'loading') {
    return (
      <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 border border-line rounded" />
        ))}
      </div>
    )
  }

  const watched = state.entries
    .filter((e) => e.status === 'watched')
    .sort((a, b) => (b.watchedDate || '').localeCompare(a.watchedDate || ''))

  if (watched.length === 0) {
    return (
      <div className="max-w-md border border-line rounded p-6 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <GenreChart entries={watched} />

      <div className="border-t border-line">
        {watched.map((entry) => (
          <article key={entry.id} className="flex gap-4 py-5 border-b border-line">
            {entry.posterUrl ? (
              <img
                src={entry.posterUrl}
                alt=""
                className="w-16 aspect-[2/3] object-cover rounded shrink-0 bg-line"
                loading="lazy"
              />
            ) : (
              <div className="w-16 aspect-[2/3] rounded shrink-0 bg-line" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className="font-display text-lg text-ink">{entry.title}</h3>
                {entry.year && <span className="font-mono text-xs text-muted">{entry.year}</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <StarRating rating={entry.rating} />
                {entry.watchedDate && (
                  <span className="font-mono text-xs text-muted">{entry.watchedDate}</span>
                )}
              </div>
              {entry.comment && <p className="text-sm text-ink mt-2">{entry.comment}</p>}
              {entry.genres?.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs font-mono text-muted">
                  {entry.genres.map((g) => (
                    <span key={g}>{g}</span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
