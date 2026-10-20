// 腕のキーフレームアニメーションの計算(src/components/visualization/sims/transformArm.js)を確かめる。
// 実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FIXED_DT,
  T_END,
  KEY_TIMES,
  KEY_POINTS,
  KEY_LABELS,
  ARM_BASE,
  GROUND_Y,
  buildPath,
  handAt,
  samplePath,
  armAngles,
  armMatrices,
  keyframeInfo,
  advanceClock,
  splitPanels,
  isStacked,
  PANEL_TITLE_H,
  CAMERA_DEFAULT,
  CAMERA_RANGE,
  clampCameraPosition,
} from '../../src/components/visualization/sims/transformArm.js'
import { L1, L2 } from '../../src/components/visualization/sims/transformIk.js'
import { fk2 } from '../../src/utils/vis/ik.js'

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

test('キーフレームの時刻では、手先の目標がキーフレームの位置を通る', () => {
  const path = buildPath()
  KEY_TIMES.forEach((t, i) => {
    const [x, y] = handAt(path, t)
    assert.ok(near(x, KEY_POINTS[i][0], 1e-9) && near(y, KEY_POINTS[i][1], 1e-9), `t = ${t}`)
  })
})

test('最後のキーフレームは最初と同じ位置で、番号も 1 に戻る(1 周して戻る)', () => {
  assert.deepEqual(KEY_POINTS[KEY_POINTS.length - 1], KEY_POINTS[0])
  assert.equal(KEY_LABELS[KEY_LABELS.length - 1], KEY_LABELS[0])
  assert.equal(KEY_TIMES[KEY_TIMES.length - 1], T_END)
})

test('経路の全部が腕の届く範囲(|L1−L2|〜L1+L2)の内側: IK が目標にぴったり届く', () => {
  const path = buildPath()
  for (const [x, y] of samplePath(path, 500)) {
    const r = Math.hypot(x, y)
    assert.ok(r > Math.abs(L1 - L2) + 0.05 && r < L1 + L2 - 0.05, `r = ${r} (${x}, ${y})`)
  }
})

test('IK の角度から FK で手先を求めると、目標に一致する(経路の全体で)', () => {
  const path = buildPath()
  for (const p of samplePath(path, 200)) {
    for (const up of [true, false]) {
      const theta = armAngles(p, up)
      const { tip } = fk2(L1, L2, theta[0], theta[1])
      assert.ok(near(tip[0], p[0], 1e-9) && near(tip[1], p[1], 1e-9))
    }
  }
})

test('モデル変換: 行列を掛けて求めた肘・手先は、fk2 と一致する(ARM_BASE の分だけ平行移動)', () => {
  const path = buildPath()
  for (const t of [0, 0.7, 1.9, 3.3, 4.6, 5.8]) {
    const target = handAt(path, t)
    const theta = armAngles(target)
    const m = armMatrices(theta)
    const fk = fk2(L1, L2, theta[0], theta[1])
    assert.ok(near(m.elbow[0], ARM_BASE[0] + fk.elbow[0], 1e-9) && near(m.elbow[1], ARM_BASE[1] + fk.elbow[1], 1e-9) && near(m.elbow[2], ARM_BASE[2], 1e-9))
    assert.ok(near(m.tip[0], ARM_BASE[0] + target[0], 1e-9) && near(m.tip[1], ARM_BASE[1] + target[1], 1e-9) && near(m.tip[2], ARM_BASE[2], 1e-9))
  }
})

test('肩を平行移動すると、腕の全部が同じだけ動く(モデル変換の平行移動)', () => {
  const theta = armAngles([0.8, 0.9])
  const a = armMatrices(theta, [0, 0, 0])
  const b = armMatrices(theta, [0.5, 0.2, -1])
  for (let k = 0; k < 3; k++) assert.ok(near(b.tip[k] - a.tip[k], [0.5, 0.2, -1][k], 1e-9))
})

test('台は床から肩の下まで: 箱の底が GROUND_Y', () => {
  const m = armMatrices([0.5, 0.5])
  const cy = m.pedestal[1][3]
  const hy = m.pedestal[1][1]
  assert.ok(near(cy - hy, GROUND_Y, 1e-9))
  assert.ok(cy + hy < ARM_BASE[1])
})

test('keyframeInfo: 区間の番号と、区間の中の位置(0〜1)', () => {
  assert.deepEqual(keyframeInfo(0), { segment: 0, from: 1, to: 2, frac: 0 })
  const mid = keyframeInfo(2.25)
  assert.equal(mid.segment, 2)
  assert.equal(mid.from, 3)
  assert.equal(mid.to, 4)
  assert.ok(near(mid.frac, 0.25))
  const last = keyframeInfo(5.5)
  assert.equal(last.from, 6)
  assert.equal(last.to, 1) // 7 つ目は 1 に戻る
  assert.equal(keyframeInfo(T_END).segment, KEY_TIMES.length - 2) // 終端は最後の区間
})

test('手先も肘も、肩の下の台(幅 ±0.3、y < 0)の中には入らない', () => {
  const path = buildPath()
  for (const p of samplePath(path, 300)) {
    assert.ok(p[1] > 0.2, `手先 y = ${p[1]}`)
    const m = armMatrices(armAngles(p))
    assert.ok(Math.abs(m.elbow[0]) > 0.35 || m.elbow[1] > 0, `肘 (${m.elbow[0]}, ${m.elbow[1]}) が台の上に重なる`)
  }
})

test('advanceClock: Δt の整数倍で進み、1 周したら 0 に戻る', () => {
  const clock = { t: 0, acc: 0 }
  assert.equal(advanceClock(clock, FIXED_DT), 1)
  assert.ok(near(clock.t, FIXED_DT))
  assert.equal(advanceClock(clock, 0.001), 0) // 足りない分はためる
  assert.ok(near(clock.acc, 0.001))
  const c2 = { t: T_END - FIXED_DT, acc: 0 }
  advanceClock(c2, FIXED_DT)
  assert.ok(c2.t >= 0 && c2.t < FIXED_DT, `t = ${c2.t}`)
})

test('advanceClock: 長く止まったあとでも 1 フレームに進めるのは maxSteps 回まで。残りは捨てる', () => {
  const clock = { t: 1, acc: 0 }
  assert.equal(advanceClock(clock, 0.1, { maxSteps: 3 }), 3)
  assert.ok(near(clock.t, 1 + 3 * FIXED_DT))
  assert.equal(clock.acc, 0)
})

test('splitPanels: 左右に並べると題の帯の下が枠。上下に並べると 2 枚が縦に積まれ、重ならない', () => {
  const lr = splitPanels(800, 400, false)
  assert.equal(lr.outside.rect.left, 0)
  assert.equal(lr.camera.rect.left, 400)
  assert.equal(lr.outside.rect.top, PANEL_TITLE_H)
  assert.equal(lr.outside.rect.width + lr.camera.rect.width, 800)
  assert.equal(lr.outside.rect.height, 400 - PANEL_TITLE_H)
  const ud = splitPanels(400, 640, true)
  assert.equal(ud.outside.rect.width, 400)
  assert.equal(ud.camera.title.top, 320)
  assert.ok(ud.outside.rect.top + ud.outside.rect.height <= ud.camera.title.top)
  assert.equal(ud.camera.rect.top + ud.camera.rect.height, 640)
})

test('isStacked: 狭い幅は上下', () => {
  assert.equal(isStacked(375), true)
  assert.equal(isStacked(479), true)
  assert.equal(isStacked(480), false)
  assert.equal(isStacked(1000), false)
})

test('clampCameraPosition: 範囲の外は端に、内側は 0.01 m に丸める。初期位置は範囲の内側', () => {
  assert.deepEqual(clampCameraPosition([-7, 5, 0.2]), { x: CAMERA_RANGE.x[0], y: CAMERA_RANGE.y[1], z: CAMERA_RANGE.z[0] })
  assert.deepEqual(clampCameraPosition([1.234, -0.456, 3.0049]), { x: 1.23, y: -0.46, z: 3 })
  const { x, y, z } = CAMERA_DEFAULT
  assert.deepEqual(clampCameraPosition([x, y, z]), { x, y, z })
})
