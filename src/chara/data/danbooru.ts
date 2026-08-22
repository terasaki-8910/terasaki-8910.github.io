/*
 * キャラの代表画像。CIが先に引いておいた候補
 * (public/chara-picker/chara-images.json) から1枚選ぶ。
 *
 * ■ なぜブラウザから直接Danbooruを叩かないのか
 *   2026-08-23、DanbooruがAPIにCloudflareのmanaged challengeを掛けた。判定は
 *   User-Agentだけを見ており、ブラウザのUA(Chrome/Safari/Firefox いずれも)は
 *   403 `cf-mitigated: challenge` を返す。しかもこの403にはCORSヘッダが付かない
 *   ため、fetchはステータスを見る前にCORSエラーで落ちる。ここから先はリトライ
 *   でもフォールバッククエリでも回復せず、全キャラが「画像なし」になっていた。
 *   ブラウザからは原理的に通せないので、問い合わせは
 *   scripts/update-chara-images.mjs (GitHub Actionsで週1) へ移した。
 *
 * ■ 画像は同梱せず直リンクする
 *   ファンアートの著作権は各絵師にある。ここではファイルを複製・再配布せず、
 *   Danbooruのcdnを参照するだけに留め、絵師名と一次ソースへの導線を必ず添える。
 *   画像本体を配信している cdn.donmai.us はブラウザUAでも通るので、この方針は
 *   上の変更の影響を受けていない。
 *
 * ■ リンク切れ
 *   実行時に引き直さなくなった分、消えた投稿を掴み続けるリスクがある。週1の
 *   再生成でこれを回収し、その間に消えたものは表示側が残りの候補へ移ることで
 *   吸収する (nextCharaImage / CharacterImage.tsx)。
 */

/** 配信用の最小表現。意味と、なぜこの形なのかは update-chara-images.mjs の toEntry を見ること。 */
type RawEntry = {
  /** 画像URL(cdnの実URL) */
  i: string;
  /** 投稿ID。投稿ページは `/posts/{id}` のパーマリンク。 */
  p: number;
  /** 絵師タグ。無ければキーごと存在しない。 */
  a?: string;
  /** 絵師本人の投稿URL。無ければキーごと存在しない。 */
  s?: string;
};

type Manifest = {
  version: number;
  generatedAt: string;
  characters: Record<string, RawEntry[]>;
};

export type CharaImage = {
  imageUrl: string;
  /** 投稿ページ。画像クリックの遷移先。 */
  postUrl: string;
  /** 絵師のタグ名（複数いる場合はスペース区切り）。無いこともある。 */
  artist: string | null;
  /** 絵師本人の投稿URL（Twitter/Pixiv等）。無いこともある。 */
  sourceUrl: string | null;
};

/**
 * キャラごとに「どの候補を選んだか」を保持する。同じキャラなら常に同じ絵を返すため、
 * 「この子かな?」で見た絵が「はい」を押した結果画面で別物に変わらない
 * （画面遷移でコンポーネントが再マウントされるので、これが無いと毎回選び直す）。
 *
 * 添字ではなく「試した候補の集合」も持つのは、表示に失敗した候補を捨てて
 * 次の候補へ移れるようにするため（`nextCharaImage`）。
 */
type Pick = { image: CharaImage | null; tried: Set<number> };
const imageCache = new Map<string, Pick>();

function toImage(e: RawEntry): CharaImage {
  return {
    imageUrl: e.i,
    postUrl: `https://danbooru.donmai.us/posts/${e.p}`,
    artist: e.a ?? null,
    sourceUrl: e.s ?? null,
  };
}

/**
 * 進行中のfetchを共有する。結果ではなくPromiseを持つことで、複数のキャラ画像が
 * 同時にマウントされても取得は1回で済む。失敗した場合はここをnullに戻し、
 * 次の呼び出しで引き直せるようにする（失敗を握ったままにすると、そのページ
 * セッション中ずっと「画像なし」になる）。
 */
let manifestPromise: Promise<Manifest> | null = null;
/** 解決済みのマニフェスト。`nextCharaImage` は同期で呼ばれるのでここから読む。 */
let manifestCache: Manifest | null = null;

/**
 * 呼び出し側のsignalはここへ渡さない。このPromiseは全呼び出しで共有されるので、
 * 1つのコンポーネントがアンマウントしただけで他の全員の取得まで巻き込んで
 * 中断してしまう。中断の尊重は、待ち終えたあとに呼び出し側ごとに判定する
 * （fetchCharaImage 内）。
 */
async function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/chara-picker/chara-images.json')
      .then((res) => {
        if (!res.ok) throw new Error(`chara-images.json の取得に失敗しました (HTTP ${res.status})`);
        return res.json() as Promise<Manifest>;
      })
      .then((m) => {
        manifestCache = m;
        return m;
      })
      .catch((err: unknown) => {
        manifestPromise = null;
        throw err;
      });
  }
  return manifestPromise;
}

/** キャラの代表画像を1枚返す。候補が無ければ null（枠だけ出す）。 */
export async function fetchCharaImage(
  characterId: string,
  signal?: AbortSignal,
): Promise<CharaImage | null> {
  const cached = imageCache.get(characterId);
  if (cached !== undefined) return cached.image;

  let manifest: Manifest;
  try {
    manifest = await loadManifest();
  } catch {
    // 取得そのものに失敗した状態。ここで null をキャッシュすると「本当に絵が
    // 無いキャラ」と区別がつかなくなり、そのページセッション中二度と再試行
    // されない。キャッシュせずに返し、次回の呼び出しで引き直せるようにする。
    return null;
  }
  // 待っている間にこの呼び出し元だけが中断された場合は、呼び出し元の
  // クリーンアップ経路へ返す（共有Promise自体は他の呼び出し元のため生かす）。
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const candidates = manifest.characters[characterId] ?? [];
  if (candidates.length === 0) {
    imageCache.set(characterId, { image: null, tried: new Set() });
    return null;
  }

  const index = Math.floor(Math.random() * candidates.length);
  const image = toImage(candidates[index]);
  imageCache.set(characterId, { image, tried: new Set([index]) });
  return image;
}

/**
 * 今表示している候補が読めなかったとき（元投稿が消された等）に、まだ試していない
 * 候補へ移る。全部試し終えたら null を返し、呼び出し側は「画像なし」枠へ倒す。
 *
 * 候補を複数持っているのに1枚目が死んだだけで枠に戻るのは、週1の再生成までの間
 * ずっと「画像なし」に見えるということなので、ここで引き直す。
 */
export function nextCharaImage(characterId: string): CharaImage | null {
  const cached = imageCache.get(characterId);
  const candidates = manifestCache?.characters[characterId];
  if (!cached || !candidates) return null;

  for (let i = 0; i < candidates.length; i += 1) {
    if (cached.tried.has(i)) continue;
    cached.tried.add(i);
    cached.image = toImage(candidates[i]);
    return cached.image;
  }
  cached.image = null;
  return null;
}
