import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useSimLoop from '../useSimLoop'
import { rampColor, unit, fmt } from './fluidKit.js'
import { createPatch, layoutLattice, settle, advancePatch, strongestPartner, pairForce, forceSum, BASE } from './fluidPatch.js'
import { WORLD_WIDE, viewFor, drawBoard, drawParticles, drawProbe, drawVector, drawScaleArrow } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'

// 段階 4「圧力の力」: 少数の粒子を詰めた塊。圧力が高い粒子は、近くの粒子から押されて離れていく。
// 矢印は粒子が受ける力の合計(圧力だけ。粘性はこの段階では 0)。選んだ粒子と、それを一番強く押している粒子には、
// その 2 つだけの組の力も描く(向きが逆で大きさが同じ)。「再生」で手を離すと、塊が広がって圧力が下がり、力が消えていく。
// 計算は fluidPatch.js(utils/vis/sph.js の computeForces)。
const COLS = 5
const ROWS = 4
const P_FULL = 30000
const PER_N = 0.06 / 300 // 矢印の長さ [m/N]。300 N が 0.06 m(h より少し長い)
const SPACING = 0.016
const viewOf = (w, h) => viewFor(WORLD_WIDE, w, h)

export default function FluidStep4() {
  const [spacing, setSpacing] = useState(SPACING)
  const [k, setK] = useState(BASE.k)
  const patchRef = useRef(null)
  if (patchRef.current === null) {
    patchRef.current = createPatch({ cols: COLS, rows: ROWS, spacing: SPACING, ...WORLD_WIDE, params: { mu: 0 } })
    patchRef.current.selected = 2 // 下の辺の真ん中の粒子(外側の粒子は、外向きに押される)
  }
  const legend = useRef(null)
  const live = useRef(null)
  const running = useRef(false)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const { state } = patch
    const view = viewOf(width, height)
    drawBoard(ctx, view, colors, { width, height })
    drawParticles(ctx, view, colors, patch, (i) => rampColor(colors, unit(state.pressure[i], 0, P_FULL)))
    drawProbe(ctx, view, colors, patch)
    const { pos, force } = state
    // 全粒子の合力
    for (let i = 0; i < patch.n; i++) {
      drawVector(ctx, view, colors, pos[2 * i], pos[2 * i + 1], force[2 * i], force[2 * i + 1], PER_N, { color: colors.ink, width: 1.75 })
    }
    // 選んだ粒子 i と、i を一番強く押している粒子 j の、その 2 つだけの組の力
    const i = patch.selected
    const partner = strongestPartner(patch, i, 'pressure')
    const j = partner ? partner.j : -1
    const amber = colors.alpha('lane-3', 1)
    let fij = [0, 0]
    if (j >= 0) {
      fij = partner.f
      const fji = pairForce(patch, j, i, 'pressure')
      drawVector(ctx, view, colors, pos[2 * i], pos[2 * i + 1], fij[0], fij[1], PER_N, { color: amber, width: 3, head: 10 })
      drawVector(ctx, view, colors, pos[2 * j], pos[2 * j + 1], fji[0], fji[1], PER_N, { color: amber, width: 3, head: 10 })
    }
    drawScaleArrow(ctx, view, colors, 200, PER_N, 'N')
    const [sx, sy] = forceSum(patch)
    const fx = force[2 * i]
    const fy = force[2 * i + 1]
    legend.current?.update({
      t: `${patch.time.toFixed(2)} s`,
      F: `${fmt(Math.hypot(fx, fy), 0)} N`,
      pair: j >= 0 ? `${fmt(Math.hypot(fij[0], fij[1]), 0)} N（向きは逆）` : '–',
      sum: `${fmt(Math.hypot(sx, sy), 3)} N`,
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
      redraw()
    },
    { targetRef: canvasRef, autoStart: false },
  )
  running.current = loop.running

  useEffect(() => {
    patchRef.current.params.k = k
    if (!running.current) settle(patchRef.current)
    redraw()
  }, [k, redraw])

  function relayout(nextSpacing) {
    const patch = patchRef.current
    layoutLattice(patch, nextSpacing)
    redraw()
  }
  useEffect(() => {
    relayout(spacing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacing])
  function reset() {
    loop.pause()
    setSpacing(SPACING)
    relayout(SPACING)
  }

  const legendItems = [
    { key: 't', symbol: 't', label: '時刻', value: '', minChars: 7 },
    { key: 'F', symbol: '\\mathbf{F}_i', label: '選んだ粒子の合力の大きさ', value: '', minChars: 7 },
    { key: 'pair', label: '一番強く押す粒子との組の力', value: '', minChars: 14 },
    { key: 'sum', label: '全粒子の力の合計', value: '', minChars: 8 },
    { label: '矢印', value: '黒＝合力、橙＝選んだ組の力' },
  ]

  return (
    <SimShell
      label="圧力の力のシミュレーション"
      aspect={1.3}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="狭い間隔で並べた少数の粒子。粒子が圧力から受ける力を矢印で示す。粒子をつかんで動かせる。再生すると粒子が離れていく。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
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
          <ParamSlider symbol="s" label="粒子の間隔" unit="m" value={spacing} min={0.012} max={0.019} step={0.001} onChange={setSpacing} format={(v) => v.toFixed(3)} />
          <ParamSlider symbol="k" label="圧力の係数" unit="m²/s²" value={k} min={40} max={150} step={5} onChange={setK} />
        </>
      }
    />
  )
}
