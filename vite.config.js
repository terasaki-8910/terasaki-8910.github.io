import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { execSync } from 'child_process'

const COMMIT_LOG_LIMIT = 15
const MESSAGE_MAX_LENGTH = 72
// Spotify/GitHub活動データの自動更新ワークフローがこの名前でコミットする
// (.github/workflows/update-spotify.yml, update-github-activity.yml)。
// 「アプリのコミット履歴」として意味のある人間のコミットだけを見せたいため除外する。
const BOT_AUTHOR_NAMES = new Set(['GitHub Action'])

function truncate(message) {
  if (message.length <= MESSAGE_MAX_LENGTH) return message
  return `${message.slice(0, MESSAGE_MAX_LENGTH - 1)}…`
}

// ビルド時点のgit logをコミットログ表示用に取得する。
// deploy.ymlのcheckoutをfetch-depth:0(full history)にしていることが前提。
// shallow cloneだと直近1コミットしか取れず機能が壊れるので、その修正とセット。
function getCommitLog() {
  try {
    const raw = execSync(
      `git log -n 40 --pretty=format:%H%x09%ad%x09%an%x09%s --date=short`,
      { encoding: 'utf-8' }
    )
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [fullHash, date, author, ...rest] = line.split('\t')
        return { fullHash, date, author, message: rest.join('\t') }
      })
      .filter((c) => !BOT_AUTHOR_NAMES.has(c.author))
      .slice(0, COMMIT_LOG_LIMIT)
      .map(({ fullHash, date, message }) => ({
        hash: fullHash.slice(0, 7),
        fullHash,
        date,
        message: truncate(message),
      }))
  } catch {
    return []
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // username.github.ioのユーザーサイトは常にドメインルートで配信されるため
  // 絶対パスを使う。相対パス(./)だと、GitHub Pagesが404.htmlを任意の深さの
  // 存在しないURL(例: /foo/bar/baz)にそのまま返したときに、アセットの
  // 相対パスがそのURLの深さを基準に解決されてしまい壊れる。
  base: '/',
  define: {
    __COMMIT_LOG__: JSON.stringify(getCommitLog()),
  },
  build: {
    outDir: 'docs',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      external: [],
      input: {
        main: resolve(__dirname, 'index.html'),
        ascii: resolve(__dirname, 'ascii/index.html'),
        spotify: resolve(__dirname, 'spotify/index.html'),
        gomiTsukuba: resolve(__dirname, 'gomi-tsukuba/index.html'),
        notfound: resolve(__dirname, '404.html'),
      },
      output: {
        manualChunks: undefined,
      }
    }
  }
})
