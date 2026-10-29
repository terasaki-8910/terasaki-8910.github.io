import { useEffect, useState } from 'react'
import { headPhantom3D, transferFunction } from '../../../utils/vis/volume'
import { readColors } from '../../visualization/useCanvas'

export { TF_PRESETS, cloneTfPoints } from './tfEditorKit' // プリセットと点の操作は、node のテストで読める tfEditorKit.js にある

export const VOLUME_N = 64
export const PHANTOM_VOLUME = headPhantom3D(VOLUME_N)
export const VOXEL_DS = 2 / (VOLUME_N - 1)

export const evaluateTf = (points) => (value) => transferFunction(points, value)

// テーマ(data-theme)が変わるたびに読み直す色(useCanvas の readColors と同じもの)。凡例の色見本のように、
// 描画(draw)の外の render で色が要るとき用。テーマを切り替えても、次の操作まで古い色のままにならない
export function useThemeColors() {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return colors
}

// 色(0〜1 の [r, g, b])を CSS の色の文字列にする(凡例の色見本・ImageData の外で使う)
export const cssRgb = (color) => `rgb(${color.map((value) => Math.round(value * 255)).join(' ')})`

// 灰色の濃淡の凡例用の色見本(低い値 → 高い値。valueRamp と同じ向き。ライトは ink → surface、ダークは surface → ink)
export const graySwatch = (dark) => (dark
  ? 'linear-gradient(90deg, var(--color-surface), var(--color-ink))'
  : 'linear-gradient(90deg, var(--color-ink), var(--color-surface))')

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
