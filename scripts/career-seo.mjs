// /career/ を検索エンジンに読んでもらうための内容を、ビルドのときに career/index.html へ入れる(確認シート18回目 R18-11)。
// ページは React で描くので、最初の HTML には中身がない。JS を動かさないクローラーでも、名前・大学・研究室・論文・
// 作ったアプリ・連絡先などが読めるよう、決まった文(下書きは除く)をそのまま並べる。React が描き始めると置き換わり、
// 見た目は変わらない(トップの #seo-fallback-content と同じやり方)。構造化データ(JSON-LD)も同じデータから作る。
import { NAME_PARTS, AFFILIATION, EMAIL, INTRO, STRENGTHS, FUTURE } from '../src/data/profile.js'
import { timeline, partTimeJobs } from '../src/data/timeline.js'
import { research } from '../src/data/research.js'
import { skills, OTHER_LEVELS } from '../src/data/skills.js'
import { works, WORKS_NOTE, AI_PRINCIPLES } from '../src/data/works.js'

const SITE = 'https://terasaki-8910.github.io'
const GITHUB = 'https://github.com/terasaki-8910'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const name = NAME_PARTS.map((p) => p.text).join('')
const reading = NAME_PARTS.map((p) => p.reading).filter(Boolean).join(' ')

export function careerFallbackHtml() {
  const out = []
  out.push(`<h1>${esc(name)}（${esc(reading)}）</h1>`)
  out.push(`<p>${esc(AFFILIATION)}</p>`)
  out.push(`<p>連絡先: <a href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a></p>`)
  out.push('<h2>自己紹介</h2>')
  for (const p of INTRO) out.push(`<p>${esc(p)}</p>`)
  out.push('<ul>')
  for (const t of timeline.filter((t) => !t.draft)) out.push(`<li>${esc(t.year)} ${esc(t.title)}：${esc(t.description)}</li>`)
  out.push('</ul>')
  if (!partTimeJobs.draft) {
    out.push(`<p>アルバイト：${partTimeJobs.items.map((j) => `${esc(j.period)} ${esc(j.name)}（${esc(j.text)}）`).join('、')}</p>`)
  }
  if (STRENGTHS.strengths || STRENGTHS.weaknesses) out.push(`<h2>強み・弱み</h2><p>${esc(STRENGTHS.strengths)}</p><p>${esc(STRENGTHS.weaknesses)}</p>`)
  if (FUTURE) out.push(`<h2>この先やってみたいこと</h2><p>${esc(FUTURE)}</p>`)
  out.push('<h2>取り組んでいる研究</h2>')
  out.push(`<p>${esc(research.summary)}</p>`)
  out.push(`<h3>論文</h3><ul>`)
  for (const t of research.talks) {
    const meta = [t.authors, t.venue, t.status, t.refereed ? '査読有り' : null, t.doi ? `DOI: ${t.doi}` : null].filter(Boolean).map(esc).join('。')
    out.push(`<li>${esc(t.date)} <span${t.lang ? ` lang="${esc(t.lang)}"` : ''}>${esc(t.title)}</span>（${meta}）${t.plain ? esc(t.plain) : ''}</li>`)
  }
  out.push('</ul>')
  out.push('<h2>技術スタック</h2><ul>')
  for (const s of skills.filter((s) => s.group === 'main').sort((a, b) => a.careerOrder - b.careerOrder)) out.push(`<li>${esc(s.name)}：${esc(s.text)}</li>`)
  out.push('</ul>')
  for (const level of OTHER_LEVELS) {
    const names = skills.filter((s) => s.group === 'other' && s.level === level.id).map((s) => (s.note ? `${s.name}（${s.note}）` : s.name))
    if (names.length) out.push(`<p>${esc(level.label)}：${esc(names.join('、'))}</p>`)
  }
  out.push('<h2>プロジェクト</h2>')
  if (WORKS_NOTE) out.push(`<p>${esc(WORKS_NOTE)}</p>`)
  for (const w of works) {
    out.push(`<h3><a href="${GITHUB}/${esc(w.repo)}">${esc(w.name)}</a></h3>`)
    out.push(`<p>${esc(w.summary)}。${esc(w.role)}。使った技術：${esc(w.tech)}</p>`)
    if (w.background) out.push(`<p>${esc(w.background)}</p>`)
    out.push(`<ul>${w.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`)
    if (w.learned) out.push(`<p>${esc(w.learned)}</p>`)
  }
  out.push(`<h2>${esc(AI_PRINCIPLES.title)}</h2><ul>${AI_PRINCIPLES.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`)
  return `<div id="seo-fallback-content">${out.join('')}</div>`
}

// 構造化データ。ページに出ている事実だけ。まだ出ていない論文(status があるもの)は入れない
export function careerJsonLd() {
  const person = {
    '@type': 'Person',
    '@id': `${SITE}/career/#person`,
    name,
    // 読み、論文での英語の名前(R18-6)、ハンドル名(R18-11「冬色…等の私に結びつくもの」)
    alternateName: [reading, 'Masato Hinooka', '冬色'],
    url: `${SITE}/career/`,
    email: `mailto:${EMAIL}`,
    affiliation: { '@type': 'CollegeOrUniversity', name: '筑波大学大学院 情報学学位プログラム' },
    memberOf: { '@type': 'Organization', name: 'メタデータ研究室（筑波大学）', url: 'https://mdlab.slis.tsukuba.ac.jp/' },
    alumniOf: [
      { '@type': 'CollegeOrUniversity', name: '筑波大学 情報学群 情報メディア創成学類' },
      { '@type': 'CollegeOrUniversity', name: '舞鶴工業高等専門学校' },
    ],
    knowsAbout: ['Linked Open Data', 'SPARQL', 'RDF', 'Python', 'Linux', 'GitHub'],
    sameAs: [GITHUB],
  }
  const articles = research.talks
    .filter((t) => !t.status)
    .map((t) => ({
      '@type': 'ScholarlyArticle',
      headline: t.title,
      ...(t.lang ? { inLanguage: t.lang } : { inLanguage: 'ja' }),
      author: t.authors.split(/,\s*/).map((a) => (a === name || a === 'Masato Hinooka' || a === '寺﨑雅人' ? { '@id': `${SITE}/career/#person` } : { '@type': 'Person', name: a })),
      datePublished: t.date.replace('.', '-'),
      isPartOf: { '@type': 'PublicationIssue', name: t.venue },
      ...(t.doi ? { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: t.doi }, url: `https://doi.org/${t.doi}` } : {}),
    }))
  const graph = [{ '@type': 'ProfilePage', url: `${SITE}/career/`, mainEntity: { '@id': `${SITE}/career/#person` } }, person, ...articles]
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
}

// 見えないようにする(トップの index.html と同じ)。React が描き始めると置き換わるので、ここにあるのは描くまでの一瞬だけ
export const FALLBACK_CSS =
  '#seo-fallback-content{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'
