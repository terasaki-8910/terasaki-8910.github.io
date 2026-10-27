import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp } from '../../visualization/sims/rigidKit'
import { castRay, pixelJitter, transferFunction } from '../../../utils/vis/volume'
import { blitPixels } from './pixelKit'
import TransferFunctionEditor from './TransferFunctionEditor'
import { cameraRay, cloneTfPoints, colorRamp, cssRgb, graySwatch, orbitCamera, PHANTOM_VOLUME, TF_PRESETS, useThemeColors, valueRamp, VOXEL_DS, VOLUME_N } from './volumeKit'

const MODE_OPTIONS = [
  { value: 'composite', label: '合成' },
  { value: 'mip', label: '最大値' },
  { value: 'iso', label: '等値面' },
]
const KEY_STEP = 0.05 // 矢印キー 1 回の視点の回転(rad。Shift で 5 倍)
const KEY_IDLE_MS = 220 // キーを離してから、この時間がたつと全解像度に戻す

export default function VolumeSim() {
  const [mode, setMode] = useState('composite')
  const [points, setPoints] = useState(() => cloneTfPoints(TF_PRESETS['中身']))
  const [preset, setPreset] = useState('中身')
  const [dsVoxels, setDsVoxels] = useState(1)
  const [early, setEarly] = useState(true)
  const [isoValue, setIsoValue] = useState(0.72)
  const [angles, setAngles] = useState({ yaw: -0.55, pitch: 0.18 })
  const [dragging, setDragging] = useState(false)
  const [keying, setKeying] = useState(false) // キーを押し続けている間も、ドラッグと同じに粗い画像で描く
  const lowRes = dragging || keying
  const stateRef = useRef({ mode, points, dsVoxels, early, isoValue, angles, lowRes })
  stateRef.current = { mode, points, dsVoxels, early, isoValue, angles, lowRes }
  const legendRef = useRef(null)
  const keyTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(keyTimer.current), [])
  const theme = useThemeColors() // 凡例の色見本用(テーマを切り替えたら読み直す)

  const draw = ({ ctx, width, height, colors }) => {
    const state = stateRef.current
    ctx.save()
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const resolution = state.lowRes ? 80 : 160
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
    // 隅の x・y・z の印。線は軸ごとの色(意味のある図形なので muted・lane を使う)、文字は ink
    const ax = 25
    const ay = height - 24
    const axes = [
      { label: 'x', dx: camera.right[0] * 16, dy: -camera.up[0] * 16, color: colors.ink },
      { label: 'y', dx: camera.right[1] * 16, dy: -camera.up[1] * 16, color: colors.muted },
      { label: 'z', dx: camera.right[2] * 16, dy: -camera.up[2] * 16, color: colors.rgb['lane-1'] ? colors.alpha('lane-1', 1) : colors.ink },
    ]
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.lineWidth = 1
    axes.forEach(({ label, dx, dy, color }) => {
      ctx.strokeStyle = color
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dx, ay + dy); ctx.stroke()
      ctx.fillStyle = colors.ink; ctx.fillText(label, ax + dx + 2, ay + dy)
    })
    ctx.restore()
    legendRef.current?.update({
      samples: (steps / (resolution * resolution)).toFixed(1),
      resolution: `${resolution} × ${resolution}`,
    })
  }
  const { canvasRef, redraw } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() }, [mode, points, dsVoxels, early, isoValue, angles, lowRes])
  usePointerDrag(canvasRef, {
    canGrab: () => true,
    onDown: () => { setDragging(true); return true },
    onMove: ({ dx, dy }) => setAngles((value) => ({ yaw: value.yaw - dx * 0.009, pitch: clamp(value.pitch + dy * 0.009, -1.25, 1.25) })),
    onUp: () => setDragging(false),
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event) // Alt・Ctrl・Cmd つきは null(ブラウザの操作に残す)
    if (!step) return
    event.preventDefault()
    // ← が yaw を増やし、↓ が pitch を増やす(ドラッグで左・下へ動かしたときと同じ向き)
    setAngles((value) => ({
      yaw: value.yaw - step.dx * KEY_STEP,
      pitch: clamp(value.pitch - step.dy * KEY_STEP, -1.25, 1.25),
    }))
    // 押し続けている間は粗い画像(80 × 80)、止めて少したったら全解像度(160 × 160)
    setKeying(true)
    window.clearTimeout(keyTimer.current)
    keyTimer.current = window.setTimeout(() => setKeying(false), KEY_IDLE_MS)
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
  // 絵の色の見本は描き方で違う: 合成は値の色(青〜緑〜茶)、最大値は灰色の濃淡、等値面は T で決まる 1 色
  const rampItem = mode === 'mip'
    ? { key: 'ramp', label: '最大値の濃淡', swatch: graySwatch(theme.dark) }
    : mode === 'iso'
      ? { key: 'ramp', label: '等値面の色', swatch: cssRgb(colorRamp(theme, isoValue)) }
      : { key: 'ramp', label: '値の色', swatch: 'linear-gradient(90deg, var(--lane-0), var(--lane-1), var(--lane-3))' }

  return <SimShell
    label="頭部ファントムのボリュームレンダリング"
    stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="頭部の模型（ファントム）をボリュームレンダリングで描いた画像。隅に x・y・z の向きの印が付く。ドラッグまたは矢印キーで視点を回転する（Shift で 5 倍）" />}
    switcher={<ModeSwitch label="描画方法" value={mode} options={MODE_OPTIONS} onChange={setMode} variant="tabs" />}
    controls={controls}
    legend={<SimLegend ref={legendRef} items={[
      rampItem,
      { key: 'ds', symbol: '\\Delta s', label: '標本間隔', value: `${dsVoxels.toFixed(2)} voxel` },
      { key: 'samples', label: '平均標本数', value: '—' },
      { key: 'early', label: '早期打切り', value: early ? 'オン' : 'オフ' },
      { key: 'resolution', label: '内部解像度', value: lowRes ? '80 × 80' : '160 × 160' },
    ]} />}
  />
}
