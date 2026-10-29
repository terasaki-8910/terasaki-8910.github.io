import { projects } from '../../data/projects'

// 2 つの実装例のページ(物理シミュレーション・可視化手法)を行き来するリンク(本人 2026-10-29「相互リンクを付けて」)。
// 題の上に置く。名前とリンク先はヘッダーのメニューと同じ(projects.js の menuTitle・link)。いまのページは aria-current で示し、
// 見た目はトップのプレビューの下の節のリンク(HomeVisualizationPreview.jsx)とそろえる。
const SERIES = ['visualization', 'visualization-methods']

export default function SeriesNav({ current }) {
  const pages = SERIES.map((key) => projects.find((p) => p.pageKey === key)).filter(Boolean)
  return (
    <nav aria-label="ビジュアライゼーションの授業の実装例" className="mb-3 flex flex-wrap gap-x-4 text-xs font-mono">
      {pages.map(({ pageKey, link, menuTitle, title }) => (
        <a
          key={pageKey}
          href={link}
          aria-current={pageKey === current ? 'page' : undefined}
          className={`inline-flex items-center min-h-11 md:min-h-0 hover:text-accent transition-colors ${pageKey === current ? 'text-ink' : 'text-muted'}`}
        >
          {menuTitle ?? title}
        </a>
      ))}
    </nav>
  )
}
