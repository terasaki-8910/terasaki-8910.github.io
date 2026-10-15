import { fmt } from './transformCommon.js'

// 行列・ベクトルの数の表示(段階 1〜3 の絵の下)。つかんで動かすと、この数が追従する。
//   <MatRow>
//     <Mat name="T" m={T} hiCols={[3]} />      4×4 の行列。hiCols の列を太字と下線で強調する(色だけに頼らない)
//     <Op>×</Op>
//     <Vec name="p" v={[1, 1, 1, 1]} />        縦ベクトル。hi は強調する行
//     <Op>=</Op>
//     <Vec name="p'" v={...} hi={[0, 1, 2]} />
//   </MatRow>
// 数は小数 2 桁、等幅で桁をそろえる。表は表として読み上げられる(name が表の名前)。

const HI = 'font-bold underline decoration-2 underline-offset-4'

function Block({ name, children }) {
  return (
    <div className="flex flex-col">
      <span className="mb-0.5 h-3 text-center text-[0.6875rem] leading-3" aria-hidden="true">
        {name}
      </span>
      {children}
    </div>
  )
}

function Table({ name, rows, hiCell }) {
  return (
    <table className="border-x-2 border-ink" aria-label={name}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((v, j) => (
              <td key={j} className={`px-1.5 py-0.5 text-right tabular-nums ${hiCell(i, j) ? HI : ''}`}>
                {Number.isFinite(v) ? fmt(v, 2) : '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Mat({ name, m, hiCols = [] }) {
  return (
    <Block name={name}>
      <Table name={name} rows={m} hiCell={(i, j) => hiCols.includes(j)} />
    </Block>
  )
}

export function Vec({ name, v, hi = [] }) {
  return (
    <Block name={name}>
      <Table name={name} rows={v.map((x) => [x])} hiCell={(i) => hi.includes(i)} />
    </Block>
  )
}

export function Op({ children }) {
  return (
    <div className="flex flex-col" aria-hidden="true">
      <span className="mb-0.5 h-3" />
      <span className="flex flex-1 items-center px-2">{children}</span>
    </div>
  )
}

// 行列どうしのすきま(式でないもの。並べるだけ)
export function Gap() {
  return <div className="w-8" aria-hidden="true" />
}

// 式 1 本分。入りきらなければ折り返す
export function MatRow({ children, label }) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-3 pb-3" role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function ReadNote({ children }) {
  return <p className="m-0 max-w-[40rem] font-sans text-[0.8125rem] leading-relaxed">{children}</p>
}
