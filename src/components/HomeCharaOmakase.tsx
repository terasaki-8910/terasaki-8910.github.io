import { lazy, Suspense, useEffect, useState } from 'react';

import { LoadingMark } from '../chara/components/CharacterImage';
import { charactersSchema, supplyFileSchema } from '../chara/data/schema';
import { omakase, type Dataset, type Scored } from '../chara/engine/recommend';
import { prefetchGachaMini } from '../chara/gacha/prefetch';

/**
 * /chara-picker/ のプレビュー。ページへのリンクだけでなく「おまかせ」を
 * その場で1回試せるボタンを置く(本人指定)。結果はSpotifyプレビューの
 * アルバムアート(w-14 h-14)と同じ大きさのサムネイル1枚だけ。
 *
 * 引いたときは、ページの全画面の演出を小さくしたもの(GachaMini)を、この行の中で出す
 * (本人の依頼 2026-10-29「ホームページにも小さめのエフェクト」)。演出のコードは
 * ボタンに指が触れた時点で読み込む(トップページを開いただけでは読ませない)。
 *
 * characters.json/supply.json はページ読み込み時に即fetchする(本人指定、
 * 「チャンクフェッチしたい」)。likelihoods/questions.runtime/chara-imagesは
 * omakase()に不要なので取らない — 実際に要るのはomakase内部が呼ぶ
 * survivors()の判定に使うcharacters/supplyだけ(engine/recommend.ts参照)。
 * chara-images.json(画像候補)は引いた後に GachaMini が `loadPhoto()` 経由で
 * 遅延fetch+キャッシュする(data/danbooru.ts)。
 */

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; dataset: Dataset };

const GachaMini = lazy(() => import('../chara/gacha/GachaMini'));

export default function HomeCharaOmakase() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [picked, setPicked] = useState<Scored | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/chara-picker/characters.json').then((r) => r.json()),
      fetch('/chara-picker/supply.json').then((r) => r.json()),
    ])
      .then(([charactersRaw, supplyRaw]) => {
        if (cancelled) return;
        const characters = charactersSchema.parse(charactersRaw);
        const supply = supplyFileSchema.parse(supplyRaw);
        setLoad({ status: 'ready', dataset: { characters, supply } });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = () => {
    if (load.status !== 'ready') return;
    setPicked(devPick(load.dataset) ?? omakase(load.dataset, { seed: Date.now() }));
  };

  if (load.status === 'loading') {
    return <div className="h-14 w-14 bg-surface border border-line rounded animate-pulse" aria-hidden="true" />;
  }

  if (load.status === 'error') {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">理想の推しア◯ネイター</div>;
  }

  if (!picked) {
    return (
      <button
        type="button"
        onClick={handlePick}
        onPointerEnter={prefetchGachaMini}
        onPointerDown={prefetchGachaMini}
        onFocus={prefetchGachaMini}
        className="text-sm text-ink border border-line rounded px-4 py-2.5 hover:border-accent hover:text-accent transition-colors"
      >
        おまかせで見る
      </button>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-14 w-14 items-center justify-center rounded border border-line" aria-busy="true">
          <LoadingMark />
        </div>
      }
    >
      <GachaMini key={picked.character.id} scored={picked} />
    </Suspense>
  );
}

/** 開発用: `?gacha=<キャラのid>` で、おまかせの結果をそのキャラにする。本番のビルドでは何もしない。 */
function devPick(dataset: Dataset): Scored | null {
  if (!import.meta.env.DEV) return null;
  const id = new URLSearchParams(window.location.search).get('gacha');
  const character = id ? dataset.characters.find((c) => c.id === id) : undefined;
  if (!character) return null;
  return { character, score: 0, supplyRank: 'なし', reasons: [] };
}
