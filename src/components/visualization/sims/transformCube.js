// 見せ方1「変換と投影」: 立方体のワイヤーフレーム。
// 頂点は mat4(合成)→ projection(perspectiveMatrix → toNDC → viewport)だけで画面に出す。
// ここに式はなく、行列の組み立てと、描く線の選び方(背面・視錐台の外)だけを書く。
import { rotateX, rotateY, rotateZ, translate, scale, compose, transformPoint } from '../../../utils/vis/mat4.js'
import { perspectiveMatrix, toNDC, insideClip, viewport } from '../../../utils/vis/projection.js'
import { isBackFace } from '../../../utils/vis/raster.js'
import { ASPECT, fmt, toRad, uiFont } from './transformCommon.js'

// カメラは (0, 0, CAMERA_Z) から -z を見る(perspectiveMatrix の向き)。ビュー行列は平行移動だけ
export const CAMERA_Z = 7

export const CUBE_DEFAULTS = {
  rx: 25, // 度
  ry: 35,
  rz: 0,
  tx: 1.2,
  ty: 0,
  tz: 0,
  s: 1,
  order: 'trs', // 'trs': M = T·R·S(拡大が先)/ 'srt': M = S·R·T(平行移動が先)
  fov: 50, // 縦の視野角(度)
  near: 1,
  far: 15,
}

// 辺 ±1 の立方体。頂点 i の座標は、ビット 0, 1, 2 が x, y, z の符号(1 なら +1)
const VERTS = Array.from({ length: 8 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1])
// 面は外から見て反時計回りの頂点の並び(+x, -x, +y, -y, +z, -z)
const FACES = [
  [1, 3, 7, 5],
  [0, 4, 6, 2],
  [2, 6, 7, 3],
  [0, 1, 5, 4],
  [4, 5, 7, 6],
  [0, 2, 3, 1],
]
// 辺と、その辺を挟む2つの面
const EDGES = (() => {
  const byKey = new Map()
  FACES.forEach((face, f) => {
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!byKey.has(key)) byKey.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [] })
      byKey.get(key).faces.push(f)
    })
  })
  return [...byKey.values()]
})()

// 回転は Rz·Ry·Rx(X が先)。order が 'trs' なら T·R·S、'srt' なら S·R·T
export function cubeMatrices(p, aspect) {
  const R = compose(rotateZ(toRad(p.rz)), rotateY(toRad(p.ry)), rotateX(toRad(p.rx)))
  const T = translate(p.tx, p.ty, p.tz)
  const S = scale(p.s, p.s, p.s)
  const M = p.order === 'trs' ? compose(T, R, S) : compose(S, R, T)
  const V = translate(0, 0, -CAMERA_Z)
  const P = perspectiveMatrix(toRad(p.fov), aspect, p.near, p.far)
  return { M, V, P, MVP: compose(P, V, M) }
}

// 4×4 を、等幅で桁がそろう文字列の行にする
export function formatMatrix(m) {
  return m.map((row) => `[${row.map((v) => fmt(v).padStart(7)).join('')} ]`)
}

// クリップ座標 → 画面(y は上向きの viewport 座標と、canvas の下向きの座標の両方)。カメラの後ろ(w <= 0)は null
function project(MVP, point, width, height) {
  const clip = transformPoint(MVP, point)
  if (!(clip[3] > 0)) return null
  const [nx, ny] = toNDC(clip)
  const [vx, vy] = viewport([nx, ny], 0, 0, width, height)
  return { vx, vy, x: vx, y: height - vy, inside: insideClip(clip) }
}

export function drawCube({ ctx, width, height, colors }, p) {
  const { MVP } = cubeMatrices(p, ASPECT) // 枠の縦横比は固定なので、画面の行列の数と同じ行列で描く
  const pts = VERTS.map((v) => project(MVP, [v[0], v[1], v[2], 1], width, height))

  // 面の表裏。画面上の反時計回りが表(isBackFace は時計回りを背面とする)。カメラの後ろの頂点がある面は不明(null)
  const facing = FACES.map((face) => {
    const [a, b, c] = face.slice(0, 3).map((i) => pts[i])
    if (!a || !b || !c) return null
    return !isBackFace([a.vx, a.vy], [b.vx, b.vy], [c.vx, c.vy])
  })

  const edges = EDGES.filter((e) => pts[e.a] && pts[e.b]).map((e) => ({
    a: pts[e.a],
    b: pts[e.b],
    back: e.faces.every((f) => facing[f] === false),
    outside: !(pts[e.a].inside && pts[e.b].inside),
  }))

  const line = (e, style, lineWidth, dash = []) => {
    ctx.strokeStyle = style
    ctx.lineWidth = lineWidth
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(e.a.x, e.a.y)
    ctx.lineTo(e.b.x, e.b.y)
    ctx.stroke()
  }

  ctx.lineCap = 'round'
  // 奥から: 背面の辺(薄く)→ 表の辺。視錐台の外に出た辺は破線にする
  for (const e of edges.filter((e) => e.back)) {
    if (e.outside) line(e, colors.alpha('muted', 0.85), 1, [3, 4])
    else line(e, colors.alpha('ink', 0.5), 1) // 背面は細く薄く。地に 3:1 以上(0.3 だと 1.9:1)
  }
  for (const e of edges.filter((e) => !e.back)) {
    if (e.outside) line(e, colors.muted, 1.5, [5, 4])
    else line(e, colors.ink, 2)
  }
  ctx.setLineDash([])

  // モデルの軸(長さ 1.8)。回転と、掛ける順のちがいが見えるように
  const origin = project(MVP, [0, 0, 0, 1], width, height)
  if (origin) {
    ctx.font = uiFont(12)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const axes = [
      ['x', [1.8, 0, 0, 1]],
      ['y', [0, 1.8, 0, 1]],
      ['z', [0, 0, 1.8, 1]],
    ]
    for (const [name, end] of axes) {
      const q = project(MVP, end, width, height)
      if (!q) continue
      line({ a: origin, b: q }, colors.muted, 1.5)
      const dx = q.x - origin.x
      const dy = q.y - origin.y
      const len = Math.hypot(dx, dy) || 1
      ctx.fillStyle = colors.ink
      ctx.fillText(name, q.x + (dx / len) * 9, q.y + (dy / len) * 9)
    }
  }
}
