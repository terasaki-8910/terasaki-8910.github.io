import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes, drawArrow } from '../axes'
import { divergence2D, fluidStep2D, reynolds, vorticity2D } from '../../../utils/vis/grid.js'
import { N, L, DX, DT, NU_MAX, NU_DEFAULT, ITERATIONS, createWorld, pushAt } from './nsWorld.js'

const TICKS = { step: 0.25, values: [0, 0.25, 0.5, 0.75, 1] }
const VORTICITY_SCALE = 8 // [s⁻¹]。巻き上がった渦(3 秒で最大 8 ほど)がはっきり見える尺度。初めのせん断層(最大 13.5)は色の端で止める
const viewOf = (width, height) => makeView({ width, height, xRange: [0, L], yRange: [0, L] })

export default function NsSim() {
  const [nu, setNu] = useState(NU_DEFAULT)
  const [strength, setStrength] = useState(0.2)
  const [mode, setMode] = useState('dye')
  const [advect, setAdvect] = useState(true)
  const [diffuse, setDiffuse] = useState(true)
  const [project, setProject] = useState(true)
  const [arrows, setArrows] = useState(true)
  const params = useRef(null)
  params.current = { nu, strength, mode, advect, diffuse, project, arrows }
  const world = useRef(null)
  if (!world.current) world.current = createWorld()
  const legend = useRef(null)
  const pointer = useRef(null)
  const raster = useRef(null)
  const diagnostic = useRef(new Float64Array(N * N))

  const writeLegend = useCallback(() => {
    const w = world.current
    let speed = 0,
      div = 0
    divergence2D(w.u, w.v, N, DX, diagnostic.current)
    for (let k = 0; k < N * N; k++) {
      speed = Math.max(speed, Math.hypot(w.u[k], w.v[k]))
      div = Math.max(div, Math.abs(diagnostic.current[k]))
    }
    const viscosity = params.current.nu
    legend.current?.update({
      t: `${w.time.toFixed(2)} s`,
      nu: `${viscosity.toFixed(4)} m²/s`,
      re: viscosity === 0 ? '∞' : reynolds(speed, L, viscosity).toFixed(0),
      div: `${div.toExponential(2)} s⁻¹`,
    })
  }, [])

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const w = world.current,
      p = params.current
    if (!raster.current) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = N
      const context = canvas.getContext('2d')
      raster.current = { canvas, context, image: context.createImageData(N, N), omega: new Float64Array(N * N) }
    }
    const r = raster.current
    const vorticity = p.mode === 'vorticity'
    if (vorticity) vorticity2D(w.u, w.v, N, DX, r.omega)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = i + N * j
        const value = vorticity ? r.omega[k] / VORTICITY_SCALE : w.dye[k]
        const amount = Math.min(1, Math.max(0, vorticity ? Math.abs(value) : value))
        const color = colors.rgb[vorticity && value < 0 ? 'diff-delete' : 'lane-1']
        const pixel = 4 * (i + N * (N - 1 - j))
        for (let c = 0; c < 3; c++) r.image.data[pixel + c] = colors.rgb.paper[c] + amount * (color[c] - colors.rgb.paper[c])
        r.image.data[pixel + 3] = 255
      }
    }
    r.context.putImageData(r.image, 0, 0)
    ctx.fillStyle = colors.paper
    ctx.fillRect(0, 0, width, height)
    const view = viewOf(width, height),
      { frame } = view
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(r.canvas, frame.left, frame.top, frame.width, frame.height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(frame.left, frame.top, frame.width, frame.height)
    ctx.clip()
    if (p.arrows) {
      for (let j = 2; j < N; j += 4) {
        for (let i = 2; i < N; i += 4) {
          const k = i + N * j,
            x = (i + 0.5) * DX,
            y = (j + 0.5) * DX
          const scale = Math.min(0.08, 0.045 / (Math.hypot(w.u[k], w.v[k]) || 1))
          drawArrow(ctx, view, x, y, x + scale * w.u[k], y + scale * w.v[k], { color: colors.ink, width: 1, head: 4 })
        }
      }
    }
    if (pointer.current) {
      const { x, y, fx, fy } = pointer.current
      const scale = 0.08 / Math.max(1, Math.hypot(fx, fy))
      drawArrow(ctx, view, x, y, x + scale * fx, y + scale * fy, { color: colors.ink, width: 3, head: 8 })
    }
    ctx.restore()
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]', xTicks: TICKS, yTicks: TICKS })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const loop = useSimLoop(
    (elapsed) => {
      const w = world.current
      w.acc += elapsed
      while (w.acc >= DT) {
        fluidStep2D(w, { ...params.current, dt: DT, iterations: ITERATIONS })
        w.time += DT
        w.acc -= DT
      }
      writeLegend()
      redraw()
    },
    { targetRef: canvasRef },
  )

  useEffect(() => {
    writeLegend()
    redraw()
  }, [nu, mode, arrows, writeLegend, redraw])

  const local = ({ x, y }) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    return { view, x: view.wx(x), y: view.wy(y) }
  }
  const inside = (p) => p.x >= 0 && p.x <= L && p.y >= 0 && p.y <= L
  usePointerDrag(canvasRef, {
    canGrab: (p) => inside(local(p)),
    onDown: (p) => {
      const q = local(p)
      if (!inside(q)) return false
      canvasRef.current?.focus({ preventScroll: true })
      pointer.current = { x: q.x, y: q.y, fx: 0, fy: 0 }
      redraw()
    },
    onMove: (p) => {
      const q = local(p)
      if (!inside(q)) {
        pointer.current = null
        redraw()
        return
      }
      const fx = p.vx / q.view.scaleX,
        fy = -p.vy / q.view.scaleY
      pointer.current = { x: q.x, y: q.y, fx, fy }
      pushAt(world.current, q.x, q.y, fx, fy, params.current.strength)
      writeLegend()
      redraw()
    },
    onUp: () => {
      pointer.current = null
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    pushAt(world.current, 0.5, 0.5, ...direction, strength * (event.shiftKey ? 4 : 1))
    writeLegend()
    redraw()
  }

  const legendItems = [
    { label: '軸', value: 'x・y（単位 m、目盛り 0.25 m）' },
    { key: 't', symbol: 't', label: '時刻', value: '0.00 s', minChars: 7 },
    { symbol: '\\Delta t', label: '時間刻み', value: '1/60 s' },
    { key: 'nu', symbol: '\\nu', label: '動粘性係数', value: '', minChars: 12 },
    { key: 're', symbol: '\\mathrm{Re}', label: 'U·L/ν（U は最大速度、L = 1 m）', value: '', minChars: 5 },
    { key: 'div', label: '発散の最大 |∇·u|', value: '', minChars: 13 },
    { label: '外力', value: 'ドラッグした所だけ（重力なし）' },
    { label: '境界', value: '端は反対側とつながる（周期境界）' },
    {
      key: 'color',
      label: mode === 'dye' ? '染料' : '渦度',
      value: mode === 'dye' ? '0 → 1' : `−${VORTICITY_SCALE}（時計回り）→ 0 → +${VORTICITY_SCALE}（反時計回り）s⁻¹`,
      swatch:
        mode === 'dye'
          ? 'linear-gradient(to right, var(--color-paper), var(--lane-1))'
          : 'linear-gradient(to right, var(--diff-delete), var(--color-paper), var(--lane-1))',
    },
  ]
  return (
    <SimShell
      label="ナビエ・ストークス方程式：二重せん断層"
      aspect={1}
      switcher={
        <ModeSwitch
          variant="tabs"
          label="流れの色"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dye', label: '染料' },
            { value: 'vorticity', label: '渦度' },
          ]}
        />
      }
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="1 m 四方の周期境界の流れ。色は染料または渦度、矢印は速度。ドラッグで流れを押せる。矢印キーで中央をその向きに押し、Shift を押しながらだと強く押せる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton
              onClick={() => {
                world.current = createWorld()
                pointer.current = null
                writeLegend()
                redraw()
              }}
            />
          </SimToolbar>
          <ParamSlider
            symbol="\nu"
            label="動粘性係数"
            unit="m²/s"
            value={nu}
            min={0}
            max={NU_MAX}
            step={0.0001}
            onChange={setNu}
            format={(v) => v.toFixed(4)}
          />
          <ParamSlider label="押す強さ" value={strength} min={0} max={1} step={0.05} onChange={setStrength} format={(v) => v.toFixed(2)} />
          <ControlGroup label="項を切ってみる">
            <SimToolbar label="式の項">
              <ToggleButton pressed={advect} onChange={setAdvect}>
                移流
              </ToggleButton>
              <ToggleButton pressed={diffuse} onChange={setDiffuse}>
                粘性
              </ToggleButton>
              <ToggleButton pressed={project} onChange={setProject}>
                圧力
              </ToggleButton>
            </SimToolbar>
          </ControlGroup>
          <SimToolbar label="速度の表示">
            <ToggleButton pressed={arrows} onChange={setArrows}>
              速度の矢印
            </ToggleButton>
          </SimToolbar>
        </>
      }
    />
  )
}
