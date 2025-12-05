import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SpotifyRecentTracks from './SpotifyRecentTracks'
const playlistId = '4bmnZcheENvgDxpg1JFyEa';

const projects = [
  {
    id: 1,
    title: 'Experimental Lab #001',
    description: 'インタラクティブなビジュアルエクスペリメント',
    tags: ['WebGL', 'Three.js', 'Generative Art'],
    link: '#',
    color: 'from-cyan-500 to-blue-600'
  },
  {
    id: 2,
    title: 'Spotify Dashboard',
    description: '最近聴いた曲',
    tags: ['Web Audio API', 'React', 'Spotify Integration'],
    link: '/spotify_recent.html',
    color: 'from-violet-500 to-purple-600',
    spotify: true
  },
  {
    id: 3,
    title: 'Gaming Archive',
    description: 'お気に入りのゲームコレクション',
    tags: ['Steam', 'Discord', 'Community'],
    link: '#',
    color: 'from-emerald-500 to-teal-600',
    gaming: true
  },
  {
    id: 4,
    title: 'Code Playground',
    description: 'アルゴリズムとデータ構造の遊び場',
    tags: ['JavaScript', 'Algorithms', 'Visualization'],
    link: '#',
    color: 'from-orange-500 to-red-600'
  }
]

export default function ProjectShowcase() {
  const sectionRef = useRef()
  const cardsRef = useRef([])

  useEffect(() => {
    cardsRef.current.forEach((card, index) => {
      gsap.fromTo(card,
        { 
          opacity: 0,
          scale: 0.8,
          rotateX: 45,
        },
        {
          scrollTrigger: {
            trigger: card,
            start: 'top 80%',
            end: 'top 30%',
            scrub: 1,
          },
          opacity: 1,
          scale: 1,
          rotateX: 0,
        }
      )

      // Parallax effect
      gsap.to(card, {
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
        y: index % 2 === 0 ? -50 : 50,
      })
    })
  }, [])

  return (
    <section ref={sectionRef} className="min-h-screen px-8 py-32">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-massive font-bold mb-20 text-gradient text-center">
          Projects
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {projects.map((project, index) => (
            <div
              key={project.id}
              ref={el => cardsRef.current[index] = el}
              className="group relative"
              style={{ perspective: '1000px' }}
            >
              <a href={project.link} className="block">
                <div className="glass rounded-3xl p-8 md:p-12 h-[400px] relative overflow-hidden transition-all duration-500 hover:scale-105 hover:border-white/30">
                  {/* Gradient Background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${project.color} opacity-10 group-hover:opacity-20 transition-opacity duration-500`}></div>
                  
                  {/* Content */}
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <div>
                      <h3 className="text-3xl font-bold mb-4 group-hover:text-gradient transition-all">
                        {project.title}
                      </h3>
                      <p className="text-gray-400 text-lg mb-6">
                        {project.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.tags.map(tag => (
                          <span 
                            key={tag}
                            className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm text-gray-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Special Badges */}
                    <div className="flex gap-4 mt-6">
                      {project.spotify && (
                        <SpotifyRecentTracks limit={3} />
                      )}
                      {project.gaming && (
                        <div className="glass rounded-xl px-4 py-2 text-sm text-accent-violet border border-accent-violet/30">
                          <span className="mr-2">🎮</span>
                          Steam + Discord
                        </div>
                      )}
                    </div>

                    {/* Arrow indicator */}
                    <div className="absolute bottom-8 right-8 w-12 h-12 border border-white/20 rounded-full flex items-center justify-center group-hover:border-accent-cyan group-hover:scale-110 transition-all">
                      <span className="text-2xl">→</span>
                    </div>
                  </div>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
