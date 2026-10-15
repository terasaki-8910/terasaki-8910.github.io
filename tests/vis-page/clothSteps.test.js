// 節「布」の段階 1〜9 が使う、React を含まない部品を確かめる:
//   clothSpring1d.js(1 本のバネとおもり)、clothTrace.js(グラフの記録と絵の分け方)、clothChain.js(鎖)、
//   clothPlate.js(風を受ける板)、clothPair.js(位置ベース法の 2 点)、clothWorld.js の小さい網。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  L0,
  analyticX,
  angularFrequency,
  clampExtension,
  createSpring1d,
  criticalDamping,
  decayRate,
  explicitEnergyFactor,
  extensionOf,
  forceOnMass,
  holdHand,
  hookeForce,
  periodOf,
  placeAt,
  setConstants,
  spring1dEnergy,
  stableDt1d,
  stepSpring1d,
  velocityOf,
} from '../../src/components/visualization/sims/clothSpring1d.js'
import {
  clearTrace,
  createTrace,
  inRect,
  pushTrace,
  sampleInterval,
  splitLayout,
  traceExtent,
  traceLength,
  traceTime,
  traceValue,
  windowStart,
} from '../../src/components/visualization/sims/clothTrace.js'
import {
  CHAIN_G,
  CHAIN_L0,
  CHAIN_M,
  PIN,
  createChain,
  grabNode,
  limitReach,
  maxChainStretch,
  moveGrab,
  nodeAt,
  nodeForces,
  releaseGrab,
  resetChain,
  stepChain,
} from '../../src/components/visualization/sims/clothChain.js'
import { foldAngle, plateEnds, plateWindForces, PLATE_DEPTH, AIR_DENSITY } from '../../src/components/visualization/sims/clothPlate.js'
import { correctPair } from '../../src/components/visualization/sims/clothPair.js'
import { createClothWorld, latticeStableDt, maxStretch, stepCloth } from '../../src/components/visualization/sims/clothWorld.js'

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超えている`)

function run1d(world, method, dt, steps, each) {
  for (let s = 0; s < steps; s++) {
    stepSpring1d(world, method, dt)
    each?.(s)
  }
}

// ---- 段階 1: フックの法則 ----

test('段階 1: 伸びていればバネは壁の向き(負)に kx、縮んでいれば逆向きに引く(F = −kx)', () => {
  const world = createSpring1d({ m: 1, k: 16 })
  placeAt(world, 0.3)
  near(forceOnMass(world), -16 * 0.3, 1e-12)
  placeAt(world, -0.2)
  near(forceOnMass(world), 16 * 0.2, 1e-12)
  placeAt(world, 0)
  near(forceOnMass(world), 0, 1e-12)
  for (const x of [-0.5, -0.1, 0.25, 0.6]) near(hookeForce(10, x), -10 * x, 1e-12)
})

test('段階 1: 手でつかんでいるあいだは、step を進めても動かない。clampExtension は ±0.6 に収める', () => {
  const world = createSpring1d()
  holdHand(world, 0.4)
  run1d(world, 'semi', 0.01, 50)
  near(extensionOf(world), 0.4, 1e-12)
  holdHand(world, 5)
  near(extensionOf(world), 0.6, 1e-12)
  assert.equal(clampExtension(-5), -0.6)
  holdHand(world, null)
  run1d(world, 'semi', 0.01, 5)
  assert.ok(extensionOf(world) < 0.6, '離すと戻り始める')
})

// ---- 段階 2: 単振動 ----

test('段階 2: 離したおもりの振動の周期が 2π√(m/k) に近い(m = 1, k = 16 で 1.571 s)', () => {
  const world = createSpring1d({ m: 1, k: 16, x: 0.5 })
  const dt = 0.001
  const crossings = []
  let prev = extensionOf(world)
  let t = 0
  for (let s = 0; s < 8000; s++) {
    stepSpring1d(world, 'semi', dt)
    t += dt
    const x = extensionOf(world)
    if (prev > 0 && x <= 0) crossings.push(t - (dt * x) / (x - prev)) // 上から下へ横切る時刻(線形に補間)
    prev = x
  }
  assert.ok(crossings.length >= 4)
  const T = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1)
  near(T, periodOf(1, 16), 0.005 * periodOf(1, 16), '周期')
  near(periodOf(1, 16), 1.5708, 1e-3)
})

test('段階 2: 重いほど・バネが柔らかいほど周期が長い(m を 4 倍で 2 倍、k を 4 倍で 1/2)', () => {
  near(periodOf(4, 16) / periodOf(1, 16), 2, 1e-12)
  near(periodOf(1, 64) / periodOf(1, 16), 0.5, 1e-12)
  near(angularFrequency(1, 16), 4, 1e-12)
})

test('段階 2: 数値の解は解析解 x0·cos(ωt) に重なる(Δt = 1 ms)', () => {
  const world = createSpring1d({ m: 2, k: 8, x: 0.4 })
  const dt = 0.001
  let t = 0
  let worst = 0
  for (let s = 0; s < 6000; s++) {
    stepSpring1d(world, 'semi', dt)
    t += dt
    worst = Math.max(worst, Math.abs(extensionOf(world) - analyticX(t, { m: 2, k: 8, kd: 0 }, 0.4, 0)))
  }
  assert.ok(worst < 2e-3, `最大のずれ ${worst}`)
})

// ---- 段階 3: 前進オイラー法と半陰的オイラー法 ----

test('段階 3: 前進オイラー法は、1 ステップごとにエネルギーがちょうど (1 + kΔt²/m) 倍になる', () => {
  const m = 1
  const k = 16
  const dt = 0.04
  const world = createSpring1d({ m, k, x: 0.5 })
  const e0 = spring1dEnergy(world)
  near(e0, 0.5 * k * 0.25, 1e-12)
  const factor = explicitEnergyFactor(m, k, dt)
  near(factor, 1 + 16 * 0.0016, 1e-12)
  for (let s = 1; s <= 30; s++) {
    stepSpring1d(world, 'explicit', dt)
    near(spring1dEnergy(world) / e0 / factor ** s, 1, 1e-9, `${s} ステップ目`)
  }
  assert.ok(spring1dEnergy(world) > 2 * e0, '30 ステップ(1.2 s)で 2 倍を超えて増える')
})

test('段階 3: 半陰的オイラー法のエネルギーは増え続けず、最初の値のまわりで小さく揺れるだけ', () => {
  const world = createSpring1d({ m: 1, k: 16, x: 0.5 })
  const e0 = spring1dEnergy(world)
  let worst = 0
  run1d(world, 'semi', 0.04, 5000, () => {
    worst = Math.max(worst, Math.abs(spring1dEnergy(world) - e0) / e0)
  })
  assert.ok(worst < 0.15, `エネルギーの最大のずれ ${worst}`)
  assert.equal(world.diverged, false)
})

// ---- 段階 4: 減衰 ----

test('段階 4: 減衰が臨界(k_d = 2√(mk))以上なら振動せず、それより小さいと負の側へ行く', () => {
  const m = 1
  const k = 16
  near(criticalDamping(m, k), 8, 1e-12)
  const over = createSpring1d({ m, k, kd: 8, x: 0.5 })
  let minOver = Infinity
  run1d(over, 'semi', 0.002, 5000, () => (minOver = Math.min(minOver, extensionOf(over))))
  assert.ok(minOver > -0.01, `臨界減衰で負へ行った: ${minOver}`)
  const under = createSpring1d({ m, k, kd: 1, x: 0.5 })
  let minUnder = Infinity
  run1d(under, 'semi', 0.002, 5000, () => (minUnder = Math.min(minUnder, extensionOf(under))))
  assert.ok(minUnder < -0.2, `弱い減衰で振動しない: ${minUnder}`)
})

test('段階 4: 振動の大きさは e^{−γt}(γ = k_d/2m)で小さくなり、数値の解は解析解と重なる', () => {
  const p = { m: 1, k: 16, kd: 1 }
  near(decayRate(1, 1), 0.5, 1e-12)
  const world = createSpring1d({ ...p, x: 0.5 })
  const dt = 0.001
  let t = 0
  let worst = 0
  for (let s = 0; s < 8000; s++) {
    stepSpring1d(world, 'semi', dt)
    t += dt
    worst = Math.max(worst, Math.abs(extensionOf(world) - analyticX(t, p, 0.5, 0)))
  }
  assert.ok(worst < 5e-3, `最大のずれ ${worst}`)
  // 包絡線: 8 s のあとの大きさは 0.5·e^{−0.5·8} より小さい
  assert.ok(Math.abs(analyticX(8, p, 0.5, 0)) < 0.5 * Math.exp(-4) * 1.1)
})

test('analyticX: 出発の伸びと速度に合い、臨界の前後(振動する・しない)で連続', () => {
  for (const kd of [0, 2, 8, 20]) {
    const p = { m: 1, k: 16, kd }
    near(analyticX(0, p, 0.3, 0), 0.3, 1e-12)
    const h = 1e-6
    near((analyticX(h, p, 0.3, 0.7) - analyticX(0, p, 0.3, 0.7)) / h, 0.7, 1e-4, `kd = ${kd} の初速`)
  }
  const a = analyticX(1.2, { m: 1, k: 16, kd: 7.999 }, 0.5, 0)
  const b = analyticX(1.2, { m: 1, k: 16, kd: 8 }, 0.5, 0)
  const c = analyticX(1.2, { m: 1, k: 16, kd: 8.001 }, 0.5, 0)
  near(a, b, 1e-3)
  near(c, b, 1e-3)
})

// ---- 段階 5: 安定の条件 ----

test('段階 5: Δt が 2√(m/k) より小さいと有界、大きいと発散(半陰的オイラー法)', () => {
  const m = 1
  const k = 16
  const limit = stableDt1d(m, k)
  near(limit, 0.5, 1e-12)
  const ok = createSpring1d({ m, k, x: 0.4 })
  let maxOk = 0
  run1d(ok, 'semi', 0.9 * limit, 3000, () => (maxOk = Math.max(maxOk, Math.abs(extensionOf(ok)))))
  assert.equal(ok.diverged, false)
  assert.ok(maxOk < 2, `0.9 倍の限界で最大 ${maxOk}`)
  const bad = createSpring1d({ m, k, x: 0.4 })
  run1d(bad, 'semi', 1.1 * limit, 500)
  assert.equal(bad.diverged, true, '限界の 1.1 倍では発散と判定される')
})

test('段階 5: 限界は k が大きく m が小さいほど小さい。k を 4 倍にすると半分', () => {
  near(stableDt1d(1, 64) / stableDt1d(1, 16), 0.5, 1e-12)
  assert.ok(stableDt1d(0.5, 16) < stableDt1d(1, 16))
})

test('setConstants: 動いている途中で m・k・k_d を変えても、位置と速度は変わらない', () => {
  const world = createSpring1d({ m: 1, k: 16, x: 0.5 })
  run1d(world, 'semi', 0.005, 100)
  const x = extensionOf(world)
  const v = velocityOf(world)
  setConstants(world, { m: 2, k: 30, kd: 0.5 })
  assert.equal(extensionOf(world), x)
  assert.equal(velocityOf(world), v)
  assert.equal(world.state.w[1], 0.5)
  assert.equal(world.springs[0].k, 30)
  assert.equal(L0, 1)
})

// ---- グラフの記録と絵の分け方 ----

test('trace: 間引き、古い順の取り出し、いっぱいになったら古いものから捨てる、時刻が戻ったら作り直す', () => {
  const tr = createTrace(2, 4)
  assert.equal(pushTrace(tr, 0, [1, 10], 0.1), true)
  assert.equal(pushTrace(tr, 0.05, [2, 20], 0.1), false, '0.1 s 未満は間引く')
  assert.equal(pushTrace(tr, 0.1, [3, 30], 0.1), true)
  assert.equal(traceLength(tr), 2)
  assert.equal(traceTime(tr, 0), 0)
  assert.equal(traceValue(tr, 1, 1), 30)
  for (let i = 2; i <= 6; i++) pushTrace(tr, i * 0.1, [i, i * 10], 0)
  assert.equal(traceLength(tr), 4, '容量は 4')
  assert.deepEqual([0, 1, 2, 3].map((i) => traceValue(tr, 0, i)), [3, 4, 5, 6], '古い順で、最後の 4 つ')
  assert.deepEqual(traceExtent(tr, 0), { min: 3, max: 6 })
  assert.deepEqual(traceExtent(tr, 0, 0.45), { min: 5, max: 6 })
  assert.equal(traceExtent(tr, 0, 99), null)
  pushTrace(tr, 0, [9, 90], 0) // 時刻が戻った
  assert.equal(traceLength(tr), 1)
  clearTrace(tr)
  assert.equal(traceLength(tr), 0)
})

test('windowStart: 始まって W 秒たつまでは 0、それからは tNow − W。sampleInterval は窓を点で割る', () => {
  assert.equal(windowStart(2, 6), 0)
  assert.equal(windowStart(6, 6), 0)
  near(windowStart(10, 6), 4, 1e-12)
  near(sampleInterval(6, 500), 0.012, 1e-12)
})

test('splitLayout: 横長なら左右、それ以外は上下に分け、2 つの領域は重ならず canvas に収まる', () => {
  for (const [w, h] of [[340, 220], [640, 300], [900, 360], [700, 420]]) {
    const { mode, a, b } = splitLayout(w, h)
    assert.equal(mode, w >= 1.7 * h ? 'side' : 'stack', `${w}×${h}`)
    for (const r of [a, b]) {
      assert.ok(r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9)
    }
    const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
    const overlapY = a.y < b.y + b.h && b.y < a.y + a.h
    assert.ok(!(overlapX && overlapY), `${w}×${h} で領域が重なる`)
  }
  assert.equal(inRect({ x: 10, y: 10, w: 20, h: 20 }, 15, 25), true)
  assert.equal(inRect({ x: 10, y: 10, w: 20, h: 20 }, 35, 25), false)
})

// ---- 段階 6: 鎖 ----

test('段階 6: ゆっくり止まった鎖は、上のバネほど大きく伸びる(i 番目のバネは下の (n − i + 1) 個ぶんの重さを支える)', () => {
  const n = 6
  const k = 200
  const world = createChain({ n, k, kd: 3 })
  for (let s = 0; s < 4000; s++) stepChain(world, { method: 'springs', k, kd: 3, iterations: 8 }, 0.004)
  assert.equal(world.diverged, false)
  const { pos } = world.state
  for (let i = 0; i < n; i++) {
    const dx = pos[2 * (i + 1)] - pos[2 * i]
    const dy = pos[2 * (i + 1) + 1] - pos[2 * i + 1]
    const stretch = Math.sqrt(dx * dx + dy * dy) - CHAIN_L0
    const expected = ((n - i) * CHAIN_M * CHAIN_G) / k // 下に (n − i) 個ぶらさがる
    near(stretch, expected, 0.05 * expected + 2e-4, `${i + 1} 本目のバネ`)
  }
})

test('段階 6: 止まった鎖では、どの質点も力(重力 + 上のバネ + 下のバネ)の合計がほぼ 0', () => {
  const n = 5
  const world = createChain({ n, k: 200, kd: 3 })
  for (let s = 0; s < 5000; s++) stepChain(world, { method: 'springs', k: 200, kd: 3, iterations: 8 }, 0.004)
  for (let i = 1; i <= n; i++) {
    const f = nodeForces(world, i)
    near(f.gravity[1], -CHAIN_M * CHAIN_G, 1e-12)
    near(Math.hypot(f.total[0], f.total[1]), 0, 0.03 * CHAIN_M * CHAIN_G, `質点 ${i} の合力`)
    assert.ok(f.above[1] > 0, '上のバネは上向きに引く')
  }
  // いちばん下の質点の下のバネはない
  assert.deepEqual(nodeForces(world, n).below, [0, 0])
})

test('段階 6: 質点をつかんで目標へ動かすと追いかけ、固定の端はつかめない。届く距離を超えない', () => {
  const world = createChain({ n: 6, k: 200, kd: 0.3 })
  const p = world.state.pos
  assert.equal(nodeAt(world, PIN[0], PIN[1], 0.05), -1, '固定の端はつかめない')
  const i = 3
  assert.equal(grabNode(world, p[2 * i], p[2 * i + 1], 0.05), true)
  assert.equal(world.selected, i)
  moveGrab(world, 0.2, 0.2) // とても遠く
  for (let s = 0; s < 1000; s++) stepChain(world, { method: 'springs', k: 200, kd: 0.3, iterations: 8 }, 0.004)
  const d = Math.hypot(p[2 * i] - PIN[0], p[2 * i + 1] - PIN[1])
  assert.ok(d <= i * CHAIN_L0 * 1.4 + 1e-6, `届く距離 ${i * CHAIN_L0 * 1.4} を超えた: ${d}`)
  assert.ok(d > i * CHAIN_L0, '許した伸びの分は伸びる')
  releaseGrab(world)
  assert.equal(world.state.w[i], 1 / CHAIN_M)
  const out = [0, 0]
  limitReach(world, 2, PIN[0], PIN[1] - 0.1, 'pbd', out)
  assert.deepEqual(out, [PIN[0], PIN[1] - 0.1], '届く範囲の中の目標はそのまま')
})

test('resetChain: 位置と速度が最初に戻り、最初の鎖は自然長のまま(伸び 0)', () => {
  const world = createChain({ n: 4 })
  assert.ok(maxChainStretch(world) < 1e-12)
  for (let s = 0; s < 500; s++) stepChain(world, { method: 'springs', k: 200, kd: 0.3, iterations: 8 }, 0.004)
  assert.ok(maxChainStretch(world) > 0)
  resetChain(world)
  assert.ok(maxChainStretch(world) < 1e-12)
  assert.equal(world.state.vel.every((v) => v === 0), true)
})

// ---- 段階 9: 位置ベース法の鎖と 2 点 ----

test('段階 9: 位置ベース法の鎖は、反復を増やすほど伸びが減る(1 回 > 20 回)。どちらも発散しない', () => {
  const stretchAfter = (iterations) => {
    const world = createChain({ n: 8 })
    let worst = 0
    for (let s = 0; s < 600; s++) {
      stepChain(world, { method: 'pbd', k: 0, kd: 0, iterations }, 0.016)
      if (s > 300) worst = Math.max(worst, maxChainStretch(world))
    }
    assert.equal(world.diverged, false)
    return worst
  }
  const one = stretchAfter(1)
  const twenty = stretchAfter(20)
  assert.ok(twenty < one, `反復 1 回 ${one}、20 回 ${twenty}`)
  assert.ok(twenty < 0.02, `反復 20 回で ${twenty}`)
  assert.ok(one > 0.05, `反復 1 回では 5 % 以上伸びる: ${one}`)
})

test('段階 9: 2 点の拘束 — 1 回では距離がぴったりにならず、繰り返すと d に収束する', () => {
  const base = { p1: [0, 0], p2: [1.5, 0], w1: 1, w2: 1, d: 1 }
  const one = correctPair({ ...base, iterations: 1 })
  near(one.distance, (1.5 * 1.5 + 1) / (2 * 1.5), 1e-12) // 1.0833
  assert.ok(one.residual > 0.05)
  assert.equal(one.path.length, 2)
  const six = correctPair({ ...base, iterations: 6 })
  assert.ok(six.residual < 1e-9)
  assert.equal(six.path.length, 7)
  near(one.C, 1.5 * 1.5 - 1, 1e-12)
})

test('段階 9: 2 点の補正は質量の逆数 w の比に分かれ(重い方が動きにくい)、重心は動かない。w = 0 は動かない', () => {
  const r = correctPair({ p1: [0, 0], p2: [1.4, 0.3], w1: 1, w2: 4, d: 1, iterations: 1 })
  const n1 = Math.hypot(...r.dp1)
  const n2 = Math.hypot(...r.dp2)
  near(n1 / n2, 1 / 4, 1e-9)
  // m1·Δp1 + m2·Δp2 = 0(m = 1/w)
  near(r.dp1[0] / 1 + r.dp2[0] / 4, 0, 1e-12)
  near(r.dp1[1] / 1 + r.dp2[1] / 4, 0, 1e-12)
  const pinned = correctPair({ p1: [0, 0], p2: [1.4, 0], w1: 0, w2: 1, d: 1, iterations: 6 })
  assert.deepEqual(pinned.dp1, [0, 0])
  near(pinned.distance, 1, 1e-9)
})

// ---- 段階 8: 風を受ける板 ----

test('段階 8: 抗力 D と揚力 L の和が、addWindForces の合計に一致する', () => {
  const o = { length: 0.6, angle: 0.5, windSpeed: 5, plateSpeed: 0, CD: 1.1, CL: 0.7 }
  const r = plateWindForces(o)
  near(r.drag[0] + r.lift[0], r.total[0], 1e-12)
  near(r.drag[1] + r.lift[1], r.total[1], 1e-12)
})

test('段階 8: 抗力は風と同じ向きで ½·C_D·ρ·S·U²、板の角度によらない。風が 2 倍なら力は 4 倍', () => {
  const S = 0.6 * PLATE_DEPTH
  for (const angle of [0, 0.4, -0.9, Math.PI / 2]) {
    const r = plateWindForces({ length: 0.6, angle, windSpeed: 5, plateSpeed: 0, CD: 1, CL: 0 })
    near(r.drag[0], 0.5 * 1 * AIR_DENSITY * S * 25, 1e-9, `角度 ${angle}`)
    near(r.drag[1], 0, 1e-9)
    near(r.area, S, 1e-12)
  }
  const a = plateWindForces({ length: 0.6, angle: 0.3, windSpeed: 3, plateSpeed: 0, CD: 1, CL: 0.5 })
  const b = plateWindForces({ length: 0.6, angle: 0.3, windSpeed: 6, plateSpeed: 0, CD: 1, CL: 0.5 })
  near(Math.hypot(...b.total) / Math.hypot(...a.total), 4, 1e-9)
})

test('段階 8: 揚力は風に垂直で、板が風と平行のとき最大、風に正対するとき 0', () => {
  const lift = (angle) => plateWindForces({ length: 0.6, angle, windSpeed: 5, plateSpeed: 0, CD: 0, CL: 1 }).lift
  const S = 0.6 * PLATE_DEPTH
  const max = 0.5 * AIR_DENSITY * S * 25
  near(Math.hypot(...lift(0)), max, 1e-9)
  near(lift(0)[0], 0, 1e-9)
  near(Math.hypot(...lift(Math.PI / 2)), 0, 1e-9)
  assert.ok(Math.hypot(...lift(0.4)) < max && Math.hypot(...lift(0.4)) > 0)
})

test('段階 8: 板が風と同じ速さで動くと、相対速度が 0 になって力も 0。風下へ動くほど力が小さい', () => {
  const f = (plateSpeed) => plateWindForces({ length: 0.6, angle: 0.3, windSpeed: 5, plateSpeed, CD: 1, CL: 0.5 })
  near(Math.hypot(...f(5).total), 0, 1e-12)
  assert.equal(f(5).relativeSpeed, 0)
  assert.ok(Math.hypot(...f(2).total) < Math.hypot(...f(0).total))
  near(f(2).relativeSpeed, 3, 1e-12)
})

test('plateEnds・foldAngle: 板の両端は中心から ±L/2。角度は (−90°, 90°] に畳む', () => {
  const [x1, y1, x2, y2] = plateEnds(1, 2, 0.6, Math.PI / 6)
  near(Math.hypot(x2 - x1, y2 - y1), 0.6, 1e-12)
  near((x1 + x2) / 2, 1, 1e-12)
  near((y1 + y2) / 2, 2, 1e-12)
  near(foldAngle(Math.PI * 0.75), -Math.PI / 4, 1e-12)
  near(foldAngle(-Math.PI * 0.75), Math.PI / 4, 1e-12)
  near(foldAngle(Math.PI / 2), Math.PI / 2, 1e-12)
})

// ---- 段階 7: 小さい網 ----

const SMALL = { cols: 7, rows: 5, spacing: 0.3, worldW: 2.4, worldH: 2.2 }
const NET = { method: 'springs', k: 300, kd: 0.5, iterations: 6, windSpeed: 0, CD: 1, CL: 0 }

test('段階 7: 小さい網(7 × 5)は、安定な Δt(4 ms)で発散せず、吊り下がる', () => {
  const world = createClothWorld({ ...SMALL, pin: 'edge' })
  assert.equal(world.state.n, 35)
  assert.ok(maxStretch(world) < 1e-12)
  assert.ok(0.004 < latticeStableDt(300, 0.5))
  for (let s = 0; s < 2000; s++) stepCloth(world, NET, 0.004)
  assert.equal(world.diverged, false)
  assert.ok(maxStretch(world) < 0.1)
})

test('段階 7: 斜めのバネを外すと、四角が平行四辺形につぶれる(せん断に弱い)。斜めがあれば形を保つ', () => {
  // 上の両端だけを固定した網の、セルの角の平均のずれ(辺の向きの内積 / 長さ。直角なら 0)
  const skew = (diagonals) => {
    const world = createClothWorld({ ...SMALL, pin: 'corners' })
    for (let s = 0; s < 4000; s++) stepCloth(world, { ...NET, diagonals }, 0.004)
    assert.equal(world.diverged, false)
    const { pos } = world.state
    const at = (r, c) => {
      const i = r * SMALL.cols + c
      return [pos[2 * i], pos[2 * i + 1]]
    }
    let sum = 0
    let count = 0
    for (let r = 0; r < SMALL.rows - 1; r++) {
      for (let c = 0; c < SMALL.cols - 1; c++) {
        const a = at(r, c)
        const b = at(r, c + 1)
        const d = at(r + 1, c)
        const ux = b[0] - a[0]
        const uy = b[1] - a[1]
        const vx = d[0] - a[0]
        const vy = d[1] - a[1]
        sum += Math.abs(ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
        count++
      }
    }
    return sum / count
  }
  const without = skew(false)
  const withDiag = skew(true)
  assert.ok(withDiag < without, `斜めあり ${withDiag}、斜めなし ${without}`)
})

test('段階 7: 斜めを外した網は、斜めのばねの伸びを数えない(maxStretch(world, false))', () => {
  const world = createClothWorld({ ...SMALL, pin: 'edge' })
  world.state.pos[2 * 10] += 0.2 // 質点を 1 つ引っぱる
  assert.ok(maxStretch(world, true) >= maxStretch(world, false))
  assert.equal(world.structuralSprings.length, 6 * 5 + 7 * 4) // 横 6 × 5 段 + 縦 7 列 × 4
  assert.equal(world.springs.length, world.structuralSprings.length + 2 * 6 * 4) // + 斜め 2 本 × 6 × 4 セル
})
