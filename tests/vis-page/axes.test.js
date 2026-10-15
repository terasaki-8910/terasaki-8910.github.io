// axes.js の純関数(目盛りの間隔・位置・文字、世界 → 画面の変換)。実行: node --test "tests/vis-page/*.test.js"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { niceStep, axisTicks, tickDecimals, formatTick, makeView, DEFAULT_MARGIN, tickTarget, clampGap, MIN_Y_TICK_GAP } from '../../src/components/visualization/axes.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} が ${b} に近くない`)

test('niceStep: 間隔は 1・2・5 の倍数 × 10 のべき', () => {
  const allowed = new Set([1, 2, 5])
  for (const span of [0.07, 0.3, 1, 2.5, 3, 4, 7, 10, 25, 99, 360, 1234, 5e4]) {
    for (const target of [2, 3, 5, 8, 12]) {
      const step = niceStep(span, target)
      const mantissa = Number((step / 10 ** Math.floor(Math.log10(step))).toFixed(9))
      assert.ok(allowed.has(mantissa) || mantissa === 10 || mantissa === 1, `span=${span} target=${target} → ${step}`)
    }
  }
  assert.equal(niceStep(4, 5), 1)
  assert.equal(niceStep(3, 6), 0.5)
  assert.equal(niceStep(100, 5), 20)
  assert.equal(niceStep(10, 5), 2)
  assert.equal(niceStep(0.07, 5), 0.01)
  near(niceStep(0.3, 5), 0.05)
})

test('niceStep: 範囲が 0 以下・非数・target が 1 未満なら 1', () => {
  assert.equal(niceStep(0, 5), 1)
  assert.equal(niceStep(-3, 5), 1)
  assert.equal(niceStep(NaN, 5), 1)
  assert.equal(niceStep(Infinity, 5), 1)
  assert.equal(niceStep(4, 0), 1)
})

test('niceStep: 目盛りの数は target の 0.5〜2 倍ほどに収まる', () => {
  for (const span of [0.8, 3, 4, 9.5, 17, 360, 0.123]) {
    for (const target of [3, 5, 8]) {
      const count = span / niceStep(span, target)
      assert.ok(count >= target * 0.5 && count <= target * 2.1, `span=${span} target=${target} → ${count} 個`)
    }
  }
})

test('axisTicks: 範囲に入る間隔の倍数だけを返し、端も含む', () => {
  assert.deepEqual(axisTicks(0, 4, 5).values, [0, 1, 2, 3, 4])
  assert.deepEqual(axisTicks(0, 3, 6).values, [0, 0.5, 1, 1.5, 2, 2.5, 3])
  assert.deepEqual(axisTicks(-1.5, 1.5, 3).values, [-1, 0, 1])
  assert.deepEqual(axisTicks(0, 100, 5).values, [0, 20, 40, 60, 80, 100])
  // 範囲の端が間隔の倍数でないときは、範囲の中の倍数だけ
  assert.deepEqual(axisTicks(0.3, 3.7, 4).values, [1, 2, 3])
})

test('axisTicks: 値は間隔の倍数で、浮動小数点の誤差がなく、0 は +0', () => {
  const { step, values } = axisTicks(-0.5, 0.5, 5)
  assert.equal(step, 0.2)
  assert.deepEqual(values, [-0.4, -0.2, 0, 0.2, 0.4])
  assert.ok(Object.is(values[2], 0), '0 が -0 になっている')
  const small = axisTicks(0, 0.3, 3)
  assert.deepEqual(small.values.map(String), ['0', '0.1', '0.2', '0.3'])
})

test('axisTicks: 引数の順が逆でも同じ', () => {
  assert.deepEqual(axisTicks(4, 0, 5), axisTicks(0, 4, 5))
})

test('tickDecimals・formatTick: 間隔に合う桁、マイナスは U+2212、-0 は 0', () => {
  assert.equal(tickDecimals(1), 0)
  assert.equal(tickDecimals(50), 0)
  assert.equal(tickDecimals(1000), 0)
  assert.equal(tickDecimals(0.5), 1)
  assert.equal(tickDecimals(0.2), 1)
  assert.equal(tickDecimals(0.1), 1)
  assert.equal(tickDecimals(0.05), 2)
  assert.equal(tickDecimals(0.001), 3)
  assert.equal(formatTick(2, 1), '2')
  assert.equal(formatTick(0.5, 0.5), '0.5')
  assert.equal(formatTick(1, 0.5), '1.0')
  assert.equal(formatTick(-1.5, 0.5), '−1.5')
  assert.equal(formatTick(-0, 1), '0')
  assert.equal(formatTick(-0.0001, 1), '0')
  assert.equal(formatTick(0.30000000000000004, 0.1), '0.3')
})

test('makeView: 世界の原点は枠の左下、範囲の端は枠の端で、y は上向き', () => {
  const v = makeView({ width: 600, height: 460, xRange: [0, 4], yRange: [0, 3], equal: false })
  near(v.sx(0), v.frame.left)
  near(v.sx(4), v.frame.right)
  near(v.sy(0), v.frame.bottom)
  near(v.sy(3), v.frame.top)
  assert.ok(v.sy(2) < v.sy(1), 'y が大きいほど画面の上(y が小さい)')
  near(v.frame.left, DEFAULT_MARGIN.left)
  near(v.frame.bottom, 460 - DEFAULT_MARGIN.bottom)
})

test('makeView: 世界 → 画面 → 世界で元に戻る', () => {
  const v = makeView({ width: 480, height: 300, xRange: [-2, 6], yRange: [1, 5], margin: { left: 30 } })
  for (const [x, y] of [[-2, 1], [0, 3], [6, 5], [1.234, 4.2]]) {
    near(v.wx(v.sx(x)), x)
    near(v.wy(v.sy(y)), y)
  }
  assert.equal(v.margin.left, 30)
  assert.equal(v.margin.right, DEFAULT_MARGIN.right, '指定しない辺は既定のまま')
})

test('makeView: equal のとき x と y の縮尺が同じで、枠は余白の内側の中央に収まる', () => {
  const v = makeView({ width: 700, height: 300, xRange: [0, 4], yRange: [0, 3] })
  assert.equal(v.scaleX, v.scaleY)
  assert.ok(v.frame.width < v.plot.width, '横に余りが出る')
  near(v.frame.height, v.plot.height)
  const plotRight = v.plot.left + v.plot.width
  assert.ok(v.frame.left >= v.plot.left - 1e-9 && v.frame.right <= plotRight + 1e-9)
  near(v.frame.left - v.plot.left, plotRight - v.frame.right) // 左右の余りが等しい
  const tall = makeView({ width: 300, height: 700, xRange: [0, 4], yRange: [0, 3] })
  near(tall.frame.width, tall.plot.width)
  const plotBottom = tall.plot.top + tall.plot.height
  near(tall.frame.top - tall.plot.top, plotBottom - tall.frame.bottom) // 上下の余りが等しい
  // 枠が中央でも、世界の範囲の端は枠の端に写る
  near(v.sx(0), v.frame.left)
  near(v.sy(3), v.frame.top)
})

test('makeView: equal=false は余白の内側いっぱいに伸ばす', () => {
  const v = makeView({ width: 700, height: 300, xRange: [0, 4], yRange: [0, 3], equal: false })
  near(v.frame.width, v.plot.width)
  near(v.frame.height, v.plot.height)
  assert.notEqual(v.scaleX, v.scaleY)
})

test('makeView: 小さすぎる canvas でも、縮尺が有限の正の数', () => {
  const v = makeView({ width: 10, height: 10, xRange: [0, 4], yRange: [0, 3] })
  assert.ok(Number.isFinite(v.scaleX) && v.scaleX > 0)
})

test('drawAxes の目盛りの間隔(minYGap): 低い枠で既定の 72px だと 0 だけになるが、小さくすると増える', () => {
  const frameH = 90 // 低い時間のグラフ
  const range = [-0.8, 0.8]
  const byDefault = axisTicks(range[0], range[1], tickTarget(frameH, clampGap(undefined, MIN_Y_TICK_GAP)))
  const tight = axisTicks(range[0], range[1], tickTarget(frameH, clampGap(30, MIN_Y_TICK_GAP)))
  assert.ok(tight.values.length > byDefault.values.length, `既定 ${byDefault.values.length} 個 → minYGap 30 で ${tight.values.length} 個`)
  assert.ok(tight.values.length >= 3)
  // 隣の目盛りの間隔(px)は、指定した minYGap の半分以上(1・2・5 に丸めるぶんのゆらぎ)
  const px = (tight.step * frameH) / (range[1] - range[0])
  assert.ok(px >= 15, `${px}px`)
})

test('clampGap: 指定がなければ既定、数でなければ既定、指定しても 20px 未満にはしない', () => {
  assert.equal(clampGap(undefined, 72), 72)
  assert.equal(clampGap(NaN, 72), 72)
  assert.equal(clampGap(0, 72), 72)
  assert.equal(clampGap(-5, 72), 72)
  assert.equal(clampGap(30, 72), 30)
  assert.equal(clampGap(8, 72), 20)
})
