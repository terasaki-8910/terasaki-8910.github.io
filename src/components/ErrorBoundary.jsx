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
        <div className="min-h-screen bg-gradient-to-b from-[#0A0E27] to-[#151B36] flex items-center justify-center px-4">
          <div className="max-w-2xl w-full text-center">
            {/* Error Icon */}
            <div className="mb-8 flex justify-center">
              <div className="w-32 h-32 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
                <span className="text-6xl">💥</span>
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              エラーが発生しました
            </h1>
            
            <p className="text-xl text-gray-400 mb-8">
              申し訳ございません。予期しないエラーが発生しました。
            </p>

            {/* Error Details (開発環境のみ) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-8 p-6 bg-black/30 rounded-lg border border-red-500/20 text-left">
                <p className="text-red-400 font-mono text-sm mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-xs text-gray-500 overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-accent-cyan hover:bg-accent-cyan/80 text-white font-bold rounded-lg transition-all hover:scale-105"
              >
                🔄 ページを再読み込み
              </button>
              
              <a
                href="/"
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-all hover:scale-105"
              >
                🏠 ホームに戻る
              </a>
            </div>

            {/* Help Text */}
            <div className="mt-12 p-6 bg-white/5 rounded-lg border border-white/10">
              <h3 className="text-lg font-bold text-white mb-3">
                😵 問題が解決しない場合
              </h3>
              <ul className="text-sm text-gray-400 space-y-2 text-left max-w-md mx-auto">
                <li>• ブラウザのキャッシュをクリアしてみてください</li>
                <li>• 別のブラウザで試してみてください</li>
                <li>• ハードウェアアクセラレーションを有効にしてください (chrome://settings/system)</li>
                <li>• しばらく時間をおいて再度アクセスしてください</li>
              </ul>
            </div>

            {/* Footer */}
            <p className="mt-8 text-sm text-gray-600">
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
