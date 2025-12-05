import { useState, useEffect } from 'react'

export default function SpotifyRecentTracks({ limit = 3 }) {
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchSpotifyData = async () => {
      try {
        const response = await fetch('/spotify-data.json')
        if (!response.ok) {
          throw new Error('Spotifyデータの取得に失敗しました')
        }
        const data = await response.json()
        setTracks(data.tracks?.slice(0, limit) || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchSpotifyData()
  }, [limit])

  if (loading) {
    return (
      <div className="flex gap-2">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="w-12 h-12 rounded-full bg-white/10 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-xl px-4 py-2 text-sm text-accent-cyan border border-accent-cyan/30">
        <span className="mr-2">🎵</span>
        Spotify Integration
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="glass rounded-xl px-4 py-2 text-sm text-accent-cyan border border-accent-cyan/30">
        <span className="mr-2">🎵</span>
        再生履歴がありません
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-center">
      {tracks.map((track, index) => (
        <a
          key={track.id}
          href={track.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative"
          title={`${track.name} - ${track.artist}`}
        >
          <div className="relative overflow-hidden rounded-lg">
            <img
              src={track.albumArt}
              alt={track.name}
              className="w-12 h-12 object-cover group-hover:scale-110 transition-transform duration-300"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect width="48" height="48" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="white" font-size="8"%3E🎵%3C/text%3E%3C/svg%3E'
              }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
          {index === 0 && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent-cyan rounded-full animate-pulse" />
          )}
        </a>
      ))}

      {/* 更新時間表示 */}
      <div className="text-xs text-gray-500 ml-2 hidden sm:block">
        {tracks.length}曲
      </div>
    </div>
  )
}