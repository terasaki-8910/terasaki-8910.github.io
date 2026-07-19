import { GOMI_CATEGORIES, gomiColor } from '../../data/gomiCategories'
import { formatShort, relativeLabel } from '../../utils/gomiDate'

// 「次はいつ?」に答えるアジェンダ(Fantasticalのサイドバーリストの翻案)。
// 全カテゴリの次回収集日を日付順に並べる。今日/明日はバッジで強調。
export default function NextPickupList({ days, today }) {
  const sortedDates = Object.keys(days).sort()

  const items = GOMI_CATEGORIES.map((cat) => {
    const next = sortedDates.find((d) => d >= today && days[d].includes(cat.id))
    return { cat, next }
  }).sort((a, b) => {
    if (!a.next) return 1
    if (!b.next) return -1
    return a.next.localeCompare(b.next)
  })

  return (
    <div className="border border-line rounded p-4">
      <h2 className="text-lg font-display text-ink mb-3">次の収集</h2>
      <ul className="space-y-2.5">
        {items.map(({ cat, next }) => {
          const rel = next ? relativeLabel(next, today) : null
          return (
            <li key={cat.id} className="flex items-baseline gap-2.5 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 self-center"
                style={{ backgroundColor: gomiColor(cat.id) }}
              />
              <span className="text-ink min-w-0 truncate">
                {cat.short}
                {cat.note && <span className="text-xs text-muted">（{cat.note}）</span>}
              </span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                {next ? formatShort(next) : '予定なし'}
              </span>
              {rel && (
                <span className="shrink-0 text-xs font-medium text-celeste">{rel}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
