/*
 * Danbooruからキャラの代表画像を実行時に取ってくる。
 *
 * ■ なぜ実行時fetchなのか
 *   ビルド時に画像URLを焼き込むと、元投稿が削除されたときに二度と直らない
 *   リンク切れが残る。毎回引き直せば、消えた画像は次のアクセスで別の画像に
 *   置き換わる（削除がそのまま伝播する）。
 *
 * ■ 認証情報を持たない
 *   未認証でCORS込みで叩けることを本番オリジンから実測済み
 *   (access-control-allow-origin: *)。APIキーを静的サイトに置く必要が無い。
 *
 * ■ 画像は同梱せず直リンクする
 *   ファンアートの著作権は各絵師にある。ここではファイルを複製・再配布せず、
 *   Danbooruのcdnを参照するだけに留め、絵師名と一次ソースへの導線を必ず添える。
 *   元投稿が消えれば画像も自然に消える。
 */

const API = 'https://danbooru.donmai.us';

/** レーティング。sensitive以上は使わない（2022年の4段階化で `s` の意味がsafe→sensitiveに変わっている点に注意）。 */
const RATING = 'rating:general';

/**
 * 検索タグは未認証だと3つが上限（4つ目で PostQuery::TagLimitError。実測）。
 * その3枠を「キャラ / rating:general / order:score」に使い切っているので、
 * 「単体絵だけ」の絞り込みはクエリでは書けない。
 *
 * 代わりに上位をまとめて取り、`solo` タグの有無でクライアント側で選り分ける
 * （`only=` はタグ数に数えられないので tag_string_general を貰える）。
 * General限定ミラー(safebooru.donmai.us)ならrating枠が空くが、あちらは
 * 2タグ上限でさらに厳しく、order:score と solo を両立できないため使わない。
 */
const POOL_SIZE = 40;

export type CharaImage = {
  imageUrl: string;
  /** 投稿ページ。画像クリックの遷移先。 */
  postUrl: string;
  /** 絵師のタグ名（複数いる場合はスペース区切り）。無いこともある。 */
  artist: string | null;
  /** 絵師本人の投稿URL（Twitter/Pixiv等）。無いこともある。 */
  sourceUrl: string | null;
  /** キャラのwikiページ。 */
  wikiUrl: string;
};

type DanbooruPost = {
  id: number;
  large_file_url?: string;
  file_url?: string;
  tag_string_artist?: string;
  tag_string_general?: string;
  tag_string_character?: string;
  source?: string;
};

/**
 * キャラごとに1度引いた画像を保持する。同じキャラなら常に同じ絵を返すため、
 * 「この子かな?」で見た絵が「はい」を押した結果画面で別物に変わらない
 * （画面遷移でコンポーネントが再マウントされるので、これが無いと毎回引き直す）。
 */
const imageCache = new Map<string, CharaImage | null>();

let tagMap: Record<string, string> | null = null;

/** キャラid→Danbooruタグの対応表（開発元が検証済みのものを同期している）。 */
export async function loadTagMap(): Promise<Record<string, string>> {
  if (tagMap) return tagMap;
  const res = await fetch('/chara-picker/tag-map.json');
  if (!res.ok) throw new Error(`tag-map.json の取得に失敗しました (HTTP ${res.status})`);
  const json = (await res.json()) as { tags?: Record<string, string> };
  tagMap = json.tags ?? {};
  return tagMap;
}

export function wikiUrlFor(tag: string): string {
  return `${API}/wiki_pages/${encodeURIComponent(tag)}`;
}

/** 画像ファイルを直接指すホスト。人間が開いても403か生画像で、リンク先として使えない。 */
const IMAGE_HOSTS = ['i.pximg.net', 'pbs.twimg.com', 'cdn.donmai.us', 'img.danbooru.donmai.us'];

/**
 * `source` は絵師の投稿ページのこともあれば、画像ファイルの直URLのこともある。
 * 後者をそのままリンクにすると、Pixivはリファラ制限で403になり人間には開けない。
 * ページURLに正規化できるものだけ返し、できないものは null にして投稿ページへ倒す。
 */
function normalizeSource(source: string | undefined): string | null {
  if (!source || !source.startsWith('http')) return null;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }

  // Pixivの画像直URLはファイル名に作品IDが入っている（例: 98123456_p0.jpg）ので
  // 作品ページに復元できる
  if (url.hostname === 'i.pximg.net') {
    const m = url.pathname.match(/\/(\d+)_p\d+/);
    return m ? `https://www.pixiv.net/artworks/${m[1]}` : null;
  }

  if (IMAGE_HOSTS.includes(url.hostname)) return null;
  if (/\.(jpe?g|png|gif|webp|bmp|mp4|webm|zip)$/i.test(url.pathname)) return null;
  return source;
}

/** クエリ自体が悪くて何度叩いても失敗するエラー（タグ数制限のPostQuery::TagLimitError等の4xx）。
 * これだけは`fetchJsonWithRetry`内でリトライせず即座に投げ、呼び出し元の
 * 「メタタグを削って取り直す」フォールバックへ即座に渡す。5xx・429・fetch自体の
 * 例外（切断等）はこの型で包まないことで、通常通りリトライ対象のままにする。 */
class NonRetryableHttpError extends Error {}

function isNonRetryableStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/** signalのabortを尊重するsleep。中断されたら即座に例外で抜ける（無駄な待機をしない）。 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * fetch + JSON化に、通信の一時的な失敗（切断・タイムアウト・5xx・429）だけを対象にした
 * 指数バックオフ再試行を追加する。
 *
 * 「不知火フレア」「橘ありす」で実際に発生した「画像なし」は、Danbooru側に画像が
 * 十分あり・tag-map解決も正しいのに、通信の瞬断だけが原因だった（本番で
 * ERR_CONNECTION_CLOSED を観測済み）。従来は失敗をキャッシュしないことで
 * 「リロードすれば直る」状態にはしていたが、それでも初回で失敗が目に見えるのは
 * 望ましくない。認証無しの共有APIに負荷をかけすぎない範囲で、初回失敗を
 * こちら側で吸収する。
 *
 * 最大2回まで再試行（計3回試行）、300ms→900msの指数バックオフ。控えめな回数に
 * しているのは、Danbooruが未認証アクセスへ課すレート制限を実測できておらず
 * （悪化させたくない）、かつ「この子かな?」の体感待ち時間をむやみに伸ばさないため。
 */
async function fetchJsonWithRetry(url: string, signal?: AbortSignal, maxRetries = 2): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await abortableDelay(300 * 2 ** (attempt - 1), signal);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        if (isNonRetryableStatus(res.status)) throw new NonRetryableHttpError(String(res.status));
        throw new Error(String(res.status)); // 5xx/429: リトライ対象として下のcatchへ
      }
      return await res.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof NonRetryableHttpError) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * キャラの代表画像を1枚引く。見つからなければ null（枠だけ出す）。
 *
 * タグ数は「キャラ+rating+score+order」で4つ。無料枠のタグ数制限に触れた場合は
 * order/scoreを落として取り直し、クライアント側で最良を選ぶ（1リクエストで済む）。
 */
export async function fetchCharaImage(
  characterId: string,
  tag: string,
  signal?: AbortSignal,
): Promise<CharaImage | null> {
  const cached = imageCache.get(characterId);
  if (cached !== undefined) return cached;

  const only = 'id,large_file_url,file_url,tag_string_artist,tag_string_general,tag_string_character,source';

  const build = (post: DanbooruPost): CharaImage | null => {
    const imageUrl = post.large_file_url ?? post.file_url;
    if (!imageUrl) return null;
    return {
      imageUrl,
      postUrl: `${API}/posts/${post.id}`,
      artist: post.tag_string_artist?.trim() || null,
      sourceUrl: normalizeSource(post.source),
      wikiUrl: wikiUrlFor(tag),
    };
  };

  const get = async (tags: string, limit: number): Promise<DanbooruPost[]> => {
    const url = `${API}/posts.json?tags=${encodeURIComponent(tags)}&limit=${limit}&only=${only}`;
    const json: unknown = await fetchJsonWithRetry(url, signal);
    return Array.isArray(json) ? (json as DanbooruPost[]) : [];
  };

  const isSolo = (p: DanbooruPost) => (p.tag_string_general ?? '').split(' ').includes('solo');

  /**
   * 写っているキャラの種類数。`solo` タグは当てにならない
   * （100人以上写ったコラージュ画像に solo が付いている例を実際に確認した）ため、
   * キャラクタータグの数も併せて見る。同一キャラの衣装違い
   * （lisbeth_(sao) と lisbeth_(sao-alo) など）で2件になることがあるので2までは許す。
   */
  const charCount = (p: DanbooruPost) => (p.tag_string_character ?? '').split(' ').filter(Boolean).length;

  const pick = (posts: DanbooruPost[]): CharaImage | null => {
    const usable = posts.filter((p) => p.large_file_url ?? p.file_url);
    if (usable.length === 0) return null;
    // 「このキャラ1人が描かれた絵」に近いものから順に候補を探す。
    // 全部空振りしたら最後は全体から選ぶ（絵が出ないよりはまし）。
    const pool =
      usable.filter((p) => isSolo(p) && charCount(p) <= 2).length > 0
        ? usable.filter((p) => isSolo(p) && charCount(p) <= 2)
        : usable.filter((p) => charCount(p) <= 2).length > 0
          ? usable.filter((p) => charCount(p) <= 2)
          : usable.filter(isSolo).length > 0
            ? usable.filter(isSolo)
            : usable;
    return build(pool[Math.floor(Math.random() * pool.length)]);
  };

  let result: CharaImage | null;
  try {
    // スコア上位をまとめて取り、その中から選ぶ。上位固定だと毎回同じ絵になり、
    // 完全ランダムだと質が安定しないので、「上位40件の中からランダム」にする。
    result = pick(await get(`${tag} ${RATING} order:score`, POOL_SIZE));
  } catch (err) {
    // 呼び出し元(CharacterImage.tsxのunmount時等)によるabortは、リトライ済み・
    // フォールバック済みでも尊重して即座に伝播させる。無名catchで飲み込むと
    // abort後にさらにフォールバッククエリへ進んでしまい、中断の意味が無くなる。
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    try {
      // タグ数制限などで弾かれた場合はメタタグを削って取り直す
      result = pick(await get(`${tag} ${RATING}`, POOL_SIZE));
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === 'AbortError') throw err2;
      // 通信そのものが失敗した場合（レート制限・切断等。実際に
      // ERR_CONNECTION_CLOSED を観測済み）。fetchJsonWithRetryで数回再試行しても
      // なお失敗した状態。ここで null をキャッシュすると「本当に画像が無いキャラ」と
      // 区別がつかなくなり、そのページセッション中二度と再試行されない（不知火フレアで
      // 実際に発生・再現し、Danbooruに直接クエリしたところ solo 画像が複数見つかった
      // ため、通信失敗であって画像が無いわけではなかったと判明）。キャッシュせずに
      // 返し、次回の呼び出し（再度おまかせで同じキャラを引く・画面を開き直す等）で
      // 再試行できるようにする。
      return null;
    }
  }

  imageCache.set(characterId, result);
  return result;
}
