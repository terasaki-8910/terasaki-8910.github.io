import { useCallback, useEffect, useState } from 'react';

import { loadCharaData } from './data/loadCharaData';
import { useBayesInterview } from './hooks/useBayesInterview';
import { useSessionLog, type SessionLogRecord } from './hooks/useSessionLog';
import { omakase, type Dataset, type Scored } from './engine/recommend';
import type { Probe } from './engine/questions';
import { GuessScreen } from './screens/GuessScreen';
import { NoGuessScreen } from './screens/NoGuessScreen';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultScreen } from './screens/ResultScreen';

/**
 * ベイズ推薦エンジンのフロー。移植元の `BayesFlow` をそのまま持ってきたもので、
 * 画面の分岐ロジックは無改造（データを引数で受け取る点だけが違う）。
 * 移植元にあった classic エンジンと `?engine=` による切り替えは持ってきていない。
 */
function BayesFlow({ dataset }: { dataset: Dataset }) {
  const interview = useBayesInterview(dataset);
  const { log } = useSessionLog();
  const [omakaseResult, setOmakaseResult] = useState<Scored | null>(null);

  const handleOmakase = useCallback(() => {
    const result = omakase(dataset, { seed: Date.now() });
    const record: SessionLogRecord = {
      ts: Date.now(),
      guessId: result.character.id,
      outcome: 'omakase',
      askedCount: 0,
      answers: [],
      rejectedIds: [],
      engine: 'bayes',
    };
    log(record);
    setOmakaseResult(result);
  }, [dataset, log]);

  const handleRestart = useCallback(() => {
    interview.reset();
    setOmakaseResult(null);
  }, [interview]);

  // おまかせは質問・推測ループを経ない独立経路。結果表示中は interview 側の状態
  // （質問の途中経過など）を無視して直接 result 画面へ出す。
  if (omakaseResult !== null) {
    return <ResultScreen result={omakaseResult} onRestart={handleRestart} />;
  }

  switch (interview.phase) {
    case 'asking':
      return (
        <QuestionScreen
          // BayesProbe は {key, prompt, reason} で classic の Probe（key/axis/value/multi/prompt）
          // と形が異なるが、QuestionScreen が描画で読むのは probe.prompt だけ。
          probe={interview.probe as unknown as Probe}
          askedCount={interview.askedCount}
          canUndo={interview.canUndo}
          onAnswer={interview.answer}
          onUndo={interview.undo}
          onOmakase={handleOmakase}
          onRestart={handleRestart}
        />
      );
    case 'guessing':
      return (
        <GuessScreen
          guess={interview.guess}
          canUndo={interview.canUndo}
          onConfirm={interview.confirm}
          onReject={interview.reject}
          onUndo={interview.undo}
          onRestart={handleRestart}
        />
      );
    case 'confirmed':
      return <ResultScreen result={interview.guess} onRestart={handleRestart} />;
    case 'exhausted':
      return <NoGuessScreen nearMisses={interview.nearMisses} onRestart={handleRestart} />;
    default: {
      // 型レベルの網羅性チェック。phase が増えたのに分岐追加を忘れるとここで型エラーになる。
      const exhaustive: never = interview;
      throw new Error(`未知の phase: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * データのfetch（public/chara-picker/）を担う外枠。移植元はJSONを静的importして
 * いたためこの層自体が無かった。ローディング/エラーの見せ方は
 * src/components/gomi/GomiCalendar.jsx に揃えてある。
 */
export default function CharaPickerApp() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCharaData()
      .then(({ dataset }) => {
        if (!cancelled) setDataset(dataset);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return (
      <div className="mx-auto max-w-md rounded border border-line p-6 text-center">
        <p className="text-sm text-muted">
          データを読み込めませんでした。時間をおいて再度お試しください。
        </p>
      </div>
    );
  }

  if (dataset === null) {
    return (
      <div className="animate-pulse space-y-2" aria-label="読み込み中">
        <div className="h-8 w-32 rounded border border-line" />
        <div className="h-12 rounded border border-line" />
        <div className="h-12 rounded border border-line" />
        <div className="h-12 rounded border border-line" />
        <div className="h-12 rounded border border-line" />
        <div className="h-12 rounded border border-line" />
      </div>
    );
  }

  return <BayesFlow dataset={dataset} />;
}
