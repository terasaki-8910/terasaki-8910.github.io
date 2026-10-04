import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

import Hero from './components/Hero'
import Philosophy from './components/Philosophy'
import ProjectShowcase from './components/ProjectShowcase'
import Profile from './components/Profile'
import CommitLog from './components/CommitLog'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import PageBackground from './components/PageBackground'

gsap.registerPlugin(ScrollTrigger)

function App() {
  const lenisRef = useRef()

  useEffect(() => {
    // Initialize Lenis for smooth scrolling
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    })

    lenisRef.current = lenis

    // Lenisの更新はgsap.tickerだけで回す。以前は自前のrequestAnimationFrame
    // ループからも呼んでいて、1フレームにlenis.rafが2回走っていた。
    // gsap.tickerに寄せると、ScrollTriggerと同じタイミングで更新される。
    lenis.on('scroll', ScrollTrigger.update)

    const update = (time) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)

    return () => {
      // remove()には追加したのと同じ関数を渡さないと外れない
      gsap.ticker.remove(update)
      lenis.destroy()
    }
  }, [])

  return (
    <ErrorBoundary>
      <div className="relative">
        <PageBackground />
        <Hero />
        <Philosophy />
        {/* 自己紹介・経歴は先に見せる(Philosophyの直後)。作品紹介より
            人となりを先に置く方針。 */}
        <Profile />
        <ProjectShowcase />
        <CommitLog />
        <Footer />
      </div>
    </ErrorBoundary>
  )
}

export default App
