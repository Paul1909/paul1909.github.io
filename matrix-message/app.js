'use strict';

/* =========================================================================
   Matrix Message: type a message, watch it decode out of Matrix rain,
   send it to someone as a secret link, a picture or a video.
   ========================================================================= */

// ---------- Offline + storage (the arcade apps share one origin) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
const APP = 'matrix-message';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

// ---------- Constants ----------
const MAX_LEN = 280;            // a tweet
const TICK = 1 / 30;            // rain steps 30x a second, like the original 35 ms loop
const SCRAMBLE = 0.4;           // seconds a letter flickers before it settles
const GLOW_FADE = 0.7;          // seconds for the glow to fade at the very end
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", "Noto Sans Mono", "DejaVu Sans Mono", monospace';

const KATAKANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const CHARSETS = [
  { id: 'classic', label: 'Classic', chars: AZ + DIGITS + KATAKANA },
  { id: 'katakana', label: 'Katakana', chars: KATAKANA + DIGITS },
  { id: 'binary', label: '0 1', chars: '01' },
  { id: 'hex', label: 'Hex', chars: DIGITS + 'ABCDEF' },
  { id: 'latin', label: 'A–Z', chars: AZ },
  { id: 'symbols', label: '#$%&', chars: '+-*/=<>[]{}()#$%&@!?;:~^|' },
  { id: 'hearts', label: '♥ Hearts', chars: '♥♡' },
  { id: 'message', label: 'My message', chars: null },
  { id: 'custom', label: 'Custom…', chars: null },
];
const COLORS = [
  ['#00ff41', 'Matrix green'], ['#00e5ff', 'Cyan'], ['#ffb000', 'Amber'], ['#ff3fa4', 'Pink'],
  ['#ff2b2b', 'Red'], ['#b46bff', 'Purple'], ['#e8e8e8', 'White'],
];
const DEFAULTS = {
  chars: 'classic', custom: '', len: 10, speed: 20, trail: 3,
  color: '#00ff41', msgColor: 'white', end: 'fade', upper: true, crt: true,
};
const TRAIL_ALPHA = [0, 0.2, 0.12, 0.075, 0.05, 0.032];
const TRAIL_WORDS = ['', 'Very short', 'Short', 'Medium', 'Long', 'Very long'];
const speedWord = v => (v < 12 ? 'Slow' : v < 24 ? 'Normal' : v < 34 ? 'Fast' : 'Turbo');

// ---------- Small helpers ----------
const $ = s => document.querySelector(s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = a => a[(Math.random() * a.length) | 0];
const show = (...els) => els.forEach(e => e.classList.remove('hidden'));
const hide = (...els) => els.forEach(e => e.classList.add('hidden'));

function sanitize(s) {
  s = s || {};
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : d; };
  return {
    chars: CHARSETS.some(c => c.id === s.chars) ? s.chars : DEFAULTS.chars,
    custom: typeof s.custom === 'string' ? Array.from(s.custom).slice(0, 120).join('') : '',
    len: num(s.len, 4, 30, DEFAULTS.len),
    speed: num(s.speed, 6, 45, DEFAULTS.speed),
    trail: num(s.trail, 1, 5, DEFAULTS.trail),
    color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color.toLowerCase() : DEFAULTS.color,
    msgColor: s.msgColor === 'rain' ? 'rain' : 'white',
    end: ['fade', 'keep', 'loop'].includes(s.end) ? s.end : 'fade',
    upper: s.upper !== false,
    crt: s.crt !== false,
  };
}

function mixWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = v => Math.round(v + (255 - v) * t);
  return `rgb(${ch(n >> 16 & 255)},${ch(n >> 8 & 255)},${ch(n & 255)})`;
}
function palette(s) {
  return { body: s.color, head: mixWhite(s.color, 0.7), msg: s.msgColor === 'white' ? '#ffffff' : s.color };
}

/** Clean the typed text: max 280, tidy spaces, keep deliberate line breaks. */
function prepText(raw, upper) {
  let t = String(raw || '').slice(0, MAX_LEN).replace(/\r/g, '');
  t = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return upper ? t.toUpperCase() : t;
}

function glyphsFor(s, text) {
  let src;
  if (s.chars === 'custom') src = s.custom;
  else if (s.chars === 'message') src = text || '';
  else src = (CHARSETS.find(c => c.id === s.chars) || CHARSETS[0]).chars;
  const arr = Array.from(src).filter(ch => ch.trim());
  return arr.length ? arr : Array.from(CHARSETS[0].chars);
}

// ---------- Text layout: one row if it fits, otherwise two, more only if it must ----------
function wrapPara(p, width) {
  const lines = [];
  let cur = [];
  for (let w of p.split(' ').filter(Boolean).map(x => Array.from(x))) {
    while (w.length > width) {                       // a word longer than the row: hard break
      if (cur.length) { lines.push(cur); cur = []; }
      lines.push(w.slice(0, width)); w = w.slice(width);
    }
    if (!w.length) continue;
    if (!cur.length) cur = w.slice();
    else if (cur.length + 1 + w.length <= width) cur = cur.concat([' '], w);
    else { lines.push(cur); cur = w.slice(); }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
const wrapText = (text, width) => text.split('\n').flatMap(p => wrapPara(p, width));

function layoutText(text, W, H, maxCell, minOne = 16, minMore = 12) {
  const paras = text.split('\n');
  const total = paras.reduce((a, p) => a + Array.from(p).length, 0);
  const longest = Math.max(1, ...paras.map(p => Array.from(p).length));
  let best = null, prevWidth = Infinity;
  const maxRows = Math.max(paras.length, Math.min(60, total));
  for (let rows = paras.length; rows <= maxRows; rows++) {
    let lines = null;
    for (let w = Math.max(1, Math.floor(total / rows) - 1); w <= longest; w++) {
      const l = wrapText(text, w);
      if (l.length <= rows) { lines = l; break; }
    }
    if (!lines) continue;
    const width = Math.max(...lines.map(l => l.length));
    if (width >= prevWidth) continue;
    prevWidth = width;
    const n = lines.length;
    const cw = (W * 0.9) / width;
    const spaced = Math.min(maxCell, cw, (H * 0.8) / (2 * n - 1));   // blank row between lines
    const tight = Math.min(maxCell, cw, (H * 0.8) / n);
    const cand = tight > spaced * 1.2 ? { lines, cell: tight, step: 1 } : { lines, cell: spaced, step: 2 };
    if (!best || cand.cell > best.cell) best = cand;
    if (cand.cell >= (n === 1 ? minOne : minMore)) return cand;       // readable: done
  }
  return best || { lines: wrapText(text, longest), cell: 8, step: 1 };
}
const maxCellFor = (W, H) => clamp(Math.min(W, H) / 18, 16, 32);

// ---------- Canvases ----------
const canvas = $('#screen');
const ctx = canvas.getContext('2d');
const rainC = document.createElement('canvas');   // rain with fading trails
const rctx = rainC.getContext('2d');
const msgC = document.createElement('canvas');    // the decoded letters
const mctx = msgC.getContext('2d');
let dpr = 1, W = 0, H = 0;

function sizeCanvases() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  const pw = Math.round((W * dpr) / 2) * 2, ph = Math.round((H * dpr) / 2) * 2;   // even sizes for video encoders
  for (const c of [canvas, rainC, msgC]) { c.width = pw; c.height = ph; }
  dpr = pw / W;
}

// ---------- Scene (one run of the animation) ----------
let E = null;

function newScene({ raw = '', s, ambient = false, keepRain = false }) {
  const text = ambient ? '' : prepText(raw, s.upper);
  const maxCell = maxCellFor(W, H);
  const lay = text ? layoutText(text, W, H, maxCell) : null;
  const cell = Math.max(7, lay ? lay.cell : maxCell);
  const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  const x0 = (W - cols * cell) / 2, y0 = (H - rows * cell) / 2;

  const drops = [];
  for (let c = 0; c < cols; c++) {
    const y = -Math.random() * rows;
    drops.push({ c, y, k: 0.75 + Math.random() * 0.5, last: Math.floor(y) });
  }

  // Each column of the message gets a "decoder" stream, timed so all letters
  // have landed by the end of the reveal part of the chosen animation length.
  const letters = [], decoders = [];
  let tl = null;
  if (lay) {
    const n = lay.lines.length, span = (n - 1) * lay.step;
    const top = Math.max(0, Math.floor((rows - 1 - span) / 2));
    const byCol = new Map();
    lay.lines.forEach((line, li) => {
      const r = top + li * lay.step, c0 = Math.floor((cols - line.length) / 2);
      line.forEach((ch, k) => {
        const L = { ch, c: c0 + k, r, at: -1 };   // spaces too: they keep the gaps clear of rain
        letters.push(L);
        if (!byCol.has(L.c)) byCol.set(L.c, []);
        byCol.get(L.c).push(L);
      });
    });
    const T = s.len, dv = s.speed * 1.2;
    const reveal = Math.max(0.45 * T, (top + span + 1) / dv + 0.2 + SCRAMBLE + 0.4);
    for (const [c, Ls] of byCol) {
      Ls.sort((a, b) => a.r - b.r);
      const topR = Ls[0].r, botR = Ls[Ls.length - 1].r;
      const minT = (topR + 1) / dv + 0.2;                     // starts above the screen
      const maxT = reveal - (botR - topR) / dv - SCRAMBLE;    // lowest letter settles in time
      const t = minT + Math.random() * Math.max(0.05, maxT - minT);
      const y = topR - dv * t;
      decoders.push({ c, y, v: dv, last: Math.floor(y), letters: Ls });
    }
    const hold = 0.2 * T, fade = Math.max(0.6, 0.35 * T - GLOW_FADE);
    tl = { reveal, holdEnd: reveal + hold, fade, fadeEnd: reveal + hold + fade, total: reveal + hold + fade + GLOW_FADE };
  }

  if (!keepRain) {
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.fillStyle = '#000';
    rctx.fillRect(0, 0, rainC.width, rainC.height);
  }
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, msgC.width, msgC.height);

  return {
    s, raw, text, ambient, lay, cell, cols, rows, x0, y0, tl,
    glyphs: glyphsFor(s, prepText(raw, s.upper)), pal: palette(s),
    drops, decoders, letters, t: 0, acc: 0,
    rainAlpha: 1, glow: 1, finished: false, restart: false, msgDirty: true,
    dim: ambient ? 0.42 : 1,
  };
}

/** Update colours/characters/speed of a running scene without restarting it. */
function applyLive(sc, s, raw) {
  sc.s = s;
  sc.pal = palette(s);
  sc.glyphs = glyphsFor(s, prepText(raw, s.upper));
}

function drawCell(sc, c, r, color) {
  const x = sc.x0 + c * sc.cell, y = sc.y0 + r * sc.cell;
  rctx.fillStyle = '#000';
  rctx.fillRect(x, y, sc.cell, sc.cell);
  rctx.fillStyle = color;
  rctx.fillText(sc.glyphs[(Math.random() * sc.glyphs.length) | 0], x + sc.cell / 2, y + sc.cell / 2);
}
function advance(sc, d, headColor) {
  const target = Math.floor(d.y);
  while (d.last < target) {
    if (d.last >= 0 && d.last < sc.rows) drawCell(sc, d.c, d.last, sc.pal.body);   // old head becomes trail
    d.last++;
    if (d.last >= 0 && d.last < sc.rows) drawCell(sc, d.c, d.last, headColor);
  }
}

function phase(sc) {
  if (sc.ambient || !sc.tl) return;
  const { tl, t } = sc;
  if (sc.s.end === 'fade') {
    sc.rainAlpha = clamp(1 - (t - tl.holdEnd) / tl.fade, 0, 1);
    sc.glow = clamp(1 - (t - tl.fadeEnd) / GLOW_FADE, 0, 1);
  }
  if (!sc.finished && t >= tl.total) { sc.finished = true; setTimeout(() => sceneFinished(sc), 0); }
  if (sc.s.end === 'loop' && t >= tl.total + 1.2) sc.restart = true;
}

function tick(sc) {
  sc.t += TICK;
  phase(sc);
  if (sc.rainAlpha > 0) {
    const { cell } = sc;
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.fillStyle = `rgba(0,0,0,${TRAIL_ALPHA[sc.s.trail]})`;
    rctx.fillRect(0, 0, W, H);
    rctx.font = `bold ${Math.round(cell * 0.86)}px ${FONT}`;
    rctx.textAlign = 'center';
    rctx.textBaseline = 'middle';
    for (const d of sc.drops) {
      d.y += sc.s.speed * d.k * TICK;
      advance(sc, d, sc.pal.head);
      if (d.last > sc.rows + 1) {
        d.y = -Math.random() * sc.rows * 0.6;
        d.last = Math.floor(d.y);
        d.k = 0.75 + Math.random() * 0.5;
      }
    }
    // Rain passes behind decoded letters so they stay readable.
    rctx.fillStyle = '#000';
    for (const L of sc.letters) if (L.at >= 0) rctx.fillRect(sc.x0 + L.c * cell, sc.y0 + L.r * cell, cell, cell);
  }
  // Decoder streams (keep moving even if the rain layer is hidden).
  for (const d of sc.decoders) {
    if (d.done) continue;
    d.y += d.v * TICK;
    if (sc.rainAlpha > 0) advance(sc, d, '#ffffff'); else d.last = Math.floor(d.y);
    for (const L of d.letters) if (L.at < 0 && d.last >= L.r) { L.at = sc.t; sc.msgDirty = true; }
    if (d.last > sc.rows + 1) d.done = true;
  }
  for (const L of sc.letters) if (L.at >= 0 && L.ch !== ' ' && sc.t - L.at < SCRAMBLE + TICK) { sc.msgDirty = true; break; }
}

function drawMessage(sc) {
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, W, H);
  mctx.font = `bold ${Math.round(sc.cell * 0.95)}px ${FONT}`;
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  for (const L of sc.letters) {
    if (L.at < 0 || L.ch === ' ') continue;
    const scrambling = sc.t - L.at < SCRAMBLE;
    mctx.fillStyle = scrambling ? sc.pal.head : sc.pal.msg;
    mctx.fillText(scrambling ? pick(sc.glyphs) : L.ch, sc.x0 + (L.c + 0.5) * sc.cell, sc.y0 + (L.r + 0.5) * sc.cell);
  }
  sc.msgDirty = false;
}

function crtTile(k) {
  const tile = document.createElement('canvas');
  tile.width = 3 * k; tile.height = 4 * k;
  const t = tile.getContext('2d');
  ['rgba(255,0,0,0.06)', 'rgba(0,255,0,0.02)', 'rgba(0,0,255,0.06)'].forEach((c, i) => { t.fillStyle = c; t.fillRect(i * k, 0, k, 4 * k); });
  t.fillStyle = 'rgba(0,0,0,0.25)';
  t.fillRect(0, 2 * k, 3 * k, 2 * k);
  return tile;
}
function drawCRT(g, w, h, k) {
  if (!g._crt || g._crtK !== k) { g._crt = g.createPattern(crtTile(k), 'repeat'); g._crtK = k; }
  g.fillStyle = g._crt;
  g.fillRect(0, 0, w, h);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function render(sc) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (sc.rainAlpha > 0) {
    ctx.globalAlpha = sc.rainAlpha * sc.dim;
    ctx.drawImage(rainC, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (sc.letters.length) {
    if (sc.msgDirty) drawMessage(sc);
    if (sc.glow > 0.01) { ctx.shadowColor = sc.pal.msg; ctx.shadowBlur = sc.cell * 0.8 * dpr * sc.glow; }
    ctx.drawImage(msgC, 0, 0);
    ctx.shadowBlur = 0;
  }
  if (sc.s.crt) drawCRT(ctx, canvas.width, canvas.height, Math.max(1, Math.round(dpr)));
}

let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!E) return;
  let dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (dt > 0.25) dt = TICK;                       // came back from a hidden tab
  E.acc += dt;
  let steps = 0;
  while (E.acc >= TICK && steps < 4) { E.acc -= TICK; tick(E); steps++; }
  if (steps === 4) E.acc = 0;
  if (E.restart) E = newScene({ raw: E.raw, s: E.s, keepRain: true });
  if (steps) render(E);
}

// ---------- Recap picture (for "Picture + link") ----------
function buildRecap(raw, s) {
  const text = prepText(raw, s.upper);
  const Wp = 1080, Hp = 1350;
  const c = document.createElement('canvas');
  c.width = Wp; c.height = Hp;
  const g = c.getContext('2d');
  const pal = palette(s), glyphs = glyphsFor(s, text);
  g.fillStyle = '#000';
  g.fillRect(0, 0, Wp, Hp);

  // a frozen frame of rain
  const rc = 34, cols = Math.ceil(Wp / rc), rowsN = Math.ceil(Hp / rc);
  g.font = `bold ${Math.round(rc * 0.86)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < cols; i++) {
    for (let pass = 0; pass < 2; pass++) {
      const head = Math.floor(Math.random() * (rowsN + 12)) - 4, len = 6 + Math.floor(Math.random() * 20);
      for (let k = 0; k < len; k++) {
        const r = head - k;
        if (r < 0 || r >= rowsN) continue;
        g.globalAlpha = (k === 0 ? 1 : (1 - k / len) * 0.85) * 0.6;
        g.fillStyle = k === 0 ? pal.head : pal.body;
        g.fillText(pick(glyphs), (i + 0.5) * rc, (r + 0.5) * rc);
      }
    }
  }
  g.globalAlpha = 1;

  // the message, on a dark band
  const lay = layoutText(text || ' ', Wp, Hp * 0.66, 76, 52, 30);
  const n = lay.lines.length, cell = lay.cell, blockH = ((n - 1) * lay.step + 1) * cell;
  const top = Hp * 0.48 - blockH / 2, pad = Math.max(40, cell * 1.4);
  const band = g.createLinearGradient(0, top - pad * 1.6, 0, top + blockH + pad * 1.6);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(0.25, 'rgba(0,0,0,0.85)');
  band.addColorStop(0.75, 'rgba(0,0,0,0.85)');
  band.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = band;
  g.fillRect(0, top - pad * 1.6, Wp, blockH + pad * 3.2);
  g.font = `bold ${Math.round(cell * 0.95)}px ${FONT}`;
  g.fillStyle = pal.msg;
  g.shadowColor = pal.msg;
  for (const blur of [cell * 0.7, cell * 0.25]) {
    g.shadowBlur = blur;
    lay.lines.forEach((line, li) => {
      const y = top + (li * lay.step + 0.5) * cell, x0 = Wp / 2 - (line.length * cell) / 2;
      line.forEach((ch, k) => { if (ch !== ' ') g.fillText(ch, x0 + (k + 0.5) * cell, y); });
    });
  }
  g.shadowBlur = 0;

  // header + address
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.fillRect(0, 0, Wp, 110);
  g.fillRect(0, Hp - 120, Wp, 120);
  g.fillStyle = pal.body;
  g.font = `bold 30px ${FONT}`;
  g.fillText('// INCOMING TRANSMISSION', Wp / 2, 62);
  g.font = `bold 26px ${FONT}`;
  g.globalAlpha = 0.85;
  g.fillText('▶ ' + GAME_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''), Wp / 2, Hp - 60);
  g.globalAlpha = 1;
  if (s.crt) drawCRT(g, Wp, Hp, 2);
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}

// ---------- Links: the message + look travel in the URL hash ----------
// The message is scrambled so it can't be read in the chat preview.
// Not real encryption: it just hides the text from a glance. All done on the phone, no server.
function keystream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 255;
  };
}
function scramble(str) {
  const bytes = new TextEncoder().encode(str);
  const salt = (Math.random() * 256) | 0;            // same message, different-looking link each time
  const k = keystream(0x4d4d5347 ^ (salt * 2654435761));
  const out = new Uint8Array(bytes.length + 1);
  out[0] = salt;
  bytes.forEach((b, i) => { out[i + 1] = b ^ k(); });
  let bin = '';
  out.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unscramble(code) {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const k = keystream(0x4d4d5347 ^ (bytes[0] * 2654435761));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(1).map(b => b ^ k()));
}
function buildLink(raw, s) {
  const p = new URLSearchParams();
  p.set('m', raw);
  if (s.chars !== DEFAULTS.chars) p.set('c', s.chars);
  if (s.chars === 'custom' && s.custom) p.set('x', s.custom);
  if (s.len !== DEFAULTS.len) p.set('l', s.len);
  if (s.speed !== DEFAULTS.speed) p.set('v', s.speed);
  if (s.trail !== DEFAULTS.trail) p.set('t', s.trail);
  if (s.color !== DEFAULTS.color) p.set('k', s.color.slice(1));
  if (s.msgColor !== DEFAULTS.msgColor) p.set('w', 'r');
  if (s.end !== DEFAULTS.end) p.set('e', s.end[0]);
  if (!s.upper) p.set('u', '0');
  if (!s.crt) p.set('s', '0');
  return GAME_URL + '#t=' + scramble(p.toString());
}
function parseLink() {
  if (location.hash.length < 3) return null;
  let p = new URLSearchParams(location.hash.slice(1));
  if (p.get('t')) {                                   // scrambled link (old readable #m= links still work)
    try { p = new URLSearchParams(unscramble(p.get('t'))); } catch { return null; }
  }
  const m = p.get('m');
  if (!m || !m.trim()) return null;
  const ends = { f: 'fade', k: 'keep', l: 'loop' };
  const s = sanitize({
    chars: p.get('c') || DEFAULTS.chars,
    custom: p.get('x') || '',
    len: p.get('l') || DEFAULTS.len,
    speed: p.get('v') || DEFAULTS.speed,
    trail: p.get('t') || DEFAULTS.trail,
    color: p.get('k') ? '#' + p.get('k') : DEFAULTS.color,
    msgColor: p.get('w') === 'r' ? 'rain' : 'white',
    end: ends[p.get('e')] || 'fade',
    upper: p.get('u') !== '0',
    crt: p.get('s') !== '0',
  });
  return { raw: m.slice(0, MAX_LEN), s, fromLink: true };
}

// ---------- UI ----------
const ui = {
  composer: $('#composer'), msg: $('#msg'), count: $('#count'),
  play: $('#play'), composeShare: $('#composeShare'),
  chips: $('#chips'), customChars: $('#customChars'), swatches: $('#swatches'),
  len: $('#len'), lenOut: $('#lenOut'), speed: $('#speed'), speedOut: $('#speedOut'),
  trail: $('#trail'), trailOut: $('#trailOut'), upper: $('#upper'), crt: $('#crt'), reset: $('#resetSettings'),
  intro: $('#intro'), introText: $('#introText'), tapHint: $('#tapHint'),
  close: $('#closeBtn'), bar: $('#bar'), replay: $('#replay'), edit: $('#edit'), barShare: $('#barShare'),
  sheet: $('#sheet'), videoOpt: $('#videoOpt'), videoNote: $('#videoNote'),
  videoReady: $('#videoReady'), shareVideo: $('#shareVideo'), saveVideo: $('#saveVideo'), closeVideo: $('#closeVideo'),
  rec: $('#rec'), recTime: $('#recTime'), toast: $('#toast'),
};

let settings = sanitize(store.get('settings', DEFAULTS));
let mode = 'compose';      // 'compose' | 'intro' | 'play'
let cur = null;            // { raw, s, fromLink } being played / shared

let toastTimer = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
}

// Screen stays on while the animation plays.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && mode === 'play') keepAwake(true);
});

// ----- Settings panel -----
function buildSettingsUI() {
  for (const cs of CHARSETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = cs.label; b.dataset.id = cs.id;
    b.onclick = () => setSetting('chars', cs.id);
    ui.chips.appendChild(b);
  }
  for (const [hex, name] of COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = hex; b.dataset.hex = hex;
    b.setAttribute('aria-label', name); b.title = name;
    b.onclick = () => setSetting('color', hex);
    ui.swatches.appendChild(b);
  }
  const lab = document.createElement('label');
  lab.title = 'Pick any colour';
  lab.innerHTML = '<input type="color" aria-label="Pick any colour">';
  lab.querySelector('input').addEventListener('input', e => setSetting('color', e.target.value));
  ui.swatches.appendChild(lab);
  ui.customLabel = lab;

  ui.customChars.addEventListener('input', () => setSetting('custom', ui.customChars.value));
  ui.len.addEventListener('input', () => setSetting('len', ui.len.value));
  ui.speed.addEventListener('input', () => setSetting('speed', ui.speed.value));
  ui.trail.addEventListener('input', () => setSetting('trail', ui.trail.value));
  ui.upper.addEventListener('change', () => setSetting('upper', ui.upper.checked));
  ui.crt.addEventListener('change', () => setSetting('crt', ui.crt.checked));
  document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => { b.onclick = () => setSetting(seg.dataset.key, b.dataset.v); });
  });
  ui.reset.onclick = () => { settings = sanitize(DEFAULTS); saveSettings(); toast('Settings reset'); };
}

function syncSettingsUI() {
  const s = settings;
  ui.chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === s.chars));
  ui.customChars.classList.toggle('hidden', s.chars !== 'custom');
  if (document.activeElement !== ui.customChars) ui.customChars.value = s.custom;
  let preset = false;
  ui.swatches.querySelectorAll('button').forEach(b => { const on = b.dataset.hex === s.color; b.classList.toggle('on', on); preset ||= on; });
  ui.customLabel.classList.toggle('on', !preset);
  if (!preset) ui.customLabel.style.background = s.color; else ui.customLabel.style.background = '';
  ui.customLabel.querySelector('input').value = s.color;
  ui.len.value = s.len; ui.lenOut.textContent = s.len + ' s';
  ui.speed.value = s.speed; ui.speedOut.textContent = speedWord(s.speed);
  ui.trail.value = s.trail; ui.trailOut.textContent = TRAIL_WORDS[s.trail];
  document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', s[seg.dataset.key] === b.dataset.v));
  });
  ui.upper.checked = s.upper;
  ui.crt.checked = s.crt;
}

function saveSettings() {
  store.set('settings', settings);
  syncSettingsUI();
  if (E && mode === 'compose') applyLive(E, settings, ui.msg.value);
}
function setSetting(k, v) {
  settings = sanitize({ ...settings, [k]: v });
  saveSettings();
}

// ----- Composer -----
function updateCount() {
  const n = ui.msg.value.length;
  ui.count.textContent = `${n} / ${MAX_LEN}`;
  ui.count.classList.toggle('warn', n > 260);
}
function composerMessage() {
  let raw = ui.msg.value.trim();
  if (!raw) { raw = ui.msg.placeholder; ui.msg.value = raw; onMsgInput(); }
  return { raw, s: { ...settings }, fromLink: false };
}
function onMsgInput() {
  store.set('draft', ui.msg.value);
  updateCount();
  if (E && mode === 'compose' && settings.chars === 'message') applyLive(E, settings, ui.msg.value);
}

// ----- Modes -----
function showComposer() {
  mode = 'compose';
  stopRecording(true);
  keepAwake(false);
  hide(ui.bar, ui.close, ui.intro, ui.sheet, ui.videoReady, ui.rec);
  show(ui.composer);
  E = newScene({ raw: ui.msg.value, s: settings, ambient: true });
}

let introTimer = 0;
function showIntro(link) {
  mode = 'intro';
  cur = link;
  hide(ui.composer, ui.bar, ui.close, ui.sheet, ui.videoReady, ui.tapHint);
  show(ui.intro);
  E = newScene({ raw: '', s: link.s, ambient: true });
  const n = Array.from(prepText(link.raw, false).replace(/\s/g, '')).length;
  const full = ['> INCOMING TRANSMISSION', `> ${n} CHARACTERS · ENCRYPTED`, '> SOURCE: SOMEONE WHO KNOWS YOU'].join('\n');
  let i = 0;
  clearInterval(introTimer);
  ui.introText.textContent = '';
  introTimer = setInterval(() => {
    ui.introText.textContent = full.slice(0, ++i);
    if (i >= full.length) { clearInterval(introTimer); show(ui.tapHint); }
  }, 32);
}

function startPlay(c, { push = true } = {}) {
  cur = c;
  mode = 'play';
  clearInterval(introTimer);
  hide(ui.composer, ui.intro, ui.bar, ui.sheet, ui.videoReady);
  show(ui.close);
  $('#editLabel').textContent = c.fromLink ? 'Create' : 'Edit';
  if (push && !(history.state && history.state.mm === 'play')) history.pushState({ mm: 'play' }, '');
  E = newScene({ raw: c.raw, s: c.s });
  keepAwake(true);
}

function sceneFinished(sc) {
  if (sc !== E || mode !== 'play' || recording) return;
  if (sc.s.end !== 'loop') showBar();
  prepRecap(cur);
}
function showBar() { show(ui.bar); }

function leavePlay() {
  if (history.state && history.state.mm === 'play') { history.back(); return; }   // popstate shows the composer
  if (cur && cur.fromLink) {
    history.replaceState(null, '', location.pathname + location.search);       // drop the received message from the URL
  }
  showComposer();
}
window.addEventListener('popstate', () => { if (mode === 'play') showComposer(); });
window.addEventListener('hashchange', () => { const l = parseLink(); if (l) showIntro(l); });

// ----- Sharing -----
let recap = null, recapKey = '';
function prepRecap(c) {
  const key = JSON.stringify([c.raw, c.s]);
  if (key !== recapKey || !recap) { recapKey = key; recap = buildRecap(c.raw, c.s); }
  return recap;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

function openSheet() {
  prepRecap(cur);
  ui.videoOpt.classList.toggle('hidden', !videoType);
  ui.videoNote.textContent = `Records the ~${Math.round(cur.s.len)} s animation`;
  show(ui.sheet);
}

async function shareLink() {
  const link = buildLink(cur.raw, cur.s);
  const text = `📟 Incoming transmission. Decode it here: ${link}`;
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  toast((await copyText(link)) ? 'Secret link copied' : link);
}

async function shareImage() {
  const link = buildLink(cur.raw, cur.s);
  const text = `📟 Decoded. Watch it rain: ${link}`;
  const blob = await prepRecap(cur);
  const file = blob && new File([blob], 'matrix-message.png', { type: 'image/png' });
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    if (navigator.share) { await navigator.share({ title: 'Matrix Message', text, url: link }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (blob) download(blob, 'matrix-message.png');
  toast((await copyText(text)) ? 'Picture saved · link copied' : 'Picture saved');
}

// ----- Video recording -----
const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const videoType = (window.MediaRecorder && canvas.captureStream)
  ? VIDEO_TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || null
  : null;
let recording = null, videoFile = null;

function stopRecording(cancel) { if (recording) recording.cancelled = !!cancel; }

async function recordVideo() {
  if (!videoType) { toast('This browser cannot record video'); return; }
  hide(ui.sheet);
  startPlay(cur, { push: mode === 'compose' });
  const scene = E;
  const stream = canvas.captureStream(30);
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: videoType, videoBitsPerSecond: 8e6 }); }
  catch { try { rec = new MediaRecorder(stream); } catch { toast('Could not start recording'); return; } }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });
  const R = recording = { cancelled: false };
  rec.start(250);
  show(ui.rec);
  const dur = scene.tl.total + (scene.s.end === 'loop' ? 0.2 : 1.2);
  await new Promise(res => {
    const iv = setInterval(() => {
      ui.recTime.textContent = Math.min(scene.t, dur).toFixed(0) + ' / ' + dur.toFixed(0) + ' s';
      if (R.cancelled || E !== scene || scene.t >= dur) { clearInterval(iv); res(); }
    }, 100);
  });
  try { rec.stop(); } catch {}
  stream.getTracks().forEach(t => t.stop());
  await stopped;
  hide(ui.rec);
  if (recording === R) recording = null;
  if (R.cancelled || E !== scene || !chunks.length) { if (!R.cancelled) toast('Recording stopped'); return; }
  const type = (rec.mimeType || videoType).split(';')[0];
  videoFile = new File([new Blob(chunks, { type })], `matrix-message.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
  if (mode === 'play') {
    if (scene.s.end !== 'loop') showBar();
    show(ui.videoReady);
  }
}

async function shareVideo() {
  if (!videoFile) return;
  const text = `📟 Made with Matrix Message: ${GAME_URL}`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [videoFile] })) { await navigator.share({ files: [videoFile], text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(videoFile, videoFile.name);
  toast('Video saved');
}

// ---------- Wiring ----------
buildSettingsUI();
syncSettingsUI();
ui.msg.value = store.get('draft', '');
updateCount();

ui.msg.addEventListener('input', onMsgInput);
ui.msg.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ui.play.click(); } });
ui.play.onclick = () => startPlay(composerMessage());
ui.composeShare.onclick = () => { cur = composerMessage(); openSheet(); };

ui.intro.addEventListener('click', () => startPlay(cur, { push: false }));
ui.intro.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPlay(cur, { push: false }); } });

canvas.addEventListener('click', () => {
  if (mode !== 'play' || recording) return;
  if (ui.bar.classList.contains('hidden')) { showBar(); prepRecap(cur); } else hide(ui.bar);
});
ui.close.onclick = () => { stopRecording(true); leavePlay(); };
ui.replay.onclick = () => { hide(ui.bar); E = newScene({ raw: cur.raw, s: cur.s }); };
ui.edit.onclick = () => {
  if (cur && cur.fromLink) {
    history.replaceState(null, '', location.pathname + location.search);
    showComposer();
  } else leavePlay();
};
ui.barShare.onclick = openSheet;

ui.sheet.addEventListener('click', e => {
  if (e.target === ui.sheet) { hide(ui.sheet); return; }
  const b = e.target.closest('[data-share]');
  if (!b) return;
  const what = b.dataset.share;
  if (what === 'cancel') hide(ui.sheet);
  else if (what === 'link') { hide(ui.sheet); shareLink(); }
  else if (what === 'image') { hide(ui.sheet); shareImage(); }
  else if (what === 'video') recordVideo();
});
ui.videoReady.addEventListener('click', e => { if (e.target === ui.videoReady) hide(ui.videoReady); });
ui.shareVideo.onclick = shareVideo;
ui.saveVideo.onclick = () => { if (videoFile) { download(videoFile, videoFile.name); toast('Video saved'); } };
ui.closeVideo.onclick = () => hide(ui.videoReady);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!ui.sheet.classList.contains('hidden')) hide(ui.sheet);
  else if (!ui.videoReady.classList.contains('hidden')) hide(ui.videoReady);
  else if (mode === 'play') { stopRecording(true); leavePlay(); }
});

// Rotation / real size changes restart the scene; small height jiggles
// (a phone's address bar showing or hiding) are simply stretched.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const bigChange = Math.abs(window.innerWidth - W) > 2 || Math.abs(window.innerHeight - H) > H * 0.2;
    if (!bigChange) return;
    sizeCanvases();
    if (E) {
      if (recording) { stopRecording(true); hide(ui.rec); toast('Recording stopped (screen rotated)'); }
      E = newScene({ raw: E.raw, s: E.s, ambient: E.ambient });
      if (mode === 'play') hide(ui.bar);
    }
  }, 150);
});

sizeCanvases();
const incoming = parseLink();
if (incoming) showIntro(incoming); else showComposer();
requestAnimationFrame(frame);
