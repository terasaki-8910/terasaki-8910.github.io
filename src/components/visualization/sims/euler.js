// シミュレーションの時間刻みを、integrate.js の前進オイラー法(eulerStep)で進める小さな補助。
// eulerStep は「時刻と値を受け取って変化の速さを返す関数 u」を取る。毎フレーム関数を作らないよう、
// 変化の速さを入れておく変数を 1 つ持ち、それを返す関数を最初に 1 つだけ作る。
import { eulerStep } from '../../../utils/vis/integrate.js'

let currentRate = 0
const rateOf = () => currentRate

// x(t+Δt) = x(t) + Δt·rate(t)。rate は x の時間微分(位置なら速度、速度なら加速度)
export function advance(x, rate, dt) {
  currentRate = rate
  return eulerStep(x, rateOf, 0, dt)
}
