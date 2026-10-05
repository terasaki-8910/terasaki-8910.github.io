import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// PC で帯が止まったときの「最後までスクロール」の案内を、もう出したか
const HINT_SEEN_KEY = 'gh-scroll-hint-seen'

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
const MAX_BLOCK_HEIGHT = 320

// ブロックを浮遊させる縦位置のオフセット幅(px)。+/-この範囲で揺れる。
// 高さ(contributionCount由来)とは無関係な軸なので、全ブロック共通の底辺に
// 揃った「棒グラフ」に見えないようにする(実機レビューで指摘された点)。
//
// MAX_BLOCK_HEIGHT・OFFSET_RANGEとも、縦センタリング修正後もなお
// 「余白が目立つ」という指摘を受けて拡大した(2026-08-07)。
// 実測: 900pxビューポートに対しブロック帯の実高さが約230pxしかなく、
// 上下の余白比率自体は均等(340px/330px)でもコンテンツの絶対的な
// 存在感が乏しく見えていた。「キャンバスをもっと大きく」という
// 提案に沿って、両方の値幅を広げて帯全体の実効高さを増やす。
const OFFSET_RANGE = 90

// スクロール距離の短縮率。1.0だと横方向の移動量と同じ縦スクロール量が
// 必要になり「スクロールが重い」と感じられたため、同じ横移動をより短い
// 縦スクロールで完了させる(実機レビューで指摘された点)。
const SCROLL_DISTANCE_FACTOR = 0.55

function formatYmd(dateStr) {
  return dateStr.replaceAll('-', '')
}

// 文字列から決定論的な整数オフセットを作る(Math.random不使用。同じ日付なら
// リロードしても常に同じ位置になる)。乱数種ではなく日付文字列そのものが
// 入力なので、コミット数やビルド時刻に依存せず再現する。
function hashOffset(str, range) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  }
  const span = range * 2 + 1
  return (((h % span) + span) % span) - range
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
  const offset = hashOffset(day.date, OFFSET_RANGE)
  return (
    <a
      href={GITHUB_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`${day.date}: ${day.contributionCount} contributions`}
      className="group flex shrink-0 flex-col items-start gap-2"
      style={{ transform: `translateY(${offset}px)` }}
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
    <div className="bk-content flex items-center gap-6 overflow-x-hidden px-4 py-12 md:px-12">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-16 shrink-0 animate-pulse border border-line bg-surface md:w-20"
          style={{
            height: `${60 + ((i * 37) % 140)}px`,
            transform: `translateY(${hashOffset(String(i), OFFSET_RANGE)}px)`,
          }}
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
  // PC で帯が止まった(pin した)ときの案内。「ずっと止まる」と言われたため、最後までスクロールするよう
  // 1度だけ出す。1度出したら、次からは出さない(localStorage)。2026-10-05 本人指定
  const [hint, setHint] = useState(false)
  // 帯が止まっている間だけ出すスキップのボタン。▲(上へドラッグ)で帯の最初へ、▼(下へドラッグ)で最後へ飛ぶ
  const [pinned, setPinned] = useState(false)
  const triggerRef = useRef(null)
  const dragRef = useRef(null)

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
          // 横方向の移動量そのまま(等倍)を縦スクロール距離に要求すると
          // 「スクロールが重い」と感じられたため、短縮率を掛けて同じ横移動を
          // より短い縦スクロールで完了させる。
          end: () => `+=${scrollAmount() * SCROLL_DISTANCE_FACTOR}`,
          scrub: 1,
          pin: true,
          invalidateOnRefresh: true,
          onToggle: (self) => {
            setPinned(self.isActive)
            if (!self.isActive) {
              setHint(false)
              return
            }
            try {
              if (window.localStorage.getItem(HINT_SEEN_KEY)) return
              window.localStorage.setItem(HINT_SEEN_KEY, '1')
            } catch {
              // 保存できない環境でも、この回は出す
            }
            setHint(true)
          },
          // 少し進んだら消す(横に流れはじめたことが分かれば十分)
          onUpdate: (self) => {
            if (self.progress > 0.2) setHint(false)
          },
        },
      })
      triggerRef.current = ScrollTrigger.getAll().find((st) => st.trigger === container) || null
    }, container)

    return () => ctx.revert()
  }, [days.length])

  // 帯の最初(dir < 0)か最後(dir > 0)へ飛ぶ。スクロールは App.jsx の Lenis に頼む
  function skip(dir) {
    const st = triggerRef.current
    if (!st) return
    const y = dir < 0 ? st.start : st.end + 2
    setHint(false)
    window.dispatchEvent(new CustomEvent('site:scroll-to', { detail: { y } }))
  }

  function handleSkipPointerDown(event) {
    dragRef.current = { y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handleSkipPointerUp(event, fallbackDir) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const dy = event.clientY - drag.y
    // 20px 以上動かしたらドラッグ。上なら最初へ、下なら最後へ。動かさなければ、押した側(▲か▼)へ
    if (Math.abs(dy) >= 20) skip(dy < 0 ? -1 : 1)
    else skip(fallbackDir)
  }

  if (loading) return <LoadingSkeleton />

  if (error || !data || !data.days || data.days.length === 0) {
    return (
      <div className="bk-content py-12 text-center font-mono text-sm text-muted">activity data unavailable</div>
    )
  }

  return (
    // md以上はpin演出の対象なので、他セクション(Hero/Philosophy/3D ASCII)と同じ
    // min-h-screen + 縦中央寄せにする。以前はセクション自体の高さが中身なり
    // (475px程度)しか無いままpinしていたため、pin中の残りのビューポート下部
    // (実測で約550px)が何も表示されないまま長時間残る問題があった
    // (実機レビューで「余白が大きい」と指摘)。モバイルはpinしない単純な
    // 横スクロール帯のままなので対象外。
    <section ref={containerRef} className="bk-content relative overflow-hidden md:flex md:min-h-screen md:items-center">
      <div
        ref={trackRef}
        className="flex items-center gap-6 overflow-x-auto px-4 py-16 will-change-transform md:overflow-x-visible md:px-12 md:py-24"
      >
        {days.map((day) => (
          <ActivityBlock key={day.date} day={day} />
        ))}
      </div>
      {hint && (
        <div
          role="status"
          className="gh-hint pointer-events-none absolute bottom-[188px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-5 py-2 text-sm shadow-lg"
        >
          → 最後までスクロールしてください
        </div>
      )}
      {pinned && (
        <div className="gh-skip absolute bottom-8 left-1/2 -translate-x-1/2" role="group" aria-label="帯をスキップ">
          <button
            type="button"
            aria-label="帯の最初へ(上へドラッグしても同じ)"
            onPointerDown={handleSkipPointerDown}
            onPointerUp={(e) => handleSkipPointerUp(e, -1)}
          >
            ▲
          </button>
          <span aria-hidden="true">スキップ</span>
          <button
            type="button"
            aria-label="帯の最後へ(下へドラッグしても同じ)"
            onPointerDown={handleSkipPointerDown}
            onPointerUp={(e) => handleSkipPointerUp(e, 1)}
          >
            ▼
          </button>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-xs text-muted md:bottom-6 md:left-12">
        {data.totalContributions} contributions · @{data.login}
      </div>
    </section>
  )
}
