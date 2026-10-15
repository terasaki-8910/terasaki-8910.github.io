// 軸・目盛り・ラベルを canvas に描く補助と、世界の座標を画面の座標に写す view。
// 純関数(niceStep・axisTicks・formatTick・makeView)は DOM に触れないので、Node からテストできる
// (tests/vis-page/axes.test.js)。drawAxes だけが ctx に描く。
//
// 使い方(draw の中で):
//   const view = makeView({ width, height, xRange: [0, 4], yRange: [0, 3] })   // 世界の範囲 4 m × 3 m
//   drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
//   ctx.arc(view.sx(x), view.sy(y), r * view.scaleX, 0, Math.PI * 2)             // 世界 → 画面
//   const wx = view.wx(pointerX), wy = view.wy(pointerY)                         // 画面 → 世界
// 世界は y が上向き(物理の向き)で、画面の y(下向き)への変換は view.sy がする。
// 色は colors(useCanvas の draw に渡る。サイトのトークンから読んだもの)だけを使う。

import { monoFont } from './canvasFont.js'

// 軸の外側の余白(CSS px)。左は y の目盛りの数、下は x の目盛りの数と軸の名前、上は y 軸の名前の分。
// 小さい絵では makeView の margin で詰める({ margin: { left: 34, bottom: 30 } } のように、変えたい辺だけ)
export const DEFAULT_MARGIN = { left: 42, right: 14, top: 26, bottom: 40 }

const TICK_LEN = 4
const TICK_FONT = 11
const LABEL_FONT = 12
export const MIN_X_TICK_GAP = 72 // x の目盛りの間隔の最小(px)の既定。数の幅と間があく分
export const MIN_Y_TICK_GAP = 72 // y の既定。縦の絵が低いとき(時間のグラフなど)は drawAxes の minYGap で小さくする(下限は文字の高さ ≈ 20px)

// 目盛りの間隔: 範囲 span を target 個ほどに区切る 1・2・5 × 10^n。target が 1 未満・span が 0 以下なら 1
export function niceStep(span, target = 5) {
  if (!(span > 0) || !Number.isFinite(span) || !(target >= 1)) return 1
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const f = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10
  return f * mag
}

// min〜max に入る、間隔 step の倍数。0 は +0、浮動小数点の誤差は丸める
export function axisTicks(min, max, target = 5) {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const step = niceStep(hi - lo, target)
  const decimals = tickDecimals(step)
  const eps = step * 1e-9
  const values = []
  for (let k = Math.ceil((lo - eps) / step); k * step <= hi + eps; k++) {
    const v = Number((k * step).toFixed(decimals))
    values.push(v === 0 ? 0 : v)
  }
  return { step, values }
}

// 間隔 step の目盛りに要る小数の桁数(0.5 → 1、0.02 → 2、2 → 0、50 → 0)
export function tickDecimals(step) {
  if (!(step > 0)) return 0
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
}

// 目盛りの文字。マイナスは U+2212(−)。-0 は 0
export function formatTick(value, step) {
  const text = Math.abs(value).toFixed(tickDecimals(step))
  return value < 0 && Number(text) !== 0 ? `−${text}` : text
}

// 目盛りの数: 軸の長さ lengthPx に、間隔 minGapPx 以上あけて並ぶ個数(2 以上)
export function tickTarget(lengthPx, minGapPx) {
  return Math.max(2, Math.floor(lengthPx / minGapPx))
}

// 目盛りの間隔の最小(px)。指定がなければ既定、指定しても 20px(数の高さ 11px + 間)より小さくはしない
export function clampGap(gap, fallback) {
  return Number.isFinite(gap) && gap > 0 ? Math.max(20, gap) : fallback
}

// 世界の範囲 xRange × yRange を、canvas(width × height の CSS px)の余白の内側に収める view。
//   equal=true(既定)  x と y の 1 あたりの長さを同じにする(円が円に見える)。枠は余白の内側の中央に置く(余りは左右・上下に等分。
//                     軸と目盛りは枠についてくるので、横長の絵でも軸は枠の左と下にある)
//   equal=false       余白の内側いっぱいに伸ばす
// 返すもの: frame(世界の範囲が占める矩形)、scaleX・scaleY(世界の 1 あたりの px)、sx・sy(世界 → 画面)、wx・wy(画面 → 世界)
export function makeView({ width, height, xRange, yRange, margin, equal = true }) {
  const m = { ...DEFAULT_MARGIN, ...margin }
  const plot = {
    left: m.left,
    top: m.top,
    width: Math.max(1, width - m.left - m.right),
    height: Math.max(1, height - m.top - m.bottom),
  }
  const spanX = xRange[1] - xRange[0]
  const spanY = yRange[1] - yRange[0]
  let scaleX = plot.width / spanX
  let scaleY = plot.height / spanY
  if (equal) scaleX = scaleY = Math.min(scaleX, scaleY)
  const frameW = spanX * scaleX
  const frameH = spanY * scaleY
  const left = plot.left + (plot.width - frameW) / 2
  const top = plot.top + (plot.height - frameH) / 2
  const frame = { left, top, width: frameW, height: frameH, right: left + frameW, bottom: top + frameH }
  return {
    width,
    height,
    margin: m,
    plot,
    frame,
    xRange,
    yRange,
    scaleX,
    scaleY,
    sx: (x) => frame.left + (x - xRange[0]) * scaleX,
    sy: (y) => frame.bottom - (y - yRange[0]) * scaleY,
    wx: (px) => xRange[0] + (px - frame.left) / scaleX,
    wy: (py) => yRange[0] + (frame.bottom - py) / scaleY,
  }
}

// 軸(下と左)、目盛り、目盛りの数、軸の名前(単位つき)を描く。
//   opts.colors   useCanvas の draw に渡る colors(必須)
//   opts.xLabel / opts.yLabel  軸の名前。単位をつける('x [m]'、't [s]')。x は軸の右端の下、y は軸の上端の上
//   opts.xRange / opts.yRange  目盛りを打つ範囲。省略すると view の範囲(世界の範囲のうち一部だけに打つときに使う)
//   opts.minXGap / opts.minYGap  目盛りの間隔の最小(画面の px)。既定は 72。低い絵(枠の高さが 150px 以下など)では、既定だと
//                              目盛りが 0 の 1 つだけになるので、yRange を狭める代わりに minYGap を 28〜36 にする
//                              (数の高さ 11px + 間。下限 20px)
// 軸と目盛りの線は colors.muted(地に 3:1 以上)、文字は colors.ink(4.5:1 以上)。
export function drawAxes(ctx, view, opts = {}) {
  const { colors, xLabel, yLabel, xRange = view.xRange, yRange = view.yRange } = opts
  const { frame } = view
  const xTicks = axisTicks(xRange[0], xRange[1], tickTarget(frame.width, clampGap(opts.minXGap, MIN_X_TICK_GAP)))
  const yTicks = axisTicks(yRange[0], yRange[1], tickTarget(frame.height, clampGap(opts.minYGap, MIN_Y_TICK_GAP)))

  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(frame.left, frame.top)
  ctx.lineTo(frame.left, frame.bottom)
  ctx.lineTo(frame.right, frame.bottom)
  for (const x of xTicks.values) {
    const px = Math.round(view.sx(x)) + 0.5
    ctx.moveTo(px, frame.bottom)
    ctx.lineTo(px, frame.bottom + TICK_LEN)
  }
  for (const y of yTicks.values) {
    const py = Math.round(view.sy(y)) + 0.5
    ctx.moveTo(frame.left - TICK_LEN, py)
    ctx.lineTo(frame.left, py)
  }
  ctx.stroke()

  ctx.fillStyle = colors.ink
  ctx.font = monoFont(TICK_FONT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const x of xTicks.values) ctx.fillText(formatTick(x, xTicks.step), view.sx(x), frame.bottom + TICK_LEN + 2)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const y of yTicks.values) ctx.fillText(formatTick(y, yTicks.step), frame.left - TICK_LEN - 3, view.sy(y))

  ctx.font = monoFont(LABEL_FONT)
  if (xLabel) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(xLabel, frame.right, frame.bottom + TICK_LEN + 2 + TICK_FONT + 5)
  }
  if (yLabel) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(yLabel, frame.left, frame.top - 8)
  }
  ctx.restore()
}

// 矢印(世界の座標で始点と終点)。力・速度・重力などの向きを見せる。色は colors のトークンから渡す
export function drawArrow(ctx, view, x0, y0, x1, y1, { color, width = 2, head = 9 } = {}) {
  const ax = view.sx(x0)
  const ay = view.sy(y0)
  const bx = view.sx(x1)
  const by = view.sy(y1)
  const len = Math.hypot(bx - ax, by - ay)
  if (len < 1) return
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const h = Math.min(head, len * 0.5)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx - ux * h * 0.8, by - uy * h * 0.8)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(bx - ux * h - uy * h * 0.5, by - uy * h + ux * h * 0.5)
  ctx.lineTo(bx - ux * h + uy * h * 0.5, by - uy * h - ux * h * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// 重力の凡例:絵の右上の余白の内側に、下向きの矢印と「g = 9.8 m/s²」を描く(どのタブでも同じ見た目にする)。
// g が 0 なら矢印を描かず「g = 0」だけ。lengthPx は g=9.8 のときの矢印の長さ(画面の px)
export function drawGravityLegend(ctx, view, g, { colors, lengthPx = 28, label = 'g' } = {}) {
  const x = view.frame.right - 12
  const y = view.frame.top + 8
  ctx.save()
  ctx.font = monoFont(11)
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  const text = `${label} = ${g.toFixed(1)} m/s²`
  ctx.fillText(text, x - 10, y)
  if (g > 0) {
    const L = lengthPx * Math.min(g / 9.8, 2)
    const toWorld = (px) => px / view.scaleY
    const wx = view.wx(x)
    const wy0 = view.wy(y)
    drawArrow(ctx, view, wx, wy0, wx, wy0 - toWorld(L), { color: colors.ink, width: 2, head: 7 })
  }
  ctx.restore()
}
