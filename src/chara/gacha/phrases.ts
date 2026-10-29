/*
 * 台詞を文節に区切り、折り返してよい位置を決める。
 * Chrome は CSS の word-break: auto-phrase(gacha.css・mini.css)で文節の切れ目で折り返すが、Safari などは
 * これに対応しておらず、語の途中で折り返す(「契約し/て」「異/世界人」。本人 2026-10-30「直して。
 * 異常というかその折り返しが必要な部分だけ」)。対応していないブラウザでだけ、BudouX(Google の、文節に
 * 区切る学習済みモデル)で区切り、切れ目に <wbr> を置いてそこでだけ折り返す(quote.css の [data-phrased])。
 * 一行に収まる台詞は、区切っても見た目は変わらない。
 */

/** 文節に区切るのが要るブラウザか(auto-phrase に対応していれば要らない)。 */
const NEEDED = typeof CSS !== 'undefined' && !CSS.supports('word-break', 'auto-phrase');

/** 行頭に来てはいけない字(句読点・閉じ括弧・感嘆符・小さい仮名・長音など)。BudouX はこの前でも区切ることがある。 */
const NO_LINE_START = /^[、。，．,.!?！？)）\]］}｝」』】〉》〕〙〗〟’”»ー〜～…‥・:;：；ゝゞヽヾぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々〻‐゠–]+/u;
/** 行末に来てはいけない字(開き括弧)。 */
const NO_LINE_END = /[(（[［{｛「『【〈《〔〘〖〝‘“«]$/u;

type PhraseParser = { parse(sentence: string): string[] };

let parser: PhraseParser | null = null;
let loading: Promise<void> | null = null;

/** 区切りが要るブラウザなら、区切る部品(BudouX)を取りに行く。要らなければすぐ終わる。 */
export function loadPhraseParser(): Promise<void> {
  if (!NEEDED) return Promise.resolve();
  if (!loading) {
    loading = import('./budoux-ja')
      .then(({ Parser, jaModel }) => {
        parser = new Parser(jaModel);
      })
      .catch(() => {
        // 取れなければ区切らずに出す。次の呼び出しで取り直す
        loading = null;
      });
  }
  return loading;
}

/** 文節の並び。区切りが要らないブラウザか、部品がまだ届いていなければ null(そのまま出す)。 */
export function splitPhrases(text: string): string[] | null {
  if (!parser) return null;
  const phrases: string[] = [];
  for (const chunk of parser.parse(text)) {
    const last = phrases.length - 1;
    if (last >= 0 && NO_LINE_END.test(phrases[last])) {
      phrases[last] += chunk;
      continue;
    }
    // 行頭に来てはいけない字は、前の文節の終わりに付ける
    const head = last >= 0 ? (NO_LINE_START.exec(chunk)?.[0] ?? '') : '';
    if (head) phrases[last] += head;
    if (chunk.length > head.length) phrases.push(chunk.slice(head.length));
  }
  return phrases;
}
