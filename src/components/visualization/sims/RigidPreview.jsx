import { useCallback, useRef } from 'react'
import useCanvas from '../useCanvas'
import useSimLoop, { prefersReducedMotion } from '../useSimLoop'
import usePointerDrag from '../usePointerDrag'
import { makeView } from '../axes'
import { WORLD_W, WORLD_H, createRigidWorld, stepWorld, grabAt, moveGrab, releaseGrab } from './rigidWorld'
import { drawCircles } from './rigidDraw'

// ホームのプロジェクト一覧に出す、節「剛体と衝突」の全体のシミュレーション(RigidSim.jsx)の縮小版。
// 世界・円の描き方・つかみ方は本体と同じ(rigidWorld.js・rigidDraw.js)。軸・凡例・操作のバーは出さない。
// 円が落ちて積もると(約 2.5 秒)自分で止まり、円をつかむとまた動く。動きが自然に終わるので停止ボタンは置かない。
const PARAMS = { gravity: 9.8, e: 0.6, substeps: 8 }
const FIXED_DT = 1 / 60
const MAX_STEPS_PER_FRAME = 3
const GRAB_SLOP_PX = 10
const MARGIN = { left: 2, right: 2, top: 0, bottom: 2 }
const MIN_VIEW_H = 1 // 見せる高さの下限 [m](円が積もる高さは 0.6 m ほど)
// 箱の幅 4 m を窓の幅いっぱいに置き、高さは窓の縦横比で決める(横長の窓では箱の下の部分だけ見える)。
// 4 m × 3 m の箱を丸ごと入れると、横長の窓では小さな箱の上の 8 割が空になる。円は窓の上から落ちてくる
const viewOf = (width, height) => {
  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right)
  const plotH = Math.max(1, height - MARGIN.top - MARGIN.bottom)
  const top = Math.min(WORLD_H, Math.max(MIN_VIEW_H, (WORLD_W * plotH) / plotW))
  return makeView({ width, height, xRange: [0, WORLD_W], yRange: [0, top], margin: MARGIN })
}

export default function RigidPreview() {
  const worldRef = useRef(null)
  const clock = useRef({ acc: 0, t: 0, settled: 0 })
  if (!worldRef.current) {
    worldRef.current = createRigidWorld(24)
    // 動きを減らす設定では、最初から積もった静止画を見せる。
    if (prefersReducedMotion()) {
      for (let i = 0; i < 240; i++) stepWorld(worldRef.current, PARAMS, FIXED_DT)
      clock.current.t = 4
    }
  }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const view = viewOf(width, height)
    const { frame } = view
    // 地は塗らず、ページの背景をそのまま見せる(3D ASCII のプレビューと同じ)。箱は左右の壁と床だけ描く
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(frame.left, frame.top)
    ctx.lineTo(frame.left, frame.bottom)
    ctx.lineTo(frame.right, frame.bottom)
    ctx.lineTo(frame.right, frame.top)
    ctx.stroke()
    drawCircles(ctx, view, worldRef.current, colors)
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const c = clock.current
      const world = worldRef.current
      c.acc += dt
      let steps = 0
      while (c.acc >= FIXED_DT - 0.0015 && steps < MAX_STEPS_PER_FRAME) {
        stepWorld(world, PARAMS, FIXED_DT)
        c.acc -= FIXED_DT
        c.t += FIXED_DT
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) c.acc = 0 // 追いつけないぶんは捨てる
      redraw()

      let maxSpeed = 0
      for (let i = 0; i < world.n; i++) {
        const { v } = world.circles[i]
        maxSpeed = Math.max(maxSpeed, Math.hypot(v[0], v[1]))
      }
      // 小さな揺れが残っていても、0.5 秒落ち着いたら止める。画面外の時間は数えない。
      if (world.grab.index < 0 && c.t > 1 && maxSpeed < 0.25) {
        c.settled += steps * FIXED_DT
        if (c.settled >= 0.5) loop.pause()
      } else {
        c.settled = 0
      }
    },
    { targetRef: canvasRef },
  )

  const toWorld = (x, y) => {
    const { width, height } = sizeRef.current
    const view = viewOf(width, height)
    return { wx: view.wx(x), wy: view.wy(y), scale: view.scaleX }
  }
  const overCircle = ({ x, y }) => {
    const { wx, wy, scale } = toWorld(x, y)
    const world = worldRef.current
    for (let i = 0; i < world.n; i++) {
      const b = world.circles[i]
      const dx = wx - b.c[0]
      const dy = wy - b.c[1]
      const reach = b.r + GRAB_SLOP_PX / scale
      if (dx * dx + dy * dy <= reach * reach) return true
    }
    return false
  }

  usePointerDrag(canvasRef, {
    canGrab: overCircle,
    onDown: ({ x, y }) => {
      const { wx, wy, scale } = toWorld(x, y)
      if (!grabAt(worldRef.current, wx, wy, GRAB_SLOP_PX / scale)) return false
      clock.current.settled = 0
      if (!loop.running) loop.play()
    },
    onMove: ({ x, y }) => {
      const { wx, wy } = toWorld(x, y)
      moveGrab(worldRef.current, wx, wy)
    },
    onUp: ({ vx, vy }) => {
      const { scale } = toWorld(0, 0)
      releaseGrab(worldRef.current, vx / scale, -vy / scale) // 画面は下向きが正なので y を反転する
    },
  })

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full touch-pan-y select-none"
      role="img"
      aria-label="箱の中に円が落ちて積もる、剛体と衝突のシミュレーション。円はドラッグでつかんで投げられる"
    />
  )
}
