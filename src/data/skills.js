// 技術スタックの項目。トップの自己紹介と /career/ で同じデータ・同じ並べ方(確認シート14回目 R14-7)。
// group: main = 説明を厚く書ける主な技術(careerOrder の順。研究に近いものから。R16-8)、
// other = 「その他」。level で温度感を2段に分ける(OTHER_LEVELS。R16-9)。「その他」の中身は R16-12 のとおり。
// text は決まった文面。draftText はまだ決まっていない文面で、/career/?drafts のときだけ出す。
// period は使っていない(年表に見えないよう、どちらのページにも出さない)。
export const skills = [
  {
    name: 'SPARQL / RDF / Linked Open Data',
    period: '2025~',
    group: 'main',
    careerOrder: 1,
    // 確認シート16回目 R16-27 で決まった文面
    text: 'SPARQL でクエリを書き、公開されている LOD に問い合わせて RDF のデータを扱えます。卒業研究では、異なる LOD の間で SPARQL クエリを使い回すため、実行はできても結果が0件になるクエリを、条件をゆるめるクエリ緩和で別のデータセット向けに変換し、結果が返るようにする手法を検討しました。現在は、データセットごとにスキーマが異なる LOD で、大規模言語モデルを使ってクエリの例を示し、使い始めを助ける方法を研究しています。',
  },
  {
    name: 'Python',
    period: '2022~',
    group: 'main',
    careerOrder: 2,
    // 確認シート16回目 R16-26 で決まった文面(括弧だけ全角にそろえた)
    text: '研究の実装は、ほぼ Python で書いています。SPARQLWrapper で SPARQL エンドポイントに問い合わせ、rdflib で RDF のデータを読み込んで加工しています。ほかに、研究データの可視化と処理、クエリの緩和処理（エンティティ・トリプルの置き換えや削除、数値の加工）、授業での機械学習、Flask による Web アプリの構築にも使いました。',
  },
  {
    name: 'Linuxサーバ運用',
    period: '2025~',
    group: 'main',
    careerOrder: 3,
    // 確認シート17回目 R17-22 で決まった文面(R16-28 の欄の文から)
    text: '研究室のサーバで、Docker で動く GitLab を 17.4 から 19.3 まで段階的にアップグレードし、SSL 証明書も更新しました。研究室の Web サイトの一部の更新も行いました。自宅では、常に動かしている Ubuntu のマシンで Nextcloud・PostgreSQL・Bitwarden（パスワード管理）を Docker で動かし、Tailscale でつないだネットワークの中で管理しています。',
  },
  {
    name: 'GitHub',
    period: '2021~',
    group: 'main',
    careerOrder: 4,
    // 確認シート16回目 R16-29 で決まった文面
    text: '普段のリポジトリ管理と、プルリクエストを使った開発に使っています。このサイトでは、ビルドと公開、Spotify・Steam・GitHub などのデータの定期取得を、GitHub Actions のワークフローで自動化しています。Webアプリ作成実験の TA では、学生に GitHub の使い方を教えました。',
  },
  {
    name: 'React',
    period: '2025~',
    group: 'other',
    level: 'some',
    note: 'このサイト',
    // 確認シート14回目 R14-8 で決まった文面(今はどのページにも出していない。R15-5)
    text: 'このサイトを React で作っています',
  },
  {
    name: 'Ruby on Rails',
    period: '2026~',
    group: 'other',
    level: 'some',
    note: 'TA',
    text: 'Webアプリ作成実験のTAで学生たちに基本的なアプリの作成方法とエラーの対処法を教えた。',
  },
  { name: 'Ruby', group: 'other', level: 'some' },
  { name: 'TypeScript', group: 'other', level: 'some' },
  { name: 'C', group: 'other', level: 'touched' },
  { name: 'C++', group: 'other', level: 'touched' },
  { name: 'Prolog', group: 'other', level: 'touched' },
  { name: 'HDL', group: 'other', level: 'touched' },
  { name: 'Arduino', group: 'other', level: 'touched' },
  { name: 'ラズパイ', group: 'other', level: 'touched' },
]

// 「その他」の温度感(確認シート16回目 R16-12)
export const OTHER_LEVELS = [
  { id: 'some', label: '基本的な作り方が分かる' },
  { id: 'touched', label: '授業で一通り触った' },
]
