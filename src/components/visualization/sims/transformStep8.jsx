import { useCallback, useEffect, useRef, useState } from 'react'
import { PiSkipForwardBold } from 'react-icons/pi'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import ControlGroup from '../ControlGroup'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import { fk2, ikStep, jacobian2 } from '../../../utils/vis/ik.js'
import { useHandleDrag, arrowDelta } from './transformHooks.js'
import { Mat, Vec, Gap, MatRow, ReadNote } from './transformMatrixView.jsx'
import { fmt } from './transformCommon.js'
import {
  L1,
  L2,
  IK_RANGE,
  STEPS_PER_SEC,
  analyticPose,
  clampTarget,
  createIk,
  drawIk,
  ikView,
  pixelToWorld,
  readoutText,
  restartIterations,
  stepJacobian,
} from './transformIk.js'

// 段階 8「IK」: 目標(ピンクの丸)をつかんで動かすと、腕の手先がそこへ向く。
// 解析解(余弦定理で、肘の向きが 2 通り)と、ヤコビアンの繰り返し(1 歩ずつ角度を変える)を切り替えられる。
// 角度・ヤコビアンの値は、ik.js の ik2Analytic・jacobian2・ikStep。計算は transformIk.js、ここは状態と操作。
const fmt2 = (v) => v.toFixed(2)

export default function TransformStep8() {
  const [solver, setSolver] = useState('analytic')
  const [elbow, setElbow] = useState('up')
  const [lambda, setLambda] = useState(0.2)
  const [maxStep, setMaxStep] = useState(0.3)
  const [grabbed, setGrabbed] = useState(false)
  const [version, setVersion] = useState(0) // 腕の状態が変わったとき、数の表示を描き直す合図
  const [announce, setAnnounce] = useState('')

  const sim = useRef({ ik: createIk(), acc: 0, offset: [0, 0] })
  const params = useRef(null)
  params.current = { solver, elbowUp: elbow === 'up', lambda, maxStep, grabbed }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    drawIk({ ctx, width, height, colors }, sim.current.ik, { solver: p.solver, elbowUp: p.elbowUp, active: p.grabbed })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const p = params.current
      const s = sim.current
      if (p.solver !== 'jacobian' || s.ik.status !== 'running') return
      // 1 秒に STEPS_PER_SEC 歩ずつ、ikStep を重ねる
      s.acc += dt * STEPS_PER_SEC
      const whole = Math.floor(s.acc)
      s.acc -= whole
      for (let i = 0; i < Math.min(whole, 3); i++) stepJacobian(s.ik, p.lambda, p.maxStep)
      if (whole > 0) {
        redraw()
        setVersion((v) => v + 1)
      }
    },
    { targetRef: canvasRef },
  )

  useEffect(() => {
    redraw()
  }, [solver, elbow, grabbed, version, redraw])

  // λ・1 歩の上限を変えたら、反復の回数を数え直す
  useEffect(() => {
    restartIterations(sim.current.ik)
    redraw()
    setVersion((v) => v + 1)
  }, [lambda, maxStep, redraw])

  const viewNow = () => ikView(sizeRef.current.width, sizeRef.current.height)
  const moveTarget = (target) => {
    const s = sim.current
    s.ik.target = clampTarget(target)
    s.acc = 0
    restartIterations(s.ik)
    redraw()
    setVersion((v) => v + 1)
  }

  useHandleDrag(canvasRef, {
    getHandles: () => {
      const v = viewNow()
      const [tx, ty] = sim.current.ik.target
      return [{ id: 'target', x: v.cx + tx * v.u, y: v.cy - ty * v.u, r: 24 }]
    },
    onDrag: (id, { x, y }, phase) => {
      const w = pixelToWorld(viewNow(), x, y)
      const s = sim.current
      if (phase === 'down') {
        s.offset = [s.ik.target[0] - w[0], s.ik.target[1] - w[1]] // つかんだ位置と中心のずれ
        setGrabbed(true)
        return
      }
      moveTarget([w[0] + s.offset[0], w[1] + s.offset[1]])
    },
    onEnd: () => setGrabbed(false),
  })

  // 矢印キー: 目標を動かす(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const move = arrowDelta(event, 0.05, 0.25)
    if (!move) return
    event.preventDefault()
    const [x, y] = sim.current.ik.target
    moveTarget([x + move[0], y + move[1]])
    const [nx, ny] = sim.current.ik.target
    setAnnounce(`目標 x = ${fmt(nx)}，y = ${fmt(ny)}`)
  }

  function changeSolver(next) {
    const s = sim.current
    if (next === 'jacobian') {
      // いま見えている姿勢から反復を始める
      s.ik.theta = analyticPose(s.ik.target, params.current.elbowUp)
      s.acc = 0
      restartIterations(s.ik)
    }
    setSolver(next)
    setVersion((v) => v + 1)
  }

  function reset() {
    const s = sim.current
    s.ik = createIk()
    s.acc = 0
    setVersion((v) => v + 1)
    redraw()
  }

  function stepOnce() {
    stepJacobian(sim.current.ik, lambda, maxStep)
    redraw()
    setVersion((v) => v + 1)
  }

  // いまの姿勢のヤコビアン J、手先の誤差 e、1 歩で変わる角度 Δθ
  const ik = sim.current.ik
  const theta = solver === 'analytic' ? analyticPose(ik.target, elbow === 'up') : ik.theta
  const J = jacobian2(L1, L2, theta[0], theta[1])
  const { tip } = fk2(L1, L2, theta[0], theta[1])
  const e = [ik.target[0] - tip[0], ik.target[1] - tip[1]]
  const next = ikStep(L1, L2, theta, ik.target, lambda, maxStep)
  const dTheta = [next[0] - theta[0], next[1] - theta[1]]
  const text = readoutText(ik, { solver, elbowUp: elbow === 'up', lambda, maxStep, paused: !loop.running })
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
  const jacobianMode = solver === 'jacobian'
  const setTarget = (i) => (value) => {
    const [x, y] = sim.current.ik.target
    moveTarget(i === 0 ? [value, y] : [x, value])
  }

  return (
    <SimShell
      label="IK のシミュレーション"
      height={{ pc: [300, 360], phone: [260, 320] }}
      stage={
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="2 リンクの腕。ピンクの丸の目標をドラッグするか矢印キーで動かすと、手先が追う"
        />
      }
      readout={
        <>
          <p className="m-0 whitespace-pre-line">{text}</p>
          <MatRow label="ヤコビアン J と、手先の誤差 e と、1 歩で変わる角度 Δθ">
            <Mat name="J [m/rad]" m={J} />
            <Gap />
            <Vec name="e [m]" v={e} />
            <Gap />
            <Vec name="Δθ [rad]" v={dTheta} />
          </MatRow>
          <ReadNote>
            det J = L₁L₂ sin θ₂ = {fmt2(det)}。θ₂ が 0 か π（腕が伸びきる・折りたたまれる）で 0 になり、そのとき J の逆行列はない。
            {jacobianMode ? ' Δθ = Jᵀ(JJᵀ + λ²I)⁻¹e を 1 歩ごとに足して、e を小さくする。目標を動かすと、反復が始まる。' : ' 解析解は、角度を直接求めるので、反復はない（J と e は見るだけ）。'}
          </ReadNote>
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </>
      }
      controls={
        <>
          <SimToolbar label="腕の操作">
            <ModeSwitch
              variant="quiet"
              label="解き方"
              value={solver}
              onChange={changeSolver}
              options={[
                { value: 'analytic', label: '解析解' },
                { value: 'jacobian', label: 'ヤコビアン' },
              ]}
            />
            <ModeSwitch
              variant="quiet"
              label="肘の向き（根元から目標を見て）"
              value={elbow}
              onChange={setElbow}
              disabled={jacobianMode}
              options={[
                { value: 'up', label: '肘が左' },
                { value: 'down', label: '肘が右' },
              ]}
            />
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} disabled={!jacobianMode} />
            <button type="button" className="vis-btn" onClick={stepOnce} disabled={!jacobianMode || loop.running || ik.status !== 'running'}>
              <PiSkipForwardBold aria-hidden="true" />
              <span>1歩進める</span>
            </button>
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ControlGroup label="目標（丸をつかんでも動く）">
            <ParamSlider symbol="x" label="x" unit="m" value={ik.target[0]} min={IK_RANGE.x[0]} max={IK_RANGE.x[1]} step={0.05} onChange={setTarget(0)} format={fmt2} />
            <ParamSlider symbol="y" label="y" unit="m" value={ik.target[1]} min={IK_RANGE.y[0]} max={IK_RANGE.y[1]} step={0.05} onChange={setTarget(1)} format={fmt2} />
          </ControlGroup>
          <ControlGroup label="ヤコビアンの反復">
            <ParamSlider symbol="\lambda" label="減衰" value={lambda} min={0} max={1} step={0.01} onChange={setLambda} format={fmt2} disabled={!jacobianMode} />
            <ParamSlider symbol="\Delta\theta_{\max}" label="1歩の上限" unit="rad" value={maxStep} min={0.02} max={1} step={0.01} onChange={setMaxStep} format={fmt2} disabled={!jacobianMode} />
          </ControlGroup>
        </>
      }
    />
  )
}
