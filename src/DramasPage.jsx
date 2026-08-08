import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import WatchedList from './components/watched/WatchedList'

export default function DramasPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="dramas" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-massive font-medium font-display text-ink mb-2">観たドラマ</h1>
            <p className="text-muted mb-10">星評価とジャンル別の集計つき</p>
            <WatchedList dataFile="dramas.json" emptyMessage="まだ記録がありません。" />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
