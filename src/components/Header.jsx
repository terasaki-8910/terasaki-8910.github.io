// 共有CSSを読み込み（Viteがpublicフォルダから自動的に読み込み）
// import '/header-styles.css' // 本番ビルド時はコメントを外してください
import { useEffect, useState } from 'react'

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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cosmic-header__icon">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="cosmic-header__home-text">Home</span>
        </a>

        {/* 右側: テーマ切替 + Spotify Dashboardリンク */}
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

          <a
            href="/spotify/"
            className={`cosmic-header__spotify-link ${currentPage === 'spotify' ? 'cosmic-header__spotify-link--active' : ''}`}
            target={currentPage === 'spotify' ? '_self' : '_blank'}
            rel="noopener noreferrer"
            aria-label="Spotify Dashboard"
          >
            <div className="cosmic-header__spotify-box">
              <div className="cosmic-header__spotify-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" className="spotify-logo">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              </div>
              <span className="cosmic-header__spotify-text">Spotify Dashboard</span>
            </div>
          </a>
        </div>
      </div>
    </header>
  )
}

export default Header
