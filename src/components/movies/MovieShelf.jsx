import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PiBooksBold,
  PiCaretDownBold,
  PiCheckBold,
  PiEyeBold,
  PiEyeClosedBold,
  PiFunnelSimpleBold,
  PiSortAscendingBold,
  PiSquaresFourBold,
} from 'react-icons/pi'
import './movieShelf.css'

/**
 * Trakt に入れた映画・アニメ・ドラマの視聴履歴(/movies/)。データは scripts/update-trakt.mjs が毎日作る
 * public/trakt/movies.json。決めたこと:
 * - 観た・評価・観たいを、Trakt にそって出す(確認シート R10-2)
 * - 1つのページで「本棚／一覧」を切り替える。最初は本棚(R10-3)。一覧はポスターの格子(R10-4)
 * - 本棚の背はポスターを縦に切り、題名を帯に載せる(R10-5 の B)
 * - 背に合わせると表紙が出て、下に題名・原題・年。押すと詳しい画面(R10-6)。カーソルが外れたら閉じる
 * - ポスターは TMDb から直接読み込む(R10-7)
 * - 映画・アニメ・ドラマで絞れる。観たは 時系列順(既定)・評価順・視聴順、観たいは 追加順(既定)・時系列順
 * - 時系列順は新しい順。アニメ映画は「映画」と「アニメ」の両方に出す(確認シート R11-2・R11-3)
 * - 操作はアイコンにする(R11-1): 観た／観たいは目のアイコン1つで切り替え、本棚／一覧は2つのアイコン、
 *   絞り込みと並びはアイコンから開く一覧(ヘッダーのメニューと同じ、マスと項目名の並び)
 */

const IMG = 'https://image.tmdb.org/t/p/'
const STAR = 'M10 1.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z'
const KINDS = [
  ['all', 'すべて'],
  ['movie', '映画'],
  ['anime', 'アニメ'],
  ['drama', 'ドラマ'],
]
const SORTS = {
  watched: [
    ['released', '時系列順'],
    ['rating', '評価順'],
    ['watched', '視聴順'],
  ],
  watchlist: [
    ['added', '追加順'],
    ['released', '時系列順'],
  ],
}
const RATING_NOTE = '星の数は、わたしの主観による評価です。'
const LIST_NAMES = { watched: '観た映画リスト', watchlist: 'ウォッチリスト' }

/** 種類で絞る。アニメ映画は「映画」にも「アニメ」にも入る */
function matchesKind(m, kind) {
  if (kind === 'all') return true
  if (kind === 'movie') return m.type === 'movie'
  if (kind === 'anime') return m.kind === 'anime'
  return m.type === 'show' && m.kind !== 'anime'
}

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
const kindLabel = (m) => ({ movie: '映画', anime: 'アニメ', drama: 'ドラマ' })[m.kind] || ''
const traktUrl = (m) => `https://trakt.tv/${m.type === 'show' ? 'shows' : 'movies'}/${m.slug}`
const tmdbUrl = (m) => `https://www.themoviedb.org/${m.type === 'show' ? 'tv' : 'movie'}/${m.tmdb}`

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 並べ替え。視聴順は、観た日が入っているものを新しい順に、残りは Trakt に記録した順(新しい順) */
function sortItems(items, sort) {
  const list = [...items]
  const byReleased = (a, b) => (a.released ?? '9999').localeCompare(b.released ?? '9999')
  if (sort === 'rating') return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byReleased(b, a))
  if (sort === 'watched') {
    return list.sort((a, b) => {
      if (a.lastWatchedAt && b.lastWatchedAt) return b.lastWatchedAt.localeCompare(a.lastWatchedAt)
      if (a.lastWatchedAt) return -1
      if (b.lastWatchedAt) return 1
      return (b.recordedOrder ?? 0) - (a.recordedOrder ?? 0)
    })
  }
  if (sort === 'added') return list.sort((a, b) => (b.listedAt ?? '').localeCompare(a.listedAt ?? ''))
  // 時系列順は新しい順(最初に新しい作品を見せる。R11-2)
  return list.sort((a, b) => byReleased(b, a))
}

function Detail({ movie, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus({ preventScroll: true })
    // 開いている間は、後ろのページをスクロールさせない
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      root.style.overflow = prev
    }
  }, [onClose])
  const d = movie.details || {}
  const length =
    movie.type === 'show'
      ? [d.seasons ? `${d.seasons}シーズン` : null, d.episodes ? `全${d.episodes}話` : null, d.runtime ? `1話 ${d.runtime}分` : null]
      : [d.runtime ? `${d.runtime}分` : null]
  const meta = [originalOf(movie) !== titleOf(movie) ? originalOf(movie) : null, movie.year, kindLabel(movie), ...(d.genres || []), ...length].filter(Boolean)
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
              <div className="mv-detail__rating">
                <p>
                  <Stars rating={movie.rating} /> <span>{movie.rating}/10</span>
                </p>
                <p className="mv-detail__note">{RATING_NOTE}</p>
              </div>
            ) : null}
            {movie.lastWatchedAt ? (
              <p className="mv-detail__meta">
                観た日 {formatDate(movie.lastWatchedAt)}
                {movie.type === 'movie' && movie.plays > 1 ? `（${movie.plays}回）` : ''}
              </p>
            ) : null}
            {movie.listedAt ? <p className="mv-detail__meta">観たいに入れた日 {formatDate(movie.listedAt)}</p> : null}
            {d.overview ? (
              <p className="mv-detail__overview">
                {d.overview}
                {d.overviewLang === 'en' ? <span className="mv-detail__note">（日本語のあらすじが無いため英語）</span> : null}
              </p>
            ) : null}
            <p className="mv-detail__links">
              <a href={traktUrl(movie)} target="_blank" rel="noopener noreferrer">
                Trakt
              </a>
              {movie.tmdb ? (
                <a href={tmdbUrl(movie)} target="_blank" rel="noopener noreferrer">
                  TMDB
                </a>
              ) : null}
            </p>
          </div>
          {d.poster ? <img className="mv-detail__poster" src={`${IMG}w500${d.poster}`} alt="" /> : null}
        </div>
      </div>
      {/* スマホは、長いあらすじでも見失わないよう、画面の下の真ん中に丸い × を置く */}
      <button type="button" className="mv-detail__close-round" aria-label="閉じる" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/** アイコンだけのボタン。カーソルを合わせると説明が出る(data-tip、movieShelf.css) */
function IconButton({ tip, pressed, onClick, children }) {
  return (
    <button type="button" className="mv-icon" data-tip={tip} aria-label={tip} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/** アイコンから開く一覧(絞り込み・並び)。ヘッダーのメニューと同じく、マスと項目名を並べ、選んでいるマスは塗る */
function PickMenu({ tip, icon, options, value, onChange, counts }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = options.find(([key]) => key === value)
  return (
    <div className="mv-pick" ref={rootRef}>
      <button
        type="button"
        className="mv-pick__trigger"
        data-tip={tip}
        aria-label={`${tip}：${current ? current[1] : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span>{current ? current[1] : ''}</span>
        <PiCaretDownBold className="mv-pick__caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="mv-pick__panel" role="menu" aria-label={tip}>
          {options.map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={value === key}
              className="mv-pick__item"
              onClick={() => {
                onChange(key)
                setOpen(false)
              }}
            >
              <span className="mv-pick__cell" aria-hidden="true">
                {value === key ? <PiCheckBold /> : null}
              </span>
              <span className="mv-pick__label">{text}</span>
              {counts ? <span className="mv-count">{counts[key]}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MovieShelf() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [list, setList] = useState('watched')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('released')
  const [view, setView] = useState('shelf')
  const [decade, setDecade] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const shelfRef = useRef(null)
  // 詳しい画面を閉じる関数は作り直さない(Detail の後ろのスクロール止めとフォーカスを、開いた1回だけにする)
  const closeDetail = useCallback(() => setDetail(null), [])
  // タップやクリックで付いたフォーカスでは開かない(開くのはクリックの側。キーボードで移ったときだけフォーカスで開く)
  const pointerRef = useRef(false)
  const canHover = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches

  useEffect(() => {
    fetch('/trakt/movies.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  const listItems = useMemo(() => (data ? data[list] || [] : []), [data, list])
  const kindCounts = useMemo(() => {
    const c = {}
    for (const [key] of KINDS) c[key] = listItems.filter((m) => matchesKind(m, key)).length
    return c
  }, [listItems])
  const ofKind = useMemo(() => listItems.filter((m) => matchesKind(m, kind)), [listItems, kind])
  const decades = useMemo(() => [...new Set(ofKind.map(decadeOf).filter(Boolean))].sort((a, b) => a - b), [ofKind])
  const shown = useMemo(
    () => sortItems(ofKind.filter((m) => decade === 'all' || decadeOf(m) === Number(decade)), sort),
    [ofKind, decade, sort],
  )
  const keyOf = (m) => `${m.type}:${m.trakt}`
  const opened = shown.find((m) => keyOf(m) === openId) || null

  const switchList = (next) => {
    setList(next)
    setSort(SORTS[next][0][0])
    setDecade('all')
    setOpenId(null)
  }
  const switchKind = (next) => {
    setKind(next)
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
        <div className="mv-tools">
          {/* 観た／観たい: 目のアイコン1つ。押すと切り替わる。開いた目 = 観た、閉じた目 = まだ観ていない(ウォッチリスト) */}
          <IconButton
            tip={`${LIST_NAMES[list]}（押すと${list === 'watched' ? LIST_NAMES.watchlist : LIST_NAMES.watched}）`}
            onClick={() => switchList(list === 'watched' ? 'watchlist' : 'watched')}
          >
            {list === 'watched' ? <PiEyeBold /> : <PiEyeClosedBold />}
          </IconButton>
          <PickMenu tip="絞り込み" icon={<PiFunnelSimpleBold aria-hidden="true" />} options={KINDS} value={kind} onChange={switchKind} counts={kindCounts} />
          <PickMenu tip="並び替え" icon={<PiSortAscendingBold aria-hidden="true" />} options={SORTS[list]} value={sort} onChange={setSort} />
        </div>
        <div className="mv-tools" role="group" aria-label="見せ方">
          <IconButton tip="本棚" pressed={view === 'shelf'} onClick={() => setView('shelf')}>
            <PiBooksBold />
          </IconButton>
          <IconButton tip="一覧" pressed={view === 'grid'} onClick={() => setView('grid')}>
            <PiSquaresFourBold />
          </IconButton>
        </div>
      </div>
      <p className="mv-heading">
        {LIST_NAMES[list]}
        <span className="mv-count">{shown.length}</span>
      </p>
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
      {list === 'watched' && sort === 'rating' ? <p className="mv-note">{RATING_NOTE}</p> : null}

      {shown.length === 0 ? (
        <p className="text-muted">この条件に当てはまる作品はありません。</p>
      ) : view === 'shelf' ? (
        <div className="mv-stage">
          <div className="mv-shelf-wrap">
            <button type="button" className="mv-arrow mv-arrow--prev" aria-label="前へ" onClick={() => scrollShelf(-1)}>
              ←
            </button>
            <div className="mv-shelf" ref={shelfRef}>
              {shown.map((m) => {
                const key = keyOf(m)
                const isOpen = key === openId
                const poster = m.details?.poster
                return (
                  <button
                    key={key}
                    type="button"
                    className={`mv-spine${isOpen ? ' is-open' : ''}`}
                    aria-label={`${titleOf(m)}（${m.year ?? '年不明'}）`}
                    onMouseEnter={() => canHover && setOpenId(key)}
                    onMouseLeave={() => canHover && setOpenId((current) => (current === key ? null : current))}
                    onPointerDown={() => {
                      pointerRef.current = true
                    }}
                    onFocus={() => {
                      if (!pointerRef.current) setOpenId(key)
                    }}
                    onClick={() => {
                      pointerRef.current = false
                      if (isOpen) setDetail(m)
                      else setOpenId(key)
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
                  {opened.year} / {kindLabel(opened)}
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
            <li key={keyOf(m)}>
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
      {detail && <Detail movie={detail} onClose={closeDetail} />}
    </div>
  )
}
