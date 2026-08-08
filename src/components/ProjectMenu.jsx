import { useEffect, useRef, useState } from 'react'
import { projects } from '../data/projects'

/**
 * ヘッダー右上のプロジェクトメニュー。「コマンドパレット」を模した演出
 * (本人承認、2026-08-08、3案から選定): 枠がクイッと開く→コマンド行が
 * 1文字ずつタイプされる→一覧が上から順に印字される。閉じる時は下の行から
 * 順に消えて、最後に1本の線へ折り畳まれて消える。site全体のテーマ(ライト/
 * ダーク)には従わず常時ダーク基調の「端末」として固定し、色だけこのサイトの
 * accentトークンを使う(緑ネオン端末はそれ自体がありがちな型なので避けた)。
 *
 * 以前あった単独のSpotifyリンクは廃止し、Spotifyもプロジェクト一覧の1項目
 * として(♪マーク付きで)他プロジェクトと横並びにしてある。
 *
 * 注意: このコンポーネントはReactマウントの5ページ(Home/ascii/gomi/chara/404)
 * でのみ動く。/spotify/ は静的HTML(scripts/sync-header.jsがHeader.jsxの
 * JSXから機械的にマークアップを抽出する仕組み)で、Reactの状態を持てないため、
 * このメニューの見た目と開閉挙動(タイプライター・段階アニメーション含む)は
 * spotify/index.html 側にvanilla JSで手動で複製してある。このファイルの
 * 構造・タイミング定数を変えたら spotify/index.html 側も手動で追従させること。
 * sync-header.js は convertJsxToHtml() 内で `<ProjectMenu ... />` を
 * 専用の静的マークアップ(閉状態)へ置換するようにしてある。
 */
const COMMAND_TEXT = '$ ./menu --list'
const TYPE_CHAR_MS = 18
const FRAME_OPEN_MS = 120
const ROW_ENTER_STAGGER_MS = 20
const ROW_EXIT_STAGGER_MS = 15
const ROW_EXIT_DURATION_MS = 60
const COLLAPSE_MS = 60

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function ProjectMenu({ currentPage }) {
  // closed → opening(枠が開く) → typing(コマンドをタイプ中) → open → closing(行が消えて畳まれる)
  const [phase, setPhase] = useState('closed')
  const [typedLength, setTypedLength] = useState(0)
  const rootRef = useRef(null)
  const timersRef = useRef([])

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }
  const after = (ms, fn) => {
    timersRef.current.push(setTimeout(fn, ms))
  }

  const openMenu = () => {
    clearTimers()
    if (prefersReducedMotion()) {
      setTypedLength(COMMAND_TEXT.length)
      setPhase('open')
      return
    }
    setTypedLength(0)
    setPhase('opening')
    after(FRAME_OPEN_MS, () => {
      setPhase('typing')
      let i = 0
      const typeNext = () => {
        i += 1
        setTypedLength(i)
        if (i < COMMAND_TEXT.length) {
          after(TYPE_CHAR_MS, typeNext)
        } else {
          setPhase('open')
        }
      }
      after(TYPE_CHAR_MS, typeNext)
    })
  }

  const closeMenu = () => {
    clearTimers()
    if (prefersReducedMotion()) {
      setPhase('closed')
      return
    }
    setPhase('closing')
    const rowExitTotal = (projects.length - 1) * ROW_EXIT_STAGGER_MS + ROW_EXIT_DURATION_MS
    after(rowExitTotal + COLLAPSE_MS, () => {
      setPhase('closed')
      setTypedLength(0)
    })
  }

  useEffect(() => clearTimers, [])

  const isOpenish = phase !== 'closed'
  const isInteractive = phase === 'open'

  useEffect(() => {
    if (!isOpenish) return

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) closeMenu()
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenish])

  const rowExitTotal = (projects.length - 1) * ROW_EXIT_STAGGER_MS + ROW_EXIT_DURATION_MS

  return (
    <div ref={rootRef} className="cosmic-header__menu">
      <button
        type="button"
        className="cosmic-header__menu-trigger"
        aria-haspopup="true"
        aria-expanded={isOpenish}
        aria-label="プロジェクトメニュー"
        onClick={() => (isOpenish ? closeMenu() : openMenu())}
      >
        <span className="cosmic-header__menu-trigger-glyph">&gt;_</span>
      </button>

      {isOpenish && (
        <div
          className={`cosmic-header__menu-panel cosmic-header__menu-panel--${phase}`}
          style={phase === 'closing' ? { '--collapse-delay': `${rowExitTotal}ms` } : undefined}
          role="menu"
        >
          <div className="cosmic-header__menu-cmdline">
            <span>{COMMAND_TEXT.slice(0, typedLength)}</span>
            <span className="cosmic-header__menu-cursor" aria-hidden="true">
              █
            </span>
          </div>
          <div className="cosmic-header__menu-rows">
            {projects.map((project, index) => {
              const isActive = project.pageKey !== null && project.pageKey === currentPage
              const rowPhaseClass =
                phase === 'closing'
                  ? 'cosmic-header__menu-item--exit'
                  : phase === 'open'
                    ? 'cosmic-header__menu-item--enter'
                    : 'cosmic-header__menu-item--pending'
              const delay =
                phase === 'closing'
                  ? (projects.length - 1 - index) * ROW_EXIT_STAGGER_MS
                  : index * ROW_ENTER_STAGGER_MS
              return (
                <a
                  key={project.id}
                  href={project.link}
                  role="menuitem"
                  tabIndex={isInteractive ? 0 : -1}
                  className={`cosmic-header__menu-item ${rowPhaseClass} ${isActive ? 'cosmic-header__menu-item--active' : ''}`}
                  style={{ animationDelay: `${delay}ms` }}
                  onClick={(e) => {
                    if (!isInteractive) e.preventDefault()
                    else closeMenu()
                  }}
                >
                  <span className="cosmic-header__menu-item-prompt">&gt;</span>
                  <span>{project.title}</span>
                  {project.spotify && <span className="cosmic-header__menu-item-note">♪</span>}
                  {isActive && (
                    <span className="cosmic-header__menu-item-dot" aria-hidden="true">
                      ●
                    </span>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
