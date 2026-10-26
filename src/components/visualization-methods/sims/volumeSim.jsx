import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { clamp } from '../../visualization/sims/rigidKit'
import { castRay, pixelJitter, transferFunction } from '../../../utils/vis/volume'
import { blitPixels } from './pixelKit'
import TransferFunctionEditor from './TransferFunctionEditor'
import { cameraRay, cloneTfPoints, colorRamp, orbitCamera, PHANTOM_VOLUME, TF_PRESETS, valueRamp, VOXEL_DS, VOLUME_N } from './volumeKit'

const MODE_OPTIONS = [
  { value: 'composite', label: '合成' },
  { value: 'mip', label: '最大値' },
  { value: 'iso', label: '等値面' },
]

export default function VolumeSim() {
  const [mode, setMode] = useState('composite')
  const [points, setPoints] = useState(() => cloneTfPoints(TF_PRESETS['中身']))
  const [preset, setPreset] = useState('中身')
  const [dsVoxels, setDsVoxels] = useState(1)
  const [early, setEarly] = useState(true)
  const [isoValue, setIsoValue] = useState(0.72)
  const [angles, setAngles] = useState({ yaw: -0.55, pitch: 0.18 })
  const [dragging, setDragging] = useState(false)
  const stateRef = useRef({ mode, points, dsVoxels, early, isoValue, angles, dragging })
  stateRef.current = { mode, points, dsVoxels, early, isoValue, angles, dragging }
  const legendRef = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const resolution = state.dragging ? 80 : 160
    const image = ctx.createImageData(resolution, resolution)
    const camera = orbitCamera(state.angles.yaw, state.angles.pitch)
    const tfLut = Array.from({ length: 256 }, (_, i) => transferFunction(state.points, i / 255))
    const colorLut = Array.from({ length: 256 }, (_, i) => colorRamp(colors, i / 255))
    const tf = (value) => tfLut[Math.max(0, Math.min(255, Math.round(value * 255)))]
    const colorOf = (value) => colorLut[Math.max(0, Math.min(255, Math.round(value * 255)))]
    let steps = 0
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
      const ray = cameraRay(camera, x, y, resolution, resolution)
      const result = castRay(PHANTOM_VOLUME, VOLUME_N, ray.origin, ray.dir, {
        mode: state.mode,
        jitter: pixelJitter(x, y),
        ds: state.dsVoxels * VOXEL_DS,
        ds0: VOXEL_DS,
        stopAt: state.early ? 0.98 : 1,
        tf,
        colorOf,
        isoValue: state.isoValue,
        light: [-0.4, 0.55, 0.72],
      })
      steps += result.steps
      const color = state.mode === 'mip'
        ? valueRamp(colors, result.value)
        : state.mode === 'iso' ? colorRamp(colors, state.isoValue).map((v) => v * result.color[0]) : result.color
      const offset = (y * resolution + x) * 4
      const alpha = state.mode === 'composite' ? result.alpha : result.alpha
      for (let c = 0; c < 3; c++) image.data[offset + c] = Math.round(255 * (color[c] + (colors.rgb.surface[c] / 255) * (1 - alpha)))
      image.data[offset + 3] = 255
    }
    const side = Math.min(width, height) - 12
    blitPixels(ctx, image, resolution, resolution, (width - side) / 2, (height - side) / 2, side, side)
    const ax = 25
    const ay = height - 24
    const axes = [
      { label: 'x', dx: camera.right[0] * 16, dy: -camera.up[0] * 16, color: colors.ink },
      { label: 'y', dx: camera.right[1] * 16, dy: -camera.up[1] * 16, color: colors.muted },
      { label: 'z', dx: camera.right[2] * 16, dy: -camera.up[2] * 16, color: colors.rgb['lane-1'] ? colors.alpha('lane-1', 1) : colors.ink },
    ]
    ctx.font = '11px sans-serif'
    axes.forEach(({ label, dx, dy, color }) => {
      ctx.strokeStyle = color
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dx, ay + dy); ctx.stroke()
      ctx.fillStyle = color; ctx.fillText(label, ax + dx + 2, ay + dy)
    })
    legendRef.current?.update({
      samples: (steps / (resolution * resolution)).toFixed(1),
      resolution: `${resolution} × ${resolution}`,
    })
  }
  const { canvasRef, redraw } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [mode, points, dsVoxels, early, isoValue, angles, dragging])
  usePointerDrag(canvasRef, {
    canGrab: () => true,
    onDown: () => { setDragging(true); return true },
    onMove: ({ dx, dy }) => setAngles((value) => ({ yaw: value.yaw - dx * 0.009, pitch: clamp(value.pitch + dy * 0.009, -1.25, 1.25) })),
    onUp: () => setDragging(false),
  })
  const onKeyDown = (event) => {
    const amount = event.shiftKey ? 0.16 : 0.05
    if (!event.key.startsWith('Arrow')) return
    event.preventDefault()
    setAngles((value) => ({
      yaw: value.yaw + (event.key === 'ArrowLeft' ? amount : event.key === 'ArrowRight' ? -amount : 0),
      pitch: clamp(value.pitch + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0), -1.25, 1.25),
    }))
  }
  const choosePreset = (name) => { setPreset(name); setPoints(cloneTfPoints(TF_PRESETS[name])) }
  const controls = mode === 'composite' ? <>
    <ControlGroup label="伝達関数">
      <TransferFunctionEditor points={points} onChange={(next) => { setPreset(''); setPoints(next) }} />
      <ModeSwitch label="プリセット" value={preset} options={Object.keys(TF_PRESETS).map((label) => ({ value: label, label }))} onChange={choosePreset} variant="quiet" />
    </ControlGroup>
    <ParamSlider symbol="\Delta s" label="標本間隔" value={dsVoxels} min={0.25} max={2} step={0.25} unit=" voxel" onChange={setDsVoxels} />
    <SimToolbar><ToggleButton pressed={early} onChange={setEarly}>早めに打ち切る</ToggleButton></SimToolbar>
  </> : mode === 'iso' ? <>
    <ParamSlider symbol="\Delta s" label="標本間隔" value={dsVoxels} min={0.25} max={2} step={0.25} unit=" voxel" onChange={setDsVoxels} />
    <ParamSlider symbol="T" label="等値面の値" value={isoValue} min={0.05} max={1} step={0.01} onChange={setIsoValue} />
  </> : <ParamSlider symbol="\Delta s" label="標本間隔" value={dsVoxels} min={0.25} max={2} step={0.25} unit=" voxel" onChange={setDsVoxels} />

  return <SimShell
    label="頭部ファントムのボリュームレンダリング"
    stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="頭部ファントム。ドラッグまたは矢印キーで視点を回転" />}
    switcher={<ModeSwitch label="描画方法" value={mode} options={MODE_OPTIONS} onChange={setMode} variant="tabs" />}
    controls={controls}
    legend={<SimLegend ref={legendRef} items={[
      { key: 'ramp', label: '値の色', swatch: 'linear-gradient(90deg, var(--lane-0), var(--lane-1), var(--lane-3))' },
      { key: 'ds', symbol: '\\Delta s', label: '標本間隔', value: `${dsVoxels.toFixed(2)} voxel` },
      { key: 'samples', label: '平均標本数', value: '—' },
      { key: 'early', label: '早期打切り', value: early ? 'オン' : 'オフ' },
      { key: 'resolution', label: '内部解像度', value: dragging ? '80 × 80' : '160 × 160' },
    ]} />}
  />
}
