// 共有CSSを読み込み（Viteがpublicフォルダから自動的に読み込み）
// import '/header-styles.css' // 本番ビルド時はコメントを外してください
import { useEffect, useState } from 'react'
import ProjectMenu from './ProjectMenu'

// いつもライトで開く(2026-10-05 本人指定。OSの設定がダークでも)。html の data-theme は
// head のスクリプト(vite.config.js)が先に決めている。切り替えはタブを開いている間だけ覚える。
function getInitialTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

const Header = ({ currentPage = 'home' }) => {
  const [theme, setTheme] = useState(getInitialTheme)
  // トップでは、大きな題字(Hero の data-hero-title)が画面から外れたら、左上のロゴを出す(2026-10-05 本人指定)
  const [heroGone, setHeroGone] = useState(false)

  useEffect(() => {
    if (currentPage !== 'home') return undefined
    const title = document.querySelector('[data-hero-title]')
    if (!title || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setHeroGone(!entry.isIntersecting))
    observer.observe(title)
    return () => observer.disconnect()
  }, [currentPage])

  const logoHidden = currentPage === 'home' && !heroGone

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.sessionStorage.setItem('theme', theme)
    } catch {
      // 保存できない環境では、このページの間だけ切り替わる
    }
  }, [theme])

  // sync-header.jsのreturn抽出は非貪欲マッチで最初の")"で止まるため、
  // JSX内に丸括弧を含む式(即時関数呼び出し等)を書かない。ハンドラは
  // ここで名前付き関数として定義し、JSX側は括弧なしの参照のみにする。
  function handleThemeToggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  // トップでロゴを押したら、読み込み直さずに一番上へ戻る(App.jsx が Lenis で戻す)
  function handleLogoClick(event) {
    if (currentPage !== 'home') return
    event.preventDefault()
    window.dispatchEvent(new CustomEvent('site:scroll-top'))
  }

  return (
    <header className="cosmic-header">
      <div className="cosmic-header__container">
        {/* 左上: トップの題字の小さなロゴ。押すとトップへ。トップでは、大きな題字が見えている間は出さず、
            外れたら出す。トップで押したときは読み込み直さずに一番上へ戻る */}
        <a
          href="/"
          className={`cosmic-header__logo ${logoHidden ? 'cosmic-header__logo--hidden' : ''}`}
          onClick={handleLogoClick}
        >
          @オーバーライド
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
