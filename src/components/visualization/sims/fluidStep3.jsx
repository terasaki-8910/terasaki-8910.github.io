import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton } from '../SimButtons'
import { rampColor, unit, fmt, splitPanels, drawSeries } from './fluidKit.js'
import { createPatch, layoutLattice, settle, densityParts, BASE } from './fluidPatch.js'
import { WORLD, viewFor, drawBoard, drawParticles, drawProbe } from './fluidPatchDraw.js'
import useParticleBoard from './fluidBoard.js'

// 段階 3「圧力（状態方程式）」: 粒子を詰める(間隔のスライダーか、粒子をつかんで近づける)と密度が上がり、
// 密度が休止密度 ρ0 を超えたぶんに比例して圧力 p = k(ρ − ρ0) が正になる(色は圧力)。広い画面では、右に p–ρ のグラフ。
// 計算は fluidPatch.js(utils/vis/sph.js の computePressure)。
const P_FULL = 30000 // 色が最後の段になる圧力 [N/m]
const SPACING = 0.018 // 初めの粒子の間隔 [m](休止の 0.02 より少し詰めてあり、内側ほど圧力が高い)
const RHO_RANGE = [400, 2000]
const P_RANGE = [0, 120] // kN/m
const STACK = { stack: true } // 幅が足りないときは、グラフを絵の下に置く
const HEIGHT = { pc: [280, 360], phone: [400, 480] } // スマホは上下に並べるので高くする
const viewOf = (w, h) => {
  const { main } = splitPanels(w, h, STACK)
  return viewFor(WORLD, main.width, main.height)
}

export default function FluidStep3() {
  const [spacing, setSpacing] = useState(SPACING)
  const [k, setK] = useState(BASE.k)
  const [rho0, setRho0] = useState(Math.round(BASE.rho0))
  const patchRef = useRef(null)
  if (patchRef.current === null) patchRef.current = createPatch({ cols: 12, rows: 9, ...WORLD, spacing: SPACING })
  const legend = useRef(null)
  const live = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const patch = patchRef.current
    const { state, params } = patch
    const { main, side } = splitPanels(width, height, STACK)
    const view = viewFor(WORLD, main.width, main.height)
    drawBoard(ctx, view, colors, { width, height })
    drawParticles(ctx, view, colors, patch, (i) => rampColor(colors, unit(state.pressure[i], 0, P_FULL)))
    drawProbe(ctx, view, colors, patch)
    const i = patch.selected
    const { rho } = densityParts(patch, i)
    const p = state.pressure[i]
    let positive = 0
    for (let q = 0; q < patch.n; q++) if (state.pressure[q] > 0) positive++

    if (side) {
      const edge = [RHO_RANGE[0], 0]
      const knee = [params.rho0, 0]
      const end = [RHO_RANGE[1], (params.k * (RHO_RANGE[1] - params.rho0)) / 1000]
      const marks = []
      for (let q = 0; q < patch.n; q++) marks.push({ x: state.rho[q], y: state.pressure[q] / 1000, r: 2.5, color: colors.alpha('lane-1', 0.6) })
      marks.push({ x: rho, y: p / 1000, r: 6, color: colors.alpha('lane-3', 1) })
      ctx.fillStyle = colors.surface
      ctx.fillRect(side.left, side.top, side.width, side.height)
      drawSeries(ctx, side, colors, {
        xRange: RHO_RANGE,
        yRange: P_RANGE,
        xLabel: 'ρ [kg/m²]',
        yLabel: 'p [kN/m]',
        curves: [{ pts: [edge, knee, end], color: colors.ink, width: 2.5 }],
        vlines: [{ x: params.rho0, color: colors.muted, dash: [4, 4] }],
        marks,
      })
    }

    legend.current?.update({
      ratio: fmt(rho / params.rho0, 2),
      rho: fmt(rho, 0),
      p: `${fmt(p / 1000, 1)} kN/m`,
      positive: `${positive} / ${patch.n} 個`,
    })
  }, [])

  const afterMove = () => {
    settle(patchRef.current)
    redraw()
  }
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const { canvasRef, redraw, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved: afterMove, announce })

  useEffect(() => {
    const patch = patchRef.current
    patch.params.k = k
    patch.params.rho0 = rho0
    settle(patch)
    redraw()
  }, [k, rho0, redraw])
  useEffect(() => {
    layoutLattice(patchRef.current, spacing)
    redraw()
  }, [spacing, redraw])

  function reset() {
    setSpacing(SPACING)
    setK(BASE.k)
    setRho0(Math.round(BASE.rho0))
    const patch = patchRef.current
    patch.selected = Math.floor(patch.rows / 2) * patch.cols + Math.floor(patch.cols / 2)
    layoutLattice(patch, SPACING)
    redraw()
  }

  const legendItems = [
    { key: 'ratio', symbol: '\\rho/\\rho_0', label: '選んだ粒子の密度の比', value: '', minChars: 5 },
    { key: 'rho', symbol: '\\rho', label: '密度（kg/m²）', value: '', minChars: 5 },
    { key: 'p', symbol: 'p', label: '圧力', value: '', minChars: 10 },
    { key: 'positive', label: '圧力が正の粒子', value: '', minChars: 9 },
    { label: '粒子の色（圧力）', value: '0 → 30 kN/m 以上', swatch: 'linear-gradient(to right, var(--color-ink), var(--lane-1))' },
  ]

  return (
    <SimShell
      label="圧力のシミュレーション"
      aspect={1.3}
      height={HEIGHT}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="格子状に並んだ粒子。粒子の間隔を狭めたり、粒子をつかんで近づけたりすると密度が上がり、圧力が正になる。右のグラフは密度と圧力の関係。矢印キーで選んだ粒子を動かし、PageUp と PageDown で選ぶ粒子を変える"
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
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="s" label="粒子の間隔" unit="m" value={spacing} min={0.012} max={0.026} step={0.001} onChange={setSpacing} format={(v) => v.toFixed(3)} />
          <ParamSlider symbol="k" label="圧力の係数" unit="m²/s²" value={k} min={40} max={150} step={5} onChange={setK} />
          <ParamSlider symbol="\rho_0" label="休止密度" unit="kg/m²" value={rho0} min={900} max={1100} step={1} onChange={setRho0} />
        </>
      }
    />
  )
}
