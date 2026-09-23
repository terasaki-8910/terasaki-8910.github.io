import { CharacterImage } from './CharacterImage';
import type { AxisKey } from '../data/schema';
import { profileEntriesFor } from '../engine/questions';
import type { Reason, Scored } from '../engine/recommend';

/**
 * 候補一覧(CandidateList)の各行を開いたときに出す、キャラの簡易詳細。
 *
 * 中身の構成はCharacterReveal（推測・確定結果で使う大きい版）と同じ
 * 「画像→根拠→プロフィール」だが、候補一覧自体が `max-w-xs`(320px)の
 * 枠に収まる前提で作られているため、画像はCharacterImageの `size="compact"`
 * で小さくし、プロフィールも `PROFILE_LIMIT` で件数を絞る。
 * 画像を左・情報を右に横並びにするのは、縦積みにすると1行の展開だけで
 * 候補一覧全体の高さが跳ねてしまうため（CandidateListの排他アコーディオンと
 * 合わせて、常に高々1行分の追加高さに収める設計）。
 */
const PROFILE_LIMIT = 3;

export function CandidateDetail(props: { scored: Scored }) {
  const { character, reasons } = props.scored;
  const traitReasons = reasons.filter((r): r is Extract<Reason, { kind: 'trait' }> => r.kind === 'trait');
  const profile = profileEntriesFor(character, {
    exclude: new Set<AxisKey>(traitReasons.map((r) => r.axis)),
    limit: PROFILE_LIMIT,
  });

  return (
    <div data-testid="candidate-detail" className="mt-3 flex gap-3 rounded border border-line bg-paper p-3">
      <CharacterImage
        characterId={character.id}
        name={character.name}
        testId="candidate-detail-image"
        size="compact"
      />

      <div className="min-w-0 flex-1">
        {traitReasons.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {traitReasons.map((reason, i) => (
              <li key={i} className="border border-line rounded px-2 py-0.5 text-xs text-muted">
                <span className="text-ink">{reason.label}</span>: {reason.value}
              </li>
            ))}
          </ul>
        )}

        {profile.length > 0 && (
          <ul className={`flex flex-col gap-y-1 text-xs text-muted ${traitReasons.length > 0 ? 'mt-2' : ''}`}>
            {profile.map((entry) => (
              <li key={entry.axis} className="truncate">
                {entry.label}: {entry.values.join('・')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
