const n=`// 背面除去と z バッファ(隠面消去)の中心になる計算(DOM に触れない純関数)。
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

// @snippet raster-barycentric
// 重心座標: 三角形 abc の中の点 p を p = λ0 a + λ1 b + λ2 c(λ0 + λ1 + λ2 = 1)と表す重み。
// λ0 は三角形 pbc の面積と abc の面積の比(ほかも同じ)。3 つとも 0 以上なら p は三角形の中
export function barycentric(p, a, b, c, out = [0, 0, 0]) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (area === 0) {
    out[0] = out[1] = out[2] = NaN
    return out
  }
  out[0] = ((b[0] - p[0]) * (c[1] - p[1]) - (b[1] - p[1]) * (c[0] - p[0])) / area
  out[1] = ((c[0] - p[0]) * (a[1] - p[1]) - (c[1] - p[1]) * (a[0] - p[0])) / area
  out[2] = 1 - out[0] - out[1]
  return out
}
// @end

// 辺 a → b が「上の辺か左の辺」か(画素の並びの座標。y は下向き)。
// 頂点の並びを、画面で時計回り(下の edge の値が正)にそろえたときの決まり
function isTopLeft(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return (dy === 0 && dx > 0) || dy < 0
}

// @snippet raster-rasterTriangle
// 画面の三角形を画素で塗る(画素の並びの座標: x は右、y は下。画素 (x, y) の中心は (x + 0.5, y + 0.5))。
// 中心が三角形の中にある画素ごとに onPixel(x, y, λ0, λ1, λ2) を呼ぶ(λ は元の頂点の順の重心座標)。
// 辺の上の画素は「上の辺・左の辺」のときだけ含める決まりで、辺を共有する 2 つの三角形が
// 同じ画素を 2 回塗ることも、すき間が開くこともない。辺の式は x・y の 1 次式なので、1 画素進むごとに足すだけ
export function rasterTriangle(a, b, c, width, height, onPixel) {
  let area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (area === 0 || !Number.isFinite(area)) return
  // 並びを時計回り(area > 0)にそろえる。入れ替えたら、重みを元の順に戻して渡す
  const flip = area < 0
  const p0 = a
  const p1 = flip ? c : b
  const p2 = flip ? b : c
  if (flip) area = -area
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])))
  if (minX > maxX || minY > maxY) return
  // 辺 i の式 E_i(x, y) = A x + B y + C(向かいの頂点の重みになる)。辺 p1p2 → λ(p0)、p2p0 → λ(p1)、p0p1 → λ(p2)
  const edges = [
    [p1, p2],
    [p2, p0],
    [p0, p1],
  ].map(([s, e]) => {
    const A = s[1] - e[1]
    const B = e[0] - s[0]
    const C = -A * s[0] - B * s[1]
    return { A, B, C, inclusive: isTopLeft(s, e) }
  })
  const [e0, e1, e2] = edges
  const inv = 1 / area
  const startX = minX + 0.5
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5
    let w0 = e0.A * startX + e0.B * py + e0.C
    let w1 = e1.A * startX + e1.B * py + e1.C
    let w2 = e2.A * startX + e2.B * py + e2.C
    for (let x = minX; x <= maxX; x++) {
      if ((w0 > 0 || (w0 === 0 && e0.inclusive)) &&
          (w1 > 0 || (w1 === 0 && e1.inclusive)) &&
          (w2 > 0 || (w2 === 0 && e2.inclusive))) {
        const l0 = w0 * inv
        const l1 = w1 * inv
        const l2 = w2 * inv
        if (flip) onPixel(x, y, l0, l2, l1)
        else onPixel(x, y, l0, l1, l2)
      }
      w0 += e0.A
      w1 += e1.A
      w2 += e2.A
    }
  }
}
// @end
`;export{n as default};
