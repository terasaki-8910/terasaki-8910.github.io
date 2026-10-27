# visualization-methods 4 タブ UI レビュー(読み取りのみ・修正なし)

前提と限界
- 対象は sims 36 ファイル、kit 4 本、TransferFunctionEditor、sections 4 本、共有部品 7 つ。
- Bash が使えないため、npm test、vite build、画面確認、スクリーンリーダー確認は未実施。コード読みと grep のみ。
- コントラスト比は `src/index.css` のトークンから手計算した。実画面で確かめた値ではない。
- 重大度の基準
  - 高: マウスなしでその段階の主操作ができない、または実行時例外。
  - 中: 副次操作の欠落、誤解を招く表示、意味のある図形・文字の基準未達、スマホの崩れ。
  - 低: 磨き込み。

## 検査 7 項目の結果

1. aria-label
   - 36 canvas すべてに label がある。ただし、実装と食い違うものがある: IsosurfaceSim、IsosurfaceStep1・3・6、VolumeStep1・2・5、TF エディタ。
   - 位置語がレイアウトと食い違うものがある: ShapeStep5、IsosurfaceStep5・6。
   - 選択中の対象は、どの sim でも読み上げに出ない(下の共有 S1)。
2. キーボード: 次の段階はポインタ専用の操作がある。
   - ShadingStep1: 面の選択。
   - ShapeStep8: 視点回転。
   - IsosurfaceSim: 粒子 1〜4 と 3D の視点回転。
   - IsosurfaceStep1: 角の値 f0〜f7。
   - IsosurfaceStep3: 粒子 1・2 と断面線。
   - IsosurfaceStep6: 円の中心。
   - VolumeStep1: ブロック 1・2。
   - VolumeStep2: σ の棒。
   - VolumeStep5: 端点 2。
3. canGrab: 合格。`usePointerDrag` 35 箇所すべてで渡している。VolumeStep4 は操作がないので不要。
4. reduced motion: 合格。
   - 自前の rAF、setInterval、addEventListener は 0 件(grep 確認)。
   - ループは useSimLoop のみ(ShapeStep3・6、ShadingSim、IsosurfaceSim、IsosurfaceStep9)。
   - ただし ShapeStep3・6 と IsosurfaceSim は、操作しても再生を止めない(後述)。
5. 操作の名前
   - ParamSlider、ModeSwitch、ToggleButton、ResetButton はすべて名前あり。アイコンのみのボタンはない。
   - 例外: ToggleButton を実行ボタンに流用している 2 箇所(IsosurfaceStep4・9)。
6. 色
   - 16 進や rgb の直書きはない(grep 確認)。
   - `var(--…)` はトークンのみ。例外は IsosurfaceStep6 L143 の 1 件。
   - accent は線に使っていない(つまみや点のみ)。
   - 基準未達は 2 点: `colors.line` を軸やデータ線に使っている、`colors.muted` を文字に使っている。
   - 手計算の値(light)
     - muted 文字 / surface = 4.40:1(文字は 4.5 必要)。
     - `colors.line` / surface ≈ 1.31:1(図形は 3 必要)。
     - lane-1 / surface = 3.25:1(図形は可、文字は不可)。
     - ink / lane-1 は light で 4.30:1、dark で 1.75:1。
7. 実行時
   - 確定の例外は 1 件: TransferFunctionEditor。
   - canvas 状態の漏れが 2 件: VolumeStep2、VolumeStep5。
   - リークはない。リスナーと observer はすべて共有フックの cleanup 内にある。
   - 全 import の export 実在を確認済み。IsosurfaceStep9 の `advectSemiLagrangian2D` は out と入力が別配列になるよう swap されていて例外にならない。

## 優先して直すもの(上から)

1. TransferFunctionEditor L100–112: プリセット切替後に矢印キーで TypeError。
2. 選択を持つ sim にキー選択を足す(PageUp / PageDown)。対象は IsosurfaceSim・Step1・Step3・Step6、VolumeStep1・2・5、ShadingStep1。
3. IsosurfaceSim: キー操作が再生に上書きされる問題。
4. 選択状態を可視化する(ShadingStep3・4・5・6・8)。
5. `colors.line` を軸やデータ線に使う箇所を `colors.muted` へ。ShadingStep5 のブリン-フォン系列は特に。
6. `useCanvas.redraw` を save/restore で囲む(VolumeStep2 の文字が切れる件)。
7. ToggleButton の流用をやめる(IsosurfaceStep4・9)。
8. スマホ幅(375px)の崩れ: ShapeStep5・7、VolumeStep5。
9. VolumeStep4 の `scroll` 抜けと、`var(--surface, …)` の修正。

共通の直し方(提案)
- 巡回は PageUp = 前、PageDown = 次に統一する。現状は shape / shading が PageUp = 次、TF エディタが PageUp = 前で逆。
- 選択は state にする。ref の場合は `redraw()` を呼ぶ。
- 選択中のつまみは縁を太くする(shape の 3.5 が手本)。
- label の書式は「何が描いてあるか → つかめる物 → 選択のキー → 移動のキー(Shift で 5 倍)」にそろえる。

## 共有部品(対象外だが原因)

`src/components/visualization/SimCanvas.jsx`
- [中] L9–15(S1): role="img" のまま tabIndex と onKeyDown を受ける。
  - NVDA/JAWS のブラウズモードでは、矢印キーが canvas に渡らない可能性が高い(未検証)。選択中の対象や値の変化も読み上げられない。
  - 修正: tabIndex があるときは role="application" と aria-roledescription を付ける。キー操作時だけ更新する `role="status"` の非表示領域を SimShell に足し、「選択中: P3」「値: 0.40」を出す。

`src/components/visualization/useCanvas.js`
- [中] L67–75(S2): `redraw` が `ctx.save()` / `restore()` で囲んでいない。
  - draw が変えた textAlign などが次の描画に残る(VolumeStep2、VolumeStep5 が実際に踏む)。
  - 修正: `ctx.save(); drawRef.current?.(...); ctx.restore()`。既存ページの文字位置が変わらないか画面確認が要る。

`src/components/visualization/sims/rigidKit.js`
- [低] L26–31(S3): `arrowStep` が Alt / Ctrl / Meta を見ない。
  - canvas にフォーカスがあると、Alt+← の戻るが効かなくなる。
  - 修正: `if (event.altKey || event.ctrlKey || event.metaKey) return null`。
  - 同じ問題が IsosurfaceStep6 L123 と Step8 L137 の数字キーにもある(Ctrl/Cmd+数字のタブ切替を潰す)。

`tests/vis-page/methodsJsx.test.js`
- [低] L34: 正規表現が `var(--x)` の閉じ括弧までを要求するので、`var(--surface, var(--color-paper))` を見逃す。
  - 修正: `/(rgb/()?var/((--[a-z0-9-]+)/g`。

`src/components/visualization/visualization.css`
- [低] L118–126: `touch-action: none` が canvas 全面に掛かる。
  - スマホで 220〜300px の絵の上ではスクロールできない(全 sim 共通)。
  - 現状のまま許容するなら、操作しない canvas だけは `scroll` を付ける(VolumeStep4 を参照)。

## shape タブ

`.../sims/shapeSim.jsx`(以下、パスは `src/components/visualization-methods/` からの続き)
- [低] L192–200: 凡例に接線(lane-3)、法線(lane-4)、曲線上の点(lane-0)がない(L109–111 で描画している)。
  - 修正: `{ key:'tangent', symbol:'T', label:'単位接線', swatch:'var(--lane-3)' }` などを足す。
- [低] L162–168、L206、L211: 曲線上の点をキーで選べるのは、u スライダーを触ったときだけ。PageUp / PageDown の巡回に入らず、label にも書いていない。
  - 修正: 巡回の 8 番目に入れるか、label に「u スライダーで動かせる」と書く。

`.../sims/shapeStep1.jsx`
- [低] L49: 内外の塗りが alpha 0.07(約 1.1:1)で、light ではほぼ見えない。内外は Q の文字(L69)でも出るので致命的ではない。
  - 修正: alpha を上げるか、境界の見せ方を足す。

`.../sims/shapeStep2.jsx`
- [低] L115: label が「端点を選べる」とだけで、P(t) はスライダーを触ると選ばれる仕様(L123)に触れていない。
- [低] L46: muted 文字(4.40:1)。→ ink。

`.../sims/shapeStep3.jsx`
- [中] L51–53、L77–82、L109、L141: 既定で再生中なのに、t のつまみ、スライダー、キーのどれで t を動かしてもループは止まらない。毎フレーム t を進めるので、つまんだ点が逆らって動く。
  - ShadingSim の L114 / L131 は pause している。
  - 修正: これら 4 箇所で `loop.pause()`。

`.../sims/shapeStep4.jsx`
- [中] L44–49、L58–65: グラフの軸と目盛り線が `colors.line`(約 1.3:1)。
  - 修正: `drawAxes` と同じ `colors.muted`。
- [低] L75–76: 目盛り文字が muted。→ ink。
- [低] L81: 基底曲線 4 本が色だけの区別。凡例(L168)はあるが、曲線上にラベルがない。
  - 修正: 頂点付近に B0〜B3 を書く。

`.../sims/shapeStep5.jsx`
- [中] L44–55: 幅 < 高さ×1.6 の縦並びで、下のグラフの高さが STEP_MARGIN(上 24・下 36)を引くと極端に小さい(手計算)。
  - 375px 幅で --stage-h ≈ 232px とすると、split=150、graph=82、plot 高さは約 22px。
  - 修正: SimShell に `height={{ phone: [320, 400], pc: [280, 360] }}` を渡す(isosurface Step3・5・6 と同じ)。縦並びのときは margin も詰める。
- [中] L62–72、L81–102: 軸が `colors.line`。→ muted。
- [低] L94、L101: 目盛り文字が muted。
- [低] L166: label の「その下の基底関数」は、横並び(L45)では右になる。→「基底関数のグラフ」。

`.../sims/shapeStep6.jsx`
- [中] L62–67、L127: 再生中(既定)に回数スライダーを動かしても、0.8 秒後に次の回数へ進む。つまみが勝手に動く。
  - 修正: onChange で `loop.pause()`。
- [低] L43–46: k=6 で約 3,200 点 × 321 サンプル(約 100 万回の hypot)を、制御点のドラッグごとに再計算する。
  - 修正: perEdge と limit の分割数を減らす。

`.../sims/shapeStep7.jsx`
- [中] L58–61: ShapeStep5 と同じ問題。split=155 のため、375px 幅で曲率グラフの plot 高さは約 17px。目盛り 3 個(L111)が重なる。
- [中] L89–103: 軸が `colors.line`。→ muted。
- [低] L109、L111: 目盛り文字が muted。

`.../sims/shapeStep8.jsx`
- [中] L150–175、L177–193: 空き領域のドラッグによる視点回転(L157–159、L169–172)に、キーの経路がない。矢印は選択点の高さにしか使われず、yaw / pitch のスライダーもない。
  - 修正: yaw / pitch の ParamSlider を足す。ページの決まり「動かした結果にスライダーが追従」にも合う。
  - `arrowStep` は Shift を 5 倍に使っているので、Shift+矢印での回転は避ける。
- [低] L140: 当たり判定が 13px(`POINT_R + 7`)。他の sim は 19px(GRAB_SLOP_PX を使用)。

`.../sims/shapeKit.js`
- [低] L44–48: `drawControlPoints` が save / restore なしで font、textAlign、textBaseline を変更する。S2 を直せば解消する。

## shading タブ

`.../sims/shadingKit.js`
- [中] L113–129: `drawAngleHandle` に「選択中」の引数がない。
  - Step3・4・5 は PageUp / PageDown で対象を切り替えても、何も変わって見えない。
  - 修正: `selected` 引数を足し、縁を 3.5 にする。

`.../sims/shadingSim.jsx`
- 良い例: 操作時に `loop.pause()` する(L114、L131)、autoStart:false。
- [低] L169–170、L174–175: ControlGroup と ModeSwitch が同名(陰影、材質)。読み上げが重なる。

`.../sims/shadingStep1.jsx`
- [高] L162–186、L199: 面の選択(onDown L164–170)がポインタだけ。キーは回転(L180–186)のみで、選択面は分割数スライダーで 0 に戻る以外に変えられない。
  - 修正: PageUp / PageDown で `selectedFace` を ±1(後ろ向きの面は飛ばす)、または「選択面」の ParamSlider を足す。label にも書く。
- [中] L103–109: 頂点法線の矢印(muted、1px)が球の上に描かれる。light で約 1.4:1、dark では ink 矢印が明るい球の上で約 1.7:1。
  - 修正: 矢印の下に surface 色の太線を敷く。

`.../sims/shadingStep2.jsx`
- [中] L63–86: グラフの軸が `colors.line`。→ muted。
- [低] L77、L85: 目盛り文字が muted。
- [低] L124–129: 上下キーも `preventDefault` されるのに何も起きない。→ `step.dx === 0` なら return。

`.../sims/shadingStep3.jsx`(L22、L77–88)、`shadingStep4.jsx`(L23、L84–95)、`shadingStep6.jsx`(L59、L164–169)、`shadingStep8.jsx`(L72、L170–175)
- [中] 操作対象を `useRef` で持つため、PageUp / PageDown で切り替えても再描画されない。どれが選択中か、画面にも読み上げにも出ない。ポインタで触った後も同じ。
  - 修正: useState にして、選択中のつまみの縁を太くする。
- Step6 [低] L167: PageUp / PageDown は light ↔ probe-0 の往復だけで、probe-1 は選べない(重みは共有なので動作は同じ)。
- Step4 [低] L183–184、L59–60: ローブが ink と muted の濃淡だけで区別されている。→ 一方を破線に。

`.../sims/shadingStep5.jsx`
- [中] L68、L224–235: 選択が ref で見えない(上の項目と同じ)。
- [中] L174–180、L253: 「ブリン-フォン」の系列が `colors.line` の破線(約 1.3:1)で、データ線なのにほぼ見えない。凡例の swatch も `var(--color-line)`。
  - 修正: `colors.muted` の破線、swatch も `var(--color-muted)`。
- [中] L151–157: グラフの軸が `colors.line`。→ muted。
- [低] L132: 文字が lane-1(surface 上 3.25:1)。→ ink にして色は線で示す。
- [低] L164、L172: 目盛り文字が muted。

`.../sims/shadingStep7.jsx`
- [中] L112–117: → キーで θ が増えるが、入射点は L20 で `center[0] - sin(θ)*radius` にあるため、→ を押すとつまみが左へ動く(← で右)。
  - 修正: `value - step.dx * 2°`。

`.../sims/shadingStep8.jsx`
- [中] L121–125: 箱を lane-1 で塗り、'箱' を ink で書いている。light で 4.30:1、dark で 1.75:1。
  - 修正: 箱の外に書く。
- [低] L85: 光線が alpha 0.1(約 1.2:1)。

`.../sections/shading.js`
- [低] L165: 「左右の明るさ」。三角形は常に横並びなので誤りではないが、手引き L107 の位置語禁止に反する。

## isosurface タブ

`.../sims/isosurfaceSim.jsx`
- [高] L219–229、L158–169: キー操作は粒子 0 だけ(`selectedRef` は L216 の onUp で -1 に戻るので、常に index 0)。
  - さらに、既定で再生中なのに onKeyDown が `loop.pause()` しない。次フレームの L161 が `INITIAL_BALLS` 基準で位置を上書きするので、キーで動かした結果は 1 フレームで消える。
  - 修正: onKeyDown で `loop.pause()`。PageUp / PageDown で粒子 0〜4 を選ぶ(ref なら `redraw()` する)。アニメーションの基準を `INITIAL_BALLS` ではなく最新の balls にする。
- [中] L195–201、L251: 3D の視点回転がポインタだけで、3D の label にキーの説明もない。
  - 修正: 3D のときだけ yaw / pitch のスライダーを ViewStack で足す。
- [中] L158–169: ドラッグした粒子位置は balls に入るが、「再生」を押すと `INITIAL_BALLS` から動き出し、動かした位置が捨てられる(上の修正で同時に直る)。
- [低] L253: 凡例 'field' の swatch が `var(--color-paper)` 始まり。描画は surface 始まり。→ `var(--color-surface)`(Step2・3 は正しい)。
- [低] L115–137: 3D は格子 40³ のマーチングキューブとソフトウェア描画を、再生中は毎フレーム実行する。

`.../sims/isosurfaceKit.js`
- [低] L52–56: `drawFieldImage` が呼ぶたびに canvas を生成する。→ pixelKit の `blitPixels` を使う。

`.../sims/isosurfaceStep1.jsx`
- [高] L153、L164–171: 角の値(f0〜f7、この段階の主操作)がポインタだけ。キーは、ポインタで選んだ値の上下か probe の移動のみ。
  - 修正: PageUp / PageDown で f0〜f(n-1) と probe を巡回し、選択後に `redraw()`。
- [中] L105–116 と L180–181: 凡例と描画の色が違う。
  - 描画では手前の補間(f_A、f_B とそれを結ぶ線)が lane-2 だが、凡例「手前の補間 / 横の補間」は lane-0。
  - 2D では「縦の補間」(lane-3)に対応する描画がない。
  - 修正: 凡例を描画の色に合わせる。
- [低] L178: label に何が描いてあるかがない。操作の説明だけ。

`.../sims/isosurfaceStep2.jsx`
- [低] L52–53: dark で、ink の文字が lane-1 の場の上に載る所は約 1.75:1。

`.../sims/isosurfaceStep3.jsx`
- [高] L21、L102–111、L116: 粒子 1・2 と断面線がポインタだけ(selectedRef の既定は index -1 で、キーは粒子 0)。label は「選んだ対象」と書くが、選ぶ手段がない。
- [低] L119: 凡例の「各粒子の山」が 1 色(lane-0)だが、描画は粒子ごとに lane-0〜2(L53)。

`.../sims/isosurfaceStep4.jsx`
- [中] L114: ToggleButton(pressed={false})を「点を作り直す」の実行ボタンに使っている。読み上げは「トグルボタン、オフ」で、押しても状態が変わらない。
  - 修正: `<button type="button" className="vis-btn">`、または SimButtons に ActionButton を追加。

`.../sims/isosurfaceStep5.jsx`
- [低] L128: label の「上の端点」「下は…」は、幅 520px 以上(L39)の左右並びでは誤り。→「辺の両端の値」「格子辺の交点と真の円」。
- [低] L118: キー 1 / 2 が端点 a / b に対応することが画面に出ない。
- [低] L59–61: しきい値 0 の基準線が `colors.line`。

`.../sims/isosurfaceStep6.jsx`
- [高] L122–136: 円の中心のドラッグ(L115–119)にキーの経路がない。
  - 既定は corner 選択で、矢印は角の選択移動(L128–134)に使われる。円(kind 'circle')はポインタで触ったときしか選ばれない。
  - 修正: 5 キーか PageUp / PageDown で円を選べるようにする。
- [中] L141、L145–146: label と凡例の「左の四隅」「右の円」「左の case」「右の線分」は、幅 520px 未満(L25–31)の上下並びでは誤り。画面に見える文字なので全員に影響する。
- [中] L143: `var(--surface, var(--color-paper))`。`--surface` は存在しないので常に paper(light は黄色)になる。描画の外側の角は surface。→ `var(--color-surface)`。
- [低] L81: 8px の muted 文字が、マスの色(内側は lane-1 に近づく)の上に載る。内側で約 1.4:1。→ 11px の ink。
- [低] L123: 数字キーが修飾キーを無視する(S3)。
- [低] L113–114: 角のトグルは pointerdown でクリック動作なのに、grab カーソルが出る。→ `cursorAt` で pointer。

`.../sims/isosurfaceStep7.jsx`
- [低] L113–119、L124: キー 1〜4 がどの縦棒か画面に出ない(ラベルは f00 / f10 / f01 / f11、L81、L89)。→「1: f00」。

`.../sims/isosurfaceStep8.jsx`
- [中] L97、L137–140、L161: 画面の角の番号は 0〜7 なのに、キーは 1〜8(index = key − 1)。0 の角が 1 キーになる。
  - 修正: キーを 0〜7 にする。式の k=0..7 と合う。
- [低] L146: 左右キーの yaw が、ポインタ(L130 `yaw -= dx`)と逆向き。→ `yaw -= step.dx * 0.08`(pitch は一致している)。
- [低] L120: `canGrab: () => true` のため、クリックでトグルする角の上でも grab が出る。

`.../sims/isosurfaceStep9.jsx`
- [中] L187: ToggleButton(pressed={false})を「距離に直す」の実行ボタンに使っている(Step4 と同じ)。
- [低] L43–44: `useRef(exactDistance(...))` と `useRef(new Float64Array(...))` の初期値が毎レンダー評価される。ドラッグ中は pointermove ごとに約 9,000 回の評価と 73KB の確保が走る。→ 遅延初期化。
- [低] L69–73: 毎フレーム canvas を生成する。
- [低] L75–84: 距離線(muted、1px)が、muted を混ぜた背景の上で外側ほど約 2.5:1 以下。

`.../sections/isosurface.js`
- 問題なし。

## volume タブ

`.../sims/TransferFunctionEditor.jsx`
- [高] L11、L100–112: 実行時例外。
  - `selected` は、プリセット切替で点の数が変わっても直されない(中身 8 点 ↔ 骨 4 点 ↔ 全部 6 点)。
  - 範囲外の `selected` で矢印キーを押すと、L105 の `next[i].alpha` と L108 の `next[i + 1].value` で TypeError になる。
  - 再現手順: 中身(8 点)で canvas を選び、PageDown を 7 回押す。次にプリセット「骨」を選び、canvas で矢印キーを押す。VolumeStep4 でも同じ。
  - 修正: `const i = Math.min(selectedRef.current, pointsRef.current.length - 1)`。あわせて `useEffect(() => setSelected((s) => Math.min(s, points.length - 1)), [points.length])`。
- [中] L87–94: Tab を点の移動に使っている。canvas を抜けるのに点の数だけ Tab(戻りは Shift+Tab)が要る。他の sim は PageUp / PageDown。→ Tab の処理を消す。
- [低] L95–99: PageUp = 前の点。shape / shading は PageUp = 次(`direction = PageUp ? 1 : -1`)で逆。
- [低] L10、L114: label に点の選び方がない。選択中の点の value / alpha が、文字でどこにも出ない。→ label に Tab / PageUp / PageDown を書き、選択中の値を非表示ステータスか凡例に出す。
- [低] L114: `height={120}` は効かない。
  - `.vis-canvas` は `height:auto` + aspect-ratio(visualization.css L118–126)。
  - 段階では `.vis-sim[data-size='step'] .vis-canvas`(L235–238)が当たり、エディタが絵と同じ 220〜360px になるはず(CSS から読んだ推測、要画面確認)。

`.../sims/volumeSim.jsx`
- [低] L97–105: キー長押しで 160×160 の全解像度を毎回描く。ポインタ時だけ 80×80(`dragging`)に落ちる。
- [低] L74–78、L82: 軸ラベル 'z' が lane-1(3.25:1)、'y' が muted(4.40:1)。
- [低] L125: 凡例の色見本は合成モード用。MIP は灰色のランプ、等値面は単色。

`.../sims/volumeStep1.jsx`
- [高] L14、L68–81: ブロック 1・2 がポインタだけ。`selected` は onDown でしか変わらず、キーは常にブロック 0。label にも選び方がない。
- [低] L27–31: 軸が `colors.line`。x 軸に目盛りも単位もない(手引き L79)。

`.../sims/volumeStep2.jsx`
- [高] L66–74: 左右キーは index を動かすだけで kind は据え置き。σ(吸収)の棒がキーで選べない。
  - 修正: PageUp / PageDown などで kind を切り替える。
- [中] L43: `ctx.textAlign = 'right'` を戻さない。
  - resize 直後の描画以降、L39 の 'σ'・'Lₑ'・'各点の寄与' が右揃えになり、'各点の寄与'(約 60px)は左に切れる。ドラッグ後に起きる。
  - 修正: draw の先頭で textAlign を戻す。根本は S2。
- [低] L76–78: 凡例に σ と Lₑ の系列(lane-0 / lane-3 の縦線 L33、L35)がなく、色だけの区別。

`.../sims/volumeStep3.jsx`
- [低] L71–75: render 中の `getColors()` で凡例の色見本を作るため、テーマを切り替えても次の state 変更まで古い色のまま。

`.../sims/volumeStep4.jsx`
- [中] L37: 操作しない canvas に `scroll` がなく、touch-action: none のまま。スマホで 220〜300px の絵の上ではスクロールできない。
  - 修正: `<SimCanvas ... scroll />`。
- TF エディタの注意(選択の範囲外)は TransferFunctionEditor の項を参照。

`.../sims/volumeStep5.jsx`
- [高] L77–81: 端点 2 がポインタだけ(`selected` 既定 0)。
- [中] L21、L54: 高さ < 263px(幅 ≤ 約 420px のスマホ)で、下の 3 枚の小画像(y0 = height − 82)が、断面の下端(18 + side)に 8〜16px 重なる。計算上のもの。
  - 修正: `side` を `min(width*0.42, height*0.62, height - 112)` にする、または phone の高さを 300px 以上にする。
- [低] L69: textAlign center を戻さず、次の描画で L53 の '線形'・'最近傍' がずれる。

`.../sims/volumeStep6.jsx`
- [中/低] L40: 板 1 枚ごとに canvas を生成する(最大 64 枚 × 再描画ごと)。
  - iOS Safari の canvas メモリ上限に当たりやすい(要実機)。
  - 修正: 1 枚を使い回す(pixelKit の `blitPixels` と同じ方式)。

`.../sections/volume.js`、`.../sections/shape.js`
- 問題なし(位置語は shading.js L165 のみ)。

## 未確認のこと

- スクリーンリーダー(S1 の推測)。
- 実機の幅(ShapeStep5・7、VolumeStep5 は式からの計算)。
- dark テーマの実表示(コントラストは手計算)。
- `usePointerDrag` の `preventDefault` が canvas へのフォーカス移動を妨げるか(ブラウザ依存、気づいた範囲で未検証)。