import { createContext, useContext } from 'react'

// 案(A/B/C)がシミュレーションの枠(SimShell)に伝えること。
//   layout:    'a' | 'b' | 'c'
//   placement: 'below' = 操作は絵の下 / 'side' = 操作は絵の横の欄(案 C の広い画面)
//   aside:     'side' のとき、操作の下に続けて出すもの(案 C では式)。それ以外は null
export const LayoutContext = createContext({ layout: 'a', placement: 'below', aside: null })

export function useLayout() {
  return useContext(LayoutContext)
}
