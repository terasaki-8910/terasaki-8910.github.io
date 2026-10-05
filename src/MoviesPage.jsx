import Header from './components/Header'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'
import MovieShelf from './components/movies/MovieShelf'

// Trakt に入れた映画・アニメ・ドラマの視聴履歴(2026-10-05、確認シート10回目で /movies/ を作り直すと決めた)。
// 以前の、1本ずつ手で記録する仕組み(WatchedList)は、ドラマとアニメのページだけが使う。
export default function MoviesPage() {
  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header currentPage="movies" />
        </div>
        <div className="pt-28 px-4 md:px-8 pb-24">
          <div className="bk-content max-w-6xl mx-auto">
            {/* 題の下の説明と、本棚の使い方の説明は置かない(見れば分かる。2026-10-05 本人指定) */}
            <h1 className="text-massive font-medium font-display text-ink mb-10">映画・アニメ・ドラマの視聴履歴</h1>
            <MovieShelf />
          </div>
        </div>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
