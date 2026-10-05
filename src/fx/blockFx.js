// 背景のマス目と、ページ移動のときにマスで画面を覆う演出。
// 全ページ(静的なSpotifyページを含む)に vite.config.js の blockFxPlugin から読み込まれる。
// ページを開いた直後の「覆った状態」は、各HTMLのheadに差し込むCSSとスクリプト
// (vite.config.js の BLOCK_FX_HEAD_*)が出す。JSの読み込みを待たずに効かせるため。
//
// マスの配置は cellValue(列, 行) で、ページ上の位置から決まる。将来、白いマスに重音テトのASCIIを
// 映すときは、この配置(どのマスが白か、どの濃さか)をそのまま使える。

const CELL = 40 // マスの大きさ(px)。背景とページ移動で共通
const DENSITY = 0.3 // 色付きのマスの割合
const SPREAD = 620 // 全マスの変化の開始をずらす幅(ms)
const DUR = 220 // 1マスが変化しきるまでの時間(ms)
const MIN_COVER = 400 // ページを直接開いたとき、覆いを外すまでの最短(ms)
const MAX_COVER = 2500 // 読み込みが遅くても、この時間で覆いを外す(ms)
// 前のページで埋め終わってから移ったことを、次のページに伝える印(sessionStorage)。
// そのときは画面がもう一色で覆われているので、次のページは MIN_COVER を待たずに開く(2026-10-05 本人指定)。
const COVERED_NAV_KEY = 'bk-covered-nav'
const COVERED_NAV_MAX_AGE = 10000 // これより古い印は、移動とは関係ないものとして捨てる(ms)

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
// マスはページ上の位置(列・行)から決まる。スクロールするとマスも一緒に動く(2026-10-05 本人指定。
// それまでは画面に固定で、中身だけが上を流れていた)。開くたびに模様が変わるよう、種は開いたときに決める。
const SEED = Math.floor(Math.random() * 4294967296) >>> 0

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

// -1 は地のままのマス、0〜1 は色付きのマスの濃さの元(テーマごとの範囲に当てはめて使う)
function cellValue(col, row) {
  const h = mix((Math.imul(col + 1, 0x27d4eb2d) ^ Math.imul(row + 1, 0x165667b1) ^ SEED) >>> 0)
  if (h / 4294967296 >= DENSITY) return -1
  return mix(h ^ 0x9e3779b9) / 4294967296
}

// ---- 中身の箱とマスの濃さ -----------------------------------------------------
// 中身の箱(.bk-content)に重なるマスは、文字が読めるようにうっすら見える程度まで薄くし、
// 箱のまわり1マスはその間の濃さにして、段差をなだらかにする(2026-10-05 本人指定)。
// 以前は箱を地の色で塗っていたが、マスの上に別の四角が浮いて見えるのでやめた。
// 濃さは確認シート12回目で、ライトは3案のB、ダークはAに決まった。
const FADE = {
  light: { inside: 0.4, ring: 0.7 },
  dark: { inside: 0.45, ring: 0.72 },
}

// 画面に見えている中身の箱の位置(画面の座標)
function contentRects(height) {
  const rects = []
  for (const box of document.querySelectorAll('.bk-content')) {
    const r = box.getBoundingClientRect()
    if (r.width && r.height && r.bottom > -CELL && r.top < height + CELL) rects.push(r)
  }
  return rects
}

// 2 = 箱に重なる、1 = 箱のまわり1マス、0 = それ以外。x, y はマスの左上(画面の座標)
function levelOf(x, y, rects) {
  let level = 0
  for (const r of rects) {
    if (x < r.right && x + CELL > r.left && y < r.bottom && y + CELL > r.top) return 2
    if (x < r.right + CELL && x + CELL > r.left - CELL && y < r.bottom + CELL && y + CELL > r.top - CELL) level = 1
  }
  return level
}

// 実際に描く濃さ
function cellAlpha(col, row, x, y, rects, theme) {
  const v = cellValue(col, row)
  if (v < 0) return 0
  const t = THEMES[theme]
  const level = levelOf(x, y, rects)
  const fade = level === 2 ? FADE[theme].inside : level === 1 ? FADE[theme].ring : 1
  return (t.lo + v * (t.hi - t.lo)) * fade
}

// 画面の格子: いちばん上の行の番号と、その行のずれ(スクロールの端数)
function gridAt(width, height) {
  const scrollY = window.scrollY || 0
  const firstRow = Math.floor(scrollY / CELL)
  const offY = firstRow * CELL - scrollY
  return {
    firstRow,
    offY,
    cols: Math.ceil(width / CELL),
    rows: Math.ceil((height - offY) / CELL) + 1,
  }
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
// canvas は画面に固定し、スクロールに合わせて、ページ上の位置のマスを描き直す。
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
  const ctx = fitCanvas(bg, width, height)
  const theme = currentTheme()
  const grid = gridAt(width, height)
  const rects = contentRects(height)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = THEMES[theme].tile
  for (let j = 0; j < grid.rows; j++) {
    const y = grid.offY + j * CELL
    for (let i = 0; i < grid.cols; i++) {
      const a = cellAlpha(i, grid.firstRow + j, i * CELL, y, rects, theme)
      if (a <= 0) continue
      ctx.globalAlpha = a
      ctx.fillRect(i * CELL, y, CELL, CELL)
    }
  }
  ctx.globalAlpha = 1
}

// スクロールや中身の大きさが変わったら、次のフレームで1回だけ描き直す
let drawQueued = false
function scheduleDraw() {
  if (drawQueued) return
  drawQueued = true
  requestAnimationFrame(() => {
    drawQueued = false
    drawBackground()
  })
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

// 目標の色(ライトは白、ダークは黒)にどれだけ近いか。背景に描いている濃さで決める。
// ライトは白いマスほど近い。ダークは地の黒のマスがいちばん近く、ピンクが薄いほど近い。
function closeness(alpha, theme) {
  const hi = THEMES[theme].hi
  return theme === 'light' ? alpha / hi : 1 - alpha / hi
}

// dir='in': 目標の色に近いマスから順に、目標の色で覆っていく(最後は一色)。
// dir='out': 一色から、目標の色に遠いマスから順に覆いを外す(近いマスが最後まで残る)。
function animate(dir) {
  return new Promise((resolve) => {
    const width = window.innerWidth
    const height = window.innerHeight
    const ctx = fitCanvas(cover, width, height)
    const theme = currentTheme()
    const color = THEMES[theme].target
    // 背景と同じ格子(スクロールの端数のずれも同じ)で覆う
    const grid = gridAt(width, height)
    const rects = contentRects(height)
    const visibleCols = grid.cols
    const n = visibleCols * grid.rows
    const key = new Float32Array(n)
    const order = new Array(n)
    for (let i = 0; i < n; i++) {
      const cx = i % visibleCols
      const cy = Math.floor(i / visibleCols)
      const alpha = cellAlpha(cx, grid.firstRow + cy, cx * CELL, grid.offY + cy * CELL, rects, theme)
      key[i] = closeness(alpha, theme) + Math.random() * 0.02 // 同じ近さのマスは少しだけ順番をばらす
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
        ctx.fillRect((i % visibleCols) * CELL, grid.offY + Math.floor(i / visibleCols) * CELL, CELL, CELL)
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

// 中身の表示と本文フォントの読み込みを待つ。ページを開いてから最短 minCover、最長2.5秒。
function whenReady(minCover = MIN_COVER) {
  const dom =
    document.readyState === 'loading'
      ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
      : Promise.resolve()
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
  const loaded = Promise.all([dom, fonts]).then(() => nextFrames(2))
  const limit = wait(MAX_COVER - performance.now())
  return Promise.race([loaded, limit]).then(() => wait(minCover - performance.now()))
}

// 前のページで埋め終わってから移ってきたか(印は一度読んだら消す)
function cameCovered() {
  try {
    const at = Number(window.sessionStorage.getItem(COVERED_NAV_KEY))
    window.sessionStorage.removeItem(COVERED_NAV_KEY)
    return at > 0 && Date.now() - at < COVERED_NAV_MAX_AGE
  } catch {
    return false
  }
}

// 埋めている間に、次のページの HTML と、それが読む JS・CSS を取っておく。
// 取れたものはブラウザのキャッシュに入り、移ったあとの読み込みがそこから速く済む。
// 失敗しても移動はそのまま進める(移ったあとに普通に読み込むだけ)。
function prefetch(url) {
  try {
    fetch(url.href, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!text) return
        const doc = new DOMParser().parseFromString(text, 'text/html')
        const refs = new Set()
        doc.querySelectorAll('script[type="module"][src], link[rel="modulepreload"][href], link[rel="stylesheet"][href]').forEach((el) => {
          const ref = new URL(el.getAttribute('src') || el.getAttribute('href'), url.href)
          if (ref.origin === window.location.origin) refs.add(ref.href)
        })
        refs.forEach((ref) => fetch(ref, { credentials: 'same-origin' }).catch(() => {}))
      })
      .catch(() => {})
  } catch {
    // fetch や DOMParser が無い環境では、先に取らずに移る
  }
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
  // 埋め始めると同時に、次のページを読み込み始める。先に読み込めても、埋め終わってから移る(2026-10-05 本人指定)
  prefetch(url)
  animate('in').then(() => {
    covered = true
    try {
      window.sessionStorage.setItem(COVERED_NAV_KEY, String(Date.now()))
    } catch {
      // 保存できなければ、次のページは直接開いたときと同じく最短 MIN_COVER を待つだけ
    }
    window.location.assign(url.href)
  })
}

function init() {
  document.body.prepend(bg)
  document.body.appendChild(cover)
  drawBackground()

  // スクロールに合わせて、ページ上の位置のマスを描き直す。中身が読み込まれて箱の大きさや位置が
  // 変わったときも描き直す(箱に重なるマスを薄くするため)
  window.addEventListener('scroll', scheduleDraw, { passive: true })
  if (window.ResizeObserver) new ResizeObserver(scheduleDraw).observe(document.body)

  // 開いた直後は head の CSS が画面を一色で覆っている。同じ色を canvas に描いてから
  // CSS の覆いを外し、読み込みを待ってマスで開く。中身が並んでから(覆っている間に)背景を描き直す。
  if (root.classList.contains('bk-cover')) {
    fillCover()
    covered = true
    root.classList.remove('bk-cover')
    whenReady(cameCovered() ? 0 : MIN_COVER)
      .then(() => {
        drawBackground()
        return animate('out')
      })
      .then(() => {
        covered = false
      })
  } else {
    whenReady().then(drawBackground)
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
