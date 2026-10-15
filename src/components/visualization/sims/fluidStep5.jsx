import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useSimLoop from '../useSimLoop'
import { rampColor, unit, fmt, splitPanels, drawSeries } from './fluidKit.js'
import { createPatch, layoutLattice, settle, advancePatch, setShear, layerMeans, summedPairForce, BASE } from './fluidPatch.js'
import { viewFor, drawBoard, drawParticles, drawProbe, drawVector, drawScaleArrow } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'

// 段階 5「粘性の力」: 上の層は右へ、下の層は左へ動く粒子の塊。速さの違う粒子が隣り合うと、粘性の力で速さが近づき、
// 層のずれがなだらかになる(黒い矢印は粒子の速度、橙の矢印は選んだ粒子が受ける粘性の力)。右のグラフは上下の層の平均の速度。
// μ を 0 にすると、層はそのまま滑り続ける。粒子をつかんで動かすと、まわりの粒子が引きずられる。
// 計算は fluidPatch.js(utils/vis/sph.js の computeForces・sphStep)。
const WORLD5 = { width: 0.5, height: 0.22 }
const COLS = 12
const ROWS = 8
const V0 = 0.3 // 初めの速さの大きさ [m/s]
const SPEED_FULL = 0.4 // 色が最後の段になる速さ [m/s]
const PER_V = 0.05 / 0.3 // 速度の矢印の長さ [m/(m/s)]。0.3 m/s が 0.05 m
const PER_F = 0.012 // 力の矢印の長さ [m/N]
const WINDOW = 1.5 // グラフが見せる時間 [s]
const MAX_POINTS = 900
const STACK = { stack: true } // 幅が足りないときは、グラフを絵の下に置く
const HEIGHT = { pc: [280, 360], phone: [400, 480] } // スマホは上下に並べるので高くする
const viewOf = (w, h) => {
  const { main } = splitPanels(w, h, STACK)
  return viewFor(WORLD5, main.width, main.height)
}

export default function FluidStep5() {
  const [mu, setMu] = useState(BASE.mu)
  const patchRef = useRef(null)
  if (patchRef.current === null) {
    patchRef.current = createPatch({ cols: COLS, rows: ROWS, ...WORLD5 })
    setShear(patchRef.current, V0)
  }
  const history = useRef({ t: [], up: [], lo: [] })
  const legend = useRef(null)
  const live = useRef(null)
  const running = useRef(false)

  const record = () => {
    const patch = patchRef.current
    const h = history.current
    const m = layerMeans(patch)
    h.t.push(patch.time)
    h.up.push(m.upper)
    h.lo.push(m.lower)
    if (h.t.length > MAX_POINTS) for (const key of ['t', 'up', 'lo']) h[key].splice(0, h[key].length - MAX_POINTS)
  }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const { state } = patch
    const { main, side } = splitPanels(width, height, STACK)
    const view = viewFor(WORLD5, main.width, main.height)
    drawBoard(ctx, view, colors, { width, height })
    const { pos, vel } = state
    drawParticles(ctx, view, colors, patch, (i) => rampColor(colors, unit(Math.hypot(vel[2 * i], vel[2 * i + 1]), 0, SPEED_FULL)))
    drawProbe(ctx, view, colors, patch)
    for (let i = 0; i < patch.n; i++) {
      drawVector(ctx, view, colors, pos[2 * i], pos[2 * i + 1], vel[2 * i], vel[2 * i + 1], PER_V, { color: colors.alpha('ink', 0.85), width: 1.25, head: 5 })
    }
    const i = patch.selected
    const [fx, fy] = summedPairForce(patch, i, 'viscosity')
    drawVector(ctx, view, colors, pos[2 * i], pos[2 * i + 1], fx, fy, PER_F, { color: colors.alpha('lane-3', 1), width: 3, head: 10 })
    drawScaleArrow(ctx, view, colors, 4, PER_F, 'N', { color: colors.alpha('lane-3', 1) })

    const m = layerMeans(patch)
    if (side) {
      const h = history.current
      const t1 = Math.max(WINDOW, patch.time)
      const t0 = t1 - WINDOW
      ctx.fillStyle = colors.surface
      ctx.fillRect(side.left, side.top, side.width, side.height)
      drawSeries(ctx, side, colors, {
        xRange: [t0, t1],
        yRange: [-0.5, 0.5],
        xLabel: 't [s]',
        yLabel: '平均の vx [m/s]',
        curves: [
          { pts: h.t.map((t, q) => [t, h.up[q]]), color: colors.alpha('lane-1', 1), width: 2.5 },
          { pts: h.t.map((t, q) => [t, h.lo[q]]), color: colors.alpha('lane-3', 1), width: 2.5 },
        ],
        hlines: [{ y: 0, color: colors.muted, dash: [4, 4] }],
      })
    }
    legend.current?.update({
      t: `${patch.time.toFixed(2)} s`,
      upper: `${fmt(m.upper, 3)} m/s`,
      lower: `${fmt(m.lower, 3)} m/s`,
      diff: `${fmt(m.upper - m.lower, 3)} m/s`,
      F: `${fmt(Math.hypot(fx, fy), 1)} N`,
    })
  }, [])

  const afterMove = () => {
    if (!running.current) settle(patchRef.current)
    redraw()
  }
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const { canvasRef, redraw, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved: afterMove, announce })

  const loop = useSimLoop(
    (dt) => {
      advancePatch(patchRef.current, dt)
      record()
      redraw()
    },
    { targetRef: canvasRef },
  )
  running.current = loop.running

  useEffect(() => {
    patchRef.current.params.mu = mu
    if (!running.current) settle(patchRef.current)
    redraw()
  }, [mu, redraw])

  function reset() {
    const patch = patchRef.current
    layoutLattice(patch, patch.spacing)
    setShear(patch, V0)
    history.current = { t: [], up: [], lo: [] }
    record()
    redraw()
    loop.play()
  }
  // 初めの 1 点(t = 0)
  useEffect(() => {
    record()
    redraw()
  }, [redraw])

  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: '', minChars: 7 },
    { key: 'upper', label: '上の層の平均の速さ（右向き＋）', value: '', minChars: 10 },
    { key: 'lower', label: '下の層', value: '', minChars: 10 },
    { key: 'diff', label: '層の速さの差', value: '', minChars: 9 },
    { key: 'F', symbol: '\\mathbf{F}^{\\mathrm{visc}}_i', label: '選んだ粒子の粘性の力', value: '', minChars: 7 },
  ]

  return (
    <SimShell
      label="粘性の力のシミュレーション"
      aspect={1.6}
      height={HEIGHT}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="上の層は右へ、下の層は左へ動く粒子の塊。粘性の力で、層の速さが近づく。粒子をつかんで動かすと、まわりの粒子が引きずられる。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={legendItems} />
          <span className="sr-only" aria-live="polite" ref={live} />
        </>
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="\mu" label="粘性" unit="kg/s" value={mu} min={0} max={30} step={1} onChange={setMu} />
        </>
      }
    />
  )
}
