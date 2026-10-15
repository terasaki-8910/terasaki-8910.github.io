// 段階 8「IK」: 2リンクの腕。解析解(ik2Analytic)と、ヤコビアンの繰り返し(ikStep)を並べる。
// 角度・順運動学・1歩の更新は ik.js の関数だけで求める。ここは状態(反復の回数と終わり方)と描画。
import { fk2, ik2Analytic, ikStep } from '../../../utils/vis/ik.js'
import { makeView, drawAxes } from '../axes.js'
import { clamp, fmt, fmtDeg, uiFont } from './transformCommon.js'

export const L1 = 1
export const L2 = 0.7
export const TOL = 1e-3 // これより手先が目標に近づいたら収束(長さ 1 の腕で、画面上 0.2 px ほど)
export const MAX_ITER = 200
const NO_PROGRESS = 10 // 誤差が 10 歩のあいだ縮まらなければ、打ち切る(届かない目標では、伸びきった姿勢のまわりで揺れ続ける)
export const STEPS_PER_SEC = 12 // アニメーションで見せるときの、1秒あたりの反復の回数

export const IK_DEFAULTS = {
  target: [1, 0.6],
  theta0: [1.3, 0.9], // 「リセット」で戻す、目標とは別の姿勢(ヤコビアンの反復が動いて見える)
}

export function createIk() {
  const s = { target: [...IK_DEFAULTS.target], theta: [...IK_DEFAULTS.theta0], iter: 0, status: 'running', bestError: 0, sinceBest: 0 }
  restartIterations(s)
  return s
}

export function tipError(s, theta = s.theta) {
  const { tip } = fk2(L1, L2, theta[0], theta[1])
  return Math.hypot(s.target[0] - tip[0], s.target[1] - tip[1])
}

// 目標・λ・1歩の上限が変わったら、回数を数え直す。status: 'running' | 'converged' | 'stalled' | 'singular'
export function restartIterations(s) {
  s.iter = 0
  s.bestError = tipError(s)
  s.sinceBest = 0
  s.status = tipError(s) < TOL ? 'converged' : 'running'
}

// 1歩だけ進める。進めたら true
export function stepJacobian(s, lambda, maxStep) {
  if (s.status !== 'running') return false
  const next = ikStep(L1, L2, s.theta, s.target, lambda, maxStep)
  if (!next.every(Number.isFinite)) {
    // λ = 0 で、J が特異(det J = 0)な姿勢。J^-1 が無い
    s.status = 'singular'
    return false
  }
  s.theta = next
  s.iter += 1
  const error = tipError(s)
  if (error < s.bestError - 1e-5) {
    s.bestError = error
    s.sinceBest = 0
  } else {
    s.sinceBest += 1
  }
  if (error < TOL) s.status = 'converged'
  else if (s.sinceBest >= NO_PROGRESS || s.iter >= MAX_ITER) s.status = 'stalled'
  return true
}

// 解析解の姿勢
export function analyticPose(target, elbowUp) {
  return ik2Analytic(L1, L2, target[0], target[1], elbowUp)
}

// 腕の根元を原点にした世界(x が右、y が上、単位 m)の範囲。腕を伸ばしきった円(半径 L1 + L2 = 1.7)が収まる
export const IK_RANGE = { x: [-2, 2], y: [-1.8, 1.8] }
const IK_MARGIN = { left: 38, right: 12, top: 24, bottom: 34 }

// 世界 → 画面は axes.js の makeView(軸・目盛りと同じ)。cx・cy は腕の根元の画面の位置、u は世界の 1 m あたりの px
export function ikView(width, height) {
  const view = makeView({ width, height, xRange: IK_RANGE.x, yRange: IK_RANGE.y, margin: IK_MARGIN })
  return { view, cx: view.sx(0), cy: view.sy(0), u: view.scaleX }
}
export function pixelToWorld(v, x, y) {
  return [v.view.wx(x), v.view.wy(y)]
}
// 目標は、軸の範囲の中に収める
export function clampTarget([x, y]) {
  return [clamp(x, IK_RANGE.x[0], IK_RANGE.x[1]), clamp(y, IK_RANGE.y[0], IK_RANGE.y[1])]
}

const STATUS_TEXT = {
  running: '計算中',
  converged: '収束',
  stalled: '打ち切り（届かない、または収束が遅い）',
  singular: '特異な姿勢で解けない（λ を上げる）',
}

export function readoutText(s, { solver, elbowUp, lambda, maxStep, paused = false }) {
  const theta = solver === 'analytic' ? analyticPose(s.target, elbowUp) : s.theta
  const angles = `θ1 = ${fmtDeg(theta[0])}°   θ2 = ${fmtDeg(theta[1])}°`
  if (solver === 'analytic') {
    const r = Math.hypot(s.target[0], s.target[1])
    const lo = Math.abs(L1 - L2)
    const hi = L1 + L2
    const reach = r > hi || r < lo ? '届かない（最も近い姿勢）' : '届く'
    return `${angles}\n目標までの距離 ${fmt(r)}（届く範囲 ${fmt(lo)}〜${fmt(hi)}）${reach}`
  }
  const status = s.status === 'running' && paused ? '停止中（再生か「1歩進める」で進む）' : STATUS_TEXT[s.status]
  return `${angles}   反復 ${s.iter} 回   誤差 ${fmt(tipError(s), 4)}   ${status}\nλ = ${fmt(lambda)}   1歩の上限 ${fmt(maxStep)} rad`
}

export function drawIk({ ctx, width, height, colors }, s, { solver, elbowUp, active = false }) {
  const view = ikView(width, height)
  const { cx, cy, u } = view
  drawAxes(ctx, view.view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
  const px = (p) => [cx + p[0] * u, cy - p[1] * u]
  const theta = solver === 'analytic' ? analyticPose(s.target, elbowUp) : s.theta
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 届く範囲(外の円と内の円のあいだ)
  const rOut = (L1 + L2) * u
  const rIn = Math.abs(L1 - L2) * u
  ctx.fillStyle = colors.alpha('ink', 0.06)
  ctx.beginPath()
  ctx.arc(cx, cy, rOut, 0, Math.PI * 2)
  ctx.arc(cx, cy, rIn, 0, Math.PI * 2, true)
  ctx.fill('evenodd')
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.arc(cx, cy, rOut, 0, Math.PI * 2)
  ctx.moveTo(cx + rIn, cy)
  ctx.arc(cx, cy, rIn, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  const arm = (th, style, lineWidth) => {
    const { elbow, tip } = fk2(L1, L2, th[0], th[1])
    const [bx, by] = [cx, cy]
    const [ex, ey] = px(elbow)
    const [tx, ty] = px(tip)
    ctx.strokeStyle = style
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(ex, ey)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    return { ex, ey, tx, ty }
  }

  // 解析解では、もう一方の肘の解を薄く出す
  if (solver === 'analytic') {
    const other = arm(analyticPose(s.target, !elbowUp), colors.alpha('ink', 0.5), 3)
    ctx.fillStyle = colors.alpha('ink', 0.5)
    ctx.beginPath()
    ctx.arc(other.ex, other.ey, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  // 角度の印: θ1 は x 軸から、θ2 は1本目の延長から、どちらも反時計回り(画面では上向きが正)
  const { elbow, tip } = fk2(L1, L2, theta[0], theta[1])
  const [ex, ey] = px(elbow)
  const [tx, ty] = px(tip)
  const r1 = Math.min(26, u * 0.36) // 小さい画面では、角度の弧と文字を腕に近づけすぎない
  const r2 = Math.min(22, u * 0.3)
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + r1 + 14, cy)
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex + (ex - cx) * 0.45, ey + (ey - cy) * 0.45)
  ctx.stroke()
  ctx.setLineDash([])
  const arc = (x, y, r, from, delta) => {
    // 世界の角度(反時計回りが正)は、canvas では符号を反転する
    ctx.beginPath()
    ctx.arc(x, y, r, -from, -(from + delta), delta > 0)
    ctx.stroke()
  }
  arc(cx, cy, r1, 0, theta[0])
  arc(ex, ey, r2, theta[0], theta[1])
  ctx.font = uiFont(12)
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = (x, y, r, angle, text) => ctx.fillText(text, x + r * Math.cos(-angle), y + r * Math.sin(-angle))
  label(cx, cy, r1 + 14, theta[0] / 2, 'θ1')
  label(ex, ey, r2 + 14, theta[0] + theta[1] / 2, 'θ2')

  // 腕本体
  arm(theta, colors.ink, 6)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = colors.surface
  for (const [x, y] of [[cx, cy], [ex, ey]]) {
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = colors.ink
  ctx.beginPath()
  ctx.arc(tx, ty, 5, 0, Math.PI * 2)
  ctx.fill()

  // 目標(つかんで動かす)。手先との誤差を細い線で
  const [gx, gy] = px(s.target)
  if (Math.hypot(gx - tx, gy - ty) > 2) {
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(gx, gy)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = active ? colors.ink : colors.alpha('accent', 0.9)
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(gx, gy, active ? 12.5 : 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = active ? colors.surface : colors.ink
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(gx - 5, gy)
  ctx.lineTo(gx + 5, gy)
  ctx.moveTo(gx, gy - 5)
  ctx.lineTo(gx, gy + 5)
  ctx.stroke()
}
