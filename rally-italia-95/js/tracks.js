// Track layouts: centre lines, heights and lookup helpers. No three.js here, so it can be tested in Node.
const SPACING = 2; // metres between centre-line samples

function smooth01(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Centripetal Catmull-Rom through 2D points, returns dense polyline.
function catmull(pts, closed, steps = 24) {
  const out = [], n = pts.length;
  const get = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4, 0.5);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < steps; k++) {
      const t = t1 + (t2 - t1) * k / steps;
      const L = (pa, pb, ta, tb) => [0, 1].map(j => (tb - t) / (tb - ta) * pa[j] + (t - ta) / (tb - ta) * pb[j]);
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Polyline with rounded corners (urban streets). corners: [x, z, radius]
function rounded(corners) {
  const out = [], n = corners.length;
  for (let i = 0; i < n; i++) {
    const P = corners[(i - 1 + n) % n], C = corners[i], N = corners[(i + 1) % n];
    const a = [P[0] - C[0], P[1] - C[1]], b = [N[0] - C[0], N[1] - C[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const ua = [a[0] / la, a[1] / la], ub = [b[0] / lb, b[1] / lb];
    const ang = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
    const r = C[2];
    const t = Math.min(r / Math.tan(ang / 2), la * 0.45, lb * 0.45);
    const s = [C[0] + ua[0] * t, C[1] + ua[1] * t], e = [C[0] + ub[0] * t, C[1] + ub[1] * t];
    // circular arc of radius r between the two tangent points
    const rr = t * Math.tan(ang / 2);
    const bis = [ua[0] + ub[0], ua[1] + ub[1]], bl = Math.hypot(...bis) || 1;
    const dc = rr / Math.sin(ang / 2), O = [C[0] + bis[0] / bl * dc, C[1] + bis[1] / bl * dc];
    let a0 = Math.atan2(s[1] - O[1], s[0] - O[0]), a1 = Math.atan2(e[1] - O[1], e[0] - O[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= 12; k++) { const a = a0 + da * k / 12; out.push([O[0] + Math.cos(a) * rr, O[1] + Math.sin(a) * rr]); }
  }
  return out;
}

function resample(poly, closed) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const N = Math.round(total / SPACING);
  const xs = new Float32Array(N + (closed ? 0 : 1)), zs = new Float32Array(xs.length);
  let j = 0;
  for (let i = 0; i < xs.length; i++) {
    const s = i * total / N;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    xs[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
    zs[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
  }
  return { xs, zs, total, ds: total / N };
}

// ---------- layouts ----------
function countryLayout() {
  const K = 0.82;
  return catmull([
    [0, 0], [180, -10], [330, 30], [430, 10], [520, 80], [500, 200], [400, 250], [300, 220], [230, 290],
    [270, 400], [190, 500], [60, 470], [0, 380], [-90, 420], [-200, 380], [-230, 260], [-150, 180],
    [-260, 120], [-330, 20], [-250, -60], [-120, -20],
  ].map(([x, z]) => [x * K, z * K]), true);
}

function uphillLayout() {
  const pts = [[0, -120], [0, -60], [10, -10]];
  const A = 105, R = 15, legs = 6;
  let z = 0, dir = 1, x = 10;
  for (let l = 0; l < legs; l++) {
    const xEnd = dir * A, dz = 34 + (l % 2) * 8;
    // leg with a gentle S-bend in the middle
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      pts.push([x + (xEnd - x) * t, z + dz * t + Math.sin(t * Math.PI * 2) * 7 * dir]);
    }
    pts.push([xEnd, z + dz]);
    z += dz;
    if (l < legs - 1) {
      // hairpin (tornante): half circle bulging outward
      const cx = xEnd, cz = z + R;
      for (let k = 1; k < 6; k++) {
        const a = -Math.PI / 2 + Math.PI * k / 6;
        pts.push([cx + dir * Math.cos(a) * R * 1.25, cz + Math.sin(a) * R]);
      }
      z += 2 * R;
      pts.push([xEnd, z]);
    }
    x = xEnd; dir = -dir;
  }
  // summit run-out
  const back = -dir; // keep heading the way the last leg went, then sweep up to the summit
  pts.push([x + back * 28, z + 22], [x + back * 34, z + 70], [x + back * 14, z + 135], [x - back * 18, z + 195], [x - back * 26, z + 260]);
  return catmull(pts, false, 16);
}

function urbanLayout() {
  return rounded([
    [-200, 0, 26], [20, 0, 40], [45, 9, 40], [80, 9, 40], [105, 0, 40], [260, 0, 26],
    [260, 140, 20], [150, 140, 18], [150, 90, 18], [60, 90, 18], [60, 230, 22],
    [-120, 230, 24], [-120, 120, 18], [-200, 120, 22],
  ]);
}

export const TRACKS = [
  {
    id: 'toscana', name: 'Colline Toscane', sub: 'Countryside · gravel', laps: 2, closed: true, width: 9,
    surface: 'gravel', grip: 0.9, wall: 14.3, cpFrac: [0.25, 0.5, 0.75],
    sky: [0x3a78d8, 0xcfe4f2], fog: 0xcfe4f2, fogNear: 140, fogFar: 520,
    layout: countryLayout,
    base(x, z) { return 16 * Math.sin(x / 190 + 0.5) * Math.cos(z / 230) + 7 * Math.sin((x - z) / 110); },
    farRise: 0.12,
  },
  {
    id: 'passo', name: 'Passo dello Stelvio', sub: 'Uphill challenge · tarmac', laps: 1, closed: false, width: 8,
    surface: 'tarmac', grip: 1.0, wall: 5.0, cpFrac: [0.2, 0.4, 0.6, 0.8],
    sky: [0x2c5fc4, 0xdde8f2], fog: 0xdde8f2, fogNear: 120, fogFar: 480,
    layout: uphillLayout,
    grade: 0.085,
    farRise: 0.55,
  },
  {
    id: 'riviera', name: 'Riviera Ligure', sub: 'Urban · cobblestones', laps: 2, closed: true, width: 10,
    surface: 'cobble', grip: 0.94, wall: 7.4, cpFrac: [0.33, 0.66],
    sky: [0x3d86e0, 0xf3e3c8], fog: 0xf0dfc4, fogNear: 110, fogFar: 430,
    layout: urbanLayout,
    base(x, z) { return z < -24 ? -4 : 8 * smooth01(80, 230, z); },
    farRise: 0,
  },
];

// ---------- build ----------
export function buildTrack(def) {
  const { xs, zs, total, ds } = resample(def.layout(), def.closed);
  const N = xs.length;
  const tx = new Float32Array(N), tz = new Float32Array(N), ys = new Float32Array(N), curv = new Float32Array(N), s = new Float32Array(N);
  const idx = i => def.closed ? (i + N) % N : Math.max(0, Math.min(N - 1, i));
  for (let i = 0; i < N; i++) {
    s[i] = i * ds;
    const a = idx(i - 1), b = idx(i + 1);
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // curvature: heading change over +-4 samples
  for (let i = 0; i < N; i++) {
    const a = idx(i - 4), b = idx(i + 4);
    let da = Math.atan2(tx[b], tz[b]) - Math.atan2(tx[a], tz[a]);
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const span = (def.closed ? 8 : (b - a)) * ds || 1;
    curv[i] = da / span;
  }
  // heights
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (def.grade) raw[i] = def.grade * Math.max(0, Math.min(s[i], total - 120) - 80);
    else raw[i] = def.base(xs[i], zs[i]);
  }
  const win = 15;
  for (let i = 0; i < N; i++) {
    let sum = 0, c = 0;
    for (let k = -win; k <= win; k++) { const j = def.closed ? idx(i + k) : i + k; if (j < 0 || j >= N) continue; sum += raw[j]; c++; }
    ys[i] = sum / c;
  }
  const W = def.width;
  const tr = { def, N, L: def.closed ? total : total, ds, xs, zs, ys, tx, tz, curv, s, W, closed: def.closed };

  // start / finish
  if (def.closed) { tr.startS = 0; tr.raceLen = total * def.laps; }
  else { tr.startS = 40; tr.finishS = total - 90; tr.raceLen = tr.finishS - tr.startS; }
  // checkpoint targets as absolute race distances (from the start line)
  tr.targets = [];
  const lapLen = def.closed ? total : tr.raceLen;
  for (let lap = 0; lap < def.laps; lap++) {
    for (const f of def.cpFrac) tr.targets.push({ at: lap * lapLen + f * lapLen, kind: 'cp', lap });
    tr.targets.push({ at: (lap + 1) * lapLen, kind: lap === def.laps - 1 ? 'finish' : 'lap', lap });
  }

  // spatial hash for nearest-sample queries
  const CELL = 24, grid = new Map();
  for (let i = 0; i < N; i++) {
    const k = Math.floor(xs[i] / CELL) + ',' + Math.floor(zs[i] / CELL);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  tr.nearestFar = (x, z, maxR = 72) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r = Math.ceil(maxR / CELL);
    let best = -1, bd = maxR * maxR;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const list = grid.get((cx + a) + ',' + (cz + b)); if (!list) continue;
      for (const i of list) { const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
  };
  tr.wrap = i => def.closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i));
  // project a point onto the centre line, searching near a hint index
  tr.project = (x, z, hint, range = 30) => {
    let best = hint, bd = Infinity;
    if (hint == null || hint < 0) { const r = tr.nearestFar(x, z, 400); best = r ? r.i : 0; }
    else for (let k = -range; k <= range; k++) {
      const i = tr.wrap(hint + k); const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const i = best;
    // fractional position along tangent
    const along = (x - xs[i]) * tx[i] + (z - zs[i]) * tz[i];
    const lat = -(x - xs[i]) * tz[i] + (z - zs[i]) * tx[i]; // + = right of travel direction
    let sPos = s[i] + along;
    const j = tr.wrap(i + (along >= 0 ? 1 : -1));
    const f = Math.min(1, Math.abs(along) / ds);
    const y = ys[i] + (ys[j] - ys[i]) * f;
    return { i, s: sPos, d: lat, y };
  };
  // point at distance along centre line + lateral offset
  tr.at = (sPos, lat = 0) => {
    let u = sPos / ds;
    if (def.closed) u = ((u % N) + N) % N; else u = Math.max(0, Math.min(N - 1.001, u));
    const i = Math.floor(u), j = tr.wrap(i + 1), f = u - i;
    const x = xs[i] + (xs[j] - xs[i]) * f, z = zs[i] + (zs[j] - zs[i]) * f, y = ys[i] + (ys[j] - ys[i]) * f;
    const ttx = tx[i] + (tx[j] - tx[i]) * f, ttz = tz[i] + (tz[j] - tz[i]) * f, l = Math.hypot(ttx, ttz) || 1;
    const fx = ttx / l, fz = ttz / l;
    return { x: x - fz * lat, z: z + fx * lat, y, fx, fz, i, k: curv[i] + (curv[j] - curv[i]) * f, grade: (ys[j] - ys[i]) / ds };
  };

  // terrain height away from the road
  const sub = []; for (let i = 0; i < N; i += 6) sub.push(i);
  const idw = (x, z) => {
    let ws = 0, hs = 0;
    for (const i of sub) { const d2 = (xs[i] - x) ** 2 + (zs[i] - z) ** 2 + 25; const w = 1 / (d2 * d2); ws += w; hs += w * ys[i]; }
    return hs / ws;
  };
  let cxm = 0, czm = 0; for (let i = 0; i < N; i++) { cxm += xs[i]; czm += zs[i]; }
  tr.center = [cxm / N, czm / N];
  tr.groundAt = (x, z) => {
    // nearest sample (coarse then fine)
    let bi = 0, bd = Infinity;
    for (let i = 0; i < N; i += 5) { const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    for (let k = -5; k <= 5; k++) { const i = tr.wrap(bi + k); const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const d = Math.sqrt(bd);
    const roadY = ys[bi] - 0.3;
    let base = def.grade ? idw(x, z) : def.base(x, z);
    const far = Math.max(0, d - 140);
    base += far * def.farRise + (def.grade ? 4 * Math.sin(x / 37) * Math.cos(z / 29) * smooth01(20, 80, d) : 0);
    if (def.id === 'riviera' && z < -24) return -4;
    const t = smooth01(W / 2 + 2, W / 2 + 34, d);
    return roadY + (base - roadY) * t;
  };
  tr.bounds = (() => {
    let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
    for (let i = 0; i < N; i++) { a = Math.min(a, xs[i]); b = Math.max(b, xs[i]); c = Math.min(c, zs[i]); e = Math.max(e, zs[i]); }
    return { minX: a, maxX: b, minZ: c, maxZ: e };
  })();
  return tr;
}
