export default function StarRating({ rating }) {
  if (!rating) return null
  return (
    <span className="font-mono text-sm text-accent tracking-tight" aria-label={`星${rating}`}>
      {'★'.repeat(rating)}
      <span className="text-line">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}
