import LayoutA from './LayoutA.jsx'
import LayoutB from './LayoutB.jsx'
import LayoutC from './LayoutC.jsx'

// 見た目の3案(プレビューのあいだだけ。?layout=a|b|c で切り替える)。案が決まったら、
// 選ばれなかった案と LayoutSwitcher を消し、VisualizationPage.jsx は選ばれた案だけを使う。
export const LAYOUTS = [
  { key: 'a', label: 'A 読み物', Component: LayoutA },
  { key: 'b', label: 'B 実験台', Component: LayoutB },
  { key: 'c', label: 'C タブ', Component: LayoutC },
]

export const DEFAULT_LAYOUT = 'a'
