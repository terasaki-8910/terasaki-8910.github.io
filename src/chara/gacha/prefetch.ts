import { loadQuotes } from '../data/quotes';

/**
 * セリフ背景の素材(ニコニ・コモンズ nc296436。インターネット上での利用可、クレジット表記の義務なし)。
 * 2回目の見本では、くっきり(原寸)・ふんわり(原寸をぼかしたもの)・1回目の仮(小さいサムネイルを
 * 引き伸ばしたもの)を比べてもらう。開発中は ?bg=crisp / soft / thumb で切り替える。
 */
const BG_FILES = {
  crisp: 'serif-bg.webp',
  soft: 'serif-bg-soft.webp',
  thumb: 'serif-bg-thumb.webp',
} as const;

export function gachaBgUrl(): string {
  let key: keyof typeof BG_FILES = 'crisp';
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get('bg');
    if (v === 'crisp' || v === 'soft' || v === 'thumb') key = v;
  }
  return `/chara-picker/gacha/${BG_FILES[key]}`;
}

/** ガチャ演出の文字の書体(M PLUS Rounded 1c ExtraBold のサブセット。gacha.css / mini.css の @font-face)。 */
export const GACHA_FONT_FAMILY = 'Gacha Rounded';

/** 動きを減らす設定の人には演出を出さず、結果をそのまま出す。 */
export function gachaEnabled(): boolean {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

let started = false;
let miniStarted = false;

/**
 * 「おまかせで見る」に指が触れた時点で、演出に要るもの(コード・背景・台詞・書体)を先に取りに行く。
 * 押してから全部を取りに行くと、最初の画面が出るまで待たせるため。
 * 押さない人には何も読ませない(ページを開いただけでは呼ばない)。
 */
export function prefetchGacha() {
  if (started || !gachaEnabled()) return;
  started = true;
  prefetchCommon();
  // 書体の @font-face は演出のコードと一緒に入るので、読み込んでから書体を取りに行く
  import('./GachaReveal')
    .then(() => document.fonts.load(`800 32px "${GACHA_FONT_FAMILY}"`, 'あ'))
    .catch(() => undefined);
}

/** トップページの小さい演出(GachaMini)の分。 */
export function prefetchGachaMini() {
  if (miniStarted || !gachaEnabled()) return;
  miniStarted = true;
  prefetchCommon();
  import('./GachaMini')
    .then(() => document.fonts.load(`800 16px "${GACHA_FONT_FAMILY}"`, 'あ'))
    .catch(() => undefined);
}

function prefetchCommon() {
  const bg = new Image();
  bg.src = gachaBgUrl();
  loadQuotes().catch(() => undefined);
}
