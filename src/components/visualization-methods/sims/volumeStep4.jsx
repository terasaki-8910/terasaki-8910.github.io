import { useEffect, useRef, useState } from 'react'
import SimShell from '../../visualization/SimShell'
import SimCanvas from '../../visualization/SimCanvas'
import ParamSlider from '../../visualization/ParamSlider'
import ControlGroup from '../../visualization/ControlGroup'
import { ModeSwitch } from '../../visualization/SimButtons'
import useCanvas from '../../visualization/useCanvas'
import { sampleVolume, transferFunction } from '../../../utils/vis/volume'
import { blitPixels } from './pixelKit'
import TransferFunctionEditor from './TransferFunctionEditor'
import { cloneTfPoints, colorRamp, PHANTOM_VOLUME, TF_PRESETS, VOLUME_N } from './volumeKit'

export default function VolumeStep4() {
  const [z, setZ] = useState(0)
  const [points, setPoints] = useState(() => cloneTfPoints(TF_PRESETS['骨']))
  const [preset, setPreset] = useState('骨')
  const stateRef = useRef({ z, points })
  stateRef.current = { z, points }
  const draw = ({ ctx, width, height, colors }) => {
    const size = 128; const image = ctx.createImageData(size, size); const state = stateRef.current
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const value = sampleVolume(PHANTOM_VOLUME, VOLUME_N, 2 * (x + 0.5) / size - 1, 1 - 2 * (y + 0.5) / size, state.z)
      const tf = transferFunction(state.points, value); const color = colorRamp(colors, tf.t)
      const checker = ((x >> 3) + (y >> 3)) % 2
      const back = checker ? colors.rgb.surface : colors.rgb.paper
      const offset = (y * size + x) * 4
      for (let c = 0; c < 3; c++) image.data[offset + c] = Math.round(255 * color[c] * tf.alpha + back[c] * (1 - tf.alpha))
      image.data[offset + 3] = 255
    }
    ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, width, height)
    const side = Math.min(width, height) - 16
    blitPixels(ctx, image, size, size, (width - side) / 2, (height - side) / 2, side, side)
  }
  const { canvasRef, redraw } = useCanvas({ draw })
  useEffect(() => { redraw() }, [z, points])
  const choosePreset = (name) => { setPreset(name); setPoints(cloneTfPoints(TF_PRESETS[name])) }
  return <SimShell label="伝達関数を適用した断面" stage={<SimCanvas ref={canvasRef} label="頭部ファントムの断面。透明部分は市松模様" />} controls={<>
    <ParamSlider symbol="z" label="断面の位置" value={z} min={-1} max={1} step={0.02} onChange={setZ} />
    <ControlGroup label="伝達関数">
      <TransferFunctionEditor points={points} onChange={(next) => { setPreset(''); setPoints(next) }} />
      <ModeSwitch label="プリセット" value={preset} options={Object.keys(TF_PRESETS).map((label) => ({ value: label, label }))} onChange={choosePreset} variant="quiet" />
    </ControlGroup>
  </>} />
}
