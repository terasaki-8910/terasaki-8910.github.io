// __COMMIT_LOG__はビルド時にvite.config.jsのgit logから注入される定数
// (ボット自動コミットを除外済み、直近15件、メッセージは72文字で切り詰め済み)。
// データはビルド時点で確定しているため、Spotify/GitHub活動データのような
// useEffectでのfetchは不要。
const commits = __COMMIT_LOG__

export default function CommitLog() {
  if (!commits || commits.length === 0) return null

  return (
    <div className="max-w-3xl mx-auto mt-8 text-left">
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
  )
}
