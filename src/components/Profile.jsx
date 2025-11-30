import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const timeline = [
  {
    year: 'Now',
    title: '筑波大学　情報学群　情報メディア創生学類　4年次在学中',
    description: 'To be continued...'
  },{
    year: '2024',
    title: '筑波大学　情報学群　情報メディア創生学類　３年次編入',
    description: '情報系の知識を学ぶ'
  },
  {
    year: '2019',
    title: '舞鶴工業高等専門学校　電気情報工学科　入学',
    description: '電気電子の情報を学びつつプログラミングの基礎も学ぶ'
  }
]

export default function Profile() {
  const sectionRef = useRef()
  const itemsRef = useRef([])

  useEffect(() => {
    itemsRef.current.forEach((item, index) => {
      gsap.fromTo(item,
        { opacity: 0, x: -100 },
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
  }, [])

  return (
    <section ref={sectionRef} className="min-h-screen px-8 py-32">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-massive font-bold mb-20 text-gradient">
          Journey
        </h2>

        <div className="space-y-16">
          {timeline.map((item, index) => (
            <div
              key={index}
              ref={el => itemsRef.current[index] = el}
              className="relative pl-12 border-l-2 border-white/10"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet"></div>
              
              <div className="space-y-2">
                <div className="text-accent-cyan text-sm font-mono tracking-wider">
                  {item.year}
                </div>
                <h3 className="text-3xl font-bold">
                  {item.title}
                </h3>
                <p className="text-gray-400 text-lg leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Skills section */}
        <div className="mt-32">
          <h3 className="text-4xl font-bold mb-12">Tech Stack</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['React', 'Three.js', 'GSAP', 'Tailwind CSS', 'Vite', 'WebGL', 'Node.js', 'Git'].map(skill => (
              <div
                key={skill}
                className="glass rounded-2xl p-6 text-center font-semibold hover:scale-105 transition-transform cursor-pointer"
              >
                {skill}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
