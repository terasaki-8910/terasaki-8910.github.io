#!/usr/bin/env node
/*
 * /chara-picker/ 用に、キャラごとのDanbooru代表画像の候補を先に引いて
 * public/chara-picker/chara-images.json に焼く。GitHub Actionsから定期実行する。
 *
 * ■ なぜブラウザから直接引くのをやめたのか
 *   2026-08-23、Danbooruが `danbooru.donmai.us` のAPIにCloudflareのmanaged
 *   challengeを掛けた。判定はUser-Agentだけを見ており、ブラウザのUA
 *   (Chrome/Safari/Firefox いずれも)は403 `cf-mitigated: challenge` を返す。
 *   しかもこの403にはCORSヘッダが付かないため、ブラウザのfetchはステータスを
 *   見る前にCORSエラーで落ちる。結果、全キャラが「画像なし」になっていた
 *   (「たまに失敗する」ではなく全滅)。
 *
 *   実測(同一URL・UAだけ変更):
 *     Chrome/Safari/Firefox のUA -> 403 challenge
 *     `node` (Node標準fetchの既定UA) -> 403 challenge
 *     素の `Mozilla/5.0`            -> 403 challenge
 *     curl既定・下記のような独自UA   -> 200
 *
 *   つまり「名乗っているクライアント」は通る。ブラウザからは原理的に通せない
 *   ので、問い合わせをここ(CI)へ移す。画像本体を配信している cdn.donmai.us は
 *   ブラウザUAでも200なので、直リンク表示と出典表記のやり方は一切変えていない。
 *
 * ■ 画像は同梱せず直リンクのまま
 *   ファンアートの著作権は各絵師にある。ここでもファイルは複製せず、URLと
 *   絵師名・一次ソースだけを持つ(方針は src/chara/data/danbooru.ts 冒頭と同じ)。
 *
 * ■ リンク切れは定期再実行で回収する
 *   実行時fetchをやめた分、元投稿が消えたときの自己修復性が落ちる。週1で
 *   引き直すことでそれを取り戻す。加えて表示側は onError で枠に戻すので、
 *   次の実行までの間に消えた画像が壊れたアイコンになることはない。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG_MAP = path.join(ROOT, 'public/chara-picker/tag-map.json');
const OUT = path.join(ROOT, 'public/chara-picker/chara-images.json');

const API = 'https://danbooru.donmai.us';

/* 開発元(scripts/bayes/danbooru-client.mjs)と同じ自主規制。
 * 名乗ることがそのままchallenge回避にもなっている。 */
const USER_AGENT =
  'chara-picker-site/1.0 (+https://terasaki-8910.github.io/chara-picker/; representative image lookup, low frequency)';
const REQUEST_DELAY_MS = 1_100;

/** sensitive以上は使わない(2022年の4段階化で `s` の意味がsafe→sensitiveに変わっている)。 */
const RATING = 'rating:general';

/** 上位から選ぶ母集団。上位固定だと毎回同じ絵になるのでまとめて取る。 */
const POOL_SIZE = 40;

/** 1キャラあたり保存する候補数。表示側がこの中から1枚をランダムに選ぶので、
 * 「毎回違う絵が出る」実行時fetch時代の挙動をこれで維持する。増やすほど
 * 配信するJSONが太るため、体感が変わる最小限の枚数に留める。 */
const CANDIDATES = 3;

const ONLY = 'id,large_file_url,file_url,tag_string_artist,tag_string_general,tag_string_character,source';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 画像ファイルを直接指すホスト。人間が開いても403か生画像で、リンク先として使えない。 */
const IMAGE_HOSTS = ['i.pximg.net', 'pbs.twimg.com', 'cdn.donmai.us', 'img.danbooru.donmai.us'];

/**
 * `source` は絵師の投稿ページのこともあれば画像の直URLのこともある。後者を
 * そのままリンクにするとPixivはリファラ制限で403になり人間には開けない。
 * ページURLに正規化できるものだけ返し、できなければnull(投稿ページへ倒す)。
 */
function normalizeSource(source) {
  if (!source || !source.startsWith('http')) return null;
  let url;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  // Pixivの画像直URLはファイル名に作品IDが入る(例: 98123456_p0.jpg)ので復元できる
  if (url.hostname === 'i.pximg.net') {
    const m = url.pathname.match(/\/(\d+)_p\d+/);
    return m ? `https://www.pixiv.net/artworks/${m[1]}` : null;
  }
  if (IMAGE_HOSTS.includes(url.hostname)) return null;
  if (/\.(jpe?g|png|gif|webp|bmp|mp4|webm|zip)$/i.test(url.pathname)) return null;
  return source;
}

let lastCallAt = null;

async function danbooruGet(tags, limit) {
  if (lastCallAt !== null) {
    const wait = REQUEST_DELAY_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
  }
  lastCallAt = Date.now();
  const url = `${API}/posts.json?tags=${encodeURIComponent(tags)}&limit=${limit}&only=${ONLY}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    const mitigated = res.headers.get('cf-mitigated');
    throw new Error(
      `Danbooru API 失敗 (status=${res.status}${mitigated ? `, cf-mitigated=${mitigated}` : ''}): ${tags}`,
    );
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

const isSolo = (p) => (p.tag_string_general ?? '').split(' ').includes('solo');

/**
 * 写っているキャラの種類数。`solo` タグは当てにならない(100人以上写った
 * コラージュにsoloが付いている例を実際に確認した)ため、キャラクタータグの数も
 * 併せて見る。同一キャラの衣装違い(lisbeth_(sao) と lisbeth_(sao-alo) など)で
 * 2件になることがあるので2までは許す。
 */
const charCount = (p) => (p.tag_string_character ?? '').split(' ').filter(Boolean).length;

/** 「このキャラ1人が描かれた絵」に近いものから順に候補を探す。
 * 全部空振りしたら最後は全体から選ぶ(絵が出ないよりはまし)。 */
function bestPool(posts) {
  const usable = posts.filter((p) => p.large_file_url ?? p.file_url);
  if (usable.length === 0) return [];
  const tiers = [
    usable.filter((p) => isSolo(p) && charCount(p) <= 2),
    usable.filter((p) => charCount(p) <= 2),
    usable.filter(isSolo),
    usable,
  ];
  return tiers.find((t) => t.length > 0) ?? [];
}

/*
 * 1候補ぶんの最小表現。
 *   i = 画像URL(cdnの実URL。ここだけは組み立てず、APIが返したものをそのまま持つ
 *       — sample/original やハッシュ由来のディレクトリ構成はDanbooru側の都合で
 *       変わり得るので、こちらで復元しようとしない)
 *   p = 投稿ID。投稿ページURLは `/posts/{id}` のパーマリンクなので表示側で組む
 *       (URLをそのまま持つと全候補で33文字ずつ無駄になる)
 *   a = 絵師タグ / s = 絵師本人の投稿URL。いずれも無いことがあり、その場合は
 *       キーごと落とす(null を書くだけで配信量が増えるため)
 */
function toEntry(post) {
  const imageUrl = post.large_file_url ?? post.file_url;
  if (!imageUrl) return null;
  const artist = post.tag_string_artist?.trim() || null;
  const sourceUrl = normalizeSource(post.source);
  return {
    i: imageUrl,
    p: post.id,
    ...(artist ? { a: artist } : {}),
    ...(sourceUrl ? { s: sourceUrl } : {}),
  };
}

/** スコア上位から候補を CANDIDATES 件選ぶ。母集団の中で散らすため、
 * 上位に固まらないよう等間隔で拾う(1位・中位・下位あたり)。 */
function pickCandidates(posts) {
  const pool = bestPool(posts);
  if (pool.length === 0) return [];
  const n = Math.min(CANDIDATES, pool.length);
  const step = pool.length / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const entry = toEntry(pool[Math.floor(i * step)]);
    if (entry) out.push(entry);
  }
  return out;
}

async function fetchFor(tag) {
  try {
    return pickCandidates(await danbooruGet(`${tag} ${RATING} order:score`, POOL_SIZE));
  } catch (err) {
    // 未認証はタグ3つが上限(4つ目で PostQuery::TagLimitError)。メタタグを
    // 削って取り直す。
    process.stderr.write(`  retry without metatags: ${err.message}\n`);
    return pickCandidates(await danbooruGet(`${tag} ${RATING}`, POOL_SIZE));
  }
}

async function main() {
  const onlyIds = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  const tagMap = JSON.parse(readFileSync(TAG_MAP, 'utf8')).tags ?? {};
  // 前回の結果を土台にする。1キャラの取得が転んでも、そのキャラの既存の絵を
  // 消してしまわないため(全消し→「画像なし」が再発するのを防ぐ)。
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).characters ?? {} : {};

  const ids = onlyIds.length > 0 ? onlyIds : Object.keys(tagMap);
  const characters = { ...previous };
  let ok = 0;
  let empty = 0;
  let failed = 0;

  for (const [i, id] of ids.entries()) {
    const tag = tagMap[id];
    if (!tag) {
      process.stderr.write(`[${i + 1}/${ids.length}] ${id}: tag-map に無いのでスキップ\n`);
      continue;
    }
    try {
      const found = await fetchFor(tag);
      if (found.length > 0) {
        characters[id] = found;
        ok += 1;
      } else {
        // 「本当に絵が無い」ケース。前回分があるなら残さず消す(消えた投稿を
        // 掴み続けないため)。
        delete characters[id];
        empty += 1;
      }
      process.stderr.write(`[${i + 1}/${ids.length}] ${id} (${tag}): ${found.length}件\n`);
    } catch (err) {
      // 通信・レート制限などの失敗。前回分をそのまま残す(このキャラだけ
      // 古い絵のままになるが、画像なしになるよりよい)。
      failed += 1;
      process.stderr.write(`[${i + 1}/${ids.length}] ${id} (${tag}): 失敗 — ${err.message}\n`);
    }
  }

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    characters,
  };
  writeFileSync(OUT, JSON.stringify(out));
  const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1);
  process.stderr.write(
    `\n完了: 取得${ok} / 該当なし${empty} / 失敗${failed} — ${Object.keys(characters).length}キャラ, ${kb}KB\n`,
  );

  // 全滅は「Danbooru側の仕様変更をまた踏んだ」サイン。黙って空のJSONを
  // コミットしないよう、ここで落としてワークフローを赤くする。
  if (ok === 0 && ids.length > 0) {
    process.stderr.write('1件も取得できませんでした。Danbooru側の変更を疑ってください。\n');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
