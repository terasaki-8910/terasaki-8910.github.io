import { useEffect, useRef } from 'react'

// canvas 上のドラッグ(マウス・タッチ・ペン共通)。touch-action: none は .vis-canvas の CSS が付ける。
//   usePointerDrag(canvasRef, {
//     onDown({ x, y, event }),            押したとき。false を返すと、そのドラッグは始めない(当たり判定に外れたとき)
//     onMove({ x, y, dx, dy, vx, vy, event }),  つかんでいる間。dx, dy は前回からの動き
//     onUp({ x, y, vx, vy, event }),      離したとき(取り消しも)。vx, vy は離す直前のポインタの速度
//     onHover({ x, y, event }),           つかんでいないときの移動(カーソルの形を変えるなど)
//     canGrab({ x, y }),                  座標がつかめる物の上なら true。渡すと canvas の cursor を自動で変える:
//                                         つかめる物の上 = grab、つかんでいる間 = grabbing、離したあと(マウス・ペンで、まだ上にいるとき)= grab、
//                                         それ以外 = 既定。cursor を自分で書かなくてよい。onDown がつかむ座標と同じ当たり判定にする
//   })
// 座標は canvas の左上を原点にした CSS ピクセル。速度は px/s で、直近の動きをならした値。
// 止めてからしばらくして離したときの速度は 0(投げない)。
// ハンドラは最新のものが呼ばれる(再描画のたびに登録し直さない)。

const VELOCITY_TAU = 0.06 // 速度をならす時定数(s)
const STALE_MS = 100 // これより長く動かさずに離したら速度 0

export default function usePointerDrag(canvasRef, handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let drag = null

    // cursor は、canGrab を渡したときだけ書き換える(渡さないときは何も触らない)
    const setCursor = (value) => {
      if (!handlersRef.current.canGrab) return
      if (canvas.style.cursor !== value) canvas.style.cursor = value
    }
    const cursorAt = (p) => (handlersRef.current.canGrab?.(p) ? 'grab' : '')

    const local = (event) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const onPointerDown = (event) => {
      if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return
      const p = local(event)
      if (handlersRef.current.onDown?.({ ...p, event }) === false) return
      drag = { id: event.pointerId, x: p.x, y: p.y, t: event.timeStamp, vx: 0, vy: 0 }
      canvas.setPointerCapture(event.pointerId)
      setCursor('grabbing')
      event.preventDefault()
    }

    const onPointerMove = (event) => {
      const p = local(event)
      if (!drag) {
        handlersRef.current.onHover?.({ ...p, event })
        setCursor(cursorAt(p))
        return
      }
      if (event.pointerId !== drag.id) return
      const dt = Math.max((event.timeStamp - drag.t) / 1000, 1e-3)
      const dx = p.x - drag.x
      const dy = p.y - drag.y
      const a = 1 - Math.exp(-dt / VELOCITY_TAU)
      drag.vx += a * (dx / dt - drag.vx)
      drag.vy += a * (dy / dt - drag.vy)
      drag.x = p.x
      drag.y = p.y
      drag.t = event.timeStamp
      handlersRef.current.onMove?.({ ...p, dx, dy, vx: drag.vx, vy: drag.vy, event })
    }

    const end = (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const p = local(event)
      const stale = event.timeStamp - drag.t > STALE_MS
      const { vx, vy } = stale ? { vx: 0, vy: 0 } : drag
      drag = null
      handlersRef.current.onUp?.({ ...p, vx, vy, event })
      setCursor(event.pointerType === 'touch' ? '' : cursorAt(p))
    }
    const onLeave = () => {
      if (!drag) setCursor('')
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('pointercancel', end)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', end)
      canvas.removeEventListener('pointercancel', end)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [canvasRef])
}
