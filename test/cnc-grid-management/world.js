// Map generation, occupancy, grid islands, placement rules, path finding.
'use strict';

function newGame(missionId, opt = {}) {
  const M = MISSIONS.find(m => m.id === missionId);
  const seed = M.seed || ((Math.random() * 1e9) | 0);
  const theme = opt.theme || M.theme;
  const st = {
    v: 1, mission: M.id, theme, seed, W: M.W, H: M.H, t: [], rev: [], lines: {}, brk: {}, structs: [], towns: [], units: [],
    nextId: 1, hour: M.start || 6, credits: M.credits, shownCredits: M.credits, speed: 0,
    co2Price: M.co2 || .3, approval: 60, q: { s: null, u: null },
    weather: { wind: .35, windT: .35, cloud: .4, cloudT: .4, snow: 0, temp: -4, snowing: 0, ev: [] },
    events: (M.events || []).map(e => Object.assign({}, e)), goals: {}, tut: M.tutorial ? 0 : -1,
    stats: { dem: 0, served: 0, shed: 0, co2: 0, earned: 0, spent: 0, fuel: 0, blackoutH: 0, built: 0, arrests: 0, zaps: 0 },
    last24: [], fx: [], over: null, msgs: [], dayStats: null, everJoined: 0,
  };
  genMap(st, M);
  // start structures
  addStruct(st, 'yard', M.yard[0], M.yard[1], true);
  st.structs[0].wired = 1;
  for (const p of (M.prebuilt || [])) { const s = addStruct(st, p.t, p.x, p.y, true); autoWire(st, -1, s); s.wired = 1; }
  for (let i = 0; i < st.towns.length; i++) if (M.towns !== 'random' && M.towns[i].wired) autoWire(st, i);
  for (const town of st.towns) if (M.towns !== 'random' && M.towns[town.i].wired) { town.joined = 1; town.lit = 1; st.everJoined = 1; }
  reveal(st);
  if (M.tutorial) for (const t of st.towns.slice(0, 2)) reveal(st, [t.x, t.y, 3.5]);
  derive(st);
  return st;
}

const idx = (st, x, y) => y * st.W + x;
const inb = (st, x, y) => x >= 0 && y >= 0 && x < st.W && y < st.H;
const terr = (st, x, y) => inb(st, x, y) ? st.t[y * st.W + x] : -1;

function genMap(st, M) {
  const { W, H } = st, r = mulberry(st.seed), t = new Array(W * H).fill(G);
  const set = (x, y, v) => { if (inb(st, x, y)) t[y * W + x] = v; };
  // ground variety
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fbm(x / 6, y / 6, st.seed + 1) > .7) set(x, y, D);
  // forests
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = fbm(x / 5, y / 5, st.seed + 2); if (n > 1 - (M.forest || .5) * .7 && r() < .8) set(x, y, F); }
  // rock ridges: random walks
  for (let i = 0; i < (M.rocks || 10); i++) {
    let x = r() * W | 0, y = r() * H | 0; const len = 4 + r() * 9 | 0, dx = r() < .5 ? 1 : 0;
    for (let k = 0; k < len; k++) { set(x, y, R); if (r() < .35) set(x + (dx ? 0 : 1), y + (dx ? 1 : 0), R); if (r() < .7) { dx ? x++ : y++; } else { dx ? y += (r() < .5 ? 1 : -1) : x += (r() < .5 ? 1 : -1); } }
  }
  // river: top to bottom
  const rv = M.river || { x: W >> 1, amp: 3 }; let rx = rv.x;
  st.riverX = [];
  for (let y = 0; y < H; y++) {
    rx += (r() - .5) * 1.4 + Math.sin(y / 5 + st.seed) * .35; rx = Math.max(rv.x - rv.amp, Math.min(rv.x + rv.amp, rx));
    const x0 = Math.round(rx); set(x0, y, W_); set(x0 + 1, y, W_); if (r() < .3) set(x0 - 1, y, W_);
    st.riverX.push(x0);
  }
  // villages
  const names = NAMES[st.theme].slice(); for (let i = names.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [names[i], names[j]] = [names[j], names[i]]; }
  let spots = M.towns;
  if (spots === 'random') {
    spots = []; const n = 7;
    for (let tries = 0; spots.length < n && tries < 500; tries++) {
      const x = 4 + r() * (W - 8) | 0, y = 3 + r() * (H - 6) | 0;
      if (Math.hypot(x - M.yard[0], y - M.yard[1]) < 9) continue;
      if (spots.some(s => Math.hypot(s.x - x, s.y - y) < 10)) continue;
      if (Math.abs(x - st.riverX[y]) < 3) continue;
      spots.push({ x, y, pop: 1200 + r() * 2400 | 0 });
    }
    spots.sort((a, b) => Math.hypot(a.x - M.yard[0], a.y - M.yard[1]) - Math.hypot(b.x - M.yard[0], b.y - M.yard[1]));
  }
  // clear base area
  const clear = (cx, cy, rad, v = G) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if (inb(st, x, y) && t[y * W + x] !== W_) { if (Math.hypot(x - cx, y - cy) <= rad + .3) t[y * W + x] = (v === G && t[y * W + x] === D) ? D : v; } };
  clear(M.yard[0] + 1, M.yard[1] + 1, 5);
  for (const p of (M.prebuilt || [])) clear(p.x, p.y, 2);
  const houseKinds = ['house', 'house2', 'big', 'house', 'barn', 'block', 'house2', 'big'];
  st.towns = spots.map((s, i) => {
    clear(s.x, s.y, 3);
    const tiles = [], n = Math.max(3, Math.min(8, Math.round(s.pop / 420)));
    const cand = [];
    for (let y = s.y - 2; y <= s.y + 2; y++) for (let x = s.x - 3; x <= s.x + 3; x++) if (inb(st, x, y) && t[y * W + x] !== W_) cand.push([x, y, Math.hypot(x - s.x, (y - s.y) * 1.3) + r() * 1.2]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of cand) { if (tiles.length >= n) break; if ((x + y) % 2 === 0 || tiles.length < 2) tiles.push([x, y]); }
    const kinds = tiles.map((_, k) => k === 0 ? 'church' : houseKinds[(k + i) % houseKinds.length]);
    return { i, name: names[i % names.length], x: s.x, y: s.y, pop: s.pop, pop0: s.pop, tiles, kinds, mood: 55, lit: 0, joined: 0, dem: 0, outH: 0, shedFor: 0, grow: 1 };
  });
  // roads from the base to each village (and bridges over the river)
  st.t = t;
  for (const town of st.towns) {
    let x = M.yard[0] + 1, y = M.yard[1] + 3; const tx = town.x, ty = town.y + 2;
    let guard = 0; const jog = x + Math.round((tx - x) * (.3 + r() * .4));
    while ((x !== tx || y !== ty) && guard++ < 400) {
      if (x !== jog && x !== tx) x += Math.sign(tx - x); else if (y !== ty) y += Math.sign(ty - y); else x += Math.sign(tx - x);
      const k = y * W + x, v = t[k];
      if (v === W_) t[k] = BRIDGE; else if (v !== BRIDGE) t[k] = ROAD;
    }
  }
  // keep village tiles clear of roads
  for (const town of st.towns) for (const [x, y] of town.tiles) t[y * W + x] = G;
  st.t = t;
  st.rev = new Array(W * H).fill(0);
  st.hill = new Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let rocks = 0, trees = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = terr(st, x + dx, y + dy); if (v === R) rocks++; if (v === F && Math.abs(dx) < 2 && Math.abs(dy) < 2) trees++; }
    const edge = (x < 3 || y < 3 || x > W - 4 || y > H - 4) ? .08 : 0;
    st.hill[y * W + x] = Math.round((.85 + Math.min(4, rocks) * .09 - trees * .04 + edge + (terr(st, x, y) === D ? .04 : 0)) * 100) / 100;
  }
}
const W_ = W;

function addStruct(st, type, x, y, free) {
  const d = S[type];
  const s = { id: st.nextId++, type, x, y, on: 1, out: 0, st: 'run', tmr: 0, hp: 100 };
  if (d.auto) { s.st = 'off'; s.mode = 'auto'; }
  if (THERMAL(type) && !d.auto) { if (free) { s.st = 'run'; s.out = d.cap * d.min; } else { s.st = 'start'; s.tmr = d.start; } }
  if (d.store) s.soc = d.energy * .5;
  if (d.res) s.res = d.res * .7;
  st.structs.push(s);
  // clear trees under the footprint
  for (let j = 0; j < d.fp[1]; j++) for (let i = 0; i < d.fp[0]; i++) { const k = idx(st, x + i, y + j); if (st.t[k] === F) st.t[k] = G; }
  st.dirty = 1;
  return s;
}

function autoWire(st, ti, plant) {
  // shortest line from the existing grid to a village (or to a prebuilt plant)
  const goal = new Set();
  if (plant) { const d = S[plant.type]; for (let j = -1; j <= d.fp[1]; j++) for (let i = -1; i <= d.fp[0]; i++) { const cx = i < 0 || i >= d.fp[0], cy = j < 0 || j >= d.fp[1]; if (cx === cy) continue; if (inb(st, plant.x + i, plant.y + j)) goal.add(idx(st, plant.x + i, plant.y + j)); } }
  else for (const [x, y] of st.towns[ti].tiles) for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inb(st, nx, ny)) goal.add(idx(st, nx, ny)); }
  const start = []; const occ = occupancy(st);
  for (const s of (plant ? st.structs.filter(o => o !== plant && o.wired) : st.structs)) { const d = S[s.type]; for (let j = -1; j <= d.fp[1]; j++) for (let i = -1; i <= d.fp[0]; i++) { const cx = i < 0 || i >= d.fp[0], cy = j < 0 || j >= d.fp[1]; if (cx && cy) continue; const x = s.x + i, y = s.y + j; if (inb(st, x, y) && !occ.s[idx(st, x, y)]) start.push(idx(st, x, y)); } }
  for (const k in st.lines) start.push(+k);
  const path = bfs(st, start, k => goal.has(k), k => { const v = st.t[k]; return v !== R && !occ.s[k] && !occ.t[k]; });
  if (path) for (const k of path) { st.lines[k] = 100; if (st.t[k] === F) st.t[k] = G; }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function occupancy(st) {
  const n = st.W * st.H, s = new Int32Array(n), t = new Int32Array(n);
  for (const o of st.structs) { const d = S[o.type]; for (let j = 0; j < d.fp[1]; j++) for (let i = 0; i < d.fp[0]; i++) s[idx(st, o.x + i, o.y + j)] = o.id; }
  for (const town of st.towns) for (const [x, y] of town.tiles) t[idx(st, x, y)] = town.i + 1;
  return { s, t };
}

// Rebuild occupancy and grid islands (union-find over lines, structures and villages).
function derive(st) {
  const occ = occupancy(st); st.occS = occ.s; st.occT = occ.t;
  st.byId = {}; for (const s of st.structs) st.byId[s.id] = s;
  const n = st.W * st.H, par = new Int32Array(n).fill(-1);
  const node = k => st.occS[k] || st.occT[k] || (st.lines[k] !== undefined && !st.brk[k]);
  for (let k = 0; k < n; k++) if (node(k)) par[k] = k;
  const find = k => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
    const k = idx(st, x, y); if (par[k] < 0) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy; if (!inb(st, nx, ny)) continue; const m = idx(st, nx, ny); if (par[m] < 0) continue;
      const ta = st.occT[k], tb = st.occT[m];
      if (ta && tb && ta !== tb) continue;           // neighbouring villages don't share wires
      uni(k, m);
    }
  }
  for (const town of st.towns) { const a = idx(st, town.tiles[0][0], town.tiles[0][1]); for (const [x, y] of town.tiles) uni(a, idx(st, x, y)); }
  const isl = new Map(), get = r => { if (!isl.has(r)) isl.set(r, { id: r, structs: [], towns: [], gen: 0 }); return isl.get(r); };
  for (const s of st.structs) { const r = find(idx(st, s.x, s.y)); s.isl = r; const I = get(r); I.structs.push(s); if (S[s.type].cap) I.gen = 1; }
  for (const town of st.towns) { const r = find(idx(st, town.tiles[0][0], town.tiles[0][1])); town.isl = r; get(r).towns.push(town); }
  st.islands = [...isl.values()];
  st.find = find; st.par = par;
  st.dirty = 0;
}

// Fog of war: reveal around structures, lines and units.
function reveal(st, extra) {
  const touched = [];
  const open = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!inb(st, x, y)) continue; const k = idx(st, x, y);
      if (!st.rev[k] && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + .5) { st.rev[k] = 1; touched.push(k); }
    }
  };
  if (extra) { open(extra[0], extra[1], extra[2]); return touched; }
  for (const s of st.structs) { const d = S[s.type]; open(s.x + d.fp[0] / 2 - .5, s.y + d.fp[1] / 2 - .5, (d.see || 3) + d.fp[0] / 2); }
  for (const k in st.lines) open(k % st.W, (k / st.W) | 0, 2.5);
  for (const u of st.units) if (u.type !== 'thief') open(u.x, u.y, S[u.type].see || 4);
  for (const town of st.towns) if (town.joined) for (const [x, y] of town.tiles) open(x, y, 2);
  return touched;
}

function has(st, type) { return st.structs.some(s => s.type === type); }
function allowed(st, type) { const M = MISSIONS.find(m => m.id === st.mission); return !M.allow || M.allow.includes(type); }
function prereqOk(st, type) { const n = S[type].need; return !n || has(st, n); }

// Can a structure go here? Returns { ok, why, cells:[[x,y,ok]] }.
function canPlace(st, type, x, y) {
  const d = S[type], cells = []; let ok = true, why = '', water = 0, land = 0;
  for (let j = 0; j < d.fp[1]; j++) for (let i = 0; i < d.fp[0]; i++) {
    const tx = x + i, ty = y + j; let c = inb(st, tx, ty);
    if (c) {
      const k = idx(st, tx, ty), v = st.t[k];
      if (!st.rev[k]) { c = false; why = why || 'Unexplored'; }
      else if (st.occS[k] || st.occT[k] || st.lines[k] !== undefined) { c = false; why = why || 'Occupied'; }
      else if (d.river) { if (v === W_) water++; else if (canBuild(v)) land++; else { c = false; why = why || 'Blocked'; } }
      else if (!canBuild(v)) { c = false; why = why || (v === F ? 'Trees in the way' : v === W_ ? 'Water' : 'Rocks'); }
      if (st.units.some(u => Math.floor(u.x + .5) === tx && Math.floor(u.y + .5) === ty)) { c = false; why = why || 'Units in the way'; }
    } else why = why || 'Off the map';
    cells.push([tx, ty, c]); if (!c) ok = false;
  }
  if (d.river && ok && (water < 1 || land < 1)) { ok = false; why = 'Must sit across the river bank'; cells.forEach(c => c[2] = false); }
  if (ok && !nearBase(st, type, x, y)) { ok = false; why = d.outpost ? 'Place it next to your lines or base' : 'Too far from your base or a substation'; cells.forEach(c => c[2] = false); }
  return { ok, why, cells };
}
function nearBase(st, type, x, y) {
  const d = S[type];
  for (const s of st.structs) {
    const e = S[s.type], r = s.type === 'sub' ? 4 : s.type === 'yard' ? 4 : 2;
    const gx = Math.max(s.x - x - d.fp[0] + 1, 0, x - (s.x + e.fp[0] - 1)), gy = Math.max(s.y - y - d.fp[1] + 1, 0, y - (s.y + e.fp[1] - 1));
    if (Math.max(gx, gy) <= r) return true;
  }
  if (d.outpost) for (let j = -1; j <= d.fp[1]; j++) for (let i = -1; i <= d.fp[0]; i++) if (st.lines[idx(st, x + i, y + j)] !== undefined) return true;
  return false;
}

// Can a line tile go here, given the tiles already chosen in this drag?
function lineCellOk(st, k, chosen) {
  const x = k % st.W, y = (k / st.W) | 0, v = st.t[k];
  if (!canLine(v) || st.occS[k] || st.occT[k] || st.lines[k] !== undefined) return false;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy; if (!inb(st, nx, ny)) continue; const m = idx(st, nx, ny);
    if (st.occS[m] || st.lines[m] !== undefined || chosen.has(m)) return true;
  }
  return false;
}
const lineCost = (st, k) => S.line.cost * (st.t[k] === W_ ? 3 : 1) + (st.t[k] === F ? 10 : 0);

// Breadth-first search over tiles. start: array of tile indices, isGoal(k), pass(k).
function bfs(st, start, isGoal, pass, maxN = 1e9) {
  const n = st.W * st.H, prev = new Int32Array(n).fill(-2), q = new Int32Array(n); let h = 0, tl = 0;
  for (const s of start) if (prev[s] === -2) { prev[s] = -1; q[tl++] = s; }
  while (h < tl) {
    const k = q[h++];
    if (isGoal(k)) { const p = []; for (let c = k; c !== -1; c = prev[c]) p.push(c); return p.reverse(); }
    if (h > maxN) break;
    const x = k % st.W, y = (k / st.W) | 0;
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inb(st, nx, ny)) continue; const m = ny * st.W + nx; if (prev[m] !== -2 || !pass(m)) continue; prev[m] = k; q[tl++] = m; }
  }
  return null;
}
function walkable(st, k) { return canWalk(st.t[k]) && !st.occS[k] && !st.occT[k]; }
function pathTo(st, fx, fy, goalFn, maxN) {
  const s = idx(st, Math.round(fx), Math.round(fy));
  return bfs(st, [s], goalFn, k => walkable(st, k) || k === s, maxN);
}
