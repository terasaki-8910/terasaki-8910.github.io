import { memo, useEffect, useRef } from 'react'
import { projects } from '../data/projects'
import { renderProjectMenu } from '../data/projectMenuMarkup'
import { initProjectMenu } from '../fx/projectMenu'

/**
 * ヘッダー右上のプロジェクトメニュー(decisions のヘッダー: 背景のマス目と同じ部品の見た目)。
 * マークアップと開閉の動きは、静的な Spotify ページと同じものを使う
 * (src/data/projectMenuMarkup.js と src/fx/projectMenu.js)。React はその HTML を置き、
 * マウントしたら開閉を始めるだけ。テーマの切り替えで親が描き直しても、中身は変えない(memo)。
 */
function ProjectMenu({ currentPage }) {
  const rootRef = useRef(null)

  useEffect(() => initProjectMenu(rootRef.current), [])

  return (
    <div
      ref={rootRef}
      className="cosmic-header__menu"
      dangerouslySetInnerHTML={{ __html: renderProjectMenu(projects, currentPage) }}
    />
  )
}

export default memo(ProjectMenu)
