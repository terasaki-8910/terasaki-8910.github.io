import test from 'node:test'
import assert from 'node:assert/strict'
import {
  poly6,
  spiky,
  spikyGrad,
  viscLaplacian,
  cubicSpline,
  cubicSplineGrad,
  UniformGrid,
  findPairs,
  neighborsAt,
  createSphState,
  fillBlock,
  restDensity,
  computeDensity,
  computePressure,
  computeForces,
  sphStep,
  reflectAtWalls,
  defaultSphParams,
  sphMaxDt,
  sphInterpolate,
  sphGradient,
  mpsWeight,
  mpsReferenceDensity,
  mpsGradient,
} from '../../src/utils/vis/sph.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

// 種を固定した乱数(線形合同法)
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 2 次元の数値積分 ∫∫ f(x, y) dA(領域 [−h, h]² を N×N に分けた中点則)
function integrate2D(f, h, N = 1000) {
  const d = (2 * h) / N
  let sum = 0
  for (let a = 0; a < N; a++) {
    const x = -h + (a + 0.5) * d
    for (let b = 0; b < N; b++) sum += f(x, -h + (b + 0.5) * d)
  }
  return sum * d * d
}

// 正方格子に並べた状態(左下が原点、cols×rows、間隔 spacing)
function latticeState(cols, rows, spacing, h, width = cols * spacing, height = rows * spacing) {
  const state = createSphState(cols * rows, width, height, h)
  fillBlock(state, 0, 0, cols, rows, spacing)
  state.grid.build(state.pos, state.n)
  findPairs(state.grid, state.pos, state.n, h)
  return state
}

// ランダムな粒子(領域 [0, w] × [0, hgt])
function randomState(n, w, hgt, h, seed) {
  const rand = lcg(seed)
  const state = createSphState(n, w, hgt, h)
  for (let i = 0; i < n; i++) {
    state.pos[2 * i] = rand() * w
    state.pos[2 * i + 1] = rand() * hgt
    state.vel[2 * i] = rand() * 2 - 1
    state.vel[2 * i + 1] = rand() * 2 - 1
  }
  state.grid.build(state.pos, state.n)
  findPairs(state.grid, state.pos, state.n, h)
  return state
}

// ---------------------------------------------------------------- 核

test('cubicSpline: 2 次元で ∫W dA = 1(h=0.3、1、2.7 のどれでも。定数 10/(7πs²) は h に合わせて変わる)', () => {
  for (const h of [0.3, 1, 2.7]) {
    near(integrate2D((x, y) => cubicSpline(Math.hypot(x, y), h), h), 1, 1e-6)
  }
  // 中心の値 σ = 10/(7πs²)、s = h/2
  near(cubicSpline(0, 1), 40 / (7 * Math.PI), 1e-12)
  // 影響半径 h の外では 0、内側では正で、中心から離れるほど小さくなる
  assert.equal(cubicSpline(1, 1), 0)
  assert.equal(cubicSpline(1.5, 1), 0)
  let prev = Infinity
  for (let r = 0; r < 1; r += 0.01) {
    const w = cubicSpline(r, 1)
    assert.ok(w > 0 && w <= prev)
    prev = w
  }
})

test('poly6: 2 次元で ∫W dA = 1(定数 4/(πh⁸))。r² で呼べて、h の外で 0', () => {
  for (const h of [0.3, 1, 2.7]) {
    near(integrate2D((x, y) => poly6(x * x + y * y, h), h), 1, 1e-6)
  }
  near(poly6(0, 1), 4 / Math.PI, 1e-12) // 中心の値 4/(πh²)
  assert.equal(poly6(1, 1), 0)
  assert.equal(poly6(2, 1), 0)
  near(poly6(0.25, 1), (4 / Math.PI) * 0.75 ** 3, 1e-12)
})

test('spiky: 2 次元で ∫W dA = 1(定数 10/(πh⁵))', () => {
  for (const h of [0.3, 1, 2.7]) {
    near(integrate2D((x, y) => spiky(Math.hypot(x, y), h), h), 1, 1e-6)
  }
  near(spiky(0, 1), 10 / Math.PI, 1e-12)
  assert.equal(spiky(1, 1), 0)
})

test('spikyGrad・cubicSplineGrad: 核の勾配(中心差分と一致)で、∫∇W·r dA = −2(部分積分で ∫W=1 と同じ条件)', () => {
  const h = 0.8
  const g = [0, 0]
  for (const [grad, W] of [[spikyGrad, spiky], [cubicSplineGrad, cubicSpline]]) {
    const e = 1e-6
    for (const [x, y] of [[0.1, 0.05], [-0.3, 0.2], [0.4, -0.5], [0.01, 0.02]]) {
      const r = Math.hypot(x, y)
      grad(x, y, r, h, g)
      const fx = (W(Math.hypot(x + e, y), h) - W(Math.hypot(x - e, y), h)) / (2 * e)
      const fy = (W(Math.hypot(x, y + e), h) - W(Math.hypot(x, y - e), h)) / (2 * e)
      near(g[0], fx, 1e-5 * Math.max(1, Math.abs(fx)))
      near(g[1], fy, 1e-5 * Math.max(1, Math.abs(fy)))
      // 勾配は (x, y) と逆向き(W は離れるほど小さくなる)
      assert.ok(g[0] * x + g[1] * y < 0)
    }
    near(integrate2D((x, y) => {
      grad(x, y, Math.hypot(x, y), h, g)
      return g[0] * x + g[1] * y
    }, h), -2, 1e-5)
    // 影響半径の外と、r=0(向きが決まらない)では 0
    assert.deepEqual(Array.from(grad(0.6, 0.6, Math.hypot(0.6, 0.6), h, g)), [0, 0])
    assert.deepEqual(Array.from(grad(0, 0, 0, h, g)), [0, 0])
  }
  // 勾配は x_i − x_j について奇関数(向きを逆にすると符号が逆)
  const a = spikyGrad(0.2, -0.1, Math.hypot(0.2, 0.1), h, [0, 0])
  const b = spikyGrad(-0.2, 0.1, Math.hypot(0.2, 0.1), h, [0, 0])
  near(a[0], -b[0])
  near(a[1], -b[1])
})

test('viscLaplacian: h の外で 0、内側で正。係数 40/(πh⁵) は ∫ r²∇²W dA = 4(∇²(x²+y²) = 4 を再現する条件)から決まる', () => {
  for (const h of [0.3, 1, 2.7]) {
    near(integrate2D((x, y) => (x * x + y * y) * viscLaplacian(Math.hypot(x, y), h), h), 4, 1e-5)
  }
  assert.equal(viscLaplacian(1, 1), 0)
  assert.equal(viscLaplacian(1.2, 1), 0)
  assert.ok(viscLaplacian(0.5, 1) > 0)
  near(viscLaplacian(0, 1), 40 / Math.PI, 1e-12)
  // 1 次式 ∫ (x) ∇²W = 0(奇関数)、定数の ∇² は ∫∇²W dA = 2π∫ ∇²W r dr がほぼ 0 でなくてもよいので確かめない
})

// ---------------------------------------------------------------- 近傍探索

test('UniformGrid.build: 全粒子がちょうど 1 つのセルに入り(cellItems は順列)、領域の外の粒子は端のセルに入る', () => {
  const rand = lcg(5)
  const n = 400
  const h = 0.1
  const pos = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    pos[2 * i] = rand() * 2.4 - 0.2 // 領域 [0, 2] の外にもはみ出す
    pos[2 * i + 1] = rand() * 1.4 - 0.2
  }
  const grid = new UniformGrid(2, 1, h, n)
  grid.build(pos, n)
  assert.equal(grid.nx, 20)
  assert.equal(grid.ny, 10)
  assert.equal(grid.cellStart[grid.nx * grid.ny], n)
  assert.deepEqual(Array.from(grid.cellItems.slice(0, n)).sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i))
  for (let c = 0; c < grid.nx * grid.ny; c++) {
    for (let k = grid.cellStart[c]; k < grid.cellStart[c + 1]; k++) {
      const i = grid.cellItems[k]
      assert.equal(grid.cellOf[i], c)
      assert.equal(grid.cellIndex(pos[2 * i], pos[2 * i + 1]), c)
      if (k > grid.cellStart[c]) assert.ok(grid.cellItems[k - 1] < i) // セルの中は番号の小さい順
    }
  }
  assert.equal(grid.cellIndex(-5, -5), 0)
  assert.equal(grid.cellIndex(99, 99), grid.nx * grid.ny - 1)
  assert.equal(grid.cellIndex(0.05, 0.05), 0)
  assert.equal(grid.cellIndex(0.15, 0.05), 1)
  assert.equal(grid.cellIndex(0.05, 0.15), grid.nx)
})

// 総当たりで、距離が h より近い組(i<j)を '(i,j)' の集合にする
function bruteForcePairs(pos, n, h) {
  const set = new Set()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pos[2 * i] - pos[2 * j]
      const dy = pos[2 * i + 1] - pos[2 * j + 1]
      if (dx * dx + dy * dy < h * h) set.add(`${i},${j}`)
    }
  }
  return set
}

test('findPairs: 種を固定した 1500 個(領域の外の粒子も含む)で、総当たりと同じ組が 1 組ずつ見つかる', () => {
  const rand = lcg(1)
  const n = 1500
  const h = 0.08
  const pos = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    pos[2 * i] = rand() * 2.1 - 0.05
    pos[2 * i + 1] = rand() * 1.1 - 0.05
  }
  const grid = new UniformGrid(2, 1, h, n)
  grid.build(pos, n)
  const count = findPairs(grid, pos, n, h)
  const expected = bruteForcePairs(pos, n, h)
  assert.equal(count, expected.size)
  assert.equal(grid.pairCount, count)
  const found = new Set()
  for (let q = 0; q < count; q++) {
    const i = grid.pairs[2 * q]
    const j = grid.pairs[2 * q + 1]
    assert.ok(i < j)
    found.add(`${i},${j}`)
  }
  assert.equal(found.size, count) // 同じ組を 2 回数えていない
  assert.deepEqual(found, expected)
  assert.ok(count > 1000) // 組が少なすぎて自明な一致ではない
  // 調べた候補は N(N−1)/2 = 1124250 組の 3% 以下
  assert.ok(grid.checked < 0.03 * ((n * (n - 1)) / 2), `候補 ${grid.checked}`)
})

test('findPairs: 影響半径 h を grid.h より小さくしても総当たりと一致し、粒子が重なっていても組は 1 回だけ', () => {
  const rand = lcg(8)
  const n = 600
  const pos = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    pos[2 * i] = rand()
    pos[2 * i + 1] = rand()
  }
  pos[2] = pos[0] // 重なった 2 粒子
  pos[3] = pos[1]
  const grid = new UniformGrid(1, 1, 0.1, n)
  grid.build(pos, n)
  const count = findPairs(grid, pos, n, 0.06)
  assert.equal(count, bruteForcePairs(pos, n, 0.06).size)
})

test('findPairs: 調べる候補の数は粒子数に比例する(密度が同じで N を 2 倍にすると約 2 倍。総当たりは約 4 倍)', () => {
  const checked = (n, side) => {
    const rand = lcg(3)
    const pos = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      pos[2 * i] = rand() * side
      pos[2 * i + 1] = rand() * side
    }
    const grid = new UniformGrid(side, side, 0.1, n)
    grid.build(pos, n)
    findPairs(grid, pos, n, 0.1)
    return grid.checked
  }
  const c1 = checked(1500, 1)
  const c2 = checked(3000, Math.SQRT2) // 面積が 2 倍で密度は同じ
  const c4 = checked(6000, 2)
  near(c2 / c1, 2, 0.15)
  near(c4 / c2, 2, 0.15)
  // 総当たりは N²: 6000 個で 1500 個の 16 倍
  near((6000 * 5999) / (1500 * 1499), 16, 0.1)
})

test('findPairs: 組の一覧は足りなくなったら増え、増えたあとも総当たりと同じ(capacity=0 から)', () => {
  const rand = lcg(17)
  const n = 300
  const pos = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    pos[2 * i] = rand() * 0.5
    pos[2 * i + 1] = rand() * 0.5
  }
  const grid = new UniformGrid(0.5, 0.5, 0.1, 0)
  assert.equal(grid.pairs.length, 0)
  grid.build(pos, n)
  const count = findPairs(grid, pos, n, 0.1)
  assert.ok(grid.pairs.length >= 2 * count)
  assert.equal(count, bruteForcePairs(pos, n, 0.1).size)
})

test('neighborsAt: 点 (x, y) から h より近い粒子を総当たりと同じだけ返し、skip の粒子は除く', () => {
  const rand = lcg(2)
  const n = 800
  const h = 0.09
  const pos = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    pos[2 * i] = rand()
    pos[2 * i + 1] = rand()
  }
  const grid = new UniformGrid(1, 1, h, n)
  grid.build(pos, n)
  const out = new Int32Array(n)
  for (const i of [0, 17, 123, 799]) {
    const count = neighborsAt(grid, pos, pos[2 * i], pos[2 * i + 1], h, out, i)
    const found = Array.from(out.slice(0, count)).sort((a, b) => a - b)
    const expected = []
    for (let j = 0; j < n; j++) {
      if (j !== i && Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]) < h) expected.push(j)
    }
    assert.deepEqual(found, expected)
  }
})

test('findPairs・neighborsAt: h が grid.h より大きいと、隣のセルの外が調べられないので RangeError', () => {
  const grid = new UniformGrid(1, 1, 0.1, 4)
  const pos = new Float64Array(8)
  grid.build(pos, 4)
  assert.throws(() => findPairs(grid, pos, 4, 0.11), RangeError)
  assert.throws(() => neighborsAt(grid, pos, 0, 0, 0.11, new Int32Array(4)), RangeError)
  assert.doesNotThrow(() => findPairs(grid, pos, 4, 0.1))
})

// ---------------------------------------------------------------- 密度・圧力・力

test('computeDensity: ρ_i = Σ_j m·W_poly6(|x_i − x_j|, h)(自分を含む)を、総当たりの和と同じ値で求める', () => {
  const n = 500
  const h = 0.12
  const state = randomState(n, 1, 1, h, 4)
  const m = 0.37
  computeDensity(state, { m, h })
  for (const i of [0, 1, 50, 250, 499]) {
    let expected = 0
    for (let j = 0; j < n; j++) {
      const dx = state.pos[2 * i] - state.pos[2 * j]
      const dy = state.pos[2 * i + 1] - state.pos[2 * j + 1]
      expected += m * poly6(dx * dx + dy * dy, h)
    }
    near(state.rho[i], expected, 1e-9 * expected)
  }
})

test('restDensity と computeDensity: 間隔 0.02、h=0.05、m=0.4 の格子の内側で ρ0=993.98(m/Δx² = 1000 の 0.6% 以内)', () => {
  const s0 = 0.02
  const h = 2.5 * s0
  const m = 1000 * s0 * s0
  const state = latticeState(30, 30, s0, h)
  computeDensity(state, { m, h })
  const mid = 15 * 30 + 15
  near(state.rho[mid], restDensity(m, h, s0), 1e-9)
  assert.equal(round(restDensity(m, h, s0), 2), 993.98)
  assert.ok(Math.abs(restDensity(m, h, s0) / 1000 - 1) < 0.0061)
  // 縁の粒子は近傍が半分しかないので密度が小さい(壁のそばの密度不足): 隅で 0.53 倍、辺の真ん中で 0.73 倍。
  // 縁から 2 粒子めの内側は、もう休止密度
  assert.equal(round(state.rho[0] / state.rho[mid], 2), 0.53)
  assert.equal(round(state.rho[15] / state.rho[mid], 2), 0.73)
  near(state.rho[2 * 30 + 15], state.rho[mid], 1e-9)
  // h を大きくすると、格子の SPH 密度は連続の m/Δx² に近づく
  near(restDensity(m, 6 * s0, s0), 1000, 0.1)
})

test('computePressure: p = k(ρ − ρ0)。minPressure を渡すと下限で打ち切る(省略すると負の圧力も出る)', () => {
  const state = createSphState(3, 1, 1, 0.1)
  state.rho.set([900, 1000, 1100])
  computePressure(state, { k: 100, rho0: 1000 })
  assert.deepEqual(Array.from(state.pressure), [-10000, 0, 10000])
  computePressure(state, { k: 100, rho0: 1000, minPressure: 0 })
  assert.deepEqual(Array.from(state.pressure), [0, 0, 10000])
})

test('computeForces: 力の総和が 0(運動量の保存)。圧力だけなら角運動量 Σ x×F も 0', () => {
  const n = 1500
  const h = 0.06
  const state = randomState(n, 1, 1, h, 11)
  const params = { m: 0.4, h, k: 100, rho0: 0, mu: 5 }
  // 密度の平均の 0.6 倍を休止密度にして、圧力が正の粒子と負の粒子を混ぜる
  computeDensity(state, params)
  computePressure(state, { ...params, rho0: (0.6 * state.rho.reduce((a, b) => a + b, 0)) / n })
  computeForces(state, params)
  let sx = 0
  let sy = 0
  let scale = 0
  for (let i = 0; i < n; i++) {
    sx += state.force[2 * i]
    sy += state.force[2 * i + 1]
    scale = Math.max(scale, Math.abs(state.force[2 * i]), Math.abs(state.force[2 * i + 1]))
  }
  assert.ok(scale > 1e-3, '力が小さすぎて自明な 0')
  near(sx, 0, 1e-10 * scale)
  near(sy, 0, 1e-10 * scale)
  // 圧力だけ(mu=0): 力は 2 粒子を結ぶ線上で逆向きなので、角運動量も保存する
  computeForces(state, { ...params, mu: 0 })
  let torque = 0
  let tscale = 0
  for (let i = 0; i < n; i++) {
    torque += state.pos[2 * i] * state.force[2 * i + 1] - state.pos[2 * i + 1] * state.force[2 * i]
    tscale += Math.abs(state.pos[2 * i] * state.force[2 * i + 1]) + Math.abs(state.pos[2 * i + 1] * state.force[2 * i])
  }
  near(torque, 0, 1e-12 * tscale)
})

test('computeForces(圧力): 線形の圧力場 p=G·y のとき、格子の内側で F = −m∇p/ρ。h=6Δx で 0.5% 以内、h=2.5Δx(動かすときの値)では 0.93 倍', () => {
  const s0 = 0.02
  const m = 1000 * s0 * s0
  const G = 500
  const ratio = (hOverS) => {
    const h = hOverS * s0
    const n = Math.ceil(2.5 * hOverS) * 2 + 1
    const state = latticeState(n, n, s0, h)
    computeDensity(state, { m, h })
    for (let i = 0; i < state.n; i++) state.pressure[i] = G * state.pos[2 * i + 1]
    computeForces(state, { m, h, mu: 0 })
    const mid = ((n - 1) / 2) * n + (n - 1) / 2
    near(state.force[2 * mid], 0, 1e-9) // 横向きの力はない
    return state.force[2 * mid + 1] / (m * (-G / state.rho[mid]))
  }
  near(ratio(6), 1, 0.005)
  assert.equal(round(ratio(2.5), 2), 0.93)
})

test('computeForces(粘性): μ∇²v·(m/ρ) に比例する。2 次関数のせん断流 v_x=y² で h=6Δx なら 0.5% 以内、1 次関数のせん断流・一様流では 0', () => {
  const s0 = 0.02
  const m = 1000 * s0 * s0
  const check = (hOverS, shear) => {
    const h = hOverS * s0
    const n = Math.ceil(2.5 * hOverS) * 2 + 1
    const state = latticeState(n, n, s0, h)
    computeDensity(state, { m, h })
    for (let i = 0; i < state.n; i++) {
      state.vel[2 * i] = shear(state.pos[2 * i + 1])
      state.vel[2 * i + 1] = 0
    }
    computeForces(state, { m, h, mu: 1 }) // 圧力は 0 のまま(pressure は未設定で 0)
    const mid = ((n - 1) / 2) * n + (n - 1) / 2
    return { fx: state.force[2 * mid], fy: state.force[2 * mid + 1], rho: state.rho[mid] }
  }
  const q6 = check(6, (y) => y * y)
  near(q6.fx / ((2 * m) / q6.rho), 1, 0.005) // ∇²(y²) = 2
  const q25 = check(2.5, (y) => y * y) // 動かすときの h=2.5Δx では 9% 大きく出る
  assert.equal(round(q25.fx / ((2 * m) / q25.rho), 2), 1.09)
  assert.ok(Math.abs(check(6, (y) => 3 * y).fx) < 1e-12)
  assert.ok(Math.abs(check(6, () => 0.7).fx) < 1e-15)
  assert.equal(q6.fy, 0)
})

test('computeForces(粘性): 粒子の速度のばらつきを減らす向きに働き、運動量は変えない(運動エネルギーは減る)', () => {
  const n = 600
  const h = 0.1
  const state = randomState(n, 1, 1, h, 21)
  const m = 0.5
  computeDensity(state, { m, h })
  computeForces(state, { m, h, mu: 3 })
  // 力 F_i と速度の内積の和 Σ F_i·v_i = −Σ_pairs μ m²/(ρ_iρ_j)∇²W |v_i − v_j|² ≤ 0
  let power = 0
  let px = 0
  let py = 0
  for (let i = 0; i < n; i++) {
    power += state.force[2 * i] * state.vel[2 * i] + state.force[2 * i + 1] * state.vel[2 * i + 1]
    px += state.force[2 * i]
    py += state.force[2 * i + 1]
  }
  assert.ok(power < 0, `Σ F·v = ${power}`)
  near(px, 0, 1e-9)
  near(py, 0, 1e-9)
})

// ---------------------------------------------------------------- 1 ステップ

test('defaultSphParams・sphMaxDt: 間隔 0.02 で h=0.05(2.5 倍)、m=0.4、ρ0=993.98、k=100(音速 10 m/s)、Δt の目安 0.0015 s', () => {
  const p = defaultSphParams(0.02)
  assert.equal(round(p.h, 6), 0.05)
  assert.equal(round(p.m, 6), 0.4)
  assert.equal(round(p.rho0, 2), 993.98)
  assert.equal(p.k, 100)
  assert.deepEqual(p.gravity, [0, -9.8])
  assert.equal(round(sphMaxDt(p), 6), 0.0015)
  assert.equal(defaultSphParams(0.02, { mu: 1 }).mu, 1)
})

test('sphStep: 粒子 1 個は半陰的オイラーで落ち、床で restitution 倍に跳ね返る(壁の外に出ない)', () => {
  const state = createSphState(1, 1, 1, 0.1)
  state.pos.set([0.5, 0.5])
  const params = { m: 1, h: 0.1, k: 100, rho0: 1, mu: 0, gravity: [0, -9.8], restitution: 0.5 }
  const dt = 0.001
  // 床に着くまでは、半陰的オイラーの厳密な式 y = y0 − g·dt²·n(n+1)/2
  for (let k = 1; k <= 100; k++) sphStep(state, params, dt)
  near(state.pos[1], 0.5 - (9.8 * dt * dt * 100 * 101) / 2, 1e-12)
  near(state.vel[1], -9.8 * 100 * dt, 1e-12)
  // 床に着くまで進めて、跳ね返りの直前・直後の速さの比を測る
  let vBefore = 0
  let bounced = false
  for (let k = 0; k < 2000 && !bounced; k++) {
    vBefore = state.vel[1] - 9.8 * dt // 次のステップで床に当たるときの、重力を足した後の速度
    sphStep(state, params, dt)
    if (state.pos[1] === 0 && state.vel[1] > 0) bounced = true
  }
  assert.ok(bounced)
  near(state.vel[1], -0.5 * vBefore, 1e-9)
  for (let k = 0; k < 3000; k++) {
    sphStep(state, params, dt)
    assert.ok(state.pos[1] >= 0 && state.pos[1] <= 1 && state.pos[0] >= 0 && state.pos[0] <= 1)
  }
})

test('sphStep: 壁を当てると、壁に向かう速度成分だけ反転して減衰し、四方の壁の外に出ない', () => {
  const state = createSphState(4, 1, 1, 0.1)
  state.pos.set([0.02, 0.5, 0.98, 0.5, 0.5, 0.02, 0.5, 0.98])
  state.vel.set([-1, 0.3, 1, -0.3, 0.2, -1, -0.2, 1])
  const params = { m: 1, h: 0.1, k: 100, rho0: 1, mu: 0, gravity: [0, 0], restitution: 0.5 }
  for (let k = 0; k < 100; k++) sphStep(state, params, 0.001) // 動きが 0.001·1 ずつなので 20 ステップで壁に届く
  // 0.02 の位置で速度 −1: 20 ステップで壁(x=0)に達して反転、減衰 0.5
  for (let i = 0; i < 4; i++) {
    assert.ok(state.pos[2 * i] >= 0 && state.pos[2 * i] <= 1 && state.pos[2 * i + 1] >= 0 && state.pos[2 * i + 1] <= 1)
  }
  near(state.vel[0], 0.5, 1e-12) // 左の壁で −1 → +0.5
  near(state.vel[2], -0.5, 1e-12) // 右の壁で +1 → −0.5
  near(state.vel[5], 0.5, 1e-12) // 床で −1 → +0.5
  near(state.vel[7], -0.5, 1e-12) // 天井で +1 → −0.5
  // 壁に平行な成分は変わらない
  near(state.vel[1], 0.3, 1e-12)
  near(state.vel[4], 0.2, 1e-12)
})

test('reflectAtWalls: 外に出た粒子を壁の位置に戻し、壁に向かう成分だけ −restitution 倍にする(restitution=0 なら止まる、内側の粒子は触らない)', () => {
  const state = createSphState(3, 2, 1, 0.1)
  state.pos.set([-0.1, 0.5, 2.3, 1.2, 1, 0.5])
  state.vel.set([-2, 1, 4, 3, -2, 1])
  reflectAtWalls(state, 0.25)
  assert.deepEqual(Array.from(state.pos), [0, 0.5, 2, 1, 1, 0.5])
  assert.deepEqual(Array.from(state.vel), [0.5, 1, -1, -0.75, -2, 1])
  state.pos.set([-1, -1, 3, 2, 0, 0])
  state.vel.set([-1, -1, 1, 1, 0, 0])
  reflectAtWalls(state, 0)
  assert.deepEqual(Array.from(state.pos), [0, 0, 2, 1, 0, 0])
  assert.deepEqual(Array.from(state.vel, (v) => v + 0), [0, 0, 0, 0, 0, 0]) // -0 は 0 にそろえて比べる
})

test('sphStep: 重力も壁もない閉じた系で、運動量の和 Σm·v が保存する(圧力・粘性の力が組ごとに逆向き)', () => {
  const n = 400
  const s0 = 0.02
  const params = { ...defaultSphParams(s0), gravity: [0, 0], restitution: 0 }
  // 領域の真ん中に 20×20 の格子。少しつぶして(密度を上げて)圧力を働かせ、速度もばらつかせる
  const state = createSphState(n, 10, 10, params.h)
  const rand = lcg(6)
  fillBlock(state, 4.7, 4.7, 20, 20, 0.85 * s0)
  for (let i = 0; i < 2 * n; i++) state.vel[i] = rand() - 0.5
  const momentum = () => {
    let px = 0
    let py = 0
    for (let i = 0; i < n; i++) {
      px += params.m * state.vel[2 * i]
      py += params.m * state.vel[2 * i + 1]
    }
    return [px, py]
  }
  const p0 = momentum()
  for (let k = 0; k < 200; k++) sphStep(state, params, 0.5e-3)
  const p1 = momentum()
  near(p1[0], p0[0], 1e-9)
  near(p1[1], p0[1], 1e-9)
  // 圧力で押し広げられて、粒子は動いた(自明な一致ではない)
  let moved = 0
  for (let i = 0; i < n; i++) moved = Math.max(moved, Math.hypot(state.vel[2 * i], state.vel[2 * i + 1]))
  assert.ok(moved > 0.1)
})

test('sphStep: 休止密度の格子は力がつり合って、重力なしなら動かない', () => {
  const s0 = 0.02
  const params = { ...defaultSphParams(s0), gravity: [0, 0] }
  const state = createSphState(400, 4, 4, params.h)
  fillBlock(state, 1.8, 1.8, 20, 20, s0)
  const before = Float64Array.from(state.pos)
  for (let k = 0; k < 100; k++) sphStep(state, params, 1.5e-3)
  let worst = 0
  for (let i = 0; i < 800; i++) worst = Math.max(worst, Math.abs(state.pos[i] - before[i]))
  assert.ok(worst < 1e-12, `動いた距離 ${worst}`)
})

test('sphStep: 水柱(20×30 粒子、重力あり)は 3 秒で静まり、運動エネルギーは初めの位置エネルギーの 1% 未満、壁の外に出ない', () => {
  const s0 = 0.02
  const params = defaultSphParams(s0)
  const dt = sphMaxDt(params)
  const cols = 20
  const rows = 30
  const n = cols * rows
  const state = createSphState(n, 0.4, 1, params.h)
  fillBlock(state, 0, 0, cols, rows, s0)
  let potential0 = 0
  for (let i = 0; i < n; i++) potential0 += params.m * 9.8 * state.pos[2 * i + 1]
  for (let k = 0; k < Math.round(3 / dt); k++) sphStep(state, params, dt)
  let kinetic = 0
  let vmax = 0
  for (let i = 0; i < n; i++) {
    const v2 = state.vel[2 * i] ** 2 + state.vel[2 * i + 1] ** 2
    kinetic += 0.5 * params.m * v2
    vmax = Math.max(vmax, Math.sqrt(v2))
    assert.ok(state.pos[2 * i] >= 0 && state.pos[2 * i] <= 0.4 && state.pos[2 * i + 1] >= 0 && state.pos[2 * i + 1] <= 1)
  }
  assert.ok(kinetic < 0.01 * potential0, `運動エネルギー ${kinetic}、位置エネルギー ${potential0}`)
  assert.ok(vmax < 0.5, `最大の速さ ${vmax}`)
  // 圧力は下ほど大きい(静水圧)
  let top = 0
  let bottom = 0
  let nt = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    if (state.pos[2 * i + 1] > 0.4 && state.pos[2 * i] > 0.1 && state.pos[2 * i] < 0.3) {
      top += state.pressure[i]
      nt++
    }
    if (state.pos[2 * i + 1] < 0.1 && state.pos[2 * i] > 0.1 && state.pos[2 * i] < 0.3) {
      bottom += state.pressure[i]
      nb++
    }
  }
  assert.ok(bottom / nb > top / nt)
})

test('sphStep: 1440 粒子のダム崩壊を 4 秒進めても発散せず、水は壁の外に出ず、水面が平らに広がる', () => {
  const s0 = 0.02
  const params = defaultSphParams(s0)
  const dt = sphMaxDt(params)
  const cols = 40
  const rows = 36
  const n = cols * rows
  const state = createSphState(n, 2, 1, params.h)
  fillBlock(state, 0, 0, cols, rows, s0)
  const centerX = () => {
    let x = 0
    for (let i = 0; i < n; i++) x += state.pos[2 * i]
    return x / n
  }
  const x0 = centerX()
  let maxSpeed = 0
  for (let k = 0; k < Math.round(4 / dt); k++) {
    sphStep(state, params, dt)
    if (k % 100 === 0) {
      for (let i = 0; i < n; i++) maxSpeed = Math.max(maxSpeed, Math.hypot(state.vel[2 * i], state.vel[2 * i + 1]))
    }
  }
  let top = 0
  for (let i = 0; i < n; i++) {
    assert.ok(Number.isFinite(state.pos[2 * i]) && Number.isFinite(state.pos[2 * i + 1]))
    assert.ok(state.pos[2 * i] >= 0 && state.pos[2 * i] <= 2 && state.pos[2 * i + 1] >= 0 && state.pos[2 * i + 1] <= 1)
    top = Math.max(top, state.pos[2 * i + 1])
  }
  assert.ok(maxSpeed <= params.vmax + 1e-12)
  assert.ok(centerX() > x0 + 0.5, `重心 ${x0} → ${centerX()}`) // 右に広がった
  assert.ok(top < 0.45, `最も高い粒子 ${top}`) // 初めの高さ 0.72 から、幅 2 m に広がって低くなる
  // 近傍探索は総当たり(約 100 万組)より 1/30 以下の候補で済んでいる
  assert.ok(state.grid.checked < (n * (n - 1)) / 2 / 20)
})

test('sphStep: 配列を作り直さない(状態とグリッドの配列は同じ物のまま、1 ステップごとにその場で書き換える)', () => {
  const s0 = 0.02
  const params = defaultSphParams(s0)
  const state = createSphState(500, 1, 1, params.h)
  fillBlock(state, 0.2, 0, 25, 20, s0)
  sphStep(state, params, 1e-3)
  const arrays = [state.pos, state.vel, state.force, state.rho, state.pressure]
  const gridArrays = [state.grid.cellStart, state.grid.cellItems, state.grid.cellOf, state.grid.pairs]
  for (let k = 0; k < 50; k++) sphStep(state, params, 1e-3)
  arrays.forEach((a, i) => assert.equal(a, [state.pos, state.vel, state.force, state.rho, state.pressure][i]))
  gridArrays.forEach((a, i) => assert.equal(a, [state.grid.cellStart, state.grid.cellItems, state.grid.cellOf, state.grid.pairs][i]))
})

test('sphStep: stir(ポインタ)は半径の中の粒子の速度をポインタの速度に近づけ、外の粒子には何もしない', () => {
  const s0 = 0.02
  const base = { ...defaultSphParams(s0), gravity: [0, 0] }
  const make = () => {
    const state = createSphState(1600, 4, 4, base.h)
    fillBlock(state, 1.6, 1.6, 40, 40, s0) // 0.8 m 四方、中心 (2, 2)
    return state
  }
  const a = make()
  const b = make()
  const stir = { x: 2.0, y: 2.0, vx: 3, vy: -1, radius: 0.1, strength: 200 }
  for (let k = 0; k < 20; k++) {
    sphStep(a, { ...base, stir }, 1e-3)
    sphStep(b, base, 1e-3)
  }
  let inside = 0
  let outside = 0
  for (let i = 0; i < 1600; i++) {
    const d = Math.hypot(a.pos[2 * i] - 2.0, a.pos[2 * i + 1] - 2.0)
    const dv = Math.hypot(a.vel[2 * i] - b.vel[2 * i], a.vel[2 * i + 1] - b.vel[2 * i + 1])
    if (d > 0.4) {
      // 半径 0.1 の外で、圧力と粘性を通した影響もほとんど届かない距離では、stir なしと同じ
      outside++
      assert.ok(dv < 1e-3, `外側の粒子の速度が変わった ${dv}`) // 内側の粒子は秒速 1 m 以上変わる
    } else if (d < 0.05) {
      inside++
      // ポインタの向き(+x、−y)に動く
      assert.ok(a.vel[2 * i] > 0.5 && a.vel[2 * i + 1] < -0.1, `${a.vel[2 * i]}, ${a.vel[2 * i + 1]}`)
      assert.ok(a.vel[2 * i] < 3 + 1e-9) // ポインタの速度を超えない
    }
  }
  assert.ok(inside >= 10 && outside > 200)
})

test('sphStep: vmax を超える速さは vmax に打ち切られる', () => {
  const state = createSphState(1, 100, 100, 0.1)
  state.pos.set([50, 50])
  state.vel.set([30, -40])
  sphStep(state, { m: 1, h: 0.1, k: 1, rho0: 1, mu: 0, vmax: 10 }, 1e-3)
  near(Math.hypot(state.vel[0], state.vel[1]), 10, 1e-9)
  near(state.vel[0] / state.vel[1], -30 / 40, 1e-12)
})

// ---------------------------------------------------------------- 場の近似と勾配

// 間隔 s0 の格子(中心が原点、(2K+1)² 個)と φ = 3x − 2y + 1
function phiLattice(K, s0) {
  const n = (2 * K + 1) ** 2
  const pos = new Float64Array(2 * n)
  const phi = new Float64Array(n)
  let k = 0
  for (let a = -K; a <= K; a++) {
    for (let b = -K; b <= K; b++) {
      pos[2 * k] = a * s0
      pos[2 * k + 1] = b * s0
      phi[k] = 3 * pos[2 * k] - 2 * pos[2 * k + 1] + 1
      k++
    }
  }
  return { n, pos, phi, ones: new Float64Array(n).fill(1) }
}

test('sphInterpolate: 一様な格子(h=4Δx)で重みの和 ΣV·W がほぼ 1(誤差 1e-4)、1 次関数 3x−2y+1 をほぼ厳密に近似する', () => {
  const s0 = 0.025
  const h = 4 * s0
  const V = s0 * s0
  const { n, pos, phi, ones } = phiLattice(20, s0)
  for (const [x, y] of [[0, 0], [0.0123, 0.0071], [0.03, -0.04]]) {
    assert.ok(Math.abs(sphInterpolate(x, y, pos, ones, n, V, h) - 1) < 1e-4)
    assert.ok(Math.abs(sphInterpolate(x, y, pos, phi, n, V, h) - (3 * x - 2 * y + 1)) < 1e-4)
  }
  assert.equal(round(sphInterpolate(0, 0, pos, ones, n, V, h) - 1, 5), -0.00004)
})

test('sphGradient: 1 次関数の勾配 (3, −2) が 1% 以内で出る。x_j − x の向きで微分すると符号が逆になる', () => {
  const s0 = 0.025
  const h = 4 * s0
  const V = s0 * s0
  const { n, pos, phi } = phiLattice(20, s0)
  const g = sphGradient(0, 0, pos, phi, n, V, h)
  assert.deepEqual(g.map((v) => round(v, 3)), [2.997, -1.998])
  for (const [x, y] of [[0.0123, 0.0071], [0.03, -0.04]]) {
    const q = sphGradient(x, y, pos, phi, n, V, h)
    assert.ok(Math.abs(q[0] - 3) < 0.03 && Math.abs(q[1] + 2) < 0.01, `${q}`)
  }
  // 取り違えた向き: W(r) の r についての微分 (∇_r W)(x_j − x) をそのまま使うと、符号が逆になる
  const x = 0.0123
  const y = 0.0071
  let wrongX = 0
  let wrongY = 0
  const out = [0, 0]
  for (let j = 0; j < n; j++) {
    const dx = pos[2 * j] - x
    const dy = pos[2 * j + 1] - y
    cubicSplineGrad(dx, dy, Math.hypot(dx, dy), h, out)
    wrongX += V * phi[j] * out[0]
    wrongY += V * phi[j] * out[1]
  }
  const right = sphGradient(x, y, pos, phi, n, V, h)
  near(wrongX, -right[0], 1e-9)
  near(wrongY, -right[1], 1e-9)
  assert.ok(wrongX < 0 && wrongY > 0) // 3 のかわりに負の値が出る
})

// MPS 法の検証用: 間隔 0.05 の正方格子(中心の粒子 i が原点)、φ = 3x − 2y + 1
function mpsLattice() {
  const K = 8
  const n = (2 * K + 1) ** 2
  const pos = new Float64Array(2 * n)
  const phi = new Float64Array(n)
  let k = 0
  let center = 0
  for (let a = -K; a <= K; a++) {
    for (let b = -K; b <= K; b++) {
      pos[2 * k] = a * 0.05
      pos[2 * k + 1] = b * 0.05
      phi[k] = 3 * pos[2 * k] - 2 * pos[2 * k + 1] + 1
      if (a === 0 && b === 0) center = k
      k++
    }
  }
  return { n, pos, phi, center }
}

test('mpsGradient: r_e=0.25、間隔 0.05 の正方格子で n0=59.87、φ=3x−2y+1 の勾配は (3, −2) に 1e-12 で厳密に一致する', () => {
  const { n, pos, phi, center } = mpsLattice()
  const re = 0.25
  const n0 = mpsReferenceDensity(re, 0.05)
  assert.equal(round(n0, 2), 59.87)
  const g = mpsGradient(pos, phi, n, center, re, n0)
  near(g[0], 3, 1e-12)
  near(g[1], -2, 1e-12)
  // Σ w r̂r̂ᵀ の対角は n0/d = 29.94、非対角は 0
  let a = 0
  let b = 0
  let c = 0
  for (let j = 0; j < n; j++) {
    if (j === center) continue
    const r = Math.hypot(pos[2 * j], pos[2 * j + 1])
    const w = mpsWeight(r, re)
    a += (w * pos[2 * j] * pos[2 * j]) / (r * r)
    b += (w * pos[2 * j] * pos[2 * j + 1]) / (r * r)
    c += (w * pos[2 * j + 1] * pos[2 * j + 1]) / (r * r)
  }
  assert.equal(round(a, 2), 29.94)
  assert.equal(round(c, 2), 29.94)
  near(a, n0 / 2, 1e-10)
  near(b, 0, 1e-12)
  // 係数 d/n0 を掛ける前の和は (n0/d)·∇φ
  near(mpsReferenceDensity(re, 0.05), n0)
})

test('mpsGradient: 重み w=r_e/r−1 は r_e の外と r=0 で 0。粒子が等方的に並ばない(長方形の格子・端の粒子)と勾配は近似にとどまる', () => {
  assert.equal(mpsWeight(0.3, 0.25), 0)
  assert.equal(mpsWeight(0.25, 0.25), 0)
  assert.equal(mpsWeight(0, 0.25), 0)
  near(mpsWeight(0.125, 0.25), 1, 1e-12)
  // 間隔が x 方向 0.05、y 方向 0.08 の長方形格子
  const K = 8
  const pos = []
  const phi = []
  let center = 0
  for (let a = -K; a <= K; a++) {
    for (let b = -K; b <= K; b++) {
      if (a === 0 && b === 0) center = phi.length
      pos.push(a * 0.05, b * 0.08)
      phi.push(3 * a * 0.05 - 2 * b * 0.08 + 1)
    }
  }
  const re = 0.25
  const n0 = mpsReferenceDensity(re, 0.05) // 正方格子の n0 を使うので、形が合わない
  const g = mpsGradient(Float64Array.from(pos), Float64Array.from(phi), phi.length, center, re, n0)
  assert.ok(Math.abs(g[0] - 3) > 0.05 || Math.abs(g[1] + 2) > 0.05, `勾配 ${g}`)
  // 正方格子でも端(片側にしか粒子がない)の粒子では厳密でない
  const sq = mpsLattice()
  const edge = sq.pos.findIndex((v, i) => i % 2 === 0 && v === -8 * 0.05 && sq.pos[i + 1] === 0) / 2
  const ge = mpsGradient(sq.pos, sq.phi, sq.n, edge, 0.25, mpsReferenceDensity(0.25, 0.05))
  assert.ok(Math.abs(ge[0] - 3) > 0.1, `端の勾配 ${ge}`)
})
