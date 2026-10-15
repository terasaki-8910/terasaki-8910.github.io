// 布の節の段階 9(位置ベース法)の「2 点の距離の拘束」(React にも DOM にも依存しない)。
// 予測した位置 p1・p2 が、距離 d を保つように、pbd.js の solveConstraints で位置を直接直す。
// 1 回の射影では距離が d にぴったりにならず(拘束 C = |p1 − p2|² − d² を 1 次近似で直すため)、
// 繰り返すほど d に近づく。w は質量の逆数(0 なら固定)で、補正は w に比例して分けられる。
import { solveConstraints } from '../../../utils/vis/pbd.js'

const constraints = [{ i: 0, j: 1, d: 1 }]

// p1・p2 は [x, y] [m]。戻り値:
//   path[k] = k 回目の反復のあとの [x1, y1, x2, y2](path[0] は予測位置のまま、path[iterations] が結果)
//   dp1・dp2 = 位置の補正 [dx, dy] [m]、distance = 結果の距離 [m]、residual = |距離 − d| [m]、C = 最初の拘束の値 [m²]
export function correctPair({ p1, p2, w1, w2, d, iterations }) {
  constraints[0].d = d
  const w = [w1, w2]
  const pos = new Float64Array([p1[0], p1[1], p2[0], p2[1]])
  const path = [Float64Array.from(pos)]
  for (let it = 0; it < iterations; it++) {
    solveConstraints(pos, constraints, w, 1)
    path.push(Float64Array.from(pos))
  }
  const dx = pos[0] - pos[2]
  const dy = pos[1] - pos[3]
  const distance = Math.sqrt(dx * dx + dy * dy)
  const ex = p1[0] - p2[0]
  const ey = p1[1] - p2[1]
  return {
    path,
    dp1: [pos[0] - p1[0], pos[1] - p1[1]],
    dp2: [pos[2] - p2[0], pos[3] - p2[1]],
    distance,
    residual: Math.abs(distance - d),
    C: ex * ex + ey * ey - d * d,
  }
}
