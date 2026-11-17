// Procedural pixel-art sprites for the OutRun-style renderer. Each sprite: { c: canvas, w: width in metres, h: height in metres }.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
const spr = (c, w) => ({ c, w, h: w * c.height / c.width });
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function speckle(g, x, y, w, h, cols, n, r) { for (let i = 0; i < n; i++) px(g, x + (r() * w | 0), y + (r() * h | 0), 1, 1, cols[(r() * cols.length) | 0]); }
// filled polygon helper
function poly(g, pts, col) { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); }

export function makeSprites() {
  const r = rng(1984), S = {};
  // --- countryside ---
  { const [c, g] = cv(14, 52);
    for (let y = 0; y < 46; y++) { const t = y / 46, hw = Math.round(1 + Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * 6); px(g, 7 - hw, y, hw * 2, 1, '#24411f'); px(g, 7 - hw, y, Math.max(1, hw - 1), 1, '#2f5528'); }
    speckle(g, 1, 3, 12, 42, ['#1a3317', '#3d6a33'], 60, r); px(g, 6, 46, 2, 6, '#4a3424'); S.cypress = spr(c, 2.8); }
  { const [c, g] = cv(44, 34);
    px(g, 20, 12, 4, 22, '#6b4a32'); px(g, 21, 12, 1, 22, '#8a6446'); px(g, 14, 14, 8, 2, '#6b4a32'); px(g, 23, 15, 8, 2, '#6b4a32');
    for (let y = 0; y < 13; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 7) / 7) ** 2)) * 21); px(g, 22 - hw, y, hw * 2, 1, y < 5 ? '#4b7238' : '#3a5c2c'); }
    speckle(g, 2, 0, 40, 12, ['#2c4a22', '#5c8546'], 90, r); S.umbrella = spr(c, 10); }
  { const [c, g] = cv(24, 20);
    px(g, 10, 11, 4, 9, '#6a5a48'); for (let y = 0; y < 13; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 6) / 6.5) ** 2)) * 11); px(g, 12 - hw, y, hw * 2, 1, '#8a9a68'); }
    speckle(g, 2, 0, 20, 12, ['#6d7d50', '#a7b688'], 60, r); S.olive = spr(c, 4.5); }
  { const [c, g] = cv(64, 42); // casale: ochre farmhouse, terracotta roof, little tower
    px(g, 4, 18, 56, 24, '#d8a56a'); speckle(g, 4, 18, 56, 24, ['#c99558', '#e4b57c'], 120, r);
    poly(g, [[0, 19], [32, 8], [64, 19]], '#b4532e'); px(g, 0, 18, 64, 2, '#8e3f22');
    px(g, 40, 2, 14, 18, '#cf9a60'); poly(g, [[38, 3], [47, -3], [56, 3]], '#b4532e');
    for (const x of [10, 22, 34]) { px(g, x, 23, 5, 6, '#3a2a20'); px(g, x - 1, 23, 1, 6, '#2e5a3a'); px(g, x + 5, 23, 1, 6, '#2e5a3a'); }
    px(g, 44, 7, 5, 5, '#3a2a20'); px(g, 47, 31, 7, 11, '#5a3a24'); S.farm = spr(c, 15); }
  { const [c, g] = cv(48, 12); for (let x = 0; x < 48; x += 6) px(g, x, 2, 1, 10, '#5a4a38'); px(g, 0, 2, 48, 8, '#4c6a2c'); speckle(g, 0, 2, 48, 8, ['#3b5622', '#6a8a3e', '#5a2a4a'], 80, r); S.vines = spr(c, 10); }
  { const [c, g] = cv(16, 12); for (let y = 0; y < 12; y++) { const hw = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 6) / 6.2) ** 2)) * 8); px(g, 8 - hw, y, hw * 2, 1, '#d9be63'); }
    px(g, 3, 4, 10, 1, '#b89a40'); px(g, 3, 8, 10, 1, '#b89a40'); S.bale = spr(c, 1.8); }
  { const [c, g] = cv(16, 7); px(g, 0, 0, 16, 7, '#8a7c66'); for (let y = 0; y < 7; y += 2) for (let x = -(y % 4); x < 16; x += 4) px(g, x + 1, y, 3, 1, '#b5a68a'); px(g, 0, 0, 16, 1, '#c9bba0'); S.wall = spr(c, 4.1); }
  // --- mountains ---
  { const [c, g] = cv(26, 50);
    for (let tier = 0; tier < 4; tier++) { const y0 = 4 + tier * 10; for (let y = 0; y < 16; y++) { const hw = Math.round(2 + y * (0.55 + tier * 0.12)); px(g, 13 - hw, y0 + y, hw * 2, 1, y % 5 === 0 ? '#2e5539' : '#244832'); } }
    px(g, 11, 44, 4, 6, '#4f3a2a'); S.pine = spr(c, 5.2); }
  { const [c, g] = cv(24, 13); poly(g, [[0, 13], [3, 5], [9, 1], [17, 2], [23, 8], [24, 13]], '#8f8a82'); poly(g, [[3, 5], [9, 1], [17, 2], [12, 6]], '#b1aca4'); speckle(g, 2, 3, 20, 9, ['#77726b', '#a19c94'], 30, r); S.rock = spr(c, 3.6); }
  { const [c, g] = cv(16, 8); px(g, 0, 1, 16, 3, '#c3c9d0'); px(g, 0, 2, 16, 1, '#8e959e'); px(g, 1, 1, 2, 7, '#7c838c'); S.rail = spr(c, 4.1); }
  { const [c, g] = cv(3, 8); px(g, 0, 0, 3, 8, '#7c838c'); px(g, 0, 0, 3, 1, '#a0a7b0'); S.railpost = spr(c, 0.22); }
  { const [c, g] = cv(4, 14); px(g, 0, 0, 4, 14, '#f2f2f2'); px(g, 0, 0, 4, 3, '#151515'); px(g, 0, 5, 4, 1, '#d02020'); S.post = spr(c, 0.28); }
  { const [c, g] = cv(32, 20);
    for (let i = 0; i < 9; i++) { const x = 1 + i * 3.4 + (r() * 2 | 0), h = 9 + (r() * 5 | 0), col = ['#e03030', '#2a5ad8', '#f2c614', '#ffffff', '#2fa84a', '#ff8a00'][(r() * 6) | 0];
      px(g, x, 20 - h, 3, h - 3, col); px(g, x, 20 - h - 3, 3, 3, '#e8c4a0'); if (r() < 0.4) px(g, x - 1, 20 - h - 1, 1, 4, '#e8c4a0'); }
    S.fans = spr(c, 4.4); }
  // --- riviera ---
  const facades = [['#f0c27a', '#d9a75c'], ['#e9a07a', '#cf8662'], ['#f3dfa0', '#d8c180'], ['#e8b4a0', '#cc9682'], ['#d88a5e', '#bd7046'], ['#f2e6c8', '#d6c8a6']];
  S.houses = facades.map(([a, b], k) => {
    const fl = 3 + (k % 3), [c, g] = cv(48, 12 + fl * 14);
    const H = c.height; px(g, 0, 6, 48, H - 6, a); speckle(g, 0, 6, 48, H - 6, [b], 140, r);
    px(g, 0, 0, 48, 6, '#b85a34'); for (let x = 0; x < 48; x += 4) px(g, x, 4, 2, 2, '#8e3f22'); px(g, 0, 6, 48, 2, '#9e8f7c');
    for (let f = 0; f < fl; f++) for (let x = 4; x < 46; x += 11) { const y = 10 + f * 14; px(g, x, y, 7, 9, '#1d1d26'); px(g, x - 2, y, 2, 9, '#2e5a3a'); px(g, x + 7, y, 2, 9, '#2e5a3a'); if (f > 0 && k % 2) px(g, x - 1, y + 9, 9, 1, '#3a3a3a'); }
    px(g, 18, H - 12, 12, 12, '#4a3020'); px(g, 0, H - 2, 48, 2, b);
    return spr(c, 12);
  });
  { const [c, g] = cv(34, 50);
    for (let y = 14; y < 50; y++) px(g, 15 + Math.round(Math.sin(y / 9) * 2), y, 4, 1, y % 3 ? '#7a6046' : '#5e4834');
    for (let k = 0; k < 7; k++) { const a = -Math.PI + k * Math.PI / 6; for (let t = 0; t < 15; t++) { const x = 17 + Math.cos(a) * t, y = 15 + Math.sin(a) * t * 0.6 + t * t * 0.035; px(g, x | 0, y | 0, 2, 2, t % 4 ? '#4f7f34' : '#3b6626'); } }
    S.palm = spr(c, 6.5); }
  { const [c, g] = cv(14, 42); px(g, 2, 4, 2, 38, '#2a2a2a'); px(g, 2, 3, 10, 2, '#2a2a2a'); px(g, 9, 5, 4, 3, '#fff0b0'); px(g, 0, 40, 6, 2, '#2a2a2a'); S.lamp = spr(c, 1.7); }
  { const [c, g] = cv(20, 84); px(g, 2, 14, 16, 70, '#b5694a'); speckle(g, 2, 14, 16, 70, ['#9c573a', '#c47a58'], 120, r);
    px(g, 1, 24, 18, 2, '#e6d6b8'); px(g, 4, 27, 12, 10, '#2a2018'); px(g, 9, 27, 2, 10, '#b5694a'); px(g, 1, 38, 18, 2, '#e6d6b8');
    poly(g, [[1, 15], [10, 0], [19, 15]], '#9a4a2c'); S.tower = spr(c, 7); }
  { const [c, g] = cv(24, 18); // chevron board (points right)
    px(g, 0, 0, 24, 12, '#1d3fa8'); for (let k = 0; k < 3; k++) poly(g, [[3 + k * 7, 2], [7 + k * 7, 6], [3 + k * 7, 10], [5 + k * 7, 10], [9 + k * 7, 6], [5 + k * 7, 2]], '#ffffff');
    px(g, 4, 12, 2, 6, '#555'); px(g, 18, 12, 2, 6, '#555'); S.chevR = spr(c, 2.6);
    const [c2, g2] = cv(24, 18); g2.translate(24, 0); g2.scale(-1, 1); g2.drawImage(c, 0, 0); S.chevL = spr(c2, 2.6); }
  { const [c, g] = cv(64, 40); px(g, 6, 22, 3, 18, '#555'); px(g, 55, 22, 3, 18, '#555');
    px(g, 0, 0, 64, 24, '#ffd21a'); px(g, 2, 2, 60, 20, '#c81d25'); g.fillStyle = '#fff'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ITALIA', 32, 8); g.font = 'bold 9px monospace'; g.fillText("RALLY '95", 32, 17); S.board = spr(c, 7.5); }
  return S;
}

// Banner across the road for gates
export function bannerSprite(text, bg) {
  const [c, g] = cv(128, 14); px(g, 0, 0, 128, 14, bg); px(g, 0, 1, 128, 1, '#fff'); px(g, 0, 12, 128, 1, '#fff');
  g.fillStyle = '#fff'; g.font = 'bold italic 10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 7.5);
  return c;
}

// Rear-view car frames: turn -2..2 (negative = nose pointing left), lights dim/bright for braking.
export function carSprites(spec) {
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const B = hex(spec.body), A = hex(spec.accent), A2 = hex(spec.accent2), RIM = hex(spec.rim);
  const shade = (h, k) => { const n = parseInt(h.slice(1), 16); const f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; };
  const frames = {};
  for (const brake of [0, 1]) for (let t = -2; t <= 2; t++) {
    const [c, g] = cv(64, 44);
    const side = Math.abs(t) * 3, sx = t > 0 ? 0 : 1; // which side panel shows
    px(g, 3, 39, 58, 5, 'rgba(0,0,0,.45)');
    // tyres (+ the side of the tyres when turned)
    px(g, 6, 29, 10, 13, '#111'); px(g, 48, 29, 10, 13, '#111');
    if (t) { px(g, t > 0 ? 3 : 55, 30, 6, 11, '#151515'); px(g, t > 0 ? 4 : 56, 33, 4, 5, RIM); }
    // body
    const bx = 5 + (t > 0 ? 0 : 0), bw = 54;
    px(g, bx, 17, bw, 20, B);
    if (t) px(g, t > 0 ? bx : bx + bw - side, 17, side, 20, shade(B, 0.72));
    px(g, bx, 35, bw, 4, '#1a1a1a'); px(g, bx + 2, 17, bw - 4, 1, shade(B, 1.15));
    // livery
    if (spec.id === 'delta') { px(g, bx, 22, bw, 2, A); px(g, bx, 25, bw, 2, A2); px(g, bx, 27, bw, 1, '#3c8fd8'); }
    else if (spec.id === 'impreza') { px(g, bx, 23, bw, 3, A); }
    else if (spec.id === 'celica') { px(g, bx, 26, bw, 5, A); px(g, bx, 31, bw, 1, A2); }
    else { for (let k = 0; k < 3; k++) px(g, bx + 4 + k * 4, 22 + k * 2, bw - 8 - k * 8, 1, A); }
    // tail lights + plate + exhaust
    const L = brake ? '#ff3a30' : '#9a1018';
    px(g, bx + 3, 21, 9, 4, L); px(g, bx + bw - 12, 21, 9, 4, L);
    if (brake) { px(g, bx + 1, 20, 13, 1, 'rgba(255,80,60,.6)'); px(g, bx + bw - 14, 20, 13, 1, 'rgba(255,80,60,.6)'); }
    px(g, 27, 28, 10, 5, '#f2f2f2'); px(g, 28, 30, 8, 1, '#333');
    px(g, 46, 37, 4, 2, '#777');
    // mud flaps
    px(g, 7, 37, 7, 5, spec.id === 'impreza' ? A : '#d0121b'); px(g, 50, 37, 7, 5, spec.id === 'impreza' ? A : '#d0121b');
    // cabin (shifted with the turn)
    const o = t * 2, low = spec.shape === 'coupe' ? 9 : 6;
    poly(g, [[10 + o, 17], [54 + o, 17], [49 + o, low], [15 + o, low]], B);
    poly(g, [[13 + o, 16], [51 + o, 16], [47 + o, low + 2], [17 + o, low + 2]], '#1b2330');
    px(g, 19 + o, low + 3, 10, 1, '#4a5a70');
    if (spec.id === 'celica') px(g, 15 + o, low, 34, 2, A);
    // spoilers
    if (spec.shape === 'hatch') px(g, 15 + o, low - 2, 34, 2, B);
    if (spec.shape === 'sedan') { px(g, 6, 13, 52, 3, B); px(g, 10, 15, 2, 3, B); px(g, 52, 15, 2, 3, B); }
    if (spec.shape === 'coupe') { px(g, 6, 13, 52, 3, A); px(g, 10, 15, 2, 3, A); px(g, 52, 15, 2, 3, A); }
    if (spec.shape === 'wing') { px(g, 4, 3, 56, 4, B); px(g, 4, 2, 3, 8, A); px(g, 57, 2, 3, 8, A); px(g, 12, 7, 3, 11, B); px(g, 49, 7, 3, 11, B); }
    frames[brake + ':' + t] = c;
  }
  return { frames, w: 2.15, h: 2.15 * 44 / 64 };
}

// Parallax background layers for each track (drawn at 240 px reference height).
export function backgrounds(id) {
  const r = rng(id.length * 31), W = 1024;
  const layer = (h, draw) => { const [c, g] = cv(W, h); draw(g, h); return c; };
  if (id === 'toscana') return [
    { par: 0.5, c: layer(70, (g, h) => { for (let x = -40; x < W + 40; x += 90) { const hh = 26 + r() * 30; poly(g, [[x - 120, h], [x, h - hh], [x + 130, h]], '#8fa7b8'); } }) },
    { par: 1.0, c: layer(56, (g, h) => {
      for (let x = -60; x < W + 60; x += 70) { const hh = 14 + r() * 22; poly(g, [[x - 90, h], [x - 20, h - hh], [x + 30, h - hh - 4], [x + 100, h]], ['#7f9a52', '#8aa45a', '#97a860'][(r() * 3) | 0]); }
      for (let k = 0; k < 70; k++) { const x = r() * W, y = h - 6 - r() * 20; px(g, x, y - 7, 2, 8, '#2c4a2a'); }
      for (let k = 0; k < 10; k++) { const x = r() * W, y = h - 10 - r() * 14; px(g, x, y, 7, 5, '#d8a56a'); px(g, x - 1, y - 2, 9, 2, '#b4532e'); }
    }) },
  ];
  if (id === 'passo') return [
    { par: 0.45, c: layer(120, (g, h) => { for (let x = -60; x < W + 60; x += 110) { const hh = 70 + r() * 45, w = 110 + r() * 60; poly(g, [[x - w, h], [x, h - hh], [x + w, h]], '#7d8aa0');
      poly(g, [[x - w * 0.28, h - hh * 0.72], [x, h - hh], [x + w * 0.28, h - hh * 0.72], [x + w * 0.1, h - hh * 0.66], [x - w * 0.08, h - hh * 0.7]], '#f2f5fa'); } }) },
    { par: 1.0, c: layer(64, (g, h) => { for (let x = -40; x < W + 40; x += 60) { const hh = 22 + r() * 26; poly(g, [[x - 80, h], [x, h - hh], [x + 80, h]], '#4f7a52'); }
      for (let k = 0; k < 140; k++) { const x = r() * W, y = h - r() * 26; poly(g, [[x - 3, y], [x, y - 9], [x + 3, y]], '#223f2c'); } }) },
  ];
  return [
    { par: 0.5, c: layer(60, (g, h) => { for (let x = -40; x < W + 40; x += 120) { const hh = 24 + r() * 26; poly(g, [[x - 150, h], [x, h - hh], [x + 150, h]], '#7f9c86'); } px(g, 0, h - 6, W, 6, '#2d6fae'); for (let x = 0; x < W; x += 9) px(g, x, h - 4, 4, 1, '#79b2e6'); }) },
    { par: 1.0, c: layer(44, (g, h) => { for (let x = 0; x < W; x += 6 + (r() * 10 | 0)) { const hh = 8 + r() * 26, w = 6 + r() * 10;
      px(g, x, h - hh, w, hh, ['#e9c48c', '#e2a985', '#f0dfae', '#d88a5e'][(r() * 4) | 0]); px(g, x, h - hh, w, 2, '#b85a34'); } }) },
  ];
}
