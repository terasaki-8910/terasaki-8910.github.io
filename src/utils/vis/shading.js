// 反射モデルと影の判定(DOM に触れない純関数)。ベクトルは [x, y, z] の配列。
// 向きの約束: N は面の単位法線、L は面から光源への単位ベクトル、V は面から目への単位ベクトル。
// out を渡すとそこに書く(画素ごとに呼ぶので、配列を作り続けないため)。
// 出典: Lambert, Photometria (1760) / Phong, CACM 18(6) (1975) / Blinn, SIGGRAPH '77 (1977) /
// Cook and Torrance, ACM TOG 1(1) (1982) / Walter et al., EGSR 2007(D を半球で足すと 1 になる形) /
// Schlick, Computer Graphics Forum 13(3) (1994) / Williams, SIGGRAPH '78 (1978) / Donnelly and Lauritzen, I3D 2006
import { add, cross, dot, normalize, sub } from './vec3.js'

const tmpA = [0, 0, 0]
const tmpB = [0, 0, 0]
const tmpH = [0, 0, 0]
const tmpR = [0, 0, 0]

// @snippet shading-faceNormal
// 三角形 a → b → c の法線。2 辺のベクトルの外積は両方に直角で、
// 頂点が反時計回りに見える側(表)を向く。長さを 1 にして返す
export function faceNormal(a, b, c, out = [0, 0, 0]) {
  sub(b, a, tmpA)
  sub(c, a, tmpB)
  cross(tmpA, tmpB, out)
  return normalize(out, out)
}
// @end

// @snippet shading-vertexNormals
// 頂点の法線は、その頂点を使う面の法線の平均(を長さ 1 にしたもの)。
// 面ごとの明るさの段差をならして、なめらかな面に見せるために使う
export function vertexNormals(positions, faces) {
  const sums = positions.map(() => [0, 0, 0])
  const n = [0, 0, 0]
  for (const [i, j, k] of faces) {
    faceNormal(positions[i], positions[j], positions[k], n)
    add(sums[i], n, sums[i])
    add(sums[j], n, sums[j])
    add(sums[k], n, sums[k])
  }
  return sums.map((s) => normalize(s, s))
}
// @end

// @snippet shading-lambert
// 拡散反射(ランバート): 明るさは光の当たる角 θ の cos に比例する(N·L = cos θ)。
// 裏から当たる光(N·L < 0)は 0。目の位置には関係しない
export function lambert(N, L) {
  return Math.max(0, dot(N, L))
}
// @end

// @snippet shading-reflect
// 正反射の向き R = 2(N·L)N − L(L を N のまわりに半回転した向き。|R| = 1)
export function reflect(L, N, out = [0, 0, 0]) {
  const d = 2 * dot(N, L)
  out[0] = d * N[0] - L[0]
  out[1] = d * N[1] - L[1]
  out[2] = d * N[2] - L[2]
  return out
}
// @end

// @snippet shading-phongSpecular
// フォンの鏡面反射: R の近くから見るほど明るい。max(0, R·V)^m。
// m(光沢度)が大きいほど、光る範囲が狭い。光が裏から当たるときは 0
export function phongSpecular(N, L, V, m) {
  if (dot(N, L) <= 0) return 0
  const c = dot(reflect(L, N, tmpR), V)
  return c > 0 ? c ** m : 0
}
// @end

// @snippet shading-halfVector
// ハーフベクトル H = (L + V)/|L + V|。光と目の向きのちょうど真ん中
export function halfVector(L, V, out = [0, 0, 0]) {
  add(L, V, out)
  return normalize(out, out)
}
// @end

// @snippet shading-blinnPhongSpecular
// ブリン-フォンの鏡面反射: R の代わりに、H と N の近さで決める。max(0, N·H)^m
export function blinnPhongSpecular(N, L, V, m) {
  if (dot(N, L) <= 0) return 0
  const c = dot(N, halfVector(L, V, tmpH))
  return c > 0 ? c ** m : 0
}
// @end

// @snippet shading-beckmannD
// 微小面の分布 D(Beckmann): 法線が H を向いた小さな面の割合。
// α は N と H の角、m は粗さ(面の傾きのばらつき)。tan²α = (1 − cos²α)/cos²α。
// この形は D cos α を半球で積分すると 1 になる(Walter ら 2007)
export function beckmannD(cosAlpha, m) {
  if (cosAlpha <= 0) return 0
  const c2 = cosAlpha * cosAlpha
  const tan2 = (1 - c2) / c2
  const m2 = m * m
  return Math.exp(-tan2 / m2) / (Math.PI * m2 * c2 * c2)
}
// @end

// @snippet shading-geometryG
// 幾何減衰 G: 小さな面どうしが、入ってくる光(L 側)や出ていく光(V 側)をさえぎる割合。
// さえぎりがなければ 1。Blinn(1977)と Cook-Torrance(1982)の形
export function geometryG(N, L, V, H) {
  const vh = dot(V, H)
  if (vh <= 0) return 0
  const nh = dot(N, H)
  const g = Math.min(1, (2 * nh * dot(N, V)) / vh, (2 * nh * dot(N, L)) / vh)
  return Math.max(0, g)
}
// @end

// @snippet shading-fresnelSchlick
// フレネル項(Schlick の近似): 面で反射する光の割合。真正面(cos θ = 1)で F0、
// 面すれすれ(cos θ = 0)で 1 に近づく
export function fresnelSchlick(F0, cosTheta) {
  const c = Math.min(1, Math.max(0, cosTheta))
  return F0 + (1 - F0) * (1 - c) ** 5
}
// @end

// @snippet shading-cookTorranceSpecular
// クック-トランスの鏡面反射(BRDF): D G F / (4 (N·L)(N·V))。
// 画素の明るさにするときは、光の強さと N·L を掛ける
export function cookTorranceSpecular(N, L, V, m, F0) {
  const nl = dot(N, L)
  const nv = dot(N, V)
  if (nl <= 0 || nv <= 0) return 0
  const H = halfVector(L, V, tmpH)
  const D = beckmannD(dot(N, H), m)
  const G = geometryG(N, L, V, H)
  const F = fresnelSchlick(F0, dot(V, H))
  return (D * G * F) / (4 * nl * nv)
}
// @end

// @snippet shading-reflectIncident
// 入ってくる向き I(面へ向かう)の光の反射: I − 2(N·I)N
export function reflectIncident(I, N, out = [0, 0, 0]) {
  const d = 2 * dot(N, I)
  out[0] = I[0] - d * N[0]
  out[1] = I[1] - d * N[1]
  out[2] = I[2] - d * N[2]
  return out
}
// @end

// @snippet shading-refract
// 屈折(スネルの法則 η1 sin θ = η2 sin φ をベクトルで): η = η1/η2、cos θ = −N·I、
// cos φ = √(1 − η²(1 − cos²θ))、T = ηI + (η cos θ − cos φ)N。
// N は入ってくる側を向けておく(N·I < 0)。根号の中が負なら全反射で、屈折の光はない(null)
export function refract(I, N, eta, out = [0, 0, 0]) {
  const cosI = -dot(N, I)
  const k = 1 - eta * eta * (1 - cosI * cosI)
  if (k < 0) return null
  const cosT = Math.sqrt(k)
  const a = eta * cosI - cosT
  out[0] = eta * I[0] + a * N[0]
  out[1] = eta * I[1] + a * N[1]
  out[2] = eta * I[2] + a * N[2]
  return out
}
// @end

// @snippet shading-inShadow
// シャドウマップの判定: 点から光源までの距離 dC が、光源から見てその向きでいちばん近い物までの
// 距離 dL より遠ければ、間に何かがあるので影。bias は自分自身の面で影にならないためのずらし
export function inShadow(dC, dL, bias) {
  return dC > dL + bias
}
// @end

// @snippet shading-chebyshevUpperBound
// やわらかい影(Variance Shadow Map): 近くの距離の平均 μ と 2 乗の平均から分散 σ² を求め、
// 「距離が t 以上である確率」の上限 σ²/(σ² + (t − μ)²)(チェビシェフの不等式)を光の当たる割合にする。
// t ≤ μ なら影ではない(1)
export function chebyshevUpperBound(mean, meanSq, t, minVariance = 1e-6) {
  if (t <= mean) return 1
  const variance = Math.max(meanSq - mean * mean, minVariance)
  const d = t - mean
  return variance / (variance + d * d)
}
// @end
