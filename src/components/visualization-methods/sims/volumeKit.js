import { headPhantom3D, transferFunction } from '../../../utils/vis/volume'

export const VOLUME_N = 64
export const PHANTOM_VOLUME = headPhantom3D(VOLUME_N)
export const VOXEL_DS = 2 / (VOLUME_N - 1)

export const TF_PRESETS = {
  '骨': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.72, alpha: 0, t: 0.7 },
    { value: 0.88, alpha: 0.08, t: 0.88 },
    { value: 1, alpha: 0.82, t: 1 },
  ],
  // 中(値 0.2)はごく薄く、小さな塊(0.3)を濃く、空洞(0)は透明、外の殻(1)は輪郭が分かる程度に
  '中身': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.16, alpha: 0, t: 0.2 },
    { value: 0.2, alpha: 0.006, t: 0.3 },
    { value: 0.25, alpha: 0.01, t: 0.45 },
    { value: 0.3, alpha: 0.4, t: 0.7 },
    { value: 0.36, alpha: 0, t: 0.75 },
    { value: 0.85, alpha: 0, t: 0.85 },
    { value: 1, alpha: 0.18, t: 1 },
  ],
  '全部': [
    { value: 0, alpha: 0, t: 0 },
    { value: 0.12, alpha: 0.015, t: 0.12 },
    { value: 0.26, alpha: 0.11, t: 0.38 },
    { value: 0.55, alpha: 0.18, t: 0.67 },
    { value: 0.82, alpha: 0.36, t: 0.86 },
    { value: 1, alpha: 0.72, t: 1 },
  ],
}

export const cloneTfPoints = (points) => points.map((point) => ({ ...point }))
export const evaluateTf = (points) => (value) => transferFunction(points, value)

export function colorRamp(colors, t) {
  const stops = ['lane-0', 'lane-1', 'lane-3']
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  const f = u - i
  return colors.rgb[stops[i]].map((value, channel) => (value * (1 - f) + colors.rgb[stops[i + 1]][channel] * f) / 255)
}

export function valueRamp(colors, value) {
  const dark = colors.dark ? colors.rgb.surface : colors.rgb.ink
  const light = colors.dark ? colors.rgb.ink : colors.rgb.surface
  return dark.map((channel, i) => (channel * (1 - value) + light[i] * value) / 255)
}

export function orbitCamera(yaw, pitch, distance = 3.4) {
  const cp = Math.cos(pitch)
  const origin = [distance * Math.sin(yaw) * cp, distance * Math.sin(pitch), distance * Math.cos(yaw) * cp]
  const forwardLength = Math.hypot(...origin) || 1
  const forward = origin.map((value) => -value / forwardLength)
  let right = [-forward[2], 0, forward[0]] // 視線と上(+y)の外積: カメラが +z から −z を見るとき +x
  const rightLength = Math.hypot(...right) || 1
  right = right.map((value) => value / rightLength)
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]
  return { origin, forward, right, up }
}

export function cameraRay(camera, px, py, width, height, fov = Math.PI / 4) {
  const scale = Math.tan(fov / 2)
  const x = (2 * (px + 0.5) / width - 1) * scale
  const y = (1 - 2 * (py + 0.5) / height) * scale
  const direction = camera.forward.map((value, i) => value + x * camera.right[i] + y * camera.up[i])
  const length = Math.hypot(...direction) || 1
  return { origin: camera.origin, dir: direction.map((value) => value / length) }
}

const histogram = new Uint32Array(48)
for (const value of PHANTOM_VOLUME) histogram[Math.min(histogram.length - 1, Math.floor(value * histogram.length))]++
export const VOLUME_HISTOGRAM = histogram
