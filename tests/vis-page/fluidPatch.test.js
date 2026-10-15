// 流体の段階 2〜5・7 の「粒子の小さな塊」(src/components/visualization/sims/fluidPatch.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sphMaxDt, poly6 } from '../../src/utils/vis/sph.js'
import {
  BASE,
  createPatch,
  layoutLattice,
  settle,
  setSmoothing,
  moveParticle,
  nearestParticle,
  neighborsOf,
  closestTo,
  strongestPartner,
  densityParts,
  pairForce,
  summedPairForce,
  forceSum,
  advancePatch,
  setShear,
  layerMeans,
  maxSpeed,
  scatter,
  setCell,
} from '../../src/components/visualization/sims/fluidPatch.js'

const WORLD = { width: 0.32, height: 0.24 }
const center = (patch) => Math.floor(patch.rows / 2) * patch.cols + Math.floor(patch.cols / 2)

test('段階 2 密度: 格子の内側の密度は休止密度にほぼ等しく、端の粒子は(外側に粒子がないので)小さい', () => {
  const patch = createPatch({ cols: 12, rows: 9, ...WORLD })
  const { rho } = patch.state
  const mid = center(patch)
  assert.ok(Math.abs(rho[mid] / BASE.rho0 - 1) < 0.01, `中央 ${rho[mid]}`)
  assert.ok(rho[0] < 0.7 * BASE.rho0, `角 ${rho[0]}`)
  assert.ok(rho[0] < rho[5] && rho[5] < rho[mid]) // 角 < 辺 < 内側
})

test('段階 2 密度の内訳: 自分の分 m·W(0) + 近くの粒子の分 = 密度。h 以内の粒子の数は総当たりの数え方と一致する', () => {
  const patch = createPatch({ cols: 12, rows: 9, ...WORLD })
  const i = center(patch)
  const parts = densityParts(patch, i)
  assert.ok(Math.abs(parts.self - patch.params.m * poly6(0, patch.params.h)) < 1e-9)
  assert.ok(Math.abs(parts.self + parts.others - patch.state.rho[i]) < 1e-9)
  let brute = 0
  for (let j = 0; j < patch.n; j++) {
    if (j === i) continue
    const d = Math.hypot(patch.state.pos[2 * i] - patch.state.pos[2 * j], patch.state.pos[2 * i + 1] - patch.state.pos[2 * j + 1])
    if (d < patch.params.h) brute++
  }
  assert.equal(parts.count, brute)
  assert.ok(parts.count >= 15 && parts.count <= 25, `近くの粒子 ${parts.count}`)
})

test('段階 2 h を変えても、内側の密度は休止密度(質量 ÷ 面積)に近いまま。粒子を重ねると密度が上がる', () => {
  const patch = createPatch({ cols: 12, rows: 9, ...WORLD, cell: 0.06 })
  const i = center(patch)
  for (const h of [0.03, 0.04, 0.06]) {
    setSmoothing(patch, h)
    settle(patch)
    assert.ok(Math.abs(patch.state.rho[i] / patch.params.rho0 - 1) < 0.02, `h=${h}`)
  }
  setSmoothing(patch, 0.05)
  settle(patch)
  const before = patch.state.rho[i]
  const j = i + 1
  moveParticle(patch, j, patch.state.pos[2 * i] + 0.004, patch.state.pos[2 * i + 1]) // すぐ隣へ
  settle(patch)
  assert.ok(patch.state.rho[i] > before * 1.05, `${before} → ${patch.state.rho[i]}`)
})

test('段階 3 圧力: 休止の間隔では p = 0、詰めると p = k(ρ − ρ0) > 0、広げると 0 のまま(負にならない)', () => {
  const patch = createPatch({ cols: 12, rows: 9, ...WORLD })
  const i = center(patch)
  assert.ok(patch.state.pressure[i] < 1)
  layoutLattice(patch, 0.016)
  const { rho, pressure } = patch.state
  assert.ok(rho[i] > 1.4 * patch.params.rho0)
  assert.ok(Math.abs(pressure[i] - patch.params.k * (rho[i] - patch.params.rho0)) < 1e-6)
  assert.ok(pressure[i] > 0)
  layoutLattice(patch, 0.026)
  for (let q = 0; q < patch.n; q++) assert.equal(patch.state.pressure[q], 0)
})

test('段階 3 k を大きくすると同じ密度でも圧力が大きい', () => {
  const patch = createPatch({ cols: 12, rows: 9, ...WORLD, spacing: 0.016 })
  const i = center(patch)
  patch.params.k = 50
  settle(patch)
  const p50 = patch.state.pressure[i]
  patch.params.k = 100
  settle(patch)
  assert.ok(Math.abs(patch.state.pressure[i] - 2 * p50) < 1e-6 * p50)
})

test('段階 4 圧力の力: 組 (i, j) の力は逆向きで同じ大きさ。全粒子の合計は 0(運動量が保存する)。詰めた塊の外側は外向き', () => {
  const patch = createPatch({ cols: 5, rows: 4, ...WORLD, spacing: 0.014, params: { mu: 0 } })
  const i = 7
  const j = closestTo(patch, i)
  const fij = pairForce(patch, i, j, 'pressure')
  const fji = pairForce(patch, j, i, 'pressure')
  assert.ok(Math.hypot(...fij) > 1)
  assert.ok(Math.abs(fij[0] + fji[0]) < 1e-9 && Math.abs(fij[1] + fji[1]) < 1e-9)
  const [sx, sy] = forceSum(patch)
  assert.ok(Math.hypot(sx, sy) < 1e-6)
  // 一番強く押している粒子 j*: その組の力は、近くのどの粒子との組の力より大きい
  const best = strongestPartner(patch, i, 'pressure')
  const count = neighborsOf(patch, i)
  for (let q = 0; q < count; q++) {
    assert.ok(Math.hypot(...pairForce(patch, i, patch.nbr[q], 'pressure')) <= Math.hypot(...best.f) + 1e-9)
  }
  // 組の力の和 = 合力(sphStep が出した力と同じ)
  const total = summedPairForce(patch, i, 'pressure')
  assert.ok(Math.abs(total[0] - patch.state.force[2 * i]) < 1e-6 && Math.abs(total[1] - patch.state.force[2 * i + 1]) < 1e-6)
  // 左下の角の粒子(0 番。y は上向きが正)は、塊の中心から見て左下(x も y も負)へ押される
  assert.ok(patch.state.force[0] < 0 && patch.state.force[1] < 0)
})

test('段階 4 手を離すと、塊が広がり、圧力が下がる(Δt は sphMaxDt)', () => {
  const patch = createPatch({ cols: 5, rows: 4, ...WORLD, spacing: 0.014, params: { mu: 0 } })
  const width = () => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < patch.n; i++) {
      lo = Math.min(lo, patch.state.pos[2 * i])
      hi = Math.max(hi, patch.state.pos[2 * i])
    }
    return hi - lo
  }
  const w0 = width()
  const p0 = Math.max(...patch.state.pressure)
  let dt = 0
  for (let f = 0; f < 12; f++) dt = advancePatch(patch, 1 / 60).dt
  assert.equal(dt, sphMaxDt(patch.params))
  assert.ok(width() > 1.5 * w0)
  assert.ok(Math.max(...patch.state.pressure) < p0)
  for (let i = 0; i < 2 * patch.n; i++) assert.ok(Number.isFinite(patch.state.pos[i]))
})

test('段階 5 粘性: 界面の粒子の粘性の力は、速い層の側では遅くする向き。μ = 0 なら 0。組の力の和は sphStep の力と一致する', () => {
  const patch = createPatch({ cols: 12, rows: 8, width: 0.5, height: 0.22 })
  setShear(patch, 0.3)
  const upperFirst = 4 * 12 + 6 // 上の層(+x へ動く)の一番下の行
  const lowerLast = 3 * 12 + 6 // 下の層(−x へ動く)の一番上の行
  const fu = summedPairForce(patch, upperFirst, 'viscosity')
  const fl = summedPairForce(patch, lowerLast, 'viscosity')
  assert.ok(fu[0] < -1, `上の層の界面 ${fu}`)
  assert.ok(fl[0] > 1, `下の層の界面 ${fl}`)
  assert.ok(Math.abs(fu[0] + fl[0]) < 0.5 * Math.abs(fu[0])) // ほぼ対称
  assert.ok(Math.abs(patch.state.force[2 * upperFirst] - summedPairForce(patch, upperFirst)[0]) < 1e-6)
  patch.params.mu = 0
  settle(patch)
  assert.equal(summedPairForce(patch, upperFirst, 'viscosity')[0], 0)
})

test('段階 5 粘性: 層の速さの差は時間とともに縮み、μ が大きいほど速く縮む。μ = 0 では縮まない', () => {
  const diffAfter = (mu, frames) => {
    const patch = createPatch({ cols: 12, rows: 8, width: 0.5, height: 0.22, params: { mu } })
    setShear(patch, 0.3)
    const d0 = layerMeans(patch).upper - layerMeans(patch).lower
    assert.ok(Math.abs(d0 - 0.6) < 1e-9)
    for (let f = 0; f < frames; f++) advancePatch(patch, 1 / 60)
    const m = layerMeans(patch)
    return m.upper - m.lower
  }
  const d0 = diffAfter(0, 12) // 0.2 s
  const d5 = diffAfter(5, 12)
  const d30 = diffAfter(30, 12)
  assert.ok(d0 > 0.55, `μ=0: ${d0}`)
  assert.ok(d5 < 0.45 && d5 > d30, `μ=5: ${d5}、μ=30: ${d30}`)
  assert.ok(d30 < 0.15, `μ=30: ${d30}`)
})

test('つかんだ粒子は手の位置に留まり、手の速度でまわりに力を及ぼす。止めて STALE_MS 経つと速度は 0', () => {
  const patch = createPatch({ cols: 12, rows: 8, width: 0.5, height: 0.22 })
  const i = center(patch)
  patch.grab = { index: i, x: 0.1, y: 0.1, vx: 1, vy: 0, t: Date.now() }
  advancePatch(patch, 1 / 60)
  assert.equal(patch.state.pos[2 * i], 0.1)
  assert.equal(patch.state.vel[2 * i], 1)
  patch.grab.t = Date.now() - 1000
  advancePatch(patch, 1 / 60)
  assert.equal(patch.state.vel[2 * i], 0)
  assert.equal(patch.state.pos[2 * i + 1], 0.1)
})

test('段階 6 近傍探索: ばらまいた粒子で、グリッドの近傍が総当たりと一致し、調べる組は総当たりよりずっと少ない', () => {
  const patch = createPatch({ cols: 150, rows: 1, ...WORLD })
  scatter(patch)
  const n = patch.n
  assert.ok(patch.selected >= 0 && patch.selected < n)
  const { pos, grid } = patch.state
  for (const i of [0, 40, patch.selected]) {
    const count = neighborsOf(patch, i)
    let brute = 0
    for (let j = 0; j < n; j++) {
      if (j !== i && Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]) < patch.params.h) brute++
    }
    assert.equal(count, brute, `粒子 ${i}`)
  }
  const total = (n * (n - 1)) / 2
  assert.ok(grid.checked < 0.5 * total, `${grid.checked} / ${total}`)
  assert.ok(grid.pairCount <= grid.checked)
  // セルを大きくすると、調べる組が増える(近い組の数は変わらない)
  const pairs = grid.pairCount
  const checked = grid.checked
  setCell(patch, 3 * patch.params.h)
  assert.equal(patch.state.grid.pairCount, pairs)
  assert.ok(patch.state.grid.checked > 2 * checked)
})

test('nearestParticle・closestTo: 近さの順', () => {
  const patch = createPatch({ cols: 5, rows: 4, ...WORLD, spacing: 0.02 })
  const { pos } = patch.state
  assert.equal(nearestParticle(patch, pos[6], pos[7], 0.001), 3)
  assert.equal(nearestParticle(patch, 10, 10, 0.05), -1)
  const j = closestTo(patch, 0)
  assert.ok(j === 1 || j === 5)
  assert.ok(maxSpeed(patch) === 0)
})
