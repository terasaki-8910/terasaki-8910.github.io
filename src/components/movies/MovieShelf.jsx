import { useEffect, useMemo, useRef, useState } from 'react'
import './movieShelf.css'

/**
 * Trakt に入れた映画の一覧(/movies/)。データは scripts/update-trakt.mjs が毎日作る
 * public/trakt/movies.json。決めたこと(確認シート10回目):
 * - 観た・評価・観たいを、Trakt にそって出す(R10-2)
 * - 1つのページで「本棚／一覧」を切り替える。最初は本棚(R10-3)。一覧はポスターの格子(R10-4)
 * - 本棚の背はポスターを縦に切り、題名を帯に載せる(R10-5 の B。ビデオテープ風は見本を作って決め直す)
 * - 背に合わせると表紙が出て、下に題名・原題・年。押すと詳しい画面(R10-6)
 * - ポスターは TMDb から直接読み込む(R10-7)
 */

const IMG = 'https://image.tmdb.org/t/p/'
const STAR = 'M10 1.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z'

function Stars({ rating }) {
  if (!rating) return null
  return (
    <span className="mv-stars" role="img" aria-label={`評価 ${rating}/10`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = rating - i * 2
        return (
          <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
            <path className="mv-stars__base" d={STAR} />
            {v >= 1 && <path className="mv-stars__on" d={STAR} style={v === 1 ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />}
          </svg>
        )
      })}
    </span>
  )
}

const titleOf = (m) => m.details?.title || m.traktTitle
const originalOf = (m) => m.details?.originalTitle || m.traktTitle
const decadeOf = (m) => (m.year ? Math.floor(m.year / 10) * 10 : null)

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function Detail({ movie, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const d = movie.details || {}
  const meta = [originalOf(movie) !== titleOf(movie) ? originalOf(movie) : null, movie.year, ...(d.genres || []), d.runtime ? `${d.runtime}分` : null].filter(Boolean)
  return (
    <div className="mv-detail" role="dialog" aria-modal="true" aria-label={titleOf(movie)} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mv-detail__panel">
        <button ref={closeRef} type="button" className="mv-detail__close" onClick={onClose}>
          閉じる
        </button>
        <div className="mv-detail__body">
          <div className="mv-detail__text">
            <h2 className="mv-detail__title font-display">{titleOf(movie)}</h2>
            <p className="mv-detail__meta">{meta.join(' / ')}</p>
            {movie.rating ? (
              <p className="mv-detail__rating">
                <Stars rating={movie.rating} /> <span>{movie.rating}/10</span>
              </p>
            ) : null}
            {movie.lastWatchedAt ? <p className="mv-detail__meta">観た日 {formatDate(movie.lastWatchedAt)}{movie.plays > 1 ? `（${movie.plays}回）` : ''}</p> : null}
            {movie.listedAt ? <p className="mv-detail__meta">観たいに入れた日 {formatDate(movie.listedAt)}</p> : null}
            {d.overview ? (
              <p className="mv-detail__overview">
                {d.overview}
                {d.overviewLang === 'en' ? <span className="mv-detail__note">（日本語のあらすじが無いため英語）</span> : null}
              </p>
            ) : null}
            <p className="mv-detail__links">
              <a href={`https://trakt.tv/movies/${movie.slug}`} target="_blank" rel="noopener noreferrer">
                Trakt
              </a>
              {movie.tmdb ? (
                <a href={`https://www.themoviedb.org/movie/${movie.tmdb}`} target="_blank" rel="noopener noreferrer">
                  TMDB
                </a>
              ) : null}
            </p>
          </div>
          {d.poster ? <img className="mv-detail__poster" src={`${IMG}w500${d.poster}`} alt="" /> : null}
        </div>
      </div>
    </div>
  )
}

export default function MovieShelf() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [list, setList] = useState('watched')
  const [view, setView] = useState('shelf')
  const [decade, setDecade] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const shelfRef = useRef(null)
  // タップやクリックで付いたフォーカスでは開かない(開くのはクリックの側。キーボードで移ったときだけフォーカスで開く)
  const pointerRef = useRef(false)
  const canHover = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches

  useEffect(() => {
    fetch('/trakt/movies.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  const items = useMemo(() => (data ? data[list] || [] : []), [data, list])
  const decades = useMemo(() => [...new Set(items.map(decadeOf).filter(Boolean))].sort((a, b) => a - b), [items])
  const shown = items.filter((m) => decade === 'all' || decadeOf(m) === Number(decade))
  const opened = shown.find((m) => m.trakt === openId) || null

  const switchList = (next) => {
    setList(next)
    setDecade('all')
    setOpenId(null)
  }
  const scrollShelf = (dir) => {
    const el = shelfRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (error) return <p className="text-muted">データを読み込めませんでした。</p>
  if (!data) return <p className="text-muted">読み込み中…</p>

  return (
    <div className="mv">
      <div className="mv-bar">
        <div className="mv-seg" role="group" aria-label="一覧の種類">
          <button type="button" aria-pressed={list === 'watched'} onClick={() => switchList('watched')}>
            観た <span className="mv-count">{data.watched.length}</span>
          </button>
          <button type="button" aria-pressed={list === 'watchlist'} onClick={() => switchList('watchlist')}>
            観たい <span className="mv-count">{data.watchlist.length}</span>
          </button>
        </div>
        <div className="mv-seg" role="group" aria-label="見せ方">
          <button type="button" aria-pressed={view === 'shelf'} onClick={() => setView('shelf')}>
            本棚
          </button>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            一覧
          </button>
        </div>
      </div>
      {decades.length > 1 && (
        <div className="mv-tabs" role="group" aria-label="年代">
          <button type="button" aria-pressed={decade === 'all'} onClick={() => setDecade('all')}>
            すべて
          </button>
          {decades.map((d) => (
            <button key={d} type="button" aria-pressed={decade === String(d)} onClick={() => setDecade(String(d))}>
              {d}s
            </button>
          ))}
        </div>
      )}

      {view === 'shelf' ? (
        <div className="mv-stage">
          <div className="mv-shelf-wrap">
            <button type="button" className="mv-arrow mv-arrow--prev" aria-label="前へ" onClick={() => scrollShelf(-1)}>
              ←
            </button>
            <div className="mv-shelf" ref={shelfRef}>
              {shown.map((m) => {
                const isOpen = m.trakt === openId
                const poster = m.details?.poster
                return (
                  <button
                    key={m.trakt}
                    type="button"
                    className={`mv-spine${isOpen ? ' is-open' : ''}`}
                    aria-label={`${titleOf(m)}（${m.year ?? '年不明'}）`}
                    onMouseEnter={() => canHover && setOpenId(m.trakt)}
                    onPointerDown={() => {
                      pointerRef.current = true
                    }}
                    onFocus={() => {
                      if (!pointerRef.current) setOpenId(m.trakt)
                    }}
                    onClick={() => {
                      pointerRef.current = false
                      if (isOpen) setDetail(m)
                      else setOpenId(m.trakt)
                    }}
                  >
                    <span className="mv-spine__art" style={poster ? { backgroundImage: `url(${IMG}w342${poster})` } : undefined} />
                    <span className="mv-spine__band">
                      <span className="mv-spine__title">{titleOf(m)}</span>
                    </span>
                    <span className="mv-spine__cover" aria-hidden="true">
                      {poster ? <img src={`${IMG}w342${poster}`} alt="" loading="lazy" /> : <span>{titleOf(m)}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <button type="button" className="mv-arrow mv-arrow--next" aria-label="次へ" onClick={() => scrollShelf(1)}>
              →
            </button>
          </div>
          <div className="mv-caption" aria-live="polite">
            {opened ? (
              <>
                <p className="mv-caption__title font-display">{titleOf(opened)}</p>
                <p className="mv-caption__meta">
                  {originalOf(opened) !== titleOf(opened) ? `${originalOf(opened)} / ` : ''}
                  {opened.year}
                </p>
                <Stars rating={opened.rating} />
              </>
            ) : (
              <p className="mv-caption__hint">{canHover ? '背にカーソルを合わせると開きます。押すと詳しく見られます。' : '背を押すと開きます。もう一度押すと詳しく見られます。'}</p>
            )}
          </div>
        </div>
      ) : (
        <ul className="mv-grid">
          {shown.map((m) => (
            <li key={m.trakt}>
              <button type="button" className="mv-card" onClick={() => setDetail(m)}>
                {m.details?.poster ? (
                  <img src={`${IMG}w342${m.details.poster}`} alt="" loading="lazy" />
                ) : (
                  <span className="mv-card__noimg">{titleOf(m)}</span>
                )}
                <span className="mv-card__title">{titleOf(m)}</span>
                <span className="mv-card__meta">
                  {m.year}
                  <Stars rating={m.rating} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mv-credit">
        記録：<a href={`https://trakt.tv/users/${data.user}`} target="_blank" rel="noopener noreferrer">Trakt</a>
        。題名・ポスター・あらすじ：<a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>
        。This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
      {detail && <Detail movie={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
