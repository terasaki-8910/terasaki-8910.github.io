// /career/ の専門用語の説明(吹き出し)。words のどれかが本文に出たら、見出し(節)ごとに最初の1か所だけに付ける。
// 長い語から先に探す(「Linked Open Data」が先に当たれば、後の「LOD」には付けない)。
// 説明は確認シート16回目 R16-30 で決まった文。link があれば、説明の下にリンクを出す。
// draft: true はまだ決まっていない説明で、/career/?drafts のときだけ使う。
export const glossary = [
  {
    id: 'lod',
    words: ['Linked Open Data', 'LOD'],
    note: 'Web 上に公開され、データどうしがリンクでつながっているデータ。誰でも機械で読み取って使える。',
  },
  {
    id: 'rdf',
    words: ['RDF'],
    note: 'データを主語・述語・目的語の3つ組で表す形式。LOD はふつうこの形式で公開されている。',
  },
  {
    id: 'sparql',
    words: ['SPARQL'],
    note: 'LOD のようなデータから、条件に合うものを取り出すための問い合わせ言語。この問い合わせをクエリと呼ぶ。表形式のデータベースでいう SQL にあたる。',
  },
  {
    id: 'schema',
    words: ['スキーマ'],
    note: 'データの項目や関係の決め方（設計図）。データセットごとに違うため、同じことを聞くにも、問い合わせの書き方が変わる。',
  },
  {
    id: 'relaxation',
    words: ['クエリ緩和'],
    note: '結果が0件になった問い合わせの条件を少しずつゆるめて、答えが返るようにする手法。',
  },
  {
    id: 'llm',
    words: ['大規模言語モデル'],
    note: '大量の文章から学習した、文章を読み書きできる AI のモデル。ChatGPT などの土台になっている。',
  },
  {
    id: 'mdlab',
    words: ['メタデータ研究室'],
    note: 'メタデータ（データについてのデータ。題名や作成者、作成日など）を扱う研究室。所属している。',
    link: 'https://mdlab.slis.tsukuba.ac.jp/',
  },
  // ---- ここから下は確認シート17回目 R17-24 で決まった説明(R16-47「一般的(文系の人)にも不明な用語は注釈をつけること」) ----
  {
    id: 'microcontroller',
    words: ['マイコン'],
    note: '家電や機械に組み込んで、制御に使う小さなコンピュータ。',
  },
  {
    id: 'plc',
    words: ['PLC'],
    note: '工場の機械などを、決めた手順どおりに動かすための制御装置。',
  },
  {
    id: 'opamp',
    words: ['オペアンプ'],
    note: '電気の信号を大きくしたり、足し引きしたりするための電子部品。',
  },
  {
    id: 'blender',
    words: ['Blender'],
    note: '3D の模型やアニメーションを作れる無料のソフト。',
  },
  {
    id: 'ict',
    words: ['ICT'],
    note: '情報通信技術。コンピュータやネットワークを使う技術をまとめた呼び方。',
  },
  {
    id: 'ml',
    words: ['機械学習'],
    note: 'データからコンピュータに規則やパターンを学ばせる技術。今の AI の中心になっている。',
  },
  {
    id: 'fpga',
    words: ['FPGA'],
    note: '買った後から、中の回路を書き換えられる半導体の部品。',
  },
  {
    id: 'rails',
    words: ['Ruby on Rails'],
    note: 'Ruby というプログラミング言語で、Web アプリを作るための土台（フレームワーク）。',
  },
  {
    id: 'github',
    words: ['GitHub'],
    note: 'プログラムのコードを保存・公開し、複数人で開発するための Web サービス。',
  },
  {
    id: 'pr',
    words: ['プルリクエスト'],
    note: '自分が直したコードを取り込んでもらう前に、ほかの人に確認を頼む仕組み。',
  },
  {
    id: 'python',
    words: ['Python'],
    note: 'データ処理や研究で広く使われているプログラミング言語。',
  },
  {
    id: 'sparqlwrapper',
    words: ['SPARQLWrapper'],
    note: 'Python から SPARQL の問い合わせを送るための部品（ライブラリ）。',
  },
  {
    id: 'endpoint',
    words: ['エンドポイント'],
    note: '問い合わせを受け付けて、結果を返す窓口（URL）。',
  },
  {
    id: 'rdflib',
    words: ['rdflib'],
    note: 'Python で RDF のデータを読み書きするための部品（ライブラリ）。',
  },
  {
    id: 'entity',
    words: ['エンティティ'],
    note: 'データの中の、人・場所・作品など一つひとつの対象。',
  },
  {
    id: 'triple',
    words: ['トリプル'],
    note: 'RDF のデータの1件。主語・述語・目的語の3つ組。',
  },
  {
    id: 'flask',
    words: ['Flask'],
    note: 'Python で Web アプリを作るための、小さな土台（フレームワーク）。',
  },
  {
    id: 'docker',
    words: ['Docker'],
    note: 'アプリを、動くのに必要なものごと箱（コンテナ）に詰めて、どのマシンでも同じように動かす仕組み。',
  },
  {
    id: 'gitlab',
    words: ['GitLab'],
    note: 'GitHub と同じように、コードを保存して共同で開発するための仕組み。自分たちのサーバでも動かせる。',
  },
  {
    id: 'ssl',
    words: ['SSL 証明書'],
    note: 'Web サイトとの通信を暗号化し、そのサイトが本物であることを示す電子的な証明書。',
  },
  {
    id: 'ubuntu',
    words: ['Ubuntu'],
    note: '無料で使える OS（Linux）のひとつ。サーバでよく使われる。',
  },
  {
    id: 'nextcloud',
    words: ['Nextcloud'],
    note: '自分のサーバで動かせる、Google ドライブのようなファイルの保存・共有の仕組み。',
  },
  {
    id: 'postgresql',
    words: ['PostgreSQL'],
    note: 'データを表の形で保存し、検索できるようにするデータベース。',
  },
  {
    id: 'tailscale',
    words: ['Tailscale'],
    note: '離れた場所にある自分の機器どうしを、安全な専用のネットワークでつなぐサービス。',
  },
  {
    id: 'repository',
    words: ['リポジトリ'],
    note: 'プログラムのコードと、その変更の履歴をまとめて保存する場所。',
  },
  {
    id: 'actions',
    words: ['GitHub Actions'],
    note: 'GitHub 上で、決めた時刻やきっかけに合わせて処理を自動で動かす仕組み。',
  },
  {
    id: 'secrets',
    words: ['GitHub Secrets'],
    note: 'パスワードや鍵を、外から見えない形で GitHub に預けておく機能。',
  },
  {
    id: 'claudecode',
    words: ['Claude Code'],
    note: 'Anthropic の AI に指示して、コードを書かせたり、動かして確かめさせたりできる開発用のツール。',
  },
  {
    id: 'opendata',
    words: ['オープンデータ'],
    note: '自治体などが、誰でも自由に使えるように公開しているデータ。',
  },
  {
    id: 'react',
    words: ['React'],
    note: 'Web ページの画面を部品に分けて組み立てるための道具（ライブラリ）。',
  },
  {
    id: 'happy',
    words: ['Happy'],
    note: 'スマホなどから、ほかのマシンの Claude Code を操作するためのオープンソースのアプリ。',
  },
  {
    id: 'session',
    words: ['セッション'],
    note: 'Claude Code との一続きのやりとり。作業の単位になる。',
  },
  {
    id: 'tauri',
    words: ['Tauri'],
    note: 'Web の技術でデスクトップアプリを作るための土台。動きが軽いのが特徴。',
  },
  {
    id: 'api',
    words: ['API'],
    note: 'ほかのプログラムから、機能やデータを使うための窓口。',
  },
  {
    id: 'cli',
    words: ['CLI'],
    note: 'ボタンなどの画面ではなく、文字で命令を打って操作するプログラム。',
  },
  {
    id: 'groq',
    words: ['Groq'],
    note: 'AI のモデルを高速に動かし、API で使えるようにしているサービス。',
  },
  {
    id: 'whisper',
    words: ['Whisper'],
    note: 'OpenAI が公開している、音声を文字に起こす AI のモデル。',
  },
  {
    id: 'cache',
    words: ['キャッシュ'],
    note: '一度取ったデータを、次にすぐ使えるよう手元に保存しておいたもの。',
  },
  {
    id: 'usage',
    words: ['/usage'],
    note: 'Claude Code に使用量を表示させる命令。',
  },
  {
    id: 'mit',
    words: ['MIT ライセンス'],
    note: '作者の表示を残せば、自由に使ったり改変したりしてよい、という条件のライセンス。',
  },
  {
    id: 'fork',
    words: ['フォーク'],
    note: '公開されているプログラムを複製して、自分で手を加えていくこと。',
  },
  {
    id: 'petdex',
    words: ['petdex'],
    note: 'HitokoePet の元にした、オープンソースのデスクトップペットのアプリ。',
  },
  {
    id: 'wsl',
    words: ['WSL'],
    note: 'Windows の中で Linux を動かす仕組み。',
  },
  // ---- 下書き(確認シート19回目)。R18-17「AI駆動開発(注釈を入れる)での学び」 ----
  {
    id: 'aidd',
    words: ['AI駆動開発'],
    note: 'AI にコードを書かせたり確かめさせたりしながら、人が要件や判断を受け持って進める開発のやり方。',
    draft: true,
  },
]
