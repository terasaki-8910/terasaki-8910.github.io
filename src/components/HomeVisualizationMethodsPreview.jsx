import { lazy, Suspense } from 'react'
import { VISUALIZATION_METHODS_TABS, VISUALIZATION_METHODS_PREVIEW_TAB } from '../data/visualizationTabs'

const CtPreview = lazy(() => import('./visualization-methods/sims/CtPreview'))

/**
 * /visualization-methods/ のプレビュー(2026-10-29)。CT の全体を縮め、X 線の向きが回るあいだに断面が作り直される
 * ところを見せる。約 3 秒で自然に止まるので、停止ボタンを要しない(HomeVisualizationPreview の剛体と同じ考え方)。
 * 回すのは画面に見えている間だけ(useSimLoop)。下のリンクから各タブへ直接移動できる。
 */
export default function HomeVisualizationMethodsPreview() {
  return (
    <div>
      {/* 枠の大きさは物理シミュレーションのプレビューと同じ(幅の 1/3 の高さ、上限 260px) */}
      <div className="w-full min-w-full aspect-[3/1] max-h-[260px]">
        <Suspense fallback={null}>
          <CtPreview />
        </Suspense>
      </div>
      <nav aria-label="可視化手法の節" className="mt-2 flex flex-wrap gap-x-4 text-xs font-mono">
        {VISUALIZATION_METHODS_TABS.map(({ id, label }) => (
          <a
            key={id}
            href={`/visualization-methods/#${id}`}
            className={`inline-flex items-center min-h-11 md:min-h-0 hover:text-accent transition-colors ${id === VISUALIZATION_METHODS_PREVIEW_TAB ? 'text-ink' : 'text-muted'}`}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}
