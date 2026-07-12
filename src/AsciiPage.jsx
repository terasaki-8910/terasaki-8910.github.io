import Header from './components/Header'
import AsciiGallery from './components/AsciiGallery'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'

export default function AsciiPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="ascii" />
        </div>
        <div className="pt-20">
          <AsciiGallery />
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
