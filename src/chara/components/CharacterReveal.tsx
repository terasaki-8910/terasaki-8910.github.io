import { CharacterImage } from './CharacterImage';
import type { Reason, Scored } from '../engine/recommend';

/**
 * 「このキャラを見せる」画面（推測確認・確定結果・おまかせ結果）に共通する中身。
 * GuessScreen と ResultScreen は枠（見出し・下部ボタン）だけが異なり、画像から
 * 根拠までの構成は同一のためここに一本化する。
 *
 * `reasons` はエンジン側では `kind:'supply'` も含むが、ここでは `kind:'trait'` のみ
 * 表示する（供給量はハードフィルタ/タイブレークとして内部では使い続ける。
 * あくまで見せる/見せないの話）。
 */
export function CharacterReveal(props: { scored: Scored; imageTestId: string }) {
  const { character, reasons } = props.scored;
  const traitReasons = reasons.filter((r): r is Extract<Reason, { kind: 'trait' }> => r.kind === 'trait');

  return (
    <>
      <CharacterImage
        characterId={character.id}
        name={character.name}
        testId={props.imageTestId}
        className="mt-6"
      />

      <h2 className="mt-6 text-2xl md:text-3xl font-display text-ink">{character.name}</h2>
      <p className="mt-1 text-muted">{character.series}</p>

      {traitReasons.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {traitReasons.map((reason, i) => (
            <li key={i} className="border border-line rounded px-2.5 py-1 text-xs text-muted">
              <span className="text-ink">{reason.label}</span>: {reason.value}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
