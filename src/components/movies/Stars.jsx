import './stars.css'

const STAR = 'M10 1.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z'

/** 評価(10段階)を星5つで出す。奇数は半分の星 */
export default function Stars({ rating }) {
  if (!rating) return null
  return (
    <span className="mv-stars" role="img" aria-label={`評価 ${rating}/10`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = rating - i * 2
        return (
          <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
            <path className="mv-stars__base" d={STAR} />
            {v >= 1 && <path className="mv-stars__on" d={STAR} style={v === 1 ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />}
          </svg>
        )
      })}
    </span>
  )
}
