/**
 * 論文の一覧。researchmap と同じ形にする(確認シート19回目 R19-1「時系列順に researchmap みたいに」)。トップと /career/ で使う。
 * 現在とこれまでで分けず、新しい順に1本で並べる。1本ごとに 題(DOI があれば論文へのリンク)・著者・会場と年月・
 * 査読有りの印(R19-1「査読ありの物はわかりやすく」)。英語の題は論文と同じ欧文の書体(R18-17)。
 * /career/ では、著者の添え書き(旧姓)と、人事の人向けの説明(plainOf・renderPlain)も出す。
 */

const monthOf = (date) => {
  const [year, month] = date.split('.')
  return `${year}年${Number(month)}月`
}

// 会場名の末尾の（SIG-SWO-069-08）のような番号は、途中で折り返さない
function Venue({ text }) {
  const at = text.lastIndexOf('（')
  if (at <= 0) return text
  return (
    <>
      {text.slice(0, at)}
      <span className="whitespace-nowrap">{text.slice(at)}</span>
    </>
  )
}

const LINK = 'underline decoration-line underline-offset-4 hover:text-accent transition-colors'

export default function PaperList({ papers, titleTag: Title = 'h3', showNotes = false, plainOf, renderPlain, itemRef }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-ink">
        論文
        <span className="rounded-full bg-line px-2 font-mono text-xs leading-5">{papers.length}</span>
      </p>
      <ul className="mt-3 border-t border-line">
        {papers.map((paper, index) => {
          const plain = plainOf?.(paper)
          return (
            <li key={paper.title} ref={itemRef ? (el) => itemRef(el, index) : undefined} className="border-b border-l border-line py-4 pl-5 pr-2">
              <Title lang={paper.lang} className={`text-lg ${paper.lang === 'en' ? 'font-latin-serif font-bold leading-snug' : 'font-display'} text-ink`}>
                {paper.doi ? (
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {paper.title}
                  </a>
                ) : (
                  paper.title
                )}
              </Title>
              {paper.authors && <p className="text-sm text-ink mt-1">{paper.authors}</p>}
              {showNotes && paper.authorsNote && <p className="text-sm text-ink mt-1">※ {paper.authorsNote}</p>}
              <p className="text-sm text-ink mt-1">
                <Venue text={paper.venue} />
                {paper.status && ` (${paper.status})`} {monthOf(paper.date)}
                {paper.refereed && (
                  <span className="ml-2 inline-block rounded-sm bg-accent px-1.5 align-[1px] text-xs leading-5 text-on-accent">査読有り</span>
                )}
              </p>
              {paper.doi && (
                <p className="text-sm text-ink mt-1">
                  DOI:{' '}
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className={`font-mono break-all ${LINK}`}>
                    {paper.doi}
                  </a>
                </p>
              )}
              {plain && <p className="text-ink leading-relaxed mt-3">{renderPlain ? renderPlain(plain) : plain}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
