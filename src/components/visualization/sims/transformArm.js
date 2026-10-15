// 全体のシミュレーション「2 関節の腕のキーフレームアニメーション」の、描かない部分(DOM にも canvas にも触れない)。
//   キーフレーム → スプライン補間(spline.js)→ 手先の目標 → IK(ik.js)→ 関節の角度 → 腕の箱を 3 次元に置く(mat4.js)
// ここに式は書かない。補間は naturalCubicSpline・evalSpline、角度は ik2Analytic、行列は translate・rotateZ・scale・compose。
// 世界は右手系で、x が右、y が上、z が手前(カメラの側)。単位は m。腕は x–y 平面(z = 0)の中で曲がる。
import { translate, rotateZ, scale, compose, transformPoint } from '../../../utils/vis/mat4.js'
import { naturalCubicSpline, evalSpline, findSegment } from '../../../utils/vis/spline.js'
import { ik2Analytic } from '../../../utils/vis/ik.js'
import { L1, L2 } from './transformIk.js'
import { toRad } from './transformCommon.js'

export const FIXED_DT = 1 / 60 // アニメーションの時間刻み Δt [s]
export const T_END = 5 // 1 周の長さ [s]
export const ARM_WIDTH = 0.16 // 腕の箱の太さ [m]
export const ARM_BASE = [0, 0, 0] // 肩の位置(世界)。モデル変換の平行移動
export const GROUND_Y = -1.05 // 床の高さ
export const CAMERA_TARGET = [0, 0.3, 0] // カメラが見る点
export const NEAR = 0.5
export const FAR = 30

// キーフレーム: 時刻と、その時刻に手先を置きたい位置(x, y)[m]。最後は最初と同じで、1 周して戻る。
// どの位置も腕の届く範囲(|L1−L2| = 0.3〜L1+L2 = 1.7)の内側
export const KEY_TIMES = [0, 1, 2, 3, 4, 5]
export const KEY_POINTS = [
  [1.2, 0.05],
  [0.95, 1.0],
  [-0.25, 1.25],
  [-1.1, 0.35],
  [-0.3, -0.85],
  [1.2, 0.05],
]
export const KEY_LABELS = [1, 2, 3, 4, 5, 1] // 表示する番号(6 つ目は 1 に戻る)

// 画面に出す設定の初期値
export const CAMERA_DEFAULT = { x: 2, y: 1.2, z: 5.5, fovDeg: 45 }
export const OUTSIDE_DEFAULT = { yaw: toRad(55), pitch: toRad(22), dist: 11, fov: toRad(40) }

// 手先の目標の経路: x(t)・y(t) をそれぞれ自然 3 次スプラインでつなぐ
export function buildPath(points = KEY_POINTS, times = KEY_TIMES) {
  return {
    times,
    points,
    sx: naturalCubicSpline(times, points.map((p) => p[0])),
    sy: naturalCubicSpline(times, points.map((p) => p[1])),
  }
}

export function handAt(path, t) {
  return [evalSpline(path.sx, t), evalSpline(path.sy, t)]
}

// 経路を n 区間に刻んだ点列(腕の平面の中。世界の座標にするのは armPlanePoint)
export function samplePath(path, n = 120) {
  const end = path.times[path.times.length - 1]
  return Array.from({ length: n + 1 }, (_, i) => handAt(path, (end * i) / n))
}

// 腕の平面の点 (x, y) を世界の点にする(腕の置き場 ARM_BASE の平行移動)
export function armPlanePoint(p, base = ARM_BASE) {
  return [base[0] + p[0], base[1] + p[1], base[2]]
}

// いまの時刻がどのキーフレームの間か: { from, to }(表示する番号)と、区間の中の位置 frac(0〜1)
export function keyframeInfo(t, times = KEY_TIMES, labels = KEY_LABELS) {
  const i = findSegment(times, Math.min(Math.max(t, times[0]), times[times.length - 1]))
  const frac = (t - times[i]) / (times[i + 1] - times[i])
  return { segment: i, from: labels[i], to: labels[i + 1], frac: Math.min(1, Math.max(0, frac)) }
}

// 目標 (x, y) に手先を届かせる関節角 [θ1, θ2](肘が上の解)
export function armAngles(target, elbowUp = true) {
  return ik2Analytic(L1, L2, target[0], target[1], elbowUp)
}

// 腕のモデル変換。肩の行列 → 1 本目 → 肘で 2 本目、と掛けていく(右にあるほど先に効く):
//   M1 = T(base) · Rz(θ1)           1 本目の根元に原点をもつ座標系
//   M2 = M1 · T(L1, 0, 0) · Rz(θ2)  2 本目の根元(= 肘)に原点をもつ座標系
//   箱 = M · T(長さ/2, 0, 0) · S(長さ/2, 幅/2, 幅/2)  ±1 の箱を、根元から長さ分だけ伸びる細い箱にする
export function armMatrices(theta, base = ARM_BASE) {
  const Mbase = translate(base[0], base[1], base[2])
  const M1 = compose(Mbase, rotateZ(theta[0]))
  const M2 = compose(M1, translate(L1, 0, 0), rotateZ(theta[1]))
  const half = ARM_WIDTH / 2
  const link = (M, length) => compose(M, translate(length / 2, 0, 0), scale(length / 2, half, half))
  const joint = (M, r) => compose(M, scale(r, r, r))
  return {
    base: Mbase,
    M1,
    M2,
    link1: link(M1, L1),
    link2: link(M2, L2),
    shoulder: joint(Mbase, 0.12),
    elbowBox: joint(M2, 0.12),
    pedestal: compose(translate(base[0], (base[1] + GROUND_Y) / 2 - 0.02, base[2]), scale(0.3, (base[1] - GROUND_Y) / 2 - 0.02, 0.3)),
    elbow: transformPoint(M1, [L1, 0, 0, 1]).slice(0, 3),
    tip: transformPoint(M2, [L2, 0, 0, 1]).slice(0, 3),
  }
}

// 位置 (x, y, z) から CAMERA_TARGET を見るカメラの設定を、カメラの姿勢の入力に直す
export function cameraSpec(cam) {
  return { position: [cam.x, cam.y, cam.z], target: CAMERA_TARGET, fov: toRad(cam.fovDeg) }
}

// 時間を Δt = FIXED_DT の整数倍ずつ進める。clock = { t, acc }。進めた回数を返す。
// 追いつけない分(1 フレームで maxSteps 回を超える分)は捨てる。t は 0〜tEnd で 1 周したら 0 に戻る
export function advanceClock(clock, dt, { fixedDt = FIXED_DT, tEnd = T_END, maxSteps = 3 } = {}) {
  clock.acc += dt
  let steps = 0
  while (clock.acc >= fixedDt - 0.0015 && steps < maxSteps) {
    clock.acc -= fixedDt
    clock.t += fixedDt
    steps++
    if (clock.t >= tEnd) clock.t -= tEnd
  }
  if (steps === maxSteps) clock.acc = 0
  return steps
}

// canvas を「外から見た図」と「カメラから見た絵」に分ける。
//   stacked=false: 左右に 2 つ  stacked=true: 上下に 2 つ(狭い・縦長の画面)
// 各パネルは、上に題の帯 titleH を取り、下を描く枠 rect にする。
export const PANEL_TITLE_H = 24
export function splitPanels(width, height, stacked) {
  const halfW = stacked ? width : width / 2
  const halfH = stacked ? height / 2 : height
  const make = (left, top) => ({
    title: { left, top, width: halfW, height: PANEL_TITLE_H },
    rect: { left, top: top + PANEL_TITLE_H, width: halfW, height: Math.max(1, halfH - PANEL_TITLE_H) },
  })
  return {
    outside: make(0, 0),
    camera: stacked ? make(0, halfH) : make(halfW, 0),
  }
}

// 画面の幅から、上下に並べるかを決める(幅 560px 未満は上下)
export const STACK_BELOW = 560
export function isStacked(width) {
  return width < STACK_BELOW
}
