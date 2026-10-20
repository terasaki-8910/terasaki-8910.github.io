import { lazy, Suspense } from 'react'
import { VISUALIZATION_TABS, VISUALIZATION_PREVIEW_TAB } from '../data/visualizationTabs'

const RigidPreview = lazy(() => import('./visualization/sims/RigidPreview'))

/**
 * /visualization/ のプレビュー。箱に円が落ちて積もる「剛体」の全体像を縮めて見せる。
 * 剛体は約 2.5 秒で動きが自然に終わるので、WCAG 2.2.2 のための停止ボタンを要しない。
 * 布は風を受けても動きが小さいため、ここでは剛体を選んだ。
 * canvas の touch-pan-y は、スマートフォンで縦に指を動かしたときページをスクロールできるようにする。
 * 下のリンクから各タブへ直接移動できる。
 */
export default function HomeVisualizationPreview() {
  return (
    <div>
      {/* 枠は幅の 1/3 の高さ(上限は 3D ASCII と同じ 260px)。箱の幅 4 m を枠の幅いっぱいに置くので、
          どの画面幅でも見える高さが 1.2〜1.3 m になり、積もった円が枠の半分ほどを埋める。
          aspect-ratio は max-height を幅の上限に移してしまうので、min-w-full で幅を列いっぱいに保つ */}
      <div className="w-full min-w-full aspect-[3/1] max-h-[260px]">
        <Suspense fallback={null}>
          <RigidPreview />
        </Suspense>
      </div>
      <nav aria-label="物理シミュレーションの節" className="mt-2 flex flex-wrap gap-x-4 text-xs font-mono">
        {VISUALIZATION_TABS.map(({ id, label }) => (
          <a
            key={id}
            href={`/visualization/#${id}`}
            className={`inline-flex items-center min-h-11 md:min-h-0 hover:text-accent transition-colors ${id === VISUALIZATION_PREVIEW_TAB ? 'text-ink' : 'text-muted'}`}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}
