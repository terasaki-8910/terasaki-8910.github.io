import { useEffect, useRef } from 'react';

/**
 * マウスに追従する「指差しの手」カーソル。選択肢ボタンにホバー中は指す角度が
 * 変わり、クリック中はわずかに縮む。
 *
 * 素材化する3Dモデル(GLBファイル)を持たないため、既存のAsciiGallery
 * (src/utils/asciiCanvasRenderer.js。3Dモデルをフレームごとにピクセル→文字へ
 * 変換するリアルタイムパイプライン)は流用できなかった。代わりに、活字の余白へ
 * 「ここを読め」と差し込まれてきた活版印刷の指差し記号(manicule, ☞)を採用。
 * 手描きの多行ASCIIアートは小さいフォントサイズで判読困難になりやすく、
 * この記号ならモノスペースのまま1文字で明確に「手」と伝わる(本人確認済み:
 * 静的なASCIIアート表現・OSカーソルを隠して置き換える方式)。
 *
 * マウスを持つ環境(pointer: fine)でのみ有効。タッチ端末はOSカーソルも
 * この機能も無く、既存の通常タップがそのまま効く。
 *
 * パフォーマンス: マウス座標はReactのstateに載せず、refで掴んだDOM要素へ
 * 直接transformを書き込む(CommitLog.jsxのGSAP/React opacity競合と同じ理由——
 * 毎フレームのReact再描画は不要な負荷になる)。
 */
export function AsciiHandCursor({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const container = containerRef.current;
    const cursor = cursorRef.current;
    if (!container || !cursor) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.classList.add('chara-cursor-none');
    cursor.style.transition = reduceMotion ? 'opacity 120ms ease-out' : 'transform 90ms ease-out, opacity 120ms ease-out';

    let pointing = false;
    let pressed = false;
    const applyPose = () => {
      const rotate = pointing ? -6 : -32;
      const scale = pressed ? 0.85 : 1;
      cursor.style.transform = `translate(-4px, -8px) rotate(${rotate}deg) scale(${scale})`;
    };
    applyPose();

    const handleMove = (e: MouseEvent) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    };
    const handleOver = (e: MouseEvent) => {
      const next = (e.target as HTMLElement)?.closest('button') !== null;
      if (next !== pointing) {
        pointing = next;
        applyPose();
      }
    };
    const handleDown = () => {
      pressed = true;
      applyPose();
    };
    const handleUp = () => {
      pressed = false;
      applyPose();
    };
    // このコンポーネントが包むのは質問/選択肢の領域だけで、ヘッダーや見出しなど
    // ページ全体は範囲外(そちらは本物のOSカーソルのまま)。範囲外に出た瞬間に
    // 手を隠さないと、最後にいた場所に取り残された「幽霊カーソル」が残ってしまう。
    const handleEnter = () => {
      cursor.style.opacity = '1';
    };
    const handleLeave = () => {
      cursor.style.opacity = '0';
      pointing = false;
      pressed = false;
    };

    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseover', handleOver);
    container.addEventListener('mousedown', handleDown);
    container.addEventListener('mouseup', handleUp);
    container.addEventListener('mouseenter', handleEnter);
    container.addEventListener('mouseleave', handleLeave);
    return () => {
      container.classList.remove('chara-cursor-none');
      container.removeEventListener('mousemove', handleMove);
      container.removeEventListener('mouseover', handleOver);
      container.removeEventListener('mousedown', handleDown);
      container.removeEventListener('mouseup', handleUp);
      container.removeEventListener('mouseenter', handleEnter);
      container.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {children}
      <div
        ref={cursorRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-50 text-3xl text-accent"
        style={{ willChange: 'transform', opacity: 0, transition: 'opacity 120ms ease-out' }}
      >
        ☞
      </div>
    </div>
  );
}
