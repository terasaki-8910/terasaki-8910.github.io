import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import Header from './Header'
import GithubActivity from './GithubActivity'

export default function Hero() {
  const headerRef = useRef()
  const contentRef = useRef()

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // headerRefにはtransformを一切かけない: Header内部のposition:fixedな
    // 角配置要素(モバイルのSpotifyアイコン/ラベル)が、transformを持つ祖先を
    // containing blockとして誤認しviewport基準からズレるのを防ぐため。
    gsap.set(headerRef.current, { opacity: 0 })
    gsap.set(contentRef.current, { opacity: 0, y: reduceMotion ? 0 : 12 })

    const tl = gsap.timeline({ delay: reduceMotion ? 0 : 0.15 })
    tl.to(contentRef.current, {
      opacity: 1,
      y: 0,
      duration: reduceMotion ? 0 : 0.6,
      ease: 'power2.out',
    }).to(headerRef.current, { opacity: 1, duration: reduceMotion ? 0 : 0.5, ease: 'power2.out' }, '-=0.3')
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-32">
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50">
        <Header currentPage="home" />
      </div>

      <div ref={contentRef} className="text-center max-w-4xl mx-auto w-full min-w-0">
        <h1
          className="font-display font-medium text-massive mb-6"
          style={{ color: 'rgb(250, 160, 160)', WebkitTextStroke: '6px black', paintOrder: 'stroke fill' }}
        >
          クソサイト製造工場
        </h1>
        <p className="text-lg md:text-xl text-muted tracking-wide mb-20">
          冬色 — Kuso Site Manufacturing Plant
        </p>

        <GithubActivity />
      </div>
    </section>
  )
}
