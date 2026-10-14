import test from 'node:test'
import assert from 'node:assert/strict'
import {
  projectDistance,
  solveConstraints,
  pbdStep,
  createPbdState,
  createCloth,
  polarDecompose2,
} from '../../src/utils/vis/pbd.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// 種を固定した乱数(線形合同法)
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------------------------------------------------------------- 距離拘束 1 本の射影

test('projectDistance: p1=(0,0)、p2=(2,0)、d=1、w=(1,1) で p1 は (0.375,0)、p2 は (1.625,0) になり、距離は 2 → 1.25', () => {
  const p1 = [0, 0]
  const p2 = [2, 0]
  const [dp1, dp2] = projectDistance(p1, p2, 1, 1, 1)
  assert.deepEqual([dp1.map((v) => round(v, 4)), dp2.map((v) => round(v, 4))], [[0.375, 0], [-0.375, 0]])
  const q1 = [p1[0] + dp1[0], p1[1] + dp1[1]]
  const q2 = [p2[0] + dp2[0], p2[1] + dp2[1]]
  assert.deepEqual([round(q1[0], 4), round(q2[0], 4)], [0.375, 1.625])
  assert.equal(round(dist(q1, q2), 4), 1.25)
})

test('projectDistance: w=(1,0)(p2 が固定点)なら p2 は動かず、p1 が (0.75,0) に動く', () => {
  const [dp1, dp2] = projectDistance([0, 0], [2, 0], 1, 0, 1)
  assert.deepEqual(dp1.map((v) => round(v, 4)), [0.75, 0])
  assert.deepEqual(dp2.map((v) => round(v, 4)), [0, 0])
})

test('projectDistance: 質量 3:1(w=(1/3,1))で Δp1=(0.1875,0)、Δp2=(−0.5625,0)。質量×補正の和は 0 で重心が動かない', () => {
  const [dp1, dp2] = projectDistance([0, 0], [2, 0], 1 / 3, 1, 1)
  assert.deepEqual(dp1.map((v) => round(v, 4)), [0.1875, 0])
  assert.deepEqual(dp2.map((v) => round(v, 4)), [-0.5625, 0])
  // 重いほう(質量 3)の移動量が 1/4、軽いほう(質量 1)が 3/4
  near(Math.abs(dp1[0]) / (Math.abs(dp1[0]) + Math.abs(dp2[0])), 0.25)
  near(3 * dp1[0] + 1 * dp2[0], 0)
  near(3 * dp1[1] + 1 * dp2[1], 0)
})

test('projectDistance: 繰り返すと距離は 2 → 1.25 → 1.025 → 1.0003 と d=1 に近づき、誤差はほぼ 2 乗で小さくなる', () => {
  const p1 = [0, 0]
  const p2 = [2, 0]
  const lengths = [dist(p1, p2)]
  for (let k = 0; k < 6; k++) {
    const [dp1, dp2] = projectDistance(p1, p2, 1, 1, 1)
    p1[0] += dp1[0]
    p1[1] += dp1[1]
    p2[0] += dp2[0]
    p2[1] += dp2[1]
    lengths.push(dist(p1, p2))
  }
  assert.deepEqual(lengths.slice(0, 4).map((v) => round(v, 4)), [2, 1.25, 1.025, 1.0003])
  // C=L²−d² の線形化(ニュートン法)なので、次の距離は (L²+d²)/(2L)、誤差 L'−d = (L−d)²/(2L)
  for (let k = 0; k < 3; k++) {
    const L = lengths[k]
    near(lengths[k + 1], (L * L + 1) / (2 * L))
    near(lengths[k + 1] - 1, (L - 1) ** 2 / (2 * L))
  }
  assert.ok(lengths[6] - 1 < 1e-12)
})

test('projectDistance: 補正は拘束の勾配と同じ向き(2 点を結ぶ線上)で、勾配は差分と一致する(∇_{p1}C=(−4,0)、∇_{p2}C=(4,0))', () => {
  const C = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 - 1
  const p1 = [0, 0]
  const p2 = [2, 0]
  const e = 1e-6
  const grad = (f, p) => [0, 1].map((k) => {
    const hi = [...p]
    const lo = [...p]
    hi[k] += e
    lo[k] -= e
    return (f(hi) - f(lo)) / (2 * e)
  })
  const g1 = grad((q) => C(q, p2), p1)
  const g2 = grad((q) => C(p1, q), p2)
  assert.deepEqual(g1.map((v) => round(v, 4)), [-4, 0])
  assert.deepEqual(g2.map((v) => round(v, 4)), [4, 0])
  assert.equal(C(p1, p2), 3)
  // Δp_i = λ w_i ∇_i C、λ = −C / Σ w|∇C|² = −3 / (16 + 16) = −3/32
  const [dp1, dp2] = projectDistance(p1, p2, 1, 1, 1)
  const lambda = -3 / 32
  near(dp1[0], lambda * g1[0], 1e-6)
  near(dp2[0], lambda * g2[0], 1e-6)
})

test('projectDistance: 線形化した拘束 C+∇C·Δp=0 を満たす解のうち、Σ|Δp_i|²/w_i が最小', () => {
  const rand = lcg(7)
  for (let trial = 0; trial < 50; trial++) {
    const p1 = [rand() * 4 - 2, rand() * 4 - 2]
    const p2 = [rand() * 4 - 2, rand() * 4 - 2]
    const w1 = 0.2 + rand() * 3
    const w2 = 0.2 + rand() * 3
    const d = 0.3 + rand()
    const [a, b] = projectDistance(p1, p2, w1, w2, d)
    const C = (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 - d * d
    const g = [2 * (p1[0] - p2[0]), 2 * (p1[1] - p2[1])]
    const gg = g[0] * g[0] + g[1] * g[1]
    // 線形化した拘束 C + ∇_{p1}C·Δp1 + ∇_{p2}C·Δp2 = C + g·(Δp1 − Δp2) = 0
    const residual = (x, y) => C + g[0] * (x[0] - y[0]) + g[1] * (x[1] - y[1])
    near(residual(a, b), 0, 1e-9)
    const cost = (x, y) => (x[0] ** 2 + x[1] ** 2) / w1 + (y[0] ** 2 + y[1] ** 2) / w2
    const best = cost(a, b)
    for (let k = 0; k < 20; k++) {
      // 勝手なベクトルを、g の向きに動かして拘束を満たす別の解にする
      const x = [rand() * 2 - 1, rand() * 2 - 1]
      const y = [rand() * 2 - 1, rand() * 2 - 1]
      const r = residual(x, y)
      const x2 = [x[0] - (r / (2 * gg)) * g[0], x[1] - (r / (2 * gg)) * g[1]]
      const y2 = [y[0] + (r / (2 * gg)) * g[0], y[1] + (r / (2 * gg)) * g[1]]
      near(residual(x2, y2), 0, 1e-9)
      assert.ok(cost(x2, y2) >= best - 1e-12, '別の解のほうが小さかった')
    }
  }
})

test('projectDistance: 両方が固定点(w=0)、または 2 点が重なっているときは何も動かさない', () => {
  assert.deepEqual(projectDistance([0, 0], [2, 0], 0, 0, 1), [[0, 0], [0, 0]])
  assert.deepEqual(projectDistance([1, 1], [1, 1], 1, 1, 1), [[0, 0], [0, 0]])
})

// ---------------------------------------------------------------- ガウス・ザイデル法の反復

test('solveConstraints: 1 回の射影は projectDistance と同じ補正になる', () => {
  const rand = lcg(11)
  for (let trial = 0; trial < 30; trial++) {
    const p1 = [rand() * 3, rand() * 3]
    const p2 = [rand() * 3, rand() * 3]
    const w1 = rand() * 2
    const w2 = rand() * 2
    const d = 0.5 + rand()
    const pos = new Float64Array([p1[0], p1[1], p2[0], p2[1]])
    solveConstraints(pos, [{ i: 0, j: 1, d }], new Float64Array([w1, w2]), 1)
    const [dp1, dp2] = projectDistance(p1, p2, w1, w2, d)
    near(pos[0], p1[0] + dp1[0])
    near(pos[1], p1[1] + dp1[1])
    near(pos[2], p2[0] + dp2[0])
    near(pos[3], p2[1] + dp2[1])
  }
})

test('solveConstraints: 固定点 (0,0)、(4,0)、(2,3) からの距離 √5、√5、2 の 3 拘束を (3,2) から解くと、1 周で誤差 0.218、3 周で 0.0031、10 周で 1.1e-9', () => {
  const pos = new Float64Array([0, 0, 4, 0, 2, 3, 3, 2])
  const w = new Float64Array([0, 0, 0, 1])
  const constraints = [
    { i: 3, j: 0, d: Math.sqrt(5) },
    { i: 3, j: 1, d: Math.sqrt(5) },
    { i: 3, j: 2, d: 2 },
  ]
  // 距離 √5、√5、2 を全部満たす点は (2,1)
  const err = () => Math.hypot(pos[6] - 2, pos[7] - 1)
  const e = {}
  for (let k = 1; k <= 10; k++) {
    solveConstraints(pos, constraints, w, 1)
    e[k] = err()
  }
  assert.equal(round(e[1], 3), 0.218)
  assert.equal(round(e[3], 4), 0.0031)
  assert.equal(Number(e[10].toPrecision(2)), 1.1e-9)
  // 固定点は動かない
  assert.deepEqual(Array.from(pos.slice(0, 6)), [0, 0, 4, 0, 2, 3])
  // 一度にまとめて 10 周した結果も同じ
  const pos2 = new Float64Array([0, 0, 4, 0, 2, 3, 3, 2])
  solveConstraints(pos2, constraints, w, 10)
  assert.deepEqual(Array.from(pos2), Array.from(pos))
})

test('solveConstraints: 反復を増やすと、鎖(両端固定)の距離拘束の違反が単調に減る', () => {
  const n = 9
  const w = new Float64Array(n).fill(1)
  w[0] = 0
  w[n - 1] = 0
  const constraints = []
  for (let i = 0; i + 1 < n; i++) constraints.push({ i, j: i + 1, d: 0.5 })
  const violation = (iters) => {
    const pos = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      pos[2 * i] = i * 0.5 * 0.9 // 端の間隔が 0.45×8=3.6、鎖の長さ 0.5×8=4 より短い
      pos[2 * i + 1] = 0.1 * Math.sin(i)
    }
    pos[2 * (n - 1)] = 3.6
    solveConstraints(pos, constraints, w, iters)
    let worst = 0
    for (const { i, j, d } of constraints) {
      worst = Math.max(worst, Math.abs(Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]) - d))
    }
    return worst
  }
  const v = [1, 2, 4, 8, 16, 32].map(violation)
  for (let k = 0; k + 1 < v.length; k++) assert.ok(v[k + 1] < v[k], `${v[k + 1]} < ${v[k]}`)
  assert.ok(v[v.length - 1] < 0.02)
})

// ---------------------------------------------------------------- 1 ステップ

test('pbdStep: 拘束がなければ半陰的オイラー(速度を先に更新)になり、位置は x0+v0·nΔt+gΔt²·n(n+1)/2 に一致する', () => {
  const st = createPbdState(1)
  st.s.set([1, 2, 3, -1])
  const g = -9.8
  const dt = 0.01
  const n = 100
  for (let k = 0; k < n; k++) pbdStep(st, [], { gx: 0, gy: g, iterations: 5 }, dt)
  near(st.s[0], 1 + 3 * n * dt, 1e-9)
  near(st.s[1], 2 + -1 * n * dt + (g * dt * dt * n * (n + 1)) / 2, 1e-9)
  near(st.s[2], 3, 1e-12)
  near(st.s[3], -1 + g * n * dt, 1e-9)
})

test('pbdStep: 自由落下の誤差は半陰的オイラーの g·t·Δt/2 で、Δt を半分にすると半分になる', () => {
  const T = 1
  const errs = [0.02, 0.01, 0.005].map((dt) => {
    const st = createPbdState(1)
    const n = Math.round(T / dt)
    for (let k = 0; k < n; k++) pbdStep(st, [], { gx: 0, gy: -9.8, iterations: 1 }, dt)
    return Math.abs(st.s[1] - -0.5 * 9.8 * T * T)
  })
  near(errs[0] / errs[1], 2, 1e-9)
  near(errs[1] / errs[2], 2, 1e-9)
  near(errs[2], (9.8 * T * 0.005) / 2, 1e-9)
})

test('pbdStep: 固定点(w=0)は重力でも拘束でも動かず、速度は 0 のまま', () => {
  const st = createPbdState(3)
  st.s.set([0, 0, 5, 5, 1, 0, 0, 0, 2, 0, 0, 0])
  st.w[0] = 0
  const cons = [{ i: 0, j: 1, d: 1 }, { i: 1, j: 2, d: 1 }]
  for (let k = 0; k < 50; k++) pbdStep(st, cons, { gx: 1, gy: -9.8, iterations: 8 }, 0.01)
  assert.deepEqual(Array.from(st.s.slice(0, 4)), [0, 0, 0, 0])
})

test('pbdStep: 重力なしでは運動量の和 Σm·v が保存し、重心は等速で動く(質量が違う 4 粒子)', () => {
  const rand = lcg(3)
  const n = 4
  const st = createPbdState(n)
  const mass = [1, 2, 0.5, 4]
  for (let i = 0; i < n; i++) {
    st.w[i] = 1 / mass[i]
    st.s.set([rand() * 2, rand() * 2, rand() * 2 - 1, rand() * 2 - 1], 4 * i)
  }
  const cons = [
    { i: 0, j: 1, d: 0.9 },
    { i: 1, j: 2, d: 1.1 },
    { i: 2, j: 3, d: 0.8 },
    { i: 3, j: 0, d: 1.3 },
    { i: 0, j: 2, d: 1.2 },
  ]
  const total = (o) => mass.reduce((s, m, i) => s + m * st.s[4 * i + o], 0)
  const M = mass.reduce((a, b) => a + b, 0)
  const p0 = [total(2), total(3)]
  const c0 = [total(0) / M, total(1) / M]
  const dt = 0.01
  const steps = 200
  for (let k = 0; k < steps; k++) pbdStep(st, cons, { gx: 0, gy: 0, iterations: 6 }, dt)
  near(total(2), p0[0], 1e-11)
  near(total(3), p0[1], 1e-11)
  near(total(0) / M, c0[0] + (p0[0] / M) * steps * dt, 1e-10)
  near(total(1) / M, c0[1] + (p0[1] / M) * steps * dt, 1e-10)
})

test('pbdStep: 振り子(固定点に長さ 1 の拘束)の長さが保たれ、エネルギーは増えず、Δt を半分にすると損失も半分になる', () => {
  const run = (hz, seconds) => {
    const st = createPbdState(2)
    st.w[0] = 0
    st.s[4] = 1 // 水平に持ち上げて静かに放す
    const cons = [{ i: 0, j: 1, d: 1 }]
    const energy = () => 0.5 * (st.s[6] ** 2 + st.s[7] ** 2) + 9.8 * st.s[5]
    let maxE = -Infinity
    let maxLenErr = 0
    for (let k = 0; k < hz * seconds; k++) {
      pbdStep(st, cons, { gx: 0, gy: -9.8, iterations: 10 }, 1 / hz)
      maxE = Math.max(maxE, energy())
      maxLenErr = Math.max(maxLenErr, Math.abs(Math.hypot(st.s[4], st.s[5]) - 1))
    }
    return { loss: -energy(), maxE, maxLenErr }
  }
  const a = run(480, 2)
  const b = run(960, 2)
  const c = run(1920, 2)
  for (const r of [a, b, c]) {
    assert.ok(r.maxE <= 1e-9, '初めのエネルギー 0 を超えた') // 初めの E = 0(水平、速度 0)
    assert.ok(r.maxLenErr < 1e-9, '長さが保たれていない')
    assert.ok(r.loss > 0)
  }
  // 位置ベース法は暗黙的オイラー法のように数値的にエネルギーを失う。損失は Δt に比例する
  near(a.loss / b.loss, 2, 0.1)
  near(b.loss / c.loss, 2, 0.1)
  // Δt=1/480 で 2 秒(約 1 周期)の損失は、最大の運動エネルギー 9.8 の 1 割ほど
  assert.ok(a.loss > 0.5 && a.loss < 1.2, `損失 ${a.loss}`)
})

test('pbdStep: 箱 box を渡すと床と壁の外に出ず、床に向かう速度は 0 になる', () => {
  const st = createPbdState(1)
  st.s.set([0.5, 1, 2, 0])
  const box = [0, 0, 1, 2]
  let minY = Infinity
  let maxX = -Infinity
  for (let k = 0; k < 600; k++) {
    pbdStep(st, [], { gx: 0, gy: -9.8, iterations: 2, box }, 1 / 240)
    minY = Math.min(minY, st.s[1])
    maxX = Math.max(maxX, st.s[0])
  }
  assert.equal(minY, 0)
  assert.equal(maxX, 1)
  // 床に着いたあとは、下向きの速度が毎回 0 に戻る(重力で足した分を位置の修正が打ち消す)
  near(st.s[3], 0, 1e-9)
})

// ---------------------------------------------------------------- 布

test('createCloth: 粒子数と拘束の数・自然長(縦横は間隔、斜めは間隔の √2 倍)', () => {
  const cols = 7
  const rows = 5
  const { state, constraints } = createCloth(cols, rows, 0.1, 0.2, 1)
  assert.equal(state.n, cols * rows)
  assert.equal(state.s.length, 4 * cols * rows)
  assert.equal(state.p.length, 2 * cols * rows)
  const structural = rows * (cols - 1) + cols * (rows - 1)
  const shear = 2 * (cols - 1) * (rows - 1)
  assert.equal(constraints.length, structural + shear)
  assert.equal(structural, 58)
  assert.equal(shear, 48)
  // 初めの配置では、どの拘束も自然長のとおり
  for (const { i, j, d } of constraints) {
    near(Math.hypot(state.s[4 * i] - state.s[4 * j], state.s[4 * i + 1] - state.s[4 * j + 1]), d, 1e-12)
  }
  // 左上が (x0, y0)、行が増えるほど下がる
  assert.deepEqual([state.s[0], state.s[1]], [0.2, 1])
  near(state.s[4 * (cols * (rows - 1)) + 1], 1 - 0.1 * (rows - 1))
})

// 布の拘束の違反(長さの自然長に対する比の最大)
function maxStretch(cloth) {
  const { state, constraints } = cloth
  let worst = 0
  for (const { i, j, d } of constraints) {
    const L = Math.hypot(state.s[4 * i] - state.s[4 * j], state.s[4 * i + 1] - state.s[4 * j + 1])
    worst = Math.max(worst, Math.abs(L / d - 1))
  }
  return worst
}

test('布: 上の 2 隅を固定して 3 秒ぶら下げると、反復が多いほど伸びが小さくなる(最大の伸びは 5 回で 11%、20 回で 2.6%、80 回で 0.5%)', () => {
  const hang = (iterations) => {
    const cloth = createCloth(14, 10, 0.05, 0, 1)
    cloth.state.w[0] = 0
    cloth.state.w[13] = 0
    for (let k = 0; k < 360; k++) {
      pbdStep(cloth.state, cloth.constraints, { gx: 0, gy: -9.8, iterations, damping: 0.01 }, 1 / 120)
    }
    return { stretch: maxStretch(cloth), cloth }
  }
  const s5 = hang(5)
  const s20 = hang(20)
  const s80 = hang(80)
  assert.ok(s5.stretch > s20.stretch && s20.stretch > s80.stretch)
  assert.deepEqual([s5, s20, s80].map((r) => round(r.stretch * 100, 1)), [11.4, 2.6, 0.5])
  // 反復を 4 倍にすると伸びは 1/4〜1/6 ほどになる
  assert.ok(s5.stretch / s20.stretch > 3.5 && s20.stretch / s80.stretch > 3.5)
  // 固定した 2 隅は動かず、数が有限(発散していない)
  for (const { cloth } of [s5, s20, s80]) {
    const st = cloth.state
    assert.deepEqual([st.s[0], st.s[1], st.s[4 * 13], st.s[4 * 13 + 1]], [0, 1, 0.65, 1])
    assert.ok(st.s.every(Number.isFinite))
  }
})

test('布: 掴んだ隅(w=0)をポインタの位置に毎フレーム書いて引くと、重力なしでは網全体が剛体のように回る(位置の誤差 1e-3 以内)', () => {
  const cloth = createCloth(10, 8, 0.05, 0, 1)
  const { state, constraints } = cloth
  const rest = Float64Array.from(state.s)
  state.w[0] = 0 // 固定点
  state.w[9] = 0 // 掴んだ隅(右上)
  const params = { gx: 0, gy: 0, iterations: 20, damping: 0 }
  // 固定点のまわりの半径 0.45(上の行の長さ)の円に沿って、60° 引き下げる
  const angle = -Math.PI / 3
  for (let k = 1; k <= 120; k++) {
    const t = (angle * k) / 120
    state.s[4 * 9] = 0.45 * Math.cos(t)
    state.s[4 * 9 + 1] = 1 + 0.45 * Math.sin(t)
    pbdStep(state, constraints, params, 1 / 120)
  }
  for (let k = 0; k < 120; k++) pbdStep(state, constraints, params, 1 / 120)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  let worst = 0
  for (let i = 0; i < state.n; i++) {
    const rx = rest[4 * i]
    const ry = rest[4 * i + 1] - 1
    worst = Math.max(worst, Math.hypot(state.s[4 * i] - (c * rx - s * ry), state.s[4 * i + 1] - (1 + s * rx + c * ry)))
  }
  assert.ok(worst < 1e-3, `剛体回転の位置との差の最大 ${worst}`)
})

test('布: 重力のもとで隅を引いても、掴んだ位置に追従し、反復 40 回なら伸びは 12% 以内に収まる', () => {
  const cloth = createCloth(10, 8, 0.05, 0, 1)
  const { state, constraints } = cloth
  state.w[0] = 0
  state.w[9] = 0
  const params = { gx: 0, gy: -9.8, iterations: 40, damping: 0.01 }
  for (let k = 0; k < 120; k++) pbdStep(state, constraints, params, 1 / 120)
  for (let k = 1; k <= 120; k++) {
    const t = (-Math.PI / 6 * k) / 120
    state.s[4 * 9] = 0.45 * Math.cos(t)
    state.s[4 * 9 + 1] = 1 + 0.45 * Math.sin(t)
    pbdStep(state, constraints, params, 1 / 120)
  }
  for (let k = 0; k < 240; k++) pbdStep(state, constraints, params, 1 / 120)
  near(state.s[4 * 9], 0.45 * Math.cos(-Math.PI / 6), 1e-12)
  near(state.s[4 * 9 + 1], 1 + 0.45 * Math.sin(-Math.PI / 6), 1e-12)
  assert.ok(maxStretch(cloth) < 0.12, `伸び ${maxStretch(cloth)}`)
  assert.ok(state.s.every(Number.isFinite))
  // 網は重力で下がる(下の行の中央は、固定点と同じ高さより下)
  assert.ok(state.s[4 * (7 * 10 + 5) + 1] < 1 - 0.25)
})

// ---------------------------------------------------------------- 極分解

const det2 = (A) => A[0][0] * A[1][1] - A[0][1] * A[1][0]
const mul = (A, B) => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
]
const tr = (A) => [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]
const nearMat = (A, B, tol = 1e-12) => {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) near(A[i][j], B[i][j], tol)
}

test('polarDecompose2: せん断 [[1,1],[0,1]] の S の固有値は 1.618 と 0.618、R は時計回り 26.6°', () => {
  const A = [[1, 1], [0, 1]]
  const { R, S } = polarDecompose2(A)
  nearMat(mul(R, S), A)
  nearMat(mul(tr(R), R), [[1, 0], [0, 1]])
  near(det2(R), 1)
  near(S[0][1], S[1][0])
  // 対称 2×2 の固有値
  const mean = (S[0][0] + S[1][1]) / 2
  const rad = Math.hypot((S[0][0] - S[1][1]) / 2, S[0][1])
  assert.equal(round(mean + rad, 3), 1.618)
  assert.equal(round(mean - rad, 3), 0.618)
  const deg = (Math.atan2(R[1][0], R[0][0]) * 180) / Math.PI
  assert.equal(round(deg, 1), -26.6)
  // せん断の伸び縮みの倍率は黄金比とその逆数
  near(mean + rad, (1 + Math.sqrt(5)) / 2)
  near(mean - rad, (Math.sqrt(5) - 1) / 2)
})

test('polarDecompose2: 回転 R0 とひずみ S0 を掛けた A から R0、S0 が元の値(誤差 1e-12 以内)に戻る', () => {
  const rand = lcg(21)
  for (let trial = 0; trial < 200; trial++) {
    const t = (rand() * 2 - 1) * Math.PI
    const R0 = [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]]
    // 対称な正定値: 固有値 0.3〜2.5 と任意の向き
    const l1 = 0.3 + rand() * 2.2
    const l2 = 0.3 + rand() * 2.2
    const u = rand() * Math.PI
    const Q = [[Math.cos(u), -Math.sin(u)], [Math.sin(u), Math.cos(u)]]
    const S0 = mul(mul(Q, [[l1, 0], [0, l2]]), tr(Q))
    const A = mul(R0, S0)
    const { R, S } = polarDecompose2(A)
    nearMat(R, R0, 1e-11)
    nearMat(S, S0, 1e-11)
  }
})

test('polarDecompose2: det>0 の A では、回転に最も近い R=rot(atan2(A10−A01, A00+A11)) と一致する', () => {
  const rand = lcg(5)
  for (let trial = 0; trial < 100; trial++) {
    const A = [[rand() * 2 - 0.5, rand() * 2 - 1], [rand() * 2 - 1, rand() * 2 - 0.5]]
    if (det2(A) < 0.05) continue
    const t = Math.atan2(A[1][0] - A[0][1], A[0][0] + A[1][1])
    const { R } = polarDecompose2(A)
    nearMat(R, [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]], 1e-10)
  }
})

test('polarDecompose2: つぶれた(det=0)・裏返った(det<0)・零行列でも R は回転で、NaN を出さない', () => {
  for (const A of [[[1, 2], [2, 4]], [[1, 0], [0, -1]], [[0, 1], [1, 0]], [[0, 0], [0, 0]], [[2, 0], [0, 0]]]) {
    const { R, S } = polarDecompose2(A)
    for (const M of [R, S]) for (const row of M) for (const v of row) assert.ok(Number.isFinite(v))
    nearMat(mul(tr(R), R), [[1, 0], [0, 1]], 1e-12)
    near(det2(R), 1, 1e-12)
    nearMat(mul(R, S), A, 1e-12)
  }
})
