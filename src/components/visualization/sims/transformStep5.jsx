import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import { useHandleDrag, arrowDelta } from './transformHooks.js'
import { Vec, Op, MatRow, ReadNote } from './transformMatrixView.jsx'
import {
  S5,
  STEP5_DEFAULT,
  step5View,
  step5Handles,
  step5Drag,
  step5Nudge,
  clipInfo,
  drawStep5,
} from './transformPerspective.js'

// 段階 5「視錐台とクリッピング」: 横から見た視錐台。点 P・Q をつかんで、内か外かを確かめる。
// near・far・視野角の取っ手(ひし形)をつかんで変えられる。カメラの後ろの点は、先に w_c で割ると前に出てしまう。
// 判定は projection.js の perspectiveMatrix・insideClip・toNDC。ここは状態と操作。
const IDS = ['P', 'Q', 'near', 'far', 'fov']
const NAMES = { P: '点 P', Q: '点 Q', near: 'near の面', far: 'far の面', fov: '視野角' }
const f2 = (v) => v.toFixed(2)
const REASON = {
  fov: '|y_c| > w_c なので、視野角の外',
  far: 'z_c > w_c なので、far より奥',
  near: 'z_c < −w_c なので、near より手前',
}

function PointRow({ name, s, point }) {
  const info = clipInfo(s, point)
  let verdict = '−w_c ≤ x_c, y_c, z_c ≤ w_c を満たすので、内側'
  if (info.behind) verdict = `w_c = ${f2(info.w)} < 0 なので、カメラの後ろ。w_c で割る前なら、外と分かる`
  else if (!info.inside) verdict = `${info.reasons.map((r) => REASON[r]).join('、')}`
  return (
    <div className="mb-3">
      <MatRow label={`${name} のクリップ座標と、w_c で割った NDC`}>
        <Vec name={`${name} の (x_c, y_c, z_c, w_c)`} v={info.clip} hi={[3]} />
        <Op>÷ w_c →</Op>
        <Vec name="(x_n, y_n, z_n)" v={info.ndc} />
      </MatRow>
      <ReadNote>
        <strong>{name}: {info.inside ? '内側' : '外側'}</strong>。{verdict}。
        {info.behind && ` 先に割ってしまうと y_n = ${f2(info.ndc[1])} になり、画面の中に出てしまう（上下も逆）。`}
      </ReadNote>
    </div>
  )
}

export default function TransformStep5() {
  const [s, setS] = useState(STEP5_DEFAULT)
  const [active, setActive] = useState(null)
  const [sel, setSel] = useState('P')
  const params = useRef(null)
  params.current = { s, active }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawStep5({ ctx, width, height, colors }, params.current.s, { active: params.current.active })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => {
    redraw()
  }, [s, active, redraw])

  const viewNow = () => step5View(sizeRef.current.width, sizeRef.current.height)
  useHandleDrag(canvasRef, {
    getHandles: () => step5Handles(viewNow(), params.current.s),
    onDrag: (id, { x, y }, phase) => {
      if (phase === 'down') {
        setActive(id)
        setSel(id)
      }
      setS((v) => ({ ...v, ...step5Drag(viewNow(), v, id, x, y) }))
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
    const move = arrowDelta(event, 0.1, 0.5)
    if (!move) return
    event.preventDefault()
    setS((v) => ({ ...v, ...step5Nudge(v, sel, move[0], move[1]) }))
  }

  const set = (key) => (value) => setS((v) => ({ ...v, [key]: value }))
  // near < far を保つ(行列の分母 near − far が 0 にならないように)
  const setNear = (value) => setS((v) => ({ ...v, near: value, far: Math.max(v.far, value + S5.FAR_MIN_GAP) }))
  const setFar = (value) => setS((v) => ({ ...v, far: value, near: Math.min(v.near, value - S5.FAR_MIN_GAP) }))
  const setPoint = (id, i) => (value) => setS((v) => ({ ...v, [id]: i === 0 ? [value, v[id][1]] : [v[id][0], value] }))

  const legendItems = [
    { key: 'frustum', label: '視錐台（near から far まで）', swatch: 'rgb(var(--color-accent) / 0.45)' },
    { key: 'P', label: '点 P', swatch: 'var(--lane-0)', value: `d = ${f2(s.P[0])}, y = ${f2(s.P[1])} m` },
    { key: 'Q', label: '点 Q', swatch: 'var(--lane-1)', value: `d = ${f2(s.Q[0])}, y = ${f2(s.Q[1])} m` },
    { key: 'fov', symbol: '\\theta_{\\mathrm{fov}}', label: '視野角', value: `${Math.round(s.fovDeg)}°` },
  ]

  return (
    <SimShell
      label="視錐台とクリッピングのシミュレーション"
      height={{ pc: [300, 360], phone: [240, 300] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label={`横から見た視錐台。カメラは原点で右を向く。点 P・Q と、near・far・視野角のひし形の取っ手をドラッグで動かせる。点が視錐台の内側かが文字で出る。矢印キーで動かし、Space で対象を切り替える。いまは${NAMES[sel]}`}
        />
      }
      legend={<SimLegend items={legendItems} />}
      readout={
        <>
          <PointRow name="P" s={s} point={s.P} />
          <PointRow name="Q" s={s} point={s.Q} />
          <span className="sr-only" role="status" aria-live="polite">
            {`動かす対象: ${NAMES[sel]}`}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar label="操作">
            <ResetButton onClick={() => setS(STEP5_DEFAULT)} />
          </SimToolbar>
          <ControlGroup label="視錐台">
            <ParamSlider symbol="\theta_{\mathrm{fov}}" label="縦の視野角" unit="°" value={s.fovDeg} min={S5.FOV[0]} max={S5.FOV[1]} step={1} onChange={set('fovDeg')} />
            <ParamSlider symbol="n" label="手前の面 near" unit="m" value={s.near} min={S5.NEAR[0]} max={S5.NEAR[1]} step={0.1} onChange={setNear} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="f" label="奥の面 far" unit="m" value={s.far} min={1} max={S5.FAR_MAX} step={0.1} onChange={setFar} format={(v) => v.toFixed(1)} />
          </ControlGroup>
          <ControlGroup label="点 P">
            <ParamSlider symbol="d" label="奥行き d" unit="m" value={s.P[0]} min={S5.D[0]} max={S5.D[1]} step={0.05} onChange={setPoint('P', 0)} format={f2} />
            <ParamSlider symbol="y" label="高さ y" unit="m" value={s.P[1]} min={-S5.YLIM} max={S5.YLIM} step={0.05} onChange={setPoint('P', 1)} format={f2} />
          </ControlGroup>
          <ControlGroup label="点 Q">
            <ParamSlider symbol="d" label="奥行き d" unit="m" value={s.Q[0]} min={S5.D[0]} max={S5.D[1]} step={0.05} onChange={setPoint('Q', 0)} format={f2} />
            <ParamSlider symbol="y" label="高さ y" unit="m" value={s.Q[1]} min={-S5.YLIM} max={S5.YLIM} step={0.05} onChange={setPoint('Q', 1)} format={f2} />
          </ControlGroup>
        </>
      }
    />
  )
}
