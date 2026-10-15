import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { boxHit, inRect } from './transformMesh.js'
import { clamp, wrapDeg } from './transformCommon.js'
import { useStacked, arrowDelta } from './transformHooks.js'
import { Mat, Gap, MatRow, ReadNote } from './transformMatrixView.jsx'
import {
  STEP3_DEFAULT,
  STEP3_LIMIT,
  STEP3_SCALE,
  STEP3_ORDERS,
  step3Model,
  step3Views,
  step3Pick,
  pointerOnPlane,
  translationFromCenter,
  angleAround,
  drawStep3,
} from './transformBoxScene.js'

// 段階 3「合成の順」: 同じ T・R・S を、T·R·S と S·R·T の順で掛けた 2 つの結果を並べる。
// どちらの箱もつかんで動かせる(その箱が指に付いてくるよう、移動量 t を決める)。回す取っ手(輪の外の丸)で回転も変える。
// 動かすと、両方の箱と 2 つの 4×4 行列が変わる。計算は mat4.js の translate・rotateZ・scale・compose。
const fmt2 = (v) => v.toFixed(2)
const round = (v, step) => Math.round(v / step) * step

export default function TransformStep3() {
  const [s, setS] = useState(STEP3_DEFAULT)
  const [active, setActive] = useState(null) // つかんでいる箱(0: T·R·S、1: S·R·T)
  const params = useRef(null)
  const drag = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    drawStep3({ ctx, width, height, colors }, p.s, { stacked: p.stacked, active: p.active })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const stacked = useStacked(canvasRef)
  params.current = { s, active, stacked }
  useEffect(() => {
    redraw()
  }, [s, active, stacked, redraw])

  const viewsNow = () => step3Views(sizeRef.current.width, sizeRef.current.height, params.current.stacked)
  // 画面の点 (x, y) が、どの枠の何の上か: { index, kind: 'rotate' | 'box', view, model } | null
  const pickAt = (x, y) => {
    const cur = params.current.s
    const views = viewsNow()
    for (let i = 0; i < views.length; i++) {
      const { panel, view } = views[i]
      if (!inRect(panel.rect, x, y)) continue
      const model = step3Model(cur, STEP3_ORDERS[i])
      if (step3Pick(view, model, cur, x, y)) return { index: i, kind: 'rotate', view, model }
      if (boxHit(view.VP, model.M, view.rect, x, y)) return { index: i, kind: 'box', view, model }
    }
    return null
  }

  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => pickAt(x, y) !== null,
    onDown: ({ x, y }) => {
      const hit = pickAt(x, y)
      if (!hit) return false
      const cur = params.current.s
      if (hit.kind === 'box') {
        const q = pointerOnPlane(hit.view, x, y, 0)
        if (!q) return false
        const t = translationFromCenter(STEP3_ORDERS[hit.index], q, cur)
        drag.current = { ...hit, offset: [cur.tx - t[0], cur.ty - t[1]] }
      } else {
        drag.current = hit
      }
      setActive(hit.index)
      canvasRef.current?.focus({ preventScroll: true })
      return undefined
    },
    onMove: ({ x, y }) => {
      const d = drag.current
      if (!d) return
      const q = pointerOnPlane(d.view, x, y, 0)
      if (!q) return
      const cur = params.current.s
      if (d.kind === 'box') {
        const t = translationFromCenter(STEP3_ORDERS[d.index], q, cur)
        setS((v) => ({
          ...v,
          tx: clamp(round(t[0] + d.offset[0], 0.05), -STEP3_LIMIT, STEP3_LIMIT),
          ty: clamp(round(t[1] + d.offset[1], 0.05), -STEP3_LIMIT, STEP3_LIMIT),
        }))
      } else {
        // 回す取っ手: その枠の箱の中心から見た向き
        const center = step3Model(cur, STEP3_ORDERS[d.index]).center
        setS((v) => ({ ...v, rz: angleAround(center, q) }))
      }
    },
    onUp: () => {
      drag.current = null
      setActive(null)
    },
  })

  // 矢印キー: 左右が回転、上下が移動の y ではなく拡大(ほかの値はスライダーで)。Shift で大きく
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const move = arrowDelta(event, 1, 1)
    if (!move) return
    event.preventDefault()
    if (move[0] !== 0) {
      setS((v) => ({ ...v, rz: Math.round(wrapDeg(v.rz + Math.sign(move[0]) * (event.shiftKey ? 15 : 5))) }))
    } else {
      setS((v) => ({ ...v, s: clamp(round(v.s + Math.sign(move[1]) * (event.shiftKey ? 0.25 : 0.05), 0.05), STEP3_SCALE[0], STEP3_SCALE[1]) }))
    }
  }

  const trs = step3Model(s, 'trs')
  const srt = step3Model(s, 'srt')
  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))
  const xy = (m) => `(${m.M[0][3].toFixed(2)}, ${m.M[1][3].toFixed(2)})`

  return (
    <SimShell
      label="合成の順のシミュレーション"
      height={{ pc: [stacked ? 440 : 300, stacked ? 480 : 360], phone: [stacked ? 440 : 260, stacked ? 480 : 320] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="同じ移動・回転・拡大を、T·R·S の順と S·R·T の順に掛けた 2 つの箱。どちらの箱もドラッグで動かせ、丸い取っ手で回せる。矢印キーの左右で回転、上下で拡大を変える"
        />
      }
      readout={
        <>
          <MatRow label="T·R·S の行列と S·R·T の行列">
            <Mat name="M = T·R·S" m={trs.M} hiCols={[3]} />
            <Gap />
            <Mat name="M = S·R·T" m={srt.M} hiCols={[3]} />
          </MatRow>
          <ReadNote>
            3×3 の部分（R と S）は同じで、右端の列（平行移動）だけが違う。T·R·S の平行移動は t = {xy(trs)}、S·R·T の平行移動は s·R·t = {xy(srt)}。
            S·R·T は先に t だけ動かしてから回すので、箱は原点のまわりを回り、そのあと原点から拡大される。
          </ReadNote>
        </>
      }
      controls={
        <>
          <SimToolbar label="箱の操作">
            <ResetButton onClick={() => setS(STEP3_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="T・R・S の値（2 つの箱に共通）">
            <ParamSlider symbol="t_x" label="移動 x" unit="m" value={s.tx} min={-STEP3_LIMIT} max={STEP3_LIMIT} step={0.05} onChange={set('tx')} format={fmt2} />
            <ParamSlider symbol="t_y" label="移動 y" unit="m" value={s.ty} min={-STEP3_LIMIT} max={STEP3_LIMIT} step={0.05} onChange={set('ty')} format={fmt2} />
            <ParamSlider symbol="\theta_z" label="回転（z 軸まわり）" unit="°" value={s.rz} min={-180} max={180} step={1} onChange={set('rz')} />
            <ParamSlider symbol="s" label="拡大" value={s.s} min={STEP3_SCALE[0]} max={STEP3_SCALE[1]} step={0.05} onChange={set('s')} format={fmt2} />
          </ControlGroup>
        </>
      }
    />
  )
}
