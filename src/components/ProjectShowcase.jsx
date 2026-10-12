import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SpotifyRecentTracks from './SpotifyRecentTracks'
import HomeGomiPreview from './HomeGomiPreview'
import HomeCharaOmakase from './HomeCharaOmakase'
import HomeGamingPreview from './HomeGamingPreview'
import HomeMoviesPreview from './HomeMoviesPreview'
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

  // 項目の間と、次の「更新履歴」までの余白は詰める。題(プロジェクト)の上下の余白はそのまま
  // (題は大きく見せたい。確認シート16回目 R16-47)。行で並べるプレビューは最後の行の下線を出さず、
  // 項目の区切り線で閉じる(線が2本続かないように)
  return (
    <section ref={sectionRef} className="px-8 pt-32 pb-24">
      <div className="bk-content max-w-4xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-20">プロジェクト</h2>

        <div className="border-t border-line">
          {projects.map((project, index) => (
            <article
              key={project.id}
              ref={(el) => (itemsRef.current[index] = el)}
              className="border-b border-line py-6"
            >
              <a href={project.link} className="group block">
                <h3 className="text-2xl font-display text-ink group-hover:text-accent transition-colors">
                  {project.title}
                </h3>
                {project.description && <p className="text-muted text-lg mt-3">{project.description}</p>}

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs font-mono text-muted">
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>

              </a>

              {project.ascii && ASCII_MODELS[0] && (
                <div className="mt-5">
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
                <div className="mt-5">
                  <SpotifyRecentTracks limit={3} />
                </div>
              )}
              {project.gomi && (
                <div className="mt-5">
                  <HomeGomiPreview />
                </div>
              )}
              {project.charaPicker && (
                <div className="mt-5">
                  <HomeCharaOmakase />
                </div>
              )}
              {project.gaming && (
                <div className="mt-5">
                  <HomeGamingPreview />
                </div>
              )}
              {project.movies && (
                <div className="mt-5">
                  <HomeMoviesPreview />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
