import { useLayout } from './LayoutContext'

// シミュレーション1つの枠。絵(stage)と操作(controls)を、案(A/B/C)に合わせて並べる。
// どの節のシミュレーションも、返すのはこの枠。
//   <SimShell label="立方体の変換" aspect={4 / 3} stage={<SimCanvas ... />} controls={<>...</>} />
//   aspect:   絵の縦横比(幅/高さ)。useCanvas はこの CSS の大きさに解像度を合わせる
//   stage:    絵。canvas は SimCanvas で、親はこの枠の中だけ(親の幅を ResizeObserver が見る)
//   controls: 操作(SimToolbar、ParamSlider など)。無いときは出さない
//   readout:  絵の下の数値の表示(行列など)。省略できる
// 案 C の広い画面では、操作は絵の右の欄に出て、その下に式(aside)が続く。
export default function SimShell({ label, aspect = 4 / 3, stage, controls, readout, className = '' }) {
  const { placement, aside } = useLayout()
  return (
    <div
      className={`vis-sim ${className}`}
      data-placement={placement}
      style={{ '--aspect': aspect }}
      role="group"
      aria-label={label}
    >
      <div className="vis-sim__main">
        <div className="vis-sim__stage">{stage}</div>
        {readout && <div className="vis-sim__readout">{readout}</div>}
      </div>
      <div className="vis-sim__side">
        {controls && <div className="vis-sim__controls">{controls}</div>}
        {placement === 'side' && aside}
      </div>
    </div>
  )
}

// シミュレーションがまだない節の枠。高さは確保して、短い言葉だけ置く
export function SimPlaceholder({ label = 'シミュレーション', aspect = 4 / 3 }) {
  return (
    <SimShell
      label={label}
      aspect={aspect}
      stage={<div className="vis-placeholder">準備中</div>}
    />
  )
}
