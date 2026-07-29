import { PRIMARY_BUTTON } from '../components/styles';
import type { Scored } from '../engine/recommend';

/**
 * 全滅画面。「いいえ」を繰り返し、非拒否キャラが尽きた状態。
 * 「見つかりませんでした」で正直に伝えつつ、参考として近かった候補
 * （score上位。拒否済みも含む）を簡易リストで示す — 確定案内ではない。
 */
export function NoGuessScreen(props: { nearMisses: readonly Scored[]; onRestart(): void }) {
  const { nearMisses, onRestart } = props;

  return (
    <div data-testid="no-guess" className="min-w-0">
      <h2 className="text-2xl md:text-3xl font-display text-ink">見つかりませんでした</h2>
      <p className="mt-3 text-muted">
        回答に合うキャラを絞り込めませんでした。参考までに近かった候補です。
      </p>

      {nearMisses.length > 0 && (
        <ul className="mt-8 border border-line rounded px-5">
          {nearMisses.map((scored, i) => (
            <li
              key={scored.character.id}
              data-testid="no-guess-candidate"
              className="flex items-baseline justify-between gap-4 border-t border-line py-4 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-ink">{scored.character.name}</p>
                <p className="text-sm text-muted">{scored.character.series}</p>
              </div>
              <p className="shrink-0 font-mono text-xs text-muted">{i + 1}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 max-w-xs">
        <button type="button" data-testid="restart" onClick={onRestart} className={PRIMARY_BUTTON}>
          最初からやり直す
        </button>
      </div>
    </div>
  );
}
