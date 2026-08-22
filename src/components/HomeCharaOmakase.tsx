import { useEffect, useState } from 'react';

import { LoadingMark } from '../chara/components/CharacterImage';
import { fetchCharaImage, type CharaImage } from '../chara/data/danbooru';
import { charactersSchema, supplyFileSchema } from '../chara/data/schema';
import { omakase, type Dataset, type Scored } from '../chara/engine/recommend';

/**
 * /chara-picker/ のプレビュー。ページへのリンクだけでなく「おまかせ」を
 * その場で1回試せるボタンを置く(本人指定)。結果はSpotifyプレビューの
 * アルバムアート(w-14 h-14)と同じ大きさのサムネイル1枚だけ。
 *
 * characters.json/supply.json はページ読み込み時に即fetchする(本人指定、
 * 「チャンクフェッチしたい」)。likelihoods/questions.runtime/chara-imagesは
 * omakase()に不要なので取らない — 実際に要るのはomakase内部が呼ぶ
 * survivors()の判定に使うcharacters/supplyだけ(engine/recommend.ts参照)。
 * chara-images.json(画像候補)はボタンを押した時だけ`fetchCharaImage()`が
 * 自前で遅延fetch+キャッシュする(data/danbooru.ts)ので、ここでも呼ぶだけでよい。
 */

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; dataset: Dataset };
// 'loading'|null は「picked確定前」にも「Danbooru問い合わせ中/失敗」にも使われるが、
// 前者はpicked===nullの分岐で弾かれるため、picked確定後の描画では常に後者の意味になる。
type ImageState = 'loading' | CharaImage | null;

export default function HomeCharaOmakase() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [picked, setPicked] = useState<Scored | null>(null);
  const [image, setImage] = useState<ImageState>(null);

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

  const handlePick = async () => {
    if (load.status !== 'ready') return;
    const result = omakase(load.dataset, { seed: Date.now() });
    setPicked(result);
    setImage('loading');
    try {
      setImage(await fetchCharaImage(result.character.id));
    } catch {
      setImage(null);
    }
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
        className="text-sm text-ink border border-line rounded px-4 py-2.5 hover:border-accent hover:text-accent transition-colors"
      >
        おまかせで見る
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-14 h-14 shrink-0 rounded overflow-hidden border border-line">
        {image === 'loading' ? (
          <div className="flex h-full w-full items-center justify-center" aria-busy="true" aria-label="画像を読み込み中">
            <LoadingMark />
          </div>
        ) : image ? (
          <a
            href={image.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${picked.character.name}の画像をDanbooruで開く`}
          >
            <img src={image.imageUrl} alt={picked.character.name} className="h-full w-full object-cover" />
          </a>
        ) : (
          <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
            <span className="text-[10px] text-muted">画像なし</span>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-ink font-medium text-sm truncate">{picked.character.name}</p>
        <p className="text-muted text-xs truncate mt-0.5">{picked.character.series}</p>
        {/* 第三者の著作物なので、取得できた場合は絵師名を必ず添える(CharacterImage.tsxと同方針) */}
        {image && image !== 'loading' && image.artist && (
          <p className="text-[11px] text-muted mt-0.5 truncate">
            絵:{' '}
            <a
              href={image.sourceUrl ?? image.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink"
            >
              {image.artist}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
