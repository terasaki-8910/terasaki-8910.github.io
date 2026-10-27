import { useEffect, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch, PlayPauseButton, ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import useSimLoop from '../../visualization/useSimLoop'
import { drawAxes } from '../../visualization/axes'
import { arrowStep, clamp, markerCircle } from '../../visualization/sims/rigidKit'
import { marchingCubes, marchingSquares, metaballField, squareCase } from '../../../utils/vis/isosurface'
import { cameraViewProjection, projectVertex, renderScene } from '../../../utils/vis/render'
import { flatEnvironment, tokenRgb } from './shadingKit'
import { clipToFrame, cycleIndex, drawBallHandles, drawFieldCells, drawSegments, drawViewMark, hitBall, makeIsoView, pageStep } from './isosurfaceKit'
import { blitPixels } from './pixelKit'

const INITIAL_BALLS = [
  { x: 0.85, y: 0.9, z: 0.75, b: 1 },
  { x: 1.65, y: 1.82, z: 1.8, b: 1 },
  { x: 2.45, y: 1.05, z: 1.35, b: 1 },
  { x: 3.18, y: 2.12, z: 2.18, b: 1 },
  { x: 3.45, y: 0.72, z: 0.95, b: 1 },
]

// 3 次元の絵で、粒子のほかに選べる物「視点(回転)」の番号(粒子は 0〜4)
const VIEW = INITIAL_BALLS.length

const copyBalls = (balls) => balls.map((ball) => ({ ...ball }))

// 粒子の揺れ(位相 phase での、中心からのずれ)。位置そのものは持たず、フレームごとの変化分だけを足すので、
// ドラッグやキーで動かした位置から揺れが続く(動かした位置が次のフレームで元に戻らない)
function wobble(index, phase) {
  return {
    x: 0.12 * Math.sin(0.32 * phase + index * 1.3),
    y: 0.1 * Math.cos(0.27 * phase + index * 0.9),
    z: 0.12 * Math.sin(0.23 * phase + index * 1.7),
  }
}

const CUBE_FACES = [
  [0, 2, 6, 4], [1, 3, 7, 5],
  [0, 1, 5, 4], [2, 3, 7, 6],
  [0, 1, 3, 2], [4, 5, 7, 6],
]

function ambiguousCubeCount(values, n) {
  const at = (i, j, k) => values[i + n * (j + n * k)]
  let count = 0
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const corners = [at(i, j, k), at(i + 1, j, k), at(i, j + 1, k), at(i + 1, j + 1, k), at(i, j, k + 1), at(i + 1, j, k + 1), at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1)]
    if (CUBE_FACES.some(([a, b, c, d]) => {
      const cellCase = squareCase(corners[a], corners[b], corners[c], corners[d], 0)
      return cellCase === 5 || cellCase === 10
    })) count++
  }
  return count
}

function orbitCamera(yaw, pitch) {
  const target = [2, 1.5, 1.5]
  const distance = 6.3
  return {
    eye: [
      target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
      target[1] + distance * Math.sin(pitch),
      target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
    ],
    target,
    up: [0, 1, 0],
    fov: Math.PI / 4,
    near: 0.1,
    far: 30,
  }
}

export default function IsosurfaceSim() {
  const [mode, setMode] = useState('2d')
  const [threshold, setThreshold] = useState(0.28)
  const [radius, setRadius] = useState(0.85)
  const [grid2d, setGrid2d] = useState(24)
  const [grid3d, setGrid3d] = useState(24)
  const [interpolate, setInterpolate] = useState(true)
  const [ambiguity, setAmbiguity] = useState('asymptotic')
  const [showValues, setShowValues] = useState(true)
  const [showPoints, setShowPoints] = useState(true)
  const [selected, setSelected] = useState(0) // 選んでいる物: 0〜4 は粒子、VIEW は 3 次元の視点
  // 粒子の位置は ref が唯一の持ち主(再生中は毎フレーム変わる)。動かしたら redraw() で描き直す
  const ballsRef = useRef(null)
  if (ballsRef.current === null) ballsRef.current = copyBalls(INITIAL_BALLS)
  const cameraRef = useRef({ yaw: -0.72, pitch: 0.34 })
  const grabRef = useRef(-1) // ドラッグでつかんでいる粒子(なければ -1)
  const rotateRef = useRef(false) // ドラッグで視点を回しているか
  const legendRef = useRef(null)
  const phaseRef = useRef(0)

  const draw = ({ ctx, width, height, colors }) => {
    const activeBalls = ballsRef.current.map((ball) => ({ ...ball, R: radius }))
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    if (mode === '2d') {
      const view = makeIsoView(width, height)
      const n = grid2d
      const values = new Float64Array(n * n)
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        values[i + n * j] = metaballField([(4 * i) / (n - 1), (3 * j) / (n - 1)], activeBalls, threshold)
      }
      const result = marchingSquares(values, n, n, 0, { ambiguity, interpolate })
      clipToFrame(ctx, view, () => {
        if (showValues) drawFieldCells(ctx, view, colors, values, n, n, 0.55)
        if (showPoints && n <= 32) {
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const inside = values[i + n * j] >= 0
            markerCircle(ctx, view.sx((4 * i) / (n - 1)), view.sy((3 * j) / (n - 1)), 2.2, {
              fill: inside ? colors.ink : colors.surface,
              stroke: colors.ink,
              lineWidth: 0.8,
            })
          }
        }
        drawSegments(ctx, view, result.segments, n, n, colors.ink)
        drawBallHandles(ctx, view, activeBalls, colors, selected)
      })
      drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
      legendRef.current?.update({ count: String(result.segments.length), ambiguous: String(result.ambiguous) })
      return
    }

    const n = grid3d
    const values = new Float64Array(n ** 3)
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      values[i + n * (j + n * k)] = metaballField([
        (4 * i) / (n - 1), (3 * j) / (n - 1), (3 * k) / (n - 1),
      ], activeBalls, threshold)
    }
    const mesh = marchingCubes(values, n, n, n, 0)
    const ambiguous = ambiguousCubeCount(values, n)
    const positions = mesh.positions.map(([x, y, z]) => [4 * x / (n - 1), 3 * y / (n - 1), 3 * z / (n - 1)])
    const camera = orbitCamera(cameraRef.current.yaw, cameraRef.current.pitch)
    const pixels = new Uint8ClampedArray(width * height * 4)
    renderScene({
      meshes: [{
        positions,
        normals: mesh.normals,
        faces: mesh.triangles,
        material: { color: tokenRgb(colors, 'lane-1'), kd: 0.78, ks: 0.35, shininess: 28, kind: 'paint' },
      }],
      light: { position: [5, 6, 6], intensity: 1 },
      ambient: 0.12,
      environment: flatEnvironment(colors),
    }, camera, { width, height, shading: 'phong', model: 'blinn-phong', shadows: false }, pixels)
    blitPixels(ctx, pixels, width, height)
    const matrix = cameraViewProjection(camera, width / height)
    activeBalls.forEach((ball, index) => {
      const point = projectVertex(matrix, [ball.x, ball.y, ball.z], width, height)
      if (!point) return
      markerCircle(ctx, point[0], point[1], 7, {
        fill: colors.accent,
        stroke: colors.ink,
        lineWidth: index === selected ? 3.5 : 1.5,
      })
    })
    if (selected === VIEW) drawViewMark(ctx, colors, width, height)
    legendRef.current?.update({ count: String(mesh.triangles.length), ambiguous: String(ambiguous) })
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw, maxDpr: 1 })

  useEffect(() => {
    redraw()
  }, [mode, threshold, radius, grid2d, grid3d, interpolate, ambiguity, showValues, showPoints, selected, redraw])

  // 再生: 粒子は今の位置から、揺れの変化分だけ動く(つかんで動かした位置から続く)
  const loop = useSimLoop((dt) => {
    const before = phaseRef.current
    phaseRef.current += Math.min(dt, 0.05)
    const after = phaseRef.current
    ballsRef.current = ballsRef.current.map((ball, index) => {
      const from = wobble(index, before)
      const to = wobble(index, after)
      return {
        ...ball,
        x: clamp(ball.x + to.x - from.x, 0, 4),
        y: clamp(ball.y + to.y - from.y, 0, 3),
        z: clamp(ball.z + to.z - from.z, 0, 3),
      }
    })
    redraw()
  }, { targetRef: canvasRef, autoStart: true })

  const moveBall = (index, next) => {
    ballsRef.current = ballsRef.current.map((ball, i) => (i === index ? { ...ball, ...next } : ball))
    redraw()
  }
  const rotateView = (dyaw, dpitch) => {
    cameraRef.current.yaw += dyaw
    cameraRef.current.pitch = clamp(cameraRef.current.pitch + dpitch, -1.1, 1.1)
    redraw()
  }

  const viewFor = () => makeIsoView(sizeRef.current.width, sizeRef.current.height)
  const projectedBall = (point) => {
    const { width, height } = sizeRef.current
    const camera = orbitCamera(cameraRef.current.yaw, cameraRef.current.pitch)
    const matrix = cameraViewProjection(camera, width / height)
    let hit = -1
    let distance = 19
    ballsRef.current.forEach((ball, index) => {
      const p = projectVertex(matrix, [ball.x, ball.y, ball.z], width, height)
      if (!p) return
      const d = Math.hypot(point.x - p[0], point.y - p[1])
      if (d <= distance) { hit = index; distance = d }
    })
    return hit
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => mode === '2d' ? hitBall(viewFor(), ballsRef.current, point) >= 0 : true,
    onDown: (point) => {
      const hit = mode === '2d' ? hitBall(viewFor(), ballsRef.current, point) : projectedBall(point)
      if (hit < 0 && mode === '2d') return false
      canvasRef.current?.focus({ preventScroll: true }) // つかんだあと、キーでも動かせるように
      grabRef.current = hit
      rotateRef.current = hit < 0
      if (hit >= 0) loop.pause() // 粒子を動かすあいだは揺れを止める(動かした位置から続く)
      setSelected(hit >= 0 ? hit : VIEW)
      return true
    },
    onMove: ({ x, y, dx, dy }) => {
      if (rotateRef.current) {
        rotateView(-dx * 0.008, -dy * 0.008)
        return
      }
      const index = grabRef.current
      if (index < 0) return
      if (mode === '2d') {
        const view = viewFor()
        moveBall(index, { x: clamp(view.wx(x), 0, 4), y: clamp(view.wy(y), 0, 3) })
      } else {
        const ball = ballsRef.current[index]
        moveBall(index, { x: clamp(ball.x + dx * 0.008, 0, 4), y: clamp(ball.y - dy * 0.008, 0, 3) })
      }
    },
    onUp: () => { grabRef.current = -1; rotateRef.current = false },
  })

  // PageUp・PageDown で選ぶ物を変え(3 次元では粒子 5 個と視点)、矢印キーで選んだ物を動かす(視点は回す)
  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const page = pageStep(event)
    if (page) {
      event.preventDefault()
      setSelected(cycleIndex(selected, page, mode === '3d' ? VIEW + 1 : VIEW))
      return
    }
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    if (selected === VIEW) {
      rotateView(-step.dx * 0.08, step.dy * 0.08)
      return
    }
    loop.pause()
    const ball = ballsRef.current[selected]
    moveBall(selected, { x: clamp(ball.x + step.dx * 0.05, 0, 4), y: clamp(ball.y + step.dy * 0.05, 0, 3) })
  }
  const changeMode = (value) => {
    setMode(value)
    if (value === '2d' && selected === VIEW) setSelected(0) // 2 次元には視点がない
  }
  const reset = () => {
    loop.pause()
    setThreshold(0.28)
    setRadius(0.85)
    setGrid2d(24)
    setGrid3d(24)
    setInterpolate(true)
    setAmbiguity('asymptotic')
    setShowValues(true)
    setShowPoints(true)
    setSelected(0)
    cameraRef.current = { yaw: -0.72, pitch: 0.34 }
    phaseRef.current = 0
    ballsRef.current = copyBalls(INITIAL_BALLS)
    redraw()
  }

  const selectedName = selected === VIEW ? '視点' : `粒子 ${selected + 1}`
  const label = mode === '2d'
    ? `5 個の粒子から取り出した等値線と、格子の値の絵。粒子をドラッグで動かせます。PageUp・PageDown で粒子を選び、矢印キーで動かします（Shift で大きく）。選択中は${selectedName}。`
    : `5 個の粒子から取り出した等値面の絵。粒子をドラッグで動かし、粒子のない所のドラッグで視点を回せます。PageUp・PageDown で粒子か視点を選び、矢印キーで粒子を動かすか視点を回します（Shift で大きく）。選択中は${selectedName}。`

  return (
    <SimShell
      label="等値線と等値面"
      switcher={<ModeSwitch label="次元" value={mode} options={[{ value: '2d', label: '2 次元' }, { value: '3d', label: '3 次元' }]} onChange={changeMode} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} role="application" tabIndex={0} onKeyDown={onKeyDown} label={label} />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'field', label: '場', value: '外 → 内', swatch: 'linear-gradient(90deg, var(--color-surface), var(--lane-1))' },
        { key: 'contour', label: mode === '2d' ? '等値線' : '等値面', swatch: mode === '2d' ? 'var(--color-ink)' : 'var(--lane-1)' },
        { key: 'threshold', symbol: 'T', label: 'しきい値', value: threshold.toFixed(2) },
        { key: 'grid', symbol: mode === '2d' ? 'N\\times N' : 'N\\times N\\times N', label: '格子', value: mode === '2d' ? `${grid2d} × ${grid2d}` : `${grid3d} × ${grid3d} × ${grid3d}` },
        { key: 'count', label: mode === '2d' ? '線分' : '三角形', value: '0', minChars: 6 },
        { key: 'ambiguous', label: 'あいまいなセル', value: '0', minChars: 4 },
      ]} />}
      controls={<>
        <SimToolbar>
          <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
          <ResetButton onClick={reset} />
          {mode === '2d' && <ToggleButton pressed={showValues} onChange={setShowValues}>格子の値</ToggleButton>}
          {mode === '2d' && <ToggleButton pressed={showPoints} onChange={setShowPoints}>格子点</ToggleButton>}
        </SimToolbar>
        <ParamSlider symbol="T" label="しきい値" value={threshold} min={0.05} max={1} step={0.01} onChange={setThreshold} format={(value) => value.toFixed(2)} />
        <ParamSlider symbol="R" label="粒子の半径" value={radius} min={0.3} max={1.2} step={0.01} onChange={setRadius} format={(value) => value.toFixed(2)} />
        <ParamSlider symbol="N" label="格子数" value={mode === '2d' ? grid2d : grid3d} min={8} max={mode === '2d' ? 80 : 40} step={1} onChange={mode === '2d' ? setGrid2d : setGrid3d} />
        <ViewStack active={mode} views={{
          '2d': <ControlGroup label="等値線の取り出し">
            <ModeSwitch label="補間" value={interpolate ? 'linear' : 'midpoint'} options={[{ value: 'linear', label: '線形補間' }, { value: 'midpoint', label: '辺の中点' }]} onChange={(value) => setInterpolate(value === 'linear')} variant="quiet" />
            <ModeSwitch label="あいまいさ" value={ambiguity} options={[{ value: 'asymptotic', label: '漸近線判定' }, { value: 'center', label: '中心の値' }]} onChange={setAmbiguity} variant="quiet" />
          </ControlGroup>,
          '3d': null,
        }} />
      </>}
    />
  )
}
