import { useCallback, useEffect, useRef, useState } from 'react';

import { AsciiHandCursor } from './components/AsciiHandCursor';
import { loadCharaData } from './data/loadCharaData';
import { useBayesInterview } from './hooks/useBayesInterview';
import { useNoticeSeen } from './hooks/useNoticeSeen';
import { useSessionLog, type SessionLogRecord } from './hooks/useSessionLog';
import { omakase, type Dataset, type Scored } from './engine/recommend';
import type { Probe } from './engine/questions';
import { GuessScreen } from './screens/GuessScreen';
import { NoGuessScreen } from './screens/NoGuessScreen';
import { NoticeScreen } from './screens/NoticeScreen';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultScreen } from './screens/ResultScreen';

/**
 * 「同じ対象への二重発火」だけを弾くガード。
 *
 * 一度は回答後に「考え中」の間を挟んでいたが、単に待たされるだけで邪魔だと
 * いう判断で撤去した。次の質問は即座に出す。「考えている感」は待ち時間ではなく
 * 入場アニメーション（rise-in）が担う——こちらは表示中もクリックを受け付けるので
 * 体感の待ち時間が増えない。
 *
 * 防ぎたいのは「1つの質問に2回答えてしまう」ことだけなので、経過時間ではなく
 * 対象のキー（質問なら probe.key、推測なら character.id）で判定する。
 * 時間で弾く方式だと、素早く連続で回答したときに正当なクリックまで無言で
 * 無視されてしまう（実測で確認したため、この方式に変えた）。
 */
function useTargetGuard() {
  const lastKey = useRef<string | null>(null);

  /** 同じ key での再実行を無視する。key が変われば即座に通る。 */
  const run = useCallback((key: string, action: () => void) => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    action();
  }, []);

  /** 「一つ前に戻る」「最初からやり直す」で同じ質問が再登場しうるので解除する。 */
  const reset = useCallback(() => {
    lastKey.current = null;
  }, []);

  return { run, reset };
}

/**
 * ベイズ推薦エンジンのフロー。移植元の `BayesFlow` をそのまま持ってきたもので、
 * 画面の分岐ロジックは無改造（データを引数で受け取る点だけが違う）。
 * 移植元にあった classic エンジンと `?engine=` による切り替えは持ってきていない。
 */
function BayesFlow({ dataset }: { dataset: Dataset }) {
  const interview = useBayesInterview(dataset);
  const { log } = useSessionLog();
  const { seen: noticeSeen, markSeen: markNoticeSeen } = useNoticeSeen();
  const [omakaseResult, setOmakaseResult] = useState<Scored | null>(null);
  const { run: guard, reset: resetGuard } = useTargetGuard();

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
    resetGuard();
    interview.reset();
    setOmakaseResult(null);
  }, [resetGuard, interview]);

  // 初回のみ、質問より前に注意書きを挟む。最初の質問がどの軸になるかはベイズ選択で
  // 毎回変わりうる（bayesNextProbe が情報量最大の軸を選ぶため、決め打ちの1問目が無い）
  // ので、特定の質問の手前ではなく「質問そのものの前」に固定で置く。
  if (!noticeSeen) {
    return <NoticeScreen onAcknowledge={markNoticeSeen} />;
  }

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
          onAnswer={(confidence) => guard(interview.probe.key, () => interview.answer(confidence))}
          onUndo={() => {
            resetGuard();
            interview.undo();
          }}
          onOmakase={handleOmakase}
          onRestart={handleRestart}
        />
      );
    case 'guessing':
      return (
        <GuessScreen
          guess={interview.guess}
          candidates={interview.candidates}
          canUndo={interview.canUndo}
          onConfirm={interview.confirm}
          onReject={() => guard(interview.guess.character.id, () => interview.reject())}
          onUndo={() => {
            resetGuard();
            interview.undo();
          }}
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

  return (
    <AsciiHandCursor>
      <BayesFlow dataset={dataset} />
    </AsciiHandCursor>
  );
}
