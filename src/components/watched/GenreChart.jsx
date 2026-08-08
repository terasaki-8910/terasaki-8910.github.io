/**
 * ジャンル別件数の集計棒グラフ。gomi-tsukubaのカテゴリ色トークン設計とは
 * 違い、映画/ドラマ/アニメでジャンル語彙がバラバラ(TMDbは日本語、AniListは
 * 英語)なため、ジャンルごとに個別の色は割り当てず、サイト全体の方針
 * (アクセントは1色)通りaccent単色の横棒で統一する。
 */
export default function GenreChart({ entries }) {
  const counts = new Map()
  for (const entry of entries) {
    for (const genre of entry.genres || []) {
      counts.set(genre, (counts.get(genre) || 0) + 1)
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = sorted.length > 0 ? sorted[0][1] : 1

  if (sorted.length === 0) return null

  return (
    <div className="mb-12">
      <h2 className="font-mono text-xs tracking-wider text-muted mb-4">ジャンル別件数</h2>
      <div className="space-y-2">
        {sorted.map(([genre, count]) => (
          <div key={genre} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-ink truncate">{genre}</span>
            <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-xs text-muted">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
