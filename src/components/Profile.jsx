import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

import { skills } from '../data/skills'
import { research } from '../data/research'
import { timeline } from '../data/timeline'

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
        <h2 className="text-massive font-medium font-display text-ink mb-20">Journey</h2>

        {/* PC(md以上)は左の列に「自己紹介 → 学歴・経歴」、右の列に My Skills を置く。
            スマホはこの並び(自己紹介 → My Skills → 学歴・経歴)のまま縦に積む。
            3行目(1fr)が My Skills の長さの余りを受け持ち、左の列の間が空かないようにする。 */}
        <div className="grid gap-12 mb-32 md:grid-cols-2 md:grid-rows-[auto_auto_1fr] md:gap-y-0">
          <div className="md:col-start-1 md:row-start-1">
            <h3 className="text-2xl font-display text-ink mb-6">自己紹介</h3>
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
            <h3 className="text-2xl font-display text-ink mb-6">My Skills</h3>
            <div className="space-y-6">
              {skills.map((skill, index) => (
                <div
                  key={skill.name}
                  ref={(el) => (listItemsRef.current[index] = el)}
                  className="relative pl-6 border-l border-line"
                >
                  {skill.period && <div className="text-sm font-mono text-accent">{skill.period}</div>}
                  <h4 className="text-xl font-display text-ink mt-2">{skill.name}</h4>
                  <p className="text-muted leading-relaxed mt-1">{skill.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-start-1 md:row-start-2 md:mt-16">
            <h3 className="text-2xl font-display text-ink mb-6">学歴・経歴</h3>
            <div className="space-y-6">
              {timeline.map((item, index) => (
                <div
                  key={item.year}
                  ref={(el) => (itemsRef.current[index] = el)}
                  className="relative pl-6 border-l border-line"
                >
                  <div className="text-sm font-mono text-accent">{item.year}</div>
                  <h4 className="text-xl font-display text-ink mt-2">{item.title}</h4>
                  <p className="text-muted leading-relaxed mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-display text-ink mb-6">Research</h3>
          <p className="text-lg text-ink leading-relaxed">{research.summary}</p>
          <div className="space-y-6 mt-10">
            {research.talks.map((talk, index) => (
              <div
                key={talk.title}
                ref={(el) => (listItemsRef.current[skills.length + index] = el)}
                className="relative pl-6 border-l border-line"
              >
                <div className="text-sm font-mono text-accent">{talk.date}</div>
                <h4 className="text-xl font-display text-ink mt-2">{talk.title}</h4>
                <p className="text-muted leading-relaxed mt-1">
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
