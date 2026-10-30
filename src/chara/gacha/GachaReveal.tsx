import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { fetchQuote } from '../data/quotes';
import type { Scored } from '../engine/recommend';
import {
  loadPhoto,
  makeSparkles,
  NameArt,
  pickRainbow,
  RainbowLayer,
  RainbowText,
  readSeen,
  Sparkles,
  splitQuote,
  StarRow,
  useViewport,
  useWidth,
  writeSeen,
  type Photo,
} from './parts';
import { loadPhraseParser } from './phrases';
import { gachaBgUrl, GACHA_FONT_FAMILY } from './prefetch';
import './gacha.css';
import './quote.css';

/*
 * おまかせの結果を、ソシャゲのガチャの演出のように見せる全画面の重ね絵
 * (本人の依頼 2026-10-29。見本はウマ娘のガチャ)。
 *   1. 台詞: セリフ背景の素材(ニコニ・コモンズ nc296436)の上に、名台詞を数秒
 *   2. 虹: 虹が流れて、画面が白く飛ぶ(明転)。見せ方は5通りから毎回ランダム(RainbowLayer)
 *   3. 絵: キャラの絵がドーンと出る
 *   4. 名前: 作品名の帯と、名前が勢いよく出て、星3が1つずつ重く付く
 * 出し切ったら、押すと閉じて下の結果画面(ResultScreen)になる。途中で押すと最後まで飛ばす。
 * 十連(GachaTen)では、カードを押したときにその1体の分をこれで見せる。
 * 動きを減らす設定の人には出さない(呼ぶ側で結果画面へ直行する)。
 *
 * 段階は CSS のクラス(s-quote, s-rainbow …)で表し、通った段階のクラスは付けたままにする。
 * 各要素のアニメーションは fill-mode both で終わりの姿を保つので、飛ばすときは全部のクラスを
 * 付けて、アニメーションの時間を縮める(is-skipped)だけでよい。
 */

const STEPS = ['quote', 'rainbow', 'reveal', 'name', 'done'] as const;
type Step = (typeof STEPS)[number];

/** 台詞を見せる長さ。台詞の無いキャラは背景だけ短く見せる。 */
const QUOTE_MS = 3000;
const NO_QUOTE_MS = 900;
/**
 * 台詞の時間が過ぎても絵が届いていなければ、届くまで台詞を出したまま待つ(本人 2026-10-29)。
 * その上限。超えたら絵なしで進める。待つ間も右下のボタンと画面を押せば飛ばせる。
 */
const QUOTE_HOLD_MAX_MS = 5000;
/** 虹が流れて真っ白になるまで(CSS の g-white-in の終わりと合わせる)。 */
const RAINBOW_MS = 950;
/** 絵が出てから名前を出すまで。 */
const REVEAL_MS = 600;
/** 名前が出てから、星3が付き終わり、押して閉じられるようになるまで(CSS の星の時刻と合わせる)。 */
const NAME_MS = 2100;
/** フォントを待つ上限。超えたら代わりの書体のまま始める。 */
const FONT_WAIT_MAX_MS = 1500;

export default function GachaReveal(props: {
  scored: Scored;
  onClose(): void;
  /** 十連から開いたとき、十連の側で決めた NEW をそのまま使う(先に「出た」と覚えてしまうため)。 */
  isNew?: boolean;
}) {
  const { scored, onClose } = props;
  const { character } = scored;

  const [step, setStep] = useState<Step | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null | 'none'>(null);
  const [isNew] = useState(() => props.isNew ?? !readSeen().includes(character.id));
  const [rainbow] = useState(pickRainbow);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const viewport = useViewport();

  // 段階を進める流れ。飛ばされたら以降は何もしない。
  const skippedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const alive = () => !cancelled && !skippedRef.current;
    const photoPromise = loadPhoto(character.id).then((p) => {
      if (!cancelled) setPhoto(p ?? 'none');
      return p;
    });

    (async () => {
      const found = await fetchQuote(character.id);
      const text = `${found ?? ''}${character.name}[${character.series}]NEW`;
      // 書体と、台詞を文節に区切る部品(phrases.ts)がそろってから出す(出したあとで折り返しが変わらないように)
      const ready = Promise.all([document.fonts.load(`800 32px "${GACHA_FONT_FAMILY}"`, text).catch(() => undefined), loadPhraseParser()]);
      await Promise.race([ready, wait(FONT_WAIT_MAX_MS)]);
      if (!alive()) return;
      setQuote(found);
      setStep('quote');
      await wait(found ? QUOTE_MS : NO_QUOTE_MS);
      if (!alive()) return;
      await Promise.race([photoPromise, wait(QUOTE_HOLD_MAX_MS)]);
      if (!alive()) return;
      setStep('rainbow');
      await wait(RAINBOW_MS);
      if (!alive()) return;
      setStep('reveal');
      await wait(REVEAL_MS);
      if (!alive()) return;
      setStep('name');
      await wait(NAME_MS);
      if (!alive()) return;
      setStep('done');
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [character.id, character.name, character.series]);

  // 出たキャラを覚える(次からは NEW を付けない)
  useEffect(() => {
    writeSeen([character.id]);
  }, [character.id]);

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
    // 台詞は飛ばしても結果画面と同じものを出しておく
    fetchQuote(character.id).then(setQuote, () => undefined);
  }, [character.id]);

  const advance = useCallback(() => {
    if (step === 'done') onClose();
    else skip();
  }, [step, onClose, skip]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const reached = step === null ? -1 : STEPS.indexOf(step);
  const classes = ['gacha', ...STEPS.filter((_, i) => i <= reached).map((s) => `s-${s}`)];
  if (skipped) classes.push('is-skipped');

  const fit = photo && photo !== 'none' ? chooseFit(photo.width / photo.height, viewport.width / viewport.height) : 'cover';
  const sparkles = useMemo(() => makeSparkles(18), []);
  const bursts = useMemo(() => makeSparkles(12), []);
  const quoteLines = useMemo(() => (quote ? splitQuote(quote) : []), [quote]);

  return (
    <div
      className={classes.join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="おまかせの結果"
      data-testid="gacha"
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

      {quoteLines.length > 0 && (
        <p className="gacha-quote" data-testid="gacha-quote">
          <span className="gacha-quote-lines">
            {quoteLines.map((line, i) => (
              <RainbowText key={i} className="gacha-quote-line" style={{ '--i': i } as CSSProperties} text={line} />
            ))}
          </span>
        </p>
      )}

      {/* 星が付くたびに、絵と名前をまとめて揺らす(g-thud) */}
      <div className="gacha-scene">
        <div className="gacha-stage" data-fit={fit} aria-hidden="true">
          {photo && photo !== 'none' ? (
            <>
              {fit === 'contain' && <img className="gacha-backdrop" src={photo.image.imageUrl} alt="" />}
              <img className="gacha-photo" src={photo.image.imageUrl} alt="" />
            </>
          ) : (
            <div className="gacha-photo gacha-photo-none" />
          )}
          <div className="gacha-rays" />
          <Streaks width={viewport.width} height={viewport.height} />
          <Sparkles items={bursts} className="gacha-burst" />
          <div className="gacha-scrim" />
        </div>

        <Nameplate name={character.name} series={character.series} isNew={isNew} />
        <StarRow className="gacha-stars" />
      </div>

      <RainbowLayer variant={rainbow} />
      <div className="gacha-white" aria-hidden="true" />

      {photo && photo !== 'none' && (
        <p className="gacha-credit" onClick={(event) => event.stopPropagation()}>
          {photo.image.artist && (
            <>
              絵:{' '}
              <a href={photo.image.sourceUrl ?? photo.image.postUrl} target="_blank" rel="noopener noreferrer">
                {photo.image.artist}
              </a>
              {' / '}
            </>
          )}
          <a href={photo.image.postUrl} target="_blank" rel="noopener noreferrer">
            Danbooru
          </a>
        </p>
      )}

      <button
        ref={buttonRef}
        type="button"
        className="gacha-button"
        data-testid="gacha-button"
        aria-label={step === 'done' ? '閉じる' : '最後まで飛ばす'}
        onClick={(event) => {
          event.stopPropagation();
          advance();
        }}
      >
        {step === 'done' ? <CloseIcon /> : <SkipIcon />}
      </button>
    </div>
  );
}

/** 作品名の帯と名前。名前は幅に合わせて大きさを決める(NameArt)。 */
function Nameplate(props: { name: string; series: string; isNew: boolean }) {
  const { name, series, isNew } = props;
  const { ref, width } = useWidth<HTMLDivElement>();

  const bandText = `[${series}]`;
  const bandSize = Math.min(width * 0.062, 30, (width * 0.86) / emWidth(bandText));

  return (
    <div className="gacha-plate" ref={ref}>
      {isNew && <span className="gacha-new">NEW</span>}
      <div className="gacha-band">
        <span style={{ fontSize: `${bandSize}px` }}>{bandText}</span>
      </div>
      <h2 className="gacha-name-heading">
        <span className="sr-only">
          {name}({series})
        </span>
        {/* 短い名前ほど大きく(見本は名前が画面の幅いっぱい) */}
        {width > 0 && <NameArt className="gacha-name" name={name} width={width} maxSize={Math.min(width * 0.27, 160)} />}
      </h2>
    </div>
  );
}

/**
 * 絵が出た瞬間に走る光の筋(見本の2枚目の金の弧)。座標は画面の px で組む
 * (viewBox を引き伸ばすと、弧の形と線の太さ・破線の長さが画面の縦横比で崩れるため)。
 */
function Streaks(props: { width: number; height: number }) {
  const { width: w, height: h } = props;
  const arcs: [number, number, number, number, number, number][] = [
    [-0.1, 0.8, 0.45, 0.36, 1.12, 0.5],
    [-0.1, 0.94, 0.6, 0.5, 1.12, 0.22],
    [-0.1, 0.32, 0.6, 0.72, 1.12, 0.9],
    [0.1, -0.06, 0.5, 0.5, 0.26, 1.08],
  ];
  return (
    <svg className="gacha-streaks" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="gacha-streak" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffe7a3" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff2c8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {arcs.map(([x0, y0, cx, cy, x1, y1], i) => (
        <path key={i} d={`M ${x0 * w} ${y0 * h} Q ${cx * w} ${cy * h} ${x1 * w} ${y1 * h}`} pathLength={1} />
      ))}
    </svg>
  );
}

export function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 5.5v13l8.5-6.5zM11.5 5.5v13l8.5-6.5z" fill="currentColor" />
      <rect x="20" y="5.5" width="2.2" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 絵の縦横比が画面に近ければ画面いっぱいに(見本と同じ)、離れていれば絵を丸ごと見せて
 * 後ろをぼかした同じ絵で埋める。横長の絵を縦長の画面いっぱいにすると、キャラが切れるため。
 */
function chooseFit(imageRatio: number, screenRatio: number): 'cover' | 'contain' {
  const r = imageRatio / screenRatio;
  return r >= 0.62 && r <= 1.6 ? 'cover' : 'contain';
}

/** 全角を1、半角を0.55として、文字列の幅を em で見積もる。 */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return Math.max(w, 1);
}
