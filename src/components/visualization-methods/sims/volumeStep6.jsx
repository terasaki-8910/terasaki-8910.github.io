import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { opacityCorrection, sampleVolume, sliceAxis, transferFunction } from '../../../utils/vis/volume'
import { clamp } from '../../visualization/sims/rigidKit'
import { colorRamp, orbitCamera, PHANTOM_VOLUME, TF_PRESETS, VOXEL_DS, VOLUME_N } from './volumeKit'

const axisNames = ['x', 'y', 'z']

export default function VolumeStep6() {
  const [count, setCount] = useState(24)
  const [adaptive, setAdaptive] = useState(true)
  const [angles, setAngles] = useState({ yaw: -0.7, pitch: 0.32 })
  const stateRef = useRef({ count, adaptive, angles })
  stateRef.current = { count, adaptive, angles }
  const legendRef = useRef(null)
  const draw = ({ ctx, width, height, dpr, colors }) => {
    const state = stateRef.current; const camera = orbitCamera(state.angles.yaw, state.angles.pitch)
    const viewDir = camera.forward; const axis = state.adaptive ? sliceAxis(viewDir) : 2
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    const resolution = 40; const scale = Math.min(width, height) * 0.3; const center = [width / 2, height / 2]
    const planeAxes = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
    const orderSign = viewDir[axis] >= 0 ? 1 : -1
    for (let index = 0; index < state.count; index++) {
      const fraction = index / Math.max(1, state.count - 1)
      const coordinate = orderSign > 0 ? -1 + 2 * fraction : 1 - 2 * fraction
      const image = ctx.createImageData(resolution, resolution)
      for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
        const p = [0, 0, 0]; p[axis] = coordinate; p[planeAxes[0]] = -1 + 2 * (x + 0.5) / resolution; p[planeAxes[1]] = 1 - 2 * (y + 0.5) / resolution
        const value = sampleVolume(PHANTOM_VOLUME, VOLUME_N, p[0], p[1], p[2]); const tf = transferFunction(TF_PRESETS['全部'], value)
        const alpha = opacityCorrection(Math.min(tf.alpha, 0.999), 2 / state.count, VOXEL_DS); const color = colorRamp(colors, tf.t); const o = (y * resolution + x) * 4
        for (let ch = 0; ch < 3; ch++) image.data[o + ch] = Math.round(color[ch] * 255)
        image.data[o + 3] = Math.round(alpha * 255)
      }
      const offscreen = ctx.canvas.ownerDocument.createElement('canvas'); offscreen.width = resolution; offscreen.height = resolution
      offscreen.getContext('2d').putImageData(image, 0, 0)
      const center3 = [0, 0, 0]; center3[axis] = coordinate
      const project = (p) => [center[0] + scale * (p[0] * camera.right[0] + p[1] * camera.right[1] + p[2] * camera.right[2]), center[1] - scale * (p[0] * camera.up[0] + p[1] * camera.up[1] + p[2] * camera.up[2])]
      const c = project(center3)
      const u3 = [0, 0, 0]; u3[planeAxes[0]] = 2; const v3 = [0, 0, 0]; v3[planeAxes[1]] = -2
      const u = project(u3); const o = project([0, 0, 0]); const v = project(v3)
      ctx.save()
      ctx.setTransform(dpr * (u[0] - o[0]) / resolution, dpr * (u[1] - o[1]) / resolution, dpr * (v[0] - o[0]) / resolution, dpr * (v[1] - o[1]) / resolution, dpr * (c[0] - (u[0] - o[0]) / 2 - (v[0] - o[0]) / 2), dpr * (c[1] - (u[1] - o[1]) / 2 - (v[1] - o[1]) / 2))
      ctx.drawImage(offscreen, 0, 0)
      ctx.restore()
    }
    legendRef.current?.update({ axis: axisNames[axis], count: String(state.count) })
  }
  const { canvasRef, redraw } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [count, adaptive, angles])
  usePointerDrag(canvasRef, { canGrab: () => true, onDown: () => true, onMove: ({ dx, dy }) => setAngles((value) => ({ yaw: value.yaw - dx * 0.009, pitch: clamp(value.pitch + dy * 0.009, -1.25, 1.25) })) })
  const onKeyDown = (event) => {
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault(); setAngles((value) => ({ yaw: value.yaw + (event.key === 'ArrowLeft' ? 0.05 : event.key === 'ArrowRight' ? -0.05 : 0), pitch: clamp(value.pitch + (event.key === 'ArrowDown' ? 0.05 : event.key === 'ArrowUp' ? -0.05 : 0), -1.25, 1.25) }))
  }
  return <SimShell label="軸に沿った板の重ね描き" stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="半透明の断面板。ドラッグまたは矢印キーで視点を回転" />} controls={<>
    <ParamSlider symbol="K" label="板の枚数" value={count} min={4} max={64} step={1} onChange={(value) => setCount(Math.round(value))} />
    <SimToolbar><ToggleButton pressed={adaptive} onChange={setAdaptive}>向きに合わせて軸を選ぶ</ToggleButton></SimToolbar>
  </>} legend={<SimLegend ref={legendRef} items={[
    { key: 'axis', label: '現在の軸', value: 'z' },
    { key: 'count', symbol: 'K', label: '板の枚数', value: String(count) },
    { key: 'spacing', symbol: '\\Delta s', label: '板の間隔', value: (2 / count).toFixed(3) },
  ]} />} />
}
