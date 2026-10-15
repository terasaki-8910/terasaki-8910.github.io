import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import { useStacked, useHandleDrag, arrowDelta } from './transformHooks.js'
import { ReadNote } from './transformMatrixView.jsx'
import { S6, STEP6_DEFAULT, step6Pixel, step6Handles, step6Drag, step6Nudge, drawStep6 } from './transformPerspective.js'

// 段階 6「ビューポート変換」: −1〜1 の正方形(正規化デバイス座標)と、ウィンドウの画素の長方形。
// 点をつかむと、画素の座標が出る。ウィンドウの大きさ(右上の角をつかむか、スライダー)を変えても、同じ割合の位置に写る。
// 変換は projection.js の viewport。ここは状態と操作。
const IDS = ['ndc', 'pix', 'size']
const NAMES = { ndc: '左の点', pix: '右の点', size: 'ウィンドウの大きさ' }
const f2 = (v) => v.toFixed(2)

export default function TransformStep6() {
  const [s, setS] = useState(STEP6_DEFAULT)
  const [active, setActive] = useState(null)
  const [sel, setSel] = useState('ndc')
  const params = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    drawStep6({ ctx, width, height, colors }, p.s, { stacked: p.stacked, active: p.active })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const stacked = useStacked(canvasRef)
  params.current = { s, active, stacked }
  useEffect(() => {
    redraw()
  }, [s, active, stacked, redraw])

  const sizeNow = () => [sizeRef.current.width, sizeRef.current.height]
  useHandleDrag(canvasRef, {
    getHandles: () => {
      const [w, h] = sizeNow()
      return step6Handles(w, h, params.current.stacked, params.current.s)
    },
    onDrag: (id, { x, y }, phase) => {
      if (phase === 'down') {
        setActive(id)
        setSel(id)
      }
      const [w, h] = sizeNow()
      setS((v) => ({ ...v, ...step6Drag(w, h, params.current.stacked, v, id, x, y) }))
    },
    onEnd: () => setActive(null),
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setSel((id) => IDS[(IDS.indexOf(id) + 1) % IDS.length])
      return
    }
    const move = arrowDelta(event, 1, 5)
    if (!move) return
    event.preventDefault()
    setS((v) => ({ ...v, ...step6Nudge(v, sel, move[0], move[1]) }))
  }

  const px = step6Pixel(s)
  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))
  const setNdc = (i) => (value) => setS((v) => ({ ...v, ndc: i === 0 ? [value, v.ndc[1]] : [v.ndc[0], value] }))

  return (
    <SimShell
      label="ビューポート変換のシミュレーション"
      height={{ pc: [stacked ? 440 : 300, stacked ? 480 : 360], phone: [stacked ? 440 : 260, stacked ? 480 : 320] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label={`正規化デバイス座標の正方形とウィンドウの長方形。どちらの点もドラッグで動かせ、ウィンドウは右上の角で大きさを変えられる。画素の座標は文字で出る。矢印キーで動かし、Space で対象を切り替える。いまは${NAMES[sel]}`}
        />
      }
      readout={
        <>
          <p className="m-0">
            x_s = x₀ + (W/2)(x_n + 1) = 0 + ({s.W}/2)({f2(s.ndc[0])} + 1) = <strong>{Math.round(px.x)}</strong> px
          </p>
          <p className="m-0">
            y_s = y₀ + (H/2)(y_n + 1) = 0 + ({s.H}/2)({f2(s.ndc[1])} + 1) = <strong>{Math.round(px.y)}</strong> px
          </p>
          <ReadNote>
            ウィンドウの中の位置は、左から {Math.round(px.fx * 100)} %、下から {Math.round(px.fy * 100)} %。W と H を変えても、この割合は変わらない。
            画素の y は下から数える（画面の描画では上から数えることが多いので、描くときに H − y_s にする）。
          </ReadNote>
          <span className="sr-only" role="status" aria-live="polite">
            {`動かす対象: ${NAMES[sel]}`}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar label="操作">
            <ResetButton onClick={() => setS(STEP6_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="点（正規化デバイス座標）">
            <ParamSlider symbol="x_n" label="横" value={s.ndc[0]} min={-1} max={1} step={0.01} onChange={setNdc(0)} format={f2} />
            <ParamSlider symbol="y_n" label="縦（上が正）" value={s.ndc[1]} min={-1} max={1} step={0.01} onChange={setNdc(1)} format={f2} />
          </ControlGroup>
          <ControlGroup label="ウィンドウの大きさ">
            <ParamSlider symbol="W" label="幅" unit="px" value={s.W} min={S6.W[0]} max={S6.W[1]} step={S6.STEP} onChange={set('W')} />
            <ParamSlider symbol="H" label="高さ" unit="px" value={s.H} min={S6.H[0]} max={S6.H[1]} step={S6.STEP} onChange={set('H')} />
          </ControlGroup>
        </>
      }
    />
  )
}
