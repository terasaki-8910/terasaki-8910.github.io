import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, arrowStep, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN, lineIntegral, projectPhantom } from '../../../utils/vis/ct'
import { drawSubLabel } from './labelKit'
import {
  beamPoint, clampNumber, deg, drawBeam, drawFrame, drawGrayImage, drawPlotAxes, phantomValues, plotMap, rad, worldView,
} from './ctKit'

const N = 128
const MARGIN = 1.45 // 模型の枠の半分の幅 ÷ 画像の半分の幅(線源と検出器を描く余白)
const RADIUS = 1.05 // 線源と検出器の、模型の中心からの距離
const HALF = 0.92 // 検出器の半分の長さ
const RAYS = Array.from({ length: 13 }, (_, i) => -0.9 + 0.15 * i)
const S_MAX = 0.9
const TWO_PI = Math.PI * 2

function layoutOf(width, height) {
  const pad = 8
  if (width >= 480) {
    const side = Math.min(height - 2 * pad, width * 0.5)
    const inner = side / MARGIN
    const outer = { x: pad, y: (height - side) / 2, w: side, h: side }
    const image = { x: outer.x + (side - inner) / 2, y: outer.y + (side - inner) / 2, w: inner, h: inner }
    const left = outer.x + side + 50
    return { stacked: false, outer, image, plot: { x: left, y: 32, w: Math.max(80, width - left - 28), h: height - 32 - 40 } }
  }
  const plotH = Math.min(110, Math.max(70, height * 0.26))
  const side = Math.min(width - 2 * pad, Math.max(120, height - plotH - 24 - 40 - pad))
  const inner = side / MARGIN
  const outer = { x: (width - side) / 2, y: 4, w: side, h: side }
  const image = { x: outer.x + (side - inner) / 2, y: outer.y + (side - inner) / 2, w: inner, h: inner }
  const top = outer.y + side + 24
  return { stacked: true, outer, image, plot: { x: 42, y: top, w: width - 42 - 28, h: Math.max(50, height - top - 36) } }
}

export default function CtStep1() {
  const [theta, setTheta] = useState(rad(35))
  const [sSel, setSSel] = useState(0.15)
  const legendRef = useRef(null)
  const grabRef = useRef(null)
  const stateRef = useRef(null)
  stateRef.current = { theta, sSel }

  const draw = ({ ctx, width, height, colors }) => {
    const { theta: th, sSel: s0 } = stateRef.current
    const { image, plot } = layoutOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const values = phantomValues(SHEPP_LOGAN, N)
    drawGrayImage(ctx, colors, values, N, N, image)
    drawFrame(ctx, colors, image)
    const view = worldView(image)
    // 線源が通る円(つかんで回す)
    ctx.save()
    ctx.strokeStyle = colors.alpha('muted', 0.7)
    ctx.lineWidth = 1
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.arc(view.cx, view.cy, RADIUS * view.scale, 0, TWO_PI)
    ctx.stroke()
    ctx.restore()
    drawBeam(ctx, colors, view, th, { rays: RAYS, half: HALF, radius: RADIUS, active: s0, handle: true, arrow: true, rayAlpha: 0.4 })
    const [rx, ry] = beamPoint(view, th, s0, RADIUS)
    markerCircle(ctx, rx, ry, 6.5, { fill: colors.alpha('lane-1', 1), stroke: colors.ink, lineWidth: 2 })

    // 投影のグラフ: 式で求めた線(ink)と、画素を光線に沿って足した点
    const map = plotMap(plot, [-1, 1], [0, 0.6])
    const wide = plot.w >= 200
    drawPlotAxes(ctx, colors, map, {
      xTicks: (wide ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1]).map((v) => ({ v, label: v < 0 ? `−${Math.abs(v)}` : `${v}` })),
      yTicks: (plot.h >= 120 ? [0, 0.2, 0.4, 0.6] : [0, 0.3, 0.6]).map((v) => ({ v, label: `${v}` })),
      xName: 's',
    })
    drawSubLabel(ctx, 'p_θ(s)', plot.x, plot.y - 10, { color: colors.ink, size: 12 })
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.x, plot.y - 4, plot.w, plot.h + 8)
    ctx.clip()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2.25
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= 240; i++) {
      const s = -1 + (2 * i) / 240
      const x = map.px(s)
      const y = map.py(projectPhantom(SHEPP_LOGAN, s, th))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()
    for (const s of RAYS) {
      markerCircle(ctx, map.px(s), map.py(lineIntegral(values, N, s, th)), 3.5, { fill: colors.alpha('lane-1', 1), stroke: colors.surface, lineWidth: 1 })
    }
    const exact = projectPhantom(SHEPP_LOGAN, s0, th)
    const numeric = lineIntegral(values, N, s0, th)
    ctx.save()
    ctx.strokeStyle = colors.alpha('ink', 0.7)
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(map.px(s0) + 0.5, map.py(0))
    ctx.lineTo(map.px(s0) + 0.5, map.py(Math.max(exact, numeric)))
    ctx.stroke()
    ctx.restore()
    markerCircle(ctx, map.px(s0), map.py(numeric), 5.5, { fill: colors.alpha('lane-1', 1), stroke: colors.ink, lineWidth: 2 })
    legendRef.current?.update({
      theta: `${deg(th).toFixed(0)}°`,
      s: fmt(s0, 2),
      exact: exact.toFixed(3),
      numeric: numeric.toFixed(3),
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const viewOf = () => {
    const { width, height } = sizeRef.current
    return worldView(layoutOf(width, height).image)
  }
  const hitOf = (p) => {
    const view = viewOf()
    const source = beamPoint(view, theta, 0, -RADIUS)
    const ray = beamPoint(view, theta, sSel, RADIUS)
    const dSource = Math.hypot(p.x - source[0], p.y - source[1])
    const dRay = Math.hypot(p.x - ray[0], p.y - ray[1])
    const reach = 8 + GRAB_SLOP_PX
    if (dRay <= reach && dRay <= dSource) return 'ray'
    if (dSource <= reach) return 'source'
    return null
  }
  const moveTo = (kind, p) => {
    const view = viewOf()
    const x = view.wx(p.x)
    const y = view.wy(p.y)
    if (kind === 'source') setTheta((((Math.atan2(x, -y) % TWO_PI) + TWO_PI) % TWO_PI))
    else setSSel(clampNumber(x * Math.cos(theta) + y * Math.sin(theta), -S_MAX, S_MAX))
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hitOf(p) !== null,
    onDown: (p) => {
      const kind = hitOf(p)
      if (!kind) return false
      grabRef.current = kind
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも動かせるように
      moveTo(kind, p)
      return true
    },
    onMove: (p) => grabRef.current && moveTo(grabRef.current, p),
    onUp: () => { grabRef.current = null },
  })
  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (step.dx) setTheta((v) => (((v + rad(step.dx)) % TWO_PI) + TWO_PI) % TWO_PI)
    if (step.dy) setSSel((v) => clampNumber(v + step.dy * 0.02, -S_MAX, S_MAX))
  }

  return (
    <SimShell
      label="投影を撮る"
      height={{ phone: [430, 470], pc: [300, 380] }}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="断面に X 線を当て、検出器で投影を測る絵と、投影のグラフ。線源の丸をドラッグするか左右の矢印キーで X 線の向きを、検出器の丸をドラッグするか上下の矢印キーで調べる光線の位置を動かします（Shift で大きく）。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'theta', symbol: '\\theta', label: 'X 線の向き', value: '0°', minChars: 5 },
        { key: 's', symbol: 's', label: '調べる光線の位置', value: '0.00', minChars: 5 },
        { key: 'exact', symbol: 'p_\\theta(s)', label: '式で求めた値', value: '0.000', swatch: 'var(--color-ink)', minChars: 5 },
        { key: 'numeric', label: '画素を足した値', value: '0.000', swatch: 'var(--lane-1)', minChars: 5 },
      ]} />}
      controls={<>
        <ParamSlider symbol="\theta" label="X 線の向き" unit="°" value={Math.round(deg(theta))} min={0} max={360} step={1} onChange={(v) => setTheta(rad(v))} format={(v) => v.toFixed(0)} />
        <ParamSlider symbol="s" label="調べる光線の位置" value={sSel} min={-S_MAX} max={S_MAX} step={0.01} onChange={setSSel} format={(v) => fmt(v, 2)} />
      </>}
    />
  )
}
