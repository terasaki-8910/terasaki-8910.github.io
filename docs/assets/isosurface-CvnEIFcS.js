const n=`// 格子の上の値の補間、陰関数の場、等値線・等値面の取り出し、レベルセット法(DOM に触れない純関数)。
// 内側の約束: 値 f が T 以上の点を「内側」とする(メタボールのように、中が高い場の向き)。
// 格子の値は 1 次元の配列で、2 次元は values[i + nx * j]、3 次元は values[i + nx * (j + ny * k)]。
// 出典: Lorensen and Cline, SIGGRAPH '87 (1987)(マーチングキューブ) / Nielson and Hamann, IEEE Visualization '91 (1991)
// (漸近線判定) / Blinn, ACM TOG 1(3) (1982)・Müller et al., SCA 2003(メタボール) /
// Lancaster and Šalkauskas, Math. Comp. 37 (1981)(移動最小二乗) / Osher and Sethian, J. Comput. Phys. 79 (1988)・
// Sussman, Smereka and Osher, J. Comput. Phys. 114 (1994)(レベルセット法と再初期化) / Zalesak, J. Comput. Phys. 31 (1979)

// @snippet isosurface-bilinear
// 双線形補間: マスの 4 隅の値から、マスの中の点 (a, b)(0〜1)の値を比例配分で作る。
// 下の辺で横に 1 回、上の辺で横に 1 回、その 2 つを縦に 1 回の線形補間と同じ
export function bilinear(f00, f10, f01, f11, a, b) {
  return f00 * (1 - a) * (1 - b) + f10 * a * (1 - b) + f01 * (1 - a) * b + f11 * a * b
}
// @end

// @snippet isosurface-trilinear
// 3 重線形補間: 立方体の 8 隅の値 f(添字のビット 0・1・2 が x・y・z の側)から点 (a, b, c) の値を作る。
// 手前の面(z = 0)と奥の面(z = 1)で双線形補間した f_C・f_D を、奥行きの向きに線形補間する
export function trilinear(f, a, b, c) {
  const fC = bilinear(f[0], f[1], f[2], f[3], a, b)
  const fD = bilinear(f[4], f[5], f[6], f[7], a, b)
  return fC * (1 - c) + fD * c
}
// @end

const clampIndex = (v, n) => Math.min(n - 1, Math.max(0, v))

// 格子の座標 (x, y)(0〜nx−1、0〜ny−1)での値。外は端の値
export function sampleGrid2D(values, nx, ny, x, y) {
  const cx = Math.min(nx - 1, Math.max(0, x))
  const cy = Math.min(ny - 1, Math.max(0, y))
  const i = clampIndex(Math.floor(cx), nx - 1)
  const j = clampIndex(Math.floor(cy), ny - 1)
  const i1 = Math.min(nx - 1, i + 1)
  const j1 = Math.min(ny - 1, j + 1)
  return bilinear(values[i + nx * j], values[i1 + nx * j], values[i + nx * j1], values[i1 + nx * j1], cx - i, cy - j)
}

export function sampleGrid3D(values, nx, ny, nz, x, y, z) {
  const cx = Math.min(nx - 1, Math.max(0, x))
  const cy = Math.min(ny - 1, Math.max(0, y))
  const cz = Math.min(nz - 1, Math.max(0, z))
  const i = clampIndex(Math.floor(cx), nx - 1)
  const j = clampIndex(Math.floor(cy), ny - 1)
  const k = clampIndex(Math.floor(cz), nz - 1)
  const at = (di, dj, dk) => values[Math.min(nx - 1, i + di) + nx * (Math.min(ny - 1, j + dj) + ny * Math.min(nz - 1, k + dk))]
  const f = [at(0, 0, 0), at(1, 0, 0), at(0, 1, 0), at(1, 1, 0), at(0, 0, 1), at(1, 0, 1), at(0, 1, 1), at(1, 1, 1)]
  return trilinear(f, cx - i, cy - j, cz - k)
}

// @snippet isosurface-metaballWeight
// メタボールの重み W(r): 中心で 1、半径 R で 0 になる山(なめらかにつながる (1 − r²/R²)³ の形)
export function metaballWeight(r, R) {
  if (r >= R) return 0
  const q = 1 - (r * r) / (R * R)
  return q * q * q
}
// @end

// @snippet isosurface-metaballField
// メタボールの場 f(x) = Σ b_i W(|x − x_i|) − T。値が 0 以上の所が内側(形の中)。
// balls は [{ x, y, z?, b = 1, R }]。点 p の成分の数(2 か 3)で 2 次元か 3 次元
export function metaballField(p, balls, T) {
  let sum = 0
  for (const ball of balls) {
    const dx = p[0] - ball.x
    const dy = p[1] - ball.y
    const dz = p.length > 2 ? p[2] - (ball.z ?? 0) : 0
    sum += (ball.b ?? 1) * metaballWeight(Math.sqrt(dx * dx + dy * dy + dz * dz), ball.R)
  }
  return sum - T
}
// @end

// @snippet isosurface-gradient2D
// 勾配 ∇f = (∂f/∂x, ∂f/∂y) を中心差分で。値が増える向きで、等値線に直角(陰関数の法線)
export function gradient2D(f, x, y, h) {
  return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)]
}
// @end

// @snippet isosurface-curvature2D
// 曲率 κ = ∇·(∇f/|∇f|)(勾配の向きの広がり具合)。2 次元では
// κ = (f_xx f_y² − 2 f_x f_y f_xy + f_yy f_x²)/(f_x² + f_y²)^{3/2}。微分は差分で求める
export function curvature2D(f, x, y, h) {
  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)
  const fxx = (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h * h)
  const fyy = (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h * h)
  const fxy = (f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) / (4 * h * h)
  const g2 = fx * fx + fy * fy
  if (g2 === 0) return 0
  return (fxx * fy * fy - 2 * fx * fy * fxy + fyy * fx * fx) / g2 ** 1.5
}
// @end

// @snippet isosurface-solveLinear
// 連立 1 次方程式 A c = b を、部分ピボットつきのガウスの消去法で解く(A は n × n の入れ子の配列)
export function solveLinear(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-14) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = col + 1; r < n; r++) {
      const k = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= k * M[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}
// @end

// @snippet isosurface-weightedLeastSquares
// 移動最小二乗: q のまわりの点 (x_i, g_i) に 2 次式 c1 + c2 (x − q) + c3 (x − q)² を当てはめる。
// 重み θ(d) = exp(−d²/h²) をかけた誤差の 2 乗の和 E = Σ θ_i (b(x_i)ᵀc − g_i)² は c の 2 次式なので、
// 微分して 0 になる c は正規方程式 (Σ θ_i b_i b_iᵀ) c = Σ θ_i b_i g_i の解。b(x) = (1, x − q, (x − q)²)
// (q を原点にした局所座標。q での値は c1)
export function weightedLeastSquares(xs, gs, q, h) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const rhs = [0, 0, 0]
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - q
    const w = Math.exp(-(d * d) / (h * h))
    const basis = [1, d, d * d]
    for (let r = 0; r < 3; r++) {
      rhs[r] += w * basis[r] * gs[i]
      for (let c = 0; c < 3; c++) A[r][c] += w * basis[r] * basis[c]
    }
  }
  const c = solveLinear(A, rhs)
  return c ? { c, value: c[0], weights: xs.map((x) => Math.exp(-((x - q) ** 2) / (h * h))) } : null
}
// @end

// @snippet isosurface-edgeCrossing
// 辺の上の交点: 両端の値 fa・fb を直線で結び、値がちょうど T になる位置 t(0〜1)。
// 両端の符号(T より上か下か)が違えば、中間値の定理でこの間に必ずある
export function edgeCrossing(fa, fb, T) {
  const d = fb - fa
  return d === 0 ? 0.5 : (T - fa) / d
}
// @end

// @snippet isosurface-squareCase
// マスの通り方の番号: 4 つの角(ビット 0 = 左下、1 = 右下、2 = 右上、3 = 左上)が T 以上なら 1。16 通り
export function squareCase(f00, f10, f11, f01, T) {
  return (f00 >= T ? 1 : 0) | (f10 >= T ? 2 : 0) | (f11 >= T ? 4 : 0) | (f01 >= T ? 8 : 0)
}
// @end

// @snippet isosurface-saddleValue
// 漸近線判定: マスの中を双線形の f(u, v) と考えると、等値線は双曲線で、その中心(鞍点)の値は
// f_s = (f00 f11 − f10 f01)/(f00 − f10 − f01 + f11)。対角が同じ側のあいまいなマスでは、
// f_s が T 以上なら T 以上の 2 つの角はマスの中でつながっている
export function saddleValue(f00, f10, f01, f11) {
  const d = f00 - f10 - f01 + f11
  return d === 0 ? (f00 + f10 + f01 + f11) / 4 : (f00 * f11 - f10 * f01) / d
}
// @end

// @snippet isosurface-saddlePoint
// 鞍点の位置: f(u, v) = a + bu + cv + duv(b = f10 − f00、c = f01 − f00、d = f00 − f10 − f01 + f11)を
// u と v で微分して 0 とおくと、u_s = −c/d = (f00 − f01)/d、v_s = −b/d = (f00 − f10)/d。
// そこでの値が f_s(saddleValue と同じ)。d = 0 なら f は 1 次式で鞍点はない(null)
export function saddlePoint(f00, f10, f01, f11) {
  const d = f00 - f10 - f01 + f11
  if (d === 0) return null
  return { u: (f00 - f01) / d, v: (f00 - f10) / d, value: (f00 * f11 - f10 * f01) / d }
}
// @end

// 辺の番号: 0 = 下(左下→右下)、1 = 右(右下→右上)、2 = 上(左上→右上)、3 = 左(左下→左上)
// 通り方ごとに、結ぶ辺の組(あいまいな 5・10 は別に決める)
const SQUARE_EDGES = [
  [], [[0, 3]], [[0, 1]], [[3, 1]], [[1, 2]], null, [[0, 2]], [[3, 2]],
  [[3, 2]], [[0, 2]], null, [[1, 2]], [[3, 1]], [[0, 1]], [[0, 3]], [],
]

// あいまいなマスで、T 以上の角どうしをマスの中でつなぐか。'asymptotic'(鞍点の値)か 'center'(中心の値)
export function squareConnects(f00, f10, f11, f01, T, ambiguity = 'asymptotic') {
  const s = ambiguity === 'center' ? (f00 + f10 + f11 + f01) / 4 : saddleValue(f00, f10, f01, f11)
  return s >= T
}

// マスの中で結ぶ辺の組 [[辺, 辺], ...]
export function squareEdgePairs(f00, f10, f11, f01, T, ambiguity = 'asymptotic') {
  const c = squareCase(f00, f10, f11, f01, T)
  const fixed = SQUARE_EDGES[c]
  if (fixed) return fixed
  const joined = squareConnects(f00, f10, f11, f01, T, ambiguity)
  if (c === 5) return joined ? [[0, 1], [3, 2]] : [[0, 3], [1, 2]] // 内側は左下と右上
  return joined ? [[0, 3], [1, 2]] : [[0, 1], [3, 2]] // c === 10: 内側は右下と左上
}

// @snippet isosurface-squareSegments
// マス 1 つの等値線(マスの中の座標 0〜1)。交点は辺の上の線形補間(interpolate が false なら辺の中点)
export function squareSegments(f00, f10, f11, f01, T, { ambiguity = 'asymptotic', interpolate = true } = {}) {
  const t = (fa, fb) => (interpolate ? edgeCrossing(fa, fb, T) : 0.5)
  const point = [
    () => [t(f00, f10), 0],
    () => [1, t(f10, f11)],
    () => [t(f01, f11), 1],
    () => [0, t(f00, f01)],
  ]
  return squareEdgePairs(f00, f10, f11, f01, T, ambiguity).map(([a, b]) => [point[a](), point[b]()])
}
// @end

// @snippet isosurface-marchingSquares
// マーチングスクエア: マスを 1 つずつ見て、等値線の線分を集める(格子の座標)。
// 隣のマスとは同じ辺の上の交点を使うので、線分はつながる
export function marchingSquares(values, nx, ny, T, opts = {}) {
  const segments = []
  let ambiguous = 0
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const f00 = values[i + nx * j]
      const f10 = values[i + 1 + nx * j]
      const f01 = values[i + nx * (j + 1)]
      const f11 = values[i + 1 + nx * (j + 1)]
      const c = squareCase(f00, f10, f11, f01, T)
      if (c === 5 || c === 10) ambiguous++
      for (const [p, q] of squareSegments(f00, f10, f11, f01, T, opts)) {
        segments.push([[i + p[0], j + p[1]], [i + q[0], j + q[1]]])
      }
    }
  }
  return { segments, ambiguous }
}
// @end

// ---- 3 次元(マーチングキューブ) ------------------------------------------------------------

// 立方体の角 k の位置(ビット 0・1・2 が x・y・z)。辺は 1 ビットだけ違う角の組
const CORNERS = Array.from({ length: 8 }, (_, k) => [k & 1, (k >> 1) & 1, (k >> 2) & 1])
const CUBE_EDGES = []
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) CUBE_EDGES.push([a, a | bit])
const edgeIndex = new Map(CUBE_EDGES.map(([a, b], i) => [\`\${a}-\${b}\`, i]))
const cubeEdge = (a, b) => edgeIndex.get(a < b ? \`\${a}-\${b}\` : \`\${b}-\${a}\`)
// 6 つの面の角(面の中の座標で 左下・右下・右上・左上)。向かい合う面は同じ並びにする(隣の立方体と判定がそろう)
const CUBE_FACES = [
  [0, 2, 6, 4], [1, 3, 7, 5], // x = 0, 1(u = y, v = z)
  [0, 1, 5, 4], [2, 3, 7, 6], // y = 0, 1(u = x, v = z)
  [0, 1, 3, 2], [4, 5, 7, 6], // z = 0, 1(u = x, v = y)
]

// @snippet isosurface-cubeCase
// 立方体の通り方の番号: 8 つの角のうち T 以上の角のビットを立てる。2⁸ = 256 通り
export function cubeCase(f, T) {
  let c = 0
  for (let k = 0; k < 8; k++) if (f[k] >= T) c |= 1 << k
  return c
}
// @end

// 立方体の中の点 (a, b, c) での 3 重線形の場の勾配
function trilinearGradient(f, a, b, c) {
  const dx = (1 - b) * (1 - c) * (f[1] - f[0]) + b * (1 - c) * (f[3] - f[2]) + (1 - b) * c * (f[5] - f[4]) + b * c * (f[7] - f[6])
  const dy = (1 - a) * (1 - c) * (f[2] - f[0]) + a * (1 - c) * (f[3] - f[1]) + (1 - a) * c * (f[6] - f[4]) + a * c * (f[7] - f[5])
  const dz = (1 - a) * (1 - b) * (f[4] - f[0]) + a * (1 - b) * (f[5] - f[1]) + (1 - a) * b * (f[6] - f[2]) + a * b * (f[7] - f[3])
  return [dx, dy, dz]
}

// @snippet isosurface-marchingCubesCell
// 立方体 1 つの面(三角形)。256 通りの表を使う代わりに、6 つの面それぞれに 2 次元の線の引き方
// (あいまいな面は漸近線判定)を当て、面の上の線を辺の交点でつないで輪にし、輪を扇形に三角形へ分ける。
// 面の判定はその面の 4 つの値だけで決まるので、隣の立方体と同じ線になり、面に穴が開かない。
// 返すのは { loops: [[辺の番号, ...]], points: 辺の番号 → 立方体の中の座標 }。三角形は外向き(f が減る向き)が表
export function marchingCubesCell(f, T) {
  const neighbors = new Map()
  const link = (a, b) => {
    if (!neighbors.has(a)) neighbors.set(a, [])
    if (!neighbors.has(b)) neighbors.set(b, [])
    neighbors.get(a).push(b)
    neighbors.get(b).push(a)
  }
  for (const face of CUBE_FACES) {
    const [c00, c10, c11, c01] = face
    const sides = [cubeEdge(c00, c10), cubeEdge(c10, c11), cubeEdge(c01, c11), cubeEdge(c00, c01)]
    for (const [a, b] of squareEdgePairs(f[c00], f[c10], f[c11], f[c01], T)) link(sides[a], sides[b])
  }
  const points = new Map()
  for (const e of neighbors.keys()) {
    const [a, b] = CUBE_EDGES[e]
    const t = edgeCrossing(f[a], f[b], T)
    points.set(e, CORNERS[a].map((v, i) => v + t * (CORNERS[b][i] - v)))
  }
  const loops = []
  const seen = new Set()
  for (const start of neighbors.keys()) {
    if (seen.has(start)) continue
    const loop = [start]
    seen.add(start)
    let prev = start
    let cur = neighbors.get(start)[0]
    while (cur !== start && !seen.has(cur)) {
      loop.push(cur)
      seen.add(cur)
      const [n0, n1] = neighbors.get(cur)
      const next = n0 === prev ? n1 : n0
      prev = cur
      cur = next
    }
    // 輪の向きをそろえる: 輪の面の法線(右ねじ)が、場の値の減る向き(外)を向くように
    const center = [0, 0, 0]
    for (const e of loop) for (let i = 0; i < 3; i++) center[i] += points.get(e)[i] / loop.length
    const g = trilinearGradient(f, center[0], center[1], center[2])
    const n = [0, 0, 0]
    for (let i = 0; i < loop.length; i++) {
      const p = points.get(loop[i])
      const q = points.get(loop[(i + 1) % loop.length])
      n[0] += (p[1] - q[1]) * (p[2] + q[2])
      n[1] += (p[2] - q[2]) * (p[0] + q[0])
      n[2] += (p[0] - q[0]) * (p[1] + q[1])
    }
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] > 0) loop.reverse()
    loops.push(loop)
  }
  return { loops, points }
}
// @end

// @snippet isosurface-marchingCubes
// マーチングキューブ: 立方体を 1 つずつ見て面を集める。同じ辺の上の交点は 1 つの頂点にまとめる
// (隣の立方体と頂点を共有して、閉じた面になる)。座標は格子の座標、法線は場の勾配の逆向き(外向き)
export function marchingCubes(values, nx, ny, nz, T) {
  const at = (i, j, k) => values[i + nx * (j + ny * k)]
  const positions = []
  const normals = []
  const triangles = []
  const vertexOf = new Map()
  const grad = (i, j, k) => [
    (at(Math.min(nx - 1, i + 1), j, k) - at(Math.max(0, i - 1), j, k)) / (Math.min(nx - 1, i + 1) - Math.max(0, i - 1)),
    (at(i, Math.min(ny - 1, j + 1), k) - at(i, Math.max(0, j - 1), k)) / (Math.min(ny - 1, j + 1) - Math.max(0, j - 1)),
    (at(i, j, Math.min(nz - 1, k + 1)) - at(i, j, Math.max(0, k - 1))) / (Math.min(nz - 1, k + 1) - Math.max(0, k - 1)),
  ]
  const f = new Array(8)
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        for (let c = 0; c < 8; c++) f[c] = at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])
        const cs = cubeCase(f, T)
        if (cs === 0 || cs === 255) continue
        const { loops, points } = marchingCubesCell(f, T)
        const vid = (e) => {
          const [a, b] = CUBE_EDGES[e]
          const ga = [i + CORNERS[a][0], j + CORNERS[a][1], k + CORNERS[a][2]]
          const gb = [i + CORNERS[b][0], j + CORNERS[b][1], k + CORNERS[b][2]]
          const key = \`\${ga[0]},\${ga[1]},\${ga[2]}|\${gb[0]},\${gb[1]},\${gb[2]}\`
          let id = vertexOf.get(key)
          if (id === undefined) {
            id = positions.length
            const p = points.get(e)
            positions.push([i + p[0], j + p[1], k + p[2]])
            const t = edgeCrossing(f[a], f[b], T)
            const g0 = grad(...ga)
            const g1 = grad(...gb)
            const g = g0.map((v, d) => -(v + t * (g1[d] - v)))
            const len = Math.hypot(g[0], g[1], g[2]) || 1
            normals.push(g.map((v) => v / len))
            vertexOf.set(key, id)
          }
          return id
        }
        for (const loop of loops) {
          const ids = loop.map(vid)
          for (let m = 1; m < ids.length - 1; m++) triangles.push([ids[0], ids[m], ids[m + 1]])
        }
      }
    }
  }
  return { positions, normals, triangles }
}
// @end

// 立方体の 24 の回転を、角の番号の並べ替えとして作る
function cubeRotations() {
  const perms = []
  const axes = [0, 1, 2]
  const permute = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [x, ...rest])))
  for (const order of permute(axes)) {
    for (let signs = 0; signs < 8; signs++) {
      const s = [signs & 1 ? -1 : 1, signs & 2 ? -1 : 1, signs & 4 ? -1 : 1]
      // 行列式が +1 のものだけ(鏡映を除く)
      const M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (order[r] === c ? s[r] : 0)))
      const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
      if (det !== 1) continue
      perms.push(CORNERS.map((p) => {
        const c = p.map((v) => 2 * v - 1)
        const d = M.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2])
        return ((d[0] + 1) / 2) | (((d[1] + 1) / 2) << 1) | (((d[2] + 1) / 2) << 2)
      }))
    }
  }
  return perms
}

// @snippet isosurface-cubeCaseClasses
// 256 通りを、立方体を回して同じになるものでまとめる(complement で内外の入れ替えもまとめる)。
// classOf[通り方] = 組の番号(いちばん小さい通り方の番号の順)、count = 組の数(回転だけで 23、内外も入れて 15)
export function cubeCaseClasses({ complement = false } = {}) {
  const rotations = cubeRotations()
  const apply = (perm, c) => {
    let out = 0
    for (let k = 0; k < 8; k++) if (c & (1 << k)) out |= 1 << perm[k]
    return out
  }
  const classOf = new Int16Array(256).fill(-1)
  let count = 0
  for (let c = 0; c < 256; c++) {
    if (classOf[c] >= 0) continue
    for (const perm of rotations) {
      const r = apply(perm, c)
      classOf[r] = count
      if (complement) classOf[255 ^ r] = count
    }
    count++
  }
  return { classOf, count }
}
// @end

// ---- レベルセット法 ------------------------------------------------------------------------

// @snippet isosurface-signedDistanceSlottedDisk
// 切れ込みのある円板(Zalesak の円板)までの符号付き距離(内側が負)。円の距離と、切れ込みの長方形の距離から
// max(円, −長方形)(円から長方形を引いた形)で作る。disk = { cx, cy, r, slotWidth, slotTop }(slotTop は切れ込みの上端の y)
export function signedDistanceSlottedDisk(x, y, disk) {
  const dDisk = Math.hypot(x - disk.cx, y - disk.cy) - disk.r
  const bottom = disk.cy - disk.r - 0.05
  const hx = disk.slotWidth / 2
  const hy = (disk.slotTop - bottom) / 2
  const qx = Math.abs(x - disk.cx) - hx
  const qy = Math.abs(y - (bottom + hy)) - hy
  const dBox = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  return Math.max(dDisk, -dBox)
}
// @end

// @snippet isosurface-reinitStep
// 再初期化の 1 回: ∂φ/∂τ + S(φ0)(|∇φ| − 1) = 0 を進める(S(φ0) = φ0/√(φ0² + Δx²))。
// |∇φ| は Godunov の風上差分(φ0 > 0 では外向き、φ0 < 0 では内向きの片側差分を選ぶ)。
// 表面(φ = 0)の位置を変えずに、傾きの大きさを 1(距離の性質)に戻していく。境界は端の値をくり返す
export function reinitStep(phi, phi0, n, dx, dtau, out = new Float64Array(n * n)) {
  const at = (i, j) => phi[Math.min(n - 1, Math.max(0, i)) + n * Math.min(n - 1, Math.max(0, j))]
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = i + n * j
      const p = phi[k]
      const a = (p - at(i - 1, j)) / dx // 後退差分 D−x
      const b = (at(i + 1, j) - p) / dx // 前進差分 D+x
      const c = (p - at(i, j - 1)) / dx
      const d = (at(i, j + 1) - p) / dx
      const s0 = phi0[k]
      const s = s0 / Math.sqrt(s0 * s0 + dx * dx)
      let g
      if (s0 > 0) {
        g = Math.sqrt(Math.max(Math.max(a, 0) ** 2, Math.min(b, 0) ** 2) + Math.max(Math.max(c, 0) ** 2, Math.min(d, 0) ** 2))
      } else {
        g = Math.sqrt(Math.max(Math.min(a, 0) ** 2, Math.max(b, 0) ** 2) + Math.max(Math.min(c, 0) ** 2, Math.max(d, 0) ** 2))
      }
      out[k] = p - dtau * s * (g - 1)
    }
  }
  return out
}
// @end

// 表面の近く(|φ| < band)での |∇φ|(中心差分)の平均と、1 からのずれの平均
export function interfaceGradientStats(phi, n, dx, band) {
  let sum = 0
  let dev = 0
  let count = 0
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const k = i + n * j
      if (Math.abs(phi[k]) >= band) continue
      const gx = (phi[k + 1] - phi[k - 1]) / (2 * dx)
      const gy = (phi[k + n] - phi[k - n]) / (2 * dx)
      const g = Math.hypot(gx, gy)
      sum += g
      dev += Math.abs(g - 1)
      count++
    }
  }
  return count ? { mean: sum / count, deviation: dev / count, count } : { mean: NaN, deviation: NaN, count: 0 }
}
`;export{n as default};
