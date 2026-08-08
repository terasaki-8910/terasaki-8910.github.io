#!/usr/bin/env node

/**
 * 観た映画・ドラマ・アニメを記録するスクリプト。星評価+短文コメントは
 * 本人が書く一次データなので、Spotify/GitHub活動のような「Actionsが定期取得
 * →静的JSON」ではなく、観るたびにこのスクリプトをローカルで実行する運用
 * (sync-chara-picker.mjsと同じ、手動起動のパターン)。
 *
 * タイトルで検索し、映画/ドラマはTMDb、アニメはAniList(key不要)から
 * ポスター画像・ジャンル・公開年を引いてくる。星評価とコメントはこのスクリプトが
 * 対話的に聞く。結果は public/watched/{movies,dramas,anime}.json に追記する。
 *
 * 使い方:
 *   node scripts/add-watch-entry.mjs --category movie --title "君の名は。"
 *   node scripts/add-watch-entry.mjs --category anime --title "SPY×FAMILY" --status planned
 *
 * .env に TMDB_API_KEY が必要(映画/ドラマのみ。アニメはkey不要)。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline/promises'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env') })

const TMDB_API_KEY = process.env.TMDB_API_KEY
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
const ANILIST_ENDPOINT = 'https://graphql.anilist.co'

const CATEGORY_FILE = { movie: 'movies.json', drama: 'dramas.json', anime: 'anime.json' }

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const idx = args.indexOf(flag)
    return idx !== -1 ? args[idx + 1] : null
  }
  const category = get('--category')
  const title = get('--title')
  const status = get('--status') || 'watched'

  if (!category || !CATEGORY_FILE[category]) {
    console.error('❌ --category は movie/drama/anime のいずれかを指定してください')
    process.exit(1)
  }
  if (!title) {
    console.error('❌ --title でタイトルを指定してください')
    process.exit(1)
  }
  if (!['watched', 'planned'].includes(status)) {
    console.error('❌ --status は watched/planned のいずれかです')
    process.exit(1)
  }
  return { category, title, status }
}

async function searchTmdb(category, title) {
  if (!TMDB_API_KEY) {
    console.error('❌ .env に TMDB_API_KEY が必要です(映画/ドラマの検索にはTMDbのkeyが要ります)')
    process.exit(1)
  }
  const endpoint = category === 'movie' ? 'search/movie' : 'search/tv'
  const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ja-JP`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDb検索失敗: ${res.status}`)
  const data = await res.json()
  return data.results.slice(0, 5).map((r) => ({
    id: `tmdb-${r.id}`,
    externalId: r.id,
    title: category === 'movie' ? r.title : r.name,
    originalTitle: category === 'movie' ? r.original_title : r.original_name,
    year: (category === 'movie' ? r.release_date : r.first_air_date)?.slice(0, 4) || null,
  }))
}

async function fetchTmdbDetail(category, externalId) {
  const endpoint = category === 'movie' ? 'movie' : 'tv'
  const url = `https://api.themoviedb.org/3/${endpoint}/${externalId}?api_key=${TMDB_API_KEY}&language=ja-JP`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDb詳細取得失敗: ${res.status}`)
  const data = await res.json()
  return {
    genres: (data.genres || []).map((g) => g.name),
    posterUrl: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
    sourceUrl: `https://www.themoviedb.org/${endpoint}/${externalId}`,
  }
}

async function searchAnilist(title) {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title { romaji native }
          startDate { year }
          coverImage { large }
          genres
          siteUrl
        }
      }
    }
  `
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { search: title } }),
  })
  if (!res.ok) throw new Error(`AniList検索失敗: ${res.status}`)
  const data = await res.json()
  return (data.data?.Page?.media || []).map((m) => ({
    id: `anilist-${m.id}`,
    externalId: m.id,
    title: m.title.romaji,
    originalTitle: m.title.native,
    year: m.startDate?.year || null,
    posterUrl: m.coverImage?.large || null,
    genres: m.genres || [],
    sourceUrl: m.siteUrl,
  }))
}

async function main() {
  const { category, title, status } = parseArgs()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log(`🔍 「${title}」を検索中...`)
  const candidates = category === 'anime' ? await searchAnilist(title) : await searchTmdb(category, title)

  if (candidates.length === 0) {
    console.error('❌ 該当する作品が見つかりませんでした')
    rl.close()
    process.exit(1)
  }

  console.log('\n候補:')
  candidates.forEach((c, i) => {
    const alt = c.originalTitle && c.originalTitle !== c.title ? ` (${c.originalTitle})` : ''
    console.log(`  ${i + 1}. ${c.title}${alt} [${c.year || '年不明'}]`)
  })
  const pickRaw = await rl.question('\n番号を選んでください(キャンセルは0): ')
  const pick = parseInt(pickRaw, 10)
  if (!pick || pick < 1 || pick > candidates.length) {
    console.log('キャンセルしました')
    rl.close()
    return
  }
  const chosen = candidates[pick - 1]

  let genres = chosen.genres
  let posterUrl = chosen.posterUrl
  let sourceUrl = chosen.sourceUrl
  if (category !== 'anime') {
    const detail = await fetchTmdbDetail(category, chosen.externalId)
    genres = detail.genres
    posterUrl = detail.posterUrl
    sourceUrl = detail.sourceUrl
  }

  let rating = null
  let comment = null
  let watchedDate = null
  if (status === 'watched') {
    const ratingRaw = await rl.question('星評価(1-5): ')
    rating = Math.min(5, Math.max(1, parseInt(ratingRaw, 10) || 0)) || null
    const commentRaw = await rl.question('コメント(任意、Enterでスキップ): ')
    comment = commentRaw.trim() || null
    const dateRaw = await rl.question('視聴日(YYYY-MM-DD、Enterで今日): ')
    watchedDate = dateRaw.trim() || new Date().toISOString().slice(0, 10)
  }
  rl.close()

  const entry = {
    id: chosen.id,
    title: chosen.title,
    originalTitle: chosen.originalTitle || null,
    posterUrl,
    year: chosen.year ? Number(chosen.year) : null,
    genres,
    status,
    rating,
    comment,
    watchedDate,
    sourceUrl,
  }

  const dataDir = path.join(ROOT, 'public', 'watched')
  fs.mkdirSync(dataDir, { recursive: true })
  const filePath = path.join(dataDir, CATEGORY_FILE[category])
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : { lastUpdated: null, entries: [] }

  const dupIndex = existing.entries.findIndex((e) => e.id === entry.id)
  if (dupIndex !== -1) {
    console.log(`⚠️ 既に登録済みです(${existing.entries[dupIndex].title})。上書きします。`)
    existing.entries[dupIndex] = entry
  } else {
    existing.entries.push(entry)
  }
  existing.lastUpdated = new Date().toISOString()

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n')
  console.log(`✅ ${filePath} に追加しました: ${entry.title}`)
}

main().catch((err) => {
  console.error('❌ エラー:', err.message)
  process.exit(1)
})
