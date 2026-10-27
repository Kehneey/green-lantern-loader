import * as THREE from "three";

// Smooth normals that keep hard edges, weighted by triangle area.
//
// Three's toCreasedNormals weights every triangle equally, so on simplified
// meshes the long thin "sliver" triangles add speckled noise to smooth
// surfaces. Weighting by area lets the big faces dominate, which gives clean
// highlights on curves while edges sharper than `creaseAngle` stay crisp.
export function creasedNormals(geometry, creaseAngle = THREE.MathUtils.degToRad(40)) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = flat.attributes.position;
  const count = pos.count;
  const triangles = count / 3;

  flat.computeBoundingBox();
  const size = flat.boundingBox.getSize(new THREE.Vector3()).length();
  const snap = 1 / (size * 1e-5 || 1e-5);

  const weighted = new Float32Array(triangles * 3);
  const unit = new Float32Array(triangles * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let t = 0; t < triangles; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac); // length = 2 × area: the weight

    weighted[t * 3] = ab.x;
    weighted[t * 3 + 1] = ab.y;
    weighted[t * 3 + 2] = ab.z;

    const len = ab.length() || 1;
    unit[t * 3] = ab.x / len;
    unit[t * 3 + 1] = ab.y / len;
    unit[t * 3 + 2] = ab.z / len;
  }

  // Group triangle corners that share a position.
  const groups = new Map();
  const keys = new Array(count);

  for (let i = 0; i < count; i++) {
    const key = `${Math.round(pos.getX(i) * snap)},${Math.round(pos.getY(i) * snap)},${Math.round(pos.getZ(i) * snap)}`;
    keys[i] = key;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push((i / 3) | 0);
  }

  const cos = Math.cos(creaseAngle);
  const normals = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const t = (i / 3) | 0;
    const tx = unit[t * 3];
    const ty = unit[t * 3 + 1];
    const tz = unit[t * 3 + 2];
    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (const u of groups.get(keys[i])) {
      if (tx * unit[u * 3] + ty * unit[u * 3 + 1] + tz * unit[u * 3 + 2] < cos) continue;
      nx += weighted[u * 3];
      ny += weighted[u * 3 + 1];
      nz += weighted[u * 3 + 2];
    }

    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }

  flat.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return flat;
}
