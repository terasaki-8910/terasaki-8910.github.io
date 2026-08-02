# 理想の推しア◯ネイター(/chara-picker/)— 開発元との同期

このページのデータと推薦エンジンは、開発元リポジトリ
[terasaki-8910/Bayesian-chara-picker](https://github.com/terasaki-8910/Bayesian-chara-picker)
（ローカル: `../chara_picker`）から取り込んでいる。UIだけがこちら固有。

## どっちで編集するか

これが一番大事な使い分け。**迷ったらこの表を見る。**

| やりたいこと | 編集する場所 | 理由 |
|---|---|---|
| キャラを追加・属性を直す | **開発元** | `npm run collect` の収集バッチとzodスキーマ検証テスト(A1等)、ACCEPTANCEゲートが向こうにしか無い |
| 質問・尤度・推薦ロジックの調整 | **開発元** | bayes関連テストが5ファイルある。こちらで直すとテストが一切効かない |
| 画面の見た目・文言・レイアウト | **こちら** | UIはこちらが正。向こうのUIとはTailwindのバージョンが違い互換性が無い |
| ページのSEO・OGP・シェル | **こちら** | サイト固有 |

開発元で直したものは `npm run sync:chara` でこちらに取り込む。
**逆方向（こちら → 開発元）の自動化は無い。** UIは共有していないので必要が無く、
エンジンをこちらで直したくなったら、それは開発元でやるべき変更だというサイン。

## 同期のしかた

```bash
npm run sync:chara          # 開発元から取り込む
npm run sync:chara:check    # 差分を見るだけ（書き込まない。差分ありなら終了コード1）

# 開発元が別の場所にある場合
CHARA_PICKER_REPO=/path/to/chara_picker npm run sync:chara
```

取り込み後は `npm run typecheck && npm run build` で配線を確認してからコミットする。

### 同期されるもの（vendored = こちらでは編集しない）

データ4件（最小化して配置）:

| 開発元 | こちら |
|---|---|
| `data/characters.json` | `public/chara-picker/characters.json` |
| `data/supply.json` | `public/chara-picker/supply.json` |
| `data/bayes/likelihoods.json` | `public/chara-picker/likelihoods.json` |
| `data/bayes/questions.runtime.json` | `public/chara-picker/questions.runtime.json` |

コード8件（**両リポジトリでバイト単位に同一**）:
`engine/{bayes,recommend,questions,supply,cooldown}.ts` /
`data/schema.ts` / `hooks/{useBayesInterview,useSessionLog}.ts`
→ `src/chara/` 配下の同じ構成へ

### 同期されないもの（site-owned）

`src/chara/screens/**`・`src/chara/components/**`・`src/chara/CharaPickerApp.tsx`・
`src/chara/data/loadCharaData.ts`・`src/CharaPickerPage.jsx`・`chara-picker/index.html`

## なぜエンジンが両方で同一に保てるのか

元々は無理だった。`engine/bayes.ts` が先頭で
`import likelihoodsData from '../../data/bayes/likelihoods.json'` していたため、
実行時fetchで配信するこちらでは**約280KBが必ずJSバンドルに載ってしまう**。

そこで開発元をリファクタし（`refactor(engine): bayesのデータ注入をinitBayesData()に分離`）、
データの取得元を呼び出し側の責務に移した:

- 開発元: `src/data/bayesRuntime.ts` が静的importして注入 → SPEC 2.5 の
  「実行時ネットワーク0件(D1)」は維持
- こちら: `src/chara/data/loadCharaData.ts` がfetchして注入

これで `bayes.ts` 自体は配信方法を知らなくなり、両方で同一のファイルになった。
テストは `tests/setup.bayes.ts`（vitestの`setupFiles`）で一括注入するので、
テスト本体は無改造のまま通る。

## 事故防止の仕組み

`.chara-picker-sync.json` に、前回同期時の**各ファイルのsha256**と
**取り込み元コミットSHA**を記録している。

- こちらでvendoredファイルを誤って編集していた場合、同期スクリプトは
  **上書きせず終了コード1で中断する**（その変更は開発元へ移すべき、というサイン）
- 取り込み元コミットが記録されるので、「今このサイトはどの世代のエンジンで
  動いているか」が後から辿れる
- 開発元に未コミットの変更がある状態で同期しようとすると警告が出る

復旧したいときは、開発元から取り直す（`cp` して再同期）か、
`.chara-picker-sync.json` の該当エントリを消す。

## キャラ追加時のフォント再生成（自動）

キャラを増やすと**新しい漢字**が入る。`public/fonts/zen-kurenaido.woff2` は
サブセットフォントなので、再生成しないとその字だけ別フォントにフォールバックして
表示がチグハグになる（移植時に実際に踏んだ）。

同期スクリプトは取り込み後にキャラ名・作品名・別名・質問文の文字が
フォントに収録されているかを検査し、**未収録があれば
`scripts/build-font-subset.mjs` を自動実行する**。
検査には `.venv`（fontTools）が要る。無い場合は警告してスキップする:

```bash
python3 -m venv .venv && .venv/bin/python3 -m pip install fonttools brotli
```

## ズレ検出はハードフィルタを手写ししない

`loadCharaData.ts` は「推薦対象になりうるのに `likelihoods.json` に居ないキャラ」を
ロード時に検出してまとめて失敗させる。この判定は**必ず `survivors()` を呼ぶ**こと。

初版はフィルタ条件をその場に書き写していたが、2026-08-01に開発元が
`reviewed === true` をハードフィルタへ追加したため、条件が食い違った。
食い違うと「開発元では推薦対象外なので尤度を持たないキャラ」を欠落扱いにして、
**開発元は正常なのにサイトだけページ全体がロード失敗する**。
`survivors()` はvendoredファイル（`engine/recommend.ts`）なので、
そこを見に行けば条件は常に開発元と一致する。

## 同期の記録

| 日付 | 取り込み元 | 内容 |
|---|---|---|
| 2026-07-31 | `ffa7757` | 移植時の初期取り込み。184体 |
| 2026-08-02 | `0678951` | 488体（103作品、487体査読済み）。軸を4つ追加（`stature`/`occupation`、`personality`/`hairColor`/`mood`の複数値化）で質問は139問に。「いいえ」後は最低3問・最大6問聞いてから再推測（`bayesShouldReguess`）。`guessing`フェーズが`candidates`（上位5候補）を返すようになった |

実行時に取得するJSONは合計807KB（gzip 91KB）。GitHub Pagesはgzipで配信する。

## 関連ファイル

| 役割 | パス |
|---|---|
| 同期スクリプト | `scripts/sync-chara-picker.mjs` |
| 同期記録 | `.chara-picker-sync.json` |
| フォント再生成 | `scripts/build-font-subset.mjs` |
| データ読み込み・検証 | `src/chara/data/loadCharaData.ts` |
| 画面分岐 | `src/chara/CharaPickerApp.tsx` |
| ページシェル | `src/CharaPickerPage.jsx` |
