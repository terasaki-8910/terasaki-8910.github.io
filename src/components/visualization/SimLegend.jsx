import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import Formula from './Formula'

// 凡例: シミュレーションの絵の下に、軸の単位・時刻 t・Δt・重力 g など、動きに効く量を短く並べる(SimShell の legend)。
//   const legend = useRef(null)
//   <SimLegend ref={legend} items={[
//     { key: 't', symbol: 't', label: '時刻', value: '0.00 s', minChars: 7 },
//     { symbol: '\\Delta t', label: '時間刻み', value: '2.08 ms × 8 回' },
//     { symbol: 'g', label: '重力', value: '9.8 m/s² ↓' },
//     { label: '粒子の色', value: '遅い → 速い', swatch: 'linear-gradient(to right, var(--color-ink), var(--lane-1))' },
//   ]} />
//   legend.current.update({ t: '1.23 s' })     // 毎フレーム変わる値は、React の描き直しを起こさず、文字だけ書き換える
//
// items: [{ label, value, symbol?, key?, minChars?, swatch? }]
//   label     名前(平文)。単位は value に含める
//   symbol    記号(TeX。スライダーの記号と同じ数式の字で出る)。Latin の 1 字(t・g・e)は、本文の書体だと小さく読みにくいので、記号にする
//   value     値の文字。省略すると名前だけ
//   key       update で指す名前(省略すると label)
//   minChars  値の最小の幅(文字数)。値の桁が増えても、隣の項目が動かないように
//   swatch    色見本(CSS の背景。トークンの var(--color-*)・var(--lane-*) を使う)。色の意味を伝えるとき
// 値の文字は React が管理しない(dd は空のまま、effect で書く)。items の value が変わったときだけ書き直すので、
// update で書いた値は、items の value が変わらない限り、再描画で上書きされない。
// 値は毎フレーム変わるので aria-live にはしない(読み上げが止まらなくなる)。

const SimLegend = forwardRef(function SimLegend({ items, label = '凡例' }, ref) {
  const cells = useRef(new Map()) // key → dd 要素
  const propValues = useRef(new Map()) // key → 前回 items で渡された value

  const write = (key, text) => {
    const el = cells.current.get(key)
    if (el && el.textContent !== text) el.textContent = text
  }

  useImperativeHandle(ref, () => ({
    update(values) {
      for (const key of Object.keys(values)) write(key, String(values[key]))
    },
  }))

  useLayoutEffect(() => {
    for (const item of items) {
      const key = item.key ?? item.label
      const value = item.value ?? ''
      if (propValues.current.get(key) !== value) {
        propValues.current.set(key, value)
        write(key, value)
      }
    }
  })

  return (
    <div className="vis-legend-wrap" role="group" aria-label={label}>
      <dl className="vis-legend">
        {items.map((item) => {
          const key = item.key ?? item.label
          return (
            <div key={key} className="vis-legend__item">
              {item.swatch && <span className="vis-legend__swatch" aria-hidden="true" style={{ background: item.swatch }} />}
              <dt className="vis-legend__label">
                {item.symbol && <Formula tex={item.symbol} className="vis-legend__symbol" />}
                {item.label}
              </dt>
              {item.value !== undefined && (
                <dd
                  ref={(el) => {
                    if (el) cells.current.set(key, el)
                    else cells.current.delete(key)
                  }}
                  className="vis-legend__value"
                  style={item.minChars ? { minWidth: `${item.minChars}ch` } : undefined}
                />
              )}
            </div>
          )
        })}
      </dl>
    </div>
  )
})

export default SimLegend
