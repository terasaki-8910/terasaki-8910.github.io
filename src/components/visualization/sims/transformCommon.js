// 節「変換・投影・補間・IK」の3つの見せ方(transformCube / transformKeyframes / transformIk)が共有する小物。
// 計算の関数は src/utils/vis/ にあり、ここは canvas の文字の書体と数の表示だけ。

// canvas の縦横比(幅/高さ)。枠(SimShell)の --aspect と、投影行列の aspect の両方がこれを使う
export const ASPECT = 4 / 3

let bodyFont = null

// canvas の文字(ラベル)の書体指定。ページ本文と同じ書体をそのまま使う
export function uiFont(size) {
  if (bodyFont === null) {
    bodyFont = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif'
  }
  return `${size}px ${bodyFont}`
}

// 小数 digits 桁。-0.00 にならないようにする
export function fmt(v, digits = 2) {
  const r = Number(v.toFixed(digits))
  return (r === 0 ? 0 : r).toFixed(digits)
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const toRad = (deg) => (deg * Math.PI) / 180
export const toDeg = (rad) => (rad * 180) / Math.PI

// 角度を (-180, 180] の度にして表示用の文字列にする
export function fmtDeg(rad) {
  let d = toDeg(rad) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return fmt(d, 1)
}
