import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

import { skills as allSkills, OTHER_LEVELS } from '../data/skills'
import { research } from '../data/research'
import { timeline as allTimeline } from '../data/timeline'

// onTop: false の項目は /career/ だけに出す
const skills = allSkills.filter((item) => item.onTop !== false)
const timeline = allTimeline.filter((item) => item.onTop !== false)
// 技術スタックは /career/ と同じ並べ方(主な技術と、温度感ごとの「その他」。期間は出さない。確認シート14回目 R14-7)
const mainSkills = skills.filter((skill) => skill.group === 'main').sort((a, b) => a.careerOrder - b.careerOrder)
const otherLevels = OTHER_LEVELS.map((level) => ({
  ...level,
  items: skills.filter((skill) => skill.group === 'other' && skill.level === level.id),
})).filter((level) => level.items.length > 0)

const intro = [
  { label: 'HN', value: '冬色' },
  { label: '趣味', value: '映画鑑賞、麻雀、サーバこねこね' },
  { label: '好きなアーティスト', value: 'サカナクション、CentralCee' },
]

export default function Profile() {
  const sectionRef = useRef()
  const itemsRef = useRef([])
  const introBoxesRef = useRef([])
  // My Skills と Research の発表は、学歴・経歴と同じ動き(左から出る)にする
  const listItemsRef = useRef([])

  useEffect(() => {
    ;[...itemsRef.current, ...listItemsRef.current].filter(Boolean).forEach((item) => {
      gsap.fromTo(
        item,
        { opacity: 0, x: -24 },
        {
          scrollTrigger: {
            trigger: item,
            start: 'top 85%',
            end: 'top 50%',
            scrub: 1,
          },
          opacity: 1,
          x: 0,
        }
      )
    })

    introBoxesRef.current.forEach((box) => {
      gsap.fromTo(
        box,
        { opacity: 0, y: 16 },
        {
          scrollTrigger: {
            trigger: box,
            start: 'top 85%',
            end: 'top 50%',
            scrub: 1,
          },
          opacity: 1,
          y: 0,
        }
      )
    })
  }, [])

  return (
    <section ref={sectionRef} className="px-8 py-32">
      <div className="bk-content max-w-5xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-20">自己紹介</h2>

        {/* PC(md以上)は左の列に「自己紹介 → 学歴・経歴」、右の列に My Skills を置く。
            スマホはこの並び(自己紹介 → My Skills → 学歴・経歴)のまま縦に積む。
            3行目(1fr)が My Skills の長さの余りを受け持ち、左の列の間が空かないようにする。 */}
        <div className="grid gap-12 mb-32 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] md:gap-y-0">
          <div className="md:col-start-1 md:row-start-1">
            {/* 節の題が「自己紹介」になったので、ここの同じ見出しは外した(2026-10-05 本人指定) */}
            <div className="border-t border-line">
              {intro.map((item, index) => (
                <div
                  key={item.label}
                  ref={(el) => (introBoxesRef.current[index] = el)}
                  className="border-b border-line py-4 flex items-baseline gap-4"
                >
                  <span className="text-sm text-muted w-32 shrink-0">{item.label}</span>
                  <span className="text-lg text-ink">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 md:mt-0 md:col-start-2 md:row-start-1 md:row-span-3">
            <h3 className="text-2xl font-display text-ink mb-6">技術スタック</h3>
            <div className="border-t border-line">
              {mainSkills.map((skill, index) => (
                <div key={skill.name} ref={(el) => (listItemsRef.current[index] = el)} className="border-b border-line py-4">
                  <h4 className="text-xl font-display text-ink">{skill.name}</h4>
                  <p className="text-ink leading-relaxed mt-1">{skill.text}</p>
                </div>
              ))}
            </div>
            {otherLevels.length > 0 && (
              <div ref={(el) => (listItemsRef.current[mainSkills.length] = el)} className="mt-8">
                <h4 className="text-xl font-display text-ink">その他</h4>
                <dl className="mt-3 space-y-2">
                  {otherLevels.map((level) => (
                    <div key={level.id}>
                      <dt className="text-sm text-muted">{level.label}</dt>
                      <dd className="text-ink">
                        {level.items.map((skill) => `${skill.name}${skill.note ? `（${skill.note}）` : ''}`).join('、')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="md:col-start-1 md:row-start-2 md:mt-16">
            <h3 className="text-2xl font-display text-ink mb-6">学歴・経歴</h3>
            <div className="space-y-6">
              {timeline.map((item, index) => (
                <div
                  key={item.year}
                  ref={(el) => (itemsRef.current[index] = el)}
                  className="relative pl-6 border-l-2 border-accent"
                >
                  <div className="text-sm font-mono text-ink">{item.year}</div>
                  <h4 className="text-xl font-display text-ink mt-2">{item.title}</h4>
                  <p className="text-ink leading-relaxed mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-display text-ink mb-6">研究</h3>
          <p className="text-lg text-ink leading-relaxed">{research.summary}</p>
          <div className="space-y-6 mt-10">
            {research.talks.map((talk, index) => (
              <div
                key={talk.title}
                ref={(el) => (listItemsRef.current[mainSkills.length + 1 + index] = el)}
                className="relative pl-6 border-l-2 border-accent"
              >
                <div className="text-sm font-mono text-ink">{talk.date}</div>
                <h4 className="text-xl font-display text-ink mt-2">{talk.title}</h4>
                <p className="text-sm text-ink leading-relaxed mt-2">
                  {talk.authors} ／ {talk.venue}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
