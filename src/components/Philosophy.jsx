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
          Philosophy
        </h2>
        <div ref={textRef} className="space-y-8">
          <p className="text-2xl md:text-4xl leading-relaxed font-light">
            <span className="word">なぜ、</span>
            <span className="word">我々は</span>
            <span className="word">ガラクタを</span>
            <span className="word">作るのか？</span>
          </p>
          <p className="text-lg md:text-2xl leading-relaxed text-gray-400 font-light">
            <span className="word">それは、</span>
            <span className="word">完璧を</span>
            <span className="word">追求する</span>
            <span className="word">ことの</span>
            <span className="word">無意味さを</span>
            <span className="word">知っているからだ。</span>
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
            <span className="word">実験場である。</span>
          </p>
        </div>
      </div>
    </section>
  )
}
