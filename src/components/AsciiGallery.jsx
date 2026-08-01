import { useState } from 'react'
import { ASCII_MODELS } from '../data/asciiModels'
import AsciiModelViewer from './AsciiModelViewer'

// limit未指定なら全件表示(専用ページ用)。limit指定時はホーム用の
// 「N件まで表示+残りはアコーディオン」になる。
export default function AsciiGallery({ limit, linkToFull = false }) {
  const [expanded, setExpanded] = useState(false)
  const visible = limit ? ASCII_MODELS.slice(0, limit) : ASCII_MODELS
  const hidden = limit ? ASCII_MODELS.slice(limit) : []

  return (
    <section className="px-8 py-32">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-massive font-medium font-display text-ink mb-12">
          {linkToFull ? (
            <a href="/ascii/" className="hover:text-accent transition-colors">
              3D ASCII
            </a>
          ) : (
            '3D ASCII'
          )}
        </h2>

        <div className="space-y-16">
          {visible.map((item) => (
            <AsciiModelViewer
              key={item.id}
              id={item.id}
              modelUrl={item.modelUrl}
              name={item.name}
              credit={item.credit}
              href={linkToFull ? `/ascii/#${item.id}` : undefined}
            />
          ))}
        </div>

        {hidden.length > 0 && (
          <div className="mt-16">
            {/* 折りたたみ中はDOMごとアンマウントし、WebGLコンテキストを
                生成しない。展開したものだけ実際にレンダリングされる */}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm text-muted hover:text-accent transition-colors"
            >
              {expanded ? '閉じる' : `他${hidden.length}件を表示`}
            </button>
            {expanded && (
              <div className="space-y-16 mt-8">
                {hidden.map((item) => (
                  <AsciiModelViewer
                    key={item.id}
                    modelUrl={item.modelUrl}
                    name={item.name}
                    credit={item.credit}
                    href={linkToFull ? '/ascii/' : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
