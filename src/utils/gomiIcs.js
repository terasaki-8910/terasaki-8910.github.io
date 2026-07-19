// 単発イベント(1日1カテゴリ)のiCal/Googleカレンダーリンク生成。
// エリア全体の購読ics(scripts/update-gomi-calendar.js生成、public/gomi-tsukuba/ics/*.ics)
// とUID形式を揃えてあり、同じ日・同じカテゴリは常に同じUIDになる。
// サーバーが無いためこちらはブラウザ側でdata: URIとして動的に生成する。

const SITE_URL = 'https://terasaki-8910.github.io/gomi-tsukuba/'

function pad(n) {
  return String(n).padStart(2, '0')
}

function nextDayYmd(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

// RFC5545のTEXT値エスケープ(カンマ・セミコロン・バックスラッシュ・改行)
function escapeText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// 75オクテット折り返し(UTF-8バイト長基準、文字境界で分割)
function foldLine(line) {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const out = []
  let cur = ''
  for (const ch of line) {
    if (encoder.encode(cur + ch).length > 75) {
      out.push(cur)
      cur = ' ' + ch
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.join('\r\n')
}

function eventTitle(category) {
  return `つくば市ごみ収集: ${category.label}`
}

function eventDetails(areaLabel) {
  return `${areaLabel}の収集日。詳細: ${SITE_URL}`
}

export function buildGoogleCalendarUrl({ areaLabel, iso, category }) {
  const ymd = iso.replace(/-/g, '')
  const nextYmd = nextDayYmd(iso)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(category),
    dates: `${ymd}/${nextYmd}`,
    details: eventDetails(areaLabel),
    ctz: 'Asia/Tokyo',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildSingleEventIcs({ areaSlug, areaLabel, iso, category, fiscalYear }) {
  const ymd = iso.replace(/-/g, '')
  const nextYmd = nextDayYmd(iso)
  const dtstamp = `${fiscalYear}0401T000000Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//terasaki-8910.github.io//gomi-calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gomi-${areaSlug}-${ymd}-${category.id}@terasaki-8910.github.io`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${ymd}`,
    `DTEND;VALUE=DATE:${nextYmd}`,
    `SUMMARY:${escapeText(eventTitle(category))}`,
    `DESCRIPTION:${escapeText(eventDetails(areaLabel))}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
