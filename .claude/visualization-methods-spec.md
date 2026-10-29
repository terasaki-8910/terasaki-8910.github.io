# 仕様：`/visualization-methods/`（第 1 版、2026-10-26）

ビジュアライゼーションの授業の第 3〜5 回（形状表現とレンダリング、ボリューム可視化、流れと医用画像）の続きのページ。
決定の正本は科目のリポジトリの decisions.md（Round 8）。体裁・部品・決まりは `/visualization/` と同じ（`.claude/rules/visualization.md`）。
この文書は親（Claude）が書いた。実装で変えるときは、理由を報告に書く。

## 1. ページ

- URL `/visualization-methods/`。題「ビジュアライゼーションの授業における可視化手法の実装例」。メニュー「可視化手法」。アイコンは Phosphor の CubeFocus（Bold、MIT）
- 題の下の 1 文：「全体の可視化を動かし、それを作る計算を 1 つずつ動かして確かめ、組み合わせて全体になるまでをたどる」
- タブ（並び・id・tabLabel・title）

  | # | id | tabLabel | title |
  |---|---|---|---|
  | 1 | `shape` | 形状 | 曲線と曲面 |
  | 2 | `shading` | 反射と影 | 反射モデルと影 |
  | 3 | `isosurface` | 等値面 | 等値面の抽出 |
  | 4 | `volume` | ボリューム | ボリュームレンダリング |
  | 5 | `flow` | 流れ | 流れの可視化 |
  | 6 | `ct` | CT | CT の再構成と画像の前処理 |

- 載せないもの：授業のスライドの画像・文言、文字起こし、手書き、大学名、先生の名前。式は一般形、出典は元の論文・教科書（確かなものだけ）

## 2. ファイルと登録

- 入口：`visualization-methods/index.html`（`visualization/index.html` を写し、題・説明・canonical・og・twitter・構造化データ・seo-fallback（6 つのタブの題を h2 で）・script の src を直す）、`src/visualization-methods-main.jsx`、`src/VisualizationMethodsPage.jsx`（`VisualizationPage.jsx` と同じ殻。`Header currentPage="visualization-methods"`）
- 部品：今のページの `src/components/visualization/` を import して使う（SectionTabs・SectionPanel・StepSection・SimShell・ViewStack・SimCanvas・SimLegend・ParamSlider・ControlGroup・SimButtons・useCanvas・useSimLoop・usePointerDrag・axes・Formula・LazyMount など）。CSS も `visualization.css` を使う。このページだけのものは `src/components/visualization-methods/`
  - `sections/index.js`（6 つのタブの並び。データの形は `src/components/visualization/sections/index.js` の冒頭と同じ）と `sections/<id>.js`
  - `sims/`（タブごとの全体と段階。ファイル名は `<id>Sim.jsx`・`<id>Step<N>.jsx`、補助は `<id>Kit.js` など）
- 計算：`src/utils/vis/` に新しいファイル（DOM に触れない純関数。相対 import に `.js`。セミコロンなし・シングルクォート・2 スペース・日本語のコメント）。式に当たる関数は `// @snippet <ファイル名>-<関数名>` 〜 `// @end` で囲む（「実装を見る」と、あとで式とコードの PDF に使う）
- テスト：計算は `tests/vis/<ファイル名>.test.js`、ページのデータは `tests/vis-page/methods*.test.js`。実行は `node --test "tests/vis/*.test.js" "tests/vis-page/*.test.js"`。Windows では `tests/vis-page/transformRender.test.js` の 5 件が以前から落ちる（パスの書き方の問題で、このページとは関係ない）。新しいテストでファイルを import するときは `pathToFileURL` を使う
- 登録（すべて手作業）
  - `vite.config.js` の `rollupOptions.input` に `visualizationMethods: resolve(__dirname, 'visualization-methods/index.html')`
  - `index.html` の seo-fallback のプロジェクト一覧に 1 行
  - `public/sitemap.xml`・`public/sitemap.txt` に URL
  - `scripts/build-redirect-site.mjs` の `PAGES` に `'visualization-methods/'`
  - `scripts/build-font-subset.mjs` の `SOURCE_GLOB_DIRS` に `'visualization-methods'`
  - `src/data/projects.js` に id 9：title・menuTitle「可視化手法」・description「計算を 1 つずつ動かして確かめ、組み合わせて全体の可視化になるまでをたどる」・tags `['Canvas', 'KaTeX', 'React']`・link・pageKey `'visualization-methods'`・icon `'cubeFocus'`。`visualization: true` は付けない（ホームのプレビューは出さない）
  - `src/data/menuIcons.js` に `cubeFocus`（viewBox `0 0 256 256`、path は react-icons の `PiCubeFocusBold` と同じ）。そのあと `npm run sync-header`
  - 新しい漢字が増えたら、最後に `npm run build-font-subset`
- 6 つのタブは幅 375px で横スクロールなしに収める。`SectionTabs` に `className` を渡せるようにし、このページだけ狭い幅（420px 以下）でタブの左右の余白を詰める（ラベルは変えない）

## 3. 共通の決まり（/visualization/ と同じ。言われなくても守る）

- タブの中は「見出しと 1〜2 文 → 全体 → 段階 1〜N → 組み合わせ → 出典」。段階の中は「説明 → シミュレーション → 式 → 記号の意味（開閉）→ 実装を見る」（SectionPanel・StepSection がする）
- 段階の説明（text）は 2〜4 文、です・ます。「何の計算か（高校数学の言葉）」→「何をつかむと何が見えるか」の順。いちばん単純な場合から積み上げる
- 配置は SimShell（幅 1024px 以上の横長は絵が左・バーが右、それ以外は上下）。段階の絵の高さは自動
- 全体には凡例（SimLegend）。軸と目盛り（単位があるものは単位つき）、時刻と Δt（時間で動くもの）、動きや見え方に効く量
- どのシミュレーションも手で動かせる。つかめる物の上で grab、つかんでいる間 grabbing（usePointerDrag の canGrab）。動かした結果に、スライダーと数が追従する。キーボードでも動かせるものは矢印キーで（canvas に tabIndex=0、aria-label に操作を書く）
- 色はトークンだけ（readColors の paper・surface・ink・muted・line・accent・lane-0〜4・diff-insert・diff-delete）。画素を塗る絵も、トークンの rgb を混ぜて作る。16 進の色を書かない。文字は 4.5:1、図形は 3:1 以上（accent は淡い地に 1.6:1 なので、意味を伝える線・塗りには使わない。つまみの塗りには使ってよい）
- 値の濃淡の画像（CT・ボリューム・場の値）は、ink と surface のうち暗い方を低い値、明るい方を高い値にする（どちらのテーマでも、高い値が明るい灰色。paper はライトのテーマで黄色なので使わない）
- 動きを減らす設定では止まった状態から始める。画面外とタブの外は止める（useSimLoop）
- 重い絵（画素ごとの計算）は、変えたときだけ描き直す。ドラッグの間は内部の解像度を下げてよい（離したら元に戻す）。1 回の描き直しは目安 30 ms 以内
- canvas の文字は canvasFont.js の書体。軸は axes.js の makeView・drawAxes
- 世界の単位が決まらない絵（曲線・画像）は、軸の名前だけ（`x`、`y`）で単位を付けない

## 4. タブごとの中身

各タブの「計算」は `src/utils/vis/` に置く関数と、そのテストで確かめる性質。「全体」「段階」はシミュレーション。段階の text は下の「説明の骨子」をもとに書く（骨子の言い回しはそのまま使わなくてよいが、中身は落とさない）。

### 4.1 形状（shape）：曲線と曲面

intro：点をいくつか置くと、それをなめらかにつなぐ曲線が決まる。点（制御点）をつかんで動かすと、曲線の決め方による違いが見える。

計算 `curve.js`（点は `[x, y]`、3 次元は `[x, y, z]`）
- `lerpPoint(a, b, t)`
- `deCasteljau(points, t)` → `{ point, levels }`（levels[k] は k 回目の内分でできた点の配列。levels[0] は制御点）
- `binomial(n, i)`、`bernstein(n, i, t)`、`bezierPoint(points, t)`（バーンスタイン基底の和）
- `bezierDerivative(points, t, order = 1)`（1 階と 2 階）
- `uniformKnots(count, degree)`（t_i = i − degree、i = 0..count+degree）、`bsplineBasis(i, degree, t, knots)`（Cox–de Boor。右端 t = t_m は最後の区間に含める）、`bsplinePoint(points, degree, knots, t)`、`bsplineDerivative(...)`
- `chaikinStep(points)`（開いた折れ線。各辺に Q = 3/4 P_i + 1/4 P_{i+1}、R = 1/4 P_i + 3/4 P_{i+1}。n 点 → 2(n−1) 点）、`chaikin(points, levels)`
- `curvature2D(d1, d2)`（符号つき κ = (x′y″ − y′x″)/(x′² + y′²)^{3/2}。反時計回りが正）、`frame2D(d1)`（単位接線と、それを左に 90° 回した単位法線）
- `ellipsePoint(a, b, t)`・`ellipseImplicit(a, b, x, y)`、`hyperbolaPoint(a, b, t)`（cosh・sinh）・`hyperbolaImplicit(a, b, x, y)`
- `bezierPatch(P, u, v)`（4×4 の制御点、双 3 次）→ `{ point, du, dv, normal }`（normal = du × dv を正規化）、`cross(a, b)`
- テスト：ド・カステリョとバーンスタインの和が一致（1e-12）／バーンスタイン基底は 0 以上で和が 1（n = 1..8）／ベジエは端の制御点を通り、端の接線は n(P_1 − P_0)／導関数は差分と一致（1e-6）／曲線の点は制御点の凸包の中／B スプライン基底の和は [t_n, t_m] で 1、[t_i, t_{i+n+1}) の外で 0／一様 3 次 B スプラインの 1 区間が行列の形（1/6 の係数）と一致／制御点 P_k を動かすと [t_k, t_{k+4}) の外は変わらない（局所性）／つなぎ目で 2 階微分まで連続／Chaikin の点の数と、回数を増やすと 2 次の一様 B スプラインとの最大距離が減る（8 回で 1e-3 未満、単位の大きさの折れ線）／半径 r の円で κ = 1/r、直線で 0、向きで符号／楕円・双曲線の点は陰関数で 0／曲面の 4 隅は角の制御点、法線は du・dv に直交、平らな制御点なら法線は ±y

全体 `shapeSim.jsx`
- 世界 x 0〜8、y 0〜6（単位なし）。制御点 7 個（初期は波の形。例：(0.8,1.2) (1.8,4.6) (3.2,4.9) (4.2,2.0) (5.4,1.4) (6.6,4.4) (7.4,4.8)）をつかんで動かせる。リセットで戻る
- 絵の上の切り替え（ModeSwitch variant="tabs"）：「ベジエ」（7 点で 6 次の 1 本）／「B スプライン」（一様 3 次、4 区間。つなぎ目に小さな印）／「細分割」（Chaikin。回数 0〜6、いまの折れ線と点。2 次 B スプラインの極限を薄い破線で）
- 曲線の上の点（位置 u、0〜1）：曲線に沿ってつかんで動かせる（いちばん近い点へ）。接線・法線の矢印と接触円（半径 1/|κ|。大きすぎる円は描かない）。細分割のときは極限の曲線で測る
- 切り替え：制御点の折れ線（既定で表示）、凸包（ベジエのとき）、曲率の円（既定で表示）
- 凡例：制御点、曲線、制御点の折れ線、接触円、κ と R の値、次数と区分の数（例「6 次・1 本」「3 次・4 区分」「2 回（26 点）」）
- バー：u のスライダー、細分割の回数（細分割のときだけ。ViewStack）、表示の切り替え、リセット
- キーボード：PageUp・PageDown で動かす制御点を選び、矢印キーで 0.1 ずつ動かす

段階
1. `parametric`「媒介変数で表す曲線と、式で囲む曲線」：楕円（a・b のスライダー）。t の点 P(t) を曲線に沿ってつかんで動かせる。等間隔の t に 12 個の印。自由な点 Q をつかんで動かすと F(Q) の値と「内側／外側」が出る。地を F の符号で薄く塗り分ける。「楕円／双曲線」の切り替え（双曲線は右の枝）
   - 式：x = a cos t, y = b sin t、F(x, y) = x²/a² + y²/b² − 1 = 0／x = a cosh t, y = b sinh t、F = x²/a² − y²/b² − 1 = 0、cosh t = (e^t + e^{−t})/2, sinh t = (e^t − e^{−t})/2
   - 骨子：曲線の表し方は 2 通り。媒介変数 t を動かすと点が曲線の上を進む形（等間隔に点を並べやすい）と、F(x, y) = 0 を満たす点の集まりとして表す形（点を代入した値の符号で内か外かがすぐ分かる）。cosh²t − sinh²t = 1 なので、双曲線の媒介変数の点は式を満たす
2. `lerp`「2 点を結ぶ（線形補間）」：P0・P1 と、線分の上の点 P(t)（つかんで動かせる）。t と 1 − t の長さの比を線分に書く
   - 式：P(t) = (1 − t) P_0 + t P_1 (0 ≤ t ≤ 1)
   - 骨子：2 点を t : (1 − t) に内分する点。t = 0 で P0、t = 1 で P1
3. `de-casteljau`「線形補間を重ねる（ド・カステリョのアルゴリズム）」：制御点 3 個か 4 個（「2 次／3 次」の切り替え）、t のスライダー、各段の内分の点と線、全体の曲線と t までの部分。再生で t が 0→1 を繰り返す
   - 式：P_i^{(k)}(t) = (1 − t) P_i^{(k−1)}(t) + t P_{i+1}^{(k−1)}(t)、P(t) = P_0^{(n)}(t)、2 次の展開 (1 − t)² P_0 + 2t(1 − t) P_1 + t² P_2
   - 骨子：隣どうしを同じ t で内分し、できた点どうしをまた内分…を繰り返すと 1 点になる。t を 0〜1 で動かした軌跡がベジエ曲線
4. `bernstein`「重みの足し合わせ（バーンスタイン基底）」：3 次のベジエ（4 点、つかめる）と凸包。グラフに B_0^3〜B_3^3 と、つかめる縦線 t。各制御点に今の重みを出し、重みの和（= 1）を出す
   - 式：B_i^n(t) = C(n, i) t^i (1 − t)^{n−i}、P(t) = Σ B_i^n(t) P_i、Σ B_i^n(t) = ((1 − t) + t)^n = 1
   - 骨子：ド・カステリョを展開すると、制御点に重みをかけて足した形になる。重みは二項定理の各項なので、どの t でも 0 以上で合計 1。だから曲線は凸包からはみ出さず、両端の制御点を通る
5. `b-spline`「近くの点だけが効く曲線（B スプライン）」：7 点の一様 3 次 B スプライン。下に 7 本の基底関数 N_i^3(t)。つかんでいる点の基底と、曲線の変わる範囲を強調。「ベジエと比べる」で 6 次のベジエを重ねる（全体が動く）
   - 式：Cox–de Boor の漸化式（N_i^0 は区間の指示関数、N_i^n = (t − t_i)/(t_{i+n} − t_i) N_i^{n−1} + (t_{i+n+1} − t)/(t_{i+n+1} − t_{i+1}) N_{i+1}^{n−1}）、P(t) = Σ N_i^n(t) P_i、N_i^n は [t_i, t_{i+n+1}) の外で 0
   - 骨子：重みを「近くの区間でだけ 0 でない山」にすると、1 つの点を動かしても曲線の一部しか変わらない（3 次なら 4 区間）。つなぎ目で 2 回微分まで連続。端の制御点は通らない
6. `subdivision`「かどを切り落とす（細分割）」：6 点の折れ線（つかめる）、回数 0〜6、いまの折れ線と点、極限の 2 次 B スプライン（破線）、点の数と極限との最大距離。再生で回数を 1 ずつ増やす
   - 式：Q_i = 3/4 P_i + 1/4 P_{i+1}、R_i = 1/4 P_i + 3/4 P_{i+1}
   - 骨子：各辺の 1/4 と 3/4 に新しい点を置き、元のかどを捨てる。繰り返すと 2 次の B スプラインに近づく。面でも同じ考えがあり、Catmull–Clark の細分割曲面は 3 次の B スプライン曲面と同じになる
7. `curvature`「曲がり方を測る（接線・法線・曲率）」：3 次のベジエ（4 点、つかめる）と、曲線に沿ってつかめる点。接線・法線・接触円。下に κ(u) のグラフ
   - 式：弧長 s のとき T = dC/ds、κN = d²C/ds²、R = 1/κ／一般の t のとき κ = (x′y″ − y′x″)/(x′² + y′²)^{3/2}／空間曲線（フレネ・セレ、do Carmo の符号）：dT/ds = κN、dN/ds = −κT − τB、dB/ds = τN、B = T × N
   - 骨子：1 点での向きが接線、曲がる側に直角なのが法線。その点で曲線にいちばんよく合う円（接触円）の半径の逆数が曲率で、まっすぐなら 0、急に曲がるほど大きい
8. `surface`「曲線を 2 方向に掛ける（曲面と法線）」：双 3 次ベジエ曲面（4×4 の制御点、x・z は格子、高さ y をつかんで上下に動かす）。何もない所のドラッグで見る向きを回す。面は 16×16 の四角形を奥から順に塗る（法線と光の向きの内積で明るさ）。u・v のスライダーの点に S_u・S_v・n の矢印と、その点を通る 2 本の曲線（u 一定・v 一定）
   - 式：S(u, v) = Σ_i Σ_j B_i^3(u) B_j^3(v) P_ij、n = S_u × S_v、主曲率 κ1・κ2、ガウス曲率 K = κ1 κ2、平均曲率 H = (κ1 + κ2)/2（記号の表で）
   - 骨子：u を決めると v についての曲線、v を決めると u についての曲線。2 方向の重みを掛けて 16 個の点を足すと曲面。2 本の接線の外積が面の法線で、陰影に使う（「反射と影」のタブ）

組み合わせ：text「全体の 3 つの曲線は、どれも制御点に重みをかけて足したもの。重みの決め方が違う。」flow：[2, 3] 線形補間を重ねるとベジエ曲線／[4] 重みの和で書くと、凸包の中に収まり端を通ると分かる／[5] 重みを近くの区間だけにすると B スプライン／[6] かどを切り続けると 2 次の B スプライン／[7] できた曲線の曲がり方を接触円で測る／[1, 8] 曲線は媒介変数の式。2 方向に掛けると曲面になり、外積で法線が求まる

出典：P. Bézier, Numerical Control: Mathematics and Applications, Wiley, 1972／G. Farin, Curves and Surfaces for CAGD: A Practical Guide, 5th ed., Morgan Kaufmann, 2002／C. de Boor, On calculating with B-splines, J. Approximation Theory 6, 50–62, 1972／M. G. Cox, The numerical evaluation of B-splines, IMA J. Applied Mathematics 10, 134–149, 1972／G. M. Chaikin, An algorithm for high-speed curve generation, Computer Graphics and Image Processing 3(4), 346–349, 1974／E. Catmull, J. Clark, Recursively generated B-spline surfaces on arbitrary topological meshes, Computer-Aided Design 10(6), 350–355, 1978／M. P. do Carmo, Differential Geometry of Curves and Surfaces, Prentice-Hall, 1976

### 4.2 反射と影（shading）：反射モデルと影

intro：光が物の表面で跳ね返る量を、面の向きと、光・目の向きから計算して、画素の色を決める。光源をつかんで動かせる。

計算
- `vec3.js`：add・sub・scale・dot・cross・length・normalize（配列 `[x, y, z]`。out 引数を取れる形でよい）
- `shading.js`（L は面から光源へ、V は面から目へ、N は法線。どれも単位ベクトル）
  - `faceNormal(a, b, c)`（(b − a) × (c − a) を正規化）、`vertexNormals(positions, faces)`（周りの面の単位法線の平均を正規化）
  - `lambert(N, L)` = max(0, N·L)
  - `reflect(L, N)` = 2(N·L)N − L、`phongSpecular(N, L, V, m)` = N·L > 0 のとき max(0, R·V)^m
  - `halfVector(L, V)`、`blinnPhongSpecular(N, L, V, m)` = N·L > 0 のとき max(0, N·H)^m
  - `beckmannD(cosAlpha, m)` = exp(−tan²α/m²)/(π m² cos⁴α)、`geometryG(N, L, V, H)` = min(1, 2(N·H)(N·V)/(V·H), 2(N·H)(N·L)/(V·H))、`fresnelSchlick(F0, cosTheta)` = F0 + (1 − F0)(1 − cosθ)^5、`cookTorranceSpecular(N, L, V, m, F0)` = D G F / (4 (N·L)(N·V))（N·L・N·V が 0 以下なら 0）
  - `reflectIncident(I, N)` = I − 2(N·I)N（I は面に入ってくる向き）、`refract(I, N, eta)`（eta = η1/η2。T = ηI + (η cosθ − cosφ)N、cosθ = −N·I、cosφ = √(1 − η²(1 − cos²θ))。全反射のときは null）
  - `inShadow(dC, dL, bias)` = dC > dL + bias、`chebyshevUpperBound(mean, meanSq, t)`（t ≤ mean なら 1、それ以外は σ²/(σ² + (t − mean)²)。σ² は 1e-6 以上）
- `raster.js` に足す：`barycentric(p, a, b, c)` → [λ0, λ1, λ2]、`rasterTriangle(a, b, c, width, height, onPixel)`（画面の 2 次元の三角形を画素の中心で塗る。辺は左上の規則で、隣り合う三角形が同じ画素を 2 回塗らない。onPixel(x, y, λ0, λ1, λ2)）
- `mesh.js`：`uvSphere(radius, segments, rings)` → `{ positions, normals, faces }`（外から見て反時計回り）、`gridPlane(size, divisions, y)`
- `render.js`：`renderScene(scene, camera, opts, out)`（z バッファつきの描画。DOM に触れない。out は RGBA の Uint8ClampedArray。メッシュごとに材質、光源、シェーディング（flat / gouraud / phong）、反射モデル、影（シャドウマップの解像度と bias）、環境の関数を受け取る）、`renderDepthMap(scene, lightCamera, size)`。行列は `mat4.js`・`projection.js` を使う
- テスト：反時計回りの三角形の法線が +z、並びを逆にすると −z／24 分割の球の頂点の法線は位置の向きと 0.05 以内／lambert は cosθ で 0 で止まる／reflect の R は N との角が L と同じで単位長／L・V・N が同じ平面にあるとき R と V の角は N と H の角の 2 倍／Beckmann の D を半球で積分すると 1（∫ D cosα dω、m = 0.1〜0.6、1e-3）／G は 0〜1 で、L = V = N のとき 1／Schlick で cosθ = 1 なら F0、0 なら 1／refract はスネルの法則を満たし、全反射で null、η = 1 で曲がらない／Chebyshev の上限は t ≤ μ で 1、t が増えると減る／重心座標の和が 1 で点を再現／正方形を 2 つの三角形に分けて塗ると、画素は全部 1 回ずつ（重なりも抜けもない）／renderScene で、光の正面の球の画素が光の反対側より明るい、影の中の床が影の外より暗い

全体 `shadingSim.jsx`
- 世界（m）：床 y = 0 の 6 m × 6 m（24×24 に分ける）、半径 1 m の球（中心 (0, 1, 0)、UV 球、分割はスライダー 8〜64、既定 24）。カメラは (0, 2.2, 5.5) から (0, 0.9, 0) を見る、視野角 40°。点光源は半球の上（方位角と仰角 10°〜85°）
- 光源の印（小さな太陽の形）をつかんで動かす（横の動きで方位角、縦で仰角）。矢印キーでも 5° ずつ。再生で光源がゆっくり回る（既定は止まっている）
- 絵の上の切り替え（tabs）：反射モデル「ランバート」「フォン」「ブリン-フォン」「クック-トランス」
- バー：シェーディング「フラット」「グロー」「フォン」（quiet）、材質「塗り」「映り込み」「ガラス」（映り込みは反射の向き、ガラスは屈折の向き（η = 1/1.5）と Schlick の割合で、環境の色を取る。環境は上下の向きで色が変わる空と、地平線の下の地面。色はトークンから）、影の表示（既定で表示）とシャドウマップの解像度（32〜1024 を 2 倍ずつ）、光沢度 m（フォン・ブリン-フォン 1〜200）か粗さ m（クック-トランス 0.05〜0.6）、球の分割
- 色：球は lane-1、床は line と surface の市松、環境光は弱く（0.1 前後）
- 凡例：光源の位置 (x, y, z) m、反射モデルとシェーディング、三角形の数、シャドウマップ N×N、隅に x・y・z の軸の印（transformMesh.js の drawAxes3d）
- 描き直しは変えたときと再生中だけ。ドラッグ中は内部の解像度を半分にしてよい

段階
1. `normal`「面の向き（法線）」：分割の粗い球（6〜24）をドラッグで回して見る。面の法線（面の中心から）と頂点の法線の矢印の切り替え。1 つの三角形を選ぶと A・B・C と辺 AB・AC と外積 n を描く
   - 式：n = (B − A) × (C − A)/|(B − A) × (C − A)|、n_v = normalize(Σ_f n_f)
   - 骨子：2 辺のベクトルの外積は両方に直角な向き。頂点を反時計回りに見る側が表。頂点の法線は周りの面の法線の平均（なめらかに見せるため）
2. `lambert`「光が当たる角度（拡散反射）」：断面の図。平らな面と法線 N、半円の上をつかんで動かす光の向き L。同じ太さの光の束が面に当たって広がる幅（1/cosθ 倍）を描く。明るさの棒と cosθ のグラフ。小さな球（画素ごとにランバート）で明暗の境目が動く
   - 式：I_d = k_d l_d max(0, N·L) = k_d l_d cos θ
   - 骨子：同じ光の束でも、面が傾くと当たる面積が 1/cosθ 倍に広がり、明るさは cosθ 倍。目の位置によらない
3. `phong`「つやの光（フォンの鏡面反射）」：断面の図。N、つかめる L と V（半円の上）、R = 2(N·L)N − L。R のまわりの明るさの広がり（極座標のグラフ）。m のスライダー（1〜128）。小さな球のハイライト
   - 式：R = 2(N·L)N − L、I_s = k_s l_s max(0, R·V)^m、I = k_a l_a + I_d + I_s
   - 骨子：光が鏡のように跳ね返る向き R の近くから見ると明るい。m が大きいほど光る範囲が狭い。環境光・拡散・鏡面を足したのがフォンの反射モデル
4. `blinn-phong`「ハーフベクトル（ブリン-フォン）」：3 と同じ図に H = (L + V)/|L + V|。フォンとブリン-フォンの広がりを重ねる。「広がりをそろえる」で m を 4 倍にする。R と V の角、N と H の角の値
   - 式：H = (L + V)/|L + V|、I_s = k_s l_s max(0, N·H)^m
   - 骨子：R の代わりに、光と目の真ん中の向き H と N の近さで決める。3 つの向きが同じ平面にあるとき R と V の角は N と H の角の 2 倍なので、同じ広がりには m を約 4 倍
5. `cook-torrance`「小さな面の集まり（クック-トランス）」：左に、でこぼこの面の断面（小さな面の並び。粗さ m で傾きのばらつきが変わる。乱数は種つき）と、つかめる L・V。法線が H に近い小さな面を強調。右に D・G・F のグラフ（角度に対して）と、ブリン-フォンと比べた広がり。m と F0 のスライダー
   - 式：R_s = D G F / (4 (N·L)(N·V))、D(α) = exp(−tan²α/m²)/(π m² cos⁴α)（α = arccos(N·H)）、G = min(1, 2(N·H)(N·V)/(V·H), 2(N·H)(N·L)/(V·H))、F ≈ F_0 + (1 − F_0)(1 − V·H)^5
   - 骨子：面を、向きのばらばらな小さな鏡の集まりと考える。D は H を向いた小さな面の割合、G は小さな面どうしが光や視線をさえぎる割合、F は面で反射する光の割合（浅い角ほど大きい）。粗さ m を大きくすると、光る範囲が広く暗くなる。定数の付け方は文献によって違い、ここは D を半球で足すと 1 になる形
6. `smooth-shading`「面の中の色（グロー／フォンシェーディング）」：大きな三角形 1 枚を 2 つ並べる（左がグロー、右がフォン）。頂点の法線は球の面から取る。光をつかんで動かすと、三角形の真ん中に来たハイライトがグローでは消える。三角形の中のつかめる点で、重心座標 λ0・λ1・λ2 と補間した値
   - 式：p = λ0 v0 + λ1 v1 + λ2 v2（Σλ = 1）、グロー c(p) = Σ λ_i c_i、フォン n(p) = normalize(Σ λ_i n_i)
   - 骨子：頂点の色だけ計算して面の中は混ぜる（グロー）と速いが、面の真ん中のハイライトが消える。法線を混ぜてから画素ごとに色を計算する（フォン）と残る
7. `refraction`「曲がる光と映り込み（スネルの法則）」：水平な境目。上の屈折率 η1、下の η2（1.0〜2.4、空気 1.0・水 1.33・ガラス 1.5 の目盛り）。入ってくる光をつかんで角度 θ を変える。反射（同じ角）と屈折（φ）の線と角の弧。全反射のとき屈折の線を消して「全反射」。反射の割合（Schlick）を線の太さで。θ・φ・臨界角の値
   - 式：η1 sin θ = η2 sin φ、反射 I − 2(N·I)N、屈折 T = ηI + (η cosθ − cosφ)N（η = η1/η2）
   - 骨子：光は屈折率の違う境目で折れ曲がり、角は η1 sinθ = η2 sinφ で決まる。屈折率の大きい側から浅い角で出ようとすると、曲がる先がなくなり全部反射する。環境マッピングは、この向きで遠くの背景の画像から色を取る（全体の「映り込み」「ガラス」）
8. `shadow-map`「影（シャドウマップ）」：横から見た図（m）。つかめる点光源、つかめる箱、床。光源から扇形に N 本（8〜256）の光線、いちばん近い物までの距離 d_L を上の帯に表として描く。床の点ごとに光源までの距離 d_C と表のマスを比べて、影なら暗く塗る。ずらし ε のスライダー（0〜0.2 m。0 で床に細かい影が出る）。「やわらかい影（VSM）」で表の近くのマスの平均と 2 乗の平均から Chebyshev の上限で影の濃さ
   - 式：影 ⇔ d_C > d_L + ε、VSM：P(d ≥ d_C) ≤ σ²/(σ² + (d_C − μ)²)（d_C > μ）、μ = E[d]、σ² = E[d²] − μ²
   - 骨子：光源から見て、向きごとにいちばん近い物までの距離を表にしておく。カメラから見えた点の光源までの距離が表の値より遠ければ、間に何かあるので影。表が粗いと影の縁がぎざぎざ、ずらしが小さいと物の表面に細かい影（シャドウアクネ）

組み合わせ：text「全体の 1 枚の絵は、画素ごとに次の計算をして色を決めている。」flow：[1] 面と頂点の法線／[2] 光の当たる角で明るさ（拡散）／[3, 4, 5] つやの光（鏡面）を、選んだモデルで足す／[6] 面の中は色か法線を混ぜる／[7] 映り込みとガラスは、反射・屈折の向きで背景の色を取る／[8] 光源から見えない点は光の分を引いて影にする

出典：J. H. Lambert, Photometria, 1760／B. T. Phong, Illumination for computer generated pictures, Communications of the ACM 18(6), 311–317, 1975／J. F. Blinn, Models of light reflection for computer synthesized pictures, SIGGRAPH '77, 192–198, 1977／K. E. Torrance, E. M. Sparrow, Theory for off-specular reflection from roughened surfaces, J. Optical Society of America 57(9), 1105–1114, 1967／R. L. Cook, K. E. Torrance, A reflectance model for computer graphics, ACM Transactions on Graphics 1(1), 7–24, 1982／P. Beckmann, A. Spizzichino, The Scattering of Electromagnetic Waves from Rough Surfaces, Pergamon, 1963／B. Walter, S. R. Marschner, H. Li, K. E. Torrance, Microfacet models for refraction through rough surfaces, EGSR 2007／C. Schlick, An inexpensive BRDF model for physically-based rendering, Computer Graphics Forum 13(3), 233–246, 1994／H. Gouraud, Continuous shading of curved surfaces, IEEE Transactions on Computers C-20(6), 623–629, 1971／J. F. Blinn, M. E. Newell, Texture and reflection in computer generated images, Communications of the ACM 19(10), 542–547, 1976／L. Williams, Casting curved shadows on curved surfaces, SIGGRAPH '78, 270–274, 1978／W. Donnelly, A. Lauritzen, Variance shadow maps, I3D 2006, 161–165

### 4.3 等値面（isosurface）：等値面の抽出

intro：格子の点に値が並んだデータから、値がちょうど決めた値（しきい値）になる線や面を取り出す。粒子をつかんで動かせる。

計算 `isosurface.js`
- `bilinear(f00, f10, f01, f11, a, b)`、`trilinear(f, a, b, c)`（f は 8 個。添字のビット 0・1・2 が x・y・z）
- `sampleGrid2D(values, nx, ny, x, y)`・`sampleGrid3D(...)`（格子の座標で。端は clamp）
- `metaballWeight(r, R)` = (1 − r²/R²)³（r < R）、0（それ以外）、`metaballField(p, balls, T)` = Σ b_i W(|p − x_i|, R_i) − T（2 次元と 3 次元）
- `gradient2D(f, x, y, h)`（中心差分）、`curvature2D(f, x, y, h)`（∇·(∇f/|∇f|) を差分で）
- `weightedLeastSquares(xs, gs, q, h)`（b(x) = (1, x, x²)、θ(d) = exp(−d²/h²)。正規方程式を解いて c を返す）、`solveLinear(A, b)`（部分ピボットのガウスの消去法）
- `edgeCrossing(fa, fb, T)` = (T − fa)/(fb − fa)
- `squareCase(f00, f10, f11, f01, T)`（ビット 0〜3 が (0,0)・(1,0)・(1,1)・(0,1)。T 以上が 1）、`saddleValue(f00, f10, f01, f11)` = (f00 f11 − f10 f01)/(f00 − f10 − f01 + f11)、`squareSegments(f00, f10, f11, f01, T, { ambiguity: 'asymptotic' | 'center', interpolate: true | false })`、`marchingSquares(values, nx, ny, T, opts)` → 線分の配列
- `cubeCase(f, T)`、`marchingCubesCell(f, T)`：表の代わりに、6 つの面それぞれに squareSegments（あいまいな面は漸近線判定。面の 4 つの値だけで決まるので、隣の立方体と同じ線になり穴が開かない）を当て、面の上の線を辺の交点でつないで輪にし、輪を扇形に三角形に分ける。三角形の向きは勾配（f が増える向き）が外向きになるようにそろえる
- `marchingCubes(values, nx, ny, nz, T)` → `{ positions, normals, triangles }`（同じ辺の交点は 1 つの頂点にまとめる。法線は場の勾配から）
- `cubeCaseClasses({ complement })`：256 通りを立方体の 24 の回転でまとめた組の数（complement で内外の入れ替えもまとめる）
- `signedDistanceSlottedDisk(x, y, disk)`（Zalesak の切れ込みのある円板）、`reinitStep(phi, n, dx, dtau)`（∂φ/∂τ + S(φ0)(|∇φ| − 1) = 0 を Godunov の風上差分で 1 回。S(φ0) = φ0/√(φ0² + dx²)）、`gradMagnitude(phi, n, dx)`。移流は grid.js の `advectSemiLagrangian2D` を使う
- テスト：双線形・3 重線形は角で角の値、1 次関数を正確に再現／半径 r の円の場で勾配 (2x, 2y)、境界で曲率が 1/r（1e-3）／W(0) = 1、W(R) = 0／2 次式のデータで最小二乗が係数を正確に返す／辺の交点は 1 次関数で正確／円を marchingSquares で取り出すと、線分の端は円から O(h²) 以内で、内部の端点はちょうど 2 本の線分が共有（閉じた輪）／saddleValue は双線形関数の鞍点の値と一致／256 通りすべてで marchingCubesCell の頂点は符号の変わる辺の上／球の場を 32³ で取り出すと、どの辺もちょうど 2 つの三角形が共有し、V − E + F = 2、面積が 4πr² の 2% 以内／cubeCaseClasses は回転だけで 23、内外の入れ替えも入れて 15／距離でない φ（x² + y² − r²）を reinitStep で繰り返すと、境界の近くで |∇φ| が 1 ± 0.05、0 の線の動きは 1 マス未満

全体 `isosurfaceSim.jsx`
- 絵の上の切り替え（tabs）：「2 次元」「3 次元」
- 2 次元：世界 x 0〜4、y 0〜3（単位なし）。粒子 5 個をつかんで動かせる。場の値の濃淡（格子のマスごと）、格子点（N ≤ 32 のとき。内は塗り、外は輪）、等値線（ink、太め）。バー：しきい値 T、粒子の大きさ R、格子の細かさ N（8〜80、既定 24）、補間「線形補間」「辺の中点」、あいまいなマス「漸近線判定」「中心の値」、「格子の値」「格子点」の表示。再生で粒子がゆっくり回る
- 3 次元：同じ粒子を 3 次元に置いた場（N³、8〜40、既定 24）をマーチングキューブで取り出し、`render.js` で描く（ブリン-フォン、法線は場の勾配）。何もない所のドラッグで回す
- 凡例：場の値の色（外 → 内）、等値線（面）、T、格子 N×N（N×N×N）、線分（三角形）の数、あいまいなマスの数

段階
1. `interpolation`「格子の点のあいだの値（線形補間）」：マス 1 つ。4 つの角の値（棒をつかんで上下）。マスの中のつかめる点で、下の辺の f_A、上の辺の f_B、その間の f を順に出す。マスの中の濃淡。「2 次元／3 次元」の切り替え（3 次元は斜めから見た立方体と 8 つの値、奥行きのスライダー、7 回の線形補間）
   - 式：f = f00(1 − α)(1 − β) + f10 α(1 − β) + f01 (1 − α)β + f11 αβ（α = x − x0、β = y − y0）、3 次元は前の面と後ろの面の結果 f_C・f_D から f = f_C(1 − γ) + f_D γ
   - 骨子：格子の点にしか値がないので、間は比例配分で作る。横に 2 回、縦に 1 回（3 次元はさらに奥に 1 回）の線形補間
2. `implicit`「値が 0 になる所が表面（陰関数）」：f = x² + y² − r²（r のスライダー）の濃淡と 0 の線。つかめる点で f・∇f の矢印・単位法線。0 の線の上では曲率（差分）と 1/r
   - 式：f(x) = 0、n = ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)、κ = ∇·(∇f/|∇f|)。円で ∇f = (2x, 2y)、κ = 1/√(x² + y²)
   - 骨子：表面を「f がちょうど 0 になる点の集まり」で表す。符号で内外が分かり、値の増える向き（勾配）が面に直角な法線。勾配の向きの広がり具合が曲率
3. `metaball`「粒子から場を作る（メタボール）」：粒子 3 個（つかめる）と濃淡・等値線。つかめる横線 y = y_c の上の断面のグラフ：粒子ごとの山（細い線）、その和、しきい値 T（破線）。T と R のスライダー
   - 式：f(x) = Σ_i b_i W(|x − x_i|) − T、W(r) = (1 − r²/R²)³（r < R）
   - 骨子：粒子ごとに中心で高く離れると 0 になる山を置き、全部足して T を引く。近づくと山が足し合わさって T を超え、2 つの玉がくっつく。粒子法の液体の表面を作るのに使う
4. `mls`「点の集まりから曲線を作る（移動最小二乗）」：曲線に沿ったばらつく点 30 個（種つきの乱数、「点を作り直す」）。x の上をつかんで動かす点 q。重み θ を点の濃さで、q のまわりの 2 次式の当てはめ（線）、q での値。q を全部動かしたときの曲線。h のスライダー（0.1〜2）
   - 式：E(c) = Σ θ(|x_i − q|)(b(x_i)ᵀc − g_i)²、c = (Σ θ_i b_i b_iᵀ)^{−1} Σ θ_i b_i g_i、θ(d) = e^{−d²/h²}、b(x) = (1, x, x²)ᵀ
   - 骨子：測った点はばらつくので、q に近い点ほど重く数えて、2 次式を誤差の 2 乗の和が最小になるように当てはめる。誤差は c の 2 次式なので、微分して 0 になる c を連立方程式で解く。q を動かしながら当てはめ直すと、なめらかな曲線になる
5. `edge-crossing`「辺の上の交点」：長さ 1 の辺と両端の値（棒をつかんで上下、0 の線をはさむ）。両端を結ぶ直線と交点。下に、円の場の粗い格子での交点と本当の円、格子の細かさ N のスライダーと誤差の値
   - 式：t = (T − f_a)/(f_b − f_a)、p = (1 − t) p_a + t p_b
   - 骨子：両端の符号が違う辺の上には、値がちょうど T の所が（中間値の定理で）必ずある。位置は両端を直線で結んで求める
6. `marching-squares`「マスごとに線を引く（マーチングスクエア）」：左にマス 1 つ（角を押すと内外が入れ替わる。16 通り。4 ビットの番号と線）。右に、つかめる円（か 2 つの粒子）の場を粗い格子（N = 10）で、マスごとの番号（N ≤ 12）と等値線
   - 式：case = Σ_{k=0}^{3} 2^k [f_k ≥ T]
   - 骨子：4 つの角を T 以上・未満に分けると 16 通り。通り方ごとに結ぶ辺を表にしておき、マスを 1 つずつ見て線を引く。隣のマスとは同じ辺の交点を使うので線がつながる
7. `ambiguity`「あいまいなマス（漸近線判定）」：マス 1 つ（角の値は棒をつかんで上下。初めは対角が同じ側）。マスの中の双線形の濃淡と本当の等値線（双曲線）、2 通りのつなぎ方、鞍点 (u_s, v_s) と f_s、「漸近線判定」「中心の値」の切り替え（どちらで決めたか、結果が違うとき強調）
   - 式：f(u, v) = f00(1 − u)(1 − v) + f10 u(1 − v) + f01 (1 − u)v + f11 uv、u_s = (f00 − f01)/d、v_s = (f00 − f10)/d、f_s = (f00 f11 − f10 f01)/d（d = f00 − f10 − f01 + f11）、f_s ≥ T なら T 以上の 2 つの角をマスの中でつなぐ
   - 骨子：対角が同じ側のとき引き方が 2 通りある。マスの中を双線形で考えると等値線は双曲線で、その中心（鞍点）の値が T より大きいかで、正しい引き方が決まる
8. `marching-cubes`「立方体ごとに面を張る（マーチングキューブ）」：切り替え「立方体 1 つ」（ドラッグで回す。角を押すと内外が入れ替わる。三角形と辺の交点、番号 0〜255、15 通りのどれか、三角形の数）／「球を取り出す」（球の場、N³ の N は 4〜16、取り出した面）
   - 式：case = Σ_{k=0}^{7} 2^k [f_k ≥ T]（256 通り）、回転と内外の入れ替えでまとめると 15 通り
   - 骨子：3 次元では 8 つの角で 256 通り。元の方法は 256 通りの三角形の表を使う。ここでは表の代わりに、立方体の 6 つの面それぞれに前の段階の線の引き方を当て、面の上の線をつないだ輪を三角形に分ける。回転と内外の入れ替えで同じになるものをまとめると 15 通り
9. `level-set`「形を動かす（レベルセット法）」：96×96 の格子に、切れ込みのある円板の符号付き距離 φ。回転の速度の場で運ぶ（再生）。φ の濃淡と 0 の線、境界の近くの |∇φ| の平均と 1 からのずれ。「距離に直す（再初期化）」のボタンと「毎回直す」の切り替え。止まっているとき、円板をつかんで置き直せる（その場所の正確な距離に戻す）
   - 式：∂φ/∂t + u·∇φ = 0、|∇φ| = 1、∂φ/∂τ + sgn(φ)(|∇φ| − 1) = 0
   - 骨子：形を「表面までの距離（内側は負）」の場 φ で表すと、表面は φ = 0 の線。流れに乗せて φ を運べば形が運ばれる。運ぶうちに距離の性質（傾きの大きさが 1）が崩れるので、表面の位置を変えずに距離に直す

組み合わせ：text「全体の線（面）は、格子の値から次の順に作っている。」flow：[3] 粒子から場を作る（点の集まりからなら [4]）／[1] 格子の点の値と、その間の値／[5] 符号の違う辺の上の交点／[6, 7] マスごとに交点を結ぶ（あいまいなマスは漸近線判定）／[8] 3 次元では立方体ごとに三角形を張る／[2] 法線は場の勾配から／[9] 場そのものを流れで運ぶと形が動く

出典：W. E. Lorensen, H. E. Cline, Marching cubes: A high resolution 3D surface construction algorithm, SIGGRAPH '87, 163–169, 1987／G. M. Nielson, B. Hamann, The asymptotic decider: resolving the ambiguity in marching cubes, IEEE Visualization '91, 83–91, 1991／J. F. Blinn, A generalization of algebraic surface drawing, ACM Transactions on Graphics 1(3), 235–256, 1982／M. Müller, D. Charypar, M. Gross, Particle-based fluid simulation for interactive applications, SCA 2003, 154–159／P. Lancaster, K. Šalkauskas, Surfaces generated by moving least squares methods, Mathematics of Computation 37(155), 141–158, 1981／M. Alexa et al., Computing and rendering point set surfaces, IEEE TVCG 9(1), 3–15, 2003／S. Osher, J. A. Sethian, Fronts propagating with curvature-dependent speed, J. Computational Physics 79(1), 12–49, 1988／M. Sussman, P. Smereka, S. Osher, A level set approach for computing solutions to incompressible two-phase flow, J. Computational Physics 114(1), 146–159, 1994／J. A. Sethian, A fast marching level set method for monotonically advancing fronts, PNAS 93(4), 1591–1595, 1996／S. T. Zalesak, Fully multidimensional flux-corrected transport algorithms for fluids, J. Computational Physics 31(3), 335–362, 1979

### 4.4 ボリューム（volume）：ボリュームレンダリング

intro：空間のすべての点に値があるデータ（CT の値や煙の濃さ）を、光が通り抜けながら弱まり、光る様子として描く。回して見られる。

計算 `volume.js`
- `transmittance(sigmas, ds)` = exp(−Σ σ_i ds)
- `emissionAbsorption(sigmas, emissions, ds, background)`：区間ごとに σ と L_e が一定として正確に積分（区間の寄与 (1 − e^{−σΔs}) L_e に、手前までの透過率をかける）
- `alphaFromSigma(sigma, ds)` = 1 − e^{−σ ds}、`compositeFrontToBack(colors, alphas, { stopAt })` → `{ color, alpha, used }`、`compositeBackToFront(colors, alphas)`
- `opacityCorrection(alpha, ds, ds0)` = 1 − (1 − alpha)^{ds/ds0}
- `transferFunction(points, value)`（points は値の順の `{ value, alpha, t }`。区分線形。t は色の位置 0〜1）
- `rayBox(origin, dir, min, max)` → [tNear, tFar] か null（スラブ法）
- `castRay(volume, dims, origin, dir, opts)`（mode: 'composite' | 'mip' | 'iso'。値は isosurface.js の trilinear で取る。composite は伝達関数・Δs・不透明度の補正・早めの打ち切り。iso は値 T を最初に横切る所を二分法で詰め、勾配で明るさ）→ `{ color（t と alpha）, steps }`
- `sliceAxis(viewDir)`：見る向きにいちばん近い軸（0, 1, 2）
- `headPhantom3D(n)`：作成者が決めた 3 次元の頭の模型（2 次元の Shepp–Logan（Toft の値）の楕円に z の半径を足した楕円体）を n³ の格子の値にする（0〜1）
- テスト：σ 一定で透過率 e^{−σL}、τ(a, c) = τ(a, b) τ(b, c)／σ・L_e 一定で L = L_e(1 − e^{−σs}) + L_0 e^{−σs}／前から・後ろからの合成が一致／打ち切りの誤差は 1 − stopAt 以下／opacityCorrection(α, Δs, Δs) = α、半分の間隔で 2 回は 1 回と同じ／伝達関数は点で点の値／rayBox は箱の外で null／一様な箱を通る光線の合成が式と一致／sliceAxis

全体 `volumeSim.jsx`
- 64³ の `headPhantom3D`。カメラは模型のまわりを回る（何もない所のドラッグ、矢印キー）。内部の解像度 160×160（ドラッグ中 80×80）
- 絵の上の切り替え（tabs）：「合成」「最大値」「等値面」
- 伝達関数の編集：バーの中の小さな canvas（値の度数の棒、区分線形の不透明度の線、つかめる点 4〜6 個、下に色の帯）。「骨」「中身」「全部」の初期値ボタン
- バー：Δs（ボクセル 0.25〜2）、早めの打ち切り（既定で入）、等値面のときは T
- 凡例：値の色（伝達関数の色の帯）、Δs、1 本の光線のサンプル数（平均）、打ち切り、解像度、隅に x・y・z の軸の印

段階
1. `absorption`「光が弱まる（吸収）」：横に進む 1 本の光線と、σ(x) の分布（3 つの塊。位置と高さをつかめる）。下に I(x) = I0 e^{−∫σ} のグラフ。出口の透過率。同じ厚さの 2 つの塊で同じ割合だけ減るのが見える
   - 式：dI/ds = −σ(s) I(s)、I(s) = I_0 exp(−∫_0^s σ(t) dt)
   - 骨子：煙の中の光は、少し進むたびに、そこにある量 σ に比例した割合で弱まる。同じ厚さを通るたびに同じ割合で減るので、指数関数で減る
2. `emission-absorption`「光りながら弱まる（発光と吸収）」：1 と同じ光線を目の側から。発光 L_e(x)（つかめる）と吸収 σ(x)。各点の寄与 σ L_e τ(x, 目) のグラフ（面積が合計）と、弱まった背景の光。合計 L と内訳の棒
   - 式：L = ∫_0^s τ(x, x′) σ_a(x′) L_e(x′) dx′ + τ(x, x_0) L_0、τ(x, x′) = exp(−∫ (σ_a + σ_s) dt)。散乱を入れると、位相関数 p を使う項 ∫ τ σ_s ∫_{4π} p(x′, ω′, ω) L_i(x′, ω′) dω′ dx′ が増える（記号の表で）
   - 骨子：光る煙なら、各点が出した光が、目に届くまでの残りの煙で弱まって届く。全部の点の分と、弱まった背景の光を足したのが画素の明るさ。光が向きを変える（散乱）分を入れると、式に項が増える
3. `compositing`「区切って足す（前から順の合成）」：N 個（4〜24）に区切った光線。各サンプルの不透明度の棒（つかんで上下）と色。累積の色 C と不透明度 A、まだ透けている割合 1 − A の棒。打ち切り（A ≥ 0.99）より先を薄く。前からと後ろからの結果の色と値
   - 式：α_i = 1 − e^{−σ_i Δs}、前から C ← C + (1 − A) α_i c_i、A ← A + (1 − A) α_i、後ろから C ← α_i c_i + (1 − α_i) C
   - 骨子：区切った 1 区間の不透明度は α = 1 − e^{−σΔs}。手前から順に、まだ透けて見える割合をかけて色を足す。ほぼ不透明になったら先は見えないので打ち切ってよい
4. `transfer-function`「値を色と不透明度に（伝達関数）」：模型の断面（z のスライダー）を伝達関数で塗る（透けて見えるように市松の地）。全体と同じ伝達関数の編集
   - 式：(c(f), α(f)) = TF(f)
   - 骨子：値そのものには色がないので、値ごとに色と不透明度を決める表を作る。骨の値だけ不透明にすれば骨が、低い値を薄く残せば中身が見える
5. `sampling`「サンプリング（間隔と補間）」：断面の上の光線（両端をつかめる）と、Δs ごとのサンプルの点。下に光線の上の値（最近傍と線形補間）。小さなボリュームレンダリングの絵（64×64）を Δs を変えて並べ、縞（木目）が出るのを見せる。不透明度の補正の切り替え
   - 式：α′ = 1 − (1 − α)^{Δs/Δs_0}、3 重線形補間は「等値面」の段階 1
   - 骨子：光線の上の値は格子の点のあいだなので補間する。Δs を広げると速いが薄い層を飛び越えて縞が出る。間隔を変えたら同じ見え方になるよう不透明度を直す
6. `slicing`「板を重ねて描く（テクスチャベース）」：平行投影の 3 次元の図。模型を K 枚（4〜64）の軸に平行な板に切り、半透明の板を奥から順に重ねる（板は drawImage と setTransform の 2 次元の変換で描ける）。ドラッグで回す。「向きに合わせて軸を選ぶ」の切り替え（切ると、斜めから見たときに板のすき間が見える）。いまの軸と K
   - 式：後ろからの合成と同じ、Δs = L/K
   - 骨子：3 次元のテクスチャを薄い板に切り、半透明の板を奥から重ねる。GPU の画像の重ね合わせが使えるので速い。板は見る向きにいちばん近い軸に合わせる

組み合わせ：text「全体の画素 1 つは、目から伸ばした光線 1 本の計算でできている。」flow：[5] 光線の上で Δs ごとに値を補間して取る／[4] 値を色と不透明度に／[1, 2] 弱まりと発光の式を／[3] 区切って手前から足す（不透明になったら打ち切る）／[6] 同じ足し方を、板を重ねて GPU で

出典：J. T. Kajiya, B. P. Von Herzen, Ray tracing volume densities, SIGGRAPH '84, 165–174, 1984／M. Levoy, Display of surfaces from volume data, IEEE CG&A 8(3), 29–37, 1988／R. A. Drebin, L. Carpenter, P. Hanrahan, Volume rendering, SIGGRAPH '88, 65–74, 1988／N. Max, Optical models for direct volume rendering, IEEE TVCG 1(2), 99–108, 1995／B. Cabral, N. Cam, J. Foran, Accelerated volume rendering and tomographic reconstruction using texture mapping hardware, VolVis 1994, 91–98／K. Engel et al., Real-Time Volume Graphics, A K Peters, 2006／L. A. Shepp, B. F. Logan, The Fourier reconstruction of a head section, IEEE Transactions on Nuclear Science 21(3), 21–43, 1974

### 4.5 流れ（flow）：流れの可視化

intro：空気や水の流れのように目に見えない速度の場を、矢印・線・粒子・模様で描く。流れはドラッグでかき混ぜられる。

計算 `flow.js`（場は `v(x, y, t)` → `[u, v]` の関数か、格子の配列）
- `eulerStep2(field, p, h, t)`、`rk4Step2(field, p, h, t)`、`streamline(field, seed, { h, maxSteps, method, bounds, minSpeed, t })`（前後の両方向）
- `pathline(field, seed, t0, t1, h)`、`streakline(field, seed, t0, t1, h, interval)`
- `doubleGyre({ A, eps, omega })`（Shadden ら 2005。ψ = A sin(π f(x, t)) sin(π y)、f = ε sin(ωt) x² + (1 − 2ε sin(ωt)) x、u = −∂ψ/∂y、v = ∂ψ/∂x）、`vortexField(centers)`、`rotationField(omega)`
- `sampleGridVector(u, v, n, dx, x, y, { periodic })`（双線形）
- `lic(field, noise, w, h, L, step)`（各画素から流線を前後 L 歩たどって、ノイズの平均）
- `seedsUniform(n, bounds)`、`seedsByMagnitude(field, n, bounds, rand)`、`evenlySpacedSeeds(...)`（簡単な版：間隔 d より近づいた流線は止める）
- `jacobian2(field, p, h)`、`classifyCriticalPoint(J)` → `{ type, eigenvalues }`（type：'saddle' | 'source' | 'sink' | 'center' | 'spiral-out' | 'spiral-in'）、`findCriticalPoints(u, v, n, dx)`（マスで u と v の両方の符号が変わる所を探し、ニュートン法で詰める）
- テスト：回転の場を 1 周たどると RK4 の半径のずれは 1e-6 未満（h = 0.01）、オイラーはそれより大きく、RK4 の誤差は h の 4 乗に比例／流線は範囲の外と速さ 0 で止まる／ダブルジャイヤーの発散が 0（差分で）、ε = 0 で時間によらない／時間で変わらない場では流跡線と流線が一致／水平な一様の場の LIC は、横方向のばらつきがノイズより小さい／代表の行列で 6 つの種類／零点の分かっている場で findCriticalPoints が位置を当てる

全体 `flowSim.jsx`
- 速度の場は grid.js の NS（64×64、周期境界、Δt = 1/60。NS のタブと同じ二重せん断層から始める）。ドラッグで押す（NS のタブと同じ外力）
- 絵の上の切り替え（tabs）：「矢印」「流線」「粒子」「LIC」
  - 矢印：16〜32 の格子、速さで長さ（上限つき）
  - 流線：均等な出発点（数のスライダー）、RK4、速さで色
  - 粒子：約 1500 個を流れで動かし、最近の約 1 秒の軌跡を薄く残す
  - LIC：128×128 のノイズ（種つき）、長さ L のスライダー。毎フレーム計算
- 「特異点」の表示（種類ごとの印）
- 凡例：x・y [m]（1 m × 1 m）、t、Δt、速さの色、表示の数、特異点の数

段階
1. `glyph`「矢印で描く」：一様な流れと渦（渦の中心をつかんで動かす）。格子の矢印（密度のスライダー 6〜30）。「境界に合わせた格子」（片側に点が集まる格子）で矢印が重なる。「長さをそろえる」（向きだけの矢印、速さは色）
   - 式：矢印は x から x + k v(x)、速さ |v(x)|
   - 骨子：格子の点ごとに速度を矢印で描く。いちばん基本だが、点が密な所では重なって読めない（クラッタリング）。点を均一に置き直すか、長さをそろえて色で速さを表す
2. `streamline`「流線をたどる（数値積分）」：回転の場（本当の流線は円）。出発点をつかんで動かす。オイラー（lane）と RK4（ink）、刻み h のスライダー（0.05〜0.5）。1 周したときの半径のずれ
   - 式：dx/ds = v(x)、オイラー x_{k+1} = x_k + h v(x_k)、RK4 の 4 つの傾きと x_{k+1} = x_k + h/6 (k1 + 2k2 + 2k3 + k4)
   - 骨子：流線は、どの点でも速度の向きを接線にもつ曲線。出発点から「速度の向きに少し進む」を繰り返して描く。進む前に途中の向きを何度か確かめる（ルンゲ-クッタ法）と、少ない回数で正確
3. `seeding`「出発点の置き方」：渦がいくつかある場。「均等」「速さに合わせて」「間をあける」の切り替え。出発点の数（間隔）のスライダー。出発点を点で
   - 式：p(x) = |v(x)| / ∫|v| dA（速さに合わせて置く確率）
   - 骨子：流線は出発点で決まる。均等に置くと遅い所にも並び、速さに合わせると強い流れが目立つ。間隔をそろえると偏りがなく読みやすい
4. `pathline`「流線と粒子の軌跡（時間で変わる流れ）」：ダブルジャイヤー（[0, 2] × [0, 1]、A = 0.1、ω = 2π/10）、ε のスライダー（0〜0.25）。つかめる出発点。いまの時刻の流線（ink）、出発点から放した粒子の道（流跡線、lane-1）、出発点から流し続けた染料の線（流脈線、lane-3）。再生で時刻が進む。ε = 0 で 3 本が重なる
   - 式：流線 dx/ds = v(x, t)（t を止めて）、流跡線 dx/dt = v(x, t)、ダブルジャイヤーの ψ・f・u・v
   - 骨子：流れが時間で変わらないなら粒子は流線の上を進む。変わる流れでは、ある瞬間の流線、粒子が通った道、1 点から流し続けた染料の線がずれる
5. `lic`「模様で描く（LIC）」：渦の場（中心をつかめる）。160×160 のノイズ。「ノイズ」「LIC」「スポットノイズ」の切り替え。L のスライダー（0〜30）
   - 式：I(x) = (1/(2L + 1)) Σ_{k=−L}^{L} N(σ_x(k h))（σ_x は x を通る流線の上の点、N はノイズの値）
   - 骨子：でたらめな点（ノイズ）を、各画素を通る流線に沿って平均すると、流れの向きに伸びた筋の模様になる。線を描かなくても全体の流れが一度に見える。楕円の点を流れの向きに伸ばして重ねる方法（スポットノイズ）もある
6. `critical-point`「流れの止まる点（特異点）の分類」：左に (tr J, det J) の平面（放物線 det = tr²/4、領域の名前）で点をつかんで動かす。右にその J の流れ（流線）。固有値と種類の値
   - 式：v(x) ≈ J(x − x_c)、λ = (tr J ± √((tr J)² − 4 det J))/2、det < 0 で鞍点、det > 0 で tr² ≥ 4det なら湧き出し（tr > 0）・吸い込み（tr < 0）、tr² < 4det なら渦心（tr = 0）・らせん
   - 骨子：速度が 0 の点のまわりの流れは、速度の変化の仕方（ヤコビ行列 J）の固有値で決まる。符号と、実数か複素数かで 5 種類に分かれる。点を線でつなぐと流れ全体の地図になる（ベクトル場のトポロジー）

組み合わせ：text「全体の 4 つの描き方は、どれも同じ速度の場を、違う形にして描いている。」flow：[1] 点ごとの速度をそのまま矢印に／[2, 3] 出発点を置き、速度の向きにたどると流線／[4] 時間で変わる流れでは、粒子を動かして軌跡を残す／[5] ノイズを流線に沿って平均すると LIC の模様／[6] 速度が 0 の点を見つけ、まわりの流れ方で分類する

出典：B. Cabral, L. C. Leedom, Imaging vector fields using line integral convolution, SIGGRAPH '93, 263–270, 1993／J. J. van Wijk, Spot noise: texture synthesis for data visualization, SIGGRAPH '91, 309–318, 1991／G. Turk, D. Banks, Image-guided streamline placement, SIGGRAPH '96, 453–460, 1996／B. Jobard, W. Lefer, Creating evenly-spaced streamlines of arbitrary density, Visualization in Scientific Computing '97, 43–55, 1997／J. L. Helman, L. Hesselink, Representation and display of vector field topology in fluid flow data sets, IEEE Computer 22(8), 27–36, 1989／S. C. Shadden, F. Lekien, J. E. Marsden, Definition and properties of Lagrangian coherent structures from finite-time Lyapunov exponents in two-dimensional aperiodic flows, Physica D 212, 271–304, 2005／E. Hairer, S. P. Nørsett, G. Wanner, Solving Ordinary Differential Equations I, 2nd ed., Springer, 1993／J. Stam, Stable fluids, SIGGRAPH '99, 121–128, 1999

### 4.6 CT（ct）：CT の再構成と画像の前処理

intro：体の断面を、いろいろな向きから X 線で撮った影（投影）から作り直す。作り直す前後の画像の雑音や形は、フィルタで整える。

計算
- `fft.js`：`fft(re, im, inverse)`（基数 2、その場で）、`fft2D(re, im, n, inverse)`、`dft(re, im)`（テスト用の素直な形）
- `ct.js`
  - `SHEPP_LOGAN`（Toft の改良版。[A, a, b, x0, y0, φ°]：[1, .69, .92, 0, 0, 0]、[−.8, .6624, .874, 0, −.0184, 0]、[−.2, .11, .31, .22, 0, −18]、[−.2, .16, .41, −.22, 0, 18]、[.1, .21, .25, 0, .35, 0]、[.1, .046, .046, 0, .1, 0]、[.1, .046, .046, 0, −.1, 0]、[.1, .046, .023, −.08, −.605, 0]、[.1, .023, .023, 0, −.606, 0]、[.1, .023, .046, .06, −.605, 0]）
  - `phantomValue(x, y, ellipses)`、`rasterizePhantom(n, ellipses)`
  - `ellipseProjection(e, s, theta)`：p = 2A a b √(a²(θ′) − s′²)/a²(θ′)（s′² ≤ a²(θ′)）、θ′ = θ − φ、s′ = s − (x0 cosθ + y0 sinθ)、a²(θ′) = a² cos²θ′ + b² sin²θ′
  - `sinogram(ellipses, nAngles, nDet)`（θ_k = kπ/nAngles、s は [−1, 1] を nDet 等分した中心）
  - `squareWavePartialSum(t, K)` = (4/π) Σ_{k 奇数 ≤ K} sin(kt)/k
  - `rampKernel(n, tau)`（Ram–Lak：h(0) = 1/(4τ²)、偶数で 0、奇数で −1/(n²π²τ²)）、`filterProjection(p, tau, window)`（2 倍以上に 0 を詰めて、カーネルの DFT と窓（'ram-lak'・'shepp-logan'・'hann'）をかける）
  - `backproject(sino, nAngles, nDet, n, { upTo })`（(π/nAngles) Σ_k Q_k(x cosθ_k + y sinθ_k)、線形補間。upTo で途中の角度まで）、`fbp(sino, nAngles, nDet, n, window)`
  - `addNoise(sino, level, seed)`（種つきの乱数の正規分布）、`rmse(a, b)`
- `imageFilter.js`（画像は Float32Array と幅・高さ。端は clamp）
  - `movingAverage1D(signal, n)`、`median1D(signal, n)`
  - `convolve3x3(img, w, h, kernel)`、`LAPLACIAN4`・`LAPLACIAN8`・`SOBEL_X`・`SOBEL_Y`、`sharpen(img, w, h, k)` = f − k∇²f
  - `boxBlur(img, w, h, n)`、`centerWeighted3x3(img, w, h)`（中央 2/10、ほか 1/10）、`median(img, w, h, n)`
  - `edgePreservingSmooth(img, w, h)`（Nagao–Matsuyama：5×5 の中の 9 つの領域（中央の 3×3、上下左右の五角形 4 つ、斜めの六角形 4 つ）のうち、分散が最小の領域の平均。領域の形はコードの中に表で書く）
  - `threshold(img, t)`、`dilate(mask, w, h, se)`・`erode`・`open`・`close`（se は相対位置の配列。3×3 の正方形・十字・半径 2 の円を用意）
- テスト：fft と dft が一致（N = 64、乱数）、逆変換で戻る、パーセバル／矩形波の部分和は t = π/2 で 1 に近づき、不連続の近くの行き過ぎが約 9%／楕円の投影の式が、画素で数えた線積分と 1e-3 で一致、中心をずらすと s がずれる／点のサイノグラムの最大が x cosθ + y sinθ を通る／Ram–Lak のカーネルの DFT が |w| に近い／半径 0.5 の一様な円板を 180 方向・256 検出器で fbp すると中心の値が 1 の 3% 以内、外は |値| < 0.05、角度を増やすと RMSE が減る／円板で、投影の 1 次元 FFT の大きさと 2 次元 FFT のその向きの線の値が一致（中央断面定理）／一定の画像は平均で変わらない、メディアンは孤立した 1 点を消す、エッジ保存平滑化は段差を保つ、1 次関数の傾きの画像のラプラシアンは内部で 0、一定の画像の鮮鋭化は一定／膨張と収縮の双対、開放と閉鎖は 2 回かけても同じ、開放は孤立した 1 点を消し、閉鎖は 1 点の穴を埋める

全体 `ctSim.jsx`
- 改良 Shepp–Logan の模型（[−1, 1]²）。小さな楕円（5〜10 番）をつかんで動かせる（矢印キーでも）→ サイノグラムと断面が追従
- 1 つの canvas に 3 つの枠：模型（いまの角度 θ の X 線源と検出器、光線を薄く）、サイノグラム（横が s、縦が θ 0〜180°。再生中はいまの角度まで）、作り直した断面。幅が狭いときは縦に並べる
- 再生で θ が進み（約 30°/s）、投影が 1 本ずつ足され、断面が少しずつはっきりする。180° で止まる
- バー：角度の数（6〜180）、検出器の数（64〜256）、フィルタ「なし」「ランプ」「シェップ-ローガン」「ハン」、雑音（0〜）、前処理（なし／移動平均／メディアン。サイノグラムの s 方向に）、後処理（なし／鮮鋭化／二値化して開放）
- 凡例：角度の数、検出器の数、フィルタ、雑音、誤差 RMSE、値の色

段階
1. `projection`「影を撮る（投影）」：模型と、X 線の向き θ（線源を円に沿ってつかんで動かす）、平行な光線、検出器の上の投影 p_θ(s) のグラフ（式で求めた線と、画素で数えた点）
   - 式：p_θ(s) = ∫∫ f(x, y) δ(x cosθ + y sinθ − s) dx dy、楕円 1 つの投影（中心が原点のとき）p_θ(s) = 2ρab√(a²(θ) − s²)/a²(θ)、a²(θ) = a² cos²θ + b² sin²θ
   - 骨子：X 線は通った所の吸収 f の合計だけ弱まる。検出器の 1 点に届く量（の対数）は、光線に沿った f の和（線積分）。光線を平行にずらして並べたものが、その向きの投影
2. `sinogram`「全部の向きの影を並べる（サイノグラム）」：θ を 0→180° で動かすと、サイノグラムの行が埋まる。模型の中のつかめる点が、サイノグラムで s = x cosθ + y sinθ の正弦波を描くのを重ねて見せる
   - 式：s = x cosθ + y sinθ
   - 骨子：向きごとの投影を縦に積んだ画像がサイノグラム。断面の 1 点は向きが変わると検出器の上で正弦波の形に動く
3. `back-projection`「影を塗り戻す（逆投影）」：フィルタなしの逆投影。角度の数（1〜180）、再生で 1 本ずつ足す。少ないと放射状の筋、多くてもぼけたまま
   - 式：b(x, y) = ∫_0^π p_θ(x cosθ + y sinθ) dθ
   - 骨子：投影の値を、その光線が通った所すべてに塗り戻して足す。向きを増やすと形は出るが、中心からの距離に反比例したにじみが残る
4. `fourier`「波に分ける（フーリエ変換）」：矩形波と、K 項（1, 3, 5, …, 49）までの部分和。各成分の正弦波（薄く）と和、係数の棒グラフ
   - 式：f(t) = (4/π) Σ_{k=1,3,5,…} sin(kt)/k、F(ω) = ∫ f(t) e^{−iωt} dt、f(t) = (1/2π) ∫ F(ω) e^{iωt} dω、X_k = Σ_m x_m e^{−2πikm/N}
   - 骨子：どんな信号も、いろいろな周波数の正弦波の重ね合わせで表せる。角ばった矩形波も、奇数倍の周波数の波を足すと近づく。どの周波数がどれだけ入っているかを求めるのがフーリエ変換
5. `central-slice`「投影の周波数は断面の周波数の 1 本の線（中央断面定理）」：左に模型の 2 次元 FFT の大きさ（対数の濃淡）と、原点を通る θ の線。右に投影の 1 次元 FFT の大きさ（線）と、2 次元 FFT のその線の上の値（点）が重なる。θ をつかんで動かす
   - 式：P_θ(w) = F(w cosθ, w sinθ)、P_θ(w) = ∫ p_θ(s) e^{−i2πws} ds、F(u, v) = ∫∫ f(x, y) e^{−i2π(ux + vy)} dx dy
   - 骨子：向き θ の投影の 1 次元のフーリエ変換は、断面の 2 次元のフーリエ変換の、原点を通る θ 方向の 1 本の線と同じ。向きを全部集めれば 2 次元の周波数がそろい、逆変換で断面に戻せる
6. `ramp-filter`「高い周波数を持ち上げる（ランプフィルタ）」：投影 1 本、その周波数、|w| と窓（Ram–Lak・Shepp–Logan・Hann）、フィルタ後の投影（両側に負の谷）、空間のカーネル h(s)
   - 式：Q_θ(s) = ∫ P_θ(w) |w| e^{i2πws} dw、h(0) = 1/(4τ²)、h(n) = 0（n 偶数）、−1/(n²π²τ²)（n 奇数）
   - 骨子：塗り戻しでぼけるのは、2 次元の周波数を極座標で数えるとき原点の近くが濃く集まりすぎるから。極座標の面積の要素 |w| をかけてから塗り戻せばよい。高い周波数は雑音も持ち上げるので、窓で少し弱める
7. `fbp`「フィルタ補正逆投影」：フィルタの切り替え、角度の数、フィルタなしとの比較、RMSE。模型の小さな楕円をつかむと断面が追従
   - 式：f(x, y) = ∫∫ F(u, v) e^{i2π(ux + vy)} du dv = ∫_0^π ∫ F(w cosθ, w sinθ) |w| e^{i2πw(x cosθ + y sinθ)} dw dθ = ∫_0^π Q_θ(x cosθ + y sinθ) dθ
   - 骨子：投影ごとにランプフィルタをかけてから塗り戻すと、ぼけずに元の断面が戻る。向きが少ないと放射状の筋（ストリーク）が残る
8. `denoise`「雑音を減らす（移動平均・メディアン）」：上に 1 次元の信号（段差と、飛び離れた雑音。作成者の例）と、移動平均とメディアン（幅 n 3〜9）。下に雑音の入った断面と、「移動平均」「中央を重く」「メディアン」「エッジ保存」の切り替え。つかめる虫めがね（3×3 か 5×5 の値と、出力の計算。メディアンは並べた中の真ん中を強調）
   - 式：g_ij = (1/n²) Σ_{k,l} f_{i+k, j+l}、g_ij = median{f_{i+k, j+l}}、エッジ保存は 9 つの領域のうち分散が最小の領域の平均
   - 骨子：近くの平均を取ると雑音は減るが輪郭もぼける。並べて真ん中を取る（メディアン）と飛び離れた値が消え、段差は残る。周りを小さな領域に分け、ばらつきが最小の領域の平均を取ると、輪郭をまたがずに平らな所だけをならせる
9. `sharpen`「輪郭を強める（ラプラシアン・鮮鋭化）」：上に 1 次元のぼけた段差 f、1 回の差分、2 回の差分、g = f − k f″（k のスライダー）。下に断面と、「4 近傍」「8 近傍」「ソーベル x」「ソーベル y」の切り替え（輪郭の絵）と鮮鋭化した絵。虫めがねで 3×3 の係数と値
   - 式：∇²f_ij ≈ f_{i+1,j} + f_{i−1,j} + f_{i,j+1} + f_{i,j−1} − 4f_ij、g = f − k∇²f、ソーベルの係数
   - 骨子：隣との差は輪郭で大きく、差の差（ラプラシアン）は輪郭の両側で正負に振れる。元からラプラシアンを引くと、輪郭の両側の明暗の差が強まる
10. `morphology`「形を整える（膨張・収縮・開放・閉鎖）」：白黒の形（断面を二値化したもの。ドラッグで描き足し、「消す」の切り替えで消す）。構造化要素「正方形」「十字」「円」、操作「膨張」「収縮」「開放」「閉鎖」。増えた画素と減った画素を diff-insert・diff-delete で。「点を散らす」ボタン
   - 式：X ⊕ B = {x + b | x ∈ X, b ∈ B}、X ⊖ B = {x | B_x ⊆ X}、開放 (X ⊖ B) ⊕ B、閉鎖 (X ⊕ B) ⊖ B
   - 骨子：小さな形 B を各点に置いて広げるのが膨張、B がすっぽり入る点だけ残すのが収縮。収縮してから膨張（開放）すると細い出っ張りや小さな点が消え、膨張してから収縮（閉鎖）すると細いすき間や小さな穴が埋まる

組み合わせ：text「全体は、撮る → 整える → 作り直す → 整える、の順になっている。」flow：[1, 2] 向きを変えて投影を撮り、サイノグラムに並べる／[8] 投影の雑音を減らす（前処理）／[6] 投影ごとにランプフィルタをかける／[3, 7] 塗り戻して足すと断面／[4, 5] フィルタが |w| になる理由（フーリエ変換と中央断面定理）／[9, 10] 作り直した断面の輪郭を強め、形を整える

出典：J. Radon, Über die Bestimmung von Funktionen durch ihre Integralwerte längs gewisser Mannigfaltigkeiten, Berichte der Sächsischen Akademie der Wissenschaften zu Leipzig, Math.-Phys. Klasse 69, 262–277, 1917／R. N. Bracewell, Strip integration in radio astronomy, Australian J. Physics 9(2), 198–217, 1956／G. N. Ramachandran, A. V. Lakshminarayanan, Three-dimensional reconstruction from radiographs and electron micrographs, PNAS 68(9), 2236–2240, 1971／L. A. Shepp, B. F. Logan, The Fourier reconstruction of a head section, IEEE Transactions on Nuclear Science 21(3), 21–43, 1974／A. C. Kak, M. Slaney, Principles of Computerized Tomographic Imaging, IEEE Press, 1988／P. Toft, The Radon Transform: Theory and Implementation, PhD thesis, Technical University of Denmark, 1996／J. W. Cooley, J. W. Tukey, An algorithm for the machine calculation of complex Fourier series, Mathematics of Computation 19(90), 297–301, 1965／J. W. Tukey, Exploratory Data Analysis, Addison-Wesley, 1977／M. Nagao, T. Matsuyama, Edge preserving smoothing, Computer Graphics and Image Processing 9(5), 394–407, 1979／J. Serra, Image Analysis and Mathematical Morphology, Academic Press, 1982／R. C. Gonzalez, R. E. Woods, Digital Image Processing, 4th ed., Pearson, 2018

## 5. 確かめ

- `node --test "tests/vis/*.test.js" "tests/vis-page/*.test.js"`（新しいテストは全部通る。落ちてよいのは transformRender.test.js の以前からの 5 件だけ）と `npm run build`
- `tests/vis-page/methodsSections.test.js`：6 つのタブの id と並び、データの形（今のページの sections.test.js と同じ検査。式は KaTeX で組めること、抜粋が `src/utils/vis/` にあること）
- 画面：幅 375・768・820×1180・1180×820・1024・1280・1440、ライトとダーク、6 つのタブで、全体と段階を撮って見る（はみ出し、重なり、文字の大きさ、つかむ操作、凡例、コントラスト、コンソールのエラー）
- docs/ を組む前に `git ls-files --eol` で CRLF の混じりがないことを確かめる

## 6. 作る順と進み具合

1. 土台（ページ・登録・タブの枠・データの検査）と、形状のタブ
2. 反射と影（render.js は等値面の 3 次元の絵でも使う）
3. 等値面
4. ボリューム
5. 流れ
6. CT
7. 全体の確かめ → 本人に見せる → GO で main へ（main に入れる前に origin/main を取り込む。push は言われたとき）
8. そのあと `.claude/visualization-tasks.md` の 1〜4（2・3 はこのページの段階も対象）

進み具合はこの節に書き足す。

- 2026-10-26：土台（登録・6 タブの枠・データの検査）済み。計算は 6 タブ分すべて済み（curve・vec3・shading・raster・mesh・render・isosurface・volume・flow・fft・ct・imageFilter とテスト。Codex の使用量を抑えるため、計算とテストは Claude が書き、画面は Codex）。形状のタブは全体と段階 1〜8 済み（画面で確かめて直した）。反射と影は全体と段階 1〜4 済み、5〜8 を作っている
- シミュレーションを書くときの部品の使い方と、画面で決めた見た目の決まりは `.claude/visualization-methods-kit.md`
- 2026-10-27（利用制限でエージェントが途中で止まった。止まった時点の作業を wip としてコミットし、ブランチを push）：形状・反射と影・等値面・ボリュームは、全体と全段階の作成、画面での確かめと直し、説明文の読み直しまで済んでいた。そのあとキーボード操作・読み上げの見直し（報告は `.claude/visualization-methods-a11y-review.md`）を受けて 4 タブを並行で直し始めた。同時に、流れと CT の画面も作り始めた。wip の時点で、テストは 707 件中 702 件が通る（落ちるのは transformRender の既知の 5 件だけ）。ビルドも通る。画面はまだ見ていない

### 残りの作業（上から順に。1 件終えるごとにここを直してコミット）

直しの決まりは `.claude/visualization-methods-fix-brief.md`（キー操作・選択の表示・label・再生中の操作・色・save/restore・scroll・ボタン）。画面の道具は `.claude/visualization-methods-tools/`（shoot.mjs：タブの全体と段階を撮る。check-all.mjs：タブ × 幅 × テーマでエラーとはみ出しを調べる。dump-sections.mjs：説明文と式を並べて読み直す）。

1. [x] 4 タブのキーボード・読み上げの直しの仕上げ。wip の差分を報告の項目と照らし合わせ、直っていない [高]・[中] を直す。直しの途中で止まっていることがあるので、まず各ファイルを読む。止まった時点の様子：
   - 形状：shapeKit から直し始めたところで止まった
   - 反射と影：段階の大半を直し、段階 1・6・8 と段階 5 の軸の名前が途中だった
   - 等値面、ボリューム：全部のファイルに手が入っている。どこまで済んだかは差分で確かめる。ボリュームは tfEditorKit.js・volumeKeys.js とテスト 2 本が増えた
   - 2026-10-29 済み：報告の [高]・[中]（と手間の小さい [低]）は wip の時点ですべて直っていた（各ファイルを読んで照らし合わせた）。残っていたのは等値面の段階 9 だけで、再生中はつかめなかったのを、手引きの決まり 4 のとおり、つかむ・矢印キーで止めて動かせるようにした。4 タブの 36 個の canvas で、focus して PageUp・PageDown・矢印・Home・End を押し、絵が変わることとコンソールのエラーがないことを確かめた
2. [ ] 流れのタブ：全体と段階 1〜6 はできている。段階 3 で、選んでいる渦を PageUp・PageDown で替え、凡例と label に出す直しの途中だった。仕様 4.5 と照らし合わせ、直しの手引きの決まりで仕上げる
3. [ ] CT のタブ：前半（全体と段階 1〜5、`sections/ct.js`）と後半（段階 6〜10、`sections/ctLater.js` の `CT_LATER_STEPS`・`CT_COMBINATION`）は別々に作った。ctLater.js の段階を ct.js の steps の後ろに足し、組み合わせを `CT_COMBINATION` に置き換えて、ctLater.js を消す。仕様 4.6 と照らし合わせる
4. [ ] 6 タブの画面の見直し：幅 375・768・820×1180・1180×820・1024・1280・1440、ライトとダーク、dpr 2。check-all でエラーとはみ出しを調べ、撮った絵を実際に見る（10-26 の画面の見直しは、利用制限で報告の前に止まった）。流れと CT の説明文を dump-sections で読み直す
5. [ ] 流れと CT のキーボード・読み上げを、直しの手引きの決まりで見直す
6. [ ] `npm run build-font-subset`（ネットワークが要る）、テスト、ビルド、仕様の進み具合と科目の handoff.md を更新してコミット
7. [ ] 本人に見せて GO をもらう（AskUserQuestion。開発サーバーの URL と画面の絵）。ホームのプレビューと、/visualization/ との相互リンクを付けるかもそこで聞く
8. [ ] GO のあと：origin/main を取り込み、main へ --no-ff で取り込み、`git ls-files --eol` で CRLF を確かめてから `npm run build`、`build: docs/を最新のsrc/内容で再ビルド` をコミット。push は言われたときだけ
9. [ ] そのあと `.claude/visualization-tasks.md` の 1〜4（2・3 はこのページの段階も対象）と、共有部品の直しの候補
