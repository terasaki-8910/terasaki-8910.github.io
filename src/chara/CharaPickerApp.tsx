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
import { TenResultScreen } from './screens/TenResultScreen';

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

/** ガチャの演出(初めて引いたときに読み込む)。単発と十連。 */
const GachaReveal = lazy(() => import('./gacha/GachaReveal'));
const GachaTen = lazy(() => import('./gacha/GachaTen'));

/** 十連で引く数。 */
const TEN = 10;

/**
 * おまかせ・推しガチャ(質問なしで引く)。遊び方を選ぶ画面と質問の画面から使う。
 * 単発(`run`)は1体、十連(`runTen`)は同じ抽選で重ならない10体。
 * 引いたときはガチャの演出を重ねる(`gacha`)。閉じると結果画面になる。
 */
function useOmakase(dataset: Dataset) {
  const { log } = useSessionLog();
  const [result, setResult] = useState<Scored | null>(null);
  const [tenResults, setTenResults] = useState<Scored[] | null>(null);
  const [gacha, setGacha] = useState(false);

  const logPick = useCallback(
    (picked: Scored) => {
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
    },
    [log],
  );

  const run = useCallback(() => {
    const picked = devPicks(dataset)[0] ?? omakase(dataset, { seed: Date.now() });
    logPick(picked);
    setResult(picked);
    setGacha(gachaEnabled());
  }, [dataset, logPick]);

  const runTen = useCallback(() => {
    const picked = drawTen(dataset);
    picked.forEach(logPick);
    setTenResults(picked);
    setGacha(gachaEnabled());
  }, [dataset, logPick]);

  const clear = useCallback(() => {
    setResult(null);
    setTenResults(null);
    setGacha(false);
  }, []);
  const closeGacha = useCallback(() => setGacha(false), []);
  return { result, tenResults, gacha, run, runTen, clear, closeGacha };
}

/**
 * 十連の10体。おまかせと同じ抽選(engine の omakase。供給量で重み付け)を、同じキャラが
 * 重ならないように繰り返す。抽選の中身は開発元と共有のエンジンのまま変えない。
 */
function drawTen(dataset: Dataset): Scored[] {
  const picked = devPicks(dataset).slice(0, TEN);
  const ids = new Set(picked.map((s) => s.character.id));
  const seed = Date.now();
  for (let i = 0; picked.length < TEN && i < TEN * 20; i++) {
    const next = omakase(dataset, { seed: seed + i });
    if (ids.has(next.character.id)) continue;
    ids.add(next.character.id);
    picked.push(next);
  }
  return picked;
}

/**
 * 開発用: `?gacha=<キャラのid>` で、おまかせ・単発の結果をそのキャラにする(演出の確かめ用)。
 * カンマで区切って並べると、十連の先頭からその順に入る。本番のビルドでは何もしない。
 */
function devPicks(dataset: Dataset): Scored[] {
  if (!import.meta.env.DEV) return [];
  const ids = (new URLSearchParams(window.location.search).get('gacha') ?? '').split(',').filter(Boolean);
  return ids.flatMap((id) => {
    const character = dataset.characters.find((c) => c.id === id);
    if (!character) return [];
    const rank = combinedRankFor(character.id, dataset.supply);
    return [{ character, score: 0, supplyRank: rank, reasons: [{ kind: 'supply' as const, rank, label: rank }] }];
  });
}

/** 演出を閉じたら、下の結果画面(`testId`)へ読み上げの位置を移す。 */
function useFocusAfterGacha(gacha: boolean, testId: string) {
  const closedRef = useRef(false);
  useEffect(() => {
    if (gacha) {
      closedRef.current = true;
      return;
    }
    if (!closedRef.current) return;
    closedRef.current = false;
    document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [gacha, testId]);
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
  useFocusAfterGacha(gacha, 'result');

  if (gacha) {
    return (
      <Suspense fallback={<div style={GACHA_LOADING_STYLE} aria-hidden="true" />}>
        <GachaReveal scored={result} onClose={onCloseGacha} />
      </Suspense>
    );
  }
  return <ResultScreen result={result} onRestart={onRestart} />;
}

/** 十連の結果。考え方は OmakaseResult と同じ(演出の間は結果画面を出さない)。 */
function TenResult(props: { results: Scored[]; gacha: boolean; onCloseGacha(): void; onRestart(): void }) {
  const { results, gacha, onCloseGacha, onRestart } = props;
  useFocusAfterGacha(gacha, 'ten-result');

  if (gacha) {
    return (
      <Suspense fallback={<div style={GACHA_LOADING_STYLE} aria-hidden="true" />}>
        <GachaTen results={results} onClose={onCloseGacha} />
      </Suspense>
    );
  }
  return <TenResultScreen results={results} onRestart={onRestart} />;
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
    tenResults,
    gacha,
    run: handleOmakase,
    runTen: handleGachaTen,
    clear: clearOmakase,
    closeGacha,
  } = useOmakase(dataset);
  const backToModes = useCallback(() => setMode(null), []);

  // 画面が変わったら先頭から見せる。長い結果画面(十連など)の下で「最初からやり直す」を押すと、
  // 次の画面がスクロールしたままの位置で出て、質問が上の見出しに隠れるため
  const screen = !noticeSeen
    ? 'notice'
    : omakaseResult !== null
      ? 'omakase'
      : tenResults !== null
        ? 'ten'
        : mode === null
          ? 'mode'
          : `round-${round}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  // 初回のみ、質問より前に注意書きを挟む。最初の質問がどの軸になるかはベイズ選択で
  // 毎回変わりうる（bayesNextProbe が情報量最大の軸を選ぶため、決め打ちの1問目が無い）
  // ので、特定の質問の手前ではなく「質問そのものの前」に固定で置く。
  if (!noticeSeen) {
    return <NoticeScreen onAcknowledge={markNoticeSeen} />;
  }
  if (omakaseResult !== null) {
    return <OmakaseResult result={omakaseResult} gacha={gacha} onCloseGacha={closeGacha} onRestart={clearOmakase} />;
  }
  if (tenResults !== null) {
    return <TenResult results={tenResults} gacha={gacha} onCloseGacha={closeGacha} onRestart={clearOmakase} />;
  }
  if (mode === null) {
    return (
      <ModeScreen
        onSelect={(selected) => {
          setMode(selected);
          setRound((r) => r + 1);
        }}
        onOmakase={handleOmakase}
        onGachaTen={handleGachaTen}
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
