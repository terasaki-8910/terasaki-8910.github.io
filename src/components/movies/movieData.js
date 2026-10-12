// 作品データの読み方。/movies/(MovieShelf.jsx)とトップのプレビュー(HomeMoviesPreview.jsx)で同じものを使う。
export const IMG = 'https://image.tmdb.org/t/p/'

export const titleOf = (m) => m.details?.title || m.traktTitle
export const originalOf = (m) => m.details?.originalTitle || m.traktTitle
export const kindLabel = (m) => ({ movie: '映画', anime: 'アニメ', drama: 'ドラマ' })[m.kind] || ''

export function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 並べ替え。視聴順は、観た日が入っているものを新しい順に、残りは Trakt に記録した順(新しい順) */
export function sortItems(items, sort) {
  const list = [...items]
  const byReleased = (a, b) => (a.released ?? '9999').localeCompare(b.released ?? '9999')
  if (sort === 'rating') return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byReleased(b, a))
  if (sort === 'watched') {
    return list.sort((a, b) => {
      if (a.lastWatchedAt && b.lastWatchedAt) return b.lastWatchedAt.localeCompare(a.lastWatchedAt)
      if (a.lastWatchedAt) return -1
      if (b.lastWatchedAt) return 1
      return (b.recordedOrder ?? 0) - (a.recordedOrder ?? 0)
    })
  }
  if (sort === 'added') return list.sort((a, b) => (b.listedAt ?? '').localeCompare(a.listedAt ?? ''))
  // 時系列順は新しい順(最初に新しい作品を見せる。R11-2)
  return list.sort((a, b) => byReleased(b, a))
}
