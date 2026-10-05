import { MENU_ICONS } from './menuIcons.js'

/**
 * ヘッダー右上のメニューの中身(ボタンと一覧)の HTML。項目名は menuTitle があればそれ、なければ title。
 * React のページ(ProjectMenu.jsx)と静的な Spotify ページ(scripts/sync-header.js)が
 * 同じこの関数で同じマークアップを作り、開閉は src/fx/projectMenu.js が受け持つ。
 * DOM に触らない純粋な関数なので、Node(sync-header.js)からも読める。
 *
 * 1行 = 左端の 40px のマス(中にアイコン)+ 項目名。今いるページの行はリンクにせず、
 * マスをピンクで塗ったままにする(decisions のヘッダー)。
 */

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ボタンの記号: 2×2 のマス。左上のマスだけ塗る(色は CSS: ライトは白、ダークはピンク)
const GRID_GLYPH =
  '<svg class="cosmic-header__menu-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
  '<rect class="cosmic-header__menu-glyph-fill" x="1" y="1" width="9" height="9"/>' +
  '<path d="M1 1h18v18H1zM10 1v18M1 10h18"/>' +
  '</svg>'

function iconSvg(key) {
  const icon = MENU_ICONS[key]
  if (!icon) return ''
  return `<svg viewBox="${icon.viewBox}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${icon.d}"/></svg>`
}

export function renderProjectMenu(projects, currentPage) {
  const n = projects.length
  const rows = projects
    .map((project, i) => {
      const inner =
        `<span class="cosmic-header__menu-cell">${iconSvg(project.icon)}</span>` +
        `<span class="cosmic-header__menu-label">${escapeHtml(project.menuTitle || project.title)}</span>`
      const order = `style="--i:${i};--n:${n}"`
      if (project.pageKey && project.pageKey === currentPage) {
        return `<span class="cosmic-header__menu-item cosmic-header__menu-item--current" role="menuitem" aria-current="page" aria-disabled="true" ${order}>${inner}</span>`
      }
      return `<a class="cosmic-header__menu-item" role="menuitem" href="${escapeHtml(project.link)}" tabindex="-1" ${order}>${inner}</a>`
    })
    .join('')
  return (
    `<button type="button" class="cosmic-header__menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="プロジェクトメニュー">${GRID_GLYPH}</button>` +
    `<div class="cosmic-header__menu-panel" role="menu" data-phase="closed" hidden>${rows}</div>`
  )
}
