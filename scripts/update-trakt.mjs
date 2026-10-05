#!/usr/bin/env node
/**
 * Trakt に入れた映画(観た・評価・観たい)を取り、TMDb で日本語の題名・ポスター・あらすじを足して
 * public/trakt/movies.json(と docs/trakt/movies.json)に書く。/movies/ のページはこれを読む。
 *
 * ■ 取り方
 *   - Trakt は Client ID だけで読む。プロフィールが公開なので、観た・評価・観たいの取得は
 *     OAuth が要らない(公式の説明で「OAuth Optional」)。ヘッダーは公式の Required Headers のとおり。
 *   - ポスターは TMDb の画像を直接読み込む(複製しない。確認シート R10-7)。Trakt の画像は
 *     直リンクが禁止されているので使わない。
 *   - TMDb の詳細は、前回の JSON にある映画は使い回し、新しく入った映画の分だけ取る。
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

/** TMDb から、日本語の題名・ポスター・ジャンル・上映時間・あらすじを取る。日本語のあらすじが無ければ英語 */
async function tmdbDetails(tmdbId) {
  const ja = await tmdb(`/movie/${tmdbId}`, 'ja-JP')
  if (!ja) return null
  let overview = ja.overview || ''
  let overviewLang = 'ja'
  if (!overview) {
    const en = await tmdb(`/movie/${tmdbId}`, 'en-US')
    overview = (en && en.overview) || ''
    overviewLang = 'en'
  }
  return {
    title: ja.title || null,
    originalTitle: ja.original_title || null,
    poster: ja.poster_path || null,
    genres: (ja.genres || []).map((g) => g.name),
    runtime: ja.runtime || null,
    releaseDate: ja.release_date || null,
    overview,
    overviewLang,
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

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(OUTS[0], 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const [watched, ratings, watchlist] = await Promise.all([
    traktAll(`/users/${USER}/watched/movies`),
    traktAll(`/users/${USER}/ratings/movies`),
    traktAll(`/users/${USER}/watchlist/movies/added`),
  ])
  console.log(`📥 Trakt(${USER}): 観た ${watched.length} / 評価 ${ratings.length} / 観たい ${watchlist.length}`)

  const ratingByTrakt = new Map(ratings.map((r) => [r.movie.ids.trakt, { rating: r.rating, ratedAt: r.rated_at }]))

  // 観た映画。評価だけがあって「観た」になっていない映画も、観たものとして並べる
  const watchedMap = new Map()
  for (const w of watched) {
    watchedMap.set(w.movie.ids.trakt, { movie: w.movie, plays: w.plays || 1, lastWatchedAt: knownDate(w.last_watched_at) })
  }
  for (const r of ratings) {
    if (!watchedMap.has(r.movie.ids.trakt)) watchedMap.set(r.movie.ids.trakt, { movie: r.movie, plays: 0, lastWatchedAt: null })
  }

  const previous = readPrevious()
  const cache = new Map()
  for (const list of [previous?.watched ?? [], previous?.watchlist ?? []]) {
    for (const m of list) if (m.tmdb && m.details) cache.set(m.tmdb, m.details)
  }

  const allTmdb = [...new Set([...watchedMap.values(), ...watchlist].map((x) => x.movie.ids.tmdb).filter(Boolean))]
  const missing = allTmdb.filter((id) => !cache.has(id))
  let fetched = 0
  await mapLimit(missing, 6, async (id) => {
    try {
      const details = await tmdbDetails(id)
      if (details) {
        cache.set(id, details)
        fetched += 1
      }
    } catch (err) {
      console.warn(`⚠️  TMDb ${id}: ${err.message}`)
    }
  })
  console.log(`🎞️  TMDb: 新しく ${fetched} 本 / 前回から ${allTmdb.length - missing.length} 本`)

  const base = (movie) => ({
    trakt: movie.ids.trakt,
    tmdb: movie.ids.tmdb ?? null,
    slug: movie.ids.slug,
    year: movie.year ?? null,
    traktTitle: movie.title,
    details: (movie.ids.tmdb && cache.get(movie.ids.tmdb)) || null,
  })

  const watchedOut = [...watchedMap.values()].map(({ movie, plays, lastWatchedAt }) => ({
    ...base(movie),
    plays,
    lastWatchedAt,
    ...(ratingByTrakt.get(movie.ids.trakt) ?? { rating: null, ratedAt: null }),
  }))
  // 観た日の新しい順。日付の無い記録はその後ろに、公開年の新しい順
  watchedOut.sort((a, b) => {
    if (a.lastWatchedAt && b.lastWatchedAt) return b.lastWatchedAt.localeCompare(a.lastWatchedAt)
    if (a.lastWatchedAt) return -1
    if (b.lastWatchedAt) return 1
    return (b.year ?? 0) - (a.year ?? 0)
  })

  const watchlistOut = watchlist
    .map((w) => ({ ...base(w.movie), listedAt: w.listed_at ?? null, rating: null }))
    .sort((a, b) => (b.listedAt ?? '').localeCompare(a.listedAt ?? ''))

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
  console.log(`✅ ${unchanged ? '変化なし' : '書き出し'}: 観た ${watchedOut.length} 本・観たい ${watchlistOut.length} 本`)
}

main().catch((err) => fail(err.message))
