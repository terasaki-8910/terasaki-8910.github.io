// 段階 4〜6(透視投影・視錐台とクリッピング・ビューポート変換)の計算と絵。DOM に触れない(絵は canvas の ctx に描く)。
// 計算は projection.js の perspectiveProject・perspectiveMatrix・insideClip・toNDC・viewport と mat4.js の transformPoint だけ。
// ここは「何をどこに描くか」と「つかんだ点をどう決めるか」。座標は、どの絵も 2 次元(横から見た図)。
import { transformPoint } from '../../../utils/vis/mat4.js'
import { perspectiveProject, perspectiveMatrix, insideClip, toNDC, viewport } from '../../../utils/vis/projection.js'
import { makeView, drawAxes, formatTick, axisTicks } from '../axes.js'
import { clamp, toDeg, toRad, roundTo as round } from './transformCommon.js'
import { drawGrip, drawLabel, drawSeg } from './transformHandles.js'
import { splitPanels } from './transformArm.js'

const margin = { left: 38, right: 12, top: 24, bottom: 36 }

// ---- 段階 4: 透視投影 -----------------------------------------------------------------------
// カメラ(投影中心)を原点に置き、+z を向く。横から見た図: 横軸が z(奥行き)、縦軸が y(高さ)。
// 点 P・Q は (z, y)。投影面は z = f に立つ。像の高さ y' = f·y/z は perspectiveProject が返す。

export const S4 = { X: [-1, 9], Y: [-2.6, 2.6], Z: [0.6, 8.6], YLIM: 2.2, F: [0.5, 3] }
export const STEP4_DEFAULT = { f: 1.5, P: [6, 1.1], Q: [3, 1.1] }

export const step4View = (width, height) => makeView({ width, height, xRange: S4.X, yRange: S4.Y, margin })

// 点の像: perspectiveProject([x, y, z], f) の y'。x は横から見た図に出ないので 0 とする
export function step4Image(point, f) {
  const [z, y] = point
  return perspectiveProject([0, y, z], f)[1]
}

export function step4Rows(s) {
  return [
    { name: 'P', z: s.P[0], y: s.P[1], image: step4Image(s.P, s.f) },
    { name: 'Q', z: s.Q[0], y: s.Q[1], image: step4Image(s.Q, s.f) },
  ]
}

export function step4Handles(view, s) {
  return [
    { id: 'P', x: view.sx(s.P[0]), y: view.sy(s.P[1]), r: 18 },
    { id: 'Q', x: view.sx(s.Q[0]), y: view.sy(s.Q[1]), r: 18 },
    { id: 'plane', x: view.sx(s.f), y: view.sy(S4.YLIM), r: 18 },
  ]
}

// つかんだ取っ手を画面の点 (x, y) に動かした結果(状態に混ぜる差分)
export function step4Drag(view, id, x, y) {
  if (id === 'plane') return { f: clamp(round(view.wx(x), 0.05), S4.F[0], S4.F[1]) }
  return {
    [id]: [clamp(round(view.wx(x), 0.05), S4.Z[0], S4.Z[1]), clamp(round(view.wy(y), 0.05), -S4.YLIM, S4.YLIM)],
  }
}

// 矢印キー: 取っ手 id を (dz, dy) だけ動かした差分
export function step4Nudge(s, id, dz, dy) {
  if (id === 'plane') return { f: clamp(round(s.f + dz, 0.05), S4.F[0], S4.F[1]) }
  return { [id]: [clamp(round(s[id][0] + dz, 0.05), S4.Z[0], S4.Z[1]), clamp(round(s[id][1] + dy, 0.05), -S4.YLIM, S4.YLIM)] }
}

const laneColor = (colors, i) => colors.alpha(`lane-${i}`, 1)

export function drawStep4({ ctx, width, height, colors }, s, { active = null } = {}) {
  const view = step4View(width, height)
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  drawAxes(ctx, view, { colors, xLabel: 'z [m]', yLabel: 'y [m]' })
  const { sx, sy } = view

  // カメラ(原点)と、投影面 z = f
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = colors.surface
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx(0) - 18, sy(0) - 9)
  ctx.lineTo(sx(0) - 4, sy(0) - 4)
  ctx.lineTo(sx(0) - 4, sy(0) + 4)
  ctx.lineTo(sx(0) - 18, sy(0) + 9)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  drawLabel(ctx, 'カメラ', sx(0) - 8, sy(0) + 22, colors, { align: 'center' })
  drawSeg(ctx, sx(s.f), sy(-S4.YLIM), sx(s.f), sy(S4.YLIM), { color: colors.ink, width: 2.5 })
  drawLabel(ctx, '投影面', sx(s.f) + 8, sy(-S4.YLIM) - 8, colors)
  // f の寸法線(原点から投影面まで、y = −1.9 の高さ)
  drawSeg(ctx, sx(0), sy(-1.9), sx(s.f), sy(-1.9), { color: colors.ink, width: 1.25 })
  drawLabel(ctx, `f = ${s.f.toFixed(2)} m`, (sx(0) + sx(s.f)) / 2, sy(-1.9) - 10, colors, { align: 'center' })

  const items = [
    { id: 'P', point: s.P, color: laneColor(colors, 0), shape: 'circle' },
    { id: 'Q', point: s.Q, color: laneColor(colors, 1), shape: 'square' },
  ]
  for (const it of items) {
    const [z, y] = it.point
    const image = step4Image(it.point, s.f)
    // 光線(点と原点を結ぶ直線を、投影面まで)と、点の足の棒、像
    drawSeg(ctx, sx(0), sy(0), sx(z), sy(y), { color: colors.muted, width: 1.25, dash: [5, 4] })
    drawSeg(ctx, sx(z), sy(0), sx(z), sy(y), { color: it.color, width: 3 })
    const ox = it.id === 'P' ? -5 : 5 // 2 つの像が同じ投影面の上で重ならないよう、左右に少しずらす
    drawSeg(ctx, sx(s.f) + ox, sy(0), sx(s.f) + ox, sy(image), { color: it.color, width: 4 })
    drawGrip(ctx, sx(s.f) + ox, sy(image), colors, { shape: it.shape, radius: 5, fill: it.color, label: `${it.id}'`, dx: ox < 0 ? -12 : 12, dy: 0 })
    drawGrip(ctx, sx(z), sy(y), colors, { shape: it.shape, fill: it.color, active: active === it.id, label: it.id, dx: 0, dy: y >= 0 ? -17 : 17 })
  }
  drawGrip(ctx, sx(s.f), sy(S4.YLIM), colors, { shape: 'diamond', radius: 6, active: active === 'plane' })
}

// ---- 段階 5: 視錐台とクリッピング -------------------------------------------------------------
// カメラの座標系(原点がカメラで、−z を向く)の、x = 0 の断面。横軸は奥行き d = −z、縦軸は y。点は (d, y)。
// クリップ座標は perspectiveMatrix(OpenGL の形)に [0, y, −d, 1] を掛けたもの。

export const S5 = { X: [-3, 13], Y: [-4.2, 4.2], D: [-2.8, 12.5], YLIM: 3.9, FOV: [20, 120], NEAR: [0.3, 6], FAR_MIN_GAP: 0.5, FAR_MAX: 12 }
export const STEP5_DEFAULT = { fovDeg: 50, near: 1.5, far: 7, P: [4.5, 1], Q: [-1.5, 0.8] }

export const step5View = (width, height) => makeView({ width, height, xRange: S5.X, yRange: S5.Y, margin })

// 視錐台の形: t = tan(fov/2)。near・far の面の半分の高さ
export function frustumShape(s) {
  const t = Math.tan(toRad(s.fovDeg) / 2)
  return { t, nearHalf: s.near * t, farHalf: s.far * t }
}

// 点 (d, y) のクリップ座標・NDC・内外の判定。
//   behind: カメラの後ろ(w_c < 0)  inside: 視錐台の内側(insideClip)  reasons: 外にある理由
//   naive: 先に w_c で割ってしまったときの NDC(後ろの点でも、前に出た点のように見える)
export function clipInfo(s, point) {
  const [d, y] = point
  const P = perspectiveMatrix(toRad(s.fovDeg), 1, s.near, s.far)
  const clip = transformPoint(P, [0, y, -d, 1])
  const w = clip[3]
  const ndc = toNDC(clip)
  const reasons = []
  if (w < 0) reasons.push('behind')
  else {
    if (Math.abs(clip[1]) > w) reasons.push('fov')
    if (clip[2] > w) reasons.push('far')
    if (clip[2] < -w) reasons.push('near')
  }
  return { clip, w, ndc, behind: w < 0, inside: insideClip(clip), reasons }
}

// 後ろの点を先に割ったときの像が、near の面のどこに出るか(y 座標。near の面の半分の高さに NDC の y を掛ける)
export function naiveImageY(s, info) {
  return info.ndc[1] * frustumShape(s).nearHalf
}

export function step5Handles(view, s) {
  const { t } = frustumShape(s)
  const dm = (s.near + s.far) / 2
  return [
    { id: 'P', x: view.sx(s.P[0]), y: view.sy(s.P[1]), r: 18 },
    { id: 'Q', x: view.sx(s.Q[0]), y: view.sy(s.Q[1]), r: 18 },
    { id: 'near', x: view.sx(s.near), y: view.sy(0), r: 16 },
    { id: 'far', x: view.sx(s.far), y: view.sy(0), r: 16 },
    { id: 'fov', x: view.sx(dm), y: view.sy(dm * t), r: 16 },
  ]
}

export function step5Drag(view, s, id, x, y) {
  const wx = view.wx(x)
  const wy = view.wy(y)
  if (id === 'near') return { near: clamp(round(wx, 0.1), S5.NEAR[0], Math.min(S5.NEAR[1], s.far - S5.FAR_MIN_GAP)) }
  if (id === 'far') return { far: clamp(round(wx, 0.1), s.near + S5.FAR_MIN_GAP, S5.FAR_MAX) }
  if (id === 'fov') {
    // 縁の辺の上の点 (d, y) から、視野角 fov = 2·atan(y / d)
    const fov = toDeg(2 * Math.atan2(Math.max(wy, 0.01), Math.max(wx, 0.3)))
    return { fovDeg: clamp(Math.round(fov), S5.FOV[0], S5.FOV[1]) }
  }
  return { [id]: [clamp(round(wx, 0.05), S5.D[0], S5.D[1]), clamp(round(wy, 0.05), -S5.YLIM, S5.YLIM)] }
}

export function step5Nudge(s, id, dx, dy) {
  if (id === 'near') return { near: clamp(round(s.near + dx, 0.1), S5.NEAR[0], Math.min(S5.NEAR[1], s.far - S5.FAR_MIN_GAP)) }
  if (id === 'far') return { far: clamp(round(s.far + dx, 0.1), s.near + S5.FAR_MIN_GAP, S5.FAR_MAX) }
  if (id === 'fov') return { fovDeg: clamp(Math.round(s.fovDeg + Math.sign(dy || dx) * 5), S5.FOV[0], S5.FOV[1]) }
  return { [id]: [clamp(round(s[id][0] + dx, 0.05), S5.D[0], S5.D[1]), clamp(round(s[id][1] + dy, 0.05), -S5.YLIM, S5.YLIM)] }
}

const STATUS = { behind: '後ろ', fov: '外', far: '外', near: '外' }

export function drawStep5({ ctx, width, height, colors }, s, { active = null } = {}) {
  const view = step5View(width, height)
  const { sx, sy, frame } = view
  const { t, nearHalf, farHalf } = frustumShape(s)
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  drawAxes(ctx, view, { colors, xLabel: 'd = −z [m]', yLabel: 'y [m]' })

  ctx.save()
  ctx.beginPath()
  ctx.rect(frame.left, frame.top, frame.width, frame.height)
  ctx.clip()
  // 視錐台(near と far のあいだ)
  ctx.fillStyle = colors.alpha('accent', 0.3)
  ctx.beginPath()
  ctx.moveTo(sx(s.near), sy(nearHalf))
  ctx.lineTo(sx(s.far), sy(farHalf))
  ctx.lineTo(sx(s.far), sy(-farHalf))
  ctx.lineTo(sx(s.near), sy(-nearHalf))
  ctx.closePath()
  ctx.fill()
  // 視野の縁(カメラから far まで。near の手前は破線)
  for (const sign of [1, -1]) {
    drawSeg(ctx, sx(0), sy(0), sx(s.near), sy(sign * nearHalf), { color: colors.ink, width: 1.25, dash: [4, 4] })
    drawSeg(ctx, sx(s.near), sy(sign * nearHalf), sx(s.far), sy(sign * farHalf), { color: colors.ink, width: 2 })
  }
  drawSeg(ctx, sx(s.near), sy(-nearHalf), sx(s.near), sy(nearHalf), { color: colors.ink, width: 2 })
  drawSeg(ctx, sx(s.far), sy(-farHalf), sx(s.far), sy(farHalf), { color: colors.ink, width: 2 })
  ctx.restore()
  const topY = (half) => Math.max(frame.top + 9, sy(half) - 12)
  drawLabel(ctx, `near = ${s.near.toFixed(1)}`, sx(s.near), topY(nearHalf), colors, { align: 'center', halo: true })
  drawLabel(ctx, `far = ${s.far.toFixed(1)}`, sx(s.far), topY(farHalf), colors, { align: 'center', halo: true })

  // カメラと視野角の弧
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.fillStyle = colors.surface
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sx(0) - 16, sy(0) - 8)
  ctx.lineTo(sx(0) - 3, sy(0) - 3)
  ctx.lineTo(sx(0) - 3, sy(0) + 3)
  ctx.lineTo(sx(0) - 16, sy(0) + 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(sx(0), sy(0), 34, -Math.atan(t), Math.atan(t))
  ctx.stroke()
  ctx.restore()
  drawLabel(ctx, `θ = ${Math.round(s.fovDeg)}°`, sx(0) - 4, sy(0) + 24, colors, { align: 'center', halo: true })

  // 点
  const items = [
    { id: 'P', point: s.P, color: colors.alpha('lane-0', 1), shape: 'circle' },
    { id: 'Q', point: s.Q, color: colors.alpha('lane-1', 1), shape: 'square' },
  ]
  for (const it of items) {
    const info = clipInfo(s, it.point)
    const [d, y] = it.point
    if (info.behind) {
      // 先に w_c で割ると、点を原点に向けて結んだ線の反対側(near の面の上)に像が出る(前に出てしまう)
      const iy = naiveImageY(s, info)
      drawSeg(ctx, sx(d), sy(y), sx(s.near), sy(iy), { color: colors.muted, width: 1.25, dash: [3, 4] })
      ctx.save()
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2
      const gx = sx(s.near)
      const gy = sy(iy)
      ctx.beginPath()
      ctx.moveTo(gx - 6, gy - 6)
      ctx.lineTo(gx + 6, gy + 6)
      ctx.moveTo(gx + 6, gy - 6)
      ctx.lineTo(gx - 6, gy + 6)
      ctx.stroke()
      ctx.restore()
      drawLabel(ctx, `${it.id} を先に割った像`, gx + 10, gy + (iy >= 0 ? -12 : 12), colors, { halo: true })
    }
    const status = info.inside ? '内' : STATUS[info.reasons[0]] ?? '外'
    drawGrip(ctx, sx(d), sy(y), colors, {
      shape: it.shape,
      fill: info.inside ? it.color : colors.surface,
      active: active === it.id,
      label: `${it.id}：${status}`,
      dx: d < 0 ? -14 : 14,
      dy: 0,
      labelAlign: d < 0 ? 'right' : 'left',
    })
  }
  // 視錐台の取っ手
  const dm = (s.near + s.far) / 2
  drawGrip(ctx, sx(s.near), sy(0), colors, { shape: 'diamond', radius: 6, active: active === 'near' })
  drawGrip(ctx, sx(s.far), sy(0), colors, { shape: 'diamond', radius: 6, active: active === 'far' })
  drawGrip(ctx, sx(dm), sy(dm * t), colors, { shape: 'diamond', radius: 6, active: active === 'fov' })
}

// ---- 段階 6: ビューポート変換 -----------------------------------------------------------------
// 左に正規化デバイス座標(−1〜1 の正方形)、右にウィンドウ(W × H 画素)。同じ点が、同じ割合の位置に写る。
// 画素の座標は viewport の向き(左下が原点、y は上向き)。

export const S6 = { W: [120, 640], H: [90, 480], STEP: 10 }
export const STEP6_DEFAULT = { ndc: [0.3, 0.2], W: 400, H: 300 }

// 左の枠: NDC の正方形(−1〜1)が余白 PAD の内側に入る
const PAD = 30
export function ndcPanelView(rect) {
  const side = Math.max(10, Math.min(rect.width - 2 * PAD - 14, rect.height - 2 * PAD))
  const left = rect.left + PAD + 14 + (rect.width - 2 * PAD - 14 - side) / 2
  const top = rect.top + PAD + (rect.height - 2 * PAD - side) / 2
  const k = side / 2
  return {
    side,
    left,
    top,
    cx: left + k,
    cy: top + k,
    sx: (nx) => left + (nx + 1) * k,
    sy: (ny) => top + (1 - ny) * k,
    wx: (px) => (px - left) / k - 1,
    wy: (py) => 1 - (py - top) / k,
  }
}

// 右の枠: ウィンドウ(W × H 画素)を、固定の最大(640 × 480)に合わせた倍率で縮めて、枠の左下に置く
export function windowPanelView(rect, W, H) {
  const k = Math.max(0.05, Math.min((rect.width - 2 * PAD - 14) / S6.W[1], (rect.height - 2 * PAD) / S6.H[1]))
  const left = rect.left + PAD + 14
  const bottom = rect.top + rect.height - PAD
  return {
    k,
    left,
    bottom,
    top: bottom - H * k,
    right: left + W * k,
    sx: (xs) => left + xs * k, // 画素 → 画面
    sy: (ys) => bottom - ys * k,
    px: (x) => (x - left) / k, // 画面 → 画素
    py: (y) => (bottom - y) / k,
  }
}

// viewport の逆: 画素 (xs, ys) → NDC。0 〜 W・0 〜 H の外は端に切る
export function viewportInverse(pixel, W, H) {
  return [clamp((2 * pixel[0]) / W - 1, -1, 1), clamp((2 * pixel[1]) / H - 1, -1, 1)]
}

export function step6Pixel(s) {
  const p = viewport(s.ndc, 0, 0, s.W, s.H)
  return { x: p[0], y: p[1], fx: (s.ndc[0] + 1) / 2, fy: (s.ndc[1] + 1) / 2 }
}

export function step6Panels(width, height, stacked) {
  const p = splitPanels(width, height, stacked)
  return { ndc: p.outside, win: p.camera }
}

export function step6Handles(width, height, stacked, s) {
  const { ndc, win } = step6Panels(width, height, stacked)
  const nv = ndcPanelView(ndc.rect)
  const wv = windowPanelView(win.rect, s.W, s.H)
  const px = step6Pixel(s)
  return [
    { id: 'size', x: wv.right, y: wv.top, r: 18 },
    { id: 'ndc', x: nv.sx(s.ndc[0]), y: nv.sy(s.ndc[1]), r: 18 },
    { id: 'pix', x: wv.sx(px.x), y: wv.sy(px.y), r: 18 },
  ]
}

// つかんだ取っ手を (x, y) に動かした差分
export function step6Drag(width, height, stacked, s, id, x, y) {
  const { ndc, win } = step6Panels(width, height, stacked)
  if (id === 'ndc') {
    const nv = ndcPanelView(ndc.rect)
    return { ndc: [clamp(round(nv.wx(x), 0.01), -1, 1), clamp(round(nv.wy(y), 0.01), -1, 1)] }
  }
  const wv = windowPanelView(win.rect, s.W, s.H)
  if (id === 'pix') {
    const n = viewportInverse([wv.px(x), wv.py(y)], s.W, s.H)
    return { ndc: [round(n[0], 0.01), round(n[1], 0.01)] }
  }
  // 'size': ウィンドウの右上の角をつかんで、大きさを変える(画素は 10 刻み)
  return {
    W: clamp(round(wv.px(x), S6.STEP), S6.W[0], S6.W[1]),
    H: clamp(round(wv.py(y), S6.STEP), S6.H[0], S6.H[1]),
  }
}

export function step6Nudge(s, id, dx, dy) {
  if (id === 'size') return { W: clamp(s.W + dx * S6.STEP, S6.W[0], S6.W[1]), H: clamp(s.H + dy * S6.STEP, S6.H[0], S6.H[1]) }
  return { ndc: [clamp(round(s.ndc[0] + dx * 0.05, 0.01), -1, 1), clamp(round(s.ndc[1] + dy * 0.05, 0.01), -1, 1)] }
}

export function drawStep6({ ctx, width, height, colors }, s, { stacked = false, active = null } = {}) {
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  const { ndc, win } = step6Panels(width, height, stacked)
  const nv = ndcPanelView(ndc.rect)
  const wv = windowPanelView(win.rect, s.W, s.H)
  const px = step6Pixel(s)
  const point = laneColor(colors, 0)

  // 題と仕切り
  drawLabel(ctx, '正規化デバイス座標（−1〜1）', ndc.title.left + 10, ndc.title.top + ndc.title.height / 2, colors)
  drawLabel(ctx, `ウィンドウ（${s.W} × ${s.H} 画素）`, win.title.left + 10, win.title.top + win.title.height / 2, colors)
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  if (stacked) {
    ctx.moveTo(0, win.title.top + 0.5)
    ctx.lineTo(width, win.title.top + 0.5)
  } else {
    ctx.moveTo(win.title.left + 0.5, 0)
    ctx.lineTo(win.title.left + 0.5, height)
  }
  ctx.stroke()
  ctx.restore()

  // 左: NDC の正方形と、軸の目盛り(−1, 0, 1)
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  ctx.strokeRect(nv.left, nv.top, nv.side, nv.side)
  ctx.restore()
  drawSeg(ctx, nv.left, nv.cy, nv.left + nv.side, nv.cy, { color: colors.muted, width: 1, dash: [3, 4] })
  drawSeg(ctx, nv.cx, nv.top, nv.cx, nv.top + nv.side, { color: colors.muted, width: 1, dash: [3, 4] })
  for (const v of [-1, 0, 1]) {
    drawLabel(ctx, formatTick(v, 1), nv.sx(v), nv.top + nv.side + 11, colors, { align: 'center', size: 11 })
    drawLabel(ctx, formatTick(v, 1), nv.left - 6, nv.sy(v), colors, { align: 'right', size: 11 })
  }
  drawLabel(ctx, 'x_n', nv.left + nv.side, nv.top + nv.side + 24, colors, { align: 'right' })
  drawLabel(ctx, 'y_n', nv.left + 4, nv.top - 12, colors)

  // 右: ウィンドウの長方形と、画素の目盛り(0 と W、0 と H)
  ctx.save()
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  ctx.fillStyle = colors.alpha('accent', 0.18)
  ctx.beginPath()
  ctx.rect(wv.left, wv.top, wv.right - wv.left, wv.bottom - wv.top)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  const { values: xt } = axisTicks(0, s.W, 3)
  const { values: yt } = axisTicks(0, s.H, 3)
  for (const v of xt) {
    drawSeg(ctx, wv.sx(v), wv.bottom, wv.sx(v), wv.bottom + 4, { color: colors.muted, width: 1 })
    drawLabel(ctx, String(v), wv.sx(v), wv.bottom + 11, colors, { align: 'center', size: 11 })
  }
  for (const v of yt) {
    drawSeg(ctx, wv.left - 4, wv.sy(v), wv.left, wv.sy(v), { color: colors.muted, width: 1 })
    drawLabel(ctx, String(v), wv.left - 6, wv.sy(v), colors, { align: 'right', size: 11 })
  }
  drawLabel(ctx, 'x_s [px]', wv.right, wv.bottom + 24, colors, { align: 'right' })
  drawLabel(ctx, 'y_s [px]', wv.left + 4, wv.top - 12, colors, { halo: true })

  // 同じ点: 左では NDC の (x_n, y_n)、右では画素の (x_s, y_s)。割合の線(破線)
  const gx = wv.sx(px.x)
  const gy = wv.sy(px.y)
  drawSeg(ctx, wv.left, gy, gx, gy, { color: colors.ink, width: 1.25, dash: [4, 3] })
  drawSeg(ctx, gx, wv.bottom, gx, gy, { color: colors.ink, width: 1.25, dash: [4, 3] })
  drawGrip(ctx, nv.sx(s.ndc[0]), nv.sy(s.ndc[1]), colors, { shape: 'circle', fill: point, active: active === 'ndc', label: 'P', dy: -17 })
  drawGrip(ctx, gx, gy, colors, { shape: 'circle', fill: point, active: active === 'pix', label: "P'", dy: -17 })
  // ウィンドウの大きさを変える角
  drawGrip(ctx, wv.right, wv.top, colors, { shape: 'diamond', radius: 6, active: active === 'size', label: '大きさ', dx: 0, dy: -16 })
}

