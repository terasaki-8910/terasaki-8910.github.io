// 節「バネ-質点系と位置ベース法」の世界(src/components/visualization/sims/clothWorld.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COLS,
  GRAB_SPEED,
  ROWS,
  createClothWorld,
  grabNode,
  isPinned,
  latticeStableDt,
  maxStretch,
  moveGrab,
  releaseGrab,
  resetCloth,
  stableDt,
  stepCloth,
} from '../../src/components/visualization/sims/clothWorld.js'

// ClothSim の初期値
const SPRINGS = { method: 'springs', k: 300, kd: 0.5, iterations: 6, windSpeed: 0, CD: 1, CL: 0 }
const PBD = { ...SPRINGS, method: 'pbd' }

function run(world, params, dt, steps) {
  for (let s = 0; s < steps && !world.diverged; s++) stepCloth(world, params, dt)
}

test('バネ-質点系: 安定な Δt(網全体の上限より小さい 4 ms)なら発散せず、網は 1 割も伸びずに吊り下がる', () => {
  const world = createClothWorld()
  assert.ok(0.004 < latticeStableDt(300, 0.5))
  run(world, SPRINGS, 0.004, 1500)
  assert.equal(world.diverged, false)
  assert.ok(maxStretch(world) < 0.1, `最大の伸び ${maxStretch(world)}`)
  // 固定した上の辺は動かない
  for (let c = 0; c < COLS; c++) assert.equal(world.state.pos[2 * c + 1], world.positions0[2 * c + 1])
})

test('バネ-質点系: Δt が上限を超える(16 ms)と、発散と判定して止まる(以後 stepCloth は何もしない)', () => {
  const world = createClothWorld()
  assert.ok(0.016 > latticeStableDt(300, 0.5))
  run(world, SPRINGS, 0.016, 600)
  assert.equal(world.diverged, true)
  const frozen = Float64Array.from(world.state.pos)
  stepCloth(world, SPRINGS, 0.016)
  assert.deepEqual(Float64Array.from(world.state.pos), frozen)
  // リセットで戻り、安定な Δt なら動かせる
  resetCloth(world)
  assert.equal(world.diverged, false)
  run(world, SPRINGS, 0.004, 200)
  assert.equal(world.diverged, false)
})

test('位置ベース法: 同じ 16 ms でも発散しない(反復の数で拘束を満たす)', () => {
  const world = createClothWorld()
  run(world, PBD, 0.016, 600)
  assert.equal(world.diverged, false)
  assert.ok(maxStretch(world) < 0.1)
})

test('stableDt: ばね 1 本の上限 2√(m/k)。網全体の上限はそれより小さく、減衰があるほど小さくなる', () => {
  assert.ok(Math.abs(stableDt(300) - 2 * Math.sqrt(0.05 / 300)) < 1e-12)
  assert.ok(latticeStableDt(300, 0) < stableDt(300))
  assert.ok(latticeStableDt(300, 0.5) < latticeStableDt(300, 0))
  assert.ok(latticeStableDt(900, 0) < latticeStableDt(300, 0)) // k が大きいほど小さい
})

test('つかむ: 固定した質点はつかめず、つかんだ質点は動かせない質点(w = 0)になり、離すと戻る', () => {
  const world = createClothWorld()
  const { pos, w } = world.state
  assert.equal(isPinned(world, 0), true)
  assert.equal(grabNode(world, pos[0], pos[1], 0.05), false) // 左上の隅は固定
  const i = 5 * COLS + 7 // 6 段目の質点
  assert.equal(grabNode(world, pos[2 * i], pos[2 * i + 1], 0.05), true)
  assert.equal(world.grab.index, i)
  assert.equal(w[i], 0)
  moveGrab(world, pos[2 * i] + 0.3, pos[2 * i + 1])
  const before = pos[2 * i]
  stepCloth(world, PBD, 0.016)
  assert.ok(Math.abs(world.state.pos[2 * i] - before) <= GRAB_SPEED * 0.016 + 1e-9, '1 ステップで動ける距離は GRAB_SPEED·Δt まで')
  releaseGrab(world)
  assert.equal(world.grab.index, -1)
  assert.equal(w[i], 1 / 0.05)
})

test('網の大きさ: 14 × 10 の質点で、辺の自然長からの伸びは最初ほぼ 0', () => {
  const world = createClothWorld()
  assert.equal(world.state.n, COLS * ROWS)
  assert.ok(maxStretch(world) < 1e-12)
})
