/**
 * キャラ画像の表示枠。`imagePath` はユーザー本人が合法的に所持・作成した画像への
 * 相対パス（`public/character-images/` に手動配置）。第三者画像は同梱しない方針。
 *
 * 画像が未設定でも枠自体は常に表示する。設定済みだが未承認（`imageApproved !== true`）
 * の場合は固定位置（右上）に「承認前」バッジを重ねる — 可変高さの行で操作系を
 * 相対中央に置くと崩れるため、バッジは常に同じ角に固定する（ui.md の可変高さ行ルール）。
 */
export function CharacterImage(props: {
  imagePath: string | null;
  imageApproved: boolean;
  name: string;
  testId: string;
  badgeTestId?: string;
  className?: string;
}) {
  const { imagePath, imageApproved, name, testId, className } = props;
  const badgeTestId = props.badgeTestId ?? `${testId}-unapproved-badge`;
  const showUnapprovedBadge = imagePath !== null && !imageApproved;

  return (
    <div
      data-testid={testId}
      className={`relative aspect-[3/4] w-full max-w-56 shrink-0 overflow-hidden rounded border border-line ${className ?? ''}`}
    >
      {imagePath !== null ? (
        <img src={imagePath} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
          <span className="text-xs text-muted">画像未設定</span>
        </div>
      )}

      {showUnapprovedBadge && (
        <span
          data-testid={badgeTestId}
          className="absolute top-2 right-2 rounded border border-line bg-paper px-2 py-1 text-xs text-muted"
        >
          承認前
        </span>
      )}
    </div>
  );
}
