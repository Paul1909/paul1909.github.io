// Grid Operator Tycoon: isometric renderer (canvas 2D, everything drawn in code).
'use strict';

const R = { cv: null, ctx: null, W: 0, H: 0, dpr: 1, cam: { x: 0, y: 0, z: 1 }, time: 0, rot: 0, parts: [], floats: [], bubbles: [], lights: [],
  overlay: null, valid: null, hover: null, ghost: null, sel: null, rain: [], tileCol: null };
const TW = 64, TH = 32;
const iso = (x, y) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 });

// ---------- colour helpers
const _rgb = {};
function rgb(h) { return _rgb[h] || (_rgb[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); }
function shade(h, f) { const [r, g, b] = rgb(h); return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A[0] + (B[0] - A[0]) * t | 0},${A[1] + (B[1] - A[1]) * t | 0},${A[2] + (B[2] - A[2]) * t | 0})`; }
const TCOL = ['#3f8fd8', '#86c75c', '#5f9e45', '#9cc463', '#9a958d', '#e6d79a', '#5aa6e0'];

function initRender(cv) {
  R.cv = cv; R.ctx = cv.getContext('2d');
  resize();
  addEventListener('resize', resize);
}
function resize() {
  R.dpr = Math.min(2, devicePixelRatio || 1);
  R.W = R.cv.clientWidth; R.H = R.cv.clientHeight;
  R.cv.width = R.W * R.dpr; R.cv.height = R.H * R.dpr;
}
function prepMap(s) {
  const M = s.map, N = M.W * M.H;
  R.tileCol = new Array(N);
  for (let i = 0; i < N; i++) {
    const t = M.t[i], j = (Math.sin(i * 12.9898) * 43758.5453) % 1, v = 0.95 + Math.abs(j) * 0.09;
    let c = TCOL[t];
    if (t === T.SEA) c = mix('#2f7fd0', '#5aa9e8', clamp((M.e[i] - 0.05) * 2.5, 0, 1));
    else c = shade(c, v);
    R.tileCol[i] = c;
  }
  // river directions per tile
  R.riv = {};
  for (const p of M.rivers) for (let k = 0; k < p.length; k++) {
    const i = p[k]; if (isWater(M.t[i])) continue;
    const a = R.riv[i] || (R.riv[i] = []);
    for (const j of [p[k - 1], p[k + 1]]) if (j !== undefined) a.push([(j % M.W) - (i % M.W), ((j / M.W) | 0) - ((i / M.W) | 0)]);
  }
}
function fitCamera(s) {
  const M = s.map, c = iso(M.W / 2, M.H / 2);
  R.cam.x = c.x; R.cam.y = c.y;
  const w = (M.W + M.H) * TW / 2, h = (M.W + M.H) * TH / 2;
  R.cam.z = clamp(Math.min(R.W / w, (R.H - 150) / h) * 1.15, 0.35, 1.6);
  if (R.W < 700) { // phones: zoom in on the towns instead of showing the whole country
    const towns = s.nodes.filter(n => n.k === 'town'), big = towns[0];
    if (big) { const c2 = iso(big.x + 0.5, big.y + 0.5); R.cam.x = c2.x * 0.6 + c.x * 0.4; R.cam.y = c2.y * 0.6 + c.y * 0.4; }
    R.cam.z = Math.max(R.cam.z, 0.72);
  }
}
function clampCam(s) {
  const M = s.map, w = (M.W + M.H) * TW / 2;
  R.cam.z = clamp(R.cam.z, 0.3, 3);
  R.cam.x = clamp(R.cam.x, -M.H * TW / 2, M.W * TW / 2);
  R.cam.y = clamp(R.cam.y, -40, (M.W + M.H) * TH / 2);
}
function toScreen(wx, wy) { const z = R.cam.z; return [(wx - R.cam.x) * z + R.W / 2, (wy - R.cam.y) * z + R.H / 2]; }
function screenToTile(sx, sy) {
  const z = R.cam.z, wx = (sx - R.W / 2) / z + R.cam.x, wy = (sy - R.H / 2) / z + R.cam.y;
  return { fx: (wx / (TW / 2) + wy / (TH / 2)) / 2, fy: (wy / (TH / 2) - wx / (TW / 2)) / 2 };
}
function tileH(s, x, y) { const i = Math.floor(x) + Math.floor(y) * s.map.W; return s.map.hgt[i] || 0; }
// screen point of tile-space (x,y) at height h (world px)
function sp(x, y, h = 0) { const w = iso(x, y); const z = R.cam.z; return [(w.x - R.cam.x) * z + R.W / 2, (w.y - R.cam.y - h) * z + R.H / 2]; }

// ---------- primitives
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
// iso box with corners (u0,v0)-(u1,v1) in tile units around base point (cx,cy), height h, base lift b
function box(ctx, cx, cy, u0, v0, u1, v1, h, col, b = 0, topCol) {
  const Z = R.cam.z, p = (u, v, z) => [cx + (u - v) * TW / 2 * Z, cy + (u + v) * TH / 2 * Z - z * Z];
  poly(ctx, [p(u0, v1, b), p(u1, v1, b), p(u1, v1, b + h), p(u0, v1, b + h)], shade(col, 0.74));
  poly(ctx, [p(u1, v0, b), p(u1, v1, b), p(u1, v1, b + h), p(u1, v0, b + h)], shade(col, 0.9));
  poly(ctx, [p(u0, v0, b + h), p(u1, v0, b + h), p(u1, v1, b + h), p(u0, v1, b + h)], topCol || col);
  return p;
}
function cyl(ctx, cx, cy, u, v, r, h, col, b = 0) {   // vertical cylinder
  const Z = R.cam.z, x = cx + (u - v) * TW / 2 * Z, y = cy + (u + v) * TH / 2 * Z, rx = r * TW / 2 * Z * 1.41, ry = rx / 2;
  ctx.fillStyle = shade(col, 0.82);
  ctx.beginPath(); ctx.ellipse(x, y - b * Z, rx, ry, 0, 0, Math.PI); ctx.lineTo(x - rx, y - (b + h) * Z); ctx.ellipse(x, y - (b + h) * Z, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - (b + h) * Z, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  return [x, y - (b + h) * Z];
}
function coolTower(ctx, cx, cy, u, v, r, h) {
  const Z = R.cam.z, x = cx + (u - v) * TW / 2 * Z, y = cy + (u + v) * TH / 2 * Z, rx = r * TW / 2 * Z * 1.41, ry = rx * 0.45;
  const top = y - h * Z, w2 = rx * 0.62, wt = rx * 0.72;
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  g.addColorStop(0, '#b9bcc0'); g.addColorStop(0.55, '#eceef0'); g.addColorStop(1, '#c4c7cb');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - rx, y);
  ctx.quadraticCurveTo(x - w2, y - h * 0.65 * Z, x - wt, top);
  ctx.lineTo(x + wt, top);
  ctx.quadraticCurveTo(x + w2, y - h * 0.65 * Z, x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7d8187'; ctx.beginPath(); ctx.ellipse(x, top, wt, wt * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  return [x, top];
}

// ---------- terrain
function drawTerrain(ctx, s) {
  const M = s.map, Z = R.cam.z, o = toScreen(0, 0), hw = TW / 2 * Z, hh = TH / 2 * Z;
  const X = (x, y) => o[0] + (x - y) * hw, Y = (x, y, h) => o[1] + (x + y) * hh - h * Z;
  const trees = Z > 0.3;
  for (let d = 0; d < M.W + M.H - 1; d++) {
    for (let x = Math.max(0, d - M.H + 1); x <= Math.min(d, M.W - 1); x++) {
      const y = d - x, i = x + y * M.W, h = M.hgt[i], t = M.t[i];
      const cx = X(x + 0.5, y + 0.5), cy = Y(x + 0.5, y + 0.5, 0);
      if (cx < -hw * 2 || cx > R.W + hw * 2 || cy < -hh * 2 - 40 * Z || cy > R.H + hh * 2 + 30 * Z) continue;
      const col = R.tileCol[i];
      const top = [X(x, y), Y(x, y, h)], rt = [X(x + 1, y), Y(x + 1, y, h)], bt = [X(x + 1, y + 1), Y(x + 1, y + 1, h)], lt = [X(x, y + 1), Y(x, y + 1, h)];
      if (h > 0) {
        poly(ctx, [lt, bt, [bt[0], bt[1] + h * Z], [lt[0], lt[1] + h * Z]], shade(t === T.MOUNT ? '#8d877e' : '#7a9a4a', 0.8));
        poly(ctx, [bt, rt, [rt[0], rt[1] + h * Z], [bt[0], bt[1] + h * Z]], shade(t === T.MOUNT ? '#8d877e' : '#7a9a4a', 0.95));
      }
      poly(ctx, [top, rt, bt, lt], col);
      if (Z > 0.7 && t !== T.SEA) { ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 1; ctx.stroke(); }
      if (t === T.SEA && Z > 0.6) {   // waves
        const ph = R.time * 0.6 + i * 1.7;
        const a = (Math.sin(ph) + 1) / 2;
        if (a > 0.6) { ctx.strokeStyle = `rgba(255,255,255,${(a - 0.6) * 0.9})`; ctx.lineWidth = 1.2 * Z; ctx.beginPath(); ctx.moveTo(cx - 8 * Z, cy); ctx.quadraticCurveTo(cx - 2 * Z, cy - 3 * Z, cx + 6 * Z, cy); ctx.stroke(); }
      }
      // river
      const rv = R.riv[i];
      if (rv) {
        ctx.strokeStyle = '#4f9fdc'; ctx.lineWidth = 6 * Z; ctx.lineCap = 'round';
        const c0 = [X(x + 0.5, y + 0.5), Y(x + 0.5, y + 0.5, h)];
        for (const [dx, dy] of rv) { ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(X(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5), Y(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5, h)); ctx.stroke(); }
        ctx.lineCap = 'butt';
      }
      if (t === T.MOUNT) {
        const ph = (12 + 12 * ((i * 7919) % 13) / 13) ;
        const pk = [X(x + 0.5, y + 0.5) + ((i % 3) - 1) * 3 * Z, Y(x + 0.5, y + 0.5, h + ph)];
        poly(ctx, [lt, pk, top], '#a7a196'); poly(ctx, [top, pk, rt], '#b9b3a8');
        poly(ctx, [lt, pk, bt], '#857f76'); poly(ctx, [bt, pk, rt], '#9d978d');
        const sn = 0.35, sp1 = [lt[0] + (pk[0] - lt[0]) * (1 - sn), lt[1] + (pk[1] - lt[1]) * (1 - sn)], sp2 = [bt[0] + (pk[0] - bt[0]) * (1 - sn), bt[1] + (pk[1] - bt[1]) * (1 - sn)], sp3 = [rt[0] + (pk[0] - rt[0]) * (1 - sn), rt[1] + (pk[1] - rt[1]) * (1 - sn)];
        poly(ctx, [sp1, pk, sp2], '#eef2f6'); poly(ctx, [sp2, pk, sp3], '#ffffff');
      }
      if (t === T.FOREST && trees && !nodeAt(s, x, y)) {
        for (let k = 0; k < 3; k++) {
          const u = [0.3, 0.68, 0.45][k] + ((i * (k + 3)) % 5 - 2) * 0.03, v = [0.35, 0.4, 0.72][k];
          const tx = X(x + u, y + v), ty = Y(x + u, y + v, h);
          ctx.fillStyle = '#6b4a2b'; ctx.fillRect(tx - 1 * Z, ty - 4 * Z, 2 * Z, 4 * Z);
          poly(ctx, [[tx - 6 * Z, ty - 3 * Z], [tx, ty - 17 * Z], [tx + 6 * Z, ty - 3 * Z]], k === 1 ? '#3f7d33' : '#356e2b');
          poly(ctx, [[tx, ty - 17 * Z], [tx + 6 * Z, ty - 3 * Z], [tx + 1 * Z, ty - 3 * Z]], 'rgba(0,0,0,.12)');
        }
      }
      if (R.valid) {
        const v = R.valid[i];
        if (v > 0) poly(ctx, [top, rt, bt, lt], R.overlayCol ? R.overlayCol(v) : 'rgba(80,220,120,.28)');
      }
    }
  }
}

// ---------- wires and pylons
const ATTACH = { town: 16, plant: 24, sub: 20, border: 24, ind: 14 };
function lineGeom(s, l) {
  const a = s.idx[l.a], b = s.idx[l.b];
  if (!a || !b) return null;
  const n = Math.max(1, Math.round(l.len / 1.15)), pts = [];
  for (let k = 0; k <= n; k++) {
    const x = a.x + 0.5 + (b.x - a.x) * k / n, y = a.y + 0.5 + (b.y - a.y) * k / n;
    const tt = tileAt(s, Math.floor(x), Math.floor(y)), wet = isWater(tt), g = tileH(s, x, y);
    let top;
    if (k === 0) top = tileH(s, a.x, a.y) + ATTACH[a.k];
    else if (k === n) top = tileH(s, b.x, b.y) + ATTACH[b.k];
    else top = wet ? 1 : g + (l.tier === 3 ? 28 : 24);
    pts.push({ x, y, g, top, wet, pyl: k > 0 && k < n && !wet });
  }
  return pts;
}
function drawPylon(ctx, x, y, g, tier) {
  const Z = R.cam.z, [px, py] = sp(x, y, g), h = (tier === 3 ? 28 : 24) * Z, w = (tier === 3 ? 4 : 3) * Z;
  ctx.strokeStyle = '#6b7684'; ctx.lineWidth = Math.max(1, 1.1 * Z);
  ctx.beginPath(); ctx.moveTo(px - w, py); ctx.lineTo(px, py - h); ctx.lineTo(px + w, py);
  ctx.moveTo(px - w * 0.55, py - h * 0.45); ctx.lineTo(px + w * 0.55, py - h * 0.45);
  ctx.moveTo(px - w * 2, py - h * 0.82); ctx.lineTo(px + w * 2, py - h * 0.82);
  ctx.stroke();
}
const LOADCOL = ld => ld < 0.7 ? '#36c76a' : ld < 0.9 ? '#f2c230' : ld < 1 ? '#ff9233' : '#ff3434';
function drawLines(ctx, s) {
  const Z = R.cam.z;
  for (const l of s.lines) {
    const g = lineGeom(s, l);
    if (!g) continue;
    const ends = g.map(p => sp(p.x, p.y, p.top));
    const mx = (ends[0][0] + ends[ends.length - 1][0]) / 2, my = (ends[0][1] + ends[ends.length - 1][1]) / 2;
    if (Math.max(...ends.map(e => e[0])) < -20 || Math.min(...ends.map(e => e[0])) > R.W + 20 || Math.max(...ends.map(e => e[1])) < -20 || Math.min(...ends.map(e => e[1])) > R.H + 20) continue;
    for (const p of g) if (p.pyl) drawPylon(ctx, p.x, p.y, p.g, l.tier);
    const T0 = TIERS[l.tier];
    const path = () => {
      ctx.beginPath(); ctx.moveTo(ends[0][0], ends[0][1]);
      for (let k = 1; k < ends.length; k++) { const a = ends[k - 1], b = ends[k]; ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4 * Z, b[0], b[1]); }
    };
    const sel = R.sel && R.sel === 'L' + l.id;
    if (l.st === 'build') {
      ctx.setLineDash([4 * Z, 4 * Z]); path(); ctx.strokeStyle = 'rgba(70,80,95,.6)'; ctx.lineWidth = 1.5 * Z; ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    if (sel) { path(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = (T0.w + 6) * Z; ctx.stroke(); }
    if (l.st === 'trip') {
      ctx.setLineDash([3 * Z, 5 * Z]); path(); ctx.strokeStyle = '#7b7f86'; ctx.lineWidth = T0.w * Z; ctx.stroke(); ctx.setLineDash([]);
      R.icons.push([mx, my - 6, '🔧']);
      continue;
    }
    path(); ctx.strokeStyle = T0.col; ctx.lineWidth = Math.max(1, T0.w * Z); ctx.stroke();
    const ld = l.load || 0;
    if (ld > 0.02 || R.flowAll) {
      path(); ctx.strokeStyle = LOADCOL(ld); ctx.globalAlpha = ld >= 1 ? 0.55 + 0.45 * Math.sin(R.time * 10) : 0.7;
      ctx.lineWidth = (T0.w + 1.6) * Z; ctx.stroke(); ctx.globalAlpha = 1;
      // flow dots
      if (Z > 0.45 && Math.abs(l.flow) > 1) {
        const segs = [];
        let tot = 0;
        for (let k = 1; k < ends.length; k++) { const L = Math.hypot(ends[k][0] - ends[k - 1][0], ends[k][1] - ends[k - 1][1]); segs.push(L); tot += L; }
        const gap = 26 * Z, spd = (30 + 60 * Math.min(1.5, ld)) * Z, dir = Math.sign(l.flow);
        let off = ((R.time * spd * dir) % gap + gap) % gap;
        ctx.fillStyle = '#ffffff';
        for (let d = off; d < tot; d += gap) {
          let rem = d, k = 0;
          while (k < segs.length && rem > segs[k]) { rem -= segs[k]; k++; }
          if (k >= segs.length) break;
          const f = rem / segs[k], a = ends[k], b = ends[k + 1];
          const sag = 4 * Z * 4 * f * (1 - f) * 0.5;
          ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + sag, Math.max(1.2, 1.8 * Z), 0, 7); ctx.fill();
        }
      }
    }
    if (ld > 0.97) R.icons.push([mx, my - 8, ld >= 1 ? '🔥' : '⚠️']);
    if (l.upg) R.icons.push([mx, my - 8, '🏗️']);
  }
}

// ---------- buildings
function lightAt(x, y, r, a = 1, c) { R.lights.push([x, y, r, a, c]); }
function hashf(n, k) { const v = Math.sin(n * 91.7 + k * 47.3) * 43758.5; return v - Math.floor(v); }
function drawTown(ctx, s, n, cx, cy) {
  const Z = R.cam.z, pop = n.pop;
  const cnt = pop < 40000 ? 3 : pop < 90000 ? 5 : pop < 160000 ? 7 : 9;
  const towers = pop < 160000 ? 0 : pop < 300000 ? 2 : 4;
  const slots = [[-0.28, -0.28], [0, -0.3], [0.28, -0.28], [-0.3, 0], [0, 0], [0.3, 0], [-0.28, 0.28], [0, 0.3], [0.28, 0.28]];
  const order = [4, 1, 3, 5, 7, 0, 2, 6, 8].slice(0, cnt).sort((a, b) => (slots[a][0] + slots[a][1]) - (slots[b][0] + slots[b][1]));
  const lit = n.conn && !n.dark && R.night > 0.05;
  const walls = ['#f4e7cf', '#efd9b4', '#e9e2d6', '#f6d7c3'], roofs = ['#c8553d', '#b5543c', '#8e5a3c', '#d06b45'];
  for (const k of order) {
    const [u, v] = slots[k], tower = [4, 1, 3, 5].indexOf(k) > -1 && [4, 1, 3, 5].indexOf(k) < towers;
    const hv = hashf(n.id, k);
    if (tower) {
      const h = 26 + hv * 34;
      box(ctx, cx, cy, u - 0.1, v - 0.1, u + 0.1, v + 0.1, h, hv > 0.5 ? '#c3cedb' : '#b4c0cf', 0, '#e3e9f0');
      if (lit) for (let j = 0; j < 3; j++) { const p = sp(0, 0); const bx = cx + (u - v) * TW / 2 * Z, by = cy + (u + v + 0.1) * TH / 2 * Z - (8 + j * h / 3.5) * Z; lightAt(bx, by, 3 * Z, 0.9); }
    } else {
      const h = 8 + hv * 4, w = 0.11;
      const p = box(ctx, cx, cy, u - w, v - w, u + w, v + w, h, walls[(hv * 4) | 0]);
      const apex = [cx + (u - v) * TW / 2 * Z, cy + (u + v) * TH / 2 * Z - (h + 8) * Z];
      const rc = roofs[(hv * 7 | 0) % 4];
      poly(ctx, [p(u - w, v + w, h), p(u + w, v + w, h), apex], shade(rc, 0.8));
      poly(ctx, [p(u + w, v - w, h), p(u + w, v + w, h), apex], rc);
      if (lit) lightAt(cx + (u - v) * TW / 2 * Z, cy + (u + v + 0.1) * TH / 2 * Z - 4 * Z, 3.2 * Z, 0.95);
    }
  }
  if (n.dark && Math.sin(R.time * 6) > 0) R.icons.push([cx, cy - 46 * Z, '⚡']);
}
function smoke(x, y, h, kind) {
  if (R.parts.length > 220) return;
  R.parts.push({ x, y, h, r: 3, a: 0.55, life: 0, kind, vx: (S.s ? S.s.w.v : 5) * 0.4 + Math.random() * 2 });
}
function drawPlant(ctx, s, n, cx, cy) {
  const Z = R.cam.z, P = PLANTS[n.type], on = n.st === 'on' && (n.out || 0) > 1, wc = iso(n.x + 0.5, n.y + 0.5), base = tileH(s, n.x, n.y);
  const wpt = (u, v, h) => { const w = iso(n.x + 0.5 + u, n.y + 0.5 + v); return [w.x, w.y, base + h]; };
  const emit = (u, v, h, k, rate) => { if (on && Math.random() < rate * R.dt * 60) { const [x, y, hh] = wpt(u, v, h); smoke(x, y, hh, k); } };
  if (n.st === 'build' || n.type === 'sub' && n.st === 'build') return drawSite(ctx, n, cx, cy);
  switch (n.type) {
    case 'coal': {
      box(ctx, cx, cy, -0.36, -0.1, 0.12, 0.32, 16, '#8a7f75');
      box(ctx, cx, cy, -0.05, -0.36, 0.3, -0.04, 26, '#9b8f84');
      ctx.fillStyle = '#2d2925'; ctx.beginPath(); const pp = sp(n.x + 0.75, n.y + 0.82, base); ctx.ellipse(pp[0], pp[1], 9 * Z, 4 * Z, 0, 0, 7); ctx.fill();
      for (const [u, v] of [[0.2, 0.02], [0.32, 0.16]]) { box(ctx, cx, cy, u - 0.035, v - 0.035, u + 0.035, v + 0.035, 52, '#cfc8c1'); box(ctx, cx, cy, u - 0.036, v - 0.036, u + 0.036, v + 0.036, 5, '#c8473c', 46); emit(u, v, 54, 'smog', 0.45); }
      const t = coolTower(ctx, cx, cy, -0.3, -0.3, 0.16, 28); emit(-0.3, -0.3, 30, 'steam', 0.35);
      if (on) lightAt(cx, cy - 10 * Z, 4 * Z, 0.7);
      break;
    }
    case 'ccgt': case 'ocgt': {
      const big = n.type === 'ccgt';
      if (big) box(ctx, cx, cy, -0.05, -0.38, 0.22, -0.12, 22, '#bfc8d2');
      box(ctx, cx, cy, -0.34, -0.14, 0.24, 0.2, big ? 14 : 10, '#d7dde4', 0, '#eef2f6');
      box(ctx, cx, cy, -0.34, 0.12, 0.24, 0.2, 2.5, '#3d7bd9', big ? 9 : 6);
      cyl(ctx, cx, cy, big ? 0.14 : 0.16, big ? -0.25 : -0.05, 0.05, big ? 40 : 22, '#aab4bf');
      emit(big ? 0.14 : 0.16, big ? -0.25 : -0.05, big ? 42 : 24, 'heat', 0.25);
      if (!big) { box(ctx, cx, cy, -0.3, -0.36, -0.12, -0.2, 6, '#c4ccd4'); box(ctx, cx, cy, -0.08, -0.36, 0.1, -0.2, 6, '#c4ccd4'); }
      if (on) lightAt(cx, cy - 6 * Z, 3.5 * Z, 0.7);
      break;
    }
    case 'nuclear': case 'smr': {
      const big = n.type === 'nuclear';
      if (big) { coolTower(ctx, cx, cy, -0.18, -0.3, 0.2, 50); emit(-0.18, -0.3, 52, 'steam', 0.5); coolTower(ctx, cx, cy, 0.22, -0.18, 0.2, 50); emit(0.22, -0.18, 52, 'steam', 0.5); }
      else { coolTower(ctx, cx, cy, 0.15, -0.25, 0.14, 26); emit(0.15, -0.25, 28, 'steam', 0.35); }
      box(ctx, cx, cy, 0.0, 0.05, 0.36, 0.34, 12, '#d9d3c8');
      const top = cyl(ctx, cx, cy, -0.18, 0.18, big ? 0.15 : 0.11, big ? 18 : 12, '#e6e1d8');
      ctx.fillStyle = '#efeae2'; ctx.beginPath(); ctx.ellipse(top[0], top[1], (big ? 0.15 : 0.11) * TW / 2 * Z * 1.41, (big ? 0.15 : 0.11) * TW / 2 * Z * 1.2, 0, Math.PI, 0); ctx.fill();
      if (on) lightAt(cx, cy - 8 * Z, 4 * Z, 0.8);
      break;
    }
    case 'hydro': {
      poly(ctx, [sp(n.x, n.y, base + 1), sp(n.x + 1, n.y, base + 1), sp(n.x + 1, n.y + 0.5, base + 1), sp(n.x, n.y + 0.5, base + 1)], '#3f8fd8');
      const lvl = n.res / (n.cap * P.res);
      poly(ctx, [sp(n.x + 0.05, n.y + 0.05, base + 2 + lvl * 10), sp(n.x + 0.95, n.y + 0.05, base + 2 + lvl * 10), sp(n.x + 0.95, n.y + 0.44, base + 2 + lvl * 10), sp(n.x + 0.05, n.y + 0.44, base + 2 + lvl * 10)], '#4a9be3');
      box(ctx, cx, cy, -0.5, -0.06, 0.5, 0.06, 16, '#c9c4bb', 0, '#dcd7ce');
      box(ctx, cx, cy, 0.05, 0.12, 0.3, 0.34, 8, '#b7b1a7');
      if (on) { ctx.fillStyle = 'rgba(255,255,255,.85)'; const f = sp(n.x + 0.45, n.y + 0.75, base); ctx.beginPath(); ctx.ellipse(f[0], f[1], (5 + Math.sin(R.time * 9) * 1.5) * Z, 2.5 * Z, 0, 0, 7); ctx.fill(); lightAt(cx, cy, 3 * Z, 0.6); }
      break;
    }
    case 'pumped': {
      const lvl = n.soc / storeE(n);
      box(ctx, cx, cy, -0.42, -0.42, 0.08, 0.08, 18, '#a09a90', 0, '#8f8a80');
      poly(ctx, [sp(n.x + 0.12, n.y + 0.12, base + 19), sp(n.x + 0.54, n.y + 0.12, base + 19), sp(n.x + 0.54, n.y + 0.54, base + 19), sp(n.x + 0.12, n.y + 0.54, base + 19)], mix('#8fb6d9', '#2f7fd0', lvl));
      ctx.strokeStyle = '#6d6a66'; ctx.lineWidth = 3 * Z; ctx.beginPath(); const a = sp(n.x + 0.5, n.y + 0.5, base + 12), b = sp(n.x + 0.78, n.y + 0.78, base + 4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      box(ctx, cx, cy, 0.18, 0.18, 0.4, 0.4, 8, '#b7b1a7');
      break;
    }
    case 'solar': {
      for (const v of [-0.3, -0.02, 0.26]) {
        const pts = [sp(n.x + 0.1, n.y + 0.5 + v, base + 7), sp(n.x + 0.9, n.y + 0.5 + v, base + 7), sp(n.x + 0.9, n.y + 0.5 + v + 0.18, base + 2.5), sp(n.x + 0.1, n.y + 0.5 + v + 0.18, base + 2.5)];
        poly(ctx, pts, '#2b4f8c', '#7ea3d6', 0.8 * Z);
        if (on && R.night < 0.2) { const k = (Math.sin(R.time * 1.5 + v * 9) + 1) / 2; if (k > 0.85) poly(ctx, pts, `rgba(255,255,255,${(k - 0.85) * 2})`); }
      }
      break;
    }
    case 'wind': case 'offshore': {
      const sea = n.type === 'offshore';
      const spots = sea ? [[-0.28, -0.25], [0.25, -0.2], [-0.2, 0.22], [0.25, 0.27]] : [[-0.25, -0.2], [0.22, -0.05], [-0.05, 0.28]];
      const spd = n.st === 'on' ? (n.avail || 0) / n.cap : 0;
      n.rot = (n.rot || hashf(n.id, 1) * 6) + R.dt * (0.4 + 6 * spd) * (spd > 0 ? 1 : 0);
      for (const [u, v] of spots) {
        const x = cx + (u - v) * TW / 2 * Z, y = cy + (u + v) * TH / 2 * Z, h = 46 * Z;
        if (sea) { ctx.fillStyle = '#f2c230'; ctx.fillRect(x - 2 * Z, y - 6 * Z, 4 * Z, 6 * Z); }
        ctx.strokeStyle = '#f4f6f8'; ctx.lineWidth = 2.4 * Z; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
        ctx.strokeStyle = '#c9d0d8'; ctx.lineWidth = 0.8 * Z; ctx.beginPath(); ctx.moveTo(x + 0.8 * Z, y); ctx.lineTo(x + 0.8 * Z, y - h); ctx.stroke();
        ctx.fillStyle = '#e8ecf0'; ctx.fillRect(x - 3 * Z, y - h - 2 * Z, 6 * Z, 4 * Z);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8 * Z;
        for (let b = 0; b < 3; b++) { const a = n.rot + b * 2.094 + u * 3; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + Math.cos(a) * 17 * Z, y - h + Math.sin(a) * 17 * Z); ctx.stroke(); }
        if (R.night > 0.3 && Math.sin(R.time * 3 + u * 5) > 0.3) lightAt(x, y - h - 2 * Z, 2.5 * Z, 1, '#ff3b3b');
      }
      break;
    }
    case 'bess': {
      const soc = n.soc / storeE(n);
      for (const [u, v] of [[-0.3, -0.3], [0.05, -0.3], [-0.3, -0.02], [0.05, -0.02], [-0.3, 0.26], [0.05, 0.26]]) {
        const p = box(ctx, cx, cy, u, v, u + 0.26, v + 0.12, 9, '#eef1f4', 0, '#ffffff');
        const col = n.out < -1 ? '#2bbfae' : n.out > 1 ? '#ff8a3d' : '#7bd88f';
        poly(ctx, [p(u + 0.02, v + 0.12, 2.5), p(u + 0.02 + 0.22 * soc, v + 0.12, 2.5), p(u + 0.02 + 0.22 * soc, v + 0.12, 5), p(u + 0.02, v + 0.12, 5)], col);
      }
      box(ctx, cx, cy, 0.36, -0.1, 0.46, 0.08, 10, '#9aa3ad');
      if (Math.abs(n.out || 0) > 1) lightAt(cx, cy - 6 * Z, 3 * Z, 0.6);
      break;
    }
    case 'sub': {
      ctx.strokeStyle = 'rgba(80,90,100,.8)'; ctx.lineWidth = 1 * Z;
      poly(ctx, [sp(n.x + 0.12, n.y + 0.12, base), sp(n.x + 0.88, n.y + 0.12, base), sp(n.x + 0.88, n.y + 0.88, base), sp(n.x + 0.12, n.y + 0.88, base)], '#c9c5b8', 'rgba(80,90,100,.8)', Z);
      box(ctx, cx, cy, -0.25, -0.2, -0.05, 0.05, 9, '#8f9aa6');
      box(ctx, cx, cy, 0.05, -0.2, 0.25, 0.05, 9, '#8f9aa6');
      const g1 = sp(n.x + 0.3, n.y + 0.75, base), g2 = sp(n.x + 0.75, n.y + 0.3, base);
      ctx.strokeStyle = '#6b7684'; ctx.lineWidth = 1.4 * Z; ctx.beginPath();
      ctx.moveTo(g1[0], g1[1]); ctx.lineTo(g1[0], g1[1] - 20 * Z); ctx.lineTo(g2[0], g2[1] - 20 * Z); ctx.lineTo(g2[0], g2[1]); ctx.stroke();
      break;
    }
  }
}
function drawSite(ctx, n, cx, cy) {
  const Z = R.cam.z;
  ctx.strokeStyle = '#b07a2a'; ctx.lineWidth = 1 * Z;
  const p = box(ctx, cx, cy, -0.3, -0.3, 0.3, 0.3, 2, '#c9a66b');
  ctx.strokeStyle = 'rgba(120,90,40,.8)';
  for (const [u, v] of [[-0.3, 0.3], [0.3, 0.3], [0.3, -0.3]]) { const a = p(u, v, 0), b = p(u, v, 16); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const m0 = p(0.25, -0.25, 0), m1 = p(0.25, -0.25, 44);
  ctx.strokeStyle = '#f2b51d'; ctx.lineWidth = 2 * Z; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]);
  const sw = Math.sin(R.time * 0.6 + n.id) * 0.3;
  ctx.lineTo(m1[0] - (22 + sw * 10) * Z, m1[1] + 3 * Z); ctx.moveTo(m1[0], m1[1]); ctx.lineTo(m1[0] + 8 * Z, m1[1] - 1 * Z); ctx.stroke();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8 * Z; ctx.beginPath(); ctx.moveTo(m1[0] - (16 + sw * 7) * Z, m1[1] + 2 * Z); ctx.lineTo(m1[0] - (16 + sw * 7) * Z, m1[1] + 14 * Z); ctx.stroke();
}
function drawBorder(ctx, s, n, cx, cy) {
  const Z = R.cam.z, hue = (n.name.length * 47) % 360;
  box(ctx, cx, cy, -0.3, -0.06, 0.3, 0.06, 4, '#d9534f', 0, '#f4f4f4');
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5 * Z; ctx.beginPath(); ctx.moveTo(cx + 10 * Z, cy); ctx.lineTo(cx + 10 * Z, cy - 34 * Z); ctx.stroke();
  const wv = Math.sin(R.time * 3) * 2 * Z;
  ctx.fillStyle = `hsl(${hue} 70% 50%)`; ctx.beginPath(); ctx.moveTo(cx + 10 * Z, cy - 34 * Z); ctx.lineTo(cx + 26 * Z, cy - 30 * Z + wv); ctx.lineTo(cx + 10 * Z, cy - 24 * Z); ctx.fill();
}
function drawInd(ctx, s, n, cx, cy) {
  const Z = R.cam.z;
  if (!n.conn) ctx.globalAlpha = 0.55 + 0.2 * Math.sin(R.time * 3);
  if (n.kind === 'dc') {
    box(ctx, cx, cy, -0.36, -0.3, 0.3, -0.04, 10, '#5b6472', 0, '#717b8a');
    box(ctx, cx, cy, -0.36, 0.02, 0.3, 0.28, 10, '#5b6472', 0, '#717b8a');
    if (n.conn && n.served > 0) for (let k = 0; k < 4; k++) if (Math.sin(R.time * 5 + k * 1.7) > 0) { const p = sp(n.x + 0.2 + k * 0.15, n.y + 0.54, tileH(s, n.x, n.y) + 5); ctx.fillStyle = '#42e8ff'; ctx.fillRect(p[0] - 1.5 * Z, p[1] - 1.5 * Z, 3 * Z, 3 * Z); lightAt(p[0], p[1], 3 * Z, 0.8); }
  } else if (n.kind === 'factory') {
    const p = box(ctx, cx, cy, -0.36, -0.3, 0.3, 0.3, 12, '#cfc6b8');
    for (let k = 0; k < 4; k++) { const u = -0.36 + k * 0.165; poly(ctx, [p(u, 0.3, 12), p(u + 0.165, 0.3, 12), p(u + 0.165, 0.3, 19)], '#a9b8c9'); }
    box(ctx, cx, cy, 0.18, -0.28, 0.26, -0.2, 32, '#b5aa9b');
  } else {
    cyl(ctx, cx, cy, -0.2, -0.15, 0.13, 16, '#f0f3f6'); cyl(ctx, cx, cy, 0.12, -0.2, 0.13, 16, '#f0f3f6');
    box(ctx, cx, cy, -0.3, 0.08, 0.3, 0.32, 8, '#d0d8e0');
  }
  ctx.globalAlpha = 1;
}

// ---------- overlay layers (labels, icons, bubbles)
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function satEmoji(v) { return v >= 75 ? '😄' : v >= 60 ? '🙂' : v >= 45 ? '😐' : v >= 30 ? '🙁' : '😡'; }
function drawLabels(ctx, s) {
  const Z = R.cam.z;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const n of s.nodes) {
    const base = tileH(s, n.x, n.y), [cx, cy] = sp(n.x + 0.5, n.y + 0.5, base);
    if (cx < -80 || cx > R.W + 80 || cy < -60 || cy > R.H + 80) continue;
    const ly = cy + 22 * Z + 6;
    if (n.k === 'town') {
      ctx.font = `700 ${Z > 0.7 ? 12 : 11}px system-ui, sans-serif`;
      const txt = n.name, w = ctx.measureText(txt).width + 30;
      ctx.fillStyle = n.conn ? (n.dark ? 'rgba(160,30,30,.88)' : 'rgba(25,30,45,.78)') : 'rgba(90,90,90,.78)';
      roundRect(ctx, cx - w / 2, ly - 9, w, 18, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, cx + 7, ly + 0.5);
      ctx.font = '12px system-ui, sans-serif'; ctx.fillText(n.conn ? satEmoji(n.sat) : '🕯️', cx - w / 2 + 11, ly + 0.5);
    } else if (n.k === 'border') {
      ctx.font = '700 11px system-ui, sans-serif';
      const txt = `→ ${n.name}`, w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(40,60,110,.8)'; roundRect(ctx, cx - w / 2, ly - 8, w, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, ly);
    } else if (n.k === 'ind' && !n.conn) {
      ctx.font = '700 11px system-ui, sans-serif';
      const left = Math.max(0, n.deadline - dayOf(s.t)), txt = `⏳ ${n.mw} MW · ${left} mo`, w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(150,90,10,.88)'; roundRect(ctx, cx - w / 2, ly - 8, w, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, ly);
    } else if (n.k === 'plant' || n.k === 'sub') {
      if (n.st === 'build') {
        const f = 1 - n.build / n.buildT, w = 34;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; roundRect(ctx, cx - w / 2 - 2, ly - 5, w + 4, 10, 5); ctx.fill();
        ctx.fillStyle = '#f2b51d'; roundRect(ctx, cx - w / 2, ly - 3, w * clamp(f, 0.05, 1), 6, 3); ctx.fill();
      } else if (n.k === 'plant' && Z > 0.55) {
        const P = PLANTS[n.type], w = 30;
        let f = n.cap ? clamp((n.out || 0) / n.cap, 0, 1) : 0, col = CAT_COL[P.cat];
        if (P.store) { f = n.soc / storeE(n); }
        ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(ctx, cx - w / 2 - 2, ly - 4, w + 4, 8, 4); ctx.fill();
        ctx.fillStyle = col; if (f > 0.01) { roundRect(ctx, cx - w / 2, ly - 2, w * f, 4, 2); ctx.fill(); }
        if (P.store && Math.abs(n.out) > 1) { ctx.font = '700 10px system-ui'; ctx.fillStyle = n.out > 0 ? '#ffb27a' : '#7ff0e0'; ctx.fillText(n.out > 0 ? '▼' : '▲', cx + w / 2 + 9, ly); }
      }
      const ic = n.st === 'trip' ? '💥' : n.st === 'off' ? '💤' : n.com && n.startT > 0 ? '⏳' : n.retire && n.retire - dayOf(s.t) <= 6 ? '📅' : '';
      if (ic) { ctx.font = '16px system-ui'; ctx.fillText(ic, cx + 16 * Z, cy - 40 * Z); }
    }
    if (R.sel === n.id) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.ellipse(cx, cy, 34 * Z, 17 * Z, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.font = '15px system-ui';
  for (const [x, y, t] of R.icons) ctx.fillText(t, x, y);
}
function drawBubbles(ctx, s) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const b of R.bubbles) {
    const n = s.idx[b.id]; if (!n) continue;
    const [cx, cy] = sp(n.x + 0.5, n.y + 0.5, tileH(s, n.x, n.y));
    const a = Math.min(1, b.life * 3, (b.max - b.life) * 2);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.font = '600 12px system-ui, sans-serif';
    const tw = ctx.measureText(b.text).width, w = tw + 34, h = 26, x = clamp(cx - w / 2, 4, R.W - w - 4), y = cy - 70 * R.cam.z - 18 - b.life * 4;
    ctx.fillStyle = '#fffdf5'; ctx.strokeStyle = '#3b2f1e'; ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 13); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 5, y + h - 0.5); ctx.lineTo(cx, y + h + 7); ctx.lineTo(cx + 5, y + h - 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 5, y + h); ctx.lineTo(cx, y + h + 7); ctx.lineTo(cx + 5, y + h); ctx.stroke();
    ctx.fillStyle = '#3b2f1e'; ctx.font = '14px system-ui'; ctx.fillText(b.emoji, x + 8, y + h / 2 + 1);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(b.text, x + 27, y + h / 2 + 1);
    ctx.globalAlpha = 1;
  }
}
function drawTool(ctx, s) {
  const Z = R.cam.z, h = R.hover;
  if (R.ghost && h) {
    const base = tileH(s, h.x, h.y);
    poly(ctx, [sp(h.x, h.y, base), sp(h.x + 1, h.y, base), sp(h.x + 1, h.y + 1, base), sp(h.x, h.y + 1, base)], R.ghost.ok ? 'rgba(60,220,110,.45)' : 'rgba(240,60,60,.4)', '#fff', 2);
    const [cx, cy] = sp(h.x + 0.5, h.y + 0.5, base);
    ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(R.ghost.icon, cx, cy - 18 * Z);
    if (R.ghost.label) {
      ctx.font = '700 12px system-ui'; const w = ctx.measureText(R.ghost.label).width + 14;
      ctx.fillStyle = R.ghost.ok ? 'rgba(25,30,45,.85)' : 'rgba(170,30,30,.9)'; roundRect(ctx, cx - w / 2, cy + 18, w, 20, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(R.ghost.label, cx, cy + 28.5);
    }
  }
  if (R.lineFrom) {
    const a = s.idx[R.lineFrom]; if (!a) return;
    const [ax, ay] = sp(a.x + 0.5, a.y + 0.5, tileH(s, a.x, a.y));
    const mx = TIERS[U.tier].max;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.ellipse(ax, ay, mx * TW / 2 * Z * 1.414, mx * TH / 2 * Z * 1.414, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ax, ay, 30 * Z, 15 * Z, 0, 0, 7); ctx.stroke();
    if (h && R.lineTo) {
      const [bx, by] = sp(h.x + 0.5, h.y + 0.5, tileH(s, h.x, h.y));
      ctx.strokeStyle = R.lineTo.ok ? '#3ce07a' : '#ff4d4d'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(ax, ay - 18 * Z); ctx.lineTo(bx, by - 18 * Z); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = R.lineTo.label, w = ctx.measureText(t).width + 14, mx2 = (ax + bx) / 2, my2 = (ay + by) / 2 - 26;
      ctx.fillStyle = R.lineTo.ok ? 'rgba(25,30,45,.88)' : 'rgba(170,30,30,.92)'; roundRect(ctx, mx2 - w / 2, my2 - 10, w, 20, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(t, mx2, my2 + 0.5);
    }
    ctx.setLineDash([]);
  }
}

// ---------- particles, weather, night
function updParts(dt) {
  for (const p of R.parts) { p.life += dt; p.h += (p.kind === 'heat' ? 14 : 10) * dt; p.x += p.vx * dt; p.r += 4 * dt; p.a = Math.max(0, 0.55 - p.life * (p.kind === 'heat' ? 0.5 : 0.18)); }
  R.parts = R.parts.filter(p => p.a > 0.02);
  for (const f of R.floats) { f.life += dt; f.h += 18 * dt; }
  R.floats = R.floats.filter(f => f.life < 1.6);
  for (const b of R.bubbles) b.life += dt;
  R.bubbles = R.bubbles.filter(b => b.life < b.max);
}
function drawParts(ctx) {
  const Z = R.cam.z;
  for (const p of R.parts) {
    const [x, y] = toScreen(p.x, p.y - p.h);
    ctx.fillStyle = p.kind === 'smog' ? `rgba(70,66,62,${p.a})` : p.kind === 'heat' ? `rgba(230,230,235,${p.a * 0.6})` : `rgba(250,250,252,${p.a})`;
    ctx.beginPath(); ctx.arc(x, y, p.r * Z, 0, 7); ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of R.floats) {
    const [x, y] = toScreen(f.x, f.y - f.h);
    ctx.globalAlpha = Math.max(0, 1 - f.life / 1.6);
    ctx.font = '800 14px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText(f.txt, x, y); ctx.fillStyle = f.col; ctx.fillText(f.txt, x, y);
    ctx.globalAlpha = 1;
  }
}
function floatText(n, txt, col) { const w = iso(n.x + 0.5, n.y + 0.5); R.floats.push({ x: w.x, y: w.y, h: 30, txt, col: col || '#ffd23f', life: 0 }); }
function dayness(s) {
  const h = hourOf(s.t), m = monthOf(s.t), c = Math.cos(2 * Math.PI * (m - 5.5) / 12), L = 12 + 3.6 * c, rise = 12.5 - L / 2, set = 12.5 + L / 2;
  return clamp(Math.min(h - rise + 0.8, set + 0.8 - h) / 1.6, 0, 1);
}
function drawWeather(ctx, s) {
  const ev = activeEv(s), raining = s.w.c > 0.82 || (ev && (ev.k === 'storm' || ev.k === 'cloud'));
  const snow = ev && ev.k === 'cold';
  if (ev && ev.k === 'heat') { ctx.fillStyle = 'rgba(255,140,40,.10)'; ctx.fillRect(0, 0, R.W, R.H); }
  if (ev && ev.k === 'calm') { ctx.fillStyle = 'rgba(200,205,215,.22)'; ctx.fillRect(0, 0, R.W, R.H); }
  if (s.w.c > 0.5) { ctx.fillStyle = `rgba(60,70,90,${(s.w.c - 0.5) * 0.22})`; ctx.fillRect(0, 0, R.W, R.H); }
  if (!raining && !snow) { R.rain.length = 0; return; }
  const want = snow ? 90 : ev && ev.k === 'storm' ? 140 : 70;
  while (R.rain.length < want) R.rain.push({ x: Math.random() * R.W, y: Math.random() * R.H, v: 0.6 + Math.random() * 0.6 });
  const wx = snow ? 20 : (ev && ev.k === 'storm' ? 260 : 60);
  ctx.strokeStyle = snow ? 'rgba(255,255,255,.85)' : 'rgba(200,220,255,.55)'; ctx.lineWidth = snow ? 2.4 : 1.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const d of R.rain) {
    d.y += (snow ? 60 : 700) * d.v * R.dt; d.x += wx * R.dt * d.v;
    if (d.y > R.H) { d.y = -10; d.x = Math.random() * R.W; } if (d.x > R.W) d.x -= R.W;
    ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - (snow ? 0.5 : wx * 0.02), d.y - (snow ? 0.5 : 12));
  }
  ctx.stroke(); ctx.lineCap = 'butt';
}

// ---------- frame
function renderFrame(s, dt) {
  const ctx = R.ctx;
  R.dt = dt; R.time += dt; R.icons = []; R.lights = [];
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  ctx.fillStyle = '#2a6db8'; ctx.fillRect(0, 0, R.W, R.H);
  R.night = 1 - dayness(s);
  drawTerrain(ctx, s);
  drawLines(ctx, s);
  const objs = s.nodes.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  for (const n of objs) {
    const base = tileH(s, n.x, n.y), [cx, cy] = sp(n.x + 0.5, n.y + 0.5, base);
    if (cx < -80 || cx > R.W + 80 || cy < -100 || cy > R.H + 60) continue;
    if (n.k === 'town') drawTown(ctx, s, n, cx, cy);
    else if (n.k === 'border') drawBorder(ctx, s, n, cx, cy);
    else if (n.k === 'ind') drawInd(ctx, s, n, cx, cy);
    else drawPlant(ctx, s, n, cx, cy);
  }
  updParts(dt);
  drawParts(ctx);
  if (R.night > 0.02) {
    ctx.fillStyle = `rgba(14,22,62,${R.night * 0.45})`; ctx.fillRect(0, 0, R.W, R.H);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, a, c] of R.lights) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, c ? `rgba(255,80,80,${a * R.night})` : `rgba(255,214,120,${a * R.night})`); g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawWeather(ctx, s);
  drawLabels(ctx, s);
  drawTool(ctx, s);
  drawBubbles(ctx, s);
}

// Small map picture for the share card and scenario cards
function drawMiniMap(ctx, s, x0, y0, w, h) {
  const M = s.map, sc = Math.min(w / ((M.W + M.H) * TW / 2), h / ((M.W + M.H) * TH / 2 + 30));
  const ox = x0 + w / 2 - ((M.W - M.H) * TW / 4) * sc, oy = y0 + (h - (M.W + M.H) * TH / 2 * sc) / 2 + 10 * sc;
  const P = (x, y, hh = 0) => [ox + (x - y) * TW / 2 * sc, oy + (x + y) * TH / 2 * sc - hh * sc];
  for (let d = 0; d < M.W + M.H - 1; d++) for (let x = Math.max(0, d - M.H + 1); x <= Math.min(d, M.W - 1); x++) {
    const y = d - x, i = x + y * M.W, hh = M.hgt[i];
    poly(ctx, [P(x, y, hh), P(x + 1, y, hh), P(x + 1, y + 1, hh), P(x, y + 1, hh)], M.t[i] === T.MOUNT ? '#b9b3a8' : TCOL[M.t[i]]);
  }
  for (const l of s.lines) {
    const a = s.idx[l.a], b = s.idx[l.b]; if (!a || !b) continue;
    const A = P(a.x + 0.5, a.y + 0.5, 10), B = P(b.x + 0.5, b.y + 0.5, 10);
    ctx.strokeStyle = l.st === 'ok' ? '#ffd23f' : '#888'; ctx.lineWidth = Math.max(1.5, TIERS[l.tier].w * sc * 1.4);
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  }
  for (const n of s.nodes) {
    const [x, y] = P(n.x + 0.5, n.y + 0.5, 10);
    const col = n.k === 'town' ? '#ffffff' : n.k === 'border' ? '#7aa7ff' : n.k === 'plant' ? CAT_COL[PLANTS[n.type].cat] : '#c9c5b8';
    ctx.fillStyle = col; ctx.strokeStyle = '#1b1535'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, n.k === 'town' ? Math.max(3, 2 + Math.sqrt(n.pop / 20000) * 1.5) : 3, 0, 7); ctx.fill(); ctx.stroke();
  }
}
