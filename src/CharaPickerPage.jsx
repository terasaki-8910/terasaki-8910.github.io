import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import CharaPickerApp from './chara/CharaPickerApp'

export default function CharaPickerPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="chara" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-massive font-medium font-display text-ink mb-2">
              理想の推しア◯ネイター
            </h1>
            <p className="text-muted mb-10">
              いくつかの質問に答えると、条件に合うキャラを推測します
            </p>
            <CharaPickerApp />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
