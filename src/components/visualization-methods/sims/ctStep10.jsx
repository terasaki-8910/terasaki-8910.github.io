import { useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch, ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { arrowStep, clamp, drawText } from '../../visualization/sims/rigidKit'
import { seededRandom } from '../../../utils/vis/ct'
import { SE_CROSS, SE_DISK, SE_SQUARE, close, dilate, erode, open, threshold } from '../../../utils/vis/imageFilter'
import { blitPixels } from './pixelKit'
import { NARROW_WIDTH, SLICE_N, fixedHeight, frameRect, insideRect, sliceImage, useStageWidth } from './ctFilterKit'

const N = SLICE_N
const PAD = 6
const GAP = 8
const TITLE_H = 18
const THRESHOLD = 0.12 // 二値化のしきい値(脳の中の値 0.2 より少し下)
const OPERATIONS = [
  { value: 'dilate', label: '膨張', run: dilate },
  { value: 'erode', label: '収縮', run: erode },
  { value: 'open', label: '開放', run: open },
  { value: 'close', label: '閉鎖', run: close },
]
const ELEMENTS = [
  { value: 'square', label: '正方形', se: SE_SQUARE },
  { value: 'cross', label: '十字', se: SE_CROSS },
  { value: 'disk', label: '円', se: SE_DISK },
]
const INITIAL = { op: 'open', element: 'square', brush: 3, cursor: [32, 32] }

// 点を散らす: count 個の画素を、でたらめに(種つき)入れ替える。背景なら孤立した点、形の中なら穴になる
function scatter(mask, seed, count) {
  const rand = seededRandom(seed)
  for (let i = 0; i < count; i++) {
    const at = Math.floor(rand() * N) * N + Math.floor(rand() * N)
    mask[at] = mask[at] ? 0 : 1
  }
}

// 初めの形: 作り直した断面を二値化したものに、点を散らしたもの
function initialMask() {
  const mask = Uint8Array.from(threshold(sliceImage(), THRESHOLD))
  scatter(mask, 1, 40)
  return mask
}

// 絵の割り付け(幅 width だけで決まる): 形 X と結果の 2 つの画像と、構造化要素 B の図
function layout(width) {
  if (width < NARROW_WIDTH) {
    const side = Math.floor((width - 2 * PAD - GAP) / 2) - 2
    const y = PAD + TITLE_H
    const glyph = { x: PAD + 2, y: y + side + 12, cell: 9 }
    return {
      input: { x: PAD, y, w: side, h: side },
      result: { x: width - PAD - side, y, w: side, h: side },
      titleY: PAD + 12,
      glyph,
      labelPos: { x: glyph.x + 5 * glyph.cell + 12, y: glyph.y + 17 },
      height: glyph.y + 5 * glyph.cell + PAD,
    }
  }
  const side = clamp(Math.floor((width - 2 * PAD - 2 * GAP - 130) / 2), 120, 230)
  const y = PAD + TITLE_H
  const left = PAD + 2 * side + 2 * GAP + 8
  return {
    input: { x: PAD, y, w: side, h: side },
    result: { x: PAD + side + GAP, y, w: side, h: side },
    titleY: PAD + 12,
    glyph: { x: left + 2, y: y + 22, cell: 12 },
    labelPos: { x: left, y: y + 12 },
    height: y + side + PAD,
  }
}

// 形 X の画素: 形は ink、背景は surface
function inputPixels(colors, mask) {
  const out = new Uint8ClampedArray(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const c = mask[i] ? colors.rgb.ink : colors.rgb.surface
    out[i * 4] = c[0]
    out[i * 4 + 1] = c[1]
    out[i * 4 + 2] = c[2]
    out[i * 4 + 3] = 255
  }
  return out
}

// 結果の画素: 残った所は ink、増えた所は diff-insert、減った所は diff-delete、ほかは surface
function resultPixels(colors, mask, result) {
  const out = new Uint8ClampedArray(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const c = mask[i] && result[i] ? colors.rgb.ink : result[i] ? colors.rgb['diff-insert'] : mask[i] ? colors.rgb['diff-delete'] : colors.rgb.surface
    out[i * 4] = c[0]
    out[i * 4 + 1] = c[1]
    out[i * 4 + 2] = c[2]
    out[i * 4 + 3] = 255
  }
  return out
}

// 構造化要素 B の図: 5 × 5 の枠の中に、B の画素を ink で塗り、原点(0, 0)に surface の点
function drawElement(ctx, colors, se, glyph) {
  const { x, y, cell } = glyph
  ctx.save()
  ctx.strokeStyle = colors.muted
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, 5 * cell, 5 * cell)
  ctx.fillStyle = colors.ink
  for (const [dx, dy] of se) ctx.fillRect(x + (dx + 2) * cell + 1, y + (dy + 2) * cell + 1, cell - 1, cell - 1)
  ctx.fillStyle = colors.surface
  ctx.beginPath()
  ctx.arc(x + 2.5 * cell + 0.5, y + 2.5 * cell + 0.5, Math.max(1.5, cell / 5), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export default function CtStep10() {
  const maskRef = useRef(null)
  if (maskRef.current === null) maskRef.current = initialMask()
  const [version, setVersion] = useState(0)
  const [op, setOp] = useState(INITIAL.op)
  const [element, setElement] = useState(INITIAL.element)
  const [erase, setErase] = useState(false)
  const [brush, setBrush] = useState(INITIAL.brush)
  const [cursor, setCursor] = useState(INITIAL.cursor)
  const [focused, setFocused] = useState(false)
  const sprinkled = useRef(0)
  const dragRef = useRef(null)
  const elementDef = ELEMENTS.find((e) => e.value === element)
  const opDef = OPERATIONS.find((o) => o.value === op)

  const result = useMemo(() => opDef.run(maskRef.current, N, N, elementDef.se), [version, opDef, elementDef])
  const counts = useMemo(() => {
    let added = 0
    let removed = 0
    const mask = maskRef.current
    for (let i = 0; i < N * N; i++) {
      if (result[i] && !mask[i]) added++
      else if (!result[i] && mask[i]) removed++
    }
    return { added, removed }
  }, [result])

  const draw = ({ ctx, width, height, colors }) => {
    const L = layout(width)
    const mask = maskRef.current
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    blitPixels(ctx, inputPixels(colors, mask), N, N, L.input.x, L.input.y, L.input.w, L.input.h, { smooth: false })
    frameRect(ctx, colors, L.input)
    blitPixels(ctx, resultPixels(colors, mask, result), N, N, L.result.x, L.result.y, L.result.w, L.result.h, { smooth: false })
    frameRect(ctx, colors, L.result)
    drawText(ctx, '形 X', L.input.x, L.titleY, { color: colors.ink, size: 12 })
    drawText(ctx, `${opDef.label}した結果`, L.result.x, L.titleY, { color: colors.ink, size: 12 })
    drawText(ctx, '構造化要素 B', L.labelPos.x, L.labelPos.y, { color: colors.ink, size: 12 })
    drawElement(ctx, colors, elementDef.se, L.glyph)
    if (focused) {
      // キーボードで描くときの位置(1 画素)
      const sx = L.input.w / N
      ctx.save()
      ctx.beginPath()
      ctx.rect(L.input.x, L.input.y, L.input.w, L.input.h)
      ctx.clip()
      ctx.strokeStyle = colors.surface
      ctx.lineWidth = 4
      ctx.strokeRect(L.input.x + cursor[0] * sx, L.input.y + cursor[1] * sx, sx, sx)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2
      ctx.strokeRect(L.input.x + cursor[0] * sx, L.input.y + cursor[1] * sx, sx, sx)
      ctx.restore()
    }
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const width = useStageWidth(canvasRef)
  useEffect(() => { redraw() }, [version, result, opDef, elementDef, focused, cursor, redraw])

  const inputRect = () => layout(sizeRef.current.width).input
  const pixelAt = (rect, p) => [clamp(Math.floor(((p.x - rect.x) / rect.w) * N), 0, N - 1), clamp(Math.floor(((p.y - rect.y) / rect.h) * N), 0, N - 1)]
  // 画素 (cx, cy) を中心にブラシを押す(直径 brush 画素。描くか消すか)
  const stamp = (cx, cy) => {
    const mask = maskRef.current
    const r = brush / 2
    const reach = Math.ceil(r)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (dx * dx + dy * dy <= r * r && x >= 0 && y >= 0 && x < N && y < N) mask[y * N + x] = erase ? 0 : 1
      }
    }
  }
  const strokeTo = (from, to) => {
    const steps = Math.max(1, Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))
    for (let i = 1; i <= steps; i++) stamp(Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps))
    setVersion((v) => v + 1)
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => insideRect(inputRect(), p),
    onDown: (p) => {
      const rect = inputRect()
      if (!insideRect(rect, p)) return false
      canvasRef.current?.focus({ preventScroll: true })
      const at = pixelAt(rect, p)
      dragRef.current = { last: at }
      setCursor(at)
      stamp(at[0], at[1])
      setVersion((v) => v + 1)
      return true
    },
    onMove: (p) => {
      const drag = dragRef.current
      if (!drag) return
      const at = pixelAt(inputRect(), p)
      strokeTo(drag.last, at)
      drag.last = at
      setCursor(at)
    },
    onUp: () => { dragRef.current = null },
  })
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return // ブラウザの操作に残す
    const step = arrowStep(event)
    if (step) {
      event.preventDefault()
      setCursor(([x, y]) => [clamp(x + step.dx, 0, N - 1), clamp(y - step.dy, 0, N - 1)])
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      stamp(cursor[0], cursor[1])
      setVersion((v) => v + 1)
    }
  }
  const sprinkle = () => {
    sprinkled.current += 1
    scatter(maskRef.current, 100 + sprinkled.current, 40)
    setVersion((v) => v + 1)
  }
  const reset = () => {
    maskRef.current = initialMask()
    sprinkled.current = 0
    setOp(INITIAL.op)
    setElement(INITIAL.element)
    setErase(false)
    setBrush(INITIAL.brush)
    setCursor(INITIAL.cursor)
    setVersion((v) => v + 1)
  }

  return (
    <SimShell
      label="形を整える"
      height={fixedHeight(layout(width).height)}
      switcher={<ModeSwitch label="操作" value={op} options={OPERATIONS} onChange={setOp} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} label="白黒の形 X と、構造化要素 B で整えた結果。形 X の上をドラッグすると描き足せます（「消す」を押しているときは消せます）。矢印キーで画素を選び（Shift で大きく）、スペースキーか Enter キーで描き足すか消します。" />}
      legend={<SimLegend items={[
        { key: 'kept', label: '残った画素', swatch: 'var(--color-ink)' },
        { key: 'added', label: '増えた画素', value: String(counts.added), swatch: 'var(--diff-insert)', minChars: 4 },
        { key: 'removed', label: '減った画素', value: String(counts.removed), swatch: 'var(--diff-delete)', minChars: 4 },
      ]} />}
      controls={<>
        <SimToolbar>
          <ToggleButton pressed={erase} onChange={setErase}>消す</ToggleButton>
          <button type="button" className="vis-btn" onClick={sprinkle}><span>点を散らす</span></button>
          <ResetButton onClick={reset} />
        </SimToolbar>
        <ControlGroup label="構造化要素 B">
          <ModeSwitch label="B の形" value={element} options={ELEMENTS} onChange={setElement} variant="quiet" />
        </ControlGroup>
        <ParamSlider label="ブラシの太さ" value={brush} min={1} max={7} step={2} unit=" 画素" onChange={setBrush} />
      </>}
    />
  )
}
