import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SpotifyRecentTracks from './SpotifyRecentTracks'

const projects = [
  {
    id: 2,
    title: 'Spotify Dashboard',
    description: '最近聴いた曲',
    tags: ['Web Audio API', 'React', 'Spotify Integration'],
    link: '/spotify/',
    spotify: true,
  },
  {
    id: 4,
    title: 'Tsukuba Gomi Calendar',
    description: 'つくば市ごみ収集カレンダー — オープンデータ連携',
    tags: ['Open Data', 'iCal', 'React'],
    link: '/gomi/',
  },
  {
    id: 3,
    title: 'Gaming Archive',
    description: 'お気に入りのゲームコレクション',
    tags: ['Steam', 'Discord', 'Community'],
    link: '#',
    gaming: true,
  },
]

export default function ProjectShowcase() {
  const sectionRef = useRef()
  const itemsRef = useRef([])

  useEffect(() => {
    itemsRef.current.forEach((item) => {
      gsap.fromTo(
        item,
        { opacity: 0, y: 24 },
        {
          scrollTrigger: {
            trigger: item,
            start: 'top 88%',
            end: 'top 55%',
            scrub: 1,
          },
          opacity: 1,
          y: 0,
        }
      )
    })
  }, [])

  return (
    <section ref={sectionRef} className="px-8 py-32">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-20">Projects</h2>

        <div className="border-t border-line">
          {projects.map((project, index) => (
            <article
              key={project.id}
              ref={(el) => (itemsRef.current[index] = el)}
              className="border-b border-line py-10"
            >
              <a href={project.link} className="group block">
                <h3 className="text-2xl font-display text-ink group-hover:text-celeste transition-colors">
                  {project.title}
                </h3>
                <p className="text-muted text-lg mt-3">{project.description}</p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs font-mono text-muted">
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>

                {project.gaming && (
                  <div className="mt-4 text-sm font-mono text-muted">Steam + Discord</div>
                )}
              </a>

              {project.spotify && (
                <div className="mt-6">
                  <SpotifyRecentTracks limit={3} />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
