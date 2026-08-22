import { useEffect, useState } from 'react';

import { fetchCharaImage, type CharaImage } from '../data/danbooru';

/**
 * キャラの代表画像。CIが先に引いておいた候補から1枚選び、Danbooruのcdnへ
 * 直リンクで表示する（取得方針とその理由は data/danbooru.ts 冒頭）。
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
  // 第三者CDNへの直リンクなので、取得できても表示に失敗することがある
  // (実際に ERR_CONNECTION_CLOSED を観測)。壊れた画像アイコンを出さずに枠へ戻す。
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState('loading');
    setImage(null);
    setBroken(false);

    (async () => {
      try {
        const found = await fetchCharaImage(characterId, controller.signal);
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

  if (state === 'none' || !image || broken) {
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
        <img
          src={image.imageUrl}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
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
 *
 * ここは chara-images.json の取得待ちなので、待たせていることを示す
 * インジケータに意味がある。Danbooruへ実行時に問い合わせていた頃より短く
 * （同一オリジンの1ファイル・全キャラ分で1回だけ）、2枚目以降は即座に出る。
 * 質問の切り替えに入れていた人工的な「考え中」とは性質が違う（あちらは
 * 待たせる理由が無いので撤去した）。
 * prefers-reduced-motion では動きを止める。
 *
 * export しているのは、トップページのおまかせプレビュー
 * (src/components/HomeCharaOmakase.tsx)でも同じ読み込み待ちの意味を持つため
 * 再利用するから。
 */
export function LoadingMark() {
  return (
    <span className="flex items-end gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-3 w-1 rounded-[1px] bg-muted motion-safe:animate-think motion-reduce:opacity-60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
