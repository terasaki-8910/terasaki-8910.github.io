import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'

export default function NotFoundPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="notfound" />
        </div>

        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <h1
            className="font-display font-medium text-hero mb-6"
            style={{ color: 'rgb(250, 160, 160)', WebkitTextStroke: '6px black', paintOrder: 'stroke fill' }}
          >
            404
          </h1>
          <p className="text-lg md:text-xl text-muted mb-12">
            お探しのページは見つかりませんでした。
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-3 justify-center text-sm font-mono">
            <a href="/" className="text-ink hover:text-accent transition-colors">
              Home →
            </a>
            <a href="/ascii/" className="text-ink hover:text-accent transition-colors">
              3D ASCII →
            </a>
            <a href="/spotify/" className="text-ink hover:text-accent transition-colors">
              Spotify Dashboard →
            </a>
          </div>
        </div>

        <Footer />
      </div>
    </ErrorBoundary>
  )
}
