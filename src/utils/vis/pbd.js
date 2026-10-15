// 位置ベース法(Position Based Dynamics)の2次元版(DOM に触れない純関数、依存ライブラリなし)。
// 力から加速度を求めて速度・位置を進める代わりに、拘束(距離を保つ、など)を満たすように
// 予測した位置を直接動かし、速度は「位置の変化 / Δt」で後から決める。バネの剛性を大きくしても
// 発散しにくいので、布のように硬い拘束が多い対象に向く。
// 状態は massSpring.js と同じ持ち方で、質点ごとの [x, y] を Float64Array に並べる(1 ステップの中で
// 配列を作らないので、毎フレーム呼んでもごみが出ない)。
//   state.pos / vel : Float64Array(2n)  x0, y0, x1, y1, …
//   state.w[i]      : 質量の逆数(動きやすさ)。0 の質点は固定されて動かない
//   state.pred      : 予測位置の作業領域(なければ pbdStep が初回に作る)
// 出典: Müller, Heidelberger, Hennix, Ratcliff, "Position Based Dynamics",
// J. Visual Communication and Image Representation 18(2), 2007
// 極分解: Müller, Heidelberger, Teschner, Gross, "Meshless Deformations Based on Shape Matching",
// ACM SIGGRAPH 2005

const NO_GRAVITY = [0, 0]

// @snippet pbd-projectDistance
// 距離拘束 C(p1, p2) = |p1 − p2|² − d² を 1 回だけ射影する。
// C(p + Δp) ≈ C(p) + ∇C·Δp = 0 に、重み付きで最小の解 Δp_i = λ w_i ∇_{p_i}C を入れると
// λ = −C / Σ_j w_j |∇_{p_j}C|²。w_i は動きやすさ(質量の逆数。0 なら固定点)。戻り値は [Δp1, Δp2]
export function projectDistance(p1, p2, w1, w2, d) {
  const dx = p1[0] - p2[0]
  const dy = p1[1] - p2[1]
  const C = dx * dx + dy * dy - d * d
  // ∇_{p1}C = 2(p1 − p2)、∇_{p2}C = −2(p1 − p2)。|∇C|² は二つとも同じ
  const gx = 2 * dx
  const gy = 2 * dy
  const denom = (w1 + w2) * (gx * gx + gy * gy)
  if (denom === 0) return [[0, 0], [0, 0]] // 両方が固定点か、2 点が重なっていて向きが決まらない
  const lambda = -C / denom
  return [
    [lambda * w1 * gx, lambda * w1 * gy],
    [-lambda * w2 * gx, -lambda * w2 * gy],
  ]
}
// @end

// @snippet pbd-solveConstraints
// 拘束を 1 本ずつ順に直し、直した位置をすぐ次の拘束の計算に使う(ガウス・ザイデル法)。
// 1 本を直すと別の拘束が崩れるので iterations 回くり返す。constraints は { i, j, d } の配列
// (粒子 i と j の距離を d にする)。projectDistance と同じ計算を、配列を作らずに pos へ直接書く
export function solveConstraints(pos, constraints, w, iterations) {
  for (let it = 0; it < iterations; it++) {
    for (let c = 0; c < constraints.length; c++) {
      const { i, j, d } = constraints[c]
      const dx = pos[2 * i] - pos[2 * j]
      const dy = pos[2 * i + 1] - pos[2 * j + 1]
      const denom = (w[i] + w[j]) * 4 * (dx * dx + dy * dy) // Σ w|∇C|²
      if (denom === 0) continue
      const lambda = -(dx * dx + dy * dy - d * d) / denom // −C / Σ w|∇C|²
      pos[2 * i] += lambda * w[i] * 2 * dx
      pos[2 * i + 1] += lambda * w[i] * 2 * dy
      pos[2 * j] -= lambda * w[j] * 2 * dx
      pos[2 * j + 1] -= lambda * w[j] * 2 * dy
    }
  }
}
// @end

// 箱 box = [xmin, ymin, xmax, ymax] の外に出た(動ける)粒子を、箱の中の最も近い点へ戻す
function clampToBox(p, w, n, box) {
  const [xmin, ymin, xmax, ymax] = box
  for (let i = 0; i < n; i++) {
    if (w[i] === 0) continue
    if (p[2 * i] < xmin) p[2 * i] = xmin
    else if (p[2 * i] > xmax) p[2 * i] = xmax
    if (p[2 * i + 1] < ymin) p[2 * i + 1] = ymin
    else if (p[2 * i + 1] > ymax) p[2 * i + 1] = ymax
  }
}

// @snippet pbd-pbdStep
// 位置ベース法の 1 ステップ。params = { gravity: [gx, gy], iterations, damping, box }
// (damping は 1 ステップに失う速度の割合、box = [xmin, ymin, xmax, ymax] は動ける範囲。省略できる)
export function pbdStep(state, constraints, params, dt) {
  const { n, pos, vel, w } = state
  const pred = state.pred || (state.pred = new Float64Array(2 * n))
  const g = params.gravity || NO_GRAVITY
  const { iterations, damping = 0, box = null } = params
  // 1. 速度に重力を足し、予測位置 p = x + Δt·v を作る(固定点は動かさない)
  for (let i = 0; i < n; i++) {
    if (w[i] > 0) {
      vel[2 * i] = (vel[2 * i] + dt * g[0]) * (1 - damping)
      vel[2 * i + 1] = (vel[2 * i + 1] + dt * g[1]) * (1 - damping)
    } else {
      vel[2 * i] = 0
      vel[2 * i + 1] = 0
    }
    pred[2 * i] = pos[2 * i] + dt * vel[2 * i]
    pred[2 * i + 1] = pos[2 * i + 1] + dt * vel[2 * i + 1]
  }
  // 2. 拘束を射影して予測位置を直す(箱があれば、外に出た分を 1 回ごとに戻す)
  for (let it = 0; it < iterations; it++) {
    solveConstraints(pred, constraints, w, 1)
    if (box) clampToBox(pred, w, n, box)
  }
  // 3. 速度 = 位置の変化 / Δt、位置を予測位置に更新する
  for (let i = 0; i < n; i++) {
    vel[2 * i] = (pred[2 * i] - pos[2 * i]) / dt
    vel[2 * i + 1] = (pred[2 * i + 1] - pos[2 * i + 1]) / dt
    pos[2 * i] = pred[2 * i]
    pos[2 * i + 1] = pred[2 * i + 1]
  }
}
// @end

// 粒子 n 個の状態を作る。位置も速度も 0、動きやすさ w はすべて 1(質量 1)
export function createPbdState(n) {
  return {
    n,
    pos: new Float64Array(2 * n),
    vel: new Float64Array(2 * n),
    w: new Float64Array(n).fill(1),
    pred: new Float64Array(2 * n),
  }
}

// 布(2次元の格子状の網)を作る。cols×rows 個の粒子を間隔 spacing で並べ、左上の粒子を (x0, y0) に置く。
// 行が増えるほど y が小さくなる(y は上向きが正)。縦横(構造)と斜め(せん断)の距離拘束でつなぐ。
// 斜めの拘束がないと格子が菱形につぶれる。固定したい粒子は state.w[i] = 0 にする。
// ドラッグは、掴んだ粒子を w=0 にして state.pos[2i], state.pos[2i+1] にポインタの位置を毎フレーム書き、離したら w を戻す
export function createCloth(cols, rows, spacing, x0, y0) {
  const state = createPbdState(cols * rows)
  const constraints = []
  const diag = spacing * Math.SQRT2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      state.pos[2 * i] = x0 + c * spacing
      state.pos[2 * i + 1] = y0 - r * spacing
      if (c + 1 < cols) constraints.push({ i, j: i + 1, d: spacing })
      if (r + 1 < rows) constraints.push({ i, j: i + cols, d: spacing })
      if (c + 1 < cols && r + 1 < rows) {
        constraints.push({ i, j: i + cols + 1, d: diag })
        constraints.push({ i: i + 1, j: i + cols, d: diag })
      }
    }
  }
  return { state, constraints, cols, rows, spacing }
}

// 2×2 行列の積(入れ子の配列)
function mul2(A, B) {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

// @snippet pbd-polarDecompose2
// 2×2 行列 A = R S の極分解。R は回転(RᵀR = I、det R = 1)、S は対称な正定値のひずみ。
// A = RS なら AᵀA = S²。AᵀA = Q Λ Qᵀ と対角化し、S = Q Λ^{1/2} Qᵀ、R = A S⁻¹。
// AᵀA = [[a, b], [b, c]] の対角化は 2×2 なら閉じた形で書ける(固有値 mean ± rad、
// 大きいほうの固有ベクトルの向き θ = ½·atan2(2b, a − c))。
// A がつぶれた(det が 0 に近い)か裏返った(det < 0)ときは S⁻¹ が使えないので、
// 回転に最も近い R = rot(atan2(A10 − A01, A00 + A11)) を使い、S = RᵀA とする
export function polarDecompose2(A) {
  const a = A[0][0] * A[0][0] + A[1][0] * A[1][0]
  const b = A[0][0] * A[0][1] + A[1][0] * A[1][1]
  const c = A[0][1] * A[0][1] + A[1][1] * A[1][1]
  const mean = (a + c) / 2
  const rad = Math.hypot((a - c) / 2, b)
  const s1 = Math.sqrt(mean + rad) // Λ^{1/2} の大きいほう
  const s2 = Math.sqrt(Math.max(mean - rad, 0)) // 小さいほう
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (det < 0 || s2 <= 1e-9 * s1) {
    const t = Math.atan2(A[1][0] - A[0][1], A[0][0] + A[1][1])
    const R = [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]]
    const S = mul2([[R[0][0], R[1][0]], [R[0][1], R[1][1]]], A)
    return { R, S }
  }
  const th = 0.5 * Math.atan2(2 * b, a - c)
  const ex = Math.cos(th)
  const ey = Math.sin(th)
  const k = s1 - s2 // S = s2·I + (s1 − s2)·e eᵀ
  const S = [[s2 + k * ex * ex, k * ex * ey], [k * ex * ey, s2 + k * ey * ey]]
  const q = 1 / s1 - 1 / s2 // S⁻¹ = I/s2 + (1/s1 − 1/s2)·e eᵀ
  const Sinv = [[1 / s2 + q * ex * ex, q * ex * ey], [q * ex * ey, 1 / s2 + q * ey * ey]]
  return { R: mul2(A, Sinv), S }
}
// @end
