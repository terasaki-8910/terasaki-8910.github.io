import { useCallback } from 'react'
import useCanvas from '../useCanvas'
import usePointerDrag from '../usePointerDrag'
import { moveParticle, nearestParticle } from './fluidPatch.js'

// 段階 2〜5 の小さなシミュレーションの、canvas・ポインタ・キーボードのつなぎ(粒子の patch をつかんで動かす)。
//   const { canvasRef, redraw, sizeRef, onKeyDown } = useParticleBoard({ patchRef, viewOf, draw, onMoved, announce })
//   patchRef   fluidPatch.js の patch を持つ ref
//   viewOf     (width, height) => makeView(…)  粒子を描く領域の view(画面 ↔ 世界)
//   draw       useCanvas の draw
//   onMoved    粒子を動かしたあとに呼ぶ(止まっているときは settle して描き直す、など)
//   announce   (文字) => void  キーボードで動かしたときの読み上げ
// つかむ: 粒子の近く(grabPx 以内)で押すと、その粒子を調べる粒子にして、ポインタについてくる(押した位置と粒子の中心のずれは保つ)。
// 矢印キーで調べる粒子を動かす(Shift で大きく)。PageUp・PageDown で調べる粒子を変える。
export default function useParticleBoard({ patchRef, viewOf, draw, onMoved, announce, grabPx = 18, keyStep = 0.004 }) {
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })

  const toWorld = useCallback(
    (x, y) => {
      const { width, height } = sizeRef.current
      const view = viewOf(width, height)
      return { wx: view.wx(x), wy: view.wy(y), scale: view.scaleX }
    },
    [sizeRef, viewOf],
  )

  const findAt = (x, y) => {
    const { wx, wy, scale } = toWorld(x, y)
    return nearestParticle(patchRef.current, wx, wy, grabPx / scale)
  }

  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => findAt(x, y) >= 0,
    onDown: ({ x, y }) => {
      const patch = patchRef.current
      const i = findAt(x, y)
      if (i < 0) return false
      const { wx, wy } = toWorld(x, y)
      patch.selected = i
      patch.grab = { index: i, x: patch.state.pos[2 * i], y: patch.state.pos[2 * i + 1], dx: patch.state.pos[2 * i] - wx, dy: patch.state.pos[2 * i + 1] - wy }
      onMoved()
    },
    onMove: ({ x, y, vx, vy }) => {
      const patch = patchRef.current
      const g = patch.grab
      if (!g) return
      const { wx, wy, scale } = toWorld(x, y)
      g.x = Math.min(patch.width, Math.max(0, wx + g.dx))
      g.y = Math.min(patch.height, Math.max(0, wy + g.dy))
      g.vx = vx / scale // 手の速度 [m/s](画面は下向きが正なので y は反転)
      g.vy = -vy / scale
      g.t = Date.now()
      moveParticle(patch, g.index, g.x, g.y)
      onMoved()
    },
    onUp: () => {
      patchRef.current.grab = null
      onMoved()
    },
  })

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const patch = patchRef.current
    const i = patch.selected
    const k = event.shiftKey ? 4 * keyStep : keyStep
    const moves = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }
    const move = moves[event.key]
    if (move) {
      const { pos } = patch.state
      moveParticle(patch, i, pos[2 * i] + move[0], pos[2 * i + 1] + move[1])
      // つかんでいるときと同じに、動いているあいだも位置に留める
      patch.grab = null
      announce?.(`粒子 ${i + 1}：x = ${pos[2 * i].toFixed(3)} m，y = ${pos[2 * i + 1].toFixed(3)} m`)
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      patch.selected = (i + (event.key === 'PageDown' ? 1 : -1) + patch.n) % patch.n
      announce?.(`粒子 ${patch.selected + 1} を選んだ`)
    } else {
      return
    }
    event.preventDefault()
    onMoved()
  }

  return { canvasRef, redraw, sizeRef, onKeyDown }
}
