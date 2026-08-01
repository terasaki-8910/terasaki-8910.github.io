import { useEffect, useMemo, useState } from 'react'
import { GOMI_DEFAULT_TOWN } from '../../data/gomiCategories'
import { todayISO, parseISO, compareYM } from '../../utils/gomiDate'
import MonthGrid, { DayDetail } from './MonthGrid'
import NextPickupList from './NextPickupList'
import TownPicker from './TownPicker'
import IcsSubscribe from './IcsSubscribe'
import AddToCalendarModal from './AddToCalendarModal'

const STORAGE_KEY = 'gomi-town'

function getInitialTown() {
  return window.localStorage.getItem(STORAGE_KEY) || GOMI_DEFAULT_TOWN
}

export default function GomiCalendar() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [town, setTown] = useState(getInitialTown)
  const today = todayISO()
  const [viewYM, setViewYM] = useState(() => {
    const { y, m } = parseISO(today)
    return { y, m }
  })
  const [selectedDate, setSelectedDate] = useState(today)
  const [addTarget, setAddTarget] = useState(null) // { iso, category } | null

  useEffect(() => {
    let cancelled = false
    fetch('/gomi-tsukuba/data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`data fetch failed: ${res.status}`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 保存済みの町がデータに無い場合(年度更新で町名が変わった等)のフォールバック
  const townEntry = useMemo(() => {
    if (!data) return null
    return (
      data.towns.find((t) => t.n === town) ||
      data.towns.find((t) => t.n === GOMI_DEFAULT_TOWN) ||
      data.towns[0]
    )
  }, [data, town])

  const area = townEntry ? data.areas[townEntry.a] : null

  // データが存在する月の範囲(年度内)でナビゲーションをクランプ
  const [minYM, maxYM] = useMemo(() => {
    if (!area) return [null, null]
    const dates = Object.keys(area.days).sort()
    const first = parseISO(dates[0])
    const last = parseISO(dates[dates.length - 1])
    return [
      { y: first.y, m: first.m },
      { y: last.y, m: last.m },
    ]
  }, [area])

  function handleTownChange(next) {
    setTown(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  function nav(delta) {
    setViewYM((ym) => {
      const next = { y: ym.y, m: ym.m + delta }
      while (next.m < 1) { next.m += 12; next.y -= 1 }
      while (next.m > 12) { next.m -= 12; next.y += 1 }
      return next
    })
  }

  function goToday() {
    const { y, m } = parseISO(today)
    setViewYM({ y, m })
    setSelectedDate(today)
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto border border-line rounded p-6 text-center">
        <p className="text-sm text-muted">
          収集日程データを読み込めませんでした。時間をおいて再度お試しください。
        </p>
      </div>
    )
  }

  if (!data || !area) {
    return (
      <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] animate-pulse">
        <div className="space-y-6">
          <div className="h-28 border border-line rounded" />
          <div className="h-72 border border-line rounded" />
        </div>
        <div className="h-[480px] border border-line rounded" />
      </div>
    )
  }

  const canPrev = minYM && compareYM(viewYM, minYM) > 0
  const canNext = maxYM && compareYM(viewYM, maxYM) < 0

  return (
    <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] md:items-start">
      <div className="space-y-6">
        <TownPicker
          towns={data.towns}
          value={townEntry.n}
          areaLabel={area.label}
          onChange={handleTownChange}
        />
        <NextPickupList days={area.days} today={today} />
      </div>

      <div className="md:col-start-2 md:row-start-1 md:row-span-2 min-w-0">
        <MonthGrid
          days={area.days}
          viewYM={viewYM}
          onPrev={() => nav(-1)}
          onNext={() => nav(1)}
          onToday={goToday}
          canPrev={canPrev}
          canNext={canNext}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          today={today}
          onOpenAdd={(iso, category) => setAddTarget({ iso, category })}
        />
        <DayDetail
          iso={selectedDate}
          days={area.days}
          onOpenAdd={(iso, category) => setAddTarget({ iso, category })}
        />
      </div>

      <div className="space-y-4 md:col-start-1">
        <IcsSubscribe areaSlug={townEntry.a} areaLabel={area.label} />
        <p className="text-xs text-muted leading-relaxed">
          出典:{' '}
          <a
            href={data.source.page}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-accent transition-colors"
          >
            {data.source.attribution}
          </a>
          （{data.source.license}）
          <br />
          {data.fiscalYear}年度 / 最終更新: {data.lastUpdated.slice(0, 10)}
        </p>
      </div>

      {addTarget && (
        <AddToCalendarModal
          iso={addTarget.iso}
          category={addTarget.category}
          areaSlug={townEntry.a}
          areaLabel={area.label}
          fiscalYear={data.fiscalYear}
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  )
}
