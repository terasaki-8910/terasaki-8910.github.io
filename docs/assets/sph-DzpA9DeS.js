const n=`// 粒子法(SPH、MPS)の2次元版(DOM に触れない純関数、依存ライブラリなし)。
// 流体を粒子の集まりで表し、場の量 φ を「まわりの粒子の値の重み付きの和」で近似する。重み W(核)は
// 偶関数で ∫W dA = 1、影響半径 h の外では 0。h 以内の粒子だけを調べればよいので、セルの 1 辺を h にした
// 一様なグリッドに粒子を振り分けておけば、近傍探索は粒子数 N に比例する時間(O(N))で済む。
// 状態は massSpring.js と同じ持ち方で、粒子ごとの [x, y] を Float64Array に並べる(1 ステップの中で
// 配列を作らないので、毎フレーム呼んでもごみが出ない)。
//   state.pos / vel / force : Float64Array(2n)  x0, y0, x1, y1, …
//   state.rho / pressure    : Float64Array(n)   密度、圧力
//   state.grid              : UniformGrid       近傍探索(組の一覧もここに持つ)
// 粒子の質量はすべて m、領域は [0, width] × [0, height]、y は上向きが正。
// 出典:
//   Müller, Charypar, Gross, "Particle-Based Fluid Simulation for Interactive Applications", SCA 2003:
//     poly6・spiky・粘性の核と、p = k(ρ − ρ0) の状態方程式
//   Monaghan, "Smoothed Particle Hydrodynamics", Annu. Rev. Astron. Astrophys. 30, 1992:
//     3 次スプライン核と、運動量を保存する対称な圧力の力
//   Koshizuka, Oka, "Moving-Particle Semi-Implicit Method", Nucl. Sci. Eng. 123, 1996: MPS 法の勾配

const NO_GRAVITY = [0, 0]
const scratch = [0, 0]

// ---------------------------------------------------------------- 核(2次元で ∫W dA = 1 に正規化)

// @snippet sph-poly6
// poly6 核(密度用)W = 4/(πh⁸)·(h² − r²)³(r < h)。r² だけで書けて平方根が要らない。
// 2 次元で ∫W dA = 2π∫W r dr = 1 になる定数は 4/(πh⁸)(3 次元の 315/(64πh⁹) をそのまま使うと 1 にならない)
export function poly6(r2, h) {
  const h2 = h * h
  if (r2 >= h2) return 0
  const t = h2 - r2
  return ((4 / (Math.PI * h2 * h2 * h2 * h2)) * t) * t * t
}
// @end

// spiky 核 W = 10/(πh⁵)·(h − r)³(r < h)。poly6 と違い中心でとがっていて、勾配が 0 にならない
export function spiky(r, h) {
  if (r >= h) return 0
  const t = h - r
  return ((10 / (Math.PI * h * h * h * h * h)) * t) * t * t
}

// @snippet sph-spikyGrad
// spiky 核の勾配(圧力用)∇W = −30/(πh⁵)·(h − r)²·(dx, dy)/r。(dx, dy) = x_i − x_j、r = |(dx, dy)|。
// 向きは x_i を x_j から遠ざける側の逆(W は近いほど大きいので、勾配は x_j に向かう)。結果は out に書く
export function spikyGrad(dx, dy, r, h, out = [0, 0]) {
  if (r >= h || r === 0) {
    out[0] = 0
    out[1] = 0
    return out
  }
  const c = ((-30 / (Math.PI * h * h * h * h * h)) * (h - r) * (h - r)) / r
  out[0] = c * dx
  out[1] = c * dy
  return out
}
// @end

// @snippet sph-viscLaplacian
// 粘性用の核のラプラシアン ∇²W_visc = 40/(πh⁵)·(h − r)(r < h)。r が小さいほど大きく、h で 0 になる。
// 係数は「∇²(x² + y²) = 4 を粒子の和で再現する」条件 ∫ r²∇²W dA = 4 から決めた
// (Müller の 3 次元の 45/(πh⁶) と同じ考え方の 2 次元版)
export function viscLaplacian(r, h) {
  if (r >= h) return 0
  return (40 / (Math.PI * h * h * h * h * h)) * (h - r)
}
// @end

// @snippet sph-cubicSpline
// 3 次スプライン核(Monaghan 1992)。h は影響半径(核の滑らかさの長さ s = h/2 の 2 倍で 0 になる)。
// q = r/s として W = σ(1 − 3q²/2 + 3q³/4)(q < 1)、σ(2 − q)³/4(1 ≤ q < 2)。
// 2 次元の正規化の定数は σ = 10/(7πs²)(1 次元は 2/(3s)、3 次元は 1/(πs³))
export function cubicSpline(r, h) {
  const s = h / 2
  const q = r / s
  if (q >= 2) return 0
  const sigma = 10 / (7 * Math.PI * s * s)
  if (q < 1) return sigma * (1 - 1.5 * q * q + 0.75 * q * q * q)
  return sigma * 0.25 * (2 - q) * (2 - q) * (2 - q)
}
// @end

// 3 次スプライン核の勾配 ∇_r W(r = (dx, dy))。dW/dr·(dx, dy)/|r|。結果は out に書く
export function cubicSplineGrad(dx, dy, r, h, out = [0, 0]) {
  const s = h / 2
  const q = r / s
  if (q >= 2 || r === 0) {
    out[0] = 0
    out[1] = 0
    return out
  }
  const sigma = 10 / (7 * Math.PI * s * s)
  const dWdq = q < 1 ? -3 * q + 2.25 * q * q : -0.75 * (2 - q) * (2 - q)
  const c = (sigma * dWdq) / (s * r)
  out[0] = c * dx
  out[1] = c * dy
  return out
}

// ---------------------------------------------------------------- 近傍探索(一様なグリッド)

// @snippet sph-UniformGrid
// 領域 [0, width] × [0, height] を 1 辺 h のセルに区切り、粒子をセルごとにまとめて持つ。
// 計数ソートなので O(N)。セル c の粒子は cellItems[cellStart[c] … cellStart[c+1]) に並ぶ
export class UniformGrid {
  constructor(width, height, h, capacity = 0) {
    this.h = h
    this.nx = Math.max(1, Math.ceil(width / h))
    this.ny = Math.max(1, Math.ceil(height / h))
    this.cellStart = new Int32Array(this.nx * this.ny + 1)
    this.cellOf = new Int32Array(capacity) // 粒子 i が入っているセル
    this.cellItems = new Int32Array(capacity)
    this.pairs = new Int32Array(32 * capacity) // 近い組 [i0, j0, i1, j1, …](findPairs が詰める)
    this.pairCount = 0
    this.checked = 0 // 距離を調べた候補の数(総当たりなら N(N−1)/2)
  }

  // 位置 (x, y) のセルの番号。領域の外は端のセルに入れる
  cellIndex(x, y) {
    const cx = Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.h)))
    const cy = Math.min(this.ny - 1, Math.max(0, Math.floor(y / this.h)))
    return cx + this.nx * cy
  }

  // pos = [x0, y0, x1, y1, …] の先頭 n 粒子をセルに振り分ける: 数える → 累積和 → 後ろから並べる
  build(pos, n) {
    if (n > this.cellOf.length) {
      this.cellOf = new Int32Array(n)
      this.cellItems = new Int32Array(n)
    }
    const { cellStart, cellOf, cellItems } = this
    cellStart.fill(0)
    for (let i = 0; i < n; i++) {
      cellOf[i] = this.cellIndex(pos[2 * i], pos[2 * i + 1])
      cellStart[cellOf[i]]++
    }
    for (let c = 1; c < cellStart.length; c++) cellStart[c] += cellStart[c - 1]
    for (let i = n - 1; i >= 0; i--) cellItems[--cellStart[cellOf[i]]] = i // 並べ終えると cellStart[c] がセル c の先頭
  }
}
// @end

// @snippet sph-findPairs
// 距離が h より近い粒子の組 (i, j)(i < j)を grid.pairs に詰めて、組の数を返す(grid.build のあとに呼ぶ)。
// 自分のセルと隣の 8 セルの、あわせて 9 セルの粒子だけを調べる。セルの 1 辺が grid.h なので、
// h ≤ grid.h 以内の粒子は必ずこの 9 セルにいる。1 組を 1 回だけ数えるので、あとで両方の粒子に足し込める
export function findPairs(grid, pos, n, h = grid.h) {
  if (h > grid.h) throw new RangeError('h は grid.h 以下にする(隣のセルの外が調べられない)')
  const { nx, ny, cellStart, cellItems, cellOf } = grid
  const h2 = h * h
  let count = 0
  let checked = 0
  for (let i = 0; i < n; i++) {
    const xi = pos[2 * i]
    const yi = pos[2 * i + 1]
    const cx = cellOf[i] % nx
    const cy = (cellOf[i] - cx) / nx
    for (let gy = Math.max(cy - 1, 0); gy <= Math.min(cy + 1, ny - 1); gy++) {
      for (let gx = Math.max(cx - 1, 0); gx <= Math.min(cx + 1, nx - 1); gx++) {
        const c = gx + nx * gy
        for (let k = cellStart[c], end = cellStart[c + 1]; k < end; k++) {
          const j = cellItems[k]
          if (j <= i) continue
          checked++
          const dx = xi - pos[2 * j]
          const dy = yi - pos[2 * j + 1]
          if (dx * dx + dy * dy >= h2) continue
          if (2 * count + 2 > grid.pairs.length) growPairs(grid)
          grid.pairs[2 * count] = i
          grid.pairs[2 * count + 1] = j
          count++
        }
      }
    }
  }
  grid.pairCount = count
  grid.checked = checked
  return count
}
// @end

// 組の一覧が足りなくなったときだけ、2 倍の長さに作り直す
function growPairs(grid) {
  const bigger = new Int32Array(Math.max(1024, grid.pairs.length * 2))
  bigger.set(grid.pairs)
  grid.pairs = bigger
}

// 点 (x, y) から h より近い粒子の番号を out に詰めて、個数を返す(粒子 skip は除く)。
// out は十分な長さの Int32Array。grid.build のあとに呼ぶ
export function neighborsAt(grid, pos, x, y, h, out, skip = -1) {
  if (h > grid.h) throw new RangeError('h は grid.h 以下にする(隣のセルの外が調べられない)')
  const { nx, ny, cellStart, cellItems } = grid
  const cx = Math.min(nx - 1, Math.max(0, Math.floor(x / grid.h)))
  const cy = Math.min(ny - 1, Math.max(0, Math.floor(y / grid.h)))
  let count = 0
  for (let gy = Math.max(cy - 1, 0); gy <= Math.min(cy + 1, ny - 1); gy++) {
    for (let gx = Math.max(cx - 1, 0); gx <= Math.min(cx + 1, nx - 1); gx++) {
      const c = gx + nx * gy
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const j = cellItems[k]
        if (j === skip) continue
        const dx = x - pos[2 * j]
        const dy = y - pos[2 * j + 1]
        if (dx * dx + dy * dy < h * h) out[count++] = j
      }
    }
  }
  return count
}

// ---------------------------------------------------------------- 流体の 1 ステップ

// 粒子 n 個の状態を作る。領域は [0, width] × [0, height]、影響半径は h
export function createSphState(n, width, height, h) {
  return {
    n,
    width,
    height,
    pos: new Float64Array(2 * n),
    vel: new Float64Array(2 * n),
    force: new Float64Array(2 * n),
    rho: new Float64Array(n),
    pressure: new Float64Array(n),
    grid: new UniformGrid(width, height, h, n),
  }
}

// 粒子を格子状に並べる(左下が (x0, y0)、cols 列 × rows 行、間隔 spacing)。
// jitter > 0 なら、間隔の jitter 倍まで位置をずらす(rand() は 0 以上 1 未満の乱数)。並べた数を返す
export function fillBlock(state, x0, y0, cols, rows, spacing, jitter = 0, rand = Math.random) {
  let k = 0
  for (let r = 0; r < rows && k < state.n; r++) {
    for (let c = 0; c < cols && k < state.n; c++) {
      state.pos[2 * k] = x0 + (c + 0.5) * spacing + (rand() - 0.5) * jitter * spacing
      state.pos[2 * k + 1] = y0 + (r + 0.5) * spacing + (rand() - 0.5) * jitter * spacing
      state.vel[2 * k] = 0
      state.vel[2 * k + 1] = 0
      k++
    }
  }
  return k
}

// 間隔 spacing の正方格子に並べた粒子の、格子の内側での密度 m·ΣW(自分を含む)。
// 休止状態の密度 ρ0 はこの値にそろえる(そうしないと、並べただけで圧力がかかる)
export function restDensity(m, h, spacing) {
  const reach = Math.ceil(h / spacing)
  let sum = 0
  for (let a = -reach; a <= reach; a++) {
    for (let b = -reach; b <= reach; b++) {
      sum += poly6((a * a + b * b) * spacing * spacing, h)
    }
  }
  return m * sum
}

// @snippet sph-computeDensity
// 密度 ρ_i = Σ_j m·W_poly6(|x_i − x_j|, h)(自分自身も含む)。近い組 (i, j) ごとに、
// 同じ値を i にも j にも足す
export function computeDensity(state, params) {
  const { n, pos, rho, grid } = state
  const { m, h } = params
  const self = m * poly6(0, h)
  for (let i = 0; i < n; i++) rho[i] = self
  for (let q = 0; q < grid.pairCount; q++) {
    const i = grid.pairs[2 * q]
    const j = grid.pairs[2 * q + 1]
    const dx = pos[2 * i] - pos[2 * j]
    const dy = pos[2 * i + 1] - pos[2 * j + 1]
    const w = m * poly6(dx * dx + dy * dy, h)
    rho[i] += w
    rho[j] += w
  }
}
// @end

// @snippet sph-computePressure
// 状態方程式 p = k(ρ − ρ0)(Müller 2003)。密度が休止密度 ρ0 より大きいと押し返す。
// k は音速の 2 乗に当たり、大きいほど非圧縮に近いが、Δt を小さくしないと発散する
export function computePressure(state, params) {
  const { n, rho, pressure } = state
  const { k, rho0, minPressure = -Infinity } = params
  for (let i = 0; i < n; i++) pressure[i] = Math.max(minPressure, k * (rho[i] - rho0))
}
// @end

// @snippet sph-computeForces
// 圧力の力 F_i = −Σ_j m²(p_i/ρ_i² + p_j/ρ_j²)∇W_spiky(x_i − x_j)(Monaghan 1992 の対称な形)と、
// 粘性の力 F_i = μ Σ_j m²(v_j − v_i)/(ρ_i ρ_j)·∇²W_visc(Müller 2003)を state.force に集める。
// 組 (i, j) ごとに 1 回だけ計算して i に足し、j から引くので、力の総和はちょうど 0(運動量が保存する)
export function computeForces(state, params) {
  const { n, pos, vel, rho, pressure, force, grid } = state
  const { m, h, mu } = params
  force.fill(0, 0, 2 * n)
  for (let q = 0; q < grid.pairCount; q++) {
    const i = grid.pairs[2 * q]
    const j = grid.pairs[2 * q + 1]
    const dx = pos[2 * i] - pos[2 * j]
    const dy = pos[2 * i + 1] - pos[2 * j + 1]
    const r = Math.sqrt(dx * dx + dy * dy)
    spikyGrad(dx, dy, r, h, scratch)
    const a = -m * m * (pressure[i] / (rho[i] * rho[i]) + pressure[j] / (rho[j] * rho[j]))
    const b = (mu * m * m * viscLaplacian(r, h)) / (rho[i] * rho[j])
    const fx = a * scratch[0] + b * (vel[2 * j] - vel[2 * i])
    const fy = a * scratch[1] + b * (vel[2 * j + 1] - vel[2 * i + 1])
    force[2 * i] += fx
    force[2 * i + 1] += fy
    force[2 * j] -= fx
    force[2 * j + 1] -= fy
  }
}
// @end

// ポインタでかき混ぜる: 半径 radius の中の粒子の速度を、ポインタの速度 (vx, vy) に近づける。
// 中心ほど強く(強さ ∝ (1 − d/radius)²)、strength は 1 秒あたりの近づきやすさ。1 ステップで行き過ぎないように 1 で打ち切る
function applyStir(state, stir, dt) {
  const { n, pos, vel } = state
  const { x, y, vx, vy, radius, strength } = stir
  for (let i = 0; i < n; i++) {
    const dx = pos[2 * i] - x
    const dy = pos[2 * i + 1] - y
    const d2 = dx * dx + dy * dy
    if (d2 >= radius * radius) continue
    const t = 1 - Math.sqrt(d2) / radius
    const a = Math.min(1, strength * dt * t * t)
    vel[2 * i] += a * (vx - vel[2 * i])
    vel[2 * i + 1] += a * (vy - vel[2 * i + 1])
  }
}

// @snippet sph-reflectAtWalls
// 壁(領域 [0, width] × [0, height] の端)の外に出た粒子を内側に戻し、壁に向かう速度成分を
// −restitution 倍に反転して減衰させる(restitution=0 なら壁にぶつかって止まる)
export function reflectAtWalls(state, restitution) {
  const { n, pos, vel, width, height } = state
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 2; a++) {
      const k = 2 * i + a
      const limit = a === 0 ? width : height
      if (pos[k] < 0) {
        pos[k] = 0
        if (vel[k] < 0) vel[k] *= -restitution
      } else if (pos[k] > limit) {
        pos[k] = limit
        if (vel[k] > 0) vel[k] *= -restitution
      }
    }
  }
}
// @end

// @snippet sph-sphStep
// SPH の 1 ステップ。params = { m, h, k, rho0, mu, gravity: [gx, gy], restitution, minPressure, vmax, stir }
// (restitution 以降は省略できる)。近傍探索 → 密度 → 圧力 → 力 の順に求め、半陰的オイラー法
// (速度を先に更新し、新しい速度で位置を更新)で進めて、壁で跳ね返らせる。
// 壁には境界の粒子を置かないので、壁のそばは密度が低く出て、粒子が少し詰まる
export function sphStep(state, params, dt) {
  const { n, pos, vel, force, grid } = state
  const { m, h, restitution = 0.3, vmax = Infinity } = params
  const g = params.gravity || NO_GRAVITY
  grid.build(pos, n)
  findPairs(grid, pos, n, h)
  computeDensity(state, params)
  computePressure(state, params)
  computeForces(state, params)
  if (params.stir) applyStir(state, params.stir, dt)
  for (let i = 0; i < n; i++) {
    vel[2 * i] += dt * (force[2 * i] / m + g[0])
    vel[2 * i + 1] += dt * (force[2 * i + 1] / m + g[1])
    const speed2 = vel[2 * i] * vel[2 * i] + vel[2 * i + 1] * vel[2 * i + 1]
    if (speed2 > vmax * vmax) {
      vel[2 * i] *= vmax / Math.sqrt(speed2) // 速すぎる粒子は、ほかの粒子をすり抜けないように vmax で打ち切る
      vel[2 * i + 1] *= vmax / Math.sqrt(speed2)
    }
    pos[2 * i] += dt * vel[2 * i]
    pos[2 * i + 1] += dt * vel[2 * i + 1]
  }
  reflectAtWalls(state, restitution)
}
// @end

// 粒子の間隔 spacing(=0.02 m、水槽 2 m × 1 m に 1000〜2000 粒子)で動作を確かめた params を作る。
// 影響半径は間隔の 2.5 倍(近傍は約 20 粒子)、質量は面密度 1000 に合わせる。休止密度は格子の SPH 密度。
// 音速 √k = 10 m/s なので、Δt は sphMaxDt 以下にする。粘性 mu が小さいと、水柱が静まらず泡立つ
export function defaultSphParams(spacing, overrides = {}) {
  const h = 2.5 * spacing
  const m = 1000 * spacing * spacing
  return {
    m,
    h,
    rho0: restDensity(m, h, spacing),
    k: 100,
    mu: 8,
    gravity: [0, -9.8],
    restitution: 0.2,
    minPressure: 0, // 負の圧力(引き合い)を 0 に打ち切る。粒子が塊にならない
    vmax: 10,
    ...overrides,
  }
}

// 安定に進められる Δt の目安 0.3·h/√k(音が粒子 1 個ぶん進む時間の 0.3 倍)
export function sphMaxDt(params) {
  return (0.3 * params.h) / Math.sqrt(params.k)
}

// ---------------------------------------------------------------- 場の近似と勾配

// @snippet sph-sphInterpolate
// SPH の近似 φ(x) ≈ Σ_j V_j φ_j W(x_j − x, h)。点 (x, y) のまわりの粒子の和で、V は粒子 1 個が占める面積
export function sphInterpolate(x, y, pos, phi, n, V, h) {
  let sum = 0
  for (let j = 0; j < n; j++) {
    const r = Math.hypot(pos[2 * j] - x, pos[2 * j + 1] - y)
    sum += V * phi[j] * cubicSpline(r, h)
  }
  return sum
}
// @end

// @snippet sph-sphGradient
// 勾配 ∇φ(x) ≈ Σ_j V_j φ_j ∇W(x_j − x, h)。∇ は x についての微分。W を r = x_j − x の関数とみなして
// r で微分した ∇_r W とは符号が逆で、W が偶関数なので ∇_x W(x_j − x) = (∇_r W)(x − x_j)。
// cubicSplineGrad に渡す向きは x_j − x ではなく x − x_j(取り違えると勾配の符号が逆になる)
export function sphGradient(x, y, pos, phi, n, V, h, out = [0, 0]) {
  let gx = 0
  let gy = 0
  for (let j = 0; j < n; j++) {
    const dx = x - pos[2 * j]
    const dy = y - pos[2 * j + 1]
    cubicSplineGrad(dx, dy, Math.hypot(dx, dy), h, scratch)
    gx += V * phi[j] * scratch[0]
    gy += V * phi[j] * scratch[1]
  }
  out[0] = gx
  out[1] = gy
  return out
}
// @end

// MPS 法の重み w(r) = re/r − 1(0 < r < re)。r が 0 に近いほど大きい(Koshizuka and Oka 1996)
export function mpsWeight(r, re) {
  return r > 0 && r < re ? re / r - 1 : 0
}

// 基準の粒子数密度 n0 = Σ_j w(|x_j − x_i|)。粒子が一様に並んだ基準の状態での、1 つの粒子まわりの重みの和。
// 間隔 spacing の正方格子で計算する
export function mpsReferenceDensity(re, spacing) {
  const reach = Math.ceil(re / spacing)
  let sum = 0
  for (let a = -reach; a <= reach; a++) {
    for (let b = -reach; b <= reach; b++) {
      sum += mpsWeight(Math.hypot(a, b) * spacing, re)
    }
  }
  return sum
}

// @snippet sph-mpsGradient
// MPS 法の勾配 ∇φ_i = (d/n0) Σ_j (φ_j − φ_i)/|r_ij|²·r_ij·w(|r_ij|)(r_ij = x_j − x_i、d は次元)。
// φ が 1 次関数なら (φ_j − φ_i)r/|r|² = r̂r̂ᵀ∇φ で、粒子が等方的に並べば Σ w r̂r̂ᵀ = (n0/d)I になるので、
// 係数 d/n0 で勾配に戻る(核の形に条件は要らない)。粒子 i のまわりを pos の先頭 n 粒子から探す
export function mpsGradient(pos, phi, n, i, re, n0, out = [0, 0]) {
  const d = 2
  let gx = 0
  let gy = 0
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    const rx = pos[2 * j] - pos[2 * i]
    const ry = pos[2 * j + 1] - pos[2 * i + 1]
    const r2 = rx * rx + ry * ry
    const c = ((phi[j] - phi[i]) / r2) * mpsWeight(Math.sqrt(r2), re)
    gx += c * rx
    gy += c * ry
  }
  out[0] = (d / n0) * gx
  out[1] = (d / n0) * gy
  return out
}
// @end
`;export{n as default};
