// 段階 1〜3(平行移動・回転と拡大・合成の順)の箱の計算と絵。DOM に触れない(絵は canvas の ctx に描く)。
// 行列は mat4.js の translate・rotate*・scale・compose、点の写しは transformMesh.js(projection の関数)。ここに式は書かない。
// 世界は右手系で x が右、y が上、z が手前。箱は辺 ±1 の立方体を行列 M で移したもの。
import { identity, multiply, translate, rotateX, rotateY, rotateZ, scale, compose, transformPoint } from '../../../utils/vis/mat4.js'
import { clamp, toRad, toDeg, wrapDeg, roundTo as round, uiFont } from './transformCommon.js'
import { lookAtPose, cameraMatrices, pixelRay, rayPlaneZ } from './transformCamera.js'
import { splitPanels } from './transformArm.js'
import {
  ndcFromPixel,
  projectPoint,
  drawBoxes,
  drawAxes3d,
  drawArrow3d,
  drawDot3d,
  drawText3d,
  drawLine3d,
  drawPolyline3d,
  withClip,
} from './transformMesh.js'

const fullRect = (width, height) => ({ left: 0, top: 0, width, height })

// 枠 rect を、camera({ position, target, fov })で撮る設定
export function boxView(rect, camera) {
  const pose = lookAtPose(camera.position, camera.target)
  const spec = { fov: camera.fov, aspect: rect.width / rect.height }
  return { rect, pose, spec, ...cameraMatrices(pose, { ...spec, near: 0.5, far: 60 }) }
}

// 画面の点 (x, y)(canvas の座標)を通る光線が、平面 z = z0 と交わる世界の点。なければ null
export function pointerOnPlane(view, x, y, z0) {
  const [nx, ny] = ndcFromPixel(view.rect, x, y)
  return rayPlaneZ(pixelRay(view.pose, view.spec, nx, ny), z0)
}

// 段階 1・2 のカメラ(斜め上から)。段階 3 のカメラは正面から、小さく
export const STEP12_CAMERA = { position: [4.8, 3.4, 10.2], target: [0, 0, 0], fov: toRad(40) }
export const STEP3_CAMERA = { position: [0, 0, 14], target: [0, 0, 0], fov: toRad(40) }

export const P_MODEL = [1, 1, 1, 1] // 箱の角(位置。w = 1)
export const D_MODEL = [1, 0, 0, 0] // 箱の辺の向き(向き。w = 0)

const accentFill = (colors, grabbed) => colors.alpha('accent', grabbed ? 0.95 : 0.55)

// ---- 段階 1: 同次座標と平行移動 -------------------------------------------------------

export const STEP1_DEFAULT = { tx: 1.2, ty: 0.6, tz: 0 }
export const STEP1_LIMIT = 3 // 平行移動の範囲 ±3 m

export function step1Model(s) {
  const T = translate(s.tx, s.ty, s.tz)
  return {
    T,
    p: P_MODEL,
    pAfter: transformPoint(T, P_MODEL),
    d: D_MODEL,
    dAfter: transformPoint(T, D_MODEL),
  }
}

// つかんで動かす: 箱の中心が、光線と平面 z = tz の交点(つかんだ位置とのずれを足す)に来るように
export function step1Drag(view, s, offset, x, y) {
  const q = pointerOnPlane(view, x, y, s.tz)
  if (!q) return null
  return {
    tx: clamp(round(q[0] + offset[0], 0.05), -STEP1_LIMIT, STEP1_LIMIT),
    ty: clamp(round(q[1] + offset[1], 0.05), -STEP1_LIMIT, STEP1_LIMIT),
  }
}
export function step1Grab(view, s, x, y) {
  const q = pointerOnPlane(view, x, y, s.tz)
  return q ? [s.tx - q[0], s.ty - q[1]] : null
}

const dot3 = (v) => v.slice(0, 3)
const addScaled = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]

export function drawStep1({ ctx, width, height, colors }, s, { grabbed = false } = {}) {
  const rect = fullRect(width, height)
  const view = boxView(rect, STEP12_CAMERA)
  const { VP } = view
  const m = step1Model(s)
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  withClip(ctx, rect, () => {
    drawAxes3d(ctx, VP, rect, colors, { len: 3 })
    drawBoxes(
      ctx,
      VP,
      rect,
      [
        { M: identity(), stroke: colors.muted, ghost: true },
        { M: m.T, fill: accentFill(colors, grabbed), stroke: colors.ink, lineWidth: grabbed ? 2.5 : 1.75 },
      ],
      colors,
    )
    // 平行移動の量 t(原点から箱の中心へ)
    const center = [s.tx, s.ty, s.tz]
    drawArrow3d(ctx, VP, rect, [0, 0, 0], center, { color: colors.ink, width: 2 })
    drawText3d(ctx, VP, rect, center.map((v) => v / 2), 't', { color: colors.ink, dx: 6, dy: 15, size: 13 })
    // 位置 p(w = 1)は動き、向き d(w = 0)は動かない
    const p = dot3(m.p)
    const pa = dot3(m.pAfter)
    drawArrow3d(ctx, VP, rect, p, addScaled(p, dot3(m.d), 1.6), { color: colors.muted, width: 1.5 })
    drawArrow3d(ctx, VP, rect, pa, addScaled(pa, dot3(m.dAfter), 1.6), { color: colors.ink, width: 2.5 })
    drawDot3d(ctx, VP, rect, p, { fill: colors.surface, stroke: colors.muted, radius: 4 })
    drawDot3d(ctx, VP, rect, pa, { fill: colors.accent, stroke: colors.ink, radius: 5.5, lineWidth: 2 })
    drawText3d(ctx, VP, rect, p, 'p', { color: colors.ink, dx: -11, dy: -9, size: 12 })
    drawText3d(ctx, VP, rect, pa, "p'", { color: colors.ink, dx: 10, dy: 10, size: 12 })
    drawText3d(ctx, VP, rect, addScaled(p, dot3(m.d), 1.6), 'd', { color: colors.ink, dx: 0, dy: -11, size: 12 })
    drawText3d(ctx, VP, rect, addScaled(pa, dot3(m.dAfter), 1.6), "d'", { color: colors.ink, dx: 0, dy: -11, size: 12 })
    // 箱の中心のつかみ印
    drawDot3d(ctx, VP, rect, center, { fill: colors.ink, radius: 2.5 })
  })
}

// ---- 段階 2: 回転と拡大 -----------------------------------------------------------------

export const STEP2_DEFAULT = { rx: 20, ry: -25, rz: 30, sx: 1, sy: 1, sz: 1 } // 回転は度
export const RING_R = 3 // 回す輪の半径 [m]
export const SCALE_DIR = [Math.SQRT1_2, -Math.SQRT1_2] // 広げる取っ手のある向き(右下)
export const SCALE_HANDLE_K = 1.6 // 取っ手の距離 = 1.6 × 拡大率 [m]
export const SCALE_RANGE = [0.3, 2]

export function step2Model(s) {
  const R = compose(rotateZ(toRad(s.rz)), rotateY(toRad(s.ry)), rotateX(toRad(s.rx)))
  const S = scale(s.sx, s.sy, s.sz)
  const M = compose(R, S)
  return { R, S, M, p: P_MODEL, pAfter: transformPoint(M, P_MODEL) }
}

export const meanScale = (s) => (s.sx + s.sy + s.sz) / 3

// 箱をつかんで動かしたとき: 左右の動き dx が y 軸まわり、上下の動き dy(画面は下向きが正)が x 軸まわりの回転になる
export const TILT_PER_PX = 0.6 // 1 px あたりの回転 [°]
export function tiltFromDrag(s, dx, dy) {
  return {
    ry: Math.round(wrapDeg(s.ry + dx * TILT_PER_PX)),
    rx: Math.round(wrapDeg(s.rx + dy * TILT_PER_PX)),
  }
}

// 取っ手の世界の位置
export function rotateHandlePos(rzDeg) {
  const a = toRad(rzDeg)
  return [RING_R * Math.cos(a), RING_R * Math.sin(a), 0]
}
export function scaleHandlePos(sMean) {
  return [SCALE_DIR[0] * SCALE_HANDLE_K * sMean, SCALE_DIR[1] * SCALE_HANDLE_K * sMean, 0]
}

// 平面 z = 0 の点 q から、回転角(度。−180〜180、整数)と拡大率
export function angleFromPlanePoint(q) {
  return Math.round(toDeg(Math.atan2(q[1], q[0])))
}
export function scaleFromPlanePoint(q) {
  const along = q[0] * SCALE_DIR[0] + q[1] * SCALE_DIR[1]
  return clamp(round(along / SCALE_HANDLE_K, 0.05), SCALE_RANGE[0], SCALE_RANGE[1])
}

// 取っ手を画面の点から探す: 'rotate' | 'scale' | null。近い方。radius は px
export function step2Pick(view, s, x, y, radius = 16) {
  const hits = []
  for (const [name, pos] of [
    ['rotate', rotateHandlePos(s.rz)],
    ['scale', scaleHandlePos(meanScale(s))],
  ]) {
    const p = projectPoint(view.VP, pos, view.rect)
    if (p) hits.push({ name, d: Math.hypot(p.x - x, p.y - y) })
  }
  const near = hits.filter((h) => h.d <= radius).sort((a, b) => a.d - b.d)[0]
  return near ? near.name : null
}

export function drawStep2({ ctx, width, height, colors }, s, { active = null } = {}) {
  const grabbed = active === 'body'
  const rect = fullRect(width, height)
  const view = boxView(rect, STEP12_CAMERA)
  const { VP } = view
  const m = step2Model(s)
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  withClip(ctx, rect, () => {
    drawAxes3d(ctx, VP, rect, colors, { len: 3 })
    // 回す輪(平面 z = 0)
    const ring = Array.from({ length: 73 }, (_, i) => rotateHandlePos((360 * i) / 72))
    drawPolyline3d(ctx, VP, rect, ring, { color: colors.muted, width: 1.25, dash: [4, 4] })
    drawBoxes(
      ctx,
      VP,
      rect,
      [
        { M: identity(), stroke: colors.muted, ghost: true },
        { M: m.M, fill: accentFill(colors, grabbed), stroke: colors.ink, lineWidth: grabbed ? 2.5 : 1.75 },
      ],
      colors,
    )
    const p = dot3(m.p)
    const pa = dot3(m.pAfter)
    drawDot3d(ctx, VP, rect, p, { fill: colors.surface, stroke: colors.muted, radius: 4 })
    drawDot3d(ctx, VP, rect, pa, { fill: colors.accent, stroke: colors.ink, radius: 5.5, lineWidth: 2 })
    drawText3d(ctx, VP, rect, p, 'p', { color: colors.ink, dx: -9, dy: 9, size: 12 })
    drawText3d(ctx, VP, rect, pa, "p'", { color: colors.ink, dx: 10, dy: 10, size: 12 })
    // 取っ手 2 つ
    const rh = rotateHandlePos(s.rz)
    const sh = scaleHandlePos(meanScale(s))
    drawLine3d(ctx, VP, rect, [0, 0, 0], sh, { color: colors.muted, width: 1.25, dash: [3, 3] })
    const handle = (pos, name, label, dx, dy) => {
      const on = active === name
      const sp = drawDot3d(ctx, VP, rect, pos, { fill: on ? colors.ink : colors.accent, stroke: colors.ink, radius: on ? 10 : 8.5, lineWidth: 2 })
      if (sp) drawText3d(ctx, VP, rect, pos, label, { color: colors.ink, dx, dy, size: 12 })
    }
    handle(rh, 'rotate', '回す', 0, -17)
    handle(sh, 'scale', '広げる', 0, 17)
  })
}

// ---- 段階 3: 合成の順 -------------------------------------------------------------------

export const STEP3_DEFAULT = { tx: 1.2, ty: 0.6, rz: 35, s: 1.2 }
export const STEP3_LIMIT = 2 // 平行移動の範囲 ±2 m
export const STEP3_SCALE = [0.5, 1.5]

// order: 'trs' は M = T·R·S、'srt' は M = S·R·T。効く順(右から)の行列の名前と、そのたびの箱の中心、最後の 1 つ手前の行列
export function step3Model(s, order) {
  const T = translate(s.tx, s.ty, 0)
  const R = rotateZ(toRad(s.rz))
  const S = scale(s.s, s.s, s.s)
  const mats = order === 'trs' ? [T, R, S] : [S, R, T]
  const names = order === 'trs' ? ['T', 'R', 'S'] : ['S', 'R', 'T']
  const M = compose(...mats)
  const applied = [...mats].reverse()
  const appliedNames = [...names].reverse()
  const centers = [[0, 0, 0]]
  let acc = identity()
  for (const A of applied) {
    acc = multiply(A, acc)
    centers.push(transformPoint(acc, [0, 0, 0, 1]).slice(0, 3))
  }
  return {
    T,
    R,
    S,
    M,
    names, // 掛ける順(左から)
    appliedNames, // 効く順
    centers, // [元の中心, 1 つ目を効かせたあと, 2 つ目, 3 つ目(= M の中心)]
    ghostM: compose(mats[1], mats[2]), // 最後の 1 つ(左端)を効かせる前
    center: centers[3],
  }
}

// 箱の中心が q(平面 z = 0)に来るような平行移動。T·R·S は中心 = t、S·R·T は中心 = s·R·t なので、後者は逆に戻す
export function translationFromCenter(order, q, s) {
  if (order === 'trs') return [q[0], q[1]]
  const back = compose(rotateZ(toRad(-s.rz)), scale(1 / s.s, 1 / s.s, 1 / s.s))
  const t = transformPoint(back, [q[0], q[1], 0, 1])
  return [t[0], t[1]]
}

export function rotateHandle3(model, s) {
  const a = toRad(s.rz)
  const d = 1.5 * s.s + 1
  return [model.center[0] + d * Math.cos(a), model.center[1] + d * Math.sin(a), 0]
}

export function angleAround(center, q) {
  return Math.round(toDeg(Math.atan2(q[1] - center[1], q[0] - center[0])))
}

export const STEP3_ORDERS = ['trs', 'srt']
// 2 つの枠(1 つ目が T·R·S、2 つ目が S·R·T)。splitPanels の「外から見た図」「カメラから見た絵」を 1 つ目・2 つ目として使う
export function step3Panels(width, height, stacked) {
  const p = splitPanels(width, height, stacked)
  return [p.outside, p.camera]
}

export function step3Views(width, height, stacked) {
  return step3Panels(width, height, stacked).map((panel) => ({ panel, view: boxView(panel.rect, STEP3_CAMERA) }))
}

// 枠 index の箱を、画面の点から探す: 'box' | 'rotate' | null
export function step3Pick(view, model, s, x, y, radius = 16) {
  const h = projectPoint(view.VP, rotateHandle3(model, s), view.rect)
  if (h && Math.hypot(h.x - x, h.y - y) <= radius) return 'rotate'
  return null
}

export function drawStep3({ ctx, width, height, colors }, s, { stacked = false, active = null } = {}) {
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  const titles = ['T·R·S（拡大 → 回転 → 移動）', 'S·R·T（移動 → 回転 → 拡大）']
  step3Views(width, height, stacked).forEach(({ panel, view }, i) => {
    const order = STEP3_ORDERS[i]
    const model = step3Model(s, order)
    const { rect, VP } = view
    withClip(ctx, rect, () => {
      drawAxes3d(ctx, VP, rect, colors, { len: 4, unit: 'm', axes: ['x', 'y'] })
      drawBoxes(
        ctx,
        VP,
        rect,
        [
          { M: model.ghostM, stroke: colors.muted, ghost: true },
          { M: model.M, fill: accentFill(colors, active === i), stroke: colors.ink },
        ],
        colors,
      )
      // 箱の中心が、効く行列のたびにどこへ動くか(元の位置 → T・R・S の順に)
      drawPolyline3d(ctx, VP, rect, model.centers, { color: colors.ink, width: 1.5, dash: [4, 3] })
      // 中心を動かさない行列は、同じ位置の点にまとめて名前を並べる(T·R·S の S と R は原点のまま)
      const nodes = []
      model.centers.slice(1).forEach((c, k) => {
        const prev = model.centers[k]
        const moved = Math.hypot(c[0] - prev[0], c[1] - prev[1]) > 1e-6
        if (moved || nodes.length === 0) nodes.push({ c, names: [model.appliedNames[k]] })
        else nodes[nodes.length - 1].names.push(model.appliedNames[k])
      })
      drawDot3d(ctx, VP, rect, model.centers[0], { fill: colors.surface, stroke: colors.ink, radius: 4 })
      nodes.forEach((n) => {
        drawDot3d(ctx, VP, rect, n.c, { fill: colors.ink, radius: 3 })
        drawText3d(ctx, VP, rect, n.c, n.names.join('→'), { color: colors.ink, dx: 14, dy: 14, size: 12, align: 'left' })
      })
      // 回す取っ手(箱の中心から)
      const rh = rotateHandle3(model, s)
      drawLine3d(ctx, VP, rect, model.center, rh, { color: colors.muted, width: 1.25, dash: [3, 3] })
      drawDot3d(ctx, VP, rect, rh, { fill: active === i ? colors.ink : colors.accent, stroke: colors.ink, radius: active === i ? 9.5 : 8, lineWidth: 2 })
    })
    ctx.save()
    ctx.font = uiFont(12)
    ctx.fillStyle = colors.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(titles[i], panel.title.left + 10, panel.title.top + panel.title.height / 2)
    ctx.restore()
  })
  // 仕切り
  const [, b] = step3Panels(width, height, stacked)
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  if (stacked) {
    ctx.moveTo(0, b.title.top + 0.5)
    ctx.lineTo(width, b.title.top + 0.5)
  } else {
    ctx.moveTo(b.title.left + 0.5, 0)
    ctx.lineTo(b.title.left + 0.5, height)
  }
  ctx.stroke()
  ctx.restore()
}
