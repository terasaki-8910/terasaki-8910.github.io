import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export default function Philosophy() {
  const sectionRef = useRef()
  const textRef = useRef()

  useEffect(() => {
    const text = textRef.current

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

  // このセクションはスクロール連動の背景色変化を廃止し、前後(Hero/3D ASCII)と
  // 同じ地の色で統一している。TASKS.mdの「背景ウィンドウ+重音テト」演出を
  // 他のセクションに実装する際も、ここだけは窓を開けない"壁"として残す方針。
  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-8 py-32"
    >
      <div className="max-w-5xl">
        <h2 className="text-massive font-medium font-display text-ink mb-16">
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
          {/* この段落は index.html の #seo-fallback-content と同じ内容にしておくこと
              (クローラーに見せる文章とページ実物を一致させるため)。 */}
          <p className="text-base md:text-xl leading-relaxed text-gray-500 font-light">
            <span className="word">取り組んできた</span>
            <span className="word">プロジェクト、</span>
            <span className="word">未完成の</span>
            <span className="word">アイデア、</span>
            <span className="word">ついでの</span>
            <span className="word">自己紹介。</span>
          </p>
        </div>
      </div>
    </section>
  )
}
