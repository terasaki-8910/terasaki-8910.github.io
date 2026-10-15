import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView, drawAxes, drawArrow } from '../axes'
import { BROAD_H, BROAD_W, createImpact, impactBefore, radiusOf, stepImpact } from './rigidMath'
import { pickCircle } from './rigidHooks'
import { STEP_MARGIN, GRAB_SLOP_PX, arrowStep, clamp, fmt, fmtVec, laneAlpha, laneColor, strokeFillCircle } from './rigidKit'
import './rigidSteps.css'

// 段階 5「撃力による応答」: 2 つの円の衝突。重力はなし。
// 点線の円と矢印が、最初の位置と速度(円と矢印の先をつかんで動かせる)。円は等速で動き、重なったとき、撃力 j を
// 法線の向きに与えて速度を変える。表に、ぶつかる前後の速度・運動量・エネルギーが出る(運動量はいつも保存される)。
// 計算は rigidMath.js(collide.js の resolveCircles・separateCircles)。ここは画面と操作。
const INIT = { c1: [0.8, 1.5], v1: [1.6, 0], c2: [2.8, 1.62], v2: [-0.4, 0] }
const VEL_SCALE = 0.4 // 矢印の長さ [m] = 速さ [m/s] × この値
const MAX_SPEED = 3 // 速さの上限 [m/s]
const TIP = 7 // 矢印の先のつまみの大きさ(半分) [px]
const LEAD = 0.6 // 最初の配置を見せる間 [s]
const RUN = 3.2 // 動かす時間 [s]
const END = 0.9 // 動かし終えてから、最初に戻るまでの間 [s]
const STEP = 1 / 240 // 計算の刻み [s]
const KEY_STEP = 0.05

const viewOf = (width, height) =>
  makeView({ width, height, xRange: [0, BROAD_W], yRange: [0, BROAD_H], equal: true, margin: STEP_MARGIN })

export default function RigidStep5() {
  const [init, setInit] = useState(INIT)
  const [m1, setM1] = useState(1)
  const [m2, setM2] = useState(2)
  const [e, setE] = useState(0.6)
  const [active, setActive] = useState('1')
  const [outcome, setOutcome] = useState(null) // null(まだ)、{ hit } ぶつかった、{ miss: true } ぶつからなかった

  const legend = useRef(null)
  const latest = useRef({})
  latest.current = { init, m1, m2, e }
  const newRun = () => {
    const { init: i, m1: a, m2: b, e: ee } = latest.current
    return {
      sim: createImpact({ c1: i.c1, v1: i.v1, m1: a, c2: i.c2, v2: i.v2, m2: b, e: ee }),
      phase: 'lead', // lead(最初の配置を見せる)→ run(動かす)→ end(止めて見せる)→ 最初から
      timer: 0,
      acc: 0,
      reported: false,
    }
  }
  const run = useRef(null)
  if (!run.current) run.current = newRun()
  const restart = () => {
    run.current = newRun()
    setOutcome(null)
  }
  const grab = useRef(null)

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    const { sim } = run.current
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()

    const items = [
      { c: init.c1, v: init.v1, m: m1, lane: 0 },
      { c: init.c2, v: init.v2, m: m2, lane: 3 },
    ]
    // 最初の位置と速度(点線の円、薄い矢印、矢印の先のつまみ)
    for (const it of items) {
      const color = laneColor(colors, it.lane)
      strokeFillCircle(ctx, view, it.c, radiusOf(it.m), { stroke: colors.alpha('ink', 0.6), lineWidth: 1, dash: [4, 4] })
      drawArrow(ctx, view, it.c[0], it.c[1], it.c[0] + it.v[0] * VEL_SCALE, it.c[1] + it.v[1] * VEL_SCALE, {
        color: colors.alpha(`lane-${it.lane}`, 0.6),
        width: 2,
      })
      const tx = view.sx(it.c[0] + it.v[0] * VEL_SCALE)
      const ty = view.sy(it.c[1] + it.v[1] * VEL_SCALE)
      ctx.fillStyle = color
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      ctx.fillRect(tx - TIP, ty - TIP, TIP * 2, TIP * 2)
      ctx.strokeRect(tx - TIP, ty - TIP, TIP * 2, TIP * 2)
    }
    // いまの円と、いまの速度の矢印
    for (const [k, b] of [sim.a, sim.b].entries()) {
      const lane = k === 0 ? 0 : 3
      strokeFillCircle(ctx, view, b.c, b.r, { fill: laneAlpha(colors, lane, 0.45), stroke: colors.ink, lineWidth: 2 })
      drawArrow(ctx, view, b.c[0], b.c[1], b.c[0] + b.v[0] * VEL_SCALE, b.c[1] + b.v[1] * VEL_SCALE, { color: laneColor(colors, lane), width: 2.5 })
    }
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  // 設定が変わったら、最初からやり直す(止まっていても、最初の配置を見せる)
  useEffect(() => {
    restart()
    legend.current?.update({ t: '0.00 s' })
    redraw()
  }, [init, m1, m2, e])

  const loop = useSimLoop(
    (dt) => {
      const r = run.current
      if (r.phase === 'lead') {
        r.timer += dt
        if (r.timer >= LEAD) {
          r.phase = 'run'
          r.timer = 0
        }
      } else if (r.phase === 'run') {
        r.acc += dt
        while (r.acc >= STEP && r.sim.t < RUN) {
          stepImpact(r.sim, STEP)
          r.acc -= STEP
        }
        if (r.sim.hit && !r.reported) {
          r.reported = true
          setOutcome({ hit: r.sim.hit })
        }
        if (r.sim.t >= RUN) {
          r.phase = 'end'
          r.timer = 0
          if (!r.sim.hit) setOutcome({ miss: true })
        }
      } else {
        r.timer += dt
        if (r.timer >= END) restart()
      }
      legend.current?.update({ t: `${run.current.sim.t.toFixed(2)} s` })
      redraw()
    },
    { targetRef: canvasRef },
  )

  // ---- つかむ(円と、矢印の先) ----
  const pickAt = (p) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    const { init: i, m1: a, m2: b } = latest.current
    for (const k of [0, 1]) {
      const c = k === 0 ? i.c1 : i.c2
      const v = k === 0 ? i.v1 : i.v2
      const tx = view.sx(c[0] + v[0] * VEL_SCALE)
      const ty = view.sy(c[1] + v[1] * VEL_SCALE)
      if (Math.hypot(p.x - tx, p.y - ty) <= TIP + GRAB_SLOP_PX / 2) return { kind: 'tip', index: k }
    }
    const idx = pickCircle(view, [{ c: i.c1, r: radiusOf(a) }, { c: i.c2, r: radiusOf(b) }], p)
    return idx >= 0 ? { kind: 'circle', index: idx } : null
  }
  const setCircle = (k, c) => setInit((prev) => (k === 0 ? { ...prev, c1: c } : { ...prev, c2: c }))
  const setVelocity = (k, v) => setInit((prev) => (k === 0 ? { ...prev, v1: v } : { ...prev, v2: v }))

  usePointerDrag(canvasRef, {
    canGrab: (p) => pickAt(p) !== null,
    onDown: (p) => {
      const found = pickAt(p)
      if (!found) return false
      const view = viewOf(sizeRef.current.width, sizeRef.current.height)
      const c = found.index === 0 ? latest.current.init.c1 : latest.current.init.c2
      grab.current = { ...found, ox: view.wx(p.x) - c[0], oy: view.wy(p.y) - c[1] }
      setActive(String(found.index + 1))
    },
    onMove: ({ x, y }) => {
      const g = grab.current
      if (!g) return
      const view = viewOf(sizeRef.current.width, sizeRef.current.height)
      const wx = view.wx(x)
      const wy = view.wy(y)
      if (g.kind === 'circle') {
        setCircle(g.index, [clamp(wx - g.ox, 0, BROAD_W), clamp(wy - g.oy, 0, BROAD_H)])
      } else {
        const c = g.index === 0 ? latest.current.init.c1 : latest.current.init.c2
        let vx = (wx - c[0]) / VEL_SCALE
        let vy = (wy - c[1]) / VEL_SCALE
        const sp = Math.hypot(vx, vy)
        if (sp > MAX_SPEED) {
          vx *= MAX_SPEED / sp
          vy *= MAX_SPEED / sp
        }
        setVelocity(g.index, [vx, vy])
      }
    },
    onUp: () => {
      grab.current = null
    },
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const k = active === '1' ? 0 : 1
    const c = k === 0 ? init.c1 : init.c2
    setCircle(k, [clamp(c[0] + step.dx * KEY_STEP, 0, BROAD_W), clamp(c[1] + step.dy * KEY_STEP, 0, BROAD_H)])
  }

  function reset() {
    setInit(INIT)
    setM1(1)
    setM2(2)
    setE(0.6)
  }

  // ---- 表 ----
  const before = impactBefore({ ...init, m1, m2 })
  const hit = outcome?.hit
  const after = hit?.after
  const pending = (text) => <td data-state="pending">{text}</td>
  const afterCell = (text) => (after ? <td>{text}</td> : pending(outcome?.miss ? 'ぶつからない' : '—'))
  const readout = (
    <>
      <table className="rigid-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">量</span></th>
            <th scope="col">ぶつかる前</th>
            <th scope="col">ぶつかった後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">円 1 の速度 v</th>
            <td>{fmtVec(before.v1)}</td>
            {afterCell(after && fmtVec(after.v1))}
          </tr>
          <tr>
            <th scope="row">円 2 の速度 v</th>
            <td>{fmtVec(before.v2)}</td>
            {afterCell(after && fmtVec(after.v2))}
          </tr>
          <tr>
            <th scope="row">運動量 p</th>
            <td>{fmtVec(before.p)}</td>
            {afterCell(after && fmtVec(after.p))}
          </tr>
          <tr>
            <th scope="row">エネルギー K</th>
            <td>{fmt(before.K, 2)} J</td>
            {afterCell(after && `${fmt(after.K, 2)} J`)}
          </tr>
          <tr>
            <th scope="row">近づく速さ u</th>
            {hit ? <td>{fmt(hit.before.u, 2)} m/s</td> : pending('—')}
            {hit ? <td>{fmt(hit.after.u, 2)} m/s</td> : pending('—')}
          </tr>
          <tr>
            <th scope="row">撃力 j</th>
            {pending('')}
            {hit ? <td>{fmt(hit.j, 2)} N·s</td> : pending('—')}
          </tr>
        </tbody>
      </table>
      <p className="rigid-note">
        {hit
          ? `運動量 p は前後で同じ。u は −e 倍（e = ${e.toFixed(2)}）。`
          : '円をつかんで動かすか、矢印の先をつかんで速度を決める。'}
      </p>
    </>
  )

  const legendItems = [
    { key: 'c1', label: '円 1', swatch: 'var(--lane-0)' },
    { key: 'c2', label: '円 2', swatch: 'var(--lane-3)' },
    { key: 't', symbol: 't', label: '時刻', value: '0.00 s', minChars: 7 },
    { key: 'e', symbol: 'e', label: '反発係数', value: e.toFixed(2) },
    { key: 'guide', label: '点線の円と矢印は、最初の位置と速度' },
  ]

  return (
    <SimShell
      label="2 つの円の衝突と撃力"
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="重力のない所で 2 つの円が動き、ぶつかると撃力で速度が変わる。点線の円と、矢印の先の四角をドラッグすると、最初の位置と速度を変えられる。矢印キーでは、選んだ円の最初の位置を動かせる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      readout={readout}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ModeSwitch
              label="矢印キーで動かす円"
              value={active}
              onChange={setActive}
              options={[
                { value: '1', label: '円 1' },
                { value: '2', label: '円 2' },
              ]}
              variant="quiet"
            />
          </SimToolbar>
          <ParamSlider symbol="m_1" label="円 1 の質量" unit="kg" value={m1} min={0.5} max={5} step={0.5} onChange={setM1} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="m_2" label="円 2 の質量" unit="kg" value={m2} min={0.5} max={5} step={0.5} onChange={setM2} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="e" label="反発係数" value={e} min={0} max={1} step={0.05} onChange={setE} format={(v) => v.toFixed(2)} />
          <ParamSlider
            symbol="v_{1x}"
            label="円 1 の速度の x 成分"
            unit="m/s"
            value={Number(init.v1[0].toFixed(1))}
            min={-MAX_SPEED}
            max={MAX_SPEED}
            step={0.1}
            onChange={(v) => setVelocity(0, [v, init.v1[1]])}
            format={(v) => fmt(v, 1)}
          />
          <ParamSlider
            symbol="v_{2x}"
            label="円 2 の速度の x 成分"
            unit="m/s"
            value={Number(init.v2[0].toFixed(1))}
            min={-MAX_SPEED}
            max={MAX_SPEED}
            step={0.1}
            onChange={(v) => setVelocity(1, [v, init.v2[1]])}
            format={(v) => fmt(v, 1)}
          />
        </>
      }
    />
  )
}
