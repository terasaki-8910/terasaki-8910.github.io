import { useEffect, useState } from 'react'

function levelForCount(count, max) {
  if (count === 0) return 0
  if (max <= 0) return 1
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

// レベル0(コントリビューションなし)はbg-surfaceで塗ると、活動がある
// セルと同じ「実体のある箱」に見えてしまい、何もしていない日まで主張が
// 強くなる。塗りを消して極薄の枠線だけ残し、グリッドの構造は分かる程度に
// 沈めることで、活動があるセル(celesteで塗られる)だけが浮き上がるようにする。
const LEVEL_COLORS = [
  'bg-transparent border border-line/40',
  'bg-celeste/25',
  'bg-celeste/50',
  'bg-celeste/75',
  'bg-celeste',
]

export default function GithubActivity() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/github-activity.json')
        if (!res.ok) throw new Error(`activity data fetch failed: ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex gap-1 max-w-3xl mx-auto overflow-x-auto pb-2 animate-pulse">
        {Array.from({ length: 52 }).map((_, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, di) => (
              <div key={di} className="w-3 h-3 rounded-sm bg-surface border border-line" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (error || !data || !data.weeks || data.weeks.length === 0) {
    return <div className="text-center text-muted text-sm font-mono">activity data unavailable</div>
  }

  const max = Math.max(...data.days.map((d) => d.contributionCount), 1)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {data.weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.contributionDays.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.contributionCount} contributions`}
                className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[levelForCount(day.contributionCount, max)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between items-baseline text-sm font-mono text-muted">
        <span>{data.totalContributions} contributions</span>
        <span>@{data.login}</span>
      </div>
    </div>
  )
}
