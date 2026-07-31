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

// /chara-picker/ のセッションログ用エンドポイントをdev時だけ受け止める。
// src/chara/hooks/useSessionLog.ts は移植元(Bayesian-chara-picker)と
// 完全に同一のファイルとして同期している(scripts/sync-chara-picker.mjs)。
// 向こうにはこのPOSTをファイルに追記する開発用プラグインがあるが、
// こちらでは記録の必要が無い。受け側が無いとdev時に404が出続けるので、
// 204で黙って捨てる。`apply: 'serve'`なので本番ビルドには一切含まれない
// (本番では import.meta.env.DEV が false になりPOST自体が消える)。
function charaSessionLogDevPlugin() {
  return {
    name: 'chara-session-log-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__session-log', (req, res) => {
        res.statusCode = 204
        res.end()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), charaSessionLogDevPlugin()],
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
        charaPicker: resolve(__dirname, 'chara-picker/index.html'),
        notfound: resolve(__dirname, '404.html'),
      },
      output: {
        manualChunks: undefined,
      }
    }
  }
})
