import { forwardRef } from 'react'

// シミュレーションの canvas。role="img" と aria-label(何が描かれているか)を必ず付ける。
// 触れて操作する canvas は touch-action: none(.vis-canvas)で、ページのスクロールを奪う。
// 触れて操作しない canvas には scroll を付けると、指でスクロールできる(touch-action: pan-y)。
//   <SimCanvas ref={canvasRef} label="立方体のワイヤーフレーム" />
const SimCanvas = forwardRef(function SimCanvas({ label, scroll = false, className = '', ...rest }, ref) {
  return (
    <canvas
      ref={ref}
      className={`vis-canvas ${scroll ? 'vis-canvas--scroll' : ''} ${className}`}
      role="img"
      aria-label={label}
      {...rest}
    />
  )
})

export default SimCanvas
