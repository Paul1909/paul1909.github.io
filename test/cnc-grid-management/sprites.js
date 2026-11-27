// Procedural pixel art: terrain, structures, villages, units, cameos. Everything is drawn here at the
// native 24 px tile scale and scaled up with nearest-neighbour, so nothing is loaded from files.
'use strict';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) { return vnoise(x, y, s) * .55 + vnoise(x * 2.1, y * 2.1, s + 7) * .3 + vnoise(x * 4.3, y * 4.3, s + 13) * .15; }

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function rect(x, X, Y, w, h, col) { x.fillStyle = col; x.fillRect(Math.round(X), Math.round(Y), Math.round(w), Math.round(h)); }
function pix(x, X, Y, col) { x.fillStyle = col; x.fillRect(X | 0, Y | 0, 1, 1); }
function disc(x, cx, cy, r, col, top) {
  x.fillStyle = col;
  for (let dy = -r; dy <= (top ? 0 : r); dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy) + .35); x.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); }
}
function ell(x, cx, cy, rx, ry, col) {
  x.fillStyle = col;
  for (let dy = -ry; dy <= ry; dy++) { const w = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)) + .3); x.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); }
}
function bline(x, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  x.fillStyle = col; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy, n = 0;
  for (;;) { x.fillRect(x0, y0, 1, 1); if ((x0 === x1 && y0 === y1) || ++n > 400) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}

// ---------- palettes ----------
const PAL = {
  winter: {
    g: ['#dfe6ec', '#d2dae2', '#c4ced8', '#eef3f7', '#b3bfcb'], d: ['#7b6c5a', '#6a5c4b', '#8e7e68', '#594d40'],
    r: ['#76726d', '#918c86', '#aca7a1', '#504d49', '#393735'], w: ['#2a4c5f', '#345c72', '#417089', '#a5c3d4', '#d4e3ec'],
    road: ['#9d917f', '#867a69', '#b6ab9a'], shore: '#b9cfdc', tree: ['#16301f', '#22442f', '#30573f', '#eaf0f4', '#c3cfd8', '#4a3527'],
    shadow: 'rgba(70,90,120,.35)', roof: ['#f2f5f8', '#d4dce3', '#a9b4bf'], snow: 1,
  },
  temperate: {
    g: ['#5d8b3d', '#537f36', '#679847', '#78a854', '#47712e'], d: ['#8a7356', '#7a6449', '#9b8566', '#64513b'],
    r: ['#7a766f', '#958f88', '#b0aaa2', '#57534d', '#3f3c38'], w: ['#22567c', '#2a648d', '#3575a1', '#6aa0c4', '#9cc4dd'],
    road: ['#aa966f', '#94815e', '#bdab86'], shore: '#b8a77a', tree: ['#1c4520', '#285c2b', '#387538', '#5a944a', '#4b833d', '#4a3527'],
    shadow: 'rgba(20,40,10,.35)', roof: ['#c0623f', '#9c4a32', '#74331f'], snow: 0,
  },
};
const RED = ['#e4503e', '#b9291d', '#7e1710'];
const GREY = ['#aeaba5', '#8e8b86', '#67645f'];
const METAL = ['#7d8288', '#5d6166', '#3d4044'];
const WHITE = ['#f1f2f2', '#cfd3d6', '#9ea4a9'];
const WIN = '#262a30', LIT = '#ffd860';

// ---------- terrain ----------
// Returns a canvas of the whole map, baked once per game (trees are drawn live, everything else here).
function bakeTerrain(st) {
  const P = PAL[st.theme], Wd = st.W * TS, Hd = st.H * TS;
  const [c, x] = mk(Wd, Hd); const img = x.createImageData(Wd, Hd), d = img.data;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {}; for (const k of ['g', 'd', 'r', 'w', 'road']) C[k] = P[k].map(hex); C.shore = hex(P.shore);
  const tAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= st.W || ty >= st.H) ? -1 : st.t[ty * st.W + tx];
  const sd = st.seed;
  for (let py = 0; py < Hd; py++) for (let px = 0; px < Wd; px++) {
    const tx = (px / TS) | 0, ty = (py / TS) | 0, lx = px - tx * TS, ly = py - ty * TS;
    let t = tAt(tx, ty); if (t === F) t = G;
    const h = hash2(px, py, sd);
    // soft edges between ground and dirt
    const near = (dx, dy, dist) => { let n = tAt(tx + dx, ty + dy); if (n === F) n = G; return n; };
    let m = t;
    if (t === G || t === D) {
      const edges = [[-1, 0, lx], [1, 0, TS - 1 - lx], [0, -1, ly], [0, 1, TS - 1 - ly]];
      for (const [dx, dy, dist] of edges) { const n = near(dx, dy); if (dist < 5 && (n === G || n === D) && n !== t && h < (5 - dist) / 7) m = n; }
    }
    let col;
    const n1 = fbm(px / 22, py / 22, sd);
    if (m === G || m === ROAD && false) {
      const k = C.g; col = n1 < .36 ? k[2] : n1 < .62 ? k[1] : k[0];
      if (h < .045) col = k[3]; else if (h > .955) col = k[4];
      if (st.theme === 'temperate' && h > .997) col = [235, 220, 120];
    } else if (m === D) {
      const k = C.d; col = n1 < .45 ? k[1] : k[0]; if (h < .06) col = k[2]; else if (h > .94) col = k[3];
      if (P.snow && fbm(px / 5, py / 5, sd + 3) > .62) col = C.g[2];
    } else if (m === R) {
      col = C.r[3]; if (h < .2) col = C.r[4]; else if (h > .9) col = C.r[0];
    } else if (m === W || m === BRIDGE) {
      const k = C.w, wv = Math.sin(px * .45 + py * .9 + n1 * 7);
      col = wv > .86 ? k[2] : wv > .55 ? k[1] : k[0];
      // icy / foamy rim along the banks
      const dl = [[-1, 0, lx], [1, 0, TS - 1 - lx], [0, -1, ly], [0, 1, TS - 1 - ly]];
      for (const [dx, dy, dist] of dl) { const n = tAt(tx + dx, ty + dy); if (n !== W && n !== BRIDGE && n !== -1 && dist < 3 + (h < .4 ? 1 : 0)) col = dist < 1.5 ? k[4] : k[3]; }
    } else if (m === ROAD) {
      const k = C.road, rd = (dx, dy) => { const n = tAt(tx + dx, ty + dy); return n === ROAD || n === BRIDGE; };
      const hz = rd(-1, 0) || rd(1, 0), vt = rd(0, -1) || rd(0, 1);
      col = k[0]; if (h < .1) col = k[2];
      const rutH = hz && (ly === 8 || ly === 15) && h > .2, rutV = vt && (lx === 8 || lx === 15) && h > .2;
      if (rutH || rutV) col = k[1];
      if (P.snow && fbm(px / 4, py / 4, sd + 9) > .58) col = C.g[1];
      // keep the road narrow inside the tile
      const inH = hz && ly >= 5 && ly <= 18, inV = vt && lx >= 5 && lx <= 18;
      if (!(inH || inV) && (hz || vt)) { const k2 = C.g; col = n1 < .5 ? k2[1] : k2[0]; }
    }
    // shoreline on land pixels next to water
    if (t !== W && t !== BRIDGE && t !== R) {
      const dl = [[-1, 0, lx], [1, 0, TS - 1 - lx], [0, -1, ly], [0, 1, TS - 1 - ly]];
      for (const [dx, dy, dist] of dl) if (tAt(tx + dx, ty + dy) === W && dist < 2 + (h < .5 ? 1 : 0)) col = C.shore;
    }
    // grit around rocks
    if (t !== R && t !== W) {
      const dl = [[-1, 0, lx], [1, 0, TS - 1 - lx], [0, -1, ly], [0, 1, TS - 1 - ly]];
      for (const [dx, dy, dist] of dl) if (tAt(tx + dx, ty + dy) === R && dist < 6 && h < (6 - dist) / 9) col = h < .1 ? C.r[3] : C.r[1];
    }
    const o = (py * Wd + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // boulders and cliffs on rock tiles
  const rr = mulberry(sd + 77), rocks = [];
  for (let ty = 0; ty < st.H; ty++) for (let tx = 0; tx < st.W; tx++) if (tAt(tx, ty) === R) {
    const n = 2 + (rr() * 2 | 0);
    for (let i = 0; i < n; i++) rocks.push([tx * TS + 4 + rr() * 16, ty * TS + 4 + rr() * 16, 5 + rr() * 5 | 0]);
  }
  rocks.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, r] of rocks) {
    disc(x, cx + 2, cy + 2, r, P.r[4]); disc(x, cx, cy, r, P.r[0]); disc(x, cx - 1, cy - 1, r - 2, P.r[1]);
    disc(x, cx - r / 3, cy - r / 3, Math.max(1, r / 3 | 0), P.r[2]);
    if (P.snow) { disc(x, cx - 1, cy - r / 2, Math.max(2, r * .7 | 0), P.g[0], true); pix(x, cx + r / 2, cy - 1, P.g[3]); }
  }
  // bridges: wooden decks across the river
  for (let ty = 0; ty < st.H; ty++) for (let tx = 0; tx < st.W; tx++) if (tAt(tx, ty) === BRIDGE) {
    const X = tx * TS, Y = ty * TS;
    rect(x, X, Y + 6, TS, 12, '#6e5137'); for (let i = 0; i < TS; i += 3) rect(x, X + i, Y + 6, 1, 12, '#57402b');
    rect(x, X, Y + 5, TS, 1, '#3b2c1f'); rect(x, X, Y + 18, TS, 1, '#3b2c1f'); rect(x, X, Y + 19, TS, 1, 'rgba(0,0,0,.25)');
    if (P.snow) for (let i = 0; i < 10; i++) pix(x, X + rr() * TS, Y + 7 + rr() * 10, P.g[0]);
  }
  return c;
}

// ---------- trees ----------
function makeTrees(theme) {
  const P = PAL[theme], out = [];
  for (let v = 0; v < 4; v++) {
    const [c, x] = mk(20, 30), r = mulberry(v * 31 + 5);
    const deciduous = theme === 'temperate' && v === 3;
    rect(x, 9, 24, 2, 5, P.tree[5]);
    if (deciduous) {
      disc(x, 10, 14, 8, P.tree[0]); disc(x, 9, 13, 7, P.tree[1]); disc(x, 8, 11, 5, P.tree[2]); disc(x, 7, 10, 2, P.tree[3]);
      for (let i = 0; i < 14; i++) pix(x, 4 + r() * 12, 7 + r() * 13, P.tree[r() < .5 ? 0 : 2]);
    } else {
      const tiers = [[24, 9], [18, 7], [12, 5], [7, 3]];
      for (const [y, hw] of tiers) {
        for (let i = 0; i < 7; i++) {
          const w = Math.round(hw * (i + 1) / 7) + (v & 1);
          rect(x, 10 - w, y - 7 + i, w * 2, 1, P.tree[i > 4 ? 0 : 1]);
          rect(x, 10, y - 7 + i, w, 1, P.tree[0]);
          if (P.snow && i < 3) { rect(x, 10 - w, y - 7 + i, Math.max(1, w - 1), 1, i === 0 ? P.tree[3] : P.tree[4]); }
          else if (!P.snow && i < 2) rect(x, 10 - w, y - 7 + i, Math.max(1, w - 1), 1, P.tree[2]);
        }
      }
      pix(x, 10, 0, P.snow ? P.tree[3] : P.tree[2]);
    }
    out.push(c);
  }
  return out;
}

// ---------- structure helpers ----------
function slab(x, X, Y, w, h, snow, seed = 1) {
  const r = mulberry(seed);
  rect(x, X, Y, w, h, '#7e8287');
  for (let i = 0; i < w * h / 9; i++) pix(x, X + r() * w, Y + r() * h, r() < .5 ? '#73777c' : '#8a8e93');
  for (let i = 12; i < w; i += 12) rect(x, X + i, Y, 1, h, '#686c71');
  for (let i = 12; i < h; i += 12) rect(x, X, Y + i, w, 1, '#686c71');
  rect(x, X, Y, w, 1, '#9a9ea3'); rect(x, X, Y, 1, h, '#9a9ea3'); rect(x, X, Y + h - 1, w, 1, '#4f5357'); rect(x, X + w - 1, Y, 1, h, '#4f5357');
  if (snow) for (let i = 0; i < (w + h) * .8; i++) { const e = r() * 4 | 0, t = r(); const px = e < 2 ? X + t * w : (e === 2 ? X : X + w - 1), py = e < 2 ? (e === 0 ? Y : Y + h - 1) : Y + t * h; pix(x, px, py, '#e6ecf1'); }
}
function box(x, X, Y, w, d, h, roof, wall, o = {}) {
  rect(x, X, Y, w, d, roof[1]); rect(x, X, Y, w, 1, roof[0]); rect(x, X, Y, 1, d, roof[0]); rect(x, X, Y + d - 1, w, 1, roof[2]);
  if (o.ribs) for (let i = X + 2; i < X + w - 1; i += o.ribs) rect(x, i, Y + 1, 1, d - 2, roof[2]);
  rect(x, X, Y + d, w, h, wall[1]); rect(x, X + w - 1, Y + d, 1, h, wall[2]); rect(x, X, Y + d + h - 1, w, 1, wall[2]); rect(x, X, Y + d, w, 1, wall[2]);
  rect(x, X, Y + d + h, w, 1, 'rgba(0,0,0,.3)');
  if (o.snow) { const r = mulberry(X * 7 + Y); rect(x, X, Y, w, 2, '#f2f5f8'); for (let i = 0; i < w; i++) if (r() < .45) pix(x, X + i, Y + 2, '#dfe6ec'); for (let i = 0; i < d; i += 1) if (r() < .3) pix(x, X + r() * w, Y + i, '#e9eef2'); }
}
function windows(x, lights, X, Y, cols, rows, dx, dy, fx = 0, fy = 0) {
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const px = X + i * dx, py = Y + j * dy; rect(x, px, py, 2, 2, WIN); lights.push([px - fx, py - fy, 2, 2]);
  }
}
function cyl(x, X, Y, w, h, cols) {
  for (let i = 0; i < w; i++) { const t = i / (w - 1); const k = t < .2 ? 2 : t < .45 ? 0 : t < .75 ? 1 : 3; rect(x, X + i, Y, 1, h, cols[Math.min(k, cols.length - 1)]); }
}

// Structure sprites: {c, ox, oy, lights:[[x,y,w,h]], smoke:[[x,y,big]], beacon:[[x,y]]} with coords relative to the footprint's top-left.
function makeStructures(theme) {
  const sn = PAL[theme].snow, R = {};
  const mkS = (w, h, oy) => { const [c, x] = mk(w, h); return { c, x, ox: 0, oy: -oy, lights: [], smoke: [], beacon: [] }; };
  let s, x;

  // Construction Yard 3x3
  s = mkS(72, 90, 18); x = s.x; const Y0 = 18;
  slab(x, 0, Y0, 72, 72, sn, 3);
  for (let i = 0; i < 8; i++) { rect(x, 4 + i * 8, Y0 + 64, 4, 4, i % 2 ? '#2a2a2a' : '#e0b020'); }
  box(x, 5, Y0 + 18, 46, 18, 18, RED, GREY, { ribs: 4, snow: sn });
  rect(x, 20, Y0 + 40, 16, 14, '#2c2f34'); for (let i = 0; i < 16; i += 4) rect(x, 20 + i, Y0 + 39, 2, 1, '#e0b020');
  windows(x, s.lights, 9, Y0 + 41, 2, 2, 4, 5, 0, Y0); windows(x, s.lights, 41, Y0 + 41, 2, 2, 4, 5, 0, Y0);
  box(x, 53, Y0 + 30, 15, 12, 12, METAL, GREY, { snow: sn });
  rect(x, 57, Y0 + 45, 6, 6, WIN); s.lights.push([57, 45, 6, 2]);
  // crane
  for (let y = 2; y < Y0 + 30; y++) { rect(x, 59, y, 3, 1, y % 3 ? '#c9961c' : '#7a5a10'); }
  rect(x, 59, 2, 1, Y0 + 28, '#e8b832');
  for (let xx = 18; xx < 66; xx++) { rect(x, xx, 4, 1, 3, xx % 3 ? '#c9961c' : '#7a5a10'); }
  rect(x, 18, 4, 48, 1, '#e8b832'); rect(x, 26, 7, 1, 20, '#333'); rect(x, 24, 27, 5, 2, '#555');
  box(x, 56, 6, 8, 4, 3, METAL, METAL);
  s.beacon.push([60, 2 - Y0]); R.yard = s;

  // Coal plant 2x2
  s = mkS(48, 74, 26); x = s.x; let Y = 26;
  slab(x, 0, Y, 48, 48, sn, 5);
  ell(x, 38, Y + 41, 8, 4, '#1c1a18'); for (let i = 0; i < 14; i++) pix(x, 32 + Math.random() * 12, Y + 38 + Math.random() * 5, '#3b3834');
  box(x, 3, Y + 10, 28, 14, 18, RED, GREY, { ribs: 3, snow: sn });
  windows(x, s.lights, 6, Y + 28, 5, 1, 5, 0, 0, Y); rect(x, 12, Y + 35, 8, 7, WIN);
  rect(x, 31, Y + 20, 6, 3, METAL[1]); rect(x, 31, Y + 20, 6, 1, METAL[0]);
  cyl(x, 33, 3, 6, Y + 30, ['#c9c6c1', '#a5a29d', '#7d7a76', '#5d5a57']); cyl(x, 41, 9, 5, Y + 26, ['#c9c6c1', '#a5a29d', '#7d7a76', '#5d5a57']);
  for (const [cx, w, top] of [[33, 6, 3], [41, 5, 9]]) { rect(x, cx, top, w, 3, RED[1]); rect(x, cx, top + 3, w, 2, '#e8e8e8'); rect(x, cx, top + 5, w, 2, RED[1]); rect(x, cx, top, w, 1, '#2a2a2a'); }
  s.smoke.push([36, 3 - Y, 1], [43.5, 9 - Y, 1]); s.beacon.push([36, 2 - Y], [43, 8 - Y]); R.coal = s;

  // Gas turbine 2x2
  s = mkS(48, 66, 18); x = s.x; Y = 18;
  slab(x, 0, Y, 48, 48, sn, 7);
  for (const cx of [9, 23]) { disc(x, cx + 1, Y + 11, 7, 'rgba(0,0,0,.3)'); disc(x, cx, Y + 10, 7, WHITE[2]); disc(x, cx - 1, Y + 9, 6, WHITE[1]); disc(x, cx - 2, Y + 8, 3, WHITE[0]); rect(x, cx - 7, Y + 10, 15, 1, RED[1]); }
  box(x, 3, Y + 20, 31, 12, 12, METAL, GREY, { ribs: 4, snow: sn }); rect(x, 3, Y + 24, 31, 2, RED[1]);
  windows(x, s.lights, 7, Y + 36, 4, 1, 7, 0, 0, Y);
  cyl(x, 37, 0, 7, Y + 30, ['#b7bcc1', '#959a9f', '#6d7176', '#4d5054']); rect(x, 37, 0, 7, 2, '#2a2a2a'); rect(x, 37, 6, 7, 2, RED[1]);
  rect(x, 34, Y + 26, 3, 3, METAL[1]);
  s.smoke.push([40.5, -Y, 0]); s.beacon.push([40, -1 - Y]); R.gas = s;

  // Wind turbine 1x1 (blades are drawn live)
  s = mkS(24, 50, 26); x = s.x; Y = 26;
  ell(x, 12, Y + 18, 6, 2, '#6c7075'); rect(x, 8, Y + 16, 8, 2, '#8a8e93');
  for (let y = 5; y < Y + 18; y++) { const w = y < 20 ? 2 : 3; rect(x, 12 - (w >> 1), y, w, 1, WHITE[1]); pix(x, 12 - (w >> 1), y, WHITE[0]); pix(x, 12 + (w >> 1) - (w === 2 ? 0 : 0), y, WHITE[2]); }
  rect(x, 9, 3, 7, 3, WHITE[1]); rect(x, 9, 3, 7, 1, WHITE[0]); rect(x, 9, 5, 7, 1, RED[1]);
  s.hub = [12, 4 - Y]; s.beacon.push([12, 2 - Y]); R.wind = s;

  // Solar array 2x2
  s = mkS(48, 48, 0); x = s.x;
  rect(x, 1, 1, 46, 46, theme === 'winter' ? '#c8d0d8' : '#8d8a7a');
  for (let i = 0; i < 3; i++) {
    const py = 3 + i * 15;
    rect(x, 3, py + 10, 42, 2, 'rgba(0,0,0,.3)'); rect(x, 6, py + 10, 1, 3, '#555'); rect(x, 41, py + 10, 1, 3, '#555');
    rect(x, 3, py, 42, 10, '#1d2f5e');
    for (let j = 3; j < 45; j += 4) rect(x, j, py, 1, 10, '#36508c');
    rect(x, 3, py + 5, 42, 1, '#36508c'); rect(x, 3, py, 42, 1, '#7d97cf'); rect(x, 3, py + 9, 42, 1, '#8c939a');
    for (let j = 0; j < 6; j++) pix(x, 5 + j * 7, py + 2, '#9ab3e6');
  }
  s.panels = [[3, 3, 42, 10], [3, 18, 42, 10], [3, 33, 42, 10]]; R.solar = s;

  // Hydro dam 2x2 (sits across the river)
  s = mkS(48, 58, 10); x = s.x; Y = 10;
  box(x, 0, Y + 14, 48, 8, 12, ['#c3c6c9', '#a7abaf', '#7e8287'], ['#9a9ea3', '#84888d', '#5e6266'], { snow: sn });
  for (const gx of [6, 18, 30]) { rect(x, gx, Y + 24, 7, 8, '#22323c'); rect(x, gx, Y + 24, 7, 1, '#111'); }
  box(x, 32, Y + 2, 14, 9, 7, RED, GREY, { ribs: 3, snow: sn }); windows(x, s.lights, 35, Y + 13, 3, 1, 3, 0, 0, Y);
  rect(x, 2, Y + 12, 30, 2, '#5e6266'); for (let i = 3; i < 30; i += 4) rect(x, i, Y + 10, 1, 2, '#5e6266');
  s.foam = [[6, 23], [18, 23], [30, 23]]; R.hydro = s;

  // Nuclear reactor 3x3
  s = mkS(72, 106, 34); x = s.x; Y = 34;
  slab(x, 0, Y, 72, 72, sn, 9);
  const tcx = 22, tTop = 2, tBot = Y + 40;
  for (let y = tTop; y <= tBot; y++) {
    const t = (y - tTop) / (tBot - tTop), hw = Math.round(9 + 13 * (t - .42) * (t - .42) * 1.5);
    for (let xx = -hw; xx <= hw; xx++) { const l = (xx + hw * .35) / hw; const k = Math.abs(l) < .25 ? '#d9dad8' : l < -.6 ? '#9fa19f' : Math.abs(l) < .6 ? '#c3c4c2' : '#8a8c8a'; pix(x, tcx + xx, y, k); }
    if (y % 7 === 0) rect(x, tcx - hw + 2, y, hw * 2 - 3, 1, 'rgba(0,0,0,.06)');
  }
  ell(x, tcx, tTop + 1, 9, 2, '#3a3c3e'); rect(x, tcx - 15, tBot + 1, 31, 1, 'rgba(0,0,0,.35)');
  rect(x, 44, Y + 18, 24, 20, GREY[1]); rect(x, 44, Y + 18, 24, 1, GREY[0]); rect(x, 67, Y + 18, 1, 20, GREY[2]); rect(x, 44, Y + 24, 24, 3, RED[1]);
  disc(x, 56, Y + 18, 12, '#b9bcbe', true); disc(x, 54, Y + 16, 9, '#d6d8d9', true); disc(x, 52, Y + 12, 4, '#eeeff0', true);
  rect(x, 50, Y + 30, 12, 8, '#e0b020'); disc(x, 56, Y + 34, 2, '#222'); pix(x, 53, Y + 32, '#222'); pix(x, 59, Y + 32, '#222'); pix(x, 56, Y + 37, '#222');
  box(x, 4, Y + 48, 52, 10, 12, RED, GREY, { ribs: 4, snow: sn }); windows(x, s.lights, 8, Y + 62, 8, 1, 6, 0, 0, Y);
  s.smoke.push([tcx, tTop - Y, 2]); s.beacon.push([56, Y + 5 - Y - 1]); R.nuke = s;

  // Battery bunker 2x2
  s = mkS(48, 56, 8); x = s.x; Y = 8;
  slab(x, 0, Y, 48, 48, sn, 11);
  s.leds = [];
  for (const [cx, cy] of [[3, 4], [25, 4], [3, 25], [25, 25]]) {
    box(x, cx, Y + cy, 20, 7, 9, WHITE, ['#e3e5e6', '#c9cdd0', '#8f959a'], { snow: sn });
    for (let i = cx + 2; i < cx + 19; i += 2) rect(x, i, Y + cy + 8, 1, 7, '#b4b9bd');
    rect(x, cx, Y + cy + 11, 20, 2, RED[1]);
    s.leds.push([cx + 16, cy + 9]);
  }
  rect(x, 21, Y + 18, 6, 6, METAL[1]); rect(x, 21, Y + 18, 6, 1, METAL[0]);
  R.bess = s;

  // Substation 1x1
  s = mkS(24, 34, 10); x = s.x; Y = 10;
  rect(x, 1, Y + 1, 22, 22, '#9a988f'); for (let i = 0; i < 40; i++) pix(x, 1 + Math.random() * 22, Y + 1 + Math.random() * 22, Math.random() < .5 ? '#86847c' : '#b0aea5');
  for (let i = 1; i < 23; i += 2) { pix(x, i, Y + 1, '#444'); pix(x, i, Y + 22, '#444'); pix(x, 1, Y + i, '#444'); pix(x, 22, Y + i, '#444'); }
  box(x, 6, Y + 6, 12, 6, 7, METAL, METAL); for (let i = 7; i < 17; i += 2) rect(x, i, Y + 12, 1, 6, METAL[2]);
  for (const ix of [7, 11, 15]) { rect(x, ix, Y - 2, 2, 8, '#c8b89a'); for (let k = 0; k < 8; k += 2) rect(x, ix, Y - 2 + k, 2, 1, '#8a7a5a'); }
  rect(x, 4, Y + 19, 16, 2, RED[1]);
  s.beacon.push([12, -2]); R.sub = s;

  // SCADA dome 2x2 (dish drawn live)
  s = mkS(48, 66, 18); x = s.x; Y = 18;
  slab(x, 0, Y, 48, 48, sn, 13);
  box(x, 5, Y + 22, 38, 10, 12, RED, GREY, { ribs: 4, snow: sn }); windows(x, s.lights, 9, Y + 36, 6, 1, 5, 0, 0, Y);
  disc(x, 24, Y + 22, 14, '#9ea3a8', true); disc(x, 23, Y + 21, 12, '#c9cdd1', true); disc(x, 21, Y + 18, 6, '#e9ecee', true); rect(x, 10, Y + 22, 29, 1, '#6c7176');
  rect(x, 23, Y + 4, 2, 5, METAL[1]);
  s.dish = [24, 3]; s.beacon.push([24, 1]); R.dome = s;

  // Service depot 2x2
  s = mkS(48, 62, 14); x = s.x; Y = 14;
  slab(x, 0, Y, 48, 48, sn, 15);
  rect(x, 2, Y + 4, 22, 40, '#6e7277');
  for (let i = 0; i < 22; i += 4) { rect(x, 2 + i, Y + 4, 2, 2, '#e0b020'); rect(x, 2 + i, Y + 42, 2, 2, '#e0b020'); }
  for (let i = 0; i < 40; i += 4) { rect(x, 2, Y + 4 + i, 2, 2, '#e0b020'); rect(x, 22, Y + 4 + i, 2, 2, '#e0b020'); }
  rect(x, 10, Y + 16, 6, 14, '#5a5e62'); rect(x, 7, Y + 22, 12, 2, '#5a5e62');
  box(x, 26, Y + 6, 20, 12, 18, RED, GREY, { ribs: 3, snow: sn });
  rect(x, 29, Y + 22, 14, 13, '#2c2f34'); for (let i = 0; i < 13; i += 2) rect(x, 29, Y + 22 + i, 14, 1, '#3c4046');
  rect(x, 33, Y + 8, 6, 2, '#f0c030'); rect(x, 31, Y + 7, 2, 4, '#f0c030'); rect(x, 39, Y + 7, 2, 4, '#f0c030');
  s.lights.push([29, 22, 14, 1]); s.beacon.push([44, 4]); R.depot = s;

  // Tesla coil 1x1 (sparks drawn live)
  s = mkS(24, 58, 34); x = s.x; Y = 34;
  ell(x, 12, Y + 19, 8, 3, 'rgba(0,0,0,.3)');
  box(x, 4, Y + 9, 16, 6, 7, METAL, METAL);
  for (let y = 12; y < Y + 10; y++) { const w = Math.round(3 + (y - 12) / (Y - 2) * 3); const c = y % 2 ? '#b87333' : '#e09a4e'; rect(x, 12 - w, y, w * 2, 1, c); pix(x, 12 - w, y, '#6b3f1d'); pix(x, 12 + w - 1, y, '#6b3f1d'); }
  disc(x, 12, 7, 6, '#7d8288'); disc(x, 11, 6, 5, '#c8cdd2'); disc(x, 10, 5, 2, '#f0f3f5');
  s.tip = [12, 7 - Y]; R.tesla = s;

  // Pylon (line tile)
  s = mkS(24, 40, 16); x = s.x; Y = 16;
  const st1 = '#5c6166', st2 = '#9aa0a6';
  bline(x, 7, Y + 18, 10, 3, st1); bline(x, 17, Y + 18, 14, 3, st1); bline(x, 8, Y + 18, 11, 3, st2);
  for (let k = 0; k < 4; k++) { const y1 = 6 + k * 7, y2 = y1 + 7; bline(x, 10 - k * .8, y1, 15 + (k + 1) * .8, y2, st1); bline(x, 14 + k * .8, y1, 9 - (k + 1) * .8, y2, st1); }
  rect(x, 3, 4, 18, 2, st1); rect(x, 3, 4, 18, 1, st2); rect(x, 6, 9, 12, 1, st1);
  pix(x, 3, 6, '#c8b89a'); pix(x, 20, 6, '#c8b89a'); pix(x, 6, 10, '#c8b89a'); pix(x, 17, 10, '#c8b89a');
  ell(x, 12, Y + 18, 6, 1, 'rgba(0,0,0,.22)');
  R.pylon = s;
  // broken pylon
  s = mkS(24, 40, 16); x = s.x;
  bline(x, 7, Y + 18, 9, 10, st1); bline(x, 17, Y + 18, 14, 9, st1); bline(x, 9, 10, 3, 14, st1); rect(x, 1, 13, 6, 1, st1);
  ell(x, 12, Y + 18, 6, 1, 'rgba(0,0,0,.22)'); R.pylonX = s;

  for (const k in R) delete R[k].x;
  return R;
}

// ---------- village houses ----------
function makeHouses(theme) {
  const P = PAL[theme], sn = P.snow, out = {};
  const roof = sn ? P.roof : P.roof;
  const mkH = (oy) => { const [c, x] = mk(24, 24 + oy); return { c, x, oy: -oy, lights: [], smoke: [] }; };
  let h, x;
  const wood = ['#a3825e', '#8a6a4a', '#5f4632'], pale = ['#ddd0a8', '#c9b27a', '#8f7d50'], brick = ['#c26a4a', '#a3523a', '#6e3424'];
  // small house
  h = mkH(10); x = h.x; ell(x, 12, 30, 10, 3, P.shadow); box(x, 3, 10 + 3, 18, 9, 9, roof, wood); windows(x, h.lights, 6, 10 + 15, 2, 1, 9, 0, 0, 10); rect(x, 11, 10 + 16, 3, 6, '#3a2a1e'); rect(x, 16, 10 + 1, 2, 4, '#4a3a30'); h.smoke.push([17, 1 - 10, 0]); out.house = h;
  // pale house
  h = mkH(10); x = h.x; ell(x, 12, 30, 10, 3, P.shadow); box(x, 2, 10 + 4, 20, 8, 9, sn ? P.roof : ['#6a7f9a', '#556a85', '#3d4f66'], pale); windows(x, h.lights, 5, 10 + 15, 3, 1, 6, 0, 0, 10); rect(x, 4, 10 + 2, 2, 4, '#4a3a30'); h.smoke.push([5, 2 - 10, 0]); out.house2 = h;
  // big two-storey
  h = mkH(14); x = h.x; ell(x, 12, 36, 11, 3, P.shadow); box(x, 1, 14 + 1, 22, 9, 13, roof, brick); windows(x, h.lights, 4, 14 + 12, 4, 2, 5, 5, 0, 14); out.big = h;
  // church
  h = mkH(24); x = h.x; ell(x, 12, 46, 11, 3, P.shadow); box(x, 7, 24 + 5, 15, 8, 9, roof, ['#e8e2d4', '#cfc7b4', '#8f876f']);
  rect(x, 2, 24 - 4, 7, 22, '#d8d0bc'); rect(x, 8, 24 - 4, 1, 22, '#8f876f'); rect(x, 2, 24 - 4, 7, 1, '#f0ece2');
  for (let i = 0; i < 9; i++) rect(x, 5 - (i >> 2), 24 - 13 + i, 1 + (i >> 1), 1, sn ? '#e8eef2' : '#4b5a6b');
  rect(x, 5, 24 - 17, 1, 4, '#c9a83a'); rect(x, 4, 24 - 16, 3, 1, '#c9a83a');
  rect(x, 4, 24 + 2, 2, 3, WIN); h.lights.push([4, 2, 2, 3]); windows(x, h.lights, 11, 24 + 16, 3, 1, 3, 0, 0, 24); out.church = h;
  // apartment block
  h = mkH(22); x = h.x; ell(x, 12, 44, 11, 3, P.shadow); box(x, 2, 22 - 8 + 6, 20, 6, 22, sn ? P.roof : METAL, ['#c3bfb6', '#a9a59c', '#76736c']);
  windows(x, h.lights, 4, 22 + 6, 5, 4, 4, 4, 0, 22); out.block = h;
  // barn
  h = mkH(10); x = h.x; ell(x, 12, 30, 11, 3, P.shadow); box(x, 2, 10 + 3, 20, 9, 9, sn ? P.roof : METAL, ['#ad3a2a', '#8e2f22', '#5e1f16']); rect(x, 8, 10 + 14, 8, 7, '#e8dccb'); bline(x, 8, 10 + 14, 15, 10 + 20, '#5e1f16'); bline(x, 15, 10 + 14, 8, 10 + 20, '#5e1f16'); h.lights.push([3, 15, 2, 2]); out.barn = h;
  for (const k in out) delete out[k].x;
  return out;
}

// ---------- units: truck, jeep, thief (4 facings: 0 E, 1 S, 2 W, 3 N) ----------
function makeUnits() {
  const out = { truck: [], jeep: [], thief: [] };
  const flip = c => { const [d, x] = mk(c.width, c.height); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return d; };
  // truck east
  let [c, x] = mk(18, 12);
  rect(x, 1, 9, 16, 2, 'rgba(0,0,0,.3)'); rect(x, 1, 2, 11, 7, GREY[1]); rect(x, 1, 2, 11, 1, GREY[0]); rect(x, 12, 3, 5, 6, RED[1]); rect(x, 12, 3, 5, 1, RED[0]); rect(x, 15, 4, 2, 2, '#9fd0ff');
  bline(x, 3, 4, 10, 1, '#e8b832'); rect(x, 2, 4, 2, 2, '#c9961c');
  for (const wx of [3, 9, 14]) rect(x, wx, 9, 3, 2, '#1d1d1d');
  out.truck[0] = c; out.truck[2] = flip(c);
  [c, x] = mk(12, 18); rect(x, 2, 1, 8, 16, 'rgba(0,0,0,.25)'); rect(x, 2, 6, 8, 11, GREY[1]); rect(x, 2, 6, 1, 11, GREY[0]); rect(x, 2, 1, 8, 5, RED[1]); rect(x, 2, 1, 8, 1, RED[0]); rect(x, 3, 2, 6, 2, '#9fd0ff'); bline(x, 6, 8, 6, 15, '#e8b832');
  for (const wy of [3, 9, 14]) { rect(x, 1, wy, 1, 3, '#1d1d1d'); rect(x, 10, wy, 1, 3, '#1d1d1d'); }
  out.truck[3] = c; const [cs, xs] = mk(12, 18); xs.translate(0, 18); xs.scale(1, -1); xs.drawImage(c, 0, 0); out.truck[1] = cs;
  // jeep east
  [c, x] = mk(14, 10); rect(x, 1, 7, 12, 2, 'rgba(0,0,0,.3)'); rect(x, 1, 2, 12, 5, '#3d4a2f'); rect(x, 1, 2, 12, 1, '#5a6a45'); rect(x, 7, 2, 3, 3, '#9fd0ff'); rect(x, 1, 4, 12, 1, '#e8e8e8');
  for (const wx of [2, 9]) rect(x, wx, 7, 3, 2, '#1d1d1d'); out.jeep[0] = c; out.jeep[2] = flip(c);
  [c, x] = mk(10, 14); rect(x, 2, 1, 6, 12, '#3d4a2f'); rect(x, 2, 1, 1, 12, '#5a6a45'); rect(x, 3, 3, 4, 2, '#9fd0ff'); rect(x, 4, 1, 2, 12, '#e8e8e8');
  for (const wy of [2, 9]) { rect(x, 1, wy, 1, 3, '#1d1d1d'); rect(x, 8, wy, 1, 3, '#1d1d1d'); } out.jeep[3] = c;
  const [cj, xj] = mk(10, 14); xj.translate(0, 14); xj.scale(1, -1); xj.drawImage(c, 0, 0); out.jeep[1] = cj;
  // thief, two frames, facing east (west = flipped)
  for (let f = 0; f < 2; f++) {
    [c, x] = mk(8, 12); ell(x, 4, 11, 3, 1, 'rgba(0,0,0,.3)');
    rect(x, 3, 1, 3, 3, '#2a2a30'); pix(x, 5, 2, '#d8b090'); rect(x, 3, 4, 3, 4, '#3d3a44');
    if (f) { rect(x, 2, 8, 1, 3, '#222'); rect(x, 5, 8, 1, 3, '#222'); } else { rect(x, 3, 8, 1, 3, '#222'); rect(x, 4, 8, 1, 3, '#222'); }
    disc(x, 1, 5, 2, '#9a8a5a'); pix(x, 1, 4, '#b6a46e');
    out.thief.push(c);
  }
  out.thiefW = out.thief.map(flip);
  return out;
}

// ---------- smoke puffs ----------
function makePuffs() {
  const out = {}, shades = { l: ['#c9cbce', '#e2e4e6', '#f3f4f5'], g: ['#8f9194', '#a9abae', '#bfc1c3'], b: ['#1c1c1c', '#2c2c2c', '#3c3c3c'] };
  for (const k in shades) {
    out[k] = []; const c3 = shades[k];
    for (let r = 0; r <= 7; r++) {
      const [c, x] = mk(r * 2 + 3, r * 2 + 3);
      disc(x, r + 1, r + 1, r, c3[0]); disc(x, r, r, Math.max(0, r - 1), c3[1]); if (r > 2) disc(x, r - 1, r - 1, r >> 1, c3[2]);
      out[k].push(c);
    }
  }
  return out;
}

// ---------- cameos (build menu pictures, 64 x 48) ----------
function makeCameo(type, SPR, HOUSES, UNITS) {
  const [c, x] = mk(64, 48);
  const g = x.createLinearGradient(0, 0, 0, 48); g.addColorStop(0, '#2b3542'); g.addColorStop(.62, '#1a1f27'); g.addColorStop(.63, '#2a2c26'); g.addColorStop(1, '#16170f');
  x.fillStyle = g; x.fillRect(0, 0, 64, 48);
  for (let i = 0; i < 30; i++) pix(x, Math.random() * 64, 30 + Math.random() * 18, '#34362d');
  const put = (img, s) => { const w = img.width * s, h = img.height * s; x.drawImage(img, Math.round(32 - w / 2), Math.round(44 - h), Math.round(w), Math.round(h)); };
  if (type === 'truck' || type === 'jeep') put(UNITS[type][0], 2.6);
  else if (type === 'line') { put(SPR.pylon.c, 1.1); bline(x, 0, 18, 22, 22, '#222'); bline(x, 42, 22, 64, 18, '#222'); }
  else {
    const sp = SPR[type]; const s = Math.min(58 / sp.c.width, 44 / sp.c.height, type === 'sub' || type === 'tesla' || type === 'wind' ? 1.4 : 1);
    put(sp.c, s);
    if (type === 'wind') { const hx = 32 + (sp.hub[0] - 12) * s, hy = 44 - sp.c.height * s + (sp.hub[1] + 26) * s; for (let k = 0; k < 3; k++) { const a = k * 2.094 + .4; bline(x, hx, hy, hx + Math.cos(a) * 15, hy + Math.sin(a) * 15, '#e8ebee'); } }
  }
  x.strokeStyle = 'rgba(255,255,255,.15)'; x.strokeRect(.5, .5, 63, 47);
  return c;
}
