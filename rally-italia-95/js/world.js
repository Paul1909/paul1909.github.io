// Builds the 3D scenery for a track: sky, terrain, road, walls, gates and props.
import * as THREE from '../vendor/three.module.min.js';
import { lambert, box, hexa, merge, paint, rng, bannerTex } from './gfx.js';

const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildWorld(scene, tr, T) {
  const def = tr.def, W = tr.W, N = tr.N, R = rng(def.id.length * 7919 + 3);
  const root = new THREE.Group(); scene.add(root);
  const add = m => { root.add(m); return m; };
  const vcol = lambert({ vertexColors: true });
  const nx = i => -tr.tz[i], nz = i => tr.tx[i];
  const P = (i, lat) => [tr.xs[i] + nx(i) * lat, tr.zs[i] + nz(i) * lat];

  // ---- sky dome, clouds, distant mountains ----
  const sky = new THREE.SphereGeometry(1700, 16, 10);
  const top = new THREE.Color(def.sky[0]), hor = new THREE.Color(def.sky[1]);
  const sc = new Float32Array(sky.attributes.position.count * 3);
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const y = sky.attributes.position.getY(i) / 1700; const c = hor.clone().lerp(top, Math.min(1, Math.max(0, y * 2.2)));
    sc.set([c.r, c.g, c.b], i * 3);
  }
  sky.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.renderOrder = -10; scene.add(skyMesh);

  const [cx, cz] = tr.center, far = [];
  const mountainCol = { toscana: [0x6f8f7a, null], passo: [0x7d8796, 0xf4f6fa], riviera: [0x5f8a62, null] }[def.id];
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2 + R() * 0.2, dist = 950 + R() * 300;
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    if (def.id === 'riviera' && z < cz - 100) continue; // sea side stays open
    const h = def.id === 'passo' ? 280 + R() * 260 : 70 + R() * 90, r = h * (def.id === 'passo' ? 0.9 : 2.2);
    const g = paint(new THREE.ConeGeometry(r, h, 5).translate(x, h / 2 - 20 + tr.ys[0], z), mountainCol[0]);
    far.push(g);
    if (mountainCol[1]) far.push(paint(new THREE.ConeGeometry(r * 0.3, h * 0.3, 5).translate(x, h * 0.85 - 20 + tr.ys[0] + 1, z), mountainCol[1]));
  }
  const clouds = [];
  for (let k = 0; k < 14; k++) {
    const a = R() * Math.PI * 2, dist = 300 + R() * 700;
    clouds.push(paint(new THREE.IcosahedronGeometry(30 + R() * 30, 0).scale(1.8, 0.35, 1).translate(cx + Math.sin(a) * dist, 260 + R() * 90 + tr.ys[0], cz + Math.cos(a) * dist), 0xffffff));
  }
  const farMat = lambert({ vertexColors: true, fog: false });
  add(new THREE.Mesh(merge(far), farMat));
  add(new THREE.Mesh(merge(clouds), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 })));

  // ---- ground ----
  const b = tr.bounds, M = def.id === 'passo' ? 360 : 420;
  const minX = b.minX - M, maxX = b.maxX + M, minZ = b.minZ - M, maxZ = b.maxZ + M;
  const cell = Math.max(6, Math.sqrt((maxX - minX) * (maxZ - minZ) / 26000));
  const cols = Math.ceil((maxX - minX) / cell), rows = Math.ceil((maxZ - minZ) / cell);
  const gpos = [], gcol = [], guv = [], gidx = [];
  const field = (x, z) => { const u = Math.floor((x * 0.8 + z * 0.6) / 70), v = Math.floor((-x * 0.6 + z * 0.8) / 55); return Math.abs((u * 73856093) ^ (v * 19349663)) % 4; };
  const fieldCols = [[0.85, 0.75, 0.42], [0.55, 0.66, 0.36], [0.68, 0.72, 0.4], [0.66, 0.52, 0.36]].map(c => new THREE.Color(...c));
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const x = minX + c * cell, z = minZ + r * cell, y = tr.groundAt(x, z);
    gpos.push(x, y, z); guv.push(x / 6, z / 6);
    const near = tr.nearestFar(x, z, 40); const d = near ? near.d : 99;
    let col;
    if (def.id === 'toscana') col = fieldCols[field(x, z)].clone().lerp(new THREE.Color(0.58, 0.66, 0.38), 1 - smooth01(W / 2 + 6, W / 2 + 26, d));
    else if (def.id === 'passo') {
      const h = y - tr.ys[0];
      col = new THREE.Color(0.38, 0.55, 0.3).lerp(new THREE.Color(0.55, 0.53, 0.5), smooth01(150, 260, h)).lerp(new THREE.Color(0.95, 0.96, 1), smooth01(300, 360, h));
      col.multiplyScalar(0.92 + R() * 0.12);
    } else col = z < -18 ? new THREE.Color(0.9, 0.82, 0.62) : new THREE.Color(0.86, 0.8, 0.7).multiplyScalar(0.92 + R() * 0.1);
    gcol.push(col.r, col.g, col.b);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b2 = a + 1, d = a + cols + 1, e = d + 1;
    gidx.push(a, d, b2, b2, d, e);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  gg.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2));
  gg.setIndex(gidx); gg.computeVertexNormals();
  add(new THREE.Mesh(gg, lambert({ vertexColors: true, map: def.id === 'riviera' ? T.paving : T.grass })));

  if (def.id === 'riviera') {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1600).rotateX(-Math.PI / 2), lambert({ color: 0x2d6fae }));
    sea.position.set(cx, -1.1, -24 - 800); add(sea);
  }

  // ---- ribbons along the track ----
  function ribbon(f, mat, vLen = 8) {
    const pos = [], uv = [], idx = [];
    const count = tr.closed ? N + 1 : N;
    for (let k = 0; k < count; k++) {
      const i = k % N, [a, bb] = f(i);
      pos.push(...a, ...bb); const v = (k * tr.ds) / vLen; uv.push(0, v, 1, v);
      if (k) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return add(new THREE.Mesh(g, mat));
  }
  const roadTex = { gravel: T.gravel, tarmac: T.tarmac, cobble: T.cobble }[def.surface];
  const roadMat = lambert({ map: roadTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // road: lat from -W/2 (u=0) to +W/2 (u=1)
  ribbon(i => { const [ax, az] = P(i, -W / 2), [bx, bz] = P(i, W / 2); const y = tr.ys[i] + 0.06; return [[ax, y, az], [bx, y, bz]]; },
    roadMat, def.surface === 'cobble' ? 3.3 : 8);
  if (def.surface === 'cobble') { T.cobble.repeat.set(3, 1); }

  const shoulderCol = { toscana: 0xb9a57a, passo: 0x8b8578, riviera: 0xcfc6b4 }[def.id];
  for (const side of [-1, 1]) {
    if (def.id === 'riviera') {
      // raised sidewalk + curb
      ribbon(i => { const [ax, az] = P(i, side * W / 2), y = tr.ys[i]; return [[ax, y + 0.06, az], [ax, y + 0.2, az]]; }, lambert({ color: 0x9d968a, side: THREE.DoubleSide }));
      ribbon(i => { const [ax, az] = P(i, side * W / 2), [bx, bz] = P(i, side * (W / 2 + 2.4)), y = tr.ys[i] + 0.2; return side < 0 ? [[bx, y, bz], [ax, y, az]] : [[ax, y, az], [bx, y, bz]]; },
        lambert({ map: T.paving, side: THREE.DoubleSide }), 2);
      // balustrade / wall line behind the sidewalk
      ribbon(i => { const [ax, az] = P(i, side * def.wall), y = tr.ys[i]; return [[ax, y - 0.3, az], [ax, y + 1.0, az]]; }, lambert({ color: 0xe6dccb, side: THREE.DoubleSide }));
    } else {
      ribbon(i => { const [ax, az] = P(i, side * W / 2), [bx, bz] = P(i, side * (W / 2 + 1.8)), y = tr.ys[i]; return side < 0 ? [[bx, y - 0.28, bz], [ax, y + 0.05, az]] : [[ax, y + 0.05, az], [bx, y - 0.28, bz]]; },
        lambert({ color: shoulderCol, side: THREE.DoubleSide }));
    }
    if (def.id === 'toscana') {
      // dry-stone wall at the field edge
      ribbon(i => { const [ax, az] = P(i, side * def.wall), y = tr.groundAt(ax, az); return [[ax, y - 0.4, az], [ax, y + 0.9, az]]; },
        lambert({ map: T.stone, side: THREE.DoubleSide }), 4);
    }
    if (def.id === 'passo') {
      // steel guard rail
      ribbon(i => { const [ax, az] = P(i, side * def.wall), y = tr.ys[i]; return [[ax, y + 0.4, az], [ax, y + 0.85, az]]; },
        lambert({ color: 0xb4bac2, side: THREE.DoubleSide }));
    }
  }

  // ---- props (instanced) ----
  const props = {};
  const propGeo = {
    cypress: merge([paint(new THREE.ConeGeometry(1, 8.5, 6).translate(0, 5, 0), 0x2c4a2a), box(0.35, 1, 0.35, 0x5a4030, 0, 0.5, 0)]),
    umbrella: merge([paint(new THREE.CylinderGeometry(0.22, 0.32, 6.5, 5).translate(0, 3.2, 0), 0x6b4a32), paint(new THREE.IcosahedronGeometry(3.2, 0).scale(1.4, 0.45, 1.4).translate(0, 6.8, 0), 0x3d5e32)]),
    olive: merge([paint(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5).translate(0, 0.8, 0), 0x6a5a48), paint(new THREE.IcosahedronGeometry(1.7, 0).scale(1.2, 0.85, 1.2).translate(0, 2.4, 0), 0x8a9a68)]),
    pine: merge([paint(new THREE.ConeGeometry(2.2, 5, 6).translate(0, 4, 0), 0x274a33), paint(new THREE.ConeGeometry(1.6, 4, 6).translate(0, 6.8, 0), 0x2e5539), box(0.4, 1.6, 0.4, 0x4f3a2a, 0, 0.8, 0)]),
    rock: paint(new THREE.DodecahedronGeometry(1.4, 0).scale(1.3, 0.8, 1), 0x8f8a82),
    bale: paint(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 8).rotateZ(Math.PI / 2).translate(0, 0.75, 0), 0xd9be63),
    vine: merge([box(0.5, 1.3, 1, 0x4c6a2c, 0, 0.65, 0)]),
    person: merge([box(0.5, 1.15, 0.32, 0xffffff, 0, 0.58, 0), box(0.3, 0.3, 0.3, 0xe8c4a0, 0, 1.32, 0)]),
    post: merge([box(0.16, 0.9, 0.16, 0xf0f0f0, 0, 0.45, 0), box(0.17, 0.18, 0.17, 0x111111, 0, 0.82, 0)]),
    palm: merge([paint(new THREE.CylinderGeometry(0.2, 0.3, 7, 5).translate(0, 3.5, 0), 0x7a6046),
      ...[0, 1, 2, 3, 4, 5].map(k => box(0.6, 0.08, 3.2, 0x4f7f34, 0, 0, 1.4).rotateX(0.35).rotateY(k * Math.PI / 3).translate(0, 7, 0))]),
    lamp: merge([box(0.15, 4.5, 0.15, 0x2a2a2a, 0, 2.25, 0), box(0.9, 0.12, 0.12, 0x2a2a2a, 0.4, 4.5, 0), box(0.3, 0.25, 0.3, 0xfff0b0, 0.8, 4.35, 0)]),
  };
  const put = (type, x, z, ry = R() * 6.28, s = 1, color = null, y = null) => {
    (props[type] ||= []).push({ x, y: y ?? tr.groundAt(x, z), z, ry, s, color });
  };
  const clearOfRoad = (x, z, min) => { const n = tr.nearestFar(x, z, min + 2); return !n || n.d >= min; };

  if (def.id === 'toscana') {
    // cypress avenues along some stretches, umbrella pines and olives in fields, vineyards, hay bales
    for (let i = 0; i < N; i += 6) {
      const avenue = Math.sin(i / 60) > 0.35;
      for (const side of [-1, 1]) {
        if (avenue) { const [x, z] = P(i, side * (def.wall + 2.5)); if (clearOfRoad(x, z, def.wall + 1)) put('cypress', x, z, 0, 0.9 + R() * 0.3); }
        if (R() < 0.25) { const [x, z] = P(i, side * (def.wall + 8 + R() * 60)); if (clearOfRoad(x, z, def.wall + 3)) put(R() < 0.5 ? 'umbrella' : 'olive', x, z, R() * 6, 0.8 + R() * 0.5); }
      }
      if (Math.abs(tr.curv[i]) > 1 / 45 && i % 12 === 0) {
        const side = Math.sign(tr.curv[i]); const [x, z] = P(i, side * (def.wall - 1.2));
        put('bale', x, z, Math.atan2(tr.tx[i], tr.tz[i]));
      }
    }
    // vineyards: rectangular patches of rows
    for (let k = 0; k < 18; k++) {
      const i = Math.floor(R() * N), side = R() < 0.5 ? -1 : 1, [vx, vz] = P(i, side * (def.wall + 18 + R() * 40));
      const ang = R() * Math.PI;
      for (let row = 0; row < 7; row++) for (let seg = 0; seg < 8; seg++) {
        const lx = (row - 3) * 3, lz = (seg - 4) * 3.2;
        const x = vx + Math.cos(ang) * lx + Math.sin(ang) * lz, z = vz - Math.sin(ang) * lx + Math.cos(ang) * lz;
        if (clearOfRoad(x, z, def.wall + 2)) put('vine', x, z, ang, 1, null);
      }
    }
    // farmhouses (casali)
    const houses = [];
    for (let k = 0; k < 9; k++) {
      const i = Math.floor(R() * N), side = R() < 0.5 ? -1 : 1, [x, z] = P(i, side * (def.wall + 22 + R() * 50));
      if (!clearOfRoad(x, z, def.wall + 14)) continue;
      const y = tr.groundAt(x, z), ry = R() * 6.28, w = 9 + R() * 5, d = 7 + R() * 3, h = 5 + R() * 2;
      const g = merge([box(w, h + 2, d, 0xd8a56a, 0, (h + 2) / 2 - 2, 0), roofGeo(w + 0.6, d + 0.6, h, 2.2, 0xb4532e),
        box(3.2, h + 4, 3.2, 0xcf9a60, w / 2 - 1.6, (h + 4) / 2 - 2, -d / 2 + 1.6), roofGeo(3.6, 3.6, h + 2, 1.4, 0xb4532e).translate(w / 2 - 1.6, 0, -d / 2 + 1.6),
        ...[-1, 0, 1].map(q => box(0.9, 1.2, 0.1, 0x3a2a20, q * w / 3.2, h - 1.6, d / 2 + 0.01)),
        ...[-1, 1].map(q => box(0.9, 1.2, 0.1, 0x3a2a20, q * w / 4, 0.8, d / 2 + 0.01))]);
      g.rotateY(ry).translate(x, y, z); houses.push(g);
    }
    if (houses.length) add(new THREE.Mesh(merge(houses), vcol));
  }

  if (def.id === 'passo') {
    for (let i = 0; i < N; i += 2) {
      for (const side of [-1, 1]) {
        if (i % 4 === 0) { const [x, z] = P(i, side * (def.wall + 0.05)); put('post', x, z, 0, 1, null, tr.ys[i]); }
        if (R() < 0.3) { const [x, z] = P(i, side * (def.wall + 3 + R() * 45)); if (clearOfRoad(x, z, def.wall + 2)) put(R() < 0.8 ? 'pine' : 'rock', x, z, R() * 6, 0.8 + R() * 0.6); }
      }
      if (Math.abs(tr.curv[i]) > 1 / 26 && R() < 0.55) { // fans at the hairpins
        const side = Math.sign(tr.curv[i]); const [x, z] = P(i, side * (def.wall + 2 + R() * 4));
        if (clearOfRoad(x, z, def.wall + 1.5)) put('person', x, z, Math.atan2(-nx(i) * side, -nz(i) * side), 1, new THREE.Color().setHSL(R(), 0.7, 0.5));
      }
    }
    for (let k = 0; k < 500; k++) { // forest beyond
      const x = b.minX - 200 + R() * (b.maxX - b.minX + 400), z = b.minZ - 150 + R() * (b.maxZ - b.minZ + 300);
      if (clearOfRoad(x, z, def.wall + 6) && tr.groundAt(x, z) - tr.ys[0] < 220) put(R() < 0.85 ? 'pine' : 'rock', x, z, R() * 6, 0.8 + R() * 0.7);
    }
  }

  if (def.id === 'riviera') {
    const facadeMat = lambert({ map: T.facade, vertexColors: true });
    const walls = [], roofs = [];
    const pastel = [0xf0c27a, 0xe9a07a, 0xf3dfa0, 0xe8b4a0, 0xd88a5e, 0xf2e6c8, 0xc9d6a8];
    const occ = new Set(); const key = (x, z) => Math.floor(x / 6) + ',' + Math.floor(z / 6);
    const building = (x, z, ry, w, d, h) => {
      const y = tr.groundAt(x, z) - 0.5;
      const g = facadeBox(w, h, d, pastel[Math.floor(R() * pastel.length)]); g.rotateY(ry).translate(x, y, z); walls.push(g);
      const rf = roofGeo(w + 0.5, d + 0.5, h, 1.6 + R(), 0xb85a34); rf.rotateY(ry).translate(x, y, z); roofs.push(rf);
      for (let a = -w / 2; a <= w / 2; a += 3) for (let c = -d / 2; c <= d / 2; c += 3) {
        const ox = x + Math.cos(ry) * a + Math.sin(ry) * c, oz = z - Math.sin(ry) * a + Math.cos(ry) * c; occ.add(key(ox, oz));
      }
    };
    const fits = (x, z, ry, w, d, min) => {
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const ox = x + Math.cos(ry) * a * w / 2 + Math.sin(ry) * c * d / 2, oz = z - Math.sin(ry) * a * w / 2 + Math.cos(ry) * c * d / 2;
        if (!clearOfRoad(ox, oz, min) || oz < -20 || occ.has(key(ox, oz))) return false;
      }
      return true;
    };
    for (const side of [-1, 1]) {
      let s = 0;
      while (s < tr.L) {
        const w = 9 + R() * 6, d = 10 + R() * 5, h = 9 + R() * 9;
        const p = tr.at(s + w / 2, side * (def.wall + 0.3 + d / 2)), ry = Math.atan2(p.fx, p.fz);
        if (fits(p.x, p.z, ry, w, d, def.wall - 0.2)) { building(p.x, p.z, ry, w, d, h); s += w + (R() < 0.15 ? 8 : 0.3); }
        else s += 3;
      }
    }
    // old town fill, campanile and dome
    let bestA = null, bestB = null;
    for (let x = b.minX - 120; x < b.maxX + 120; x += 17) for (let z = -10; z < b.maxZ + 140; z += 17) {
      const n = tr.nearestFar(x, z, 60), dd = n ? n.d : 60;
      if (dd > 30 && x > b.minX && x < b.maxX && z > 20 && z < b.maxZ) {
        if (!bestA || dd > bestA.d) { bestB = bestA; bestA = { x, z, d: dd }; } else if (!bestB || dd > bestB.d) bestB = { x, z, d: dd };
      }
      const w = 10 + R() * 5, d = 10 + R() * 5;
      if (fits(x, z, 0, w + 2, d + 2, def.wall + 3)) building(x + R() * 2, z + R() * 2, 0, w, d, 8 + R() * 12);
    }
    if (bestA) {
      const y = tr.groundAt(bestA.x, bestA.z);
      const t = merge([box(7, 36, 7, 0xb5694a, 0, 18, 0), box(7.6, 1, 7.6, 0xe6d6b8, 0, 28, 0), box(7.2, 5, 7.2, 0x2a2018, 0, 31.5, 0),
        box(7.8, 1, 7.8, 0xe6d6b8, 0, 34.5, 0), paint(new THREE.ConeGeometry(5.2, 7, 4).rotateY(Math.PI / 4).translate(0, 38.5, 0), 0x9a4a2c)]);
      t.translate(bestA.x, y - 1, bestA.z); roofs.push(t);
    }
    if (bestB) {
      const y = tr.groundAt(bestB.x, bestB.z);
      const d = merge([box(22, 14, 30, 0xeee2c8, 0, 7, 0), paint(new THREE.CylinderGeometry(8, 8, 6, 10).translate(0, 17, 0), 0xe6d6b8),
        paint(new THREE.SphereGeometry(8, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 20, 0), 0x8a9aa0), box(1.6, 3, 1.6, 0xe6d6b8, 0, 29, 0)]);
      d.translate(bestB.x, y - 1, bestB.z); roofs.push(d);
    }
    if (walls.length) add(new THREE.Mesh(merge(walls), facadeMat));
    if (roofs.length) add(new THREE.Mesh(merge(roofs), vcol));
    // seafront palms and street lamps
    for (let i = 0; i < N; i += 7) for (const side of [-1, 1]) {
      const [x, z] = P(i, side * (W / 2 + 1.4));
      if (z < -6 && i % 14 === 0) put('palm', x, z, R() * 6, 0.9 + R() * 0.3, null, tr.ys[i] + 0.2);
      else if (i % 21 === 0) put('lamp', x, z, Math.atan2(-nx(i) * side, -nz(i) * side) - Math.PI / 2, 1, null, tr.ys[i] + 0.2);
    }
    // a few spectators on the sidewalks
    for (let i = 0; i < N; i += 3) if (Math.abs(tr.curv[i]) > 1 / 30 && R() < 0.5) {
      const side = Math.sign(tr.curv[i]), [x, z] = P(i, side * (W / 2 + 1.2 + R()));
      put('person', x, z, Math.atan2(-nx(i) * side, -nz(i) * side), 1, new THREE.Color().setHSL(R(), 0.7, 0.5), tr.ys[i] + 0.2);
    }
  }

  const dummy = new THREE.Object3D();
  for (const [type, list] of Object.entries(props)) {
    const mesh = new THREE.InstancedMesh(propGeo[type], vcol, list.length);
    list.forEach((p, k) => {
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      if (p.color || type === 'person') mesh.setColorAt(k, p.color || new THREE.Color(1, 1, 1));
    });
    add(mesh);
  }

  // ---- gates ----
  const gates = [];
  const gateAt = (sPos, text, bg, checker) => {
    const p = tr.at(sPos), ry = Math.atan2(p.fx, p.fz), span = W + 2.4;
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = ry;
    const poleMat = lambert({ color: 0xeeeeee });
    for (const sx of [-1, 1]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.2, 0.5), poleMat); pole.position.set(sx * span / 2, 3.1, 0); g.add(pole); }
    const tex = bannerTex(text, bg);
    const side = lambert({ color: bg });
    const ban = new THREE.Mesh(new THREE.BoxGeometry(span + 0.5, 1.5, 0.4), [side, side, side, side, lambert({ map: tex }), lambert({ map: tex })]);
    ban.position.y = 6.2; g.add(ban);
    if (checker) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.4).rotateX(-Math.PI / 2), lambert({ map: T.checker, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      T.checker.repeat.set(1, 1); line.position.y = 0.1; g.add(line);
    }
    add(g); gates.push(g);
  };
  const lap0 = tr.targets.filter(t => t.lap === 0);
  for (const t of lap0) {
    const sPos = tr.startS + t.at;
    if (t.kind === 'cp') gateAt(sPos, 'CHECKPOINT', '#d6a013');
    else gateAt(sPos, tr.closed ? 'START · FINISH' : 'FINISH', '#c81d25', true);
  }
  if (!tr.closed) gateAt(tr.startS, 'START', '#1f5fc2', true);

  return { root, sky: skyMesh, dispose() { scene.remove(root); scene.remove(skyMesh); root.traverse(o => { o.geometry?.dispose(); }); } };
}

// hip roof sitting on top of a w x d footprint at height h
function roofGeo(w, d, h, rise, color) {
  const v = (x, y, z) => [x, y, z];
  return hexa([v(-w / 2, h, -d / 2), v(w / 2, h, -d / 2), v(w / 2, h, d / 2), v(-w / 2, h, d / 2),
    v(-w / 2 + d * 0.3, h + rise, -0.01), v(w / 2 - d * 0.3, h + rise, -0.01), v(w / 2 - d * 0.3, h + rise, 0.01), v(-w / 2 + d * 0.3, h + rise, 0.01)],
  { top: color, bottom: color, front: color, back: color, left: color, right: color });
}

// four textured walls; u = window bays (4 m), v = floors (3.2 m); vertex colour tints the plaster
function facadeBox(w, h, d, color) {
  const pos = [], uv = [], col = [], C = new THREE.Color(color);
  const wall = (x0, z0, x1, z1, len) => {
    const uMax = Math.max(1, Math.round(len / 4)), vMax = Math.max(1, Math.round(h / 3.2));
    const quad = [[x0, 0, z0, 0, 0], [x1, 0, z1, uMax, 0], [x1, h, z1, uMax, vMax], [x0, h, z0, 0, vMax]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const q = quad[k]; pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); col.push(C.r, C.g, C.b); }
  };
  const X = w / 2, Z = d / 2;
  wall(-X, Z, X, Z, w); wall(X, -Z, -X, -Z, w); wall(X, Z, X, -Z, d); wall(-X, -Z, -X, Z, d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
