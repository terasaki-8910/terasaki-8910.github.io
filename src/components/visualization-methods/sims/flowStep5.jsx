import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, ResetButton, SimToolbar } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, fmt } from '../../visualization/sims/rigidKit'
import { lic, spotNoise, vortexField } from '../../../utils/vis/flow'
import { seededRandom } from '../../../utils/vis/ct'
import { blitPixels } from './pixelKit'
import {
  DEMO_CENTERS, DEMO_X_RANGE, DEMO_Y_RANGE, boundsOf, clampInside, clipToFrame, demoVortices, drawHandle, fillGrayPixels, fitView, grayLut, graySwatch,
  imageSize, nearestHandle, pageStep, percentileRange, sampledField, useIsDark, useScheduledRedraw, whiteNoise,
} from './flowKit'

const MODES = [
  { value: 'noise', label: 'ノイズ' },
  { value: 'lic', label: 'LIC' },
  { value: 'spot', label: 'スポットノイズ' },
]
const PIXELS = 160 * 160 // 最終の画素数の目安(縦横比は絵の枠に合わせる)
const SPOTS = 2000
const L_DEFAULT = 12
const DRAFT_DELAY = 180 // 操作が止まってから、細かい絵に直すまでの時間(ms)

// 画像を作る。draft は操作中の粗い絵(画素数が 1/4)。場は渦の和を格子に測り直したもの(LIC は場を何百万回も呼ぶので)
function buildImage({ view, mode, length, centers, draft }) {
  const bounds = boundsOf(view)
  const spanX = bounds[2] - bounds[0]
  const spanY = bounds[3] - bounds[1]
  const aspect = view.frame.width / view.frame.height
  const { w, h } = imageSize(aspect, draft ? PIXELS / 4 : PIXELS)
  const noise = whiteNoise(w * h, seededRandom(5))
  if (mode === 'noise') return { w, h, values: noise, low: 0, high: 1 }
  const field = sampledField(vortexField(demoVortices(centers)), bounds, Math.min(320, Math.ceil(spanX / 0.015) + 1), Math.min(240, Math.ceil(spanY / 0.015) + 1))
  const wFinal = imageSize(aspect, PIXELS).w
  const pixelFinal = spanX / wFinal // 最終の画素 1 つぶんの長さ。L はこの画素を単位にする
  let values
  if (mode === 'lic') {
    values = lic(field, noise, w, h, Math.round((length * w) / wFinal), { bounds, step: 1 })
  } else {
    const width = Math.max(0.018, 1.2 * (spanX / w))
    values = spotNoise(field, w, h, SPOTS, { bounds, rand: seededRandom(7), length: Math.max(width, length * pixelFinal), width })
  }
  const range = percentileRange(values, 0.02, 0.98)
  return { w, h, values, low: range.low, high: range.high }
}

export default function FlowStep5() {
  const [mode, setMode] = useState('lic')
  const [length, setLength] = useState(L_DEFAULT)
  const dark = useIsDark()
  const state = useRef(null)
  state.current = { mode, length }
  const centers = useRef(DEMO_CENTERS.map((c) => [...c]))
  const [selected, setSelected] = useState(0) // 矢印キーで動かす渦(最後につかんだ渦、PageUp・PageDown で変える)
  const selectedRef = useRef(0)
  const grabbed = useRef(-1)
  const drafting = useRef(false)
  const timer = useRef(0)
  const cache = useRef({ key: '', image: null, pixels: null })
  const legend = useRef(null)
  const select = (i) => {
    selectedRef.current = i
    setSelected(i)
  }

  const draw = ({ ctx, width, height, colors }) => {
    const { mode: m, length: L } = state.current
    const view = fitView(width, height, DEMO_X_RANGE, DEMO_Y_RANGE)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    const draft = drafting.current && m !== 'noise'
    const key = [m, L, draft, centers.current.map((c) => c.join(',')).join(';'), Math.round(view.frame.width), Math.round(view.frame.height)].join('|')
    const c = cache.current
    if (c.key !== key) {
      c.image = buildImage({ view, mode: m, length: L, centers: centers.current, draft })
      c.key = key
      if (!c.pixels || c.pixels.length !== c.image.w * c.image.h * 4) c.pixels = new Uint8ClampedArray(c.image.w * c.image.h * 4)
    }
    const { image, pixels } = c
    fillGrayPixels(image.values, image.low, image.high, grayLut(colors), pixels)
    clipToFrame(ctx, view, () => {
      blitPixels(ctx, pixels, image.w, image.h, view.frame.left, view.frame.top, view.frame.width, view.frame.height)
      if (m !== 'noise') centers.current.forEach((p, i) => drawHandle(ctx, view.sx(p[0]), view.sy(p[1]), colors, i === selectedRef.current))
    })
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    const finalSize = imageSize(view.frame.width / view.frame.height, PIXELS)
    const chosen = centers.current[selectedRef.current]
    legend.current?.update({ size: `${finalSize.w} × ${finalSize.h}`, vortex: `${selectedRef.current + 1}（${fmt(chosen[0], 2)}, ${fmt(chosen[1], 2)}）` })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const schedule = useScheduledRedraw(redraw)
  // 操作中は粗い絵にして、止まってから細かい絵に直す
  const interact = () => {
    drafting.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      drafting.current = false
      schedule()
    }, DRAFT_DELAY)
    schedule()
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { redraw() }, [mode, dark, selected, redraw])
  useEffect(() => { if (state.current.mode !== 'noise') interact() }, [length])

  const viewNow = () => fitView(sizeRef.current.width, sizeRef.current.height, DEMO_X_RANGE, DEMO_Y_RANGE)
  const handles = () => {
    if (state.current.mode === 'noise') return []
    const view = viewNow()
    return centers.current.map((p) => ({ px: view.sx(p[0]), py: view.sy(p[1]) }))
  }
  const moveCenter = (view, i, x, y) => {
    centers.current[i] = clampInside(view, x, y)
    interact()
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => nearestHandle(handles(), point) >= 0,
    onDown: (point) => {
      const i = nearestHandle(handles(), point)
      if (i < 0) return false
      grabbed.current = i
      select(i)
      canvasRef.current?.focus({ preventScroll: true })
      interact()
      return true
    },
    onMove: ({ x, y }) => {
      if (grabbed.current < 0) return
      const view = viewNow()
      moveCenter(view, grabbed.current, view.wx(x), view.wy(y))
    },
    onUp: () => {
      grabbed.current = -1
      interact()
    },
  })
  const onKeyDown = (event) => {
    if (state.current.mode === 'noise') return
    const turn = pageStep(event)
    if (turn) {
      event.preventDefault()
      select((selectedRef.current + turn + centers.current.length) % centers.current.length)
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    const i = selectedRef.current
    moveCenter(viewNow(), i, centers.current[i][0] + step.dx * 0.05, centers.current[i][1] + step.dy * 0.05)
  }
  const reset = () => {
    centers.current = DEMO_CENTERS.map((c) => [...c])
    select(0)
    setMode('lic')
    setLength(L_DEFAULT)
    interact()
  }

  return (
    <SimShell
      label="ノイズを流れに沿って平均する（LIC）"
      switcher={<ModeSwitch variant="tabs" label="描き方" value={mode} onChange={setMode} options={MODES} />}
      stage={<SimCanvas ref={canvasRef} role={mode === 'noise' ? 'img' : 'application'} tabIndex={mode === 'noise' ? undefined : 0} scroll={mode === 'noise'} onKeyDown={onKeyDown} label={mode === 'noise' ? 'でたらめなノイズの濃淡の画像。流れとは関係せず、ノイズを流れに沿って平均する LIC や、楕円を重ねるスポットノイズとの見比べに使います。' : `3 つの渦がある流れを、${mode === 'lic' ? 'ノイズを流線に沿って平均した LIC' : '流れの向きに伸ばした楕円を重ねたスポットノイズ'}の濃淡の画像で描いた図。渦の中心の丸をドラッグで動かせます。PageUp・PageDown で渦を選び、矢印キーで動かします（Shift で大きく）。選択中は渦 ${selected + 1}。`} />}
      legend={(
        <SimLegend
          ref={legend}
          items={[
            { key: 'ramp', label: '画素の値', value: '小さい → 大きい', swatch: graySwatch(dark) },
            { key: 'size', label: '画素数', value: '', minChars: 9 },
            ...(mode !== 'noise' ? [{ key: 'vortex', label: '選んだ渦', value: '', minChars: 14 }] : []),
            ...(mode === 'lic' ? [{ key: 'steps', symbol: 'L', label: '片側の歩数', value: `${length} 画素ぶん` }] : []),
            ...(mode === 'spot' ? [{ key: 'spots', label: 'スポットの数', value: String(SPOTS) }, { key: 'half', symbol: 'L', label: 'スポットの半分の長さ', value: `${length} 画素ぶん` }] : []),
          ]}
        />
      )}
      controls={(
        <>
          <SimToolbar><ResetButton onClick={reset} /></SimToolbar>
          <ParamSlider symbol="L" label="長さ（片側）" unit=" 画素" value={length} min={0} max={30} step={1} onChange={setLength} disabled={mode === 'noise'} />
        </>
      )}
    />
  )
}
