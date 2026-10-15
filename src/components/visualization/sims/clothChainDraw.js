// 鎖(clothChain.js の世界)を canvas に描く。段階 6(質点-ばね系)と段階 9(位置ベース法)が使う。
import { makeView, drawArrow } from '../axes.js'
import { CHAIN_H, CHAIN_W, PIN } from './clothChain.js'
import { drawText } from './clothDraw.js'

export const CHAIN_MARGIN = { left: 40, right: 12, top: 24, bottom: 36 }
export const NODE_R = 7 // 質点の半径 [px]
export const GRAB_SLOP = 14 // 質点の外側でもつかめる範囲 [px]
export const STRETCH_WARN = 0.1

export function chainView(width, height) {
  return makeView({ width, height, xRange: [0, CHAIN_W], yRange: [0, CHAIN_H], margin: CHAIN_MARGIN })
}

// 軸、天井(固定した端の線)、バネ(または棒)、質点を描く。
//   o.rods  true なら棒(距離の拘束。位置ベース法)、false ならバネのジグザグ
//   o.selected  力の矢印を描く質点の輪を付けるか
export function drawChain(ctx, view, world, colors, { rods = false, selected = false } = {}) {
  const { pos } = world.state
  const px = (i) => view.sx(pos[2 * i])
  const py = (i) => view.sy(pos[2 * i + 1])

  // 天井
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(view.sx(PIN[0] - 0.3), view.sy(PIN[1]))
  ctx.lineTo(view.sx(PIN[0] + 0.3), view.sy(PIN[1]))
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.strokeStyle = colors.muted
  ctx.beginPath()
  for (let x = PIN[0] - 0.3; x < PIN[0] + 0.3; x += 0.05) {
    ctx.moveTo(view.sx(x) + 6, view.sy(PIN[1]) - 6)
    ctx.lineTo(view.sx(x), view.sy(PIN[1]))
  }
  ctx.stroke()
  ctx.restore()

  // バネ・棒。伸びすぎ(10 % 以上)は警告の色で太く
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    ctx.lineWidth = pass === 0 ? 2 : 3
    ctx.strokeStyle = pass === 0 ? colors.alpha('ink', 0.85) : colors.alpha('diff-delete', 1)
    for (const { i, j, L0 } of world.springs) {
      const dx = pos[2 * j] - pos[2 * i]
      const dy = pos[2 * j + 1] - pos[2 * i + 1]
      const strained = Math.sqrt(dx * dx + dy * dy) > L0 * (1 + STRETCH_WARN)
      if (strained !== (pass === 1)) continue
      if (rods) {
        ctx.moveTo(px(i), py(i))
        ctx.lineTo(px(j), py(j))
      } else {
        zigzag(ctx, px(i), py(i), px(j), py(j))
      }
    }
    ctx.stroke()
  }

  // 質点
  for (let i = 1; i <= world.n; i++) {
    const grabbed = i === world.grab.index
    ctx.beginPath()
    ctx.arc(px(i), py(i), grabbed ? NODE_R + 2 : NODE_R, 0, Math.PI * 2)
    ctx.fillStyle = grabbed ? colors.accent : colors.alpha('accent', 0.6)
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = grabbed ? 2.5 : 1.5
    ctx.fill()
    ctx.stroke()
    if (selected && i === world.selected && !grabbed) {
      ctx.beginPath()
      ctx.arc(px(i), py(i), NODE_R + 5, 0, Math.PI * 2)
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

// 2 点の間のジグザグ(両端の 25 % はまっすぐ)。パスに足すだけで stroke は呼ばない
function zigzag(ctx, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const coils = Math.max(2, Math.min(5, Math.round(len / 12))) // 短いバネは巻きを減らす(つぶれて黒い塊にならないように)
  const amp = Math.max(3, Math.min(4.5, len / 10))
  if (len < 14) {
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    return
  }
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const lead = Math.min(len * 0.2, 8)
  const n = coils * 2
  const span = len - 2 * lead
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax + ux * lead, ay + uy * lead)
  for (let s = 1; s < n; s++) {
    const t = lead + (span * s) / n
    const side = s % 2 === 1 ? 1 : -1
    ctx.lineTo(ax + ux * t + nx * amp * side, ay + uy * t + ny * amp * side)
  }
  ctx.lineTo(bx - ux * lead, by - uy * lead)
  ctx.lineTo(bx, by)
}

// 質点 i の力の矢印(重力 mg・上のバネ・下のバネ・合力)。f は nodeForces の戻り値、pxPerN は 1 N の長さ(px)
export function drawForceArrows(ctx, view, world, i, f, colors, { pxPerN = 55, maxPx = 130 } = {}) {
  const x = world.state.pos[2 * i]
  const y = world.state.pos[2 * i + 1]
  const toWorld = (v) => v / view.scaleX
  const scaleFor = (vec) => {
    const len = Math.hypot(vec[0], vec[1]) * pxPerN
    return len > maxPx ? maxPx / len : 1
  }
  const items = [
    { vec: f.gravity, color: colors.alpha('lane-3', 1), width: 2.5, label: 'mg' },
    { vec: f.above, color: colors.alpha('lane-1', 1), width: 2.5, label: 'F₁' },
    { vec: f.below, color: colors.alpha('lane-4', 1), width: 2.5, label: 'F₂' },
    { vec: f.total, color: colors.ink, width: 4, label: '合力' },
  ]
  items.sort((a, b) => Math.hypot(...b.vec) - Math.hypot(...a.vec)) // 長いものから(短いものを上に重ねる)。合力は最後
  const total = items.splice(items.findIndex((it) => it.label === '合力'), 1)[0]
  for (const it of [...items, total]) {
    const len = Math.hypot(it.vec[0], it.vec[1]) * pxPerN * scaleFor(it.vec)
    if (len < 3) continue
    const ux = it.vec[0] / Math.hypot(it.vec[0], it.vec[1])
    const uy = it.vec[1] / Math.hypot(it.vec[0], it.vec[1])
    const x1 = x + toWorld(ux * len)
    const y1 = y + toWorld(uy * len)
    drawArrow(ctx, view, x, y, x1, y1, { color: it.color, width: it.width, head: it.label === '合力' ? 11 : 8 })
    // 文字は矢印の先の外側に置く。canvas の外に出ないように収める
    const lx = Math.max(16, Math.min(view.width - 16, view.sx(x1) + (ux >= 0 ? 12 : -12)))
    const ly = Math.max(10, Math.min(view.height - 10, view.sy(y1) + (uy >= 0 ? -9 : 9)))
    drawText(ctx, it.label, lx, ly, { color: colors.ink, size: 12, align: 'center', halo: colors.surface })
  }
}

