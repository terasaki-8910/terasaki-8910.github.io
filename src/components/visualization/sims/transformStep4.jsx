import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import { useHandleDrag, arrowDelta } from './transformHooks.js'
import { ReadNote } from './transformMatrixView.jsx'
import {
  S4,
  STEP4_DEFAULT,
  step4View,
  step4Rows,
  step4Handles,
  step4Drag,
  step4Nudge,
  drawStep4,
} from './transformPerspective.js'

// 段階 4「透視投影」(カメラ目線): 横から見た図で、カメラ(原点)・投影面(z = f)・点 P と Q。
// 点をつかんで動かすと、投影面の上の像の高さ y′ = f·y/z が追従する。遠いほど小さくなるのが見える。
// 像の高さは projection.js の perspectiveProject で求める。ここは状態と操作。
const IDS = ['P', 'Q', 'plane']
const NAMES = { P: '点 P', Q: '点 Q', plane: '投影面' }
const f2 = (v) => v.toFixed(2)

export default function TransformStep4() {
  const [s, setS] = useState(STEP4_DEFAULT)
  const [active, setActive] = useState(null) // つかんでいる取っ手
  const [sel, setSel] = useState('P') // 矢印キーで動かす取っ手
  const params = useRef(null)
  params.current = { s, active }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawStep4({ ctx, width, height, colors }, params.current.s, { active: params.current.active })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  }, [s, active, redraw])

  const viewNow = () => step4View(sizeRef.current.width, sizeRef.current.height)
  useHandleDrag(canvasRef, {
    getHandles: () => step4Handles(viewNow(), params.current.s),
    onDrag: (id, { x, y }, phase) => {
      if (phase === 'down') {
        setActive(id)
        setSel(id)
      }
      setS((v) => ({ ...v, ...step4Drag(viewNow(), id, x, y) }))
    },
    onEnd: () => setActive(null),
  })

  // 矢印キー: 左右が z(投影面なら f)、上下が y。Space で動かす取っ手を切り替える(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setSel((id) => IDS[(IDS.indexOf(id) + 1) % IDS.length])
      return
    }
    const move = arrowDelta(event, 0.05, 0.5)
    if (!move) return
    event.preventDefault()
    setS((v) => ({ ...v, ...step4Nudge(v, sel, move[0], move[1]) }))
  }

  const rows = step4Rows(s)
  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))
  const setPoint = (id, i) => (value) => setS((v) => ({ ...v, [id]: i === 0 ? [value, v[id][1]] : [v[id][0], value] }))

  const legendItems = [
    { key: 'P', label: '点 P', swatch: 'var(--lane-0)', value: `z = ${f2(s.P[0])}, y = ${f2(s.P[1])} m` },
    { key: 'Q', label: '点 Q', swatch: 'var(--lane-1)', value: `z = ${f2(s.Q[0])}, y = ${f2(s.Q[1])} m` },
    { key: 'f', symbol: 'f', label: '投影面までの距離', value: `${f2(s.f)} m` },
  ]

  return (
    <SimShell
      label="透視投影のシミュレーション"
      height={{ pc: [300, 360], phone: [240, 300] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label={`横から見た図。カメラは左端の原点で、右を向く。点 P・Q と投影面の上の丸をドラッグで動かすと、投影面の上の像が変わる。矢印キーで動かし、Space で対象を切り替える。いまは${NAMES[sel]}`}
        />
      }
      legend={<SimLegend items={legendItems} />}
      readout={
        <>
          {rows.map((r) => (
            <p key={r.name} className="m-0">
              {r.name}: y′ = f·y / z = {f2(s.f)} × {f2(r.y)} / {f2(r.z)} = <strong>{f2(r.image)}</strong> m
            </p>
          ))}
          <ReadNote>y と f が同じなら、z が 2 倍になると像は半分になる。</ReadNote>
          <span className="sr-only" role="status" aria-live="polite">
            {`動かす対象: ${NAMES[sel]}`}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar label="操作">
            <ResetButton onClick={() => setS(STEP4_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="投影面">
            <ParamSlider symbol="f" label="カメラからの距離" unit="m" value={s.f} min={S4.F[0]} max={S4.F[1]} step={0.05} onChange={set('f')} format={f2} />
          </ControlGroup>
          <ControlGroup label="点 P">
            <ParamSlider symbol="z" label="奥行き z" unit="m" value={s.P[0]} min={S4.Z[0]} max={S4.Z[1]} step={0.05} onChange={setPoint('P', 0)} format={f2} />
            <ParamSlider symbol="y" label="高さ y" unit="m" value={s.P[1]} min={-S4.YLIM} max={S4.YLIM} step={0.05} onChange={setPoint('P', 1)} format={f2} />
          </ControlGroup>
          <ControlGroup label="点 Q">
            <ParamSlider symbol="z" label="奥行き z" unit="m" value={s.Q[0]} min={S4.Z[0]} max={S4.Z[1]} step={0.05} onChange={setPoint('Q', 0)} format={f2} />
            <ParamSlider symbol="y" label="高さ y" unit="m" value={s.Q[1]} min={-S4.YLIM} max={S4.YLIM} step={0.05} onChange={setPoint('Q', 1)} format={f2} />
          </ControlGroup>
        </>
      }
    />
  )
}
