import { useEffect, useRef, useState } from 'react'
import { projects } from '../data/projects'

/**
 * ヘッダー右上のプロジェクトメニュー。以前あった単独のSpotifyリンクを廃止し、
 * Spotifyもプロジェクト一覧の中の1項目として(同じロゴアイコン付きで)
 * 他プロジェクトと横並びにした(本人指定、2026-08-08)。
 *
 * 注意: このコンポーネントはReactマウントの5ページ(Home/ascii/gomi/chara/404)
 * でのみ動く。/spotify/ は静的HTML(scripts/sync-header.jsがHeader.jsxの
 * JSXから機械的にマークアップを抽出する仕組み)で、Reactの状態を持てないため、
 * このメニューの見た目とvanilla JSでの開閉挙動は spotify/index.html 側に
 * 手動で複製してある(テーマ切替ボタンが既にこの方式——README/Header.jsxの
 * コメント参照)。このファイルの構造を変えたら spotify/index.html 側も
 * 手動で追従させること。sync-header.js は convertJsxToHtml() 内で
 * `<ProjectMenu ... />` を専用の静的マークアップへ置換するようにしてあるので
 * (でないと素通しでcurrentPage式だけ消えた壊れたタグが出力される)、
 * その置換文字列もこのファイルと一緒に更新する。
 */
export default function ProjectMenu({ currentPage }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="cosmic-header__menu">
      <button
        type="button"
        className="cosmic-header__menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="プロジェクトメニュー"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="cosmic-header__icon">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="cosmic-header__menu-panel" role="menu">
          {projects.map((project) => {
            const isActive = project.pageKey !== null && project.pageKey === currentPage
            return (
              <a
                key={project.id}
                href={project.link}
                role="menuitem"
                className={`cosmic-header__menu-item ${isActive ? 'cosmic-header__menu-item--active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {project.spotify && (
                  <span className="cosmic-header__menu-item-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="spotify-logo">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </span>
                )}
                <span>{project.title}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
