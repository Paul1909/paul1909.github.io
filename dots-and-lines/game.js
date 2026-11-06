'use strict';

/* =============================================================
   CONFIG
   ============================================================= */
const ROWS = 6;                 // dots per column
const COLS = 5;                 // dots per row
const TOTAL_BOXES = (ROWS - 1) * (COLS - 1);
const COLORS = { 1: '#00d2ff', 2: '#ff2e63', dot: '#f2f2ff' };

/* =============================================================
   SMALL HELPERS
   ============================================================= */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const grid = (r, c) => Array.from({ length: r }, () => Array(c).fill(0));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

const ICON = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  home:   ICON('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  sound:  ICON('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute:   ICON('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  fsOn:   ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  fsOff:  ICON('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  undo:   ICON('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  newG:   ICON('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>')
};

/* =============================================================
   TRANSLATIONS
   ============================================================= */
const I18N = {
  it: {
    title: 'Punti e Linee',
    rulesHeader: 'Regole',
    rule1: 'Trascina il dito tra due punti (o tocca uno spazio) per tracciare una linea.',
    rule2: 'Se chiudi un quadrato prendi un punto e <b>giochi di nuovo</b>.',
    rule3: 'Vince chi possiede più quadrati alla fine.',
    play: 'GIOCA', newGameBig: 'NUOVA PARTITA', continue: 'CONTINUA',
    hint: 'Trascina per unire • Annulla se sbagli',
    p1: 'Giocatore 1', p2: 'Giocatore 2',
    undo: 'Annulla', newGame: 'Nuova', sure: 'Sicuro?',
    again: 'Gioca ancora', menu: 'Menu',
    winP1: '🏆 Vince il Giocatore 1!', winP2: '🏆 Vince il Giocatore 2!', draw: '🤝 Pareggio!',
    sound: 'Audio', fullscreen: 'Schermo intero'
  },
  en: {
    title: 'Dots and Lines',
    rulesHeader: 'Rules',
    rule1: 'Swipe between two dots (or tap a gap) to draw a line.',
    rule2: 'Close a box to score a point and <b>take another turn</b>.',
    rule3: 'Whoever owns the most boxes at the end wins.',
    play: 'PLAY', newGameBig: 'NEW GAME', continue: 'CONTINUE',
    hint: 'Swipe to connect • Undo if needed',
    p1: 'Player 1', p2: 'Player 2',
    undo: 'Undo', newGame: 'New game', sure: 'Sure?',
    again: 'Play again', menu: 'Menu',
    winP1: '🏆 Player 1 wins!', winP2: '🏆 Player 2 wins!', draw: '🤝 It\'s a draw!',
    sound: 'Sound', fullscreen: 'Fullscreen'
  }
};
let lang = store.get('dl-lang') || ((navigator.language || '').toLowerCase().startsWith('it') ? 'it' : 'en');
const t = (k) => I18N[lang][k];

/* =============================================================
   SOUND – synthesised with the Web Audio API (no audio files)
   ============================================================= */
const Sound = (() => {
  let ac = null, out = null;
  let muted = store.get('dl-muted') === '1';
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      out = ac.createGain();
      out.gain.value = 0.8;
      out.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, o = {}) {
    if (muted) return;
    const c = ctx(); if (!c) return;
    const { type = 'sine', dur = 0.15, vol = 0.25, at = 0, attack = 0.006, to = null } = o;
    const t0 = c.currentTime + at + 0.01;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(o = {}) {
    if (muted) return;
    const c = ctx(); if (!c) return;
    const { dur = 0.05, vol = 0.2, freq = 3000, q = 0.9, at = 0 } = o;
    const t0 = c.currentTime + at + 0.01;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(bp).connect(g).connect(out);
    src.start(t0);
  }

  return {
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('dl-muted', muted ? '1' : '0'); if (!muted) this.ui(); return muted; },
    unlock() { if (!muted) ctx(); },
    // soft tick while dragging over a new line
    tick() { tone(2200, { dur: 0.03, vol: 0.035 }); },
    // menu / button blip
    ui() { tone(880, { dur: 0.07, vol: 0.12 }); tone(1320, { dur: 0.06, vol: 0.05, at: 0.03 }); },
    // a line is placed – each player has their own pitch
    line(player) {
      const f = player === 1 ? 330 : 247;
      noise({ dur: 0.04, vol: 0.28, freq: 3400 });
      tone(f, { type: 'triangle', dur: 0.14, vol: 0.3, to: f * 1.6 });
    },
    // a box is closed – the pitch climbs with every box in a streak
    box(streak, count) {
      noise({ dur: 0.035, vol: 0.22, freq: 3400 });
      const i = Math.min(streak - 1, SCALE.length - 2);
      tone(SCALE[i], { type: 'triangle', dur: 0.38, vol: 0.24, at: 0.03 });
      tone(SCALE[i] * 2, { dur: 0.28, vol: 0.08, at: 0.03 });
      if (count > 1) {
        tone(SCALE[i + 1], { type: 'triangle', dur: 0.42, vol: 0.24, at: 0.14 });
        tone(SCALE[i + 1] * 2, { dur: 0.3, vol: 0.08, at: 0.14 });
      }
    },
    undo() { tone(560, { dur: 0.2, vol: 0.18, to: 220 }); noise({ dur: 0.08, vol: 0.08, freq: 1200, at: 0.02 }); },
    newGame() { [392, 523.25, 659.25].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.16, vol: 0.18, at: i * 0.07 })); },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, { type: 'triangle', dur: i === 3 ? 0.8 : 0.22, vol: 0.24, at: i * 0.12 }));
      [1318.51, 1567.98, 2093].forEach((f, i) => tone(f, { dur: 0.45, vol: 0.07, at: 0.5 + i * 0.07 }));
    },
    draw() {
      [523.25, 493.88, 523.25].forEach((f, i) =>
        tone(f, { type: 'triangle', dur: i === 2 ? 0.5 : 0.22, vol: 0.2, at: i * 0.18 }));
    }
  };
})();

/* =============================================================
   GAME STATE
   ============================================================= */
const state = {
  h: [], v: [], boxes: [],     // 0 = empty, 1/2 = owner
  history: [],                 // {type, r, c, player, closed:[[r,c],...]}
  player: 1,
  scores: { 1: 0, 2: 0 },
  over: false,
  streak: 0
};
const anim = { lines: new Map(), boxes: new Map() };   // key -> start time
const lineKey = (m) => `${m.type}${m.r},${m.c}`;

function resetState() {
  state.h = grid(ROWS, COLS - 1);
  state.v = grid(ROWS - 1, COLS);
  state.boxes = grid(ROWS - 1, COLS - 1);
  state.history = [];
  state.player = 1;
  state.scores = { 1: 0, 2: 0 };
  state.over = false;
  state.streak = 0;
  anim.lines.clear();
  anim.boxes.clear();
}

function isSet(m) { return (m.type === 'h' ? state.h : state.v)[m.r][m.c] !== 0; }

function boxDone(r, c) {
  return state.h[r][c] && state.h[r + 1][c] && state.v[r][c] && state.v[r][c + 1];
}

// Pure rule logic: place a line, award boxes, switch turn. Returns closed boxes or null.
function applyMove(m) {
  if (isSet(m)) return null;
  const p = state.player;
  (m.type === 'h' ? state.h : state.v)[m.r][m.c] = p;
  const around = m.type === 'h' ? [[m.r - 1, m.c], [m.r, m.c]] : [[m.r, m.c - 1], [m.r, m.c]];
  const closed = [];
  for (const [r, c] of around) {
    if (r < 0 || c < 0 || r >= ROWS - 1 || c >= COLS - 1) continue;
    if (!state.boxes[r][c] && boxDone(r, c)) {
      state.boxes[r][c] = p;
      state.scores[p]++;
      closed.push([r, c]);
    }
  }
  state.history.push({ type: m.type, r: m.r, c: m.c, player: p, closed });
  if (!closed.length) state.player = 3 - p;
  state.over = state.scores[1] + state.scores[2] === TOTAL_BOXES;
  return closed;
}

// A move made by a player: rules + sound + animation + save
function playMove(m) {
  const mover = state.player;
  const closed = applyMove(m);
  if (closed === null) return;
  const now = performance.now();
  anim.lines.set(lineKey(m), now);
  closed.forEach(([r, c], i) => anim.boxes.set(`${r},${c}`, now + 90 + i * 110));

  if (closed.length) {
    state.streak++;
    Sound.box(state.streak, closed.length);
    vibrate(closed.length > 1 ? [35, 40, 35] : 35);
    bumpScore(mover);
  } else {
    state.streak = 0;
    Sound.line(mover);
    vibrate(8);
  }
  save();
  updateHUD();
  requestDraw();
  if (state.over) setTimeout(() => showResult(true), 550);
}

function undo() {
  if (!state.history.length) return;
  const last = state.history.pop();
  (last.type === 'h' ? state.h : state.v)[last.r][last.c] = 0;
  last.closed.forEach(([r, c]) => {
    state.boxes[r][c] = 0;
    state.scores[last.player]--;
    anim.boxes.delete(`${r},${c}`);
  });
  anim.lines.delete(lineKey(last));
  state.player = last.player;
  state.over = false;
  state.streak = 0;
  hideResult();
  Sound.undo();
  vibrate(15);
  save();
  updateHUD();
  requestDraw();
}

function newGame(withSound = true) {
  resetState();
  disarmNew();
  hideResult();
  store.del('dl-save');
  if (withSound) Sound.newGame();
  updateHUD();
  requestDraw();
}

/* ---------- autosave: survives closing the app ---------- */
function save() {
  if (!state.history.length || state.over) { store.del('dl-save'); return; }
  store.set('dl-save', JSON.stringify(state.history.map((m) => [m.type, m.r, m.c])));
}
function restore() {
  resetState();
  let moves;
  try { moves = JSON.parse(store.get('dl-save') || '[]'); } catch (e) { moves = []; }
  for (const [type, r, c] of moves) {
    const ok = (type === 'h' || type === 'v') && Number.isInteger(r) && Number.isInteger(c) &&
      r >= 0 && c >= 0 && r < (type === 'h' ? ROWS : ROWS - 1) && c < (type === 'h' ? COLS - 1 : COLS);
    if (!ok || applyMove({ type, r, c }) === null) { resetState(); store.del('dl-save'); return; }
  }
}
const gameInProgress = () => state.history.length > 0 && !state.over;

/* =============================================================
   RENDERING (crisp on high-DPI screens, animated)
   ============================================================= */
const canvas = $('#board');
const ctx = canvas.getContext('2d');
let geo = { w: 0, h: 0, s: 0, ox: 0, oy: 0, dpr: 1 };
let preview = null;
let rafId = 0;

function layout() {
  const rect = $('#board-wrap').getBoundingClientRect();
  const w = Math.floor(rect.width), h = Math.floor(rect.height);
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const s = Math.min(w / (COLS - 0.05), h / (ROWS - 0.05), 120);   // leaves room for the board edge
  geo = { w, h, s, dpr, ox: (w - s * (COLS - 1)) / 2, oy: (h - s * (ROWS - 1)) / 2 };
  requestDraw();
}

function requestDraw() { if (!rafId) rafId = requestAnimationFrame(draw); }

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function segment(m) {
  const { s, ox, oy } = geo;
  const x = ox + m.c * s, y = oy + m.r * s;
  return m.type === 'h' ? [x, y, x + s, y] : [x, y, x, y + s];
}

function strokeSeg(x1, y1, x2, y2, grow = 1) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  ctx.beginPath();
  ctx.moveTo(mx + (x1 - mx) * grow, my + (y1 - my) * grow);
  ctx.lineTo(mx + (x2 - mx) * grow, my + (y2 - my) * grow);
  ctx.stroke();
}

function draw() {
  rafId = 0;
  const { w, h, s, ox, oy, dpr } = geo;
  if (!s) return;
  const now = performance.now();
  let busy = false;
  const lw = clamp(s * 0.085, 4, 10);
  const dotR = clamp(s * 0.075, 4, 9);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';

  // board panel
  const pad = s * 0.45;
  roundRect(ox - pad, oy - pad, s * (COLS - 1) + pad * 2, s * (ROWS - 1) + pad * 2, Math.min(22, s * 0.28));
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // faint dotted guides for the free lines
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = Math.max(2, s * 0.03);
  ctx.setLineDash([0.1, s * 0.12]);
  const forEachLine = (fn) => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) fn({ type: 'h', r, c }, state.h[r][c]);
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) fn({ type: 'v', r, c }, state.v[r][c]);
  };
  forEachLine((m, owner) => {
    if (owner) return;
    const [x1, y1, x2, y2] = segment(m);
    const ins = s * 0.18, horiz = m.type === 'h';
    strokeSeg(x1 + (horiz ? ins : 0), y1 + (horiz ? 0 : ins), x2 - (horiz ? ins : 0), y2 - (horiz ? 0 : ins));
  });
  ctx.setLineDash([]);

  // captured boxes (pop in)
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const owner = state.boxes[r][c];
      if (!owner) continue;
      const start = anim.boxes.get(`${r},${c}`);
      let k = 1;
      if (start !== undefined) {
        const p = (now - start) / 320;
        if (p < 1) busy = true;
        if (p <= 0) continue;
        k = p >= 1 ? 1 : easeBack(p);
      }
      const inset = s * 0.14, size = (s - inset * 2) * k;
      const cx = ox + c * s + s / 2, cy = oy + r * s + s / 2;
      roundRect(cx - size / 2, cy - size / 2, size, size, Math.max(2, s * 0.12 * k));
      ctx.fillStyle = rgba(COLORS[owner], 0.5);
      ctx.fill();
    }
  }

  // placed lines (grow from the middle, with glow)
  ctx.lineWidth = lw;
  forEachLine((m, owner) => {
    if (!owner) return;
    const start = anim.lines.get(lineKey(m));
    let k = 1;
    if (start !== undefined) {
      const p = (now - start) / 160;
      if (p < 1) { busy = true; k = easeOut(Math.max(0, p)); }
    }
    ctx.strokeStyle = COLORS[owner];
    ctx.shadowColor = COLORS[owner];
    ctx.shadowBlur = lw * 1.6;
    strokeSeg(...segment(m), k);
  });
  ctx.shadowBlur = 0;

  // white core marks the most recent move
  const last = state.history[state.history.length - 1];
  if (last) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = lw * 0.34;
    const start = anim.lines.get(lineKey(last));
    const k = start === undefined ? 1 : easeOut(clamp((now - start) / 160, 0, 1));
    strokeSeg(...segment(last), k);
  }

  // drag / tap preview in the current player's colour
  if (preview && !isSet(preview)) {
    ctx.strokeStyle = rgba(COLORS[state.player], 0.55);
    ctx.lineWidth = lw * 1.25;
    strokeSeg(...segment(preview));
  }

  // dots on top
  ctx.fillStyle = COLORS.dot;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.beginPath();
      ctx.arc(ox + c * s, oy + r * s, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (busy) requestDraw();
}

/* =============================================================
   INPUT – swipe between two dots, or tap a gap
   ============================================================= */
function nearestLine(x, y, type, maxDist) {
  const { s, ox, oy } = geo;
  let best = null, bestD = maxDist;
  const check = (m, mx, my) => {
    if (isSet(m)) return;
    const d = Math.hypot(x - mx, y - my);
    if (d < bestD) { bestD = d; best = m; }
  };
  if (type !== 'v') for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++)
    check({ type: 'h', r, c }, ox + c * s + s / 2, oy + r * s);
  if (type !== 'h') for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++)
    check({ type: 'v', r, c }, ox + c * s, oy + r * s + s / 2);
  return best;
}
const sameMove = (a, b) => (a && b ? lineKey(a) === lineKey(b) : a === b);

let drag = null;
function localPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function setPreview(m) {
  if (sameMove(m, preview)) return;
  preview = m;
  if (m) Sound.tick();
  requestDraw();
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.over || drag) return;
  Sound.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const p = localPoint(e);
  drag = { id: e.pointerId, x: p.x, y: p.y };
  setPreview(nearestLine(p.x, p.y, null, geo.s * 0.42));
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = localPoint(e);
  const dx = p.x - drag.x, dy = p.y - drag.y;
  if (Math.hypot(dx, dy) < Math.max(10, geo.s * 0.2)) return;   // still a tap
  const type = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
  setPreview(nearestLine((drag.x + p.x) / 2, (drag.y + p.y) / 2, type, geo.s * 0.6));
});

function endPointer(e, commit) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  const m = preview;
  preview = null;
  if (commit && m) playMove(m);
  requestDraw();
}
canvas.addEventListener('pointerup', (e) => endPointer(e, true));
canvas.addEventListener('pointercancel', (e) => endPointer(e, false));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* =============================================================
   HUD, RESULT, MENU
   ============================================================= */
function updateHUD() {
  $('#score-1').textContent = state.scores[1];
  $('#score-2').textContent = state.scores[2];
  $('#panel-1').classList.toggle('active', !state.over && state.player === 1);
  $('#panel-2').classList.toggle('active', !state.over && state.player === 2);
  $('#btn-undo').disabled = state.history.length === 0;
}

function bumpScore(p) {
  const el = $('#score-' + p);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function showResult(withSound) {
  const a = state.scores[1], b = state.scores[2];
  const winner = a > b ? 1 : b > a ? 2 : 0;
  const card = $('#result-card');
  $('#result-title').textContent = winner === 1 ? t('winP1') : winner === 2 ? t('winP2') : t('draw');
  card.style.color = winner ? COLORS[winner] : '#ffffff';
  $('#result-score').textContent = `${a}  –  ${b}`;
  $('#result').hidden = false;
  updateHUD();
  if (withSound) {
    winner ? Sound.win() : Sound.draw();
    vibrate([60, 60, 120]);
  }
}
function hideResult() { $('#result').hidden = true; }

/* two-tap confirmation for "New game" so a stray tap can't wipe a match */
let armTimer = 0;
function disarmNew() {
  clearTimeout(armTimer);
  $('#btn-new').classList.remove('armed');
  $('#new-label').textContent = t('newGame');
}
$('#btn-new').addEventListener('click', () => {
  const btn = $('#btn-new');
  if (!gameInProgress() || btn.classList.contains('armed')) { newGame(); return; }
  Sound.ui();
  btn.classList.add('armed');
  $('#new-label').textContent = t('sure');
  armTimer = setTimeout(disarmNew, 2500);
});

/* ---------- screens + Android back button ---------- */
function showGameScreen() {
  $('#start').hidden = true;
  $('#game').hidden = false;
  if (!history.state || history.state.screen !== 'game') history.pushState({ screen: 'game' }, '');
  layout();
  if (state.over) showResult(false); else hideResult();
  keepAwake(true);
}
function showStartScreen() {
  $('#game').hidden = true;
  $('#start').hidden = false;
  disarmNew();
  updateMenu();
  keepAwake(false);
}
function goToMenu() {
  Sound.ui();
  if (history.state && history.state.screen === 'game') history.back();
  else showStartScreen();
}
window.addEventListener('popstate', () => { if (!$('#game').hidden) showStartScreen(); });

function updateMenu() {
  const inProgress = gameInProgress();
  $('#btn-continue').hidden = !inProgress;
  $('#btn-play').textContent = inProgress ? t('newGameBig') : t('play');
  $('#btn-play').className = inProgress ? 'btn-secondary' : 'btn-primary';
}

$('#btn-play').addEventListener('click', () => {
  Sound.unlock();
  autoFullscreen();
  newGame(true);
  showGameScreen();
});
$('#btn-continue').addEventListener('click', () => {
  Sound.unlock();
  Sound.ui();
  autoFullscreen();
  showGameScreen();
});
$('#btn-home').addEventListener('click', goToMenu);
$('#btn-result-menu').addEventListener('click', () => { newGame(false); goToMenu(); });
$('#btn-again').addEventListener('click', () => newGame(true));
$('#btn-undo').addEventListener('click', undo);

/* ---------- language ---------- */
function applyLanguage() {
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
  $$('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  $('#btn-lang').textContent = lang === 'it' ? 'IT · en' : 'EN · it';
  updateMenu();
  disarmNew();
  if (!$('#result').hidden) showResult(false);
}
$('#btn-lang').addEventListener('click', () => {
  lang = lang === 'it' ? 'en' : 'it';
  store.set('dl-lang', lang);
  Sound.ui();
  applyLanguage();
});

/* ---------- sound toggle ---------- */
function paintSoundButtons() {
  $$('.js-sound').forEach((b) => {
    b.innerHTML = Sound.muted ? ICONS.mute : ICONS.sound;
    b.style.opacity = Sound.muted ? '0.6' : '1';
  });
}
$$('.js-sound').forEach((b) => b.addEventListener('click', () => { Sound.toggle(); paintSoundButtons(); }));

/* =============================================================
   FULLSCREEN
   ============================================================= */
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isInstalled = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) {} })
      .catch(() => {});
  } catch (e) {}
}
function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return;
  try { const r = fn.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
// On a phone browser (not the installed app) jump to fullscreen when a game starts
function autoFullscreen() {
  if (fsSupported && !isInstalled() && !isFullscreen() && matchMedia('(pointer: coarse)').matches) enterFullscreen();
}
function paintFsButtons() {
  const show = fsSupported && !isInstalled();
  $$('.js-fs').forEach((b) => {
    b.hidden = !show;
    b.innerHTML = isFullscreen() ? ICONS.fsOff : ICONS.fsOn;
  });
}
$$('.js-fs').forEach((b) => b.addEventListener('click', () => {
  Sound.ui();
  isFullscreen() ? exitFullscreen() : enterFullscreen();
}));
document.addEventListener('fullscreenchange', paintFsButtons);
document.addEventListener('webkitfullscreenchange', paintFsButtons);

/* ---------- keep the screen on while playing ---------- */
let wakeLock = null, wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantAwake) keepAwake(true);
});

/* =============================================================
   BOOT
   ============================================================= */
$('#btn-home').innerHTML = ICONS.home;
$('.ic-undo').outerHTML = ICONS.undo;
$('.ic-new').outerHTML = ICONS.newG;
restore();
applyLanguage();
paintSoundButtons();
paintFsButtons();
updateHUD();
new ResizeObserver(layout).observe($('#board-wrap'));
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
