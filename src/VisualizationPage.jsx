import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import { SECTIONS } from './components/visualization/sections'
import SectionTabs from './components/visualization/SectionTabs'
import './components/visualization/visualization.css'

// 物理シミュレーションの実装例(2026-10-15、決定は科目側の decisions.md の Round 4・Round 5)。
// 殻は他のページ(GomiPage.jsx)と同じ。タブで 1 節ずつ見せる(SectionTabs)。節の中身(全体のシミュレーション、
// 計算ごとの段階、組み合わせ、出典)は src/components/visualization/sections/<id>.js のデータ。

export default function VisualizationPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="visualization" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="bk-content max-w-6xl mx-auto">
            {/* 題は29字あるので、他のページの text-massive(最大 6rem)だと3行になる。一回り小さくしている */}
            <h1 className="font-medium font-display text-ink mb-3 text-[clamp(1.5rem,5vw,3.25rem)] leading-tight tracking-tight">
              {/* 文節ごとに折り返す(「シミ/ュレーション」のように語の途中で切れない) */}
              <span className="inline-block">ビジュアライゼーションの</span>
              <span className="inline-block">授業における</span>
              <span className="inline-block">物理シミュレーションの</span>
              <span className="inline-block">実装例</span>
            </h1>
            <p className="text-muted mb-8">式を JavaScript で実装し、パラメータを変えて動かせるようにしたもの</p>
            <SectionTabs sections={SECTIONS} />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
