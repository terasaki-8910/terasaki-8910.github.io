import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { PlayPauseButton, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop, { prefersReducedMotion } from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, arrowStep, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN, sinogram } from '../../../utils/vis/ct'
import {
  ANGLE_RATE, clampNumber, deg, drawBeam, drawBottomTicks, drawFrame, drawGrayImage, drawHatch, drawImageTitle,
  drawLeftTicks, phantomValues, rad, strokeHalo, worldView,
} from './ctKit'

const N = 128
const ANGLES = 180
const MARGIN = 1.45
const RADIUS = 1.05
const HALF = 0.92
const RAYS = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]
const DOT_MAX = 0.9
const DOT_START = [0.3, 0.45]

let baseSinogram = null // 全部の向き(180)の投影。一度だけ作る
const getSinogram = () => baseSinogram || (baseSinogram = sinogram(SHEPP_LOGAN, ANGLES, N))

function layoutOf(width, height) {
  const pad = 8
  if (width >= 480) {
    const side = Math.min(height - 2 * pad, width * 0.46)
    const inner = side / MARGIN
    const outer = { x: pad, y: (height - side) / 2, w: side, h: side }
    const image = { x: outer.x + (side - inner) / 2, y: outer.y + (side - inner) / 2, w: inner, h: inner }
    const left = outer.x + side + 44
    const top = Math.max(20, outer.y + (side - inner) / 2)
    return { image, sino: { x: left, y: top, w: Math.max(60, width - left - 22), h: Math.max(60, height - top - 32) } }
  }
  const sinoH = Math.min(150, Math.max(90, height * 0.3))
  const side = Math.min(width - 2 * pad, Math.max(120, height - sinoH - 30 - 36 - pad))
  const inner = side / MARGIN
  const outer = { x: (width - side) / 2, y: 4, w: side, h: side }
  const image = { x: outer.x + (side - inner) / 2, y: outer.y + (side - inner) / 2, w: inner, h: inner }
  const top = outer.y + side + 18
  return { image, sino: { x: 44, y: top, w: width - 44 - 22, h: Math.max(60, height - top - 30) } }
}

export default function CtStep2() {
  const [theta, setTheta] = useState(() => (prefersReducedMotion() ? rad(100) : 0))
  const [dot, setDot] = useState(DOT_START)
  const legendRef = useRef(null)
  const thetaRef = useRef(theta)
  thetaRef.current = theta
  const grabRef = useRef(false)
  const stateRef = useRef(null)
  stateRef.current = { theta, dot }

  const draw = ({ ctx, width, height, colors }) => {
    const { theta: th, dot: [dx, dy] } = stateRef.current
    const { image, sino } = layoutOf(width, height)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 模型: 光線(点を通る 1 本を目立たせる)、検出器、つかめる点
    drawGrayImage(ctx, colors, phantomValues(SHEPP_LOGAN, N), N, N, image)
    drawFrame(ctx, colors, image)
    const view = worldView(image)
    const s = dx * Math.cos(th) + dy * Math.sin(th)
    drawBeam(ctx, colors, view, th, { rays: RAYS, half: HALF, radius: RADIUS, active: s, arrow: true, rayAlpha: 0.35 })
    markerCircle(ctx, view.sx(dx), view.sy(dy), 7, { fill: colors.accent, stroke: colors.ink, lineWidth: 2 })

    // サイノグラム: いまの角度まで行が埋まり、点の正弦波が重なる
    const rows = Math.min(ANGLES, Math.floor((th / Math.PI) * ANGLES) + 1)
    drawGrayImage(ctx, colors, getSinogram(), N, ANGLES, sino, { rows, crispRows: true })
    if (rows < ANGLES) {
      const y = sino.y + (sino.h * rows) / ANGLES
      drawHatch(ctx, colors, { x: sino.x, y, w: sino.w, h: sino.y + sino.h - y })
    }
    drawFrame(ctx, colors, sino)
    const at = (angle) => [sino.x + ((dx * Math.cos(angle) + dy * Math.sin(angle) + 1) / 2) * sino.w, sino.y + (angle / Math.PI) * sino.h]
    const curve = (from, to) => Array.from({ length: 81 }, (_, i) => at(from + ((to - from) * i) / 80))
    strokeHalo(ctx, colors, curve(th, Math.PI), { color: colors.alpha('lane-1', 0.8), width: 1.5, dash: [4, 4] })
    strokeHalo(ctx, colors, curve(0, th), { color: colors.alpha('lane-1', 1), width: 2.5 })
    const [cx, cy] = at(th)
    markerCircle(ctx, cx, cy, 5, { fill: colors.alpha('lane-1', 1), stroke: colors.ink, lineWidth: 2 })
    drawBottomTicks(ctx, colors, sino, [{ at: 0, label: '−1' }, { at: 0.25, label: '−0.5' }, { at: 0.5, label: 's = 0' }, { at: 0.75, label: '0.5' }, { at: 1, label: '1' }].filter((_, i) => sino.w >= 200 || i % 2 === 0))
    drawLeftTicks(ctx, colors, sino, [{ at: 0, label: '0°' }, { at: 0.5, label: '90°' }, { at: 1, label: '180°' }])
    drawImageTitle(ctx, colors, 'サイノグラム', sino)
    legendRef.current?.update({ theta: `${deg(th).toFixed(0)}°`, s: fmt(s, 2) })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  const loop = useSimLoop((dt) => {
    const next = Math.min(Math.PI, thetaRef.current + dt * ANGLE_RATE)
    thetaRef.current = next
    setTheta(next)
    if (next >= Math.PI) loop.pause()
  }, { targetRef: canvasRef })
  const togglePlay = () => {
    if (!loop.running && thetaRef.current >= Math.PI - 1e-9) {
      thetaRef.current = 0
      setTheta(0)
    }
    loop.toggle()
  }
  const reset = () => {
    thetaRef.current = 0
    setTheta(0)
    setDot(DOT_START)
  }
  const scrub = (degrees) => {
    loop.pause()
    thetaRef.current = rad(degrees)
    setTheta(rad(degrees))
  }

  const viewOf = () => {
    const { width, height } = sizeRef.current
    return worldView(layoutOf(width, height).image)
  }
  const moveDot = (x, y) => {
    const r = Math.hypot(x, y)
    const k = r > DOT_MAX ? DOT_MAX / r : 1
    setDot([x * k, y * k])
  }
  const hit = (p) => {
    const view = viewOf()
    return Math.hypot(p.x - view.sx(dot[0]), p.y - view.sy(dot[1])) <= 7 + GRAB_SLOP_PX
  }
  usePointerDrag(canvasRef, {
    canGrab: hit,
    onDown: (p) => {
      if (!hit(p)) return false
      grabRef.current = true
      return true
    },
    onMove: (p) => {
      if (!grabRef.current) return
      const view = viewOf()
      moveDot(view.wx(p.x), view.wy(p.y))
    },
    onUp: () => { grabRef.current = false },
  })
  const onKeyDown = (event) => {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      scrub(clampNumber(Math.round(deg(thetaRef.current)) + (event.key === 'PageUp' ? 5 : -5), 0, 180))
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    moveDot(dot[0] + step.dx * 0.02, dot[1] + step.dy * 0.02)
  }
  // 凡例の点の位置(つかんだときだけ変わる値は、props で渡す)
  const position = `(${fmt(dot[0], 2)}, ${fmt(dot[1], 2)})`

  return (
    <SimShell
      label="サイノグラム"
      height={{ phone: [420, 460], pc: [300, 380] }}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="断面の上の点と、向きごとの投影を縦に積んだサイノグラム。点をドラッグするか矢印キーで動かすと、点が描く正弦波の形が変わります。PageUp と PageDown で X 線の向きを 5° ずつ変えられます。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'theta', symbol: '\\theta', label: 'X 線の向き', value: '0°', minChars: 5 },
        { key: 'point', symbol: '(x,\\ y)', label: '点の位置', value: position, minChars: 12 },
        { key: 's', symbol: 's', label: '点が写る位置', value: '0.00', minChars: 5 },
        { key: 'curve', label: '点の描く正弦波', swatch: 'var(--lane-1)' },
      ]} />}
      controls={<>
        <SimToolbar>
          <PlayPauseButton running={loop.running} onToggle={togglePlay} />
          <ResetButton onClick={reset} />
        </SimToolbar>
        <ParamSlider symbol="\theta" label="X 線の向き" unit="°" value={Math.round(deg(theta))} min={0} max={180} step={1} onChange={scrub} format={(v) => v.toFixed(0)} />
      </>}
    />
  )
}
