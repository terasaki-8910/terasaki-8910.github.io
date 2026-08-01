import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper flex items-center justify-center px-4">
          <div className="max-w-2xl w-full text-center">
            {/* Error Title */}
            <h1 className="text-4xl md:text-6xl font-bold text-ink mb-4">
              エラーが発生しました
            </h1>

            <p className="text-xl text-muted mb-8">
              申し訳ございません。予期しないエラーが発生しました。
            </p>

            {/* Error Details (開発環境のみ) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-8 p-6 bg-surface rounded-lg border border-line text-left">
                <p className="text-red-700 font-mono text-sm mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-xs text-muted overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-accent hover:bg-accent/80 text-on-accent font-bold rounded-lg transition-colors"
              >
                ページを再読み込み
              </button>

              <a
                href="/"
                className="px-8 py-4 bg-surface hover:bg-line text-ink font-bold rounded-lg transition-colors"
              >
                ホームに戻る
              </a>
            </div>

            {/* Help Text */}
            <div className="mt-12 p-6 bg-surface rounded-lg border border-line">
              <h3 className="text-lg font-bold text-ink mb-3">
                問題が解決しない場合
              </h3>
              <ul className="text-sm text-muted space-y-2 text-left max-w-md mx-auto">
                <li>・ブラウザのキャッシュをクリアしてみてください</li>
                <li>・別のブラウザで試してみてください</li>
                <li>・ハードウェアアクセラレーションを有効にしてください (chrome://settings/system)</li>
                <li>・しばらく時間をおいて再度アクセスしてください</li>
              </ul>
            </div>

            {/* Footer */}
            <p className="mt-8 text-sm text-muted">
              © 2024 クソサイト製造工場
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
