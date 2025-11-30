import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

export default function Hero() {
  const titleRef = useRef()
  const subtitleRef = useRef()

  useEffect(() => {
    const title = titleRef.current
    const subtitle = subtitleRef.current

    // Split text into characters for animation
    const titleText = 'クソサイト製造工場'
    const chars = titleText.split('')
    
    title.innerHTML = chars.map((char, i) => 
      `<span class="inline-block opacity-0" style="transform: translateY(100px)">${char}</span>`
    ).join('')

    const charElements = title.querySelectorAll('span')

    // Cinematic entrance animation
    const tl = gsap.timeline({ delay: 0.5 })
    
    tl.to(charElements, {
      opacity: 1,
      y: 0,
      duration: 1.2,
      ease: 'power4.out',
      stagger: 0.08,
    })
    .to(subtitle, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power3.out',
    }, '-=0.5')

    // Parallax effect on scroll
    gsap.to(title, {
      scrollTrigger: {
        trigger: title,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
      y: 200,
      scale: 0.8,
      opacity: 0.3,
    })

  }, [])

  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      <div className="text-center z-10 px-4">
        <h1 
          ref={titleRef}
          className="font-display font-bold text-9xl text-white mb-8"
        >
        </h1>
        <p 
          ref={subtitleRef}
          className="text-xl md:text-3xl text-gray-400 opacity-0 translate-y-10 tracking-wide"
        >
          Kuso Site Manufacturing Plant
        </p>
        <p className="text-sm md:text-lg text-gray-500 mt-4 opacity-0 animate-fade-in">
          無駄に洗練されたハイテク工場へようこそ
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white/50 rounded-full mt-2 animate-pulse"></div>
        </div>
      </div>
    </section>
  )
}
