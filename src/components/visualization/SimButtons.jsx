import { useRef } from 'react'
import { PiPlayBold, PiPauseBold, PiArrowCounterClockwiseBold } from 'react-icons/pi'

// シミュレーションの操作のボタン。見た目は visualization.css の .vis-btn / .vis-seg。
//   <SimToolbar>            ボタンの行(折り返す)
//     <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
//     <ResetButton onClick={reset} />
//     <ModeSwitch label="掛ける順" value={order} onChange={setOrder} options={[{ value: 'trs', label: 'TRS' }, ...]} />
//       variant="tabs"  絵の見せ方の切り替え(SimShell の switcher に置く。絵の上に付くタブの形で、選んだものを ink で塗る)
//       variant="quiet" 見せ方の中の選択肢。選んだものを塗らずに ink の太い枠で示す(塗りは主の切り替えだけ)
//     <ToggleButton pressed={showGrid} onChange={setShowGrid}>グリッドを表示</ToggleButton>
//   </SimToolbar>

export function SimToolbar({ children, label = '操作' }) {
  return (
    <div className="vis-toolbar" role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function PlayPauseButton({ running, onToggle, disabled = false }) {
  const Icon = running ? PiPauseBold : PiPlayBold
  return (
    <button type="button" className="vis-btn" onClick={onToggle} disabled={disabled}>
      <Icon aria-hidden="true" />
      <span>{running ? '一時停止' : '再生'}</span>
    </button>
  )
}

export function ResetButton({ onClick, disabled = false, children = 'リセット' }) {
  return (
    <button type="button" className="vis-btn" onClick={onClick} disabled={disabled}>
      <PiArrowCounterClockwiseBold aria-hidden="true" />
      <span>{children}</span>
    </button>
  )
}

// 押している間だけ有効になるスイッチ(表示の切り替えなど)
export function ToggleButton({ pressed, onChange, children, disabled = false }) {
  return (
    <button
      type="button"
      className="vis-btn"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
    >
      <span>{children}</span>
    </button>
  )
}

// 方式の切り替え(2〜4個から1つ)。radiogroup で、矢印キーで移る(選んだ項目だけが Tab の停止点)
export function ModeSwitch({ label, value, options, onChange, disabled = false, variant }) {
  const refs = useRef([])
  const index = Math.max(0, options.findIndex((o) => o.value === value))

  function move(next) {
    const n = (next + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      move(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      move(options.length - 1)
    }
  }

  return (
    <div className={variant ? `vis-seg vis-seg--${variant}` : 'vis-seg'} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          className="vis-seg__item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
