'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'fruit-2048';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

// The Suika fruit ladder: cherry (2) ... watermelon (2048).
const FRUITS = [
  { e: '🍒', n: 'Cherry',     c: '#fbe3e6' },
  { e: '🍓', n: 'Strawberry', c: '#ffd3cf' },
  { e: '🍇', n: 'Grape',      c: '#e4d5f6' },
  { e: '🍊', n: 'Orange',     c: '#ffdfb0' },
  { e: '🍋', n: 'Lemon',      c: '#fff3a0' },
  { e: '🍎', n: 'Apple',      c: '#ffb4a6' },
  { e: '🍐', n: 'Pear',       c: '#e4f1a0' },
  { e: '🍑', n: 'Peach',      c: '#ffc9a8' },
  { e: '🍍', n: 'Pineapple',  c: '#ffe070' },
  { e: '🍈', n: 'Melon',      c: '#c6ebaa' },
  { e: '🍉', n: 'Watermelon', c: '#8fdc8f' },
];
const MAX = FRUITS.length - 1;
const VAL = lv => 2 ** (lv + 1);
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // up, right, down, left

const $ = id => document.getElementById(id);
const board = $('board');
let grid, score, best = store.get('best', 0), topLv, won, lost, undoState = null, idSeq = 1;
let cell = 80, gap = 8;
let muted = store.get('muted', false);

// ---------- Layout ----------
function layout() {
  const a = $('boardArea').getBoundingClientRect();
  const S = Math.floor(Math.min(a.width, a.height));
  board.style.width = board.style.height = S + 'px';
  gap = Math.round(S * 0.028);
  cell = (S - gap * 5) / 4;
  board.querySelectorAll('.cell').forEach(e => e.remove());
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const d = document.createElement('div');
    d.className = 'cell';
    Object.assign(d.style, { width: cell + 'px', height: cell + 'px', left: 0, top: 0, transform: pos(r, c) });
    board.prepend(d);
  }
  if (grid) for (const row of grid) for (const t of row) if (t && t.el) styleTile(t, true);
  buildLadder();
}
const pos = (r, c) => `translate(${gap + c * (cell + gap)}px, ${gap + r * (cell + gap)}px)`;

// ---------- Tiles ----------
function makeTile(lv, r, c, anim) { return { id: idSeq++, lv, r, c, anim, el: null }; }

function styleTile(t, noAnim) {
  const el = t.el, f = FRUITS[t.lv];
  el.style.width = el.style.height = cell + 'px';
  el.style.left = el.style.top = '0';
  if (noAnim) el.style.transition = 'none';
  el.style.transform = pos(t.r, t.c);
  if (noAnim) { void el.offsetWidth; el.style.transition = ''; }
  const inner = el.firstChild;
  inner.style.background = f.c;
  inner.style.fontSize = (cell * 0.62) + 'px';
  inner.style.boxShadow = t.lv >= 7
    ? `inset 0 -4px 0 rgba(0,0,0,.08), 0 0 ${6 + (t.lv - 6) * 5}px ${2 + (t.lv - 6) * 2}px rgba(243,215,116,${0.25 + (t.lv - 6) * 0.08})`
    : '';
}

function createEl(t) {
  const el = document.createElement('div');
  el.className = 'tile' + (t.anim ? ' ' + t.anim : '');
  const inner = document.createElement('div');
  inner.className = 'in';
  inner.textContent = FRUITS[t.lv].e;
  el.appendChild(inner);
  el.setAttribute('aria-label', FRUITS[t.lv].n);
  t.el = el;
  board.appendChild(el);
  styleTile(t, true);
  t.anim = null;
}

function render(removed = [], poofs = []) {
  for (const row of grid) for (const t of row) {
    if (!t) continue;
    if (!t.el) createEl(t); else styleTile(t);
  }
  for (const t of removed) {
    if (!t.el) continue;
    t.el.classList.add('gone');
    if (poofs.includes(t)) t.el.classList.add('poof');
    styleTile(t);
    const el = t.el;
    setTimeout(() => el.remove(), poofs.includes(t) ? 520 : 120);
  }
  $('score').textContent = score;
  $('best').textContent = best;
  $('undoBtn').disabled = !undoState;
}

function clearTiles() { board.querySelectorAll('.tile').forEach(e => e.remove()); }

// ---------- Game state ----------
function empties() {
  const out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) out.push([r, c]);
  return out;
}
function spawn() {
  const e = empties();
  if (!e.length) return;
  const [r, c] = e[Math.floor(Math.random() * e.length)];
  grid[r][c] = makeTile(Math.random() < 0.9 ? 0 : 1, r, c, 'new');
}
function snapshot() { return { levels: grid.map(row => row.map(t => (t ? t.lv : -1))), score, topLv, won }; }
function restore(s) {
  clearTiles();
  grid = s.levels.map((row, r) => row.map((lv, c) => (lv >= 0 ? makeTile(lv, r, c, null) : null)));
  score = s.score; topLv = s.topLv ?? 0; won = !!s.won;
}
function save() { store.set('game', { ...snapshot(), lost }); }

function newGame() {
  clearTiles();
  grid = [...Array(4)].map(() => Array(4).fill(null));
  score = 0; topLv = 0; won = false; lost = false; undoState = null;
  spawn(); spawn();
  hideOverlays(); render(); buildLadder(); save();
}

function canMove() {
  if (empties().length) return true;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const lv = grid[r][c].lv;
    if (c < 3 && grid[r][c + 1].lv === lv) return true;
    if (r < 3 && grid[r + 1][c].lv === lv) return true;
  }
  return false;
}

function move(dir) {
  if (lost || $('winOv').classList.contains('show')) return;
  const [dr, dc] = DIRS[dir];
  const rows = [0, 1, 2, 3], cols = [0, 1, 2, 3];
  if (dr === 1) rows.reverse();
  if (dc === 1) cols.reverse();
  const before = snapshot();
  const mergedAt = new Set(), removed = [], poofs = [];
  let moved = false, bestMerge = -1, madeMelon = false;

  for (const r of rows) for (const c of cols) {
    const t = grid[r][c];
    if (!t) continue;
    let nr = r, nc = c;
    while (true) {
      const tr = nr + dr, tc = nc + dc;
      if (tr < 0 || tr > 3 || tc < 0 || tc > 3 || grid[tr][tc]) break;
      nr = tr; nc = tc;
    }
    const tr = nr + dr, tc = nc + dc;
    const o = tr >= 0 && tr < 4 && tc >= 0 && tc < 4 ? grid[tr][tc] : null;
    if (o && o.lv === t.lv && !mergedAt.has(tr * 4 + tc)) {
      grid[r][c] = null;
      t.r = tr; t.c = tc;
      removed.push(t, o);
      mergedAt.add(tr * 4 + tc);
      if (t.lv === MAX) {
        // Two watermelons pop and vanish for a bonus, the Suika rule.
        grid[tr][tc] = null; poofs.push(t, o);
        score += 4096; bestMerge = Math.max(bestMerge, MAX + 1);
      } else {
        const lv = t.lv + 1;
        grid[tr][tc] = makeTile(lv, tr, tc, 'merged');
        score += VAL(lv); bestMerge = Math.max(bestMerge, lv);
        if (lv > topLv) topLv = lv;
        if (lv === MAX && !won) madeMelon = true;
      }
      moved = true;
    } else if (nr !== r || nc !== c) {
      grid[r][c] = null; grid[nr][nc] = t; t.r = nr; t.c = nc;
      moved = true;
    }
  }
  if (!moved) { buzz(5); return; }

  undoState = before;
  spawn();
  if (score > best) { best = score; store.set('best', best); }
  render(removed, poofs);
  if (bestMerge >= 0) { sfx.merge(bestMerge); buzz(bestMerge >= 8 ? 35 : 12); buildLadder(bestMerge <= MAX ? bestMerge : -1); }
  else sfx.slide();
  if (poofs.length) sfx.big();
  if (madeMelon) { won = true; setTimeout(() => { $('winOv').classList.add('show'); sfx.big(); }, 300); }
  if (!canMove()) {
    lost = true;
    setTimeout(() => {
      $('loseText').innerHTML = `Score <b>${score}</b><br>Best fruit: <span style="font-size:28px">${FRUITS[topLv].e}</span>`;
      $('loseOv').classList.add('show'); sfx.over();
    }, 400);
  }
  save();
}

function undo() {
  if (!undoState) return;
  restore(undoState); lost = false; undoState = null;
  hideOverlays(); render(); buildLadder(); save();
}

function hideOverlays() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); }

function buildLadder(pop = -1) {
  const el = $('ladder'); el.innerHTML = '';
  const size = Math.min(24, Math.floor((Math.min(window.innerWidth, 520) - 40) / 12));
  FRUITS.forEach((f, i) => {
    const s = document.createElement('span');
    s.textContent = f.e; s.title = `${f.n} = ${VAL(i)}`;
    s.style.fontSize = size + 'px';
    if (i <= (topLv ?? 0)) s.className = 'got';
    if (i === pop) { s.style.transform = 'scale(1.4)'; setTimeout(() => (s.style.transform = ''), 300); }
    el.appendChild(s);
  });
}

// ---------- Input ----------
let sx = 0, sy = 0, tracking = false;
const wrap = $('wrap');
wrap.addEventListener('pointerdown', e => {
  audio();
  if (e.target.closest('button')) return;
  tracking = true; sx = e.clientX; sy = e.clientY;
});
wrap.addEventListener('pointerup', e => {
  if (!tracking) return;
  tracking = false;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : 3);
  else move(dy > 0 ? 2 : 0);
});
wrap.addEventListener('pointercancel', () => (tracking = false));
window.addEventListener('keydown', e => {
  const k = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 }[e.key];
  if (k !== undefined) { e.preventDefault(); audio(); move(k); }
  if ((e.key === 'z' || e.key === 'u') && !e.repeat) undo();
});

$('newBtn').onclick = () => { if (score === 0 || lost || confirmNew()) newGame(); };
$('tryBtn').onclick = newGame;
$('winNewBtn').onclick = newGame;
$('keepBtn').onclick = () => $('winOv').classList.remove('show');
$('undoBtn').onclick = undo;
$('muteBtn').onclick = () => { muted = !muted; store.set('muted', muted); $('muteBtn').textContent = muted ? '🔇' : '🔊'; };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// A second tap on "New" within 2 s confirms, so a stray tap doesn't wipe a good run.
let newArmed = 0;
function confirmNew() {
  if (Date.now() - newArmed < 2000) { $('newBtn').textContent = 'New'; return true; }
  newArmed = Date.now(); $('newBtn').textContent = 'Sure?';
  setTimeout(() => ($('newBtn').textContent = 'New'), 2000);
  return false;
}

// ---------- Sound + vibration ----------
let ac = null;
function audio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (muted || !ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  slide() { tone(220, 0.05, 'triangle', 0.06, 0.8); },
  merge(lv) { const f = 330 * Math.pow(1.12, Math.min(lv, MAX)); tone(f, 0.14, 'sine', 0.22, 1.4); tone(f * 2, 0.08, 'triangle', 0.06, 1.2, 0.03); },
  big() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, 0, i * 0.09)); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.07, 0, i * 0.13)); },
};
function buzz(p) { try { if (!muted) navigator.vibrate?.(p); } catch {} }

// ---------- Start ----------
window.addEventListener('resize', layout);
layout();
const saved = store.get('game', null);
if (saved && saved.levels) {
  restore(saved); lost = !!saved.lost; render(); buildLadder();
  if (lost) { $('loseText').innerHTML = `Score <b>${score}</b>`; $('loseOv').classList.add('show'); }
} else newGame();

// Exposed for automated testing only.
window.__f2048 = { move, get score() { return score; }, setLevels(l) { restore({ levels: l, score: 0, topLv: 0, won: false }); lost = false; hideOverlays(); render(); } };
