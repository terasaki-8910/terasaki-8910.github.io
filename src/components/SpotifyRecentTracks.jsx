import { useState, useEffect, useRef } from 'react'

export default function SpotifyRecentTracks({ limit = 30 }) {
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPlaying, setCurrentPlaying] = useState(null)
  const audioRef = useRef(null)

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

  const handlePlayPreview = (track) => {
    if (currentPlaying === track.id) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setCurrentPlaying(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    if (!track.previewUrl || track.previewUrl.trim() === '') {
      openInSpotify(track)
      return
    }

    try {
      const audio = new Audio(track.previewUrl)
      audio.volume = 0.7

      const playPromise = audio.play()

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            audioRef.current = audio
            setCurrentPlaying(track.id)

            audio.addEventListener('ended', () => {
              setCurrentPlaying(null)
              audioRef.current = null
            })
          })
          .catch(() => {
            attemptManualPlayback(track, audio)
          })
      } else {
        audio.addEventListener('ended', () => {
          setCurrentPlaying(null)
          audioRef.current = null
        })

        audioRef.current = audio
        setCurrentPlaying(track.id)
      }
    } catch (error) {
      openInSpotify(track)
    }
  }

  const attemptManualPlayback = (track, audio) => {
    const playPrompt = document.createElement('div')
    playPrompt.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(127, 190, 160, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      text-align: center;
      z-index: 1000;
      font-size: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `
    playPrompt.innerHTML = `
      <div style="margin-bottom: 15px;">
        「${track.name}」のプレビュー再生
      </div>
      <button id="manual-play-btn-${track.id}" style="
        background: white;
        color: #7FBEA0;
        border: none;
        padding: 8px 20px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        margin-right: 10px;
      ">再生する</button>
      <button id="skip-spotify-btn-${track.id}" style="
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 1px solid white;
        padding: 8px 20px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
      ">キャンセル</button>
    `

    document.body.appendChild(playPrompt)

    document.getElementById(`manual-play-btn-${track.id}`).addEventListener('click', () => {
      audio
        .play()
        .then(() => {
          audioRef.current = audio
          setCurrentPlaying(track.id)
          playPrompt.remove()

          audio.addEventListener('ended', () => {
            setCurrentPlaying(null)
            audioRef.current = null
          })
        })
        .catch(() => {
          playPrompt.remove()
          openInSpotify(track)
        })
    })

    document.getElementById(`skip-spotify-btn-${track.id}`).addEventListener('click', () => {
      playPrompt.remove()
      openInSpotify(track)
    })

    setTimeout(() => {
      if (playPrompt.parentNode) {
        playPrompt.remove()
      }
    }, 10000)
  }

  const openInSpotify = (track) => {
    setCurrentPlaying(null)
    audioRef.current = null
    window.open(track.spotifyUrl, '_blank')
  }

  const formatDuration = (ms) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  const formatPlayedAt = (playedAt) => {
    if (playedAt === 'たった今') return 'たった今'
    const hours = Math.floor((Date.now() - new Date(playedAt)) / (1000 * 60 * 60))
    return `${hours}時間前`
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(Math.min(limit, 5))].map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-line rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">Spotify Integration</div>
  }

  if (tracks.length === 0) {
    return <div className="text-sm text-muted border border-line rounded px-4 py-3">再生履歴がありません</div>
  }

  return (
    <div>
      <div className="border-t border-line">
        {tracks.map((track) => (
          <button
            type="button"
            key={track.id}
            onClick={() => handlePlayPreview(track)}
            title={`${track.name} - ${track.artist} ${track.previewUrl ? '(30秒プレビュー)' : '(Spotifyで開く)'}`}
            className="w-full flex items-center gap-4 py-3 border-b border-line text-left group"
          >
            <div className="relative w-14 h-14 shrink-0 rounded overflow-hidden">
              <img
                src={track.albumArt}
                alt={track.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src =
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect width="56" height="56" fill="%23E6E6E6"/%3E%3C/svg%3E'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                {currentPlaying === track.id ? (
                  <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-ink font-medium text-sm truncate group-hover:text-celeste transition-colors">
                {track.name}
              </h3>
              <p className="text-muted text-xs truncate mt-0.5">
                {track.artist} — {track.album}
              </p>
            </div>

            <div className="shrink-0 text-right text-xs text-muted">
              <div className="font-mono">{formatDuration(track.duration)}</div>
              <div className="mt-0.5">{formatPlayedAt(track.playedAt)}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="text-muted text-sm mt-4">全{tracks.length}曲</div>
    </div>
  )
}
