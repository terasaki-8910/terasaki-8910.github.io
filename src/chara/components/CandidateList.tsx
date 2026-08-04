import { SCORE_SCALE } from '../engine/bayes';
import type { Scored } from '../engine/recommend';

/**
 * 「この子かな?」の下に畳んでおく候補一覧（推測本人 + 次点3件）。
 *
 * ■ なぜ推測本人の行も出すのか
 * エンジンの score は `SCORE_SCALE(=200) × 事後確率` で、実測すると1位が中央値
 * 13.4% / 2位 7.6% / 3位 5.5%（485体・回答ランダム40セッション）。485体からの
 * 絞り込みなので絶対値は小さく、次点だけを並べて「8%」とだけ出すと基準が無く、
 * 高いのか低いのか読めない。1位を同じ物差しで並べて初めて「1位に対してどれくらい
 * 迫っているか」が読める（2位/1位の比は中央値0.716 = かなり競っている）。
 * ユーザー指定の「3件」は次点の件数を指すので、次点は3件のまま。
 *
 * ■ 並び順を score 降順にしている理由
 * `guess` はクールダウン（直近に出したキャラを避ける）を通した1体なので、
 * candidates[0] より score が低いことがありうる。その場合に推測を無条件で先頭へ
 * 置くと順位表として嘘になるため、素直に score 順に並べて「いまの推測」だけ印を付ける。
 *
 * ■ バーの配色
 * accent(ピンク)は塗りに使えない。ライトテーマの地(#F9EC8E)に対して1.64:1しか
 * 出ず、バーがほぼ見えないため（単一のaccentで両テーマ3:1を満たせない事情は
 * src/index.css に既述）。muted塗り × lineトラックなら ライト3.48:1 /
 * ダーク4.17:1 で、非テキストの3:1を両テーマで満たす。
 */
export function CandidateList(props: { guess: Scored; candidates: readonly Scored[] }) {
  const { guess, candidates } = props;
  const others = candidates.slice(0, 3);
  if (others.length === 0) return null;

  const rows = [...others, guess].sort((a, b) => b.score - a.score);
  const top = rows[0].score || 1;
  const pct = (s: Scored) => (s.score / SCORE_SCALE) * 100;
  // 推測が1位でない = クールダウンが効いた状態。これを説明しないと「2位を出す
  // バグ」に見えるので、そのときだけ理由を添える（cooldown.ts のとおり、
  // 僅差圏内でだけ効き、独走している1位を隠すことはない）。
  const cooledDown = rows[0].character.id !== guess.character.id;

  return (
    <details data-testid="candidates" className="group mt-6 w-full max-w-xs text-left">
      {/* list-none だけだとSafariの ::-webkit-details-marker が残るので両方消す。 */}
      <summary className="cursor-pointer list-none text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">他の候補も見る（{others.length}件）</span>
        <span className="hidden group-open:inline">他の候補を閉じる</span>
      </summary>

      <ol className="mt-4 space-y-3">
        {rows.map((s) => {
          const isGuess = s.character.id === guess.character.id;
          return (
            <li
              key={s.character.id}
              data-testid={isGuess ? 'candidate-current' : 'candidate'}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3"
            >
              <p className={`truncate text-sm ${isGuess ? 'text-ink' : 'text-muted'}`}>{s.character.name}</p>
              <p className="font-mono text-xs tabular-nums text-muted">{pct(s).toFixed(1)}%</p>
              {/* 作品名は truncate するので、「いまの推測」を同じ段落に入れてはいけない
                  ——作品名が長いとラベルごと切り落とされる。別セルに置いて必ず残す。 */}
              <p className="col-start-1 truncate text-xs text-muted">{s.character.series}</p>
              <p className="text-xs text-ink">{isGuess ? 'いまの推測' : ''}</p>
              {/* バーは幅そのものが情報なので aria-hidden。読み上げは隣の%が担う。 */}
              <div className="col-span-2 mt-1.5 h-1 rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-muted" style={{ width: `${(s.score / top) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        候補全体に対する推定確率。上位のみ表示しているので合計は100%になりません。
        {cooledDown && '　僅差なので、直近に出した子を避けて選んでいます。'}
      </p>
    </details>
  );
}
