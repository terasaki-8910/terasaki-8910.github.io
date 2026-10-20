// 格子(オイラー)法で流体の方程式の各項を調べるための部品(DOM に触れない純関数、依存ライブラリなし)。
// 1 次元の配列は u[i]、2 次元の n×n の格子は Float64Array に u[i + n*j](i が x、j が y)で持つ。
// 2 次元の格子はすべて周期境界(端は反対側の端につながる)で、微分は中心差分で書く。
// 出典: Stam, "Stable Fluids", SIGGRAPH 1999(operator splitting と圧力の射影)/
// Fedkiw, Stam, Jensen, "Visual Simulation of Smoke", SIGGRAPH 2001(渦度強制)/
// Osher, Fedkiw, Level Set Methods and Dynamic Implicit Surfaces, Springer, 2003(風上差分とレベルセット)

// @snippet grid-diffuse1D
// 拡散項 ∂u/∂t = ν ∂²u/∂x² の 1 ステップ(周期境界、前進オイラー)。
// 2 階微分を (u[i+1] − 2u[i] + u[i−1])/Δx² に置き換えると、更新は
//   u[i] + 2a·((u[i+1] + u[i−1])/2 − u[i])、a = νΔt/Δx²
// で「両隣の平均との差」だけ近づく。a ≤ 1/2 でないと発散する。out は u と別の配列
export function diffuse1D(u, nu, dx, dt, out = new Float64Array(u.length)) {
  const n = u.length
  const a = (nu * dt) / (dx * dx)
  for (let i = 0; i < n; i++) {
    const left = u[i === 0 ? n - 1 : i - 1]
    const right = u[i === n - 1 ? 0 : i + 1]
    out[i] = u[i] + a * (left - 2 * u[i] + right)
  }
  return out
}
// @end

// @snippet grid-advectSemiLagrangian1D
// x_i = i·Δx から c·Δt だけさかのぼり、両側の値を線形補間する。
// 格子の外では最初・最後の値を使う。CFL 数が 1 を超えても元の値の範囲に収まる。out は phi と別の配列。
export function advectSemiLagrangian1D(phi, c, dx, dt, out = new Float64Array(phi.length)) {
  if (out === phi) throw new Error('out must be a separate array')
  const n = phi.length
  for (let i = 0; i < n; i++) {
    const x = Math.max(0, Math.min(n - 1, i - c * dt / dx))
    const left = Math.floor(x), right = Math.min(n - 1, left + 1)
    const a = x - left
    out[i] = (1 - a) * phi[left] + a * phi[right]
  }
  return out
}
// @end

// @snippet grid-advectUpwind1D
// 移流方程式 ∂φ/∂t + c ∂φ/∂x = 0 の 1 ステップ(風上差分)。
// 情報は流れの上流から来るので、c>0 なら左側の差分 (φ[i] − φ[i−1])/Δx、c<0 なら右側の差分を使う。
// 流れ込む側の端の値は動かさない。CFL 数 |c|Δt/Δx ≤ 1 で安定で、= 1 なら厳密に 1 マスずれる。out は phi と別の配列
export function advectUpwind1D(phi, c, dx, dt, out = new Float64Array(phi.length)) {
  const n = phi.length
  const k = (c * dt) / dx
  if (c >= 0) {
    out[0] = phi[0]
    for (let i = 1; i < n; i++) out[i] = phi[i] - k * (phi[i] - phi[i - 1])
  } else {
    out[n - 1] = phi[n - 1]
    for (let i = 0; i < n - 1; i++) out[i] = phi[i] - k * (phi[i + 1] - phi[i])
  }
  return out
}
// @end

// @snippet grid-zeroCrossings1D
// φ の符号が変わる区間を直線で補間して、φ = 0 の位置(液体の表面)を返す。phi[i] は x0 + i·Δx での値
export function zeroCrossings1D(phi, x0, dx) {
  const xs = []
  for (let i = 0; i + 1 < phi.length; i++) {
    if ((phi[i] < 0) !== (phi[i + 1] < 0)) {
      xs.push(x0 + (i + phi[i] / (phi[i] - phi[i + 1])) * dx)
    }
  }
  return xs
}
// @end

// @snippet grid-reynolds
// レイノルズ数 Re = uL/ν。移流項の大きさ U²/L と拡散項の大きさ νU/L² の比で、単位のない数
export function reynolds(u, L, nu) {
  return (u * L) / nu
}
// @end

// @snippet grid-centralDiff
// 中心差分 (f(x+h) − f(x−h)) / 2h。テイラー展開で偶数次が消えて、誤差は h²f'''/6 から始まる(h に 2 次)
export function centralDiff(f, x, h) {
  return (f(x + h) - f(x - h)) / (2 * h)
}
// @end

// @snippet grid-forwardDiff
// 前進差分 (f(x+h) − f(x)) / h。誤差は h·f''/2 から始まる(h に 1 次)
export function forwardDiff(f, x, h) {
  return (f(x + h) - f(x)) / h
}
// @end

// @snippet grid-divergence2D
// 速度場の発散 ∂u/∂x + ∂v/∂y(中心差分、周期境界)
export function divergence2D(u, v, n, dx, out = new Float64Array(n * n)) {
  for (let j = 0; j < n; j++) {
    const jm = (j === 0 ? n - 1 : j - 1) * n
    const jp = (j === n - 1 ? 0 : j + 1) * n
    for (let i = 0; i < n; i++) {
      const im = i === 0 ? n - 1 : i - 1
      const ip = i === n - 1 ? 0 : i + 1
      out[i + n * j] = (u[ip + n * j] - u[im + n * j] + v[i + jp] - v[i + jm]) / (2 * dx)
    }
  }
  return out
}
// @end

// @snippet grid-vorticity2D
// 2 次元の渦度 ω = ∂v/∂x − ∂u/∂y(ω=(0,0,ω_z) の z 成分。反時計回りが正)
export function vorticity2D(u, v, n, dx, out = new Float64Array(n * n)) {
  for (let j = 0; j < n; j++) {
    const jm = (j === 0 ? n - 1 : j - 1) * n
    const jp = (j === n - 1 ? 0 : j + 1) * n
    for (let i = 0; i < n; i++) {
      const im = i === 0 ? n - 1 : i - 1
      const ip = i === n - 1 ? 0 : i + 1
      out[i + n * j] = (v[ip + n * j] - v[im + n * j] - u[i + jp] + u[i + jm]) / (2 * dx)
    }
  }
  return out
}
// @end

// @snippet grid-poissonResidual
// ポアソン方程式 ∇·∇q = ∇·u の残差 ∇·u − ∇·∇q の絶対値の最大。∇·∇q は中心差分を 2 回かけた形で、
// 2 マス離れた点を使う (q[i+2] − 2q[i] + q[i−2])/(4Δx²) を x と y で足したもの
export function poissonResidual(q, div, n, dx) {
  let worst = 0
  for (let j = 0; j < n; j++) {
    const jm = ((j + n - 2) % n) * n
    const jp = ((j + 2) % n) * n
    for (let i = 0; i < n; i++) {
      const im = (i + n - 2) % n
      const ip = (i + 2) % n
      const k = i + n * j
      const lap = (q[im + n * j] + q[ip + n * j] + q[i + jm] + q[i + jp] - 4 * q[k]) / (4 * dx * dx)
      worst = Math.max(worst, Math.abs(div[k] - lap))
    }
  }
  return worst
}
// @end

// @snippet grid-projectPeriodic2D
// 圧力の段: 速度場 (u, v) から発散を取り除く(その場で書き換える)。u' = u − (Δt/ρ)∇p で ∇·u' = 0 にするには
// ∇²p = (ρ/Δt)∇·u を解けばよい。q = Δt·p/ρ として ∇²q = ∇·u を解き、u' = u − ∇q。
// ∇·u と ∇q は中心差分で、∇² はその合成 ∇·∇ に一致させる(2 マス離れた点を使う差分)。
// 隣どうしの 5 点の差分だと合成と一致せず、市松模様に近い細かい成分の発散が残る
// (MAC 格子は速度を面に置いて、これを避けるもう 1 つの方法)。一致させたので、解けば発散は 0 になる。
// ガウス・ザイデル法で、残差(= 射影後の発散)の最大値が初めの発散の最大値の tol 倍以下になるか、
// iterations 回に達するまで解く。tol=0 なら指定回数を必ず実行する。n ≥ 4。{ q, iterations: 使った回数 } を返す
export function projectPeriodic2D(u, v, n, dx, iterations, tol = 1e-10) {
  const div = divergence2D(u, v, n, dx)
  const q = new Float64Array(n * n)
  let target = 0
  for (let k = 0; k < n * n; k++) target = Math.max(target, tol * Math.abs(div[k]))
  let used = 0
  while (used < iterations && (tol === 0 || poissonResidual(q, div, n, dx) > target)) {
    for (let j = 0; j < n; j++) {
      const jm = ((j + n - 2) % n) * n
      const jp = ((j + 2) % n) * n
      for (let i = 0; i < n; i++) {
        const k = i + n * j
        const sum = q[((i + n - 2) % n) + n * j] + q[((i + 2) % n) + n * j] + q[i + jm] + q[i + jp]
        q[k] = (sum - 4 * dx * dx * div[k]) / 4 // 求めたばかりの値をすぐ使う
      }
    }
    used++
  }
  for (let j = 0; j < n; j++) {
    const jm = (j === 0 ? n - 1 : j - 1) * n
    const jp = (j === n - 1 ? 0 : j + 1) * n
    for (let i = 0; i < n; i++) {
      const im = i === 0 ? n - 1 : i - 1
      const ip = i === n - 1 ? 0 : i + 1
      u[i + n * j] -= (q[ip + n * j] - q[im + n * j]) / (2 * dx)
      v[i + n * j] -= (q[i + jp] - q[i + jm]) / (2 * dx)
    }
  }
  return { q, iterations: used }
}
// @end

// @snippet grid-vorticityConfinement2D
// 渦度強制力 F = ε h (N × ω)(h は格子の間隔)。2 次元では ω = (0, 0, ω) なので N × ω = (N_y ω, −N_x ω)。
// N = ∇|ω| / |∇|ω||(渦度の大きいほう、つまり渦の中心を向く単位ベクトル)。
// F は渦の回る向きに働き、数値計算でなまった渦を元に戻す。{ fx, fy } を返す
export function vorticityConfinement2D(u, v, n, dx, eps) {
  const w = vorticity2D(u, v, n, dx)
  const fx = new Float64Array(n * n)
  const fy = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    const jm = (j === 0 ? n - 1 : j - 1) * n
    const jp = (j === n - 1 ? 0 : j + 1) * n
    for (let i = 0; i < n; i++) {
      const im = i === 0 ? n - 1 : i - 1
      const ip = i === n - 1 ? 0 : i + 1
      const k = i + n * j
      const gx = (Math.abs(w[ip + n * j]) - Math.abs(w[im + n * j])) / (2 * dx)
      const gy = (Math.abs(w[i + jp]) - Math.abs(w[i + jm])) / (2 * dx)
      const len = Math.hypot(gx, gy) + 1e-20 // 勾配が 0 なら N = 0 で、力も 0
      fx[k] = eps * dx * (gy / len) * w[k]
      fy[k] = -eps * dx * (gx / len) * w[k]
    }
  }
  return { fx, fy }
}
// @end

// @snippet grid-advectSemiLagrangian2D
// 各マスの中心から速度×Δt だけさかのぼり、周囲 4 点の q を双線形補間する(周期境界)。
// out は q・u・v と重ならない配列。中心の半マス分は出発点と補間の座標で相殺する。
export function advectSemiLagrangian2D(q, u, v, n, dx, dt, out) {
  if (out === q || out === u || out === v) throw new Error('out must be a separate array')
  const step = dt / dx
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = i + n * j
      const x = ((i - step * u[k]) % n + n) % n
      const y = ((j - step * v[k]) % n + n) % n
      const i0 = Math.floor(x), j0 = Math.floor(y)
      const i1 = (i0 + 1) % n, j1 = (j0 + 1) % n
      const a = x - i0, b = y - j0
      out[k] = (1 - b) * ((1 - a) * q[i0 + n * j0] + a * q[i1 + n * j0])
        + b * ((1 - a) * q[i0 + n * j1] + a * q[i1 + n * j1])
    }
  }
  return out
}
// @end

// @snippet grid-diffuse2D
// 粘性の 1 ステップ(周期境界、5 点のラプラシアン、陽解法)。安定条件は νΔt/Δx² ≤ 1/4。
// out は q と別の配列。
export function diffuse2D(q, nu, dx, dt, n, out) {
  const a = nu * dt / (dx * dx)
  for (let j = 0; j < n; j++) {
    const jm = ((j + n - 1) % n) * n, jp = ((j + 1) % n) * n
    for (let i = 0; i < n; i++) {
      const k = i + n * j
      out[k] = q[k] + a * (q[(i + n - 1) % n + n * j] + q[(i + 1) % n + n * j]
        + q[i + jm] + q[i + jp] - 4 * q[k])
    }
  }
  return out
}
// @end

// @snippet grid-addSplat2D
// (x, y) のまわりにガウス型の山を足す。距離は周期境界で最短のもの、マスの中心は (i+0.5)Δx。
export function addSplat2D(field, n, dx, x, y, radius, amount) {
  const L = n * dx
  x = (x % L + L) % L
  y = (y % L + L) % L
  for (let j = 0; j < n; j++) {
    const sy = Math.abs((j + 0.5) * dx - y)
    const dy = Math.min(sy, L - sy)
    for (let i = 0; i < n; i++) {
      const sx = Math.abs((i + 0.5) * dx - x)
      const ddx = Math.min(sx, L - sx)
      field[i + n * j] += amount * Math.exp(-(ddx * ddx + dy * dy) / (radius * radius))
    }
  }
  return field
}
// @end

// @snippet grid-fluidSubstep2D
// 移流・粘性・圧力のうち stage で指定した 1 段だけを進める。
// 移流は 3 つとも開始時の速度を使う。作業用配列と戻り値は state に保ち、次のステップでも使う。
// 圧力の段は反復回数と前後の発散を返す。project=false のときは速度を変えずに発散だけ調べる。
export function fluidSubstep2D(state, { dt, nu, iterations, project = true }, stage) {
  if (!['advect', 'diffuse', 'project'].includes(stage)) throw new Error('unknown fluid stage')
  const { n, dx, u, v, dye } = state
  if (!state.scratch || state.scratch.u.length !== n * n) {
    state.scratch = {
      u: new Float64Array(n * n), v: new Float64Array(n * n), dye: new Float64Array(n * n),
      div: new Float64Array(n * n), result: { iterations: 0, divergenceBefore: 0, divergenceAfter: 0 },
    }
  }
  const s = state.scratch
  if (stage === 'advect') {
    advectSemiLagrangian2D(u, u, v, n, dx, dt, s.u)
    advectSemiLagrangian2D(v, u, v, n, dx, dt, s.v)
    advectSemiLagrangian2D(dye, u, v, n, dx, dt, s.dye)
    u.set(s.u); v.set(s.v); dye.set(s.dye)
    return
  }
  if (stage === 'diffuse') {
    if (nu !== 0) {
      diffuse2D(u, nu, dx, dt, n, s.u)
      diffuse2D(v, nu, dx, dt, n, s.v)
      u.set(s.u); v.set(s.v)
    }
    return
  }
  divergence2D(u, v, n, dx, s.div)
  let before = 0
  for (let k = 0; k < s.div.length; k++) before = Math.max(before, Math.abs(s.div[k]))
  s.result.iterations = project ? projectPeriodic2D(u, v, n, dx, iterations).iterations : 0
  divergence2D(u, v, n, dx, s.div)
  let after = 0
  for (let k = 0; k < s.div.length; k++) after = Math.max(after, Math.abs(s.div[k]))
  s.result.divergenceBefore = before
  s.result.divergenceAfter = after
  return s.result
}
// @end

// @snippet grid-fluidStep2D
// 1 ステップを移流 → 粘性 → 圧力に分ける。外力は呼ぶ前に足す。
// 各項のスイッチが false ならその計算だけを省き、最後に前後の発散を返す。
export function fluidStep2D(state, params) {
  if (params.advect !== false) fluidSubstep2D(state, params, 'advect')
  if (params.diffuse !== false) fluidSubstep2D(state, params, 'diffuse')
  return fluidSubstep2D(state, params, 'project')
}
// @end
