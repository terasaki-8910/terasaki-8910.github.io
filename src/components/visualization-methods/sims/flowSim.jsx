import { useCallback, useEffect, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import { ModeSwitch, PlayPauseButton, ResetButton, SimToolbar, ToggleButton } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import usePointerDrag from '../../visualization/usePointerDrag'
import useSimLoop from '../../visualization/useSimLoop'
import { DEFAULT_MARGIN, drawArrow, drawAxes } from '../../visualization/axes'
import { DT, DX, ITERATIONS, L, N, NU_DEFAULT, createWorld, pushAt } from '../../visualization/sims/nsWorld.js'
import { fluidStep2D } from '../../../utils/vis/grid.js'
import { classifyCriticalPoint, findCriticalPoints, gridField, jacobian2, lic, rk4Step2 } from '../../../utils/vis/flow.js'
import { seededRandom } from '../../../utils/vis/ct.js'
import { blitPixels } from './pixelKit'
import {
  CRITICAL_LABEL, CRITICAL_MARK, CRITICAL_ORDER, PathBins, SPEED_BINS, SPEED_SWATCH, addChevron, boundsOf, clipToFrame, drawArrowBatches,
  drawCriticalSymbol, fillGrayPixels, fitView, grayLut, graySwatch, percentileRange, speedBin, speedLut, traceLine, unitField, useIsDark,
  whiteNoise,
} from './flowKit'

// この絵の流れは 1 m 四方で、端が反対側とつながっている(周期境界)。canvas が横に長いときは、1 m 四方を真ん中に置き、
// 左右の余りに同じ流れのくり返しを描いて、枠いっぱいに広げる。1 m 四方は点線で囲み、その外は少し薄くする
const VMAX = 0.5 // [m/s] 色と矢印の長さの基準にする速さ(初めのせん断層の最大の速さ)
const SHIFT = 0.25 // 流れの窓を x 方向にずらす量。周期境界なのでどこから見てもよく、初めの渦心と鞍点が点線の上に乗らないようにする
const LIC_N = 128 // LIC のノイズの画素数(1 m あたり)
const LIC_MAX_PIXELS = 28000 // 枠が広いときの LIC の画素数の上限(計算を 30 ms ほどに収める)
const TRAIL_FADE_EVERY = 3 // 軌跡は 3 ステップ(0.05 s)ごとに地の色へ 11 % 近づけて消す。1 s たつと 1 割ほどに薄れる
const TRAIL_FADE = 0.11
const PARTICLE_BINS = 8
const STREAM_STEP = 0.01 // 流線の 1 歩の長さ(曲線に沿った長さ。1 m の 1 %)
const OUTSIDE_DIM = 0.5 // 1 m 四方の外を薄くする割合
const COUNT_LABEL = { arrows: '矢印の数', streamlines: '流線の数', particles: '粒子の数', lic: '画素数' }
const MODE_OPTIONS = [
  { value: 'arrows', label: '矢印' },
  { value: 'streamlines', label: '流線' },
  { value: 'particles', label: '粒子' },
  { value: 'lic', label: 'LIC' },
]

const viewOf = (width, height) => fitView(width, height, [0, L], [0, L], DEFAULT_MARGIN)

// 目盛りは 0.25 m ごと(窓に入るものだけ)
function ticksFor(lo, hi) {
  const values = []
  for (let v = Math.ceil(lo / 0.25 - 1e-9) * 0.25; v <= hi + 1e-9; v += 0.25) values.push(Math.round(v * 100) / 100)
  return { step: 0.25, values }
}

// 窓(範囲 a〜b)に、1 m 四方 [0, 1) を整数だけずらして写したものが入るずらし方
function tileOffsets(a, b) {
  const out = []
  for (let k = Math.floor(a); k <= Math.ceil(b) - 1; k++) out.push(k)
  return out
}

// 格子の速度を双線形補間した場(周期境界)。窓を SHIFT だけずらして使う
function makeViewField(world) {
  const field = gridField(world.u, world.v, N, DX)
  return (x, y) => field(x + SHIFT, y)
}

function makeParticles(count, rand) {
  const pos = new Float32Array(count * 2)
  for (let i = 0; i < pos.length; i++) pos[i] = rand()
  return { count, pos, prev: Float32Array.from(pos), steps: 0 }
}

// 粒子を場に沿って 1 ステップ(RK4)進める。端は反対側へ回り込む
function advanceParticles(p, field) {
  const { pos, prev, count } = p
  prev.set(pos)
  for (let i = 0; i < count; i++) {
    const q = rk4Step2(field, [pos[2 * i], pos[2 * i + 1]], DT)
    pos[2 * i] = q[0] - Math.floor(q[0])
    pos[2 * i + 1] = q[1] - Math.floor(q[1])
  }
  p.steps++
}

// 軌跡の絵は、枠と同じ大きさの別の canvas に溜める。1 ステップごとに、粒子が動いた分の短い線だけを足し、
// 数ステップごとに全体を地の色へ少し近づける。毎フレーム全部の軌跡を引き直すより、ずっと軽い
function ensureTrail(trail, frame, dpr, colors) {
  if (!trail.canvas) {
    trail.canvas = document.createElement('canvas')
    trail.ctx = trail.canvas.getContext('2d')
  }
  const w = Math.max(1, Math.round(frame.width * dpr))
  const h = Math.max(1, Math.round(frame.height * dpr))
  if (trail.w !== w || trail.h !== h || trail.colors !== colors) {
    trail.canvas.width = w
    trail.canvas.height = h
    trail.w = w
    trail.h = h
    trail.dpr = dpr
    trail.colors = colors
    trail.ctx.fillStyle = colors.surface
    trail.ctx.fillRect(0, 0, w, h)
  }
}

function stepTrail(trail, p, colors, view) {
  const { ctx, dpr, w, h } = trail
  if (p.steps % TRAIL_FADE_EVERY === 0) {
    ctx.fillStyle = colors.alpha('surface', TRAIL_FADE)
    ctx.fillRect(0, 0, w, h)
  }
  const lut = speedLut(colors, PARTICLE_BINS)
  const bins = new PathBins(PARTICLE_BINS)
  const [wx0, wy0, wx1, wy1] = boundsOf(view)
  const kxs = tileOffsets(wx0, wx1)
  const kys = tileOffsets(wy0, wy1)
  const sx = view.scaleX * dpr
  const sy = view.scaleY * dpr
  const { pos, prev, count } = p
  for (let i = 0; i < count; i++) {
    const x0 = prev[2 * i]
    const y0 = prev[2 * i + 1]
    // 端を回り込んだ分を戻した、粒子が動いた量
    let dx = pos[2 * i] - x0
    let dy = pos[2 * i + 1] - y0
    dx -= Math.round(dx)
    dy -= Math.round(dy)
    const path = bins.path(speedBin(Math.hypot(dx, dy) / DT, VMAX, PARTICLE_BINS))
    for (const kx of kxs) {
      for (const ky of kys) {
        const ax = x0 + kx
        const ay = y0 + ky
        if ((ax < wx0 - 0.03 && ax + dx < wx0 - 0.03) || (ax > wx1 + 0.03 && ax + dx > wx1 + 0.03)) continue
        if ((ay < wy0 - 0.03 && ay + dy < wy0 - 0.03) || (ay > wy1 + 0.03 && ay + dy > wy1 + 0.03)) continue
        path.moveTo((ax - wx0) * sx, (wy1 - ay) * sy)
        path.lineTo((ax + dx - wx0) * sx, (wy1 - ay - dy) * sy)
      }
    }
  }
  ctx.lineWidth = 1.4 * dpr
  ctx.lineCap = 'round'
  bins.stroke(ctx, lut)
}

// 特異点を探し、種類を付ける。数値の場では ∇·v がちょうど 0 にならず、渦心が「ゆるいらせん」に見えるので、
// 回る速さ √det の 1 割より小さいトレースは 0 とみなす(classifyCriticalPoint の eps)
function findClassified(field, win) {
  const n = Math.max(24, Math.round(32 * Math.max(win[2] - win[0], win[3] - win[1])))
  return findCriticalPoints(field, win, n).map((c) => {
    const J = jacobian2(field, c.p, DX)
    const base = classifyCriticalPoint(J)
    const tol = 0.1 * Math.sqrt(Math.max(base.det, 0))
    return { p: c.p, type: tol > 1e-9 ? classifyCriticalPoint(J, tol).type : base.type }
  })
}

// 1 m 四方の外(同じ流れのくり返し)を薄くし、1 m 四方を点線で囲む。窓が 1 m 四方ちょうどなら何もしない
function markDomain(ctx, view, colors) {
  const { frame } = view
  const left = view.sx(0)
  const right = view.sx(L)
  const top = view.sy(L)
  const bottom = view.sy(0)
  const outside = [left - frame.left, frame.right - right, top - frame.top, frame.bottom - bottom]
  if (outside.every((d) => d < 1)) return false
  ctx.save()
  ctx.fillStyle = colors.alpha('surface', OUTSIDE_DIM)
  ctx.fillRect(frame.left, frame.top, Math.max(0, outside[0]), frame.height)
  ctx.fillRect(right, frame.top, Math.max(0, outside[1]), frame.height)
  ctx.fillRect(left, frame.top, right - left, Math.max(0, outside[2]))
  ctx.fillRect(left, bottom, right - left, Math.max(0, outside[3]))
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 1.2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1)
  ctx.restore()
  return true
}

// 窓の中の、1 m を n 等分した格子の中心(窓の外には出ない)
function gridCenters(win, n) {
  const iMin = Math.ceil(win[0] * n - 0.5 - 1e-9)
  const iMax = Math.floor(win[2] * n - 0.5 + 1e-9)
  const jMin = Math.ceil(win[1] * n - 0.5 - 1e-9)
  const jMax = Math.floor(win[3] * n - 0.5 + 1e-9)
  const out = []
  for (let j = jMin; j <= jMax; j++) for (let i = iMin; i <= iMax; i++) out.push([(i + 0.5) / n, (j + 0.5) / n])
  return out
}

function drawArrows(ctx, view, field, colors, n) {
  const centers = gridCenters(boundsOf(view), n)
  const cap = (0.92 * view.scaleX) / n
  const lut = speedLut(colors)
  const data = new Float32Array(5 * centers.length)
  centers.forEach(([x, y], k) => {
    const v = field(x, y)
    const speed = Math.hypot(v[0], v[1])
    const length = cap * Math.min(1, speed / VMAX)
    const ux = speed > 1e-9 ? v[0] / speed : 0
    const uy = speed > 1e-9 ? v[1] / speed : 0
    const cx = view.sx(x)
    const cy = view.sy(y)
    const o = k * 5
    data[o] = cx - (ux * length) / 2
    data[o + 1] = cy + (uy * length) / 2
    data[o + 2] = cx + (ux * length) / 2
    data[o + 3] = cy - (uy * length) / 2
    data[o + 4] = speedBin(speed, VMAX)
  })
  drawArrowBatches(ctx, data, centers.length, lut, { width: view.scaleX / n < 14 ? 1.2 : 1.5, headMax: 6 })
  return centers.length
}

function drawStreamlines(ctx, view, field, colors, n) {
  const win = boundsOf(view)
  const unit = unitField(field)
  const lut = speedLut(colors)
  const bins = new PathBins(SPEED_BINS)
  const seeds = gridCenters(win, n)
  for (const seed of seeds) {
    const pts = traceLine(unit, seed, { h: STREAM_STEP, maxSteps: 70, bounds: win })
    let run = -1
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]
      const b = pts[k + 1]
      const v = field((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
      const bin = speedBin(Math.hypot(v[0], v[1]), VMAX)
      const path = bins.path(bin)
      if (bin !== run) {
        path.moveTo(view.sx(a[0]), view.sy(a[1]))
        run = bin
      }
      path.lineTo(view.sx(b[0]), view.sy(b[1]))
    }
    // 出発点に、流れの向きを示す矢じり
    const v = field(seed[0], seed[1])
    const speed = Math.hypot(v[0], v[1])
    if (speed > 1e-9) addChevron(bins.path(speedBin(speed, VMAX)), view.sx(seed[0]) + (v[0] / speed) * 4, view.sy(seed[1]) - (v[1] / speed) * 4, v[0] / speed, -v[1] / speed, 5)
  }
  ctx.save()
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  bins.stroke(ctx, lut)
  ctx.restore()
  return seeds.length
}

// 粒子は点で描き、軌跡は別に溜めた絵(trail)を枠に重ねる
function drawParticles(ctx, view, field, colors, p, trail) {
  const { frame } = view
  const { pos, count } = p
  const lut = speedLut(colors, PARTICLE_BINS)
  if (trail.canvas) ctx.drawImage(trail.canvas, frame.left, frame.top, frame.width, frame.height)
  const [wx0, wy0, wx1, wy1] = boundsOf(view)
  const kxs = tileOffsets(wx0, wx1)
  const kys = tileOffsets(wy0, wy1)
  const dots = new PathBins(PARTICLE_BINS)
  for (let i = 0; i < count; i++) {
    const x = pos[2 * i]
    const y = pos[2 * i + 1]
    const v = field(x, y)
    const path = dots.path(speedBin(Math.hypot(v[0], v[1]), VMAX, PARTICLE_BINS))
    for (const kx of kxs) {
      for (const ky of kys) {
        const ax = x + kx
        const ay = y + ky
        if (ax < wx0 - 0.02 || ax > wx1 + 0.02 || ay < wy0 - 0.02 || ay > wy1 + 0.02) continue
        path.moveTo(view.sx(ax), view.sy(ay))
        path.lineTo(view.sx(ax) + 0.1, view.sy(ay))
      }
    }
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.6
  dots.stroke(ctx, lut)
  ctx.restore()
  return count
}

// LIC の画像の大きさ。窓の 1 m あたり LIC_N 画素(広すぎるときは粗くする)
function licSize(win) {
  const spanX = win[2] - win[0]
  const spanY = win[3] - win[1]
  let perMeter = LIC_N
  if (spanX * spanY * perMeter * perMeter > LIC_MAX_PIXELS) perMeter = Math.sqrt(LIC_MAX_PIXELS / (spanX * spanY))
  return { perMeter, w: Math.max(8, Math.round(spanX * perMeter)), h: Math.max(8, Math.round(spanY * perMeter)) }
}

// 1 m 四方ぶんのノイズ(base)を、窓の画素の位置に合わせてくり返し敷く。窓の大きさが変わっても、同じ場所には同じ値が来る
function periodicNoise(base, w, h, win, perMeter) {
  const out = new Float32Array(w * h)
  const wrap = (v) => ((Math.floor(v * LIC_N) % LIC_N) + LIC_N) % LIC_N
  for (let j = 0; j < h; j++) {
    const row = wrap(win[3] - (j + 0.5) / perMeter) * LIC_N
    for (let i = 0; i < w; i++) out[j * w + i] = base[row + wrap(win[0] + (i + 0.5) / perMeter)]
  }
  return out
}

export default function FlowSim() {
  const [mode, setMode] = useState('arrows')
  const [gridN, setGridN] = useState(24)
  const [seedN, setSeedN] = useState(8)
  const [particleCount, setParticleCount] = useState(1500)
  const [licLength, setLicLength] = useState(10)
  const [critical, setCritical] = useState(false)
  const dark = useIsDark()
  const params = useRef(null)
  params.current = { mode, gridN, seedN, particleCount, licLength, critical }
  const world = useRef(null)
  if (!world.current) world.current = createWorld()
  const field = useRef(null)
  if (!field.current) field.current = makeViewField(world.current)
  const particles = useRef(null)
  const trail = useRef({ canvas: null, ctx: null, w: 0, h: 0, dpr: 1, colors: null })
  const licState = useRef({ base: null, key: '', noise: null, w: 0, h: 0, raw: null, pixels: null, low: 0, high: 1, ready: false, cost: 0, end: 0, version: -1, length: -1 })
  const version = useRef(0) // 流れが変わるたびに増やす(LIC の計算が要るかの目印)
  const pointer = useRef(null)
  const legend = useRef(null)

  const draw = useCallback(({ ctx, width, height, dpr, colors }) => {
    const p = params.current
    const f = field.current
    const w = world.current
    const view = viewOf(width, height)
    const { frame } = view
    const win = boundsOf(view)
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    let countText = ''
    let cpText = ''
    let extended = false
    clipToFrame(ctx, view, () => {
      if (p.mode === 'arrows') {
        countText = `${drawArrows(ctx, view, f, colors, p.gridN)} 本`
      } else if (p.mode === 'streamlines') {
        countText = `${drawStreamlines(ctx, view, f, colors, p.seedN)} 本`
      } else if (p.mode === 'particles') {
        if (!particles.current || particles.current.count !== p.particleCount) particles.current = makeParticles(p.particleCount, seededRandom(5))
        ensureTrail(trail.current, frame, dpr, colors)
        countText = `${drawParticles(ctx, view, f, colors, particles.current, trail.current)} 個`
      } else {
        const ls = licState.current
        if (!ls.base) ls.base = whiteNoise(LIC_N * LIC_N, seededRandom(21))
        const size = licSize(win)
        const key = `${size.w}x${size.h}|${win.map((v) => v.toFixed(4)).join(',')}`
        if (key !== ls.key) {
          // 窓の大きさが変わった(画面の幅が変わった)ので、ノイズと画像を作り直す
          ls.key = key
          ls.w = size.w
          ls.h = size.h
          ls.noise = periodicNoise(ls.base, size.w, size.h, win, size.perMeter)
          ls.pixels = new Uint8ClampedArray(size.w * size.h * 4)
          ls.version = -1
          ls.ready = false
        }
        const now = performance.now()
        const changedLength = ls.length !== p.licLength
        if (changedLength || (ls.version !== version.current && now - ls.end >= 0.8 * ls.cost)) {
          const t0 = performance.now()
          ls.raw = lic(f, ls.noise, ls.w, ls.h, p.licLength, { bounds: win, step: 1 })
          const range = percentileRange(ls.raw, 0.02, 0.98)
          if (!ls.ready || changedLength) {
            ls.low = range.low
            ls.high = range.high
            ls.ready = true
          } else {
            ls.low += 0.25 * (range.low - ls.low)
            ls.high += 0.25 * (range.high - ls.high)
          }
          ls.version = version.current
          ls.length = p.licLength
          ls.end = performance.now()
          ls.cost = ls.end - t0
        }
        fillGrayPixels(ls.raw, ls.low, ls.high, grayLut(colors), ls.pixels)
        blitPixels(ctx, ls.pixels, ls.w, ls.h, frame.left, frame.top, frame.width, frame.height)
        countText = `${ls.w} × ${ls.h}`
      }
      extended = markDomain(ctx, view, colors)
      // 特異点の印(窓の中のくり返しにも付け、数は 1 m 四方の中だけ数える)
      if (p.critical) {
        const found = findClassified(f, win)
        found.forEach((c) => drawCriticalSymbol(ctx, c.type, view.sx(c.p[0]), view.sy(c.p[1]), colors, 6))
        const inDomain = found.filter((c) => c.p[0] >= 0 && c.p[0] < L && c.p[1] >= 0 && c.p[1] < L)
        cpText = CRITICAL_ORDER.map((type) => [type, inDomain.filter((c) => c.type === type).length]).filter(([, n]) => n > 0).map(([type, n]) => `${CRITICAL_MARK[type]} ${CRITICAL_LABEL[type]} ${n}`).join('　') || 'なし'
      }
      // ドラッグで押している向き
      if (pointer.current) {
        const { x, y, fx, fy } = pointer.current
        const scale = 0.08 / Math.max(1, Math.hypot(fx, fy))
        drawArrow(ctx, view, x, y, x + scale * fx, y + scale * fy, { color: colors.ink, width: 3, head: 8 })
      }
    })
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1
    ctx.strokeRect(frame.left + 0.5, frame.top + 0.5, frame.width - 1, frame.height - 1)
    drawAxes(ctx, view, { colors, xLabel: 'x [m]', yLabel: 'y [m]', xTicks: ticksFor(win[0], win[2]), yTicks: ticksFor(win[1], win[3]) })
    legend.current?.update({
      t: `${w.time.toFixed(2)} s`,
      count: countText,
      domain: extended ? '点線の内側（外側は同じ流れのくり返し）' : '端は反対側とつながる',
      ...(p.critical ? { cp: cpText } : {}),
    })
  }, [])
  const { canvasRef, redraw, sizeRef, getColors } = useCanvas({ draw })

  const loop = useSimLoop((elapsed) => {
    const w = world.current
    w.acc += elapsed
    let stepped = false
    while (w.acc >= DT) {
      fluidStep2D(w, { dt: DT, nu: NU_DEFAULT, iterations: ITERATIONS })
      if (!particles.current || particles.current.count !== params.current.particleCount) particles.current = makeParticles(params.current.particleCount, seededRandom(5))
      advanceParticles(particles.current, field.current)
      if (params.current.mode === 'particles') {
        const { width, height, dpr } = sizeRef.current
        const colors = getColors()
        const view = viewOf(width, height)
        ensureTrail(trail.current, view.frame, dpr, colors)
        stepTrail(trail.current, particles.current, colors, view)
      }
      w.time += DT
      w.acc -= DT
      stepped = true
    }
    if (stepped) version.current++
    redraw()
  }, { targetRef: canvasRef })

  // 粒子の見せ方に入るたび、粒子の数を変えるたび、軌跡を白紙からやり直す
  useEffect(() => { trail.current.colors = null }, [mode, particleCount])
  useEffect(() => { redraw() }, [mode, gridN, seedN, particleCount, licLength, critical, dark, redraw])

  const local = ({ x, y }) => {
    const view = viewOf(sizeRef.current.width, sizeRef.current.height)
    const { frame } = view
    const inside = x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom
    return { view, inside, x: view.wx(x), y: view.wy(y) }
  }
  usePointerDrag(canvasRef, {
    canGrab: (point) => local(point).inside,
    onDown: (point) => {
      const q = local(point)
      if (!q.inside) return false
      canvasRef.current?.focus({ preventScroll: true })
      pointer.current = { x: q.x, y: q.y, fx: 0, fy: 0 }
      redraw()
    },
    onMove: (point) => {
      const q = local(point)
      if (!q.inside) {
        pointer.current = null
        redraw()
        return
      }
      const fx = point.vx / q.view.scaleX
      const fy = -point.vy / q.view.scaleY
      pointer.current = { x: q.x, y: q.y, fx, fy }
      pushAt(world.current, q.x + SHIFT, q.y, fx, fy, 0.2)
      version.current++
      redraw()
    },
    onUp: () => {
      pointer.current = null
      redraw()
    },
  })

  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    pushAt(world.current, 0.5 + SHIFT, 0.5, ...direction, 0.2 * (event.shiftKey ? 4 : 1))
    version.current++
    redraw()
  }

  const reset = () => {
    world.current = createWorld()
    field.current = makeViewField(world.current)
    particles.current = null
    trail.current.colors = null
    licState.current.version = -1
    licState.current.ready = false
    pointer.current = null
    version.current++
    redraw()
  }

  const legendItems = [
    { label: '軸', value: 'x・y（単位 m、目盛り 0.25 m）' },
    { key: 'domain', label: '領域', value: '', minChars: 20 },
    { key: 't', symbol: 't', label: '時刻', value: '0.00 s', minChars: 7 },
    { symbol: '\\Delta t', label: '時間刻み', value: '1/60 s' },
    mode === 'lic'
      ? { key: 'ramp', label: '濃淡', value: 'ノイズの平均（暗 → 明）', swatch: graySwatch(dark) }
      : { key: 'ramp', label: '速さ', value: `0 → ${VMAX} m/s`, swatch: SPEED_SWATCH },
    { key: 'count', label: COUNT_LABEL[mode], value: '', minChars: 9 },
    ...(critical ? [{ key: 'cp', label: '特異点', value: '', minChars: 16 }] : []),
  ]

  return (
    <SimShell
      label="流れの可視化：矢印・流線・粒子・LIC"
      aspect={1}
      switcher={<ModeSwitch variant="tabs" label="描き方" value={mode} onChange={setMode} options={MODE_OPTIONS} />}
      stage={(
        <SimCanvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          onKeyDown={onKeyDown}
          label="1 m 四方で端がつながった流れを、矢印・流線・粒子・LIC のどれかで描いた図。ドラッグで流れを押せます。矢印キーで中央をその向きに押し、Shift を押しながらだと強く押せます。"
        />
      )}
      legend={<SimLegend ref={legend} items={legendItems} />}
      controls={(
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ToggleButton pressed={critical} onChange={setCritical}>特異点</ToggleButton>
          </SimToolbar>
          <ViewStack
            active={mode}
            views={{
              arrows: <ParamSlider symbol="N" label="格子の数（1 m あたり）" value={gridN} min={16} max={32} step={1} onChange={setGridN} />,
              streamlines: <ParamSlider symbol="n" label="出発点の数（1 m あたり）" value={seedN} min={4} max={14} step={1} onChange={setSeedN} />,
              particles: <ParamSlider label="粒子の数" value={particleCount} min={500} max={2500} step={100} onChange={setParticleCount} />,
              lic: <ParamSlider symbol="L" label="長さ（片側の歩数）" value={licLength} min={0} max={30} step={1} onChange={setLicLength} />,
            }}
          />
        </>
      )}
    />
  )
}
