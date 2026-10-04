// 背景のマス目と、ページ移動のときにマスで画面を覆う演出。
// 全ページ(静的なSpotifyページを含む)に vite.config.js の blockFxPlugin から読み込まれる。
// ページを開いた直後の「覆った状態」は、各HTMLのheadに差し込むCSSとスクリプト
// (vite.config.js の BLOCK_FX_HEAD_*)が出す。JSの読み込みを待たずに効かせるため。
//
// マスの配置は tiles に持っている。将来、白いマスに重音テトのASCIIを映すときは、
// この配置(どのマスが白か、どの濃さか)をそのまま使える。

const CELL = 40 // マスの大きさ(px)。背景とページ移動で共通
const DENSITY = 0.3 // 色付きのマスの割合
const SPREAD = 620 // 全マスの変化の開始をずらす幅(ms)
const DUR = 220 // 1マスが変化しきるまでの時間(ms)
const MIN_COVER = 400 // ページを開いてから覆いを外すまでの最短(ms)
const MAX_COVER = 2500 // 読み込みが遅くても、この時間で覆いを外す(ms)

const THEMES = {
  // ライト: 黄色の地に白いマス。移動のときは白一色に近づける
  light: { tile: '#FFFFFF', lo: 0.2, hi: 0.75, target: '#FFFFFF' },
  // ダーク: 黒の地にピンクのマス。文字のコントラストを保つため不透明度は0.14まで
  dark: { tile: '#FAA0A0', lo: 0.04, hi: 0.14, target: '#121212' },
}

const root = document.documentElement

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

// headの差し込みスクリプトと同じ順で決める: data-theme → localStorage → OSの設定
function currentTheme() {
  const attr = root.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  try {
    const saved = window.localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // localStorage が使えない環境では OS の設定に従う
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// ---- マスの配置 -------------------------------------------------------------
// -1 は地のままのマス、0〜1 は色付きのマスの濃さの元(テーマごとの範囲に当てはめて使う)。
// 画面が広がったときは足りない分だけ足し、既にあるマスは作り直さない
// (スマホでアドレスバーが出入りしても模様が変わらないように)。
let cols = 0
let rows = 0
let tiles = new Float32Array(0)

function ensureGrid(width, height) {
  const needCols = Math.ceil(width / CELL)
  const needRows = Math.ceil(height / CELL)
  if (needCols <= cols && needRows <= rows) return
  const nextCols = Math.max(needCols, cols)
  const nextRows = Math.max(needRows, rows)
  const next = new Float32Array(nextCols * nextRows)
  for (let y = 0; y < nextRows; y++) {
    for (let x = 0; x < nextCols; x++) {
      next[y * nextCols + x] =
        x < cols && y < rows ? tiles[y * cols + x] : Math.random() < DENSITY ? Math.random() : -1
    }
  }
  cols = nextCols
  rows = nextRows
  tiles = next
}

function alphaAt(index, theme) {
  const v = tiles[index]
  if (v < 0) return 0
  const t = THEMES[theme]
  return t.lo + v * (t.hi - t.lo)
}

function fitCanvas(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.round(width * dpr)
  const h = Math.round(height * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

// ---- 背景 -----------------------------------------------------------------
// 地の色は html の背景(bg-paper)のまま。このcanvasは色付きのマスだけを描く。
// 読み込み後は動かさないので、描くのは開いたとき・大きさが変わったとき・テーマが変わったときだけ。
const bg = document.createElement('canvas')
bg.setAttribute('aria-hidden', 'true')
// canvas は置き換え要素なので、left/right だけでは横に伸びない。幅と高さを明示する。
// 高さは 100lvh(アドレスバーが隠れたときの高さ)にして、スクロール中に大きさが変わらないようにする。
bg.style.cssText =
  'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;z-index:-1;pointer-events:none;display:block'

function drawBackground() {
  const width = bg.clientWidth
  const height = bg.clientHeight
  if (!width || !height) return
  ensureGrid(width, height)
  const ctx = fitCanvas(bg, width, height)
  const theme = currentTheme()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = THEMES[theme].tile
  const visibleCols = Math.ceil(width / CELL)
  const visibleRows = Math.ceil(height / CELL)
  for (let y = 0; y < visibleRows; y++) {
    for (let x = 0; x < visibleCols; x++) {
      const a = alphaAt(y * cols + x, theme)
      if (a <= 0) continue
      ctx.globalAlpha = a
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
    }
  }
  ctx.globalAlpha = 1
}

// ---- 中身の箱の端 -----------------------------------------------------------
// 中身のある所(.bk-content を付けた箱)は、地の色を薄くかぶせて後ろのマスを目立たなくしている
// (src/index.css の .bk-content。2026-10-04 本人指定の案 B)。箱の左右の端が 40px の線とずれると、
// 端でマスが細く切れて見えるので、塗りを box-shadow で線まで広げる。箱の左右の位置は画面の幅で
// しか変わらないので、開いたとき(覆っている間)と大きさが変わったときにだけ計算する。
function snapContentEdges() {
  for (const box of document.querySelectorAll('.bk-content')) {
    const r = box.getBoundingClientRect()
    if (!r.width) continue
    const left = r.left - Math.floor(r.left / CELL) * CELL
    const right = Math.ceil(r.right / CELL) * CELL - r.right
    box.style.boxShadow = `-${left}px 0 0 0 var(--bk-content-fill), ${right}px 0 0 0 var(--bk-content-fill)`
  }
}

// ---- 覆い(ページ移動) -------------------------------------------------------
const cover = document.createElement('canvas')
cover.setAttribute('aria-hidden', 'true')
cover.style.cssText =
  'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;display:none'

let busy = false
let covered = false

function fillCover() {
  const width = window.innerWidth
  const height = window.innerHeight
  const ctx = fitCanvas(cover, width, height)
  ctx.globalAlpha = 1
  ctx.fillStyle = THEMES[currentTheme()].target
  ctx.fillRect(0, 0, width, height)
  cover.style.display = 'block'
}

function hideCover() {
  const ctx = cover.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cover.width, cover.height)
  cover.style.display = 'none'
}

// 目標の色(ライトは白、ダークは黒)にどれだけ近いか。
// ライトは白いマスほど近い。ダークは地の黒のマスがいちばん近く、ピンクが薄いほど近い。
function closeness(index, theme) {
  const a = alphaAt(index, theme)
  if (theme === 'light') return a
  return tiles[index] < 0 ? 1 : 1 - a
}

// dir='in': 目標の色に近いマスから順に、目標の色で覆っていく(最後は一色)。
// dir='out': 一色から、目標の色に遠いマスから順に覆いを外す(近いマスが最後まで残る)。
function animate(dir) {
  return new Promise((resolve) => {
    const width = window.innerWidth
    const height = window.innerHeight
    ensureGrid(width, height)
    const ctx = fitCanvas(cover, width, height)
    const theme = currentTheme()
    const color = THEMES[theme].target
    const visibleCols = Math.ceil(width / CELL)
    const visibleRows = Math.ceil(height / CELL)
    const n = visibleCols * visibleRows
    const key = new Float32Array(n)
    const order = new Array(n)
    for (let i = 0; i < n; i++) {
      const g = Math.floor(i / visibleCols) * cols + (i % visibleCols)
      key[i] = closeness(g, theme) + Math.random() * 0.02 // 同じ近さのマスは少しだけ順番をばらす
      order[i] = i
    }
    order.sort((p, q) => (dir === 'in' ? key[q] - key[p] : key[p] - key[q]))
    const delay = new Float32Array(n)
    order.forEach((cell, rank) => {
      delay[cell] = (rank * SPREAD) / n
    })
    cover.style.display = 'block'
    let start = 0
    function frame(now) {
      if (!start) start = now
      const t = now - start
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color
      for (let i = 0; i < n; i++) {
        const p = Math.min(1, Math.max(0, (t - delay[i]) / DUR))
        const eased = 1 - (1 - p) * (1 - p)
        const alpha = dir === 'in' ? eased : 1 - eased
        if (alpha <= 0) continue
        ctx.globalAlpha = alpha
        ctx.fillRect((i % visibleCols) * CELL, Math.floor(i / visibleCols) * CELL, CELL, CELL)
      }
      ctx.globalAlpha = 1
      if (t < SPREAD + DUR) {
        requestAnimationFrame(frame)
        return
      }
      if (dir === 'in') fillCover()
      else hideCover()
      resolve()
    }
    requestAnimationFrame(frame)
  })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function nextFrames(count) {
  return new Promise((resolve) => {
    const step = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
    step(count)
  })
}

// 中身の表示と本文フォントの読み込みを待つ。ページを開いてから最短0.4秒、最長2.5秒。
function whenReady() {
  const dom =
    document.readyState === 'loading'
      ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
      : Promise.resolve()
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
  const loaded = Promise.all([dom, fonts]).then(() => nextFrames(2))
  const limit = wait(MAX_COVER - performance.now())
  return Promise.race([loaded, limit]).then(() => wait(MIN_COVER - performance.now()))
}

// 演出を出さないリンク: 別タブ・ダウンロード・外部・同じページ内の # へのリンク
function transitionTarget(event) {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!link) return null
  if (link.hasAttribute('download')) return null
  const target = link.getAttribute('target')
  if (target && target !== '_self') return null
  let url
  try {
    url = new URL(link.href, window.location.href)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return null
  return url
}

function onClick(event) {
  if (prefersReducedMotion()) return
  const url = transitionTarget(event)
  if (!url) return
  event.preventDefault()
  if (busy) return
  busy = true
  animate('in').then(() => {
    covered = true
    window.location.assign(url.href)
  })
}

function init() {
  document.body.prepend(bg)
  document.body.appendChild(cover)
  drawBackground()

  // 開いた直後は head の CSS が画面を一色で覆っている。同じ色を canvas に描いてから
  // CSS の覆いを外し、読み込みを待ってマスで開く。中身の箱の端は、中身が並んでから(覆っている間に)そろえる。
  if (root.classList.contains('bk-cover')) {
    fillCover()
    covered = true
    root.classList.remove('bk-cover')
    whenReady()
      .then(() => {
        snapContentEdges()
        return animate('out')
      })
      .then(() => {
        covered = false
      })
  } else {
    whenReady().then(snapContentEdges)
  }

  document.addEventListener('click', onClick)

  // 戻る・進むでキャッシュから復元されたときは、覆いを外した状態で見せる
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    busy = false
    covered = false
    root.classList.remove('bk-cover')
    hideCover()
    drawBackground()
  })

  let resizeTimer = 0
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      snapContentEdges()
      drawBackground()
      if (covered) fillCover()
    }, 150)
  })

  // テーマが変わったら色だけ描き直す(配置はそのまま)
  const redrawForTheme = () => {
    drawBackground()
    if (covered) fillCover()
  }
  new MutationObserver(redrawForTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    if (media.addEventListener) media.addEventListener('change', redrawForTheme)
  }
}

if (document.body) init()
else document.addEventListener('DOMContentLoaded', init, { once: true })
