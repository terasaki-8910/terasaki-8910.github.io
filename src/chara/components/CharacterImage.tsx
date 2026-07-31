import { useEffect, useState } from 'react';

import { fetchCharaImage, loadTagMap, type CharaImage } from '../data/danbooru';

/**
 * キャラの代表画像。Danbooruから実行時に1枚引いて直リンクで表示する
 * （取得方針とその理由は data/danbooru.ts 冒頭）。
 *
 * 画像そのものは同梱していない第三者の著作物なので、必ず絵師名と
 * 一次ソース／投稿ページへの導線を添える。取得できない場合も枠は消さず、
 * プレースホルダのまま置く（レイアウトが跳ねないように）。
 */
export function CharacterImage(props: {
  characterId: string;
  name: string;
  testId: string;
  className?: string;
}) {
  const { characterId, name, testId, className } = props;
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');
  const [image, setImage] = useState<CharaImage | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState('loading');
    setImage(null);

    (async () => {
      try {
        const tags = await loadTagMap();
        const tag = tags[characterId];
        if (!tag) {
          if (!cancelled) setState('none');
          return;
        }
        const found = await fetchCharaImage(tag, controller.signal);
        if (cancelled) return;
        setImage(found);
        setState(found ? 'ready' : 'none');
      } catch {
        if (!cancelled) setState('none');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [characterId]);

  const frame = `relative aspect-[3/4] w-full max-w-56 shrink-0 overflow-hidden rounded border border-line ${className ?? ''}`;

  if (state === 'loading') {
    return (
      <div data-testid={testId} className={frame} aria-busy="true" aria-label="画像を読み込み中">
        <div className="flex h-full w-full items-center justify-center">
          <LoadingMark />
        </div>
      </div>
    );
  }

  if (state === 'none' || !image) {
    return (
      <div data-testid={testId} className={frame}>
        <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
          <span className="text-xs text-muted">画像なし</span>
        </div>
      </div>
    );
  }

  return (
    <figure data-testid={testId} className="m-0 w-full max-w-56 shrink-0">
      <a
        href={image.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`${testId}-link`}
        className={`${frame} block transition-opacity hover:opacity-90`}
        aria-label={`${name}の画像をDanbooruで開く`}
      >
        <img src={image.imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
      </a>
      {/* 第三者の著作物なので出典を必ず添える */}
      <figcaption className="mt-2 text-left text-[11px] leading-relaxed text-muted">
        {image.artist && (
          <>
            絵:{' '}
            <a
              href={image.sourceUrl ?? image.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink"
            >
              {image.artist}
            </a>
            {' / '}
          </>
        )}
        <a
          href={image.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          Danbooru
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * 読み込み中の仮マーク。ドット絵モーションに差し替える予定の場所。
 * prefers-reduced-motion では点滅を止める。
 */
function LoadingMark() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-[1px] bg-muted motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
