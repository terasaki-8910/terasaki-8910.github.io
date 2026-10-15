import { useLayoutEffect, useState } from 'react'
import { isStacked } from './transformArm.js'

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
