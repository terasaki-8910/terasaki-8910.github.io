// 流れの可視化: 速度の場、流線・流跡線・流脈線の積分、LIC、出発点の置き方、特異点の分類(DOM に触れない純関数)。
// 場は関数 field(x, y, t) → [u, v](t は時間で変わる場だけが使う)。点は [x, y]。範囲 bounds は [x0, y0, x1, y1]。
// 出典: Hairer, Nørsett and Wanner, Solving ODEs I (1993)(ルンゲ-クッタ法) / Cabral and Leedom, SIGGRAPH '93 (1993)(LIC) /
// Jobard and Lefer, Visualization in Scientific Computing '97 (1997)(間隔をそろえた流線) /
// Helman and Hesselink, IEEE Computer 22(8) (1989)(ベクトル場のトポロジー) /
// Shadden, Lekien and Marsden, Physica D 212 (2005)(ダブルジャイヤー)

const inside = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]

// @snippet flow-eulerStep2
// オイラー法の 1 歩: いまの点の速度の向きに h だけ進む。x_{k+1} = x_k + h v(x_k)
export function eulerStep2(field, p, h, t = 0) {
  const v = field(p[0], p[1], t)
  return [p[0] + h * v[0], p[1] + h * v[1]]
}
// @end

// @snippet flow-rk4Step2
// 4 次のルンゲ-クッタ法の 1 歩: 進む前に、途中の点の向きを 3 回確かめ、4 つの傾きを 1:2:2:1 で平均して進む。
// k1 = v(x)、k2 = v(x + h/2 k1)、k3 = v(x + h/2 k2)、k4 = v(x + h k3)、x_{k+1} = x_k + h/6 (k1 + 2k2 + 2k3 + k4)
export function rk4Step2(field, p, h, t = 0) {
  const k1 = field(p[0], p[1], t)
  const k2 = field(p[0] + (h / 2) * k1[0], p[1] + (h / 2) * k1[1], t + h / 2)
  const k3 = field(p[0] + (h / 2) * k2[0], p[1] + (h / 2) * k2[1], t + h / 2)
  const k4 = field(p[0] + h * k3[0], p[1] + h * k3[1], t + h)
  return [
    p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
  ]
}
// @end

// @snippet flow-streamline
// 流線: どの点でも速度の向きを接線にもつ曲線。出発点から前向きと後ろ向きに 1 歩ずつ進めてつなぐ(時刻 t の場で、t は止めたまま)。
// 範囲の外に出るか、速さが minSpeed より小さくなったら止める
export function streamline(field, seed, { h = 0.01, maxSteps = 500, method = 'rk4', bounds, minSpeed = 1e-6, t = 0, direction = 'both' } = {}) {
  const step = method === 'euler' ? eulerStep2 : rk4Step2
  const trace = (sign) => {
    const pts = []
    let p = seed
    const f = (x, y) => {
      const v = field(x, y, t)
      return [sign * v[0], sign * v[1]]
    }
    for (let i = 0; i < maxSteps; i++) {
      const v = field(p[0], p[1], t)
      if (Math.hypot(v[0], v[1]) < minSpeed) break
      const q = step(f, p, h)
      if (bounds && !inside(q, bounds)) break
      pts.push(q)
      p = q
    }
    return pts
  }
  const forward = direction === 'backward' ? [] : trace(1)
  const backward = direction === 'forward' ? [] : trace(-1)
  return [...backward.reverse(), seed, ...forward]
}
// @end

// @snippet flow-pathline
// 流跡線: 粒子が実際に通った道。時刻とともに変わる場で dx/dt = v(x, t) を t0 から t1 まで進める
export function pathline(field, seed, t0, t1, h) {
  const pts = [seed]
  let p = seed
  for (let t = t0; t < t1 - 1e-12; t += h) {
    const dt = Math.min(h, t1 - t)
    p = rk4Step2(field, p, dt, t)
    pts.push(p)
  }
  return pts
}
// @end

// @snippet flow-streakline
// 流脈線: 1 点から流し続けた染料の線。t0 から t1 まで interval ごとに放した粒子の、時刻 t1 での位置を、放した順に並べる
export function streakline(field, seed, t0, t1, h, interval) {
  const pts = []
  for (let r = t0; r <= t1 + 1e-12; r += interval) {
    const path = pathline(field, seed, r, t1, h)
    pts.push(path[path.length - 1])
  }
  return pts
}
// @end

// @snippet flow-doubleGyre
// ダブルジャイヤー(Shadden ら 2005): [0, 2] × [0, 1] の 2 つの渦が、ε の大きさで左右に揺れる流れ。
// ψ = A sin(π f(x, t)) sin(π y)、f = a x² + b x(a = ε sin ωt、b = 1 − 2ε sin ωt)、u = −∂ψ/∂y、v = ∂ψ/∂x。ε = 0 なら時間で変わらない
export function doubleGyre({ A = 0.1, eps = 0.25, omega = (2 * Math.PI) / 10 } = {}) {
  return (x, y, t = 0) => {
    const a = eps * Math.sin(omega * t)
    const b = 1 - 2 * a
    const f = a * x * x + b * x
    const dfdx = 2 * a * x + b
    return [
      -Math.PI * A * Math.sin(Math.PI * f) * Math.cos(Math.PI * y),
      Math.PI * A * Math.cos(Math.PI * f) * Math.sin(Math.PI * y) * dfdx,
    ]
  }
}
// @end

// 回転の場 v = ω(−y, x)(流線は原点を中心とする円)
export function rotationField(omega = 1) {
  return (x, y) => [-omega * y, omega * x]
}

// @snippet flow-vortexField
// 渦の場: 中心のまわりを回る流れ(中心の近くで速さが 0 に戻るよう、芯の大きさ core でならした形)と、一様な流れの和。
// 渦 1 つの回る速さは v_θ = Γ/(2πr) (1 − e^{−r²/core²})
export function vortexField(vortices, uniform = [0, 0]) {
  return (x, y) => {
    let u = uniform[0]
    let v = uniform[1]
    for (const { x: cx, y: cy, strength, core = 0.1 } of vortices) {
      const dx = x - cx
      const dy = y - cy
      const r2 = dx * dx + dy * dy
      if (r2 < 1e-12) continue
      const k = (strength / (2 * Math.PI * r2)) * (1 - Math.exp(-r2 / (core * core)))
      u += -k * dy
      v += k * dx
    }
    return [u, v]
  }
}
// @end

// 格子の速度(grid.js と同じ並び: k = i + n·j、マスの中心が ((i + 0.5)dx, (j + 0.5)dx))を双線形補間した場。周期境界
export function gridField(u, v, n, dx) {
  return (x, y) => {
    const gx = x / dx - 0.5
    const gy = y / dx - 0.5
    const i0 = Math.floor(gx)
    const j0 = Math.floor(gy)
    const a = gx - i0
    const b = gy - j0
    const w = (i) => ((i % n) + n) % n
    const i1 = w(i0 + 1)
    const j1 = w(j0 + 1)
    const ia = w(i0)
    const ja = w(j0)
    const at = (q, i, j) => q[i + n * j]
    const lerp2 = (q) => (1 - b) * ((1 - a) * at(q, ia, ja) + a * at(q, i1, ja)) + b * ((1 - a) * at(q, ia, j1) + a * at(q, i1, j1))
    return [lerp2(u), lerp2(v)]
  }
}

// @snippet flow-lic
// LIC(線積分たたみ込み): 各画素から、その点を通る流線を前後に L 歩(1 歩は画素 step 個分。速さによらず同じ長さ)たどり、
// 通った所のノイズの値を平均する。I(x) = (1/(2L + 1)) Σ_{k=−L}^{L} N(σ_x(k h))。流れの向きに伸びた筋の模様になる
export function lic(field, noise, w, h, L, { bounds = [0, 0, 1, 1], step = 1, t = 0 } = {}) {
  const out = new Float32Array(w * h)
  const sx = (bounds[2] - bounds[0]) / w
  const sy = (bounds[3] - bounds[1]) / h
  const hs = step * Math.min(sx, sy)
  const sample = (x, y) => {
    const i = Math.floor((x - bounds[0]) / sx)
    const j = Math.floor((bounds[3] - y) / sy) // 行 0 が上(y が大きい側)
    if (i < 0 || j < 0 || i >= w || j >= h) return null
    return noise[j * w + i]
  }
  const dirAt = (x, y) => {
    const v = field(x, y, t)
    const len = Math.hypot(v[0], v[1])
    return len < 1e-12 ? null : [v[0] / len, v[1] / len]
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x0 = bounds[0] + (i + 0.5) * sx
      const y0 = bounds[3] - (j + 0.5) * sy
      let sum = noise[j * w + i]
      let count = 1
      for (const sign of [1, -1]) {
        let x = x0
        let y = y0
        for (let k = 0; k < L; k++) {
          const d1 = dirAt(x, y)
          if (!d1) break
          // 中点法(2 次のルンゲ-クッタ)で 1 歩
          const d2 = dirAt(x + 0.5 * sign * hs * d1[0], y + 0.5 * sign * hs * d1[1]) ?? d1
          x += sign * hs * d2[0]
          y += sign * hs * d2[1]
          const n = sample(x, y)
          if (n === null) break
          sum += n
          count++
        }
      }
      out[j * w + i] = sum / count
    }
  }
  return out
}
// @end

// @snippet flow-seedsUniform
// 出発点を格子に均等に並べる(nx × ny 個、マスの中心)
export function seedsUniform(nx, ny, bounds) {
  const out = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      out.push([bounds[0] + ((i + 0.5) * (bounds[2] - bounds[0])) / nx, bounds[1] + ((j + 0.5) * (bounds[3] - bounds[1])) / ny])
    }
  }
  return out
}
// @end

// @snippet flow-seedsByMagnitude
// 速さに合わせて出発点を置く: 点をでたらめに選び、速さ |v| / (最大の速さ) の確率で残す(棄却法)。
// 速い所ほど多く残る。確率は p(x) = |v(x)| / ∫|v| dA に比例
export function seedsByMagnitude(field, count, bounds, rand, t = 0) {
  let vmax = 0
  for (const p of seedsUniform(24, 24, bounds)) vmax = Math.max(vmax, Math.hypot(...field(p[0], p[1], t)))
  const out = []
  let tries = 0
  while (out.length < count && tries < count * 200) {
    tries++
    const x = bounds[0] + rand() * (bounds[2] - bounds[0])
    const y = bounds[1] + rand() * (bounds[3] - bounds[1])
    if (rand() * vmax <= Math.hypot(...field(x, y, t))) out.push([x, y])
  }
  return out
}
// @end

// @snippet flow-evenlySpacedStreamlines
// 間隔をそろえた流線(Jobard and Lefer の考えを簡単にした形): 出発点の候補を順に試し、すでにある流線から dsep 未満の候補は捨てる。
// 流線は、ほかの流線に dsep/2 より近づいたら止める。近さは 1 辺 dsep/2 のマスで調べる
export function evenlySpacedStreamlines(field, bounds, dsep, { h = dsep / 4, maxSteps = 400, t = 0 } = {}) {
  const cell = dsep / 2
  const cols = Math.ceil((bounds[2] - bounds[0]) / cell) + 1
  const rows = Math.ceil((bounds[3] - bounds[1]) / cell) + 1
  const grid = new Map()
  const key = (p) => Math.floor((p[0] - bounds[0]) / cell) + cols * Math.floor((p[1] - bounds[1]) / cell)
  const near = (p, d, owner) => {
    const ci = Math.floor((p[0] - bounds[0]) / cell)
    const cj = Math.floor((p[1] - bounds[1]) / cell)
    const r = Math.ceil(d / cell)
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const list = grid.get(ci + di + cols * (cj + dj))
        if (!list) continue
        for (const q of list) if (q.owner !== owner && Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < d) return true
      }
    }
    return false
  }
  const lines = []
  for (const seed of seedsUniform(Math.max(1, Math.round((bounds[2] - bounds[0]) / dsep)), Math.max(1, Math.round((bounds[3] - bounds[1]) / dsep)), bounds)) {
    if (near(seed, dsep, -1)) continue
    const owner = lines.length
    const line = [seed]
    for (const sign of [1, -1]) {
      let p = seed
      const f = (x, y) => {
        const v = field(x, y, t)
        return [sign * v[0], sign * v[1]]
      }
      for (let i = 0; i < maxSteps; i++) {
        const v = field(p[0], p[1], t)
        if (Math.hypot(v[0], v[1]) < 1e-6) break
        const q = rk4Step2(f, p, h / Math.max(1e-6, Math.hypot(v[0], v[1])))
        if (!inside(q, bounds) || near(q, dsep / 2, owner)) break
        if (sign > 0) line.push(q)
        else line.unshift(q)
        p = q
      }
    }
    if (line.length < 3) continue
    for (const p of line) {
      const k = key(p)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push({ p, owner })
    }
    lines.push(line)
  }
  return lines
}
// @end

// @snippet flow-jacobian2
// ヤコビ行列 J = ∂v/∂x(速度の変化の仕方)。中心差分で [[∂u/∂x, ∂u/∂y], [∂v/∂x, ∂v/∂y]]
export function jacobian2(field, p, h = 1e-4, t = 0) {
  const ax = field(p[0] + h, p[1], t)
  const bx = field(p[0] - h, p[1], t)
  const ay = field(p[0], p[1] + h, t)
  const by = field(p[0], p[1] - h, t)
  return [
    [(ax[0] - bx[0]) / (2 * h), (ay[0] - by[0]) / (2 * h)],
    [(ax[1] - bx[1]) / (2 * h), (ay[1] - by[1]) / (2 * h)],
  ]
}
// @end

// @snippet flow-classifyCriticalPoint
// 特異点(速度 0 の点)の種類: J の固有値 λ = (tr J ± √((tr J)² − 4 det J))/2 で決まる。
// det < 0 なら鞍点。det > 0 で実数(tr² ≥ 4det)なら tr > 0 で湧き出し、tr < 0 で吸い込み。
// 複素数(tr² < 4det)なら tr = 0 で渦心、tr > 0 で外へのらせん、tr < 0 で内へのらせん
export function classifyCriticalPoint(J, eps = 1e-9) {
  const tr = J[0][0] + J[1][1]
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
  const disc = tr * tr - 4 * det
  const eigenvalues = disc >= 0
    ? [{ re: (tr + Math.sqrt(disc)) / 2, im: 0 }, { re: (tr - Math.sqrt(disc)) / 2, im: 0 }]
    : [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }, { re: tr / 2, im: -Math.sqrt(-disc) / 2 }]
  let type
  if (det < -eps) type = 'saddle'
  else if (disc >= 0) type = tr > 0 ? 'source' : 'sink'
  else if (Math.abs(tr) <= eps) type = 'center'
  else type = tr > 0 ? 'spiral-out' : 'spiral-in'
  return { type, eigenvalues, trace: tr, det }
}
// @end

// @snippet flow-findCriticalPoints
// 特異点を探す: n × n のマスのうち、4 隅で u の符号も v の符号も変わるマスを候補にし、ニュートン法(J の逆行列)で詰める。
// 近すぎる点はまとめ、種類も付けて返す
export function findCriticalPoints(field, bounds, n, t = 0) {
  const out = []
  const cw = (bounds[2] - bounds[0]) / n
  const ch = (bounds[3] - bounds[1]) / n
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = bounds[0] + i * cw
      const y0 = bounds[1] + j * ch
      const c = [field(x0, y0, t), field(x0 + cw, y0, t), field(x0, y0 + ch, t), field(x0 + cw, y0 + ch, t)]
      const su = new Set(c.map((v) => sign(v[0])))
      const sv = new Set(c.map((v) => sign(v[1])))
      if (su.size < 2 || sv.size < 2) continue
      let p = [x0 + cw / 2, y0 + ch / 2]
      let ok = false
      for (let it = 0; it < 20; it++) {
        const v = field(p[0], p[1], t)
        const J = jacobian2(field, p, Math.min(cw, ch) * 1e-3, t)
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
        if (Math.abs(det) < 1e-14) break
        const dx = (J[1][1] * v[0] - J[0][1] * v[1]) / det
        const dy = (-J[1][0] * v[0] + J[0][0] * v[1]) / det
        p = [p[0] - dx, p[1] - dy]
        if (Math.hypot(dx, dy) < 1e-10) {
          ok = true
          break
        }
      }
      if (!ok || !inside(p, bounds)) continue
      if (out.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 0.5 * Math.min(cw, ch))) continue
      out.push({ p, ...classifyCriticalPoint(jacobian2(field, p, Math.min(cw, ch) * 1e-3, t)) })
    }
  }
  return out
}
// @end
