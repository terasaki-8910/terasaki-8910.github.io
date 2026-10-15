import { useLayoutEffect, useRef, useState } from 'react'
import usePointerDrag from '../usePointerDrag'
import { isStacked } from './transformArm.js'
import { pickHandle } from './transformHandles.js'

// canvas を 2 つの枠に分けるシミュレーションで、上下に並べるか(枠の幅が狭いか)を返す。
// 幅は canvas の親(SimShell の絵の枠)を ResizeObserver で見る。並べ方で変わるのは高さだけで、幅は変わらない。
// 最初の描画では window の幅から推す(測ってから切り替えるまでの 1 フレームのちらつきを減らす)。
export function useStacked(canvasRef) {
  const [stacked, setStacked] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useLayoutEffect(() => {
    const parent = canvasRef.current?.parentElement
    if (!parent) return undefined
    const update = () => setStacked(isStacked(parent.clientWidth))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [canvasRef])
  return stacked
}

// 矢印キーの動き: [dx, dy](上が +y)。Shift で大きく。矢印キーでなければ null
export function arrowDelta(event, small, big) {
  const step = event.shiftKey ? big : small
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  return moves[event.key] ?? null
}

// つかめる物(取っ手)のドラッグ。取っ手の上でカーソルが grab、つかんでいる間は grabbing になる(usePointerDrag の canGrab)。
//   useHandleDrag(canvasRef, {
//     getHandles(): [{ id, x, y, r? }]   いまの取っ手の画面の位置(前の方が優先)。当たり判定はこれだけ
//     onDrag(id, { x, y }, phase)        phase: 'down'(つかんだ)| 'move'
//     onEnd(id)                          離したとき
//   })
// つかんだら canvas にフォーカスを移し、あとは矢印キーでも動かせるようにする(キーの処理は各シミュレーションで書く)。
export function useHandleDrag(canvasRef, { getHandles, onDrag, onEnd }) {
  const drag = useRef(null)
  usePointerDrag(canvasRef, {
    canGrab: ({ x, y }) => pickHandle(getHandles(), x, y) !== null,
    onDown: ({ x, y }) => {
      const h = pickHandle(getHandles(), x, y)
      if (!h) return false
      drag.current = h.id
      canvasRef.current?.focus({ preventScroll: true })
      onDrag(h.id, { x, y }, 'down')
      return undefined
    },
    onMove: ({ x, y }) => {
      if (drag.current !== null) onDrag(drag.current, { x, y }, 'move')
    },
    onUp: () => {
      const id = drag.current
      drag.current = null
      onEnd?.(id)
    },
  })
}
