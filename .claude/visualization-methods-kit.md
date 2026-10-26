# /visualization-methods/ のシミュレーションを書くための手引き（部品の使い方の要約）

今のページ（`src/components/visualization/`）の部品をそのまま使う。ここに書いた使い方で足りるときは、元のファイルを読まなくてよい。
このページの部品は `src/components/visualization-methods/`、計算は `src/utils/vis/`。書き方：セミコロンなし・シングルクォート・2 スペース・日本語のコメント。

## 1 つのシミュレーションの形（段階も全体も同じ）

```jsx
import { useEffect, useRef, useState } from 'react'
import SimShell, { ViewStack } from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import SimLegend from '../../visualization/SimLegend'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { SimToolbar, PlayPauseButton, ResetButton, ToggleButton, ModeSwitch } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import useSimLoop from '../../visualization/useSimLoop'
import usePointerDrag from '../../visualization/usePointerDrag'
import { makeView, drawAxes, drawArrow } from '../../visualization/axes'
import { STEP_MARGIN, GRAB_SLOP_PX, clamp, fmt, arrowStep, laneColor, laneAlpha, markerCircle, drawText } from '../../visualization/sims/rigidKit'

export default function ShapeStep2() {
  const [t, setT] = useState(0.4)
  const draw = ({ ctx, width, height, colors }) => {
    const view = makeView({ width, height, xRange: [0, 4], yRange: [0, 3], margin: STEP_MARGIN })
    ctx.fillStyle = colors.surface
    ctx.fillRect(0, 0, width, height)
    drawAxes(ctx, view, { colors, xLabel: 'x', yLabel: 'y' })
    // view.sx(x)・view.sy(y) で世界 → 画面、view.wx(px)・view.wy(py) で画面 → 世界(世界は y が上向き)
  }
  const { canvasRef, redraw, sizeRef } = useCanvas({ draw })
  useEffect(() => { redraw() })
  usePointerDrag(canvasRef, {
    canGrab: (p) => /* p.x, p.y(CSS px)がつかめる物の上なら true */ false,
    onDown: (p) => { /* 当たらなければ return false */ },
    onMove: ({ x, y }) => { /* sizeRef.current の width・height で view を作り直して wx・wy */ },
    onUp: () => {},
  })
  return (
    <SimShell
      label="線形補間"
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={...} label="何が描いてあるか。ポインタと矢印キーでの動かし方" />}
      legend={<SimLegend items={[{ key: 'p', symbol: 'P(t)', label: '内分点', value: '(1.20, 0.80)', minChars: 12 }]} />}
      controls={<><SimToolbar><ResetButton onClick={reset} /></SimToolbar><ParamSlider symbol="t" label="内分の比" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => v.toFixed(2)} /></>}
    />
  )
}
```

- `SimShell({ label, aspect = 4/3, size, height, stage, controls, legend, readout, switcher })`：幅 1024px 以上の横長で絵が左・バーが右、それ以外は上下（CSS がする）。段階（StepSection の中）では高さが自動（PC 280〜360px、スマホ 220〜300px）なので、絵は width・height から描く。`switcher` は絵の上の見せ方の切り替え（`<ModeSwitch variant="tabs" ... />`）。`readout` は絵の下の数の表示
- `ViewStack({ active, views: { key: node }, reserve })`：見せ方ごとに違う操作の欄を同じ場所に重ねる
- `SimCanvas`：canvas に role="img" と aria-label。つかむ canvas は touch-action: none（自動）
- `useCanvas({ draw, maxDpr })` → `{ canvasRef, redraw, getColors, sizeRef }`。`draw({ ctx, width, height, dpr, colors })` は CSS px で描く（dpr 済み・clear 済み）。大きさは親の幅に自動で合わせる
- `colors`：`paper`・`surface`・`ink`・`muted`・`line`・`accent`・`onAccent`（CSS の色の文字列）、`rgb[name]`（`[r, g, b]`。name は paper・surface・ink・muted・line・accent・on-accent・lane-0〜lane-4・diff-insert・diff-delete）、`alpha(name, a)`（不透明度つきの色の文字列）、`dark`（ダークのテーマか）。画素を塗る絵（ImageData）は `rgb` を混ぜて作る
- `useSimLoop(onFrame(dt, t), { targetRef: canvasRef, autoStart = true })` → `{ running, active, play, pause, toggle, setRunning }`。画面外・タブの外・動きを減らす設定では止まる（動きを減らす設定では止まった状態で始まる）
- `usePointerDrag(canvasRef, { onDown, onMove({ x, y, dx, dy, vx, vy }), onUp, onHover, canGrab, cursorAt })`：canGrab を渡すと grab・grabbing の cursor が自動
- `makeView({ width, height, xRange, yRange, margin, equal = true })` → `{ sx, sy, wx, wy, scaleX, scaleY, frame: { left, top, right, bottom, width, height } }`。`drawAxes(ctx, view, { colors, xLabel, yLabel, minXGap, minYGap })`。`drawArrow(ctx, view, x0, y0, x1, y1, { color, width, head })`（世界の座標）
- `SimLegend({ items })`：`{ key, label, value, symbol（TeX）, minChars, swatch（CSS の背景。'var(--lane-1)' など） }`。毎フレーム変わる値は `ref.current.update({ key: '文字' })`
- `ParamSlider({ symbol, label, value, min, max, step, unit, format, onChange, disabled })`、`ControlGroup({ label })`、`SimToolbar`・`PlayPauseButton({ running, onToggle })`・`ResetButton({ onClick })`・`ToggleButton({ pressed, onChange })`・`ModeSwitch({ label, value, options: [{ value, label }], onChange, variant })`（variant：'tabs' は絵の上の主の切り替え、'quiet' は欄の中の選択肢）
- rigidKit：`STEP_MARGIN`、`GRAB_SLOP_PX`（12）、`clamp`、`laneColor(colors, n)`、`laneAlpha(colors, n, a)`、`fmt(v, d)`、`arrowStep(event)`（矢印キーなら `{ dx, dy }`、それ以外 null）、`markerCircle(ctx, px, py, r, { fill, stroke, lineWidth })`、`drawText(ctx, text, x, y, { color, size, align, baseline })`
- 3 次元の線の絵（行列 MVP と描く枠 rect）：`../../visualization/sims/transformMesh.js` の `projectPoint(MVP, p, rect)`・`drawLine3d`・`drawPolyline3d`・`drawArrow3d`・`drawDot3d`・`drawText3d`・`drawGround`・`drawAxes3d(ctx, MVP, rect, colors)`・`withClip`。カメラは `../../visualization/sims/transformCamera.js` の `orbitPose({ target, yaw, pitch, dist })`・`cameraMatrices(pose, { fov, aspect, near, far })` → `{ V, P, VP }`。行列は `src/utils/vis/mat4.js`、投影は `src/utils/vis/projection.js`

## 節のデータ（`sections/<id>.js`）

```js
import { lazy } from 'react'
const ShapeSim = lazy(() => import('../sims/shapeSim.jsx'))
export default {
  id: 'shape', tabLabel: '形状', title: '曲線と曲面', intro: '…',
  overview: { Sim: ShapeSim, caption: '何をつかめて、何が見えるかの一言' },
  steps: [{ id: 'lerp', title: '2 点を結ぶ（線形補間）', text: '2〜4 文、です・ます',
    formulas: [{ caption: '式の名前', tex: 'P(t) = (1 - t)\\,P_0 + t\\,P_1', symbols: [{ tex: 't', meaning: '内分の比（0〜1）', unit: '' }] }],
    snippets: ['curve-lerpPoint'], Sim: ShapeStep2 }],
  combination: { text: '…', flow: [{ steps: [2, 3], text: '…' }] },
  sources: [{ text: '…' }],
}
```

- TeX は KaTeX で組める形（JS の文字列なので `\` は `\\`）。単位も TeX（単位なしは ''）
- snippets は `src/utils/vis/<ファイル>.js` の `// @snippet <ファイル>-<関数>` の名前
- データの検査：`tests/vis-page/methodsSections.test.js`

## 確かめ

- `node --test "tests/vis/*.test.js" "tests/vis-page/*.test.js"`（落ちてよいのは transformRender.test.js の以前からの 5 件だけ）。Codex の sandbox では子プロセスが作れず node --test と vite が動かないので、テストは Claude が外で流す
- ビルドの確かめは `npx vite build --outDir dist --emptyOutDir`（`npm run build` は docs/ を書き換えるので使わない）
