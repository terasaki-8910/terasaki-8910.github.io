// 布の節の段階 8(風の力)が使う、風を受ける 1 枚の板(React にも DOM にも依存しない)。
// 板は長さ L、奥行き depth の線分で、面積 S = L × depth。風が板に与える力は、布の網の辺と同じ
// massSpring.js の addWindForces で求める(抗力だけ・揚力だけ・両方、の 3 回に分けて呼ぶと、D・L・合計が取り出せる)。
// 風は +x の向き(左から右)に吹く。板は中心を原点にして、x 軸から角度 θ(反時計まわりが正)に置く。
import { addWindForces, createMassSpringState } from '../../../utils/vis/massSpring.js'

export const PLATE_DEPTH = 0.1 // 板の奥行き [m]。布の網の辺と同じ
export const AIR_DENSITY = 1.2 // 空気の密度 [kg/m³]

const state = createMassSpringState(2)
const segments = [{ i: 0, j: 1 }]
const wind = [0, 0]

// 板の両端 [x1, y1, x2, y2](中心 (cx, cy)、長さ length、角度 angle [rad])
export function plateEnds(cx, cy, length, angle) {
  const hx = (length / 2) * Math.cos(angle)
  const hy = (length / 2) * Math.sin(angle)
  return [cx - hx, cy - hy, cx + hx, cy + hy]
}

// 向きだけを見る線を、角度 (−π/2, π/2] に畳む(板の表と裏を区別しない)
export function foldAngle(a) {
  let t = a % Math.PI
  if (t <= -Math.PI / 2) t += Math.PI
  else if (t > Math.PI / 2) t -= Math.PI
  return t
}

function windForce(CL, CD, o, out) {
  const [x1, y1, x2, y2] = plateEnds(0, 0, o.length, o.angle)
  state.pos[0] = x1
  state.pos[1] = y1
  state.pos[2] = x2
  state.pos[3] = y2
  state.vel[0] = o.plateSpeed
  state.vel[1] = 0
  state.vel[2] = o.plateSpeed
  state.vel[3] = 0
  state.force.fill(0)
  wind[0] = o.windSpeed
  addWindForces(state, segments, wind, PLATE_DEPTH, AIR_DENSITY, CL, CD)
  out[0] = state.force[0] + state.force[2]
  out[1] = state.force[1] + state.force[3]
  return out
}

// o = { length [m], angle [rad], windSpeed [m/s]、plateSpeed [m/s](板が風下へ動く速さ)、CD、CL }
// 戻り値: 抗力 D と揚力 L と合計 F(どれも [fx, fy] [N])、板に対する空気の速さ |U| [m/s]、面積 S [m²]
export function plateWindForces(o) {
  const drag = windForce(0, o.CD, o, [0, 0])
  const lift = windForce(o.CL, 0, o, [0, 0])
  const total = windForce(o.CL, o.CD, o, [0, 0])
  return {
    drag,
    lift,
    total,
    relativeSpeed: Math.abs(o.windSpeed - o.plateSpeed),
    area: o.length * PLATE_DEPTH,
  }
}
