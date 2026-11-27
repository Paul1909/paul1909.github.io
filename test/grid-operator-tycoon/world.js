// Grid Operator Tycoon: map generation, scenario setup, node/line bookkeeping.
'use strict';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function valueNoise(r) {
  const S = 64, g = new Float32Array(S * S);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (a, b) => g[((a % S) + S) % S + (((b % S) + S) % S) * S];
  const f = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = f(x - xi), v = f(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u, b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}
const fbm = (n, x, y) => n(x, y) * 0.55 + n(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + n(x * 4.3 + 41, y * 4.3 + 3) * 0.15;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function genMap(sc) {
  const r = mulberry(sc.seed), n = valueNoise(r), m = valueNoise(r), q = valueNoise(r);
  const W = sc.W, H = sc.H, N = W * H;
  const e = new Float32Array(N), t = new Uint8Array(N);
  let sea = 0.34, hill = 0.68, mount = 0.8;
  const centres = [];
  if (sc.shape === 'islands') for (const [cx, cy, R0] of [[0.36, 0.5, 7.5], [0.78, 0.22, 4.2], [0.8, 0.72, 4.4], [0.14, 0.18, 3.6], [0.17, 0.84, 3.8], [0.55, 0.88, 3.2]])
    centres.push({ x: W * cx + (r() - 0.5) * 2, y: H * cy + (r() - 0.5) * 2, R: R0 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W, b = fbm(n, x / 6.5, y / 6.5);
    let v;
    if (sc.shape === 'coast-south' || sc.shape === 'mixed') {
      const g = y / (H - 1);
      v = 0.5 * b + 0.62 * (1 - g) + 0.06 + (sc.shape === 'mixed' ? 0.08 * Math.sin(x / W * 6) : 0);
    } else if (sc.shape === 'coast-west') {
      const g = x / (W - 1);
      v = 0.5 * b + 0.58 * g + 0.05;
    } else if (sc.shape === 'alpine') {
      const rid = 1 - Math.abs(2 * n(x / 5 + 31, y / 5 + 7) - 1);
      v = 0.55 * b + 0.42 * rid * rid + 0.02; sea = -1; hill = 0.56; mount = 0.68;
    } else { // islands
      let d = 9;
      for (const c of centres) d = Math.min(d, Math.hypot(x - c.x, (y - c.y) * 1.1) / c.R);
      v = 0.3 * b + 0.8 * (1 - d) + 0.02; sea = 0.42; hill = 0.7; mount = 0.8;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) v = 0;
    }
    e[i] = v;
    t[i] = v < sea ? T.SEA : v > mount ? T.MOUNT : v > hill ? T.HILL : T.PLAIN;
  }
  // rivers: from high ground, downhill to the sea or into a lake
  const river = new Uint8Array(N), rivers = [];
  const highs = [];
  for (let i = 0; i < N; i++) if (t[i] === T.MOUNT || t[i] === T.HILL) highs.push(i);
  highs.sort((a, b) => e[b] - e[a]);
  const srcs = [];
  for (const i of highs) {
    if (srcs.length >= sc.rivers) break;
    const x = i % W, y = (i / W) | 0;
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
    if (r() < 0.5) continue;
    if (srcs.every(s => Math.abs(s % W - x) + Math.abs(((s / W) | 0) - y) > 7)) srcs.push(i);
  }
  for (const s of srcs) {
    const path = [s], seen = new Set([s]);
    let c = s;
    for (let k = 0; k < 90; k++) {
      const x = c % W, y = (c / W) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H).map(([a, b]) => a + b * W).filter(j => !seen.has(j));
      if (!nb.length) break;
      nb.sort((a, b) => e[a] - e[b]);
      const nx = nb[0];
      if (e[nx] > e[c] + 0.04 && k > 3) { t[c] = T.LAKE; break; }
      c = nx; seen.add(c); path.push(c);
      if (isWater(t[c])) break;
      const cx = c % W, cy = (c / W) | 0;
      if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) break;
    }
    if (path.length > 3) {
      rivers.push(path);
      for (const j of path) if (!isWater(t[j])) { river[j] = 1; if (t[j] === T.MOUNT) t[j] = T.HILL; }
    }
  }
  // forests and beaches
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W;
    if ((t[i] === T.PLAIN || t[i] === T.HILL) && !river[i] && fbm(m, x / 4, y / 4) > 0.6) t[i] = T.FOREST;
  }
  const nb4 = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H).map(([a, b]) => a + b * W);
  const coast = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W;
    if (!isWater(t[i]) && nb4(x, y).some(j => t[j] === T.SEA)) { coast[i] = 1; if (t[i] === T.PLAIN || t[i] === T.FOREST) t[i] = T.BEACH; }
  }
  // site quality for wind and sun
  const wind = new Float32Array(N), sun = new Float32Array(N), hgt = new Float32Array(N);
  const WB = [1.3, 0.95, 0.85, 1.1, 1.18, 1.2, 1.08];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + y * W, z = q(x / 4, y / 4) - 0.5;
    wind[i] = WB[t[i]] + (coast[i] ? 0.06 : 0) + z * 0.22;
    sun[i] = 0.9 + 0.2 * (y / (H - 1)) + (t[i] === T.MOUNT || t[i] === T.HILL ? 0.04 : 0) - (t[i] === T.FOREST ? 0.04 : 0) + z * 0.1;
    hgt[i] = t[i] === T.HILL ? 7 : t[i] === T.MOUNT ? 13 + 5 * q(x * 1.7, y * 1.7) : 0;
  }
  return { W, H, t: Array.from(t), e: Array.from(e, v => +v.toFixed(3)), river: Array.from(river), coast: Array.from(coast), rivers,
    wind: Array.from(wind, v => +v.toFixed(3)), sun: Array.from(sun, v => +v.toFixed(3)), hgt: Array.from(hgt, v => +v.toFixed(1)) };
}

// ---------------------------------------------------------------- state helpers
const S = { s: null };    // current game state lives in S.s
function tileAt(s, x, y) { return x < 0 || y < 0 || x >= s.map.W || y >= s.map.H ? -1 : s.map.t[x + y * s.map.W]; }
function nodeAt(s, x, y) { return s.nodes.find(n => n.x === x && n.y === y); }
function byId(s, id) { return s.idx[id]; }
function reindex(s) { s.idx = {}; for (const n of s.nodes) s.idx[n.id] = n; for (const l of s.lines) s.idx['L' + l.id] = l; }
function nearestTown(s, x, y) {
  let best = null, bd = 1e9;
  for (const n of s.nodes) if (n.k === 'town') { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
  return best;
}
function hasResearch(s, id) { return s.res.done.includes(id); }

function plantName(s, type, x, y) {
  const t = nearestTown(s, x, y), code = PLANTS[type].code;
  const base = (t ? t.name : 'Grid') + ' ' + code;
  let k = 1;
  while (s.nodes.some(n => n.name === (k === 1 ? base : base + ' ' + k))) k++;
  return k === 1 ? base : base + ' ' + k;
}

function addPlant(s, type, x, y, o = {}) {
  const P = PLANTS[type];
  const n = { id: s.nextId++, k: type === 'sub' ? 'sub' : 'plant', type, x, y, name: type === 'sub' ? 'Substation' : plantName(s, type, x, y),
    cap: o.cap || P.cap, st: o.built ? 'on' : 'build', build: o.built ? 0 : P.build, buildT: P.build, out: 0, com: false, startT: 0,
    age: o.age ? o.age * 12 : 0, cost: o.cost || P.cost, yr: { e: 0, earn: 0 }, idleT: 0, upT: 0 };
  if (P.store) { n.hours = o.hours || (type === 'bess' && hasResearch(s, 'bess2') ? 6 : P.hours); n.soc = n.cap * n.hours * 0.5; }
  if (P.res) n.res = n.cap * P.res * 0.6;
  if (P.ren && type === 'solar' && hasResearch(s, 'solar2')) n.boost = 1.12;
  if (o.retire) n.retire = o.retire;
  if (THERMAL(type) && o.built) { n.com = true; n.out = n.cap * P.min; }
  s.nodes.push(n); reindex(s); s.topoDirty = true;
  return n;
}

function lineLen(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lineTerrain(s, a, b) {   // average cost multiplier along the line
  const len = lineLen(a, b), k = Math.max(2, Math.ceil(len * 2));
  let sum = 0, water = 0;
  const M = [3.5, 1, 1.15, 1.3, 2, 1, 3.5];
  for (let i = 0; i <= k; i++) {
    const x = Math.round(a.x + (b.x - a.x) * i / k), y = Math.round(a.y + (b.y - a.y) * i / k);
    const tt = tileAt(s, x, y);
    sum += M[tt] || 1; if (isWater(tt)) water++;
  }
  return { mult: sum / (k + 1), water: water / (k + 1) };
}
function lineCost(s, a, b, tier) { return lineLen(a, b) * TIERS[tier].cost * lineTerrain(s, a, b).mult; }
function linkBetween(s, a, b) { return s.lines.find(l => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id)); }
function addLine(s, a, b, tier, o = {}) {
  const len = lineLen(a, b);
  const l = { id: s.nextId++, a: a.id, b: b.id, tier, len: +len.toFixed(2), st: o.built ? 'ok' : 'build', build: o.built ? 0 : 0.5 + len / 20,
    heat: 0, flow: 0, load: 0, repair: 0, cost: o.cost || lineCost(s, a, b, tier) };
  s.lines.push(l); reindex(s); s.topoDirty = true;
  return l;
}
function removeLine(s, l) { s.lines = s.lines.filter(x => x !== l); reindex(s); s.topoDirty = true; }
function removeNode(s, n) {
  s.lines = s.lines.filter(l => l.a !== n.id && l.b !== n.id);
  s.nodes = s.nodes.filter(x => x !== n); reindex(s); s.topoDirty = true;
}

// Where may this be built? Returns '' when fine, else the reason.
function siteProblem(s, type, x, y) {
  const tt = tileAt(s, x, y);
  if (tt < 0) return 'Off the map';
  if (nodeAt(s, x, y)) return 'Tile already in use';
  const P = PLANTS[type], W = s.map.W, i = x + y * W;
  const around = (r, f) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (!dx && !dy) continue; const v = tileAt(s, x + dx, y + dy); if (v >= 0 && f(v, x + dx, y + dy)) return true; } return false; };
  if (type === 'offshore') return tt === T.SEA ? '' : 'Offshore wind goes on sea tiles';
  if (isWater(tt)) return 'Can’t build on water';
  if (type === 'hydro') {
    if (!s.map.river[i]) return 'Needs a river tile';
    if (!(tt === T.HILL || around(1, v => v === T.HILL || v === T.MOUNT))) return 'Needs hills or mountains next to the river';
    return '';
  }
  if (type === 'pumped') {
    if (!(tt === T.HILL || tt === T.MOUNT)) return 'Needs hills or mountains';
    if (!around(2, (v, ax, ay) => v === T.LAKE || s.map.river[ax + ay * W])) return 'Needs a river or lake within 2 tiles';
    return '';
  }
  if (tt === T.MOUNT && !['wind', 'sub'].includes(type)) return 'Too steep: mountains only take wind farms and substations';
  if (P.water) {
    if (!(s.map.river[i] || around(1, v => isWater(v)) || around(1, (v, ax, ay) => s.map.river[ax + ay * W]))) return 'Needs cooling water: a river, lake or the sea next to it';
    if (s.nodes.some(n => n.k === 'town' && Math.hypot(n.x - x, n.y - y) < 3)) return 'Keep reactors 3 tiles away from towns';
  }
  return '';
}
function buildCost(s, type, x, y) {
  const P = PLANTS[type], tt = tileAt(s, x, y);
  let c = P.cost * ({ [T.FOREST]: 1.05, [T.HILL]: 1.1, [T.MOUNT]: 1.3 }[tt] || 1);
  if (type === 'bess' && hasResearch(s, 'bess2')) c *= 0.7;
  if (type === 'solar' && hasResearch(s, 'solar2')) c *= 0.75;
  return c;
}
function unlockedType(s, type) {
  const P = PLANTS[type];
  if (P.nuc && !s.sc.nuclear) return false;
  return !P.research || hasResearch(s, P.research);
}

// ---------------------------------------------------------------- new game
function findSite(s, type, near, minD, maxD, rnd) {
  const cands = [];
  for (let y = 0; y < s.map.H; y++) for (let x = 0; x < s.map.W; x++) {
    const d = Math.hypot(x - near.x, y - near.y);
    if (d < minD || d > maxD) continue;
    if (siteProblem(s, type, x, y)) continue;
    if (s.nodes.some(n => Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1)) continue;
    cands.push({ x, y, d: d + rnd() * 1.5 });
  }
  cands.sort((a, b) => a.d - b.d);
  return cands[0];
}

function landComponent(s, x0, y0) {
  const W = s.map.W, seen = new Set([x0 + y0 * W]), q = [[x0, y0]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy, tt = tileAt(s, a, b);
      if (tt < 0 || isWater(tt) || seen.has(a + b * W)) continue;
      seen.add(a + b * W); q.push([a, b]);
    }
  }
  return seen;
}

function newGame(id) {
  const sc = SCENARIOS.find(x => x.id === id);
  const map = genMap(sc), r = mulberry(sc.seed * 7 + 3);
  const s = { v: 1, sc: { ...sc }, scId: id, map, nodes: [], lines: [], nextId: 1, idx: {},
    t: 6, cash: sc.cash, loan: 0, tariff: 160, maint: 1, rdB: 1, co2p: sc.co2,
    res: { done: sc.unlocked === 'all' ? RESEARCH.map(x => x.id) : [...sc.unlocked], cur: null, prog: {} },
    fin: { y: {}, ly: null }, months: [], cur: newAcc(), hours: [], hourAcc: null, news: [],
    w: { v: 7, c: 0.4, p: 0, gas: 1 }, ev: [], warm: true, topoDirty: true, negM: 0, lowM: 0, over: null, keepPlaying: false,
    tut: sc.tutorial ? 0 : -1, stats: { blackH: 0, peak: 0 }, indNext: 30 + r() * 40 };
  delete s.sc.existing;
  // towns
  const names = [...TOWN_NAMES];
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const W = map.W, H = map.H, spots = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = x + y * W, tt = map.t[i];
    if (isWater(tt) || tt === T.MOUNT) continue;
    let sc2 = r() + (map.river[i] ? 0.5 : 0) + (map.coast[i] ? 0.35 : 0) + (tt === T.PLAIN || tt === T.BEACH ? 0.4 : 0) - (tt === T.FOREST ? 0.3 : 0);
    if (sc.shape === 'islands') sc2 += 0;
    spots.push({ x, y, v: sc2 });
  }
  spots.sort((a, b) => b.v - a.v);
  const towns = [];
  const minD = sc.shape === 'islands' ? 3 : 4;
  // islands: biggest town on the main island, then one town per other island, then the rest anywhere
  let comps = [];
  if (sc.shape === 'islands') {
    const seen = new Set();
    for (const p of spots) { if (seen.has(p.x + p.y * W)) continue; const c = landComponent(s, p.x, p.y); c.forEach(v => seen.add(v)); if (c.size >= 6) comps.push(c); }
    comps.sort((a, b) => b.size - a.size);
  }
  for (const pop of sc.towns) {
    let pick = null;
    const k = towns.length, want = comps.length ? (k === 0 ? comps[0] : k < comps.length ? comps[k] : null) : null;
    for (const p of spots) {
      if (towns.some(t => Math.hypot(t.x - p.x, t.y - p.y) < minD)) continue;
      if (want && !want.has(p.x + p.y * W)) continue;
      pick = p; break;
    }
    if (!pick) break;
    towns.push(pick);
    s.nodes.push({ id: s.nextId++, k: 'town', x: pick.x, y: pick.y, name: names.pop(), pop: pop * 1000, sat: 50, served: 0, dem: 0, outE: 0, conn: false, parts: {}, thought: null, yr: { rev: 0 } });
  }
  // borders
  for (const b of sc.borders) {
    let best = null;
    for (let k = 0; k < Math.max(W, H); k++) {
      const off = Math.round((k % 2 ? 1 : -1) * Math.ceil(k / 2));
      const x = b.side === 'E' ? W - 1 : b.side === 'W' ? 0 : Math.floor(W / 2) + off;
      const y = b.side === 'N' ? 0 : b.side === 'S' ? H - 1 : Math.floor(H / 2) + off;
      const tt = tileAt(s, x, y);
      if (tt >= 0 && !isWater(tt) && tt !== T.MOUNT && !nodeAt(s, x, y)) { best = { x, y }; break; }
    }
    if (best) s.nodes.push({ id: s.nextId++, k: 'border', x: best.x, y: best.y, name: b.name, cap: b.cap, out: 0, yr: { imp: 0, exp: 0 } });
  }
  reindex(s);
  // inherited plants and grid
  if (sc.existing) {
    const tnodes = s.nodes.filter(n => n.k === 'town');
    const net = [];
    for (const ex of sc.existing) {
      const t = tnodes[ex.near] || tnodes[0];
      const site = findSite(s, ex.t, t, ex.t === 'nuclear' ? 3 : 1.5, 12, r);
      if (!site) continue;
      const p = addPlant(s, ex.t, site.x, site.y, { built: true, age: ex.age, cap: ex.cap, retire: ex.retire ? ex.retire * 12 : 0 });
      if (ex.cap) p.cost = PLANTS[ex.t].cost * ex.cap / PLANTS[ex.t].cap;
      net.push(p);
    }
    let members = [...net];
    if (sc.shape === 'islands') {
      const comp = landComponent(s, tnodes[0].x, tnodes[0].y);
      members.push(...tnodes.filter(t => comp.has(t.x + t.y * W)));
    } else members.push(...tnodes, ...s.nodes.filter(n => n.k === 'border'));
    // minimum spanning tree (Prim)
    const inT = [members[0]], rest = members.slice(1);
    while (rest.length) {
      let bd = 1e9, bi = -1, bj = null;
      rest.forEach((m, i) => inT.forEach(o => { const d = dist(m, o) * (sc.shape === 'islands' && lineTerrain(s, m, o).water > 0 ? 9 : 1); if (d < bd) { bd = d; bi = i; bj = o; } }));
      const m = rest.splice(bi, 1)[0];
      addLine(s, m, bj, 2, { built: true });
      inT.push(m);
    }
    // every inherited plant gets a second line, and a couple of close towns get extra links, so the grid isn't purely radial
    for (const p of net) {
      const o = members.filter(m => m !== p && !linkBetween(s, p, m) && m.k !== 'plant' && (sc.shape !== 'islands' || !lineTerrain(s, p, m).water)).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (o && dist(o, p) < 8) addLine(s, p, o, 2, { built: true });
    }
    const tl = tnodes.filter(t => members.includes(t));
    for (const a of tl) for (const b of tl) if (a.id < b.id && dist(a, b) < 6.5 && !linkBetween(s, a, b) && r() < 0.35) addLine(s, a, b, 1, { built: true });
    for (const t of tl) t.conn = true;
  }
  for (const t of s.nodes) if (t.k === 'town') t.sat = t.conn ? 66 : 40;
  for (const l of s.lines) l.cost = lineCost(s, byId(s, l.a), byId(s, l.b), l.tier);
  rebuildTopo(s);
  if (sc.existing) calibrateGrid(s);
  logNews(s, '🏛️', sc.tutorial ? 'Welcome, grid operator! The valley is waiting for power.' : `You are now the grid operator of ${sc.name}.`);
  return s;
}
function newAcc() { return { gen: Object.fromEntries(CATS.map(c => [c, 0])), served: 0, dem: 0, shed: 0, co2: 0, imp: 0, exp: 0, curt: 0, h: 0 }; }
