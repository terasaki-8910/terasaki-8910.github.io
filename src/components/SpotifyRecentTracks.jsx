import { useState, useEffect, useRef } from 'react'

// 宇宙的アニメーションのためのスタイルタグ注入
if (typeof window !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes cosmicBreathing {
      0%, 100% {
        opacity: 0.2;
        transform: scale(0.98);
      }
      50% {
        opacity: 0.6;
        transform: scale(1.02);
      }
    }

    @keyframes stellarGlow {
      0%, 100% {
        background: radial-gradient(circle at 30% 30%,
          rgba(0, 240, 255, 0.15) 0%,
          rgba(112, 0, 255, 0.08) 30%,
          transparent 70%);
      }
      33% {
        background: radial-gradient(circle at 70% 30%,
          rgba(147, 51, 234, 0.12) 0%,
          rgba(59, 130, 246, 0.08) 30%,
          transparent 70%);
      }
      66% {
        background: radial-gradient(circle at 50% 70%,
          rgba(0, 255, 157, 0.1) 0%,
          rgba(112, 0, 255, 0.06) 30%,
          transparent 70%);
      }
    }

    @keyframes colorShiftCycle {
      0% {
        border-color: rgba(0, 240, 255, 0.2);
        box-shadow:
          inset 0 0 30px rgba(0, 240, 255, 0.08),
          0 0 40px rgba(0, 240, 255, 0.15),
          0 0 80px rgba(0, 240, 255, 0.05);
      }
      25% {
        border-color: rgba(112, 0, 255, 0.3);
        box-shadow:
          inset 0 0 30px rgba(112, 0, 255, 0.1),
          0 0 40px rgba(112, 0, 255, 0.2),
          0 0 80px rgba(112, 0, 255, 0.08);
      }
      50% {
        border-color: rgba(147, 51, 234, 0.3);
        box-shadow:
          inset 0 0 30px rgba(147, 51, 234, 0.1),
          0 0 40px rgba(147, 51, 234, 0.2),
          0 0 80px rgba(147, 51, 234, 0.08);
      }
      75% {
        border-color: rgba(59, 130, 246, 0.3);
        box-shadow:
          inset 0 0 30px rgba(59, 130, 246, 0.1),
          0 0 40px rgba(59, 130, 246, 0.2),
          0 0 80px rgba(59, 130, 246, 0.08);
      }
    }

    @keyframes stardustFlow {
      0% {
        background-position: -200% -200%;
        opacity: 0;
      }
      20% {
        opacity: 0.4;
      }
      50% {
        background-position: 200% 200%;
        opacity: 0.6;
      }
      80% {
        opacity: 0.4;
      }
      100% {
        background-position: 600% 600%;
        opacity: 0;
      }
    }

    @keyframes nebulaCloud {
      0%, 100% {
        background: radial-gradient(ellipse at center,
          rgba(0, 240, 255, 0.03) 0%,
          rgba(112, 0, 255, 0.02) 40%,
          transparent 70%);
        transform: rotate(0deg) scale(1);
      }
      50% {
        background: radial-gradient(ellipse at center,
          rgba(147, 51, 234, 0.05) 0%,
          rgba(59, 130, 246, 0.03) 40%,
          transparent 70%);
        transform: rotate(180deg) scale(1.1);
      }
    }

    .spotify-track-card {
      will-change: transform, opacity;
      transform-style: preserve-3d;
      transform-origin: center center;
      transition: all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
      backface-visibility: hidden;
    }

    .spotify-track-card:hover {
      background: linear-gradient(135deg,
        rgba(255,255,255,0.12),
        rgba(0,240,255,0.08),
        rgba(112,0,255,0.05)) !important;
      border-color: rgba(0, 240, 255, 0.6) !important;
      box-shadow:
        0 16px 64px rgba(0,0,0,0.5),
        0 0 0 3px rgba(0,240,255,0.4),
        inset 0 1px 0 rgba(255,255,255,0.3),
        inset 0 -1px 0 rgba(0,240,255,0.2) !important;
      transform: translateZ(20px) scale(1.02) !important;
    }

    /* 宇宙背景エフェクト */
    .spotify-track-card::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at center,
        rgba(0, 240, 255, 0.08) 0%,
        rgba(112, 0, 255, 0.04) 30%,
        transparent 70%);
      animation: stellarGlow 8s ease-in-out infinite;
      pointer-events: none;
      z-index: -2;
      border-radius: 20px;
    }

    /* 星屑の流れ */
    .spotify-track-card::before {
      content: '';
      position: absolute;
      top: -3px;
      left: -3px;
      right: -3px;
      bottom: -3px;
      background: linear-gradient(45deg,
        transparent 30%,
        rgba(0, 240, 255, 0.2) 45%,
        rgba(112, 0, 255, 0.15) 55%,
        transparent 70%);
      background-size: 300% 300%;
      border-radius: 14px;
      animation: stardustFlow 6s linear infinite;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
    }

    .spotify-track-card:hover::before {
      opacity: 0.8;
      animation-duration: 2s;
    }

    /* 惑星環効果 */
    .cosmic-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 120%;
      height: 120%;
      border: 1px solid rgba(0, 240, 255, 0.1);
      border-radius: 50%;
      transform: translate(-50%, -50%) rotateX(60deg);
      animation: cosmicBreathing 4s ease-in-out infinite;
      pointer-events: none;
      z-index: -1;
    }

    .spotify-track-card:hover .cosmic-ring {
      border-color: rgba(0, 240, 255, 0.3);
      animation-duration: 2s;
    }

    /* パフォーマンス最適化 */
    .spotify-track-card img {
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    /* スマホ向け最適化 */
    @media (max-width: 768px) {
      .spotify-track-card {
        will-change: opacity, transform;
      }

      .spotify-track-card::before,
      .spotify-track-card::after {
        display: none;
      }
    }
  `
  document.head.appendChild(style)
}


export default function SpotifyRecentTracks({ limit = 30 
  /** 最大表示件数**/
}) {
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

  // リアルタイムスクロール連動アニメーション
  useEffect(() => {
    if (!loading && tracks.length > 0 && gridRef.current) {
      const cards = gridRef.current.querySelectorAll('.spotify-track-card')
      const animationFrameRef = { current: null }

      // スクロール位置に基づいてカードスタイルを計算
      const updateCardStyles = () => {
        const viewportHeight = window.innerHeight
        const viewportCenter = viewportHeight / 2

        cards.forEach((card) => {
          const rect = card.getBoundingClientRect()
          const cardCenter = rect.top + rect.height / 2
          const distanceFromCenter = Math.abs(cardCenter - viewportCenter)
          const maxDistance = viewportHeight / 2

          // 中心からの相対距離 (0 = 中心, 1 = 端)
          const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1)

          // イージング適用 (ease-out cubic)
          const easedDistance = 1 - Math.pow(1 - normalizedDistance, 3)

          // 各プロパティを計算
          const opacity = 1.0 - (easedDistance * 0.6) // 中央:1.0 -> 端:0.4
          const scale = 1.0 - (easedDistance * 0.15)  // 中央:1.0 -> 端:0.85
          const rotationX = easedDistance * 6         // 中央:0deg -> 端:6deg
          const translateY = (cardCenter < viewportCenter ? 1 : -1) * easedDistance * 15

          // スタイルを適用
          card.style.opacity = opacity
          card.style.transform = `
            scale(${scale})
            translateY(${translateY}px)
            rotateX(${rotationX}deg)
            perspective(1000px)
          `
        })

        // 次のフレームを要求
        animationFrameRef.current = requestAnimationFrame(updateCardStyles)
      }

      // スクロールイベントリスナーを設定
      const handleScroll = () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        animationFrameRef.current = requestAnimationFrame(updateCardStyles)
      }

      // リサイズイベントリスナーを設定
      const handleResize = () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        updateCardStyles()
      }

      // 初期スタイルを設定
      updateCardStyles()

      // イベントリスナーを登録
      window.addEventListener('scroll', handleScroll, { passive: true })
      window.addEventListener('resize', handleResize, { passive: true })

      // クリーンアップ関数
      return () => {
        window.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleResize)
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }
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
            className="spotify-track-card glass p-4 rounded-xl cursor-pointer transform transition-all duration-500 hover:scale-105 hover:shadow-xl relative overflow-hidden group"
            title={`${track.name} - ${track.artist} ${track.previewUrl ? '(30秒プレビュー)' : '(Spotifyで開く)'}`}
            onClick={() => handlePlayPreview(track)}
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(0,240,255,0.03))',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,240,255,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,240,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
              position: 'relative',
              animation: 'colorShiftCycle 6s ease-in-out infinite'
            }}
          >
            {/* 惑星環エフェクト */}
            <div className="cosmic-ring" />

            {/* 宇宙的な発光エフェクト */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 50% 0%, rgba(0,240,255,0.1) 0%, transparent 70%)',
                animation: 'stellarGlow 8s ease-in-out infinite'
              }}
            />

            {/* 呼吸する境界線 */}
            <div
              className="absolute inset-0 pointer-events-none rounded-xl"
              style={{
                border: '1px solid rgba(112,0,255,0.3)',
                animation: 'colorShiftCycle 6s ease-in-out infinite',
                boxShadow: 'inset 0 0 20px rgba(0,240,255,0.1)'
              }}
            />

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