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
import { arrowStep, clamp, fmt, markerCircle } from '../../visualization/sims/rigidKit'
import { drawAxes3d } from '../../visualization/sims/transformMesh'
import { cameraViewProjection, projectVertex, renderScene } from '../../../utils/vis/render'
import { makeShadingScene } from './shadingKit'

const CAMERA = { eye: [0, 2.2, 5.5], target: [0, 0.9, 0], up: [0, 1, 0], fov: 40 * Math.PI / 180 }
const RADIUS = 4.7
const INITIAL = { azimuth: 51, elevation: 51, segments: 24, shadowSize: 512, shininess: 32, roughness: 0.3 }
const MODEL_OPTIONS = [
  { value: 'lambert', label: 'ランバート' },
  { value: 'phong', label: 'フォン' },
  { value: 'blinn-phong', label: 'ブリン-フォン' },
  { value: 'cook-torrance', label: 'クック-トランス' },
]

const lightPosition = (azimuth, elevation) => {
  const az = azimuth * Math.PI / 180
  const el = elevation * Math.PI / 180
  return [RADIUS * Math.cos(el) * Math.sin(az), RADIUS * Math.sin(el), RADIUS * Math.cos(el) * Math.cos(az)]
}

export default function ShadingSim() {
  const [azimuth, setAzimuth] = useState(INITIAL.azimuth)
  const [elevation, setElevation] = useState(INITIAL.elevation)
  const [segments, setSegments] = useState(INITIAL.segments)
  const [shadowSize, setShadowSize] = useState(INITIAL.shadowSize)
  const [shininess, setShininess] = useState(INITIAL.shininess)
  const [roughness, setRoughness] = useState(INITIAL.roughness)
  const [model, setModel] = useState('blinn-phong')
  const [shading, setShading] = useState('phong')
  const [material, setMaterial] = useState('paint')
  const [shadows, setShadows] = useState(true)
  const dragging = useRef(false)
  const offscreen = useRef(null)
  const legendRef = useRef(null)
  const light = lightPosition(azimuth, elevation)

  const draw = ({ ctx, width, height, colors }) => {
    const scale = dragging.current ? 0.5 : 1
    const renderWidth = Math.max(2, Math.round(Math.min(640, width) * scale))
    const renderHeight = Math.max(2, Math.round(renderWidth * height / Math.max(width, 1)))
    if (!offscreen.current) offscreen.current = document.createElement('canvas')
    const bufferCanvas = offscreen.current
    bufferCanvas.width = renderWidth
    bufferCanvas.height = renderHeight
    const bufferCtx = bufferCanvas.getContext('2d')
    const pixels = new Uint8ClampedArray(renderWidth * renderHeight * 4)
    const scene = makeShadingScene(colors, { segments, light, material, shininess, roughness })
    const result = renderScene(scene, CAMERA, {
      width: renderWidth,
      height: renderHeight,
      model,
      shading,
      shadows,
      shadowSize,
      shadowTarget: [0, 0.7, 0],
    }, pixels)
    bufferCtx.putImageData(new ImageData(pixels, renderWidth, renderHeight), 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(bufferCanvas, 0, 0, width, height)

    const VP = cameraViewProjection(CAMERA, width / height)
    const axesSize = Math.min(82, height * 0.27)
    drawAxes3d(ctx, VP, { left: 8, top: height - axesSize - 8, right: 8 + axesSize, bottom: height - 8, width: axesSize, height: axesSize }, colors, { unit: 'm' })
    const projected = projectVertex(VP, light, width, height)
    if (projected) {
      const margin = 18
      const marker = [clamp(projected[0], margin, width - margin), clamp(projected[1], margin, height - margin)]
      const outside = marker[0] !== projected[0] || marker[1] !== projected[1]
      markerCircle(ctx, marker[0], marker[1], 8, { fill: colors.accent, stroke: colors.ink, lineWidth: 2 })
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.5
      if (outside) {
        const angle = Math.atan2(projected[1] - marker[1], projected[0] - marker[0])
        const tip = [marker[0] + Math.cos(angle) * 16, marker[1] + Math.sin(angle) * 16]
        ctx.beginPath()
        ctx.moveTo(marker[0] + Math.cos(angle) * 10, marker[1] + Math.sin(angle) * 10)
        ctx.lineTo(tip[0], tip[1])
        ctx.lineTo(tip[0] - Math.cos(angle - 0.6) * 5, tip[1] - Math.sin(angle - 0.6) * 5)
        ctx.moveTo(tip[0], tip[1])
        ctx.lineTo(tip[0] - Math.cos(angle + 0.6) * 5, tip[1] - Math.sin(angle + 0.6) * 5)
        ctx.stroke()
      } else {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4
          ctx.beginPath()
          ctx.moveTo(marker[0] + Math.cos(a) * 11, marker[1] + Math.sin(a) * 11)
          ctx.lineTo(marker[0] + Math.cos(a) * 15, marker[1] + Math.sin(a) * 15)
          ctx.stroke()
        }
      }
    }
    legendRef.current?.update({ triangles: String(result.triangles) })
  }

  const { canvasRef, redraw } = useCanvas({ draw, maxDpr: 1 })
  useEffect(() => { redraw() })
  const loop = useSimLoop((dt) => setAzimuth((value) => (value + dt * 7) % 360), { targetRef: canvasRef, autoStart: false })

  usePointerDrag(canvasRef, {
    canGrab: () => true,
    onDown: () => {
      dragging.current = true
      loop.pause()
      redraw()
    },
    onMove: ({ dx, dy }) => {
      setAzimuth((value) => (value + dx * 0.45 + 360) % 360)
      setElevation((value) => clamp(value - dy * 0.35, 10, 85))
    },
    onUp: () => {
      dragging.current = false
      redraw()
    },
  })

  const onKeyDown = (event) => {
    const step = arrowStep(event)
    if (!step) return
    event.preventDefault()
    loop.pause()
    setAzimuth((value) => (value + step.dx * 5 + 360) % 360)
    setElevation((value) => clamp(value + step.dy * 5, 10, 85))
  }
  const reset = () => {
    loop.pause()
    setAzimuth(INITIAL.azimuth)
    setElevation(INITIAL.elevation)
    setSegments(INITIAL.segments)
    setShadowSize(INITIAL.shadowSize)
    setShininess(INITIAL.shininess)
    setRoughness(INITIAL.roughness)
    setModel('blinn-phong')
    setShading('phong')
    setMaterial('paint')
    setShadows(true)
  }
  const modelLabel = MODEL_OPTIONS.find((option) => option.value === model)?.label
  const shadingLabel = { flat: 'フラット', gouraud: 'グロー', phong: 'フォン' }[shading]

  return (
    <SimShell
      label="反射モデルと影"
      switcher={<ModeSwitch label="反射モデル" value={model} options={MODEL_OPTIONS} onChange={setModel} variant="tabs" />}
      stage={<SimCanvas ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} label="球と床、光源、影を描いた三次元の場面。絵のどこからでもドラッグし、または矢印キーで光源の方位角と仰角を動かせます。画面外の光源は端の太陽印と矢印で方向を示します。" />}
      legend={<SimLegend ref={legendRef} items={[
        { key: 'light', symbol: 'L', label: '光源位置', value: `(${light.map((v) => fmt(v, 2)).join(', ')}) m`, minChars: 23 },
        { key: 'mode', label: 'モデル・陰影', value: `${modelLabel}・${shadingLabel}`, minChars: 19 },
        { key: 'triangles', label: '三角形', value: '—', minChars: 7 },
        { key: 'shadow', label: 'シャドウマップ', value: shadows ? `${shadowSize}×${shadowSize}` : 'なし', minChars: 9 },
      ]} />}
      controls={
        <>
          <SimToolbar>
            <PlayPauseButton running={loop.running} onToggle={loop.toggle} />
            <ResetButton onClick={reset} />
            <ToggleButton pressed={shadows} onChange={setShadows}>影</ToggleButton>
          </SimToolbar>
          <ControlGroup label="陰影">
            <ModeSwitch label="陰影" value={shading} options={[
              { value: 'flat', label: 'フラット' }, { value: 'gouraud', label: 'グロー' }, { value: 'phong', label: 'フォン' },
            ]} onChange={setShading} variant="quiet" />
          </ControlGroup>
          <ControlGroup label="材質">
            <ModeSwitch label="材質" value={material} options={[
              { value: 'paint', label: '塗り' }, { value: 'mirror', label: '映り込み' }, { value: 'glass', label: 'ガラス' },
            ]} onChange={setMaterial} variant="quiet" />
          </ControlGroup>
          <ViewStack active={model === 'cook-torrance' ? 'roughness' : 'shininess'} reserve={['shininess', 'roughness']} views={{
            shininess: <ParamSlider symbol="m" label="光沢度" value={shininess} min={1} max={200} step={1} onChange={setShininess} format={(v) => v.toFixed(0)} />,
            roughness: <ParamSlider symbol="m" label="粗さ" value={roughness} min={0.05} max={0.6} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />,
          }} />
          <ParamSlider symbol="N" label="球の分割数" value={segments} min={8} max={64} step={2} onChange={setSegments} format={(v) => v.toFixed(0)} />
          <ParamSlider symbol="S" label="影の解像度" value={Math.log2(shadowSize)} min={5} max={10} step={1} disabled={!shadows} onChange={(power) => setShadowSize(2 ** power)} format={(power) => `${2 ** power}×${2 ** power}`} />
        </>
      }
    />
  )
}
