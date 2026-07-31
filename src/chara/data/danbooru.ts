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
 * スコア下限。レーティングは利用者の自己申告なので、付け間違いを引く確率を
 * 下げるために併用する（極端に低スコアの投稿はタグ付けも荒い傾向）。
 */
const MIN_SCORE = 20;

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
  source?: string;
};

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

/**
 * キャラの代表画像を1枚引く。見つからなければ null（枠だけ出す）。
 *
 * タグ数は「キャラ+rating+score+order」で4つ。無料枠のタグ数制限に触れた場合は
 * order/scoreを落として取り直し、クライアント側で最良を選ぶ（1リクエストで済む）。
 */
export async function fetchCharaImage(tag: string, signal?: AbortSignal): Promise<CharaImage | null> {
  const only = 'id,large_file_url,file_url,tag_string_artist,source';

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
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(String(res.status));
    const json: unknown = await res.json();
    return Array.isArray(json) ? (json as DanbooruPost[]) : [];
  };

  try {
    const posts = await get(`${tag} ${RATING} score:>=${MIN_SCORE} order:random`, 1);
    const found = posts.length > 0 ? build(posts[0]) : null;
    if (found) return found;
  } catch {
    // タグ数制限(422)等。下のフォールバックへ。
  }

  try {
    // メタタグを削ってキャラ+ratingの2つに抑え、複数件から選ぶ
    const posts = await get(`${tag} ${RATING}`, 30);
    const pool = posts.filter((p) => p.large_file_url ?? p.file_url);
    if (pool.length === 0) return null;
    return build(pool[Math.floor(Math.random() * pool.length)]);
  } catch {
    return null;
  }
}
