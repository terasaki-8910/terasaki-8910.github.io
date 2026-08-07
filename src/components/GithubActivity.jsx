import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const GITHUB_PROFILE_URL = 'https://github.com/terasaki-8910'

/**
 * 原口沙輔氏のサイト(sasukeharaguchi.com)を参考にした、縦スクロール連動の
 * 横パンタイムライン。ユーザー自身のGitHub Contribution(全リポジトリ横断の
 * 活動)を可視化する。このリポジトリ自身のcommit履歴(GitKraken風の枝グラフ、
 * CommitLog.jsx)とは別物。
 *
 * ■ フェーズ1の制約(意図的)
 * GitHub GraphQLのcontributionCalendarは日単位の件数しか返さない
 * (個々のcommitのメッセージ・SHA・所属repoは取れない)。「1ブロック=1commit、
 * クリックで差分展開」という理想形はGraphQLクエリの再設計が要る別スコープ
 * (フェーズ2)。今回は既存データのまま「1ブロック=1日、高さ=その日の件数」で
 * 組む。データをより詳細なものに差し替える日が来ても、このコンポーネントが
 * 受け取る形(date/count の配列)を保てば済むよう、変換ロジックは
 * pickAndScaleDays 1箇所に閉じている。
 */

// 401日(≒contributionCalendarの取得範囲)全部を毎回律儀に並べると、
// 非ゼロの日数が仮に増えても窮屈にならないための安全弁。実測(2026-08時点)
// では非ゼロ日は370日中39件でこの閾値を大きく下回るため、通常は素通りする。
const DENSE_THRESHOLD = 150
// 密集時は「活発だった日」を優先して残す(装飾的な間引きではなく件数基準)。
const DENSE_KEEP_RATIO = 0.6

const MIN_BLOCK_HEIGHT = 44
const MAX_BLOCK_HEIGHT = 220

function formatYmd(dateStr) {
  return dateStr.replaceAll('-', '')
}

function pickAndScaleDays(days) {
  const active = days.filter((d) => d.contributionCount > 0)
  const chosen =
    active.length <= DENSE_THRESHOLD
      ? active
      : (() => {
          const keepCount = Math.ceil(active.length * DENSE_KEEP_RATIO)
          const keepDates = new Set(
            [...active]
              .sort((a, b) => b.contributionCount - a.contributionCount)
              .slice(0, keepCount)
              .map((d) => d.date)
          )
          return active.filter((d) => keepDates.has(d.date))
        })()

  const sorted = [...chosen].sort((a, b) => a.date.localeCompare(b.date))
  const max = Math.max(...sorted.map((d) => d.contributionCount), 1)

  return sorted.map((d) => ({
    ...d,
    // 高さは件数に対する再現性のある(=Math.random等を使わない)線形写像。
    // 同じデータなら常に同じ高さになる。
    height: Math.round(MIN_BLOCK_HEIGHT + (d.contributionCount / max) * (MAX_BLOCK_HEIGHT - MIN_BLOCK_HEIGHT)),
  }))
}

function ActivityBlock({ day }) {
  return (
    <a
      href={GITHUB_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`${day.date}: ${day.contributionCount} contributions`}
      className="group flex shrink-0 flex-col items-start gap-2"
    >
      <div
        className="w-16 border border-line transition-colors group-hover:border-accent md:w-20"
        style={{ height: `${day.height}px` }}
        aria-hidden="true"
      />
      <div className="flex w-16 items-center justify-between md:w-20">
        <span className="font-mono text-[10px] tracking-tight text-muted [writing-mode:vertical-rl] md:text-xs">
          {formatYmd(day.date)}
        </span>
        <span className="text-xs text-muted transition-colors group-hover:text-accent" aria-hidden="true">
          ↗
        </span>
      </div>
    </a>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-6 overflow-x-hidden px-4 py-12 md:px-12">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-16 shrink-0 animate-pulse border border-line bg-surface md:w-20"
          style={{ height: `${60 + ((i * 37) % 140)}px` }}
        />
      ))}
    </div>
  )
}

export default function GithubActivity() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const containerRef = useRef(null)
  const trackRef = useRef(null)

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

  const days = data?.days ? pickAndScaleDays(data.days) : []

  // 縦スクロール→横パンはデスクトップのみ。モバイルはoverflow-x-autoの
  // 素直な横スクロール帯にフォールバックする(本人指定、pin演出は複雑になり
  // タッチ操作と相性が悪いため単純化)。
  useEffect(() => {
    if (days.length === 0) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    if (reduceMotion || !isDesktop) return

    const container = containerRef.current
    const track = trackRef.current
    if (!container || !track) return

    const ctx = gsap.context(() => {
      const scrollAmount = () => Math.max(track.scrollWidth - container.clientWidth, 0)
      gsap.to(track, {
        x: () => -scrollAmount(),
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: () => `+=${scrollAmount()}`,
          scrub: 1,
          pin: true,
          invalidateOnRefresh: true,
        },
      })
    }, container)

    return () => ctx.revert()
  }, [days.length])

  if (loading) return <LoadingSkeleton />

  if (error || !data || !data.days || data.days.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-sm text-muted">activity data unavailable</div>
    )
  }

  return (
    <section ref={containerRef} className="relative overflow-hidden">
      <div
        ref={trackRef}
        className="flex items-end gap-6 overflow-x-auto px-4 py-16 will-change-transform md:overflow-x-visible md:px-12 md:py-24"
      >
        {days.map((day) => (
          <ActivityBlock key={day.date} day={day} />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-xs text-muted md:bottom-6 md:left-12">
        {data.totalContributions} contributions · @{data.login}
      </div>
    </section>
  )
}
