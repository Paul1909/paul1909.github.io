'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'mandelbrot-explorer';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- palettes
const LUT_N = 2048, INSIDE = 0xff000000;
const PALETTES = [
  { id: 'classic', name: 'Classic', stops: [[0, '#000764'], [.16, '#206bcb'], [.42, '#edffff'], [.6425, '#ffaa00'], [.8575, '#000200'], [1, '#000764']] },
  { id: 'fire', name: 'Fire', stops: [[0, '#0a0000'], [.22, '#6b0800'], [.45, '#e2420b'], [.62, '#ffb000'], [.78, '#fff4c2'], [1, '#0a0000']] },
  { id: 'ocean', name: 'Ocean', stops: [[0, '#00121c'], [.28, '#005f73'], [.5, '#94d2bd'], [.62, '#f1faee'], [.8, '#0a9396'], [1, '#00121c']] },
  { id: 'neon', name: 'Neon', stops: [[0, '#0a0716'], [.25, '#3ef2ff'], [.5, '#0a0716'], [.75, '#ff4fd8'], [1, '#0a0716']] },
  { id: 'gold', name: 'Gold', stops: [[0, '#140b00'], [.3, '#8a5a00'], [.52, '#ffd46b'], [.64, '#fff7dc'], [.82, '#6b3d00'], [1, '#140b00']] },
  { id: 'aurora', name: 'Aurora', stops: [[0, '#030814'], [.2, '#1b3a6b'], [.4, '#3ddc97'], [.55, '#e6ff8a'], [.72, '#b06bff'], [1, '#030814']] },
  { id: 'rainbow', name: 'Rainbow', stops: [[0, '#ff2d55'], [.17, '#ff9500'], [.33, '#ffd60a'], [.5, '#34c759'], [.67, '#0a84ff'], [.83, '#bf5af2'], [1, '#ff2d55']] },
  { id: 'mono', name: 'Ink', stops: [[0, '#000000'], [.5, '#ffffff'], [1, '#000000']] },
];
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function buildLut(p) {
  const lut = new Uint32Array(LUT_N), st = p.stops;
  for (let i = 0; i < LUT_N; i++) {
    const t = i / LUT_N; let k = 0;
    while (k < st.length - 2 && t > st[k + 1][0]) k++;
    const [t0, c0] = st[k], [t1, c1] = st[k + 1], f = (t - t0) / (t1 - t0 || 1);
    const a = hexRgb(c0), b = hexRgb(c1), u = f * f * (3 - 2 * f);
    const r = a[0] + (b[0] - a[0]) * u, g = a[1] + (b[1] - a[1]) * u, bl = a[2] + (b[2] - a[2]) * u;
    lut[i] = (255 << 24 | Math.round(bl) << 16 | Math.round(g) << 8 | Math.round(r)) >>> 0;
  }
  return lut;
}
const cssGradient = p => `linear-gradient(90deg, ${p.stops.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ')})`;

// ---------------------------------------------------------------- famous places
const PLACES = [
  { name: 'The whole set', note: 'Where it all starts', x: '-0.75', y: '0', z: 1, home: true },
  { name: 'Seahorse Valley', note: 'Curly seahorse tails between the two big bulbs', x: '-0.74364', y: '0.13182', z: 600 },
  { name: 'Elephant Valley', note: 'A parade of trunks by the cusp', x: '0.2865', y: '0.0145', z: 400 },
  { name: 'Scepter Valley', note: 'Royal sceptres off the left bulb', x: '-1.36', y: '0', z: 25 },
  { name: 'The baby Mandelbrot', note: 'A perfect copy out on the antenna', x: '-1.7548776662466927', y: '0', z: 70 },
  { name: 'Island up north', note: 'Another copy, wrapped in hair', x: '-0.1592', y: '1.0317', z: 100 },
  { name: 'Lightning branches', note: 'Filaments that split forever', x: '-0.1011', y: '0.9563', z: 60 },
  { name: 'Spiral galaxy', note: 'A deep double spiral', x: '-0.761574', y: '-0.0847596', z: 2500 },
  { name: 'Deep dive', note: 'Seahorse Valley, much further down', x: '-0.743643887037158704752191506114774', y: '0.131825904205311970493132056385139', z: 1e14 },
  { name: 'Deeper still', note: 'Past what normal maths can reach (takes a moment)', x: '-0.743643887037158704752191506114774', y: '0.131825904205311970493132056385139', z: 1e28 },
  { group: 'Multibrot cousins: other exponents' },
  { name: 'Cubic set', note: 'Two lobes, mirror symmetric both ways', x: '0', y: '0', z: 1, d: 3, home: true },
  { name: 'Cubic coastline', note: 'Bulbs and spirals on the cubic edge', x: '-0.2', y: '0.95', z: 20, d: 3 },
  { name: 'Quartic set', note: 'Three-fold symmetry', x: '0', y: '0', z: 1, d: 4, home: true },
  { name: 'Quintic set', note: 'Four lobes, like a clover', x: '0', y: '0', z: 1, d: 5, home: true },
  { name: 'Halfway to cubic', note: 'A fractional power: watch for the seams', x: '-0.375', y: '0', z: 1, d: 2.5, home: true },
];

// ---------------------------------------------------------------- fixed-point view maths
// A view centre is a BigInt fixed-point number (value = x / 2^P), so zooming never runs out of digits.
const Z_MIN = 0.3, PERT_BELOW = 2e-12, D_MIN = 2, D_MAX = 8;
// Whole exponents zoom as deep as z² does; fractional ones (and Julia sets) stop where plain doubles run out.
const zMax = (mode, d = S.d) => mode === 'j' ? 1e12 : isWhole(d) ? 1e250 : 1e11;
// The exponent slider snaps to whole numbers; in between it moves in steps of 0.01.
function snapD(v) {
  if (!Number.isFinite(v)) return 2;
  v = Math.min(D_MAX, Math.max(D_MIN, v));
  const r = Math.round(v);
  return Math.abs(v - r) < 0.12 ? r : Math.round(v * 100) / 100;
}
const homeX = d => d >= 3 ? 0 : -0.75 * (3 - d);
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const formulaText = d => isWhole(d) ? `z${String(d).split('').map(k => SUPD[k]).join('')} + c` : `z^${d.toFixed(2)} + c`;
const formulaHtml = d => isWhole(d) ? `z<sup>${d}</sup> + c` : `z<sup>${d.toFixed(2)}</sup> + c`;
const needP = z => Math.max(64, Math.ceil(Math.log2(Math.max(1, z) * 4096)) + 52);
const fromNum = (v, P) => BigInt(Math.round(v * 2 ** P));
const toNum = (b, P) => Number(b) * 2 ** -P;
function toDec(b, P, digits) {
  const neg = b < 0n, a = neg ? -b : b, Pb = BigInt(P);
  const t = ((a * 10n ** BigInt(digits)) + (1n << (Pb - 1n))) >> Pb, s = t.toString().padStart(digits + 1, '0');
  const ip = s.slice(0, -digits), fs = s.slice(-digits).replace(/0+$/, '');
  return (neg && t ? '-' : '') + ip + (fs ? '.' + fs : '');
}
function fromDec(s, P) {
  const m = /^\s*(-)?(\d*)(?:\.(\d*))?\s*$/.exec(String(s));
  if (!m) { const n = Number(s); return Number.isFinite(n) ? fromNum(n, P) : 0n; }
  const Pb = BigInt(P), f = m[3] || '';
  let v = (BigInt(m[2] || '0') << Pb) + (f ? ((BigInt(f) << Pb) + 10n ** BigInt(f.length) / 2n) / 10n ** BigInt(f.length) : 0n);
  return m[1] ? -v : v;
}
function makeView(x, y, z) { const P = needP(z); return { x: fromDec(x, P), y: fromDec(y, P), P, z }; }
function ensureP(v) {
  const p = needP(v.z);
  if (p > v.P) { const d = BigInt(p - v.P); v.x <<= d; v.y <<= d; v.P = p; }
}
const decDigits = v => Math.max(17, Math.ceil(Math.log10(Math.max(1, v.z) * 4000)) + 4);
const ser = v => ({ x: toDec(v.x, v.P, decDigits(v)), y: toDec(v.y, v.P, decDigits(v)), z: v.z });
const deser = (o, d) => (o && o.x != null && +o.z > 0) ? makeView(o.x, o.y, +o.z) : d;

// ---------------------------------------------------------------- state
const HOME = { m: d => makeView(String(homeX(d)), '0', 1), j: () => makeView('0', '0', 0.75) };
const saved = store.get('state', {});
const savedD2 = snapD(+saved.d || 2);
const S = {
  mode: saved.mode === 'j' ? 'j' : 'm',
  d: savedD2,
  atHome: saved.m ? !!saved.atHome : true,
  views: { m: deser(saved.m, HOME.m(savedD2)), j: deser(saved.j, HOME.j()) },
  jc: Array.isArray(saved.jc) ? saved.jc : [-0.7453, 0.1127],
  palette: PALETTES.some(p => p.id === saved.palette) ? saved.palette : 'classic',
  density: Number.isFinite(saved.density) ? saved.density : 0,
  iterLog: Number.isFinite(saved.iterLog) ? saved.iterLog : 0,
  quality: saved.quality === 'fast' ? 'fast' : 'sharp',
  cycle: !!saved.cycle,
  offset: 0,
  place: null,
};
let lut = buildLut(PALETTES.find(p => p.id === S.palette));
const view = () => S.views[S.mode];
function saveState() {
  store.set('state', { mode: S.mode, m: ser(S.views.m), j: ser(S.views.j), jc: S.jc, palette: S.palette,
    density: S.density, iterLog: S.iterLog, quality: S.quality, cycle: S.cycle, d: S.d, atHome: S.atHome });
}
function hashOf() {
  const v = ser(view()), q = new URLSearchParams({ v: S.mode, x: v.x, y: v.y, z: String(v.z), p: S.palette });
  if (S.mode === 'j') { q.set('cr', String(S.jc[0])); q.set('ci', String(S.jc[1])); }
  if (S.d !== 2) q.set('d', String(S.d));
  return q.toString();
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.has('x') || !q.has('z') || !(+q.get('z') > 0)) return false;
  S.d = snapD(+q.get('d') || 2); S.atHome = false;
  const mode = q.get('v') === 'j' ? 'j' : 'm', z = Math.min(zMax(mode), Math.max(Z_MIN, +q.get('z')));
  S.mode = mode;
  S.views[mode] = makeView(q.get('x'), q.get('y') || '0', z);
  if (mode === 'j') S.jc = [+q.get('cr') || 0, +q.get('ci') || 0];
  if (PALETTES.some(p => p.id === q.get('p'))) { S.palette = q.get('p'); lut = buildLut(PALETTES.find(p => p.id === S.palette)); }
  S.place = null;
  return true;
}

// ---------------------------------------------------------------- canvas + workers
const cv = $('view'), ctx = cv.getContext('2d', { alpha: false });
const snap = document.createElement('canvas'), sctx = snap.getContext('2d', { alpha: false });
const small = document.createElement('canvas'), smctx = small.getContext('2d');
let cssW = 0, cssH = 0;
function sizeCanvas() {
  cssW = innerWidth; cssH = innerHeight;
  const rs = S.quality === 'fast' ? 1 : Math.min(2, devicePixelRatio || 1);
  cv.width = snap.width = Math.round(cssW * rs); cv.height = snap.height = Math.round(cssH * rs);
}
const rsNow = () => cv.width / cssW;
const scaleCss = v => 3 / (v.z * Math.min(cssW, cssH));
function autoIter(z) {
  const L = Math.max(0, Math.log10(z));
  return Math.min(60000, Math.max(64, Math.round((250 + 160 * L + 10 * L * L) * 2 ** S.iterLog)));
}

const NW = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
for (let i = 0; i < NW; i++) {
  const w = new Worker('worker.js'); w.busy = false;
  w.onmessage = e => { w.busy = false; onResult(e.data); dispatch(); };
  w.onerror = () => { w.busy = false; };
  workers.push(w);
}

let GEN = 0, R = null, transforming = false;
// boost: a deep view that came out all black gets another try with twice the iterations (up to 3 times).
function render(boost = 0) {
  const gen = ++GEN, v = view(), W = cv.width, H = cv.height;
  const sc = scaleCss(v) / rsNow(), it = Math.min(60000, autoIter(v.z) * 2 ** boost);
  R = { gen, W, H, sc, it, boost, d: S.d, cx: toNum(v.x, v.P), cy: toNum(v.y, v.P), kind: 'm', passes: [4, 1], pi: -1, done: false, dirty: false, jobsDone: 0, jobsAll: 0 };
  if (S.mode === 'j') { R.kind = 'j'; R.jr = S.jc[0]; R.ji = S.jc[1]; }
  else if (sc < PERT_BELOW && isWhole(S.d)) {
    R.kind = 'p';
    const o = refOrbitD(v.x, v.y, v.P, it, S.d);
    R.refInside = refInside(o, it);
    R.sa = S.d === 2 ? saCoeffs(o.orbit, o.len, Math.hypot(W / 2, H / 2) * sc, sc, it) : null;
    for (const w of workers) w.postMessage({ type: 'ref', gen, orbit: o.orbit, len: o.len });
  }
  R.jobsAll = R.passes.reduce((n, st) => { const gw = Math.ceil(W / st), gh = Math.ceil(H / st); return n + Math.ceil(gh / Math.max(1, Math.floor(24000 / gw))); }, 0);
  progress(0);
  nextPass();
  updateHud();
}
function nextPass() {
  R.pi++;
  if (R.pi === 1 && R.kind === 'p' && !R.refInside && R.boost < 3 && R.it < 60000 && !R.buf.some(x => x >= 0)) return render(R.boost + 1);
  if (R.pi >= R.passes.length) return finish();
  const st = R.step = R.passes[R.pi], gw = R.gw = Math.ceil(R.W / st), gh = R.gh = Math.ceil(R.H / st);
  R.buf = new Float32Array(gw * gh);
  if (st > 1) { small.width = gw; small.height = gh; }
  const rows = Math.max(1, Math.floor(24000 / gw)), jobs = [];
  for (let y = 0; y < gh; y += rows) jobs.push([y, Math.min(gh, y + rows)]);
  jobs.sort((a, b) => Math.abs(a[0] + a[1] - gh) - Math.abs(b[0] + b[1] - gh)); // centre first
  R.jobs = jobs; R.pending = jobs.length;
  dispatch();
}
function dispatch() {
  if (!R || !R.jobs) return;
  for (const w of workers) {
    if (w.busy || !R.jobs.length) continue;
    const [y0, y1] = R.jobs.shift(); w.busy = true;
    w.postMessage({ type: 'rows', gen: R.gen, pass: R.pi, kind: R.kind, W: R.W, H: R.H, step: R.step, gw: R.gw,
      y0, y1, sc: R.sc, cx: R.cx, cy: R.cy, jr: R.jr, ji: R.ji, it: R.it, sa: R.sa, d: R.d, ic: !!R.refInside });
  }
}
function onResult(m) {
  if (!R || m.gen !== R.gen || m.pass !== R.pi || !m.out) return;
  R.buf.set(m.out, m.y0 * R.gw);
  paintRows(m.y0, m.y1, m.out);
  R.pending--; R.jobsDone++;
  progress(R.jobsDone / R.jobsAll);
  if (R.pending === 0) nextPass();
}
function colourInto(u32, src) {
  const k = LUT_N / (48 / 2 ** S.density), off = S.offset, mask = LUT_N - 1, l = lut;
  for (let i = 0, n = src.length; i < n; i++) {
    const v = src[i];
    u32[i] = v < 0 ? INSIDE : l[((v * k + off) | 0) & mask];
  }
}
function paintRows(y0, y1, data) {
  if (transforming) return;
  const img = new ImageData(R.gw, y1 - y0);
  colourInto(new Uint32Array(img.data.buffer), data);
  if (R.step === 1) ctx.putImageData(img, 0, y0);
  else {
    smctx.putImageData(img, 0, y0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, y0, R.gw, y1 - y0, 0, y0 * R.step, R.gw * R.step, (y1 - y0) * R.step);
  }
}
let fullImg = null;
function recolourAll() {
  if (!R || !R.done || transforming) return;
  if (!fullImg || fullImg.width !== R.W || fullImg.height !== R.H) fullImg = new ImageData(R.W, R.H);
  colourInto(new Uint32Array(fullImg.data.buffer), R.buf);
  ctx.putImageData(fullImg, 0, 0);
}
function finish() {
  R.done = true; R.jobs = null;
  progress(1);
  if (R.dirty) recolourAll();
  queueRecap();
}
const bar = $('progress');
function progress(f) {
  bar.style.opacity = f >= 1 ? '0' : '1';
  bar.style.width = (f >= 1 ? 100 : Math.max(3, f * 100)) + '%';
}

// ---------------------------------------------------------------- HUD
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function fmtZoom(z) {
  if (z < 1000) return '×' + (z < 10 ? z.toFixed(2) : Math.round(z));
  const e = Math.floor(Math.log10(z)), m = z / 10 ** e;
  return `×${m.toFixed(1)}·10<sup>${e}</sup>`;
}
const fmtZoomPlain = z => z < 1000 ? '×' + (z < 10 ? z.toFixed(2) : Math.round(z)) : '×' + (z / 10 ** Math.floor(Math.log10(z))).toFixed(1) + '·10' + String(Math.floor(Math.log10(z))).split('').map(d => SUP[d]).join('');
function coordText(v, max = 14) {
  const d = Math.min(max, Math.max(4, Math.ceil(Math.log10(v.z * 300)) + 1));
  const x = toNum(v.x, v.P), y = toNum(v.y, v.P);
  return `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)} ${y < 0 ? '−' : '+'} ${Math.abs(y).toFixed(d)}i`;
}
function updateHud() {
  const v = view();
  $('zoom').innerHTML = fmtZoom(v.z);
  $('where').textContent = (S.mode === 'j' ? `Julia of ${S.jc[0].toFixed(4)} ${S.jc[1] < 0 ? '−' : '+'} ${Math.abs(S.jc[1]).toFixed(4)}i` : coordText(v))
    + ` · ${(R ? R.it : autoIter(v.z)).toLocaleString('en')} it`;
  $('place').textContent = S.place || '';
  $('formula').innerHTML = S.d === 2 ? '' : formulaHtml(S.d) + (S.mode === 'j' ? ' · Julia set' : ' · Multibrot');
  $('julia').setAttribute('aria-pressed', S.mode === 'j');
  $('cross').classList.toggle('hidden', S.mode === 'j');
  $('itersOut').textContent = autoIter(v.z).toLocaleString('en') + ' it';
}
let toastT = 0;
function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- moving the view
// While a finger is down we only stretch a snapshot of the last picture; the real render starts on release.
function beginTransform() {
  if (transforming) return;
  transforming = true; GEN++; R = null; progress(1);
  sctx.drawImage(cv, 0, 0);
}
function clampS(s) {
  const z = view().z, zmax = zMax(S.mode);
  return Math.min(zmax / z, Math.max(Z_MIN / z, s));
}
function drawT(s, tx, ty) {
  const rs = rsNow();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030c'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(s, 0, 0, s, tx * rs, ty * rs);
  ctx.drawImage(snap, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
// Screen point p (CSS px, before) ends up at s*p + t. Work out the new centre and zoom from that.
function commit(s, tx, ty) {
  transforming = false;
  const v = view(), sc = scaleCss(v), cx = cssW / 2, cy = cssH / 2;
  const qx = (cx - tx) / s, qy = (cy - ty) / s;
  const want = v.z * s;
  if (want >= zMax(S.mode) * 0.999) toast(S.mode === 'j' ? 'Julia zoom stops here (double precision)' : isWhole(S.d) ? 'That is as deep as this app goes' : 'Fractional exponents stop at ×10¹¹');
  v.z = Math.min(zMax(S.mode), Math.max(Z_MIN, want));
  ensureP(v);
  v.x += fromNum((qx - cx) * sc, v.P);
  v.y -= fromNum((qy - cy) * sc, v.P);
  S.place = null; S.atHome = false;
  afterMove();
}
function afterMove() {
  recap = null;
  render();
  saveState();
  try { history.replaceState(null, '', '#' + hashOf()); } catch {}
}

let anim = 0;
function animateZoom(f, px, py) {
  if (anim) return;
  f = clampS(f);
  if (Math.abs(f - 1) < 1e-9) { toast('That is as deep as this app goes'); return; }
  beginTransform();
  const t0 = performance.now(), D = 260;
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = 1 - (1 - k) ** 3, s = f ** e;
    const tx = (1 - s) * px, ty = (1 - s) * py;
    drawT(s, tx, ty);
    if (k < 1) anim = requestAnimationFrame(step);
    else { anim = 0; commit(s, tx, ty); }
  };
  anim = requestAnimationFrame(step);
}

// Pointer gestures: one finger pans, two fingers pinch, taps toggle the buttons, double-tap dives.
const ptrs = new Map();
let G = null, lastTap = null, tapTimer = 0;
const mid = () => { const a = [...ptrs.values()]; return a.length < 2 ? { x: a[0].x, y: a[0].y, d: 1 } : { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };
function rebase() {
  G.b = { s: G.s, tx: G.tx, ty: G.ty }; G.m0 = mid();
}
let drawQueued = false;
function queueDraw() {
  if (drawQueued) return; drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; if (G && G.moved) drawT(G.s, G.tx, G.ty); });
}
cv.addEventListener('pointerdown', e => {
  if (anim) return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!G) G = { s: 1, tx: 0, ty: 0, moved: false, t0: performance.now(), x0: e.clientX, y0: e.clientY, multi: false };
  if (ptrs.size > 1) G.multi = true;
  rebase();
  closeSheets();
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p || !G) return;
  p.x = e.clientX; p.y = e.clientY;
  const m = mid();
  if (ptrs.size >= 2) {
    const s = clampS(G.b.s * m.d / G.m0.d) ;
    G.tx = m.x - s * (G.m0.x - G.b.tx) / G.b.s; G.ty = m.y - s * (G.m0.y - G.b.ty) / G.b.s; G.s = s;
  } else {
    G.tx = G.b.tx + (m.x - G.m0.x); G.ty = G.b.ty + (m.y - G.m0.y);
  }
  if (!G.moved && (ptrs.size >= 2 || Math.hypot(e.clientX - G.x0, e.clientY - G.y0) > 8)) { G.moved = true; beginTransform(); }
  if (G.moved) queueDraw();
});
function pointerEnd(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!G) return;
  if (ptrs.size) { rebase(); return; }
  const g = G; G = null;
  if (g.moved) { drawT(g.s, g.tx, g.ty); commit(g.s, g.tx, g.ty); return; }
  if (g.multi || performance.now() - g.t0 > 350 || e.type === 'pointercancel') return;
  const now = performance.now();
  if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
    clearTimeout(tapTimer); lastTap = null;
    animateZoom(2.5, e.clientX, e.clientY);
  } else {
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    tapTimer = setTimeout(() => { lastTap = null; if (!anySheetOpen()) document.body.classList.toggle('clean'); else closeSheets(); }, 320);
  }
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);

// Mouse wheel / trackpad zoom around the cursor.
let wheel = null, wheelT = 0;
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (anim || G) return;
  if (!wheel) { beginTransform(); wheel = { s: 1, tx: 0, ty: 0 }; }
  const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  const f = clampS(wheel.s * Math.exp(-dy * 0.0016)) / wheel.s;
  wheel.s *= f; wheel.tx = f * wheel.tx + (1 - f) * e.clientX; wheel.ty = f * wheel.ty + (1 - f) * e.clientY;
  drawT(wheel.s, wheel.tx, wheel.ty);
  clearTimeout(wheelT);
  wheelT = setTimeout(() => { const w = wheel; wheel = null; commit(w.s, w.tx, w.ty); }, 220);
}, { passive: false });

$('zin').addEventListener('click', () => animateZoom(2, cssW / 2, cssH / 2));
$('zout').addEventListener('click', () => animateZoom(0.5, cssW / 2, cssH / 2));

// ---------------------------------------------------------------- sheets
const sheetBtns = [...document.querySelectorAll('[data-sheet]')];
const anySheetOpen = () => sheetBtns.some(b => b.getAttribute('aria-pressed') === 'true');
function closeSheets() {
  for (const b of sheetBtns) { b.setAttribute('aria-pressed', 'false'); $('sheet-' + b.dataset.sheet).classList.add('hidden'); }
}
for (const b of sheetBtns) b.addEventListener('click', () => {
  const open = b.getAttribute('aria-pressed') !== 'true';
  closeSheets();
  if (open) { b.setAttribute('aria-pressed', 'true'); $('sheet-' + b.dataset.sheet).classList.remove('hidden'); }
});
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

// Places
for (const p of PLACES) {
  if (p.group) { const h = document.createElement('h2'); h.className = 'group'; h.textContent = p.group; $('placeList').appendChild(h); continue; }
  const b = document.createElement('button'), d = p.d || 2;
  if (d === 2) b.dataset.mandel = '1';
  b.innerHTML = `<div><b></b><span></span></div><i>${d === 2 ? fmtZoomPlain(p.z) : formulaHtml(d)}</i>`;
  b.querySelector('b').textContent = p.name; b.querySelector('span').textContent = p.note;
  b.addEventListener('click', () => {
    S.d = d; showExpo();
    S.mode = 'm'; S.views.m = makeView(p.x, p.y, p.z); S.place = p.name; S.atHome = !!p.home;
    closeSheets(); afterMove();
  });
  $('placeList').appendChild(b);
}

// Colours
function setPalette(id) {
  S.palette = id; lut = buildLut(PALETTES.find(p => p.id === id));
  for (const b of $('paletteList').children) b.setAttribute('aria-pressed', b.dataset.id === id);
  repaint();
}
function repaint() {
  recap = null;
  if (R && R.done) { recolourAll(); queueRecap(); } else if (R) R.dirty = true;
  saveState();
  try { history.replaceState(null, '', '#' + hashOf()); } catch {}
}
for (const p of PALETTES) {
  const b = document.createElement('button');
  b.dataset.id = p.id; b.style.background = cssGradient(p);
  b.innerHTML = '<span></span>'; b.firstChild.textContent = p.name;
  b.setAttribute('aria-pressed', p.id === S.palette);
  b.addEventListener('click', () => setPalette(p.id));
  $('paletteList').appendChild(b);
}
const dens = $('density');
const showDensity = () => { $('densityOut').textContent = '×' + (+(2 ** S.density).toFixed(2)); };
dens.value = S.density; showDensity();
dens.addEventListener('input', () => { S.density = +dens.value; showDensity(); repaint(); });
const cyc = $('cycle');
cyc.setAttribute('aria-pressed', S.cycle);
cyc.addEventListener('click', () => { S.cycle = !S.cycle; cyc.setAttribute('aria-pressed', S.cycle); saveState(); if (!S.cycle) queueRecap(); });
let lastT = 0;
(function loop(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t;
  if (S.cycle && R && R.done && !transforming && !document.hidden) { S.offset = (S.offset + dt * LUT_N * 0.12) % LUT_N; recolourAll(); }
  requestAnimationFrame(loop);
})(0);

// Settings
const iters = $('iters');
iters.value = S.iterLog;
let iterT = 0;
iters.addEventListener('input', () => {
  S.iterLog = +iters.value; updateHud();
  clearTimeout(iterT); iterT = setTimeout(() => { recap = null; render(); saveState(); }, 250);
});
const qBtns = [...$('quality').children];
const showQ = () => qBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.q === S.quality));
showQ();
qBtns.forEach(b => b.addEventListener('click', () => { S.quality = b.dataset.q; showQ(); sizeCanvas(); recap = null; render(); saveState(); }));
$('reset').addEventListener('click', () => { S.mode = 'm'; S.views.m = HOME.m(S.d); S.place = null; S.atHome = true; closeSheets(); afterMove(); });

// Exponent: z^d + c. d = 2 is the Mandelbrot set; the rest are its Multibrot cousins.
const expo = $('expo');
function showExpo() {
  expo.value = S.d;
  $('expoOut').innerHTML = formulaHtml(S.d);
  $('expoNote').textContent = S.d === 2 ? 'The Mandelbrot set.'
    : isWhole(S.d) ? `Multibrot set: ${S.d - 1}-fold symmetry.`
    : 'Fractional power: seams appear where the power jumps. Zoom stops at ×10¹¹.';
  $('expoBack').classList.toggle('hidden', S.d === 2);
  refreshPlaces();
}
// The famous places are Mandelbrot (d = 2) spots: with another exponent they're greyed out, so a tap
// doesn't silently switch the exponent back. The Multibrot cousins stay available.
function refreshPlaces() {
  const off = S.d !== 2;
  for (const b of document.querySelectorAll('#placeList button[data-mandel]')) b.disabled = off;
  $('placesNote').classList.toggle('hidden', !off);
  $('placesNoteF').innerHTML = formulaHtml(S.d);
}
let expoRaf = 0;
function setD(d, final) {
  if (d !== S.d && isWhole(d)) navigator.vibrate?.(8);
  S.d = d; showExpo();
  if (S.atHome && S.mode === 'm') S.views.m = HOME.m(d);
  for (const k of ['m', 'j']) if (S.views[k].z > zMax(k)) S.views[k].z = zMax(k);
  if (S.mode === 'm' && !S.atHome) S.place = null;
  updateHud(); recap = null;
  if (final) { cancelAnimationFrame(expoRaf); expoRaf = 0; afterMove(); }
  else if (!expoRaf) expoRaf = requestAnimationFrame(() => { expoRaf = 0; render(); });
}
expo.addEventListener('input', () => { const d = snapD(+expo.value); if (d !== S.d) setD(d, false); else expo.value = d; });
expo.addEventListener('change', () => setD(snapD(+expo.value), true));
$('expoBack').addEventListener('click', () => setD(2, true));

// Julia
$('julia').addEventListener('click', () => {
  closeSheets();
  if (S.mode === 'j') { S.mode = 'm'; afterMove(); return; }
  const m = S.views.m, c = [toNum(m.x, m.P), toNum(m.y, m.P)];
  if (c[0] !== S.jc[0] || c[1] !== S.jc[1]) { S.jc = c; S.views.j = HOME.j(); }
  S.mode = 'j'; S.place = null;
  afterMove();
  toast('Julia set of the point under the cross. Tap Julia again to go back.');
});

// Surprise me: dive towards the edge a few times, always picking a slow-escaping point.
$('surprise').addEventListener('click', () => {
  closeSheets();
  if (S.mode === 'j') {
    const t = Math.random() * Math.PI * 2, r = 0.97 + Math.random() * 0.06;
    if (S.d === 2) S.jc = [r * (Math.cos(t) / 2 - Math.cos(2 * t) / 4), r * (Math.sin(t) / 2 - Math.sin(2 * t) / 4)];
    else { // find the edge along a random ray, then step just off it
      let lo = 0, hi = 2;
      for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; mbD(m * Math.cos(t), m * Math.sin(t), 400, S.d) < 0 ? lo = m : hi = m; }
      S.jc = [lo * r * Math.cos(t), lo * r * Math.sin(t)];
    }
    S.views.j = HOME.j(); S.place = 'Random Julia set';
    return afterMove();
  }
  let x = homeX(S.d), y = 0, z = 1;
  const target = 2.5 + Math.random() * 6.5, N = 40;
  for (let guard = 0; Math.log10(z) < target && guard < 30; guard++) {
    const span = 3 / z, it = Math.min(4000, autoIter(z) * 2), cand = [];
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const px = x + (gx / (N - 1) - 0.5) * span, py = y + (gy / (N - 1) - 0.5) * span, val = mbD(px, py, it, S.d);
      if (val >= 0) cand.push([val, px, py]);
    }
    if (!cand.length) break;
    cand.sort((a, b) => b[0] - a[0]);
    const pick = cand[Math.floor(Math.random() * Math.max(1, Math.floor(cand.length * 0.06)))];
    x = pick[1]; y = pick[2]; z *= 5 + Math.random() * 8;
  }
  z = Math.min(z, 10 ** target);
  const P = needP(z);
  S.mode = 'm'; S.views.m = { x: fromNum(x, P), y: fromNum(y, P), P, z }; S.place = 'Surprise!'; S.atHome = false;
  afterMove();
});

// ---------------------------------------------------------------- share
// The recap picture is drawn once the render settles, so the share sheet opens straight away.
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');
let recap = null, recapT = 0;
function queueRecap() {
  clearTimeout(recapT);
  recapT = setTimeout(() => { if (R && R.done && !transforming) recap = buildRecap(); }, 500);
}
function buildRecap() {
  const W = 1080, IMG = 1080, FOOT = 290, c = document.createElement('canvas');
  c.width = W; c.height = IMG + FOOT;
  const g = c.getContext('2d');
  g.fillStyle = '#05030c'; g.fillRect(0, 0, W, IMG + FOOT);
  const side = Math.min(cv.width, cv.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(cv, (cv.width - side) / 2, (cv.height - side) / 2, side, side, 0, 0, W, IMG);
  const v = view(), F = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.fillStyle = '#1fd1b9'; g.fillRect(0, IMG, W, 6);
  g.fillStyle = '#ffffff'; g.font = `800 56px ${F}`; g.fillText('Mandelbrot Explorer', 56, IMG + 82);
  g.fillStyle = '#ece8ff'; g.font = `600 36px ${F}`;
  const label = S.mode === 'j' ? (S.d === 2 ? 'Julia set' : `Julia set of ${formulaText(S.d)}`) : (S.place || (S.d === 2 ? 'Somewhere in the Mandelbrot set' : `Multibrot ${formulaText(S.d)}`));
  g.fillText(`${fmtZoomPlain(v.z)}  ·  ${label}`, 56, IMG + 138);
  g.fillStyle = '#9a92c4'; g.font = `500 28px ui-monospace, Menlo, Consolas, monospace`;
  g.fillText(S.mode === 'j' ? `c = ${S.jc[0].toFixed(6)} ${S.jc[1] < 0 ? '−' : '+'} ${Math.abs(S.jc[1]).toFixed(6)}i` : coordText(v, 12), 56, IMG + 184);
  g.fillStyle = '#1fd1b9'; g.font = `600 30px ${F}`;
  g.fillText('Explore it yourself: ' + GAME_URL.replace(/^https?:\/\//, ''), 56, IMG + 246);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
}
async function share() {
  const link = GAME_URL + '#' + hashOf(), v = view();
  const setName = S.d === 2 ? 'the Mandelbrot set' : `the Multibrot set ${formulaText(S.d)}`;
  const text = `I found this spot ${S.mode === 'j' ? 'in a Julia set' : 'in ' + setName} at zoom ${fmtZoomPlain(v.z)}. Fly there yourself: ${link}`;
  const blob = await (recap || (recap = buildRecap()));
  const file = blob && new File([blob], 'mandelbrot.jpg', { type: 'image/jpeg' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Mandelbrot Explorer', text, url: link });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mandelbrot.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  try { await navigator.clipboard.writeText(text); toast('Picture saved, link copied'); } catch { toast(link); }
}
$('share').addEventListener('click', () => { closeSheets(); share(); });

// ---------------------------------------------------------------- start
let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (innerWidth === cssW && innerHeight === cssH) return; sizeCanvas(); recap = null; render(); }, 120);
});
addEventListener('hashchange', () => { if (location.hash.slice(1) !== hashOf() && readHash()) { setPalette(S.palette); afterMove(); } });
readHash();
for (const b of $('paletteList').children) b.setAttribute('aria-pressed', b.dataset.id === S.palette);
for (const k of ['m', 'j']) { S.views[k].z = Math.min(zMax(k), Math.max(Z_MIN, S.views[k].z)); ensureP(S.views[k]); }
showExpo();
sizeCanvas();
render();
try { history.replaceState(null, '', '#' + hashOf()); } catch {}
if (!store.get('hinted', false)) { setTimeout(() => toast('Pinch to zoom · drag to move · double-tap to dive', 3500), 600); store.set('hinted', true); }
