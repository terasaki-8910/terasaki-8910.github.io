import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const timeline = [
  {
    year: 'Now',
    title: '筑波大学大学院　情報学学位プログラム　M1在学中',
    description: 'To be continued...',
  },
  {
    year: '2024',
    title: '筑波大学　情報学群　情報メディア創成学類　３年次編入',
    description: '情報系の知識を学ぶ',
  },
  {
    year: '2019',
    title: '舞鶴工業高等専門学校　電気情報工学科　入学',
    description: '電気電子の情報を学びつつプログラミングの基礎も学ぶ',
  },
]

const intro = [
  { label: 'HN', value: '冬色' },
  { label: '趣味', value: '映画鑑賞、麻雀、サーバこねこね' },
  { label: '好きなアーティスト', value: 'サカナクション、CentralCee' },
]

export default function Profile() {
  const sectionRef = useRef()
  const itemsRef = useRef([])
  const introBoxesRef = useRef([])

  useEffect(() => {
    itemsRef.current.forEach((item) => {
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
      <div className="max-w-5xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-20">Journey</h2>

        <div className="grid md:grid-cols-2 gap-12 mb-32">
          <div>
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

          <div>
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
      </div>
    </section>
  )
}
