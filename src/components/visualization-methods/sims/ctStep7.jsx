import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, drawText } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN, addNoise, backproject, fbp, rasterizePhantom, rmse, sinogram } from '../../../utils/vis/ct'
import { NARROW_WIDTH, SLICE_WINDOW, drawGrabHandle, drawGrayImage, fixedHeight, splitCells, useGraySwatch, useStageWidth } from './ctFilterKit'

// つかめる楕円(SHEPP_LOGAN の 4〜9 番目: 中くらいの 1 つと、小さな 5 つ)。つかむと中心 (x0, y0) が動く
const GRABBABLE = [4, 5, 6, 7, 8, 9]
const INITIAL_POS = GRABBABLE.map((i) => [SHEPP_LOGAN[i][3], SHEPP_LOGAN[i][4]])
const INITIAL = { win: 'ram-lak', angles: 60, noise: 0 }
// 中心を動かせる範囲(脳の内側の楕円の 85%)
const HEAD = { a: 0.56, b: 0.74, cy: -0.0184 }
const WINDOW_OPTIONS = [
  { value: 'ram-lak', label: 'ランプ' },
  { value: 'shepp-logan', label: 'シェップ-ローガン' },
  { value: 'hann', label: 'ハン' },
]
const TITLE_H = 18
const FOOT_H = 16

function ellipsesFor(pos) {
  return SHEPP_LOGAN.map((e, i) => {
    const k = GRABBABLE.indexOf(i)
    return k < 0 ? e : [e[0], e[1], e[2], pos[k][0], pos[k][1], e[5]]
  })
}

function clampToHead([x, y]) {
  const q = Math.hypot(x / HEAD.a, (y - HEAD.cy) / HEAD.b)
  return q > 1 ? [x / q, HEAD.cy + (y - HEAD.cy) / q] : [x, y]
}

// 撮って、作り直す。つかんで動かしている間(fast)は、画像と検出器の数を減らして軽くする
function reconstruct(pos, nAngles, win, noise, fast) {
  const nDet = fast ? 96 : 128
  const n = fast ? 64 : 96
  const ellipses = ellipsesFor(pos)
  const truth = rasterizePhantom(n, ellipses)
  let sino = sinogram(ellipses, nAngles, nDet)
  if (noise > 0) sino = addNoise(sino, noise / 100, 5)
  const rec = fbp(sino, nAngles, nDet, n, win)
  // フィルタなしの逆投影は値が模型の何倍にもなるので、画素の合計を模型にそろえてから見せる(全体の絵と同じ)
  const bp = backproject(sino, nAngles, nDet, n)
  let sumTruth = 0
  let sumBp = 0
  for (let i = 0; i < bp.length; i++) { sumTruth += truth[i]; sumBp += bp[i] }
  const gain = sumBp > 0 ? sumTruth / sumBp : 1
  let bpMax = 1e-6
  for (let i = 0; i < bp.length; i++) { bp[i] *= gain; bpMax = Math.max(bpMax, bp[i]) }
  let sinoMax = 0
  for (const v of sino) sinoMax = Math.max(sinoMax, v)
  return { n, nDet, truth, sino, sinoMax, rec, bp, bpMax, rmseFbp: rmse(rec, truth), rmseBp: rmse(bp, truth) }
}

// 4 つの絵(模型・サイノグラム・フィルタ補正・逆投影のみ)。広いときは横に 1 列、狭いときは 2 × 2。
// 各枠は 題 → 正方形の画像 → 下の文字。枠の中で縦の真ん中に置く
function layout(width, height) {
  const area = { x: 6, y: 6, w: width - 12, h: height - 12 }
  const cells = width < NARROW_WIDTH ? splitCells(area, 2, 2, 6) : splitCells(area, 4, 1, 8)
  const [phantom, sino, rec, bp] = cells.map((cell) => {
    const side = Math.max(40, Math.floor(Math.min(cell.w - 2, cell.h - TITLE_H - FOOT_H)))
    const top = cell.y + Math.max(0, (cell.h - (TITLE_H + side + FOOT_H)) / 2)
    const image = { x: Math.round(cell.x + (cell.w - side) / 2), y: Math.round(top + TITLE_H), w: side, h: side }
    return { image, titleY: image.y - 5, footY: image.y + side + 12 }
  })
  return { phantom, sino, rec, bp }
}

// 絵の高さ: 画像が枠の幅いっぱいになる高さ(広いときは 4 つを横に 1 列、狭いときは 2 × 2)
function stageHeight(width) {
  if (width < NARROW_WIDTH) return 2 * (TITLE_H + Math.floor((width - 18) / 2) - 2 + FOOT_H) + 18
  return TITLE_H + Math.floor((width - 36) / 4) - 2 + FOOT_H + 12
}

const toScreen = (rect, x, y) => [rect.x + ((x + 1) / 2) * rect.w, rect.y + ((1 - y) / 2) * rect.h]
const toWorld = (rect, p) => [((p.x - rect.x) / rect.w) * 2 - 1, 1 - ((p.y - rect.y) / rect.h) * 2]

export default function CtStep7() {
  const [win, setWin] = useState(INITIAL.win)
  const [angles, setAngles] = useState(INITIAL.angles)
  const [noise, setNoise] = useState(INITIAL.noise)
  const [pos, setPos] = useState(INITIAL_POS)
  const [selected, setSelected] = useState(0)
  const [fast, setFast] = useState(false)
  const dragRef = useRef(null)
  const data = useMemo(() => reconstruct(pos, angles, win, noise, fast), [pos, angles, win, noise, fast])
  const swatch = useGraySwatch()

  const draw = ({ ctx, width, height, colors }) => {
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const L = layout(width, height)
    const { n } = data
    const [lo, hi] = SLICE_WINDOW
    const label = (item, text) => drawText(ctx, text, item.image.x, item.titleY, { color: colors.ink, size: 12 })
    const foot = (item, text) => drawText(ctx, text, item.image.x, item.footY, { color: colors.ink, size: 11 })

    drawGrayImage(ctx, colors, data.truth, n, n, L.phantom.image, { lo, hi })
    pos.forEach(([x, y], k) => {
      const [sx, sy] = toScreen(L.phantom.image, x, y)
      drawGrabHandle(ctx, colors, sx, sy, { r: 4.5, selected: k === selected })
    })
    label(L.phantom, '模型')

    drawGrayImage(ctx, colors, data.sino, data.nDet, angles, L.sino.image, { lo: 0, hi: data.sinoMax, smooth: angles >= 40 })
    label(L.sino, 'サイノグラム')
    foot(L.sino, `${angles} 方向`)

    drawGrayImage(ctx, colors, data.rec, n, n, L.rec.image, { lo, hi })
    label(L.rec, 'フィルタ補正逆投影')
    foot(L.rec, `RMSE ${data.rmseFbp.toFixed(3)}`)

    drawGrayImage(ctx, colors, data.bp, n, n, L.bp.image, { lo, hi: data.bpMax })
    label(L.bp, '逆投影のみ')
    foot(L.bp, `RMSE ${data.rmseBp.toFixed(3)}`)
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const stageWidth = useStageWidth(canvasRef)
  useEffect(() => { redraw() }, [data, pos, selected, redraw])

  const phantomRect = () => layout(sizeRef.current.width, sizeRef.current.height).phantom.image
  // 押した所に近い、つかめる楕円(中心から 12 px か、楕円の大きさの内側)
  const hit = (p) => {
    const rect = phantomRect()
    let best = -1
    let bestD = Infinity
    pos.forEach(([x, y], k) => {
      const [sx, sy] = toScreen(rect, x, y)
      const e = SHEPP_LOGAN[GRABBABLE[k]]
      const reach = Math.max(12, ((e[1] + e[2]) / 2) * (rect.w / 2))
      const d = Math.hypot(p.x - sx, p.y - sy)
      if (d <= reach && d < bestD) { best = k; bestD = d }
    })
    return best
  }
  const moveTo = (k, point) => setPos((current) => current.map((q, i) => (i === k ? clampToHead(point) : q)))
  usePointerDrag(canvasRef, {
    canGrab: (p) => hit(p) >= 0,
    onDown: (p) => {
      const k = hit(p)
      if (k < 0) return false
      const [wx, wy] = toWorld(phantomRect(), p)
      dragRef.current = { k, dx: pos[k][0] - wx, dy: pos[k][1] - wy }
      setSelected(k)
      setFast(true)
      canvasRef.current?.focus({ preventScroll: true })
      return true
    },
    onMove: (p) => {
      const drag = dragRef.current
      if (!drag) return
      const [wx, wy] = toWorld(phantomRect(), p)
      moveTo(drag.k, [wx + drag.dx, wy + drag.dy])
    },
    onUp: () => {
      dragRef.current = null
      setFast(false)
    },
  })
  const onKeyDown = (event) => {
    if (/^[1-6]$/.test(event.key)) {
      setSelected(Number(event.key) - 1)
      event.preventDefault()
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    setPos((current) => current.map((q, i) => (i === selected ? clampToHead([q[0] + step.dx * 0.01, q[1] + step.dy * 0.01]) : q)))
  }
  const reset = () => { setWin(INITIAL.win); setAngles(INITIAL.angles); setNoise(INITIAL.noise); setPos(INITIAL_POS); setSelected(0) }

  return (
    <SimShell
      label="フィルタ補正逆投影"
      height={fixedHeight(stageHeight(stageWidth))}
      switcher={<ModeSwitch label="フィルタ" value={win} options={WINDOW_OPTIONS} onChange={setWin} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="模型と、その投影を並べたサイノグラム、フィルタ補正逆投影、フィルタなしの逆投影。模型の中の丸い取っ手（1 から 6）をドラッグすると、その楕円が動いて作り直した断面が変わります。数字キーで取っ手を選び、矢印キーで動かせます。" />}
      legend={<SimLegend items={[
        { key: 'ramp', label: '模型と断面の値', value: '0 → 0.6', swatch },
        { key: 'bp', label: '逆投影のみの値', value: '0 → 最大', swatch },
        { key: 'angles', label: '向きの数', value: `${angles}`, minChars: 4 },
      ]} />}
      controls={<>
        <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
        <ParamSlider symbol="N" label="向きの数" value={angles} min={6} max={180} step={1} onChange={setAngles} />
        <ParamSlider label="雑音" value={noise} min={0} max={10} step={1} unit="%" onChange={setNoise} />
      </>}
    />
  )
}
