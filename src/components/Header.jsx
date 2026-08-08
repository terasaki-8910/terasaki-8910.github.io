// 共有CSSを読み込み（Viteがpublicフォルダから自動的に読み込み）
// import '/header-styles.css' // 本番ビルド時はコメントを外してください
import { useEffect, useState } from 'react'
import ProjectMenu from './ProjectMenu'

function getInitialTheme() {
  const saved = window.localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const Header = ({ currentPage = 'home' }) => {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('theme', theme)
  }, [theme])

  // sync-header.jsのreturn抽出は非貪欲マッチで最初の")"で止まるため、
  // JSX内に丸括弧を含む式(即時関数呼び出し等)を書かない。ハンドラは
  // ここで名前付き関数として定義し、JSX側は括弧なしの参照のみにする。
  function handleThemeToggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="cosmic-header">
      <div className="cosmic-header__container">
        {/* 左側: Homeリンク */}
        <a
          href="/"
          className={`cosmic-header__home-link ${currentPage === 'home' ? 'cosmic-header__home-link--active' : ''}`}
        >
          <img src="/icons/home-avatar.png" alt="" className="cosmic-header__icon cosmic-header__home-icon" />
          <span className="cosmic-header__home-text">Home</span>
        </a>

        {/* 右側: テーマ切替「CSS側で右下に固定」とプロジェクトメニュー */}
        <div className="cosmic-header__right-group">
          <button
            type="button"
            id="theme-toggle-btn"
            className="cosmic-header__theme-toggle"
            aria-label="ダーク/ライトモード切り替え"
            onClick={handleThemeToggle}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cosmic-header__icon cosmic-header__icon--sun">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cosmic-header__icon cosmic-header__icon--moon">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <ProjectMenu currentPage={currentPage} />
        </div>
      </div>
    </header>
  )
}

export default Header
