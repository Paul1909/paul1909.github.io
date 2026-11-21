'use strict';
// Squishtris: falling blocks made of soft-body jelly.
// Each piece is a lattice of particles held together by shape matching (position-based dynamics).
// A row clears when the jelly covers at least 90 % of its area; the slice is cut out and
// everything above falls under gravity.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'squishtris';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const settings = Object.assign({ mat: 'wood', sound: true, vibe: true }, store.get('settings', {}));
if (!['glass', 'wood', 'jelly'].includes(settings.mat)) settings.mat = settings.squish === 'jelly' ? 'jelly' : 'wood';
delete settings.squish;
const saveSettings = () => store.set('settings', settings);
const bestOf = m => store.get('best-' + m, { score: 0, level: 0 });

// ---------- constants (world units: 1 = one cell) ----------
const W = 10, H = 20;
const R = 0.25, D = R * 2;               // particle radius / spacing
const STEP = 1 / 120, ITERS = 4;
const G = 26, DAMP = 0.992;
const CTRL_ALPHA = 0.5, CTRL_INVMASS = 1;
// Materials: alpha = shape stiffness, mu = friction, pack = how hard the press squeezes.
const MAT = {
  glass: { alpha: 0.85, mu: 0.1, pack: 0.97, name: 'Glass', info: 'Fragile! Let it fall or bang it and it shatters. Carry it down gently.' },
  wood: { alpha: 0.85, mu: 0.35, pack: 0.97, name: 'Wood', info: 'Solid blocks that don\'t bounce. Squeeze one and it stays crushed.' },
  jelly: { alpha: 0.09, mu: 0.18, pack: 0.88, name: 'Jelly', info: 'Squishy! It spreads into every gap, so rows fill up (and vanish) easily.' },
};
const mat = () => MAT[settings.mat] || MAT.wood;
const YIELD = 0.07, CREEP = 0.35;
const BREAK_DV = 5.5, CRUSH = 0.14;
const THRESH = 0.9, HOLD_T = 0.2, LOCK_DELAY = 0.5, MAX_RESETS = 12;
const VX0 = -0.15, VX1 = 10.8, VY0 = -2.3, VY1 = 20.15;
const PRESS_TOP = -2.7, PLATE = 0.8;               // parked plate bottom (off screen), plate thickness

const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const COLORS = { I: '#45d4ff', O: '#ffd23f', T: '#b77cff', S: '#55e07a', Z: '#ff5577', J: '#4f86ff', L: '#ff9b3d' };

function mix2(a, b, t) {
  const n = parseInt(a.slice(1), 16), m = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((n >> s) & 255) * (1 - t) + ((m >> s) & 255) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function mix(hex, t, toWhite) {
  const n = parseInt(hex.slice(1), 16), v = toWhite ? 255 : 0;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (v - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const cv = $('field'), ctx = cv.getContext('2d');
const nextCv = $('next'), nctx = nextCv.getContext('2d');
const cov = document.createElement('canvas');
cov.width = W * 8; cov.height = H * 8;
const cctx = cov.getContext('2d', { willReadFrequently: true });

// ---------- world state ----------
let pid = 0;
let bodies = [], parts = [], active = null, sparks = [], flashes = [];
const T = { x: 0, y: 0, tx: 0, a: 0, ta: 0 };   // target pose of the falling piece
let state = 'menu', score = 0, lines = 0, level = 1, bag = [], nextType = null;
let levelTime = 0;
let goal = 6, piecesLeft = 0, winHold = 0, outTimer = 0, curHeight = 0, levelStartScore = 0, shards = [];
const levelGoal = l => Math.min(4 + 2 * l, 17);     // rows to build up to
const levelPieces = l => levelGoal(l) + 4;          // pieces you get for it
let lockTimer = 0, lockResets = 0, hard = false, hardHeld = false, softBtn = false, softDrag = false;
let overTimer = 0, covTimer = 0, acc = 0, spawnDelay = 0, shake = 0;
const fill = new Float32Array(H), hold = new Float32Array(H);
const press = { phase: 'idle', y: PRESS_TOP, target: 0, t: 0, touch: 0, contact: false };
let heldType = null;
let carry = null;               // finger carrying the falling piece            // the falling piece waits here while the press works
const grabs = new Map();        // pointerId -> finger squeezing a settled piece

// ---------- bodies ----------
function makePiece(type) {
  const map = new Map(), ps = [];
  for (const [cx, cy] of SHAPES[type]) {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const i = cx * 2 + a, j = cy * 2 + b, k = i + ',' + j;
      if (!map.has(k)) {
        const p = { id: pid++, i, j, rx: i * D + R, ry: j * D + R, x: 0, y: 0, px: 0, py: 0, qx: 0, qy: 0, b: null };
        map.set(k, p); ps.push(p);
      }
    }
  }
  const quads = [];
  for (const p of ps) {
    const p1 = map.get((p.i + 1) + ',' + p.j), p2 = map.get((p.i + 1) + ',' + (p.j + 1)), p3 = map.get(p.i + ',' + (p.j + 1));
    if (p1 && p2 && p3) quads.push([p, p1, p2, p3]);
  }
  return buildBody(ps, quads, type);
}

function buildBody(ps, quads, type) {
  const body = {
    parts: ps, quads, type, edges: [], controlled: false,
    color: COLORS[type], dark: mix(COLORS[type], 0.55, false), light: mix(COLORS[type], 0.55, true),
    wood: mix2(COLORS[type], '#a06a38', 0.5), woodDark: mix2(COLORS[type], '#3a220e', 0.7),
    glass: mix2(COLORS[type], '#2b3d63', 0.42), touch: 0,
    cx: 0, cy: 0, ang: 0, strain: 0, eyes: false, blink: 1 + Math.random() * 4, squint: 0,
  };
  let sx = 0, sy = 0;
  for (const p of ps) { sx += p.rx; sy += p.ry; }
  const rcx = sx / ps.length, rcy = sy / ps.length;
  for (const p of ps) { p.qx = p.rx - rcx; p.qy = p.ry - rcy; p.b = body; p.qs = []; }
  for (const q of quads) for (const p of q) p.qs.push(q);
  // Boundary edges: quad edges that belong to exactly one quad.
  const cnt = new Map();
  for (const q of quads) for (let e = 0; e < 4; e++) {
    const a = q[e], c = q[(e + 1) % 4], k = a.id < c.id ? a.id + '_' + c.id : c.id + '_' + a.id;
    const v = cnt.get(k);
    if (v) v.n++; else cnt.set(k, { n: 1, a, c });
  }
  for (const p of ps) p.be = [];
  for (const v of cnt.values()) if (v.n === 1) { const e = [v.a, v.c]; body.edges.push(e); v.a.be.push(e); v.c.be.push(e); }
  // Eyes only if both eye spots sit inside the rest shape.
  const inside = (x, y) => quads.some(q => x >= q[0].rx - R && x <= q[0].rx + D + R && y >= q[0].ry - R && y <= q[0].ry + D + R);
  body.eyes = quads.length >= 3 && inside(rcx - 0.24, rcy - 0.08) && inside(rcx + 0.24, rcy - 0.08);
  return body;
}

function rebuildParts() {
  parts = [];
  for (const b of bodies) for (const p of b.parts) parts.push(p);
  for (let i = 0; i < parts.length; i++) parts[i].idx = i;
}

// ---------- physics ----------
const GC = 24, GR = 60, NC = GC * GR;
const cellStart = new Int32Array(NC + 1);
let cellItems = new Int32Array(2048), pcell = new Int32Array(2048);

function cellOf(x, y) {
  let gx = ((x + 1) * 2) | 0, gy = ((y + 9) * 2) | 0;
  if (gx < 0) gx = 0; else if (gx >= GC) gx = GC - 1;
  if (gy < 0) gy = 0; else if (gy >= GR) gy = GR - 1;
  return gy * GC + gx;
}

function buildHash() {
  const n = parts.length;
  if (n > cellItems.length) { cellItems = new Int32Array(n * 2); pcell = new Int32Array(n * 2); }
  cellStart.fill(0);
  for (let i = 0; i < n; i++) { const c = cellOf(parts[i].x, parts[i].y); pcell[i] = c; cellStart[c + 1]++; }
  for (let c = 0; c < NC; c++) cellStart[c + 1] += cellStart[c];
  const cur = cellStart.slice(0, NC);
  for (let i = 0; i < n; i++) cellItems[cur[pcell[i]]++] = i;
}

function shapeMatch(b, alpha) {
  const ps = b.parts, n = ps.length;
  let cx = 0, cy = 0;
  for (const p of ps) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  b.cx = cx; b.cy = cy;
  let gx0 = cx, gy0 = cy, ang;
  if (b.controlled && !b.landed) ang = T.a;     // the player sets the falling piece's angle until it lands
  else {
    let A = 0, B = 0;
    for (const p of ps) { const dx = p.x - cx, dy = p.y - cy; A += p.qx * dx + p.qy * dy; B += p.qx * dy - p.qy * dx; }
    ang = Math.atan2(B, A);
  }
  b.ang = ang;
  const c = Math.cos(ang), s = Math.sin(ang);
  const plastic = settings.mat === 'wood' && b.squeezed;   // only a finger or the press crushes wood
  let strain = 0, mx = 0, my = 0;
  for (const p of ps) {
    const gx = gx0 + c * p.qx - s * p.qy, gy = gy0 + s * p.qx + c * p.qy;
    const ex = gx - p.x, ey = gy - p.y;
    strain += Math.abs(ex) + Math.abs(ey);
    if (plastic) {
      // Wood yields: a dent beyond a small limit becomes its new shape, so it stays crushed.
      const lx = -(c * ex + s * ey), ly = -(-s * ex + c * ey), e = Math.hypot(lx, ly);
      if (e > YIELD) { const k = (e - YIELD) / e * CREEP; p.qx += lx * k; p.qy += ly * k; }
      mx += p.qx; my += p.qy;
    }
    p.x += ex * alpha; p.y += ey * alpha;
  }
  if (plastic && (mx || my)) {
    mx /= n; my /= n;
    for (const p of ps) { p.qx -= mx; p.qy -= my; p.rx = p.qx; p.ry = p.qy; }
  }
  b.strain = strain / n;
}

const TOUCH2 = (D + 0.06) * (D + 0.06);
function collide() {
  const DEAD = settings.mat === 'wood';
  const n = parts.length, D2 = D * D, MU = mat().mu;
  for (let i = 0; i < n; i++) {
    const p = parts[i], c = pcell[i], gx = c % GC, gy = (c / GC) | 0;
    const wa = p.b.controlled ? CTRL_INVMASS : 1;
    for (let oy = -1; oy <= 1; oy++) {
      const yy = gy + oy; if (yy < 0 || yy >= GR) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = gx + ox; if (xx < 0 || xx >= GC) continue;
        const cc = yy * GC + xx;
        for (let k = cellStart[cc], e = cellStart[cc + 1]; k < e; k++) {
          const j = cellItems[k];
          if (j <= i) continue;
          const q = parts[j];
          if (q.b === p.b) continue;
          const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 >= TOUCH2 || d2 < 1e-10) continue;
          p.b.touch++; q.b.touch++;               // resting contact counts too, not just overlap
          if (d2 >= D2) continue;
          const wb = q.b.controlled ? CTRL_INVMASS : 1, sa = wa / (wa + wb), sb = 1 - sa;
          // A particle that slipped inside the other body's mesh gets pushed back out through the skin.
          if (insideQuads(p, q.qs)) { pushOut(p, q.b, sa, sb); continue; }
          if (insideQuads(q, p.qs)) { pushOut(q, p.b, sb, sa); continue; }
          const d = Math.sqrt(d2), corr = (D - d) / d;
          p.x -= dx * corr * sa; p.y -= dy * corr * sa;
          q.x += dx * corr * sb; q.y += dy * corr * sb;
          // Keep particles off the skin between two neighbours too, not just off the particles.
          for (const e of q.be) skinPush(p, e, sa, sb);
          for (const e of p.be) skinPush(q, e, sb, sa);
          // friction: cancel part of the sliding motion
          const nx = dx / d, ny = dy / d;
          const rvx = (q.x - q.px) - (p.x - p.px), rvy = (q.y - q.py) - (p.y - p.py);
          const vn = rvx * nx + rvy * ny, tx = (rvx - vn * nx) * MU, ty = (rvy - vn * ny) * MU;
          p.x += tx * sa; p.y += ty * sa; q.x -= tx * sb; q.y -= ty * sb;
          if (DEAD && vn > 0) {             // wood: no rebound
            const k = vn * 0.8;
            p.x += nx * k * sa; p.y += ny * k * sa; q.x -= nx * k * sb; q.y -= ny * k * sb;
          }
        }
      }
    }
  }
  for (const p of parts) {
    if (p.x < R) { p.x = R; p.py += (p.y - p.py) * 0.1; }
    else if (p.x > W - R) { p.x = W - R; p.py += (p.y - p.py) * 0.1; }
    if (p.y > H - R - 0.06) p.b.touch++;
    if (p.y > H - R) { p.y = H - R; p.px += (p.x - p.px) * 0.5; if (DEAD && p.py > p.y) p.py = p.y; }
    if (press.phase !== 'idle' && p.y < press.y + R) { p.y = press.y + R; p.px += (p.x - p.px) * 0.4; press.touch++; p.b.pressed = true; }
  }
}

function insideQuads(p, qs) {
  for (const q of qs) {
    let inside = true;
    for (let e = 0; e < 4; e++) {
      const a = q[e], c = q[(e + 1) & 3];
      if ((c.x - a.x) * (p.y - a.y) - (c.y - a.y) * (p.x - a.x) < 0) { inside = false; break; }
    }
    if (inside) return true;
  }
  return false;
}

function skinPush(p, e, sp, sb) {
  const a = e[0], c = e[1], ex = c.x - a.x, ey = c.y - a.y, l2 = ex * ex + ey * ey;
  if (l2 < 1e-9) return;
  const t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2;
  if (t <= 0 || t >= 1) return;                   // ends are handled particle-to-particle
  const l = Math.sqrt(l2), nx = ey / l, ny = -ex / l;
  const side = (p.x - a.x) * nx + (p.y - a.y) * ny;
  const move = D - side;
  if (move <= 0 || side < -R * 0.5) return;
  p.x += nx * move * sp; p.y += ny * move * sp;
  a.x -= nx * move * sb * (1 - t); a.y -= ny * move * sb * (1 - t);
  c.x -= nx * move * sb * t; c.y -= ny * move * sb * t;
}

function pushOut(p, b, sp, sb) {
  let best = 1e9, ba = null, bc = null, bt = 0, bx = 0, by = 0;
  for (const [a, c] of b.edges) {
    const ex = c.x - a.x, ey = c.y - a.y, l2 = ex * ex + ey * ey || 1e-9;
    let t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + ex * t, cy = a.y + ey * t, d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d2 < best) { best = d2; ba = a; bc = c; bt = t; bx = cx; by = cy; }
  }
  if (!ba) return;
  const ex = bc.x - ba.x, ey = bc.y - ba.y, l = Math.hypot(ex, ey) || 1e-9;
  const nx = ey / l, ny = -ex / l;                // outward normal of the skin
  const dx = bx + nx * D - p.x, dy = by + ny * D - p.y;
  p.x += dx * sp; p.y += dy * sp;
  ba.x -= dx * sb * (1 - bt); ba.y -= dy * sb * (1 - bt);
  bc.x -= dx * sb * bt; bc.y -= dy * sb * bt;
}

// ---------- fingers: grab a settled piece and squish it ----------
function applyGrabs() {
  for (const g of grabs.values()) {
    for (const h of g.ps) {
      const p = h.p;
      const sq = settings.mat === 'glass' ? 1 : 0.8, k = settings.mat === 'glass' ? 0.15 : 0.3;
      p.x += (g.sx + h.ox * sq - p.x) * k;
      p.y += (g.sy + h.oy * sq - p.y) * k;
    }
  }
}
function moveGrabs() {
  // The squeeze point follows the finger at a limited speed so jelly can't be yanked through other jelly.
  const m = (settings.mat === 'glass' ? 2.5 : 10) * STEP;
  for (const g of grabs.values()) {
    const dx = g.x - g.sx, dy = g.y - g.sy, d = Math.hypot(dx, dy);
    if (d > m) { g.sx += dx / d * m; g.sy += dy / d * m; } else { g.sx = g.x; g.sy = g.y; }
  }
}

// ---------- hydraulic press ----------
// The hydraulic press restarts the level: it comes down, crushes every piece, then the level starts over.
function startPress() {
  if (state !== 'play' || press.phase !== 'idle') return;
  if (active) { active.controlled = false; active = null; }   // the falling piece gets crushed too
  carry = null; grabs.clear(); hard = false; softBtn = softDrag = false;
  press.target = H - 0.12; press.phase = 'down'; press.t = 0; press.contact = false; press.y = PRESS_TOP;
  sfx.hydraulic(2.4); syncPress();
}
function bodyArea(b) {
  let a = 0;
  for (const q of b.quads) a += ((q[0].x - q[2].x) * (q[1].y - q[3].y) - (q[1].x - q[3].x) * (q[0].y - q[2].y)) / 2;
  return Math.abs(a);
}
function crushBody(b) {
  if (!bodies.includes(b)) return;
  bodies = bodies.filter(x => x !== b);
  for (const p of b.parts) {
    if (settings.mat === 'jelly') burst(p.x, p.y, b.color, 1);
    else if (Math.random() < 0.7) shards.push({
      x: p.x, y: p.y, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 18,
      s: 0.1 + Math.random() * 0.16, t: 0, life: 0.7 + Math.random() * 0.6, color: settings.mat === 'wood' ? b.wood : b.glass,
    });
  }
  rebuildParts();
  if (settings.mat === 'glass') sfx.glass(); else sfx.splat();
  buzz(12); shake = Math.max(shake, 0.12);
}
function stepPress() {
  if (press.phase === 'idle') return;
  press.t += STEP;
  if (press.phase === 'down') {
    if (press.touch > 0 && !press.contact) { press.contact = true; sfx.clunk(); buzz([30, 30, 60]); shake = 0.2; }
    press.y = Math.min(press.target, press.y + (press.contact ? 3 : 15) * STEP);
    // Pieces squashed far enough pop; whatever is left goes when the plate nears the floor.
    const limit = settings.mat === 'jelly' ? 0.5 : 0.65;
    for (const b of bodies.slice()) if (b.pressed && bodyArea(b) < b.quads.length * D * D * limit) crushBody(b);
    if (press.y >= H - 0.75 || press.t > 6) for (const b of bodies.slice()) crushBody(b);
    if (press.y >= press.target) { press.phase = 'hold'; press.t = 0; shake = 0.3; sfx.clunk(); buzz(40); }
  } else if (press.phase === 'hold') {
    if (press.t > 0.35) { press.phase = 'up'; press.t = 0; sfx.hydraulic(0.7); }
  } else if (press.phase === 'up') {
    press.y -= 10 * STEP;
    if (press.y <= PRESS_TOP) { press.y = PRESS_TOP; press.phase = 'idle'; syncPress(); restartLevel(); }
  }
  press.touch = 0;
}
function syncPress() { $('pressBtn').classList.toggle('busy', press.phase !== 'idle'); }

function fallSpeed() { return Math.min(0.9 + 0.22 * (level - 1), 6); }

function gravityActive() { return Math.min(3 + 0.9 * (level - 1), 20); }

function physStep() {
  stepPress();
  moveGrabs();
  // The falling piece is a free body under gravity. We only nudge its velocity:
  // steering towards T.tx, a finger carrying it, or a drop.
  let adx = 0, ady = 0, aMax = 0.2;
  if (active) {
    const da = T.ta - T.a; T.a += Math.sign(da) * Math.min(Math.abs(da), 14 * STEP);
    const n = active.parts.length;
    let cx = 0, cy = 0, mvx = 0, mvy = 0;
    for (const p of active.parts) { cx += p.x; cy += p.y; mvx += p.x - p.px; mvy += p.y - p.py; }
    cx /= n; cy /= n; mvx /= n; mvy /= n;            // velocities are per step
    const touching = active.touch > 0;
    if (carry) {
      // Follow the finger; slow and gentle once it touches other jelly, so it can be set down softly.
      let vx = (carry.x + carry.ox - cx) * 14 * STEP, vy = (carry.y + carry.oy - cy) * 14 * STEP;
      const vm = (touching ? (settings.mat === 'glass' ? 1.5 : 3) : 25) * STEP, l = Math.hypot(vx, vy);
      if (l > vm) { vx *= vm / l; vy *= vm / l; }
      adx = (vx - mvx) * 0.35; ady = (vy - mvy) * 0.35;
      const amax = (settings.mat === 'glass' ? 50 : 250) * STEP * STEP, al = Math.hypot(adx, ady);
      if (al > amax) { adx *= amax / al; ady *= amax / al; }
    } else if (!active.landed) {
      ady = gravityActive() * ((softBtn || softDrag) ? 4 : 1) * STEP * STEP;
      if (hard && active.since > 30) { const vh = (hardHeld ? 40 : 24) * STEP; if (mvy < vh) ady += (vh - mvy) * 0.5; aMax = 0.34; }
      if (!active.landed) {
        if (Math.abs(T.tx - cx) > 0.8) T.tx = cx + Math.sign(T.tx - cx) * 0.8;
        const vm = 10 * STEP, vx = Math.max(-vm, Math.min(vm, (T.tx - cx) * 8 * STEP));
        adx = (vx - mvx) * 0.25;
      }
    }
  }
  const held = grabs.size ? new Set([...grabs.values()].map(g => g.body)) : null;
  for (const b of bodies) { b.squeezed = b.pressed || (held && held.has(b)); b.touch = 0; b.pressed = false; }
  const g = G * STEP * STEP;
  for (const p of parts) {
    // A landed piece behaves like the rest of the stack (normal gravity), so it doesn't moon-bounce.
    const isA = p.b === active && (carry || !active.landed);
    let vx = (p.x - p.px) * (isA ? 0.998 : DAMP), vy = (p.y - p.py) * (isA ? 0.998 : DAMP);
    if (isA) { vx += adx; vy += ady; } else vy += g;
    const m = isA ? aMax : 0.2, v2 = vx * vx + vy * vy;
    if (v2 > m * m) { const k = m / Math.sqrt(v2); vx *= k; vy *= k; }
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy;
  }
  buildHash();
  const alpha = mat().alpha, ctrlAlpha = Math.max(CTRL_ALPHA, alpha);
  for (let it = 0; it < ITERS; it++) {
    for (const b of bodies) shapeMatch(b, b.controlled ? ctrlAlpha : alpha);
    applyGrabs();
    collide();
  }
  if (active) {
    // On touching something the drop ends and the piece is left to physics, so it settles naturally.
    if (active.touch) { active.contact++; hard = false; if (!carry && !active.landed) { active.landed = true; T.a = T.ta = active.ang; } }
    active.since = active.touch ? 0 : active.since + 1;
  }
  if (settings.mat === 'glass') checkGlass();
}

// Glass breaks on a hard knock (sudden change of speed while touching something) or when crushed.
function checkGlass() {
  let broke = null;
  const held = new Set([...grabs.values()].map(g => g.body));
  for (const b of bodies) {
    let vx = 0, vy = 0;
    for (const p of b.parts) { vx += p.x - p.px; vy += p.y - p.py; }
    const n = b.parts.length * STEP; vx /= n; vy /= n;
    const h = b.vh || (b.vh = []);
    h.push(vx, vy); if (h.length > 8) h.splice(0, 2);
    b.tc = b.touch ? 6 : (b.tc || 0) - 1;
    if (b.tc > 0 && ((h.length === 8 && Math.hypot(vx - h[0], vy - h[1]) > BREAK_DV) || (b.strain > CRUSH && !held.has(b)))) (broke || (broke = [])).push(b);
  }
  if (broke) for (const b of broke) shatter(b);
}

function shatter(b) {
  if (!bodies.includes(b)) return;
  bodies = bodies.filter(x => x !== b);
  if (b === active) { active = null; carry = null; hard = false; spawnDelay = 0.4; }
  for (const [k, g] of grabs) if (g.body === b) grabs.delete(k);
  for (const q of b.quads) {
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    const vx = (q[0].x - q[0].px) / STEP * 0.4, vy = (q[0].y - q[0].py) / STEP * 0.4;
    for (let i = 0; i < 3; i++) shards.push({
      x: cx + (Math.random() - 0.5) * 0.4, y: cy + (Math.random() - 0.5) * 0.4,
      vx: vx + (Math.random() - 0.5) * 7, vy: vy - Math.random() * 5, a: Math.random() * 6, va: (Math.random() - 0.5) * 18,
      s: 0.12 + Math.random() * 0.2, t: 0, life: 0.9 + Math.random() * 0.7, color: b.glass,
    });
  }
  rebuildParts();
  sfx.glass(); buzz([15, 20, 35]); shake = 0.15;
}

// ---------- game flow ----------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function nextFromBag() { if (!bag.length) bag = shuffle(Object.keys(SHAPES)); return bag.pop(); }

function extents(a) {
  const c = Math.cos(a), s = Math.sin(a);
  let mn = 1e9, mx = -1e9;
  for (const p of active.parts) { const x = c * p.qx - s * p.qy; if (x < mn) mn = x; if (x > mx) mx = x; }
  return [mn - R, mx + R];
}
function clampTX() { if (!active) return; const [mn, mx] = extents(T.ta); T.tx = Math.max(-mn, Math.min(W - mx, T.tx)); }

function spawn() {
  let type;
  if (heldType) { type = heldType; heldType = null; }
  else {
    if (piecesLeft <= 0) return;
    piecesLeft--;
    type = nextType || nextFromBag(); nextType = nextFromBag();
  }
  updateHud();
  drawNext();
  const b = makePiece(type);
  b.controlled = true; b.touch = 0; b.contact = 0; b.since = 999;
  let mn = 1e9, mx = -1e9, my = -1e9;
  for (const p of b.parts) { mn = Math.min(mn, p.qx); mx = Math.max(mx, p.qx); my = Math.max(my, p.qy); }
  const w = mx - mn + D, left = Math.round((W - w) / 2);
  T.a = T.ta = 0;
  T.x = T.tx = left - (mn - R);
  T.y = -(my + R) - 0.02;
  for (const p of b.parts) { p.x = p.px = T.x + p.qx; p.y = p.py = T.y + p.qy; }
  b.cx = T.x; b.cy = T.y;
  bodies.push(b); active = b; rebuildParts();
  lockTimer = 0; lockResets = 0; hard = false; carry = null;
}

function lockActive() {
  const b = active;
  b.controlled = false; b.squint = 0.45;
  active = null; hard = false; carry = null;
  sfx.lock(); buzz(14);
  spawnDelay = 0.1;
}

function takeControl() { if (active.landed) { active.landed = false; T.a = T.ta = active.ang; T.tx = active.cx; } }
function moveBy(dx) {
  if (!active || state !== 'play' || carry) return;
  takeControl();
  const before = T.tx; T.tx += dx; clampTX();
  if (T.tx !== before) { sfx.move(); bumpLock(); }
}
function rotate() {
  if (!active || state !== 'play') return;
  takeControl();
  T.ta += Math.PI / 2; clampTX(); sfx.rotate(); bumpLock(); active.restT = 0;
}
function hardDrop() { if (!active || state !== 'play' || hard || carry || active.since < 30 || lockTimer > 0) return; hard = true; sfx.drop(); }
function bumpLock() { if (lockTimer > 0 && lockResets < MAX_RESETS) { lockResets++; lockTimer = Math.min(lockTimer, LOCK_DELAY * 0.4); } }

// Coverage: rasterize the settled jelly at 8 px per cell and count pixels per row.
function computeCoverage() {
  cctx.setTransform(8, 0, 0, 8, 0, 0);
  cctx.clearRect(0, 0, W, H);
  cctx.fillStyle = cctx.strokeStyle = '#000';
  cctx.lineWidth = D; cctx.lineCap = cctx.lineJoin = 'round';
  for (const b of bodies) {
    if (b.controlled) continue;
    pathQuads(cctx, b); cctx.fill();
    pathEdges(cctx, b); cctx.stroke();
  }
  const data = cctx.getImageData(0, 0, W * 8, H * 8).data;
  for (let k = 0; k < H; k++) {
    let n = 0;
    for (let y = k * 8; y < k * 8 + 8; y++) for (let x = 0, o = y * W * 8 * 4 + 3; x < W * 8; x++, o += 4) if (data[o] > 127) n++;
    fill[k] = n / (W * 64);
  }
}

function clearRows(rows) {
  const inBand = y => rows.some(k => y >= k - 0.02 && y <= k + 1.02);
  const out = [];
  for (const b of bodies) {
    if (b.controlled) { out.push(b); continue; }
    const gone = new Set(b.parts.filter(p => inBand(p.y)));
    if (!gone.size) { out.push(b); continue; }
    for (const p of gone) burst(p.x, p.y, b.color, 1);
    const quads = b.quads.filter(q => !gone.has(q[0]) && !gone.has(q[1]) && !gone.has(q[2]) && !gone.has(q[3]));
    // Split what's left into connected pieces.
    const parent = new Map();
    const find = p => { let r = p; while (parent.get(r) !== r) r = parent.get(r); parent.set(p, r); return r; };
    for (const q of quads) for (const p of q) if (!parent.has(p)) parent.set(p, p);
    for (const q of quads) for (let e = 1; e < 4; e++) { const a = find(q[0]), c = find(q[e]); if (a !== c) parent.set(c, a); }
    const groups = new Map();
    for (const q of quads) {
      const r = find(q[0]);
      if (!groups.has(r)) groups.set(r, { quads: [], ps: new Set() });
      const g = groups.get(r); g.quads.push(q); for (const p of q) g.ps.add(p);
    }
    for (const g of groups.values()) out.push(buildBody([...g.ps], g.quads, b.type));
  }
  bodies = out; rebuildParts(); grabs.clear();
  for (const k of rows) { flashes.push({ k, t: 0 }); hold[k] = 0; }
  const n = rows.length;
  lines += n;
  updateHud();
  sfx.lost(); buzz([25, 40, 50]);
  shake = 0.25;
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 0.5 + Math.random() * 0.4, t: 0, color, r: 0.08 + Math.random() * 0.1 });
  }
}

function resetWorld() {
  bodies = []; parts = []; active = null; sparks = []; flashes = []; shards = [];
  lines = 0; bag = []; nextType = null; winHold = 0; outTimer = 0; curHeight = 0;
  lockTimer = 0; overTimer = 0; covTimer = 0; acc = 0; spawnDelay = 0; hard = hardHeld = false; softBtn = softDrag = false;
  fill.fill(0); hold.fill(0);
  press.phase = 'idle'; press.y = PRESS_TOP; heldType = null; grabs.clear(); carry = null;
  if (typeof syncPress === 'function') syncPress();
}

function startGame() { audio(); score = 0; startLevel(1); }

function initLevel(l) {
  resetWorld();
  level = l; goal = levelGoal(l); piecesLeft = levelPieces(l); levelTime = 0;
  state = 'play';
  spawn(); updateHud();
}
function restartLevel() { score = levelStartScore; initLevel(level); }
function startLevel(l) {
  levelStartScore = score;
  initLevel(l);
  show(null);
  try { history.pushState({ squish: 1 }, ''); } catch {}
  wake(true);
}

function saveBest() {
  const b = bestOf(settings.mat);
  if (score > b.score || (score === b.score && level > b.level)) { store.set('best-' + settings.mat, { score, level }); return true; }
  return false;
}

function levelComplete() {
  state = 'won';
  const bonus = 1000 * level + 100 * piecesLeft;
  score += bonus;
  saveBest();
  $('wonTitle').textContent = 'Level ' + level + ' done!';
  $('wonInfo').textContent = 'Time ' + clock(levelTime) + ' · +' + bonus + ' points' + (piecesLeft ? ' (' + piecesLeft + ' pieces to spare)' : '');
  $('wonScore').textContent = score;
  $('nextBtn').textContent = 'Level ' + (level + 1) + ': build to ' + levelGoal(level + 1) + ' rows';
  sfx.win(); buzz([30, 40, 30, 40, 90]);
  show('won'); wake(false);
}

function gameOver(reason) {
  state = 'over';
  const isBest = saveBest();
  $('overTitle').textContent = reason || 'Game over';
  $('finalScore').textContent = score;
  const b = bestOf(settings.mat);
  $('bestOver').textContent = isBest && score > 0 ? 'New best!' : 'Best (' + mat().name + '): ' + b.score;
  $('retryBtn').textContent = 'Retry level ' + level;
  sfx.over(); buzz([60, 60, 120]);
  show('over'); wake(false);
}
function retryLevel() { audio(); score = levelStartScore; startLevel(level); }

function pause() {
  if (state !== 'play') return;
  state = 'pause'; show('pause'); wake(false); hardHeld = softBtn = false; carry = null;
}
function resume() {
  if (state !== 'pause') return;
  state = 'play'; show(null); acc = 0; wake(true);
  try { history.pushState({ squish: 1 }, ''); } catch {}
}
function toMenu() { state = 'menu'; score = 0; level = 1; resetWorld(); updateHud(); drawNext(); show('menu'); wake(false); }

function update(dt) {
  if (state === 'play') {
    levelTime += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { physStep(); acc -= STEP; n++; }
    if (n === 6) acc = 0;

    if (active) {
      // Lock once it rests on the stack (it may bounce first). Never while a finger holds it.
      let vx = 0, vy = 0;
      for (const p of active.parts) { vx += p.x - p.px; vy += p.y - p.py; }
      const speed = Math.hypot(vx, vy) / active.parts.length / STEP;
      if (carry) lockTimer = 0;
      else if (active.contact > 0) {
        lockTimer += dt; active.restT = (active.restT || 0) + dt;
        if ((lockTimer >= 0.25 && speed < 2.5) || lockTimer >= 0.9 || active.restT >= 1.6) lockActive();
      } else lockTimer = Math.max(0, lockTimer - dt * 0.3);
      if (active) active.contact = 0;
    } else if (press.phase === 'idle') {
      spawnDelay -= dt;
      if (spawnDelay <= 0) spawn();
    }

    covTimer += dt;
    if (covTimer >= 0.1) {
      const step = covTimer; covTimer = 0;
      computeCoverage();
      const rows = [];
      for (let k = 0; k < H; k++) {
        if (fill[k] >= THRESH) { hold[k] += step; if (hold[k] >= HOLD_T) rows.push(k); } else hold[k] = 0;
      }
      if (rows.length) clearRows(rows);
      updateHud();
    }

    // Goal: the settled stack reaches the gold line and stays there for 2 seconds.
    let top = 1e9;
    for (const p of parts) if (!p.b.controlled && p.y < top) top = p.y;
    curHeight = top < 1e8 ? Math.max(0, H - (top - R)) : 0;
    if (curHeight >= goal && press.phase === 'idle' && grabs.size === 0) {
      winHold += dt;
      if (winHold >= 2) levelComplete();
    } else winHold = 0;
    if (state === 'play' && !active && piecesLeft <= 0 && press.phase === 'idle' && winHold === 0) {
      outTimer += dt;
      if (outTimer > 3) gameOver('Out of pieces');
    } else outTimer = 0;
  }
  for (const s of sparks) { s.t += dt; s.vy += 12 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
  sparks = sparks.filter(s => s.t < s.life);
  for (const s of shards) {
    s.t += dt; s.vy += 22 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
    if (s.y > H - 0.05) { s.y = H - 0.05; s.vy *= -0.3; s.vx *= 0.6; s.va *= 0.5; }
    if (s.x < 0.05 || s.x > W - 0.05) s.vx *= -0.5;
  }
  shards = shards.filter(s => s.t < s.life);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter(f => f.t < 0.4);
  for (const b of bodies) {
    b.blink -= dt; if (b.blink < -0.14) b.blink = 2 + Math.random() * 5;
    if (b.squint > 0) b.squint -= dt;
  }
  for (const g of grabs.values()) g.body.squint = 0.15;
  if (shake > 0) shake -= dt;
}

// ---------- rendering ----------
let dpr = 1, scale = 20, offX = 0, offY = 0, cw = 0, ch = 0;
function resize() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const vw = VX1 - VX0, vh = VY1 - VY0;
  scale = Math.min(cw / vw, ch / vh);
  offX = (cw - vw * scale) / 2 - VX0 * scale;
  offY = (ch - vh * scale) / 2 - VY0 * scale;
}

function pathQuads(c, b) {
  c.beginPath();
  for (const q of b.quads) { c.moveTo(q[0].x, q[0].y); c.lineTo(q[1].x, q[1].y); c.lineTo(q[2].x, q[2].y); c.lineTo(q[3].x, q[3].y); c.closePath(); }
}
function pathEdges(c, b) {
  c.beginPath();
  for (const [a, e] of b.edges) { c.moveTo(a.x, a.y); c.lineTo(e.x, e.y); }
}

function drawBody(c, b, look) {
  if (settings.mat === 'wood') return drawWood(c, b, look);
  if (settings.mat === 'glass') return drawGlass(c, b, look);
  c.lineCap = c.lineJoin = 'round';
  pathEdges(c, b);
  c.strokeStyle = b.dark; c.lineWidth = D + 0.13; c.stroke();
  const gr = c.createRadialGradient(b.cx - 0.35, b.cy - 0.5, 0.05, b.cx, b.cy, 2.4);
  gr.addColorStop(0, b.light); gr.addColorStop(0.45, b.color); gr.addColorStop(1, mix(b.color, 0.15, false));
  c.fillStyle = c.strokeStyle = gr;
  pathQuads(c, b); c.fill(); c.lineWidth = 0.04; c.stroke();
  pathEdges(c, b); c.lineWidth = D; c.stroke();
  if (b.eyes) drawEyes(c, b, look);
}

function drawWood(c, b, look) {
  c.lineCap = 'square'; c.lineJoin = 'miter';
  pathEdges(c, b); c.strokeStyle = b.woodDark; c.lineWidth = D + 0.12; c.stroke();
  c.fillStyle = c.strokeStyle = b.wood;
  pathQuads(c, b); c.fill(); c.lineWidth = 0.04; c.stroke();
  pathEdges(c, b); c.lineWidth = D; c.stroke();
  // wood grain running along the piece
  c.save(); pathQuads(c, b); c.clip();
  const co = Math.cos(b.ang), si = Math.sin(b.ang);
  c.strokeStyle = 'rgba(60,32,10,0.28)'; c.lineWidth = 0.045; c.lineCap = 'round';
  for (let k = -6; k <= 6; k++) {
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const lx = -3 + i * 0.5, ly = k * 0.32 + Math.sin(i * 0.9 + k * 1.7) * 0.05;
      const x = b.cx + co * lx - si * ly, y = b.cy + si * lx + co * ly;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
  }
  c.restore();
  if (b.eyes) drawEyes(c, b, look);
}

function drawGlass(c, b, look) {
  c.lineCap = 'square'; c.lineJoin = 'miter';
  pathEdges(c, b); c.strokeStyle = 'rgba(225,240,255,0.85)'; c.lineWidth = D + 0.1; c.stroke();
  c.fillStyle = c.strokeStyle = b.glass;
  pathQuads(c, b); c.fill(); c.lineWidth = 0.04; c.stroke();
  pathEdges(c, b); c.lineWidth = D - 0.06; c.stroke();
  // shine streaks
  c.save(); pathQuads(c, b); c.clip();
  c.globalAlpha = 0.3; c.fillStyle = '#ffffff';
  const co = Math.cos(b.ang), si = Math.sin(b.ang);
  for (const [o, w] of [[-0.9, 0.35], [-0.35, 0.12]]) {
    c.beginPath();
    for (const [lx, ly] of [[o - 3, 3], [o - 3 + w, 3], [o + 3 + w, -3], [o + 3, -3]]) {
      const x = b.cx + co * lx - si * ly, y = b.cy + si * lx + co * ly; c.lineTo(x, y);
    }
    c.fill();
  }
  c.globalAlpha = 1; c.restore();
  if (b.eyes) drawEyes(c, b, look);
}

function drawEyes(c, b, look) {
  const co = Math.cos(b.ang), si = Math.sin(b.ang);
  const squint = b.squint > 0 || (settings.mat === 'jelly' && b.strain > 0.09);
  const shut = b.blink < 0 && !squint;
  for (const side of [-1, 1]) {
    const lx = side * 0.24, ly = -0.08;
    const x = b.cx + co * lx - si * ly, y = b.cy + si * lx + co * ly;
    if (squint) {
      c.strokeStyle = '#1b1430'; c.lineWidth = 0.065; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x - 0.08 * side, y - 0.08); c.lineTo(x + 0.06 * side, y); c.lineTo(x - 0.08 * side, y + 0.08);
      c.stroke();
    } else if (shut) {
      c.strokeStyle = '#1b1430'; c.lineWidth = 0.06; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - 0.1, y); c.lineTo(x + 0.1, y); c.stroke();
    } else {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 0.13, 0, Math.PI * 2); c.fill();
      let dx = look ? look.x - x : 0, dy = look ? look.y - y : 1;
      const l = Math.hypot(dx, dy) || 1;
      c.fillStyle = '#1b1430'; c.beginPath(); c.arc(x + dx / l * 0.05, y + dy / l * 0.05, 0.068, 0, Math.PI * 2); c.fill();
    }
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - 0.5) * shake * 0.4; sy = (Math.random() - 0.5) * shake * 0.4; }
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offX + sx * scale), dpr * (offY + sy * scale));

  // field
  roundRect(ctx, -0.08, -0.08, W + 0.16, H + 0.16, 0.35);
  ctx.fillStyle = '#211a3c'; ctx.fill();
  ctx.save(); ctx.clip();
  for (let k = 0; k < H; k += 2) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(0, k, W, 1); }
  // aim guide under the falling piece
  if (active && state !== 'menu') {
    let mn = 1e9, mx = -1e9, my = -1e9;
    for (const p of active.parts) { mn = Math.min(mn, p.x); mx = Math.max(mx, p.x); my = Math.max(my, p.y); }
    const g = ctx.createLinearGradient(0, my, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.09)'); g.addColorStop(1, 'rgba(255,255,255,0.01)');
    ctx.fillStyle = g; ctx.fillRect(mn - R, my, mx - mn + D, H - my);
  }
  ctx.restore();

  // danger line at the top
  ctx.strokeStyle = overTimer > 0 && (performance.now() / 120 | 0) % 2 ? '#ff5577' : 'rgba(255,85,119,0.45)';
  ctx.lineWidth = 0.06; ctx.setLineDash([0.25, 0.2]);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.stroke(); ctx.setLineDash([]);

  // row meters
  for (let k = 0; k < H; k++) {
    const x = W + 0.28, y = k + 0.12, h = 0.76, f = Math.min(1, fill[k]);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(ctx, x, y, 0.3, h, 0.1); ctx.fill();
    if (f > 0.02) {
      ctx.fillStyle = f >= THRESH ? '#ff5577' : f > 0.75 ? '#ff9b3d' : '#7f72b8';
      roundRect(ctx, x, y + h * (1 - f), 0.3, h * f, 0.1); ctx.fill();
    }
  }
  // threshold tick
  // bodies
  const look = active ? { x: active.cx, y: active.cy } : null;
  ctx.save();
  roundRect(ctx, -0.08, VY0, W + 0.16, H - VY0 + 0.08, 0.35); ctx.clip();
  for (const b of bodies) if (!b.controlled) drawBody(ctx, b, look);
  if (active && state !== 'won') drawBody(ctx, active, null);
  // flashes
  for (const f of flashes) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - f.t / 0.4)})`;
    const grow = f.t * 0.6;
    ctx.fillRect(0, f.k - grow, W, 1 + grow * 2);
  }
  // goal line
  const gy = H - goal, ok = winHold > 0;
  ctx.strokeStyle = ok ? '#7dffb3' : '#ffd23f'; ctx.lineWidth = ok ? 0.1 : 0.07; ctx.setLineDash([0.35, 0.18]);
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); ctx.setLineDash([]);
  if (state !== 'menu') {
    ctx.font = '800 0.42px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillStyle = ok ? '#7dffb3' : '#ffd23f';
    ctx.textAlign = 'right'; ctx.fillStyle = '#c4b9ee'; ctx.font = '700 0.5px system-ui, sans-serif';
    ctx.fillText('⏱ ' + clock(levelTime), W - 0.1, -1.55);
    ctx.textAlign = 'left'; ctx.font = '800 0.42px system-ui, sans-serif'; ctx.fillStyle = ok ? '#7dffb3' : '#ffd23f';
    ctx.fillText(state === 'won' ? 'GOAL REACHED ✓' : ok ? 'HOLD IT… ' + Math.max(0, 2 - winHold).toFixed(1) : 'GOAL', 0.15, gy - 0.08);
  }
  for (const s of shards) {
    ctx.globalAlpha = Math.max(0, 1 - s.t / s.life);
    const co = Math.cos(s.a), si = Math.sin(s.a);
    ctx.beginPath();
    ctx.moveTo(s.x + co * s.s, s.y + si * s.s);
    ctx.lineTo(s.x - si * s.s * 0.7, s.y + co * s.s * 0.7);
    ctx.lineTo(s.x - co * s.s * 0.8, s.y - si * s.s * 0.5);
    ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill(); ctx.strokeStyle = 'rgba(230,245,255,0.9)'; ctx.lineWidth = 0.03; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  const rings = [...grabs.values()].map(g => ({ x: g.sx, y: g.sy }));
  if (carry) rings.push(carry);
  for (const g of rings) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.arc(g.x, g.y, 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  }
  if (press.y > VY0 - 0.1) drawPress(ctx);
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, 1 - s.t / s.life);
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function steel(c, x0, x1, dark) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, dark ? '#3b4049' : '#5d6470'); g.addColorStop(0.18, '#c9ced6'); g.addColorStop(0.32, '#f4f6f8');
  g.addColorStop(0.5, '#9aa1ac'); g.addColorStop(0.75, '#d9dde3'); g.addColorStop(1, dark ? '#2f343c' : '#4b515b');
  return g;
}
function drawPress(c) {
  const by = press.y, ty = by - PLATE;
  // ram shaft, collar and bolt
  c.fillStyle = steel(c, 2.9, 7.1, true); c.fillRect(2.9, VY0 - 1, 4.2, ty - 0.55 - (VY0 - 1));
  c.fillStyle = steel(c, 3.6, 6.4); c.fillRect(3.6, ty - 0.55, 2.8, 0.56);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(2.9, ty - 0.62, 4.2, 0.07);
  const hx = 5.9, hy = ty - 1.25;
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](hx + Math.cos(a) * 0.42, hy + Math.sin(a) * 0.42); }
  c.closePath(); c.fillStyle = '#8b929c'; c.fill(); c.strokeStyle = '#4b515b'; c.lineWidth = 0.05; c.stroke();
  // plate
  roundRect(c, -0.15, ty, W + 0.3, PLATE, 0.12);
  c.fillStyle = steel(c, -0.15, W + 0.15); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-0.05, ty + 0.06, W + 0.1, 0.06);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-0.15, by - 0.1, W + 0.3, 0.1);
  // hazard label like the one on the real press
  c.save(); c.beginPath(); c.rect(8.3, ty + 0.2, 1.2, 0.38); c.clip();
  c.fillStyle = '#ffcc00'; c.fillRect(8.3, ty + 0.2, 1.2, 0.38); c.fillStyle = '#1b1b1b';
  for (let x = 8.0; x < 9.6; x += 0.3) { c.beginPath(); c.moveTo(x, ty + 0.58); c.lineTo(x + 0.15, ty + 0.58); c.lineTo(x + 0.38, ty + 0.2); c.lineTo(x + 0.23, ty + 0.2); c.fill(); }
  c.restore();
}

function drawNext() {
  const w = nextCv.width, h = nextCv.height;
  nctx.setTransform(1, 0, 0, 1, 0, 0); nctx.clearRect(0, 0, w, h);
  if (!nextType || state === 'menu' || piecesLeft <= 0) return;
  const b = makePiece(nextType);
  let mn = 1e9, mx = -1e9, my0 = 1e9, my1 = -1e9;
  for (const p of b.parts) { p.x = p.rx; p.y = p.ry; mn = Math.min(mn, p.x); mx = Math.max(mx, p.x); my0 = Math.min(my0, p.y); my1 = Math.max(my1, p.y); }
  b.cx = (mn + mx) / 2; b.cy = (my0 + my1) / 2; b.ang = 0; b.blink = 1;
  const s = Math.min(w / (mx - mn + 1.4), h / (my1 - my0 + 1.4));
  nctx.setTransform(s, 0, 0, s, w / 2 - b.cx * s, h / 2 - b.cy * s);
  drawBody(nctx, b, null);
}

function clock(t) { const m = Math.floor(t / 60), s2 = Math.floor(t % 60); return m + ':' + String(s2).padStart(2, '0'); }

function updateHud() {
  $('level').textContent = level;
  $('height').textContent = curHeight.toFixed(1) + '/' + goal;
  $('left').textContent = piecesLeft + (active ? 1 : 0);
}

// ---------- overlays & settings ----------
function show(id) {
  for (const o of ['menu', 'pause', 'over', 'won']) $(o).classList.toggle('hidden', o !== id);
  if (id === 'menu') syncSettings();
}
function syncSettings() {
  for (const b of $('squishSeg').children) b.classList.toggle('sel', b.dataset.v === settings.mat);
  $('matInfo').textContent = mat().info;
  const b = bestOf(settings.mat);
  $('bestMenu').textContent = b.score ? 'Best with ' + mat().name.toLowerCase() + ': ' + b.score + ' (level ' + b.level + ')' : '';
  for (const id of ['soundBtn', 'soundBtn2']) { $(id).classList.toggle('sel', settings.sound); $(id).textContent = settings.sound ? 'Sound on' : 'Sound off'; }
  for (const id of ['vibeBtn', 'vibeBtn2']) { $(id).classList.toggle('sel', settings.vibe); $(id).textContent = settings.vibe ? 'Vibration on' : 'Vibration off'; }
}
$('squishSeg').addEventListener('click', e => {
  const v = e.target.closest('button') && e.target.closest('button').dataset.v;
  if (v) { settings.mat = v; saveSettings(); syncSettings(); audio(); sfx.rotate(); }
});
for (const id of ['soundBtn', 'soundBtn2']) $(id).addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); syncSettings(); audio(); sfx.move(); });
for (const id of ['vibeBtn', 'vibeBtn2']) $(id).addEventListener('click', () => { settings.vibe = !settings.vibe; saveSettings(); syncSettings(); buzz(20); });
$('playBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('restartBtn').addEventListener('click', retryLevel);
$('retryBtn').addEventListener('click', retryLevel);
$('nextBtn').addEventListener('click', () => { audio(); startLevel(level + 1); });
$('wonMenuBtn').addEventListener('click', toMenu);
$('shareWon').addEventListener('click', shareResult);
$('shareOver').addEventListener('click', shareResult);

// ---------- share: a picture of the tower with the score ----------
const MAT_EMOJI = { glass: '🔷', wood: '🪵', jelly: '🍬' };
function shareCard() {
  const W2 = 1080, H2 = 1600, c = document.createElement('canvas');
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  g.fillStyle = '#17122b'; g.fillRect(0, 0, W2, H2);
  // title in the game's candy colours
  const title = 'Squishtris', cols = ['#45d4ff', '#ffd23f', '#b77cff', '#55e07a', '#ff5577', '#4f86ff', '#ff9b3d', '#45d4ff', '#ffd23f', '#ff5aa5'];
  g.font = '900 104px system-ui, -apple-system, sans-serif'; g.textBaseline = 'alphabetic';
  let tw = 0; for (const ch of title) tw += g.measureText(ch).width;
  let x = (W2 - tw) / 2;
  [...title].forEach((ch, i) => { g.fillStyle = cols[i]; g.fillText(ch, x, 140); x += g.measureText(ch).width; });
  const won = state === 'won';
  g.textAlign = 'center'; g.fillStyle = '#f1ecff'; g.font = '800 52px system-ui, -apple-system, sans-serif';
  g.fillText(MAT_EMOJI[settings.mat] + ' ' + mat().name + ' · ' + (won ? 'Level ' + level + ' done in ' + clock(levelTime) + '!' : $('overTitle').textContent + ' on level ' + level), W2 / 2, 230);
  // the tower, as it stands on screen
  const top = 270, bottom = H2 - 250, avail = bottom - top;
  // crop to the tower and the goal line, with some sky above
  let ty = H - goal;
  for (const p of parts) if (!p.b.controlled && p.y < ty) ty = p.y;
  const y0 = Math.max(VY0, Math.min(ty - 2.5, H - 9));
  const fx = dpr * (offX + VX0 * scale), fy = dpr * (offY + y0 * scale), fw = dpr * (VX1 - VX0) * scale, fh = dpr * (VY1 - y0) * scale;
  const k = Math.min((W2 - 120) / fw, avail / fh), dw = fw * k, dh = fh * k, dy = top + (avail - dh) / 2;
  g.save(); roundRect(g, (W2 - dw) / 2, dy, dw, dh, 28); g.clip();
  g.drawImage(cv, fx, fy, fw, fh, (W2 - dw) / 2, dy, dw, dh);
  g.restore();
  // score
  g.fillStyle = '#a89cd6'; g.font = '700 38px system-ui, -apple-system, sans-serif';
  g.fillText('SCORE', W2 / 2, H2 - 175);
  g.fillStyle = '#ffd23f'; g.font = '900 96px system-ui, -apple-system, sans-serif';
  g.fillText(String(score), W2 / 2, H2 - 90);
  g.fillStyle = '#7f72b8'; g.font = '600 30px system-ui, -apple-system, sans-serif';
  g.fillText(new URL('./', location.href).href.replace(/^https?:\/\//, ''), W2 / 2, H2 - 35);
  return c;
}
function dataUrlToBlob(u) {
  const [head, b64] = u.split(','), bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: head.slice(5, head.indexOf(';')) });
}
async function shareResult() {
  audio();
  const won = state === 'won';
  const url = new URL('./', location.href).href;
  const text = (won ? 'I built a ' + mat().name.toLowerCase() + ' tower up to level ' + level + ' in ' + clock(levelTime) + ' in Squishtris'
                    : 'I reached level ' + level + ' with ' + mat().name.toLowerCase() + ' blocks in Squishtris') +
               ' and scored ' + score + '! ' + MAT_EMOJI[settings.mat] + ' Can you beat it?';
  // Build the picture synchronously so the share still counts as part of the tap.
  const blob = dataUrlToBlob(shareCard().toDataURL('image/png'));
  const file = new File([blob], 'squishtris-level-' + level + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + ' ' + url }); return; }
    if (navigator.share) { await navigator.share({ title: 'Squishtris', text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  // No share sheet (e.g. desktop): save the picture and copy the message.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(text + ' ' + url); } catch {}
}
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', toMenu);
$('menuBtn').addEventListener('click', toMenu);
$('pauseBtn').addEventListener('click', () => { audio(); pause(); });
$('pressBtn').addEventListener('click', () => { audio(); startPress(); });

window.addEventListener('popstate', () => { if (state === 'play') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (state === 'play') wake(true);
});

// ---------- input ----------
function holdButton(id, onDown, onUp, repeat) {
  const el = $(id); let timer = null;
  const stop = () => { el.classList.remove('on'); clearTimeout(timer); timer = null; onUp && onUp(); };
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); audio(); el.classList.add('on');
    try { el.setPointerCapture(e.pointerId); } catch {}
    onDown();
    if (repeat) { const rep = () => { onDown(); timer = setTimeout(rep, 70); }; timer = setTimeout(rep, 190); }
  });
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
holdButton('bLeft', () => moveBy(-0.5), null, true);
holdButton('bRight', () => moveBy(0.5), null, true);
holdButton('bRot', rotate);
// Tap: quick drop. Hold: the piece plummets.
holdButton('bHard', () => { hardHeld = true; hardDrop(); }, () => { hardHeld = false; });
holdButton('bSoft', () => { softBtn = true; }, () => { softBtn = false; });

let drag = null;
function worldPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale };
}
function tryGrab(e) {
  const w = worldPos(e);
  let best = null, bd = 0.75 * 0.75;
  for (const p of parts) {
    if (p.b.controlled) continue;
    const d2 = (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
    if (d2 < bd) { bd = d2; best = p; }
  }
  if (!best) return null;
  const ps = [];
  const whole = settings.mat === 'glass';
  for (const p of best.b.parts) { const dx = p.x - w.x, dy = p.y - w.y; if (whole || dx * dx + dy * dy < 1.1) ps.push({ p, ox: dx, oy: dy }); }
  const y = Math.max(0.4, w.y);
  return { body: best.b, ps, x: w.x, y, sx: w.x, sy: y };
}
cv.addEventListener('pointerdown', e => {
  audio();
  if (state !== 'play') return;
  if (active && !carry) {
    // Touching the falling piece picks it up.
    const w = worldPos(e);
    if (active.parts.some(p => (p.x - w.x) ** 2 + (p.y - w.y) ** 2 < 0.9 * 0.9)) {
      try { cv.setPointerCapture(e.pointerId); } catch {}
      takeControl();
      carry = { id: e.pointerId, x: w.x, y: w.y, ox: active.cx - w.x, oy: active.cy - w.y, cx0: e.clientX, cy0: e.clientY, t0: performance.now(), moved: false };
      sfx.squish(); buzz(8);
      return;
    }
  }
  const g = tryGrab(e);
  if (g) {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    grabs.set(e.pointerId, g); sfx.squish(); buzz(8);
    return;
  }
  if (!active || drag) return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), tx0: T.tx, moved: false, ly: e.clientY, lt: performance.now(), vy: 0, last: T.tx };
});
cv.addEventListener('pointermove', e => {
  if (carry && e.pointerId === carry.id) {
    const w = worldPos(e);
    carry.x = Math.max(0, Math.min(W, w.x)); carry.y = Math.max(-2, Math.min(H, w.y));
    if (Math.hypot(e.clientX - carry.cx0, e.clientY - carry.cy0) > 8) carry.moved = true;
    return;
  }
  const g = grabs.get(e.pointerId);
  if (g) { const w = worldPos(e); g.x = Math.max(0, Math.min(W, w.x)); g.y = Math.max(0.4, Math.min(H, w.y)); return; }
  if (!drag || e.pointerId !== drag.id || !active) return;
  const dx = (e.clientX - drag.x0) / scale, dy = (e.clientY - drag.y0) / scale;
  if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) drag.moved = true;
  if (drag.moved && Math.abs(dx) > Math.abs(dy) * 0.5) {
    T.tx = drag.tx0 + dx; clampTX();
    if (Math.abs(T.tx - drag.last) >= 0.5) { drag.last = T.tx; sfx.move(); bumpLock(); }
  }
  softDrag = dy > 1.2 && dy > Math.abs(dx);
  const now = performance.now();
  if (now > drag.lt) { drag.vy = drag.vy * 0.5 + 0.5 * (e.clientY - drag.ly) / (now - drag.lt); drag.ly = e.clientY; drag.lt = now; }
});
function dropCarry(e, tapOk) {
  const c = carry; carry = null;
  if (!active) return;
  T.tx = active.cx; lockTimer = 0;
  if (tapOk && !c.moved && performance.now() - c.t0 < 300) rotate();
}
const endDrag = e => {
  if (carry && e.pointerId === carry.id) { dropCarry(e, true); return; }
  if (grabs.delete(e.pointerId)) return;
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.x0) / scale, dy = (e.clientY - drag.y0) / scale, t = performance.now() - drag.t0;
  if (!drag.moved && t < 350) rotate();
  else if (dy > 1.5 && drag.vy > 0.9 && dy > Math.abs(dx) * 1.5) hardDrop();
  softDrag = false; drag = null;
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', e => { if (carry && e.pointerId === carry.id) dropCarry(e, false); grabs.delete(e.pointerId); softDrag = false; if (drag && e.pointerId === drag.id) drag = null; });

window.addEventListener('keydown', e => {
  if (state === 'play') {
    if (e.key === 'ArrowLeft') moveBy(-0.5);
    else if (e.key === 'ArrowRight') moveBy(0.5);
    else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') rotate();
    else if (e.key === 'ArrowDown') softBtn = true;
    else if (e.key === ' ') { hardHeld = true; hardDrop(); }
    else if (e.key === 'p' || e.key === 'Escape') pause();
    else if (e.key === 'h' || e.key === 'H') startPress();
    else return;
    e.preventDefault(); audio();
  } else if (state === 'pause' && (e.key === 'p' || e.key === 'Escape')) resume();
});
window.addEventListener('keyup', e => { if (e.key === 'ArrowDown') softBtn = false; if (e.key === ' ') hardHeld = false; });

// ---------- sound & vibration ----------
let ac = null;
function audio() {
  if (!settings.sound) return null;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch { return null; }
  return ac;
}
function tone(f, dur, type = 'sine', vol = 0.12, f2 = null, delay = 0) {
  const a = settings.sound && ac; if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  move() { tone(540, 0.035, 'square', 0.03); },
  rotate() { tone(420, 0.08, 'triangle', 0.08, 760); },
  drop() { tone(700, 0.12, 'sine', 0.06, 200); },
  lock() { tone(200, 0.22, 'sine', 0.22, 75); tone(330, 0.16, 'sine', 0.07, 150, 0.03); },
  clear(n) { [523, 659, 784, 1047, 1319].slice(0, 2 + Math.min(n, 3)).forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, null, i * 0.07)); },
  squish() { tone(300, 0.12, 'sine', 0.1, 140); },
  clunk() { tone(90, 0.35, 'sine', 0.35, 38); noise(0.12, 900, 0.08); },
  hydraulic(d) { tone(52, d, 'sawtooth', 0.05, 46); noise(d, 2600, 0.035); },
  glass() {
    noise(0.25, 5200, 0.12);
    for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 3800, 0.09 + Math.random() * 0.12, 'triangle', 0.05, null, Math.random() * 0.18);
  },
  lost() { [523, 415, 330].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, f * 0.9, i * 0.08)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, null, i * 0.09)); },
  splat() { tone(160, 0.12, 'sine', 0.14, 70); noise(0.08, 500, 0.06); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.05, f * 0.97, i * 0.16)); },
};
function noise(dur, freq, vol) {
  const a = settings.sound && ac; if (!a) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur)), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}
function buzz(p) { if (settings.vibe) try { navigator.vibrate && navigator.vibrate(p); } catch {} }

let wakeLock = null;
async function wake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}

// ---------- main loop ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe(cv);
resize();
syncSettings(); updateHud(); show('menu');
requestAnimationFrame(frame);

// Debug hook for automated tests.
window.__sq = { get state() { return state; }, get bodies() { return bodies.length; }, get parts() { return parts.length; }, get fill() { return Array.from(fill); }, get lines() { return lines; }, get score() { return score; }, get height() { return curHeight; }, get goal() { return goal; }, get left() { return piecesLeft; }, startLevel, shatterCount: () => shards.length, hardDrop, moveBy, rotate, gameOver, shareCard, levelComplete, startPress, get press() { return press.phase; }, get carrying() { return !!carry; },
  dbg() {
    let minD = 9;
    for (const p of parts) for (const q of parts) if (p.b !== q.b) minD = Math.min(minD, Math.hypot(p.x - q.x, p.y - q.y));
    let pen = 0;
    for (const p of parts) for (const b of bodies) if (b !== p.b && insideQuads(p, b.quads)) pen++;
    return { active: active && { x: +active.cx.toFixed(2), y: +active.cy.toFixed(2) }, minD: +minD.toFixed(3), pen, nan: parts.some(p => !isFinite(p.x + p.y)) };
  } };
