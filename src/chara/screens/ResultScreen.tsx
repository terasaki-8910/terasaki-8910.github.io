import { CharacterReveal } from '../components/CharacterReveal';
import { PRIMARY_BUTTON } from '../components/styles';
import type { Scored } from '../engine/recommend';

/** 確定済み推測（GuessScreenで「はい」した後）と、おまかせ結果の両方で使う終着画面。 */
export function ResultScreen(props: { result: Scored; onRestart(): void }) {
  const { result, onRestart } = props;

  return (
    <div data-testid="result" className="flex min-w-0 flex-col items-center text-center">
      <p className="font-mono text-xs tracking-wider text-muted">今日のおすすめ</p>

      <CharacterReveal scored={result} imageTestId="result-image" />

      <p className="mt-6 text-muted">本当の推しはこの子で合ってる?</p>

      <div className="mt-8 w-full max-w-xs">
        <button type="button" data-testid="restart" onClick={onRestart} className={PRIMARY_BUTTON}>
          もう一度選ぶ
        </button>
      </div>
    </div>
  );
}
