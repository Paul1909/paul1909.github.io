'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'number-suika';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const { Engine, Bodies, Body, Composite, Events } = Matter;

// ---------- World ----------
const W = 400, H = 640;          // world units (box interior)
const AIM_Y = 50;                // where the held tile hangs
const LINE_Y = 100;              // overflow line
// s = tile side (squares), r = radius (circles), in world units
const LEVELS = [
  { v: 2,    s: 28, r: 15,  c: '#ff8a80', t: '#5b1f1a' },
  { v: 4,    s: 36, r: 20,  c: '#ffb74d', t: '#5a3200' },
  { v: 8,    s: 46, r: 26,  c: '#ffe066', t: '#5a4600' },
  { v: 16,   s: 56, r: 32,  c: '#aed581', t: '#2f4a12' },
  { v: 32,   s: 68, r: 39,  c: '#4db6ac', t: '#ffffff' },
  { v: 64,   s: 81, r: 47,  c: '#4fc3f7', t: '#0b3550' },
  { v: 128,  s: 96, r: 56,  c: '#7986cb', t: '#ffffff' },
  { v: 256,  s: 111, r: 65, c: '#ba68c8', t: '#ffffff' },
  { v: 512,  s: 127, r: 75, c: '#f06292', t: '#ffffff' },
  { v: 1024, s: 145, r: 86, c: '#e53935', t: '#ffffff' },
  { v: 2048, s: 165, r: 98, c: '#2e7d32', t: '#ffffff' },
];
const MAX = LEVELS.length - 1;

let engine, tiles = [], particles = [], popups = [], pendingMerges = [];
// Shape mode: 'circles' or 'squares', each with its own best score.
let mode = store.get('mode', 'circles') === 'squares' ? 'squares' : 'circles';
(function migrateOldBest() {
  // v1 was circles-only and saved one 'best'; keep it as the circles record.
  const old = store.get('best', null);
  if (old !== null) {
    if (store.get('best-circles', 0) < old) store.set('best-circles', old);
    try { localStorage.removeItem(APP + ':best'); } catch {}
  }
})();
const bestOf = m => store.get('best-' + m, 0);
let score = 0, best = bestOf(mode), topLevel = 0;
let aimX = W / 2, holding = null, nextLevel = 0, cooldown = 0;
let running = false, paused = false, over = false, dangerFlash = 0;
let muted = store.get('muted', false);

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let scale = 1, dpr = 1;

function randDrop() {
  // Weighted towards small numbers, like Suika.
  const w = [34, 28, 20, 12, 6];
  let r = Math.random() * 100;
  for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) return i; }
  return 0;
}

// ---------- Physics (Matter.js, fixed step) ----------
function makeEngine() {
  engine = Engine.create({ positionIterations: 10, velocityIterations: 8, enableSleeping: false });
  engine.gravity.y = 1; engine.gravity.scale = 0.0016;
  const T = 200, opts = { isStatic: true, friction: 0.4, restitution: 0.05, label: 'wall' };
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, opts),          // floor
    Bodies.rectangle(-T / 2, H / 2 - 400, T, H + 800, opts),         // left wall
    Bodies.rectangle(W + T / 2, H / 2 - 400, T, H + 800, opts),      // right wall
  ]);
  const collide = e => {
    for (const p of e.pairs) {
      const a = p.bodyA.tile, b = p.bodyB.tile;
      if (a && b && a.lv === b.lv && !a.merging && !b.merging && !a.dead && !b.dead) {
        a.merging = b.merging = true; pendingMerges.push([a, b]);
      }
    }
  };
  Events.on(engine, 'collisionStart', collide);
  Events.on(engine, 'collisionActive', collide);
}

// Full size of a piece: side length for squares, diameter for circles.
const size = lv => (mode === 'squares' ? LEVELS[lv].s : LEVELS[lv].r * 2);

function addTile(lv, x, y, vx = 0, vy = 0, angle = 0, grow = false) {
  const full = size(lv), start = grow ? full * 0.6 : full;
  const body = mode === 'squares'
    ? Bodies.rectangle(x, y, start, start, {
        chamfer: { radius: start * 0.14 }, friction: 0.25, frictionStatic: 0.4,
        restitution: 0.12, density: 0.0012, angle,
      })
    : Bodies.circle(x, y, start / 2, {
        friction: 0.06, frictionStatic: 0.2, restitution: 0.15, density: 0.0012, angle,
      }, 40);
  Body.setVelocity(body, { x: vx, y: vy });
  const t = { lv, body, side: start, age: 0, danger: 0, dead: false, merging: false };
  body.tile = t;
  Composite.add(engine.world, body);
  tiles.push(t);
  return t;
}

function removeTile(t) { t.dead = true; Composite.remove(engine.world, t.body); }

function physicsStep(ms) {
  // Grow freshly merged tiles towards full size, so they don't explode out of a pile.
  for (const t of tiles) {
    const full = size(t.lv);
    if (t.side < full) {
      const ns = Math.min(full, t.side + full * 0.006 * ms);
      Body.scale(t.body, ns / t.side, ns / t.side);
      t.side = ns;
    }
  }
  Engine.update(engine, ms);
  if (pendingMerges.length) {
    const list = pendingMerges; pendingMerges = [];
    for (const [a, b] of list) doMerge(a, b);
    tiles = tiles.filter(t => !t.dead);
  }
  for (const t of tiles) t.merging = false;
}

function doMerge(a, b) {
  removeTile(a); removeTile(b);
  const pa = a.body.position, pb = b.body.position;
  const x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2;
  const va = a.body.velocity, vb = b.body.velocity;
  if (a.lv === MAX) {
    // Two 2048s: they vanish for a huge bonus, like two watermelons in Suika.
    gain(4096, x, y);
    burst(x, y, LEVELS[MAX].c, 60);
    sfx.big(); buzz([30, 40, 60]);
    return;
  }
  const lv = a.lv + 1;
  const angle = (a.body.angle + b.body.angle) / 2;
  addTile(lv, x, y, (va.x + vb.x) / 2, (va.y + vb.y) / 4, angle, true);
  gain(LEVELS[lv].v, x, y);
  burst(x, y, LEVELS[lv].c, 10 + lv * 3);
  sfx.merge(lv); buzz(lv >= 8 ? 40 : 15);
  if (lv > topLevel) { topLevel = lv; buildLadder(lv); }
}

function newGame() {
  if (engine) { Events.off(engine); Composite.clear(engine.world, false); Engine.clear(engine); }
  makeEngine();
  tiles = []; particles = []; popups = []; pendingMerges = [];
  score = 0; topLevel = 0; over = false; paused = false; cooldown = 0.3;
  best = bestOf(mode); stepAcc = 0;
  holding = randDrop(); nextLevel = randDrop();
  aimX = W / 2;
  updateHud(); buildLadder();
  hideAll(); running = true;
  wake();
}

function gain(n, x, y) {
  score += n;
  popups.push({ x, y, txt: '+' + n, t: 0 });
  if (score > best) { best = score; store.set('best-' + mode, best); }
  updateHud();
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5 + Math.random() * 0.4, t: 0, c: color, r: 2 + Math.random() * 4 });
  }
}

const clampAim = lv => { const h = size(lv) / 2; return Math.max(h, Math.min(W - h, aimX)); };

function drop() {
  if (!running || paused || over || cooldown > 0 || holding === null) return;
  addTile(holding, clampAim(holding), AIM_Y, 0, 1);
  holding = null; cooldown = 0.5;
  sfx.drop(); buzz(8);
}

const STEP_MS = 1000 / 120;
let stepAcc = 0;
function update(dt) {
  if (cooldown > 0) {
    cooldown -= dt;
    if (cooldown <= 0 && holding === null) { holding = nextLevel; nextLevel = randDrop(); updateHud(); }
  }
  // Matter.js needs an exact, constant step; leftover time carries over to the next frame.
  stepAcc += dt * 1000;
  let n = 0;
  while (stepAcc >= STEP_MS && n++ < 8) { physicsStep(STEP_MS); stepAcc -= STEP_MS; }
  if (n >= 8) stepAcc = 0;

  let danger = false;
  for (const t of tiles) {
    t.age += dt;
    const b = t.body;
    if (t.age > 1.2 && b.bounds.min.y < LINE_Y && Math.abs(b.velocity.y) < 2) {
      t.danger += dt; danger = true;
      if (t.danger > 2.2) { gameOver(); break; }
    } else t.danger = Math.max(0, t.danger - dt * 2);
  }
  dangerFlash = danger ? dangerFlash + dt : 0;

  for (const p of particles) { p.t += dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  particles = particles.filter(p => p.t < p.life);
  for (const p of popups) p.t += dt;
  popups = popups.filter(p => p.t < 0.9);
}

function gameOver() {
  over = true; running = false;
  sfx.over(); buzz([60, 60, 120]);
  $('overText').innerHTML = `${mode === 'squares' ? '■ Squares' : '● Circles'}<br>Score <b>${score}</b><br>Biggest number: <b>${LEVELS[topLevel].v}</b>` + (score >= best && score > 0 ? '<br>🏆 New best!' : '');
  setTimeout(() => $('overOv').classList.add('show'), 600);
}

// ---------- Rendering ----------
const PAD = 14; // wall thickness in world units
function resize() {
  const st = $('stage').getBoundingClientRect();
  const availW = st.width - 20, availH = st.height - 8;
  scale = Math.min(availW / (W + PAD * 2), availH / (H + PAD));
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = (W + PAD * 2) * scale, ch = (H + PAD) * scale;
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}

function drawTile(x, y, s, angle, lv) {
  const L = LEVELS[lv], h = s / 2, r = s * 0.14;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  // body with a little bottom "lip" like a 2048 tile
  ctx.fillStyle = darken(L.c, 0.22);
  roundRect(-h, -h, s, s, r); ctx.fill();
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, lighten(L.c, 0.3));
  g.addColorStop(1, L.c);
  ctx.fillStyle = g;
  roundRect(-h, -h, s, s - Math.max(2, s * 0.07), r); ctx.fill();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  roundRect(-h + s * 0.1, -h + s * 0.08, s * 0.32, s * 0.09, s * 0.045); ctx.fill();
  const str = String(L.v);
  const f = s * (str.length <= 1 ? 0.58 : str.length === 2 ? 0.5 : str.length === 3 ? 0.4 : 0.31);
  ctx.font = `800 ${f}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = L.t;
  ctx.fillText(str, 0, f * 0.04 - s * 0.02);
  ctx.restore();
}

function drawBall(x, y, d, angle, lv) {
  const L = LEVELS[lv], r = d / 2;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, lighten(L.c, 0.45));
  g.addColorStop(0.7, L.c);
  g.addColorStop(1, darken(L.c, 0.18));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.strokeStyle = darken(L.c, 0.3); ctx.stroke();
  // shine stays at the top-left (light source); the number rolls with the ball
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  const str = String(L.v);
  const f = r * (str.length <= 1 ? 1.05 : str.length === 2 ? 0.9 : str.length === 3 ? 0.7 : 0.56);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.font = `800 ${f}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = L.t;
  ctx.fillText(str, 0, f * 0.06);
  ctx.restore();
}
const drawPiece = (x, y, d, angle, lv) => (mode === 'squares' ? drawTile : drawBall)(x, y, d, angle, lv);

function render() {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, W + PAD * 2, H + PAD);
  // box
  ctx.fillStyle = '#8a5528';
  roundRect(0, 0, W + PAD * 2, H + PAD, 18); ctx.fill();
  ctx.fillStyle = '#c98b4f';
  roundRect(3, 0, W + PAD * 2 - 6, H + PAD - 4, 16); ctx.fill();
  ctx.translate(PAD, 0);
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(201,139,79,.12)'; ctx.lineWidth = 1;
  for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // overflow line
  const flashing = dangerFlash > 0 && Math.floor(dangerFlash * 6) % 2 === 0;
  ctx.setLineDash([10, 8]); ctx.lineWidth = flashing ? 4 : 2;
  ctx.strokeStyle = flashing ? '#e53935' : 'rgba(229,57,53,.45)';
  ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke();
  ctx.setLineDash([]);

  // aim guide + held tile
  if (holding !== null && !over) {
    const s = size(holding), x = clampAim(holding);
    ctx.strokeStyle = 'rgba(91,58,30,.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, AIM_Y + s / 2); ctx.lineTo(x, H); ctx.stroke();
    drawPiece(x, AIM_Y, s, 0, holding);
  }

  for (const t of tiles) drawPiece(t.body.position.x, t.body.position.y, t.side, t.body.angle, t.lv);

  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.font = '800 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = 1 - p.t / 0.9;
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff4d6';
    ctx.strokeText(p.txt, p.x, p.y - 30 - p.t * 50);
    ctx.fillStyle = '#5b3a1e'; ctx.fillText(p.txt, p.x, p.y - 30 - p.t * 50);
  }
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lighten(h, k) { const [r, g, b] = hexToRgb(h); return `rgb(${r + (255 - r) * k | 0},${g + (255 - g) * k | 0},${b + (255 - b) * k | 0})`; }
function darken(h, k) { const [r, g, b] = hexToRgb(h); return `rgb(${r * (1 - k) | 0},${g * (1 - k) | 0},${b * (1 - k) | 0})`; }

// ---------- HUD ----------
function updateHud() {
  $('score').textContent = score;
  $('best').textContent = best;
  $('bestLabel').textContent = mode === 'squares' ? 'Best ■' : 'Best ●';
  document.body.dataset.mode = mode;
  const nb = $('nextBall'), L = LEVELS[nextLevel];
  nb.style.background = L.c; nb.style.color = L.t; nb.textContent = L.v;
}
function buildLadder(pop) {
  const el = $('ladder'); el.innerHTML = '';
  const avail = Math.min(window.innerWidth - 20, 520);
  LEVELS.forEach((L, i) => {
    const s = document.createElement('span');
    const size = Math.round((avail / 15) * (0.6 + i * 0.07));
    s.style.width = s.style.height = size + 'px';
    s.style.background = L.c; s.style.color = L.t;
    s.style.fontSize = Math.max(7, size * (L.v >= 1000 ? 0.28 : L.v >= 100 ? 0.34 : 0.45)) + 'px';
    s.textContent = L.v;
    if (i <= topLevel) s.className = 'got';
    if (i === pop) { s.classList.add('pop'); setTimeout(() => s.classList.remove('pop'), 350); }
    el.appendChild(s);
  });
}

// ---------- Input ----------
function toWorldX(clientX) {
  const r = cv.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * (W + PAD * 2) - PAD;
}
let aiming = false;
cv.addEventListener('pointerdown', e => {
  audio();
  if (!running || paused) return;
  aiming = true; aimX = toWorldX(e.clientX);
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (!running || paused) return;
  if (aiming || e.pointerType === 'mouse') aimX = toWorldX(e.clientX);
});
cv.addEventListener('pointerup', e => {
  if (!aiming) return;
  aiming = false; aimX = toWorldX(e.clientX); drop();
});
cv.addEventListener('pointercancel', () => { aiming = false; });
window.addEventListener('keydown', e => {
  if (!running || paused) return;
  if (e.key === 'ArrowLeft') aimX -= 20;
  else if (e.key === 'ArrowRight') aimX += 20;
  else if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); drop(); }
  aimX = Math.max(0, Math.min(W, aimX));
});

// ---------- Overlays ----------
function hideAll() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); }
function pause() {
  if (!running || paused) return;
  paused = true; $('pauseOv').classList.add('show');
}
function resume() {
  paused = false; hideAll(); last = performance.now();
  history.pushState({ game: 1 }, '');
}
function showStart() {
  running = false; paused = false; hideAll();
  $('bestCircles').textContent = bestOf('circles');
  $('bestSquares').textContent = bestOf('squares');
  setMode(mode);
  $('startOv').classList.add('show');
}
function setMode(m) {
  mode = m; store.set('mode', m);
  document.querySelectorAll('.pick').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  best = bestOf(m); updateHud(); buildLadder();
}
document.querySelectorAll('.pick').forEach(b => b.onclick = () => { audio(); setMode(b.dataset.mode); sfx.drop(); });
$('shapeBtn').onclick = () => { if (engine) { Composite.clear(engine.world, false); } tiles = []; particles = []; popups = []; holding = null; over = false; showStart(); };
$('overShapeBtn').onclick = () => $('shapeBtn').onclick();
$('startBtn').onclick = () => { audio(); history.pushState({ game: 1 }, ''); newGame(); };
$('againBtn').onclick = () => { newGame(); };
$('resumeBtn').onclick = resume;
$('restartBtn').onclick = () => { history.pushState({ game: 1 }, ''); newGame(); };
$('pauseBtn').onclick = () => { if (paused) resume(); else pause(); };
$('muteBtn').onclick = () => { muted = !muted; store.set('muted', muted); $('muteBtn').textContent = muted ? '🔇' : '🔊'; };
$('muteBtn').textContent = muted ? '🔇' : '🔊';
window.addEventListener('popstate', () => pause());   // Android back swipe pauses

// ---------- Sound + vibration ----------
let ac = null;
function audio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
  if (muted || !ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  drop() { tone(320, 0.08, 'triangle', 0.12, 0.6); },
  merge(lv) { const f = 880 * Math.pow(0.86, lv); tone(f, 0.16, 'sine', 0.25, 1.5); tone(f * 1.5, 0.12, 'triangle', 0.08, 1.3); },
  big() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.2), i * 90)); },
  over() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.08), i * 140)); },
};
function buzz(p) { try { if (!muted) navigator.vibrate?.(p); } catch {} }

// ---------- Screen wake lock ----------
let lock = null;
async function wake() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && running) wake(); });

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;  // cap after tab was hidden
  if (running && !paused) update(dt);
  render();
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { resize(); buildLadder(); });
makeEngine();
resize(); showStart();
requestAnimationFrame(loop);

// Exposed for automated testing only.
window.__suika = { get tiles() { return tiles; }, get score() { return score; }, get over() { return over; }, addTile, LEVELS, get mode() { return mode; } };
