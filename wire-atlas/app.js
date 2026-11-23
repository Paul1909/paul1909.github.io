'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'wire-atlas';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

/* ---------------- data ---------------- */
const D = window.WA_DATA;
const topo = D.topo;
const MESH = topojson.mesh(topo, topo.objects.countries);
// Land for the white fill over blue water. Country by country (not merged), so no single ring is
// big enough to wrap around the far side of the globe.
const LAND = topojson.feature(topo, topo.objects.countries);
const LAND_RINGS = [];
LAND.features.forEach(f => { const g = f.geometry; if (!g) return;
  (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(poly => poly.forEach(r => LAND_RINGS.push(r))); });
const WATER = '#d4ebfa';
const SPHERE = { type: 'Sphere' };
const C = {};                       // id -> {id, n, cap, r, s, q, ll}
D.countries.forEach(c => { C[c.id] = c; });
const QUIZ = D.countries.filter(c => c.q);

// Per-country geometry: full feature, "main" part (for shape + centring), area, centroid, angular radius
const F = {};
function prep(f, point) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const parts = polys.map(p => { const pg = { type: 'Polygon', coordinates: p }; return { p, area: d3.geoArea(pg), c: d3.geoCentroid(pg) }; });
  parts.sort((a, b) => b.area - a.area);
  // Keep the largest polygon plus islands chained within ~900 km of it (drops overseas territories)
  const inc = [parts[0]], rest = parts.slice(1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (inc.some(q => d3.geoDistance(q.c, rest[i].c) < 0.14)) { inc.push(rest.splice(i, 1)[0]); changed = true; }
    }
  }
  const main = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: inc.map(q => q.p) } };
  const centroid = d3.geoCentroid(main);
  let a = 0;
  inc.forEach(q => q.p[0].forEach(pt => { const d = d3.geoDistance(centroid, pt); if (d > a) a = d; }));
  return { id: f.id, f, main, area: d3.geoArea(f), centroid, a: Math.max(a, 0.001), point: !!point };
}
// Some countries come in several map pieces with the same code (Australia + Ashmore and Cartier
// Islands): merge them into one country instead of letting the last piece win.
const pieces = {};
topojson.feature(topo, topo.objects.countries).features.forEach(f => {
  if (!f.id || !C[f.id] || !f.geometry) return;
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  (pieces[f.id] = pieces[f.id] || []).push(...polys);
});
Object.entries(pieces).forEach(([id, polys]) => {
  F[id] = prep({ type: 'Feature', id, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
});
D.countries.forEach(c => {         // countries missing from the 1:50m map (Tuvalu) get a small circle
  if (!F[c.id] && c.ll) {
    const geometry = d3.geoCircle().center([c.ll[1], c.ll[0]]).radius(0.15)();
    F[c.id] = prep({ type: 'Feature', id: c.id, geometry }, true);
  }
});
const IDS = Object.keys(F);
const TINY = IDS.filter(id => F[id].a < 0.03);

/* ---------------- globe ---------------- */
const cv = document.getElementById('globe');
const ctx = cv.getContext('2d');
const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
const path = d3.geoPath(proj, ctx);
const view = { lam: -10, phi: -32, zoom: 1 };
let W = 0, H = 0, DPR = 1, dirty = true;
let spin = true, inertia = null, anim = null, lastInteract = 0;
let selected = null, wrongSel = null;               // highlighted country id
let mode = 'browse';               // browse | menu | quiz | end
const ZMIN = 1, ZMAX = 80, SPIN = 7; // deg/s
const Y = '#ffd400';

function baseR() { return Math.max(40, Math.min(W, H) / 2 - 14); }
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  dirty = true;
}
new ResizeObserver(resize).observe(cv);

function setView() {
  const R = baseR() * view.zoom;
  proj.scale(R).translate([W / 2, H / 2]).rotate([view.lam, view.phi]).clipExtent([[-2, -2], [W + 2, H + 2]]);
  return R;
}
function center() { return [-view.lam, -view.phi]; }
function visible(ll) { return d3.geoDistance(ll, center()) < Math.PI / 2 - 0.01; }

// Fast wireframe: lines pre-converted to 3D unit vectors, rotated and projected by hand each frame
// (same maths as d3.geoOrthographic, much quicker than its general pipeline on phones).
const RAD = Math.PI / 180;
function pack(lines) {
  let n = 0; lines.forEach(l => n += l.length);
  const xyz = new Float32Array(n * 3), starts = new Uint32Array(lines.length), lens = new Uint32Array(lines.length);
  let o = 0;
  lines.forEach((l, i) => {
    starts[i] = o; lens[i] = l.length;
    for (const [lon, lat] of l) {
      const a = lon * RAD, b = lat * RAD, c = Math.cos(b);
      xyz[o * 3] = c * Math.cos(a); xyz[o * 3 + 1] = c * Math.sin(a); xyz[o * 3 + 2] = Math.sin(b); o++;
    }
  });
  return { xyz, starts, lens };
}
const MESH_P = pack(MESH.coordinates);
const LAND_P = pack(LAND_RINGS);

function trace(P, R, front, back) {
  const { xyz, starts, lens } = P;
  const l = view.lam * RAD, f = view.phi * RAD;
  const cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(f), sp = Math.sin(f);
  const cx = W / 2, cy = H / 2, m = 4, x0 = -m, y0 = -m, x1m = W + m, y1m = H + m;
  const pen = { 1: { p: front, x: NaN, y: NaN }, [-1]: { p: back, x: NaN, y: NaN } };
  function seg(side, ax, ay, bx, by) {
    const q = pen[side]; if (!q.p) return;
    if ((ax < x0 && bx < x0) || (ax > x1m && bx > x1m) || (ay < y0 && by < y0) || (ay > y1m && by > y1m)) { q.x = NaN; return; }
    if (q.x !== ax || q.y !== ay) q.p.moveTo(ax, ay);
    q.p.lineTo(bx, by); q.x = bx; q.y = by;
  }
  for (let li = 0; li < starts.length; li++) {
    const s = starts[li], n = lens[li];
    let pd = 0, py = 0, pz = 0, psx = 0, psy = 0, pside = 0;
    for (let k = 0; k < n; k++) {
      const i = (s + k) * 3, x = xyz[i], y = xyz[i + 1], z = xyz[i + 2];
      const xa = x * cl - y * sl, ya = x * sl + y * cl;
      const d = xa * cp - z * sp, zb = z * cp + xa * sp;
      const side = d > 0 ? 1 : -1, sx = cx + R * ya, sy = cy - R * zb;
      if (k) {
        if (side === pside) seg(side, psx, psy, sx, sy);
        else {
          const t = pd / (pd - d), hy = py + t * (ya - py), hz = pz + t * (zb - pz), nn = Math.sqrt(hy * hy + hz * hz) || 1;
          const hx = cx + R * hy / nn, hyy = cy - R * hz / nn;
          seg(pside, psx, psy, hx, hyy); seg(side, hx, hyy, sx, sy);
        }
      }
      pd = d; py = ya; pz = zb; psx = sx; psy = sy; pside = side;
    }
  }
}

// Land fill: rings with no visible point are skipped; hidden points are pushed onto the rim,
// which closes each partly visible ring along the edge of the globe.
function traceFill(P, R, out) {
  const { xyz, starts, lens } = P;
  const l = view.lam * RAD, f = view.phi * RAD;
  const cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(f), sp = Math.sin(f);
  const cx = W / 2, cy = H / 2;
  for (let li = 0; li < starts.length; li++) {
    const s = starts[li], n = lens[li];
    let any = false;
    for (let k = 0; k < n && !any; k++) {
      const i = (s + k) * 3, xa = xyz[i] * cl - xyz[i + 1] * sl;
      if (xa * cp - xyz[i + 2] * sp > 0) any = true;
    }
    if (!any) continue;
    for (let k = 0; k < n; k++) {
      const i = (s + k) * 3, x = xyz[i], y = xyz[i + 1], z = xyz[i + 2];
      const xa = x * cl - y * sl, ya = x * sl + y * cl;
      const d = xa * cp - z * sp, zb = z * cp + xa * sp;
      let sx, sy;
      if (d > 0) { sx = cx + R * ya; sy = cy - R * zb; }
      else { const nn = Math.sqrt(ya * ya + zb * zb) || 1; sx = cx + R * ya / nn; sy = cy - R * zb / nn; }
      if (k) out.lineTo(sx, sy); else out.moveTo(sx, sy);
    }
    // no closePath(): fill() closes each ring anyway, and closePath is very slow on big paths
  }
}

function draw() {
  if (!W) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const R = setView();
  ctx.lineJoin = 'round';
  const meshF = new Path2D(), land = new Path2D();
  trace(MESH_P, R, meshF, null);
  traceFill(LAND_P, R, land);
  ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 2 * Math.PI); ctx.fillStyle = WATER; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fill(land);
  if (wrongSel && F[wrongSel]) {
    ctx.beginPath(); path(F[wrongSel].f); ctx.fillStyle = '#f4a6a9'; ctx.fill();
  }
  if (selected && F[selected]) {
    ctx.beginPath(); path(F[selected].f); ctx.fillStyle = Y; ctx.fill();
  }
  ctx.strokeStyle = '#8e8e92'; ctx.lineWidth = 0.8; ctx.stroke(meshF);
  ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 2 * Math.PI); ctx.strokeStyle = '#c2c2c6'; ctx.lineWidth = 1.2; ctx.stroke();
  // tiny countries become dots so they can be seen and tapped
  ctx.beginPath();
  for (const id of TINY) {
    const it = F[id];
    if (it.a * R > 2.5 || !visible(it.centroid)) continue;
    const p = proj(it.centroid); if (!p) continue;
    ctx.moveTo(p[0] + 2, p[1]); ctx.arc(p[0], p[1], 2, 0, 2 * Math.PI);
  }
  ctx.strokeStyle = '#8e8e92'; ctx.lineWidth = 0.9; ctx.stroke();
  // ring around a small selected country
  if (selected && F[selected]) {
    const it = F[selected];
    if (it.a * R < 9 && visible(it.centroid)) {
      const p = proj(it.centroid);
      ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, 2 * Math.PI);
      ctx.strokeStyle = Y; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 2 * Math.PI); ctx.fillStyle = Y; ctx.fill();
    }
  }
}

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function zoomFor(id) { return Math.max(1, Math.min(2.2, 0.3 / F[id].a)); }
function animateTo(id, zoom, dur = 1000) {
  const it = F[id]; if (!it) return;
  const interp = d3.geoInterpolate(center(), it.centroid);
  const z0 = view.zoom, z1 = zoom == null ? view.zoom : zoom;
  spin = false; inertia = null;
  anim = { t0: performance.now(), dur, step(e) { const c = interp(e); view.lam = -c[0]; view.phi = -c[1]; view.zoom = z0 * Math.pow(z1 / z0, e); } };
}
function zoomBy(f) {
  const z0 = view.zoom, z1 = Math.max(ZMIN, Math.min(ZMAX, z0 * f));
  spin = false; lastInteract = performance.now();
  anim = { t0: performance.now(), dur: 260, step(e) { view.zoom = z0 * Math.pow(z1 / z0, e); } };
}

let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0); lastT = t;
  if (anim) {
    const p = Math.min(1, (t - anim.t0) / anim.dur); anim.step(ease(p)); dirty = true;
    if (p >= 1) anim = null;
  } else if (inertia && !pointers.size) {
    view.lam += inertia.vl * dt; view.phi = clampPhi(view.phi + inertia.vp * dt);
    const k = Math.exp(-dt * 3.5); inertia.vl *= k; inertia.vp *= k; dirty = true;
    if (Math.abs(inertia.vl) + Math.abs(inertia.vp) < 2) inertia = null;
  } else if (spin && !pointers.size) {
    view.lam += SPIN * dt / Math.sqrt(view.zoom); dirty = true;
  }
  // resume spinning when left alone with nothing selected
  if (!spin && !anim && !inertia && !pointers.size && !selected && (mode === 'browse' || (mode === 'quiz' && !quiz.answered && !quiz.globe))
      && t - lastInteract > 12000) spin = true;
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const clampPhi = p => Math.max(-90, Math.min(90, p));

/* ---------------- touch / mouse ---------------- */
const pointers = new Map();
let gesture = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  audioUnlock();
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  spin = false; inertia = null; anim = null; lastInteract = performance.now();
  if (pointers.size === 1) gesture = { tap: true, x0: e.offsetX, y0: e.offsetY, t0: performance.now(), vl: 0, vp: 0, lt: performance.now() };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { tap: false, pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.zoom };
  }
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
  p.x = e.offsetX; p.y = e.offsetY;
  if (gesture.pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    view.zoom = Math.max(ZMIN, Math.min(ZMAX, gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0));
    dirty = true;
  } else if (!gesture.pinch) {
    if (Math.hypot(e.offsetX - gesture.x0, e.offsetY - gesture.y0) > 8) gesture.tap = false;
    const k = 180 / (Math.PI * baseR() * view.zoom);
    view.lam += dx * k; view.phi = clampPhi(view.phi - dy * k);
    const now = performance.now(), dtm = Math.max(1, now - gesture.lt) / 1000;
    gesture.vl = 0.7 * gesture.vl + 0.3 * (dx * k / dtm); gesture.vp = 0.7 * gesture.vp + 0.3 * (-dy * k / dtm);
    gesture.lt = now; dirty = true;
  }
  lastInteract = performance.now();
});
function pointerEnd(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.pinch) { if (!pointers.size) gesture = null; return; }
  if (gesture.tap && performance.now() - gesture.t0 < 500) onTap(e.offsetX, e.offsetY);
  else if (performance.now() - gesture.lt < 80 && Math.hypot(gesture.vl, gesture.vp) > 20) inertia = { vl: gesture.vl, vp: gesture.vp };
  gesture = null; lastInteract = performance.now();
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  spin = false; lastInteract = performance.now();
  view.zoom = Math.max(ZMIN, Math.min(ZMAX, view.zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true;
}, { passive: false });
document.getElementById('zin').onclick = () => zoomBy(1.7);
document.getElementById('zout').onclick = () => zoomBy(1 / 1.7);

function pick(x, y) {
  const R = setView();
  const ll = proj.invert([x, y]);
  if (!ll || !isFinite(ll[0]) || !isFinite(ll[1]) || !visible(ll)) return null;
  let hit = null;
  for (const id of IDS) {
    const it = F[id];
    if (d3.geoContains(it.f, ll) && (!hit || it.area < hit.area)) hit = it;
  }
  // dots for tiny countries: nearest one within reach
  let near = null, nd = 1e9;
  for (const id of TINY) {
    const it = F[id];
    if (it.a * R > 9 || !visible(it.centroid)) continue;
    const p = proj(it.centroid), d = Math.hypot(p[0] - x, p[1] - y);
    if (d < nd) { nd = d; near = it; }
  }
  if (near && (!hit && nd < 22 || nd < 9 && view.zoom >= 3)) return near.id;
  return hit ? hit.id : null;
}

function onTap(x, y) {
  const quizPick = mode === 'quiz' && quiz.a === 'loc' && !quiz.answered;
  if (mode !== 'browse' && !quizPick) return;
  const id = pick(x, y);
  if (quizPick) {
    selected = id; dirty = true;
    const nb = document.getElementById('next'); if (nb) nb.disabled = !id;
    if (id) blip();
    return;
  }
  select(id);
  if (id) blip();
}
function select(id) {
  selected = id; dirty = true;
  if (mode === 'browse') renderBrowse();
}

/* ---------------- small canvases: shape + location ---------------- */
function prepCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = r.width || 100, h = r.height || 84;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return [g, w, h];
}
function drawShape(c, id) {
  const [g, w, h] = prepCanvas(c), it = F[id];
  if (it.point) {
    g.beginPath(); g.arc(w / 2, h / 2, 5, 0, 2 * Math.PI); g.fillStyle = Y; g.fill(); g.strokeStyle = '#8e8e92'; g.stroke();
    return;
  }
  const p = d3.geoAzimuthalEqualArea().rotate([-it.centroid[0], -it.centroid[1]]).fitExtent([[6, 6], [w - 6, h - 6]], it.main);
  const gp = d3.geoPath(p, g);
  g.beginPath(); gp(it.main); g.fillStyle = Y; g.fill();
  g.lineJoin = 'round'; g.strokeStyle = '#6e6e72'; g.lineWidth = 1; g.stroke();
}
// dot = true: mark the place with a dot instead of filling the country (so the shape isn't given away)
function drawLocation(c, id, dot) {
  const [g, w, h] = prepCanvas(c), it = F[id];
  const r = Math.min(w, h) / 2 - 2;
  const p = d3.geoOrthographic().clipAngle(90).precision(0.8).scale(r).translate([w / 2, h / 2]).rotate([-it.centroid[0], -it.centroid[1]]);
  const gp = d3.geoPath(p, g);
  g.lineJoin = 'round';
  g.beginPath(); gp(SPHERE); g.fillStyle = WATER; g.fill();
  g.beginPath(); gp(LAND); g.fillStyle = '#fff'; g.fill();
  if (!dot) { g.beginPath(); gp(it.f); g.fillStyle = Y; g.fill(); }
  g.beginPath(); gp(MESH); g.strokeStyle = '#a2a2a6'; g.lineWidth = 0.5; g.stroke();
  g.beginPath(); gp(SPHERE); g.strokeStyle = '#c2c2c6'; g.lineWidth = 1; g.stroke();
  if (dot) {
    g.beginPath(); g.arc(w / 2, h / 2, 4.5, 0, 2 * Math.PI); g.fillStyle = Y; g.fill(); g.strokeStyle = '#6e6e72'; g.lineWidth = 1.2; g.stroke();
  } else if (it.a * r < 5) {
    g.beginPath(); g.arc(w / 2, h / 2, 7, 0, 2 * Math.PI); g.strokeStyle = Y; g.lineWidth = 2.5; g.stroke();
  }
}

/* ---------------- ui helpers ---------------- */
const pane = document.getElementById('pane');
const foot = document.getElementById('foot');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const flagSrc = id => 'flags/' + id.toLowerCase() + '.svg';
const capText = c => c.cap.length ? c.cap.map(esc).join(', ') : '—';

function cardHTML(id, meta = true) {
  const c = C[id];
  return `<div class="name">${esc(c.n)}</div>
    <div class="cap"><span>Capital</span>${capText(c)}</div>
    <div class="thumbs">
      <figure><div class="box"><img src="${flagSrc(id)}" alt=""></div><figcaption>Flag</figcaption></figure>
      <figure><div class="box"><canvas class="shape"></canvas></div><figcaption>Shape</figcaption></figure>
    </div>
    ${meta ? `<div class="meta">${esc(c.s)}${c.s !== c.r ? ' · ' + esc(c.r) : ''}${c.q ? '' : ' · territory'}</div>` : ''}`;
}
function fillCard(root, id) {
  const s = root.querySelector('canvas.shape');
  if (s) drawShape(s, id);
}
function footer(btns) {
  foot.innerHTML = '';
  btns.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label; el.disabled = !!b.disabled; el.onclick = b.on;
    if (b.id) el.id = b.id;
    foot.appendChild(el);
  });
}

/* ---------------- search (start page) ---------------- */
// Matches country names, capitals and other names (official, native, it/de/fr/es), ignoring accents and case.
const searchEl = document.getElementById('search'), qIn = document.getElementById('q');
const resEl = document.getElementById('results'), qClear = document.getElementById('qclear');
const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const INDEX = D.countries.filter(c => F[c.id]).map(c => ({
  c, n: norm(c.n), caps: c.cap.map(norm), alt: (c.alt || []).map(norm),
}));
function scoreText(t, q, base) {               // lower is better, Infinity = no match
  if (t === q) return base;
  if (t.startsWith(q)) return base + 1;
  if ((' ' + t).includes(' ' + q)) return base + 2;  // a later word starts with the query
  if (q.length >= 3 && t.includes(q)) return base + 3;
  return Infinity;
}
function search(raw) {
  const q = norm(raw); if (!q) return [];
  const out = [];
  for (const e of INDEX) {
    let best = scoreText(e.n, q, 0), why = 'name';
    for (const k of e.caps) { const sc = scoreText(k, q, 0.5); if (sc < best) { best = sc; why = 'cap'; } }
    for (const k of e.alt) {
      // an exact other name ("usa", "uk", "deutschland") ranks near the top; codes only match exactly
      const sc = k === q ? 0.3 : k.length <= 3 ? Infinity : scoreText(k, q, 4);
      if (sc < best) { best = sc; why = 'alt'; }
    }
    if (best < Infinity) out.push({ c: e.c, best, why, quiz: e.c.q ? 0 : 1 });
  }
  out.sort((a, b) => a.best - b.best || a.quiz - b.quiz || a.c.n.localeCompare(b.c.n));
  return out.slice(0, 8);
}
let hits = [];
function showResults() {
  const v = qIn.value;
  qClear.hidden = !v;
  hits = search(v);
  if (!v.trim()) { resEl.hidden = true; resEl.innerHTML = ''; return; }
  resEl.innerHTML = hits.length ? hits.map((h, i) => `<li data-id="${h.c.id}"${i ? '' : ' class="on"'}>
      <img src="${flagSrc(h.c.id)}" alt=""><div><b>${esc(h.c.n)}</b><small>${h.c.cap.length ? 'Capital: ' + capText(h.c) : '&nbsp;'}</small></div></li>`).join('')
    : '<li class="none">No country or capital found</li>';
  fitResults();
  resEl.hidden = false;
}
// keep the list above the phone keyboard
function fitResults() {
  const vv = window.visualViewport, top = resEl.getBoundingClientRect().top;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  resEl.style.maxHeight = Math.max(120, bottom - top - 12) + 'px';
}
window.visualViewport?.addEventListener('resize', () => { if (!resEl.hidden) fitResults(); });
function closeSearch(clear) {
  if (clear) qIn.value = '';
  qClear.hidden = !qIn.value;
  resEl.hidden = true; qIn.blur();
}
function goTo(id) {
  closeSearch(true);
  spin = false; lastInteract = performance.now();
  select(id);
  animateTo(id, zoomFor(id));
  blip();
}
qIn.addEventListener('input', showResults);
qIn.addEventListener('focus', () => { if (qIn.value) showResults(); });
qIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) goTo(hits[0].c.id); }
  else if (e.key === 'Escape') closeSearch(true);
});
resEl.addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) goTo(li.dataset.id); });
qClear.addEventListener('click', () => { qIn.value = ''; showResults(); qIn.focus(); });
cv.addEventListener('pointerdown', () => { if (!resEl.hidden || document.activeElement === qIn) closeSearch(false); });
function syncSearch() { searchEl.hidden = mode !== 'browse'; if (mode !== 'browse') closeSearch(true); }

/* ---------------- browse ---------------- */
function renderBrowse() {
  syncSearch();
  if (selected && C[selected]) {
    pane.innerHTML = cardHTML(selected);
    fillCard(pane, selected);
  } else {
    pane.innerHTML = `<div class="hint"><b>Wire Atlas</b><br>Spin the globe, pinch or use + / − to zoom, and tap any country, or search for one at the top.
      Its name, capital, flag and shape show up here.<br><br>Small island countries are drawn as little circles.</div>`;
  }
  footer([{ label: 'Start quiz', primary: true, on: openMenu }]);
}

/* ---------------- quiz ---------------- */
// Five things to learn. A quiz shows one of them and asks for another one.
const KINDS = ['name', 'flag', 'shape', 'loc', 'cap'];
const LBL = { name: 'Name', flag: 'Flag', shape: 'Shape', loc: 'Location', cap: 'Capital' };
const ASK = { name: 'Which country is it?', flag: 'Which is its flag?', shape: 'Which is its shape?',
  loc: 'Find it on the globe.', cap: 'What is its capital?' };
// What can still be asked when `show` is on screen. Shape is never asked while the globe
// shows the location, because the highlighted country already shows its shape.
const askable = show => KINDS.filter(k => !show.includes(k) && !(k === 'shape' && show.includes('loc')));
const list = ks => KINDS.filter(k => ks.includes(k)).map(k => LBL[k]);
const FLAG_TWINS = [['TD', 'RO'], ['MC', 'ID']];   // near-identical flags never appear together
const REGIONS = ['World', 'Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
const LENS = [10, 20, 'All'];
const cfg = Object.assign({ show: ['flag'], ask: ['name'], region: 'World', len: 10 }, store.get('cfg3', {}));
function fixCfg() {
  cfg.show = KINDS.filter(k => cfg.show.includes(k));
  if (!cfg.show.length || !askable(cfg.show).length) cfg.show = ['flag'];
  const can = askable(cfg.show);
  cfg.ask = can.filter(k => cfg.ask.includes(k));
  if (!cfg.ask.length) cfg.ask = can.slice();
}
fixCfg();
const quiz = { items: [], i: 0, score: 0, missed: [], answered: false, globe: false, a: 'name', opts: [] };

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Tuvalu has no outline in the map data, so it sits out quizzes that show or ask for a shape
const shapeOnly = () => cfg.show.includes('shape') || (cfg.ask.length === 1 && cfg.ask[0] === 'shape');
const poolFor = r => QUIZ.filter(c => (r === 'World' || c.r === r) && !(F[c.id].point && shapeOnly()));

function openMenu() {
  if (mode === 'browse') history.pushState({ s: 'menu' }, '');
  mode = 'menu'; selected = null; dirty = true;
  syncSearch();
  renderMenu();
}
function renderMenu() {
  const n = poolFor(cfg.region).length;
  const chip = (attr, k, on, dis, text) =>
    `<button class="choice${on ? ' on' : ''}" data-${attr}="${k}"${dis ? ' disabled' : ''}>${text}</button>`;
  const can = askable(cfg.show);
  pane.innerHTML = `
    <div class="sec"><h3>Show me</h3><div class="choices">${KINDS.map(k => {
      const on = cfg.show.includes(k);
      // can't show all five, and can't leave nothing to ask
      const dis = !on && !askable([...cfg.show, k]).length;
      return chip('show', k, on, dis, LBL[k]);
    }).join('')}</div></div>
    <div class="sec"><h3>Ask me</h3><div class="choices">${KINDS.map(k =>
      chip('ask', k, can.includes(k) && cfg.ask.includes(k), !can.includes(k), LBL[k])).join('')}</div></div>
    <div class="sec"><h3>Region</h3><div class="choices">${REGIONS.map(r => chip('region', r, cfg.region === r, false, r)).join('')}</div></div>
    <div class="sec"><h3>Questions</h3><div class="choices">${LENS.map(l =>
      chip('len', l, cfg.len === l, false, l === 'All' ? 'All ' + n : l)).join('')}</div></div>`;
  pane.querySelectorAll('[data-show]').forEach(b => b.onclick = () => {
    const k = b.dataset.show, on = cfg.show.includes(k);
    if (on && cfg.show.length === 1) return;          // keep at least one thing to look at
    const before = askable(cfg.show);
    cfg.show = on ? cfg.show.filter(x => x !== k) : [...cfg.show, k];
    // newly askable items (e.g. the one just deselected) join the questions
    askable(cfg.show).forEach(x => { if (!before.includes(x) && !cfg.ask.includes(x)) cfg.ask.push(x); });
    saveCfg();
  });
  pane.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => {
    const k = b.dataset.ask, on = cfg.ask.includes(k);
    if (on && cfg.ask.filter(x => askable(cfg.show).includes(x)).length === 1) return;   // keep at least one
    cfg.ask = on ? cfg.ask.filter(x => x !== k) : [...cfg.ask, k];
    saveCfg();
  });
  pane.querySelectorAll('[data-region]').forEach(b => b.onclick = () => { cfg.region = b.dataset.region; saveCfg(); });
  pane.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { cfg.len = b.dataset.len === 'All' ? 'All' : +b.dataset.len; saveCfg(); });
  footer([{ label: 'Back', on: () => history.back() }, { label: 'Start', primary: true, on: startQuiz }]);
}
function saveCfg() { fixCfg(); store.set('cfg3', cfg); const top = pane.scrollTop; renderMenu(); pane.scrollTop = top; }

function startQuiz() {
  history.replaceState({ s: 'quiz' }, '');
  const pool = shuffle(poolFor(cfg.region).slice());
  quiz.items = cfg.len === 'All' ? pool : pool.slice(0, cfg.len);
  quiz.i = 0; quiz.score = 0; quiz.missed = [];
  mode = 'quiz'; setQuizLook(true);
  ask();
}

// Three wrong answers: mostly neighbours (same subregion), then same region, then anywhere.
function others(c, a) {
  const val = x => a === 'cap' ? x.cap[0] : a === 'name' ? x.n : x.id;
  const bad = new Set(a === 'cap' ? c.cap : [val(c)]);
  const twins = id => (FLAG_TWINS.find(p => p.includes(id)) || []);
  if (a === 'flag') twins(c.id).forEach(id => bad.add(id));
  const pool = QUIZ.filter(x => x.id !== c.id && val(x) && !(a === 'shape' && F[x.id].point));
  const tiers = [shuffle(pool.filter(x => x.s === c.s)).slice(0, 2),
    shuffle(pool.filter(x => x.r === c.r && x.s !== c.s)), shuffle(pool.filter(x => x.r !== c.r))];
  const out = [];
  for (const t of tiers) for (const x of t) {
    if (out.length >= 3) break;
    if (bad.has(val(x))) continue;
    bad.add(val(x)); if (a === 'flag') twins(x.id).forEach(id => bad.add(id));
    out.push(x);
  }
  return out;
}

const isVisual = a => a === 'flag' || a === 'shape' || a === 'loc';
function optHTML(x, a, i) {
  if (a === 'name') return `<button class="opt" data-i="${i}">${esc(x.n)}</button>`;
  if (a === 'cap') return `<button class="opt" data-i="${i}">${esc(x.cap[0])}</button>`;
  if (a === 'flag') return `<button class="opt vis" data-i="${i}" aria-label="Flag ${i + 1}"><img src="${flagSrc(x.id)}" alt=""></button>`;
  return `<button class="opt vis" data-i="${i}" aria-label="Option ${i + 1}"><canvas class="${a === 'shape' ? 'oshape' : 'oloc'}"></canvas></button>`;
}
function promptHTML(c, show) {
  const has = k => show.includes(k);
  let h = '';
  if (has('flag') && has('name')) h += `<div class="qinline"><img src="${flagSrc(c.id)}" alt=""><b>${esc(c.n)}</b></div>`;
  else if (has('flag')) h += `<img class="qflag" src="${flagSrc(c.id)}" alt="">`;
  else if (has('name')) h += `<div class="qbig">${esc(c.n)}</div>`;
  if (has('cap')) h += `<div class="lbl">Capital</div><div class="qbig">${capText(c)}</div>`;
  if (has('shape')) h += `<canvas class="qshape${show.length > 1 ? ' sm' : ''}"></canvas>`;
  return h;
}

function ask() {
  const c = quiz.items[quiz.i];
  const show = cfg.show;
  const choices = cfg.ask.filter(k => !(F[c.id].point && k === 'shape'));
  const a = choices[Math.floor(Math.random() * choices.length)];
  quiz.a = a; quiz.answered = false;
  const onGlobe = a === 'loc';      // answer by tapping the country on the big globe, then Confirm
  quiz.opts = onGlobe ? [] : shuffle([c, ...others(c, a)]);
  quiz.globe = show.includes('loc');
  wrongSel = null;
  if (quiz.globe) {
    selected = c.id; dirty = true;
    animateTo(c.id, zoomFor(c.id));
  } else {                         // keep the globe neutral so it doesn't give the answer away
    selected = null; dirty = true; spin = true;
    if (view.zoom > 1.5) zoomBy(1 / view.zoom);
  }
  const n = quiz.items.length;
  pane.innerHTML = `
    <div class="bar"><i style="width:${(quiz.i / n) * 100}%"></i></div>
    ${promptHTML(c, show)}
    <p class="q">${ASK[a]}</p>
    ${onGlobe ? '' : `<div class="opts">${quiz.opts.map((x, i) => optHTML(x, a, i)).join('')}</div>`}`;
  pane.scrollTop = 0;
  const qs = pane.querySelector('.qshape'); if (qs) drawShape(qs, c.id);
  pane.querySelectorAll('.opt').forEach(b => {
    const x = quiz.opts[+b.dataset.i];
    const cs = b.querySelector('canvas.oshape'), cl = b.querySelector('canvas.oloc');
    if (cs) drawShape(cs, x.id);
    if (cl) drawLocation(cl, x.id, true);
    b.onclick = () => answer(+b.dataset.i);
  });
  footer([{ label: 'Quit', on: () => history.back() },
    { label: onGlobe ? 'Confirm' : 'Next', primary: true, disabled: true, id: 'next', on: () => quiz.answered ? next() : confirmPick() }]);
}

function confirmPick() {
  if (mode !== 'quiz' || quiz.a !== 'loc' || quiz.answered || !selected) return;
  answer(C[selected]);
}

function answer(i) {
  if (quiz.answered) return;
  quiz.answered = true;
  const c = quiz.items[quiz.i], a = quiz.a, x = typeof i === 'number' ? quiz.opts[i] : i;
  const ok = x.id === c.id;
  if (ok) quiz.score++; else quiz.missed.push(c.id);
  ok ? good() : wrong();
  pane.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (quiz.opts[j].id === c.id) b.classList.add('ok');
    else if (j === i) b.classList.add('bad');
  });
  const picked = a === 'name' || a === 'loc' ? esc(x.n) : a === 'cap' ? esc(x.cap[0]) : `the ${LBL[a].toLowerCase()} of ${esc(x.n)}`;
  if (a === 'loc' && !ok) wrongSel = x.id;    // the wrong pick stays on the globe in red
  // Recap: name, capital, flag, shape, location (also on the big globe)
  selected = c.id; dirty = true;
  animateTo(c.id, zoomFor(c.id));
  setTimeout(() => {
    if (!quiz.answered || quiz.items[quiz.i] !== c || mode !== 'quiz') return;
    const n = quiz.items.length;
    pane.innerHTML = `
      <div class="bar"><i style="width:${((quiz.i + 1) / n) * 100}%"></i></div>
      <p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Correct' : '✗ Not quite'}${ok ? '' : ` <small>you picked ${picked}</small>`}</p>
      ${cardHTML(c.id, false)}`;
    pane.scrollTop = 0;
    fillCard(pane, c.id);
  }, a === 'loc' ? 250 : isVisual(a) ? 1000 : 700);
  const nb = document.getElementById('next');
  nb.disabled = false;
  nb.textContent = quiz.i + 1 >= quiz.items.length ? 'See results' : 'Next';
}

function next() {
  if (!quiz.answered) return;
  quiz.i++;
  if (quiz.i < quiz.items.length) ask(); else results();
}

function results() {
  mode = 'end'; selected = null; wrongSel = null; dirty = true; spin = true;
  if (view.zoom > 1.5) zoomBy(1 / view.zoom);
  const n = quiz.items.length, pct = Math.round(100 * quiz.score / n);
  const tkey = cfg.show.join('+') + '>' + cfg.ask.join('+');
  const bkey = `best:${tkey}:${cfg.region}:${cfg.len}`;
  const best = Math.max(store.get(bkey, 0), pct); store.set(bkey, best);
  pane.innerHTML = `
    <div class="lbl">${list(cfg.show).join(' + ')} → ${list(cfg.ask).join(' / ')} · ${cfg.region}</div>
    <p class="big">${quiz.score} / ${n}</p>
    <div class="hint">${pct}% correct · best ${best}%</div>
    ${quiz.missed.length ? `<div class="lbl" style="margin-top:12px">To review (tap to see on the globe)</div>
    <ul class="missed">${quiz.missed.map(id => `<li data-id="${id}"><img src="${flagSrc(id)}" alt=""><div><b>${esc(C[id].n)}</b><small>${capText(C[id])}</small></div></li>`).join('')}</ul>`
    : '<div class="hint">Perfect round. Nothing to review.</div>'}`;
  pane.scrollTop = 0;
  pane.querySelectorAll('.missed li').forEach(li => li.onclick = () => {
    pane.querySelectorAll('.missed li').forEach(y => y.classList.toggle('on', y === li));
    selected = li.dataset.id; dirty = true; animateTo(selected, zoomFor(selected));
  });
  footer([{ label: 'Globe', on: () => history.back() }, { label: 'Play again', primary: true, on: startQuiz }]);
}

function setQuizLook(on) { document.body.classList.toggle('quizzing', on); }
function toBrowse() {
  setQuizLook(false); wrongSel = null;
  mode = 'browse'; selected = null; dirty = true; spin = true; anim = null;
  if (view.zoom > 1.5) zoomBy(1 / view.zoom);
  renderBrowse();
}
window.addEventListener('popstate', () => { if (mode !== 'browse') toBrowse(); });

/* ---------------- sound + vibration ---------------- */
let muted = store.get('muted', false), actx = null;
const muteBtn = document.getElementById('mute');
function renderMute() {
  muteBtn.innerHTML = muted
    ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
}
muteBtn.onclick = () => { muted = !muted; store.set('muted', muted); renderMute(); if (!muted) blip(); };
renderMute();
function audioUnlock() {
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {}
}
document.addEventListener('pointerdown', audioUnlock, { once: true });
function tones(fs, type, dur, vol) {
  if (muted) return;
  try {
    audioUnlock(); const t0 = actx.currentTime;
    fs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * dur;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    });
  } catch {}
}
const buzz = ms => { if (!muted) navigator.vibrate?.(ms); };
const blip = () => tones([880], 'sine', 0.07, 0.08);
const good = () => { tones([660, 990], 'sine', 0.11, 0.15); buzz(15); };
const wrong = () => { tones([220, 165], 'triangle', 0.16, 0.18); buzz([40, 40, 40]); };

/* ---------------- start ---------------- */
history.replaceState({ s: 'browse' }, '');
renderBrowse();
