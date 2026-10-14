import test from 'node:test'
import assert from 'node:assert/strict'
import {
  lerp,
  solveTridiagonal,
  naturalCubicSpline,
  findSegment,
  evalSpline,
  evalSplineDeriv,
} from '../../src/utils/vis/spline.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0

function assertClose(actual, expected, tol = 1e-12, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} ${actual} と ${expected} の差が ${tol} を超えた`,
  )
}

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 係数行列 A (n×m) の行基本変形。部分ピボット選択つきで、階数と解を返す
function eliminate(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b ? b[i] : 0])
  const cols = A[0].length
  let rank = 0
  for (let col = 0; col < cols && rank < n; col++) {
    let piv = rank
    for (let r = rank + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-9) continue
    ;[M[rank], M[piv]] = [M[piv], M[rank]]
    for (let r = 0; r < n; r++) {
      if (r === rank) continue
      const f = M[r][col] / M[rank][col]
      for (let k = col; k <= cols; k++) M[r][k] -= f * M[rank][k]
    }
    rank++
  }
  const x = M.slice(0, Math.min(n, cols)).map((row, i) => row[cols] / row[i])
  return { rank, x }
}

// 区間ごとの 3次式の係数 (a, b, c, d) を未知数 4N 個として、条件を1本ずつ並べた連立方程式
// 未知数の並びは [a_0 b_0 c_0 d_0, a_1 b_1 c_1 d_1, ...]
function splineConditions(xs, ys) {
  const N = xs.length - 1
  const rows = []
  const rhs = []
  const put = (entries, value) => {
    const row = new Array(4 * N).fill(0)
    for (const [seg, vec] of entries) vec.forEach((v, k) => (row[4 * seg + k] += v))
    rows.push(row)
    rhs.push(value)
  }
  const h = (i) => xs[i + 1] - xs[i]
  // 各区間が両端の点を通る: 2N 個
  for (let i = 0; i < N; i++) {
    put([[i, [0, 0, 0, 1]]], ys[i])
    put([[i, [h(i) ** 3, h(i) ** 2, h(i), 1]]], ys[i + 1])
  }
  // 内側の点で1階・2階の導関数が一致: 2(N-1) 個
  for (let i = 1; i < N; i++) {
    const hp = h(i - 1)
    put([[i - 1, [3 * hp ** 2, 2 * hp, 1, 0]], [i, [0, 0, -1, 0]]], 0)
    put([[i - 1, [6 * hp, 2, 0, 0]], [i, [0, -2, 0, 0]]], 0)
  }
  const count = rows.length
  // 両端の2階微分 = 0 (自然スプライン): 2 個
  put([[0, [0, 2, 0, 0]]], 0)
  put([[N - 1, [6 * h(N - 1), 2, 0, 0]]], 0)
  return { rows, rhs, count }
}

const flatten = (s) => s.a.flatMap((_, i) => [s.a[i], s.b[i], s.c[i], s.d[i]])

test('lerp: 端点でちょうど a と b になり、中点は平均。2点を通る直線の式と一致する', () => {
  assert.equal(lerp(3, 7, 0), 3)
  assert.equal(lerp(3, 7, 1), 7)
  assert.equal(lerp(3, 7, 0.5), 5)
  assert.equal(lerp(0.1, 0.7, 1), 0.7) // a + (b-a)t の形だと 1 にならないことがある
  const [x0, y0, x1, y1] = [1, 2, 4, 11]
  const slope = (y1 - y0) / (x1 - x0)
  for (const x of [1, 1.5, 2.7, 4]) {
    assertClose(lerp(y0, y1, (x - x0) / (x1 - x0)), y0 + slope * (x - x0), 1e-14)
  }
})

test('トーマス法は、対角優位の三重対角の連立方程式を密な消去法と同じ解で解く', () => {
  const rng = makeRng(30)
  for (const n of [1, 2, 3, 8, 30]) {
    const lower = Array.from({ length: n }, () => rng() * 2 - 1)
    const upper = Array.from({ length: n }, () => rng() * 2 - 1)
    const diag = Array.from({ length: n }, (_, i) => 3 + Math.abs(lower[i]) + Math.abs(upper[i]) + rng())
    const rhs = Array.from({ length: n }, () => rng() * 10 - 5)
    const x = solveTridiagonal(lower, diag, upper, rhs)
    // 方程式に代入した残差
    for (let i = 0; i < n; i++) {
      const lhs = diag[i] * x[i] + (i > 0 ? lower[i] * x[i - 1] : 0) + (i < n - 1 ? upper[i] * x[i + 1] : 0)
      assertClose(lhs, rhs[i], 1e-12, `n=${n} 行 ${i}`)
    }
    // 密な行列にして解いても同じ
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (j === i ? diag[i] : j === i - 1 ? lower[i] : j === i + 1 ? upper[i] : 0)),
    )
    const dense = eliminate(A, rhs).x
    x.forEach((v, i) => assertClose(v, dense[i], 1e-11))
  }
  assert.deepEqual(solveTridiagonal([], [], [], []), [])
})

test('N 区間で未知数は 4N 個、通る条件 2N と1・2階微分の連続 2(N-1) で 4N-2 個。両端の 2 条件で 4N 本になる', () => {
  for (const N of [1, 2, 3, 5]) {
    const xs = Array.from({ length: N + 1 }, (_, i) => i * 1.5 + 0.3 * i * i)
    const ys = Array.from({ length: N + 1 }, (_, i) => Math.sin(i) * 2 + i)
    const { rows, rhs, count } = splineConditions(xs, ys)
    assert.equal(rows[0].length, 4 * N) // 未知数
    assert.equal(count, 4 * N - 2) // 両端の条件の前の本数
    assert.equal(rows.length, 4 * N) // 両端の条件 2 本を足した本数
    // 両端の条件の前は 2 本足りない(階数 4N-2 < 4N)
    assert.equal(eliminate(rows.slice(0, count)).rank, 4 * N - 2)
    // 足すと一意に決まる(階数 4N)
    assert.equal(eliminate(rows).rank, 4 * N)
  }
})

test('4N 本の連立方程式を直接解いた係数と、naturalCubicSpline(トーマス法)の係数が一致する', () => {
  const rng = makeRng(31)
  for (const N of [1, 2, 3, 4, 6]) {
    const xs = [0]
    for (let i = 0; i < N; i++) xs.push(xs[i] + 0.5 + rng() * 2)
    const ys = xs.map(() => rng() * 6 - 3)
    const { rows, rhs } = splineConditions(xs, ys)
    const direct = eliminate(rows, rhs).x
    const coeffs = flatten(naturalCubicSpline(xs, ys))
    assert.equal(coeffs.length, 4 * N)
    coeffs.forEach((v, k) => assertClose(v, direct[k], 1e-9, `N=${N} 係数 ${k}`))
  }
})

test('4点・3区間の例 (0,0) (1,2) (2,1) (4,3): 係数が厳密な値と一致する', () => {
  const s = naturalCubicSpline([0, 1, 2, 4], [0, 2, 1, 3])
  const expected = {
    a: [-20 / 23, 31 / 23, -11 / 46],
    b: [0, -60 / 23, 33 / 23],
    c: [66 / 23, 6 / 23, -21 / 23],
    d: [0, 2, 1],
  }
  for (const key of ['a', 'b', 'c', 'd']) {
    s[key].forEach((v, i) => assertClose(v, expected[key][i], 1e-13, `${key}[${i}]`))
  }
  assert.deepEqual([0.5, 1.5, 3].map((x) => round(evalSpline(s, x))), [1.3261, 1.6467, 1.2826])
})

test('節点を通る: 各区間の両端で値が ys と一致する', () => {
  const rng = makeRng(32)
  const xs = [0]
  for (let i = 0; i < 9; i++) xs.push(xs[i] + 0.2 + rng())
  const ys = xs.map(() => rng() * 10 - 5)
  const s = naturalCubicSpline(xs, ys)
  xs.forEach((x, i) => assertClose(evalSpline(s, x), ys[i], 1e-12, `節点 ${i}`))
  for (let i = 0; i < xs.length - 1; i++) {
    const t = xs[i + 1] - xs[i]
    assertClose(((s.a[i] * t + s.b[i]) * t + s.c[i]) * t + s.d[i], ys[i + 1], 1e-12, `区間 ${i} の右端`)
  }
})

test('内側の節点で1階・2階の微分が左右の式で一致する(折れ目も曲率の飛びもない)', () => {
  const rng = makeRng(33)
  const xs = [0]
  for (let i = 0; i < 9; i++) xs.push(xs[i] + 0.2 + rng())
  const ys = xs.map(() => rng() * 10 - 5)
  const s = naturalCubicSpline(xs, ys)
  for (let i = 1; i < xs.length - 1; i++) {
    const t = xs[i] - xs[i - 1] // 左の区間の右端
    const left1 = (3 * s.a[i - 1] * t + 2 * s.b[i - 1]) * t + s.c[i - 1]
    const left2 = 6 * s.a[i - 1] * t + 2 * s.b[i - 1]
    assertClose(left1, s.c[i], 1e-11, `節点 ${i} の1階`) // 右の区間の t=0 での S'
    assertClose(left2, 2 * s.b[i], 1e-11, `節点 ${i} の2階`)
    assertClose(evalSplineDeriv(s, xs[i], 1), s.c[i], 1e-12)
    assertClose(evalSplineDeriv(s, xs[i], 2), 2 * s.b[i], 1e-12)
  }
})

test('自然スプライン: 両端の2階微分が 0', () => {
  const s = naturalCubicSpline([0, 1, 2.5, 3, 5], [1, -2, 0.5, 4, 3])
  const n = s.a.length
  assertClose(evalSplineDeriv(s, 0, 2), 0, 1e-13)
  const t = 5 - 3
  assertClose(6 * s.a[n - 1] * t + 2 * s.b[n - 1], 0, 1e-12)
  assertClose(evalSplineDeriv(s, 5, 2), 0, 1e-12)
})

test('直線のデータには直線を返す(2次以上の係数が 0、間の値も直線上)', () => {
  const xs = [0, 0.4, 1.5, 2, 4.2, 5]
  const ys = xs.map((x) => 2 * x + 1)
  const s = naturalCubicSpline(xs, ys)
  s.a.forEach((v) => assertClose(v, 0, 1e-12))
  s.b.forEach((v) => assertClose(v, 0, 1e-12))
  for (const x of [0, 0.2, 1, 3.3, 4.9, 5]) assertClose(evalSpline(s, x), 2 * x + 1, 1e-12)
  // 2点だけなら直線(線形補間)と同じ
  const two = naturalCubicSpline([1, 4], [2, 11])
  for (const x of [1, 2, 3.5, 4]) assertClose(evalSpline(two, x), lerp(2, 11, (x - 1) / 3), 1e-13)
})

test('刻み幅を半分にすると誤差は 1/16 (4 次の精度): sin x を [0,π] で補間した最大誤差の比が 16 前後', () => {
  const errs = [4, 8, 16, 32].map((n) => {
    const xs = Array.from({ length: n + 1 }, (_, i) => (Math.PI * i) / n)
    const s = naturalCubicSpline(xs, xs.map(Math.sin))
    let e = 0
    for (let k = 0; k <= 2000; k++) {
      const x = (Math.PI * k) / 2000
      e = Math.max(e, Math.abs(evalSpline(s, x) - Math.sin(x)))
    }
    return e
  })
  assert.ok(errs[0] < 2e-3, `n=4 の誤差 ${errs[0]}`)
  errs.slice(0, -1).forEach((e, i) => {
    const ratio = e / errs[i + 1]
    assert.ok(ratio > 15 && ratio < 18, `誤差の比 ${ratio}`)
  })
})

test('導関数: 差分で評価した微分と一致する(1階・2階)。3階は区間ごとに一定', () => {
  const s = naturalCubicSpline([0, 1, 2, 4, 5], [0, 2, 1, 3, 2])
  const h = 1e-5
  for (const x of [0.3, 0.8, 1.4, 2.5, 3.6, 4.5]) {
    const d1 = (evalSpline(s, x + h) - evalSpline(s, x - h)) / (2 * h)
    assertClose(evalSplineDeriv(s, x, 1), d1, 1e-7, `x=${x} の1階`)
    const g = 1e-3
    const d2 = (evalSpline(s, x + g) - 2 * evalSpline(s, x) + evalSpline(s, x - g)) / (g * g)
    assertClose(evalSplineDeriv(s, x, 2), d2, 1e-5, `x=${x} の2階`)
  }
  assertClose(evalSplineDeriv(s, 0.3, 3), 6 * s.a[0], 1e-13)
  assertClose(evalSplineDeriv(s, 0.3, 4), 0, 0)
  assertClose(evalSplineDeriv(s, 0.3, 0), evalSpline(s, 0.3), 0)
})

test('findSegment: x が入る区間の番号を返し、範囲の外は端の区間になる', () => {
  const xs = [0, 1, 2.5, 4, 7]
  assert.equal(findSegment(xs, 0), 0)
  assert.equal(findSegment(xs, 0.99), 0)
  assert.equal(findSegment(xs, 1), 1) // 節点ちょうどは右の区間
  assert.equal(findSegment(xs, 3.9), 2)
  assert.equal(findSegment(xs, 6.99), 3)
  assert.equal(findSegment(xs, 7), 3) // 右端は最後の区間
  assert.equal(findSegment(xs, -5), 0)
  assert.equal(findSegment(xs, 100), 3)
  assert.equal(findSegment([0, 2], 1), 0)
  // 線形探索と一致
  const rng = makeRng(34)
  for (let k = 0; k < 500; k++) {
    const x = rng() * 9 - 1
    let i = 0
    while (i < xs.length - 2 && x >= xs[i + 1]) i++
    assert.equal(findSegment(xs, x), i)
  }
})

test('範囲の外では端の区間の3次式をそのまま延長する', () => {
  const s = naturalCubicSpline([0, 1, 2, 4], [0, 2, 1, 3])
  // 左: 第 0 区間 S_0(x) = a x^3 + b x^2 + c x + d、右: 第 2 区間
  assertClose(evalSpline(s, -0.5), s.a[0] * -0.125 + s.b[0] * 0.25 + s.c[0] * -0.5 + s.d[0], 1e-13)
  const t = 5 - 2
  assertClose(evalSpline(s, 5), ((s.a[2] * t + s.b[2]) * t + s.c[2]) * t + s.d[2], 1e-13)
})

test('不正な入力は例外: 節点が 2 個未満、長さの不一致、xs が増加列でない', () => {
  assert.throws(() => naturalCubicSpline([1], [2]), RangeError)
  assert.throws(() => naturalCubicSpline([], []), RangeError)
  assert.throws(() => naturalCubicSpline([0, 1, 2], [0, 1]), RangeError)
  assert.throws(() => naturalCubicSpline([0, 2, 1], [0, 1, 2]), RangeError)
  assert.throws(() => naturalCubicSpline([0, 1, 1, 2], [0, 1, 2, 3]), RangeError)
})

test('入力の配列は書き換えず、返す xs も別の配列', () => {
  const xs = [0, 1, 2, 4]
  const ys = [0, 2, 1, 3]
  const s = naturalCubicSpline(xs, ys)
  assert.deepEqual(xs, [0, 1, 2, 4])
  assert.deepEqual(ys, [0, 2, 1, 3])
  s.xs[0] = 99
  assert.equal(xs[0], 0)
})
