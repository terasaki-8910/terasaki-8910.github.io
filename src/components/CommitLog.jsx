// __COMMIT_LOG__はビルド時にvite.config.jsのgit logから注入される定数
// (ボット自動コミットを除外済み、直近15件、メッセージは72文字で切り詰め済み)。
// データはビルド時点で確定しているため、Spotify/GitHub活動データのような
// useEffectでのfetchは不要。
const commits = __COMMIT_LOG__

// ページ最下部に置く独立セクション。以前はHero内でContributionグラフの直下に
// 置いていたが、更新履歴は主役ではないので一番下へ移した。
// 見出しをこのコンポーネントの中に持たせているのは、コミットが0件のときに
// 見出しだけが残る空状態を作らないため(早期returnと一緒に消える)。
// 大見出し(text-massive)は使わない。補助的な情報なので、それだと画面内で
// 一番目立つ要素になってしまう。
export default function CommitLog() {
  if (!commits || commits.length === 0) return null

  return (
    <section className="px-8 pb-24 text-left">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-display text-ink mb-4">更新履歴</h2>
        <div className="space-y-1.5">
          {commits.map((commit) => (
            <div key={commit.fullHash} className="flex items-baseline gap-3 text-sm">
              <a
                href={`https://github.com/terasaki-8910/terasaki-8910.github.io/commit/${commit.fullHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-muted hover:text-accent transition-colors shrink-0"
              >
                {commit.hash}
              </a>
              <span className="font-mono text-muted shrink-0">{commit.date}</span>
              <span className="text-ink truncate">{commit.message}</span>
            </div>
          ))}
        </div>
        <a
          href="https://github.com/terasaki-8910/terasaki-8910.github.io/commits/main"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-xs font-mono text-muted hover:text-accent transition-colors"
        >
          GitHubで全履歴を見る →
        </a>
      </div>
    </section>
  )
}
