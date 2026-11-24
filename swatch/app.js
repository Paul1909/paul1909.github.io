'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'swatch';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

/* ---------- data and rules ---------- */

const ROUNDS = 10;
const CRAYOLA = SWATCH_DATA.crayola.map(([name, hex]) => ({ brand: 'crayola', name, hex }));
const NEOPASTEL = SWATCH_DATA.neopastel.map(([code, name, hex]) => ({ brand: 'neopastel', code, name, hex }));

// "For him": only the names a man is assumed to know.
const BASIC = new Set(['black', 'blue', 'brown', 'gray', 'grey', 'green', 'orange', 'pink', 'purple', 'red', 'violet', 'white', 'yellow']);
const isBasic = s => BASIC.has(normalize(s.name));

const DECKS = [
  { id: 'crayola', label: 'Crayola', detail: '120 crayons' },
  { id: 'neopastel', label: 'Neopastel', detail: '96 pastels' },
  { id: 'both', label: 'Both', detail: 'Either box' },
];
const MODES = [
  { id: 'close', label: 'Close calls', detail: 'Pick from four similar shades' },
  { id: 'open', label: 'Open box', detail: 'Pick from four random names' },
  { id: 'write', label: 'Write it', detail: 'Type the name yourself' },
];

function poolFor(deck, audience) {
  const full = deck === 'crayola' ? CRAYOLA : deck === 'neopastel' ? NEOPASTEL : CRAYOLA.concat(NEOPASTEL);
  return audience === 'him' ? full.filter(isBasic) : full;
}

const metalOf = s => ({ '499': 'gold', '498': 'silver', '497': 'bronze' })[s.code] || '';

function normalize(v) {
  return v.toLowerCase().replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j - 1], row[j]) + 1;
      prev = row[j]; row[j] = next;
    }
  }
  return row[b.length];
}

// CIE Lab distance, used to find look-alike shades for "Close calls".
function lab(hex) {
  const lin = c => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const r = lin(parseInt(hex.slice(1, 3), 16)), g = lin(parseInt(hex.slice(3, 5), 16)), b = lin(parseInt(hex.slice(5, 7), 16));
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const fy = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const fz = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function choicesFor(answer, pool, mode) {
  if (mode === 'write') return [];
  const others = pool.filter(s => s.brand === answer.brand && s.name !== answer.name);
  let picked;
  if (mode === 'open') picked = shuffle(others).slice(0, 3);
  else {
    const band = others.map(s => ({ s, d: deltaE(answer.hex, s.hex) })).sort((x, y) => x.d - y.d).slice(0, 12).map(x => x.s);
    picked = shuffle(band.length >= 3 ? band : others).slice(0, 3);
  }
  return shuffle([answer, ...picked]);
}

function hue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.12) return 400 + max; // greys go last, light to dark
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360 + 20) % 360;
}

/* ---------- sound and touch feedback ---------- */

let actx = null;
let muted = store.get('muted', false);
function tone(freq, start, dur, type = 'sine', vol = 0.18) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + start, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
const sfx = {
  tap: () => tone(660, 0, 0.06, 'triangle', 0.08),
  ok: () => { tone(660, 0, 0.12, 'triangle'); tone(990, 0.08, 0.2, 'triangle'); },
  bad: () => { tone(180, 0, 0.22, 'sawtooth', 0.08); navigator.vibrate?.(40); },
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.14)),
};

/* ---------- state ---------- */

const S = {
  screen: 'intro',
  audience: store.get('audience', 'her'),
  deck: store.get('deck', 'crayola'),
  mode: store.get('mode', 'close'),
  queue: [], index: 0, choices: [], picked: null, typed: '',
  score: 0, correct: 0, streak: 0, results: [], verdict: null,
};
let pool = [];

const bestKey = () => `${S.audience}:${S.deck}:${S.mode}`;
const readBest = () => store.get('best', {})[bestKey()] || 0;
function writeBest(score) {
  const all = store.get('best', {}), next = Math.max(all[bestKey()] || 0, score);
  all[bestKey()] = next; store.set('best', all); return next;
}

/* ---------- navigation (Android back swipe steps back a screen instead of closing) ---------- */

let depth = 0;
const parentOf = { menu: 'intro', play: 'menu', reveal: 'menu', done: 'menu' };
function forward(screen) { history.pushState({ swatch: screen }, ''); depth++; show(screen); }
function backward() { if (depth > 0) history.back(); else if (parentOf[S.screen]) show(parentOf[S.screen]); }
window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); if (parentOf[S.screen]) show(parentOf[S.screen]); });
if (history.state && history.state.swatch) history.replaceState(null, '');

/* ---------- game flow ---------- */

function start() {
  pool = poolFor(S.deck, S.audience);
  S.queue = shuffle(pool).slice(0, ROUNDS);
  Object.assign(S, { index: 0, score: 0, correct: 0, streak: 0, results: [] });
  setRound();
}

function setRound() {
  const answer = S.queue[S.index];
  Object.assign(S, { choices: choicesFor(answer, pool, S.mode), picked: null, typed: '', verdict: null });
}

function award(hit, guess) {
  S.picked = guess;
  if (hit) {
    S.streak++;
    S.score += (S.mode === 'write' ? 15 : 10) + Math.min(S.streak - 1, 4) * 2;
    S.correct++;
    S.verdict = 'ok';
    sfx.ok();
  } else {
    S.streak = 0;
    S.verdict = 'bad';
    sfx.bad();
  }
  S.results.push({ swatch: S.queue[S.index], ok: hit, picked: guess });
  show('reveal');
}

function choose(i) {
  if (S.screen !== 'play') return;
  const pick = S.choices[i];
  award(pick.name === S.queue[S.index].name, pick.name);
}

function submitTyped(text) {
  if (S.screen !== 'play') return;
  const guess = normalize(text), answer = normalize(S.queue[S.index].name);
  if (!guess) return;
  const d = levenshtein(guess, answer);
  // One slip is forgiven on longer names (phone keyboards).
  award(d === 0 || (d === 1 && answer.length >= 6), text.trim());
}

function next() {
  if (S.index + 1 >= S.queue.length) {
    S.best = writeBest(S.score);
    sfx.done();
    show('done');
    return;
  }
  S.index++;
  setRound();
  show('play');
}

/* ---------- rendering ---------- */

const app = document.getElementById('app');
const hud = document.getElementById('hud');
const muteBtn = document.getElementById('mute');
const backBtn = document.getElementById('back');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Play and reveal are one screen: answering must not redraw it as a new page.
const groupOf = screen => (screen === 'play' || screen === 'reveal' ? 'round' : screen);
function show(screen) {
  const fresh = groupOf(screen) !== groupOf(S.screen) || !app.firstElementChild;
  S.screen = screen;
  // Her: calligraphy. Him: Arial. The intro stays neutral.
  const aud = screen === 'intro' ? '' : S.audience;
  document.body.dataset.aud = aud;
  document.documentElement.dataset.aud = aud;
  backBtn.hidden = screen === 'intro';
  const inRound = screen === 'play' || screen === 'reveal';
  hud.innerHTML = inRound
    ? `${S.streak > 1 ? `🔥${S.streak} · ` : ''}${S.index + 1}/${S.queue.length} · <b>${S.score}</b>`
    : '';
  app.innerHTML = VIEWS[screen]();
  // Fade in only when arriving on a different screen, never on taps within it.
  if (fresh) app.firstElementChild.classList.add('enter');
  if (screen === 'play' && S.mode === 'write') {
    const input = app.querySelector('input');
    setTimeout(() => input && input.focus({ preventScroll: true }), 60);
  }
  if (fresh) window.scrollTo(0, 0);
}

// Menu choices only move the highlight; nothing is redrawn.
function paintMenu() {
  app.querySelectorAll('[data-act=deck]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.deck));
  app.querySelectorAll('[data-act=mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.mode));
  const best = readBest();
  app.querySelector('.best').textContent = best ? `Best ${best}` : '';
}

function crayonStrip(list, fat) {
  return `<div class="crayons${fat ? ' fat' : ''}" aria-hidden="true">${list
    .slice().sort((a, b) => hue(a.hex) - hue(b.hex))
    .map((s, i) => `<i style="background:${s.hex};height:${fat ? 72 + (i % 2) * 8 : 62 + ((i * 37) % 17)}%"></i>`).join('')}</div>`;
}

function chip(s) {
  const metal = metalOf(s);
  return `<div class="well"><div class="chip"${metal ? ` data-metal="${metal}"` : ''} style="background:${s.hex}" role="img" aria-label="Mystery colour"></div></div>`;
}

function progressBar() {
  return `<div class="bar">${S.queue.map((_, i) => {
    const r = S.results[i];
    return `<i class="${r ? (r.ok ? 'ok' : 'bad') : i === S.index ? 'now' : ''}"></i>`;
  }).join('')}</div>`;
}

const VIEWS = {
  intro() {
    return `<section class="screen center">
      <div class="boxes">
        <button class="box her" type="button" data-act="aud" data-v="her">
          ${crayonStrip(CRAYOLA.concat(NEOPASTEL), false)}
          <span class="who">For her</span>
        </button>
        <button class="box him" type="button" data-act="aud" data-v="him">
          ${crayonStrip(CRAYOLA.filter(isBasic), true)}
          <span class="who">For him</span>
        </button>
      </div>
    </section>`;
  },

  menu() {
    const best = readBest();
    return `<section class="screen center">
      <div class="seg three">${DECKS.map(d => `
        <button class="opt" type="button" data-act="deck" data-v="${d.id}" aria-pressed="${S.deck === d.id}"><b>${d.label}</b><small>${S.audience === 'him' ? `${poolFor(d.id, 'him').length} basics` : d.detail}</small></button>`).join('')}
      </div>
      <div class="seg">${MODES.map(m => `
        <button class="opt" type="button" data-act="mode" data-v="${m.id}" aria-pressed="${S.mode === m.id}"><b>${m.label}</b><small>${m.detail}</small></button>`).join('')}
      </div>
      <button class="primary" type="button" data-act="start">Play</button>
      <p class="best">${best ? `Best ${best}` : ''}</p>
    </section>`;
  },

  play() { return roundView(false); },
  reveal() { return roundView(true); },

  done() {
    return `<section class="screen">
      <p class="big">${S.score}</p>
      <p class="of">${S.correct} / ${S.queue.length}${S.best > 0 ? ` · Best ${S.best}` : ''}</p>
      <div class="results">${S.results.map(r => `
        <div class="res ${r.ok ? 'ok' : 'bad'}">
          <i style="background:${r.swatch.hex}"></i>
          <div><b>${esc(r.swatch.name)}</b>${r.ok ? '' : `<s>${esc(r.picked)}</s>`}</div>
          <em>${r.ok ? '✓' : '✕'}</em>
        </div>`).join('')}
      </div>
      <div class="actions">
        <button class="primary" type="button" data-act="start">Again</button>
        <button class="ghost" type="button" data-act="back">Menu</button>
      </div>
    </section>`;
  },
};

function roundView(revealed) {
  const a = S.queue[S.index];
  const writing = S.mode === 'write';
  let body = '';
  if (writing && !revealed) {
    body = `<form class="guess" data-act="guess" autocomplete="off">
      <label class="sr" for="guess">Colour name</label>
      <input id="guess" name="g" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go">
      <button type="submit" aria-label="Guess">→</button>
    </form>`;
  } else if (!writing) {
    // Names only: the choices never show their colours.
    body = `<div class="choices">${S.choices.map((c, i) => {
      const state = !revealed ? '' : c.name === a.name ? 'ok' : c.name === S.picked ? 'bad' : 'idle';
      return `<button class="choice" type="button" data-act="choose" data-v="${i}" ${revealed ? `disabled data-state="${state}"` : ''}>${esc(c.name)}</button>`;
    }).join('')}</div>`;
  }
  const card = revealed ? `<div class="card pop">
      <div class="name"><span class="mark ${S.verdict}">${S.verdict === 'ok' ? '✓' : '✕'}</span><span>${esc(a.name)}</span></div>
      <button class="primary" type="button" data-act="next" aria-label="${S.index + 1 >= S.queue.length ? 'Score' : 'Next'}">→</button>
    </div>` : '';
  return `<section class="screen${revealed ? ' reveal' : ''}${writing ? ' writing' : ''}">
    ${progressBar()}
    ${chip(a)}
    ${body}
    ${card}
  </section>`;
}

/* ---------- input ---------- */

app.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act, v = b.dataset.v;
  if (act !== 'choose' && act !== 'next') sfx.tap();
  if (act === 'aud') { S.audience = v; store.set('audience', v); forward('menu'); }
  else if (act === 'deck') { S.deck = v; store.set('deck', v); paintMenu(); }
  else if (act === 'mode') { S.mode = v; store.set('mode', v); paintMenu(); }
  else if (act === 'start') { start(); if (S.screen === 'menu') forward('play'); else show('play'); }
  else if (act === 'back') backward();
  else if (act === 'choose') choose(+v);
  else if (act === 'next') next();
});

backBtn.addEventListener('click', () => { sfx.tap(); backward(); });

app.addEventListener('submit', e => {
  e.preventDefault();
  submitTyped(e.target.querySelector('input').value);
});

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (S.screen === 'play' && S.mode !== 'write') {
    const n = Number(e.key);
    if (n >= 1 && n <= S.choices.length) { e.preventDefault(); choose(n - 1); }
  } else if (e.key === 'Enter' && (S.screen === 'reveal' || S.screen === 'done')) {
    e.preventDefault();
    if (S.screen === 'reveal') next(); else { start(); show('play'); }
  }
});

function paintMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); }
muteBtn.addEventListener('click', () => { muted = !muted; store.set('muted', muted); paintMute(); if (!muted) sfx.tap(); });
paintMute();

show('intro');
