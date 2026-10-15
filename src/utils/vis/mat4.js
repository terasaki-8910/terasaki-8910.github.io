// 3次元の同次座標と 4×4 の変換行列(DOM に触れない純関数、依存ライブラリなし)。
// 行列は行優先の入れ子の配列 M[i][j]、点は列ベクトルで M·p と掛ける。
// 点は [x, y, z, w] の4成分。w=1 は位置(平行移動される)、w=0 は向き(されない)。
// 右手系で、軸の正の側から原点を見て反時計回りを正の回転とする。
// 出典: Foley, van Dam, Feiner, Hughes, Computer Graphics: Principles and Practice,
// 2nd ed. (1990) / Akenine-Möller, Haines, Hoffman, Real-Time Rendering, 4th ed. (2018)

// @snippet mat4-identity
// 何も変えない変換。合成の出発点にも使う
export function identity() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-translate
// 3×3 の掛け算は原点を必ず原点に移すので、平行移動は書けない。
// 点に成分 w=1 を足し、右端の列で (x, y, z) に (tx, ty, tz) を足し込む
export function translate(tx, ty, tz) {
  return [
    [1, 0, 0, tx],
    [0, 1, 0, ty],
    [0, 0, 1, tz],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-scale
// 原点を中心にした軸ごとの拡大縮小
export function scale(sx, sy, sz) {
  return [
    [sx, 0, 0, 0],
    [0, sy, 0, 0],
    [0, 0, sz, 0],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-rotateX
// x → y → z → x の順に、次の軸の方へ回る向きが正。
// x 軸まわりでは y が z の方へ回る: R·(0,1,0) = (0, cos, sin)
export function rotateX(theta) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-rotateY
// y 軸まわりでは z が x の方へ回る: R·(0,0,1) = (sin, 0, cos)。
// そのため -sin が左下に来て、x 軸・z 軸まわりとは符号の位置が逆になる。
// この符号を入れ替えた形は -theta の回転(逆回転・転置)になる
export function rotateY(theta) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-rotateZ
// z 軸まわりでは x が y の方へ回る: R·(1,0,0) = (cos, sin, 0)
export function rotateZ(theta) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
}
// @end

// @snippet mat4-multiply
// 行列の積 A·B。AB と BA は一般に違うので、
// 掛ける順番がそのまま変換の順番になる
export function multiply(A, B) {
  const C = Array.from({ length: 4 }, () => [0, 0, 0, 0])
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) C[i][j] += A[i][k] * B[k][j]
    }
  }
  return C
}
// @end

// @snippet mat4-compose
// compose(A, B, C) = A·B·C。点には右にある行列ほど先に効く(C → B → A)。
// 先に1つの行列にまとめておけば、頂点ごとの掛け算は1回で済む
export function compose(...Ms) {
  return Ms.reduce((acc, M) => multiply(acc, M), identity())
}
// @end

// @snippet mat4-transformPoint
// M·p。p = [x, y, z, w]。w=1 は位置(平行移動される)、
// w=0 は向き(平行移動の影響を受けない)
export function transformPoint(M, p) {
  return M.map((row) => row.reduce((sum, m, j) => sum + m * p[j], 0))
}
// @end
