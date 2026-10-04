import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SpotifyRecentTracks from './SpotifyRecentTracks'
import HomeGomiPreview from './HomeGomiPreview'
import HomeCharaOmakase from './HomeCharaOmakase'
import AsciiModelViewer from './AsciiModelViewer'
import { ASCII_MODELS } from '../data/asciiModels'
import { projects } from '../data/projects'

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
      <div className="bk-content max-w-4xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-20">Projects</h2>

        <div className="border-t border-line">
          {projects.map((project, index) => (
            <article
              key={project.id}
              ref={(el) => (itemsRef.current[index] = el)}
              className="border-b border-line py-10"
            >
              <a href={project.link} className="group block">
                <h3 className="text-2xl font-display text-ink group-hover:text-accent transition-colors">
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

              {project.ascii && ASCII_MODELS[0] && (
                <div className="mt-6">
                  {/* 一覧の中では低めの枠にし、モデル名の見出しは出さない
                      (項目のタイトルと重なるため)。クレジットはCC BY 3.0の
                      利用条件なので残す。 */}
                  <AsciiModelViewer
                    modelUrl={ASCII_MODELS[0].modelUrl}
                    name={ASCII_MODELS[0].name}
                    credit={ASCII_MODELS[0].credit}
                    showName={false}
                    frameClassName="h-[200px] md:h-[260px]"
                  />
                </div>
              )}
              {project.spotify && (
                <div className="mt-6">
                  <SpotifyRecentTracks limit={3} />
                </div>
              )}
              {project.gomi && (
                <div className="mt-6">
                  <HomeGomiPreview />
                </div>
              )}
              {project.charaPicker && (
                <div className="mt-6">
                  <HomeCharaOmakase />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
