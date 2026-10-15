// カメラ(視点)の姿勢と、画面の点から世界への光線。DOM に触れない純関数。
// 行列は mat4.js の translate・rotateX・rotateY・compose だけで組み、投影は projection.js の perspectiveMatrix を使う。
//
// カメラは「見る点(target)を中心に回る」形で持つ(軌道カメラ):
//   位置 C = target + dist · (cosψ·sinφ, sinψ, cosψ·cosφ)   (φ: 方位角 yaw、ψ: 仰角 pitch)
//   カメラの座標系 → 世界:  Vinv = T(target) · Ry(φ) · Rx(−ψ) · T(0, 0, dist)
//   世界 → カメラの座標系:  V    = T(0, 0, −dist) · Rx(ψ) · Ry(−φ) · T(−target)   (Vinv の逆)
// カメラは自分の −z を向き、y が上。位置を (x, y, z) で渡したいときは lookAtPose が角度に直す。
import { translate, rotateX, rotateY, compose, transformPoint } from '../../../utils/vis/mat4.js'
import { perspectiveMatrix } from '../../../utils/vis/projection.js'

export function orbitPose({ target = [0, 0, 0], yaw = 0, pitch = 0, dist = 5 }) {
  const [tx, ty, tz] = target
  const V = compose(translate(0, 0, -dist), rotateX(pitch), rotateY(-yaw), translate(-tx, -ty, -tz))
  const Vinv = compose(translate(tx, ty, tz), rotateY(yaw), rotateX(-pitch), translate(0, 0, dist))
  const position = transformPoint(Vinv, [0, 0, 0, 1]).slice(0, 3)
  return { target: [tx, ty, tz], yaw, pitch, dist, V, Vinv, position }
}

// 位置 position から target を見るカメラ(上は +y)。position と target が同じ点だと向きが決まらないので、
// 距離が 1e-6 より近いときは dist = 1e-6 の真正面とする
export function lookAtPose(position, target) {
  const dx = position[0] - target[0]
  const dy = position[1] - target[1]
  const dz = position[2] - target[2]
  const flat = Math.hypot(dx, dz)
  const dist = Math.max(Math.hypot(dx, dy, dz), 1e-6)
  return orbitPose({
    target,
    yaw: flat === 0 ? 0 : Math.atan2(dx, dz),
    pitch: Math.atan2(dy, flat),
    dist,
  })
}

// ビューと投影をまとめる。fov はラジアン(縦の視野角)、aspect は幅/高さ
export function cameraMatrices(pose, { fov, aspect, near, far }) {
  const P = perspectiveMatrix(fov, aspect, near, far)
  return { V: pose.V, P, VP: compose(P, pose.V) }
}

// カメラの前、距離 depth の面の 4 隅(世界の座標)。左下・右下・右上・左上の順
export function frustumCorners(pose, { fov, aspect }, depth) {
  const hy = depth * Math.tan(fov / 2)
  const hx = hy * aspect
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => transformPoint(pose.Vinv, [x, y, -depth, 1]).slice(0, 3))
}

// 画面の点(NDC の nx, ny。−1〜1)を通る光線: カメラの位置から出る、世界の向き
export function pixelRay(pose, { fov, aspect }, nx, ny) {
  const t = Math.tan(fov / 2)
  const dir = transformPoint(pose.Vinv, [nx * t * aspect, ny * t, -1, 0]).slice(0, 3)
  return { origin: pose.position, dir }
}

// 光線が平面 z = z0 と交わる点。平行、または平面がカメラの後ろなら null
export function rayPlaneZ(ray, z0) {
  const dz = ray.dir[2]
  if (Math.abs(dz) < 1e-12) return null
  const s = (z0 - ray.origin[2]) / dz
  if (!(s > 0)) return null
  return [ray.origin[0] + s * ray.dir[0], ray.origin[1] + s * ray.dir[1], z0]
}
