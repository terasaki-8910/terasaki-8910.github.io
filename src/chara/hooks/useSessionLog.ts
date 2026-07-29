import { useCallback, useState } from 'react';

import type { Confidence } from '../engine/recommend';

/** localStorageキー。サイト内の他ページ（theme / gomi-town 等）と衝突しない名前空間にしてある。 */
export const SESSION_LOG_KEY = 'chara-picker:session-log';

/** 保持する直近レコード数の上限。無限に肥大化させない。 */
const LOG_CAP = 100;

/** クールダウン判定に使う「直近」とみなす件数（重複排除後）。 */
const RECENT_COUNT = 5;

export type SessionLogRecord = {
  ts: number;
  /** 'exhausted'（全滅）は提示できるキャラが無いので null。 */
  guessId: string | null;
  outcome: 'confirmed' | 'rejected' | 'exhausted' | 'omakase';
  askedCount: number;
  answers: readonly { key: string; confidence: Confidence }[];
  rejectedIds: readonly string[];
  /** どちらのエンジンが生成したセッションか。省略時は 'classic'（旧レコードとの後方互換）。 */
  engine?: 'classic' | 'bayes';
};

function readLog(): SessionLogRecord[] {
  try {
    const raw = window.localStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionLogRecord[]) : [];
  } catch {
    // プライベートブラウジング等で localStorage が使えない、または保存内容が
    // 壊れている場合でもアプリ全体がクラッシュしないようにする（空履歴扱い）。
    return [];
  }
}

function writeLog(records: SessionLogRecord[]): void {
  try {
    window.localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(records));
  } catch {
    // 保存できなくても today のセッションでは続行する（クールダウンが
    // 効かなくなるだけで、機能停止にはしない）。
  }
}

function recentGuessIdsOf(records: readonly SessionLogRecord[]): string[] {
  const ids: string[] = [];
  for (let i = records.length - 1; i >= 0 && ids.length < RECENT_COUNT; i -= 1) {
    const id = records[i].guessId;
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/*
 * 移植元にあった `sendToDevLogFile()`（dev中だけ /__session-log へPOSTし、
 * vite.config.ts の sessionLogDevPlugin が state/session-logs/log.jsonl に
 * 追記する仕組み）は移植していない。このサイトには受け側のプラグインが無く、
 * 呼んでも404になるだけのため。分析用のログ収集は移植元リポジトリ側で行う。
 * localStorage 側の記録＝クールダウン（同じキャラの連続提示を避ける）は
 * この hook 単体で完結しているのでそのまま動く。
 */

export function useSessionLog(): { recentGuessIds: string[]; log(record: SessionLogRecord): void } {
  const [records, setRecords] = useState(readLog);

  // 書き込み直前に localStorage を読み直してからマージする。この hook は
  // useInterview 経由と App.tsx（おまかせ経路）の2箇所から独立に呼ばれるため、
  // 各インスタンスが自分の React state だけを頼りに書き込むと、片方の追記が
  // もう片方の追記を消してしまう（lost update）。ディスクの最新値を常に
  // 起点にすることでこれを避ける。
  const log = useCallback((record: SessionLogRecord) => {
    const next = [...readLog(), record].slice(-LOG_CAP);
    writeLog(next);
    setRecords(next);
  }, []);

  return { recentGuessIds: recentGuessIdsOf(records), log };
}
