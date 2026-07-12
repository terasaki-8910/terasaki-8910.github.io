import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createAsciiCanvasRenderer, pickQuantizedLevels } from '../utils/asciiCanvasRenderer'
import { buildDensitySortedCharset, NAME_CHARACTERS } from '../utils/asciiCharset'

const DARK_COLOR = '#B2FFFF'
const LIGHT_COLOR = '#000000'

// テーマ連動の文字色。#B2FFFFはライト背景(#F1F1F1)だとコントラスト比
// 約1.08:1でほぼ見えないため、ライトモードのときだけ純黒にする。
function getEffectiveTheme() {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function AsciiModelViewer({ modelUrl, name, credit, href, id }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let disposed = false
    let frameId
    let webglRenderer
    let modelGroup

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
    keyLight.position.set(3, 5, 4)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6)
    rimLight.position.set(-4, -1, -3)
    scene.add(rimLight)

    const loader = new GLTFLoader()
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return

        modelGroup = new THREE.Group()
        const model = gltf.scene

        // ASCII化にはシルエットと陰影だけが必要なため、元テクスチャ/色は
        // 使わずフラットな白マテリアルに差し替える(ノイズを消しブライトネス
        // 信号をきれいにする)
        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshLambertMaterial({ color: 0xffffff })
          }
        })

        // バウンディングボックスから中心・スケールを正規化。GLTFが
        // 差し替わっても同じ画角に自動で収まる
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        box.getSize(size)

        const maxDim = Math.max(size.x, size.y, size.z) || 1
        model.scale.setScalar(2 / maxDim)

        // 中心を原点に合わせる位置補正は、スケール適用後のボックスで
        // 再計算する必要がある。Object3Dはローカル頂点にscaleを掛けた後で
        // positionを加算するため、「スケール前のcenterをそのままpositionへ
        // 渡す」と補正量にscale倍率が反映されず、center*(1-scale)分だけ
        // 中心が原点からずれる(自転車では下端がほぼクリッピング・上に
        // 大きな余白という非対称なフレーミングとして現れていた)。
        const scaledBox = new THREE.Box3().setFromObject(model)
        const scaledCenter = new THREE.Vector3()
        scaledBox.getCenter(scaledCenter)
        model.position.sub(scaledCenter)

        modelGroup.add(model)
        scene.add(modelGroup)

        // 正規化後のバウンディングボックス。自転車のような平べったい形状だと
        // 単純な外接球でフィッティングすると縦方向にスカスカな余白ができる
        // (球は縦横奥行き全部を均等に見込むため)。Y軸回転しかしないことを
        // 利用し、縦方向は実際の高さの半分、横方向は回転中に取りうる
        // 最大の見かけ幅(X-Z平面の対角半径)だけを使ってタイトに収める。
        const fitBox = new THREE.Box3().setFromObject(modelGroup)
        const fitSize = new THREE.Vector3()
        fitBox.getSize(fitSize)
        const verticalHalf = fitSize.y / 2
        const horizontalRadius = Math.sqrt((fitSize.x / 2) ** 2 + (fitSize.z / 2) ** 2)

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const rotationSpeed = reduceMotion ? 0 : 0.006

        const charSet = buildDensitySortedCharset(NAME_CHARACTERS, 'sans-serif')
        const levelChars = pickQuantizedLevels(charSet, 6)

        webglRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true })
        webglRenderer.setClearColor(0x000000, 0)

        const themeRef = { current: getEffectiveTheme() }
        const themeObserver = new MutationObserver(() => {
          themeRef.current = getEffectiveTheme()
        })
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

        const asciiRenderer = createAsciiCanvasRenderer({
          webglRenderer,
          canvas,
          targetCellSize: 6,
          getColor: () => (themeRef.current === 'dark' ? DARK_COLOR : LIGHT_COLOR),
          levelChars,
        })

        // 縦・横それぞれの半値角(tan)から必要な距離を計算し、大きい方
        // (＝厳しい方の制約)を採用する。これで枠の縦横比が何であっても、
        // 上下か左右のどちらかがぴったり埋まる(無駄な余白なし)。
        //
        // カメラのYを持ち上げて見下ろす角度を付けていたが、その傾きが
        // tanベースの計算(カメラが正面から見る前提)の対称性を崩し、
        // 実測で上216px・下2px(1280x520の枠)という激しい非対称と
        // 下端のほぼクリッピングを引き起こしていた。正面からの水平視点に
        // 戻し、対称なマージンにする。
        const frameCamera = () => {
          const fovV = THREE.MathUtils.degToRad(camera.fov)
          const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect)
          const distV = verticalHalf / Math.tan(fovV / 2)
          const distH = horizontalRadius / Math.tan(fovH / 2)
          const distance = Math.max(distV, distH) * 1.25
          camera.position.set(0, 0, distance)
          camera.lookAt(0, 0, 0)
        }

        const resize = () => {
          const w = container.clientWidth
          const h = container.clientHeight
          asciiRenderer.setSize(w, h)
          // 生のwidth/heightではなく、実際にサンプリングしているcols/rowsの
          // 比率をカメラのaspectに使う(丸め誤差によるズレ・見切れ防止)
          camera.aspect = asciiRenderer.getAspect()
          camera.updateProjectionMatrix()
          frameCamera()
        }
        resize()
        window.addEventListener('resize', resize)

        const animate = () => {
          modelGroup.rotation.y += rotationSpeed
          asciiRenderer.render(scene, camera)
          frameId = requestAnimationFrame(animate)
        }
        animate()

        containerRef.current._cleanup = () => {
          window.removeEventListener('resize', resize)
          themeObserver.disconnect()
        }
      },
      undefined,
      () => {
        if (!disposed) setFailed(true)
      }
    )

    return () => {
      disposed = true
      if (frameId) cancelAnimationFrame(frameId)
      if (containerRef.current?._cleanup) containerRef.current._cleanup()
      if (webglRenderer) webglRenderer.dispose()
    }
  }, [modelUrl])

  if (failed) return null

  return (
    <div id={id} className="scroll-mt-24">
      {href ? (
        <a href={href} className="block text-2xl font-display text-ink hover:text-celeste transition-colors mb-3">
          {name}
        </a>
      ) : (
        <h3 className="text-2xl font-display text-ink mb-3">{name}</h3>
      )}
      {/* このdivの高さ(h-[420px] md:h-[520px])が枠のサイズ。変更したい場合はここを編集する */}
      <div ref={containerRef} className="w-full h-[420px] md:h-[520px]">
        <canvas ref={canvasRef} className="block" />
      </div>
      {credit && (
        <p className="text-xs font-mono text-muted mt-2">
          {credit.title} by {credit.author} ({credit.license}) —{' '}
          <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-celeste">
            source
          </a>
        </p>
      )}
    </div>
  )
}
