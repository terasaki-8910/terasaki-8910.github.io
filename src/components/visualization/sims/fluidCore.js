// 節「流体(SPH)」のシミュレーションの React に依存しない部分(状態・1 フレームの進め方・描画・ポインタ)。
// 計算は utils/vis/sph.js の関数だけを使い、ここでは式を書き直さない(近傍探索 → 密度 → 圧力 → 力 →
// 半陰的オイラー、は sphStep の中)。FluidSim.jsx がこれを React の部品につなぐ。
// 長さは m、水槽の左下が原点で y は上向き(画面には反転して描く)。h は影響半径で、動作を確かめた 0.05 m に固定する。

import { createSphState, fillBlock, sphStep, sphMaxDt, defaultSphParams, neighborsAt } from '../../../utils/vis/sph.js'

export const SPACING = 0.02 // 粒子の間隔 [m]。defaultSphParams を動作確認した値(h は 2.5 倍、質量は面密度 1000 に合わせる)
export const TANKS = {
  wide: { width: 2, height: 1, cols: 40, rows: 32 }, // 1280 個
  narrow: { width: 1.2, height: 1, cols: 24, rows: 25 }, // 600 個(幅 640px 未満)
}
export const NARROW_QUERY = '(max-width: 639px)'

export const FRAME_BUDGET_MS = 8 // 1 フレームの計算にかける時間の上限。超えそうなら実時間より遅く進める
export const MAX_FRAME_SIM = 1 / 30 // 1 フレームで進める時間の上限 [s](タブの復帰直後などで跳ばない)
export const SLOW_NOTE_BELOW = 0.8 // 実時間に対する進みがこれより遅いときだけ、読みの欄に書く
export const STIR_STRENGTH = 400 // かき混ぜの強さ(1 秒あたりの近づきやすさ)。sphStep の stir.strength
export const STIR_SPEED_MAX = 6 // ポインタの速度の上限 [m/s]
export const STIR_STALE_MS = 80 // これより長く動かさなかったら、ポインタの速度を 0 とみなす(止めた手)
export const STIR_RADIUS_PX = 36 // かき混ぜの半径(画面上)
export const SPEED_FULL = 2.5 // 色が FAST_COLOR(速い粒子の色)になる速さ [m/s]
export const DENSITY_LOW = 0.6 // ρ/ρ0 がこれ以下で ink
export const DENSITY_HIGH = 1.1 // ρ/ρ0 がこれ以上で FAST_COLOR
export const FAST_COLOR = 'lane-1' // 速い(密度が高い)粒子の色。readColors の rgb のキー(--lane-1)
export const LEVELS = 12 // ink〜FAST_COLOR の段数(同じ色の粒子を 1 回の fill でまとめて描く)
const TAU = Math.PI * 2

export const BASE = defaultSphParams(SPACING)
export const DEFAULTS = { g: 9.8, k: BASE.k, mu: BASE.mu, rho0: Math.round(BASE.rho0) }

// 画面に出ているパラメータ p = { g, k, mu, rho0 } を、sphStep に渡す params に写す
export function syncParams(s, p) {
  s.params.k = p.k
  s.params.mu = p.mu
  s.params.rho0 = p.rho0
  s.params.gravity[1] = -p.g
}

// 粒子の状態と、毎フレーム使う作業用の配列をここで 1 度だけ作る(フレームの中では作らない)
export function makeSim(tankKey, p) {
  const tank = TANKS[tankKey]
  const n = tank.cols * tank.rows
  const s = {
    tankKey,
    tank,
    state: createSphState(n, tank.width, tank.height, BASE.h),
    params: { ...BASE, gravity: [0, -DEFAULTS.g], stir: null },
    stir: { x: 0, y: 0, vx: 0, vy: 0, radius: 0.1, strength: STIR_STRENGTH, lastMove: 0 },
    stirOn: false,
    probe: { on: false, x: 0, y: 0 }, // ポインタの位置(グリッドの表示で、調べるセルと近傍を見せる)
    nbr: new Int32Array(n), // probe から h 以内の粒子
    bucket: new Uint8Array(n), // 粒子の色の段
    stepMs: 0.5, // 1 ステップにかかる時間の移動平均 [ms]
    stats: { dt: sphMaxDt(BASE), steps: 0, ms: 0, speed: 1 },
    frames: 0, // 進めたフレームの数(始めの数フレームは、まだ速くなっていない JIT のためにステップ数を絞る)
    acc: 0,
  }
  resetSim(s, p)
  return s
}

// ダムの決壊の最初に戻す(水の塊を水槽の左下に積む)
export function resetSim(s, p) {
  syncParams(s, p)
  const { state, tank } = s
  fillBlock(state, 0, 0, tank.cols, tank.rows, SPACING)
  state.force.fill(0)
  s.stirOn = false
  s.params.stir = null
  s.probe.on = false
  s.stats.steps = 0
  s.stats.ms = 0
  s.stats.speed = 1
  s.frames = 0
  sphStep(state, s.params, 0) // dt = 0: 動かさずに、近傍・密度・圧力だけ最新にする(止めたままの絵に使う)
}

// 1 フレーム分進める。Δt は sphMaxDt 以下に保ち、1 フレームの計算が予算を超えそうなら
// ステップ数を減らす(そのぶん実時間より遅く進む。Δt は大きくしない)
export function advanceSim(s, frameDt, now = () => performance.now()) {
  const { state, params, stats, stir } = s
  const dtMax = sphMaxDt(params)
  const simDt = Math.min(frameDt, MAX_FRAME_SIM)
  const wanted = Math.max(1, Math.ceil(simDt / dtMax - 1e-9))
  const affordable = Math.max(1, Math.floor(FRAME_BUDGET_MS / s.stepMs))
  const steps = Math.min(wanted, affordable, 2 + s.frames)
  const dt = steps === wanted ? simDt / steps : dtMax
  const t0 = now()
  if (s.stirOn && t0 - stir.lastMove > STIR_STALE_MS) {
    stir.vx = 0
    stir.vy = 0
  }
  for (let i = 0; i < steps; i++) sphStep(state, params, dt)
  const elapsed = now() - t0
  s.stepMs += 0.15 * (Math.min(elapsed / steps, 4) - s.stepMs)
  stats.dt = dt
  stats.steps = steps
  stats.ms += 0.2 * (elapsed - stats.ms)
  stats.speed = (steps * dt) / simDt
  s.frames++
}

// 絵の下に出す 2 行の数値
export function readoutLines(s) {
  const { state, stats, params } = s
  const n = state.n
  const slow = stats.speed < SLOW_NOTE_BELOW ? ` ・ 実時間の ${stats.speed.toFixed(2)} 倍` : ''
  return [
    `粒子 ${n} 個 ・ h = ${params.h.toFixed(2)} m ・ 近い組 ${state.grid.pairCount} ・ 距離を調べた候補 ${state.grid.checked}（総当たりなら ${(n * (n - 1)) / 2}）`,
    `Δt = ${(stats.dt * 1000).toFixed(2)} ms × ${stats.steps} 回/フレーム ・ 計算 ${stats.ms.toFixed(1)} ms${slow}`,
  ]
}

// ---------------------------------------------------------------- ポインタ(かき混ぜ)

// 画面の座標(CSS ピクセル、左上が原点)→ 水槽の座標 [m]。scale は 1 m あたりのピクセル数
function toWorld(s, x, y, width, height) {
  const scale = width / s.tank.width
  return { wx: x / scale, wy: (height - y) / scale, scale }
}

export function pointerDown(s, x, y, width, height) {
  const { wx, wy, scale } = toWorld(s, x, y, width, height)
  const { stir, probe } = s
  stir.x = wx
  stir.y = wy
  stir.vx = 0
  stir.vy = 0
  stir.radius = Math.min(0.2, Math.max(0.08, STIR_RADIUS_PX / scale))
  stir.lastMove = performance.now()
  s.stirOn = true
  s.params.stir = stir
  probe.on = true
  probe.x = wx
  probe.y = wy
}

// vx, vy は画面上のポインタの速度 [px/s]
export function pointerMove(s, x, y, vx, vy, width, height) {
  const { wx, wy, scale } = toWorld(s, x, y, width, height)
  const { stir, probe } = s
  stir.x = wx
  stir.y = wy
  let svx = vx / scale
  let svy = -vy / scale
  const speed = Math.hypot(svx, svy)
  if (speed > STIR_SPEED_MAX) {
    svx *= STIR_SPEED_MAX / speed
    svy *= STIR_SPEED_MAX / speed
  }
  stir.vx = svx
  stir.vy = svy
  stir.lastMove = performance.now()
  probe.x = wx
  probe.y = wy
}

export function pointerUp(s, keepProbe) {
  s.stirOn = false
  s.params.stir = null
  if (!keepProbe) s.probe.on = false
}

export function pointerHover(s, x, y, width, height) {
  const { wx, wy } = toWorld(s, x, y, width, height)
  s.probe.on = true
  s.probe.x = wx
  s.probe.y = wy
}

// ---------------------------------------------------------------- 描画

// ink〜FAST_COLOR の段ごとの色と、グリッドなどの線の色。テーマが変わったとき(colors が新しくなったとき)だけ作り直す
export function ensureCache(cache, colors) {
  if (cache.colors === colors) return cache
  const a = colors.rgb.ink
  const b = colors.rgb[FAST_COLOR]
  cache.colors = colors
  cache.palette = Array.from({ length: LEVELS }, (_, i) => {
    const t = i / (LEVELS - 1)
    const c = [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t))
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
  })
  cache.gridLine = colors.alpha('muted', 0.8) // 地に 3:1 以上(0.45 だと 1.8:1)
  cache.cell = colors.alpha('ink', 0.08) // 調べるセルの塗り。淡いので、輪郭(cellLine)で見せる
  cache.cellLine = colors.muted // 地に 4.4:1 以上(以前の accent の塗りは 1.2:1 で、ほとんど見えなかった)
  return cache
}

// 1 フレームの絵。opts = { colorMode: 'speed' | 'density', showGrid, rho0 }。配列は作らない
export function drawFluid(ctx, width, height, colors, s, opts, cache) {
  const { state, tank, params, probe } = s
  const pal = ensureCache(cache, colors)
  const scale = width / tank.width
  const { pos, vel, rho, n } = state
  const h = params.h

  ctx.fillStyle = colors.surface
  ctx.fillRect(0, 0, width, height)

  if (opts.showGrid) {
    const cell = h * scale
    ctx.strokeStyle = pal.gridLine
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 1; c * h < tank.width - 1e-9; c++) {
      const x = Math.round(c * cell) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let c = 1; c * h < tank.height - 1e-9; c++) {
      const y = Math.round(height - c * cell) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
    if (probe.on) {
      // ポインタのある 1 セルと、その周りの 8 セル(近傍探索で調べる範囲)
      const cx = Math.floor(probe.x / h)
      const cy = Math.floor(probe.y / h)
      const x0 = Math.max(0, (cx - 1) * h)
      const x1 = Math.min(tank.width, (cx + 2) * h)
      const y0 = Math.max(0, (cy - 1) * h)
      const y1 = Math.min(tank.height, (cy + 2) * h)
      ctx.fillStyle = pal.cell
      ctx.fillRect(x0 * scale, height - y1 * scale, (x1 - x0) * scale, (y1 - y0) * scale)
      ctx.strokeStyle = pal.cellLine
      ctx.lineWidth = 2
      ctx.strokeRect(x0 * scale, height - y1 * scale, (x1 - x0) * scale, (y1 - y0) * scale)
    }
  }

  // 粒子: 速さか密度を ink〜FAST_COLOR の段にして、同じ段の粒子を 1 回の fill で描く
  const bucket = s.bucket
  const top = LEVELS - 1
  if (opts.colorMode === 'speed') {
    for (let i = 0; i < n; i++) {
      const t = Math.hypot(vel[2 * i], vel[2 * i + 1]) / SPEED_FULL
      bucket[i] = t >= 1 ? top : Math.round(t * top)
    }
  } else {
    const span = DENSITY_HIGH - DENSITY_LOW
    for (let i = 0; i < n; i++) {
      const t = (rho[i] / opts.rho0 - DENSITY_LOW) / span
      bucket[i] = t >= 1 ? top : t <= 0 ? 0 : Math.round(t * top)
    }
  }
  const r = Math.max(1.5, 0.6 * SPACING * scale)
  for (let b = 0; b < LEVELS; b++) {
    ctx.fillStyle = pal.palette[b]
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      if (bucket[i] !== b) continue
      const x = pos[2 * i] * scale
      const y = height - pos[2 * i + 1] * scale
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, TAU)
    }
    ctx.fill()
  }

  if (opts.showGrid && probe.on) {
    // ポインタから h 以内の粒子(9 セルの粒子を距離で絞ったもの)に輪をかける
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(probe.x * scale, height - probe.y * scale, h * scale, 0, TAU)
    ctx.stroke()
    const count = neighborsAt(state.grid, pos, probe.x, probe.y, h, s.nbr, -1)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let q = 0; q < count; q++) {
      const i = s.nbr[q]
      const x = pos[2 * i] * scale
      const y = height - pos[2 * i + 1] * scale
      ctx.moveTo(x + r + 1.5, y)
      ctx.arc(x, y, r + 1.5, 0, TAU)
    }
    ctx.stroke()
  }

  if (s.stirOn) {
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(s.stir.x * scale, height - s.stir.y * scale, s.stir.radius * scale, 0, TAU)
    ctx.stroke()
  }
}
