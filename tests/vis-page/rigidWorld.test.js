// 節「剛体と衝突」の世界(src/components/visualization/sims/rigidWorld.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CIRCLES,
  MAX_SPEED,
  WORLD_H,
  WORLD_W,
  createRigidWorld,
  grabAt,
  moveGrab,
  releaseGrab,
  resetWorld,
  setCount,
  stepWorld,
} from '../../src/components/visualization/sims/rigidWorld.js'

const DT = 1 / 60
const PARAMS = { gravity: 9.8, e: 0.6, substeps: 8 } // RigidSim の初期値

// 円どうしのいちばん深いめり込み [m](重なっていなければ 0 以下)
function deepestOverlap(world) {
  let deepest = -Infinity
  for (let i = 0; i < world.n; i++) {
    for (let j = i + 1; j < world.n; j++) {
      const a = world.circles[i]
      const b = world.circles[j]
      deepest = Math.max(deepest, a.r + b.r - Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]))
    }
  }
  return deepest
}

function insideBox(world) {
  return world.circles.every(
    (b) => b.c[0] >= b.r - 1e-9 && b.c[0] <= WORLD_W - b.r + 1e-9 && b.c[1] >= b.r - 1e-9 && b.c[1] <= WORLD_H - b.r + 1e-9,
  )
}

test('めり込みは小さい: 最大の 60 個を 10 秒落としても、円どうしの重なりは最小の半径(0.11 m)の 1 割以下で、箱の外に出ない', () => {
  const world = createRigidWorld(MAX_CIRCLES)
  let worst = 0
  for (let f = 0; f < 600; f++) {
    stepWorld(world, PARAMS, DT)
    worst = Math.max(worst, deepestOverlap(world))
    assert.ok(insideBox(world), `フレーム ${f} で箱の外`)
  }
  assert.ok(worst < 0.011, `いちばん深いめり込み ${worst.toFixed(4)} m`)
})

test('サブステップを増やすと、めり込みが小さくなる(8 分割は 1 分割より深くない)', () => {
  const worst = (substeps) => {
    const world = createRigidWorld(MAX_CIRCLES)
    let w = 0
    for (let f = 0; f < 300; f++) {
      stepWorld(world, { ...PARAMS, substeps }, DT)
      w = Math.max(w, deepestOverlap(world))
    }
    return w
  }
  assert.ok(worst(8) < worst(1))
})

test('広域の判定の数: 総当たりの組は N(N−1)/2、候補はそれ以下、衝突は候補以下。円の数を変えると数え直す', () => {
  const world = createRigidWorld(40)
  for (let f = 0; f < 60; f++) stepWorld(world, PARAMS, DT)
  const { total, candidates, contacts } = world.stats
  assert.equal(total, (40 * 39) / 2)
  assert.ok(candidates <= total && contacts <= candidates)
  assert.ok(candidates < total / 4, '広域の判定が組を絞っている')
  setCount(world, 5)
  assert.equal(world.n, 5)
  assert.equal(world.stats.total, 10)
  assert.equal(world.stats.candidates, 0)
  setCount(world, 1000)
  assert.equal(world.n, MAX_CIRCLES)
})

test('つかんだ円: 質量が無限大になり、ポインタの位置へ動く。離すと質量が戻り、離した速度が円の速度(MAX_SPEED で頭打ち)になる', () => {
  const world = createRigidWorld(12)
  const b = world.circles[3]
  const m0 = b.m
  assert.equal(grabAt(world, b.c[0], b.c[1]), true)
  assert.equal(b.m, Infinity)
  moveGrab(world, 2, 1.5)
  for (let f = 0; f < 120; f++) stepWorld(world, PARAMS, DT)
  assert.ok(Math.hypot(b.c[0] - 2, b.c[1] - 1.5) < 0.02, 'ポインタの位置に着く')
  releaseGrab(world, 100, 0)
  assert.equal(b.m, m0)
  assert.ok(Math.hypot(b.v[0], b.v[1]) <= MAX_SPEED + 1e-9)
  assert.equal(world.grab.index, -1)
  // 円のない所はつかめない
  assert.equal(grabAt(world, -5, -5), false)
})

test('resetWorld: 同じ初期配置に戻る(種が固定なので、毎回同じ並び)', () => {
  const world = createRigidWorld(20)
  const first = world.circles.map((b) => [...b.c, ...b.v])
  for (let f = 0; f < 120; f++) stepWorld(world, PARAMS, DT)
  assert.notDeepEqual(world.circles.map((b) => [...b.c, ...b.v]), first)
  resetWorld(world)
  assert.deepEqual(world.circles.map((b) => [...b.c, ...b.v]), first)
  assert.deepEqual(createRigidWorld(20).circles.map((b) => [...b.c, ...b.v]), first)
})
