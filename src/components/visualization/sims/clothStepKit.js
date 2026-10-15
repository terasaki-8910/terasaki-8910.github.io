// 布の節の段階のシミュレーションが共通で使う、時間を進める補助と数の書式(DOM に触れない)。

export const STATS_INTERVAL = 0.2 // 数値の表示を更新する間隔 [s]

// 画面の 1 フレームの時間 frameDt を、固定の刻み dt の何回かに分けて進める。
//   clock = { acc: 0, t: 0 }  acc は進めきれなかった時間、t はシミュレーションの時刻 [s]
//   stepFn(dt) が 1 ステップ。追いつけないぶん(maxSteps を超える)は捨てる。戻り値は進めた回数
export function runSteps(clock, frameDt, dt, maxSteps, stepFn) {
  clock.acc += frameDt
  let n = 0
  while (clock.acc >= dt - 1e-9 && n < maxSteps) {
    stepFn(dt)
    clock.acc -= dt
    clock.t += dt
    n++
  }
  if (n === maxSteps) clock.acc = 0
  return n
}

export const fmtTime = (t) => `${t.toFixed(2)} s`
export const fmtMs = (s) => `${(s * 1000).toFixed(s < 0.01 ? 1 : 0)} ms`
export const fmtSigned = (v, digits = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(digits)
export const fmtN = (v, digits = 2) => `${fmtSigned(v, digits)} N`
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
