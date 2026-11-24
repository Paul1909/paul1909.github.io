'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'wire-regions';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

/* ---------------- data ---------------- */
const META = window.WR_META, GEO = window.WR_GEO, FX = window.WR_FLAGEXT || {};
const ORDER = ['CH', 'IT', 'NL', 'LT', 'US'];
const WATER = '#d4ebfa', Y = '#ffd400', NEIGH = '#f0f0f2';

// Path2D from rings of integer coordinates (x10)
function toPath(rings, p = new Path2D()) {
  for (const r of rings) {
    p.moveTo(r[0] / 10, r[1] / 10);
    for (let i = 2; i < r.length; i += 2) p.lineTo(r[i] / 10, r[i + 1] / 10);
    p.closePath();
  }
  return p;
}
function ringInfo(rings) {           // bbox, area, centre of the biggest ring
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, best = null, bestA = 0, area = 0;
  for (const r of rings) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i += 2) {
      const x = r[i] / 10, y = r[i + 1] / 10, j = (i + 2) % r.length, xn = r[j] / 10, yn = r[j + 1] / 10;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const k = x * yn - xn * y; a += k; cx += (x + xn) * k; cy += (y + yn) * k;
    }
    a /= 2; area += a;
    if (Math.abs(a) > bestA && a) { bestA = Math.abs(a); best = [cx / (6 * a), cy / (6 * a)]; }
  }
  return { bb: [x0, y0, x1, y1], area: Math.abs(area), c: best || [(x0 + x1) / 2, (y0 + y1) / 2] };
}

// Prepared countries (outlines are turned into paths only once)
const PREP = {};
function prepCountry(code) {
  if (PREP[code]) return PREP[code];
  const M = META[code], G = GEO[code];
  const C = {}, F = {};
  M.r.forEach(([id, n, cap, g, loc, alt]) => {
    C[id] = { id, n, cap, g: g || '', loc: loc || '', alt: alt ? [alt] : [] };
    const rings = G.r[id];
    F[id] = Object.assign({ rings, path: toPath(rings), adj: G.adj[id] || [] }, ringInfo(rings));
  });
  const land = new Path2D(); Object.values(F).forEach(f => land.addPath(f.path));
  const P = { code, M, C, F, IDS: Object.keys(F), QUIZ: M.r.map(r => C[r[0]]),
    land, neigh: toPath(G.n), frames: G.frames.map(f => f.map(v => v / 10)), MW: G.w / 10, MH: G.h / 10 };
  PREP[code] = P;
  return P;
}

let P = null, C = {}, F = {}, M = null, QUIZ = [], IDS = [];
function useCountry(code) {
  P = prepCountry(code); C = P.C; F = P.F; M = P.M; QUIZ = P.QUIZ; IDS = P.IDS;
}

/* ---------------- map ---------------- */
const cv = document.getElementById('map');
const ctx = cv.getContext('2d');
const pctx = document.createElement('canvas').getContext('2d');   // for hit tests, identity transform
const view = { cx: 0, cy: 0, z: 1 };
let W = 0, H = 0, DPR = 1, dirty = true;
let inertia = null, anim = null;
let selected = null, wrongSel = null;
let mode = 'intro';                 // intro | browse | menu | quiz | end
const ZMAX = 16;

function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  clampView(); dirty = true;
}
new ResizeObserver(resize).observe(cv);

const s0 = () => P ? Math.min(W / P.MW, H / P.MH) * 0.96 : 1;
const scale = () => s0() * view.z;
function clampView(v = view) {
  if (!P || !W) return v;
  v.z = Math.max(1, Math.min(ZMAX, v.z));
  const s = s0() * v.z;
  // the map may slide a little past its edge, so a region at the border can still be centred
  const fit = (c, size, screen) => {
    if (size * s <= screen) return size / 2;
    const slack = Math.min(0.3 * screen, size * s - screen) / s;
    return Math.max(screen / (2 * s) - slack, Math.min(size - screen / (2 * s) + slack, c));
  };
  v.cx = fit(v.cx, P.MW, W); v.cy = fit(v.cy, P.MH, H);
  return v;
}
const toMap = (x, y) => { const s = scale(); return [(x - W / 2) / s + view.cx, (y - H / 2) / s + view.cy]; };
const toScreen = (mx, my) => { const s = scale(); return [(mx - view.cx) * s + W / 2, (my - view.cy) * s + H / 2]; };

function draw() {
  if (!W || !P) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);                          // white page, the map is a framed sheet on it
  const s = scale();
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - view.cx * s), DPR * (H / 2 - view.cy * s));
  ctx.lineJoin = 'round';
  ctx.fillStyle = WATER; ctx.fillRect(0, 0, P.MW, P.MH);
  ctx.fillStyle = NEIGH; ctx.fill(P.neigh, 'evenodd');
  ctx.strokeStyle = '#c8c8cc'; ctx.lineWidth = 0.7 / s; ctx.stroke(P.neigh);
  for (const [x, y, w, h] of P.frames) {                // insets (Alaska, Hawaii)
    ctx.fillStyle = WATER; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c2c2c6'; ctx.lineWidth = 1.2 / s; ctx.strokeRect(x, y, w, h);
  }
  ctx.fillStyle = '#fff'; ctx.fill(P.land, 'evenodd');
  if (wrongSel && F[wrongSel]) { ctx.fillStyle = '#f4a6a9'; ctx.fill(F[wrongSel].path, 'evenodd'); }
  if (selected && F[selected]) { ctx.fillStyle = Y; ctx.fill(F[selected].path, 'evenodd'); }
  ctx.strokeStyle = '#8e8e92'; ctx.lineWidth = 0.9 / s; ctx.stroke(P.land);
  ctx.strokeStyle = '#c2c2c6'; ctx.lineWidth = 1.2 / s; ctx.strokeRect(0, 0, P.MW, P.MH);
  // back to screen pixels for markers
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // very small regions get a little circle so they can be seen and tapped
  ctx.beginPath();
  for (const id of IDS) {
    const f = F[id]; if (size(id) * s > 5) continue;
    const [x, y] = toScreen(f.c[0], f.c[1]);
    ctx.moveTo(x + 2.5, y); ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
  }
  ctx.strokeStyle = '#8e8e92'; ctx.lineWidth = 1; ctx.stroke();
  for (const [id, col] of [[wrongSel, '#e0464c'], [selected, Y]]) {    // ring around a small highlighted region
    if (!id || !F[id] || size(id) * s >= 12) continue;
    const [x, y] = toScreen(F[id].c[0], F[id].c[1]);
    ctx.beginPath(); ctx.arc(x, y, 13, 0, 2 * Math.PI); ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
  }
}
const size = id => { const b = F[id].bb; return Math.max(b[2] - b[0], b[3] - b[1]); };

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function animateView(target, dur = 900) {
  const from = { ...view }, to = clampView({ ...target });
  inertia = null;
  anim = { t0: performance.now(), dur, step(e) {
    view.z = from.z * Math.pow(to.z / from.z, e);
    view.cx = from.cx + (to.cx - from.cx) * e; view.cy = from.cy + (to.cy - from.cy) * e;
  } };
}
function zoomFor(id, frac = 0.3, cap = 6) {
  const b = F[id].bb, w = Math.max(1, b[2] - b[0]), h = Math.max(1, b[3] - b[1]);
  return Math.max(1, Math.min(cap, Math.min(W * frac / (w * s0()), H * frac / (h * s0()))));
}
function animateTo(id, z, dur) {
  const b = F[id].bb;
  animateView({ cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, z: z == null ? zoomFor(id) : z }, dur);
}
const resetView = (dur = 700) => P && animateView({ cx: P.MW / 2, cy: P.MH / 2, z: 1 }, dur);
function zoomAt(f, px = W / 2, py = H / 2) {          // zoom keeping the point under (px, py) in place
  const [mx, my] = toMap(px, py);
  view.z = Math.max(1, Math.min(ZMAX, view.z * f));
  const s = scale();
  view.cx = mx - (px - W / 2) / s; view.cy = my - (py - H / 2) / s;
  clampView(); dirty = true;
}
function zoomBy(f) {
  const z0 = view.z, z1 = Math.max(1, Math.min(ZMAX, z0 * f));
  const t = clampView({ cx: view.cx, cy: view.cy, z: z1 });
  animateView(t, 260);
}

let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0); lastT = t;
  if (anim) {
    const p = Math.min(1, (t - anim.t0) / anim.dur); anim.step(ease(p)); clampView(); dirty = true;
    if (p >= 1) anim = null;
  } else if (inertia && !pointers.size) {
    view.cx += inertia.vx * dt; view.cy += inertia.vy * dt; clampView();
    const k = Math.exp(-dt * 4); inertia.vx *= k; inertia.vy *= k; dirty = true;
    if (Math.hypot(inertia.vx, inertia.vy) * scale() < 8) inertia = null;
  }
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- touch / mouse ---------------- */
const pointers = new Map();
let gesture = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  audioUnlock();
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  inertia = null; anim = null;
  if (pointers.size === 1) gesture = { tap: true, x0: e.offsetX, y0: e.offsetY, t0: performance.now(), vx: 0, vy: 0, lt: performance.now() };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gesture = { tap: false, pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, m: toMap(mx, my) };
  }
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
  p.x = e.offsetX; p.y = e.offsetY;
  if (gesture.pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.z = Math.max(1, Math.min(ZMAX, gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0));
    const s = scale();
    view.cx = gesture.m[0] - (mx - W / 2) / s; view.cy = gesture.m[1] - (my - H / 2) / s;
    clampView(); dirty = true;
  } else if (!gesture.pinch) {
    if (Math.hypot(e.offsetX - gesture.x0, e.offsetY - gesture.y0) > 8) gesture.tap = false;
    const s = scale();
    view.cx -= dx / s; view.cy -= dy / s; clampView();
    const now = performance.now(), dtm = Math.max(1, now - gesture.lt) / 1000;
    gesture.vx = 0.7 * gesture.vx + 0.3 * (-dx / s / dtm); gesture.vy = 0.7 * gesture.vy + 0.3 * (-dy / s / dtm);
    gesture.lt = now; dirty = true;
  }
});
function pointerEnd(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.pinch) { if (!pointers.size) gesture = null; return; }
  if (gesture.tap && performance.now() - gesture.t0 < 500) onTap(e.offsetX, e.offsetY);
  else if (performance.now() - gesture.lt < 80 && Math.hypot(gesture.vx, gesture.vy) * scale() > 60) inertia = { vx: gesture.vx, vy: gesture.vy };
  gesture = null;
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('wheel', e => {
  e.preventDefault(); anim = null;
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
}, { passive: false });
document.getElementById('zin').onclick = () => zoomBy(1.7);
document.getElementById('zout').onclick = () => zoomBy(1 / 1.7);

function pick(x, y) {
  const s = scale(), [mx, my] = toMap(x, y);
  let hit = null;
  for (const id of IDS) {
    const f = F[id], b = f.bb;
    if (mx < b[0] || mx > b[2] || my < b[1] || my > b[3]) continue;
    if (pctx.isPointInPath(f.path, mx, my, 'evenodd') && (!hit || f.area < F[hit].area)) hit = id;
  }
  // small regions: nearest one within reach of the finger
  let near = null, nd = 1e9;
  for (const id of IDS) {
    if (size(id) * s > 24) continue;
    const [px, py] = toScreen(F[id].c[0], F[id].c[1]), d = Math.hypot(px - x, py - y);
    if (d < nd) { nd = d; near = id; }
  }
  if (near && near !== hit && (!hit && nd < 22 || nd < 10 && size(near) * s < 10)) return near;
  return hit;
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

/* ---------------- small canvases: shape + country outline ---------------- */
function prepCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = r.width || 100, h = r.height || 84;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return [g, w, h, dpr];
}
function drawShape(c, id) {
  const [g, w, h, dpr] = prepCanvas(c), f = F[id], b = f.bb, pad = 6;
  const k = Math.min((w - 2 * pad) / (b[2] - b[0] || 1), (h - 2 * pad) / (b[3] - b[1] || 1));
  const ox = (w - (b[2] - b[0]) * k) / 2 - b[0] * k, oy = (h - (b[3] - b[1]) * k) / 2 - b[1] * k;
  g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
  g.fillStyle = Y; g.fill(f.path, 'evenodd');
  g.lineJoin = 'round'; g.strokeStyle = '#6e6e72'; g.lineWidth = 1 / k; g.stroke(f.path);
  // islands smaller than a couple of pixels get a dot, so they stay visible
  if (f.rings.length > 1) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.beginPath();
    for (const r of f.rings) {
      const ri = ringInfo([r]), [x0, y0, x1, y1] = ri.bb;
      if ((x1 - x0) * k >= 3 || (y1 - y0) * k >= 3) continue;
      const qx = ox + (x0 + x1) / 2 * k, qy = oy + (y0 + y1) / 2 * k;
      g.moveTo(qx + 2, qy); g.arc(qx, qy, 2, 0, 2 * Math.PI);
    }
    g.fillStyle = Y; g.fill(); g.lineWidth = 0.8; g.stroke();
  }
}
// Whole country in a small box (intro list). Water only behind the country, no neighbours.
function drawCountry(c, Pc) {
  const [g, w, h, dpr] = prepCanvas(c);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  Object.values(Pc.F).forEach(f => { x0 = Math.min(x0, f.bb[0]); y0 = Math.min(y0, f.bb[1]); x1 = Math.max(x1, f.bb[2]); y1 = Math.max(y1, f.bb[3]); });
  const pad = 3, k = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k, oy = (h - (y1 - y0) * k) / 2 - y0 * k;
  g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
  g.lineJoin = 'round';
  g.fillStyle = '#fff'; g.fill(Pc.land, 'evenodd');
  g.strokeStyle = '#77777b'; g.lineWidth = 0.8 / k; g.stroke(Pc.land);
}

/* ---------------- ui helpers ---------------- */
const pane = document.getElementById('pane');
const foot = document.getElementById('foot');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const flagSrc = id => { const k = P.code.toLowerCase() + '-' + id.toLowerCase(); return 'flags/' + k + '.' + (FX[k] || 'svg'); };
const nationalFlag = code => 'flags/' + code.toLowerCase() + '.svg';

function cardHTML(id, meta = true) {
  const c = C[id];
  return `<div class="name">${esc(c.n)}</div>
    ${c.loc ? `<div class="also loc">${esc(c.loc)}</div>` : ''}
    <div class="cap"><span>${esc(M.L.cap)}</span>${esc(c.cap)}</div>
    <div class="thumbs">
      <figure><div class="box"><img src="${flagSrc(id)}" alt=""></div><figcaption>${esc(M.L.flag)}</figcaption></figure>
      <figure><div class="box"><canvas class="shape"></canvas></div><figcaption>${esc(M.L.shape)}</figcaption></figure>
    </div>
    ${meta ? `<div class="meta">${esc(M.unit)} · ${esc(M.name)}${c.g ? ' · ' + esc(c.g) : ''}</div>` : ''}`;
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

/* ---------------- intro: pick a country ---------------- */
const introEl = document.getElementById('intro'), ctrysEl = document.getElementById('ctrys');
function renderIntro() {
  const last = store.get('country', null);
  ctrysEl.innerHTML = ORDER.map(code => `<button class="ctry${code === last ? ' last' : ''}" data-c="${code}">
      <img src="${nationalFlag(code)}" alt=""><div><b>${esc(META[code].name)}</b><span>${esc(META[code].count)}</span></div><canvas></canvas></button>`).join('');
  ctrysEl.querySelectorAll('.ctry').forEach(b => drawCountry(b.querySelector('canvas'), prepCountry(b.dataset.c)));
}
ctrysEl.addEventListener('click', e => {
  const b = e.target.closest('.ctry'); if (!b) return;
  audioUnlock(); blip();
  enterCountry(b.dataset.c);
});
function enterCountry(code) {
  useCountry(code); store.set('country', code);
  document.getElementById('ctryBtn').innerHTML = `<img src="${nationalFlag(code)}" alt="">`;
  qIn.placeholder = M.search; qIn.setAttribute('aria-label', M.search);
  document.getElementById('dbbtn').setAttribute('aria-label', M.list);
  INDEX = QUIZ.map(c => ({ c, n: norm(c.n), caps: [norm(c.cap)], alt: c.alt.concat(c.loc ? [c.loc] : []).map(norm) }));
  dbList.innerHTML = ''; dbGroups = (store.get('dbGroups', {})[code]) || [];
  introEl.hidden = true;
  history.pushState({ s: 'map' }, '');
  selected = null; wrongSel = null; anim = null; inertia = null;
  view.cx = P.MW / 2; view.cy = P.MH / 2; view.z = 1;
  mode = 'browse';
  resize();
  renderBrowse();
}
document.getElementById('ctryBtn').onclick = () => { if (mode === 'browse') history.back(); };
function toIntro() {
  setQuizLook(false); document.body.classList.remove('menuing');
  mode = 'intro'; closeSearch(true);
  introEl.hidden = false;
  renderIntro();
}

/* ---------------- search ---------------- */
// Matches names, capitals and other names, ignoring accents and case.
const searchEl = document.getElementById('search'), qIn = document.getElementById('q');
const resEl = document.getElementById('results'), qClear = document.getElementById('qclear');
const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let INDEX = [];
function scoreText(t, q, base) {               // lower is better, Infinity = no match
  if (t === q) return base;
  if (t.startsWith(q)) return base + 1;
  if ((' ' + t).includes(' ' + q)) return base + 2;
  if (q.length >= 3 && t.includes(q)) return base + 3;
  return Infinity;
}
function search(raw) {
  const q = norm(raw); if (!q) return [];
  const out = [];
  for (const e of INDEX) {
    let best = scoreText(e.n, q, 0);
    for (const k of e.caps) best = Math.min(best, scoreText(k, q, 0.5));
    for (const k of e.alt) best = Math.min(best, scoreText(k, q, 4));
    if (best < Infinity) out.push({ c: e.c, best });
  }
  out.sort((a, b) => a.best - b.best || a.c.n.localeCompare(b.c.n));
  return out.slice(0, 8);
}
let hits = [];
function showResults() {
  const v = qIn.value;
  qClear.hidden = !v;
  hits = search(v);
  if (!v.trim()) { resEl.hidden = true; resEl.innerHTML = ''; return; }
  resEl.innerHTML = hits.length ? hits.map((h, i) => `<li data-id="${h.c.id}"${i ? '' : ' class="on"'}>
      <img src="${flagSrc(h.c.id)}" alt=""><div><b>${esc(h.c.n)}</b><small>${esc(M.L.cap)}: ${esc(h.c.cap)}</small></div></li>`).join('')
    : '<li class="none">—</li>';
  fitResults();
  resEl.hidden = false;
}
function fitResults() {                        // keep the list above the phone keyboard
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
  select(id);
  animateTo(id, zoomFor(id, 0.4, 8));
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
function syncSearch() {
  const on = mode === 'browse';
  searchEl.hidden = document.getElementById('dbbtn').hidden = document.getElementById('ctryBtn').hidden = !on;
  if (!on) closeSearch(true);
}

/* ---------------- browse ---------------- */
function renderBrowse() {
  syncSearch();
  if (selected && C[selected]) {
    pane.innerHTML = cardHTML(selected);
    fillCard(pane, selected);
  } else {
    pane.innerHTML = '';
  }
  footer([{ label: 'Start quiz', primary: true, on: openMenu }]);
}

/* ---------------- quiz ---------------- */
// Five things to learn. A quiz shows some of them and asks for another one.
const KINDS = ['name', 'flag', 'shape', 'loc', 'cap'];
const LBL = k => M.L[k];
// Shape is never asked while the map shows the location: the highlighted region already shows it.
const askable = show => KINDS.filter(k => !show.includes(k) && !(k === 'shape' && show.includes('loc')));
const list = ks => KINDS.filter(k => ks.includes(k)).map(LBL);
const cfg = Object.assign({ show: ['flag'], ask: ['name'], len: 10, groups: {} }, store.get('cfg', {}));
if (!cfg.groups || typeof cfg.groups !== 'object') cfg.groups = {};
function fixCfg() {
  cfg.show = KINDS.filter(k => cfg.show.includes(k));
  if (!cfg.show.length || !askable(cfg.show).length) cfg.show = ['flag'];
  const can = askable(cfg.show);
  cfg.ask = can.filter(k => cfg.ask.includes(k));
  if (!cfg.ask.length) cfg.ask = can.slice();
}
fixCfg();
const groupsOn = () => (cfg.groups[P.code] || []).filter(g => M.groups.includes(g));
const groupLabel = () => groupsOn().length ? M.groups.filter(g => groupsOn().includes(g)).join(' + ') : 'All';
const quiz = { items: [], i: 0, score: 0, missed: [], answered: false, globe: false, a: 'name', opts: [] };

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const poolFor = () => QUIZ.filter(c => !groupsOn().length || groupsOn().includes(c.g));
const lensFor = n => [...[10, 20].filter(l => l < n), 'All'];

function openMenu() {
  if (mode === 'browse') history.pushState({ s: 'menu' }, '');
  mode = 'menu'; selected = null; dirty = true;
  document.body.classList.add('menuing');     // phones hide the map on this page
  syncSearch();
  renderMenu();
}
function renderMenu() {
  const n = poolFor().length;
  const chip = (attr, k, on, dis, text) =>
    `<button class="choice${on ? ' on' : ''}" data-${attr}="${esc(k)}"${dis ? ' disabled' : ''}>${esc(text)}</button>`;
  const can = askable(cfg.show);
  const lens = lensFor(n), len = lens.includes(cfg.len) ? cfg.len : 'All';
  pane.innerHTML = `
    <div class="sec"><h3>Show me</h3><div class="choices">${KINDS.map(k => {
      const on = cfg.show.includes(k);
      const dis = !on && !askable([...cfg.show, k]).length;    // can't show all five
      return chip('show', k, on, dis, LBL(k));
    }).join('')}</div></div>
    <div class="sec"><h3>Ask me</h3><div class="choices">${KINDS.map(k =>
      chip('ask', k, can.includes(k) && cfg.ask.includes(k), !can.includes(k), LBL(k))).join('')}</div></div>
    ${M.groups.length ? `<div class="sec"><h3>Area</h3><div class="choices">${['All', ...M.groups].map(g =>
      chip('group', g, g === 'All' ? !groupsOn().length : groupsOn().includes(g), false, g === 'All' ? M.name : g)).join('')}</div></div>` : ''}
    <div class="sec"><h3>Questions</h3><div class="choices">${lens.map(l =>
      chip('len', l, len === l, false, l === 'All' ? 'All ' + n : l)).join('')}</div></div>`;
  pane.querySelectorAll('[data-show]').forEach(b => b.onclick = () => {
    const k = b.dataset.show, on = cfg.show.includes(k);
    if (on && cfg.show.length === 1) return;          // keep at least one thing to look at
    const before = askable(cfg.show);
    cfg.show = on ? cfg.show.filter(x => x !== k) : [...cfg.show, k];
    askable(cfg.show).forEach(x => { if (!before.includes(x) && !cfg.ask.includes(x)) cfg.ask.push(x); });
    saveCfg();
  });
  pane.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => {
    const k = b.dataset.ask, on = cfg.ask.includes(k);
    if (on && cfg.ask.filter(x => askable(cfg.show).includes(x)).length === 1) return;   // keep at least one
    cfg.ask = on ? cfg.ask.filter(x => x !== k) : [...cfg.ask, k];
    saveCfg();
  });
  pane.querySelectorAll('[data-group]').forEach(b => b.onclick = () => {
    const g = b.dataset.group; let gs = groupsOn();
    if (g === 'All') gs = [];
    else gs = gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g];
    if (gs.length === M.groups.length) gs = [];
    cfg.groups[P.code] = gs;
    saveCfg();
  });
  pane.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { cfg.len = b.dataset.len === 'All' ? 'All' : +b.dataset.len; saveCfg(); });
  footer([{ label: 'Back', on: () => history.back() }, { label: 'Start', primary: true, on: startQuiz }]);
}
function saveCfg() { fixCfg(); store.set('cfg', cfg); const top = pane.scrollTop; renderMenu(); pane.scrollTop = top; }

function startQuiz() {
  history.replaceState({ s: 'quiz' }, '');
  const pool = shuffle(poolFor().slice());
  const len = lensFor(pool.length).includes(cfg.len) ? cfg.len : 'All';
  quiz.items = len === 'All' ? pool : pool.slice(0, len);
  quiz.i = 0; quiz.score = 0; quiz.missed = [];
  mode = 'quiz'; setQuizLook(true); document.body.classList.remove('menuing');
  ask();
}

// Three wrong answers: mostly neighbours on the map, then the same area, then anywhere.
function others(c, a) {
  const val = x => a === 'cap' ? x.cap : a === 'name' ? x.n : x.id;
  const bad = new Set([val(c)]);
  const adj = F[c.id].adj;
  const pool = QUIZ.filter(x => x.id !== c.id);
  const tiers = [shuffle(pool.filter(x => adj.includes(x.id))).slice(0, 2),
    shuffle(pool.filter(x => !adj.includes(x.id) && c.g && x.g === c.g)), shuffle(pool.filter(x => !adj.includes(x.id)))];
  const out = [];
  for (const t of tiers) for (const x of t) {
    if (out.length >= 3) break;
    if (bad.has(val(x))) continue;
    bad.add(val(x)); out.push(x);
  }
  return out;
}

const isVisual = a => a === 'flag' || a === 'shape' || a === 'loc';
function optHTML(x, a, i) {
  if (a === 'name') return `<button class="opt" data-i="${i}">${esc(x.n)}</button>`;
  if (a === 'cap') return `<button class="opt" data-i="${i}">${esc(x.cap)}</button>`;
  if (a === 'flag') return `<button class="opt vis" data-i="${i}" aria-label="${esc(LBL('flag'))} ${i + 1}"><img src="${flagSrc(x.id)}" alt=""></button>`;
  return `<button class="opt vis" data-i="${i}" aria-label="${esc(LBL('shape'))} ${i + 1}"><canvas class="oshape"></canvas></button>`;
}
function promptHTML(c, show) {
  const has = k => show.includes(k);
  let h = '';
  if (has('flag') && has('name')) h += `<div class="qinline"><img src="${flagSrc(c.id)}" alt=""><b>${esc(c.n)}</b></div>`;
  else if (has('flag')) h += `<img class="qflag" src="${flagSrc(c.id)}" alt="">`;
  else if (has('name')) h += `<div class="qbig">${esc(c.n)}</div>`;
  if (has('cap')) h += `<div class="lbl">${esc(LBL('cap'))}</div><div class="qbig">${esc(c.cap)}</div>`;
  if (has('shape')) h += `<canvas class="qshape${show.length > 1 ? ' sm' : ''}"></canvas>`;
  return h;
}

function ask() {
  const c = quiz.items[quiz.i];
  const show = cfg.show;
  const a = cfg.ask[Math.floor(Math.random() * cfg.ask.length)];
  quiz.a = a; quiz.answered = false;
  const onMap = a === 'loc';       // answer by tapping the region on the big map, then Confirm
  quiz.opts = onMap ? [] : shuffle([c, ...others(c, a)]);
  quiz.globe = show.includes('loc');
  wrongSel = null;
  if (quiz.globe) {
    selected = c.id; dirty = true;
    animateTo(c.id, zoomFor(c.id, 0.25, 3));
  } else {                         // keep the map neutral so it doesn't give the answer away
    selected = null; dirty = true;
    resetView();
  }
  const n = quiz.items.length;
  pane.innerHTML = `
    <div class="bar"><i style="width:${(quiz.i / n) * 100}%"></i></div>
    ${promptHTML(c, show)}
    <p class="q">${esc(M.Q[a])}</p>
    ${onMap ? '' : `<div class="opts">${quiz.opts.map((x, i) => optHTML(x, a, i)).join('')}</div>`}`;
  pane.scrollTop = 0;
  const qs = pane.querySelector('.qshape'); if (qs) drawShape(qs, c.id);
  pane.querySelectorAll('.opt').forEach(b => {
    const x = quiz.opts[+b.dataset.i];
    const cs = b.querySelector('canvas.oshape');
    if (cs) drawShape(cs, x.id);
    b.onclick = () => answer(+b.dataset.i);
  });
  footer([{ label: 'Quit', on: () => history.back() },
    { label: onMap ? 'Confirm' : 'Next', primary: true, disabled: true, id: 'next', on: () => quiz.answered ? next() : confirmPick() }]);
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
  const picked = a === 'cap' ? esc(x.cap) : isVisual(a) && a !== 'loc' ? `${esc(LBL(a))} · ${esc(x.n)}` : esc(x.n);
  if (a === 'loc' && !ok) wrongSel = x.id;    // the wrong pick stays on the map in red
  // Recap: name, capital, flag, shape, location (on the big map)
  selected = c.id; dirty = true;
  const both = wrongSel ? [F[c.id].bb, F[wrongSel].bb] : [F[c.id].bb];
  if (both.length > 1) {                       // show both the right one and the wrong pick
    const b = [Math.min(both[0][0], both[1][0]), Math.min(both[0][1], both[1][1]), Math.max(both[0][2], both[1][2]), Math.max(both[0][3], both[1][3])];
    const z = Math.max(1, Math.min(6, Math.min(W * 0.7 / ((b[2] - b[0]) * s0()), H * 0.7 / ((b[3] - b[1]) * s0()))));
    animateView({ cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, z });
  } else animateTo(c.id, zoomFor(c.id, 0.25, 3));
  setTimeout(() => {
    if (!quiz.answered || quiz.items[quiz.i] !== c || mode !== 'quiz') return;
    const n = quiz.items.length;
    pane.innerHTML = `
      <div class="bar"><i style="width:${((quiz.i + 1) / n) * 100}%"></i></div>
      <p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ ' + esc(M.ok) : '✗ ' + esc(M.bad)}${ok ? '' : ` <small>${esc(M.pick)}: ${picked}</small>`}</p>
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
  mode = 'end'; selected = null; wrongSel = null; dirty = true;
  resetView();
  const n = quiz.items.length, pct = Math.round(100 * quiz.score / n);
  const tkey = cfg.show.join('+') + '>' + cfg.ask.join('+');
  const bkey = `best:${P.code}:${tkey}:${groupLabel()}:${n}`;
  const best = Math.max(store.get(bkey, 0), pct); store.set(bkey, best);
  pane.innerHTML = `
    <div class="lbl">${list(cfg.show).map(esc).join(' + ')} → ${list(cfg.ask).map(esc).join(' / ')} · ${esc(groupsOn().length ? groupLabel() : M.name)}</div>
    <p class="big">${quiz.score} / ${n}</p>
    <div class="hint">${pct}% correct · best ${best}%</div>
    ${quiz.missed.length ? `<div class="lbl" style="margin-top:12px">To review (tap to see on the map)</div>
    <ul class="missed">${quiz.missed.map(id => `<li data-id="${id}"><img src="${flagSrc(id)}" alt=""><div><b>${esc(C[id].n)}</b><small>${esc(C[id].cap)}</small></div></li>`).join('')}</ul>`
    : '<div class="hint">Perfect round. Nothing to review.</div>'}`;
  pane.scrollTop = 0;
  pane.querySelectorAll('.missed li').forEach(li => li.onclick = () => {
    pane.querySelectorAll('.missed li').forEach(y => y.classList.toggle('on', y === li));
    selected = li.dataset.id; dirty = true; animateTo(selected, zoomFor(selected, 0.3, 6));
  });
  footer([{ label: 'Map', on: () => history.back() }, { label: 'Play again', primary: true, on: startQuiz }]);
}

function setQuizLook(on) { document.body.classList.toggle('quizzing', on); }
function toBrowse() {
  setQuizLook(false); document.body.classList.remove('menuing'); wrongSel = null;
  mode = 'browse'; selected = null; dirty = true;
  resetView();
  renderBrowse();
}

/* ---------------- list of all regions ---------------- */
const dbEl = document.getElementById('db'), dbList = document.getElementById('dblist');
let dbGo = null, dbGroups = [];
function openDb() {
  if (mode !== 'browse' || !dbEl.hidden) return;
  closeSearch(true);
  document.getElementById('dbname').textContent = M.list;
  document.getElementById('dbc1').textContent = M.L.name;
  document.getElementById('dbc2').textContent = M.L.flag;
  document.getElementById('dbc3').textContent = M.L.cap;
  if (!dbList.firstChild) {
    dbList.innerHTML = QUIZ.slice().sort((a, b) => a.n.localeCompare(b.n, M.lang)).map(c => `<div class="dbrow" data-id="${c.id}" data-g="${esc(c.g)}"><b>${esc(c.n)}</b>
      <img src="${flagSrc(c.id)}" alt="" loading="lazy"><span>${esc(c.cap)}</span></div>`).join('');
  }
  renderDbFilter();
  dbEl.hidden = false;
  history.pushState({ s: 'db' }, '');
}
document.getElementById('dbbtn').onclick = openDb;
const dbFilter = document.getElementById('dbfilter');
function renderDbFilter() {
  dbFilter.hidden = !M.groups.length;
  dbFilter.innerHTML = M.groups.length ? ['All', ...M.groups].map(g => {
    const on = g === 'All' ? !dbGroups.length : dbGroups.includes(g);
    return `<button class="choice${on ? ' on' : ''}" data-g="${esc(g)}">${esc(g === 'All' ? M.name : g)}</button>`;
  }).join('') : '';
  let n = 0;
  dbList.querySelectorAll('.dbrow').forEach(row => {
    const show = !dbGroups.length || dbGroups.includes(row.dataset.g);
    row.hidden = !show; if (show) n++;
  });
  document.getElementById('dbcount').textContent = n;
}
dbFilter.addEventListener('click', e => {
  const b = e.target.closest('[data-g]'); if (!b) return;
  const g = b.dataset.g;
  if (g === 'All') dbGroups = [];
  else dbGroups = dbGroups.includes(g) ? dbGroups.filter(x => x !== g) : [...dbGroups, g];
  if (dbGroups.length === M.groups.length) dbGroups = [];
  const all = store.get('dbGroups', {}); all[P.code] = dbGroups; store.set('dbGroups', all);
  renderDbFilter();
  dbList.scrollTop = 0;
});
document.getElementById('dbclose').onclick = () => history.back();
dbList.addEventListener('click', e => {
  const row = e.target.closest('.dbrow[data-id]'); if (!row) return;
  dbGo = row.dataset.id; history.back();
});
function showShape(id) {             // centre the region and zoom until it fills about half the map
  select(id);
  animateTo(id, zoomFor(id, 0.55, ZMAX), 1100);
  blip();
}
window.addEventListener('popstate', () => {
  if (!dbEl.hidden) {
    dbEl.hidden = true;
    if (dbGo) { const id = dbGo; dbGo = null; showShape(id); }
    return;
  }
  if (mode === 'browse') toIntro();
  else if (mode !== 'intro') toBrowse();
});

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
history.replaceState({ s: 'intro' }, '');
renderIntro();
