import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import { PlayPauseButton, ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import useSimLoop from '../../visualization/useSimLoop'
import { drawAxes, makeView } from '../../visualization/axes'
import { arrowStep, clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { interfaceGradientStats, marchingSquares, reinitStep, signedDistanceSlottedDisk } from '../../../utils/vis/isosurface'
import { advectSemiLagrangian2D } from '../../../utils/vis/grid'
import { clipToFrame } from './isosurfaceKit'
import { blitPixels } from './pixelKit'

const N = 96
const DX = 1 / N
const OMEGA = 2 * Math.PI / 6
const INITIAL_DISK = { cx: 0.5, cy: 0.72, r: 0.15, slotWidth: 0.05, slotTop: 0.82 }

function exactDistance(disk) {
  const phi = new Float64Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) phi[i + N * j] = signedDistanceSlottedDisk((i + 0.5) * DX, (j + 0.5) * DX, disk)
  return phi
}

function velocity() {
  const u = new Float64Array(N * N)
  const v = new Float64Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * DX
    const y = (j + 0.5) * DX
    u[i + N * j] = -OMEGA * (y - 0.5)
    v[i + N * j] = OMEGA * (x - 0.5)
  }
  return { u, v }
}

const VELOCITY = velocity()

export default function IsosurfaceStep9() {
  const [autoReinit, setAutoReinit] = useState(false)
  const [revision, setRevision] = useState(0)
  // 重い初期値は最初の 1 回だけ作る(useRef(式) は描き直しのたびに式を評価する)
  const phiRef = useRef(null)
  if (phiRef.current === null) phiRef.current = exactDistance(INITIAL_DISK)
  const scratchRef = useRef(null)
  if (scratchRef.current === null) scratchRef.current = new Float64Array(N * N)
  const pixelsRef = useRef(null) // 距離の濃淡の画素(RGBA)。毎フレーム作り直さない
  if (pixelsRef.current === null) pixelsRef.current = new Uint8ClampedArray(N * N * 4)
  const diskRef = useRef({ ...INITIAL_DISK })
  const selectedRef = useRef(false)
  const legendRef = useRef(null)

  const viewFor = (width, height) => makeView({ width, height, xRange: [0, 1], yRange: [0, 1], margin: { left: 42, right: 22, top: 18, bottom: 34 }, equal: true })
  const draw = ({ ctx, width, height, colors }) => {
    const view = viewFor(width, height)
    const phi = phiRef.current
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    clipToFrame(ctx, view, () => {
      // 正方形の領域全体を、距離の値で塗る: 内側(φ < 0)は lane-1 へ、外側は表面から離れるほど muted へ
      const pixels = pixelsRef.current
      const near = colors.rgb.surface
      const inside = colors.rgb['lane-1']
      const far = colors.rgb.muted
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const value = phi[px + N * (N - 1 - py)]
        const offset = 4 * (px + N * py)
        const [target, t] = value < 0 ? [inside, 0.35 + 0.65 * clamp(-value / 0.15, 0, 1)] : [far, 0.5 * clamp(value / 0.5, 0, 1)]
        for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round(near[channel] * (1 - t) + target[channel] * t)
        pixels[offset + 3] = 255
      }
      blitPixels(ctx, pixels, N, N, view.sx(0), view.sy(1), view.sx(1) - view.sx(0), view.sy(0) - view.sy(1))
      // 距離の等しい線(φ = −0.06, 0.06, 0.12, 0.2, 0.3)。距離の場なら、表面と平行に等間隔に並ぶ。
      // 背景は muted へ混ざり、内側は lane-1 に近づくので、muted の線は沈む(ダークの内側で 1.4:1)。ink の細い線にする
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const level of [-0.06, 0.06, 0.12, 0.2, 0.3]) {
        marchingSquares(phi, N, N, level).segments.forEach(([a, b]) => {
          ctx.moveTo(view.sx((a[0] + 0.5) * DX), view.sy((a[1] + 0.5) * DX))
          ctx.lineTo(view.sx((b[0] + 0.5) * DX), view.sy((b[1] + 0.5) * DX))
        })
      }
      ctx.stroke()
      const contour = marchingSquares(phi, N, N, 0)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      contour.segments.forEach(([a, b]) => {
        ctx.moveTo(view.sx((a[0] + 0.5) * DX), view.sy((a[1] + 0.5) * DX))
        ctx.lineTo(view.sx((b[0] + 0.5) * DX), view.sy((b[1] + 0.5) * DX))
      })
      ctx.stroke()
      markerCircle(ctx, view.sx(diskRef.current.cx), view.sy(diskRef.current.cy), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: selectedRef.current ? 3 : 1.5 })
    })
    const stats = interfaceGradientStats(phi, N, DX, 2.5 * DX)
    legendRef.current?.update({ mean: Number.isFinite(stats.mean) ? stats.mean.toFixed(3) : '—', deviation: Number.isFinite(stats.deviation) ? stats.deviation.toFixed(3) : '—', position: `(${diskRef.current.cx.toFixed(2)}, ${diskRef.current.cy.toFixed(2)})` })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const reinitialize = (iterations) => {
    const phi0 = Float64Array.from(phiRef.current)
    for (let iteration = 0; iteration < iterations; iteration++) {
      reinitStep(phiRef.current, phi0, N, DX, 0.5 * DX, scratchRef.current)
      const previous = phiRef.current
      phiRef.current = scratchRef.current
      scratchRef.current = previous
    }
    setRevision((value) => value + 1)
  }
  const loop = useSimLoop((dt) => {
    const step = Math.min(dt, 0.035)
    const current = phiRef.current
    advectSemiLagrangian2D(current, VELOCITY.u, VELOCITY.v, N, DX, step, scratchRef.current)
    phiRef.current = scratchRef.current
    scratchRef.current = current
    const disk = diskRef.current
    const a = OMEGA * step
    const x = disk.cx - 0.5
    const y = disk.cy - 0.5
    disk.cx = 0.5 + Math.cos(a) * x - Math.sin(a) * y
    disk.cy = 0.5 + Math.sin(a) * x + Math.cos(a) * y
    if (autoReinit) {
      const phi0 = Float64Array.from(phiRef.current)
      for (let iteration = 0; iteration < 2; iteration++) {
        reinitStep(phiRef.current, phi0, N, DX, 0.5 * DX, scratchRef.current)
        const previous = phiRef.current
        phiRef.current = scratchRef.current
        scratchRef.current = previous
      }
    }
    redraw()
  }, { targetRef: canvasRef, autoStart: false })
  useEffect(() => { redraw() }, [autoReinit, revision, redraw])

  const resetAt = (cx, cy) => {
    const disk = { ...INITIAL_DISK, cx, cy, slotTop: cy + 0.1 }
    diskRef.current = disk
    phiRef.current = exactDistance(disk)
    setRevision((value) => value + 1)
  }
  const hit = (point) => {
    if (loop.running) return false
    const view = viewFor(sizeRef.current.width, sizeRef.current.height)
    return Math.hypot(point.x - view.sx(diskRef.current.cx), point.y - view.sy(diskRef.current.cy)) <= 22
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (point) => {
      if (!hit(point)) return false
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも動かせるように
      selectedRef.current = true
      redraw()
      return true
    },
    onMove: ({ x, y }) => {
      const view = viewFor(sizeRef.current.width, sizeRef.current.height)
      resetAt(clamp(view.wx(x), 0.18, 0.82), clamp(view.wy(y), 0.18, 0.82))
    },
    onUp: () => { selectedRef.current = false; redraw() },
  })
  const onKeyDown = (event) => {
    if (loop.running) return
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    resetAt(clamp(diskRef.current.cx + step.dx * 0.02, 0.18, 0.82), clamp(diskRef.current.cy + step.dy * 0.02, 0.18, 0.82))
  }
  const reset = () => {
    loop.pause()
    setAutoReinit(false)
    diskRef.current = { ...INITIAL_DISK }
    phiRef.current = exactDistance(INITIAL_DISK)
    scratchRef.current = new Float64Array(N * N)
    setRevision((value) => value + 1)
  }
  return (
    <SimShell
      label="回転流で運ぶレベルセット"
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="切れ込みのある円板の符号付き距離（濃淡）と、ゼロ等値線、距離の等しい線の絵。停止中は、円板の中心の丸をドラッグするか矢印キーで動かせます（Shift で大きく）。再生中は動かせません。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'field', symbol: '\\phi', label: '符号付き距離', value: '内 − / 外 ＋', swatch: 'linear-gradient(90deg, var(--lane-1), var(--color-surface), var(--color-muted))' },
        { key: 'contour', symbol: '\\phi=0', label: '表面', swatch: 'var(--color-ink)' },
        { key: 'levels', label: '距離の等しい線（−0.06・0.06・0.12・0.2・0.3）', swatch: 'linear-gradient(var(--color-ink), var(--color-ink)) center / 100% 1px no-repeat' },
        { key: 'mean', symbol: '|\\nabla\\phi|', label: '表面近くの平均', value: '1.000', minChars: 7 },
        { key: 'deviation', label: '1 からの平均ずれ', value: '0.000', minChars: 7 },
        { key: 'position', label: '円板の中心', value: '(0.50, 0.72)', minChars: 14 },
      ]} />}
      controls={<SimToolbar>
        <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
        <ResetButton onClick={reset} />
        <ToggleButton pressed={autoReinit} onChange={setAutoReinit}>毎回直す</ToggleButton>
        <button type="button" className="vis-btn" onClick={() => reinitialize(20)}>
          <span>距離に直す（再初期化）</span>
        </button>
      </SimToolbar>}
    />
  )
}
