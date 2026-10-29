import { CharacterImage } from '../components/CharacterImage';
import { PRIMARY_BUTTON } from '../components/styles';
import type { Scored } from '../engine/recommend';

/**
 * 推しガチャの十連の結果(2026-10-29)。演出を閉じたあとに残る一覧で、10体を絵と名前で並べる。
 * 絵の出典は CharacterImage が添える。並びは演出のカードと同じ。
 */
export function TenResultScreen(props: { results: readonly Scored[]; onRestart(): void }) {
  const { results, onRestart } = props;

  return (
    // tabIndex: 十連の演出を閉じたとき、読み上げの位置をここへ移す(CharaPickerApp の TenResult)
    <div data-testid="ten-result" tabIndex={-1} className="flex min-w-0 flex-col items-center outline-none">
      <p className="font-mono text-xs tracking-wider text-muted">十連の結果</p>

      <ol className="mt-6 grid w-full grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3">
        {results.map((scored, i) => (
          <li key={scored.character.id} data-testid="ten-result-item" className="flex min-w-0 flex-col">
            <CharacterImage characterId={scored.character.id} name={scored.character.name} testId={`ten-result-image-${i}`} />
            <p className="mt-2 text-sm text-ink">{scored.character.name}</p>
            <p className="text-xs text-muted">{scored.character.series}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 w-full max-w-xs">
        <button type="button" data-testid="restart" onClick={onRestart} className={PRIMARY_BUTTON}>
          もう一度選ぶ
        </button>
      </div>
    </div>
  );
}
