import { loadQuotes } from '../data/quotes';

/** セリフ背景の素材(ニコニ・コモンズ nc296436。インターネット上での利用可、クレジット表記の義務なし)。 */
export const GACHA_BG_URL = '/chara-picker/gacha/serif-bg.webp';

/** ガチャ演出の文字の書体(M PLUS Rounded 1c ExtraBold のサブセット。gacha.css の @font-face)。 */
export const GACHA_FONT_FAMILY = 'Gacha Rounded';

/** 動きを減らす設定の人には演出を出さず、結果画面へ直行する。 */
export function gachaEnabled(): boolean {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

let started = false;

/**
 * 「おまかせで見る」に指が触れた時点で、演出に要るもの(コード・背景・台詞・書体)を先に取りに行く。
 * 押してから全部を取りに行くと、最初の画面が出るまで待たせるため。
 * 押さない人には何も読ませない(ページを開いただけでは呼ばない)。
 */
export function prefetchGacha() {
  if (started || !gachaEnabled()) return;
  started = true;
  const bg = new Image();
  bg.src = GACHA_BG_URL;
  loadQuotes().catch(() => undefined);
  // 書体の @font-face は演出のコードと一緒に入るので、読み込んでから書体を取りに行く
  import('./GachaReveal')
    .then(() => document.fonts.load(`800 32px "${GACHA_FONT_FAMILY}"`, 'あ'))
    .catch(() => undefined);
}
