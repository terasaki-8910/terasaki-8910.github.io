import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// __COMMIT_LOG__/__COMMIT_LOG_INITIAL__はビルド時にvite.config.jsのgit logから
// 注入される定数(ボット自動コミットを除外済み、親SHA・行数差分つき、
// メッセージは72文字で切り詰め済み)。データはビルド時点で確定しているため、
// Spotify/GitHub活動データのようなuseEffectでのfetchは不要。
const commits = __COMMIT_LOG__
const INITIAL_COUNT = __COMMIT_LOG_INITIAL__

// 色は「レーン番号(=X座標)」ではなく「レーンが開かれた回数」で決める。
// このリポジトリの実際の運用(1〜2コミットの短命なfeatureブランチが次々
// mainへ合流する)では、閉じたレーン番号がすぐ別の無関係なブランチに
// 再利用される。レーン番号そのものに色を固定すると、9本の別々のブランチが
// 全部「同じレーン1」を使い回すせいで全部同じ色になり、「1本の枝が
// 行ったり来たりしているだけ」に見えてしまっていた(2026-08-07、実機
// レビューで指摘。90件の実データでcomputeGraph()を直接検証して確認)。
//
// 対処: mainの色(indigo)はレーン0専用に固定し、それ以外の全レーンは
// 「開かれた通し番号」で残り4色を順に回す。トークン自体
// (index.cssの--lane-0〜4、背景に対するWCAG比は検証済み)は変えない。
const LANE_COLORS = ['var(--lane-0)', 'var(--lane-3)', 'var(--lane-2)', 'var(--lane-1)', 'var(--lane-4)']
/** mainのindigo(LANE_COLORSの0番目)を除いた、featureブランチ用の巡回色。 */
const BRANCH_COLOR_INDICES = [1, 2, 3, 4]
// レーンの「位置」(X座標)も、空いたら即座に最も左の空きへ詰めていた。
// このリポジトリの運用(短命ブランチが次々合流)では、閉じたレーンが
// 常に同じ位置(レーン1)にしか戻らないため、色を分けても「同じ場所を
// 行ったり来たりしているだけ」に見えていた(2026-08-07、実機レビューで
// 「列は2つだけじゃなくていい」と指摘)。位置についても、空きレーンの
// 再利用は「今開いているレーン数がMAX_LANESに達するまでは行わない」
// (常に右へ新しい列を足す)ことで、色だけでなく位置でも各ブランチが
// 視覚的に独立して見えるようにする。上限に達したら、そこで初めて
// 最も左の空きレーンを再利用し、横幅が際限なく伸びるのを防ぐ。
const MAX_LANES = 8
const LANE_WIDTH = 18
const ROW_HEIGHT = 40
const DOT_RADIUS = 4

/**
 * GitKraken の Commit Graph を参考にした、レーン(ブランチ)割り当てアルゴリズム。
 * `commits` は新しい→古い順。`git log --graph` と同じ考え方の簡略実装:
 * 各レーンは「次に来るべきコミットのhash」を保持し続け、そのhashを持つ
 * コミットが処理されたら、そのレーンを最も左の一致列に確定させる。
 * 複数レーンが同じhashを待っていた場合(=そのコミットが分岐の起点)は、
 * 最も左のレーン以外を「合流」として閉じる。
 *
 * 戻り値のrowsは各コミットのlane/colorを持ち、segments(rows[i]とrows[i+1]の間の
 * 接続線)は「直進」「合流(上で閉じる)」「分岐(下で開く)」の3種を区別して返す
 * (SVG描画側でパスの形を変えるため)。
 */
function computeGraph(commits) {
  const lanes = [] // lanes[i] = そのレーンが待っているコミットhash、nullなら空き
  const laneColorIdx = [] // lanes[]と同じ添字。そのレーン(座標)に今割り当てられている色のindex
  const rows = []
  const segments = [] // segments[i] = rows[i]とrows[i+1]の間の接続線たち

  const colorForLane = (lane) => LANE_COLORS[laneColorIdx[lane] ?? 0]
  // レーンを開く。レーン0(=最初に開かれるレーン。このリポジトリの運用では常にmain)
  // だけはindigo固定、それ以外は「開かれた通し番号」で残り4色を巡回させる。
  // レーン"番号"(=X座標)に直接色を固定すると、閉じたレーン番号が別の無関係な
  // ブランチにすぐ再利用されるこのリポジトリの運用(1〜2コミットの短命な
  // featureブランチが次々合流する)では、9本の別ブランチが全部同じレーン番号=
  // 同じ色になり「1本の枝が行き来しているだけ」に見えてしまっていた
  // (2026-08-07、実機レビューで指摘。90件の実データでcomputeGraph()を
  // 直接検証して確認・修正)。
  let branchColorCounter = 0
  const openLane = () => {
    // MAX_LANES未満なら常に新しい列を右へ足す。上限に達して初めて
    // 最も左の空きレーンを再利用する(位置の使い回しを遅らせる。上のコメント参照)。
    const idx = lanes.length < MAX_LANES ? lanes.length : (lanes.indexOf(null) !== -1 ? lanes.indexOf(null) : lanes.length)
    if (idx >= lanes.length) lanes.length = idx + 1
    if (idx === 0) {
      laneColorIdx[idx] = 0
    } else {
      laneColorIdx[idx] = BRANCH_COLOR_INDICES[branchColorCounter % BRANCH_COLOR_INDICES.length]
      branchColorCounter += 1
    }
    return idx
  }

  commits.forEach((commit, rowIndex) => {
    const matchIndices = []
    lanes.forEach((waitingFor, idx) => {
      if (waitingFor === commit.hash) matchIndices.push(idx)
    })

    const lane = matchIndices.length > 0 ? Math.min(...matchIndices) : openLane()
    const color = colorForLane(lane)

    // 合流: このコミットを待っていた「lane以外」のレーンは、この行で吸収されて閉じる。
    // 接続線は「1つ前の行との間」(= segments[rowIndex - 1])に属する。
    if (rowIndex > 0) {
      const converging = matchIndices.filter((idx) => idx !== lane)
      for (const idx of converging) {
        segments[rowIndex - 1].push({ type: 'converge', fromLane: idx, toLane: lane, color: colorForLane(idx) })
        lanes[idx] = null
      }
    } else {
      for (const idx of matchIndices) if (idx !== lane) lanes[idx] = null
    }

    rows.push({ commit, lane, color })

    // このコミット自身のレーンは第一親で継続(列は変わらない=直進として描く)。
    const [firstParent, ...restParents] = commit.parents
    lanes[lane] = firstParent ?? null

    // 第二親以降(マージで取り込んだ側)は新しいレーンを開き、この行の下で分岐させる。
    const rowSegments = []
    for (const p of restParents) {
      const newLane = openLane()
      lanes[newLane] = p
      rowSegments.push({ type: 'diverge', fromLane: lane, toLane: newLane, color: colorForLane(newLane) })
    }
    segments.push(rowSegments)
  })

  // 直進(このコミットと無関係に、次の行でもまだ有効なレーン)を各segmentへ追加する。
  // rows[rowIndex]処理「直後」の lanes 状態と、rows[rowIndex+1]処理「直前」の
  // lanes 状態は同じ配列を使い回しているため、rowIndexごとに直進判定をしていては
  // 二度手間になる。ここでは各行の処理直後のスナップショットを別途取り直す
  // (色の割り当てロジックも上のopenLane()と全く同じ手順で再現する必要がある)。
  const laneSnapshotsAfterRow = []
  const laneColorSnapshotsAfterRow = []
  {
    const replay = []
    const replayColorIdx = []
    let replayBranchColorCounter = 0
    const openReplayLane = () => {
      const idx = replay.length < MAX_LANES ? replay.length : (replay.indexOf(null) !== -1 ? replay.indexOf(null) : replay.length)
      if (idx >= replay.length) replay.length = idx + 1
      if (idx === 0) {
        replayColorIdx[idx] = 0
      } else {
        replayColorIdx[idx] = BRANCH_COLOR_INDICES[replayBranchColorCounter % BRANCH_COLOR_INDICES.length]
        replayBranchColorCounter += 1
      }
      return idx
    }
    commits.forEach((commit) => {
      const matchIndices = []
      replay.forEach((w, idx) => {
        if (w === commit.hash) matchIndices.push(idx)
      })
      const lane = matchIndices.length > 0 ? Math.min(...matchIndices) : openReplayLane()
      for (const idx of matchIndices) if (idx !== lane) replay[idx] = null
      const [firstParent, ...restParents] = commit.parents
      replay[lane] = firstParent ?? null
      for (const p of restParents) {
        const newLane = openReplayLane()
        replay[newLane] = p
      }
      laneSnapshotsAfterRow.push([...replay])
      laneColorSnapshotsAfterRow.push([...replayColorIdx])
    })
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const after = laneSnapshotsAfterRow[i]
    const afterColor = laneColorSnapshotsAfterRow[i]
    // 「この行のdivergeで新規に開いたレーン(toLane)」だけを除外する。
    // rows[i].lane(この行自身が乗っているレーン)は除外してはいけない——
    // このコミットが分岐・合流を起こさない限り、そのレーン自身の直進接続を
    // 描く手段がここ以外に無いため。かつてrows[i].laneを無条件でここに含めていて、
    // 分岐しない行(履歴の大半)のthrough接続が一切生成されず、グラフの接続線が
    // 消える/合流部分だけが不自然にうねって見えるバグになっていた
    // (2026-08-07、実機レビューで発覚。computeGraph()を実データに対して直接
    // 実行し、分岐の無い行のsegmentsが軒並み空配列になっていることで確認)。
    const touchedLanes = new Set(segments[i].map((s) => s.toLane))
    after.forEach((waitingFor, idx) => {
      if (waitingFor !== null && !touchedLanes.has(idx)) {
        segments[i].push({ type: 'through', fromLane: idx, toLane: idx, color: LANE_COLORS[afterColor[idx] ?? 0] })
      }
    })
  }

  const laneCount = Math.max(1, ...rows.map((r) => r.lane + 1), ...segments.flat().map((s) => Math.max(s.fromLane, s.toLane) + 1))
  return { rows, segments, laneCount }
}

/** 変更行数(挿入+削除)からバーの幅比率(0〜1)を対数スケールで求める。
 * docs/を除いた実測分布(中央値35行、90%ile 319行、最大14902行)を踏まえ、
 * 3000行で頭打ちにする——線形だとデータ移植系の巨大コミット1件が
 * 他の全コミットを誤差扱いにしてしまうため。 */
const BAR_SCALE_CEILING = 3000
function barRatio(total) {
  if (total <= 0) return 0
  return Math.min(1, Math.log10(total + 1) / Math.log10(BAR_SCALE_CEILING + 1))
}

function GraphSvg({ rows, segments, laneCount, hoveredLane, onHoverLane }) {
  const width = laneCount * LANE_WIDTH
  const height = rows.length * ROW_HEIGHT

  const x = (lane) => lane * LANE_WIDTH + LANE_WIDTH / 2

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      role="img"
      aria-label="コミットのブランチ構造"
    >
      {segments.map((rowSegments, i) =>
        rowSegments.map((seg, si) => {
          const y1 = i * ROW_HEIGHT + ROW_HEIGHT / 2
          const y2 = (i + 1) * ROW_HEIGHT + ROW_HEIGHT / 2
          const x1 = x(seg.fromLane)
          const x2 = x(seg.toLane)
          const dimmed = hoveredLane !== null && hoveredLane !== seg.fromLane && hoveredLane !== seg.toLane
          const commonProps = {
            stroke: seg.color,
            strokeWidth: 2,
            fill: 'none',
            strokeLinecap: 'round',
            className: 'transition-opacity duration-150',
            style: { opacity: dimmed ? 0.25 : 1 },
          }
          if (seg.type === 'through') {
            return <line key={si} x1={x1} y1={y1} x2={x2} y2={y2} {...commonProps} />
          }
          // converge/diverge: 1回だけ折れ曲がる二次ベジェで滑らかに繋ぐ
          const midY = (y1 + y2) / 2
          return (
            <path
              key={si}
              d={`M ${x1} ${y1} Q ${x1} ${midY} ${(x1 + x2) / 2} ${midY} Q ${x2} ${midY} ${x2} ${y2}`}
              {...commonProps}
            />
          )
        })
      )}
      {rows.map(({ lane, color }, i) => {
        const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2
        const dimmed = hoveredLane !== null && hoveredLane !== lane
        return (
          <circle
            key={i}
            cx={x(lane)}
            cy={cy}
            r={DOT_RADIUS}
            fill={color}
            className="transition-opacity duration-150 cursor-pointer"
            style={{ opacity: dimmed ? 0.35 : 1 }}
            onMouseEnter={() => onHoverLane(lane)}
            onMouseLeave={() => onHoverLane(null)}
          />
        )
      })}
    </svg>
  )
}

/**
 * ページ最下部に置く独立セクション。以前はHero内でContributionグラフの直下に
 * 置いていたが、更新履歴は主役ではないので一番下へ移した。
 * 見出しをこのコンポーネントの中に持たせているのは、コミットが0件のときに
 * 見出しだけが残る空状態を作らないため(早期returnと一緒に消える)。
 * 大見出し(text-massive)は使わない。補助的な情報なので、それだと画面内で
 * 一番目立つ要素になってしまう。
 *
 * GitKraken の Commit Graph を参考に、平坦な一覧からブランチ・マージを
 * 可視化するグラフ表示へ作り替えた(2026-08-07)。「このリポジトリ自身の
 * git commit履歴」の可視化であり、GitHub Contribution(草グラフ)とは別物。
 */
export default function CommitLog() {
  const [expanded, setExpanded] = useState(false)
  const [hoveredLane, setHoveredLane] = useState(null)
  const sectionRef = useRef()
  const rowsRef = useRef([])

  const visibleCommits = expanded ? commits : commits.slice(0, INITIAL_COUNT)
  const graph = useMemo(() => computeGraph(visibleCommits), [visibleCommits])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const els = rowsRef.current.filter(Boolean)
    const tween = gsap.fromTo(
      els,
      { opacity: 0, y: 16 },
      {
        scrollTrigger: { trigger: sectionRef.current, start: 'top 88%', end: 'top 55%', scrub: 1 },
        opacity: 1,
        y: 0,
        stagger: 0.03,
      }
    )
    return () => tween.scrollTrigger?.kill()
  }, [visibleCommits.length])

  if (!commits || commits.length === 0) return null

  return (
    <section ref={sectionRef} className="px-8 pb-24 text-left">
      {/* 他セクション(ProjectShowcase)と同じmax-w-4xl。グラフ+ハッシュ+日付+
          メッセージ+変更量バーの5列は3xl(768px)だと典型的な内容でも横スクロールが
          要る幅になってしまうため、デスクトップでは収まりやすい4xlへ広げる。
          390px等の狭い画面では引き続きoverflow-x-autoが効く。 */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-display text-ink mb-4">更新履歴</h2>

        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            <GraphSvg
              rows={graph.rows}
              segments={graph.segments}
              laneCount={graph.laneCount}
              hoveredLane={hoveredLane}
              onHoverLane={setHoveredLane}
            />
            <div className="flex-1 min-w-0" style={{ marginLeft: 8 }}>
              {visibleCommits.map((commit, i) => {
                const total = commit.insertions + commit.deletions
                const ratio = barRatio(total)
                const rowLane = graph.rows[i]?.lane ?? 0
                const dimmed = hoveredLane !== null && hoveredLane !== rowLane
                return (
                  <a
                    key={commit.fullHash}
                    href={`https://github.com/terasaki-8910/terasaki-8910.github.io/commit/${commit.fullHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm hover:text-accent group"
                    style={{ height: ROW_HEIGHT }}
                    onMouseEnter={() => setHoveredLane(rowLane)}
                    onMouseLeave={() => setHoveredLane(null)}
                  >
                    {/*
                      入場アニメーション(GSAP、scrollTriggerでopacity/yを制御)と
                      ホバー減光(React state、opacityで制御)が同じDOM要素・同じ
                      opacityプロパティを取り合うと、GSAPの直接DOM操作をReactの
                      再描画が上書きし合って正しく動かない(実機検証で発見)。
                      GSAPの対象を内側のこのラッパーに分離し、外側<a>はホバー減光
                      専任にすることで、opacityが掛け算(0.45×1=0.45等)されて
                      両方同時に効くようにしている。
                    */}
                    <span
                      ref={(el) => (rowsRef.current[i] = el)}
                      className="flex items-center gap-3 flex-1 min-w-0 transition-opacity duration-150"
                      style={{ opacity: dimmed ? 0.45 : 1 }}
                    >
                      <span className="font-mono text-muted shrink-0 w-16 group-hover:text-accent transition-colors">
                        {commit.hash}
                      </span>
                      <span className="font-mono text-muted shrink-0 w-24">{commit.date}</span>
                      <span className="text-ink truncate min-w-0 flex-1 group-hover:text-accent transition-colors">
                        {commit.message}
                      </span>
                      {/* 挿入/削除バー。0件(ビルド成果物のみの再生成コミット等)は
                          バー自体を出さず余白のみにする(空のバーは「変更0行」の
                          情報より視覚ノイズの方が大きいため)。 */}
                      <span className="shrink-0 w-20 flex items-center gap-2" aria-hidden="true">
                        {total > 0 && (
                          <span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden flex">
                            <span
                              className="h-full"
                              style={{
                                width: `${ratio * (commit.insertions / total) * 100}%`,
                                backgroundColor: 'var(--diff-insert)',
                              }}
                            />
                            <span
                              className="h-full"
                              style={{
                                width: `${ratio * (commit.deletions / total) * 100}%`,
                                backgroundColor: 'var(--diff-delete)',
                              }}
                            />
                          </span>
                        )}
                      </span>
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        {commits.length > INITIAL_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-block mt-3 text-xs font-mono text-muted hover:text-accent transition-colors"
          >
            {expanded ? '更新履歴を閉じる' : `更新履歴をすべて見る（${commits.length}件）`}
          </button>
        )}
        <a
          href="https://github.com/terasaki-8910/terasaki-8910.github.io/commits/main"
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-2 text-xs font-mono text-muted hover:text-accent transition-colors"
        >
          GitHubで全履歴を見る →
        </a>
      </div>
    </section>
  )
}
