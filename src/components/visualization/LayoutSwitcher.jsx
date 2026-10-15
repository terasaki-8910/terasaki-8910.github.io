import { LAYOUTS } from './layouts'

// 見た目の案を切り替える操作(プレビュー用。案が決まったら消す)。URL の ?layout= と同期する。
// 使うのは選ぶときの1回きりなので、小さく控えめに(題や本文より目立たせない)。
export default function LayoutSwitcher({ value, onChange }) {
  return (
    <div className="vis-preview" role="group" aria-label="見た目の案（プレビュー用）">
      <span className="vis-preview__label">見た目の案（プレビュー用）</span>
      {LAYOUTS.map((layout) => (
        <button
          key={layout.key}
          type="button"
          className="vis-preview__btn"
          aria-pressed={layout.key === value}
          onClick={() => onChange(layout.key)}
        >
          {layout.label}
        </button>
      ))}
    </div>
  )
}
