import { useMemo } from 'react';

import { CharacterReveal } from '../components/CharacterReveal';
import { PRIMARY_BUTTON } from '../components/styles';
import { pickPhrase, RESULT_PHRASES } from '../data/phrases';
import type { Scored } from '../engine/recommend';

/** 確定済み推測（GuessScreenで「はい」した後）と、おまかせ結果の両方で使う終着画面。 */
export function ResultScreen(props: { result: Scored; onRestart(): void }) {
  const { result, onRestart } = props;
  // キャラが変わるまでは同じ文言のままにする（再描画のたびに入れ替わらないように）
  const phrase = useMemo(() => pickPhrase(RESULT_PHRASES), [result.character.id]);

  return (
    <div data-testid="result" className="flex min-w-0 flex-col items-center text-center">
      <p className="font-mono text-xs tracking-wider text-muted">今日のおすすめ</p>

      <CharacterReveal scored={result} imageTestId="result-image" />

      <p className="mt-6 text-muted">{phrase}</p>

      <div className="mt-8 w-full max-w-xs">
        <button type="button" data-testid="restart" onClick={onRestart} className={PRIMARY_BUTTON}>
          もう一度選ぶ
        </button>
      </div>
    </div>
  );
}
