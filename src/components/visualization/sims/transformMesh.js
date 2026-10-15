// 3 次元の物(箱・線・矢印・格子・軸)を、行列 MVP と描く枠 rect で canvas に描く補助。
// 点の写し方は mat4.js の transformPoint と projection.js の toNDC・viewport だけ。ここに式は書かず、
// 描く順(奥から)・背面の扱い・当たり判定だけを書く。純関数(projectPoint など)は Node から読める。
//
// rect は canvas の中の描く枠 { left, top, width, height }(CSS px)。MVP はその枠の縦横比で作った行列。
// 画面の y は下向き(canvas)。viewport の y は上向きなので、ここで上下を反転する。
import { transformPoint } from '../../../utils/vis/mat4.js'
import { toNDC, insideClip, viewport } from '../../../utils/vis/projection.js'
import { isBackFace } from '../../../utils/vis/raster.js'
import { uiFont } from './transformCommon.js'

// 辺 ±1 の箱。頂点 i の座標は、ビット 0, 1, 2 が x, y, z の符号(1 なら +1)
export const BOX_VERTS = Array.from({ length: 8 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1])
// 面は外から見て反時計回りの頂点の並び(+x, −x, +y, −y, +z, −z)
export const BOX_FACES = [
  [1, 3, 7, 5],
  [0, 4, 6, 2],
  [2, 6, 7, 3],
  [0, 1, 5, 4],
  [4, 5, 7, 6],
  [0, 2, 3, 1],
]
export const BOX_EDGES = (() => {
  const seen = new Set()
  const edges = []
  for (const face of BOX_FACES) {
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([Math.min(a, b), Math.max(a, b)])
      }
    })
  }
  return edges
})()

// 世界の点 p を枠の中の画面の点にする。カメラの後ろ(w <= 0)は null
//   x, y: canvas の座標(y は下向き)  vx, vy: viewport の座標(y は上向き)  ndc: 正規化デバイス座標
//   w: クリップ座標の w(カメラからの奥行き)  inside: 視錐台の内側か
export function projectPoint(MVP, p, rect) {
  const clip = transformPoint(MVP, [p[0], p[1], p[2], 1])
  if (!(clip[3] > 0)) return null
  const ndc = toNDC(clip)
  const [vx, vy] = viewport([ndc[0], ndc[1]], 0, 0, rect.width, rect.height)
  return {
    x: rect.left + vx,
    y: rect.top + rect.height - vy,
    vx,
    vy,
    ndc,
    w: clip[3],
    inside: insideClip(clip),
  }
}

// canvas の点 (px, py) を、枠の NDC (−1〜1)にする。projectPoint の x, y の逆
export function ndcFromPixel(rect, px, py) {
  return [(2 * (px - rect.left)) / rect.width - 1, 1 - (2 * (py - rect.top)) / rect.height]
}

export function inRect(rect, x, y) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
}

// 箱 M(±1 の箱を M で移したもの)の 8 頂点を画面に出す
export function boxPoints(MVP, M, rect) {
  return BOX_VERTS.map((v) => projectPoint(MVP, transformPoint(M, [v[0], v[1], v[2], 1]), rect))
}

// 面ごとの画面の多角形。4 頂点が全部カメラの前にある面だけ。front は画面で反時計回り(= 表)
export function boxFaces(MVP, M, rect) {
  const pts = boxPoints(MVP, M, rect)
  const out = []
  BOX_FACES.forEach((idx, f) => {
    const poly = idx.map((i) => pts[i])
    if (poly.some((p) => !p)) return
    const [a, b, c] = poly
    out.push({
      face: f,
      poly,
      front: !isBackFace([a.vx, a.vy], [b.vx, b.vy], [c.vx, c.vy]),
      depth: poly.reduce((sum, p) => sum + p.ndc[2], 0) / poly.length,
    })
  })
  return out
}

function pointInPolygon(poly, x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// 点 (x, y) が、箱の表の面のどれかの中にあるか(つかめるかの判定)
export function boxHit(MVP, M, rect, x, y) {
  return boxFaces(MVP, M, rect).some((f) => f.front && pointInPolygon(f.poly, x, y))
}

// 箱をまとめて描く。奥の面から先に塗る。
//   boxes: [{ M, fill?, stroke, lineWidth?, ghost?, dash? }]
//   ghost: 面は塗らず、12 本の辺を破線だけで描く(動かす前の位置など)
//   表の面は fill で塗って stroke の線、裏の面は stroke を薄くした細い線だけ(箱の向きが分かるように)
export function drawBoxes(ctx, MVP, rect, boxes, colors) {
  const faces = []
  for (const box of boxes) {
    if (box.ghost) {
      const pts = boxPoints(MVP, box.M, rect)
      ctx.save()
      ctx.strokeStyle = box.stroke
      ctx.lineWidth = box.lineWidth ?? 1.25
      ctx.setLineDash(box.dash ?? [4, 4])
      ctx.beginPath()
      for (const [a, b] of BOX_EDGES) {
        if (!pts[a] || !pts[b]) continue
        ctx.moveTo(pts[a].x, pts[a].y)
        ctx.lineTo(pts[b].x, pts[b].y)
      }
      ctx.stroke()
      ctx.restore()
      continue
    }
    for (const f of boxFaces(MVP, box.M, rect)) faces.push({ ...f, box })
  }
  faces.sort((p, q) => q.depth - p.depth)
  ctx.save()
  ctx.lineJoin = 'round'
  for (const f of faces) {
    ctx.beginPath()
    f.poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    if (f.front) {
      if (f.box.fill) {
        ctx.fillStyle = f.box.fill
        ctx.fill()
      }
      ctx.strokeStyle = f.box.stroke
      ctx.lineWidth = f.box.lineWidth ?? 1.75
    } else {
      ctx.strokeStyle = f.box.backStroke ?? colors.alpha('ink', 0.5) // 地に 3:1 以上(0.3 だと足りない)
      ctx.lineWidth = 1
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ---- 線・点・文字 ----------------------------------------------------------------------

// 世界の 2 点を結ぶ線。どちらかがカメラの後ろなら描かず false
export function drawLine3d(ctx, MVP, rect, a, b, { color, width = 1, dash = [] } = {}) {
  const pa = projectPoint(MVP, a, rect)
  const pb = projectPoint(MVP, b, rect)
  if (!pa || !pb) return false
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
  ctx.restore()
  return true
}

export function drawPolyline3d(ctx, MVP, rect, points, { color, width = 1, dash = [], close = false } = {}) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let pen = false
  for (const p of points) {
    const s = projectPoint(MVP, p, rect)
    if (!s) {
      pen = false
      continue
    }
    if (pen) ctx.lineTo(s.x, s.y)
    else ctx.moveTo(s.x, s.y)
    pen = true
  }
  if (close) ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

// 画面の 2 点の矢印(先を三角形で)
export function drawArrow2d(ctx, x0, y0, x1, y1, { color, width = 2, head = 9 } = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  if (len < 1) return
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const h = Math.min(head, len * 0.6)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5)
  ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function drawArrow3d(ctx, MVP, rect, a, b, style) {
  const pa = projectPoint(MVP, a, rect)
  const pb = projectPoint(MVP, b, rect)
  if (!pa || !pb) return false
  drawArrow2d(ctx, pa.x, pa.y, pb.x, pb.y, style)
  return true
}

export function drawDot3d(ctx, MVP, rect, p, { fill, stroke, radius = 4, lineWidth = 1.5 } = {}) {
  const s = projectPoint(MVP, p, rect)
  if (!s) return null
  ctx.save()
  ctx.beginPath()
  ctx.arc(s.x, s.y, radius, 0, Math.PI * 2)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.setLineDash([])
    ctx.stroke()
  }
  ctx.restore()
  return s
}

// 世界の点 p の近くに文字を書く。(dx, dy) は画面でずらす px
export function drawText3d(ctx, MVP, rect, p, text, { color, dx = 0, dy = 0, size = 12, align = 'center', baseline = 'middle' } = {}) {
  const s = projectPoint(MVP, p, rect)
  if (!s) return null
  ctx.save()
  ctx.font = uiFont(size)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, s.x + dx, s.y + dy)
  ctx.restore()
  return s
}

// 床の格子。y = y0 の面に、x・z とも −half〜half を step 間隔で
export function drawGround(ctx, MVP, rect, { y = 0, half = 3, step = 1, color, width = 1 } = {}) {
  for (let k = -half; k <= half + 1e-9; k += step) {
    drawLine3d(ctx, MVP, rect, [k, y, -half], [k, y, half], { color, width })
    drawLine3d(ctx, MVP, rect, [-half, y, k], [half, y, k], { color, width })
  }
}

// 世界の軸。原点から長さ len(m)まで、1 m ごとに点を打ち、先に「x [m]」のように名前と単位を書く。
// axes: 描く軸の名前('x'・'y'・'z' のうち)。省略すると 3 本
export function drawAxes3d(ctx, MVP, rect, colors, { len = 2, unit = 'm', axes = ['x', 'y', 'z'] } = {}) {
  const dirs = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  }
  for (const name of axes) {
    const d = dirs[name]
    drawArrow3d(ctx, MVP, rect, [0, 0, 0], [d[0] * len, d[1] * len, d[2] * len], { color: colors.ink, width: 1.5, head: 8 })
    for (let k = 1; k < len; k++) {
      drawDot3d(ctx, MVP, rect, [d[0] * k, d[1] * k, d[2] * k], { fill: colors.ink, radius: 2 })
    }
    const tip = [d[0] * (len + 0.35), d[1] * (len + 0.35), d[2] * (len + 0.35)]
    drawText3d(ctx, MVP, rect, tip, `${name} [${unit}]`, { color: colors.ink, size: 12 })
  }
}

// 枠の外にはみ出さないよう、枠で切って描く(枠の外は描かない)
export function withClip(ctx, rect, draw) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.left, rect.top, rect.width, rect.height)
  ctx.clip()
  draw()
  ctx.restore()
}
