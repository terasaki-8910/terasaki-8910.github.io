import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { loadCharaData } from './data/loadCharaData';
import { useBayesInterview } from './hooks/useBayesInterview';
import { useNoticeSeen } from './hooks/useNoticeSeen';
import { useSessionLog, type SessionLogRecord } from './hooks/useSessionLog';
import { combinedRankFor, omakase, type Dataset, type Scored } from './engine/recommend';
import { QUESTION_POLICIES, type QuestionPolicy } from './engine/bayes';
import type { Probe } from './engine/questions';
import { gachaEnabled } from './gacha/prefetch';
import { GuessScreen } from './screens/GuessScreen';
import { ModeScreen, type PlayMode } from './screens/ModeScreen';
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

/** ガチャの演出(初めて引いたときに読み込む)。 */
const GachaReveal = lazy(() => import('./gacha/GachaReveal'));

/**
 * おまかせ(質問なしで1体)。遊び方を選ぶ画面と質問の画面の両方から使う。
 * 引いたときはガチャの演出を重ねる(`gacha`)。閉じると結果画面になる。
 */
function useOmakase(dataset: Dataset) {
  const { log } = useSessionLog();
  const [result, setResult] = useState<Scored | null>(null);
  const [gacha, setGacha] = useState(false);

  const run = useCallback(() => {
    const picked = devPick(dataset) ?? omakase(dataset, { seed: Date.now() });
    const record: SessionLogRecord = {
      ts: Date.now(),
      guessId: picked.character.id,
      outcome: 'omakase',
      askedCount: 0,
      answers: [],
      rejectedIds: [],
      engine: 'bayes',
    };
    log(record);
    setResult(picked);
    setGacha(gachaEnabled());
  }, [dataset, log]);

  const clear = useCallback(() => {
    setResult(null);
    setGacha(false);
  }, []);
  const closeGacha = useCallback(() => setGacha(false), []);
  return { result, gacha, run, clear, closeGacha };
}

/**
 * 開発用: `?gacha=<キャラのid>` で、おまかせの結果をそのキャラにする(演出の確かめ用)。
 * 本番のビルドでは何もしない。
 */
function devPick(dataset: Dataset): Scored | null {
  if (!import.meta.env.DEV) return null;
  const id = new URLSearchParams(window.location.search).get('gacha');
  const character = id ? dataset.characters.find((c) => c.id === id) : undefined;
  if (!character) return null;
  const rank = combinedRankFor(character.id, dataset.supply);
  return { character, score: 0, supplyRank: rank, reasons: [{ kind: 'supply', rank, label: rank }] };
}

/** 演出のコードを読み込む間に、後ろのページが一瞬見えないよう、演出と同じ地の色で覆う。 */
const GACHA_LOADING_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'linear-gradient(180deg, #d2fda9, #9ad8f2 42%, #dd9ffa 80%, #f29bd7)',
} as const;

/**
 * おまかせの結果。演出を見ている間は結果画面を出さない(演出の前に名前が見えてしまうため)。
 * 演出を閉じたら、結果画面へ読み上げの位置を移す。
 */
function OmakaseResult(props: { result: Scored; gacha: boolean; onCloseGacha(): void; onRestart(): void }) {
  const { result, gacha, onCloseGacha, onRestart } = props;
  const closedRef = useRef(false);

  useEffect(() => {
    if (gacha) {
      closedRef.current = true;
      return;
    }
    if (!closedRef.current) return;
    closedRef.current = false;
    document.querySelector<HTMLElement>('[data-testid="result"]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [gacha]);

  if (gacha) {
    return (
      <Suspense fallback={<div style={GACHA_LOADING_STYLE} aria-hidden="true" />}>
        <GachaReveal scored={result} onClose={onCloseGacha} />
      </Suspense>
    );
  }
  return <ResultScreen result={result} onRestart={onRestart} />;
}

/**
 * ベイズ推薦エンジンのフロー。移植元の `BayesFlow` をそのまま持ってきたもので、
 * 画面の分岐ロジックは無改造（データを引数で受け取る点だけが違う）。
 * 移植元にあった classic エンジンと `?engine=` による切り替えは持ってきていない。
 * `policy` は選んだ遊び方の質問の出し方（engine/bayes.ts の QUESTION_POLICIES）。
 * やり直すと遊び方を選ぶ画面へ戻る（`onRestart`）。
 */
function BayesFlow({ dataset, policy, onRestart }: { dataset: Dataset; policy: QuestionPolicy; onRestart(): void }) {
  const interview = useBayesInterview(dataset, { policy });
  const {
    result: omakaseResult,
    gacha,
    run: handleOmakase,
    clear: clearOmakase,
    closeGacha,
  } = useOmakase(dataset);
  const { run: guard, reset: resetGuard } = useTargetGuard();

  const handleRestart = useCallback(() => {
    resetGuard();
    clearOmakase();
    onRestart();
  }, [resetGuard, clearOmakase, onRestart]);

  // おまかせは質問・推測ループを経ない独立経路。結果表示中は interview 側の状態
  // （質問の途中経過など）を無視して直接 result 画面へ出す。
  if (omakaseResult !== null) {
    return <OmakaseResult result={omakaseResult} gacha={gacha} onCloseGacha={closeGacha} onRestart={handleRestart} />;
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
 * 遊び方を選んでから質問に入る外枠（開発元 R12「モードを分ける」案。2026-10-26、本人の依頼で別に見せる版）。
 * 遊び方を選ぶたびに BayesFlow を key で作り直し、選んだ方針で1問目から始める。
 */
function ModeFlow({ dataset }: { dataset: Dataset }) {
  const { seen: noticeSeen, markSeen: markNoticeSeen } = useNoticeSeen();
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [round, setRound] = useState(0);
  const {
    result: omakaseResult,
    gacha,
    run: handleOmakase,
    clear: clearOmakase,
    closeGacha,
  } = useOmakase(dataset);
  const backToModes = useCallback(() => setMode(null), []);

  // 初回のみ、質問より前に注意書きを挟む。最初の質問がどの軸になるかはベイズ選択で
  // 毎回変わりうる（bayesNextProbe が情報量最大の軸を選ぶため、決め打ちの1問目が無い）
  // ので、特定の質問の手前ではなく「質問そのものの前」に固定で置く。
  if (!noticeSeen) {
    return <NoticeScreen onAcknowledge={markNoticeSeen} />;
  }
  if (omakaseResult !== null) {
    return <OmakaseResult result={omakaseResult} gacha={gacha} onCloseGacha={closeGacha} onRestart={clearOmakase} />;
  }
  if (mode === null) {
    return (
      <ModeScreen
        onSelect={(selected) => {
          setMode(selected);
          setRound((r) => r + 1);
        }}
        onOmakase={handleOmakase}
      />
    );
  }
  return <BayesFlow key={round} dataset={dataset} policy={QUESTION_POLICIES[mode]} onRestart={backToModes} />;
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

  return <ModeFlow dataset={dataset} />;
}
