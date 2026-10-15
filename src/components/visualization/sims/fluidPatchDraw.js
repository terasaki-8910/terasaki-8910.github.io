// 粒子の patch(fluidPatch.js)を描く補助(段階 2〜5・7)。ctx に描くだけで DOM には触れない。
// 色は colors(useCanvas の readColors)のトークンだけ。図形は地に対して 3:1 以上、文字は ink。

import { makeView, drawAxes, drawArrow } from '../axes.js'
import { drawParticle, drawNote, SP } from './fluidKit.js'
import { neighborsOf } from './fluidPatch.js'

export const WORLD = { width: 0.32, height: 0.24 } // 小さなシミュレーションの領域 [m]
export const MARGIN = { left: 40, right: 12, top: 24, bottom: 38 }
const TAU = Math.PI * 2

// 世界 world({ width, height })を canvas の余白の内側に収める view
export function viewFor(world, width, height, margin = MARGIN) {
  return makeView({ width, height, xRange: [0, world.width], yRange: [0, world.height], margin })
}

// 地を塗り、領域の枠と軸・目盛りを描く
export function drawBoard(ctx, view, colors, { xLabel = 'x [m]', yLabel = 'y [m]', width = view.width, height = view.height } = {}) {
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1.5
  ctx.strokeRect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
  drawAxes(ctx, view, { colors, xLabel, yLabel })
}

// 粒子の半径(画面の px)。k = 0.45 は、間隔 SP の粒子がほぼ接する大きさ
export const radiusPx = (view, k = 0.45) => Math.max(2.5, k * SP * view.scaleX)

// 全粒子を描く。fillOf(i) が塗りの色(文字列)。つかんでいる粒子は枠を太く
export function drawParticles(ctx, view, colors, patch, fillOf) {
  const { pos } = patch.state
  const r = radiusPx(view)
  const edge = colors.alpha('ink', 0.55)
  for (let i = 0; i < patch.n; i++) {
    drawParticle(ctx, view.sx(pos[2 * i]), view.sy(pos[2 * i + 1]), r, fillOf(i), edge, 1)
  }
}

// 調べている粒子 patch.selected: 半径 h の円(点線)と、その中にいる近くの粒子の輪、選んだ粒子の太い輪。
// weightOf(j) が 0〜1 を返すと、近くの粒子 j を重みに応じた濃さで塗る(省略すると輪だけ)。
// 戻り値は近くの粒子の数
export function drawProbe(ctx, view, colors, patch, { weightOf } = {}) {
  const i = patch.selected
  const { pos } = patch.state
  const cx = view.sx(pos[2 * i])
  const cy = view.sy(pos[2 * i + 1])
  const r = radiusPx(view)
  const count = neighborsOf(patch, i)

  ctx.save()
  ctx.fillStyle = colors.alpha('lane-0', 0.1)
  ctx.beginPath()
  ctx.arc(cx, cy, patch.params.h * view.scaleX, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = colors.alpha('lane-0', 1)
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.stroke()
  ctx.setLineDash([])
  for (let q = 0; q < count; q++) {
    const j = patch.nbr[q]
    const x = view.sx(pos[2 * j])
    const y = view.sy(pos[2 * j + 1])
    if (weightOf) {
      const w = Math.max(0, Math.min(1, weightOf(j)))
      drawParticle(ctx, x, y, r, colors.alpha('lane-3', 0.2 + 0.8 * w), colors.alpha('ink', 0.7), 1)
    }
    ctx.strokeStyle = colors.alpha('lane-0', 1)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r + 2.5, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  // 選んだ粒子
  drawParticle(ctx, cx, cy, r, patch.grab ? colors.alpha('lane-3', 1) : null, colors.ink, 3)
  return count
}

// 力・速度などの矢印を、粒子 i の中心から (fx, fy) × perUnit [m] の長さで描く。長すぎるものは maxLen [m] で切る。
// 返すのは描いた矢印の先の世界座標(描かなかったら null)
export function drawVector(ctx, view, colors, x, y, fx, fy, perUnit, { color, width = 2, head = 8, maxLen = 0.12 } = {}) {
  let dx = fx * perUnit
  let dy = fy * perUnit
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  if (len > maxLen) {
    dx *= maxLen / len
    dy *= maxLen / len
  }
  drawArrow(ctx, view, x, y, x + dx, y + dy, { color: color ?? colors.ink, width, head })
  return [x + dx, y + dy]
}

// 矢印の長さの目盛り(地図の縮尺のように): 左下に、unitValue の長さの矢印と「= unitValue unit」
export function drawScaleArrow(ctx, view, colors, unitValue, perUnit, unitLabel, { color } = {}) {
  const x0 = view.frame.left + 8
  const y = view.frame.bottom - 12
  const len = unitValue * perUnit * view.scaleX
  ctx.save()
  drawArrow(ctx, view, view.wx(x0), view.wy(y), view.wx(x0 + len), view.wy(y), { color: color ?? colors.ink, width: 2, head: 7 })
  ctx.restore()
  drawNote(ctx, colors, `＝ ${unitValue} ${unitLabel}`, x0 + len + 6, y, { baseline: 'middle' })
}
