// z バッファで三角形のメッシュを描き、反射モデルとシャドウマップで画素の色を決める(DOM に触れない)。
// 「反射と影」の全体と、「等値面」の 3 次元の絵が使う。式は shading.js・raster.js・projection.js の関数で、
// ここは描く順番(見える面を決める → 影の表 → 画素ごとの色)だけを書く。
//
//   renderScene(scene, camera, opts, out) → { triangles, pixels }
//   scene  = { meshes: [{ positions, normals, faces, material }], light: { position, intensity = 1 },
//              ambient = 0.12, environment(dir, rgb) → rgb(映り込み・ガラス・背景の色。0〜1) }
//   material = { color: [r, g, b](0〜1), checker?: 市松の 1 マスの大きさ(m), color2?: 市松のもう 1 色,
//                kd = 0.85, ks = 0.5, shininess = 32, roughness = 0.3, F0 = 0.04, metal = false,
//                kind: 'paint' | 'mirror' | 'glass', ior = 1.5 }
//   camera = { eye, target, up = [0, 1, 0], fov(縦の視野角、ラジアン), near = 0.1, far = 100 }
//   opts   = { width, height, shading: 'flat' | 'gouraud' | 'phong', model: 'lambert' | 'phong' | 'blinn-phong' |
//              'cook-torrance', shadows = true, shadowSize = 512, shadowBias = 0.03, shadowFov(ラジアン) = 1.6,
//              shadowTarget = [0, 0.5, 0], cull = true }
//   out    = 幅 × 高さ × 4 の Uint8ClampedArray(RGBA。画素の並びは左上から行ごと)
import { multiply } from './mat4.js'
import { perspectiveMatrix } from './projection.js'
import { rasterTriangle } from './raster.js'
import {
  blinnPhongSpecular, cookTorranceSpecular, faceNormal, fresnelSchlick, inShadow, lambert, phongSpecular,
  reflectIncident, refract,
} from './shading.js'
import { cross, dot, normalize, sub } from './vec3.js'

const MATERIAL_DEFAULTS = { kd: 0.85, ks: 0.5, shininess: 32, roughness: 0.3, F0: 0.04, metal: false, kind: 'paint', ior: 1.5 }

export function withMaterialDefaults(material) {
  return { ...MATERIAL_DEFAULTS, ...material }
}

// カメラの行列(世界 → カメラ)。カメラは −z を見て、y が上(OpenGL の gluLookAt と同じ)
export function lookAt(eye, target, up = [0, 1, 0]) {
  const f = normalize(sub(target, eye))
  const s = normalize(cross(f, up))
  const u = cross(s, f)
  return [
    [s[0], s[1], s[2], -dot(s, eye)],
    [u[0], u[1], u[2], -dot(u, eye)],
    [-f[0], -f[1], -f[2], dot(f, eye)],
    [0, 0, 0, 1],
  ]
}

export function cameraViewProjection(camera, aspect) {
  const V = lookAt(camera.eye, camera.target, camera.up ?? [0, 1, 0])
  const P = perspectiveMatrix(camera.fov, aspect, camera.near ?? 0.1, camera.far ?? 100)
  return multiply(P, V)
}

// 頂点を画素の座標へ: [x(右), y(下), z_ndc(手前ほど小さい), 1/w]。w ≤ 0(カメラの後ろ)は null
export function projectVertex(M, p, width, height) {
  const x = M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2] + M[0][3]
  const y = M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2] + M[1][3]
  const z = M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2] + M[2][3]
  const w = M[3][0] * p[0] + M[3][1] * p[1] + M[3][2] * p[2] + M[3][3]
  if (!(w > 1e-6)) return null
  const iw = 1 / w
  return [((x * iw + 1) / 2) * width, ((1 - y * iw) / 2) * height, z * iw, iw]
}

// @snippet render-renderDepthMap
// 影の表(シャドウマップ): 光源にカメラを置いて場面を描き、画素ごとに「いちばん近い物までの奥行き」を残す。
// 奥行きは光源のカメラの視線の向きの距離 w。1/w は画面の上で 1 次式なので、重心座標で補間してから逆数にする
export function renderDepthMap(scene, lightCamera, size) {
  const VP = cameraViewProjection(lightCamera, 1)
  const depth = new Float32Array(size * size).fill(Infinity)
  for (const mesh of scene.meshes) {
    const verts = mesh.positions.map((p) => projectVertex(VP, p, size, size))
    for (const [i, j, k] of mesh.faces) {
      const a = verts[i]
      const b = verts[j]
      const c = verts[k]
      if (!a || !b || !c) continue
      rasterTriangle(a, b, c, size, size, (x, y, l0, l1, l2) => {
        const w = 1 / (l0 * a[3] + l1 * b[3] + l2 * c[3])
        const idx = y * size + x
        if (w < depth[idx]) depth[idx] = w
      })
    }
  }
  return { depth, VP, size }
}
// @end

// 光源のカメラで見た点 p の奥行き dC と、影の表のその画素の値 dL。表の外なら null
export function shadowLookup(map, p) {
  const { VP, size, depth } = map
  const x = VP[0][0] * p[0] + VP[0][1] * p[1] + VP[0][2] * p[2] + VP[0][3]
  const y = VP[1][0] * p[0] + VP[1][1] * p[1] + VP[1][2] * p[2] + VP[1][3]
  const w = VP[3][0] * p[0] + VP[3][1] * p[1] + VP[3][2] * p[2] + VP[3][3]
  if (!(w > 1e-6)) return null
  const u = Math.floor(((x / w + 1) / 2) * size)
  const v = Math.floor(((1 - y / w) / 2) * size)
  if (u < 0 || v < 0 || u >= size || v >= size) return null
  return { dC: w, dL: depth[v * size + u] }
}

function baseColor(material, p, out) {
  let c = material.color
  if (material.checker) {
    const cell = Math.floor(p[0] / material.checker) + Math.floor(p[2] / material.checker)
    if ((cell & 1) !== 0 && material.color2) c = material.color2
  }
  out[0] = c[0]
  out[1] = c[1]
  out[2] = c[2]
  return out
}

// @snippet render-directLight
// 光源から直接来る光の色 = 拡散 kd (N·L) × 地の色 + 鏡面(選んだモデル)× 光の色(金属は地の色)。
// クック-トランスは BRDF なので N·L を掛ける。material は withMaterialDefaults を通したもの
export function directLight(model, material, N, L, V, base, out) {
  const diffuse = material.kd * lambert(N, L)
  let specular = 0
  if (model === 'phong') specular = material.ks * phongSpecular(N, L, V, material.shininess)
  else if (model === 'blinn-phong') specular = material.ks * blinnPhongSpecular(N, L, V, material.shininess)
  else if (model === 'cook-torrance') {
    specular = material.ks * cookTorranceSpecular(N, L, V, material.roughness, material.F0) * Math.max(0, dot(N, L))
  }
  for (let ch = 0; ch < 3; ch++) out[ch] = diffuse * base[ch] + specular * (material.metal ? base[ch] : 1)
  return out
}
// @end

export function renderScene(scene, camera, opts, out) {
  const { width, height } = opts
  const shading = opts.shading ?? 'phong'
  const model = opts.model ?? 'blinn-phong'
  const shadows = opts.shadows ?? true
  const cull = opts.cull ?? true
  const ambient = scene.ambient ?? 0.12
  const intensity = scene.light.intensity ?? 1
  const lightPos = scene.light.position
  const env = scene.environment ?? ((d, rgb) => { rgb[0] = rgb[1] = rgb[2] = 0.5; return rgb })
  const materials = scene.meshes.map((mesh) => withMaterialDefaults(mesh.material))
  const specularOnly = materials.map((m) => ({ ...m, kd: 0 })) // 映り込み・ガラスのハイライト用
  const VP = cameraViewProjection(camera, width / height)
  const eye = camera.eye

  const n = width * height
  const depth = new Float32Array(n).fill(Infinity)
  const meshId = new Int16Array(n).fill(-1)
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const direct = new Float32Array(n * 3) // フラット・グローのときの、面か頂点で決めた直接光の色
  let triangles = 0

  const N = [0, 0, 0]
  const L = [0, 0, 0]
  const V = [0, 0, 0]
  const p = [0, 0, 0]
  const tmp = [0, 0, 0]
  const spec = [0, 0, 0]
  const base = [0, 0, 0]
  const col = [0, 0, 0]

  // 頂点(グロー)や面の中心(フラット)で、直接光の色を決める
  const lightAt = (material, point, normal, rgb) => {
    normalize(sub(lightPos, point, L), L)
    normalize(sub(eye, point, V), V)
    baseColor(material, point, base)
    return directLight(model, material, normal, L, V, base, rgb)
  }

  scene.meshes.forEach((mesh, id) => {
    const material = materials[id]
    const verts = mesh.positions.map((q) => projectVertex(VP, q, width, height))
    const vertexColors = shading === 'gouraud'
      ? mesh.positions.map((q, i) => lightAt(material, q, mesh.normals[i], [0, 0, 0]))
      : null
    for (const [i, j, k] of mesh.faces) {
      const a = verts[i]
      const b = verts[j]
      const c = verts[k]
      if (!a || !b || !c) continue
      // 画素の座標は y が下向きなので、表(反時計回り)の三角形の面積は負になる。0 以上は裏か、つぶれた三角形
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (cull && area >= 0) continue
      triangles++
      const pa = mesh.positions[i]
      const pb = mesh.positions[j]
      const pc = mesh.positions[k]
      const na = mesh.normals[i]
      const nb = mesh.normals[j]
      const nc = mesh.normals[k]
      const fn = faceNormal(pa, pb, pc)
      const flatColor = shading === 'flat'
        ? lightAt(material, [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3], fn, [0, 0, 0])
        : null
      const ca = vertexColors?.[i]
      const cb = vertexColors?.[j]
      const cc = vertexColors?.[k]
      rasterTriangle(a, b, c, width, height, (x, y, l0, l1, l2) => {
        const z = l0 * a[2] + l1 * b[2] + l2 * c[2]
        const idx = y * width + x
        if (!(z < depth[idx])) return
        depth[idx] = z
        meshId[idx] = id
        // 透視をかけた補間: 画面の重心座標を 1/w で重みづけし直す
        const w0 = l0 * a[3]
        const w1 = l1 * b[3]
        const w2 = l2 * c[3]
        const s = 1 / (w0 + w1 + w2)
        const q0 = w0 * s
        const q1 = w1 * s
        const q2 = w2 * s
        const o = idx * 3
        pos[o] = q0 * pa[0] + q1 * pb[0] + q2 * pc[0]
        pos[o + 1] = q0 * pa[1] + q1 * pb[1] + q2 * pc[1]
        pos[o + 2] = q0 * pa[2] + q1 * pb[2] + q2 * pc[2]
        if (flatColor) {
          nrm[o] = fn[0]
          nrm[o + 1] = fn[1]
          nrm[o + 2] = fn[2]
          direct[o] = flatColor[0]
          direct[o + 1] = flatColor[1]
          direct[o + 2] = flatColor[2]
          return
        }
        nrm[o] = q0 * na[0] + q1 * nb[0] + q2 * nc[0]
        nrm[o + 1] = q0 * na[1] + q1 * nb[1] + q2 * nc[1]
        nrm[o + 2] = q0 * na[2] + q1 * nb[2] + q2 * nc[2]
        if (ca) {
          direct[o] = q0 * ca[0] + q1 * cb[0] + q2 * cc[0]
          direct[o + 1] = q0 * ca[1] + q1 * cb[1] + q2 * cc[1]
          direct[o + 2] = q0 * ca[2] + q1 * cb[2] + q2 * cc[2]
        }
      })
    }
  })

  // 影の表(光源から場面の中心を見る)
  const shadowFov = opts.shadowFov ?? 1.6
  const shadowSize = opts.shadowSize ?? 512
  const shadowMap = shadows
    ? renderDepthMap(scene, {
      eye: lightPos,
      target: opts.shadowTarget ?? [0, 0.5, 0],
      up: Math.abs(lightPos[0]) + Math.abs(lightPos[2]) < 1e-6 ? [0, 0, -1] : [0, 1, 0],
      fov: shadowFov,
      near: 0.1,
      far: 100,
    }, shadowSize)
    : null
  const bias = opts.shadowBias ?? 0.03
  // 表の 1 マスが世界で占める幅(奥行き 1 あたり)。マスの中で奥行きが変わる分だけずらしを足さないと、
  // 光に対して斜めの面に縞の偽の影(シャドウアクネ)が出る
  const texelPerDepth = (2 * Math.tan(shadowFov / 2)) / shadowSize

  // 背景の光線の向き(カメラの基底)
  const f = normalize(sub(camera.target, eye))
  const right = normalize(cross(f, camera.up ?? [0, 1, 0]))
  const up = cross(right, f)
  const th = Math.tan(camera.fov / 2)
  const aspect = width / height
  const R = [0, 0, 0]
  const T = [0, 0, 0]
  const I = [0, 0, 0]
  const envR = [0, 0, 0]
  const envT = [0, 0, 0]
  let pixels = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const id = meshId[idx]
      const o4 = idx * 4
      if (id < 0) {
        const sx = ((x + 0.5) / width) * 2 - 1
        const sy = 1 - ((y + 0.5) / height) * 2
        for (let ch = 0; ch < 3; ch++) tmp[ch] = f[ch] + sx * th * aspect * right[ch] + sy * th * up[ch]
        env(normalize(tmp, tmp), col)
      } else {
        pixels++
        const material = materials[id]
        const o = idx * 3
        p[0] = pos[o]
        p[1] = pos[o + 1]
        p[2] = pos[o + 2]
        N[0] = nrm[o]
        N[1] = nrm[o + 1]
        N[2] = nrm[o + 2]
        normalize(N, N)
        normalize(sub(lightPos, p, L), L)
        normalize(sub(eye, p, V), V)
        baseColor(material, p, base)
        let lit = 1
        const nl = dot(N, L)
        if (shadowMap && nl > 0) {
          const s = shadowLookup(shadowMap, p)
          if (s) {
            // 面の傾き(光の向きとの角の tan)に比例して、1 マス分の奥行きの変化をずらしに足す
            const slope = Math.min(4, Math.sqrt(Math.max(0, 1 - nl * nl)) / Math.max(nl, 1e-3))
            if (inShadow(s.dC, s.dL, bias + texelPerDepth * s.dC * (1 + slope))) lit = 0
          }
        }
        if (material.kind === 'paint') {
          if (shading === 'phong') directLight(model, material, N, L, V, base, tmp)
          else {
            tmp[0] = direct[o]
            tmp[1] = direct[o + 1]
            tmp[2] = direct[o + 2]
          }
          for (let ch = 0; ch < 3; ch++) col[ch] = ambient * base[ch] + lit * intensity * tmp[ch]
        } else {
          // 映り込み・ガラス: 目から来る光線 I = −V を反射・屈折させた向きで、環境の色を 1 回だけ取る(環境マッピング)。
          // 光源のハイライト(鏡面の分だけ)は画素ごとに足す
          directLight(model, specularOnly[id], N, L, V, base, spec)
          I[0] = -V[0]
          I[1] = -V[1]
          I[2] = -V[2]
          reflectIncident(I, N, R)
          env(normalize(R, R), envR)
          const cosV = Math.max(0, dot(N, V))
          if (material.kind === 'mirror') {
            const F = fresnelSchlick(0.8, cosV)
            for (let ch = 0; ch < 3; ch++) col[ch] = F * envR[ch] + lit * intensity * spec[ch]
          } else {
            const F = fresnelSchlick(material.F0, cosV)
            if (refract(I, N, 1 / material.ior, T)) env(normalize(T, T), envT)
            else {
              envT[0] = envR[0]
              envT[1] = envR[1]
              envT[2] = envR[2]
            }
            for (let ch = 0; ch < 3; ch++) {
              col[ch] = F * envR[ch] + (1 - F) * envT[ch] * (0.6 + 0.4 * base[ch]) + lit * intensity * spec[ch]
            }
          }
        }
      }
      out[o4] = Math.max(0, Math.min(1, col[0])) * 255
      out[o4 + 1] = Math.max(0, Math.min(1, col[1])) * 255
      out[o4 + 2] = Math.max(0, Math.min(1, col[2])) * 255
      out[o4 + 3] = 255
    }
  }
  return { triangles, pixels }
}
