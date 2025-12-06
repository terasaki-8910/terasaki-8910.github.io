import { useState, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

export default function SpotifyRecentTracks({ limit = 6 }) {
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPlaying, setCurrentPlaying] = useState(null)
  const audioRef = useRef(null)
  const gridRef = useRef(null)

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

  // GSAP ScrollTriggerアニメーション設定
  useEffect(() => {
    if (!loading && tracks.length > 0 && gridRef.current) {
      // すべてのトラックカードを取得
      const cards = gridRef.current.querySelectorAll('.spotify-track-card')

      cards.forEach((card, index) => {
        // 初期状態設定
        gsap.set(card, {
          opacity: 0.3,
          y: 50
        })

        // ScrollTrigger設定
        gsap.to(card, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            start: "top 80%",
            end: "bottom 20%",
            toggleActions: "play"
          }
        })
      })

      // 一番下のカードが表示されたらRefreshTriggerを更新
      ScrollTrigger.refresh()
    }
  }, [loading, tracks.length])

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="h-24 bg-white/10 rounded-lg animate-pulse" />
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
    <div className="spotify-recent-tracks-container">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" ref={gridRef}>
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="spotify-track-card glass p-4 rounded-xl cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            title={`${track.name} - ${track.artist} ${track.previewUrl ? '(30秒プレビュー)' : '(Spotifyで開く)'}`}
            onClick={() => handlePlayPreview(track)}
          >
            <div className="relative">
              {/* アルバムアート */}
              <div className="relative w-full h-40 rounded-lg overflow-hidden mb-3">
                <img
                  src={track.albumArt}
                  alt={track.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160"%3E%3Crect width="160" height="160" fill="%23333"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="white" font-size="14"%3E🎵%3C/text%3E%3C/svg%3E'
                  }}
                />

                {/* アルバム画像の上に表示する再生ボタン */}
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  {currentPlaying === track.id ? (
                    // 停止ボタン
                    <svg
                      className="w-6 h-6 text-white opacity-90 transition-opacity duration-300 drop-shadow-lg"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    // 再生ボタン
                    <svg
                      className="w-6 h-6 text-white opacity-0 group-hover:opacity-90 transition-opacity duration-300 drop-shadow-lg"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* トラック情報 */}
              <div className="space-y-2">
                <h3 className="text-white font-semibold text-sm truncate group-hover:text-accent-cyan transition-colors">
                  {track.name}
                </h3>
                <p className="text-gray-400 text-xs truncate">
                  {track.artist}
                </p>
                <p className="text-gray-500 text-xs">
                  {track.album}
                </p>
              </div>

              {/* トラック詳細 */}
              <div className="flex justify-between items-center pt-3 border-t border-gray-600/30">
                <span className="text-gray-400 text-xs">
                  {Math.floor(track.duration / 60000)}:{String(Math.floor((track.duration % 60000) / 1000)).padStart(2, '0')}
                </span>
                <span className="text-accent-cyan text-xs">
                  {track.playedAt === 'たった今' ? 'たった今' : `${Math.floor((Date.now() - new Date(track.playedAt)) / (1000 * 60 * 60))}時間前`}
                </span>
              </div>

              {/* 再生中インジケーター */}
              {currentPlaying === track.id && (
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 更新時間表示 */}
      <div className="text-center text-gray-500 text-sm mt-6">
        全{tracks.length}曲
      </div>
    </div>
  )
}