/*
 * 画面をまたいで使うボタンの見た目。サイト既存の語彙（1px罫線 + 4px角丸 +
 * hoverでaccentに寄せる）に揃えてある。移植元はダーク地＋アンバー塗りだったが、
 * こちらは「アクセントはaccent 1色」方針なので配色レイヤーごと置き換えている。
 *
 * focus-visibleの輪郭は src/index.css の `:focus-visible` がサイト全体に効くため、
 * ここでは指定しない（移植元は各ボタンに個別指定していた）。
 */

/** 主要アクション（はい、この子です / もう一度選ぶ 等）。唯一のaccentベタ塗り。 */
export const PRIMARY_BUTTON =
  'w-full rounded bg-accent px-5 py-3 text-on-accent hover:bg-accent/85 transition-colors';

/** 副次アクション（いいえ、違います 等）と5択の回答ボタン。 */
export const OUTLINE_BUTTON =
  'w-full rounded border border-line bg-paper px-5 py-3 text-ink hover:border-accent hover:bg-accent-dim transition-colors';

/** 画面下部の弱い導線（一つ前に戻る / おまかせ / 最初からやり直す）。 */
export const QUIET_LINK_BUTTON =
  'text-sm text-muted underline-offset-4 hover:text-ink hover:underline transition-colors';
