import { useRef } from 'react'
import usePointerDrag from '../usePointerDrag'
import { BROAD_H, BROAD_W } from './rigidMath'
import { GRAB_SLOP_PX, clamp } from './rigidKit'

// 世界の円(中心 c、半径 r)をつかんで動かす。段階 3・4・5・6 で使う。
//   const drag = useCircleDrag(canvasRef, {
//     getView,            () => makeView の結果(いまの canvas の大きさで)
//     getCircles,         () => [{ c, r }]。つかめる円(重なっているときは、中心にいちばん近い円)
//     onGrab(i),          i 番目の円をつかんだ(省略できる)
//     onMove(i, [x, y]),  つかんでいる円の、新しい中心(世界の座標。箱の中に収めてある)
//     onRelease(i),       離した(省略できる)
//   })
//   drag.current?.index   いまつかんでいる円の番号(つかんでいなければ undefined)
// 円の外側 GRAB_SLOP_PX までつかめる(指で触れやすいように)。つかむ位置は保つ(円の中心にはジャンプしない)。
// つかめる円の上では cursor が grab、つかんでいる間は grabbing(usePointerDrag の canGrab)。
export function useCircleDrag(canvasRef, { getView, getCircles, onGrab, onMove, onRelease, bounds = [0, BROAD_W, 0, BROAD_H] }) {
  const drag = useRef(null)

  const pick = ({ x, y }) => {
    const view = getView()
    const wx = view.wx(x)
    const wy = view.wy(y)
    const slop = GRAB_SLOP_PX / view.scaleX
    let best = -1
    let bestGap = Infinity
    getCircles().forEach((b, i) => {
      const gap = Math.hypot(wx - b.c[0], wy - b.c[1]) - b.r
      if (gap <= slop && gap < bestGap) {
        best = i
        bestGap = gap
      }
    })
    return best
  }

  usePointerDrag(canvasRef, {
    canGrab: (p) => pick(p) >= 0,
    onDown: (p) => {
      const index = pick(p)
      if (index < 0) return false
      const view = getView()
      const c = getCircles()[index].c
      drag.current = { index, ox: view.wx(p.x) - c[0], oy: view.wy(p.y) - c[1] }
      onGrab?.(index)
    },
    onMove: ({ x, y }) => {
      const d = drag.current
      if (!d) return
      const view = getView()
      onMove(d.index, [
        clamp(view.wx(x) - d.ox, bounds[0], bounds[1]),
        clamp(view.wy(y) - d.oy, bounds[2], bounds[3]),
      ])
    },
    onUp: () => {
      const index = drag.current?.index
      drag.current = null
      onRelease?.(index)
    },
  })
  return drag
}
