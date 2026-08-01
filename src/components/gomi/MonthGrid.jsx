import { GOMI_CATEGORIES, gomiColor } from '../../data/gomiCategories'
import {
  WEEKDAY_LABELS,
  toISO,
  parseISO,
  daysInMonth,
  firstWeekday,
} from '../../utils/gomiDate'

// カテゴリ配列をdata.jsonの順ではなく表示定数の順に揃える
function orderCats(ids) {
  return GOMI_CATEGORIES.filter((c) => ids.includes(c.id))
}

// 月グリッド本体。日単位データ前提の7列グリッド(日曜始まり)。
// デスクトップはセル内に小チップ(最大3+「+n」)、モバイルは色ドットのみ
// 表示してタップで下の詳細カードに委ねる。
export default function MonthGrid({
  days,
  viewYM,
  onPrev,
  onNext,
  onToday,
  canPrev,
  canNext,
  selectedDate,
  onSelectDate,
  today,
  onOpenAdd,
}) {
  const { y, m } = viewYM
  const lead = firstWeekday(y, m)
  const total = daysInMonth(y, m)

  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(toISO(y, m, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const navBtn =
    'w-10 h-10 flex items-center justify-center border border-line rounded bg-paper text-ink hover:border-accent hover:text-accent transition-colors disabled:opacity-30 disabled:pointer-events-none'

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl md:text-3xl font-display text-ink">
          {y}年{m}月
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="前の月" className={navBtn}>
            ‹
          </button>
          <button
            type="button"
            onClick={onToday}
            className="h-10 px-4 flex items-center border border-line rounded bg-paper text-sm text-ink hover:border-accent hover:text-accent transition-colors"
          >
            今日
          </button>
          <button type="button" onClick={onNext} disabled={!canNext} aria-label="次の月" className={navBtn}>
            ›
          </button>
        </div>
      </div>

      <div className="border border-line rounded overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-line">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="bg-paper py-2 text-center text-xs font-mono text-muted">
              {w}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <div key={`blank-${i}`} className="bg-paper min-h-[52px] md:min-h-[92px]" aria-hidden="true" />
            const cats = orderCats(days[iso] || [])
            const { d } = parseISO(iso)
            const isToday = iso === today
            const isSelected = iso === selectedDate
            const label =
              `${m}月${d}日: ` +
              (cats.length ? cats.map((c) => c.label).join('、') : '収集なし')
            // セル自体はdiv+role="button"(日付選択用)。中のカテゴリチップは
            // 個別のクリック対象(カレンダー追加)にするため、実button同士の
            // 入れ子(無効なHTML)を避けてこの構造にしている。
            return (
              <div
                key={iso}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDate(iso)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectDate(iso)
                  }
                }}
                aria-label={label}
                aria-pressed={isSelected}
                className={`min-h-[52px] md:min-h-[92px] p-1 md:p-1.5 text-left align-top transition-colors cursor-pointer ${
                  isSelected ? 'bg-accent-dim' : 'bg-paper hover:bg-accent-dim'
                } ${isToday ? 'ring-2 ring-inset ring-accent' : ''}`}
              >
                <span
                  className={`block text-xs font-mono mb-1 ${
                    isToday ? 'text-accent font-bold' : 'text-muted'
                  }`}
                >
                  {d}
                </span>
                {/* デスクトップ: 小チップ(最大3+超過表示)。クリックでカレンダーに追加 */}
                <span className="hidden md:flex flex-col gap-0.5">
                  {cats.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={`${c.label}をカレンダーに追加`}
                      aria-label={`${m}月${d}日の${c.label}をカレンダーに追加`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenAdd(iso, c)
                      }}
                      className="block w-full text-[10px] leading-tight text-ink px-1 py-px rounded-[2px] truncate text-left cursor-pointer hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-[filter]"
                      style={{
                        borderLeft: `3px solid ${gomiColor(c.id)}`,
                        backgroundColor: `color-mix(in srgb, ${gomiColor(c.id)} 14%, transparent)`,
                      }}
                    >
                      {c.short}
                    </button>
                  ))}
                  {cats.length > 3 && (
                    <span className="text-[10px] text-muted px-1">+{cats.length - 3}</span>
                  )}
                </span>
                {/* モバイル: 色ドット(最大4+超過ドット)。ラベルが無いため非対話 */}
                <span className="flex md:hidden flex-wrap gap-1">
                  {cats.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: gomiColor(c.id) }}
                    />
                  ))}
                  {cats.length > 4 && (
                    <span className="text-[9px] leading-none text-muted">+</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// 選択日の詳細(モバイル用)。デスクトップはセル内チップで足りるため非表示。
// 各行をタップするとその日・カテゴリ単体をカレンダーに追加できる。
export function DayDetail({ iso, days, onOpenAdd }) {
  const cats = orderCats(days[iso] || [])
  const { m, d } = parseISO(iso)
  return (
    <div className="md:hidden mt-4 border border-line rounded p-4">
      <h3 className="text-sm font-mono text-muted mb-3">
        {m}/{d} の収集
      </h3>
      {cats.length === 0 ? (
        <p className="text-sm text-muted">収集はありません</p>
      ) : (
        <ul className="space-y-1">
          {cats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenAdd(iso, c)}
                aria-label={`${m}月${d}日の${c.label}をカレンダーに追加`}
                className="w-full flex items-center gap-3 text-sm text-ink text-left py-1.5 -mx-1 px-1 rounded hover:bg-accent-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors cursor-pointer"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: gomiColor(c.id) }}
                />
                {c.label}
                <span className="ml-auto text-[10px] text-muted">カレンダーに追加</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
