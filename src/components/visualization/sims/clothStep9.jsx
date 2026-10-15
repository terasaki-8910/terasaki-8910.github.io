import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ToggleButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { drawArrow, drawAxes, drawGravityLegend, makeView } from '../axes'
import { CHAIN_G, createChain, grabNode, maxChainStretch, moveGrab, nodeAt, nudge, releaseGrab, resetChain, snapGrab, stepChain } from './clothChain'
import { GRAB_SLOP, NODE_R, chainView, drawChain } from './clothChainDraw'
import { drawDivergedNotice } from './clothNetDraw'
import { correctPair } from './clothPair'
import { drawText } from './clothDraw'
import { clamp, fmtMs, fmtSigned, fmtTime, runSteps } from './clothStepKit'

// 段階 9「位置ベース法」: 力を求めて加速度から進める代わりに、距離の拘束を満たすように位置を直接直す。
//   「2 点」  予測した位置 p₁・p₂(白抜きの丸)をつかんで動かすと、距離 d を保つように直した位置 q₁・q₂(塗った丸)と、
//             補正 Δp の矢印が出る。重いほど動きにくく(質量の逆数 w の比に分かれる)、反復の回数が増えるほど距離が d に近づく。
//   「鎖」    8 個の質点の鎖を位置ベース法で動かす。反復の回数を減らすと、鎖が伸びる。質点をつかんで揺らせる。
// 計算は pbd.js の projectDistance・solveConstraints・pbdStep(clothPair.js・clothChain.js 経由)。
const D = 1 // 2 点の距離 d [m]
const WORLD = { w: 3, h: 2 }
const PAIR_MARGIN = { left: 40, right: 12, top: 24, bottom: 36 }
const DT = 0.016 // 鎖の時間刻み [s]
const MAX_STEPS = 4
const KICK = 0.8
const HIT_PX = 16
const pairView = (width, height) => makeView({ width, height, xRange: [0, WORLD.w], yRange: [0, WORLD.h], margin: PAIR_MARGIN })
const START = { p1: [0.85, 1.35], p2: [2.2, 0.75] }
const dotR = (m) => 6 + 2.5 * Math.sqrt(m)
const fmtVec = (v) => `${Math.hypot(v[0], v[1]).toFixed(3)} m`

export default function ClothStep9() {
  const [mode, setMode] = useState('pair')
  const [iterations, setIterations] = useState(1)
  const [chainIterations, setChainIterations] = useState(4)
  const [m1, setM1] = useState(1)
  const [m2, setM2] = useState(1)
  const [fixed1, setFixed1] = useState(false)
  const [announce, setAnnounce] = useState('')

  const pts = useRef({ p1: [...START.p1], p2: [...START.p2], active: 0, dx: 0, dy: 0 }) // active: つかんでいる点(0 = なし、1・2)
  const [selected, setSelected] = useState(2) // キーボードで動かす点
  const worldRef = useRef(null)
  if (!worldRef.current) worldRef.current = createChain({ n: 8, k: 0, kd: 0 })
  const clock = useRef({ acc: 0, t: 0 })
  const legend = useRef(null)
  const params = useRef({})
  params.current = { mode, iterations, m1, m2, fixed1, selected, chain: { method: 'pbd', k: 0, kd: 0, iterations: chainIterations } }

  const pairOf = (p) =>
    correctPair({
      p1: pts.current.p1,
      p2: pts.current.p2,
      w1: p.fixed1 ? 0 : 1 / p.m1,
      w2: 1 / p.m2,
      d: D,
      iterations: p.iterations,
    })

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    if (p.mode === 'chain') {
      const view = chainView(width, height)
      const world = worldRef.current
      drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
      drawGravityLegend(ctx, view, CHAIN_G, { colors })
      drawChain(ctx, view, world, colors, { rods: true })
      if (world.diverged) drawDivergedNotice(ctx, width, height, colors, '計算が発散しました。リセットで戻せます')
      return
    }
    const view = pairView(width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    const r = pairOf(p)
    const [a, b] = [pts.current.p1, pts.current.p2]
    const q1 = [a[0] + r.dp1[0], a[1] + r.dp1[1]]
    const q2 = [b[0] + r.dp2[0], b[1] + r.dp2[1]]
    const c1 = colors.alpha('lane-0', 1)
    const c2 = colors.alpha('lane-3', 1)
    const R1 = dotR(p.fixed1 ? 3 : p.m1)
    const R2 = dotR(p.m2)

    // 予測した位置の間(破線)と、直した位置の間(実線)
    ctx.save()
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(view.sx(a[0]), view.sy(a[1]))
    ctx.lineTo(view.sx(b[0]), view.sy(b[1]))
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(view.sx(q1[0]), view.sy(q1[1]))
    ctx.lineTo(view.sx(q2[0]), view.sy(q2[1]))
    ctx.stroke()
    ctx.restore()

    // 反復の途中の位置(小さな点)
    ctx.fillStyle = colors.muted
    for (let it = 1; it < r.path.length - 1; it++) {
      for (const [ix, iy] of [[r.path[it][0], r.path[it][1]], [r.path[it][2], r.path[it][3]]]) {
        ctx.beginPath()
        ctx.arc(view.sx(ix), view.sy(iy), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 補正の矢印 Δp
    drawArrow(ctx, view, a[0], a[1], q1[0], q1[1], { color: c1, width: 2.5, head: 8 })
    drawArrow(ctx, view, b[0], b[1], q2[0], q2[1], { color: c2, width: 2.5, head: 8 })

    // 予測した位置(白抜きの丸。つかめる)と、直した位置(塗った丸)
    const ring = (pt, R, color, label, active, square) => {
      ctx.beginPath()
      if (square) ctx.rect(view.sx(pt[0]) - R, view.sy(pt[1]) - R, 2 * R, 2 * R)
      else ctx.arc(view.sx(pt[0]), view.sy(pt[1]), R, 0, Math.PI * 2)
      ctx.fillStyle = active ? colors.accent : colors.surface
      ctx.strokeStyle = color
      ctx.lineWidth = active ? 3.5 : 2.5
      ctx.setLineDash([4, 3])
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      drawText(ctx, label, view.sx(pt[0]), view.sy(pt[1]) - R - 9, { color: colors.ink, size: 13, align: 'center', halo: colors.surface })
    }
    const disc = (pt, R, color, label, square) => {
      ctx.beginPath()
      if (square) ctx.rect(view.sx(pt[0]) - R, view.sy(pt[1]) - R, 2 * R, 2 * R)
      else ctx.arc(view.sx(pt[0]), view.sy(pt[1]), R, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
      drawText(ctx, label, view.sx(pt[0]), view.sy(pt[1]) + R + 10, { color: colors.ink, size: 13, align: 'center', halo: colors.surface })
    }
    ring(a, R1, c1, 'p₁', pts.current.active === 1, p.fixed1)
    ring(b, R2, c2, 'p₂', pts.current.active === 2, false)
    disc(q1, R1, c1, 'q₁', p.fixed1)
    disc(q2, R2, c2, 'q₂', false)
    // 距離: 予測した位置の間(破線)と、直した位置の間(実線)を、線の両側に寸法線で示す(2 つの線は重なるので、離して描く)
    const dimension = (u, v, side, dashed, text) => {
      const ax = view.sx(u[0])
      const ay = view.sy(u[1])
      const bx = view.sx(v[0])
      const by = view.sy(v[1])
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 8) return
      const nx = (-(by - ay) / len) * side
      const ny = ((bx - ax) / len) * side
      const off = 30
      ctx.save()
      ctx.strokeStyle = dashed ? colors.muted : colors.ink
      ctx.lineWidth = dashed ? 1.5 : 2
      ctx.setLineDash(dashed ? [5, 4] : [])
      ctx.beginPath()
      ctx.moveTo(ax + nx * off, ay + ny * off)
      ctx.lineTo(bx + nx * off, by + ny * off)
      ctx.moveTo(ax + nx * (off - 6), ay + ny * (off - 6))
      ctx.lineTo(ax + nx * (off + 6), ay + ny * (off + 6))
      ctx.moveTo(bx + nx * (off - 6), by + ny * (off - 6))
      ctx.lineTo(bx + nx * (off + 6), by + ny * (off + 6))
      ctx.stroke()
      ctx.restore()
      drawText(ctx, text, (ax + bx) / 2 + nx * (off + 14), (ay + by) / 2 + ny * (off + 14), { color: colors.ink, size: 12, align: 'center', mono: true, halo: colors.surface })
    }
    dimension(a, b, 1, true, `予測 ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(2)} m`)
    dimension(q1, q2, -1, false, `直した後 ${r.distance.toFixed(2)} m`)
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const publishLive = useCallback(() => {
    const world = worldRef.current
    legend.current?.update({
      t: fmtTime(clock.current.t),
      stretch: world.diverged ? '発散' : `${(maxChainStretch(world) * 100).toFixed(1)} %`,
    })
  }, [])

  const loop = useSimLoop(
    (frameDt) => {
      if (params.current.mode !== 'chain') return
      const world = worldRef.current
      runSteps(clock.current, frameDt, DT, MAX_STEPS, (dt) => stepChain(world, params.current.chain, dt))
      publishLive()
      redraw()
    },
    { targetRef: canvasRef },
  )

  useEffect(() => {
    redraw()
  }, [mode, iterations, chainIterations, m1, m2, fixed1, selected, redraw])

  // ---- つかむ ----
  const sizes = () => sizeRef.current
  const pairHit = (p) => {
    const view = pairView(sizes().width, sizes().height)
    let best = 0
    let bestD = HIT_PX + 6
    ;[pts.current.p1, pts.current.p2].forEach((pt, i) => {
      const d = Math.hypot(p.x - view.sx(pt[0]), p.y - view.sy(pt[1]))
      if (d <= bestD) {
        best = i + 1
        bestD = d
      }
    })
    return best
  }
  const chainReach = () => (NODE_R + GRAB_SLOP) / chainView(sizes().width, sizes().height).scaleX
  const chainWorld = (p) => {
    const view = chainView(sizes().width, sizes().height)
    return { wx: view.wx(p.x), wy: view.wy(p.y) }
  }
  const settle = () => {
    if (!loop.running) {
      snapGrab(worldRef.current, 'pbd')
      publishLive()
    }
    redraw()
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => {
      if (params.current.mode === 'pair') return pairHit(p) > 0
      const { wx, wy } = chainWorld(p)
      return !worldRef.current.diverged && nodeAt(worldRef.current, wx, wy, chainReach()) >= 0
    },
    onDown: (p) => {
      if (params.current.mode === 'pair') {
        const which = pairHit(p)
        if (!which) return false
        const view = pairView(sizes().width, sizes().height)
        const pt = which === 1 ? pts.current.p1 : pts.current.p2
        pts.current.active = which
        pts.current.dx = view.sx(pt[0]) - p.x
        pts.current.dy = view.sy(pt[1]) - p.y
        setSelected(which)
        redraw()
        return undefined
      }
      const { wx, wy } = chainWorld(p)
      if (worldRef.current.diverged || !grabNode(worldRef.current, wx, wy, chainReach())) return false
      settle()
      return undefined
    },
    onMove: (p) => {
      if (params.current.mode === 'pair') {
        if (!pts.current.active) return
        const view = pairView(sizes().width, sizes().height)
        const pt = pts.current.active === 1 ? pts.current.p1 : pts.current.p2
        pt[0] = clamp(view.wx(p.x + pts.current.dx), 0.05, WORLD.w - 0.05)
        pt[1] = clamp(view.wy(p.y + pts.current.dy), 0.05, WORLD.h - 0.05)
        redraw()
        legendPair()
        return
      }
      const { wx, wy } = chainWorld(p)
      moveGrab(worldRef.current, wx, wy)
      settle()
    },
    onUp: () => {
      if (params.current.mode === 'pair') {
        pts.current.active = 0
        redraw()
        return
      }
      releaseGrab(worldRef.current)
      redraw()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (mode === 'pair') {
      if (event.key === '1' || event.key === '2') {
        event.preventDefault()
        setSelected(Number(event.key))
        setAnnounce(`点 p${event.key} を選んだ`)
        return
      }
      const step = event.shiftKey ? 0.25 : 0.05
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
      const move = moves[event.key]
      if (!move) return
      event.preventDefault()
      const pt = selected === 1 ? pts.current.p1 : pts.current.p2
      pt[0] = clamp(pt[0] + move[0], 0.05, WORLD.w - 0.05)
      pt[1] = clamp(pt[1] + move[1], 0.05, WORLD.h - 0.05)
      redraw()
      legendPair()
      setAnnounce(`p${selected} = (${pt[0].toFixed(2)}, ${pt[1].toFixed(2)}) m`)
    } else {
      const kick = event.shiftKey ? 2.5 * KICK : KICK
      const moves = { ArrowLeft: [-kick, 0], ArrowRight: [kick, 0], ArrowUp: [0, kick], ArrowDown: [0, -kick] }
      const move = moves[event.key]
      if (!move) return
      event.preventDefault()
      nudge(worldRef.current, move[0], move[1])
      setAnnounce('鎖を弾いた')
      if (!loop.running) loop.play()
    }
  }

  // 「2 点」の凡例の数(つかんでいる間も追従させる)
  const legendPair = useCallback(() => {
    const p = params.current
    const r = pairOf(p)
    legend.current?.update({
      before: `${Math.hypot(pts.current.p1[0] - pts.current.p2[0], pts.current.p1[1] - pts.current.p2[1]).toFixed(3)} m`,
      after: `${r.distance.toFixed(3)} m`,
      residual: `${(r.residual * 1000).toFixed(1)} mm`,
      C: `${fmtSigned(r.C, 3)} m²`,
      dp1: fmtVec(r.dp1),
      dp2: fmtVec(r.dp2),
    })
  }, [])

  useEffect(() => {
    if (mode === 'pair') legendPair()
    else publishLive()
  }, [mode, iterations, m1, m2, fixed1, legendPair, publishLive])

  function reset() {
    if (mode === 'pair') {
      pts.current.p1 = [...START.p1]
      pts.current.p2 = [...START.p2]
      legendPair()
    } else {
      resetChain(worldRef.current)
      clock.current.acc = 0
      clock.current.t = 0
      publishLive()
    }
    redraw()
  }

  const items =
    mode === 'pair'
      ? [
          { key: 'd', symbol: 'd', label: '保つ距離', value: `${D.toFixed(2)} m` },
          { key: 'before', label: '予測した位置の距離', value: '', minChars: 8 },
          { key: 'after', label: '直した位置の距離', value: '', minChars: 8 },
          { key: 'residual', label: '距離の誤差', value: '', minChars: 8 },
          { key: 'C', symbol: 'C', label: '拘束の値 |p₁−p₂|²−d²', value: '', minChars: 9 },
          { key: 'dp1', symbol: '\\Delta p_1', label: '補正の大きさ', value: '', minChars: 8 },
          { key: 'dp2', symbol: '\\Delta p_2', label: '補正の大きさ', value: '', minChars: 8 },
          { key: 'w', symbol: 'w', label: '質量の逆数', value: `w₁ = ${fixed1 ? '0（固定）' : (1 / m1).toFixed(2)}、w₂ = ${(1 / m2).toFixed(2)} 1/kg` },
        ]
      : [
          { key: 't', symbol: 't', label: '時刻', value: fmtTime(0), minChars: 7 },
          { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: fmtMs(DT) },
          { key: 'g', symbol: 'g', label: '重力', value: `${CHAIN_G.toFixed(1)} m/s² ↓` },
          { key: 'n', symbol: 'n', label: '反復', value: `${chainIterations} 回` },
          { key: 'stretch', label: '最大の伸び', value: '0.0 %', minChars: 6 },
        ]

  const pairControls = (
    <>
      <SimToolbar>
        <ResetButton onClick={reset} />
        <ToggleButton pressed={fixed1} onChange={setFixed1}>
          p₁ を固定（w₁ = 0）
        </ToggleButton>
      </SimToolbar>
      <ParamSlider symbol="n" label="反復の回数" unit="回" value={iterations} min={1} max={6} step={1} onChange={setIterations} />
      <ParamSlider symbol="m_1" label="p₁ の質量" unit="kg" value={m1} min={0.5} max={4} step={0.5} onChange={setM1} format={(v) => v.toFixed(1)} disabled={fixed1} />
      <ParamSlider symbol="m_2" label="p₂ の質量" unit="kg" value={m2} min={0.5} max={4} step={0.5} onChange={setM2} format={(v) => v.toFixed(1)} />
    </>
  )
  const chainControls = (
    <>
      <SimToolbar>
        <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
        <ResetButton onClick={reset} />
      </SimToolbar>
      <ParamSlider symbol="n" label="反復の回数" unit="回" value={chainIterations} min={1} max={20} step={1} onChange={setChainIterations} />
    </>
  )

  return (
    <SimShell
      label="位置ベース法のシミュレーション"
      aspect={1.5}
      height={{ pc: [320, 400], phone: [280, 360] }}
      switcher={
        <ModeSwitch
          variant="tabs"
          label="見せ方"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'pair', label: '2 点' },
            { value: 'chain', label: '鎖' },
          ]}
        />
      }
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label={
            mode === 'pair'
              ? '予測した2点 p1・p2 と、距離を保つように直した2点 q1・q2。p1・p2 をドラッグするか、1・2 キーで点を選んで矢印キーで動かせる'
              : '位置ベース法で動く鎖。質点をドラッグでつかめる。矢印キーで鎖を弾ける'
          }
        />
      }
      legend={
        <>
          <SimLegend ref={legend} items={items} />
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={<ViewStack active={mode} views={{ pair: pairControls, chain: chainControls }} />}
    />
  )
}
