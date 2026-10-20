import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advectSemiLagrangian2D,
  diffuse2D,
  addSplat2D,
  fluidStep2D,
  fluidSubstep2D,
  advectSemiLagrangian1D,
  diffuse1D,
  advectUpwind1D,
  zeroCrossings1D,
  reynolds,
  centralDiff,
  forwardDiff,
  divergence2D,
  vorticity2D,
  projectPeriodic2D,
  poissonResidual,
  vorticityConfinement2D,
} from '../../src/utils/vis/grid.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

const near = (actual, expected, tol = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} と ${expected} の差が ${tol} を超えた`)

const maxAbs = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
const sum = (a) => a.reduce((s, x) => s + x, 0)

test('advectSemiLagrangian1D: CFL=±1 はちょうど1マス移動し、外では端の値を使う', () => {
  const phi = Float64Array.from([2, 3, 7, -1, 4])
  assert.deepEqual([...advectSemiLagrangian1D(phi, 2, 0.25, 0.125)], [2, 2, 3, 7, -1])
  assert.deepEqual([...advectSemiLagrangian1D(phi, -2, 0.25, 0.125)], [3, 7, -1, 4, 4])
  assert.deepEqual([...advectSemiLagrangian1D(phi, 200, 0.25, 1)], [2, 2, 2, 2, 2])
  assert.deepEqual([...advectSemiLagrangian1D(phi, -200, 0.25, 1)], [4, 4, 4, 4, 4])
  assert.deepEqual(advectSemiLagrangian1D(phi, 0, 0.25, 1), phi)
  assert.throws(() => advectSemiLagrangian1D(phi, 1, 1, 1, phi), /separate/)
})

test('advectSemiLagrangian1D: CFL=2.5 は線形補間で有界、同じ条件の風上差分は増幅する', () => {
  const phi = Float64Array.from([0, 0, 1, 1, 0, 0, 0, 0])
  const out = new Float64Array(phi.length)
  assert.equal(advectSemiLagrangian1D(phi, 1, 0.025, 0.0625, out), out)
  assert.deepEqual([...out], [0, 0, 0, 0, 0.5, 1, 0.5, 0])
  for (const c of [-1, 1]) {
    let semi = phi.slice(), upwind = phi.slice()
    for (let k = 0; k < 4; k++) {
      semi = advectSemiLagrangian1D(semi, c, 0.025, 0.0625)
      upwind = advectUpwind1D(upwind, c, 0.025, 0.0625)
      assert.ok(Math.max(...semi) <= 1 && Math.min(...semi) >= 0)
    }
    assert.ok(maxAbs(upwind) > 10)
  }
})

test('fluidSubstep2D: 3段を順に実行すると fluidStep2D とビット単位で同じになる', () => {
  const n = 16
  const base = { n, ...randomField(n, 54), dye: Float64Array.from({ length: n * n }, (_, i) => Math.cos(i)) }
  const copy = () => ({ ...base, u: base.u.slice(), v: base.v.slice(), dye: base.dye.slice() })
  for (const nu of [0, 0.0001, 0.003]) {
    const a = copy(), b = copy(), params = { nu, dt: 1 / 60, iterations: 60 }
    const full = fluidStep2D(a, params)
    fluidSubstep2D(b, params, 'advect')
    fluidSubstep2D(b, params, 'diffuse')
    const part = fluidSubstep2D(b, params, 'project')
    for (const key of ['u', 'v', 'dye']) assert.deepEqual(a[key], b[key])
    assert.deepEqual(full, part)
  }
  assert.throws(() => fluidSubstep2D(copy(), {}, 'invalid'), /stage/)
})

test('projectPeriodic2D: tol=0 は発散が初めから0でも指定回数だけ計算する', () => {
  for (const iterations of [0, 1, 60, 200]) {
    const u = new Float64Array(64).fill(1), v = new Float64Array(64)
    const result = projectPeriodic2D(u, v, 8, 1 / 8, iterations, 0)
    assert.equal(result.iterations, iterations)
    assert.ok(u.every((x) => x === 1) && v.every((x) => x === 0))
  }
})

// 種を固定した乱数(線形合同法)
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ガウス型の山 exp(−((x−x0)/w)²)(周期 L の領域に n 点)
function gaussian(n, L, x0, w) {
  const u = new Float64Array(n)
  for (let i = 0; i < n; i++) u[i] = Math.exp(-((((i * L) / n - x0) / w) ** 2))
  return u
}

// step(u, out) を steps 回くり返して最後の配列を返す(2 本の配列を入れ替えて使う)
function repeat(u0, steps, step) {
  let u = Float64Array.from(u0)
  let out = new Float64Array(u0.length)
  for (let k = 0; k < steps; k++) {
    step(u, out)
    ;[u, out] = [out, u]
  }
  return u
}

// ---------------------------------------------------------------- 拡散項

test('diffuse1D: ν=1e-3、w=0.05、t=1 でガウスの山の高さは 1 → 0.620(差分 0.6201、解析解 0.6202)、総量は変わらない', () => {
  const n = 200
  const L = 1
  const h = L / n
  const nu = 1e-3
  const dt = (0.2 * h * h) / nu // a = νΔt/Δx² = 0.2
  const steps = 200
  const t = steps * dt
  const u0 = gaussian(n, L, 0.3, 0.05)
  const u = repeat(u0, steps, (a, out) => diffuse1D(a, nu, h, dt, out))
  const analytic = 0.05 / Math.sqrt(0.05 ** 2 + 4 * nu * t)
  near(t, 1, 1e-12)
  assert.equal(round(Math.max(...u0), 3), 1)
  assert.equal(round(Math.max(...u), 4), 0.6201)
  assert.equal(round(Math.max(...u), 3), 0.62)
  assert.equal(round(analytic, 4), 0.6202)
  assert.ok(Math.abs(Math.max(...u) - analytic) < 2e-3)
  near(sum(u), sum(u0), 1e-12) // 総量 ∫u dx が保たれる
  // 幅の 2 乗(分散の 2 倍)は w² + 4νt に増える
  const mean = sum(u.map((x, i) => x * i * h)) / sum(u)
  const variance = sum(u.map((x, i) => x * (i * h - mean) ** 2)) / sum(u)
  near((2 * variance) / (0.05 ** 2 + 4 * nu * t), 1, 5e-3)
})

test('diffuse1D: 更新は「両隣の平均との差」だけ近づく形 u + 2a((u[i−1]+u[i+1])/2 − u[i]) に一致し、周期境界でつながる', () => {
  const rand = lcg(2)
  const n = 16
  const u = Float64Array.from({ length: n }, () => rand())
  const nu = 0.3
  const dx = 0.1
  const dt = 0.01
  const a = (nu * dt) / (dx * dx)
  const out = diffuse1D(u, nu, dx, dt)
  for (let i = 0; i < n; i++) {
    const avg = (u[(i + n - 1) % n] + u[(i + 1) % n]) / 2
    near(out[i], u[i] + 2 * a * (avg - u[i]))
  }
  // 端の 1 点だけの山は、反対側の端にも広がる
  const delta = new Float64Array(8)
  delta[0] = 1
  const spread = diffuse1D(delta, 1, 1, 0.25)
  assert.deepEqual(Array.from(spread), [0.5, 0.25, 0, 0, 0, 0, 0, 0.25])
  // 一様な分布は変わらない
  assert.deepEqual(Array.from(diffuse1D(new Float64Array(8).fill(3), 1, 1, 0.25)), new Array(8).fill(3))
})

test('diffuse1D: 波の成分は 1 ステップで (1 − 4a sin²(πm/n)) 倍になる。a=0.4 で減衰、a=0.6 で細かい波が増えて発散する', () => {
  const n = 32
  const mode = (m) => Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * m * i) / n))
  for (const m of [1, 3, 8]) {
    const a = 0.3
    const u = mode(m)
    const out = diffuse1D(u, a, 1, 1) // νΔt/Δx² = a
    const g = 1 - 4 * a * Math.sin((Math.PI * m) / n) ** 2
    for (let i = 0; i < n; i++) near(out[i], g * u[i], 1e-12)
  }
  // 1 マスごとに符号が変わる波(m=n/2)の倍率は 1−4a。|1−4a|<1 すなわち a<1/2 が安定
  const checker = Float64Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1 : -1))
  const amplitude = (a, steps) => maxAbs(repeat(checker, steps, (u, out) => diffuse1D(u, a, 1, 1, out)))
  near(amplitude(0.4, 1), Math.abs(1 - 4 * 0.4), 1e-12)
  assert.ok(amplitude(0.4, 50) < 1e-10)
  near(amplitude(0.6, 1), Math.abs(1 - 4 * 0.6), 1e-12)
  near(amplitude(0.6, 50) / 1.4 ** 50, 1, 1e-9) // 1 ステップごとに 1.4 倍(50 回で約 2e7 倍)
  assert.ok(amplitude(0.6, 50) > 1e7)
})

// ---------------------------------------------------------------- 移流項

test('advectUpwind1D: c=1、Δt=0.5Δx/c で 0.2 経つと、ガウスの山の頂点が x=0.3 から 0.5 に動く(形は少しなまる)', () => {
  const n = 200
  const h = 1 / n
  const c = 1
  const dt = (0.5 * h) / c
  const steps = Math.floor(0.2 / dt)
  const u0 = gaussian(n, 1, 0.3, 0.05)
  const u = repeat(u0, steps, (a, out) => advectUpwind1D(a, c, h, dt, out))
  const peak = (a) => a.indexOf(Math.max(...a)) * h
  assert.equal(steps, 80)
  assert.equal(round(peak(u0), 2), 0.3)
  assert.equal(round(peak(u), 2), 0.5)
  // 風上差分は数値拡散で山を低くするが、総量は保つ
  assert.ok(Math.max(...u) < 1)
  assert.equal(round(Math.max(...u), 2), 0.84)
  near(sum(u), sum(u0), 1e-9)
})

test('advectUpwind1D: CFL 数 cΔt/Δx = 1 なら厳密に 1 マスずれる。c<0 なら逆向きに運び、流れ込む端は動かさない', () => {
  const rand = lcg(9)
  const n = 20
  const phi = Float64Array.from({ length: n }, () => rand())
  const right = advectUpwind1D(phi, 2, 0.5, 0.25) // cΔt/Δx = 1
  assert.equal(right[0], phi[0])
  for (let i = 1; i < n; i++) assert.equal(right[i], phi[i - 1])
  const left = advectUpwind1D(phi, -2, 0.5, 0.25)
  assert.equal(left[n - 1], phi[n - 1])
  for (let i = 0; i < n - 1; i++) assert.equal(left[i], phi[i + 1])
  // c=0 なら何も動かない
  assert.deepEqual(Array.from(advectUpwind1D(phi, 0, 0.5, 0.25)), Array.from(phi))
})

test('advectUpwind1D: CFL 数が 1 を超えると発散し、1 以下では最大値が増えない', () => {
  const n = 64
  const u0 = gaussian(n, 1, 0.5, 0.05)
  const run = (cfl, steps) => repeat(u0, steps, (a, out) => advectUpwind1D(a, cfl, 1, 1, out))
  for (const cfl of [0.3, 0.9, 1]) assert.ok(Math.max(...run(cfl, 30)) <= 1 + 1e-12)
  assert.ok(maxAbs(run(1.5, 60)) > 1e3)
})

test('レベルセット: φ=|x−1|−0.5(液体は 0.5≤x≤1.5)を u=1、Δx=0.1、Δt=0.05 で 20 ステップ運ぶと、φ=0 の位置は 0.5、1.5 → 1.50、2.50', () => {
  const n = 41
  const dx = 0.1
  const phi0 = Float64Array.from({ length: n }, (_, i) => Math.abs(i * dx - 1) - 0.5)
  assert.deepEqual(zeroCrossings1D(phi0, 0, dx).map((x) => round(x, 3)), [0.5, 1.5])
  const phi = repeat(phi0, 20, (a, out) => advectUpwind1D(a, 1, dx, 0.05, out))
  const z = zeroCrossings1D(phi, 0, dx)
  assert.deepEqual(z.map((x) => round(x, 2)), [1.5, 2.5])
  // 運んだ距離は c·t = 1 マスあたり Δt·c = 0.05 を 20 回で 1.0
  near(z[0] - 0.5, 1, 0.01)
  near(z[1] - 1.5, 1, 0.01)
  // 液体の幅(2 つの表面の間隔)は変わらない
  near(z[1] - z[0], 1, 0.01)
})

test('zeroCrossings1D: 符号が変わる区間を直線で補間する。φ が一度も符号を変えなければ空', () => {
  assert.deepEqual(zeroCrossings1D([1, -1, -2, 3], 0, 1), [0.5, 2 + 2 / 5])
  assert.deepEqual(zeroCrossings1D([1, 2, 3], 0, 1), [])
  assert.deepEqual(zeroCrossings1D([-1, -2], 0, 1), [])
  // x0 と Δx が位置に効く
  assert.deepEqual(zeroCrossings1D([-1, 1], 10, 4), [12])
})

// ---------------------------------------------------------------- レイノルズ数

test('reynolds: 水(ν=1.0e-6)が 1 m/s で径 0.1 m の管を流れると Re=1e5、0.01 m/s・0.01 m なら Re=100。単位のない数', () => {
  assert.equal(round(reynolds(1, 0.1, 1.0e-6), 6), 1e5)
  assert.equal(round(reynolds(0.01, 0.01, 1.0e-6), 6), 100)
  // 速さを 2 倍にして長さを半分にしても Re は同じ(Re は uL/ν の積だけで決まる)
  near(reynolds(2, 0.05, 1.0e-6) / reynolds(1, 0.1, 1.0e-6), 1, 1e-12)
  // ν が 10 倍なら Re は 1/10
  near(reynolds(1, 0.1, 1.0e-5), 1e4, 1e-6)
})

test('reynolds: 移流項の大きさ U²/L と拡散項の大きさ νU/L² の比に等しい', () => {
  for (const [U, L, nu] of [[1, 0.1, 1e-6], [0.3, 2, 1.5e-5], [12, 0.004, 1e-3]]) {
    near(reynolds(U, L, nu) / (U ** 2 / L / ((nu * U) / L ** 2)), 1, 1e-12)
  }
})

// ---------------------------------------------------------------- 差分の誤差

test('centralDiff・forwardDiff: φ=sin x·e^x、x=0.5 で Δx=0.1、0.05、0.025 の誤差は中心差分 2.18e-3、5.47e-4、1.37e-4(比 4)、前進差分 0.147、0.0729、0.0363(比 2)', () => {
  const f = (x) => Math.sin(x) * Math.exp(x)
  const exact = Math.exp(0.5) * (Math.sin(0.5) + Math.cos(0.5)) // f'(x) = e^x (sin x + cos x)
  const hs = [0.1, 0.05, 0.025]
  const ec = hs.map((h) => Math.abs(centralDiff(f, 0.5, h) - exact))
  const ef = hs.map((h) => Math.abs(forwardDiff(f, 0.5, h) - exact))
  assert.deepEqual(ec.map((e) => Number(e.toPrecision(3))), [2.18e-3, 5.47e-4, 1.37e-4])
  assert.deepEqual(ef.map((e) => Number(e.toPrecision(3))), [0.147, 0.0729, 0.0363])
  assert.deepEqual([ec[0] / ec[1], ec[1] / ec[2]].map((r) => round(r, 2)), [3.99, 4])
  assert.deepEqual([ef[0] / ef[1], ef[1] / ef[2]].map((r) => round(r, 2)), [2.01, 2.01])
  // 誤差の先頭項: 中心差分は h²f'''/6、前進差分は h·f''/2
  const f2 = (x) => 2 * Math.exp(x) * Math.cos(x) // f''
  const f3 = (x) => 2 * Math.exp(x) * (Math.cos(x) - Math.sin(x)) // f'''
  near(ec[2] / ((hs[2] ** 2 / 6) * f3(0.5)), 1, 5e-3)
  near(ef[2] / ((hs[2] / 2) * f2(0.5)), 1, 0.02)
})

test('centralDiff: 2 次関数の微分は厳密、forwardDiff は h だけずれる', () => {
  const f = (x) => 3 * x * x + 2 * x + 1
  near(centralDiff(f, 1.5, 0.3), 3 * 2 * 1.5 + 2, 1e-12)
  near(forwardDiff(f, 1.5, 0.3), 3 * 2 * 1.5 + 2 + 3 * 0.3, 1e-12) // 誤差は h·f''/2 = 3h
})

// ---------------------------------------------------------------- 2 次元の発散・渦度

test('divergence2D・vorticity2D: 波の成分に対して解析的な倍率 sin(Δx)/Δx 倍になる(中心差分)', () => {
  const n = 32
  const dx = (2 * Math.PI) / n
  const u = new Float64Array(n * n)
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u[i + n * j] = Math.sin(i * dx) // ∂u/∂x = cos x
      v[i + n * j] = Math.cos(j * dx) // ∂v/∂y = −sin y
    }
  }
  const div = divergence2D(u, v, n, dx)
  const factor = Math.sin(dx) / dx
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) near(div[i + n * j], factor * (Math.cos(i * dx) - Math.sin(j * dx)), 1e-12)
  }
  // u=cos y, v=sin x なら ω = ∂v/∂x − ∂u/∂y = cos x + sin y
  const u2 = new Float64Array(n * n)
  const v2 = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u2[i + n * j] = Math.cos(j * dx)
      v2[i + n * j] = Math.sin(i * dx)
    }
  }
  const w = vorticity2D(u2, v2, n, dx)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) near(w[i + n * j], factor * (Math.cos(i * dx) + Math.sin(j * dx)), 1e-12)
  }
  // 剛体回転 u=(−Ωy, Ωx) の渦度は 2Ω(周期境界の外れた中央付近で確かめる)
  const Om = 0.7
  const ur = new Float64Array(n * n)
  const vr = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      ur[i + n * j] = -Om * j * dx
      vr[i + n * j] = Om * i * dx
    }
  }
  near(vorticity2D(ur, vr, n, dx)[16 + n * 16], 2 * Om, 1e-12)
})

// ---------------------------------------------------------------- 圧力の射影

// 周期 2π の n×n 格子で、勾配の成分 (−sin x, 0) と回る成分 (cos y, 0) を足した速度場
function mixedField(n) {
  const dx = (2 * Math.PI) / n
  const u = new Float64Array(n * n)
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      u[i + n * j] = -Math.sin(i * dx) + Math.cos(j * dx)
    }
  }
  return { u, v, dx }
}

// 乱数の速度場(種を固定、各成分は −1〜1)
function randomField(n, seed) {
  const rand = lcg(seed)
  const u = Float64Array.from({ length: n * n }, () => rand() * 2 - 1)
  const v = Float64Array.from({ length: n * n }, () => rand() * 2 - 1)
  return { u, v, dx: 1 / n }
}

test('projectPeriodic2D: 乱数の速度場(n=16)でも、射影後の中心差分の発散の最大値は射影前の 1e-8 倍以下(77 回で 8.3e-11 倍)', () => {
  const n = 16
  const { u, v, dx } = randomField(n, 1)
  const before = maxAbs(divergence2D(u, v, n, dx))
  assert.ok(before > 5) // 初めは発散がはっきりある
  const { iterations } = projectPeriodic2D(u, v, n, dx, 10000)
  const ratio = maxAbs(divergence2D(u, v, n, dx)) / before
  assert.ok(ratio < 1e-8, `発散の比 ${ratio}`)
  assert.ok(ratio < 1e-10 * 1.001) // 既定の tol=1e-10 まで解いた
  assert.equal(iterations, 77)
  assert.equal(Number(ratio.toPrecision(2)), 8.3e-11)
  assert.ok(u.every(Number.isFinite) && v.every(Number.isFinite))
})

test('projectPeriodic2D: 1 周期が 3・4・8 マスの細かい波でも発散は 1e-9 倍以下になる(5 点の差分だと sin²(π/m)=0.75、0.5、0.15 倍が残る波)', () => {
  const n = 24
  const dx = 1 / n
  for (const m of [3, 4, 8]) {
    const u = new Float64Array(n * n)
    const v = new Float64Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) u[i + n * j] = Math.sin((2 * Math.PI * i) / m)
    const before = maxAbs(divergence2D(u, v, n, dx))
    projectPeriodic2D(u, v, n, dx, 10000)
    assert.ok(maxAbs(divergence2D(u, v, n, dx)) < 1e-9 * before, `波長 ${m} マス`)
  }
})

test('projectPeriodic2D: 発散のある成分(−sin x)を取り除き、回る成分(cos y)をそのまま残す(n=32、317 回で誤差 6e-11)', () => {
  const n = 32
  const { u, v, dx } = mixedField(n)
  const before = maxAbs(divergence2D(u, v, n, dx))
  const { iterations } = projectPeriodic2D(u, v, n, dx, 10000)
  assert.ok(maxAbs(divergence2D(u, v, n, dx)) < 1e-9 * before)
  assert.equal(iterations, 317)
  // 残りは cos y だけ(勾配の成分が中心差分でちょうど打ち消される)
  let err = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(u[i + n * j] - Math.cos(j * dx)), Math.abs(v[i + n * j]))
  }
  assert.ok(err < 1e-9, `回る成分との差 ${err}`)
})

test('projectPeriodic2D: iterations の上限で止めると発散が残り(n=32 の勾配成分で 10 回 97%、50 回 4.5%、100 回 0.09%)、tol を緩めると回数が減る', () => {
  const n = 32
  const ratio = (iterations, tol) => {
    const { u, v, dx } = mixedField(n)
    const before = maxAbs(divergence2D(u, v, n, dx))
    const result = projectPeriodic2D(u, v, n, dx, iterations, tol)
    return { ratio: maxAbs(divergence2D(u, v, n, dx)) / before, used: result.iterations }
  }
  const r = [10, 50, 100].map((it) => ratio(it, 1e-10))
  assert.deepEqual(r.map((x) => x.used), [10, 50, 100]) // 上限まで使い切った
  assert.ok(r[0].ratio > r[1].ratio && r[1].ratio > r[2].ratio)
  assert.deepEqual([r[0].ratio, r[1].ratio].map((x) => round(x, 2)), [0.97, 0.04])
  assert.equal(round(r[2].ratio, 4), 0.0009)
  // tol を 1e-4 にすると、残差が初めの 1e-4 倍以下になった時点で止まる
  const loose = ratio(10000, 1e-4)
  assert.ok(loose.ratio <= 1e-4 && loose.used < 317 && loose.used > 100)
})

test('projectPeriodic2D: 返す q は ∇·∇q = ∇·u(2 マス離れた差分)を満たし、u は u − ∇q(中心差分)になる', () => {
  const n = 16
  const { u, v, dx } = randomField(n, 3)
  const u0 = Float64Array.from(u)
  const v0 = Float64Array.from(v)
  const div0 = divergence2D(u0, v0, n, dx)
  const { q } = projectPeriodic2D(u, v, n, dx, 10000)
  assert.ok(poissonResidual(q, div0, n, dx) <= 1e-10 * maxAbs(div0) * 1.001)
  // 残差を別の式(中心差分の勾配を作って、その発散をとる)でも確かめる
  const gx = new Float64Array(n * n)
  const gy = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      gx[i + n * j] = (q[((i + 1) % n) + n * j] - q[((i + n - 1) % n) + n * j]) / (2 * dx)
      gy[i + n * j] = (q[i + n * ((j + 1) % n)] - q[i + n * ((j + n - 1) % n)]) / (2 * dx)
    }
  }
  const lap = divergence2D(gx, gy, n, dx) // ∇·∇q
  for (let k = 0; k < n * n; k++) {
    near(lap[k], div0[k], 1e-9 * maxAbs(div0))
    near(u[k], u0[k] - gx[k], 1e-12)
    near(v[k], v0[k] - gy[k], 1e-12)
  }
})

test('projectPeriodic2D: 発散が 0 の速度場(流れ関数 ψ から u=∂ψ/∂y、v=−∂ψ/∂x)は変わらない(反復 0 回)', () => {
  const n = 32
  const dx = 1 / n
  const rand = lcg(4)
  const psi = Float64Array.from({ length: n * n }, () => rand())
  const u = new Float64Array(n * n)
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const jp = (j + 1) % n
      const jm = (j + n - 1) % n
      const ip = (i + 1) % n
      const im = (i + n - 1) % n
      u[i + n * j] = (psi[i + n * jp] - psi[i + n * jm]) / (2 * dx)
      v[i + n * j] = -(psi[ip + n * j] - psi[im + n * j]) / (2 * dx)
    }
  }
  const u0 = Float64Array.from(u)
  const v0 = Float64Array.from(v)
  assert.ok(maxAbs(divergence2D(u, v, n, dx)) < 1e-9 * maxAbs(u))
  const { q, iterations } = projectPeriodic2D(u, v, n, dx, 5000)
  assert.equal(iterations, 0)
  assert.equal(maxAbs(q), 0)
  for (let k = 0; k < n * n; k++) {
    near(u[k], u0[k], 1e-12 * maxAbs(u0))
    near(v[k], v0[k], 1e-12 * maxAbs(v0))
  }
})

test('poissonResidual: q=0 なら残差は max|∇·u|。2 マス離れた差分を使うので、n が奇数でも周期でつながる', () => {
  const n = 9
  const div = Float64Array.from({ length: n * n }, (_, k) => Math.sin(k))
  assert.equal(poissonResidual(new Float64Array(n * n), div, n, 0.1), maxAbs(div))
  // q が一定なら ∇·∇q = 0 なので残差は変わらない
  assert.equal(poissonResidual(new Float64Array(n * n).fill(3), div, n, 0.1), maxAbs(div))
  // 1 点だけの q=1 の ∇·∇q: 中心は −4/(4Δx²)、2 マス離れた 4 点は 1/(4Δx²)
  const q = new Float64Array(n * n)
  q[4 + n * 4] = 1
  const zero = new Float64Array(n * n)
  const dx = 0.5
  assert.equal(poissonResidual(q, zero, n, dx), 4 / (4 * dx * dx)) // |0 − (−4/(4Δx²))| = 4
})

// ---------------------------------------------------------------- 渦度強制力

// 遮蔽された渦(流れ関数 ψ = A exp(−r²/s²))。中心の渦度は 4A/s²、中心から s までは渦度が正で中心が最大
function vortexField(n, s, omega0, sign = 1) {
  const dx = 1 / n
  const A = (sign * omega0 * s * s) / 4
  const u = new Float64Array(n * n)
  const v = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * dx - 0.5
      const y = (j + 0.5) * dx - 0.5
      const e = Math.exp(-(x * x + y * y) / (s * s))
      u[i + n * j] = ((-2 * A * y) / (s * s)) * e
      v[i + n * j] = ((2 * A * x) / (s * s)) * e
    }
  }
  return { u, v, dx }
}

// 渦の核(0.15s ≤ r ≤ 0.8s)の格子点を返す
function coreCells(n, s) {
  const cells = []
  const dx = 1 / n
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const r = Math.hypot((i + 0.5) * dx - 0.5, (j + 0.5) * dx - 0.5)
      if (r >= 0.15 * s && r <= 0.8 * s) cells.push(i + n * j)
    }
  }
  return cells
}

test('vorticityConfinement2D: ガウス型の渦の核で、渦度強制力は速度と同じ向き(F·u>0、なす角のコサインが 0.9999 以上)', () => {
  const n = 64
  const s = 0.12
  for (const sign of [1, -1]) {
    // 反時計回り(sign=1)でも時計回りでも、力は回る向きに働く
    const { u, v, dx } = vortexField(n, s, 20, sign)
    const { fx, fy } = vorticityConfinement2D(u, v, n, dx, 0.5)
    const cells = coreCells(n, s)
    assert.ok(cells.length > 100)
    let minCos = 1
    for (const k of cells) {
      const dot = fx[k] * u[k] + fy[k] * v[k]
      assert.ok(dot > 0, `F·u = ${dot}`)
      minCos = Math.min(minCos, dot / (Math.hypot(fx[k], fy[k]) * Math.hypot(u[k], v[k])))
    }
    assert.ok(minCos > 0.9999, `最小のコサイン ${minCos}`)
  }
})

test('vorticityConfinement2D: 力の大きさは ε·h·|ω|(h=Δx)で、ε に比例し、渦の回る向きを逆にすると力も逆向きになる', () => {
  const n = 64
  const s = 0.12
  const { u, v, dx } = vortexField(n, s, 20)
  const w = vorticity2D(u, v, n, dx)
  const f1 = vorticityConfinement2D(u, v, n, dx, 0.5)
  const f2 = vorticityConfinement2D(u, v, n, dx, 1)
  const neg = vorticityConfinement2D(u.map((x) => -x), v.map((x) => -x), n, dx, 0.5)
  for (const k of coreCells(n, s)) {
    near(Math.hypot(f1.fx[k], f1.fy[k]), 0.5 * dx * Math.abs(w[k]), 1e-12)
    near(f2.fx[k], 2 * f1.fx[k], 1e-12)
    near(f2.fy[k], 2 * f1.fy[k], 1e-12)
    near(neg.fx[k], -f1.fx[k], 1e-12)
    near(neg.fy[k], -f1.fy[k], 1e-12)
  }
  // 渦の中心を向く N: 力は N に垂直(F·N = 0)。N は中心(0.5, 0.5)を向く
  for (const k of coreCells(n, s)) {
    const i = k % n
    const j = (k - i) / n
    const x = (i + 0.5) * dx - 0.5
    const y = (j + 0.5) * dx - 0.5
    const r = Math.hypot(x, y)
    const Nx = -x / r
    const Ny = -y / r
    assert.ok(Math.abs(f1.fx[k] * Nx + f1.fy[k] * Ny) < 1e-2 * Math.hypot(f1.fx[k], f1.fy[k]))
  }
})

test('vorticityConfinement2D: 一様な流れ・渦度が一様な流れ(渦度の勾配が 0)では力は 0', () => {
  const n = 16
  const dx = 1 / n
  const uni = new Float64Array(n * n).fill(0.7)
  const zero = new Float64Array(n * n)
  const a = vorticityConfinement2D(uni, zero, n, dx, 1)
  assert.equal(maxAbs(a.fx), 0)
  assert.equal(maxAbs(a.fy), 0)
  // x 方向に一様なせん断流 u=sin(2πy/L)は、ω が y だけの関数で |ω| の勾配も y 方向だけ。
  // N_x=0 なので、力 (N_y ω, −N_x ω) は x 成分だけを持つ
  const u = new Float64Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) u[i + n * j] = Math.sin((2 * Math.PI * j) / n)
  const b = vorticityConfinement2D(u, zero, n, dx, 1)
  assert.equal(maxAbs(b.fy), 0)
  assert.ok(maxAbs(b.fx) > 0)
})

// ---------------------------------------------------------------- 2 次元の全体

test('advectSemiLagrangian2D: 一様な速度で縦横にちょうど 1 マス進み、端は反対側につながる', () => {
  const n = 8, dx = 0.25, dt = 0.125
  const q = Float64Array.from({ length: n * n }, (_, k) => k)
  for (const [ux, vy] of [[2, 0], [0, -2], [2, 2], [34, -34]]) {
    const u = new Float64Array(n * n).fill(ux), v = new Float64Array(n * n).fill(vy)
    const out = advectSemiLagrangian2D(q, u, v, n, dx, dt, new Float64Array(n * n))
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ((i - ux * dt / dx) % n + n) % n, y = ((j - vy * dt / dx) % n + n) % n
      near(out[i + n * j], q[x + n * y])
    }
  }
  assert.throws(() => advectSemiLagrangian2D(q, q, q, n, dx, dt, q), /separate/)
})

test('advectSemiLagrangian2D: 半マスの移動は隣の平均、縦横とも半マスなら周囲 4 点の平均', () => {
  const n = 8, q = Float64Array.from({ length: n * n }, (_, k) => Math.sin(k))
  const u = new Float64Array(n * n).fill(0.5)
  for (const vy of [0, 0.5]) {
    const v = new Float64Array(n * n).fill(vy)
    const out = advectSemiLagrangian2D(q, u, v, n, 1, 1, new Float64Array(n * n))
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const left = (i + n - 1) % n, down = (j + n - 1) % n
      const row = (q[i + n * j] + q[left + n * j]) / 2
      near(out[i + n * j], vy === 0 ? row : (row + (q[i + n * down] + q[left + n * down]) / 2) / 2)
    }
  }
})

test('diffuse2D: 総量を保ち、市松模様を減衰させ、縦横の端にも広がる', () => {
  const n = 8
  const q = Float64Array.from({ length: n * n }, (_, k) => 2 + ((k % n + Math.floor(k / n)) % 2 ? -1 : 1))
  const out = diffuse2D(q, 0.1, 1, 1, n, new Float64Array(n * n))
  near(sum(out), sum(q))
  near(maxAbs(out.map((x) => x - 2)), 0.2)
  q.fill(0); q[0] = 1
  diffuse2D(q, 0.25, 1, 1, n, out)
  near(sum(out), 1)
  for (const k of [1, n - 1, n, n * (n - 1)]) near(out[k], 0.25)
})

test('addSplat2D: マスの中心で最大になり、縦横の端を越えて対称に広がる', () => {
  const n = 16, dx = 1 / n, f = new Float64Array(n * n)
  addSplat2D(f, n, dx, dx / 2, dx / 2, 0.1, 2)
  near(f[0], 2)
  assert.equal(f.indexOf(Math.max(...f)), 0)
  near(f[1], f[n - 1]); near(f[n], f[n * (n - 1)])
  assert.ok(f[n - 1] > f[n / 2])
  const shifted = new Float64Array(n * n)
  addSplat2D(shifted, n, dx, 2 + dx / 2, -1 + dx / 2, 0.1, 2)
  assert.deepEqual(shifted, f)
})

test('fluidStep2D: 乱数の速度場でも射影後の発散は減り、報告値は実際の発散と一致する', () => {
  const n = 16, field = randomField(n, 7)
  const w = { n, ...field, dye: new Float64Array(n * n) }
  const before = maxAbs(divergence2D(w.u, w.v, n, w.dx))
  const r = fluidStep2D(w, { dt: 1 / 60, nu: 0, iterations: 60, advect: false, diffuse: false })
  near(r.divergenceBefore, before)
  near(r.divergenceAfter, maxAbs(divergence2D(w.u, w.v, n, w.dx)))
  assert.ok(r.divergenceAfter < r.divergenceBefore * 0.01)
  assert.equal(r.iterations, 60)
})

test('fluidStep2D: 各項のスイッチはその計算だけを省き、移流は開始時の速度で 3 つを運ぶ', () => {
  const n = 8, base = { n, ...randomField(n, 12), dye: Float64Array.from({ length: n * n }, (_, k) => Math.cos(k)) }
  for (const advect of [false, true]) for (const diffuse of [false, true]) for (const project of [false, true]) {
    const w = { ...base, u: base.u.slice(), v: base.v.slice(), dye: base.dye.slice() }
    let u = base.u.slice(), v = base.v.slice(), dye = base.dye.slice()
    const dt = 1 / 60, nu = 0.003, iterations = 60
    if (advect) {
      const nextU = advectSemiLagrangian2D(u, u, v, n, w.dx, dt, new Float64Array(n * n))
      const nextV = advectSemiLagrangian2D(v, u, v, n, w.dx, dt, new Float64Array(n * n))
      dye = advectSemiLagrangian2D(dye, u, v, n, w.dx, dt, new Float64Array(n * n))
      u = nextU; v = nextV
    }
    if (diffuse) {
      u = diffuse2D(u, nu, w.dx, dt, n, new Float64Array(n * n))
      v = diffuse2D(v, nu, w.dx, dt, n, new Float64Array(n * n))
    }
    if (project) projectPeriodic2D(u, v, n, w.dx, iterations)
    const r = fluidStep2D(w, { dt, nu, iterations, advect, diffuse, project })
    assert.deepEqual(w.u, u); assert.deepEqual(w.v, v); assert.deepEqual(w.dye, dye)
    if (!project) { assert.equal(r.iterations, 0); near(r.divergenceBefore, r.divergenceAfter) }
    const scratch = w.scratch
    fluidStep2D(w, { dt, nu: 0, iterations, advect: false, project: false })
    assert.equal(w.scratch, scratch)
    assert.deepEqual(w.u, u); assert.deepEqual(w.v, v)
  }
})
