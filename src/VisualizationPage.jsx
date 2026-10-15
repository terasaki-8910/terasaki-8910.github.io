import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'

// 物理シミュレーションの実装例(2026-10-15、決定は科目側の decisions.md の Round 4)。
// 殻は他のページ(GomiPage.jsx)と同じ。中身は src/components/visualization/ に置く。
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
            <h1 className="font-medium font-display text-ink mb-2 text-[clamp(1.75rem,5vw,3.25rem)] leading-tight tracking-tight">
              ビジュアライゼーションの授業における物理シミュレーションの実装例
            </h1>
            <p className="text-muted mb-10">式を JavaScript で実装し、パラメータを変えて動かせるようにしたもの</p>
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
