// 布の節の段階のシミュレーションが共通で使う、canvas に描く補助(色は useCanvas の colors のトークンだけ)。
// 領域 rect = { x, y, w, h }(canvas 上の CSS px)の中に、時間の流れのグラフと、バネとおもりの絵を描く。
import { axisTicks, drawArrow, drawAxes, formatTick, makeView } from '../axes.js'
import { monoFont, uiFont } from '../canvasFont.js'
import { traceLength, traceTime, traceValue, windowStart } from './clothTrace.js'

// 画面の座標をそのまま使う view(drawArrow に画面の px で始点・終点を渡すとき)
export const PX = { sx: (v) => v, sy: (v) => v }
export const PLOT_MARGIN = { left: 46, right: 12, top: 24, bottom: 36 }
const KEY_FONT = 11

// 文字。mono = 等幅(数)。align は 'left' | 'center' | 'right'
// halo に色(地の色 colors.surface)を渡すと、文字のまわりをその色で縁取る(線や矢印の上でも読めるように)
export function drawText(ctx, text, x, y, { color, size = 12, align = 'left', baseline = 'middle', mono = false, halo } = {}) {
  ctx.save()
  ctx.font = mono ? monoFont(size) : uiFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  if (halo) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = halo
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

// 折れ線 pts([[x, y], ...])。dash は破線の [線, 空き]
export function strokePolyline(ctx, pts, { color, width = 2, dash = [] }) {
  if (pts.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
  ctx.restore()
}

// グラフの線の見本つきの説明(枠の右上の内側)。entries: [{ label, color, dash?, width? }]
export function drawPlotKey(ctx, view, colors, entries) {
  const { frame } = view
  let y = frame.top + 9
  ctx.save()
  ctx.font = uiFont(KEY_FONT)
  ctx.textBaseline = 'middle'
  for (const e of entries) {
    const w = ctx.measureText(e.label).width
    const xr = frame.right - 8
    ctx.fillStyle = colors.surface
    ctx.globalAlpha = 0.85
    ctx.fillRect(xr - w - 34, y - 8, w + 32, 16)
    ctx.globalAlpha = 1
    ctx.strokeStyle = e.color
    ctx.lineWidth = e.width ?? 2
    ctx.setLineDash(e.dash ?? [])
    ctx.beginPath()
    ctx.moveTo(xr - w - 28, y)
    ctx.lineTo(xr - w - 8, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = colors.ink
    ctx.textAlign = 'right'
    ctx.fillText(e.label, xr, y)
    y += 16
  }
  ctx.restore()
}

// グラフの線の説明の並べ方: 1 行に収まれば 1 行、収まらなければ 1 項目 1 行。戻り値は行の配列(行 = [{ e, w }])
function layoutKey(ctx, entries, maxW) {
  ctx.save()
  ctx.font = uiFont(KEY_FONT)
  const items = entries.map((e) => ({ e, w: 26 + 6 + ctx.measureText(e.label).width }))
  ctx.restore()
  const total = items.reduce((sum, it) => sum + it.w, 0) + 14 * (items.length - 1)
  return total <= maxW ? [items] : items.map((it) => [it])
}

// 線の説明を、枠の上の余白に右寄せで描く(曲線の上に重ならない)。行は上から並べ、いちばん下の行が枠のすぐ上
function drawKeyAbove(ctx, view, colors, rows) {
  const { frame } = view
  ctx.save()
  ctx.font = uiFont(KEY_FONT)
  ctx.textBaseline = 'middle'
  rows.forEach((row, r) => {
    const y = frame.top - 13 - (rows.length - 1 - r) * 16
    let xr = frame.right
    for (let i = row.length - 1; i >= 0; i--) {
      const { e, w } = row[i]
      ctx.strokeStyle = e.color
      ctx.lineWidth = e.width ?? 2
      ctx.setLineDash(e.dash ?? [])
      ctx.beginPath()
      ctx.moveTo(xr - w, y)
      ctx.lineTo(xr - w + 26, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = colors.ink
      ctx.textAlign = 'right'
      ctx.fillText(e.label, xr, y)
      xr -= w + 14
    }
  })
  ctx.restore()
}

export const TIME_PLOT_Y_GAP = 30 // 低い枠でも 3 つ以上の目盛りが並ぶ間隔(数の高さ 11px の 2.5 倍ほど)

// 時間の流れのグラフ(横軸 t [s])を rect の中に描く。
//   o.trace      clothTrace.js の記録
//   o.tNow       いまの時刻 [s]。W 秒の窓を、始まって W 秒たつまでは [0, W]、それからは [tNow − W, tNow] にする
//   o.yRange     縦軸の範囲 [最小, 最大]
//   o.series     [{ ch, color, width?, dash?, markers? }]  ch は記録のチャンネル。markers が true なら記録の点に印を付ける
//   o.xLabel / o.yLabel  軸の名前(単位つき)。xLabel の既定は 't [s]'
//   o.zero       true なら縦軸の 0 に細い線
//   o.overlay    (ctx, view) => void  枠の中に足して描く(解析解の線など。view は世界 = (t, 値) の座標)
//   o.yTickRange 縦軸の目盛りを打つ範囲(省略すると yRange 全体。世界の範囲のうち一部だけに目盛りを打ちたいときに使う)
//   o.minYGap    縦軸の目盛りの間隔の最小(画面の px。既定は TIME_PLOT_Y_GAP)。枠が低いと、既定の 72px では目盛りが 0 だけになる
//   o.key        [{ label, color, width?, dash? }]  線の説明。枠の上の余白に右寄せで描く(1 行に収まらなければ複数行にして、余白を広げる)
// 戻り値は view(軸の外の文字を足したいとき)。
export function drawTimePlot(ctx, rect, colors, o) {
  const { trace, tNow, W, yRange } = o
  const t0 = windowStart(tNow, W)
  ctx.save()
  ctx.translate(rect.x, rect.y)
  const base = o.margin ?? PLOT_MARGIN
  let keyRows = null
  let margin = base
  if (o.key?.length) {
    // 左上の軸の名前(y)と同じ高さに並ぶので、その幅を除いた分に収める
    ctx.font = monoFont(12)
    const labelW = o.yLabel ? ctx.measureText(o.yLabel).width + 16 : 0
    keyRows = layoutKey(ctx, o.key, rect.w - (base.left ?? 46) - (base.right ?? 12) - labelW)
    margin = { ...base, top: (base.top ?? 24) + 16 * (keyRows.length - 1) }
  }
  const view = makeView({
    width: rect.w,
    height: rect.h,
    xRange: [t0, t0 + W],
    yRange,
    equal: false,
    margin,
  })
  if (keyRows) drawKeyAbove(ctx, view, colors, keyRows)
  drawAxes(ctx, view, {
    colors,
    xLabel: o.xLabel ?? 't [s]',
    yLabel: o.yLabel,
    yRange: o.yTickRange ?? yRange,
    minYGap: o.minYGap ?? TIME_PLOT_Y_GAP,
  })
  const { frame } = view
  ctx.beginPath()
  ctx.rect(frame.left, frame.top, frame.width, frame.height)
  ctx.clip()
  if (o.zero && yRange[0] < 0 && yRange[1] > 0) {
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(frame.left, view.sy(0))
    ctx.lineTo(frame.right, view.sy(0))
    ctx.stroke()
    ctx.setLineDash([])
  }
  const n = traceLength(trace)
  const span = yRange[1] - yRange[0]
  const lo = yRange[0] - span
  const hi = yRange[1] + span
  for (const s of o.series) {
    const pts = []
    for (let i = 0; i < n; i++) {
      const t = traceTime(trace, i)
      if (t < t0 - W * 0.05) continue
      const v = traceValue(trace, s.ch, i)
      if (!Number.isFinite(v)) continue
      pts.push([view.sx(t), view.sy(Math.max(lo, Math.min(hi, v)))])
    }
    strokePolyline(ctx, pts, { color: s.color, width: s.width ?? 2, dash: s.dash })
    if (s.markers) {
      ctx.fillStyle = s.color
      for (const [px, py] of pts) ctx.fillRect(px - 2.5, py - 2.5, 5, 5)
    }
  }
  o.overlay?.(ctx, view)
  ctx.restore()
  return view
}

// 世界の座標で始点・終点の矢印の横に、文字(ラベル)を添える。矢印の終点の近く
export function drawArrowWithLabel(ctx, view, x0, y0, x1, y1, { color, width = 2.5, head = 9, label, labelColor, dx = 4, dy = -10 }) {
  drawArrow(ctx, view, x0, y0, x1, y1, { color, width, head })
  if (label) drawText(ctx, label, view.sx(x1) + dx, view.sy(y1) + dy, { color: labelColor ?? color, size: 12, mono: true })
}

// ---- バネとおもりの絵 ----

// 横向きのバネ(ジグザグ)。画面の座標 xa〜xb、高さ y。両端の 8 px はまっすぐ
export function drawSpringZigzag(ctx, xa, xb, y, { color, coils = 9, amp = 8, width = 2 }) {
  const lead = Math.min(8, Math.abs(xb - xa) / 4)
  const dir = xb >= xa ? 1 : -1
  const a = xa + dir * lead
  const b = xb - dir * lead
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(xa, y)
  ctx.lineTo(a, y)
  const n = coils * 2
  for (let i = 1; i < n; i++) {
    const x = a + ((b - a) * i) / n
    ctx.lineTo(x, y + (i % 2 === 1 ? -amp : amp))
  }
  ctx.lineTo(b, y)
  ctx.lineTo(xb, y)
  ctx.stroke()
  ctx.restore()
}

// 縦の壁(斜線の影つき)。x の左側に斜線
export function drawWall(ctx, x, yTop, yBottom, colors) {
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x, yTop)
  ctx.lineTo(x, yBottom)
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.strokeStyle = colors.muted
  ctx.beginPath()
  for (let y = yTop; y < yBottom; y += 7) {
    ctx.moveTo(x, y + 6)
    ctx.lineTo(x - 6, y)
  }
  ctx.stroke()
  ctx.restore()
}

// おもり(四角)。grabbed のとき accent で塗って太い枠
export function drawMassBox(ctx, cx, cy, half, colors, { grabbed = false } = {}) {
  ctx.save()
  ctx.fillStyle = grabbed ? colors.accent : colors.alpha('accent', 0.6)
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = grabbed ? 2.5 : 1.5
  ctx.beginPath()
  ctx.rect(cx - half, cy - half, half * 2, half * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// おもりの大きさ(半分の辺の長さ [px])。重いほど大きい
export const massHalf = (m) => 9 + 5 * Math.sqrt(m)

// 位置の定規: view の枠の下の辺に、目盛りと数と単位を描く
export function drawRulerX(ctx, view, colors, label = 'x [m]') {
  const { frame } = view
  const ticks = axisTicks(view.xRange[0], view.xRange[1], Math.max(2, Math.floor(frame.width / 64)))
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(frame.left, frame.bottom + 0.5)
  ctx.lineTo(frame.right, frame.bottom + 0.5)
  for (const x of ticks.values) {
    const px = Math.round(view.sx(x)) + 0.5
    ctx.moveTo(px, frame.bottom)
    ctx.lineTo(px, frame.bottom + 4)
  }
  ctx.stroke()
  ctx.fillStyle = colors.ink
  ctx.font = monoFont(11)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const x of ticks.values) ctx.fillText(formatTick(x, ticks.step), view.sx(x), frame.bottom + 6)
  ctx.textAlign = 'right'
  ctx.font = monoFont(12)
  ctx.fillText(label, frame.right, frame.bottom + 6 + 13)
  ctx.restore()
}

// 破線の縦線(自然長の位置など)
export function drawVLine(ctx, x, y0, y1, { color, width = 1.5, dash = [4, 3] }) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(x, y0)
  ctx.lineTo(x, y1)
  ctx.stroke()
  ctx.restore()
}

// ---- 1 本のバネとおもりの絵(段階 1〜5)----
// 絵の領域 rect の中に、壁・バネ・おもり・自然長の位置・位置の定規を描く。座標は rect の左上が原点
// (呼ぶ側が ctx.translate(rect.x, rect.y) してから描く。ポインタの座標も rect.x・rect.y を引いて渡す)。

export const PIC_X_RANGE = [-0.25, 2.05] // 絵の横の範囲 [m]。壁が 0、自然長のおもりが 1(= L0)

// 絵の view(横は PIC_X_RANGE。縦は使わない)。ruler が true なら下に定規の余白をとる
export function pictureView(rect, { ruler = true, top = 16 } = {}) {
  return makeView({
    width: rect.w,
    height: rect.h,
    xRange: PIC_X_RANGE,
    yRange: [-1, 1],
    equal: false,
    margin: { left: 8, right: 12, top, bottom: ruler ? 38 : 6 },
  })
}

// おもりの中心の画面座標
export function massCenter(view, x, L0 = 1) {
  return { x: view.sx(L0 + x), y: view.sy(0) }
}

// (px, py) がおもりの上か(つかめる範囲。指で触れやすいように slop だけ広げる)
export function overMass(view, x, m, px, py, slop = 12, L0 = 1) {
  const c = massCenter(view, x, L0)
  const r = massHalf(m) + slop
  return Math.abs(px - c.x) <= r && Math.abs(py - c.y) <= r
}

// 絵を描く。o = { x [m]、m [kg]、grabbed、ruler、label(labelAlign: 'right' で右上)、force: { value [N], color, text, metersPerN }, extension: { color, text } }
//   force があれば、おもりの上に力の矢印(1 N あたり metersPerN m の長さ)と値、
//   extension があれば、自然長の位置からおもりまでの伸び x の印と値を描く。
//   自然長の位置は点線で、定規がある絵では目盛りの下に「自然長」と書く。文字は矢印・印の端に置いて、行を増やさない
export function drawSpringPicture(ctx, view, colors, o) {
  const { frame } = view
  const c = massCenter(view, o.x)
  const half = massHalf(o.m)
  const midY = c.y
  const x1m = view.sx(1)
  const halo = colors.surface
  drawVLine(ctx, x1m, midY - 26, o.ruler !== false ? frame.bottom : midY + 26, { color: colors.muted })
  drawWall(ctx, view.sx(0), midY - 24, midY + 24, colors)
  drawSpringZigzag(ctx, view.sx(0), c.x - half, midY, { color: colors.ink, amp: 7, coils: 9 })
  drawMassBox(ctx, c.x, midY, half, colors, { grabbed: o.grabbed })
  if (o.force) {
    const { value, color, metersPerN = 0.0375, text } = o.force
    const y = midY - half - 12
    const x1 = c.x + value * metersPerN * view.scaleX
    drawArrow(ctx, PX, c.x, y, x1, y, { color, width: 3, head: 9 })
    if (text) {
      // 文字は矢印の尻(おもり側)の反対、矢印が短いときはおもりの真上
      const short = Math.abs(x1 - c.x) < 24
      const align = short ? 'center' : x1 < c.x ? 'left' : 'right'
      const tx = short ? c.x : x1 < c.x ? c.x + 8 : c.x - 8
      drawText(ctx, text, tx, y - (short ? 12 : 0), { color, size: 12, align, mono: true, halo })
    }
  }
  if (o.extension) {
    const { color, text } = o.extension
    const y = midY + half + 12
    if (Math.abs(c.x - x1m) > 3) {
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x1m, y)
      ctx.lineTo(c.x, y)
      ctx.moveTo(x1m, y - 4)
      ctx.lineTo(x1m, y + 4)
      ctx.moveTo(c.x, y - 4)
      ctx.lineTo(c.x, y + 4)
      ctx.stroke()
      ctx.restore()
    }
    // 文字は印の外側の端(右へ伸びていれば右、縮んでいれば左)
    if (text) {
      const right = c.x >= x1m
      drawText(ctx, text, c.x + (right ? 8 : -8), y, { color: colors.ink, size: 12, align: right ? 'left' : 'right', mono: true, halo })
    }
  }
  if (o.label) {
    const right = o.labelAlign === 'right'
    drawText(ctx, o.label, right ? frame.right - 2 : frame.left + 2, frame.top + 2, { color: colors.ink, size: 12, baseline: 'top', align: right ? 'right' : 'left' })
  }
  if (o.ruler !== false) {
    drawRulerX(ctx, view, colors, 'おもりの位置 [m]')
    drawText(ctx, '自然長', x1m, frame.bottom + 25, { color: colors.ink, size: 11, align: 'center' })
  }
}
