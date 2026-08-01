import { CONFIDENCE_LABEL, type Confidence, type Probe } from '../engine/questions';
import { OUTLINE_BUTTON, QUIET_LINK_BUTTON } from '../components/styles';

/** Akinator実機の並び（はい→たぶんそう→わからない→たぶん違う→いいえ）をそのまま踏襲する。 */
const CONFIDENCE_ORDER: readonly Confidence[] = ['yes', 'probably_yes', 'unknown', 'probably_no', 'no'];

const TESTID_BY_CONFIDENCE: Record<Confidence, string> = {
  yes: 'answer-yes',
  probably_yes: 'answer-probably-yes',
  unknown: 'answer-unknown',
  probably_no: 'answer-probably-no',
  no: 'answer-no',
};

/**
 * 1プローブ1画面・回答は常に5段階。「都度1問答えたら即座に次へ進む」一発アクション
 * 方式のため、選択永続状態や `aria-checked` は持たない（5つとも常に等価な操作ボタン）。
 */
export function QuestionScreen(props: {
  probe: Probe;
  askedCount: number;
  canUndo: boolean;
  onAnswer(confidence: Confidence): void;
  onUndo(): void;
  onOmakase(): void;
  onRestart(): void;
}) {
  const { probe, askedCount, canUndo, onAnswer, onUndo, onOmakase, onRestart } = props;

  return (
    // key に probe.key を与えて質問ごとにアニメーションを再生させる
    // （同じ要素が使い回されると入場アニメーションが走らないため）。
    <div
      key={probe.key}
      data-testid="question"
      className="min-w-0 motion-safe:animate-rise-in"
    >
      <p className="font-mono text-xs tracking-wider text-muted">{askedCount + 1}問目</p>

      <h2 className="mt-3 text-2xl md:text-3xl font-display text-ink">{probe.prompt}</h2>

      <div role="group" aria-label="回答" className="mt-8 flex flex-col gap-2">
        {CONFIDENCE_ORDER.map((confidence) => (
          <button
            key={confidence}
            type="button"
            data-testid={TESTID_BY_CONFIDENCE[confidence]}
            onClick={() => onAnswer(confidence)}
            className={`${OUTLINE_BUTTON} text-left`}
          >
            {CONFIDENCE_LABEL[confidence]}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
        {canUndo && (
          <button type="button" data-testid="undo" onClick={onUndo} className={QUIET_LINK_BUTTON}>
            一つ前の回答に戻る
          </button>
        )}
        <button type="button" data-testid="omakase" onClick={onOmakase} className={QUIET_LINK_BUTTON}>
          おまかせで見る
        </button>
        <button type="button" data-testid="restart" onClick={onRestart} className={QUIET_LINK_BUTTON}>
          最初からやり直す
        </button>
      </div>
    </div>
  );
}
