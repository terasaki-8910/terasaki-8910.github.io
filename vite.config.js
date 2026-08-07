import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { execSync } from 'child_process'

// 画面の初期表示件数(「すべて見る」で展開する前)。
const COMMIT_LOG_INITIAL = 15
// 「すべて見る」展開後も含めた取得件数の上限。無限に伸ばすとビルド時間と
// バンドルサイズが際限なく増えるため、実用上十分な深さで打ち切る。
const COMMIT_LOG_FULL = 120
const MESSAGE_MAX_LENGTH = 72
// Spotify/GitHub活動データの自動更新ワークフローがこの名前でコミットする
// (.github/workflows/update-spotify.yml, update-github-activity.yml)。
// 「アプリのコミット履歴」として意味のある人間のコミットだけを見せたいため除外する。
const BOT_AUTHOR_NAMES = new Set(['GitHub Action'])

function truncate(message) {
  if (message.length <= MESSAGE_MAX_LENGTH) return message
  return `${message.slice(0, MESSAGE_MAX_LENGTH - 1)}…`
}

// `git log --numstat --pretty=format:'COMMIT %H'` の出力を
// { fullHash: {insertions, deletions} } に集計する。
// バイナリファイル(フォント等)はnumstatが "-\t-\tpath" を返すため除外する。
// docs/ はビルド成果物(src/の再構築でしかない)なので変更量の集計対象外にする
// (含めると、通常のコード変更コミットが誤差扱いになるほどdocs/の行数が支配的になる)。
function parseNumstat(raw) {
  const stats = {}
  let currentHash = null
  let insertions = 0
  let deletions = 0
  const flush = () => {
    if (currentHash) stats[currentHash] = { insertions, deletions }
  }
  for (const line of raw.split('\n')) {
    const commitMatch = /^COMMIT (\S+)$/.exec(line)
    if (commitMatch) {
      flush()
      currentHash = commitMatch[1]
      insertions = 0
      deletions = 0
      continue
    }
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length !== 3) continue
    const [added, removed, path] = parts
    if (path.startsWith('docs/')) continue
    if (added !== '-') insertions += Number(added)
    if (removed !== '-') deletions += Number(removed)
  }
  flush()
  return stats
}

// ビルド時点のgit logをコミットグラフ表示用に取得する。
// deploy.ymlのcheckoutをfetch-depth:0(full history)にしていることが前提。
// shallow cloneだと直近1コミットしか取れず機能が壊れるので、その修正とセット。
//
// 親SHA(%P)も取得するのは、レーン(ブランチ)のDAG構造をクライアント側で
// 復元するため(CommitGraph.jsx)。ボットコミットは表示から除外するが、
// 人間のコミットの親がボットコミットを指しているケースはそのまま残ると
// グラフに「繋がらない」ノードが混ざるため、CommitGraph.jsx側で
// 除外済みコミットを飛び越えて実の祖先まで辿り直す。
function getCommitLog() {
  try {
    const raw = execSync(
      `git log -n ${COMMIT_LOG_FULL * 2} --pretty=format:%H%x09%P%x09%ad%x09%an%x09%s --date=short`,
      { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }
    )
    const statsRaw = execSync(
      `git log -n ${COMMIT_LOG_FULL * 2} --numstat --pretty=format:'COMMIT %H'`,
      { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }
    )
    const statsByHash = parseNumstat(statsRaw)

    const allCommits = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [fullHash, parents, date, author, ...rest] = line.split('\t')
        return {
          fullHash,
          parents: parents ? parents.split(' ') : [],
          date,
          author,
          message: rest.join('\t'),
        }
      })

    const isBot = (fullHash) => {
      const c = allCommits.find((x) => x.fullHash === fullHash)
      return c ? BOT_AUTHOR_NAMES.has(c.author) : false
    }
    // ボットコミットを飛び越えて、表示対象になりうる実の親まで辿る
    // (ボットコミット自身も表示除外なので、そのままだとグラフの接続が途切れる)。
    const byHash = new Map(allCommits.map((c) => [c.fullHash, c]))
    function resolveVisibleParents(fullHash, seen = new Set()) {
      if (seen.has(fullHash)) return []
      seen.add(fullHash)
      const c = byHash.get(fullHash)
      if (!c) return [] // 取得範囲外(履歴の境界)
      if (!isBot(c.fullHash)) return [c.fullHash]
      return c.parents.flatMap((p) => resolveVisibleParents(p, seen))
    }

    return allCommits
      .filter((c) => !BOT_AUTHOR_NAMES.has(c.author))
      .slice(0, COMMIT_LOG_FULL)
      .map(({ fullHash, parents, date, message }) => ({
        hash: fullHash.slice(0, 7),
        fullHash,
        // 表示除外されたボットコミットを飛び越えた後の、実際に画面へ出る親のhash(短縮形)。
        parents: [...new Set(parents.flatMap((p) => resolveVisibleParents(p)))].map((p) => p.slice(0, 7)),
        date,
        message: truncate(message),
        insertions: statsByHash[fullHash]?.insertions ?? 0,
        deletions: statsByHash[fullHash]?.deletions ?? 0,
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
    __COMMIT_LOG_INITIAL__: JSON.stringify(COMMIT_LOG_INITIAL),
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
