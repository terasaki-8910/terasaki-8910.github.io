import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell from '../SimShell'
import SimCanvas from '../SimCanvas'
import ParamSlider from '../ParamSlider'
import { SimToolbar, PlayPauseButton, ResetButton, ModeSwitch } from '../SimButtons'
import useCanvas from '../useCanvas'
import useSimLoop from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'

// 共通の部品(useCanvas・useSimLoop・usePointerDrag・ParamSlider・SimButtons・SimShell)の動作確認用。
// 点が円を描く。円の中心はドラッグで動かせる。C2 の各節のシミュレーションは、これと同じ組み方で作る
// (sections/<id>.js の Sim をこのファイルから自分のものに差し替えたら、このファイルは消してよい)。
const ASPECT = 4 / 3

export default function DemoSim() {
  const [omega, setOmega] = useState(2.5) // 角速度 [rad/s]
  const [radius, setRadius] = useState(80) // 半径 [px]
  const [direction, setDirection] = useState('ccw')
  const sim = useRef({ angle: 0, cx: null, cy: null, trail: [] })
  const params = useRef({ omega, radius, direction })
  params.current = { omega, radius, direction }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const s = sim.current
    const { radius: r, direction: dir } = params.current
    if (s.cx === null) {
      s.cx = width / 2
      s.cy = height / 2
    }
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    // 軌道の円
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(s.cx, s.cy, r, 0, Math.PI * 2)
    ctx.stroke()
    // 軌跡
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    s.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])))
    ctx.stroke()
    // 点
    const sign = dir === 'ccw' ? -1 : 1
    const x = s.cx + r * Math.cos(s.angle * sign)
    const y = s.cy + r * Math.sin(s.angle * sign)
    ctx.fillStyle = colors.accent
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 中心の十字(ドラッグの取っ手)
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(s.cx - 5, s.cy)
    ctx.lineTo(s.cx + 5, s.cy)
    ctx.moveTo(s.cx, s.cy - 5)
    ctx.lineTo(s.cx, s.cy + 5)
    ctx.stroke()
    s.pos = [x, y]
  }, [])

  const { canvasRef, redraw } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const s = sim.current
      s.angle += params.current.omega * dt
      if (s.pos) {
        s.trail.push(s.pos)
        if (s.trail.length > 90) s.trail.shift()
      }
      redraw()
    },
    { targetRef: canvasRef },
  )

  // 止まっているあいだも、パラメータを変えたら描き直す
  useEffect(() => {
    redraw()
  }, [omega, radius, direction, redraw])

  usePointerDrag(canvasRef, {
    onDown: ({ x, y }) => {
      const s = sim.current
      if (Math.hypot(x - s.cx, y - s.cy) > 24) return false
      canvasRef.current.style.cursor = 'grabbing'
    },
    onMove: ({ dx, dy }) => {
      sim.current.cx += dx
      sim.current.cy += dy
      sim.current.trail = []
      redraw()
    },
    onUp: () => {
      canvasRef.current.style.cursor = ''
    },
  })

  function reset() {
    const s = sim.current
    s.angle = 0
    s.trail = []
    s.cx = null
    redraw()
  }

  return (
    <SimShell
      label="動作確認：点が円を描く"
      aspect={ASPECT}
      stage={<SimCanvas ref={canvasRef} label="点が円の上を回り、軌跡が残る。円の中心はドラッグで動かせる" />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ModeSwitch
              label="回る向き"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'ccw', label: '反時計回り' },
                { value: 'cw', label: '時計回り' },
              ]}
            />
          </SimToolbar>
          <ParamSlider symbol="\omega" label="角速度" unit="rad/s" value={omega} min={0} max={8} step={0.1} onChange={setOmega} format={(v) => v.toFixed(1)} />
          <ParamSlider symbol="r" label="半径" unit="px" value={radius} min={20} max={140} step={1} onChange={setRadius} />
        </>
      }
    />
  )
}
