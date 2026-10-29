import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch, PlayPauseButton, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop, { prefersReducedMotion } from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX, arrowStep, drawText } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN } from '../../../utils/vis/ct'
import {
  ANGLE_RATE, DRAGGABLE, FILTER_OPTIONS, FILTER_TAB_OPTIONS, POST_OPTIONS, PRE_OPTIONS, VALUE_MAX,
  clampNumber, createPipeline, deg, drawBeam, drawBottomTicks, drawFrame, drawGrayImage, drawHatch, drawImageTitle, drawLeftTicks,
  drawRing, grayRampSwatch, nearestHandle, overviewLayout, phantomValues, rad, strokeHalo, useIsDark, worldView,
} from './ctKit'

const DEFAULTS = { nAngles: 90, nDet: 128, noise: 0, filter: 'shepp-logan', pre: 'none', post: 'none' }
const N_FULL = 128
const N_FAST = 64 // 楕円をつかんでいる間の再構成の大きさ
const MAX_CENTER = 0.9 // 楕円の中心を動かせる範囲(検出器の外に出ないように)
const FILTER_LABEL = Object.fromEntries(FILTER_OPTIONS.map((o) => [o.value, o.label]))

const initialEllipses = () => SHEPP_LOGAN.map((e) => e.slice())
const ringRadius = (view) => clampNumber(view.scale * 0.09, 4.5, 8)

export default function CtSim() {
  const [ellipses, setEllipses] = useState(initialEllipses)
  const [selected, setSelected] = useState(DRAGGABLE[1])
  const [params, setParams] = useState(DEFAULTS)
  const [theta, setTheta] = useState(() => (prefersReducedMotion() ? Math.PI : 0))
  const [dragging, setDragging] = useState(false)
  const [stageWidth, setStageWidth] = useState(0)
  const dark = useIsDark()
  const legendRef = useRef(null)
  const pipelineRef = useRef(null)
  if (!pipelineRef.current) pipelineRef.current = createPipeline()
  const thetaRef = useRef(theta)
  thetaRef.current = theta
  const grabRef = useRef(null)
  const stateRef = useRef(null)
  stateRef.current = { ellipses, selected, params, theta, dragging }

  const draw = ({ ctx, width, height, colors }) => {
    const s = stateRef.current
    const layout = overviewLayout(width, height)
    const { nAngles, nDet } = s.params
    const upTo = clampNumber(Math.floor((s.theta / Math.PI) * nAngles) + 1, 1, nAngles)
    const n = s.dragging ? N_FAST : N_FULL
    const result = pipelineRef.current({ ellipses: s.ellipses, ...s.params, upTo, n })
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)

    // 模型(X 線源と検出器、平行な光線)
    const { phantomOuter: outer, phantomImage: image, sino, recon } = layout
    drawGrayImage(ctx, colors, phantomValues(s.ellipses, N_FULL), N_FULL, N_FULL, image)
    drawFrame(ctx, colors, image)
    const view = worldView(image)
    ctx.save()
    ctx.beginPath()
    ctx.rect(outer.x, outer.y, outer.w, outer.h)
    ctx.clip()
    drawBeam(ctx, colors, view, s.theta, { rayAlpha: 0.45 })
    ctx.restore()
    const r = ringRadius(view)
    for (const i of DRAGGABLE) drawRing(ctx, colors, view.sx(s.ellipses[i][3]), view.sy(s.ellipses[i][4]), r, { selected: i === s.selected })
    drawImageTitle(ctx, colors, '模型', image)

    // サイノグラム(s が横、θ が縦。いまの角度まで埋まる)
    drawGrayImage(ctx, colors, result.measured, nDet, nAngles, sino, { rows: upTo, crispRows: true })
    if (upTo < nAngles) {
      const y = sino.y + (sino.h * upTo) / nAngles
      drawHatch(ctx, colors, { x: sino.x, y, w: sino.w, h: sino.y + sino.h - y })
    }
    drawFrame(ctx, colors, sino)
    const lineY = sino.y + sino.h * (s.theta / Math.PI)
    strokeHalo(ctx, colors, [[sino.x, lineY], [sino.x + sino.w, lineY]], { color: colors.alpha('lane-1', 1), width: 1.5 })
    drawBottomTicks(ctx, colors, sino, [{ at: 0, label: '−1' }, { at: 0.5, label: 's = 0' }, { at: 1, label: '1' }])
    drawLeftTicks(ctx, colors, sino, [{ at: 0, label: '0°' }, { at: 0.5, label: '90°' }, { at: 1, label: '180°' }])
    drawText(ctx, 'θ', sino.x - 7, sino.y - 8, { color: colors.ink, size: 12, align: 'right', baseline: 'bottom' })
    drawImageTitle(ctx, colors, 'サイノグラム', sino)

    // 再構成
    drawGrayImage(ctx, colors, result.recon, n, n, recon, { min: result.range[0], max: result.range[1] })
    drawFrame(ctx, colors, recon)
    drawImageTitle(ctx, colors, '再構成', recon)

    legendRef.current?.update({
      theta: `${deg(s.theta).toFixed(0)}°`,
      angles: `${upTo} / ${nAngles}`,
      rmse: result.rmse.toFixed(3),
    })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })

  // 絵の縦横比は幅から決める(3 つ横に並ぶ幅では横長、狭いときは縦長)。幅は絵の高さに関わらないので、揺り戻しは起きない
  useLayoutEffect(() => {
    const stage = canvasRef.current?.parentElement
    if (!stage) return undefined
    const measure = () => setStageWidth(Math.round(stage.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [canvasRef])
  const aspect = stageWidth > 0 ? stageWidth / overviewLayout(stageWidth).needed : 2.5

  const loop = useSimLoop((dt) => {
    const next = Math.min(Math.PI, thetaRef.current + dt * ANGLE_RATE)
    thetaRef.current = next
    setTheta(next)
    if (next >= Math.PI) loop.pause()
  }, { targetRef: canvasRef })
  const finishSweep = () => {
    loop.pause()
    thetaRef.current = Math.PI
    setTheta(Math.PI)
  }
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
    setEllipses(initialEllipses())
  }
  const setParam = (name) => (value) => setParams((p) => ({ ...p, [name]: value }))

  // 楕円の移動(つかむ・矢印キー)
  const moveEllipse = (index, x, y) => {
    const d = Math.hypot(x, y)
    const k = d > MAX_CENTER ? MAX_CENTER / d : 1
    setEllipses((list) => list.map((e, i) => (i === index ? [e[0], e[1], e[2], x * k, y * k, e[5]] : e)))
  }
  const hitOf = (p) => {
    const { width, height } = sizeRef.current
    const view = worldView(overviewLayout(width, height).phantomImage)
    const i = nearestHandle(view, DRAGGABLE.map((j) => [ellipses[j][3], ellipses[j][4]]), p, ringRadius(view) + GRAB_SLOP_PX)
    return i < 0 ? -1 : DRAGGABLE[i]
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hitOf(p) >= 0,
    onDown: (p) => {
      const index = hitOf(p)
      if (index < 0) return false
      const { width, height } = sizeRef.current
      const view = worldView(overviewLayout(width, height).phantomImage)
      grabRef.current = { index, dx: ellipses[index][3] - view.wx(p.x), dy: ellipses[index][4] - view.wy(p.y) }
      setSelected(index)
      setDragging(true)
      finishSweep()
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも動かせるように
      return true
    },
    onMove: ({ x, y }) => {
      const grab = grabRef.current
      if (!grab) return
      const { width, height } = sizeRef.current
      const view = worldView(overviewLayout(width, height).phantomImage)
      moveEllipse(grab.index, view.wx(x) + grab.dx, view.wy(y) + grab.dy)
    },
    onUp: () => {
      grabRef.current = null
      setDragging(false)
    },
  })
  const onKeyDown = (event) => {
    // Alt・Ctrl・Cmd つきはブラウザの操作(Ctrl+PageDown でタブを移るなど)に残す
    if ((event.key === 'PageUp' || event.key === 'PageDown') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const at = DRAGGABLE.indexOf(selected)
      setSelected(DRAGGABLE[(at + (event.key === 'PageUp' ? -1 : 1) + DRAGGABLE.length) % DRAGGABLE.length])
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    finishSweep()
    const e = ellipses[selected]
    moveEllipse(selected, e[3] + step.dx * 0.02, e[4] + step.dy * 0.02)
  }
  const scrub = (degrees) => {
    loop.pause()
    thetaRef.current = rad(degrees)
    setTheta(rad(degrees))
  }

  const { nAngles, nDet, noise, filter, pre, post } = params
  return (
    <SimShell
      label="CT の再構成"
      aspect={aspect}
      switcher={<ModeSwitch label="フィルタ" value={filter} options={FILTER_TAB_OPTIONS} onChange={setParam('filter')} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="模型・サイノグラム・再構成の 3 つの絵。模型の小さな楕円をドラッグするか、矢印キーで動かすと（Shift で大きく）、サイノグラムと再構成が追従します。PageUp と PageDown で動かす楕円を選べます。動かすと再生は止まり、全部の向きの投影で作り直します。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'theta', symbol: '\\theta', label: '今の角度', value: '0°', minChars: 5 },
        { key: 'angles', label: '使った投影', value: `${nAngles}`, minChars: 8 },
        { key: 'dets', label: '検出器の数', value: `${nDet}` },
        { key: 'filter', label: 'フィルタ', value: FILTER_LABEL[filter] },
        { key: 'noise', label: '雑音', value: `${(noise * 100).toFixed(1)} %` },
        { key: 'rmse', label: post === 'open' ? '誤差 RMSE（二値化した模型に対して）' : '誤差 RMSE', value: '—', minChars: 5 },
        { key: 'gray', label: '値の灰色', value: filter === 'none' && post !== 'open' ? `0 → ${VALUE_MAX}（再構成は最小 → 最大）` : `0 → ${VALUE_MAX}`, swatch: grayRampSwatch(dark) },
      ]} />}
      controls={<>
        <SimToolbar>
          <PlayPauseButton running={loop.running} onToggle={togglePlay} />
          <ResetButton onClick={reset} />
        </SimToolbar>
        <ParamSlider symbol="\theta" label="投影の角度" unit="°" value={Math.round(deg(theta))} min={0} max={180} step={1} onChange={scrub} format={(v) => v.toFixed(0)} />
        <ParamSlider symbol="N_\theta" label="角度の数" value={nAngles} min={6} max={180} step={1} onChange={setParam('nAngles')} />
        <ParamSlider symbol="N_s" label="検出器の数" value={nDet} min={64} max={256} step={8} onChange={setParam('nDet')} />
        <ParamSlider symbol="\sigma" label="雑音" value={noise} min={0} max={0.1} step={0.005} onChange={setParam('noise')} format={(v) => (v * 100).toFixed(1)} unit=" %" />
        <ControlGroup label="前処理（サイノグラムの s 方向）">
          <ModeSwitch label="前処理" value={pre} options={PRE_OPTIONS} onChange={setParam('pre')} variant="quiet" />
        </ControlGroup>
        <ControlGroup label="後処理（再構成した画像）">
          <ModeSwitch label="後処理" value={post} options={POST_OPTIONS} onChange={setParam('post')} variant="quiet" />
        </ControlGroup>
      </>}
    />
  )
}
