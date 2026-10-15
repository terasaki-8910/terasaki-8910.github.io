import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { boxHit } from './transformMesh.js'
import { clamp, roundTo } from './transformCommon.js'
import { arrowDelta } from './transformHooks.js'
import { Mat, Vec, Op, MatRow, ReadNote } from './transformMatrixView.jsx'
import {
  STEP12_CAMERA,
  STEP1_DEFAULT,
  STEP1_LIMIT,
  boxView,
  step1Model,
  step1Grab,
  step1Drag,
  drawStep1,
} from './transformBoxScene.js'

// 段階 1「同次座標と平行移動」: 箱をつかんで動かすと、平行移動の量 (tx, ty, tz) と、4×4 行列 × 点の計算が追従する。
// 位置 p(w = 1)は箱と一緒に動き、向き d(w = 0)は動かない。計算は mat4.js の translate・transformPoint。
// ここは状態と操作で、絵は transformBoxScene.js。
const fmt1 = (v) => v.toFixed(2)
const round = (v) => roundTo(v, 0.05)

export default function TransformStep1() {
  const [s, setS] = useState(STEP1_DEFAULT)
  const [grabbed, setGrabbed] = useState(false)
  const params = useRef(null)
  params.current = { s, grabbed }
  const drag = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawStep1({ ctx, width, height, colors }, params.current.s, { grabbed: params.current.grabbed })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  }, [s, grabbed, redraw])

  const viewNow = () => boxView({ left: 0, top: 0, width: sizeRef.current.width, height: sizeRef.current.height }, STEP12_CAMERA)
  const overBox = ({ x, y }) => {
    const view = viewNow()
    return boxHit(view.VP, step1Model(params.current.s).T, view.rect, x, y)
  }

  usePointerDrag(canvasRef, {
    canGrab: overBox,
    onDown: ({ x, y }) => {
      if (!overBox({ x, y })) return false
      const offset = step1Grab(viewNow(), params.current.s, x, y)
      if (!offset) return false
      drag.current = offset
      setGrabbed(true)
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、矢印キーでも動かせるように
      return undefined
    },
    onMove: ({ x, y }) => {
      if (!drag.current) return
      const next = step1Drag(viewNow(), params.current.s, drag.current, x, y)
      if (next) setS((v) => ({ ...v, ...next }))
    },
    onUp: () => {
      drag.current = null
      setGrabbed(false)
    },
  })

  // 矢印キー: 左右が x、上下が y(Shift で大きく)。PageUp・PageDown が z(手前・奥)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const move = arrowDelta(event, 0.05, 0.5)
    let dz = 0
    if (event.key === 'PageUp') dz = event.shiftKey ? 0.5 : 0.05
    else if (event.key === 'PageDown') dz = event.shiftKey ? -0.5 : -0.05
    if (!move && !dz) return
    event.preventDefault()
    setS((v) => ({
      tx: clamp(round(v.tx + (move ? move[0] : 0)), -STEP1_LIMIT, STEP1_LIMIT),
      ty: clamp(round(v.ty + (move ? move[1] : 0)), -STEP1_LIMIT, STEP1_LIMIT),
      tz: clamp(round(v.tz + dz), -STEP1_LIMIT, STEP1_LIMIT),
    }))
  }

  const m = step1Model(s)
  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))

  return (
    <SimShell
      label="同次座標と平行移動のシミュレーション"
      height={{ pc: [300, 360], phone: [260, 320] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="箱と、その角の点 p。箱をドラッグで動かすと、平行移動の量と行列の計算が変わる。矢印キーで x と y、PageUp・PageDown で z を動かせる"
        />
      }
      readout={
        <>
          <MatRow label="平行移動の行列と位置 p の積">
            <Mat name="T" m={m.T} hiCols={[3]} />
            <Op>×</Op>
            <Vec name="p" v={m.p} />
            <Op>=</Op>
            <Vec name="p'" v={m.pAfter} hi={[0, 1, 2]} />
          </MatRow>
          <MatRow label="平行移動の行列と向き d の積">
            <Mat name="T" m={m.T} hiCols={[3]} />
            <Op>×</Op>
            <Vec name="d" v={m.d} />
            <Op>=</Op>
            <Vec name="d'" v={m.dAfter} />
          </MatRow>
          <ReadNote>
            p は箱の角（w = 1）で、t だけ動く。d は箱の辺の向き（w = 0）で、右端の列（t）が掛からないので動かない。
          </ReadNote>
        </>
      }
      controls={
        <>
          <SimToolbar label="箱の操作">
            <ResetButton onClick={() => setS(STEP1_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="平行移動の量 t（箱の中心）">
            <ParamSlider symbol="t_x" label="x 方向" unit="m" value={s.tx} min={-STEP1_LIMIT} max={STEP1_LIMIT} step={0.05} onChange={set('tx')} format={fmt1} />
            <ParamSlider symbol="t_y" label="y 方向" unit="m" value={s.ty} min={-STEP1_LIMIT} max={STEP1_LIMIT} step={0.05} onChange={set('ty')} format={fmt1} />
            <ParamSlider symbol="t_z" label="z 方向（手前が正）" unit="m" value={s.tz} min={-STEP1_LIMIT} max={STEP1_LIMIT} step={0.05} onChange={set('tz')} format={fmt1} />
          </ControlGroup>
        </>
      }
    />
  )
}
