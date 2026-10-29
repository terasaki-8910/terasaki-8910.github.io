const n=`// 画像の前処理: 平滑化・鮮鋭化・輪郭・モルフォロジー(DOM に触れない純関数)。
// 画像は幅 w × 高さ h の 1 次元の配列(行優先)。画像の外は、いちばん近い端の画素の値とする(clamp)。
// 出典: Gonzalez and Woods, Digital Image Processing, 4th ed. (2018) / Tukey, Exploratory Data Analysis (1977)(メディアン) /
// Nagao and Matsuyama, Computer Graphics and Image Processing 9(5) (1979)(エッジ保存平滑化) /
// Serra, Image Analysis and Mathematical Morphology (1982)

const clampI = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v)

// @snippet imageFilter-movingAverage1D
// 1 次元の移動平均: 幅 n(奇数)の窓の中の平均
export function movingAverage1D(signal, n) {
  const r = (n - 1) / 2
  return signal.map((_, i) => {
    let s = 0
    for (let k = -r; k <= r; k++) s += signal[clampI(i + k, signal.length)]
    return s / n
  })
}
// @end

const medianOf = (arr) => {
  const s = Float64Array.from(arr).sort()
  return s[(s.length - 1) >> 1]
}

// @snippet imageFilter-median1D
// 1 次元のメディアン: 幅 n の窓の値を小さい順に並べた、真ん中の値(飛び離れた値に引きずられない)
export function median1D(signal, n) {
  const r = (n - 1) / 2
  return signal.map((_, i) => {
    const win = []
    for (let k = -r; k <= r; k++) win.push(signal[clampI(i + k, signal.length)])
    return medianOf(win)
  })
}
// @end

// @snippet imageFilter-difference1D
// 差分: 1 回の差分 f(i+1) − f(i) は傾き(輪郭で大きい)、2 回の差分 f(i+1) − 2f(i) + f(i−1) は傾きの変わり方
// (輪郭の両側で正と負に振れる。1 次元のラプラシアン)。端は端の値をくり返す
export function difference1D(signal, order = 1) {
  const n = signal.length
  const at = (i) => signal[clampI(i, n)]
  return signal.map((_, i) => (order === 2 ? at(i + 1) - 2 * at(i) + at(i - 1) : at(i + 1) - at(i)))
}
// @end

// ごま塩の雑音: 割合 rate の画素を、でたらめに最小値か最大値にする(rand は 0〜1 を返す関数)
export function addImpulseNoise(img, rate, rand, lo = 0, hi = 1) {
  return img.map((v) => (rand() < rate ? (rand() < 0.5 ? lo : hi) : v))
}

// @snippet imageFilter-convolve3x3
// 3 × 3 の重み(行優先の 9 個)との積和: g_ij = Σ_{k,l = −1..1} w_kl f_{i+k, j+l}
export function convolve3x3(img, w, h, kernel) {
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) {
        const row = clampI(y + dy, h) * w
        for (let dx = -1; dx <= 1; dx++) s += kernel[(dy + 1) * 3 + dx + 1] * img[row + clampI(x + dx, w)]
      }
      out[y * w + x] = s
    }
  }
  return out
}
// @end

// ラプラシアン(2 回の差分)。4 近傍は上下左右、8 近傍は斜めも足す。ソーベルは横・縦の 1 回の差分(輪郭の強さ)
export const LAPLACIAN4 = [0, 1, 0, 1, -4, 1, 0, 1, 0]
export const LAPLACIAN8 = [1, 1, 1, 1, -8, 1, 1, 1, 1]
export const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
export const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

// @snippet imageFilter-sharpen
// 鮮鋭化: 元の画像からラプラシアン(2 回の差分)を引く。g = f − k∇²f。輪郭の両側の明暗の差が強まる
export function sharpen(img, w, h, k = 1, kernel = LAPLACIAN4) {
  const lap = convolve3x3(img, w, h, kernel)
  return img.map((v, i) => v - k * lap[i])
}
// @end

// @snippet imageFilter-boxBlur
// 移動平均(平滑化): n × n(n は奇数)の窓の平均。g_ij = (1/n²) Σ f_{i+k, j+l}
export function boxBlur(img, w, h, n = 3) {
  const r = (n - 1) / 2
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = -r; dy <= r; dy++) {
        const row = clampI(y + dy, h) * w
        for (let dx = -r; dx <= r; dx++) s += img[row + clampI(x + dx, w)]
      }
      out[y * w + x] = s / (n * n)
    }
  }
  return out
}
// @end

// 中央を重くした平均(中央 2/10、ほか 1/10)
export function centerWeighted3x3(img, w, h) {
  return convolve3x3(img, w, h, [0.1, 0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.1, 0.1])
}

// @snippet imageFilter-median
// メディアン(平滑化): n × n の窓の値を並べた真ん中の値。孤立した点(ごま塩の雑音)が消え、段差は残る
export function median(img, w, h, n = 3) {
  const r = (n - 1) / 2
  const out = new Float64Array(w * h)
  const win = new Float64Array(n * n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = 0
      for (let dy = -r; dy <= r; dy++) {
        const row = clampI(y + dy, h) * w
        for (let dx = -r; dx <= r; dx++) win[c++] = img[row + clampI(x + dx, w)]
      }
      out[y * w + x] = medianOf(win)
    }
  }
  return out
}
// @end

// エッジ保存平滑化の 9 つの領域(5 × 5 の窓の中の相対位置 [dx, dy]。dy は下が正)。
// 中央の 3 × 3、上下左右の五角形 4 つ、斜めの六角形 4 つ(Nagao and Matsuyama 1979)
export const NAGAO_REGIONS = [
  [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  [[-1, -2], [0, -2], [1, -2], [-1, -1], [0, -1], [1, -1], [0, 0]],
  [[-1, 2], [0, 2], [1, 2], [-1, 1], [0, 1], [1, 1], [0, 0]],
  [[-2, -1], [-2, 0], [-2, 1], [-1, -1], [-1, 0], [-1, 1], [0, 0]],
  [[2, -1], [2, 0], [2, 1], [1, -1], [1, 0], [1, 1], [0, 0]],
  [[-2, -2], [-1, -2], [-2, -1], [-1, -1], [0, -1], [-1, 0], [0, 0]],
  [[2, -2], [1, -2], [2, -1], [1, -1], [0, -1], [1, 0], [0, 0]],
  [[-2, 2], [-1, 2], [-2, 1], [-1, 1], [0, 1], [-1, 0], [0, 0]],
  [[2, 2], [1, 2], [2, 1], [1, 1], [0, 1], [1, 0], [0, 0]],
]

// @snippet imageFilter-edgePreservingSmooth
// エッジ保存平滑化: 5 × 5 の窓を 9 つの小さな領域に分け、値のばらつき(分散)がいちばん小さい領域の平均を出力にする。
// 輪郭をまたぐ領域は分散が大きいので選ばれず、輪郭をぼかさずに平らな所だけがならされる
export function edgePreservingSmooth(img, w, h) {
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity
      let bestMean = img[y * w + x]
      for (const region of NAGAO_REGIONS) {
        let s = 0
        let s2 = 0
        for (const [dx, dy] of region) {
          const v = img[clampI(y + dy, h) * w + clampI(x + dx, w)]
          s += v
          s2 += v * v
        }
        const mean = s / region.length
        const variance = s2 / region.length - mean * mean
        if (variance < best - 1e-12) {
          best = variance
          bestMean = mean
        }
      }
      out[y * w + x] = bestMean
    }
  }
  return out
}
// @end

export function threshold(img, t) {
  return Uint8Array.from(img, (v) => (v >= t ? 1 : 0))
}

// 構造化要素(相対位置 [dx, dy] の配列)。どれも原点について対称なので、反転しても同じ
export const SE_SQUARE = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy]))
export const SE_CROSS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
export const SE_DISK = (() => {
  const out = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) out.push([dx, dy])
  return out
})()

// @snippet imageFilter-dilate
// 膨張(ミンコフスキー和) X ⊕ B = {x + b | x ∈ X, b ∈ B}: 形の各点に B を置いて広げる。
// 画素で言えば「B を当てた範囲に 1 つでも 1 があれば 1」(B が対称なとき)。画像の外は 0
export function dilate(mask, w, h, se = SE_SQUARE) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (const [dx, dy] of se) {
        const xx = x - dx
        const yy = y - dy
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) {
          out[y * w + x] = 1
          break
        }
      }
    }
  }
  return out
}
// @end

// @snippet imageFilter-erode
// 収縮(ミンコフスキー差) X ⊖ B = {x | B_x ⊆ X}: B を置いてすっぽり形の中に入る点だけを残す。画像の外は 0
export function erode(mask, w, h, se = SE_SQUARE) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1
      for (const [dx, dy] of se) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) {
          all = 0
          break
        }
      }
      out[y * w + x] = all
    }
  }
  return out
}
// @end

// @snippet imageFilter-open
// 開放: 収縮してから膨張 (X ⊖ B) ⊕ B。B より細い出っ張りや小さな点が消える
export function open(mask, w, h, se = SE_SQUARE) {
  return dilate(erode(mask, w, h, se), w, h, se)
}
// @end

// @snippet imageFilter-close
// 閉鎖: 膨張してから収縮 (X ⊕ B) ⊖ B。B より細いすき間や小さな穴が埋まる
export function close(mask, w, h, se = SE_SQUARE) {
  return erode(dilate(mask, w, h, se), w, h, se)
}
// @end
`;export{n as default};
