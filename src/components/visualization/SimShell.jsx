import { useLayout } from './LayoutContext'

// シミュレーション1つの枠。絵(stage)と操作(controls)を、案(A/B/C)に合わせて並べる。
// どの節のシミュレーションも、返すのはこの枠。
//   <SimShell label="立方体の変換" aspect={4 / 3} stage={<SimCanvas ... />} controls={<>...</>} />
//   aspect:   絵の縦横比(幅/高さ)。useCanvas はこの CSS の大きさに解像度を合わせる
//   stage:    絵。canvas は SimCanvas で、親はこの枠の中だけ(親の幅を ResizeObserver が見る)
//   controls: 操作(SimToolbar、ParamSlider など)。無いときは出さない
//   readout:  絵の下の数値の表示(行列など)。省略できる
//   switcher: 絵の上に付ける切り替え(1つの絵で複数の見せ方を切り替えるときの、見せ方のタブ)。省略できる。
//             絵の上は切り替えても動かないので、押す位置が変わらない
// 案 C の広い画面では、操作は絵の右の欄に出て、その下に式(aside)が続く。
export default function SimShell({ label, aspect = 4 / 3, stage, controls, readout, switcher, className = '' }) {
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
        {switcher && <div className="vis-sim__switcher">{switcher}</div>}
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

// 見せ方ごとに中身が違う欄(readout や controls)を、同じ場所に重ねて置く。いま見せているものだけが見え、
// 見えない方は visibility: hidden なので、Tab でも読み上げでも出てこない。
// 重ねた欄の高さは、場所を取っておく見せ方(reserve)の最大になる。切り替えても、そこまでは下の内容が動かない。
//   <ViewStack active={view} views={{ cube: <.../>, ik: <.../> }} reserve={['ik']} />
//   reserve: いつも場所を取っておく見せ方のキー。省略すると全部(高さは最大に固定される)。
//            入れなかった見せ方は、見ていないあいだ場所を取らない(その見せ方に切り替えると、その分だけ伸びる)。
//            ひとつだけ極端に長い見せ方があるとき、それに合わせて他の見せ方の下に何もない空きを作らないために使う。
// 中身は操作の欄と同じ grid(.vis-sim__controls と同じ並び)に並ぶ。
export function ViewStack({ active, views, reserve }) {
  return (
    <div className="vis-stack">
      {Object.entries(views).map(([key, node]) => (
        <div
          key={key}
          className="vis-stack__item"
          data-active={key === active}
          data-reserve={!reserve || reserve.includes(key)}
        >
          {node}
        </div>
      ))}
    </div>
  )
}
