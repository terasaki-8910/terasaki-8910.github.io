/*
 * 画面に出る文言のバリエーション。**ここを書き換えるだけで増減できる。**
 * 配列に1行足せばそれだけで候補に入る（他のファイルは触らなくていい）。
 *
 * ■ 文字の制約（重要）
 *   本文フォントは Zen Kurenaido のサブセットなので、収録されていない文字を
 *   使うとその字だけ別フォントに化ける。カナ・漢字・ひらがな・半角記号なら安全。
 *   顔文字によくある特殊文字は使えないものが多い:
 *     ✅ 使える    … ー ！ ？ 「」 ・ 〜 、。 など一般的な約物
 *     ❌ 使えない  ᓀ ᓂ 눈 囧 𝓥𝓪𝓷 ꒰ ꒱ ֊ ‸ ⸝ 👊 など
 *                (Zen Kurenaido の原本7,815字にそもそも入っていないので、
 *                 サブセットを作り直しても直らない)
 *
 *   新しい漢字を足したときは `npm run build-font-subset` を実行すること
 *   (このファイルは走査対象に入っているので、実行すれば自動で収録される)。
 */

/** 結果画面で結果の下に出る一言。 */
export const RESULT_PHRASES: readonly string[] = [
  '本当の推しはこの子で合ってる?',
  'こういうのでいいんだよ。',
  'こういうのが好きなんだ…',
  'わかる…',
  '流石におお',
  'わーいわーい！',
];

/** ページ見出しの下に出る説明文。 */
export const TAGLINE_PHRASES: readonly string[] = [
  'いくつかの質問に答えると、条件に合うキャラを推測します',
  '魔人はなんでもお見通しだ。',
  'こういうのが好きなんでしょ?',
];

/** 配列から1つ選ぶ。空配列でも落ちないようにしておく。 */
export function pickPhrase(phrases: readonly string[], fallback = ''): string {
  if (phrases.length === 0) return fallback;
  return phrases[Math.floor(Math.random() * phrases.length)];
}
