# 直しの共通の手引き(キーボード操作・読み上げ・コントラスト)

2026-10-26 に 4 タブの直しのエージェントへ渡したもの。流れ・CT のタブの直しにも同じ決まりを使う。

## 場所と決まり
- 作業場所: サイトのリポジトリの worktree `<リポジトリ>.worktrees/visualization-methods`(ブランチ feat/visualization-methods。切り替えない)。
- git の状態を変えるコマンド(commit・stash・reset・checkout・merge・add)は使わない。コミットは親(Claude)がする。
- 同じ作業場所で、別のエージェントが別のタブ(流れ・CT・ほかの 3 タブ)のファイルを同時に直している。**自分の受け持ちのファイルだけ**を直す。作っていないファイルは消さない。
- 受け持ちの外(`src/components/visualization/**` の共有部品、`pixelKit.js`・`labelKit.js`、テスト、`.claude/**`、ほかのタブ)を直す必要があるときは、直さずに最後の報告に書く。
- 開発サーバー: worktree で `npx vite --port 5181 --strictPort --host 127.0.0.1`(http://127.0.0.1:5181/visualization-methods/)。動いていればそれを使い、ほかのエージェントのために止めない。
- 画面の道具(`.claude/visualization-methods-tools/`)は playwright-core 1.56.1 と Chrome を使う。リポジトリの外に `npm i playwright-core@1.56.1` し、環境変数 `PW_CORE` にその `node_modules/playwright-core` の場所を入れて実行する。

## 先に読むもの
1. 見直しの報告 `.claude/visualization-methods-a11y-review.md` の「共有部品」と自分のタブの節。行番号は報告時点のもの(その後に直した所はずれている)。
2. 部品と書き方の手引き `.claude/visualization-methods-kit.md`(とくに「見た目の決まり」)。
3. 既存ページのキーボード操作の例: `src/components/visualization/sims/fluidStep2.jsx`(PageUp・PageDown で選ぶ粒子を変え、矢印キーで動かす)、`transformStep1.jsx`。

## 決まっていること(この通りに直す)
1. マウス・指でしかできない操作には、同じ canvas でのキー操作を足す(`tabIndex={0}`、`onKeyDown`)。
   - 矢印キーで選んでいる物を動かす・値を変える(`rigidKit.js` の `arrowStep`。Shift で 5 倍。Alt・Ctrl・Cmd つきは null が返るので何もしない)。
   - PageUp・PageDown で前・次の物を選ぶ。Home・End は使ってもよい。Tab は canvas の中の移動に使わない(Tab は canvas から出るためのキー)。
   - 動かせる物と 3D の視点の回転が両方ある絵では、「視点」を PageUp・PageDown の選択の 1 つに入れ、選んでいるときは矢印キーで回す。
   - 数字キーは、絵の番号の表示と同じ数字のときだけ使う。Alt・Ctrl・Cmd つきは無視する。
   - 扱ったキーだけ `event.preventDefault()` する。
2. 選んでいる物は、いつも絵に出す(太い縁: `markerCircle` の lineWidth 3、または 2px の ink の枠)。選択は React の state に持つ(ref だけだと描き直されない)。
3. canvas の label(aria-label)は、何が描かれているかと、実際に効く操作(ドラッグと、キーの名前)を書く。実装と食い違わないこと。ページの中の位置の言葉(「右の図」など)は使わない。絵の中の位置は、どの幅でも正しいときだけ使う。
4. 動いている(再生中の)絵では、ドラッグを始めたとき・操作のキーを押したときに止める(再生ボタンも止まった表示になる)。動きは今の状態から続ける(キーで動かした位置が次のフレームで上書きされない)。
5. 色:
   - 意味のある線(軸・曲線・データの線)に `colors.line` を使わない(半透明で 1.3:1 しかない)。ink・muted・lane-*・diff-* を使う。accent は意味のある線に使わない。
   - canvas の文字は `colors.ink`(muted は surface の上で 4.40:1 で、小さい文字の 4.5:1 に届かない)。muted は文字以外の補助の線・図形に使う。
6. draw の中で textAlign・textBaseline・lineDash・globalAlpha・clip・font などを変えたら、`ctx.save()` / `ctx.restore()` で囲んで戻す(useCanvas はフレームごとに状態を戻さない)。
7. 触れて操作しない canvas には `scroll` を付ける(`<SimCanvas scroll ...>`。スマホで絵の上からスクロールできる)。
8. 押すと 1 回だけ何かをするボタン(2 つの状態を切り替えるのではないもの)は ToggleButton にしない。`<button type="button" className="vis-btn" onClick={...}>` にする(ResetButton と同じ形)。
9. 375px 幅で窮屈な段階の絵は、SimShell の `height={{ phone: [320, 400], pc: [280, 360] }}` で高くする(報告に挙がった段階だけ)。
10. 報告の [高] と [中] はすべて直す。[低] は手間が小さいものを直す。報告の提案が上の決まりと違うときは、上の決まりを優先する。
11. 文章の決まり(手引きのとおり): 説明文・label にページの中の位置の言葉を使わない。説明文は絵に見えることだけを書く。

## 確かめ
- テスト: `node --test "tests/vis/*.test.js" "tests/vis-page/*.test.js"`。`tests/vis-page/transformRender.test.js` の 5 件は Windows でいつも落ちる(既知)。ほかのタブのファイルで落ちるのは、別のエージェントが作業中のことがある。自分の受け持ちで落ちるものはなくす。
- ビルド: `npx vite build --outDir <下の自分の作業フォルダ>/dist --emptyOutDir`(作業場所の dist は使わない。ほかのエージェントとぶつかる)。
- 画面: `node .claude/visualization-methods-tools/shoot.mjs http://127.0.0.1:5181/visualization-methods/ <出力フォルダ> --tab <タブのid> --width 375 --height 800`(--width 1280 --height 900 と `--theme dark` も)。全体と各段階を要素ごとに撮り、コンソールのエラーを errors.txt に書く。直した段階の PNG を Read で実際に見る。
- キー操作の確かめは、自分の作業フォルダに playwright のスクリプトを書いてよい: `require(process.env.PW_CORE)`、`chromium.launch({ channel: 'chrome' })`。canvas を focus してキーを押し、押す前と後の画面を撮って比べる。
- 自分の作業フォルダ: リポジトリの外の一時フォルダ(タブごとに分ける)。

## 最後の報告(短く)
- 報告の項目ごとに: 直した/直していない(理由)。
- 変えたファイル。
- 実行した確かめと結果(テストの pass・fail の数、ビルド、見た画面)。
- 受け持ちの外の直しが必要なもの、判断が要るもの。
