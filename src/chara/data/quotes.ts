/*
 * キャラの名台詞(public/chara-picker/quotes.json)。おまかせのガチャ演出の最初の画面と、
 * キャラを見せる画面(CharacterReveal)に出す。
 *
 * 1キャラに数個あり、表示するときに1つ選ぶ。選んだものはキャラごとに覚えておき、
 * ガチャ演出と、閉じたあとの結果画面で同じ台詞になるようにする
 * (data/danbooru.ts の画像と同じ考え方)。
 *
 * 台詞の無いキャラもいる(歌詞しか無いボーカロイド、確かめられなかったキャラなど)。
 * そのときは null を返し、呼び出し側は台詞の枠ごと出さない。作った台詞で埋めることはしない。
 */

type QuotesFile = {
  version: number;
  generatedAt: string;
  characters: Record<string, string[]>;
};

/** 選んだ台詞。null は「このキャラには台詞が無い」。 */
const picked = new Map<string, string | null>();

/**
 * 進行中の取得を共有する。失敗したら null に戻し、次の呼び出しで引き直す
 * (失敗を握ったままだと、そのページの間ずっと台詞が出なくなる)。
 */
let filePromise: Promise<QuotesFile> | null = null;

export function loadQuotes(): Promise<QuotesFile> {
  if (!filePromise) {
    filePromise = fetch('/chara-picker/quotes.json')
      .then((res) => {
        if (!res.ok) throw new Error(`quotes.json の取得に失敗しました (HTTP ${res.status})`);
        return res.json() as Promise<QuotesFile>;
      })
      .catch((err: unknown) => {
        filePromise = null;
        throw err;
      });
  }
  return filePromise;
}

/** 選び済みなら同期で返す。まだなら undefined。 */
export function peekQuote(characterId: string): string | null | undefined {
  return picked.get(characterId);
}

/** キャラの台詞を1つ返す。台詞が無ければ null。 */
export async function fetchQuote(characterId: string): Promise<string | null> {
  const cached = picked.get(characterId);
  if (cached !== undefined) return cached;

  let file: QuotesFile;
  try {
    file = await loadQuotes();
  } catch {
    // 取得の失敗は「台詞が無い」と区別できるよう、覚えずに返す
    return null;
  }

  const list = file.characters[characterId] ?? [];
  const quote = list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null;
  picked.set(characterId, quote);
  return quote;
}
