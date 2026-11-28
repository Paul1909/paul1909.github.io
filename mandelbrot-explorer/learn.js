'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
const $ = id => document.getElementById(id);
const ACC = '#1fd1b9', PINK = '#ff4fd8', GOLD = '#ffc94a';
const dpr = () => Math.min(2, devicePixelRatio || 1);

// Size a canvas to its box (CSS px), drawing in CSS px units.
function fit(cv, ratio) {
  const w = cv.clientWidth || cv.parentElement.clientWidth, h = Math.round(w * ratio), d = dpr();
  cv.style.height = h + 'px'; cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return { g, w, h, d };
}
// A view maps the complex plane to the canvas: centre (cx, cy), width in units.
function mapper(c, cx, cy, width) {
  const s = c.w / width;
  return {
    s, X: x => c.w / 2 + (x - cx) * s, Y: y => c.h / 2 - (y - cy) * s,
    re: px => cx + (px - c.w / 2) / s, im: py => cy - (py - c.h / 2) / s,
  };
}
const fmt = (v, d = 3) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const fmtC = (r, i, d = 3) => `${fmt(r, d)} ${i < 0 ? '−' : '+'} ${Math.abs(i).toFixed(d)}i`;
function fmtBig(v) {
  const a = Math.abs(v);
  if (!Number.isFinite(v) || a >= 1e9) return 'huge';
  if (a >= 1000) return (v < 0 ? '−' : '') + Math.round(a).toLocaleString('en');
  return fmt(v, a >= 100 ? 1 : 3);
}

// Follow the orbit of 0 under z^2 + c: escape, a cycle (with its period), or still undecided.
function classify(cr, ci, keep = 300) {
  let zr = 0, zi = 0;
  const pts = [[0, 0]];
  for (let n = 1; n <= 3000; n++) {
    const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t;
    if (n <= keep) pts.push([zr, zi]);
    if (zr * zr + zi * zi > 4) {
      // keep a couple more points so the escape is visible
      for (let k = 0; k < 2 && pts.length <= keep; k++) { const u = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = u; if (Math.abs(zr) + Math.abs(zi) < 1e6) pts.push([zr, zi]); }
      return { kind: 'esc', n, pts };
    }
  }
  const br = zr, bi = zi; let ar = zr, ai = zi;
  for (let p = 1; p <= 64; p++) {
    const t = ar * ar - ai * ai + cr; ai = 2 * ar * ai + ci; ar = t;
    if (Math.hypot(ar - br, ai - bi) < 1e-7) {
      const cyc = []; let xr = br, xi = bi;
      for (let k = 0; k < p; k++) { cyc.push([xr, xi]); const u = xr * xr - xi * xi + cr; xi = 2 * xr * xi + ci; xr = u; }
      return { kind: 'cycle', p, cyc, pts };
    }
  }
  return { kind: 'edge', pts };
}
const inCardioid = (x, y) => { const q = (x - .25) ** 2 + y * y; return q * (q + x - .25) < y * y / 4; };
const inBulb2 = (x, y) => (x + 1) ** 2 + y * y < 1 / 16;
function verdict(el, r, cr, ci) {
  el.className = 'verdict' + (r.kind === 'esc' ? ' out' : r.kind === 'edge' ? ' edge' : '');
  if (r.kind === 'esc') {
    el.innerHTML = `<b>Escapes.</b> After ${r.n} step${r.n > 1 ? 's' : ''} it is further than 2 from 0, so it runs off to infinity. This <i>c</i> is <b>outside</b> the set.`;
  } else if (r.kind === 'cycle') {
    const where = r.p === 1 ? (inCardioid(cr, ci) ? 'the main cardioid' : 'a special point on the edge')
      : r.p === 2 && inBulb2(cr, ci) ? 'the big period-2 bulb'
      : `a period-${r.p} bulb (or a baby copy of the set)`;
    el.innerHTML = r.p === 1
      ? `<b>Settles on one point</b>, ${ci === 0 ? fmt(r.cyc[0][0]) : fmtC(r.cyc[0][0], r.cyc[0][1])}. This <i>c</i> is <b>in the set</b>: ${where}.`
      : `<b>Settles into a cycle of ${r.p} points.</b> This <i>c</i> is <b>in the set</b>: ${where}.`;
  } else {
    el.innerHTML = `<b>Undecided.</b> After 3,000 steps it still hasn't escaped or settled. This <i>c</i> is on the edge, or extremely close to it.`;
  }
}

// Escape-time picture of the set into an offscreen canvas (shared look across the page).
function setImage(c, m, opts = {}) {
  const W = Math.round(c.w * c.d), H = Math.round(c.h * c.d), it = opts.it || 200;
  const img = new ImageData(W, H), u32 = new Uint32Array(img.data.buffer);
  for (let py = 0; py < H; py++) {
    const y = m.im(py / c.d);
    for (let px = 0; px < W; px++) {
      const v = opts.julia ? juliaPlain(m.re(px / c.d), y, opts.julia[0], opts.julia[1], it) : mbPlain(m.re(px / c.d), y, it);
      let r, g, b;
      if (v < 0) { r = 18; g = 50; b = 58; }
      else { const t = Math.min(1, Math.sqrt(v) / 9); r = 8 + 40 * t; g = 6 + 140 * t * t + 40 * t; b = 20 + 150 * t; }
      u32[py * W + px] = (255 << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
    }
  }
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  off.getContext('2d').putImageData(img, 0, 0);
  return off;
}
function dragOn(cv, cb, end) {
  let down = false;
  const at = e => { const r = cv.getBoundingClientRect(); cb(e.clientX - r.left, e.clientY - r.top); };
  cv.addEventListener('pointerdown', e => { down = true; try { cv.setPointerCapture(e.pointerId); } catch {} at(e); });
  cv.addEventListener('pointermove', e => { if (down) at(e); });
  const up = () => { if (down) { down = false; end && end(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}
function chips(box, list, pick) {
  for (const [label, ...v] of list) {
    const b = document.createElement('button'); b.textContent = label;
    b.addEventListener('click', () => pick(...v)); box.appendChild(b);
  }
}

// ---------------------------------------------------------------- 1. number line
const L = { c: -1 };
function drawLine() {
  const cv = $('lineCv'), c = L.cv || (L.cv = fit(cv, 0.55)), g = c.g, N = 30;
  const r = classify(L.c, 0, N);
  const X = n => 34 + n * (c.w - 48) / N, Y = v => c.h / 2 - v * (c.h / 2 - 12) / 2.6;
  g.clearRect(0, 0, c.w, c.h); g.fillStyle = '#07051a'; g.fillRect(0, 0, c.w, c.h);
  g.font = '11px system-ui, sans-serif'; g.fillStyle = '#a39cc9'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [-2, -1, 0, 1, 2]) {
    g.strokeStyle = v === 0 ? 'rgba(255,255,255,.35)' : Math.abs(v) === 2 ? 'rgba(255,79,216,.55)' : 'rgba(255,255,255,.1)';
    g.setLineDash(Math.abs(v) === 2 ? [5, 5] : []); g.beginPath(); g.moveTo(34, Y(v)); g.lineTo(c.w - 8, Y(v)); g.stroke();
    g.fillText(String(v).replace('-', '−'), 28, Y(v));
  }
  g.setLineDash([]); g.textAlign = 'center'; g.fillText('step →', c.w - 30, c.h - 8);
  const pts = r.pts.slice(0, N + 1);
  g.save(); g.beginPath(); g.rect(30, 0, c.w, c.h); g.clip();
  g.strokeStyle = 'rgba(31,209,185,.55)'; g.lineWidth = 1.5; g.beginPath();
  pts.forEach(([v], n) => { const y = Y(Math.max(-40, Math.min(40, v))); n ? g.lineTo(X(n), y) : g.moveTo(X(n), y); }); g.stroke();
  pts.forEach(([v], n) => { g.fillStyle = Math.abs(v) > 2 ? PINK : ACC; g.beginPath(); g.arc(X(n), Y(Math.max(-40, Math.min(40, v))), 3.2, 0, 7); g.fill(); });
  g.restore();
  $('lineOut').textContent = 'c = ' + fmt(L.c, 3);
  $('lineSeq').innerHTML = r.pts.slice(0, 12).map((p, n) => `z<sub>${n}</sub> = <b>${fmtBig(p[0])}</b>`).join(' &nbsp; ') + (r.kind === 'esc' && r.n < 12 ? ' &nbsp; …' : '');
  verdict($('lineVerdict'), r, L.c, 0);
}
$('lineC').addEventListener('input', e => { L.c = +e.target.value; drawLine(); });
chips($('lineChips'), [['1', 1], ['¼', 0.25], ['0', 0], ['−½', -0.5], ['−1', -1], ['−1.3', -1.3], ['−1.38', -1.38], ['−1.5', -1.5], ['−1.76', -1.76], ['−2', -2]],
  v => { L.c = v; $('lineC').value = v; drawLine(); });

// ---------------------------------------------------------------- 2. squaring
const SQ = { r: 0.85, i: 0.45 };
function drawSq() {
  const c = SQ.cv || (SQ.cv = fit($('sqCv'), 0.75)), g = c.g, m = SQ.m || (SQ.m = mapper(c, 0, 0, 4.4));
  g.fillStyle = '#07051a'; g.fillRect(0, 0, c.w, c.h);
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, m.Y(0)); g.lineTo(c.w, m.Y(0)); g.moveTo(m.X(0), 0); g.lineTo(m.X(0), c.h); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([4, 5]); g.beginPath(); g.arc(m.X(0), m.Y(0), m.s, 0, 7); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#a39cc9'; g.font = '11px system-ui, sans-serif'; g.fillText('radius 1', m.X(0) + m.s * .72 + 4, m.Y(0) - m.s * .72 - 4);
  const z2r = SQ.r * SQ.r - SQ.i * SQ.i, z2i = 2 * SQ.r * SQ.i;
  const a1 = Math.atan2(SQ.i, SQ.r), a2 = Math.atan2(z2i, z2r), r1 = Math.hypot(SQ.r, SQ.i);
  const arc = (a, col, rad) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(m.X(0), m.Y(0), rad, 0, -a, a > 0); g.stroke(); };
  arc(a1, 'rgba(31,209,185,.8)', 22); arc(a1 * 2, 'rgba(255,79,216,.7)', 34);
  const vec = (x, y, col, label) => {
    g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.moveTo(m.X(0), m.Y(0)); g.lineTo(m.X(x), m.Y(y)); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(m.X(x), m.Y(y), label === 'z' ? 9 : 6, 0, 7); g.fill();
    g.font = 'italic 17px Georgia, serif'; g.fillText(label, m.X(x) + 10, m.Y(y) - 10);
  };
  vec(z2r, z2i, PINK, 'z²'); vec(SQ.r, SQ.i, ACC, 'z');
  const deg = a => Math.round(((a * 180 / Math.PI) % 360 + 360) % 360);
  $('sqOut').innerHTML = `<span>z: distance <b>${r1.toFixed(2)}</b>, angle <b>${deg(a1)}°</b></span><span>z²: distance <b>${(r1 * r1).toFixed(2)}</b>, angle <b>${deg(a1 * 2)}°</b></span>`;
}
dragOn($('sqCv'), (x, y) => { SQ.r = Math.max(-2, Math.min(2, SQ.m.re(x))); SQ.i = Math.max(-1.6, Math.min(1.6, SQ.m.im(y))); drawSq(); });

// ---------------------------------------------------------------- 3. orbit tool
const O = { cr: -0.12, ci: 0.75, set: true, circle: true, julia: true, dragging: false };
function orbSetup() {
  O.cv = fit($('orbCv'), 0.8);
  O.m = mapper(O.cv, -0.5, 0, 3.7);
  O.bg = setImage(O.cv, O.m, { it: 300 });
  O.jcv = fit($('julCv'), matchMedia('(min-width: 1024px)').matches ? 0.8 : 0.6); // square up with the orbit tool on desktop
  O.jm = mapper(O.jcv, 0, 0, 3.8);
}
function drawOrbit() {
  const c = O.cv, g = c.g, m = O.m;
  g.fillStyle = '#05030c'; g.fillRect(0, 0, c.w, c.h);
  if (O.set) { g.imageSmoothingEnabled = true; g.drawImage(O.bg, 0, 0, c.w, c.h); }
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, m.Y(0)); g.lineTo(c.w, m.Y(0)); g.moveTo(m.X(0), 0); g.lineTo(m.X(0), c.h); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
  for (const v of [-2, -1, 1]) { g.fillRect(m.X(v) - .5, m.Y(0) - 4, 1, 8); g.fillText(String(v).replace('-', '−'), m.X(v), m.Y(0) + 15); }
  for (const v of [-1, 1]) { g.fillRect(m.X(0) - 4, m.Y(v) - .5, 8, 1); g.fillText(v > 0 ? 'i' : '−i', m.X(0) + 12, m.Y(v) + 4); }
  if (O.circle) { g.strokeStyle = 'rgba(255,79,216,.6)'; g.setLineDash([6, 6]); g.beginPath(); g.arc(m.X(0), m.Y(0), 2 * m.s, 0, 7); g.stroke(); g.setLineDash([]); }
  const r = O.r = classify(O.cr, O.ci, 400), pts = r.pts;
  // orbit: lines fade with the step number so the start of the path stays readable
  g.lineWidth = 1.6;
  for (let n = 1; n < pts.length; n++) {
    const a = Math.max(0.12, 0.95 - n / 90);
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.beginPath(); g.moveTo(m.X(pts[n - 1][0]), m.Y(pts[n - 1][1])); g.lineTo(m.X(pts[n][0]), m.Y(pts[n][1])); g.stroke();
  }
  for (let n = 1; n < pts.length; n++) {
    const out = pts[n][0] ** 2 + pts[n][1] ** 2 > 4;
    g.fillStyle = out ? PINK : `rgba(255,201,74,${Math.max(.25, 1 - n / 80)})`;
    g.beginPath(); g.arc(m.X(pts[n][0]), m.Y(pts[n][1]), n < 8 ? 3.6 : 2.4, 0, 7); g.fill();
  }
  if (r.kind === 'cycle') for (const [x, y] of r.cyc) { g.strokeStyle = ACC; g.lineWidth = 2.5; g.beginPath(); g.arc(m.X(x), m.Y(y), 7, 0, 7); g.stroke(); }
  // start point and the handle for c
  g.fillStyle = '#fff'; g.beginPath(); g.arc(m.X(0), m.Y(0), 3, 0, 7); g.fill();
  g.fillStyle = ACC; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
  g.beginPath(); g.arc(m.X(O.cr), m.Y(O.ci), O.dragging ? 12 : 9, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = 'italic 16px Georgia, serif'; g.textAlign = 'left'; g.fillText('c', m.X(O.cr) + 13, m.Y(O.ci) - 10);
  $('orbC').textContent = fmtC(O.cr, O.ci);
  $('orbStep').textContent = r.kind === 'esc' ? `escapes at step ${r.n}` : r.kind === 'cycle' ? `period ${r.p}` : 'still deciding';
  verdict($('orbVerdict'), r, O.cr, O.ci);
  const z = 40;
  $('orbOpen').href = `./#v=m&x=${O.cr.toFixed(6)}&y=${O.ci.toFixed(6)}&z=${z}&p=classic`;
}
let julRaf = 0, julFine = 0;
function drawJulia(fine) {
  if (!O.julia) return;
  const c = O.jcv, step = fine ? 1 : 3;
  const W = Math.ceil(c.w * c.d / step), H = Math.ceil(c.h * c.d / step);
  const img = new ImageData(W, H), u32 = new Uint32Array(img.data.buffer), s = O.jm.s * c.d / step;
  for (let py = 0; py < H; py++) {
    const y = -(py - H / 2) / s;
    for (let px = 0; px < W; px++) {
      const v = juliaPlain((px - W / 2) / s, y, O.cr, O.ci, fine ? 600 : 100);
      let col;
      if (v < 0) col = 0xff000000;
      else { const t = Math.min(1, Math.sqrt(v) / 7); col = (255 << 24 | Math.round(40 + 190 * t * t) << 16 | Math.round(20 + 200 * t) << 8 | Math.round(30 + 60 * t)) >>> 0; }
      u32[py * W + px] = col;
    }
  }
  const off = document.createElement('canvas'); off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
  const g = c.g; g.imageSmoothingEnabled = !fine; g.drawImage(off, 0, 0, c.w, c.h);
  const inside = O.r && O.r.kind !== 'esc';
  $('julC').textContent = fmtC(O.cr, O.ci);
  $('julText').innerHTML = inside
    ? `Julia set for this <i>c</i>: <b style="color:var(--accent)">one connected piece</b>, because <i>c</i> is in the Mandelbrot set.`
    : `Julia set for this <i>c</i>: <b style="color:var(--pink)">scattered dust</b>, because <i>c</i> is outside the Mandelbrot set.`;
}
function queueJulia(fine) {
  cancelAnimationFrame(julRaf); clearTimeout(julFine);
  julRaf = requestAnimationFrame(() => drawJulia(false));
  if (fine) julFine = setTimeout(() => drawJulia(true), 60);
}
function setC(x, y, fine = true) {
  O.cr = Math.max(-2.4, Math.min(1.4, x)); O.ci = Math.max(-1.6, Math.min(1.6, y));
  drawOrbit(); queueJulia(fine);
}
dragOn($('orbCv'), (x, y) => { O.dragging = true; setC(O.m.re(x), O.m.im(y), false); }, () => { O.dragging = false; drawOrbit(); queueJulia(true); });
for (const [id, k] of [['orbSet', 'set'], ['orbCircle', 'circle']]) $(id).addEventListener('change', e => { O[k] = e.target.checked; drawOrbit(); });
chips($('julChips'), [
  ['Circle', 0, 0], ['Wobbly circle', -0.2, 0.15], ['Basilica (period 2)', -1, 0], ['Rabbit (period 3)', -0.1226, 0.7449],
  ['Dendrite (c = i)', 0, 1], ['Seahorse edge', -0.7453, 0.1127], ['Dust', 0.3, 0.6],
], (x, y) => setC(x, y));
chips($('orbChips'), [
  ['c = 0', 0, 0], ['Cardioid', 0.2, 0.35], ['Period 2', -1, 0.08], ['Period 3', -0.1226, 0.7449], ['Period 4', 0.282, 0.53],
  ['Period 5', 0.3795, 0.3349], ['Baby set', -1.7549, 0], ['c = i', 0, 1], ['c = −2', -2, 0], ['Seahorse edge', -0.7453, 0.1127], ['Just outside', -0.3, 0.65], ['Slow escape', 0.255, 0], ['c = 1', 1, 0],
], (x, y) => setC(x, y));

// ---------------------------------------------------------------- 5. survivors after N steps
function drawLevels() {
  const N = +$('lvN').value, c = fit($('lvCv'), 0.72), m = mapper(c, -0.4, 0, 5.2);
  const W = Math.round(c.w), H = Math.round(c.h), img = new ImageData(W, H), u32 = new Uint32Array(img.data.buffer);
  for (let py = 0; py < H; py++) {
    const ci = m.im(py);
    for (let px = 0; px < W; px++) {
      const cr = m.re(px); let zr = 0, zi = 0, k = 0;
      for (; k < N; k++) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; if (zr * zr + zi * zi > 4) break; }
      let col = 0xff000000;
      if (k < N) { // escaped at step k+1: colour by how early
        const t = (k + 1) / N, l = 0.18 + 0.5 * t, hue = 260 - 200 * t;
        const [r, g, b] = hsl(hue, 0.75, l); col = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
      }
      u32[py * W + px] = col;
    }
  }
  const off = document.createElement('canvas'); off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
  c.g.imageSmoothingEnabled = false; c.g.drawImage(off, 0, 0, c.w, c.h);
  c.g.strokeStyle = 'rgba(255,79,216,.7)'; c.g.setLineDash([6, 6]); c.g.beginPath(); c.g.arc(m.X(0), m.Y(0), 2 * m.s, 0, 7); c.g.stroke(); c.g.setLineDash([]);
  $('lvOut').textContent = N + (N === 1 ? ' step' : ' steps');
}
function hsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
let lvRaf = 0;
$('lvN').addEventListener('input', () => { cancelAnimationFrame(lvRaf); lvRaf = requestAnimationFrame(drawLevels); });

// ---------------------------------------------------------------- 7. fig tree
const B = { c: -1.4 };
function bifSetup() {
  const c = B.cv = fit($('bifCv'), 1.05), split = B.split = Math.round(c.h * 0.42);
  const x0 = -2.08, x1 = 0.42, X = x => (x - x0) / (x1 - x0) * c.w, re = px => x0 + px / c.w * (x1 - x0);
  B.X = X; B.re = re;
  const off = document.createElement('canvas'), W = off.width = Math.round(c.w * c.d), H = off.height = Math.round(c.h * c.d);
  const g = off.getContext('2d'), img = new ImageData(W, H), u32 = new Uint32Array(img.data.buffer);
  u32.fill(0xff1a0507);
  const sTop = Math.round(split * c.d), unit = W / (x1 - x0);
  for (let py = 0; py < sTop; py++) {
    const ci = (sTop / 2 - py) / unit;
    for (let px = 0; px < W; px++) {
      const v = mbPlain(x0 + px / unit, ci, 300);
      u32[py * W + px] = v < 0 ? 0xff3a3812 : (255 << 24 | Math.round(30 + 120 * Math.min(1, Math.sqrt(v) / 9)) << 16 | Math.round(8 + 60 * Math.min(1, Math.sqrt(v) / 9)) << 8 | 10) >>> 0;
    }
  }
  const hist = new Float32Array(W * (H - sTop)), bh = H - sTop, top = 2.1;
  for (let px = 0; px < W; px++) {
    const cr = x0 + (px + 0.5) / unit; let z = 0;
    for (let n = 0; n < 600; n++) z = z * z + cr;
    for (let n = 0; n < 400; n++) {
      z = z * z + cr;
      const py = Math.round((top - z) / (2 * top) * (bh - 1));
      if (py >= 0 && py < bh) hist[py * W + px] += 1;
    }
  }
  for (let i = 0; i < hist.length; i++) if (hist[i]) {
    const t = Math.min(1, 0.55 + hist[i] / 12);
    u32[sTop * W + i] = (255 << 24 | Math.round(185 * t) << 16 | Math.round(209 * t) << 8 | Math.round(31 * t + 40 * t)) >>> 0;
  }
  g.putImageData(img, 0, 0);
  B.bg = off;
}
function drawBif() {
  const c = B.cv, g = c.g;
  g.drawImage(B.bg, 0, 0, c.w, c.h);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, B.split, c.w, 1);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
  for (const v of [-2, -1.5, -1, -0.5, 0]) g.fillText(String(v).replace('-', '−'), Math.max(12, B.X(v)), c.h - 6);
  const x = B.X(B.c);
  g.strokeStyle = GOLD; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.h); g.stroke(); g.setLineDash([]);
  const r = classify(B.c, 0, 10);
  const what = r.kind === 'esc' ? 'escapes' : r.kind === 'cycle' ? (r.p === 1 ? 'settles on 1 value' : `cycles through ${r.p} values`) : 'chaos: never repeats';
  $('bifOut').innerHTML = `<span>c = <b>${fmt(B.c, 4)}</b></span><span>${what}</span>`;
}
dragOn($('bifCv'), x => { B.c = Math.max(-2.08, Math.min(0.42, B.re(x))); drawBif(); });

// ---------------------------------------------------------------- 9. Multibrot: change the exponent
const MB = { d: 2 };
const snapD = v => { const r = Math.round(v); return Math.abs(v - r) < 0.12 ? r : Math.round(v * 100) / 100; };
const homeXd = d => d >= 3 ? 0 : -0.75 * (3 - d);
const whole = d => Math.abs(d - Math.round(d)) < 1e-9;
function drawMulti(fine) {
  const c = MB.cv || (MB.cv = fit($('mbCv'), 0.8)), d = MB.d, step = fine ? 1 : 3;
  const W = Math.ceil(c.w * c.d / step), H = Math.ceil(c.h * c.d / step), s = W / 3.3, cx = homeXd(d);
  const img = new ImageData(W, H), u32 = new Uint32Array(img.data.buffer), it = fine ? 250 : 90;
  for (let py = 0; py < H; py++) {
    const y = -(py - H / 2) / s;
    for (let px = 0; px < W; px++) {
      const v = mbD(cx + (px - W / 2) / s, y, it, d);
      let col;
      if (v < 0) col = (255 << 24 | 58 << 16 | 50 << 8 | 18) >>> 0;
      else { const t = Math.min(1, Math.sqrt(v) / 9); col = (255 << 24 | Math.round(20 + 150 * t) << 16 | Math.round(6 + 180 * t * t) << 8 | Math.round(8 + 40 * t)) >>> 0; }
      u32[py * W + px] = col;
    }
  }
  const off = document.createElement('canvas'); off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
  c.g.imageSmoothingEnabled = !fine; c.g.drawImage(off, 0, 0, c.w, c.h);
  $('mbD').value = d;
  $('mbOut').innerHTML = whole(d) ? `z<sup>${d}</sup> + c` : `z<sup>${d.toFixed(2)}</sup> + c`;
  $('mbNote').innerHTML = d === 2 ? '<b>The Mandelbrot set.</b> One lobe pointing left, mirror symmetric top to bottom.'
    : whole(d) ? `<b>Multibrot, d = ${d}:</b> ${d - 1} identical lobes around the centre (${d - 1}-fold symmetry).`
    : `<b>Fractional power, d = ${d.toFixed(2)}:</b> look for the seams where the power jumps.`;
  $('mbNote').className = 'verdict' + (whole(d) ? '' : ' edge');
  $('mbOpen').href = `./#v=m&x=${homeXd(d)}&y=0&z=1&p=classic${d === 2 ? '' : '&d=' + d}`;
}
let mbRaf = 0;
$('mbD').addEventListener('input', e => {
  const d = snapD(+e.target.value);
  if (d === MB.d) { e.target.value = d; return; }
  MB.d = d; cancelAnimationFrame(mbRaf); mbRaf = requestAnimationFrame(() => drawMulti(false));
});
$('mbD').addEventListener('change', e => { MB.d = snapD(+e.target.value); cancelAnimationFrame(mbRaf); drawMulti(true); });
chips($('mbChips'), [['2 (Mandelbrot)', 2], ['2.5', 2.5], ['3', 3], ['4', 4], ['5', 5], ['8', 8]], d => { MB.d = d; drawMulti(true); });

// ---------------------------------------------------------------- start + resize
function all() {
  L.cv = null; SQ.cv = null; SQ.m = null;
  MB.cv = null;
  drawLine(); drawSq(); orbSetup(); drawOrbit(); queueJulia(true); drawLevels(); bifSetup(); drawBif(); drawMulti(true);
}
let lastW = 0, rt = 0;
addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => { const w = document.querySelector('main').clientWidth; if (w !== lastW) { lastW = w; all(); } }, 150);
});
$('lineC').value = L.c;
lastW = document.querySelector('main').clientWidth;
all();
