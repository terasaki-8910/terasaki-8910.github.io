import { useCallback, useEffect, useRef, useState } from 'react';

import { loadCharaData } from './data/loadCharaData';
import { useBayesInterview } from './hooks/useBayesInterview';
import { useSessionLog, type SessionLogRecord } from './hooks/useSessionLog';
import { omakase, type Dataset, type Scored } from './engine/recommend';
import type { Probe } from './engine/questions';
import { Thinking } from './components/Thinking';
import { GuessScreen } from './screens/GuessScreen';
import { NoGuessScreen } from './screens/NoGuessScreen';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultScreen } from './screens/ResultScreen';

/**
 * 回答してから次の質問が出るまでの間（ミリ秒）。
 * 短すぎると考えている感が出ず、長いと単に待たされる。実機で触って詰めた値。
 */
const THINK_MS = 550;

/**
 * 「いいえ」で候補を外したあとは、次を出すまでを少し長めにする。
 * 即座に別のキャラが出ると「適当に返しているのでは」という印象になるため
 * （利用者からの指摘。engine側でも再質問の下限が入っている）。
 */
const THINK_MS_AFTER_REJECT = 900;

/** 回答/拒否のたびに一定時間「考え中」を挟むためのフック。 */
function useThinkingGate() {
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // アンマウント後にsetStateしないよう後片付けする
  useEffect(() => clear, [clear]);

  /** 指定時間だけ「考え中」にしてから action を実行する。実行中の連打は無視。 */
  const run = useCallback(
    (action: () => void, ms: number) => {
      if (timer.current !== null) return;
      setThinking(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        setThinking(false);
        action();
      }, ms);
    },
    [],
  );

  /** やり直し等で即座に抜けたいとき。 */
  const cancel = useCallback(() => {
    clear();
    setThinking(false);
  }, [clear]);

  return { thinking, run, cancel };
}

/**
 * ベイズ推薦エンジンのフロー。移植元の `BayesFlow` をそのまま持ってきたもので、
 * 画面の分岐ロジックは無改造（データを引数で受け取る点だけが違う）。
 * 移植元にあった classic エンジンと `?engine=` による切り替えは持ってきていない。
 */
function BayesFlow({ dataset }: { dataset: Dataset }) {
  const interview = useBayesInterview(dataset);
  const { log } = useSessionLog();
  const [omakaseResult, setOmakaseResult] = useState<Scored | null>(null);
  const { thinking, run: runThinking, cancel: cancelThinking } = useThinkingGate();

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
    cancelThinking();
    interview.reset();
    setOmakaseResult(null);
  }, [cancelThinking, interview]);

  // おまかせは質問・推測ループを経ない独立経路。結果表示中は interview 側の状態
  // （質問の途中経過など）を無視して直接 result 画面へ出す。
  if (omakaseResult !== null) {
    return <ResultScreen result={omakaseResult} onRestart={handleRestart} />;
  }

  // 回答・拒否の直後は、次の質問/推測を出す前に「考え中」を挟む。
  if (thinking) return <Thinking />;

  switch (interview.phase) {
    case 'asking':
      return (
        <QuestionScreen
          // BayesProbe は {key, prompt, reason} で classic の Probe（key/axis/value/multi/prompt）
          // と形が異なるが、QuestionScreen が描画で読むのは probe.prompt だけ。
          probe={interview.probe as unknown as Probe}
          askedCount={interview.askedCount}
          canUndo={interview.canUndo}
          onAnswer={(confidence) => runThinking(() => interview.answer(confidence), THINK_MS)}
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
          onReject={() => runThinking(() => interview.reject(), THINK_MS_AFTER_REJECT)}
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
