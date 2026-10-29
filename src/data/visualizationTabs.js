// id と label は src/components/visualization/sections の id・tabLabel に揃える(テストで確認)。
export const VISUALIZATION_TABS = [
  { id: 'transform', label: '変換・IK' },
  { id: 'rigid', label: '剛体' },
  { id: 'cloth', label: '布' },
  { id: 'fluid', label: '流体' },
  { id: 'navier-stokes', label: 'NS 方程式' },
]
export const VISUALIZATION_PREVIEW_TAB = 'rigid'

// /visualization-methods/ の分(2026-10-29)。id と label は src/components/visualization-methods/sections に揃える(テストで確認)。
export const VISUALIZATION_METHODS_TABS = [
  { id: 'shape', label: '形状' },
  { id: 'shading', label: '反射と影' },
  { id: 'isosurface', label: '等値面' },
  { id: 'volume', label: 'ボリューム' },
  { id: 'flow', label: '流れ' },
  { id: 'ct', label: 'CT' },
]
export const VISUALIZATION_METHODS_PREVIEW_TAB = 'ct'
