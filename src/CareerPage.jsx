import { useEffect, useState } from 'react'
import ProjectMenu from './components/ProjectMenu'
import { annotate } from './components/career/Term'
import './components/career/career.css'

import { skills, OTHER_SKILLS_NOTE } from './data/skills'
import { research } from './data/research'
import { timeline } from './data/timeline'
import { works } from './data/works'

/**
 * /career/ 就活用の1ページの経歴書(decisions タスク 5)。
 * 本体からはリンクせず、URL を直接渡して見てもらう(career/index.html に noindex)。
 * 本体の色と書体はそのまま使い、GSAP・Lenis・大きな題字は使わない。
 * 左上のロゴと右上のメニューは本体と同じものを置く(このサイトの一部だと分かるように。2026-10-05 本人指定)。
 * 研究・技術スタック・学歴・経歴は、トップの自己紹介と同じデータを読む。学歴・経歴は自己紹介の中に置く。
 * 専門用語(src/data/glossary.js)は、ページで最初に出たところだけに説明の吹き出しを付ける。
 */
// 名前と読み仮名(読みは本人に確かめてから入れる。空なら振らない)
const NAME_PARTS = [
  { text: '日野岡', reading: '' },
  { text: '雅人', reading: '' },
]
const NAME = NAME_PARTS.map((part) => part.text).join('')
const AFFILIATION = '筑波大学大学院 情報学学位プログラム 博士前期課程'
const EMAIL = 'hinookajobhunting@gmail.com'
const INTRO =
  '筑波大学大学院 情報学学位プログラム（博士前期課程）に在籍し、2028年3月に修了予定です。研究では、Web 上で公開されたつながりのあるデータ（Linked Open Data）を、問い合わせ言語の SPARQL で使いやすくする手法を扱っています。研究室ではサーバの運用を担当し、個人では Web アプリやツールを作っています。'
// 強み・弱み(本人が書く。両方空なら節ごと出さない)
const STRENGTHS = { strengths: '', weaknesses: '' }
const GITHUB = 'https://github.com/terasaki-8910/'

/**
 * テーマ切り替え(本体と同じ右下のボタン。見た目は /header-styles.css)。
 * このページはいつもライトで開き(career/index.html の data-theme="light")、
 * 切り替えはこのページを見ている間だけ。本体と違って localStorage には保存しない。
 */
function ThemeToggle() {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <button
      type="button"
      className="cosmic-header__theme-toggle"
      aria-label="ダーク/ライトモード切り替え"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cosmic-header__icon cosmic-header__icon--sun">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cosmic-header__icon cosmic-header__icon--moon">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-20 border-t border-line pt-10">
      <h2 className="text-2xl md:text-3xl font-display text-ink mb-8">{title}</h2>
      {children}
    </section>
  )
}

// トップの学歴・経歴と同じ部品(ピンクの等幅の期間、見出し、説明、左の縦線)
function Entry({ label, title, children }) {
  return (
    <div className="relative pl-6 border-l border-line">
      {label && <div className="text-sm font-mono text-accent">{label}</div>}
      <h3 className="text-xl font-display text-ink mt-2">{title}</h3>
      {children}
    </div>
  )
}

function WorkFact({ term, children }) {
  return (
    <>
      <dt className="text-sm text-muted sm:pt-0.5">{term}</dt>
      <dd className="text-ink leading-relaxed">{children}</dd>
    </>
  )
}

export default function CareerPage() {
  // 専門用語の説明を付けた語(ページで最初の1か所だけに付けるため、描画のたびに作り直す)
  const seen = new Set()
  const mainSkills = skills.filter((skill) => skill.group !== 'other')
  const otherSkills = skills.filter((skill) => skill.group === 'other')
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <header className="cosmic-header">
          <div className="cosmic-header__container">
            <a href="/" className="cosmic-header__logo">
              @オーバーライド
            </a>
            <div className="cosmic-header__right-group">
              <ThemeToggle />
              <ProjectMenu currentPage="career" />
            </div>
          </div>
        </header>
      </div>
      <main className="px-6 md:px-8 pt-28 pb-32">
        <div className="bk-content max-w-3xl mx-auto">
          <header>
            <p className="text-sm tracking-[0.12em] text-muted">プロフィール</p>
            <h1 className="mt-4 text-5xl md:text-6xl font-display text-ink" aria-label={NAME}>
              {NAME_PARTS.map((part) =>
                part.reading ? (
                  <ruby key={part.text} className="name-ruby">
                    {part.text}
                    <rt>{part.reading}</rt>
                  </ruby>
                ) : (
                  <span key={part.text}>{part.text}</span>
                ),
              )}
            </h1>
            <p className="mt-8 text-lg text-ink">{AFFILIATION}</p>
            <p className="mt-2">
              <a
                href={`mailto:${EMAIL}`}
                className="font-mono text-ink underline decoration-line underline-offset-4 hover:text-accent transition-colors"
              >
                {EMAIL}
              </a>
            </p>
          </header>

          <Section title="自己紹介">
            <p className="text-lg text-ink leading-relaxed">{annotate(INTRO, seen)}</p>
            <div className="space-y-6 mt-10">
              {timeline.map((item) => (
                <Entry key={item.year} label={item.year} title={item.title}>
                  <p className="text-muted leading-relaxed mt-1">{annotate(item.description, seen)}</p>
                </Entry>
              ))}
            </div>
          </Section>

          <Section title="研究">
            <p className="text-lg text-ink leading-relaxed">{annotate(research.summary, seen)}</p>
            <div className="space-y-6 mt-10">
              {research.talks.map((talk) => (
                <Entry key={talk.title} label={talk.date} title={talk.title}>
                  {talk.plain && <p className="text-ink leading-relaxed mt-2">{annotate(talk.plain, seen)}</p>}
                  <p className="text-muted leading-relaxed mt-1">
                    {talk.authors} ／ {talk.venue}
                  </p>
                  {talk.authorsNote && <p className="text-sm text-muted mt-1">※ {talk.authorsNote}</p>}
                </Entry>
              ))}
            </div>
          </Section>

          {/* 年表に見えないように、期間と左の縦線は付けない。主な技術は説明を付けて、ほかは「その他」にまとめる */}
          <Section title="技術スタック">
            <div className="border-t border-line">
              {mainSkills.map((skill) => (
                <div key={skill.name} className="border-b border-line py-5">
                  <h3 className="text-xl font-display text-ink">{skill.name}</h3>
                  <p className="text-muted leading-relaxed mt-1">{annotate(skill.text, seen)}</p>
                </div>
              ))}
            </div>
            {otherSkills.length > 0 && (
              <div className="mt-10">
                <h3 className="text-xl font-display text-ink">その他</h3>
                <p className="text-sm text-muted mt-1">{OTHER_SKILLS_NOTE}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {otherSkills.map((skill) => (
                    <li key={skill.name} className="border border-line rounded-[3px] px-3 py-1 text-ink">
                      {skill.name}
                      {skill.note && <span className="text-sm text-muted">（{skill.note}）</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="プロジェクト">
            <div className="space-y-12">
              {works.map((work) => (
                <article key={work.repo} className="relative pl-6 border-l border-line">
                  <h3 className="text-xl font-display text-ink">
                    <a
                      href={GITHUB + work.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-line underline-offset-4 hover:text-accent transition-colors"
                    >
                      {work.name}
                    </a>
                  </h3>
                  <p className="mt-1 text-xs font-mono text-muted">github.com/terasaki-8910/{work.repo}</p>
                  {work.shot && (
                    <img
                      src={work.shot.src}
                      width={work.shot.width}
                      height={work.shot.height}
                      alt={work.shot.alt}
                      loading="lazy"
                      decoding="async"
                      className={`work-shot${work.shot.framed ? ' work-shot--framed' : ''}`}
                    />
                  )}
                  <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[6.5em_minmax(0,1fr)]">
                    <WorkFact term="概要">{work.summary}</WorkFact>
                    {work.background && <WorkFact term="作った経緯">{work.background}</WorkFact>}
                    <WorkFact term="担当">{work.role}</WorkFact>
                    <WorkFact term="使った技術">{work.tech}</WorkFact>
                    <WorkFact term="工夫">
                      <ul className="list-disc pl-5 space-y-1">
                        {work.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </WorkFact>
                    {work.learned && <WorkFact term="学び">{work.learned}</WorkFact>}
                  </dl>
                </article>
              ))}
            </div>
          </Section>

          {(STRENGTHS.strengths || STRENGTHS.weaknesses) && (
            <Section title="強み・弱み">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[6.5em_minmax(0,1fr)]">
                {STRENGTHS.strengths && <WorkFact term="強み">{STRENGTHS.strengths}</WorkFact>}
                {STRENGTHS.weaknesses && <WorkFact term="弱み">{STRENGTHS.weaknesses}</WorkFact>}
              </dl>
            </Section>
          )}
        </div>
      </main>
    </>
  )
}
