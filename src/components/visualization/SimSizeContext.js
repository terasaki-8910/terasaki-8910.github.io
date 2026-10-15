import { createContext, useContext } from 'react'

// シミュレーションの枠(SimShell)の大きさの種類。
//   'overview' = 全体のシミュレーション(大きい。絵の縦横比は aspect で決める)
//   'step'     = 段階のシミュレーション(小さい。絵の高さは PC 280〜360px、スマホ 220〜300px)
// 段階の枠(StepSection)が 'step' を渡すので、Sim の側は何も指定しなくてよい。
// SimShell の size プロパティを直接渡したときは、そちらが優先される。
export const SimSizeContext = createContext('overview')

export function useSimSize() {
  return useContext(SimSizeContext)
}
