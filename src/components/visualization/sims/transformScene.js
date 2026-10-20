// 全体のシミュレーションの絵: 1 つの canvas を「外から見た図」と「カメラから見た絵」に分けて描く。
// 同じ世界(床・腕・経路・キーフレーム)を、2 台のカメラで撮る。
//   外から見た図   … 見る向きをドラッグで回せるカメラ(軌道カメラ)。主役のカメラの本体と視錐台も描く
//   カメラから見た絵 … 主役のカメラ(位置と視野角はバー)が撮る絵。ビューポート変換でこの枠の画素に写る
// 点の写し方は transformMesh.js(mat4・projection の関数)。ここは何をどの順に描くかだけ。
import { translate, scale, compose } from '../../../utils/vis/mat4.js'
import { uiFont } from './transformCommon.js'
import { orbitPose, lookAtPose, cameraMatrices, frustumCorners } from './transformCamera.js'
import {
  projectPoint,
  drawBoxes,
  drawLine3d,
  drawPolyline3d,
  drawGround,
  drawAxes3d,
  drawDot3d,
  drawText3d,
  withClip,
} from './transformMesh.js'
import {
  KEY_POINTS,
  KEY_LABELS,
  GROUND_Y,
  NEAR,
  FAR,
  OUTSIDE_DEFAULT,
  CAMERA_TARGET,
  handAt,
  samplePath,
  armPlanePoint,
  armAngles,
  armMatrices,
  cameraSpec,
  splitPanels,
} from './transformArm.js'

// 状態 state(draw に渡す)
//   t        時刻 [s]
//   cam      { x, y, z, fovDeg }  主役のカメラの位置 [m] と縦の視野角 [°]
//   yaw, pitch  外から見るカメラの方位角と仰角 [rad]
//   path     buildPath() の結果
//   stacked  上下に並べるか
// 計算の途中の値(手先の目標・関節角・腕の行列・カメラの姿勢)を、描かずに求める(凡例の更新にも使う)
export function sceneModel(state) {
  const target = handAt(state.path, state.t)
  const theta = armAngles(target)
  const arm = armMatrices(theta)
  const spec = cameraSpec(state.cam)
  const camPose = lookAtPose(spec.position, spec.target)
  return { path: state.path, target, theta, arm, camPose, fov: spec.fov }
}

// 主役のカメラが撮る絵の枠(canvas の中の位置)と、その行列
export function cameraView(model, panels) {
  const rect = panels.camera.rect
  const aspect = rect.width / rect.height
  return { rect, aspect, ...cameraMatrices(model.camPose, { fov: model.fov, aspect, near: NEAR, far: FAR }) }
}

// 手先のカメラの絵の中の位置(画素。viewport の座標なので、枠の左下が原点で y は上向き)。カメラの後ろなら null
export function handOnScreen(model, panels) {
  const view = cameraView(model, panels)
  const p = projectPoint(view.VP, model.arm.tip, view.rect)
  return p ? { x: p.vx, y: p.vy, width: view.rect.width, height: view.rect.height } : null
}

// 世界の中身。2 つの枠で同じものを描く
function drawWorld(ctx, VP, rect, colors, model, { numbers = 'circle' } = {}) {
  drawGround(ctx, VP, rect, { y: GROUND_Y, half: 5, step: 1, color: colors.muted, width: 1 })

  // 手先の経路(破線)とキーフレーム
  const path = samplePath(model.path, 120).map((p) => armPlanePoint(p))
  drawPolyline3d(ctx, VP, rect, path, { color: colors.ink, width: 1.5, dash: [5, 4] })
  // numbers: 'circle' は番号を丸で囲む(大きい絵)、'text' は小さい点と番号の文字だけ(小さい絵。丸が重ならないように)
  KEY_POINTS.slice(0, -1).forEach((p, i) => {
    const world = armPlanePoint(p)
    const circle = numbers === 'circle'
    const s = drawDot3d(ctx, VP, rect, world, { fill: colors.surface, stroke: colors.ink, radius: circle ? 8 : 3, lineWidth: 1.5 })
    if (!s) return
    ctx.save()
    ctx.font = uiFont(circle ? 11 : 10)
    ctx.fillStyle = colors.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (circle) ctx.fillText(String(KEY_LABELS[i]), s.x, s.y + 0.5)
    else ctx.fillText(String(KEY_LABELS[i]), s.x + 7, s.y - 7)
    ctx.restore()
  })

  // 腕
  const arm = model.arm
  const accent = colors.alpha('accent', 0.7)
  drawBoxes(
    ctx,
    VP,
    rect,
    [
      { M: arm.pedestal, fill: colors.alpha('ink', 0.1), stroke: colors.ink, lineWidth: 1.25 },
      { M: arm.link1, fill: accent, stroke: colors.ink },
      { M: arm.link2, fill: accent, stroke: colors.ink },
      { M: arm.shoulder, fill: colors.alpha('ink', 0.35), stroke: colors.ink, lineWidth: 1.25 },
      { M: arm.elbowBox, fill: colors.alpha('ink', 0.35), stroke: colors.ink, lineWidth: 1.25 },
    ],
    colors,
  )
  // 手先(目標)
  drawDot3d(ctx, VP, rect, arm.tip, { fill: colors.accent, stroke: colors.ink, radius: 5, lineWidth: 2 })
}

function title(ctx, panel, text, colors) {
  ctx.save()
  ctx.font = uiFont(12)
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, panel.title.left + 10, panel.title.top + panel.title.height / 2)
  ctx.restore()
}

// 主役のカメラの本体と視錐台(外から見た図に描く)。視錐台は見る点の少し先までの角錐の台
function drawCameraBody(ctx, VP, rect, colors, model, aspectOfPicture) {
  const pose = model.camPose
  const spec = { fov: model.fov, aspect: aspectOfPicture }
  const depth = pose.dist + 0.3
  const corners = frustumCorners(pose, spec, depth)
  const style = { color: colors.ink, width: 1.25 }
  for (const c of corners) drawLine3d(ctx, VP, rect, pose.position, c, style)
  drawPolyline3d(ctx, VP, rect, corners, { ...style, close: true })
  drawLine3d(ctx, VP, rect, pose.position, CAMERA_TARGET, { color: colors.muted, width: 1, dash: [3, 4] })
  const body = compose(pose.Vinv, translate(0, 0, 0.2), scale(0.17, 0.12, 0.2))
  const lens = compose(pose.Vinv, translate(0, 0, -0.1), scale(0.09, 0.09, 0.1))
  drawBoxes(
    ctx,
    VP,
    rect,
    [
      { M: body, fill: colors.alpha('ink', 0.3), stroke: colors.ink },
      { M: lens, fill: colors.alpha('ink', 0.55), stroke: colors.ink },
    ],
    colors,
  )
  drawText3d(ctx, VP, rect, [pose.position[0], pose.position[1] + 0.42, pose.position[2]], 'カメラ', { color: colors.ink, size: 12 })
}

export function drawOverview({ ctx, width, height, colors }, state) {
  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)
  const model = sceneModel(state)
  const panels = splitPanels(width, height, state.stacked)
  const cam = cameraView(model, panels)

  // 外から見た図
  {
    const { rect } = panels.outside
    const aspect = rect.width / rect.height
    const pose = orbitPose({ target: OUTSIDE_DEFAULT.target, yaw: state.yaw, pitch: state.pitch, dist: OUTSIDE_DEFAULT.dist })
    const { VP } = cameraMatrices(pose, { fov: OUTSIDE_DEFAULT.fov, aspect, near: NEAR, far: 80 })
    withClip(ctx, rect, () => {
      drawWorld(ctx, VP, rect, colors, model, { numbers: 'text' })
      drawAxes3d(ctx, VP, rect, colors, { len: 2, unit: 'm' })
      drawCameraBody(ctx, VP, rect, colors, model, cam.aspect)
    })
    title(ctx, panels.outside, '外から見た図（ドラッグで回す）', colors)
  }

  // カメラから見た絵
  {
    const { rect } = panels.camera
    withClip(ctx, rect, () => drawWorld(ctx, cam.VP, rect, colors, model, { numbers: 'circle' }))
    ctx.save()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.strokeRect(rect.left + 1, rect.top + 1, rect.width - 2, rect.height - 2) // 絵の縁(ビューポートの枠)
    ctx.font = uiFont(11)
    ctx.fillStyle = colors.ink
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${Math.round(rect.width)} × ${Math.round(rect.height)} px`, rect.left + rect.width - 8, rect.top + rect.height - 6)
    ctx.restore()
    title(ctx, panels.camera, 'カメラから見た絵（ドラッグでカメラを回す）', colors)
  }

  // 2 つの枠の仕切り
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  if (state.stacked) {
    ctx.moveTo(0, panels.camera.title.top + 0.5)
    ctx.lineTo(width, panels.camera.title.top + 0.5)
  } else {
    ctx.moveTo(panels.camera.title.left + 0.5, 0)
    ctx.lineTo(panels.camera.title.left + 0.5, height)
  }
  ctx.stroke()
  ctx.restore()
}
