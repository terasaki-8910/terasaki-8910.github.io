import { useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import { SimToolbar, ResetButton, ModeSwitch, ToggleButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import { makeView, drawAxes, drawArrow } from '../axes'
import { BROAD_H, BROAD_W, pushBack, radiusOf } from './rigidMath'
import { useCircleDrag } from './rigidHooks'
import { STEP_MARGIN, arrowStep, clamp, drawText, fmt, laneAlpha, laneColor, markerCircle, strokeFillCircle } from './rigidKit'
import './rigidSteps.css'

// 段階 6「めり込みの押し戻し」: めり込んだ 2 つの円を、法線の向きに押し戻して接するようにする。
// 塗った円(つかんで動かす)がめり込んだ配置、点線の枠が押し戻した後。矢印が押し戻す動きで、重い円(質量の逆数 w が小さい)は少ししか動かず、
// 軽い円がその分を引き受ける。円 1 を固定すると(質量が無限大)、円 2 が全部を引き受ける。
// 計算は rigidMath.js(collide.js の separateCircles)。ここは画面と操作。
const INITIAL = { c1: [1.6, 1.5], c2: [2.1, 1.5] }
const KEY_STEP = 0.05

const viewOf = (width, height) =>
  makeView({ width, height, xRange: [0, BROAD_W], yRange: [0, BROAD_H], equal: true, margin: STEP_MARGIN })

export default function RigidStep6() {
  const [pos, setPos] = useState(INITIAL)
  const [m1, setM1] = useState(1)
  const [m2, setM2] = useState(3)
  const [fixed1, setFixed1] = useState(false)
  const [active, setActive] = useState('2')
  const r1 = radiusOf(m1)
  const r2 = radiusOf(m2)
  const mass1 = fixed1 ? Infinity : m1
  const res = pushBack(pos.c1, r1, mass1, pos.c2, r2, m2)
  const overlapping = res.depth > 0

  const draw = ({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]' })
    ctx.save()
    ctx.beginPath()
    ctx.rect(view.frame.left, view.frame.top, view.frame.width, view.frame.height)
    ctx.clip()

    // 押し戻した後(点線の枠)と、押し戻す動き(矢印)
    if (overlapping) {
      strokeFillCircle(ctx, view, res.c1, r1, { stroke: laneColor(colors, 0), lineWidth: 2.5, dash: [6, 4] })
      strokeFillCircle(ctx, view, res.c2, r2, { stroke: laneColor(colors, 3), lineWidth: 2.5, dash: [6, 4] })
    }
    // めり込んだ配置(塗り)。つかんで動かす
    strokeFillCircle(ctx, view, pos.c1, r1, { fill: laneAlpha(colors, 0, 0.45), stroke: colors.ink, lineWidth: 2 })
    strokeFillCircle(ctx, view, pos.c2, r2, { fill: laneAlpha(colors, 3, 0.45), stroke: colors.ink, lineWidth: 2 })
    if (overlapping) {
      for (const [from, to] of [[pos.c1, res.c1], [pos.c2, res.c2]]) {
        drawArrow(ctx, view, from[0], from[1], to[0], to[1], { color: colors.ink, width: 2.5, head: 8 })
      }
      // めり込みの深さ d: 中心を結ぶ線の上で、2 つの円が重なっている部分
      const dx = pos.c2[0] - pos.c1[0]
      const dy = pos.c2[1] - pos.c1[1]
      const dist = Math.hypot(dx, dy) || 1
      const ux = dx / dist
      const uy = dy / dist
      const sx = view.sx
      const sy = view.sy
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(sx(pos.c1[0] + ux * (dist - r2)), sy(pos.c1[1] + uy * (dist - r2)))
      ctx.lineTo(sx(pos.c1[0] + ux * r1), sy(pos.c1[1] + uy * r1))
      ctx.stroke()
    }
    for (const [c, label] of [[pos.c1, '1'], [pos.c2, '2']]) {
      markerCircle(ctx, view.sx(c[0]), view.sy(c[1]), 3, { fill: colors.ink })
      drawText(ctx, label, view.sx(c[0]) - 8, view.sy(c[1]) + 14, { color: colors.ink, size: 12, align: 'right', baseline: 'top' })
    }
    ctx.restore()
  }

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  })

  const latest = useRef({})
  latest.current = { pos, r1, r2 }
  useCircleDrag(canvasRef, {
    getView: () => viewOf(sizeRef.current.width, sizeRef.current.height),
    getCircles: () => [
      { c: latest.current.pos.c1, r: latest.current.r1 },
      { c: latest.current.pos.c2, r: latest.current.r2 },
    ],
    onGrab: (i) => setActive(String(i + 1)),
    onMove: (i, c) => setPos((p) => (i === 0 ? { ...p, c1: c } : { ...p, c2: c })),
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const key = active === '1' ? 'c1' : 'c2'
    setPos((p) => ({
      ...p,
      [key]: [clamp(p[key][0] + step.dx * KEY_STEP, 0, BROAD_W), clamp(p[key][1] + step.dy * KEY_STEP, 0, BROAD_H)],
    }))
  }

  function reset() {
    setPos(INITIAL)
    setM1(1)
    setM2(3)
    setFixed1(false)
  }

  const share = (s) => (overlapping ? `${Math.round((100 * s) / res.depth)} %` : '—')
  const dist = (s) => (overlapping ? fmt(s, 3) : '—')
  const readout = (
    <>
      <table className="rigid-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">量</span></th>
            <th scope="col">円 1</th>
            <th scope="col">円 2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">質量 m [kg]</th>
            <td>{fixed1 ? '∞（固定）' : fmt(m1, 1)}</td>
            <td>{fmt(m2, 1)}</td>
          </tr>
          <tr>
            <th scope="row">逆数 w = 1/m [1/kg]</th>
            <td>{fmt(res.w1, 2)}</td>
            <td>{fmt(res.w2, 2)}</td>
          </tr>
          <tr>
            <th scope="row">動く距離 s [m]</th>
            <td>{dist(res.s1)}</td>
            <td>{dist(res.s2)}</td>
          </tr>
          <tr>
            <th scope="row">深さ d の何割</th>
            <td>{share(res.s1)}</td>
            <td>{share(res.s2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="rigid-note">
        {overlapping
          ? `めり込みの深さ d = ${fmt(res.depth, 3)} m。押し戻した後は、中心の距離が半径の和 ${fmt(r1 + r2, 3)} m になって接する。`
          : '重なっていないので、押し戻さない。円をつかんで、重なるまで近づける。'}
      </p>
    </>
  )

  const legendItems = [
    { key: 'c1', label: '円 1', swatch: 'var(--lane-0)' },
    { key: 'c2', label: '円 2', swatch: 'var(--lane-3)' },
    { key: 'in', label: '塗り：めり込んだ配置（つかんで動かす）' },
    { key: 'out', label: '点線：押し戻した後（矢印が動き）' },
  ]

  return (
    <SimShell
      label="めり込んだ 2 つの円の押し戻し"
      stage={
        <SimCanvas
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="めり込んだ 2 つの円と、押し戻した後の位置。塗った円をドラッグして動かすと、押し戻す量が変わる。矢印キーでは、選んだ円を動かせる"
        />
      }
      legend={<SimLegend items={legendItems} />}
      readout={readout}
      controls={
        <>
          <SimToolbar>
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
            <ToggleButton pressed={fixed1} onChange={setFixed1}>
              円 1 を固定（m = ∞）
            </ToggleButton>
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider symbol="m_1" label="円 1 の質量" unit="kg" value={m1} min={0.5} max={5} step={0.5} onChange={setM1} format={(v) => v.toFixed(1)} disabled={fixed1} />
          <ParamSlider symbol="m_2" label="円 2 の質量" unit="kg" value={m2} min={0.5} max={5} step={0.5} onChange={setM2} format={(v) => v.toFixed(1)} />
        </>
      }
    />
  )
}
