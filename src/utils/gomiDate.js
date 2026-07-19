// /gomi-tsukuba/ カレンダー用の日付ヘルパー(依存ライブラリなし)。
// すべてローカルタイム基準(閲覧者は日本在住想定、収集日は日単位)。

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function todayISO() {
  const d = new Date()
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

// 月初の曜日(0=日)
export function firstWeekday(y, m) {
  return new Date(y, m - 1, 1).getDay()
}

export function addMonths({ y, m }, delta) {
  const total = y * 12 + (m - 1) + delta
  return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

export function compareYM(a, b) {
  return a.y * 12 + a.m - (b.y * 12 + b.m)
}

export function weekdayOf(iso) {
  const { y, m, d } = parseISO(iso)
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]
}

// "7/21(火)" 形式
export function formatShort(iso) {
  const { m, d } = parseISO(iso)
  return `${m}/${d}(${weekdayOf(iso)})`
}

// 今日からの相対表現。0=今日, 1=明日, それ以外はnull
export function relativeLabel(iso, today) {
  if (iso === today) return '今日'
  const a = parseISO(iso)
  const b = parseISO(today)
  const diff =
    (new Date(a.y, a.m - 1, a.d) - new Date(b.y, b.m - 1, b.d)) / 86400000
  if (diff === 1) return '明日'
  return null
}
