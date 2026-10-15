// 節「流体(SPH)」の段階のシミュレーションが共有する、描画の補助(React にも DOM にも依存しない。Node からテストできる)。
//   - rampColor      ink から FAST_COLOR までをなめらかにつないだ色(全体のシミュレーションの粒子の色と同じ向き)
//   - splitPanels    canvas を「絵」と「グラフ」の 2 つの領域に分ける(幅が足りないときはグラフを出さない)
//   - drawSeries     領域の中に、軸つきの折れ線グラフを描く
//   - drawParticle   粒子 1 つ(円)
// 世界の座標は m。軸と目盛りは axes.js の makeView・drawAxes を使う。

import { makeView, drawAxes } from '../axes.js'
import { monoFont } from '../canvasFont.js'

export const SP = 0.02 // 粒子の間隔 [m](全体のシミュレーションと同じ。defaultSphParams を動作確認した値)
export const FAST_COLOR = 'lane-1'
const TAU = Math.PI * 2

// 色 colors(useCanvas の readColors)の ink から FAST_COLOR までを t(0〜1)でつないだ色
export function rampColor(colors, t, to = FAST_COLOR) {
  const a = colors.rgb.ink
  const b = colors.rgb[to]
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t
  const c = [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * u))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

// 値 v を [lo, hi] で 0〜1 にする(はみ出したら端)
export function unit(v, lo, hi) {
  const t = (v - lo) / (hi - lo)
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

// canvas(width × height)を、絵(main)とグラフ(side)に分ける。幅が sideMin 以上なら左右に(side の幅は全体の frac、
// 間は gap)。足りないときは、stack なら上下に(main が高さの mainFrac)、そうでなければ side は null(絵だけ)。
// 領域は { left, top, width, height }
export function splitPanels(width, height, { sideMin = 520, frac = 0.38, gap = 8, stack = false, mainFrac = 0.62 } = {}) {
  if (width >= sideMin) {
    const sideW = Math.round(width * frac)
    const mainW = width - sideW - gap
    return {
      main: { left: 0, top: 0, width: mainW, height },
      side: { left: mainW + gap, top: 0, width: sideW, height },
    }
  }
  if (stack) {
    const mainH = Math.round(height * mainFrac)
    return {
      main: { left: 0, top: 0, width, height: mainH },
      side: { left: 0, top: mainH + gap, width, height: height - mainH - gap },
    }
  }
  return { main: { left: 0, top: 0, width, height }, side: null }
}

// 領域 rect の中のグラフの view(世界の範囲 xRange × yRange を余白の内側いっぱいに伸ばす)
export function seriesView(rect, xRange, yRange, margin) {
  return makeView({
    width: rect.width,
    height: rect.height,
    xRange,
    yRange,
    margin: { left: 44, right: 18, top: 24, bottom: 36, ...margin },
    equal: false,
  })
}

// 領域 rect に折れ線グラフを描く。
//   spec = { xRange, yRange, xLabel, yLabel, margin?,
//            curves: [{ pts: [[x, y], …], color, width?, dash? }],
//            marks:  [{ x, y, color, r?, ring? }]            (点。ring なら輪郭だけ)
//            vlines: [{ x, color, dash? }], hlines: [{ y, color, dash? }]   (基準の線) }
// 戻り値は view(この領域の座標。ポインタを世界に戻すときに使う)。領域の左上を原点にして描く
export function drawSeries(ctx, rect, colors, spec) {
  const view = seriesView(rect, spec.xRange, spec.yRange, spec.margin)
  const { frame } = view
  ctx.save()
  ctx.translate(rect.left, rect.top)
  drawAxes(ctx, view, { colors, xLabel: spec.xLabel, yLabel: spec.yLabel })
  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.left, frame.top - 2, frame.width + 2, frame.height + 4)
  ctx.clip()
  for (const l of spec.hlines ?? []) strokeLine(ctx, frame.left, view.sy(l.y), frame.right, view.sy(l.y), l)
  for (const l of spec.vlines ?? []) strokeLine(ctx, view.sx(l.x), frame.top, view.sx(l.x), frame.bottom, l)
  for (const c of spec.curves ?? []) {
    if (!c.pts.length) continue
    ctx.strokeStyle = c.color
    ctx.lineWidth = c.width ?? 2
    ctx.setLineDash(c.dash ?? [])
    ctx.beginPath()
    c.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(view.sx(x), view.sy(y)) : ctx.lineTo(view.sx(x), view.sy(y))))
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
  for (const m of spec.marks ?? []) {
    const px = view.sx(m.x)
    const py = view.sy(m.y)
    ctx.beginPath()
    ctx.arc(px, py, m.r ?? 5, 0, TAU)
    if (m.ring) {
      ctx.strokeStyle = m.color
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      ctx.fillStyle = m.color
      ctx.fill()
    }
  }
  ctx.restore()
  return view
}

function strokeLine(ctx, x0, y0, x1, y1, { color, dash, width = 1.5 }) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash ?? [])
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.setLineDash([])
}

// 粒子 1 つ(中心 (px, py)、半径 r の円)。fill は塗り、stroke は輪郭(省略できる)
export function drawParticle(ctx, px, py, r, fill, stroke, lineWidth = 1) {
  ctx.beginPath()
  ctx.arc(px, py, r, 0, TAU)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

// 絵の隅に書く短い文字(canvas の中の注記。ink で 4.5:1 以上)
export function drawNote(ctx, colors, text, x, y, { align = 'left', baseline = 'top', size = 11 } = {}) {
  ctx.save()
  ctx.font = monoFont(size)
  ctx.fillStyle = colors.ink
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
  ctx.restore()
}

// 数の表示
export const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '–')
// 大きな数は k をつける(圧力 12 400 → 12.4 k)
export function fmtK(v, digits = 1) {
  if (!Number.isFinite(v)) return '–'
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(digits)} k` : v.toFixed(0)
}
