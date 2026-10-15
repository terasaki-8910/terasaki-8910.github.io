// 旧 URL(https://terasaki-8910.github.io)で出す、新しい URL(https://fuyuiro.pages.dev)への転送ページを作る。
// 本番は Cloudflare Pages に移した(2026-10-12 確認シート20回目 R20-2・R20-3)。GitHub Pages では 301 の転送ができないので、
// どのページも canonical(新しい URL)・meta refresh(0秒)・location.replace(パスと ? と # を引き継ぐ)の3つで転送する。
// ごみ収集カレンダーの .ics は、旧 URL で購読している人のために中身をそのまま出し続ける(カレンダーは HTML の転送をたどらない)。
// 使い方: npm run build のあとに node scripts/build-redirect-site.mjs → redirect-site/ に出す(deploy.yml が GitHub Pages に送る)
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const NEW = 'https://fuyuiro.pages.dev'
const OUT = 'redirect-site'
// vite.config.js の入口のページと、public/ にある単独のページ
const PAGES = ['', 'ascii/', 'spotify/', 'gomi-tsukuba/', 'chara-picker/', 'gaming-archive/', 'movies/', 'visualization/', 'dramas/', 'anime/', 'career/', 'callback.html', 'error.html']

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const page = (path) => {
  const to = `${NEW}/${path}`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>移転しました | @オーバーライド</title>
<link rel="canonical" href="${esc(to)}">
<meta http-equiv="refresh" content="0; url=${esc(to)}">
<script>location.replace(${JSON.stringify(NEW)} + location.pathname + location.search + location.hash)</script>
<style>html{background:#F9EC8E;color:#1A1A1A;font-family:system-ui,sans-serif}body{margin:0;padding:40px 16px;line-height:1.7}a{color:inherit}</style>
</head>
<body>
<p>このサイトは <a href="${esc(to)}">${esc(to)}</a> に移りました。</p>
</body>
</html>
`
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
for (const path of PAGES) {
  const file = path === '' ? 'index.html' : path.endsWith('/') ? `${path}index.html` : path
  mkdirSync(join(OUT, file, '..'), { recursive: true })
  writeFileSync(join(OUT, file), page(path))
}
// ほかの URL(深いリンク)は、404 のページから同じパスへ送る
writeFileSync(join(OUT, '404.html'), page(''))
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n')

// ごみ収集カレンダーの購読ファイル(ビルド結果からそのまま写す)
const ics = 'docs/gomi-tsukuba/ics'
if (!existsSync(ics)) throw new Error(`${ics} がありません。先に npm run build を実行してください`)
mkdirSync(join(OUT, 'gomi-tsukuba/ics'), { recursive: true })
let n = 0
for (const f of readdirSync(ics)) {
  if (!f.endsWith('.ics')) continue
  copyFileSync(join(ics, f), join(OUT, 'gomi-tsukuba/ics', f))
  n++
}
console.log(`redirect-site: ${PAGES.length} pages + 404 + robots.txt + ${n} .ics`)
