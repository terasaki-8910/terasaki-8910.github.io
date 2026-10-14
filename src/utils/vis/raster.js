// 背面除去と z バッファ(隠面消去)の中心になる計算(DOM に触れない純関数)。
// 画面の座標は x が右、y が上(projection.js の viewport と同じ向き)。
// 深度は NDC の z で、小さいほど手前(手前が -1、奥が +1)。
// 出典: Catmull, A Subdivision Algorithm for Computer Display of Curved Surfaces,
// PhD thesis, University of Utah (1974)(z バッファ) /
// Foley, van Dam, Feiner, Hughes, Computer Graphics: Principles and Practice,
// 2nd ed. (1990)(背面除去と走査線の補間)

// @snippet raster-isBackFace
// 画面上で頂点 a, b, c が時計回りの三角形は、裏を向いている(背面)。
// 向きは符号付き面積(外積の z 成分)の符号で決まり、反時計回りが正。
// 3次元で N·V < 0 (法線と視点への向きが鈍角)とする判定と同じ結果になる
export function isBackFace(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1]]
  const ac = [c[0] - a[0], c[1] - a[1]]
  return ab[0] * ac[1] - ab[1] * ac[0] < 0 // 外積 ab × ac の符号(面積の2倍)
}
// @end

// @snippet raster-depthSpan
// 走査線の左端の深度 z0 と右端の深度 z1 から、n 画素ぶんの深度を作る。
// 平面の三角形では深度 z_ndc が画面の座標の1次式になるので、1画素進むごとに
// 一定の dz を足すだけでよい(画素ごとに掛け算も割り算もしない)。
// 足してよいのは z_ndc と 1/z で、カメラ座標の z そのものは1次式にならない
export function depthSpan(z0, z1, n) {
  const z = new Float64Array(n)
  const dz = n > 1 ? (z1 - z0) / (n - 1) : 0
  if (n > 0) z[0] = z0
  for (let i = 1; i < n; i++) z[i] = z[i - 1] + dz
  return z
}
// @end

// @snippet raster-zTest
// z バッファ法: 画素ごとに一番手前の深度を覚え、それより手前なら書き込む。
// buffer は Infinity で初期化しておく。同じ深度なら先に書いたほうを残す
// (NaN も書き込まない)。描く順番によらず、最後には一番手前が残る
export function zTest(buffer, i, z) {
  if (!(z < buffer[i])) return false
  buffer[i] = z
  return true
}
// @end
