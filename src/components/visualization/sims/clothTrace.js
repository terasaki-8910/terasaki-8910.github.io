// 時間の流れのグラフ(横軸 t [s])に使う、値の記録と、絵の領域の分け方(DOM に触れない純関数)。
//
// 記録(trace): 時刻 t と、チャンネルごとの値を、決まった数まで覚える。いっぱいになったら古いものから捨てる。
//   const tr = createTrace(2)                 // チャンネル 2 本(例: 前進オイラー法のエネルギー、半陰的オイラー法のエネルギー)
//   pushTrace(tr, t, [a, b], minInterval)     // 前の記録から minInterval [s] 以上たったときだけ足す(間引き)
//   traceLength(tr)、traceTime(tr, i)、traceValue(tr, ch, i)   // i = 0 が最も古い記録
// 横軸の窓: windowStart(tNow, W) から W 秒ぶん(始まって W 秒たつまでは 0 から)。

export function createTrace(channels, capacity = 8192) {
  return {
    channels,
    capacity,
    t: new Float64Array(capacity),
    v: Array.from({ length: channels }, () => new Float64Array(capacity)),
    head: 0, // 次に書く場所
    count: 0,
    last: -Infinity,
  }
}

export function clearTrace(tr) {
  tr.head = 0
  tr.count = 0
  tr.last = -Infinity
}

// 足したら true、間引いたら false。時刻が戻った(リセット)ときは、前の記録を捨てて足す
export function pushTrace(tr, t, values, minInterval = 0) {
  if (t < tr.last) clearTrace(tr)
  if (tr.count > 0 && t - tr.last < minInterval) return false
  tr.t[tr.head] = t
  for (let c = 0; c < tr.channels; c++) tr.v[c][tr.head] = values[c]
  tr.head = (tr.head + 1) % tr.capacity
  tr.count = Math.min(tr.count + 1, tr.capacity)
  tr.last = t
  return true
}

export const traceLength = (tr) => tr.count

function slot(tr, i) {
  return (tr.head - tr.count + i + tr.capacity * 2) % tr.capacity
}
export const traceTime = (tr, i) => tr.t[slot(tr, i)]
export const traceValue = (tr, ch, i) => tr.v[ch][slot(tr, i)]

// 時刻 tMin 以降の記録の、チャンネル ch の最小と最大(記録がなければ null)
export function traceExtent(tr, ch, tMin = -Infinity) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < tr.count; i++) {
    if (traceTime(tr, i) < tMin) continue
    const v = traceValue(tr, ch, i)
    if (v < min) min = v
    if (v > max) max = v
  }
  return min <= max ? { min, max } : null
}

// 横軸の窓の左端。始まって W 秒たつまでは 0(窓は [0, W])、それからは tNow − W(窓は [tNow − W, tNow])
export function windowStart(tNow, W) {
  return Math.max(0, tNow - W)
}

// 記録の時間の間引き: 窓 W 秒に points 点ほど残す間隔 [s]
export function sampleInterval(W, points = 500) {
  return W / points
}

// canvas(width × height の CSS px)を 2 つの領域 a・b に分ける。
//   横長(width ≥ 1.7 × height): a が左、b が右(a の幅の割合 sideRatio)
//   それ以外: a が上、b が下(a の高さの割合 stackRatio)
//   force に 'side' か 'stack' を渡すと、幅によらずその分け方にする(時間の流れのグラフは横に広く取りたいので 'stack')
// 領域は { x, y, w, h }。a は絵(バネとおもりなど)、b はグラフ。
export function splitLayout(width, height, { sideRatio = 0.42, stackRatio = 0.4, gap = 6, force } = {}) {
  if (force === 'side' || (force !== 'stack' && width >= 1.7 * height)) {
    const aw = Math.round((width - gap) * sideRatio)
    return {
      mode: 'side',
      a: { x: 0, y: 0, w: aw, h: height },
      b: { x: aw + gap, y: 0, w: width - aw - gap, h: height },
    }
  }
  const ah = Math.round((height - gap) * stackRatio)
  return {
    mode: 'stack',
    a: { x: 0, y: 0, w: width, h: ah },
    b: { x: 0, y: ah + gap, w: width, h: height - ah - gap },
  }
}

// 点 (x, y) が領域 r の中か
export function inRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
