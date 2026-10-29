import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import PageBackground from './components/PageBackground.jsx'
import { SECTIONS } from './components/visualization-methods/sections/index.js'
import SectionTabs from './components/visualization/SectionTabs.jsx'
import SeriesNav from './components/visualization/SeriesNav.jsx'
import './components/visualization/visualization.css'

export default function VisualizationMethodsPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="visualization-methods" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="bk-content max-w-6xl mx-auto">
            <SeriesNav current="visualization-methods" />
            <h1 className="font-medium font-display text-ink mb-3 text-[clamp(1.5rem,5vw,3.25rem)] leading-tight tracking-tight">
              <span className="inline-block">ビジュアライゼーションの</span>
              <span className="inline-block">授業における</span>
              <span className="inline-block">可視化手法の</span>
              <span className="inline-block">実装例</span>
            </h1>
            <p className="text-muted mb-8">全体の可視化を動かし、それを作る計算を 1 つずつ動かして確かめ、組み合わせて全体になるまでをたどる</p>
            <SectionTabs sections={SECTIONS} className="vis-tabs-wrap--methods" />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
