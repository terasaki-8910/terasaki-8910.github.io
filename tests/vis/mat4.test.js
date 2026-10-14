import test from 'node:test'
import assert from 'node:assert/strict'
import {
  identity,
  translate,
  scale,
  rotateX,
  rotateY,
  rotateZ,
  multiply,
  compose,
  transformPoint,
} from '../../src/utils/vis/mat4.js'

// 表示の桁で丸める(-0 は 0 にそろえる)
const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits + 0
const roundAll = (v, digits = 4) => v.map((x) => round(x, digits))
const roundMat = (M, digits = 4) => M.map((row) => roundAll(row, digits))

function assertCloseVec(actual, expected, tol = 1e-12) {
  assert.equal(actual.length, expected.length)
  actual.forEach((x, i) => {
    assert.ok(Math.abs(x - expected[i]) <= tol, `[${i}] ${x} と ${expected[i]} の差が ${tol} を超えた`)
  })
}

function assertCloseMat(A, B, tol = 1e-12) {
  A.forEach((row, i) => assertCloseVec(row, B[i], tol))
}

// 種を固定した線形合同法(Numerical Recipes の定数)。Math.random は使わない
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const transpose = (M) => M[0].map((_, j) => M.map((row) => row[j]))
const det3 = (M) =>
  M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
  M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
  M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
const upperLeft3 = (M) => M.slice(0, 3).map((row) => row.slice(0, 3))

function randomMatrix(rng) {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => rng() * 4 - 2))
}

test('単位行列は点も行列も変えない', () => {
  const rng = makeRng(1)
  const I = identity()
  assert.deepEqual(transformPoint(I, [3, -2, 5, 1]), [3, -2, 5, 1])
  for (let n = 0; n < 20; n++) {
    const M = randomMatrix(rng)
    assert.deepEqual(multiply(I, M), M)
    assert.deepEqual(multiply(M, I), M)
  }
})

test('identity は呼ぶたびに別の配列を返す(書き換えても他に影響しない)', () => {
  const a = identity()
  a[0][0] = 9
  assert.equal(identity()[0][0], 1)
})

test('平行移動は位置(w=1)を動かし、向き(w=0)は動かさない', () => {
  const T = translate(2, -1, 3)
  assert.deepEqual(transformPoint(T, [1, 0, 0, 1]), [3, -1, 3, 1])
  assert.deepEqual(transformPoint(T, [1, 0, 0, 0]), [1, 0, 0, 0])
})

test('平行移動の 3×3 部分は単位行列のままで、動かしているのは右端の列だけ(3×3 では書けない)', () => {
  const T = translate(2, -1, 3)
  assert.deepEqual(upperLeft3(T), upperLeft3(identity()))
  assert.deepEqual(transformPoint(T, [0, 0, 0, 1]), [2, -1, 3, 1]) // 原点が動く
})

test('最下行が 0 0 0 1 の 4×4 は x\' = ax+by+cz+d の形で、変換のあとも w は 1 のまま', () => {
  const rng = makeRng(2)
  for (let n = 0; n < 20; n++) {
    const M = randomMatrix(rng)
    M[3] = [0, 0, 0, 1]
    const [x, y, z] = [rng() * 4 - 2, rng() * 4 - 2, rng() * 4 - 2]
    const q = transformPoint(M, [x, y, z, 1])
    assertCloseVec(
      q.slice(0, 3),
      M.slice(0, 3).map((row) => row[0] * x + row[1] * y + row[2] * z + row[3]),
      1e-15,
    )
    assert.equal(q[3], 1)
    // 原点は右端の列 (d, h, l) に移る
    assert.deepEqual(transformPoint(M, [0, 0, 0, 1]), [M[0][3], M[1][3], M[2][3], 1])
  }
})

test('拡大縮小は各軸の成分を何倍かにする', () => {
  assert.deepEqual(transformPoint(scale(2, 3, 4), [1, 1, 1, 1]), [2, 3, 4, 1])
  assert.deepEqual(transformPoint(scale(0.5, 1, -1), [4, 5, 6, 1]), [2, 5, -6, 1])
})

test('合成 TS は「拡大してから平行移動」、ST は「平行移動してから拡大」で、積は交換できない', () => {
  const [tx, ty, tz] = [2, -3, 5]
  const [sx, sy, sz] = [3, 0.5, 2]
  const [x, y, z] = [1, 4, -2]
  const T = translate(tx, ty, tz)
  const S = scale(sx, sy, sz)
  const p = [x, y, z, 1]
  assert.deepEqual(transformPoint(compose(T, S), p), [sx * x + tx, sy * y + ty, sz * z + tz, 1])
  assert.deepEqual(transformPoint(compose(S, T), p), [sx * (x + tx), sy * (y + ty), sz * (z + tz), 1])
  assert.notDeepEqual(compose(T, S), compose(S, T))
  // 1つの行列にまとめられる: TS は拡大の対角に平行移動の列がつく形
  assert.deepEqual(compose(T, S), [
    [sx, 0, 0, tx],
    [0, sy, 0, ty],
    [0, 0, sz, tz],
    [0, 0, 0, 1],
  ])
})

test('compose(A, B) で頂点に掛けるのは1回でよく、A(B p) と同じ結果になる', () => {
  const rng = makeRng(3)
  const M = compose(translate(1, 2, 3), rotateY(0.7), scale(2, 2, 2), rotateX(-0.4))
  for (let n = 0; n < 20; n++) {
    const p = [rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3, 1]
    const stepwise = [rotateX(-0.4), scale(2, 2, 2), rotateY(0.7), translate(1, 2, 3)].reduce(
      (q, A) => transformPoint(A, q),
      p,
    )
    assertCloseVec(transformPoint(M, p), stepwise)
  }
  assert.deepEqual(compose(), identity())
  const A = rotateZ(0.3)
  assert.deepEqual(compose(A), A)
})

test('行列の積は結合的で、(AB)C = A(BC)', () => {
  const rng = makeRng(4)
  for (let n = 0; n < 20; n++) {
    const [A, B, C] = [randomMatrix(rng), randomMatrix(rng), randomMatrix(rng)]
    assertCloseMat(multiply(multiply(A, B), C), multiply(A, multiply(B, C)), 1e-12)
  }
})

test('回転の向き: x 軸は y を z へ、y 軸は z を x へ、z 軸は x を y へ回す(右手系)', () => {
  for (const a of [0.3, 1, 2, -0.8, Math.PI / 2]) {
    const [c, s] = [Math.cos(a), Math.sin(a)]
    assertCloseVec(transformPoint(rotateX(a), [0, 1, 0, 0]), [0, c, s, 0], 1e-15)
    assertCloseVec(transformPoint(rotateY(a), [0, 0, 1, 0]), [s, 0, c, 0], 1e-15)
    assertCloseVec(transformPoint(rotateZ(a), [1, 0, 0, 0]), [c, s, 0, 0], 1e-15)
  }
})

test('回転行列は直交で行列式 1、4行目と4列目は単位行列のまま', () => {
  for (const R of [rotateX, rotateY, rotateZ]) {
    for (const a of [0, 0.4, 1.3, 2.9, -2.2, Math.PI]) {
      const M = R(a)
      assertCloseMat(multiply(transpose(M), M), identity(), 1e-15)
      assert.ok(Math.abs(det3(upperLeft3(M)) - 1) < 1e-15)
      assert.deepEqual(M[3], [0, 0, 0, 1])
      assert.deepEqual([M[0][3], M[1][3], M[2][3]], [0, 0, 0])
    }
  }
})

test('逆回転は転置と同じで、R(-θ) = R(θ)^T。y 軸まわりの sin の符号を入れ替えた形はこの逆回転', () => {
  for (const R of [rotateX, rotateY, rotateZ]) {
    for (const a of [0.5, 1.7, -2.4]) {
      assertCloseMat(R(-a), transpose(R(a)), 1e-15)
      assertCloseMat(multiply(R(a), R(-a)), identity(), 1e-15)
    }
  }
  const b = 0.9
  const [c, s] = [Math.cos(b), Math.sin(b)]
  const flipped = [
    [c, 0, -s, 0],
    [0, 1, 0, 0],
    [s, 0, c, 0],
    [0, 0, 0, 1],
  ]
  assertCloseMat(flipped, rotateY(-b), 1e-15)
  assertCloseVec(transformPoint(flipped, [0, 0, 1, 0]), [-s, 0, c, 0], 1e-15)
})

test('同じ軸のまわりの回転は角度が足し算になる', () => {
  for (const R of [rotateX, rotateY, rotateZ]) {
    assertCloseMat(multiply(R(0.6), R(1.1)), R(1.7), 1e-15)
  }
})

test('z 軸まわり 90° の回転 R と (2,0,0) の平行移動 T: TR·(1,0,0,1)=(2,1,0,1)、RT·(1,0,0,1)=(0,3,0,1)', () => {
  const T = translate(2, 0, 0)
  const R = rotateZ(Math.PI / 2)
  const p = [1, 0, 0, 1]
  const TR = compose(T, R)
  const RT = compose(R, T)
  assert.deepEqual(roundMat(TR), [
    [0, -1, 0, 2],
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ])
  assert.deepEqual(roundAll(transformPoint(TR, p)), [2, 1, 0, 1]) // 回してから動かす
  assert.deepEqual(roundAll(transformPoint(RT, p)), [0, 3, 0, 1]) // 動かしてから回す
  assert.deepEqual(roundAll(transformPoint(TR, [1, 0, 0, 0])), [0, 1, 0, 0]) // 向きは回るだけ
  // 向きは平行移動されないので、どちらの順でも同じ
  assert.deepEqual(roundAll(transformPoint(RT, [1, 0, 0, 0])), [0, 1, 0, 0])
})

test('変換は引数の配列を書き換えない', () => {
  const M = compose(translate(1, 2, 3), rotateZ(0.5))
  const copy = JSON.parse(JSON.stringify(M))
  const p = [1, 2, 3, 1]
  transformPoint(M, p)
  multiply(M, M)
  assert.deepEqual(M, copy)
  assert.deepEqual(p, [1, 2, 3, 1])
})
