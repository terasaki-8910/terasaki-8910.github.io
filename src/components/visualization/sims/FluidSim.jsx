import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import {
  TANKS,
  NARROW_QUERY,
  DEFAULTS,
  SPEED_FULL,
  DENSITY_LOW,
  DENSITY_HIGH,
  makeSim,
  resetSim,
  syncParams,
  advanceSim,
  readoutLines,
  pointerDown,
  pointerMove,
  pointerUp,
  pointerHover,
  drawFluid,
  FAST_COLOR,
} from './fluidCore.js'

// 節「流体(SPH)」のシミュレーション: 2 次元のダムの決壊。ドラッグで近くの粒子を押せる。
// 状態・計算の進め方・描画は fluidCore.js(React に依存しない)。ここは操作と canvas・ループをつなぐ。

function isNarrow() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(NARROW_QUERY).matches
}

export default function FluidSim() {
  const [g, setG] = useState(DEFAULTS.g) // 重力の大きさ [m/s²]
  const [k, setK] = useState(DEFAULTS.k) // 圧力の係数 [m²/s²]
  const [mu, setMu] = useState(DEFAULTS.mu) // 粘性 [kg/s]
  const [rho0, setRho0] = useState(DEFAULTS.rho0) // 休止密度 [kg/m²]
  const [colorMode, setColorMode] = useState('speed')
  const [showGrid, setShowGrid] = useState(false)
  const [narrow, setNarrow] = useState(isNarrow)

  const p = { g, k, mu, rho0, colorMode, showGrid }
  const paramsRef = useRef(p)
  paramsRef.current = p
  const tankKey = narrow ? 'narrow' : 'wide'
  const sim = useRef(null)
  if (sim.current === null) sim.current = makeSim(tankKey, p)
  const cacheRef = useRef({ colors: null, palette: [], gridLine: '', cell: '' })
  const line1 = useRef(null)
  const line2 = useRef(null)

  const writeReadout = useCallback(() => {
    const [a, b] = readoutLines(sim.current)
    if (line1.current) line1.current.textContent = a
    if (line2.current) line2.current.textContent = b
  }, [])

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawFluid(ctx, width, height, colors, sim.current, paramsRef.current, cacheRef.current)
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const s = sim.current
      syncParams(s, paramsRef.current)
      if (dt > 0) advanceSim(s, dt)
      s.acc += dt
      if (s.acc >= 0.25) {
        s.acc = 0
        writeReadout()
      }
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 画面の幅が 640px をまたいだら、水槽と粒子の数を替えて最初からやり直す
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY)
    if (!query) return undefined
    const onChange = (event) => setNarrow(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  useLayoutEffect(() => {
    if (sim.current.tankKey === tankKey) return
    sim.current = makeSim(tankKey, paramsRef.current)
    writeReadout()
    redraw()
  }, [tankKey, redraw, writeReadout])

  // 止まっているあいだも、表示にかかわる設定を変えたら描き直す
  useEffect(() => {
    redraw()
  }, [colorMode, showGrid, rho0, redraw])
  useEffect(() => {
    writeReadout()
  }, [writeReadout])

  // 止まっているときは、ポインタを動かしたら自分で描き直す(動いているときはループが描く)
  const repaint = () => {
    if (!loop.active) redraw()
  }

  usePointerDrag(canvasRef, {
    onDown: ({ x, y }) => {
      const { width, height } = sizeRef.current
      pointerDown(sim.current, x, y, width, height)
      canvasRef.current.style.cursor = 'grabbing'
      repaint()
    },
    onMove: ({ x, y, vx, vy }) => {
      const { width, height } = sizeRef.current
      pointerMove(sim.current, x, y, vx, vy, width, height)
      repaint()
    },
    onUp: ({ event }) => {
      pointerUp(sim.current, event.pointerType === 'mouse') // マウスは離したあとも、上にいる間は近傍を見せる
      canvasRef.current.style.cursor = 'grab'
      repaint()
    },
    onHover: ({ x, y }) => {
      const { width, height } = sizeRef.current
      pointerHover(sim.current, x, y, width, height)
      if (paramsRef.current.showGrid) repaint()
    },
  })

  // ポインタが canvas を出たら、近傍の表示を消す
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const onLeave = () => {
      sim.current.probe.on = false
      redraw()
    }
    canvas.addEventListener('pointerleave', onLeave)
    return () => canvas.removeEventListener('pointerleave', onLeave)
  }, [canvasRef, redraw])

  function reset() {
    resetSim(sim.current, paramsRef.current)
    writeReadout()
    redraw()
  }

  const speedMode = colorMode === 'speed'
  const tank = TANKS[tankKey]

  return (
    <SimShell
      label="粒子法の流体（SPH）：ダムの決壊"
      aspect={tank.width / tank.height}
      stage={
        <SimCanvas
          ref={canvasRef}
          style={{ cursor: 'grab' }}
          label="水を表す粒子の集まり。左に積んだ水の塊が崩れて、水槽の中を広がる。ドラッグすると近くの粒子を押せる"
        />
      }
      readout={
        <>
          <div ref={line1} />
          <div ref={line2} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px', marginTop: 4 }}>
            <span>色：{speedMode ? '速さ' : '密度 ρ/ρ0'}</span>
            <span>{speedMode ? '0' : DENSITY_LOW}</span>
            <span
              aria-hidden="true"
              style={{
                width: 96,
                height: 8,
                border: '1px solid var(--color-muted)',
                borderRadius: 2,
                background: `linear-gradient(to right, var(--color-ink), var(--${FAST_COLOR}))`,
              }}
            />
            <span>{speedMode ? `${SPEED_FULL} m/s 以上` : `${DENSITY_HIGH} 以上`}</span>
          </div>
        </>
      }
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ModeSwitch
              label="粒子の色"
              value={colorMode}
              onChange={setColorMode}
              options={[
                { value: 'speed', label: '速さ' },
                { value: 'density', label: '密度' },
              ]}
            />
            <ToggleButton pressed={showGrid} onChange={setShowGrid}>
              グリッド
            </ToggleButton>
          </SimToolbar>
          <ParamSlider symbol="g" label="重力" unit="m/s²" value={g} min={0} max={20} step={0.1} onChange={setG} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="k" label="圧力の係数" unit="m²/s²" value={k} min={40} max={150} step={5} onChange={setK} />
          <ParamSlider symbol="\mu" label="粘性" unit="kg/s" value={mu} min={5} max={30} step={1} onChange={setMu} />
          <ParamSlider symbol="\rho_0" label="休止密度" unit="kg/m²" value={rho0} min={900} max={1100} step={1} onChange={setRho0} />
        </>
      }
    />
  )
}
