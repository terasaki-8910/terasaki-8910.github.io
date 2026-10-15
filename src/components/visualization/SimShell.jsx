import { useSimSize } from './SimSizeContext'

// シミュレーション1つの枠。絵(stage)と、変数のバー(controls)を並べる。全体のシミュレーションも段階のシミュレーションも、返すのはこの枠。
//   <SimShell label="剛体と衝突" aspect={4 / 3} stage={<SimCanvas ... />} legend={<SimLegend ... />} controls={<>...</>} />
//
// 配置(visualization.css):
//   幅 1024px 以上で横長(landscape)  絵が左、バーが右(幅 20rem)
//   それ以外(スマホ・縦長・狭い窓)    絵が上、バーが下
// 全体と段階で同じ決まり。画面の幅は CSS の media query が見るので、JS は何もしない。
//
// 大きさ(size):
//   'overview'(既定)  絵の縦横比は aspect(幅/高さ)。useCanvas はこの CSS の大きさに解像度を合わせる
//   'step'            絵の高さを決める(PC 280〜360px、スマホ 220〜300px。幅は列いっぱい)。aspect は使わない。
//                     StepSection の中では自動で 'step' になる。canvas の縦横比は幅しだいで変わるので、
//                     絵は width と height から描く(axes.js の makeView が、世界の範囲を余白の内側に収める)
//   height: 'step' の高さを変えたいとき { pc: [最小, 最大], phone: [最小, 最大] }(px)。省略すると上の値
//
// 各部:
//   stage:    絵。canvas は SimCanvas で、親はこの枠の中だけ(親の幅を ResizeObserver が見る)
//   legend:   絵の下の凡例(SimLegend)。軸の単位、t・Δt、g など。省略できる
//   controls: 変数のバー(SimToolbar、ParamSlider など)。無いときは出さない
//   readout:  絵の下の数値の表示(行列など)。省略できる
//   switcher: 絵の上に付ける切り替え(1つの絵で複数の見せ方を切り替えるときの、見せ方のタブ)。省略できる。
//             絵の上は切り替えても動かないので、押す位置が変わらない
export default function SimShell({
  label,
  aspect = 4 / 3,
  size,
  height,
  stage,
  controls,
  legend,
  readout,
  switcher,
  className = '',
}) {
  const contextSize = useSimSize()
  const kind = size || contextSize
  const style = { '--aspect': aspect }
  if (kind === 'step' && height) {
    if (height.phone) {
      style['--step-h-phone-min'] = `${height.phone[0]}px`
      style['--step-h-phone-max'] = `${height.phone[1]}px`
    }
    if (height.pc) {
      style['--step-h-pc-min'] = `${height.pc[0]}px`
      style['--step-h-pc-max'] = `${height.pc[1]}px`
    }
  }
  return (
    <div className={`vis-sim ${className}`} data-size={kind} style={style} role="group" aria-label={label}>
      <div className="vis-sim__main">
        {switcher && <div className="vis-sim__switcher">{switcher}</div>}
        <div className="vis-sim__stage">{stage}</div>
        {legend}
        {readout && <div className="vis-sim__readout">{readout}</div>}
      </div>
      <div className="vis-sim__side">
        {controls && <div className="vis-sim__controls">{controls}</div>}
      </div>
    </div>
  )
}

// シミュレーションがまだない(または読み込み中の)枠。高さは確保して、短い言葉だけ置く
export function SimPlaceholder({ label = 'シミュレーション', aspect = 4 / 3, text = '準備中' }) {
  return <SimShell label={label} aspect={aspect} stage={<div className="vis-placeholder">{text}</div>} />
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
