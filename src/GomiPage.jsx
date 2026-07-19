import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import GomiCalendar from './components/gomi/GomiCalendar'

export default function GomiPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="gomi" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-massive font-medium font-display text-ink mb-2">
              ごみ収集カレンダー
            </h1>
            <p className="text-muted mb-10">
              つくば市のごみ収集日程 — オープンデータ連携
            </p>
            <GomiCalendar />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
