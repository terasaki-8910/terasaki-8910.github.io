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
        {/* サイト名。地の色(#F9EC8E)の出典であるAlicemerix「オーバーライド」に由来
            (index.css参照)。旧「@Override」(Javaのアノテーション由来)は英字単体で
            検索に埋もれる上、既存の英語ワードそのものだったため改めた。カタカナに
            したことで実在プログラム構文とは競合しなくなっている。
            <title>やOGP側には引き続き「冬色」を併記している(index.html)。
            見た目とtitleタグは別物でよい。 */}
        <h1
          className="font-display font-medium text-massive mb-6"
          style={{ color: 'rgb(250, 160, 160)', WebkitTextStroke: '6px black', paintOrder: 'stroke fill' }}
        >
          @オーバーライド
        </h1>
        {/* サブタイトルは歌詞のオマージュ。h1の「オーバーライド」を、
            「半端な関数を書き換える」という具体的な行為として言い換えている。 */}
        <p className="text-lg md:text-xl text-muted tracking-wide mb-20 leading-relaxed">
          半端なアプリの関数を
          <br />
          少々ここらでオーバーライド
        </p>

        <GithubActivity />
      </div>
    </section>
  )
}
