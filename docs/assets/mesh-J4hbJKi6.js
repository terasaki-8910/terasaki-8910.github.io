const n=`// 描画用の三角形のメッシュを作る(DOM に触れない純関数)。
// 返す形は { positions: [[x, y, z], ...], normals: [[x, y, z], ...], faces: [[i, j, k], ...] }。
// 面の頂点は、外から見て反時計回りに並べる(raster.js・shading.js の「表」の向き)。

// 球(緯度と経度で分けた UV 球)。segments は経度の分割、rings は緯度の分割。
// 北極・南極は 1 点ずつで、法線は中心からの向き(正確な球の法線)
export function uvSphere(radius, segments, rings, center = [0, 0, 0]) {
  const positions = []
  const normals = []
  const push = (nx, ny, nz) => {
    normals.push([nx, ny, nz])
    positions.push([center[0] + radius * nx, center[1] + radius * ny, center[2] + radius * nz])
  }
  push(0, 1, 0) // 北極
  for (let r = 1; r < rings; r++) {
    const theta = (Math.PI * r) / rings
    for (let s = 0; s < segments; s++) {
      const phi = (2 * Math.PI * s) / segments
      push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
    }
  }
  push(0, -1, 0) // 南極
  const south = positions.length - 1
  const at = (r, s) => 1 + (r - 1) * segments + (s % segments)
  const faces = []
  for (let s = 0; s < segments; s++) {
    faces.push([0, at(1, s + 1), at(1, s)])
  }
  for (let r = 1; r < rings - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = at(r, s)
      const b = at(r + 1, s)
      const c = at(r + 1, s + 1)
      const d = at(r, s + 1)
      faces.push([a, c, b], [a, d, c])
    }
  }
  for (let s = 0; s < segments; s++) {
    faces.push([at(rings - 1, s), at(rings - 1, s + 1), south])
  }
  return { positions, normals, faces }
}

// 高さ y の水平な正方形(1 辺 size、中心は原点)を divisions × divisions に分けた床。表は上(+y)
export function gridPlane(size, divisions, y = 0) {
  const positions = []
  const normals = []
  const n = divisions + 1
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions.push([-size / 2 + (size * i) / divisions, y, -size / 2 + (size * j) / divisions])
      normals.push([0, 1, 0])
    }
  }
  const faces = []
  for (let j = 0; j < divisions; j++) {
    for (let i = 0; i < divisions; i++) {
      const p00 = j * n + i
      const p10 = p00 + 1
      const p01 = p00 + n
      const p11 = p01 + 1
      faces.push([p00, p01, p11], [p00, p11, p10])
    }
  }
  return { positions, normals, faces }
}
`;export{n as default};
