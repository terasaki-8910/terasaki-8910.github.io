import { gridPlane, uvSphere } from '../../../utils/vis/mesh'
import { blinnPhongSpecular, lambert, phongSpecular } from '../../../utils/vis/shading'
import { dot, normalize } from '../../../utils/vis/vec3'
import { monoFont } from '../../visualization/canvasFont'
import { GRAB_SLOP_PX, markerCircle } from '../../visualization/sims/rigidKit'
import { blitPixels } from './pixelKit'

export const HALF_PI = Math.PI / 2
export const ANGLE_HANDLE_R = 7

export function tokenRgb(colors, name) {
  return colors.rgb[name].map((value) => value / 255)
}

// 2 つのトークンの色を t の割合で混ぜる(0〜1)。line は半透明の ink なので、塗りの面には使わない(黒くなる)
export function mixTokens(colors, a, b, t) {
  const ca = tokenRgb(colors, a)
  const cb = tokenRgb(colors, b)
  return ca.map((v, i) => v * (1 - t) + cb[i] * t)
}

// 地面の色(床の暗いマスと、環境の地平線より下): surface に muted を少し混ぜた灰色
export const groundColor = (colors) => mixTokens(colors, 'surface', 'muted', 0.35)

export function makeEnvironment(colors) {
  const horizon = tokenRgb(colors, 'surface')
  const zenith = tokenRgb(colors, colors.dark ? 'lane-0' : 'paper')
  const ground = groundColor(colors)
  return (direction, out) => {
    if (direction[1] < 0) {
      out[0] = ground[0]
      out[1] = ground[1]
      out[2] = ground[2]
      return out
    }
    const t = Math.min(1, direction[1])
    for (let i = 0; i < 3; i++) out[i] = horizon[i] * (1 - t) + zenith[i] * t
    return out
  }
}

export function makeShadingScene(colors, { segments, light, material, shininess, roughness }) {
  return {
    meshes: [
      {
        ...gridPlane(6, 24),
        material: {
          color: tokenRgb(colors, 'surface'),
          color2: groundColor(colors),
          checker: 0.5,
          kd: 0.72,
          ks: 0.18,
          kind: 'paint',
        },
      },
      {
        ...uvSphere(1, segments, Math.round(segments / 2), [0, 1, 0]),
        material: {
          color: tokenRgb(colors, 'lane-1'),
          kd: 0.78,
          ks: 0.52,
          shininess,
          roughness,
          F0: 0.06,
          kind: material,
          ior: 1.5,
        },
      },
    ],
    light: { position: light, intensity: 1 },
    ambient: 0.1,
    environment: makeEnvironment(colors),
  }
}

export function directionFromAngle(angle) {
  return [Math.sin(angle), Math.cos(angle), 0]
}

export function angleFromPoint(view, origin, point) {
  const x = view.wx(point.x) - origin[0]
  const y = view.wy(point.y) - origin[1]
  return Math.atan2(x, Math.max(0, y))
}

export function angleHandlePoint(view, origin, radius, angle) {
  const direction = directionFromAngle(angle)
  return [view.sx(origin[0] + direction[0] * radius), view.sy(origin[1] + direction[1] * radius)]
}

export function hitAngleHandle(view, origin, radius, angle, point) {
  const [x, y] = angleHandlePoint(view, origin, radius, angle)
  return Math.hypot(point.x - x, point.y - y) <= ANGLE_HANDLE_R + GRAB_SLOP_PX
}

// つまみが動ける半円の道すじ(破線)。道すじも意味のある線なので、line(1.3:1)ではなく muted(4.4:1)
export function drawSemicircle(ctx, view, origin, radius, colors) {
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1.25
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  for (let i = 0; i <= 80; i++) {
    const a = -HALF_PI + (Math.PI * i) / 80
    const p = directionFromAngle(a)
    const x = view.sx(origin[0] + p[0] * radius)
    const y = view.sy(origin[1] + p[1] * radius)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

// 角度のつまみ(原点から半円の上のつまみまでの線と、つまみ、名前)。selected なら、いま矢印キーが動かす方として
// つまみの縁を太くする(普通 1.5、選択中 3)
export function drawAngleHandle(ctx, view, origin, radius, angle, colors, label, lineColor, selected = false) {
  const p = directionFromAngle(angle)
  const x = view.sx(origin[0] + p[0] * radius)
  const y = view.sy(origin[1] + p[1] * radius)
  const gap = ANGLE_HANDLE_R + 5
  ctx.save()
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(view.sx(origin[0]), view.sy(origin[1]))
  ctx.lineTo(x, y)
  ctx.stroke()
  markerCircle(ctx, x, y, ANGLE_HANDLE_R + (selected ? 1 : 0), { fill: colors.accent, stroke: colors.ink, lineWidth: selected ? 3 : 1.5 })
  ctx.fillStyle = colors.ink
  ctx.font = '12px sans-serif'
  ctx.textAlign = p[0] < -0.15 ? 'right' : 'left'
  ctx.textBaseline = p[1] > 0.8 ? 'bottom' : 'middle'
  ctx.fillText(label, x + (p[0] < -0.15 ? -gap : gap), y - (p[1] > 0.8 ? gap - 1 : 0))
  ctx.restore()
}

// 線や球の上に重なる文字。surface 色の縁を付けて、下の絵が明るくても暗くても ink の文字が読めるようにする
export function drawHaloText(ctx, text, x, y, colors, { size = 11, align = 'left', baseline = 'alphabetic' } = {}) {
  ctx.save()
  ctx.font = monoFont(size)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = colors.surface
  ctx.strokeText(text, x, y)
  ctx.fillStyle = colors.ink
  ctx.fillText(text, x, y)
  ctx.restore()
}

// PageUp・PageDown(Alt・Ctrl・Cmd つきは含めない)。選ぶ物を前後に変えるキー
export function isSelectKey(event) {
  return (event.key === 'PageUp' || event.key === 'PageDown') && !event.altKey && !event.ctrlKey && !event.metaKey
}

// 選べる物の並び list の中で、今の current から前(PageUp)・次(PageDown)へ。端では反対側の端へ回る
export function cycleSelection(list, current, key) {
  const index = Math.max(0, list.indexOf(current))
  return list[(index + (key === 'PageUp' ? -1 : 1) + list.length) % list.length]
}

export function drawPixelSphere(ctx, cx, cy, radius, colors, { L, V = [0, 0, 1], m = 24, mode = 'lambert' }) {
  const size = Math.max(2, Math.ceil(radius * 2))
  const image = ctx.createImageData(size, size)
  const base = colors.rgb['lane-1']
  const paper = colors.rgb.paper
  const light = normalize(L.slice())
  const eye = normalize(V.slice())
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1
      const ny = 1 - ((y + 0.5) / size) * 2
      const rr = nx * nx + ny * ny
      const offset = (y * size + x) * 4
      if (rr > 1) continue
      const N = [nx, ny, Math.sqrt(1 - rr)]
      const diffuse = lambert(N, light)
      const specular = mode === 'phong'
        ? phongSpecular(N, light, eye, m)
        : mode === 'blinn-phong' ? blinnPhongSpecular(N, light, eye, m) : 0
      const shade = 0.1 + 0.78 * diffuse
      for (let ch = 0; ch < 3; ch++) image.data[offset + ch] = Math.min(255, base[ch] * shade + paper[ch] * 0.8 * specular)
      image.data[offset + 3] = 255
    }
  }
  blitPixels(ctx, image, size, size, Math.round(cx - size / 2), Math.round(cy - size / 2))
  // 球の輪郭(暗い側が地に溶けないように)。line(1.3:1)ではなく muted
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// 鏡面反射の分布(極座標の線)。フォンは ink の実線、ブリン-フォンは muted の破線(重なっても 2 本を見分けられる)
export const LOBE_BLINN_DASH = [5, 4]

export function drawPolarLobe(ctx, view, origin, radius, colors, { L, V, m, matchSpread = false, showBlinn = true }) {
  const N = [0, 1, 0]
  const rAngle = Math.atan2(-L[0], L[1])
  const draw = (kind, color, exponent, dash) => {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.setLineDash(dash)
    ctx.beginPath()
    for (let i = 0; i <= 120; i++) {
      const angle = -HALF_PI + (Math.PI * i) / 120
      const sampleV = directionFromAngle(angle)
      const value = kind === 'phong'
        ? phongSpecular(N, L, sampleV, exponent)
        : blinnPhongSpecular(N, L, sampleV, exponent)
      const x = origin[0] + sampleV[0] * radius * value
      const y = origin[1] + sampleV[1] * radius * value
      if (i === 0) ctx.moveTo(view.sx(x), view.sy(y))
      else ctx.lineTo(view.sx(x), view.sy(y))
    }
    ctx.stroke()
    ctx.restore()
  }
  draw('phong', colors.ink, m, [])
  if (showBlinn) draw('blinn', colors.muted, matchSpread ? 4 * m : m, LOBE_BLINN_DASH)
  return { rAngle, phong: phongSpecular(N, L, V, m), blinn: blinnPhongSpecular(N, L, V, matchSpread ? 4 * m : m) }
}

export function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a.slice()), normalize(b.slice())))))
}

// どの向きも同じ 1 色の環境(背景を canvas の地の色にそろえたい 3 次元の絵に使う)
export function flatEnvironment(colors, name = 'surface') {
  const c = tokenRgb(colors, name)
  return (direction, out) => {
    out[0] = c[0]
    out[1] = c[1]
    out[2] = c[2]
    return out
  }
}
