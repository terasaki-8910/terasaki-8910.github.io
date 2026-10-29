import { useEffect, useMemo, useState } from 'react';

import { LoadingMark } from '../components/CharacterImage';
import { fetchQuote } from '../data/quotes';
import type { Scored } from '../engine/recommend';
import { loadPhoto, makeSparkles, NameArt, Sparkles, StarRow, useWidth, type Photo } from './parts';
import { gachaBgUrl, gachaEnabled, GACHA_FONT_FAMILY } from './prefetch';
import './mini.css';

/*
 * トップページの「おまかせで見る」の小さい演出(本人の依頼 2026-10-29「ホームページにも小さめのエフェクト」)。
 * 全画面の演出(GachaReveal)と同じ流れを、カードの1行の中で短くやる。
 *   台詞(セリフ背景の帯の上) → 虹が横切って白く飛ぶ → 絵がドン → 名前と星3
 * 動きを減らす設定では、最後の姿をすぐ出す。
 * 段階のクラスの考え方は GachaReveal と同じ(通った段階のクラスは付けたまま)。
 */

const STEPS = ['quote', 'rainbow', 'reveal', 'name', 'done'] as const;
type Step = (typeof STEPS)[number];

const QUOTE_MS = 1800;
const NO_QUOTE_MS = 500;
/** 台詞の時間が過ぎても絵が届いていなければ、届くまで台詞を出したまま待つ上限(GachaReveal と同じ考え方)。 */
const QUOTE_HOLD_MAX_MS = 4000;
/** 虹が横切って白くなるまで(mini.css の gm-white-in の終わりと合わせる)。 */
const RAINBOW_MS = 600;
const REVEAL_MS = 350;
/** 名前が出てから星3が付き終わるまで(mini.css の星の時刻と合わせる)。 */
const NAME_MS = 1400;
const FONT_WAIT_MAX_MS = 1200;

export default function GachaMini(props: { scored: Scored }) {
  const { character } = props.scored;
  const [animate] = useState(gachaEnabled);
  const [step, setStep] = useState<Step | null>(animate ? null : 'done');
  const [quote, setQuote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null | 'none'>(null);
  const { ref: textRef, width: textWidth } = useWidth<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const photoPromise = loadPhoto(character.id).then((p) => {
      if (!cancelled) setPhoto(p ?? 'none');
      return p;
    });

    (async () => {
      const found = await fetchQuote(character.id);
      if (cancelled) return;
      setQuote(found);
      if (!animate) return;
      const text = `${found ?? ''}${character.name}`;
      await Promise.race([document.fonts.load(`800 16px "${GACHA_FONT_FAMILY}"`, text).catch(() => undefined), wait(FONT_WAIT_MAX_MS)]);
      if (cancelled) return;
      setStep('quote');
      await wait(found ? QUOTE_MS : NO_QUOTE_MS);
      if (cancelled) return;
      await Promise.race([photoPromise, wait(QUOTE_HOLD_MAX_MS)]);
      if (cancelled) return;
      setStep('rainbow');
      await wait(RAINBOW_MS);
      if (cancelled) return;
      setStep('reveal');
      await wait(REVEAL_MS);
      if (cancelled) return;
      setStep('name');
      await wait(NAME_MS);
      if (cancelled) return;
      setStep('done');
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [character.id, character.name, animate]);

  const twinkles = useMemo(() => makeSparkles(8, 12), []);
  const bursts = useMemo(() => makeSparkles(6, 14), []);
  const reached = step === null ? -1 : STEPS.indexOf(step);
  const classes = ['gmini', ...STEPS.filter((_, i) => i <= reached).map((s) => `s-${s}`)];
  if (!animate) classes.push('is-still');

  return (
    <div className={classes.join(' ')} data-testid="gacha-mini" data-step={step ?? 'loading'}>
      {animate && (
        <div className="gmini-strip" aria-hidden="true">
          <img src={gachaBgUrl()} alt="" decoding="async" />
          <Sparkles items={twinkles} className="gmini-twinkle" />
          {quote && <p className="gmini-quote">{quote}</p>}
          <span className="gmini-sweep" />
          <span className="gmini-white" />
        </div>
      )}

      <div className="gmini-result">
        {/* きらめきは枠の外まで散らすので、絵を切り抜く枠とは分ける */}
        <div className="gmini-thumb relative h-14 w-14 shrink-0">
          <div className="h-full w-full overflow-hidden rounded border border-line">
            {photo === null ? (
              <div className="flex h-full w-full items-center justify-center" aria-busy="true" aria-label="画像を読み込み中">
                <LoadingMark />
              </div>
            ) : photo !== 'none' ? (
              <a
                href={photo.image.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${character.name}の画像をDanbooruで開く`}
              >
                <img src={photo.image.imageUrl} alt={character.name} className="h-full w-full object-cover" />
              </a>
            ) : (
              <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
                <span className="text-[10px] text-muted">画像なし</span>
              </div>
            )}
          </div>
          <Sparkles items={bursts} className="gmini-burst" />
        </div>

        <div className="min-w-0 flex-1" ref={textRef}>
          <p className="sr-only">{character.name}</p>
          {textWidth > 0 && <NameArt className="gmini-name" name={character.name} width={Math.min(textWidth, 260)} maxSize={24} />}
          <p className="gmini-series text-muted text-xs truncate">{character.series}</p>
          <StarRow className="gmini-stars" />
          {/* 第三者の著作物なので、取得できた場合は絵師名を必ず添える(CharacterImage.tsx と同方針) */}
          {photo && photo !== 'none' && photo.image.artist && (
            <p className="gmini-credit text-[11px] text-muted mt-0.5 truncate">
              絵:{' '}
              <a
                href={photo.image.sourceUrl ?? photo.image.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink"
              >
                {photo.image.artist}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
