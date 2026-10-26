// ボリュームレンダリング: 光線に沿った吸収と発光、区切った合成、伝達関数、光線の追跡(DOM に触れない純関数)。
// 光線のサンプルは目に近い順(番号 0 がいちばん手前)。色は [r, g, b](0〜1)。
// ボリュームは nx × ny × nz の格子の値(values[i + nx * (j + ny * k)])で、世界の箱 [−1, 1]³ に置く。
// 出典: Kajiya and Von Herzen, SIGGRAPH '84 (1984) / Levoy, IEEE CG&A 8(3) (1988) /
// Drebin, Carpenter and Hanrahan, SIGGRAPH '88 (1988) / Max, IEEE TVCG 1(2) (1995) / Engel et al., Real-Time Volume Graphics (2006)
import { SHEPP_LOGAN } from './ct.js'

// @snippet volume-transmittance
// 透過率: 吸収の大きさ σ が区間ごとに一定(幅 Δs)なら、光の残る割合は τ = exp(−Σ σ_i Δs)。
// dI/ds = −σ I を解いた I = I_0 exp(−∫σ ds) を、区切って足したもの
export function transmittance(sigmas, ds) {
  let s = 0
  for (const sigma of sigmas) s += sigma * ds
  return Math.exp(-s)
}
// @end

// @snippet volume-emissionAbsorption
// 発光と吸収: 区間 i が出す光 L_e,i は、その区間で 1 − e^{−σ_i Δs} の割合だけ目の向きに出て、
// 手前の区間の透過率をかけて届く。全部の区間の分と、弱まった背景の光 L_0 を足す。
// σ・L_e が一定なら、ちょうど L = L_e (1 − e^{−σ s}) + L_0 e^{−σ s}(式を区切っても誤差がない形)
export function emissionAbsorption(sigmas, emissions, ds, background) {
  let L = 0
  let T = 1
  for (let i = 0; i < sigmas.length; i++) {
    const a = 1 - Math.exp(-sigmas[i] * ds)
    L += T * a * emissions[i]
    T *= 1 - a
  }
  return L + T * background
}
// @end

// @snippet volume-alphaFromSigma
// 区間 1 つの不透明度 α = 1 − e^{−σΔs}(光がその区間でさえぎられる割合)
export function alphaFromSigma(sigma, ds) {
  return 1 - Math.exp(-sigma * ds)
}
// @end

// @snippet volume-compositeFrontToBack
// 前から順の合成: まだ透けて見えている割合 (1 − A) をかけて色を足す。
// C ← C + (1 − A) α_i c_i、A ← A + (1 − A) α_i。A が stopAt を超えたら先は見えないので打ち切る
export function compositeFrontToBack(colors, alphas, { stopAt = 1 } = {}) {
  const C = [0, 0, 0]
  let A = 0
  let used = 0
  for (let i = 0; i < alphas.length; i++) {
    if (A >= stopAt) break
    const w = (1 - A) * alphas[i]
    C[0] += w * colors[i][0]
    C[1] += w * colors[i][1]
    C[2] += w * colors[i][2]
    A += w
    used++
  }
  return { color: C, alpha: A, used }
}
// @end

// @snippet volume-compositeBackToFront
// 後ろから順の合成: 奥から 1 枚ずつ重ねる。C ← α_i c_i + (1 − α_i) C(半透明の板を重ねる描き方と同じ)
export function compositeBackToFront(colors, alphas) {
  const C = [0, 0, 0]
  let T = 1
  for (let i = alphas.length - 1; i >= 0; i--) {
    const a = alphas[i]
    C[0] = a * colors[i][0] + (1 - a) * C[0]
    C[1] = a * colors[i][1] + (1 - a) * C[1]
    C[2] = a * colors[i][2] + (1 - a) * C[2]
    T *= 1 - a
  }
  return { color: C, alpha: 1 - T }
}
// @end

// @snippet volume-opacityCorrection
// 不透明度の補正: 基準の間隔 Δs₀ で決めた α を、間隔 Δs で使うときは α′ = 1 − (1 − α)^{Δs/Δs₀}。
// 間隔を半分にして 2 回重ねると、元の 1 回と同じだけさえぎる
export function opacityCorrection(alpha, ds, ds0) {
  return 1 - (1 - alpha) ** (ds / ds0)
}
// @end

// @snippet volume-transferFunction
// 伝達関数: 値 f ごとに不透明度 α と色の位置 t(0〜1)を決める表。点の間は線形補間(区分線形)、外は端の値。
// points は値の小さい順の [{ value, alpha, t }]
export function transferFunction(points, value) {
  if (value <= points[0].value) return { alpha: points[0].alpha, t: points[0].t }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (value <= b.value) {
      const u = b.value === a.value ? 1 : (value - a.value) / (b.value - a.value)
      return { alpha: a.alpha + u * (b.alpha - a.alpha), t: a.t + u * (b.t - a.t) }
    }
  }
  const last = points[points.length - 1]
  return { alpha: last.alpha, t: last.t }
}
// @end

// @snippet volume-rayBox
// 光線 origin + t·dir と、軸に平行な箱 [min, max] の交わる区間 [tNear, tFar](スラブ法: 軸ごとに入る t と出る t を求め、
// 入るのはいちばん遅い t、出るのはいちばん早い t)。交わらないか、箱が後ろなら null
export function rayBox(origin, dir, min, max) {
  let tNear = -Infinity
  let tFar = Infinity
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-12) {
      if (origin[a] < min[a] || origin[a] > max[a]) return null
      continue
    }
    let t0 = (min[a] - origin[a]) / dir[a]
    let t1 = (max[a] - origin[a]) / dir[a]
    if (t0 > t1) [t0, t1] = [t1, t0]
    tNear = Math.max(tNear, t0)
    tFar = Math.min(tFar, t1)
  }
  if (tNear > tFar || tFar < 0) return null
  return [Math.max(0, tNear), tFar]
}
// @end

// 世界の座標 (x, y, z)(箱 [−1, 1]³)のボリュームの値。格子の点のあいだは 3 重線形補間(isosurface.js の trilinear と同じ式を、
// 画素ごとに配列を作らないよう展開したもの)
export function sampleVolume(volume, n, x, y, z) {
  const s = (n - 1) / 2
  const gx = Math.min(n - 1, Math.max(0, (x + 1) * s))
  const gy = Math.min(n - 1, Math.max(0, (y + 1) * s))
  const gz = Math.min(n - 1, Math.max(0, (z + 1) * s))
  const i = Math.min(n - 2, Math.floor(gx))
  const j = Math.min(n - 2, Math.floor(gy))
  const k = Math.min(n - 2, Math.floor(gz))
  const a = gx - i
  const b = gy - j
  const c = gz - k
  const o = i + n * (j + n * k)
  const n2 = n * n
  const c00 = volume[o] * (1 - a) + volume[o + 1] * a
  const c10 = volume[o + n] * (1 - a) + volume[o + n + 1] * a
  const c01 = volume[o + n2] * (1 - a) + volume[o + n2 + 1] * a
  const c11 = volume[o + n2 + n] * (1 - a) + volume[o + n2 + n + 1] * a
  return (c00 * (1 - b) + c10 * b) * (1 - c) + (c01 * (1 - b) + c11 * b) * c
}

// @snippet volume-sampleVolumeNearest
// 最近傍: いちばん近い格子点の値をそのまま使う(補間しない)。格子の間で値が段になる
export function sampleVolumeNearest(volume, n, x, y, z) {
  const s = (n - 1) / 2
  const i = Math.min(n - 1, Math.max(0, Math.round((x + 1) * s)))
  const j = Math.min(n - 1, Math.max(0, Math.round((y + 1) * s)))
  const k = Math.min(n - 1, Math.max(0, Math.round((z + 1) * s)))
  return volume[i + n * (j + n * k)]
}
// @end

// @snippet volume-castRay
// 光線 1 本の色(ボリュームレイキャスティング)。箱に入ってから出るまで Δs ごとに値を補間して取り、
//   composite: 伝達関数で色と不透明度にして、前から合成する(不透明度は Δs に合わせて補正。A ≥ stopAt で打ち切る)
//   mip:       いちばん大きい値(最大値投影)
//   iso:       値が isoValue を最初に越える所を二分法で詰め、勾配(法線)とランバートで明るさ
// opts = { mode, ds, ds0, stopAt, tf(value) → { alpha, t }, colorOf(t) → [r, g, b], isoValue, light: 単位ベクトル,
//          jitter: 0〜1(出発点のずらし。pixelJitter で画素ごとに決める) }
export function castRay(volume, n, origin, dir, opts) {
  const hit = rayBox(origin, dir, [-1, -1, -1], [1, 1, 1])
  if (!hit) return { color: [0, 0, 0], alpha: 0, steps: 0, value: 0 }
  // jitter(0〜1)だけ出発点をずらす。隣の光線と標本の位置がそろうと、層の境目が同心円の縞(木目)になるので、
  // 画素ごとに違うずらしを渡すと、縞が目立たない細かいざらつきに変わる
  const [t0, t1] = [hit[0] + (opts.jitter ?? 0) * opts.ds, hit[1]]
  const ds = opts.ds
  const mode = opts.mode ?? 'composite'
  let steps = 0
  if (mode === 'mip') {
    let best = 0
    for (let t = t0; t <= t1; t += ds) {
      best = Math.max(best, sampleVolume(volume, n, origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]))
      steps++
    }
    return { color: [best, best, best], alpha: best > 0 ? 1 : 0, steps, value: best }
  }
  if (mode === 'iso') {
    const iso = opts.isoValue
    let prevT = t0
    let prev = sampleVolume(volume, n, origin[0] + t0 * dir[0], origin[1] + t0 * dir[1], origin[2] + t0 * dir[2])
    for (let t = t0 + ds; t <= t1; t += ds) {
      steps++
      const v = sampleVolume(volume, n, origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2])
      if (prev < iso && v >= iso) {
        let lo = prevT
        let hi = t
        for (let it = 0; it < 6; it++) {
          const mid = (lo + hi) / 2
          const vm = sampleVolume(volume, n, origin[0] + mid * dir[0], origin[1] + mid * dir[1], origin[2] + mid * dir[2])
          if (vm >= iso) hi = mid
          else lo = mid
        }
        const p = [origin[0] + hi * dir[0], origin[1] + hi * dir[1], origin[2] + hi * dir[2]]
        const h = 2 / (n - 1)
        const g = [
          sampleVolume(volume, n, p[0] + h, p[1], p[2]) - sampleVolume(volume, n, p[0] - h, p[1], p[2]),
          sampleVolume(volume, n, p[0], p[1] + h, p[2]) - sampleVolume(volume, n, p[0], p[1] - h, p[2]),
          sampleVolume(volume, n, p[0], p[1], p[2] + h) - sampleVolume(volume, n, p[0], p[1], p[2] - h),
        ]
        const len = Math.hypot(g[0], g[1], g[2]) || 1
        const N = [-g[0] / len, -g[1] / len, -g[2] / len] // 値が減る向き = 外向き
        const L = opts.light ?? [0, 0, 1]
        const shade = 0.15 + 0.85 * Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2])
        return { color: [shade, shade, shade], alpha: 1, steps, value: iso, t: hi }
      }
      prev = v
      prevT = t
    }
    return { color: [0, 0, 0], alpha: 0, steps, value: 0 }
  }
  const stopAt = opts.stopAt ?? 1
  const ds0 = opts.ds0 ?? ds
  const C = [0, 0, 0]
  let A = 0
  for (let t = t0; t <= t1; t += ds) {
    if (A >= stopAt) break
    steps++
    const v = sampleVolume(volume, n, origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2])
    const { alpha, t: ct } = opts.tf(v)
    if (alpha <= 0) continue
    const a = opacityCorrection(Math.min(alpha, 0.999), ds, ds0)
    const c = opts.colorOf(ct)
    const w = (1 - A) * a
    C[0] += w * c[0]
    C[1] += w * c[1]
    C[2] += w * c[2]
    A += w
  }
  return { color: C, alpha: A, steps }
}
// @end

// 画素 (i, j) ごとに決まる 0〜1 の値(同じ画素ならいつも同じ。castRay の jitter に渡す)
export function pixelJitter(i, j) {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// @snippet volume-sliceAxis
// 板を重ねる描き方で、板を並べる軸: 見る向きにいちばん近い軸(成分の絶対値が最大の軸。0 = x、1 = y、2 = z)
export function sliceAxis(viewDir) {
  const ax = Math.abs(viewDir[0])
  const ay = Math.abs(viewDir[1])
  const az = Math.abs(viewDir[2])
  if (ax >= ay && ax >= az) return 0
  return ay >= az ? 1 : 2
}
// @end

// 作成者が決めた 3 次元の頭の模型: 2 次元の Shepp-Logan(Toft の値)の楕円に、z の半径を足した楕円体。
// [A, a, b, c, x0, y0, z0, φ(度、z 軸まわり)]。値は 0(空気)・1(外側の殻)・0.2(中)・0(中の 2 つの空洞)・0.3(小さな塊)
export const HEAD_PHANTOM_3D = SHEPP_LOGAN.map(([A, a, b, x0, y0, deg], i) => {
  const c = [0.81, 0.78, 0.22, 0.28, 0.41, 0.046, 0.046, 0.046, 0.023, 0.046][i]
  const z0 = [0, 0, -0.25, -0.25, 0, 0, 0.1, 0.1, 0.1, 0.1][i]
  return [A, a, b, c, x0, y0, z0, deg]
})

export function headPhantomValue(x, y, z, ellipsoids = HEAD_PHANTOM_3D) {
  let v = 0
  for (const [A, a, b, c, x0, y0, z0, deg] of ellipsoids) {
    const t = (deg * Math.PI) / 180
    const dx = x - x0
    const dy = y - y0
    const u = dx * Math.cos(t) + dy * Math.sin(t)
    const w = -dx * Math.sin(t) + dy * Math.cos(t)
    const dz = z - z0
    if ((u * u) / (a * a) + (w * w) / (b * b) + (dz * dz) / (c * c) <= 1) v += A
  }
  return v
}

// 模型を n³ の格子の値にする。境目のぎざぎざを減らすため、1 つの格子点のまわりの 2 × 2 × 2 点の平均を取る
export function headPhantom3D(n) {
  const out = new Float32Array(n * n * n)
  const step = 2 / (n - 1)
  const off = step / 4
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -1 + i * step
        const y = -1 + j * step
        const z = -1 + k * step
        let s = 0
        for (const dz of [-off, off]) for (const dy of [-off, off]) for (const dx of [-off, off]) s += headPhantomValue(x + dx, y + dy, z + dz)
        out[i + n * (j + n * k)] = s / 8
      }
    }
  }
  return out
}
