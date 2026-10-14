import test from 'node:test'
import assert from 'node:assert/strict'
import { fk2, ik2Analytic, jacobian2, ikStep, solveIK } from '../../src/utils/vis/ik.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0
const roundAll = (v, digits = 4) => v.map((x) => round(x, digits))
const roundMat = (M, digits = 4) => M.map((row) => roundAll(row, digits))
const deg = (d) => (d * Math.PI) / 180

function assertClose(actual, expected, tol = 1e-12, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} ${actual} と ${expected} の差が ${tol} を超えた`,
  )
}

function assertCloseVec(actual, expected, tol = 1e-12, label = '') {
  assert.equal(actual.length, expected.length)
  actual.forEach((x, i) => assertClose(x, expected[i], tol, `${label}[${i}]`))
}

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 角度の差を (-π, π] に直す
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
const tipOf = (l1, l2, th) => fk2(l1, l2, th[0], th[1]).tip

test('順運動学: 長さ 1 の腕2本で θ1=30°、θ2=45° のとき、肘は (0.8660, 0.5000)、手先は (1.1248, 1.4659)', () => {
  const { elbow, tip } = fk2(1, 1, deg(30), deg(45))
  assert.deepEqual(roundAll(elbow), [0.866, 0.5])
  assert.deepEqual(roundAll(tip), [1.1248, 1.4659])
})

test('順運動学: 長さ一定の制約 |肘| = l1、|手先 - 肘| = l2 を、どの角度でも満たす', () => {
  const rng = makeRng(40)
  for (let n = 0; n < 200; n++) {
    const [l1, l2] = [rng() * 2 + 0.2, rng() * 2 + 0.2]
    const { elbow, tip } = fk2(l1, l2, rng() * 12 - 6, rng() * 12 - 6)
    assertClose(Math.hypot(...elbow), l1, 1e-12)
    assertClose(dist(tip, elbow), l2, 1e-12)
  }
})

test('順運動学: θ2=0 は伸びきった腕、θ2=π は折りたたんだ腕、θ1 は全体を回す', () => {
  const rng = makeRng(41)
  for (let n = 0; n < 50; n++) {
    const [l1, l2, a] = [rng() * 2 + 0.2, rng() * 2 + 0.2, rng() * 6 - 3]
    assertCloseVec(tipOf(l1, l2, [a, 0]), [(l1 + l2) * Math.cos(a), (l1 + l2) * Math.sin(a)], 1e-12)
    assertCloseVec(tipOf(l1, l2, [a, Math.PI]), [(l1 - l2) * Math.cos(a), (l1 - l2) * Math.sin(a)], 1e-12)
  }
  // 根元の向き θ1 を変えると腕全体が原点まわりに回る
  const p = tipOf(1, 0.7, [0.3, 0.8])
  const q = tipOf(1, 0.7, [0.3 + 0.5, 0.8])
  assertCloseVec(q, [p[0] * Math.cos(0.5) - p[1] * Math.sin(0.5), p[0] * Math.sin(0.5) + p[1] * Math.cos(0.5)], 1e-12)
})

test('θ2 を時計回りに測る流儀(2本目の向きが θ1 - θ2)の式は、θ2 の符号を反転した fk2 と一致する', () => {
  const rng = makeRng(42)
  for (let n = 0; n < 100; n++) {
    const [l1, l2, t1, t2] = [rng() * 2 + 0.2, rng() * 2 + 0.2, rng() * 12 - 6, rng() * 12 - 6]
    const x = l1 * Math.cos(t1) + l2 * Math.cos(t1 - t2)
    const y = l1 * Math.sin(t1) + l2 * Math.sin(t1 - t2)
    assertCloseVec(fk2(l1, l2, t1, -t2).tip, [x, y], 1e-12)
  }
})

test('ヤコビアン: 長さ 1 の腕2本で θ1=30°、θ2=45° のとき [[-1.4659, -0.9659], [1.1248, 0.2588]]', () => {
  const J = jacobian2(1, 1, deg(30), deg(45))
  assert.deepEqual(roundMat(J), [
    [-1.4659, -0.9659],
    [1.1248, 0.2588],
  ])
  // 第1列は (-y, x): 関節1を回すと腕全体が原点まわりに回る
  const tip = tipOf(1, 1, [deg(30), deg(45)])
  assertCloseVec([J[0][0], J[1][0]], [-tip[1], tip[0]], 1e-14)
})

test('ヤコビアンは、手先の位置を関節角で偏微分したもの: 中心差分(刻み 1e-6)と 1e-8 以内で一致する', () => {
  const rng = makeRng(43)
  const h = 1e-6
  for (let n = 0; n < 100; n++) {
    const [l1, l2, t1, t2] = [rng() * 2 + 0.2, rng() * 2 + 0.2, rng() * 12 - 6, rng() * 12 - 6]
    const J = jacobian2(l1, l2, t1, t2)
    const d1 = tipOf(l1, l2, [t1 + h, t2]).map((v, i) => (v - tipOf(l1, l2, [t1 - h, t2])[i]) / (2 * h))
    const d2 = tipOf(l1, l2, [t1, t2 + h]).map((v, i) => (v - tipOf(l1, l2, [t1, t2 - h])[i]) / (2 * h))
    assertCloseVec([J[0][0], J[1][0]], d1, 1e-8, '∂/∂θ1')
    assertCloseVec([J[0][1], J[1][1]], d2, 1e-8, '∂/∂θ2')
  }
})

test('関節 1 を 0.01 rad 回すと、手先は約 (-0.0147, 0.0112) 動き、これはヤコビアンの第1列の 0.01 倍に近い', () => {
  const th = [deg(30), deg(45)]
  const p = tipOf(1, 1, th)
  const q = tipOf(1, 1, [th[0] + 0.01, th[1]])
  const moved = [q[0] - p[0], q[1] - p[1]]
  assert.deepEqual(roundAll(moved), [-0.0147, 0.0112])
  const J = jacobian2(1, 1, th[0], th[1])
  assertCloseVec(moved, [J[0][0] * 0.01, J[1][0] * 0.01], 1e-4)
})

test('先端の変化 ≈ J Δθ の誤差は Δθ の2乗に比例する(Δθ を半分にすると誤差は約 1/4)', () => {
  const [l1, l2, t1, t2] = [1, 0.7, 0.4, 0.9]
  const J = jacobian2(l1, l2, t1, t2)
  const p = tipOf(l1, l2, [t1, t2])
  const errAt = (s) => {
    const dth = [0.3 * s, -0.5 * s]
    const q = tipOf(l1, l2, [t1 + dth[0], t2 + dth[1]])
    return dist([q[0] - p[0], q[1] - p[1]], [J[0][0] * dth[0] + J[0][1] * dth[1], J[1][0] * dth[0] + J[1][1] * dth[1]])
  }
  assert.ok(errAt(1e-6) < 1e-11)
  const ratio = errAt(0.1) / errAt(0.05)
  assert.ok(ratio > 3.5 && ratio < 4.5, `誤差の比 ${ratio}`)
})

test('det J = l1 l2 sin(θ2): θ2 = 0, π (伸びきる・折りたたむ)で特異になる', () => {
  const rng = makeRng(44)
  const det = (J) => J[0][0] * J[1][1] - J[0][1] * J[1][0]
  for (let n = 0; n < 100; n++) {
    const [l1, l2, t1, t2] = [rng() * 2 + 0.2, rng() * 2 + 0.2, rng() * 12 - 6, rng() * 12 - 6]
    assertClose(det(jacobian2(l1, l2, t1, t2)), l1 * l2 * Math.sin(t2), 1e-12)
  }
  assertClose(det(jacobian2(1, 0.7, 0.5, 0)), 0, 1e-15)
  assertClose(det(jacobian2(1, 0.7, 0.5, Math.PI)), 0, 1e-15)
})

test('解析解: 長さ 1 の腕2本で目標 (√2, 0) のとき、肘が上の解は θ1=45°、θ2=-90°、肘が下の解は θ1=-45°、θ2=90°', () => {
  const up = ik2Analytic(1, 1, Math.SQRT2, 0, true)
  const down = ik2Analytic(1, 1, Math.SQRT2, 0, false)
  assert.deepEqual(roundAll(up.map((a) => (a * 180) / Math.PI), 4), [45, -90])
  assert.deepEqual(roundAll(down.map((a) => (a * 180) / Math.PI), 4), [-45, 90])
  assert.deepEqual(roundAll(fk2(1, 1, ...up).elbow), [0.7071, 0.7071])
  assert.deepEqual(roundAll(fk2(1, 1, ...down).elbow), [0.7071, -0.7071])
})

test('解析解を fk2 に戻すと目標に一致する(乱数 1000 点 × 肘の上下、l1=1、l2=0.7)', () => {
  const rng = makeRng(45)
  let worst = 0
  for (let n = 0; n < 1000; n++) {
    const th = [rng() * 2 * Math.PI - Math.PI, 0.01 + rng() * (Math.PI - 0.02)]
    const p = tipOf(1, 0.7, th)
    for (const up of [true, false]) {
      const [a, b] = ik2Analytic(1, 0.7, p[0], p[1], up)
      worst = Math.max(worst, dist(tipOf(1, 0.7, [a, b]), p))
    }
  }
  assert.ok(worst < 1e-9, `最大の誤差 ${worst}`)
})

test('伸びきる直前・折りたたむ直前の目標でも acos の誤差で破綻せず、手先は目標の近く(1e-6 以内)に来る', () => {
  for (const t2 of [1e-3, 1e-5, 1e-7, 0, Math.PI - 1e-5, Math.PI]) {
    for (const [l1, l2] of [[1, 0.7], [0.7, 1], [1, 1]]) {
      const p = tipOf(l1, l2, [0.3, t2])
      for (const up of [true, false]) {
        const th = ik2Analytic(l1, l2, p[0], p[1], up)
        assert.ok(th.every(Number.isFinite))
        assert.ok(dist(tipOf(l1, l2, th), p) < 1e-6, `θ2=${t2} l=${l1},${l2}`)
      }
    }
  }
})

test('解は2つ: 上の解と下の解は目標を結ぶ直線について鏡映になり(θ1 - 目標の向き と θ2 の符号が逆)、肘の側も逆', () => {
  const rng = makeRng(46)
  for (let n = 0; n < 200; n++) {
    const [l1, l2] = [rng() * 1.5 + 0.5, rng() * 1.5 + 0.5]
    const r = Math.abs(l1 - l2) + 0.05 + rng() * (l1 + l2 - Math.abs(l1 - l2) - 0.1)
    const ang = rng() * 2 * Math.PI - Math.PI
    const target = [r * Math.cos(ang), r * Math.sin(ang)]
    const up = ik2Analytic(l1, l2, ...target, true)
    const down = ik2Analytic(l1, l2, ...target, false)
    assertClose(wrap(up[0] - ang), -wrap(down[0] - ang), 1e-9)
    assertClose(up[1], -down[1], 1e-12)
    // 肘は、原点から目標への向きの反時計回り側(上)か、時計回り側(下)にある
    const cross = (e) => target[0] * e[1] - target[1] * e[0]
    assert.ok(cross(fk2(l1, l2, ...up).elbow) > 0)
    assert.ok(cross(fk2(l1, l2, ...down).elbow) < 0)
    assert.ok(dist(tipOf(l1, l2, up), target) < 1e-9)
    assert.ok(dist(tipOf(l1, l2, down), target) < 1e-9)
  }
})

test('届かない目標(r > l1+l2)では伸ばしきった姿勢で目標の向きを指す', () => {
  for (const up of [true, false]) {
    for (const [x, y] of [[3, 4], [0, 5], [-2.5, 0.1], [0.1, -9]]) {
      const [a, b] = ik2Analytic(1, 0.7, x, y, up)
      assert.equal(round(b, 12), 0)
      const r = Math.hypot(x, y)
      assertCloseVec(tipOf(1, 0.7, [a, b]), [(1.7 * x) / r, (1.7 * y) / r], 1e-12)
    }
  }
})

test('近すぎる目標(r < |l1-l2|)では折りたたんだ姿勢で、目標の向きの |l1-l2| の位置に手先が来る。原点でも NaN にならない', () => {
  for (const up of [true, false]) {
    for (const [l1, l2] of [[1, 0.7], [0.7, 1]]) {
      for (const [x, y] of [[0.1, 0.05], [0.2, 0], [0, -0.1], [0, 0]]) {
        const th = ik2Analytic(l1, l2, x, y, up)
        assert.ok(th.every(Number.isFinite))
        assertClose(Math.abs(th[1]), Math.PI, 1e-12)
        const tip = tipOf(l1, l2, th)
        assertClose(Math.hypot(...tip), 0.3, 1e-12)
        const r = Math.hypot(x, y)
        if (r > 0) assertCloseVec(tip, [(0.3 * x) / r, (0.3 * y) / r], 1e-9)
      }
    }
    // 長さが同じなら原点にも届き、折りたたんだ姿勢になる
    const th = ik2Analytic(1, 1, 0, 0, up)
    assert.ok(th.every(Number.isFinite))
    assert.ok(dist(tipOf(1, 1, th), [0, 0]) < 1e-12)
  }
})

// 逆ヤコビアン(2×2 の公式)を使った1ステップ
function newtonStep(l1, l2, theta, target) {
  const tip = tipOf(l1, l2, theta)
  const e = [target[0] - tip[0], target[1] - tip[1]]
  const [[a, b], [c, d]] = jacobian2(l1, l2, theta[0], theta[1])
  const det = a * d - b * c
  return [theta[0] + (d * e[0] - b * e[1]) / det, theta[1] + (-c * e[0] + a * e[1]) / det]
}

test('λ=0 の ikStep は、ヤコビアンの逆行列を使う Δθ = J^-1 e と一致し、J Δθ = e (誤差を1次近似で消す)になる', () => {
  const rng = makeRng(47)
  for (let n = 0; n < 100; n++) {
    const [l1, l2] = [rng() * 2 + 0.5, rng() * 2 + 0.5]
    const theta = [rng() * 6 - 3, 0.3 + rng() * 2.5]
    const target = [rng() * 2 - 1, rng() * 2 - 1]
    const next = ikStep(l1, l2, theta, target, 0)
    assertCloseVec(next, newtonStep(l1, l2, theta, target), 1e-9)
    const J = jacobian2(l1, l2, theta[0], theta[1])
    const dth = [next[0] - theta[0], next[1] - theta[1]]
    const tip = tipOf(l1, l2, theta)
    assertCloseVec(
      [J[0][0] * dth[0] + J[0][1] * dth[1], J[1][0] * dth[0] + J[1][1] * dth[1]],
      [target[0] - tip[0], target[1] - tip[1]],
      1e-9,
    )
  }
})

test('減衰つき最小二乗は、等価な形 Δθ = (J^T J + λ^2 I)^-1 J^T e と同じ結果になる', () => {
  const rng = makeRng(48)
  for (let n = 0; n < 100; n++) {
    const [l1, l2] = [rng() * 2 + 0.5, rng() * 2 + 0.5]
    const theta = [rng() * 6 - 3, rng() * 6 - 3]
    const target = [rng() * 3 - 1.5, rng() * 3 - 1.5]
    const lambda = rng() * 1.5 + 0.01
    const tip = tipOf(l1, l2, theta)
    const e = [target[0] - tip[0], target[1] - tip[1]]
    const J = jacobian2(l1, l2, theta[0], theta[1])
    const JtJ = [0, 1].map((i) => [0, 1].map((j) => J[0][i] * J[0][j] + J[1][i] * J[1][j] + (i === j ? lambda ** 2 : 0)))
    const Jte = [0, 1].map((i) => J[0][i] * e[0] + J[1][i] * e[1])
    const det = JtJ[0][0] * JtJ[1][1] - JtJ[0][1] * JtJ[1][0]
    const dth = [
      (JtJ[1][1] * Jte[0] - JtJ[0][1] * Jte[1]) / det,
      (-JtJ[1][0] * Jte[0] + JtJ[0][0] * Jte[1]) / det,
    ]
    assertCloseVec(ikStep(l1, l2, theta, target, lambda), [theta[0] + dth[0], theta[1] + dth[1]], 1e-10)
  }
})

test('特異な姿勢(腕が伸びきった θ2=0)で、λ=0 は解けず(NaN)、λ>0 は有限の1歩を返す', () => {
  const next0 = ikStep(1, 1, [0, 0], [1.5, 0.5], 0)
  assert.ok(next0.some(Number.isNaN))
  const next = ikStep(1, 1, [0, 0], [1.5, 0.5], 0.2)
  assert.ok(next.every(Number.isFinite))
  // 肘を曲げて手先を目標に近づける向きに動く
  assert.ok(next[0] > 0 && next[1] > 0)
  assert.ok(dist(tipOf(1, 1, next), [1.5, 0.5]) < dist(tipOf(1, 1, [0, 0]), [1.5, 0.5]))
})

test('λ が大きいほど1歩は小さい(λ = 0, 0.01, 0.1, 0.5, 1, 3 で |Δθ| が単調に減る)', () => {
  const theta = [0.4, 0.9]
  const norms = [0, 0.01, 0.1, 0.5, 1, 3].map((lambda) => {
    const next = ikStep(1, 0.7, theta, [0.2, 1.3], lambda)
    return Math.hypot(next[0] - theta[0], next[1] - theta[1])
  })
  norms.slice(1).forEach((v, i) => assert.ok(v < norms[i], `λ の順に ${norms}`))
})

test('maxStep: 1歩の |Δθ| が maxStep を超えないよう同じ向きのまま縮め、小さな歩みは変えない', () => {
  const theta = [0.4, 0.9]
  const target = [-1, -0.5]
  const full = ikStep(1, 0.7, theta, target, 0.2)
  const fullNorm = Math.hypot(full[0] - theta[0], full[1] - theta[1])
  assert.ok(fullNorm > 0.3)
  const clamped = ikStep(1, 0.7, theta, target, 0.2, 0.3)
  const d = [clamped[0] - theta[0], clamped[1] - theta[1]]
  assertClose(Math.hypot(...d), 0.3, 1e-12)
  assertClose(d[0] / 0.3, (full[0] - theta[0]) / fullNorm, 1e-12)
  assertClose(d[1] / 0.3, (full[1] - theta[1]) / fullNorm, 1e-12)
  assert.deepEqual(ikStep(1, 0.7, theta, target, 0.2, fullNorm * 2), full)
  // すでに目標にある場合は動かない
  const here = tipOf(1, 0.7, theta)
  assertCloseVec(ikStep(1, 0.7, theta, here, 0.2, 0.3), theta, 1e-12)
})

test('λ=0 の反復(逆ヤコビアン)は解の近くで誤差が2乗で減る: 誤差 0.034 → 0.00061 → 2.7e-7、e_(k+1) < 1.5 e_k^2', () => {
  const target = tipOf(1, 0.7, [0.866, 1.4])
  let theta = [0.9, 1.35]
  const errs = []
  for (let k = 0; k < 3; k++) {
    errs.push(dist(tipOf(1, 0.7, theta), target))
    theta = ikStep(1, 0.7, theta, target, 0)
  }
  assert.deepEqual(
    errs.map((e) => Number(e.toPrecision(2))),
    [0.034, 0.00061, 2.7e-7],
  )
  assert.ok(errs[1] < 1.5 * errs[0] ** 2, `${errs}`)
  assert.ok(errs[2] < 1.5 * errs[1] ** 2, `${errs}`)
})

test('solveIK: 目標に届くまで繰り返し、届いたら converged=true、手先の誤差は tol 未満(乱数 300 通りの出発点と目標)', () => {
  const rng = makeRng(49)
  let maxIter = 0
  for (let n = 0; n < 300; n++) {
    const th0 = [rng() * 2 * Math.PI - Math.PI, rng() * 2 * Math.PI - Math.PI]
    const r = 0.35 + rng() * 1.3 // 届く範囲 [0.3, 1.7] の内側
    const ang = rng() * 2 * Math.PI - Math.PI
    const target = [r * Math.cos(ang), r * Math.sin(ang)]
    const res = solveIK(1, 0.7, th0, target)
    assert.equal(res.converged, true, `n=${n} th0=${th0} target=${target} error=${res.error}`)
    assert.ok(res.error < 1e-6)
    assertClose(dist(tipOf(1, 0.7, res.theta), target), res.error, 1e-12)
    maxIter = Math.max(maxIter, res.iterations)
  }
  assert.ok(maxIter < 200, `最大の反復回数 ${maxIter}`)
})

test('solveIK が見つけた角度は、解析解の2つのどちらかと(2π の違いを除いて)一致する', () => {
  const rng = makeRng(50)
  for (let n = 0; n < 100; n++) {
    const th0 = [rng() * 2 * Math.PI - Math.PI, rng() * 2 * Math.PI - Math.PI]
    const r = 0.4 + rng() * 1.2
    const ang = rng() * 2 * Math.PI - Math.PI
    const target = [r * Math.cos(ang), r * Math.sin(ang)]
    const res = solveIK(1, 0.7, th0, target, { tol: 1e-10, maxIter: 400 })
    assert.equal(res.converged, true)
    const near = (sol) => Math.abs(wrap(res.theta[0] - sol[0])) < 1e-4 && Math.abs(wrap(res.theta[1] - sol[1])) < 1e-4
    assert.ok(near(ik2Analytic(1, 0.7, ...target, true)) || near(ik2Analytic(1, 0.7, ...target, false)))
  }
})

test('solveIK: 腕が伸びきった特異な姿勢から出発しても、減衰つきなら目標(1.5, 0.5)に届く', () => {
  const res = solveIK(1, 1, [0, 0], [1.5, 0.5])
  assert.equal(res.converged, true)
  assert.ok(res.theta.every(Number.isFinite))
  assert.ok(dist(tipOf(1, 1, res.theta), [1.5, 0.5]) < 1e-6)
})

test('solveIK: すでに目標にあれば反復 0 回で、出発の角度を返す', () => {
  const th = [0.4, 0.9]
  const res = solveIK(1, 0.7, th, tipOf(1, 0.7, th))
  assert.equal(res.iterations, 0)
  assert.equal(res.converged, true)
  assert.deepEqual(res.theta, th)
})

test('solveIK: 届かない目標では converged=false で、伸ばしきった姿勢に近づく(誤差は r-(l1+l2) をほぼ下回らない)', () => {
  for (const target of [[3, 0], [0, 2.5], [-1.2, 1.5], [2, 2]]) {
    const r = Math.hypot(...target)
    const res = solveIK(1, 0.7, [0.3, 1.0], target)
    assert.equal(res.converged, false)
    assert.equal(res.iterations, 200)
    assert.ok(res.theta.every(Number.isFinite))
    assert.ok(res.error >= r - 1.7 - 1e-9, `誤差 ${res.error} は最小 ${r - 1.7} 以上`)
    assert.ok(res.error < r - 1.7 + 0.05, `誤差 ${res.error} が最小 ${r - 1.7} から離れている`)
  }
})

test('solveIK: 入力の θ の配列を書き換えない', () => {
  const th = [0.4, 0.9]
  solveIK(1, 0.7, th, [0.2, 1.3])
  assert.deepEqual(th, [0.4, 0.9])
})
