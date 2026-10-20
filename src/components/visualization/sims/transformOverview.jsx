import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import SimLegend from '../SimLegend'
import ControlGroup from '../ControlGroup'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { useStacked } from './transformHooks.js'
import { clamp, fmt, fmtDeg, toDeg, toRad, wrapDeg } from './transformCommon.js'
import { inRect } from './transformMesh.js'
import { drawOverview, sceneModel, handOnScreen } from './transformScene.js'
import { orbitPosition } from './transformCamera.js'
import {
  T_END,
  FIXED_DT,
  CAMERA_DEFAULT,
  CAMERA_RANGE,
  CAMERA_TARGET,
  clampCameraPosition,
  OUTSIDE_DEFAULT,
  buildPath,
  keyframeInfo,
  advanceClock,
  splitPanels,
} from './transformArm.js'

// 節「変換・投影・補間・IK」の全体のシミュレーション: 2 関節の腕のキーフレームアニメーションを、カメラで撮って画面に描く。
//   キーフレーム → 補間(スプライン)→ 手先の目標 → IK → 関節の角度 → 腕を 3 次元に置く(モデル変換)
//   → カメラで撮る(ビュー・投影)→ 画面に描く(ビューポート)
// 1 つの canvas を「外から見た図」(ドラッグで見る向きを回せる)と「カメラから見た絵」(ドラッグでカメラを回せる)に分ける。
// 狭い画面では上下に並べる。計算は transformArm.js(spline・ik・mat4)と transformCamera.js・transformMesh.js(projection)で、
// 絵は transformScene.js。ここは状態・操作・時間の進め方。
const ASPECT_SIDE = 2 // 左右に並べるとき(2 枚の絵がそれぞれ縦横 1:1 ほど)
const ASPECT_STACKED = 0.78 // 上下に並べるとき
const UI_INTERVAL = 0.066 // 時刻のスライダーを書き換える間隔 [s](毎フレームは React を動かさない)
const CAMERA_PITCH = { pitchMin: toRad(-10), pitchMax: toRad(80) } // カメラから見た絵をドラッグするときの仰角の範囲

export default function TransformOverview() {
  const [time, setTime] = useState(0)
  const [cam, setCam] = useState(CAMERA_DEFAULT)
  const [yawDeg, setYawDeg] = useState(Math.round(toDeg(OUTSIDE_DEFAULT.yaw)))
  const [pitchDeg, setPitchDeg] = useState(Math.round(toDeg(OUTSIDE_DEFAULT.pitch)))

  const path = useMemo(() => buildPath(), [])
  const sim = useRef({ clock: { t: 0, acc: 0 }, ui: 0 })
  const legend = useRef(null)

  const stateNow = () => ({ ...params.current, t: sim.current.clock.t })

  const draw = useCallback(({ ctx, width, height, colors }) => {
    drawOverview({ ctx, width, height, colors }, { ...params.current, t: sim.current.clock.t })
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  const stacked = useStacked(canvasRef) // 狭い画面では上下に並べる
  const params = useRef(null)
  params.current = { path, cam, yaw: toRad(yawDeg), pitch: toRad(pitchDeg), stacked }

  // 凡例のうち、時刻とともに変わる値(文字だけ書き換える)
  const liveValues = () => {
    const state = stateNow()
    const model = sceneModel(state)
    const { width, height } = sizeRef.current
    const screen = width > 0 ? handOnScreen(model, splitPanels(width, height, state.stacked)) : null
    const k = keyframeInfo(state.t)
    return {
      t: `${fmt(state.t)} s / ${fmt(T_END)} s`,
      key: `${k.from} → ${k.to}（${Math.round(k.frac * 100)} %）`,
      theta: `θ1 = ${fmtDeg(model.theta[0])}°, θ2 = ${fmtDeg(model.theta[1])}°`,
      screen: screen ? `(${Math.round(screen.x)}, ${Math.round(screen.y)}) px` : '画面の外',
    }
  }
  const publish = () => legend.current?.update(liveValues())

  const loop = useSimLoop(
    (dt) => {
      const s = sim.current
      advanceClock(s.clock, dt)
      publish()
      redraw()
      s.ui += dt
      if (s.ui >= UI_INTERVAL) {
        s.ui = 0
        setTime(s.clock.t)
      }
    },
    { targetRef: canvasRef },
  )

  // 止まっているあいだも、操作に合わせて描き直す
  useEffect(() => {
    publish()
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, yawDeg, pitchDeg, stacked, redraw])

  // ドラッグ: 外から見た図は見る向きを回し、カメラから見た絵はカメラを見る点のまわりで回す(どちらも同じ向きと速さ)。
  // カメラは、押したときの位置から、押してからの動きの合計だけ回す(位置を 0.01 m に丸めても誤差がたまらない)
  const panelAt = (x, y) => {
    const { width, height } = sizeRef.current
    const panels = splitPanels(width, height, params.current.stacked)
    if (inRect(panels.outside.rect, x, y)) return 'outside'
    if (inRect(panels.camera.rect, x, y)) return 'camera'
    return null
  }
  const drag = useRef(null)
  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => panelAt(x, y) !== null,
    onDown: ({ x, y }) => {
      const panel = panelAt(x, y)
      if (!panel) return false
      const { cam: c } = params.current
      drag.current = { panel, start: [c.x, c.y, c.z], sx: 0, sy: 0 }
    },
    onMove: ({ dx, dy }) => {
      const d = drag.current
      if (!d) return
      if (d.panel === 'outside') {
        setYawDeg((v) => Math.round(wrapDeg(v - dx * 0.5)))
        setPitchDeg((v) => Math.round(clamp(v + dy * 0.4, 2, 85)))
        return
      }
      d.sx += dx
      d.sy += dy
      const position = orbitPosition(d.start, CAMERA_TARGET, toRad(-d.sx * 0.5), toRad(d.sy * 0.4), CAMERA_PITCH)
      setCam((c) => ({ ...c, ...clampCameraPosition(position) }))
    },
    onUp: () => {
      drag.current = null
    },
  })

  // 矢印キー: 外から見る向きを回す(Shift で大きく)
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 15 : 5
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setYawDeg((v) => Math.round(wrapDeg(v + move[0])))
    setPitchDeg((v) => Math.round(clamp(v + move[1], 2, 85)))
  }

  function scrub(value) {
    loop.pause()
    sim.current.clock.t = value
    sim.current.clock.acc = 0
    setTime(value)
    publish()
    redraw()
  }

  function reset() {
    sim.current.clock.t = 0
    sim.current.clock.acc = 0
    setTime(0)
    setCam(CAMERA_DEFAULT)
    setYawDeg(Math.round(toDeg(OUTSIDE_DEFAULT.yaw)))
    setPitchDeg(Math.round(toDeg(OUTSIDE_DEFAULT.pitch)))
  }

  const setCamValue = (key) => (value) => setCam((c) => ({ ...c, [key]: value }))

  const live = liveValues()
  const legendItems = [
    { key: 'axes', label: '軸 x・y・z', value: '単位 m（床の格子は 1 m）' },
    { key: 't', symbol: 't', label: '時刻', value: live.t, minChars: 13 },
    { key: 'dt', symbol: '\\Delta t', label: '時間刻み', value: `${(FIXED_DT * 1000).toFixed(1)} ms（1/60 s）` },
    { key: 'key', label: 'キーフレーム', value: live.key, minChars: 10 },
    { key: 'theta', label: '関節の角度', value: live.theta, minChars: 24 },
    { key: 'cam', label: 'カメラの位置', value: `(${fmt(cam.x, 1)}, ${fmt(cam.y, 1)}, ${fmt(cam.z, 1)}) m` },
    { key: 'fov', symbol: '\\theta_{\\mathrm{fov}}', label: '視野角', value: `${cam.fovDeg}°` },
    { key: 'screen', label: '手先の画面位置（左下が原点）', value: live.screen, minChars: 12 },
    { key: 'marks', label: '破線は手先の経路、番号はキーフレーム' },
  ]

  return (
    <SimShell
      label="2 関節の腕のキーフレームアニメーション"
      aspect={stacked ? ASPECT_STACKED : ASPECT_SIDE}
      stage={
        <SimCanvas
          ref={canvasRef}
          scroll
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="2 関節の腕がキーフレームの位置をなぞって動く。外から見た図はドラッグか矢印キーで見る向きを回せる。カメラから見た絵は、ドラッグするとカメラが腕のまわりを回り、カメラの位置と視野角で変わる"
        />
      }
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={
        <>
          <SimToolbar label="再生の操作">
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
            onChange={scrub}
          />
          <ControlGroup label="カメラ（撮った絵をドラッグしても回る）">
            <ParamSlider symbol="x" label="位置 x" unit="m" value={cam.x} min={CAMERA_RANGE.x[0]} max={CAMERA_RANGE.x[1]} step={0.1} onChange={setCamValue('x')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="y" label="位置 y（高さ）" unit="m" value={cam.y} min={CAMERA_RANGE.y[0]} max={CAMERA_RANGE.y[1]} step={0.1} onChange={setCamValue('y')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="z" label="位置 z（手前）" unit="m" value={cam.z} min={CAMERA_RANGE.z[0]} max={CAMERA_RANGE.z[1]} step={0.1} onChange={setCamValue('z')} format={(v) => v.toFixed(1)} />
            <ParamSlider symbol="\theta_{\mathrm{fov}}" label="縦の視野角" unit="°" value={cam.fovDeg} min={20} max={90} step={1} onChange={setCamValue('fovDeg')} />
          </ControlGroup>
          <ControlGroup label="外から見る向き（図をドラッグしても回る）">
            <ParamSlider symbol="\varphi" label="左右" unit="°" value={yawDeg} min={-180} max={180} step={1} onChange={setYawDeg} />
            <ParamSlider symbol="\psi" label="上下" unit="°" value={pitchDeg} min={2} max={85} step={1} onChange={setPitchDeg} />
          </ControlGroup>
        </>
      }
    />
  )
}
