import { useState, useEffect, useRef } from 'react'

export default function SpotifyRecentTracks({ limit = 3 }) {
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
      // 同じ曲なら停止
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setCurrentPlaying(null)
      return
    }

    // 現在再生中の曲があれば停止
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    // プレビューURLの検証
    if (!track.previewUrl || track.previewUrl.trim() === '') {
      openInSpotify(track)
      return
    }

    try {
      // シンプルなAudioオブジェクト作成
      const audio = new Audio(track.previewUrl)
      audio.volume = 0.7

      // 再生試行
      const playPromise = audio.play()

      if (playPromise !== undefined) {
        // 現代ブラウザの場合
        playPromise.then(() => {
          audioRef.current = audio
          setCurrentPlaying(track.id)
          console.log('✅ プレビュー再生開始:', track.name)

          // 再生終了時の処理
          audio.addEventListener('ended', () => {
            setCurrentPlaying(null)
            audioRef.current = null
            console.log('✅ プレビュー再生完了:', track.name)
          })
        }).catch(() => {
          console.log('ℹ️ 自動再生ブロック、手動再生を試みます:', track.name)
          // ユーザーインタラクションを待機して再生
          attemptManualPlayback(track, audio)
        })
      } else {
        // レガシーブラウザの場合
        audio.addEventListener('ended', () => {
          setCurrentPlaying(null)
          audioRef.current = null
          console.log('✅ プレビュー再生完了:', track.name)
        })

        audioRef.current = audio
        setCurrentPlaying(track.id)
        console.log('✅ プレビュー再生開始:', track.name)
      }

    } catch (error) {
      console.warn('⚠️ プレビュー再生エラー、Spotifyで開きます:', error)
      openInSpotify(track)
    }
  }

  const attemptManualPlayback = (track, audio) => {
    // ユーザーインタラクション用のUI表示
    const playPrompt = document.createElement('div')
    playPrompt.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(6, 182, 212, 0.95);
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
        🎵 「${track.name}」のプレビュー再生
      </div>
      <button id="manual-play-btn-${track.id}" style="
        background: white;
        color: #06b6d4;
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

    // イベントリスナー
    document.getElementById(`manual-play-btn-${track.id}`).addEventListener('click', () => {
      try {
        audio.play().then(() => {
          audioRef.current = audio
          setCurrentPlaying(track.id)
          playPrompt.remove()
          console.log('✅ 手動でプレビュー再生開始:', track.name)

          audio.addEventListener('ended', () => {
            setCurrentPlaying(null)
            audioRef.current = null
            console.log('✅ プレビュー再生完了:', track.name)
          })
        }).catch(error => {
          console.warn('⚠️ 手動再生も失敗、Spotifyで開きます:', error)
          playPrompt.remove()
          openInSpotify(track)
        })
      } catch (error) {
        console.warn('⚠️ 手動再生エラー、Spotifyで開きます:', error)
        playPrompt.remove()
        openInSpotify(track)
      }
    })

    document.getElementById(`skip-spotify-btn-${track.id}`).addEventListener('click', () => {
      playPrompt.remove()
      openInSpotify(track)
    })

    // 10秒後に自動でキャンセル
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
        <div
          key={track.id}
          className="group relative cursor-pointer"
          title={`${track.name} - ${track.artist} ${track.previewUrl ? '(30秒プレビュー)' : '(Spotifyで開く)'}`}
          onClick={() => handlePlayPreview(track)}
        >
          <div className="relative overflow-hidden rounded-lg">
            {/* アルバムアート */}
            <img
              src={track.albumArt}
              alt={track.name}
              className="w-12 h-12 object-cover group-hover:scale-110 transition-transform duration-300 rounded-lg relative z-10"
              style={{ mixBlendMode: 'normal' }}
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect width="48" height="48" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="white" font-size="8"%3E🎵%3C/text%3E%3C/svg%3E'
              }}
            />

            {/* hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center z-20">
              {currentPlaying === track.id ? (
                // 停止ボタン
                <svg
                  className="w-4 h-4 text-white opacity-100 transition-opacity duration-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                // 再生ボタン
                <svg
                  className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              )}
            </div>
          </div>
          {index === 0 && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent-cyan rounded-full animate-pulse" />
          )}
          {/* 再生中インジケーター */}
          {currentPlaying === track.id && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
      ))}

      {/* 更新時間表示 */}
      <div className="text-xs text-gray-500 ml-2 hidden sm:block">
        {tracks.length}曲
      </div>
    </div>
  )
}