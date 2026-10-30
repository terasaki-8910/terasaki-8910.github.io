import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { fetchCharaImage, nextCharaImage, type CharaImage } from '../data/danbooru';
import { AUTO_PHRASE, NO_LINE_START, splitPhrases } from './phrases';
import { GACHA_FONT_FAMILY } from './prefetch';

/*
 * ガチャの演出の部品。全画面の演出(GachaReveal.tsx・十連の GachaTen.tsx)と、トップページの
 * 小さい演出(GachaMini.tsx)で使う。見た目は gacha.css / mini.css 側にある(台詞の字は両方で使う quote.css)。
 */

export type Photo = { image: CharaImage; width: number; height: number };

/**
 * 虹の段の見せ方。毎回5通りからランダム(本人 2026-10-29「重くないなら全部良いのでA~Eのランダム」)。
 *   a 背景の色がそのまま上へ流れて虹色に変わる / b 中心から虹の光が放射 / c 虹の輪が広がる
 *   d 下から虹色の光の粒が昇る / e 斜めの虹の帯を背景の色になじませたもの
 * 開発中は ?rainbow=a〜e で固定できる。
 */
const RAINBOWS = ['a', 'b', 'c', 'd', 'e'] as const;
export type RainbowVariant = (typeof RAINBOWS)[number];

export function pickRainbow(): RainbowVariant {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get('rainbow');
    const forced = RAINBOWS.find((r) => r === v);
    if (forced) return forced;
  }
  return RAINBOWS[Math.floor(Math.random() * RAINBOWS.length)];
}

/**
 * 台詞の字。白い字に虹の縁とにじみを付けるため、同じ文を2枚重ねる(見た目は quote.css)。
 * 読み上げるのは上の1枚だけ。文節に区切ったときは、2枚とも同じ切れ目で折り返す(phrases.ts)。
 * 1行より長いかたまりがある台詞は、1行に入る字数を測って、それより長い文節を分ける(phrases.ts)。
 */
export function RainbowText(props: { text: string; className?: string; style?: CSSProperties }) {
  const { text, className, style } = props;
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ text: string; maxChars: number } | null>(null);
  const maxChars = fit?.text === text ? fit.maxChars : undefined;
  // auto-phrase のブラウザでは、1行より長いかたまりが無ければ折り返しを CSS に任せる
  const phrases = !AUTO_PHRASE || maxChars !== undefined ? splitPhrases(text, maxChars) : null;
  const phrased = phrases !== null;

  useLayoutEffect(() => {
    // 区切る部品が届いていなければ、分け直せない
    if (maxChars !== undefined && !phrased) return;
    let cancelled = false;
    const measure = () => {
      const el = ref.current;
      // 台詞の箱(GachaReveal の gacha-quote・GachaMini の gmini-quote)
      const box = el?.closest('p');
      if (cancelled || !el || !box) return;
      // いちばん長いかたまりの幅を、字の途中では折らずに測る
      el.style.width = 'min-content';
      el.style.overflowWrap = 'normal';
      const longest = el.getBoundingClientRect().width;
      el.style.width = '';
      el.style.overflowWrap = '';
      const boxStyle = getComputedStyle(box);
      const lineWidth = box.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight);
      if (longest <= lineWidth + 0.5) return;
      if (maxChars === undefined) {
        // 1行に入る字数は、全角の字の幅(字の大きさ+字間)で数える
        const { fontSize, letterSpacing } = getComputedStyle(el);
        const advance = parseFloat(fontSize) + (parseFloat(letterSpacing) || 0);
        setFit({ text, maxChars: Math.max(2, Math.floor(lineWidth / advance)) });
      } else if (maxChars > 2) {
        // 分けても入りきらない(行の頭に来てはいけない字を前に付けて長くなったなど)ときは、字数を減らす
        setFit({ text, maxChars: maxChars - 1 });
      }
    };
    measure();
    // 書体が届くと字の幅が変わるので測り直す
    document.fonts.load(`800 16px "${GACHA_FONT_FAMILY}"`, text).then(measure, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [text, maxChars, phrased]);

  const content = () =>
    phrases
      ? phrases.map((phrase, i) => (
          <Fragment key={i}>
            {i > 0 && <wbr />}
            {phrase}
          </Fragment>
        ))
      : text;
  return (
    <span ref={ref} className={className ? `qt ${className}` : 'qt'} style={style} data-phrased={phrases ? '' : undefined}>
      <span className="qt-glow" aria-hidden="true">
        {content()}
      </span>
      <span className="qt-text">{content()}</span>
    </span>
  );
}

/** 虹の層。動きは gacha.css(ルートの data-rainbow と s-rainbow)。 */
export function RainbowLayer(props: { variant: RainbowVariant }) {
  const { variant } = props;
  const motes = useMemo(() => (variant === 'd' ? makeMotes(40) : []), [variant]);
  return (
    <div className="gacha-rainbow" aria-hidden="true">
      {variant === 'a' && <span className="gacha-flow" />}
      {variant === 'b' && (
        <>
          <span className="gacha-spokes" />
          <span className="gacha-core" />
        </>
      )}
      {variant === 'c' && [0, 1, 2, 3].map((i) => <span key={i} className="gacha-ring" style={{ '--i': i } as CSSProperties} />)}
      {variant === 'd' && motes.map((style, i) => <span key={i} className="gacha-mote" style={style} />)}
      {variant === 'e' && RIBBONS.map((style, i) => <span key={i} className="gacha-ribbon" style={style} />)}
    </div>
  );
}

/** e: 虹の帯。位置・太さ・角度・出る順をずらして、流れていくように見せる。 */
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

/** d: 下から昇る虹色の光の粒。色相を一巡させ、位置・長さ・速さをばらす。 */
function makeMotes(count: number): CSSProperties[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        '--x': `${Math.random() * 100}%`,
        '--hue': `${Math.round((i / count) * 360)}`,
        '--len': `${14 + Math.random() * 26}vh`,
        '--w': `${3 + Math.random() * 5}px`,
        '--d': `${Math.round(Math.random() * 420)}ms`,
        '--dur': `${420 + Math.round(Math.random() * 260)}ms`,
      }) as CSSProperties,
  );
}

/** 「NEW」を出すために、このブラウザで出たことのあるキャラを覚えておく。 */
const SEEN_KEY = 'chara-gacha-seen';
const SEEN_MAX = 3000;

export function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSeen(ids: readonly string[]) {
  try {
    const list = readSeen().filter((x) => !ids.includes(x));
    list.push(...ids);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX)));
  } catch {
    // 保存できない環境(プライベートモード等)では毎回 NEW になるだけ
  }
}

export function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * 名前の文字。白い字に、色の移り変わる縁取りを付ける。HTML の文字では縁取りに
 * グラデーションを付けられないので SVG で描く(stroke に linearGradient、paint-order で縁を字の下へ)。
 * 幅に収まらない名前は横に詰め、詰めすぎになるなら字を小さくする。
 * 詰めるのは text の transform(横の縮小)で、字と縁と縁の色をまとめて縮める。textLength で詰めると、
 * Safari は縁の色の移り変わりをさらに縮めて描き、名前の後ろの字が最後の色一色になる
 * (本人が iPhone で、ニコ・ロビンの「ビン」以降に虹が無いと気づいた。2026-10-29)。
 * 字の幅はガチャの書体が読めてから測り直す(先に測ると、代わりの書体の幅で大きさが決まる)。
 */
export function NameArt(props: { name: string; width: number; maxSize: number; className?: string }) {
  const { name, width, maxSize, className } = props;
  const id = useId().replace(/:/g, '');
  const textRef = useRef<SVGTextElement>(null);
  const [fit, setFit] = useState({ size: maxSize, scaleX: 1 });

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const el = textRef.current;
      if (cancelled || !el) return;
      // maxSize の大きさで測り、React が付けた大きさに戻す
      const shown = el.getAttribute('font-size');
      el.setAttribute('font-size', String(maxSize));
      const natural = el.getComputedTextLength();
      if (shown !== null) el.setAttribute('font-size', shown);
      const avail = width - maxSize * 0.3;
      if (natural <= avail) {
        setFit({ size: maxSize, scaleX: 1 });
        return;
      }
      const ratio = avail / natural;
      const size = ratio >= 0.72 ? maxSize : (maxSize * ratio) / 0.72;
      setFit({ size, scaleX: (width - size * 0.3) / ((natural * size) / maxSize) });
    };
    measure();
    document.fonts.load(`800 ${maxSize}px "${GACHA_FONT_FAMILY}"`, name).then(measure, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [name, width, maxSize]);

  const { size, scaleX } = fit;
  const stroke = size * 0.15;
  const height = size * 1.28;
  const textProps = {
    fontSize: size,
    transform: `translate(${size * 0.15} ${size}) scale(${scaleX} 1)`,
  };

  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
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

/**
 * 星3。1つずつ重く押されるように付く(見本: ウマ娘の★3)。全キャラ★3(本人「全キャラファンにとっては星3」)。
 * 動きは CSS(.gacha-star の g-star-stamp と、着地の輪 .gacha-star-ring)。
 */
export function StarRow(props: { className: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={props.className} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="gacha-star" style={{ '--i': i } as CSSProperties}>
          <span className="gacha-star-ring" />
          <svg viewBox="-8 -8 116 116">
            <defs>
              <linearGradient id={`${id}-gold`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fffbd1" />
                <stop offset="0.45" stopColor="#ffd94a" />
                <stop offset="1" stopColor="#ffa726" />
              </linearGradient>
            </defs>
            <path d={STAR_PATH} fill="none" stroke="#f08a1c" strokeWidth="16" strokeLinejoin="round" />
            <path d={STAR_PATH} fill="none" stroke="#fff" strokeWidth="9" strokeLinejoin="round" />
            <path d={STAR_PATH} fill={`url(#${id}-gold)`} />
            <path d="M50 16 L57 36 L74 37" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ))}
    </div>
  );
}

/** 5つの角の星。角が太い縁取りで丸く見えるよう、stroke-linejoin round で描く。 */
const STAR_PATH =
  'M50 4 L61.17 34.63 L93.75 35.79 L68.07 55.87 L77.04 87.21 L50 69 L22.96 87.21 L31.93 55.87 L6.25 35.79 L38.83 34.63 Z';

export type Sparkle = { x: number; y: number; size: number; delay: number; duration: number };

export function Sparkles(props: { items: Sparkle[]; className: string }) {
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

export function makeSparkles(count: number, maxSize = 24): Sparkle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 96 + 2,
    y: Math.random() * 92 + 2,
    size: maxSize / 3 + Math.random() * (maxSize * 2) / 3,
    delay: Math.random() * 2400,
    duration: 1400 + Math.random() * 1600,
  }));
}

/** 絵の候補を順に読み、読めた最初の1枚と大きさを返す。読めなければ null。 */
export async function loadPhoto(characterId: string): Promise<Photo | null> {
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
 * 文の終わり(。!?…)で行を分ける。見本も1文ずつ行を分けている。
 * 行の頭に来てはいけない字(「カエレ……/ッ！」の「ッ！」)は前の文に付け、字の無いかけら(「（……」「...？」)は
 * 隣の文に付ける。
 */
export function splitQuote(quote: string): string[] {
  const parts = quote.match(/[^。！？!?…]+[。！？!?…]*[」』)）”’]*/g) ?? [quote];
  const lines: string[] = [];
  let prefix = '';
  for (const part of parts) {
    let line = part.trim();
    const head = lines.length > 0 ? (NO_LINE_START.exec(line)?.[0] ?? '') : '';
    if (head) {
      lines[lines.length - 1] += head;
      line = line.slice(head.length).trim();
    }
    if (!line) continue;
    if (!/[\p{L}\p{N}]/u.test(line)) {
      // 開き括弧で始まるか、まだ文が無ければ次の文の頭に、ほかは前の文の終わりに付ける
      if (lines.length > 0 && !/^[(（「『【〈《〔[［{｛“‘]/u.test(line)) lines[lines.length - 1] += line;
      else prefix += line;
      continue;
    }
    lines.push(prefix + line);
    prefix = '';
  }
  if (prefix) {
    if (lines.length > 0) lines[lines.length - 1] += prefix;
    else lines.push(prefix);
  }
  return lines;
}

/** 要素の幅を追いかける(名前の大きさを決めるため)。 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
