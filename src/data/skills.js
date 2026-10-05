// 技術スタックの項目。トップの自己紹介と /career/ で同じデータを使う。
// period は表示用の文字列で、空なら表示しない(トップだけで使う)。
// text はトップに出す文面。careerText があれば /career/ ではそちらを出す
// (/career/ の文面は確認シート14回目で本人に直してもらっている途中の下書き。決まるまでトップは今の文面のまま)。
// group: 分け方(トップも /career/ と同じ。確認シート14回目 R14-7)。main = 説明を厚く書ける主な技術
// (careerOrder の順。研究に近いものから)、other = 「その他」。level で温度感を分ける(OTHER_LEVELS)。
export const skills = [
  {
    name: 'GitHub',
    period: '2021~',
    group: 'main',
    careerOrder: 4,
    text: '普段のリポジトリ管理・Action Workflow・Pull Request',
    careerText: '普段のリポジトリ管理、GitHub Actions のワークフロー作成、プルリクエストを使った開発',
  },
  {
    name: 'Python',
    period: '2022~',
    group: 'main',
    careerOrder: 2,
    // 確認シート14回目 R14-14 で決まった文面
    text: '研究の可視化・データ処理、文字列処理、授業での機械学習、FlaskによるWebアプリの構築など',
  },
  {
    name: 'SPARQL / RDF / Linked Open Data',
    period: '2025~',
    group: 'main',
    careerOrder: 1,
    // 確認シート14回目 R14-15 で決まった文面
    text: '卒業研究では、異なる LOD の間で SPARQL クエリを使い回すため、実行はできても結果が0件になるクエリを、条件をゆるめるクエリ緩和で回復する手法を検討した。現在は、データセットごとにスキーマが異なる LOD で、クエリの例を示して使い始めを助ける方法を研究している。',
  },
  {
    name: 'Linuxサーバ運用',
    period: '2025~',
    group: 'main',
    careerOrder: 3,
    text: '研究室サーバの管理・運用。Dockerで動くGitLab を複数のメジャーバージョンにわたって段階的にアップグレードし、SSL 証明書の更新。自宅でもサーバを管理している。',
    // 下書き(確認シート15回目)。確かめていない版の数字は出さない
    careerText: '研究室サーバで、Docker で動く GitLab の更新と SSL 証明書の更新をした。自宅でもサーバを管理している。',
  },
  {
    name: 'React',
    period: '2025~',
    group: 'other',
    level: 'some',
    note: 'このサイト',
    // 確認シート14回目 R14-8 で決まった文面
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
  { name: 'C#', group: 'other', level: 'touched' },
  { name: 'C++', group: 'other', level: 'touched' },
]

// /career/ の「その他」の温度感(下書き。友人の「使ったことがある」と「まあまあ触った」で分ける案)
export const OTHER_LEVELS = [
  { id: 'some', label: '基本的な作り方が分かる' },
  { id: 'touched', label: '授業で一通り触った' },
]
