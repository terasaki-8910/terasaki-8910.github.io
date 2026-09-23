import { FaChevronDown } from 'react-icons/fa6';

import { CandidateDetail } from './CandidateDetail';
import { SCORE_SCALE } from '../engine/bayes';
import type { Scored } from '../engine/recommend';

/** 一覧に出す行数。推測本人を含めた「上位N件」。 */
const ROW_COUNT = 5;

/**
 * 「この子かな?」の下に畳んでおく候補一覧。
 *
 * ■ 推測本人も1行として含める
 * 「他の候補」と名乗りながら表示中のキャラも並ぶのは筋が通らないので、
 * 名前どおり単純な順位表にした（＝候補一覧）。推測を特別扱いする印は付けない。
 * 上に大きくそのキャラが出ているので、同じ名前を一覧の中に見つければ足りる。
 *
 * ■ 並び順は素直に score 降順
 * `guess` はクールダウン（直近に出したキャラを避ける）を通した1体なので、
 * candidates[0] より score が低いことが実際にある。順位表として嘘をつかないよう、
 * 推測を先頭に固定するようなことはしない。
 *
 * ■ %について注記を置いていない
 * score は `SCORE_SCALE(=200) × 事後確率`。485体からの絞り込みなので絶対値は
 * 小さい（実測で1位が中央値13.4%）。「合計が100%にならない」等の説明は本人の
 * 判断で外してある。並べた数字とバーの長さで相対関係は読めるため。
 *
 * ■ バーの配色
 * accent(ピンク)は塗りに使えない。ライトテーマの地(#F9EC8E)に対して1.64:1しか
 * 出ず、バーがほぼ見えないため（単一のaccentで両テーマ3:1を満たせない事情は
 * src/index.css に既述）。muted塗り × lineトラックなら ライト3.48:1 /
 * ダーク4.17:1 で、非テキストの3:1を両テーマで満たす。
 *
 * ■ 行ごとの展開(本人指定)
 * 各行を `<details name="candidate-detail">` にする。同じ `name` を持つ
 * `<details>` 同士はブラウザが排他アコーディオンとして扱う(1つ開くと他は
 * 自動で閉じる)ため、JS側で「今どれが開いているか」を持つ必要がない。
 * 展開中身(CandidateDetail)は候補一覧自体の `max-w-xs` に収まるよう画像を
 * 小さくしてあり、かつ排他なので複数行を同時に開いて縦に際限なく伸びることもない。
 */
export function CandidateList(props: { guess: Scored; candidates: readonly Scored[] }) {
  const { guess, candidates } = props;
  if (candidates.length === 0) return null;

  const rows = [guess, ...candidates].sort((a, b) => b.score - a.score).slice(0, ROW_COUNT);
  const top = rows[0].score || 1;

  return (
    <details data-testid="candidates" className="group mt-6 w-full max-w-xs text-left">
      {/* list-none だけだとSafariの ::-webkit-details-marker が残るので両方消す。 */}
      <summary className="cursor-pointer list-none text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">候補一覧を見る（{rows.length}件）</span>
        <span className="hidden group-open:inline">候補一覧を閉じる</span>
      </summary>

      <ol className="mt-4 space-y-3">
        {rows.map((s) => (
          <li key={s.character.id} data-testid="candidate">
            <details name="candidate-detail" className="group/row">
              <summary
                data-testid="candidate-summary"
                className="-mx-1 -my-0.5 grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2 rounded px-1 py-0.5 transition-colors hover:bg-accent-dim [&::-webkit-details-marker]:hidden"
              >
                <p className="truncate text-sm text-ink">{s.character.name}</p>
                <p className="font-mono text-xs tabular-nums text-muted">{((s.score / SCORE_SCALE) * 100).toFixed(1)}%</p>
                <FaChevronDown
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 self-center text-muted transition-transform group-open/row:rotate-180"
                />
                <p className="col-start-1 col-span-3 truncate text-xs text-muted">{s.character.series}</p>
                {/* バーは幅そのものが情報なので aria-hidden。読み上げは隣の%が担う。 */}
                <div className="col-span-3 mt-1.5 h-1 rounded-full bg-line" aria-hidden="true">
                  <div className="h-full rounded-full bg-muted" style={{ width: `${(s.score / top) * 100}%` }} />
                </div>
              </summary>

              <CandidateDetail scored={s} />
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}
