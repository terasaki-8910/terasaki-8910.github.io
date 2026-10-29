import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { fetchCharaImage, nextCharaImage, type CharaImage } from '../data/danbooru';
import { fetchQuote } from '../data/quotes';
import type { Scored } from '../engine/recommend';
import { GACHA_BG_URL, GACHA_FONT_FAMILY } from './prefetch';
import './gacha.css';

/*
 * おまかせの結果を、ソシャゲのガチャの演出のように見せる全画面の重ね絵
 * (本人の依頼 2026-10-29。見本はウマ娘のガチャ)。
 *   1. 台詞: セリフ背景の素材(ニコニ・コモンズ nc296436)の上に、名台詞を数秒
 *   2. 虹: 虹の帯が流れて、画面が白く飛ぶ(明転)
 *   3. 絵: キャラの絵がドーンと出る
 *   4. 名前: 作品名の帯と、名前が勢いよく出る
 * 出し切ったら、押すと閉じて下の結果画面(ResultScreen)になる。途中で押すと最後まで飛ばす。
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
/** 虹が流れて真っ白になるまで(CSS の g-white-in の終わりと合わせる)。 */
const RAINBOW_MS = 950;
/** 真っ白のまま絵の読み込みを待つ上限。超えたら絵なしで進める。 */
const IMAGE_WAIT_MAX_MS = 4000;
/** 絵が出てから名前を出すまで。 */
const REVEAL_MS = 600;
/** 名前が出てから、押して閉じられるようになるまで。 */
const NAME_MS = 1100;
/** フォントを待つ上限。超えたら代わりの書体のまま始める。 */
const FONT_WAIT_MAX_MS = 1500;

/** 「NEW」を出すために、このブラウザで出たことのあるキャラを覚えておく。 */
const SEEN_KEY = 'chara-gacha-seen';
const SEEN_MAX = 3000;

type Photo = { image: CharaImage; width: number; height: number };

export default function GachaReveal(props: { scored: Scored; onClose(): void }) {
  const { scored, onClose } = props;
  const { character } = scored;

  const [step, setStep] = useState<Step | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null | 'none'>(null);
  const [isNew] = useState(() => !readSeen().includes(character.id));
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
      await Promise.race([document.fonts.load(`800 32px "${GACHA_FONT_FAMILY}"`, text).catch(() => undefined), wait(FONT_WAIT_MAX_MS)]);
      if (!alive()) return;
      setQuote(found);
      setStep('quote');
      await wait(found ? QUOTE_MS : NO_QUOTE_MS);
      if (!alive()) return;
      setStep('rainbow');
      await Promise.all([wait(RAINBOW_MS), Promise.race([photoPromise, wait(IMAGE_WAIT_MAX_MS)])]);
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
    writeSeen(character.id);
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
      onClick={advance}
    >
      <div className="gacha-bg" aria-hidden="true">
        <img src={GACHA_BG_URL} alt="" decoding="async" />
        <div className="gacha-bokeh">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <Sparkles items={sparkles} className="gacha-twinkle" />
      </div>

      {quoteLines.length > 0 && (
        <p className="gacha-quote" data-testid="gacha-quote">
          {quoteLines.map((line, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties}>
              {line}
            </span>
          ))}
        </p>
      )}

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

      <div className="gacha-rainbow" aria-hidden="true">
        {RIBBONS.map((ribbon, i) => (
          <span key={i} className="gacha-ribbon" style={ribbon} />
        ))}
      </div>
      <div className="gacha-white" aria-hidden="true" />

      <Nameplate name={character.name} series={character.series} isNew={isNew} />

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

/** 作品名の帯と名前。名前は幅に合わせて大きさを決め、長い名前は横に詰める。 */
function Nameplate(props: { name: string; series: string; isNew: boolean }) {
  const { name, series, isNew } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

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
        {width > 0 && <NameArt name={name} width={width} />}
      </h2>
    </div>
  );
}

/**
 * 名前の文字。白い字に、色の移り変わる縁取りを付ける。HTML の文字では縁取りに
 * グラデーションを付けられないので SVG で描く(stroke に linearGradient、paint-order で縁を字の下へ)。
 */
function NameArt(props: { name: string; width: number }) {
  const { name, width } = props;
  const id = useId().replace(/:/g, '');
  const textRef = useRef<SVGTextElement>(null);
  // 短い名前ほど大きく(見本は名前が画面の幅いっぱい)。長い名前は下で詰めるか小さくする
  const maxSize = Math.min(width * 0.27, 160);
  const [fit, setFit] = useState<{ size: number; length: number | null }>({ size: maxSize, length: null });

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.setAttribute('font-size', String(maxSize));
    el.removeAttribute('textLength');
    const natural = el.getComputedTextLength();
    const avail = width - maxSize * 0.3;
    if (natural <= avail) {
      setFit({ size: maxSize, length: null });
      return;
    }
    // 少しなら横に詰め、詰めすぎになるなら字を小さくする
    const ratio = avail / natural;
    const size = ratio >= 0.72 ? maxSize : (maxSize * ratio) / 0.72;
    setFit({ size, length: width - size * 0.3 });
  }, [name, width, maxSize]);

  const { size, length } = fit;
  const stroke = size * 0.15;
  const height = size * 1.28;
  const x = size * 0.15;
  const y = size * 1.0;
  const textProps = {
    x,
    y,
    fontSize: size,
    ...(length ? { textLength: length, lengthAdjust: 'spacingAndGlyphs' as const } : {}),
  };

  return (
    <svg className="gacha-name" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" x2="1" y1="0" y2="0.3">
          <stop offset="0" stopColor="#ff6fc4" />
          <stop offset="0.35" stopColor="#a587ff" />
          <stop offset="0.7" stopColor="#4fc3ff" />
          <stop offset="1" stopColor="#5ce8c4" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <text {...textProps}>{name}</text>
        </clipPath>
      </defs>
      <text
        ref={textRef}
        {...textProps}
        fill="#fff"
        stroke={`url(#${id}-edge)`}
        strokeWidth={stroke}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {name}
      </text>
      <g clipPath={`url(#${id}-clip)`}>
        <rect
          className="gacha-name-shine"
          x={-width * 0.35}
          y={0}
          width={width * 0.35}
          height={height}
          fill={`url(#${id}-shine)`}
          style={{ '--shine-to': `${width * 1.4}px` } as CSSProperties}
        />
      </g>
    </svg>
  );
}

type Sparkle = { x: number; y: number; size: number; delay: number; duration: number };

function Sparkles(props: { items: Sparkle[]; className: string }) {
  return (
    <div className={props.className} aria-hidden="true">
      {props.items.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              '--delay': `${s.delay}ms`,
              '--duration': `${s.duration}ms`,
            } as CSSProperties
          }
        >
          <path d="M12 0C12.9 7.6 16.4 11.1 24 12C16.4 12.9 12.9 16.4 12 24C11.1 16.4 7.6 12.9 0 12C7.6 11.1 11.1 7.6 12 0Z" />
        </svg>
      ))}
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

/** 虹の帯。位置・太さ・出る順をずらして、流れていくように見せる。 */
const RIBBONS = [
  { '--y': '64%', '--h': '22vmin', '--d': '0ms', '--a': '-24deg' },
  { '--y': '36%', '--h': '30vmin', '--d': '70ms', '--a': '-28deg' },
  { '--y': '84%', '--h': '14vmin', '--d': '120ms', '--a': '-20deg' },
  { '--y': '18%', '--h': '18vmin', '--d': '170ms', '--a': '-26deg' },
  { '--y': '52%', '--h': '40vmin', '--d': '230ms', '--a': '-24deg' },
  { '--y': '6%', '--h': '24vmin', '--d': '280ms', '--a': '-30deg' },
  { '--y': '74%', '--h': '34vmin', '--d': '320ms', '--a': '-22deg' },
  { '--y': '28%', '--h': '44vmin', '--d': '360ms', '--a': '-25deg' },
] as unknown as CSSProperties[];

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 5.5v13l8.5-6.5zM11.5 5.5v13l8.5-6.5z" fill="currentColor" />
      <rect x="20" y="5.5" width="2.2" height="13" rx="1" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** 絵の候補を順に読み、読めた最初の1枚と大きさを返す。読めなければ null。 */
async function loadPhoto(characterId: string): Promise<Photo | null> {
  let image = await fetchCharaImage(characterId).catch(() => null);
  while (image) {
    try {
      const size = await preload(image.imageUrl);
      return { image, ...size };
    } catch {
      // 消えた投稿など。結果画面の CharacterImage と同じく、残りの候補へ移る
      image = nextCharaImage(characterId);
    }
  }
  return null;
}

function preload(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      img.decode().then(
        () => resolve(size),
        () => resolve(size),
      );
    };
    img.onerror = () => reject(new Error(`画像を読めませんでした: ${url}`));
    img.src = url;
  });
}

/**
 * 絵の縦横比が画面に近ければ画面いっぱいに(見本と同じ)、離れていれば絵を丸ごと見せて
 * 後ろをぼかした同じ絵で埋める。横長の絵を縦長の画面いっぱいにすると、キャラが切れるため。
 */
function chooseFit(imageRatio: number, screenRatio: number): 'cover' | 'contain' {
  const r = imageRatio / screenRatio;
  return r >= 0.62 && r <= 1.6 ? 'cover' : 'contain';
}

/** 文の終わり(。!?…)で行を分ける。見本も1文ずつ行を分けている。 */
function splitQuote(quote: string): string[] {
  const parts = quote.match(/[^。！？!?…]+[。！？!?…]*[」』)]?/g) ?? [quote];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 全角を1、半角を0.55として、文字列の幅を em で見積もる。 */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ -~｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return Math.max(w, 1);
}

function makeSparkles(count: number): Sparkle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 96 + 2,
    y: Math.random() * 92 + 2,
    size: 8 + Math.random() * 16,
    delay: Math.random() * 2400,
    duration: 1400 + Math.random() * 1600,
  }));
}

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(id: string) {
  try {
    const list = readSeen().filter((x) => x !== id);
    list.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX)));
  } catch {
    // 保存できない環境(プライベートモード等)では毎回 NEW になるだけ
  }
}
