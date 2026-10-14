// 剛体の衝突の判定と応答(DOM に触れない純関数、依存ライブラリなし)。
// 円の物体は { c: [x, y], v: [vx, vy], r, m }(中心、速度、半径、質量。m=Infinity は動かない物体)。
// 軸平行な箱(AABB)は { min: [..], max: [..] }。凸多角形は頂点の配列 [[x, y], ...](順序は問わない)。
// 反発係数 e は 0(はね返らない)〜1(エネルギーを失わない)。
// AABB と円どうしの判定、reflectVelocity は座標の数によらず 2 次元でも 3 次元でも動く。
// 出典:
//   Ericson, Real-Time Collision Detection (2004): 球どうしの 2 乗距離の判定、AABB の判定、Sweep and Prune、GJK
//   Gilbert, Johnson, Keerthi, IEEE J. Robotics and Automation 4(2) (1988): GJK 法
//   Baraff and Witkin, Physically Based Modeling: Principles and Practice, SIGGRAPH Course Notes (1997): 撃力による衝突の応答

// ---- 2 次元ベクトルの小さな補助 ----

// @snippet collide-vec
// 内積と、2 次元の外積(z 成分)
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]

// ベクトル u に垂直で、w の側を向くベクトル: (u × w) × u
function perpToward(u, w) {
  const s = cross(u, w)
  return [-u[1] * s, u[0] * s]
}
// @end

// ---- 反発 ----

// @snippet collide-reflectVelocity
// 面の法線(外向きの単位ベクトル n)の方向の速度を反転して e 倍にする: v_r = v - (1+e)(v·n)n。
// 面に近づく向き(v·n < 0)のときだけ呼ぶこと。out に v を渡せばその場で書き換える
export function reflectVelocity(v, n, e, out = new Array(v.length)) {
  let vn = 0
  for (let i = 0; i < v.length; i++) vn += v[i] * n[i]
  const k = (1 + e) * vn
  for (let i = 0; i < v.length; i++) out[i] = v[i] - k * n[i]
  return out
}
// @end

// ---- 球(円)どうしの判定 ----

// @snippet collide-circlesOverlap
// |c1 - c2| <= r1 + r2 を両辺 2 乗した形で比べる。両辺は 0 以上なので向きは変わらず、
// 距離の 2 乗は成分の 2 乗の和なので平方根が要らない
export function circlesOverlap(c1, r1, c2, r2) {
  let d2 = 0
  for (let i = 0; i < c1.length; i++) {
    const d = c1[i] - c2[i]
    d2 += d * d
  }
  return d2 <= (r1 + r2) * (r1 + r2)
}
// @end

// @snippet collide-pairCount
// N 個の物体から 2 個を選ぶ組の数。(i,j) と (j,i) は同じ組なので N(N-1) を 2 で割る
export function pairCount(N) {
  return (N * N - N) / 2
}
// @end

// ---- ブロードフェーズ: AABB ----

// 円を囲む AABB。out を渡すと配列を作らずに書き換える
export function circleBox(c, r, out = { min: [0, 0], max: [0, 0] }) {
  out.min[0] = c[0] - r
  out.min[1] = c[1] - r
  out.max[0] = c[0] + r
  out.max[1] = c[1] + r
  return out
}

// @snippet collide-aabbOverlap
// 全部の軸で区間が重なっていれば箱が重なる(箱は区間の直積)。
// 比較だけで、足し算も掛け算も平方根も要らず、1 軸でも離れていれば残りは見ない
export function aabbOverlap(a, b) {
  for (let k = 0; k < a.min.length; k++) {
    if (!(a.min[k] <= b.max[k] && b.min[k] <= a.max[k])) return false
  }
  return true
}
// @end

// @snippet collide-sweepAndPrune
// 衝突しうる箱の組 [i, j](i < j)を返す。x 軸の最小値でソートして走査し、
// x 軸で重ならなくなった所で打ち切る。残りの軸は aabbOverlap で確かめる
// (端点の並びを軸ごとに見る方法と、候補の組は同じ)
export function sweepAndPrune(boxes) {
  const order = Array.from(boxes, (_, i) => i).sort((a, b) => boxes[a].min[0] - boxes[b].min[0])
  const pairs = []
  for (let s = 0; s < order.length; s++) {
    const i = order[s]
    for (let t = s + 1; t < order.length; t++) {
      const j = order[t]
      if (boxes[j].min[0] > boxes[i].max[0]) break
      if (aabbOverlap(boxes[i], boxes[j])) pairs.push(i < j ? [i, j] : [j, i])
    }
  }
  return pairs
}
// @end

// ---- 凸多角形どうしの判定: GJK ----

// @snippet collide-support
// サポート写像: 方向 d にいちばん遠い頂点
export function support(points, d) {
  let best = points[0]
  let bestDot = dot(best, d)
  for (let i = 1; i < points.length; i++) {
    const s = dot(points[i], d)
    if (s > bestDot) {
      best = points[i]
      bestDot = s
    }
  }
  return best
}
// @end

// @snippet collide-minkowskiSupport
// 差の集合 A ⊕ (-B) = {a - b} のサポート写像: s_A(d) - s_B(-d)。
// 差の集合(頂点数の積だけ点がある)は作らず、A と B の頂点を調べるだけで端の点が求まる
export function minkowskiSupport(A, B, d) {
  const a = support(A, d)
  const b = support(B, [-d[0], -d[1]])
  return [a[0] - b[0], a[1] - b[1]]
}
// @end

// @snippet collide-nextSimplex
// 単体(線分か三角形)を原点に近い側へ縮め、次に探す方向を返す。
// 三角形が原点を囲んでいたら null
function nextSimplex(simplex) {
  const a = simplex[simplex.length - 1] // いちばん新しく足した点
  const ao = [-a[0], -a[1]]
  const b = simplex[simplex.length - 2]
  const ab = [b[0] - a[0], b[1] - a[1]]
  if (simplex.length === 2) {
    if (dot(ab, ao) > 0) return perpToward(ab, ao) // 原点は線分の横にある
    simplex.shift() // 原点は a の先にある。a だけ残す
    return ao
  }
  const ac = [simplex[0][0] - a[0], simplex[0][1] - a[1]]
  const abOut = perpToward(ab, [-ac[0], -ac[1]]) // 辺 ab の外向き(c と反対側)
  if (dot(abOut, ao) > 0) {
    simplex.shift() // c を捨てる
    return abOut
  }
  const acOut = perpToward(ac, [-ab[0], -ab[1]])
  if (dot(acOut, ao) > 0) {
    simplex.splice(1, 1) // b を捨てる
    return acOut
  }
  return null // 三角形が原点を囲んでいる
}
// @end

// @snippet collide-gjkIntersect
// 凸多角形 A, B が重なる ⇔ 差の集合 A ⊕ (-B) が原点を含む。
// 原点の向きのサポート点を足しながら、原点を囲む単体を探す
export function gjkIntersect(A, B) {
  const simplex = [minkowskiSupport(A, B, [1, 0])] // 最初の方向は何でもよい
  let d = [-simplex[0][0], -simplex[0][1]]
  for (let iter = 0; iter < 100; iter++) {
    if (d[0] === 0 && d[1] === 0) return true // 原点が単体の上にある
    const p = minkowskiSupport(A, B, d)
    if (dot(p, d) < 0) return false // d の向きに原点まで届かない: 原点を含まない
    simplex.push(p)
    d = nextSimplex(simplex)
    if (d === null) return true
  }
  return true // 反復が終わらないのは、ちょうど接する場合だけ
}
// @end

// ---- 応答: 撃力 ----

// @snippet collide-resolveCircles
// 重なった 2 つの円に撃力 j を法線方向に与える。
//   v1' = v1 - (j/m1) n,  v2' = v2 + (j/m2) n  → 運動量 m1 v1 + m2 v2 は変わらない
//   法線方向の相対速度 (v1' - v2')·n = -e (v1 - v2)·n  から  j = (1+e)(v1 - v2)·n / (1/m1 + 1/m2)
// 接線方向(摩擦なし)は変わらない。離れていく組は何もしない。返り値は撃力の大きさ
export function resolveCircles(b1, b2, e) {
  const dx = b2.c[0] - b1.c[0]
  const dy = b2.c[1] - b1.c[1]
  const dist = Math.hypot(dx, dy)
  const nx = dist > 0 ? dx / dist : 1 // 法線は 1 から 2 へ。中心が一致していたら適当な向き
  const ny = dist > 0 ? dy / dist : 0
  const vn = (b1.v[0] - b2.v[0]) * nx + (b1.v[1] - b2.v[1]) * ny // 近づく速さ
  const w1 = 1 / b1.m
  const w2 = 1 / b2.m
  if (vn <= 0 || w1 + w2 === 0) return 0
  const j = ((1 + e) * vn) / (w1 + w2)
  b1.v[0] -= j * w1 * nx
  b1.v[1] -= j * w1 * ny
  b2.v[0] += j * w2 * nx
  b2.v[1] += j * w2 * ny
  return j
}
// @end

// めり込みを、動きやすさ(質量の逆数)に比例して法線方向に押し戻す。
// 速度は撃力だけで決まるので、位置の補正は resolveCircles とは別にして、めり込みが残って沈むのを防ぐ。
// 重なっていたら押し戻した量(めり込みの深さ)を、そうでなければ 0 を返す
export function separateCircles(b1, b2) {
  const dx = b2.c[0] - b1.c[0]
  const dy = b2.c[1] - b1.c[1]
  const dist = Math.hypot(dx, dy)
  const depth = b1.r + b2.r - dist
  const w1 = 1 / b1.m
  const w2 = 1 / b2.m
  if (depth <= 0 || w1 + w2 === 0) return 0
  const nx = dist > 0 ? dx / dist : 1
  const ny = dist > 0 ? dy / dist : 0
  const s1 = (depth * w1) / (w1 + w2)
  const s2 = (depth * w2) / (w1 + w2)
  b1.c[0] -= s1 * nx
  b1.c[1] -= s1 * ny
  b2.c[0] += s2 * nx
  b2.c[1] += s2 * ny
  return depth
}
