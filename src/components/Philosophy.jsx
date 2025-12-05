import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export default function Philosophy() {
  const sectionRef = useRef()
  const textRef = useRef()

  useEffect(() => {
    const section = sectionRef.current
    const text = textRef.current

    gsap.to(section, {
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
      backgroundColor: '#151B36',
    })

    gsap.fromTo(text, 
      { opacity: 0, y: 100 },
      {
        scrollTrigger: {
          trigger: text,
          start: 'top 80%',
          end: 'top 40%',
          scrub: 1,
        },
        opacity: 1,
        y: 0,
      }
    )

    // Word reveal animation
    const words = text.querySelectorAll('.word')
    gsap.fromTo(words,
      { opacity: 0.3 },
      {
        scrollTrigger: {
          trigger: text,
          start: 'top 60%',
          end: 'bottom 40%',
          scrub: 1,
        },
        opacity: 1,
        stagger: 0.1,
      }
    )

  }, [])

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-8 py-32 transition-colors duration-1000"
    >
      <div className="max-w-5xl">
        <h2 className="text-massive font-bold mb-16 text-gradient">
          Fuyuiro's Portfolio
        </h2>
        <div ref={textRef} className="space-y-8">
          <p className="text-2xl md:text-4xl leading-relaxed font-light">
            <span className="word">クソサイト</span>
            <span className="word">製造工場へ</span>
            <span className="word">ようこそ！</span>
          </p>
          <p className="text-lg md:text-3xl leading-relaxed text-gray-400 font-light">
            <span className="word">クソサイト</span>
            <span className="word">製造構造長の</span>
            <span className="word">冬色と</span>
            <span className="word">申します！</span>
          </p>
          <p className="text-base md:text-xl leading-relaxed text-gray-500 font-light">
            <span className="word">実験的な</span>
            <span className="word">プロジェクト、</span>
            <span className="word">未完成な</span>
            <span className="word">アイデア、</span>
            <span className="word">そして</span>
            <span className="word">挑戦の</span>
            <span className="word">痕跡。</span>
            <span className="word">ここは</span>
            <span className="word">創造の</span>
            <span className="word">実験場。</span>
          </p>
        </div>
      </div>
    </section>
  )
}
