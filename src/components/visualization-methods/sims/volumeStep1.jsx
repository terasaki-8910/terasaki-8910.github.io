import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { transmittance } from '../../../utils/vis/volume'
import { arrowStep, clamp, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { selectKey } from './volumeKeys'

const initial = [{ x: 0.8, w: 0.75, sigma: 0.7 }, { x: 1.85, w: 0.75, sigma: 1.15 }, { x: 2.9, w: 0.75, sigma: 0.45 }]
const LENGTH = 4.5 // 煙の長さ L(x の範囲 0〜L)
const SIGMA_MAX = 1.6
const KEY_STEP = 0.05 // 矢印キー 1 回の量(位置も σ も。Shift で 5 倍)

export default function VolumeStep1() {
  const [blocks, setBlocks] = useState(initial)
  const [selected, setSelected] = useState(0)
  const stateRef = useRef({ blocks, selected })
  stateRef.current = { blocks, selected }
  const live = useRef(null)
  const announce = (text) => {
    if (live.current) live.current.textContent = text
  }
  const describe = (data, i) => `区間 ${i + 1} / ${data.length}：位置 ${fmt(data[i].x, 2)}、σ ${fmt(data[i].sigma, 2)}`
  const map = (width, height) => ({
    sx: (x) => 52 + x / LENGTH * (width - 70),
    sySigma: (y) => height * 0.38 - y / SIGMA_MAX * height * 0.25,
    syI: (y) => height - 30 - y * height * 0.28,
  })
  const sigmaAt = (x, data) => data.reduce((sum, block) => sum + (x >= block.x && x <= block.x + block.w ? block.sigma : 0), 0)
  const draw = ({ ctx, width, height, colors }) => {
    const { blocks: data, selected: active } = stateRef.current
    const view = map(width, height)
    ctx.save()
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    // 軸は muted(line は半透明で薄すぎる)
    ctx.strokeStyle = colors.muted; ctx.lineWidth = 1
    const axes = [[52, height * 0.38, width - 18, height * 0.38], [52, height - 30, width - 18, height - 30]]
    axes.forEach(([x0, y0, x1, y1]) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke() })
    // 文字は ink。I(x) の名前は目盛り「1」の上に置く(0.5 の目盛りと重ならない)
    ctx.fillStyle = colors.ink; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('σ(x)', 14, height * 0.2); ctx.fillText('I(x)', 17, view.syI(1) - 14)
    ;[0, 0.5, 1].forEach((value) => { ctx.fillText(String(value), 25, view.syI(value) + 4) })
    // I(x) の軸の目盛り(煙の中の位置 x。0〜4)
    ctx.textAlign = 'center'
    ;[0, 1, 2, 3, 4].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(view.sx(x), height - 30); ctx.lineTo(view.sx(x), height - 26); ctx.stroke()
      ctx.fillText(String(x), view.sx(x), height - 13)
    })
    ctx.fillText('x', width - 12, height - 13)
    ctx.textAlign = 'left'
    data.forEach((block, i) => {
      const left = view.sx(block.x); const right = view.sx(block.x + block.w); const top = view.sySigma(block.sigma)
      const weight = i === active ? 3 : 1.5 // 選んでいる区間は太い縁
      ctx.fillStyle = colors.alpha('lane-1', 0.28)
      ctx.fillRect(left, top, right - left, height * 0.38 - top)
      ctx.strokeStyle = colors.ink; ctx.lineWidth = weight; ctx.strokeRect(left, top, right - left, height * 0.38 - top)
      markerCircle(ctx, (left + right) / 2, top, 7, { fill: colors.accent, stroke: colors.ink, lineWidth: weight })
    })
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 2; ctx.beginPath()
    const count = 140
    for (let i = 0; i <= count; i++) {
      const x = LENGTH * i / count
      const dx = LENGTH / count
      const sigmas = Array.from({ length: i }, (_, j) => sigmaAt((j + 0.5) * dx, data))
      const intensity = transmittance(sigmas, dx)
      if (i === 0) ctx.moveTo(view.sx(x), view.syI(intensity)); else ctx.lineTo(view.sx(x), view.syI(intensity))
    }
    ctx.stroke()
    ctx.fillStyle = colors.ink; ctx.font = '16px sans-serif'; ctx.fillText('光', 10, height * 0.36)
    ctx.beginPath(); ctx.moveTo(34, height * 0.38); ctx.lineTo(48, height * 0.38); ctx.stroke()
    ctx.restore()
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() }, [blocks, selected])
  const hit = ({ x, y }) => {
    const view = map(sizeRef.current.width, sizeRef.current.height)
    let best = -1
    stateRef.current.blocks.forEach((block, i) => { if (Math.hypot(x - view.sx(block.x + block.w / 2), y - view.sySigma(block.sigma)) < 20) best = i })
    return best
  }
  const move = (i, position) => {
    setBlocks((data) => data.map((block, index) => index === i ? {
      ...block,
      x: clamp((position.x - 52) / (sizeRef.current.width - 70) * LENGTH - block.w / 2, 0, LENGTH - block.w),
      sigma: clamp((sizeRef.current.height * 0.38 - position.y) / (sizeRef.current.height * 0.25) * SIGMA_MAX, 0.05, SIGMA_MAX),
    } : block))
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hit(p) >= 0,
    onDown: (p) => {
      const i = hit(p)
      if (i < 0) return false
      stateRef.current.selected = i // 再描画を待たずに、つかんだ区間を動かす
      setSelected(i)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      move(i, p)
      return true
    },
    onMove: (p) => move(stateRef.current.selected, p),
  })
  const onKeyDown = (event) => {
    const { blocks: data, selected: active } = stateRef.current
    // PageUp・PageDown・Home・End: 区間を選ぶ
    const pick = selectKey(event, active, data.length)
    if (pick !== null) {
      event.preventDefault()
      stateRef.current.selected = pick
      setSelected(pick)
      announce(describe(data, pick))
      return
    }
    // 矢印キー: 選んでいる区間を動かす(左右が位置、上下が σ。Shift で 5 倍)
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const next = data.map((block, i) => i === active ? {
      ...block,
      x: clamp(block.x + step.dx * KEY_STEP, 0, LENGTH - block.w),
      sigma: clamp(block.sigma + step.dy * KEY_STEP, 0.05, SIGMA_MAX),
    } : block)
    stateRef.current.blocks = next
    setBlocks(next)
    announce(describe(next, active))
  }
  const exit = transmittance(blocks.map((block) => block.sigma), 0.75)
  return <SimShell label="吸収による光の減衰" stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label="煙の中を通る光の吸収。上は、吸収の大きさ σ を 3 つの区間（四角）の高さで表したグラフ。下は、光の強さ I(x) が煙の中で下がっていくグラフ。区間の上の丸をドラッグすると、区間の位置と σ が変わる。PageUp・PageDown で区間を選び、矢印キーで動かす（左右が位置、上下が σ、Shift で 5 倍）" />} legend={<>
    <SimLegend items={[
      { key: 'exit', symbol: '\\tau(0,L)', label: '出口の透過率', value: exit.toFixed(3) },
      { key: 'ratio', label: '同じ厚さの減少率', value: '同じ σ なら一定' },
    ]} />
    <span className="sr-only" role="status" aria-live="polite" ref={live} />
  </>} />
}
