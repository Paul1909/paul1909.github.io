'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// localStorage can throw (private mode, storage full); never let that break the app.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- config
const COLORS = [
  { id: 'red',    name: 'Red',    hex: '#ff3b5c' },
  { id: 'blue',   name: 'Blue',   hex: '#2f8bff' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23f' },
  { id: 'green',  name: 'Green',  hex: '#2ee59d' },
];
// Time per turn in ms: starts at `start`, shrinks each round down to `min`. 0 = no timer.
const SPEEDS = {
  chill:  { label: 'Chill',  start: 0,    min: 0 },
  normal: { label: 'Normal', start: 7000, min: 3500 },
  fast:   { label: 'Fast',   start: 4500, min: 2200 },
};
const COLS = 4, ROWS = 6, N = COLS * ROWS;
// How many fingers the screen can track at once (most phones: 10). 0 means mouse only.
const TOUCH_POINTS = navigator.maxTouchPoints > 0 ? navigator.maxTouchPoints : 1;

const settings = Object.assign(
  { players: ['red', 'blue'], speed: 'normal', sound: true, voice: true, vib: true },
  store.get('ft-settings', {})
);
const saveSettings = () => store.set('ft-settings', settings);

// Fingers each player keeps down before they have to start moving one.
function capFor(n) {
  return Math.max(1, Math.min(n === 1 ? 5 : 4, Math.floor(TOUCH_POINTS / n)));
}

// ---------------------------------------------------------------- sound, voice, vibration
let ac = null;
function audio() {
  if (!settings.sound) return null;
  try {
    if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); }
    if (ac.state === 'suspended') ac.resume();
  } catch { return null; }
  return ac;
}
function tone(f, d = 0.12, type = 'sine', g = 0.18, at = 0, f2 = 0) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + at, o = c.createOscillator(), v = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  v.gain.setValueAtTime(0.0001, t);
  v.gain.exponentialRampToValueAtTime(g, t + 0.01);
  v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v).connect(c.destination); o.start(t); o.stop(t + d + 0.03);
}
const sfx = {
  count() { tone(440, 0.1, 'sine', 0.15); },
  go()    { tone(880, 0.25, 'sine', 0.2); },
  target(){ tone(520, 0.09, 'triangle', 0.16); tone(780, 0.12, 'triangle', 0.16, 0.09); },
  hit()   { tone(660, 0.08, 'sine', 0.2); tone(990, 0.14, 'sine', 0.2, 0.07); },
  tick()  { tone(1400, 0.035, 'square', 0.06); },
  out()   { tone(240, 0.5, 'sawtooth', 0.17, 0, 70); },
  win()   { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, 'triangle', 0.18, i * 0.12)); },
};
function buzz(p) { if (settings.vib) { try { navigator.vibrate?.(p); } catch {} } }
function say(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 1.15;
    speechSynthesis.speak(u);
  } catch {}
}

// ---------------------------------------------------------------- screen helpers
let wakeLock = null;
async function wake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function unwake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

function show(id) {
  for (const s of ['menu', 'game', 'over']) $(s).classList.toggle('hidden', s !== id);
  if (id === 'game') layout();
}
const isInstalled = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

// ---------------------------------------------------------------- menu
function renderMenu() {
  const chips = $('chips'); chips.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (settings.players.includes(c.id) ? ' on' : '');
    b.style.setProperty('--c', c.hex); b.textContent = c.name;
    b.addEventListener('click', () => {
      const i = settings.players.indexOf(c.id);
      if (i >= 0) settings.players.splice(i, 1); else settings.players.push(c.id);
      saveSettings(); renderMenu();
    });
    chips.appendChild(b);
  }
  const seg = $('speeds'); seg.innerHTML = '';
  for (const [k, s] of Object.entries(SPEEDS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = s.label; b.className = settings.speed === k ? 'on' : '';
    b.addEventListener('click', () => { settings.speed = k; saveSettings(); renderMenu(); });
    seg.appendChild(b);
  }
  $('tSound').classList.toggle('on', settings.sound);
  $('tVoice').classList.toggle('on', settings.voice);
  $('tVib').classList.toggle('on', settings.vib);
  $('tFs').classList.toggle('hidden', isInstalled() || !document.documentElement.requestFullscreen);
  $('tFs').classList.toggle('on', !!document.fullscreenElement);

  const n = settings.players.length;
  $('start').disabled = n === 0;
  $('start').textContent = n === 0 ? 'Pick a colour' : n === 1 ? 'Start solo' : `Start · ${n} players`;
  const cap = capFor(Math.max(1, n));
  $('rules').innerHTML =
    'Each player owns a colour. On your turn a tile lights up in your colour: put a finger on it and <b>keep it there</b>. ' +
    `Once you have <b>${cap}</b> finger${cap > 1 ? 's' : ''} down, the next turns ask you to <b>move</b> one: the white ↑ finger goes to the new tile. ` +
    'Lift or slide off a tile, or miss the timer, and you are out. Last colour standing wins.';
  const note = $('touchNote');
  const need = n * capFor(Math.max(1, n));
  if (navigator.maxTouchPoints === 0) { note.textContent = 'No touch screen found: with a mouse you can only play solo.'; note.classList.remove('hidden'); }
  else if (n > 1 && TOUCH_POINTS < 10 && need >= TOUCH_POINTS - 1) { note.textContent = `This screen tracks ${TOUCH_POINTS} fingers, so each player keeps ${cap} down.`; note.classList.remove('hidden'); }
  else note.classList.add('hidden');
}
function toggle(key) { return () => { settings[key] = !settings[key]; saveSettings(); renderMenu(); if (key === 'sound') audio(); }; }
$('tSound').addEventListener('click', toggle('sound'));
$('tVoice').addEventListener('click', () => { toggle('voice')(); if (settings.voice) say('Voice on'); });
$('tVib').addEventListener('click', () => { toggle('vib')(); buzz(30); });
$('tFs').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch {}
  renderMenu();
});
document.addEventListener('fullscreenchange', renderMenu);

// ---------------------------------------------------------------- game state
let G = null;
const grid = $('grid');
const tileEls = [];
for (let i = 0; i < N; i++) { const d = document.createElement('div'); d.className = 'tile'; grid.appendChild(d); tileEls.push(d); }

function later(fn, ms) { const g = G; const id = setTimeout(() => { if (G === g) fn(); }, ms); G.timers.push(id); }
const alive = () => G.players.map((p, i) => (p.alive ? i : -1)).filter(i => i >= 0);
const ownedBy = pi => G.tiles.map((t, i) => (t.owner === pi ? i : -1)).filter(i => i >= 0);

function startGame() {
  audio(); // unlock audio on this tap
  const cols = COLORS.filter(c => settings.players.includes(c.id));
  if (!cols.length) return;
  if (G) G.timers.forEach(clearTimeout);
  G = {
    players: cols.map(c => ({ c, alive: true, score: 0, outAt: 0, reason: '' })),
    solo: cols.length === 1,
    cap: capFor(cols.length),
    speed: SPEEDS[settings.speed] || SPEEDS.normal,
    tiles: Array.from({ length: N }, () => ({ owner: -1, pid: null })),
    // pointerId -> { tile, kind: 'held' | 'stray' | 'ignored', owner }
    touches: new Map(),
    cur: -1, turn: 0, target: -1, moveFrom: -1, deadline: 0, limit: 0, lastTick: 0,
    phase: 'countdown', timers: [], outCount: 0,
  };
  if (!history.state || !history.state.ft) history.pushState({ ft: 1 }, '');
  show('game'); wake(); renderAll();
  countdown();
}

function countdown() {
  let n = 3;
  say('Get ready');
  const step = () => {
    if (n > 0) { status('Get ready…', '#e8ecff'); toast(String(n)); sfx.count(); n--; later(step, 750); }
    else { sfx.go(); nextTurn(); }
  };
  step();
}

function nextTurn() {
  if (!G || G.phase === 'over') return;
  if (!alive().length) return gameOver();
  let i = G.cur;
  for (let k = 0; k < G.players.length; k++) { i = (i + 1) % G.players.length; if (G.players[i].alive) break; }
  G.cur = i; G.turn++;
  const p = G.players[i];
  const held = ownedBy(i);
  G.moveFrom = held.length >= G.cap ? held[Math.floor(Math.random() * held.length)] : -1;

  // Free tile = no held finger and no other finger resting on it.
  const busy = new Set();
  G.tiles.forEach((t, k) => { if (t.owner >= 0) busy.add(k); });
  G.touches.forEach(e => { if (e.tile >= 0) busy.add(e.tile); });
  const free = [];
  for (let k = 0; k < N; k++) if (!busy.has(k)) free.push(k);
  if (!free.length) { G.target = -1; status('Board full!', '#fff'); later(nextTurn, 800); return; }
  G.target = free[Math.floor(Math.random() * free.length)];

  const sp = G.speed;
  if (sp.start) {
    const round = Math.floor((G.turn - 1) / alive().length);
    G.limit = Math.max(sp.min, sp.start * Math.pow(0.93, round));
    G.deadline = performance.now() + G.limit;
  } else { G.limit = 0; G.deadline = 0; }
  G.lastTick = 0; G.phase = 'turn';
  sfx.target(); buzz(15);
  say(G.moveFrom >= 0 ? `${p.c.name}, move` : p.c.name);
  renderAll();
}

function claim(pid, t) {
  const pi = G.cur, p = G.players[pi];
  if (G.moveFrom >= 0) {
    const mf = G.tiles[G.moveFrom];
    const e = G.touches.get(mf.pid);
    if (e) { e.kind = 'ignored'; e.owner = -1; } // that finger may now lift freely
    G.tiles[G.moveFrom] = { owner: -1, pid: null };
  }
  G.tiles[t] = { owner: pi, pid };
  G.touches.set(pid, { tile: t, kind: 'held', owner: pi });
  p.score++;
  G.target = -1; G.moveFrom = -1; G.deadline = 0; G.phase = 'wait';
  sfx.hit(); buzz(20);
  renderAll();
  later(nextTurn, 450);
}

function eliminate(pi, reason) {
  const p = G.players[pi];
  if (!p.alive || G.phase === 'over') return;
  p.alive = false; p.reason = reason; p.outAt = ++G.outCount;
  G.tiles.forEach((t, i) => {
    if (t.owner !== pi) return;
    const e = G.touches.get(t.pid);
    if (e) { e.kind = 'ignored'; e.owner = -1; }
    G.tiles[i] = { owner: -1, pid: null };
  });
  sfx.out(); buzz([90, 60, 180]);
  toast(G.solo ? 'Out!' : `${p.c.name} out`, reason, p.c.hex, 1300);
  say(G.solo ? 'Out' : `${p.c.name} is out`);
  const left = alive().length;
  if ((G.solo && left === 0) || (!G.solo && left <= 1)) {
    G.phase = 'over'; G.target = -1; G.moveFrom = -1; G.deadline = 0;
    renderAll(); later(gameOver, 1400); return;
  }
  if (pi === G.cur) {
    G.target = -1; G.moveFrom = -1; G.deadline = 0; G.phase = 'wait';
    renderAll(); later(nextTurn, 1200);
  } else renderAll();
}

function gameOver() {
  if (!G) return;
  G.phase = 'over'; G.timers.forEach(clearTimeout); G.timers = [];
  unwake();
  const title = $('overTitle'), sub = $('overSub'), list = $('ranking');
  list.innerHTML = '';
  if (G.solo) {
    const p = G.players[0];
    const key = 'ft-best-' + settings.speed;
    const best = store.get(key, 0);
    const isBest = p.score > best;
    if (isBest) store.set(key, p.score);
    title.textContent = `${p.score} move${p.score === 1 ? '' : 's'}`;
    title.style.setProperty('--c', p.c.hex);
    sub.textContent = isBest ? `New best on ${SPEEDS[settings.speed].label}!` : `Best on ${SPEEDS[settings.speed].label}: ${best}`;
    addRank(list, '★', p, 'You ' + p.reason);
    if (isBest) sfx.win();
    say(`${p.score} moves`);
  } else {
    const order = [...G.players].sort((a, b) => (b.alive - a.alive) || (b.outAt - a.outAt));
    const w = order[0];
    title.textContent = `${w.c.name} wins!`;
    title.style.setProperty('--c', w.c.hex);
    sub.textContent = `after ${G.turn} turns`;
    order.forEach((p, i) => addRank(list, String(i + 1), p, p.alive ? `still standing · ${p.score} placed` : `${p.reason} · ${p.score} placed`));
    sfx.win(); say(`${w.c.name} wins`);
  }
  show('over');
}
function addRank(list, n, p, why) {
  const row = document.createElement('div'); row.className = 'rank'; row.style.setProperty('--c', p.c.hex);
  const num = document.createElement('div'); num.className = 'n'; num.textContent = n;
  const txt = document.createElement('div');
  const name = document.createElement('div'); name.textContent = p.c.name; name.style.fontWeight = '700';
  const w = document.createElement('div'); w.className = 'why'; w.textContent = why;
  txt.append(name, w); row.append(num, txt); list.appendChild(row);
}

function stopGame() {
  if (G) G.timers.forEach(clearTimeout);
  G = null; unwake();
  try { speechSynthesis.cancel(); } catch {}
}
function goMenu() { stopGame(); show('menu'); renderMenu(); }
function leave() { if (history.state && history.state.ft) history.back(); else goMenu(); }

// ---------------------------------------------------------------- touch handling
// Which tile (0..N-1) is under a screen point, or -1. Gaps between circles count as the nearest
// tile, so a slightly-off finger still lands.
let gridRect = null;
function cellAt(x, y) {
  const r = gridRect || (gridRect = grid.getBoundingClientRect());
  const gx = (x - r.left) / r.width * COLS, gy = (y - r.top) / r.height * ROWS;
  return { gx, gy, i: gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS ? -1 : Math.floor(gy) * COLS + Math.floor(gx) };
}
// A held finger "slips" once it has moved most of a tile away from its tile's centre.
function slipped(tile, x, y) {
  const { gx, gy } = cellAt(x, y);
  const cx = (tile % COLS) + 0.5, cy = Math.floor(tile / COLS) + 0.5;
  return Math.hypot(gx - cx, gy - cy) > 0.95;
}

grid.addEventListener('pointerdown', e => {
  if (!G) return;
  e.preventDefault();
  gridRect = grid.getBoundingClientRect();
  const t = cellAt(e.clientX, e.clientY).i;
  if (G.phase === 'turn' && t >= 0 && t === G.target) { claim(e.pointerId, t); return; }
  G.touches.set(e.pointerId, { tile: t, kind: 'stray', owner: -1 });
  renderTiles();
});

window.addEventListener('pointermove', e => {
  if (!G) return;
  const en = G.touches.get(e.pointerId);
  if (!en) return;
  if (en.kind === 'held') {
    if (slipped(en.tile, e.clientX, e.clientY)) release(e.pointerId, true, cellAt(e.clientX, e.clientY).i);
    return;
  }
  const t = cellAt(e.clientX, e.clientY).i;
  if (t === en.tile) return;
  en.tile = t;
  if (G.phase === 'turn' && t >= 0 && t === G.target) { G.touches.delete(e.pointerId); claim(e.pointerId, t); }
  else renderTiles();
}, { passive: true });

function onUp(e) { if (G) release(e.pointerId, false, -1); }
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

function release(pid, slip, nowTile) {
  const en = G.touches.get(pid);
  if (!en) return;
  if (slip) { en.kind = 'ignored'; en.tile = nowTile; } else G.touches.delete(pid);
  if (en.kind === 'held' || slip) {
    const pi = en.owner;
    const tile = slip ? G.tiles.findIndex(t => t.pid === pid) : en.tile;
    if (tile >= 0) G.tiles[tile] = { owner: -1, pid: null };
    en.owner = -1;
    if (G.phase === 'over' || pi < 0) { renderTiles(); return; }
    // During a move turn, lifting the marked finger is the allowed part of the move.
    if (G.phase === 'turn' && pi === G.cur && tile === G.moveFrom) { G.moveFrom = -1; renderAll(); return; }
    eliminate(pi, slip ? 'slid off a tile' : 'lifted a finger');
    return;
  }
  renderTiles();
}

// ---------------------------------------------------------------- rendering
function status(text, color) { const s = $('status'); s.textContent = text; s.style.color = color; }
let toastTimer = 0;
function toast(big, small = '', color = '#e8ecff', ms = 650) {
  const t = $('toast');
  t.querySelector('.big').textContent = big;
  t.querySelector('.small').textContent = small;
  t.style.setProperty('--c', color);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function renderTiles() {
  if (!G) return;
  const stray = new Set();
  G.touches.forEach(e => { if (e.kind !== 'held' && e.tile >= 0) stray.add(e.tile); });
  tileEls.forEach((el, i) => {
    const t = G.tiles[i];
    let cls = 'tile', c = '';
    if (t.owner >= 0) { cls += ' held'; c = G.players[t.owner].c.hex; if (i === G.moveFrom) cls += ' lift'; }
    else if (i === G.target && G.cur >= 0) { cls += ' target'; c = G.players[G.cur].c.hex; }
    if (stray.has(i) && t.owner < 0) cls += ' stray';
    if (el.className !== cls) el.className = cls;
    el.style.setProperty('--c', c || 'transparent');
  });
}

function renderAll() {
  if (!G) return;
  const pills = $('pills'); pills.innerHTML = '';
  G.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pill' + (p.alive ? '' : ' out') + (i === G.cur && G.phase !== 'over' && p.alive ? ' cur' : '');
    d.style.setProperty('--c', p.c.hex);
    d.textContent = p.alive ? `${ownedBy(i).length}/${G.cap}` : '✕';
    pills.appendChild(d);
  });
  if (G.phase === 'turn') {
    const p = G.players[G.cur];
    status(G.moveFrom >= 0 ? `${p.c.name}: move ↑ finger` : `${p.c.name}: place a finger`, p.c.hex);
  } else if (G.phase === 'wait' && G.cur >= 0) status('Hold still…', '#8a93b8');
  $('turnNo').textContent = G.turn ? `#${G.turn}` : '';
  const bar = $('barFill');
  bar.parentElement.style.visibility = G.speed.start ? 'visible' : 'hidden';
  if (G.phase !== 'turn') bar.style.transform = 'scaleX(0)';
  if (G.cur >= 0) bar.style.setProperty('--c', G.players[G.cur].c.hex);
  renderTiles();
}

function layout() {
  const b = $('board').getBoundingClientRect();
  if (!b.width || !b.height) return;
  const cell = Math.floor(Math.min(b.width / COLS, b.height / ROWS));
  grid.style.width = cell * COLS + 'px';
  grid.style.height = cell * ROWS + 'px';
  grid.style.fontSize = Math.round(cell * 0.42) + 'px';
  gridRect = null;
}
window.addEventListener('resize', layout);

// Timer bar and time-outs.
function loop(now) {
  if (G && G.phase === 'turn' && G.deadline) {
    const left = G.deadline - now;
    $('barFill').style.transform = `scaleX(${Math.max(0, left / G.limit)})`;
    if (left <= 1500 && left > 0) {
      const tk = Math.ceil(left / 500);
      if (tk !== G.lastTick) { G.lastTick = tk; sfx.tick(); }
    }
    if (left <= 0) eliminate(G.cur, 'ran out of time');
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- navigation
$('start').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('toMenu').addEventListener('click', leave);
$('quit').addEventListener('click', leave);
// Android back swipe: leave the game instead of closing the app.
window.addEventListener('popstate', () => { if (!$('menu').classList.contains('hidden')) return; goMenu(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && G && G.phase !== 'over') leave();
});
// Stop long-press menus and pinch from interfering with play.
document.addEventListener('contextmenu', e => e.preventDefault());

renderMenu();
