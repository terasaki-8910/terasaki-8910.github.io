import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { boxHit } from './transformMesh.js'
import { clamp, wrapDeg } from './transformCommon.js'
import { arrowDelta } from './transformHooks.js'
import { Mat, Vec, Op, MatRow, ReadNote } from './transformMatrixView.jsx'
import {
  STEP12_CAMERA,
  STEP2_DEFAULT,
  SCALE_RANGE,
  boxView,
  pointerOnPlane,
  step2Model,
  step2Pick,
  meanScale,
  angleFromPlanePoint,
  scaleFromPlanePoint,
  tiltFromDrag,
  drawStep2,
} from './transformBoxScene.js'

// 段階 2「回転と拡大」: 箱をつかんで向きを変える(左右が y 軸まわり、上下が x 軸まわり)。取っ手をつかんで、
// z 軸まわりに回す(輪の上の取っ手)・広げる(右下の取っ手)。回転角・拡大率と、R・S の行列が追従する。軸ごとの拡大はスライダーで。
// 計算は mat4.js の rotateX・rotateY・rotateZ・scale・compose。ここは状態と操作。

export default function TransformStep2() {
  const [s, setS] = useState(STEP2_DEFAULT)
  const [active, setActive] = useState(null) // つかんでいる取っ手
  const [focusHandle, setFocusHandle] = useState('rotate') // 矢印キーで動かす取っ手
  const params = useRef(null)
  params.current = { s, active }
  const drag = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawStep2({ ctx, width, height, colors }, params.current.s, { active: params.current.active })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  }, [s, active, redraw])

  const viewNow = () => boxView({ left: 0, top: 0, width: sizeRef.current.width, height: sizeRef.current.height }, STEP12_CAMERA)

  const apply = (name, x, y) => {
    const q = pointerOnPlane(viewNow(), x, y, 0)
    if (!q) return
    if (name === 'rotate') {
      setS((v) => ({ ...v, rz: angleFromPlanePoint(q) }))
    } else {
      const k = scaleFromPlanePoint(q)
      setS((v) => ({ ...v, sx: k, sy: k, sz: k }))
    }
  }

  // つかめるのは、2 つの取っ手と、箱そのもの(取っ手が優先)
  const pick = (x, y) => {
    const view = viewNow()
    const cur = params.current.s
    const handle = step2Pick(view, cur, x, y)
    if (handle) return handle
    return boxHit(view.VP, step2Model(cur).M, view.rect, x, y) ? 'body' : null
  }

  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => pick(x, y) !== null,
    onDown: ({ x, y }) => {
      const name = pick(x, y)
      if (!name) return false
      drag.current = name
      setActive(name)
      if (name !== 'body') setFocusHandle(name)
      canvasRef.current?.focus({ preventScroll: true })
      if (name !== 'body') apply(name, x, y)
      return undefined
    },
    onMove: ({ x, y, dx, dy }) => {
      const name = drag.current
      if (!name) return
      if (name === 'body') {
        setS((v) => ({ ...v, ...tiltFromDrag(v, dx, dy) }))
      } else {
        apply(name, x, y)
      }
    },
    onUp: () => {
      drag.current = null
      setActive(null)
    },
  })

  // 矢印キー: Space で取っ手を切り替え、左右(上下)で動かす(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setFocusHandle((h) => (h === 'rotate' ? 'scale' : 'rotate'))
      return
    }
    const move = arrowDelta(event, 1, 1)
    if (!move) return
    event.preventDefault()
    const sign = move[0] + move[1] > 0 ? 1 : -1
    if (focusHandle === 'rotate') {
      setS((v) => ({ ...v, rz: Math.round(wrapDeg(v.rz + sign * (event.shiftKey ? 15 : 5))) }))
    } else {
      const k = clamp(Math.round((meanScale(params.current.s) + sign * (event.shiftKey ? 0.25 : 0.05)) / 0.05) * 0.05, SCALE_RANGE[0], SCALE_RANGE[1])
      setS((v) => ({ ...v, sx: k, sy: k, sz: k }))
    }
  }

  const m = step2Model(s)
  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))
  const sc = (v) => v.toFixed(2)

  return (
    <SimShell
      label="回転と拡大のシミュレーション"
      height={{ pc: [300, 360], phone: [260, 320] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label={`箱と 2 つの取っ手。箱をドラッグすると向きが変わり、輪の上の取っ手をドラッグすると z 軸まわりに回り、右下の取っ手をドラッグすると広がる。矢印キーで取っ手を動かし、Space で取っ手を切り替える。いまは${focusHandle === 'rotate' ? '回す' : '広げる'}取っ手`}
        />
      }
      readout={
        <>
          <MatRow label="R と S を点 p に掛ける">
            <Mat name="R" m={m.R} />
            <Op>×</Op>
            <Mat name="S" m={m.S} />
            <Op>×</Op>
            <Vec name="p" v={m.p} />
            <Op>=</Op>
            <Vec name="p'" v={m.pAfter} hi={[0, 1, 2]} />
          </MatRow>
          <ReadNote>S で広げてから、R = Rz·Ry·Rx で回す（右の行列ほど先に効く）。R の左上の 3×3 は直交行列で、行列式は 1。</ReadNote>
        </>
      }
      controls={
        <>
          <SimToolbar label="箱の操作">
            <ResetButton onClick={() => setS(STEP2_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="回転">
            <ParamSlider symbol="\theta_x" label="x 軸まわり" unit="°" value={s.rx} min={-180} max={180} step={1} onChange={set('rx')} />
            <ParamSlider symbol="\theta_y" label="y 軸まわり" unit="°" value={s.ry} min={-180} max={180} step={1} onChange={set('ry')} />
            <ParamSlider symbol="\theta_z" label="z 軸まわり（輪の取っ手）" unit="°" value={s.rz} min={-180} max={180} step={1} onChange={set('rz')} />
          </ControlGroup>
          <ControlGroup label="拡大（取っ手は 3 つを同じ値にする）">
            <ParamSlider symbol="s_x" label="x 方向" value={s.sx} min={SCALE_RANGE[0]} max={SCALE_RANGE[1]} step={0.05} onChange={set('sx')} format={sc} />
            <ParamSlider symbol="s_y" label="y 方向" value={s.sy} min={SCALE_RANGE[0]} max={SCALE_RANGE[1]} step={0.05} onChange={set('sy')} format={sc} />
            <ParamSlider symbol="s_z" label="z 方向" value={s.sz} min={SCALE_RANGE[0]} max={SCALE_RANGE[1]} step={0.05} onChange={set('sz')} format={sc} />
          </ControlGroup>
        </>
      }
    />
  )
}
