import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { Scored } from '../engine/recommend';
import GachaReveal, { CloseIcon, SkipIcon } from './GachaReveal';
import {
  loadPhoto,
  makeSparkles,
  NameArt,
  pickRainbow,
  RainbowLayer,
  readSeen,
  Sparkles,
  StarRow,
  useViewport,
  writeSeen,
  type Photo,
} from './parts';
import { gachaBgUrl, GACHA_FONT_FAMILY } from './prefetch';
import './gacha.css';

/*
 * 推しガチャの十連(本人の依頼 2026-10-29「同じ虹の文字で推しガチャ…単発と十連で」)。
 * 単発(GachaReveal)と同じ素材・虹・白を使い、
 *   1. 溜め: セリフ背景の真ん中で光がふくらむ。10体の絵がそろうまで延ばす(上限あり)
 *   2. 虹: 単発と同じ。5通りから毎回ランダム
 *   3. カード: 10枚が1枚ずつ白く光って落ちてきて、着地でつぶれて絵が出る。最後の1枚で全体が揺れる
 * 出し切ったら、カードを押すとその1体の単発の演出(台詞→虹→絵→名前→星3)を見られる。
 * 閉じると十連の結果画面(TenResultScreen)になる。途中で押すと最後まで飛ばす。
 * 段階のクラスの考え方は単発と同じ(通った段階のクラスは付けたまま)。
 */

const STEPS = ['quote', 'rainbow', 'reveal', 'done'] as const;
type Step = (typeof STEPS)[number];

/** 溜めを見せる長さ。 */
const CHARGE_MS = 1300;
/** 溜めの時間が過ぎても10体の絵がそろっていなければ、そろうまで溜めを延ばす。その上限(超えたら届いた分で進める)。 */
const CHARGE_HOLD_MAX_MS = 5000;
/** 虹が流れて真っ白になるまで(単発と同じ)。 */
const RAINBOW_MS = 950;
/** カードが落ちる間隔と、1枚が着地して収まるまで(gacha.css の .gten-card と合わせる)。 */
const CARD_GAP_MS = 220;
const CARD_LAND_MS = 560;
const FONT_WAIT_MAX_MS = 1500;

export default function GachaTen(props: { results: readonly Scored[]; onClose(): void }) {
  const { results, onClose } = props;

  const [step, setStep] = useState<Step | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [photos, setPhotos] = useState<(Photo | 'none' | undefined)[]>(() => results.map(() => undefined));
  const [newIds] = useState(() => {
    const seen = new Set(readSeen());
    return new Set(results.map((s) => s.character.id).filter((id) => !seen.has(id)));
  });
  const [rainbow] = useState(pickRainbow);
  const [open, setOpen] = useState<number | null>(null);
  const openRef = useRef<number | null>(null);
  openRef.current = open;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const viewport = useViewport();

  const skippedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const alive = () => !cancelled && !skippedRef.current;
    const loads = results.map((s, i) =>
      loadPhoto(s.character.id).then((p) => {
        if (!cancelled) setPhotos((prev) => prev.map((old, j) => (j === i ? (p ?? 'none') : old)));
      }),
    );

    (async () => {
      const text = results.map((s) => s.character.name).join('') + 'NEW';
      await Promise.race([document.fonts.load(`800 32px "${GACHA_FONT_FAMILY}"`, text).catch(() => undefined), wait(FONT_WAIT_MAX_MS)]);
      if (!alive()) return;
      setStep('quote');
      await wait(CHARGE_MS);
      if (!alive()) return;
      await Promise.race([Promise.all(loads), wait(CHARGE_HOLD_MAX_MS)]);
      if (!alive()) return;
      setStep('rainbow');
      await wait(RAINBOW_MS);
      if (!alive()) return;
      setStep('reveal');
      await wait((results.length - 1) * CARD_GAP_MS + CARD_LAND_MS);
      if (!alive()) return;
      setStep('done');
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [results]);

  // 出たキャラを覚える(次からは NEW を付けない)。NEW の判定は開いたときに済ませてある
  useEffect(() => {
    writeSeen(results.map((s) => s.character.id));
  }, [results]);

  // 開いている間は後ろのページを動かさない
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = before;
    };
  }, []);

  const skip = useCallback(() => {
    skippedRef.current = true;
    setSkipped(true);
    setStep('done');
  }, []);

  const advance = useCallback(() => {
    if (step === 'done') onClose();
    else skip();
  }, [step, onClose, skip]);

  // 1体の演出を開いている間は、Esc はそちらが受け持つ
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || openRef.current !== null) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const closeOne = useCallback(() => {
    const index = openRef.current;
    setOpen(null);
    if (index !== null) window.setTimeout(() => cardRefs.current[index]?.focus({ preventScroll: true }), 0);
  }, []);

  const reached = step === null ? -1 : STEPS.indexOf(step);
  const classes = ['gacha', 'gacha-ten', ...STEPS.filter((_, i) => i <= reached).map((s) => `s-${s}`)];
  if (skipped) classes.push('is-skipped');

  const layout = tenLayout(viewport.width, viewport.height, results.length);
  const sparkles = useMemo(() => makeSparkles(18), []);
  const credits = photos.flatMap((p, i) => (p && p !== 'none' ? [{ photo: p, name: results[i].character.name }] : []));

  const rows: { scored: Scored; i: number }[][] = [];
  for (let start = 0, r = 0; r < layout.rows.length; start += layout.rows[r], r++) {
    const base = start;
    rows.push(results.slice(base, base + layout.rows[r]).map((scored, j) => ({ scored, i: base + j })));
  }

  return (
    <>
      <div
        className={classes.join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="推しガチャ 十連"
        data-testid="gacha-ten"
        data-step={step ?? 'loading'}
        data-rainbow={rainbow}
        onClick={advance}
      >
        <div className="gacha-bg" aria-hidden="true">
          <img src={gachaBgUrl()} alt="" decoding="async" />
          <div className="gacha-bokeh">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
          <Sparkles items={sparkles} className="gacha-twinkle" />
        </div>
        <div className="gten-glow" aria-hidden="true" />

        <div
          className="gten-field"
          style={{ padding: `${layout.top}px ${layout.side}px ${layout.bottom}px` }}
        >
          <div
            className="gten-grid"
            style={{ '--card': `${layout.card}px`, '--gap': `${layout.gap}px` } as CSSProperties}
          >
            {rows.map((row, r) => (
              <div key={r} className="gten-row">
                {row.map(({ scored, i }) => (
                  <TenCard
                    key={scored.character.id}
                    buttonRef={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    scored={scored}
                    index={i}
                    photo={photos[i]}
                    isNew={newIds.has(scored.character.id)}
                    card={layout.card}
                    focusable={step === 'done'}
                    onPress={() => (step === 'done' ? setOpen(i) : skip())}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <RainbowLayer variant={rainbow} />
        <div className="gacha-white" aria-hidden="true" />

        {credits.length > 0 && (
          <p className="gten-credit" onClick={(event) => event.stopPropagation()}>
            絵:{' '}
            {credits.map(({ photo, name }, i) => (
              <span key={photo.image.postUrl}>
                {i > 0 && ' / '}
                <a href={photo.image.postUrl} target="_blank" rel="noopener noreferrer" aria-label={`${name}の絵をDanbooruで開く`}>
                  {photo.image.artist ?? 'Danbooru'}
                </a>
              </span>
            ))}
            {' (Danbooru)'}
          </p>
        )}

        <button
          ref={buttonRef}
          type="button"
          className="gacha-button"
          data-testid="gacha-ten-button"
          aria-label={step === 'done' ? '閉じる' : '最後まで飛ばす'}
          onClick={(event) => {
            event.stopPropagation();
            advance();
          }}
        >
          {step === 'done' ? <CloseIcon /> : <SkipIcon />}
        </button>
      </div>

      {/* 十連の重ね絵の外に置く(中に置くと、こちらを押したのが十連の「閉じる」にも届くため) */}
      {open !== null && (
        <GachaReveal scored={results[open]} isNew={newIds.has(results[open].character.id)} onClose={closeOne} />
      )}
    </>
  );
}

/** 十連のカード1枚。押すと、出し切る前なら最後まで飛ばし、出し切ったあとならその1体の演出を開く。 */
function TenCard(props: {
  buttonRef: (el: HTMLButtonElement | null) => void;
  scored: Scored;
  index: number;
  photo: Photo | 'none' | undefined;
  isNew: boolean;
  card: number;
  focusable: boolean;
  onPress(): void;
}) {
  const { buttonRef, scored, index, photo, isNew, card, focusable, onPress } = props;
  const { character } = scored;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="gten-card"
      data-testid="gacha-ten-card"
      style={{ '--ci': index } as CSSProperties}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${character.name}(${character.series})`}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <span className="gten-frame" aria-hidden="true">
        {photo && photo !== 'none' ? (
          <img className="gten-photo" src={photo.image.imageUrl} alt="" />
        ) : (
          <span className="gten-photo gten-photo-none" />
        )}
        <span className="gten-scrim" />
        <StarRow className="gten-stars" />
        {isNew && <span className="gten-new">NEW</span>}
        <NameArt className="gten-name" name={character.name} width={card - 10} maxSize={card * 0.17} />
        <span className="gten-flash" />
      </span>
      <span className="gten-ring" aria-hidden="true" />
    </button>
  );
}

/**
 * カードの並びと大きさ。縦長の画面は 2・3・3・2 の4段(ひし形)、横長の画面は 5・5 の2段。
 * カードは縦横 3:4。上は余白、下は出典と右下のボタンの分を空ける。
 */
function tenLayout(width: number, height: number, count: number) {
  const landscape = width > height * 1.05;
  const rows = count === 10 ? (landscape ? [5, 5] : [2, 3, 3, 2]) : [count];
  const cols = Math.max(...rows);
  const wide = width >= 768;
  const gap = wide ? 16 : 10;
  const side = wide ? 32 : 14;
  const top = wide ? 56 : 44;
  const bottom = wide ? 104 : 96;
  const byWidth = (width - side * 2 - gap * (cols - 1)) / cols;
  const byHeight = ((height - top - bottom - gap * (rows.length - 1)) / rows.length) * 0.75;
  const card = Math.floor(Math.max(48, Math.min(byWidth, byHeight, 280)));
  return { rows, card, gap, side, top, bottom };
}
