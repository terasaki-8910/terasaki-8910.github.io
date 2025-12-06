import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

import Hero from './components/Hero'
import Philosophy from './components/Philosophy'
import ProjectShowcase from './components/ProjectShowcase'
import Profile from './components/Profile'
import Footer from './components/Footer'
import BackgroundScene from './components/BackgroundScene'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'

gsap.registerPlugin(ScrollTrigger)

function App() {
  const lenisRef = useRef()
  const [webglError, setWebglError] = useState(false)

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
        {/* WebGL Background */}
        <div className="fixed inset-0 z-0">
          {!webglError ? (
            <Canvas 
              camera={{ position: [0, 0, 5], fov: 75 }}
              gl={{ 
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
                failIfMajorPerformanceCaveat: false
              }}
              onCreated={(state) => {
                console.log('WebGL Context Created:', state.gl.getContext())
              }}
              onError={(error) => {
                console.error('WebGL Error:', error)
                setWebglError(true)
              }}
            >
              <BackgroundScene />
            </Canvas>
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-[#0A0E27] to-[#151B36]" />
          )}
        </div>

        {/* Main Content */}
        <div className="relative z-10">
          {<Header currentPage="home" />}
          <Hero />
          <Philosophy />
          <ProjectShowcase />
          <Profile />
          <Footer />
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
