import { useCallback, useRef } from 'react'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop, { prefersReducedMotion } from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { GRAB_SLOP_PX } from '../../visualization/sims/rigidKit'
import { SHEPP_LOGAN } from '../../../utils/vis/ct'
import {
  BEAM_MARGIN, DRAGGABLE, clampNumber, createPipeline, drawBeam, drawFrame, drawGrayImage, drawHatch, drawRing,
  nearestHandle, phantomValues, strokeHalo, worldView,
} from './ctKit'

// ホームのプロジェクト一覧に出す、節「CT の再構成と画像の前処理」の全体のシミュレーション(ctSim.jsx)の縮小版(2026-10-29)。
// 模型・サイノグラム・再構成の 3 つを横に並べる。計算と描き方は本体と同じ(ctKit.js)。目盛り・題・凡例・操作のバーは出さない。
// X 線の向きが 0° から 180° まで回ると(約 3 秒。本体の倍の速さ)自分で止まり、模型の小さな楕円をつかむと、全部の向きで作り直す。
// 動きが 5 秒より前に自然に終わるので、停止ボタンは置かない(剛体のプレビューと同じ考え方)。
const PARAMS = { nAngles: 90, nDet: 128, noise: 0, filter: 'shepp-logan', pre: 'none', post: 'none' }
const ANGLE_RATE = Math.PI / 3 // 60°/s
const N = 96 // 模型と再構成の画像の細かさ(絵は高々 150px ほどなので、本体の 128 より粗くする)
const N_FAST = 64 // 楕円をつかんでいる間
const MAX_CENTER = 0.9 // 楕円の中心を動かせる範囲(本体と同じ)
const PAD = 4
const GAP = 10

// 3 つの絵の置き場所。画像は正方形で、模型の枠だけ BEAM_MARGIN 倍(線源と検出器を描く余白)。全体を枠の真ん中に置く
function layoutOf(width, height) {
  const S = Math.max(24, Math.min((width - 2 * PAD - 2 * GAP) / (BEAM_MARGIN + 2), (height - 2 * PAD) / BEAM_MARGIN))
  const outer = BEAM_MARGIN * S
  const x0 = (width - (outer + 2 * S + 2 * GAP)) / 2
  const y0 = (height - outer) / 2
  const phantomOuter = { x: x0, y: y0, w: outer, h: outer }
  const phantomImage = { x: x0 + (outer - S) / 2, y: y0 + (outer - S) / 2, w: S, h: S }
  const sino = { x: x0 + outer + GAP, y: phantomImage.y, w: S, h: S }
  const recon = { x: sino.x + S + GAP, y: phantomImage.y, w: S, h: S }
  return { phantomOuter, phantomImage, sino, recon }
}

const ringRadius = (view) => clampNumber(view.scale * 0.09, 4, 7)

export default function CtPreview() {
  const stateRef = useRef(null)
  if (!stateRef.current) {
    stateRef.current = {
      ellipses: SHEPP_LOGAN.map((e) => e.slice()),
      // 動きを減らす設定では、回り終えた静止画を見せる
      theta: prefersReducedMotion() ? Math.PI : 0,
      grab: null,
      pipeline: createPipeline(),
    }
  }

  const draw = useCallback(({ ctx, width, height, colors }) => {
    const s = stateRef.current
    const { phantomOuter: outer, phantomImage: image, sino, recon } = layoutOf(width, height)
    const { nAngles, nDet } = PARAMS
    const upTo = clampNumber(Math.floor((s.theta / Math.PI) * nAngles) + 1, 1, nAngles)
    const n = s.grab ? N_FAST : N
    const result = s.pipeline({ ellipses: s.ellipses, ...PARAMS, upTo, n })

    // 模型(X 線源と検出器、平行な光線)。地は塗らず、ページの背景をそのまま見せる(剛体のプレビューと同じ)
    drawGrayImage(ctx, colors, phantomValues(s.ellipses, N), N, N, image)
    drawFrame(ctx, colors, image)
    const view = worldView(image)
    ctx.save()
    ctx.beginPath()
    ctx.rect(outer.x, outer.y, outer.w, outer.h)
    ctx.clip()
    drawBeam(ctx, colors, view, s.theta, { rayAlpha: 0.45 })
    ctx.restore()
    const r = ringRadius(view)
    for (const i of DRAGGABLE) {
      drawRing(ctx, colors, view.sx(s.ellipses[i][3]), view.sy(s.ellipses[i][4]), r, { selected: s.grab?.index === i })
    }

    // サイノグラム(いまの角度まで埋まる)
    drawGrayImage(ctx, colors, result.measured, nDet, nAngles, sino, { rows: upTo, crispRows: true })
    if (upTo < nAngles) {
      const y = sino.y + (sino.h * upTo) / nAngles
      drawHatch(ctx, colors, { x: sino.x, y, w: sino.w, h: sino.y + sino.h - y })
    }
    drawFrame(ctx, colors, sino)
    if (s.theta < Math.PI) {
      const lineY = sino.y + sino.h * (s.theta / Math.PI)
      strokeHalo(ctx, colors, [[sino.x, lineY], [sino.x + sino.w, lineY]], { color: colors.alpha('lane-1', 1), width: 1.5 })
    }

    // 再構成
    drawGrayImage(ctx, colors, result.recon, n, n, recon, { min: result.range[0], max: result.range[1] })
    drawFrame(ctx, colors, recon)
  }, [])
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const loop = useSimLoop(
    (dt) => {
      const s = stateRef.current
      s.theta = Math.min(Math.PI, s.theta + dt * ANGLE_RATE)
      redraw()
      if (s.theta >= Math.PI) loop.pause()
    },
    { targetRef: canvasRef },
  )

  // 楕円をつかむ(本体と同じ当たり判定)。つかんだら回すのをやめ、全部の向きの投影で作り直す
  const viewOf = () => {
    const { width, height } = sizeRef.current
    return worldView(layoutOf(width, height).phantomImage)
  }
  const hitOf = (p) => {
    const view = viewOf()
    const e = stateRef.current.ellipses
    const i = nearestHandle(view, DRAGGABLE.map((j) => [e[j][3], e[j][4]]), p, ringRadius(view) + GRAB_SLOP_PX)
    return i < 0 ? -1 : DRAGGABLE[i]
  }
  usePointerDrag(canvasRef, {
    canGrab: (p) => hitOf(p) >= 0,
    onDown: (p) => {
      const index = hitOf(p)
      if (index < 0) return false
      const s = stateRef.current
      const view = viewOf()
      s.grab = { index, dx: s.ellipses[index][3] - view.wx(p.x), dy: s.ellipses[index][4] - view.wy(p.y) }
      loop.pause()
      s.theta = Math.PI
      redraw()
      return true
    },
    onMove: ({ x, y }) => {
      const s = stateRef.current
      if (!s.grab) return
      const view = viewOf()
      let cx = view.wx(x) + s.grab.dx
      let cy = view.wy(y) + s.grab.dy
      const d = Math.hypot(cx, cy)
      if (d > MAX_CENTER) {
        cx *= MAX_CENTER / d
        cy *= MAX_CENTER / d
      }
      const { index } = s.grab
      s.ellipses = s.ellipses.map((e, i) => (i === index ? [e[0], e[1], e[2], cx, cy, e[5]] : e))
      redraw()
    },
    onUp: () => {
      stateRef.current.grab = null
      redraw()
    },
  })

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full touch-pan-y select-none"
      role="img"
      aria-label="模型・サイノグラム・再構成の 3 つの絵。X 線の向きが 180° 回るあいだに、撮った影から断面が作り直される。模型の小さな楕円はドラッグで動かせる"
    />
  )
}
