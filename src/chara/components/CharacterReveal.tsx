import { CharacterImage } from './CharacterImage';
import type { AxisKey } from '../data/schema';
import { profileEntriesFor } from '../engine/questions';
import type { Reason, Scored } from '../engine/recommend';

/**
 * 「このキャラを見せる」画面（推測確認・確定結果・おまかせ結果）に共通する中身。
 * GuessScreen と ResultScreen は枠（見出し・下部ボタン）だけが異なり、画像から
 * 根拠までの構成は同一のためここに一本化する。
 *
 * `reasons` はエンジン側では `kind:'supply'` も含むが、ここでは `kind:'trait'` のみ
 * 表示する（供給量はハードフィルタ/タイブレークとして内部では使い続ける。
 * あくまで見せる/見せないの話）。
 *
 * ■ 2段構成
 *   1. 根拠（罫線チップ・ラベルはink）— なぜこのキャラが出たか。回答由来
 *   2. プロフィール（罫線なしのmutedテキスト）— 回答に関係なく、このキャラが
 *      持っているデータ
 * 罫線の有無で主従を付ける。両方チップにすると視覚的な重みが並んでしまい、
 * 「回答から導かれたもの」と「元から持っている属性」の区別が消える。
 * 1で見せた軸は `exclude` で2から外して重複させない。
 *
 * 優先順位と非表示軸（胸のサイズ）は `profileEntriesFor` 側が持っている——
 * questions.ts は同期対象なので、こちらで並び順を書き写すと開発元とズレる。
 */
export function CharacterReveal(props: { scored: Scored; imageTestId: string }) {
  const { character, reasons } = props.scored;
  const traitReasons = reasons.filter((r): r is Extract<Reason, { kind: 'trait' }> => r.kind === 'trait');
  const profile = profileEntriesFor(character, { exclude: new Set<AxisKey>(traitReasons.map((r) => r.axis)) });

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
        <ul data-testid="reveal-reasons" className="mt-5 flex flex-wrap justify-center gap-2">
          {traitReasons.map((reason, i) => (
            <li key={i} className="border border-line rounded px-2.5 py-1 text-xs text-muted">
              <span className="text-ink">{reason.label}</span>: {reason.value}
            </li>
          ))}
        </ul>
      )}

      {profile.length > 0 && (
        <ul
          data-testid="reveal-profile"
          className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted"
        >
          {profile.map((entry) => (
            <li key={entry.axis}>
              {entry.label}: {entry.values.join('・')}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
