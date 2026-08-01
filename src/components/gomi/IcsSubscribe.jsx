import { useState } from 'react'

// iCal購読UI。icsはGitHub Pagesの静的ファイルとして配信されるため、
// devサーバーで見ていてもURLは本番の絶対URLを使う(Googleカレンダー側から
// 取得できる公開URLである必要があるため)。
const ICS_BASE = 'https://terasaki-8910.github.io/gomi-tsukuba/ics/'

export default function IcsSubscribe({ areaSlug, areaLabel }) {
  const [copied, setCopied] = useState(false)
  const icsUrl = `${ICS_BASE}${areaSlug}.ics`
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(icsUrl)}`

  function handleCopy() {
    navigator.clipboard.writeText(icsUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const btn =
    'block w-full text-center text-sm border border-line rounded px-3 py-2.5 text-ink hover:border-accent hover:text-accent transition-colors'

  return (
    <div className="border border-line rounded p-4">
      <h2 className="text-lg font-display text-ink mb-2">カレンダー購読</h2>
      <p className="text-xs text-muted leading-relaxed mb-3">
        {areaLabel}の収集日程をiCal形式で購読できます。購読しておけば年度更新にも自動で追従します(Google側への反映は最長1日程度かかります)。
      </p>
      <div className="space-y-2">
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          Googleカレンダーに追加
        </a>
        <a href={icsUrl} download className={btn}>
          .icsをダウンロード
        </a>
        <button type="button" onClick={handleCopy} className={btn}>
          {copied ? 'コピーしました' : '購読URLをコピー'}
        </button>
      </div>
    </div>
  )
}
