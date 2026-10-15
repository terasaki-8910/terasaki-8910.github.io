import { useId } from 'react'
import Formula from './Formula'

// パラメータのスライダー。ラベルは「記号(行内の MathML)+ 意味」、右に今の値。
//   <ParamSlider symbol="\theta_x" label="X 軸まわりの回転" unit="°" value={v} min={-180} max={180} step={1} onChange={setV} />
//   symbol: TeX(省略できる)  unit: 値のうしろの単位(平文)  format: 値の表示(省略すると String(value))
// 操作はネイティブの input type=range なので、矢印キー・Home/End・PageUp/PageDown・タッチがそのまま効く。
// タッチの的は縦 44px(CSS の .vis-slider__input)。

export default function ParamSlider({
  symbol,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  format,
  onChange,
  disabled = false,
  id,
}) {
  const uid = useId()
  const inputId = id || uid
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const shown = format ? format(value) : String(value)
  return (
    <div className="vis-slider" data-disabled={disabled ? '' : undefined}>
      <label className="vis-slider__label" htmlFor={inputId}>
        {symbol && <Formula tex={symbol} className="vis-slider__symbol" />}
        <span>{label}</span>
      </label>
      <output className="vis-slider__value" htmlFor={inputId}>
        {shown}
        {unit && <span className="vis-slider__unit">{unit}</span>}
      </output>
      <input
        id={inputId}
        className="vis-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${shown}${unit ? ` ${unit}` : ''}`}
        style={{ '--p': `${pct}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}
