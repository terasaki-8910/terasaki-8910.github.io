import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import GamingArchive from './components/gaming/GamingArchive'

export default function GamingArchivePage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="gaming" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-massive font-medium font-display text-ink mb-2">Gaming Archive</h1>
            <p className="text-muted mb-10">お気に入りのゲームコレクション — Steam連携</p>
            <GamingArchive />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
