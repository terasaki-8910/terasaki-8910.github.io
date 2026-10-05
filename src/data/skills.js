// 技術スタックの項目。トップの自己紹介と /career/ で同じデータを使う。
// period は表示用の文字列で、空なら表示しない(トップだけで使う)。
// group: /career/ での分け方。main = 説明を厚く書ける主な技術、other = 授業や制作で一通り触ったもの。
// onTop: false はトップには出さない(/career/ だけ)。
// 文言と分け方は下書き(確認シート14回目で本人に確かめる)。
export const skills = [
  {
    name: 'GitHub',
    period: '2021~',
    group: 'main',
    text: '普段のリポジトリ管理、GitHub Actions のワークフロー作成、プルリクエストを使った開発',
  },
  {
    name: 'Python',
    period: '2022~',
    group: 'main',
    text: '研究の可視化・データ処理、授業での機械学習、FlaskによるWebアプリの構築など',
  },
  {
    name: 'SPARQL / RDF / Linked Open Data',
    period: '2025~',
    group: 'main',
    text: '卒研では、異種 LOD 間で SPARQL クエリを再利用する研究で、実行はできても結果が0件になるクエリを、緩和によって回復する手法を用いた。現在はデータセットごとに異なるスキーマをもつLODにおいてクエリの用例を示すことでユーザへの利活用支援を試みている。',
  },
  {
    name: 'Linuxサーバ運用',
    period: '2025~',
    group: 'main',
    text: '研究室サーバの管理・運用を担当。Docker で動く GitLab を、17系から19系までメジャーバージョンを順に上げ、SSL 証明書も更新した。自宅でもサーバを管理している。',
  },
  {
    name: 'React',
    period: '2025~',
    group: 'other',
    note: 'このサイト',
    text: 'このサイトを React で作っています',
  },
  {
    name: 'Ruby on Rails',
    period: '2026~',
    group: 'other',
    note: 'TA',
    text: 'Webアプリ作成実験のTAで学生たちに基本的なアプリの作成方法とエラーの対処法を教えた。',
  },
  { name: 'C#', group: 'other', onTop: false },
  { name: 'C++', group: 'other', onTop: false },
]

// /career/ の「その他」の説明
export const OTHER_SKILLS_NOTE = '授業や個人の制作で一通り触ったもの'

