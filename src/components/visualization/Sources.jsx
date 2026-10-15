// 出典(元の論文・教科書。確かなものだけ)。sources: [{ text, href? }]
export default function Sources({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="vis-sources">
      <h3 className="vis-sources__title">出典</h3>
      <ul>
        {sources.map((s) => (
          <li key={s.text}>
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a>
            ) : (
              s.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
