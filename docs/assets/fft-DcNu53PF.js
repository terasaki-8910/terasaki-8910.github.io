const n=`// 離散フーリエ変換と高速フーリエ変換(DOM に触れない純関数)。
// 長さ N の列 x_m の DFT は X_k = Σ_m x_m e^{−2πikm/N}、逆変換は x_m = (1/N) Σ_k X_k e^{2πikm/N}。
// 出典: Cooley and Tukey, Mathematics of Computation 19(90) (1965)

// N 以上の 2 のべき
export function nextPow2(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

// @snippet fft-dft
// DFT をそのまま計算する(N² 回の掛け算)。FFT の確かめに使う
export function dft(re, im = new Array(re.length).fill(0)) {
  const N = re.length
  const outRe = new Float64Array(N)
  const outIm = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    for (let m = 0; m < N; m++) {
      const a = (-2 * Math.PI * k * m) / N
      outRe[k] += re[m] * Math.cos(a) - im[m] * Math.sin(a)
      outIm[k] += re[m] * Math.sin(a) + im[m] * Math.cos(a)
    }
  }
  return { re: outRe, im: outIm }
}
// @end

// @snippet fft-fft
// 高速フーリエ変換(基数 2、その場で書き換える。N は 2 のべき)。偶数番目と奇数番目に分けた半分の長さの DFT を
// 組み合わせる(バタフライ)ことを繰り返し、掛け算を N² 回から (N/2) log₂N 回に減らす。inverse なら逆変換(1/N 倍)
export function fft(re, im, inverse = false) {
  const N = re.length
  if (N & (N - 1)) throw new Error('長さは 2 のべき')
  // ビットを逆順にした番号へ並べ替える
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < N; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < N; i++) {
      re[i] /= N
      im[i] /= N
    }
  }
  return { re, im }
}
// @end

// @snippet fft-fft2D
// 2 次元の FFT: 各行を変換してから、各列を変換する(n × n、行優先の配列をその場で)
export function fft2D(re, im, n, inverse = false) {
  const rowRe = new Float64Array(n)
  const rowIm = new Float64Array(n)
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const idx = pass === 0 ? a * n + b : b * n + a
        rowRe[b] = re[idx]
        rowIm[b] = im[idx]
      }
      fft(rowRe, rowIm, inverse)
      for (let b = 0; b < n; b++) {
        const idx = pass === 0 ? a * n + b : b * n + a
        re[idx] = rowRe[b]
        im[idx] = rowIm[b]
      }
    }
  }
  return { re, im }
}
// @end
`;export{n as default};
