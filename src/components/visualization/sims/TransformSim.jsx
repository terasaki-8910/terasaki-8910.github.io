import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PiSkipForwardBold } from 'react-icons/pi'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { CUBE_DEFAULTS, cubeMatrices, drawCube, formatMatrix } from './transformCube.js'
import {
  KF_DEFAULT,
  KF_TIMES,
  T_END,
  buildModel,
  clampValue,
  drawKeyframes,
  inPlot,
  pickKeyframe,
  plotRect,
  readoutText as keyframeReadout,
  valueToY,
  xToTime,
  yToValue,
} from './transformKeyframes.js'
import {
  STEPS_PER_SEC,
  analyticPose,
  clampTarget,
  createIk,
  drawIk,
  ikView,
  pixelToWorld,
  readoutText as ikReadout,
  restartIterations,
  stepJacobian,
} from './transformIk.js'
import { fmt } from './transformCommon.js'

// 節「変換・投影・補間・IK」のシミュレーション。1つの canvas で、3つの見せ方を切り替える。
//   変換・投影 … transformCube.js    立方体を mat4 と projection だけで画面に出す
//   補間       … transformKeyframes.js  キーフレームを lerp と naturalCubicSpline で結ぶ
//   IK         … transformIk.js      2リンクの腕を ik2Analytic と ikStep で動かす
// ここは状態・操作・時間の進め方。計算は src/utils/vis/ の関数で、このファイルには式を書かない。
const ASPECT = 4 / 3

const VIEWS = [
  { value: 'cube', label: '変換・投影' },
  { value: 'keyframes', label: '補間' },
  { value: 'ik', label: 'IK' },
]
const CANVAS_LABEL = {
  cube: '立方体のワイヤーフレーム。スライダーで回転・移動・拡大・視野角を変えると、投影された形が変わる',
  keyframes:
    'キーフレームの補間。横軸が時間、縦軸が値。点を縦にドラッグするか、左右の矢印キーで選んで上下の矢印キーで動かす。グラフの上を押すと、その時刻へ移る',
  ik: '2リンクの腕。目標の位置をドラッグするか矢印キーで動かすと、手先が追う',
}

// 横幅いっぱいの見出し付きのまとまり(SimShell の操作の欄は grid)
function ControlGroup({ label, children }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="col-span-full grid gap-x-7 gap-y-1"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(15rem, 100%), 1fr))' }}
    >
      <p aria-hidden="true" className="col-span-full mt-2 text-[0.8125rem] tracking-wide text-ink">
        {label}
      </p>
      {children}
    </div>
  )
}

function Matrix({ title, m }) {
  return (
    <figure className="m-0">
      <figcaption className="mb-1">{title}</figcaption>
      <pre className="m-0 font-mono leading-snug">{formatMatrix(m).join('\n')}</pre>
    </figure>
  )
}

function CubeReadout({ cube }) {
  const { M, MVP } = cubeMatrices(cube, ASPECT)
  const trs = cube.order === 'trs'
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2">
      <Matrix title={trs ? 'M = T·R·S' : 'M = S·R·T'} m={M} />
      <Matrix title="P·V·M" m={MVP} />
      <p className="m-0 basis-full">
        {trs ? '右から先に効く：拡大 → 回転（Rz·Ry·Rx）→ 平行移動' : '右から先に効く：平行移動 → 回転（Rz·Ry·Rx）→ 拡大'}
        。破線は視錐台の外の辺
      </p>
    </div>
  )
}

export default function TransformSim() {
  const [view, setView] = useState('cube')
  const [cube, setCube] = useState(CUBE_DEFAULTS)
  const [ys, setYs] = useState(KF_DEFAULT)
  const [selected, setSelected] = useState(1)
  const [time, setTime] = useState(0)
  const [solver, setSolver] = useState('analytic')
  const [elbow, setElbow] = useState('left')
  const [lambda, setLambda] = useState(0.2)
  const [maxStep, setMaxStep] = useState(0.3)
  const [ikStatus, setIkStatus] = useState('converged')
  const [announce, setAnnounce] = useState('')

  const model = useMemo(() => buildModel(ys), [ys])

  // フレームごとに変わる状態(時刻・腕・つかんでいるもの)は ref。React の状態は、操作の欄の表示に要るものだけ
  const sim = useRef(null)
  if (sim.current === null) sim.current = { time: 0, acc: 0, ik: createIk(), drag: null }
  const params = useRef(null)
  const liveRef = useRef(null)

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const p = params.current
    const s = sim.current
    const frame = { ctx, width, height, colors }
    let text = null
    if (p.view === 'cube') {
      drawCube(frame, p.cube)
    } else if (p.view === 'keyframes') {
      drawKeyframes(frame, { model: p.model, selected: p.selected, time: s.time })
      text = keyframeReadout(p.model, s.time, p.selected)
    } else {
      drawIk(frame, s.ik, p)
      text = ikReadout(s.ik, p)
      setIkStatus(s.ik.status)
    }
    const live = liveRef.current
    if (live && text !== null && live.textContent !== text) live.textContent = text
  }, [])

  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const p = params.current
      const s = sim.current
      if (p.view === 'keyframes') {
        s.time = (s.time + dt) % T_END
        setTime(s.time)
        redraw()
      } else if (p.view === 'ik' && p.solver === 'jacobian' && s.ik.status === 'running') {
        // 1秒に STEPS_PER_SEC 歩ずつ、ikStep を重ねる
        s.acc += dt * STEPS_PER_SEC
        const whole = Math.floor(s.acc)
        s.acc -= whole
        for (let i = 0; i < Math.min(whole, 3); i++) stepJacobian(s.ik, p.lambda, p.maxStep)
        if (whole > 0) redraw()
      }
    },
    { targetRef: canvasRef },
  )

  params.current = {
    view,
    cube,
    model,
    selected,
    solver,
    elbowUp: elbow === 'left',
    lambda,
    maxStep,
    paused: !loop.running,
  }

  // 止まっているあいだも、操作に合わせて描き直す
  useEffect(() => {
    redraw()
  }, [view, cube, model, selected, solver, elbow, loop.running, redraw])

  // λ・1歩の上限を変えたら、反復の回数を数え直す
  useEffect(() => {
    restartIterations(sim.current.ik)
    redraw()
  }, [lambda, maxStep, redraw])

  // Web フォントが読み込まれたら、canvas の文字も描き直す
  useEffect(() => {
    document.fonts?.ready.then(() => redraw())
  }, [redraw])

  // ---- 補間 ----
  const setKeyframeValue = (index, value) => {
    const next = params.current.model.ys.slice()
    next[index] = clampValue(value)
    setYs(next)
  }
  const scrubTo = (t) => {
    sim.current.time = t
    setTime(t)
    redraw()
  }
  const announceKeyframe = (i, value) =>
    setAnnounce(`キーフレーム ${i + 1}，時刻 ${fmt(KF_TIMES[i])} 秒，値 ${fmt(value)}`)

  // ---- IK ----
  const moveTarget = (target) => {
    const s = sim.current
    const { width, height } = sizeRef.current
    s.ik.target = clampTarget(ikView(width, height), width, height, target)
    s.acc = 0
    restartIterations(s.ik)
    redraw()
  }

  const grab = (on) => {
    if (canvasRef.current) canvasRef.current.style.cursor = on ? 'grabbing' : ''
  }

  usePointerDrag(canvasRef, {
    onDown: ({ x, y }) => {
      const p = params.current
      const s = sim.current
      const { width, height } = sizeRef.current
      if (p.view === 'keyframes') {
        const r = plotRect(width, height)
        const i = pickKeyframe(r, p.model.ys, x, y)
        if (i >= 0) {
          s.drag = { kind: 'keyframe', index: i, offset: y - valueToY(r, p.model.ys[i]) }
          setSelected(i)
          grab(true)
          return undefined
        }
        if (inPlot(r, x, y)) {
          loop.pause() // 時刻を指定したら、そこで止めて値を読めるように
          s.drag = { kind: 'time' }
          scrubTo(xToTime(r, x))
          grab(true)
          return undefined
        }
        return false
      }
      if (p.view === 'ik') {
        s.drag = { kind: 'target' }
        moveTarget(pixelToWorld(ikView(width, height), x, y))
        grab(true)
        return undefined
      }
      return false
    },
    onMove: ({ x, y }) => {
      const s = sim.current
      const { width, height } = sizeRef.current
      if (!s.drag) return
      if (s.drag.kind === 'keyframe') {
        setKeyframeValue(s.drag.index, yToValue(plotRect(width, height), y - s.drag.offset))
      } else if (s.drag.kind === 'time') {
        scrubTo(xToTime(plotRect(width, height), x))
      } else {
        moveTarget(pixelToWorld(ikView(width, height), x, y))
      }
    },
    onUp: () => {
      sim.current.drag = null
      grab(false)
    },
    onHover: ({ x, y }) => {
      const p = params.current
      const { width, height } = sizeRef.current
      let cursor = ''
      if (p.view === 'keyframes') {
        const r = plotRect(width, height)
        if (pickKeyframe(r, p.model.ys, x, y) >= 0) cursor = 'grab'
        else if (inPlot(r, x, y)) cursor = 'ew-resize'
      } else if (p.view === 'ik') {
        cursor = 'crosshair'
      }
      if (canvasRef.current) canvasRef.current.style.cursor = cursor
    },
  })

  // 矢印キー: 補間では左右でキーフレームを選び、上下で値を動かす。IK では目標を動かす(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const p = params.current
    const big = event.shiftKey
    let handled = true
    if (p.view === 'keyframes') {
      const last = KF_TIMES.length - 1
      const select = (i) => {
        setSelected(i)
        announceKeyframe(i, p.model.ys[i])
      }
      const nudge = (sign) => {
        const i = p.selected
        const value = clampValue(p.model.ys[i] + sign * (big ? 0.25 : 0.05))
        setKeyframeValue(i, value)
        announceKeyframe(i, value)
      }
      if (event.key === 'ArrowLeft') select(Math.max(0, p.selected - 1))
      else if (event.key === 'ArrowRight') select(Math.min(last, p.selected + 1))
      else if (event.key === 'Home') select(0)
      else if (event.key === 'End') select(last)
      else if (event.key === 'ArrowUp') nudge(1)
      else if (event.key === 'ArrowDown') nudge(-1)
      else handled = false
    } else if (p.view === 'ik') {
      const step = big ? 0.25 : 0.05
      const [x, y] = sim.current.ik.target
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
      const move = moves[event.key]
      if (move) {
        moveTarget([x + move[0], y + move[1]])
        const [nx, ny] = sim.current.ik.target
        setAnnounce(`目標 x = ${fmt(nx)}，y = ${fmt(ny)}`)
      } else {
        handled = false
      }
    } else {
      handled = false
    }
    if (handled) event.preventDefault()
  }

  function changeView(next) {
    sim.current.drag = null
    setAnnounce('')
    setView(next)
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
  }

  function reset() {
    const s = sim.current
    if (view === 'cube') {
      setCube(CUBE_DEFAULTS)
    } else if (view === 'keyframes') {
      setYs(KF_DEFAULT)
      setSelected(1)
      scrubTo(0)
    } else {
      s.ik = createIk()
      s.acc = 0
      redraw()
    }
  }

  function stepOnce() {
    stepJacobian(sim.current.ik, lambda, maxStep)
    redraw()
  }

  const setCubeValue = (key) => (value) => setCube((c) => ({ ...c, [key]: value }))
  // near < far を保つ(行列の分母 near - far が 0 にならないように)
  const setNear = (value) => setCube((c) => ({ ...c, near: value, far: Math.max(c.far, value + 0.5) }))
  const setFar = (value) => setCube((c) => ({ ...c, far: value, near: Math.min(c.near, value - 0.5) }))

  const controls = (
    <>
      <SimToolbar label="見せ方">
        <ModeSwitch label="見せ方" value={view} onChange={changeView} options={VIEWS} />
      </SimToolbar>

      {view === 'cube' && (
        <>
          <SimToolbar label="立方体の操作">
            <ModeSwitch
              label="変換を掛ける順"
              value={cube.order}
              onChange={setCubeValue('order')}
              options={[
                { value: 'trs', label: 'T·R·S' },
                { value: 'srt', label: 'S·R·T' },
              ]}
            />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ControlGroup label="モデル変換">
            <ParamSlider symbol="\theta_x" label="X 軸まわりの回転" unit="°" value={cube.rx} min={-180} max={180} step={1} onChange={setCubeValue('rx')} />
            <ParamSlider symbol="\theta_y" label="Y 軸まわりの回転" unit="°" value={cube.ry} min={-180} max={180} step={1} onChange={setCubeValue('ry')} />
            <ParamSlider symbol="\theta_z" label="Z 軸まわりの回転" unit="°" value={cube.rz} min={-180} max={180} step={1} onChange={setCubeValue('rz')} />
            <ParamSlider symbol="t_x" label="x 方向の移動" value={cube.tx} min={-3} max={3} step={0.1} onChange={setCubeValue('tx')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="t_y" label="y 方向の移動" value={cube.ty} min={-3} max={3} step={0.1} onChange={setCubeValue('ty')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="t_z" label="z 方向の移動（奥行き）" value={cube.tz} min={-3} max={3} step={0.1} onChange={setCubeValue('tz')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="s" label="拡大" value={cube.s} min={0.3} max={2} step={0.05} onChange={setCubeValue('s')} format={(v) => v.toFixed(2)} />
          </ControlGroup>
          <ControlGroup label="カメラ">
            <ParamSlider symbol="\theta_{\mathrm{fov}}" label="縦の視野角" unit="°" value={cube.fov} min={20} max={120} step={1} onChange={setCubeValue('fov')} />
            <ParamSlider symbol="n" label="手前の面 near" value={cube.near} min={0.1} max={10} step={0.1} onChange={setNear} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="f" label="奥の面 far" value={cube.far} min={1} max={30} step={0.5} onChange={setFar} format={(v) => v.toFixed(1)} />
          </ControlGroup>
        </>
      )}

      {view === 'keyframes' && (
        <>
          <SimToolbar label="補間の操作">
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
          </SimToolbar>
          <ParamSlider
            symbol="t"
            label="時刻"
            unit="s"
            value={time}
            min={0}
            max={T_END}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(value) => {
              loop.pause()
              scrubTo(value)
            }}
          />
        </>
      )}

      {view === 'ik' && (
        <>
          <SimToolbar label="腕の操作">
            <ModeSwitch
              label="解き方"
              value={solver}
              onChange={changeSolver}
              options={[
                { value: 'analytic', label: '解析解' },
                { value: 'jacobian', label: 'ヤコビアン' },
              ]}
            />
            {solver === 'analytic' && (
              <ModeSwitch
                label="肘の向き（根元から目標を見て）"
                value={elbow}
                onChange={setElbow}
                options={[
                  { value: 'left', label: '肘が左' },
                  { value: 'right', label: '肘が右' },
                ]}
              />
            )}
            {solver === 'jacobian' && <PlayPauseButton running={loop.running} onToggle={loop.toggle} />}
            {solver === 'jacobian' && !loop.running && (
              <button type="button" className="vis-btn" onClick={stepOnce} disabled={ikStatus !== 'running'}>
                <PiSkipForwardBold aria-hidden="true" />
                <span>1歩進める</span>
              </button>
            )}
            <ResetButton onClick={reset} />
          </SimToolbar>
          {solver === 'jacobian' && (
            <>
              <ParamSlider symbol="\lambda" label="減衰" value={lambda} min={0} max={1} step={0.01} onChange={setLambda} format={(v) => v.toFixed(2)} />
              <ParamSlider symbol="\Delta\theta_{\max}" label="1歩の上限" unit="rad" value={maxStep} min={0.02} max={1} step={0.01} onChange={setMaxStep} format={(v) => v.toFixed(2)} />
            </>
          )}
        </>
      )}
    </>
  )

  const readout = (
    <>
      {view === 'cube' ? <CubeReadout cube={cube} /> : <div ref={liveRef} className="whitespace-pre-line" />}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  )

  return (
    <SimShell
      label="変換・投影・補間・IK のシミュレーション"
      aspect={ASPECT}
      stage={
        <SimCanvas
          ref={canvasRef}
          label={CANVAS_LABEL[view]}
          scroll={view === 'cube'}
          role={view === 'cube' ? 'img' : 'application'}
          tabIndex={view === 'cube' ? undefined : 0}
          onKeyDown={onKeyDown}
        />
      }
      controls={controls}
      readout={readout}
    />
  )
}
