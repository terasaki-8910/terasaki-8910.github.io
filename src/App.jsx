import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

import Hero from './components/Hero'
import AsciiGallery from './components/AsciiGallery'
import Philosophy from './components/Philosophy'
import ProjectShowcase from './components/ProjectShowcase'
import Profile from './components/Profile'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'

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

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    // Connect Lenis with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update)

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })

    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      gsap.ticker.remove()
    }
  }, [])

  return (
    <ErrorBoundary>
      <div className="relative">
        <Hero />
        <Philosophy />
        <AsciiGallery limit={2} linkToFull />
        <ProjectShowcase />
        <Profile />
        <Footer />
      </div>
    </ErrorBoundary>
  )
}

export default App
