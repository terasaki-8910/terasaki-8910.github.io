import { useEffect, useState } from 'react'
import { GOMI_CATEGORIES, GOMI_DEFAULT_TOWN, gomiColor } from '../data/gomiCategories'
import { todayISO, toISO } from '../utils/gomiDate'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/**
 * /gomi-tsukuba/ のプレビュー。ページへのリンクだけを置くのではなく、
 * 本体の機能(次回収集アジェンダ)を「今日・明日の2行」に切り詰めて
 * トップページに直接埋め込む(本人指定)。データ・色トークン・日付ユーティリティは
 * すべて本体(NextPickupList.jsx / gomiCategories.js / gomiDate.js)と共有していて、
 * ここで新しく定義しているのは表示の縮約だけ。
 *
 * 町はデフォルト(春日)固定。トップページの訪問者はlocalStorageの町選択を
 * 持っていない一見の状態なので、本体側の既定値をそのまま使う。
 */
export default function HomeGomiPreview() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/gomi-tsukuba/data.json')
      .then((res) => {
        if (!res.ok) throw new Error('取得に失敗しました')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const townEntry = data.towns.find((t) => t.n === GOMI_DEFAULT_TOWN) || data.towns[0]
        const area = data.areas[townEntry.a]
        setState({ status: 'ready', area })
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
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-8 bg-surface border border-line rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">ごみ収集カレンダー</div>
  }

  const rows = [
    { label: '今日', iso: todayISO() },
    { label: '明日', iso: tomorrowISO() },
  ].map(({ label, iso }) => {
    const catIds = state.area.days[iso] || []
    return { label, cats: GOMI_CATEGORIES.filter((c) => catIds.includes(c.id)) }
  })

  return (
    <div className="space-y-2">
      {rows.map(({ label, cats }) => (
        <div key={label} className="flex items-center gap-2.5 text-sm">
          <span className="shrink-0 w-9 font-mono text-xs text-accent">{label}</span>
          {cats.length === 0 ? (
            <span className="text-muted">収集なし</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              {cats.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-ink">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: gomiColor(c.id) }}
                    aria-hidden="true"
                  />
                  {c.short}
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
