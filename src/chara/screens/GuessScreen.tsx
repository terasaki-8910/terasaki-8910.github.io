import { CharacterReveal } from '../components/CharacterReveal';
import { OUTLINE_BUTTON, PRIMARY_BUTTON, QUIET_LINK_BUTTON } from '../components/styles';
import type { Scored } from '../engine/recommend';

/** 単一推測 + はい/いいえ確認（「思い浮かべているのは○○、はい/いいえ」の形）。 */
export function GuessScreen(props: {
  guess: Scored;
  canUndo: boolean;
  onConfirm(): void;
  onReject(): void;
  onUndo(): void;
  onRestart(): void;
}) {
  const { guess, canUndo, onConfirm, onReject, onUndo, onRestart } = props;

  return (
    <div data-testid="guess" className="flex min-w-0 flex-col items-center text-center">
      <p className="font-mono text-xs tracking-wider text-muted">この子かな?</p>

      <CharacterReveal scored={guess} imageTestId="guess-image" />

      <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
        <button type="button" data-testid="guess-confirm" onClick={onConfirm} className={PRIMARY_BUTTON}>
          はい、この子です
        </button>
        <button type="button" data-testid="guess-reject" onClick={onReject} className={OUTLINE_BUTTON}>
          いいえ、違います
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {canUndo && (
          <button type="button" data-testid="undo" onClick={onUndo} className={QUIET_LINK_BUTTON}>
            一つ前の回答に戻る
          </button>
        )}
        <button type="button" data-testid="restart" onClick={onRestart} className={QUIET_LINK_BUTTON}>
          最初からやり直す
        </button>
      </div>
    </div>
  );
}
