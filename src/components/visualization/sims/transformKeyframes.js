// 段階 7「キーフレームの補間」: 時間軸に並べたキーフレームを、線形補間(lerp)と
// 自然3次スプライン(naturalCubicSpline)の2通りで結ぶ。曲線の値は spline.js の関数だけで求める。
import { lerp, naturalCubicSpline, evalSpline, findSegment } from '../../../utils/vis/spline.js'
import { clamp, fmt, uiFont } from './transformCommon.js'

export const KF_TIMES = [0, 1, 2.2, 3.1, 4, 5] // キーフレームの時刻(s)。ふつうの補間は等間隔でなくてよい
export const KF_DEFAULT = [0, 0.75, 0.75, -0.65, 0.35, 0.35] // 値。同じ値が並ぶ所で、2つの補間の差が出る
export const T_END = 5
export const VALUE_LIMIT = 1 // キーフレームの値の範囲 [-1, 1]
const V_MAX = 1.6 // 縦軸の表示の範囲。スプラインの行き過ぎも収まる
const PICK_RADIUS = 26 // キーフレームをつかめる半径(px)

export function buildModel(ys) {
  return { xs: KF_TIMES, ys, spline: naturalCubicSpline(KF_TIMES, ys) }
}

// 時刻 t での2つの補間の値
export function sample(model, t) {
  const i = findSegment(model.xs, t)
  const u = (t - model.xs[i]) / (model.xs[i + 1] - model.xs[i])
  return { lerp: lerp(model.ys[i], model.ys[i + 1], u), spline: evalSpline(model.spline, t) }
}

export function plotRect(width, height) {
  const left = 40
  const right = width - 84
  return { left, right, top: 30, bottom: height - 32, stripX: right + 48 }
}
export const timeToX = (r, t) => r.left + (t / T_END) * (r.right - r.left)
export const valueToY = (r, v) => r.top + ((V_MAX - v) / (2 * V_MAX)) * (r.bottom - r.top)
export const xToTime = (r, x) => clamp(((x - r.left) / (r.right - r.left)) * T_END, 0, T_END)
export const yToValue = (r, y) => V_MAX - ((y - r.top) / (r.bottom - r.top)) * 2 * V_MAX

export function inPlot(r, x, y) {
  return x >= r.left - 8 && x <= r.right + 8 && y >= r.top && y <= r.bottom
}

// 点 (x, y) に一番近いキーフレームの番号。半径の外なら -1
export function pickKeyframe(r, ys, x, y) {
  let best = -1
  let bestD = PICK_RADIUS
  ys.forEach((v, i) => {
    const d = Math.hypot(x - timeToX(r, KF_TIMES[i]), y - valueToY(r, v))
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

export function clampValue(v) {
  return Math.round(clamp(v, -VALUE_LIMIT, VALUE_LIMIT) * 100) / 100
}

export function readoutText(model, time, selected) {
  const s = sample(model, time)
  const k = selected
  return [
    `t = ${fmt(time)} s   線形補間 = ${fmt(s.lerp)} m   スプライン = ${fmt(s.spline)} m`,
    `キーフレーム ${k + 1}/${KF_TIMES.length}：t = ${fmt(KF_TIMES[k])} s，x = ${fmt(model.ys[k])} m`,
  ].join('\n')
}

export function drawKeyframes({ ctx, width, height, colors }, { model, selected, time }) {
  const r = plotRect(width, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 目盛りの線: 値 -1, 0, 1 と、キーフレームの時刻
  ctx.font = uiFont(11)
  ctx.fillStyle = colors.ink
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  for (const v of [1, 0, -1]) {
    const y = valueToY(r, v)
    ctx.strokeStyle = v === 0 ? colors.muted : colors.line
    ctx.lineWidth = 1
    ctx.setLineDash(v === 0 ? [] : [3, 4])
    ctx.beginPath()
    ctx.moveTo(r.left, y)
    ctx.lineTo(r.right, y)
    ctx.stroke()
    ctx.fillText(String(v), r.left - 8, y)
  }
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let t = 0; t <= T_END; t++) {
    const x = timeToX(r, t)
    ctx.strokeStyle = colors.muted
    ctx.beginPath()
    ctx.moveTo(x, r.bottom)
    ctx.lineTo(x, r.bottom + 4)
    ctx.stroke()
    ctx.fillText(String(t), x, r.bottom + 8)
  }
  ctx.textAlign = 'left'
  ctx.fillText('t [s]', r.right + 12, r.bottom + 8)
  ctx.strokeStyle = colors.line
  ctx.setLineDash([2, 4])
  for (const t of KF_TIMES) {
    const x = timeToX(r, t)
    ctx.beginPath()
    ctx.moveTo(x, r.top)
    ctx.lineTo(x, r.bottom)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // 曲線(plot の外にはみ出した分は切る)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top)
  ctx.clip()
  const n = Math.max(2, Math.floor((r.right - r.left) / 2))
  const curve = (pick, style, lineWidth, dash) => {
    ctx.strokeStyle = style
    ctx.lineWidth = lineWidth
    ctx.setLineDash(dash)
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const t = (T_END * i) / n
      const x = timeToX(r, t)
      const y = valueToY(r, pick(sample(model, t)))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  curve((s) => s.lerp, colors.muted, 1.5, [6, 4])
  curve((s) => s.spline, colors.ink, 2.5, [])
  ctx.setLineDash([])
  ctx.restore()

  // キーフレーム。選んでいる点は輪で囲む
  model.ys.forEach((v, i) => {
    const x = timeToX(r, KF_TIMES[i])
    const y = valueToY(r, v)
    if (i === selected) {
      ctx.fillStyle = colors.alpha('accent', 0.55)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillStyle = colors.ink
    ctx.strokeStyle = colors.surface
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })

  // 時刻の線と、その時刻の2つの値
  const now = sample(model, time)
  const px = timeToX(r, time)
  ctx.strokeStyle = colors.alpha('ink', 0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px, r.top)
  ctx.lineTo(px, r.bottom)
  ctx.stroke()
  const dot = (x, y, filled) => {
    ctx.fillStyle = filled ? colors.ink : colors.surface
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, filled ? 4.5 : 6.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  dot(px, valueToY(r, now.spline), true)
  dot(px, valueToY(r, now.lerp), false)

  // 右の帯: 2つの補間が出す値の動き(縦だけ動く)
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(r.stripX, r.top)
  ctx.lineTo(r.stripX, r.bottom)
  ctx.stroke()
  for (const v of [1, 0, -1]) {
    const y = valueToY(r, v)
    ctx.beginPath()
    ctx.moveTo(r.stripX - 4, y)
    ctx.lineTo(r.stripX + 4, y)
    ctx.stroke()
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.stripX - 22, r.top, 44, r.bottom - r.top)
  ctx.clip()
  dot(r.stripX + 10, valueToY(r, now.spline), true)
  dot(r.stripX - 10, valueToY(r, now.lerp), false)
  ctx.restore()
  ctx.fillStyle = colors.ink
  ctx.font = uiFont(11)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('動き', r.stripX, r.bottom + 8)

  // 凡例
  ctx.font = uiFont(12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  let x = r.left + 4
  const y = 14
  const entry = (style, lineWidth, dash, label) => {
    ctx.strokeStyle = style
    ctx.lineWidth = lineWidth
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 24, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = colors.ink
    ctx.fillText(label, x + 30, y)
    x += 30 + ctx.measureText(label).width + 16
  }
  entry(colors.muted, 1.5, [6, 4], '線形補間')
  entry(colors.ink, 2.5, [], '自然3次スプライン')
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'left'
  ctx.fillText('x [m]', 6, y)
}
