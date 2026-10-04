// 静的な Spotify ページ(React を使わない)のメニュー。マークアップは scripts/sync-header.js が
// src/data/projectMenuMarkup.js で書き出し、開閉は React のページと同じ initProjectMenu が受け持つ。
import { initProjectMenu } from './projectMenu.js'

initProjectMenu(document.querySelector('.cosmic-header__menu'))
