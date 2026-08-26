import { useCallback, useState } from 'react';

/** e2e から参照する場合はこのキーと一致させること（useSessionLog の作法に倣う）。 */
export const NOTICE_SEEN_KEY = 'chara-picker:notice-seen';

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_SEEN_KEY) === '1';
  } catch {
    // プライベートブラウジング等で読めない場合は「未読」扱いにする
    // （注意書きが出したい側なので、失敗時は出す方に倒す）。
    return false;
  }
}

/**
 * 「はじめる前に」注意書きを既読かどうかのフラグ。端末・ブラウザ単位で一度読めば
 * 以後は出さない（`useSessionLog` と同じ localStorage 直書き。件数管理が要らない
 * 単一フラグなので、そちらより単純な形にしてある）。
 */
export function useNoticeSeen(): { seen: boolean; markSeen(): void } {
  const [seen, setSeen] = useState(readSeen);

  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(NOTICE_SEEN_KEY, '1');
    } catch {
      // 保存できなくても今回の表示では閉じたままにする（次回また出るだけで、機能は止めない）。
    }
  }, []);

  return { seen, markSeen };
}
