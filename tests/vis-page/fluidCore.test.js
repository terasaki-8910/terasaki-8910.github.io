// 節「流体」のシミュレーション(src/components/visualization/sims/fluidCore.js)の、React に依存しない部分を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sphMaxDt } from '../../src/utils/vis/sph.js'
import {
  TANKS,
  BASE,
  DEFAULTS,
  FRAME_BUDGET_MS,
  LEVELS,
  makeSim,
  resetSim,
  syncParams,
  advanceSim,
  readoutLines,
  pointerDown,
  pointerMove,
  pointerUp,
  pointerHover,
  drawFluid,
} from '../../src/components/visualization/sims/fluidCore.js'

// 計算にかかった時間を 0 とみなす時計(実機の速さに左右されず、ステップ数が決まる)
const CLOCK = () => 0
const P = { g: DEFAULTS.g, k: DEFAULTS.k, mu: DEFAULTS.mu, rho0: DEFAULTS.rho0 }

// 描いた呼び出しを数えるだけの ctx
function fakeCtx() {
  const log = { arcs: 0, fills: 0, strokes: 0, fillStyles: new Set(), strokeStyles: new Set() }
  const ctx = {
    log,
    set fillStyle(v) {
      log.fillStyles.add(v)
    },
    set strokeStyle(v) {
      log.strokeStyles.add(v)
    },
    set lineWidth(v) {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {
      log.arcs++
    },
    fill() {
      log.fills++
    },
    stroke() {
      log.strokes++
    },
  }
  return ctx
}

// useCanvas の readColors が返す形(色の値は 16 進でなく、テストでは rgb 文字列)
function fakeColors() {
  return {
    surface: 'rgb(255, 255, 240)',
    ink: 'rgb(20, 20, 20)',
    muted: 'rgb(100, 100, 100)',
    rgb: { ink: [20, 20, 20], accent: [250, 160, 160], muted: [100, 100, 100] },
    alpha: (name, a) => `rgb(0 0 0 / ${a}-${name})`,
  }
}

test('水槽と粒子の数: 広い画面は 1000〜1500 個、幅 640px 未満は 500〜700 個', () => {
  const wide = makeSim('wide', P)
  const narrow = makeSim('narrow', P)
  assert.equal(wide.state.n, 1280)
  assert.equal(narrow.state.n, 600)
  assert.ok(wide.state.n >= 1000 && wide.state.n <= 1500)
  assert.ok(narrow.state.n >= 500 && narrow.state.n <= 700)
  // 最初の絵から密度と近傍が出ている(止めたままでも密度の色が出せる)
  assert.ok(wide.state.rho[0] > 0 && wide.state.grid.pairCount > 0)
  // ダムの決壊: 水の塊は水槽の左下に積まれ、右側は空
  for (const s of [wide, narrow]) {
    let right = 0
    for (let i = 0; i < s.state.n; i++) right = Math.max(right, s.state.pos[2 * i])
    assert.ok(right < s.tank.width / 2)
  }
})

test('advanceSim: Δt は sphMaxDt 以下。実時間どおりに進み、k を変えるとステップ数が変わる', () => {
  for (const k of [40, 100, 150]) {
    const s = makeSim('wide', { ...P, k })
    s.stepMs = 0.1 // 計算が速いとみなす
    s.frames = 100 // 始めの数フレームのステップ数の絞りは終わっている
    syncParams(s, { ...P, k })
    advanceSim(s, 1 / 60, CLOCK)
    assert.ok(s.stats.dt <= sphMaxDt(s.params) + 1e-15, `k=${k}`)
    assert.ok(Math.abs(s.stats.steps * s.stats.dt - 1 / 60) < 1e-12)
    assert.equal(s.stats.speed, 1)
  }
  const a = makeSim('wide', { ...P, k: 40 })
  const b = makeSim('wide', { ...P, k: 150 })
  a.stepMs = b.stepMs = 0.1
  a.frames = b.frames = 100
  advanceSim(a, 1 / 60, CLOCK)
  advanceSim(b, 1 / 60, CLOCK)
  assert.ok(b.stats.steps > a.stats.steps)
})

test('advanceSim: 計算が重いときは、ステップ数を減らして実時間より遅く進む(Δt は大きくしない)', () => {
  const s = makeSim('wide', P)
  s.stepMs = 3 // 1 ステップ 3 ms → 予算 8 ms では 2 ステップ
  s.frames = 100
  advanceSim(s, 1 / 60, CLOCK) // 測った時間は 0(stepMs は 3 から少し下がるだけ)
  assert.equal(s.stats.steps, Math.floor(FRAME_BUDGET_MS / 3))
  assert.equal(s.stats.dt, sphMaxDt(s.params))
  assert.ok(s.stats.speed < 0.5 && s.stats.speed > 0)
  assert.match(readoutLines(s)[1], /実時間の/)
})

test('advanceSim: 始めの数フレームはステップ数を絞り(JIT が温まるまで)、だんだん増やす', () => {
  const s = makeSim('wide', P)
  s.stepMs = 0.05
  const steps = []
  for (let f = 0; f < 12; f++) {
    advanceSim(s, 1 / 60, CLOCK)
    steps.push(s.stats.steps)
    assert.ok(s.stats.dt <= sphMaxDt(s.params) + 1e-15)
  }
  assert.deepEqual(steps.slice(0, 4), [2, 3, 4, 5])
  assert.equal(steps[11], 12) // 1/60 s ÷ 1.5 ms = 11.1 → 12 ステップ
})

test('1.5 秒のダム崩壊: 発散せず、水は水槽の外に出ず、右へ広がる。Δt の上限と粒子の数は変わらない', () => {
  for (const key of ['wide', 'narrow']) {
    const s = makeSim(key, P)
    s.stepMs = 0.05
    const { state, tank } = s
    const n = state.n
    let x0 = 0
    for (let i = 0; i < n; i++) x0 += state.pos[2 * i]
    const frame = 1 / 60
    for (let f = 0; f < 90; f++) {
      syncParams(s, P)
      advanceSim(s, frame, CLOCK)
      assert.ok(s.stats.dt <= sphMaxDt(s.params) + 1e-15)
    }
    let x1 = 0
    for (let i = 0; i < n; i++) {
      const x = state.pos[2 * i]
      const y = state.pos[2 * i + 1]
      assert.ok(Number.isFinite(x) && Number.isFinite(y))
      assert.ok(x >= 0 && x <= tank.width && y >= 0 && y <= tank.height)
      x1 += x
    }
    assert.ok(x1 / n > x0 / n + 0.2, `${key}: 重心 ${x0 / n} → ${x1 / n}`)
    assert.equal(state.n, n)
  }
})

test('パラメータの範囲(スライダーの両端)でも 2 秒のあいだ発散しない', () => {
  const corners = [
    { g: 20, k: 150, mu: 5, rho0: 900 },
    { g: 20, k: 150, mu: 30, rho0: 1100 },
    { g: 0, k: 40, mu: 5, rho0: 1100 },
    { g: 20, k: 40, mu: 30, rho0: 900 },
  ]
  for (const c of corners) {
    const s = makeSim('wide', c)
    s.stepMs = 0.05
    for (let f = 0; f < 120; f++) {
      syncParams(s, c)
      advanceSim(s, 1 / 60, CLOCK)
    }
    for (let i = 0; i < 2 * s.state.n; i++) assert.ok(Number.isFinite(s.state.pos[i]) && Number.isFinite(s.state.vel[i]), JSON.stringify(c))
  }
})

test('resetSim: 最初の積み方に戻り、速度が 0 になる', () => {
  const s = makeSim('narrow', P)
  s.stepMs = 0.05
  const before = Float64Array.from(s.state.pos)
  for (let f = 0; f < 30; f++) advanceSim(s, 1 / 60, CLOCK)
  assert.notDeepEqual(Float64Array.from(s.state.pos), before)
  resetSim(s, P)
  assert.deepEqual(Float64Array.from(s.state.pos), before)
  assert.ok(s.state.vel.every((v) => v === 0))
})

test('ポインタ: 画面の座標を水槽の座標(y は上向き)に直し、速度は上限で打ち切り、離すと params.stir が外れる', () => {
  const s = makeSim('wide', P)
  const width = 600 // 1 m あたり 300 px(水槽 2 m × 1 m なので高さ 300)
  const height = 300
  pointerDown(s, 150, 60, width, height)
  assert.ok(Math.abs(s.stir.x - 0.5) < 1e-12 && Math.abs(s.stir.y - 0.8) < 1e-12)
  assert.equal(s.params.stir, s.stir)
  assert.ok(s.stirOn && s.probe.on)
  assert.ok(s.stir.radius >= 0.08 && s.stir.radius <= 0.2)
  pointerMove(s, 180, 90, 300, -150, width, height) // 右へ 300 px/s、上へ 150 px/s(画面の y は下向き)
  assert.ok(Math.abs(s.stir.vx - 1) < 1e-12 && Math.abs(s.stir.vy - 0.5) < 1e-12)
  pointerMove(s, 180, 90, 6000, 0, width, height)
  assert.ok(Math.abs(Math.hypot(s.stir.vx, s.stir.vy) - 6) < 1e-9)
  pointerUp(s, true)
  assert.equal(s.params.stir, null)
  assert.ok(!s.stirOn && s.probe.on)
  pointerUp(s, false)
  assert.ok(!s.probe.on)
  pointerHover(s, 300, 150, width, height)
  assert.ok(s.probe.on && Math.abs(s.probe.x - 1) < 1e-12 && Math.abs(s.probe.y - 0.5) < 1e-12)
})

test('ポインタで押すと、近くの粒子がポインタの向きに動く', () => {
  const s = makeSim('wide', { ...P, g: 0 })
  s.stepMs = 0.05
  const syncAll = () => syncParams(s, { ...P, g: 0 })
  // 水の塊の中(x = 0.4, y = 0.3)で、右向きに動かす
  const width = 600
  const height = 300
  pointerDown(s, 0.4 * 300, height - 0.3 * 300, width, height)
  pointerMove(s, 0.4 * 300, height - 0.3 * 300, 450, 0, width, height) // +1.5 m/s
  let near = -1
  let best = Infinity
  for (let i = 0; i < s.state.n; i++) {
    const d = Math.hypot(s.state.pos[2 * i] - 0.4, s.state.pos[2 * i + 1] - 0.3)
    if (d < best) {
      best = d
      near = i
    }
  }
  for (let f = 0; f < 3; f++) {
    s.stir.lastMove = performance.now() // 速度を保つ
    syncAll()
    advanceSim(s, 1 / 60, CLOCK)
  }
  assert.ok(s.state.vel[2 * near] > 0.3, `中心の粒子の速度 ${s.state.vel[2 * near]}`)
})

test('drawFluid: 色の段ごとにまとめて描き、粒子の数だけ円を描く。16 進の色は使わず、2 回目以降は色の配列を作り直さない', () => {
  const s = makeSim('wide', P)
  s.stepMs = 0.05
  for (let f = 0; f < 20; f++) advanceSim(s, 1 / 60, CLOCK)
  const colors = fakeColors()
  const cache = { colors: null, palette: [], gridLine: '', cell: '' }
  for (const colorMode of ['speed', 'density']) {
    const ctx = fakeCtx()
    drawFluid(ctx, 600, 300, colors, s, { colorMode, showGrid: false, rho0: P.rho0 }, cache)
    assert.equal(ctx.log.arcs, s.state.n)
    assert.ok(ctx.log.fills <= LEVELS)
    for (const style of [...ctx.log.fillStyles, ...ctx.log.strokeStyles]) assert.ok(!String(style).includes('#'), style)
  }
  assert.equal(cache.palette.length, LEVELS)
  assert.equal(cache.palette[0], 'rgb(20, 20, 20)') // 段 0 は ink
  assert.equal(cache.palette[LEVELS - 1], 'rgb(250, 160, 160)') // 最後の段は accent
  const palette = cache.palette
  drawFluid(fakeCtx(), 600, 300, colors, s, { colorMode: 'speed', showGrid: false, rho0: P.rho0 }, cache)
  assert.equal(cache.palette, palette)
  drawFluid(fakeCtx(), 600, 300, fakeColors(), s, { colorMode: 'speed', showGrid: false, rho0: P.rho0 }, cache) // テーマが変わった
  assert.notEqual(cache.palette, palette)
})

test('drawFluid: グリッドの表示では、ポインタの近傍(h 以内の粒子)に輪をかけ、かき混ぜ中は半径の円を描く', () => {
  const s = makeSim('wide', P)
  const colors = fakeColors()
  const cache = { colors: null, palette: [], gridLine: '', cell: '' }
  const opts = { colorMode: 'speed', showGrid: true, rho0: P.rho0 }
  const plain = fakeCtx()
  drawFluid(plain, 600, 300, colors, s, opts, cache)
  assert.equal(plain.log.arcs, s.state.n) // ポインタが無ければ粒子だけ
  pointerHover(s, 0.3 * 300, 300 - 0.3 * 300, 600, 300) // 水の中
  const probe = fakeCtx()
  drawFluid(probe, 600, 300, colors, s, opts, cache)
  const neighbors = probe.log.arcs - s.state.n - 1 // 粒子 + h の円 1 つ + 近傍の輪
  assert.ok(neighbors >= 10 && neighbors <= 60, `近傍 ${neighbors} 個`)
  pointerDown(s, 0.3 * 300, 300 - 0.3 * 300, 600, 300)
  const stir = fakeCtx()
  drawFluid(stir, 600, 300, colors, s, opts, cache)
  assert.equal(stir.log.arcs, probe.log.arcs + 1)
})

test('readoutLines: 粒子の数・h・近い組・総当たりとの比較・Δt を出す', () => {
  const s = makeSim('wide', P)
  const [a, b] = readoutLines(s)
  assert.match(a, /粒子 1280 個/)
  assert.match(a, new RegExp(`h = ${BASE.h.toFixed(2)} m`))
  assert.match(a, new RegExp(`総当たりなら ${(1280 * 1279) / 2}`))
  assert.match(b, /Δt = 1\.50 ms/)
  assert.ok(TANKS.wide.width / TANKS.wide.height === 2)
})
