// 3 次元のベクトル(DOM に触れない純関数)。ベクトルは [x, y, z] の配列。
// out を渡すとそこに書いて返す(画素ごとの計算で配列を作り続けないため)。渡さなければ新しい配列を返す。

export function add(a, b, out = [0, 0, 0]) {
  out[0] = a[0] + b[0]
  out[1] = a[1] + b[1]
  out[2] = a[2] + b[2]
  return out
}

export function sub(a, b, out = [0, 0, 0]) {
  out[0] = a[0] - b[0]
  out[1] = a[1] - b[1]
  out[2] = a[2] - b[2]
  return out
}

export function scale(a, s, out = [0, 0, 0]) {
  out[0] = a[0] * s
  out[1] = a[1] * s
  out[2] = a[2] * s
  return out
}

// @snippet vec3-dot
// 内積 a·b = |a||b| cos θ。単位ベクトルどうしなら、なす角の cos
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
// @end

// @snippet vec3-cross
// 外積 a × b。a にも b にも直角で、a から b へ回す右ねじの進む向き。長さは 2 辺がつくる平行四辺形の面積
export function cross(a, b, out = [0, 0, 0]) {
  const x = a[1] * b[2] - a[2] * b[1]
  const y = a[2] * b[0] - a[0] * b[2]
  const z = a[0] * b[1] - a[1] * b[0]
  out[0] = x
  out[1] = y
  out[2] = z
  return out
}
// @end

export function length(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
}

// 長さ 1 にする。長さ 0 のベクトルは 0 のまま返す
export function normalize(a, out = [0, 0, 0]) {
  const len = length(a)
  const k = len > 0 ? 1 / len : 0
  out[0] = a[0] * k
  out[1] = a[1] * k
  out[2] = a[2] * k
  return out
}
