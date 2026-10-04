// ヘッダー右上のメニューの開閉(decisions のヘッダー)。React のページは ProjectMenu.jsx から、
// 静的な Spotify ページは src/fx/projectMenuStatic.js から、同じこの関数を呼ぶ。
// マークアップは src/data/projectMenuMarkup.js が作る。
//
// 開く: 上の行から順にマスが白く(ダークは薄いピンクに)なり、少し遅れて項目名が出る。
// 閉じる: 下の行から順にマスが元に戻ってから消える。色と遅れは CSS(Header.css)が持ち、
// ここは段階(data-phase)を切り替えるだけ。下の時間は CSS の値と合わせてある。
const CELL_MS = 220 // 1マスの色が変わりきる時間(CSS の transition と同じ)
const CLOSE_STAGGER_MS = 45 // 閉じるときの行ごとのずれ(CSS と同じ)

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

export function initProjectMenu(root) {
  if (!root) return () => {}
  const trigger = root.querySelector('.cosmic-header__menu-trigger')
  const panel = root.querySelector('.cosmic-header__menu-panel')
  if (!trigger || !panel) return () => {}
  const items = [...panel.querySelectorAll('.cosmic-header__menu-item')]
  const links = items.filter((el) => el.tagName === 'A')
  let timer = 0
  let raf = 0

  const isOpen = () => !panel.hidden && panel.dataset.phase !== 'closing'

  function open() {
    window.clearTimeout(timer)
    window.cancelAnimationFrame(raf)
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    links.forEach((a) => (a.tabIndex = 0))
    if (prefersReducedMotion()) {
      panel.dataset.phase = 'open'
      return
    }
    // いったん「開く前」の色で描いてから open にして、CSS の遷移を走らせる
    panel.dataset.phase = 'opening'
    raf = window.requestAnimationFrame(() => {
      raf = window.requestAnimationFrame(() => {
        panel.dataset.phase = 'open'
      })
    })
  }

  function close() {
    if (panel.hidden) return
    window.clearTimeout(timer)
    window.cancelAnimationFrame(raf)
    trigger.setAttribute('aria-expanded', 'false')
    links.forEach((a) => (a.tabIndex = -1))
    if (prefersReducedMotion()) {
      panel.dataset.phase = 'closed'
      panel.hidden = true
      return
    }
    panel.dataset.phase = 'closing'
    timer = window.setTimeout(() => {
      panel.hidden = true
      panel.dataset.phase = 'closed'
    }, (items.length - 1) * CLOSE_STAGGER_MS + CELL_MS)
  }

  const onTrigger = () => (isOpen() ? close() : open())
  const onPointerDown = (event) => {
    if (!panel.hidden && !root.contains(event.target)) close()
  }
  const onKeyDown = (event) => {
    if (event.key === 'Escape') close()
  }
  const onItemClick = () => close()

  trigger.addEventListener('click', onTrigger)
  document.addEventListener('mousedown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  links.forEach((a) => a.addEventListener('click', onItemClick))

  return () => {
    window.clearTimeout(timer)
    window.cancelAnimationFrame(raf)
    trigger.removeEventListener('click', onTrigger)
    document.removeEventListener('mousedown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
    links.forEach((a) => a.removeEventListener('click', onItemClick))
  }
}
