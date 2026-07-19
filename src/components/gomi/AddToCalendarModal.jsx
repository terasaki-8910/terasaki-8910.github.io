import { useEffect } from 'react'
import { parseISO } from '../../utils/gomiDate'
import { buildGoogleCalendarUrl, buildSingleEventIcs } from '../../utils/gomiIcs'

// 「この日のこのカテゴリだけ」をカレンダーに追加するための単発ダイアログ。
// エリア全体の購読(IcsSubscribe)とは別軸: こちらは「びんの日だったから
// メモしとこ」のような単発メモ用途。
export default function AddToCalendarModal({ iso, category, areaSlug, areaLabel, fiscalYear, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const { m, d } = parseISO(iso)
  const googleUrl = buildGoogleCalendarUrl({ areaLabel, iso, category })
  const icsText = buildSingleEventIcs({ areaSlug, areaLabel, iso, category, fiscalYear })
  const icsDataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`
  const fileName = `gomi-${areaSlug}-${iso}-${category.id}.ics`

  const btn =
    'block w-full text-center text-sm border border-line rounded px-3 py-2.5 text-ink hover:border-celeste hover:text-celeste transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${m}月${d}日 ${category.label}をカレンダーに追加`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs border border-line rounded bg-paper p-4"
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-display text-ink">
            {m}/{d} {category.label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-muted hover:text-ink transition-colors leading-none text-lg -mt-1"
          >
            ×
          </button>
        </div>
        <div className="space-y-2">
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={onClose} className={btn}>
            Googleカレンダーに追加
          </a>
          <a href={icsDataUrl} download={fileName} onClick={onClose} className={btn}>
            .icsをダウンロード
          </a>
        </div>
      </div>
    </div>
  )
}
