/*
 * 台詞を文節に区切り、折り返してよい位置を決める。
 * Chrome は CSS の word-break: auto-phrase(gacha.css・mini.css)で文節の切れ目で折り返すが、Safari などは
 * これに対応しておらず、語の途中で折り返す(「契約し/て」「異/世界人」。本人 2026-10-30「直して。
 * 異常というかその折り返しが必要な部分だけ」)。対応していないブラウザでは、BudouX(Google の、文節に
 * 区切る学習済みモデル)で区切り、切れ目に <wbr> を置いてそこでだけ折り返す(quote.css の [data-phrased])。
 * 一行に収まる台詞は、区切っても見た目は変わらない。
 *
 * どちらの区切り方でも、1行より長いかたまりになる台詞がある(「こうやってお手伝いしてみたかったんだ。」で1つ)。
 * そのままでは画面からはみ出すか、字の途中で折れる。そういう台詞だけは、RainbowText が1行に入る字数を測って
 * 渡し、それより長い文節を語の変わり目でさらに分ける(Chrome でもこちらの区切りに切り替える)。
 */

/** CSS だけで文節の切れ目で折り返せるブラウザか(word-break: auto-phrase に対応。Chrome など)。 */
export const AUTO_PHRASE = typeof CSS !== 'undefined' && CSS.supports('word-break', 'auto-phrase');

/**
 * 行頭に来てはいけない字(句読点・閉じ括弧・感嘆符・小さい仮名・長音など)。BudouX はこの前でも区切ることがある。
 * 空白も、行の頭に来ると字下げのように見えるので、前に付ける。
 */
export const NO_LINE_START = /^[、。，．,.!?！？)）\]］}｝」』】〉》〕〙〗〟’”»ー〜～…‥・:;：；ゝゞヽヾぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々〻‐゠–　 ]+/u;
/** 行末に来てはいけない字(開き括弧)。 */
const NO_LINE_END = /[(（[［{｛「『【〈《〔〘〖〝‘“«]$/u;

type PhraseParser = { parse(sentence: string): string[] };

let parser: PhraseParser | null = null;
let loading: Promise<void> | null = null;

/** 区切る部品(BudouX)を取りに行く。auto-phrase のブラウザでも、1行より長いかたまりがある台詞のために読んでおく。 */
export function loadPhraseParser(): Promise<void> {
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

/**
 * 文節の並び。部品がまだ届いていなければ null(そのまま出す)。
 * 全角の空白(元の台詞の改行・区切り)の後でも区切る。BudouX は空白をはさんだまま1つの文節にすることがある。
 * maxChars を渡すと、それより長い文節をさらに分ける(splitLong)。
 */
export function splitPhrases(text: string, maxChars = Infinity): string[] | null {
  if (!parser) return null;
  const chunks = parser
    .parse(text)
    .flatMap((chunk) => chunk.split(/(?<=　)/))
    .flatMap((chunk) => ([...chunk].length > maxChars ? splitLong(chunk, maxChars) : [chunk]));
  const phrases: string[] = [];
  for (const chunk of chunks) {
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

type Kind = 'kanji' | 'hira' | 'kata' | 'latin' | 'other';

function kindOf(ch: string, before: Kind): Kind {
  // 長音は前の字の続き(「でーす」「スクール」)
  if (ch === 'ー') return before;
  if (/[\p{Script=Han}々〆]/u.test(ch)) return 'kanji';
  if (/\p{Script=Hiragana}/u.test(ch)) return 'hira';
  if (/\p{Script=Katakana}/u.test(ch)) return 'kata';
  if (/[\p{Script=Latin}\p{Nd}]/u.test(ch)) return 'latin';
  return 'other';
}

/**
 * 1行より長い文節を分ける。まず字の種類が変わるところで分ける(「いちいち|子供扱い…」「女学院|スクールアイドル
 * クラブ|所属」「レオナルド・|ダ・|ヴィンチ」)。ただし、漢字・カタカナ・英字の後のひらがな(送り仮名・助詞)の
 * 前では分けない。「お手伝い」「ご主人」の お・ご は後ろの語に付ける(「こうやって|お手伝い…」)。
 * それでも maxChars より長いところ(「ナアアア…」)は、字数で同じくらいの長さに分ける。
 */
function splitLong(phrase: string, maxChars: number): string[] {
  const chars = [...phrase];
  const cuts = [0];
  let before: Kind = 'other';
  for (let i = 0; i < chars.length; i++) {
    const kind = kindOf(chars[i], before);
    if (i > 0 && kind !== before && (kind !== 'hira' || before === 'other')) {
      const at = before === 'hira' && /[おご]/.test(chars[i - 1]) ? i - 1 : i;
      if (at > cuts[cuts.length - 1]) cuts.push(at);
    }
    before = kind;
  }
  cuts.push(chars.length);
  const pieces: string[] = [];
  for (let k = 1; k < cuts.length; k++) {
    const piece = chars.slice(cuts[k - 1], cuts[k]);
    const count = Math.ceil(piece.length / maxChars);
    const size = Math.ceil(piece.length / count);
    for (let s = 0; s < piece.length; s += size) pieces.push(piece.slice(s, s + size).join(''));
  }
  return pieces;
}
