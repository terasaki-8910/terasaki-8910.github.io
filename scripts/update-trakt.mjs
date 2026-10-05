#!/usr/bin/env node
/**
 * Trakt に入れた映画・ドラマ・アニメ(観た・評価・観たい)を取り、TMDb で日本語の題名・ポスター・
 * あらすじを足して public/trakt/movies.json(と docs/trakt/movies.json)に書く。/movies/ のページはこれを読む。
 *
 * ■ 取り方
 *   - Trakt は Client ID だけで読む。プロフィールが公開なので、観た・評価・観たいの取得は
 *     OAuth が要らない(公式の説明で「OAuth Optional」)。ヘッダーは公式の Required Headers のとおり。
 *   - ドラマとアニメは Trakt の「番組(show)」。アニメかどうかは Trakt のジャンル anime で分ける
 *     (映画にもアニメがある)。
 *   - ポスターは TMDb の画像を直接読み込む(複製しない。確認シート R10-7)。Trakt の画像は
 *     直リンクが禁止されているので使わない。
 *   - TMDb の詳細は、前回の JSON にあるものは使い回し、新しく入った作品の分だけ取る。
 *
 * ■ 使い方
 *   node scripts/update-trakt.mjs
 *   .env か環境変数に TRAKT_CLIENT_ID と、TMDB_READ_ACCESS_TOKEN か TMDB_API_KEY のどちらか。
 *   GitHub Actions(.github/workflows/update-trakt.yml)が毎日これを回す。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

const USER = process.env.TRAKT_USER || 'masatoT'
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
const TMDB_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN
const TMDB_API_KEY = process.env.TMDB_API_KEY
const OUTS = ['public/trakt/movies.json', 'docs/trakt/movies.json'].map((p) => path.join(ROOT, p))
// Trakt で日付を入れずに「観た」にした記録は、この日付で返ってくる
const UNKNOWN_DATE = '1970-01-01'

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

if (!TRAKT_CLIENT_ID) fail('TRAKT_CLIENT_ID がありません')
if (!TMDB_READ_ACCESS_TOKEN && !TMDB_API_KEY) fail('TMDB_READ_ACCESS_TOKEN か TMDB_API_KEY がありません')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Trakt の一覧を、ページを順にたどって全部取る */
async function traktAll(endpoint) {
  const items = []
  for (let page = 1; page <= 50; page += 1) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const res = await fetch(`https://api.trakt.tv${endpoint}${sep}page=${page}&limit=100`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'terasaki-8910.github.io/1.0',
        'trakt-api-key': TRAKT_CLIENT_ID,
        'trakt-api-version': '2',
      },
    })
    if (res.status === 429) {
      await sleep(1000 * Number(res.headers.get('retry-after') || 5))
      page -= 1
      continue
    }
    if (!res.ok) throw new Error(`Trakt ${endpoint}: ${res.status}`)
    items.push(...(await res.json()))
    const pageCount = Number(res.headers.get('x-pagination-page-count') || 1)
    if (page >= pageCount) break
  }
  return items
}

async function tmdb(endpoint, language) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`)
  url.searchParams.set('language', language)
  const headers = { Accept: 'application/json' }
  if (TMDB_READ_ACCESS_TOKEN) headers.Authorization = `Bearer ${TMDB_READ_ACCESS_TOKEN}`
  else url.searchParams.set('api_key', TMDB_API_KEY)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { headers })
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1))
      continue
    }
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`TMDb ${endpoint}: ${res.status}`)
    return res.json()
  }
  throw new Error(`TMDb ${endpoint}: 429 が続いた`)
}

/**
 * TMDb から、日本語の題名・ポスター・ジャンル・上映時間・あらすじを取る。日本語のあらすじが無ければ英語。
 * type は 'movie' か 'show'(TMDb では tv)。
 */
async function tmdbDetails(type, tmdbId) {
  const kind = type === 'show' ? 'tv' : 'movie'
  const ja = await tmdb(`/${kind}/${tmdbId}`, 'ja-JP')
  if (!ja) return null
  let overview = ja.overview || ''
  let overviewLang = 'ja'
  if (!overview) {
    const en = await tmdb(`/${kind}/${tmdbId}`, 'en-US')
    overview = (en && en.overview) || ''
    overviewLang = 'en'
  }
  const common = {
    poster: ja.poster_path || null,
    genres: (ja.genres || []).map((g) => g.name),
    overview,
    overviewLang,
  }
  if (kind === 'tv') {
    return {
      ...common,
      title: ja.name || null,
      originalTitle: ja.original_name || null,
      runtime: (ja.episode_run_time && ja.episode_run_time[0]) || null,
      releaseDate: ja.first_air_date || null,
      seasons: ja.number_of_seasons || null,
      episodes: ja.number_of_episodes || null,
    }
  }
  return {
    ...common,
    title: ja.title || null,
    originalTitle: ja.original_title || null,
    runtime: ja.runtime || null,
    releaseDate: ja.release_date || null,
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        out[index] = await fn(items[index], index)
      }
    }),
  )
  return out
}

const knownDate = (value) => (value && !value.startsWith(UNKNOWN_DATE) ? value : null)
const dateOnly = (value) => (value ? String(value).slice(0, 10) : null)

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(OUTS[0], 'utf8'))
  } catch {
    return null
  }
}

/** Trakt の項目から、映画か番組かと、その中身を取り出す */
function unwrap(item) {
  if (item.movie) return { type: 'movie', media: item.movie }
  return { type: 'show', media: item.show }
}

/** 映画・ドラマ・アニメのどれか。アニメは Trakt のジャンル anime で決める(映画にもある) */
function kindOf(type, media) {
  if ((media.genres || []).includes('anime')) return 'anime'
  return type === 'show' ? 'drama' : 'movie'
}

async function main() {
  const [watchedMovies, watchedShows, ratingMovies, ratingShows, listMovies, listShows, historyMovies] = await Promise.all([
    traktAll(`/users/${USER}/watched/movies?extended=full`),
    traktAll(`/users/${USER}/watched/shows?extended=full,noseasons`),
    traktAll(`/users/${USER}/ratings/movies?extended=full`),
    traktAll(`/users/${USER}/ratings/shows?extended=full`),
    traktAll(`/users/${USER}/watchlist/movies/added?extended=full`),
    traktAll(`/users/${USER}/watchlist/shows/added?extended=full`),
    traktAll(`/users/${USER}/history/movies`),
  ])
  console.log(
    `📥 Trakt(${USER}): 観た 映画 ${watchedMovies.length}・番組 ${watchedShows.length} / 評価 ${ratingMovies.length + ratingShows.length} / 観たい ${listMovies.length + listShows.length}`,
  )

  const keyOf = (type, media) => `${type}:${media.ids.trakt}`
  const ratingByKey = new Map(
    [...ratingMovies, ...ratingShows].map((r) => {
      const { type, media } = unwrap(r)
      return [keyOf(type, media), { rating: r.rating, ratedAt: r.rated_at }]
    }),
  )
  // 視聴順の代わり: 観た日が入っていない映画は、Trakt に記録した順(履歴の id が大きいほど後)を使う
  const recordedById = new Map()
  for (const h of historyMovies) {
    const key = keyOf('movie', h.movie)
    recordedById.set(key, Math.max(recordedById.get(key) ?? 0, h.id))
  }

  // 観たもの。評価だけがあって「観た」になっていないものも、観たものとして並べる
  const watchedMap = new Map()
  for (const w of [...watchedMovies, ...watchedShows]) {
    const { type, media } = unwrap(w)
    watchedMap.set(keyOf(type, media), { type, media, plays: w.plays || 1, lastWatchedAt: knownDate(w.last_watched_at) })
  }
  for (const r of [...ratingMovies, ...ratingShows]) {
    const { type, media } = unwrap(r)
    const key = keyOf(type, media)
    if (!watchedMap.has(key)) watchedMap.set(key, { type, media, plays: 0, lastWatchedAt: null })
  }
  const watchlist = [...listMovies, ...listShows].map((w) => ({ ...unwrap(w), listedAt: w.listed_at ?? null }))

  // TMDb の詳細は前回分を使い回す(キーは type:tmdb。前回の版は映画だけで type が無い)
  const previous = readPrevious()
  const cache = new Map()
  for (const list of [previous?.watched ?? [], previous?.watchlist ?? []]) {
    for (const m of list) if (m.tmdb && m.details) cache.set(`${m.type ?? 'movie'}:${m.tmdb}`, m.details)
  }

  const wanted = new Map()
  for (const { type, media } of [...watchedMap.values(), ...watchlist]) {
    if (media.ids.tmdb) wanted.set(`${type}:${media.ids.tmdb}`, { type, tmdb: media.ids.tmdb })
  }
  const missing = [...wanted.entries()].filter(([key]) => !cache.has(key))
  let fetched = 0
  await mapLimit(missing, 6, async ([key, { type, tmdb: id }]) => {
    try {
      const details = await tmdbDetails(type, id)
      if (details) {
        cache.set(key, details)
        fetched += 1
      }
    } catch (err) {
      console.warn(`⚠️  TMDb ${key}: ${err.message}`)
    }
  })
  console.log(`🎞️  TMDb: 新しく ${fetched} 本 / 前回から ${wanted.size - missing.length} 本`)

  const base = (type, media) => {
    const details = (media.ids.tmdb && cache.get(`${type}:${media.ids.tmdb}`)) || null
    return {
      type,
      kind: kindOf(type, media),
      trakt: media.ids.trakt,
      tmdb: media.ids.tmdb ?? null,
      slug: media.ids.slug,
      year: media.year ?? null,
      // 時系列順に使う日付。TMDb の初公開日(年とそろう)を先に使う。Trakt の released は
      // アメリカでの公開日のことがあり、映画祭で先に出た映画で年とずれる(例: Unfriended)
      released: details?.releaseDate || dateOnly(type === 'show' ? media.first_aired : media.released),
      traktTitle: media.title,
      details,
    }
  }

  // 並びはページで選ぶ。ここでは差分が安定するよう、公開日の古い順にしておく
  const byReleased = (a, b) => (a.released ?? '9999').localeCompare(b.released ?? '9999') || a.trakt - b.trakt
  const watchedOut = [...watchedMap.entries()]
    .map(([key, { type, media, plays, lastWatchedAt }]) => ({
      ...base(type, media),
      plays,
      lastWatchedAt,
      recordedOrder: recordedById.get(key) ?? null,
      ...(ratingByKey.get(key) ?? { rating: null, ratedAt: null }),
    }))
    .sort(byReleased)
  const watchlistOut = watchlist.map(({ type, media, listedAt }) => ({ ...base(type, media), listedAt, rating: null })).sort(byReleased)

  const body = { user: USER, watched: watchedOut, watchlist: watchlistOut }
  // 中身が変わっていなければ generatedAt も据え置く(毎日の空コミットを避ける)
  const unchanged =
    previous && JSON.stringify({ user: previous.user, watched: previous.watched, watchlist: previous.watchlist }) === JSON.stringify(body)
  const data = { generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(), ...body }
  const json = JSON.stringify(data, null, 2)
  for (const out of OUTS) {
    if (out.includes(`${path.sep}docs${path.sep}`) && !fs.existsSync(path.join(ROOT, 'docs'))) continue
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, json)
  }
  const count = (list, kind) => list.filter((m) => m.kind === kind).length
  console.log(
    `✅ ${unchanged ? '変化なし' : '書き出し'}: 観た ${watchedOut.length}（映画 ${count(watchedOut, 'movie')}・アニメ ${count(watchedOut, 'anime')}・ドラマ ${count(watchedOut, 'drama')}）・観たい ${watchlistOut.length}`,
  )
}

main().catch((err) => fail(err.message))
