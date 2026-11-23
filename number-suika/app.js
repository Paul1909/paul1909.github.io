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

// ---------- World ----------
const W = 400, H = 640;          // world units (box interior)
const AIM_Y = 48;                // where the held ball hangs
const LINE_Y = 96;               // overflow line
const GRAVITY = 1500;
const LEVELS = [
  { v: 2,    r: 15, c: '#ff8a80', t: '#5b1f1a' },
  { v: 4,    r: 20, c: '#ffb74d', t: '#5a3200' },
  { v: 8,    r: 26, c: '#ffe066', t: '#5a4600' },
  { v: 16,   r: 32, c: '#aed581', t: '#2f4a12' },
  { v: 32,   r: 39, c: '#4db6ac', t: '#ffffff' },
  { v: 64,   r: 47, c: '#4fc3f7', t: '#0b3550' },
  { v: 128,  r: 56, c: '#7986cb', t: '#ffffff' },
  { v: 256,  r: 65, c: '#ba68c8', t: '#ffffff' },
  { v: 512,  r: 75, c: '#f06292', t: '#ffffff' },
  { v: 1024, r: 86, c: '#e53935', t: '#ffffff' },
  { v: 2048, r: 98, c: '#2e7d32', t: '#ffffff' },
];
const MAX = LEVELS.length - 1;
const DROPPABLE = 5;             // 2..32 can be dropped

let balls = [], particles = [], popups = [];
let score = 0, best = store.get('best', 0), topLevel = 0;
let aimX = W / 2, holding = null, nextLevel = 0, cooldown = 0;
let running = false, paused = false, over = false, dangerFlash = 0;
let muted = store.get('muted', false);
let idSeq = 1;

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

function newGame() {
  balls = []; particles = []; popups = [];
  score = 0; topLevel = 0; over = false; paused = false; cooldown = 0.3;
  holding = randDrop(); nextLevel = randDrop();
  aimX = W / 2;
  updateHud(); buildLadder();
  hideAll(); running = true;
  wake();
}

// ---------- Physics (position-based, fixed step) ----------
const STEP = 1 / 120, SUB = 4, ITER = 4, VMAX = 1600, VUP = 420, VSIDE = 700;

function addBall(lv, x, y, vx = 0, vy = 0, grow = false) {
  const b = { id: idSeq++, lv, x, y, vx, vy, r: grow ? LEVELS[lv].r * 0.55 : LEVELS[lv].r, age: 0, danger: 0, dead: false, merged: false };
  balls.push(b);
  return b;
}

function step(dt) {
  const h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const b of balls) {
      b.px = b.x; b.py = b.y;
      b.vy += GRAVITY * h;
      b.x += b.vx * h; b.y += b.vy * h;
      const target = LEVELS[b.lv].r;
      if (b.r < target) b.r = Math.min(target, b.r + target * 6 * h);
      b.floor = false;
    }
    const merges = [];
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.dead) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.dead) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          const rr = a.r + b.r;
          if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
          let d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (a.lv === b.lv && !a.merged && !b.merged && it === 0) {
            a.merged = b.merged = true; merges.push([a, b]);
            continue;
          }
          let d = Math.sqrt(d2);
          if (d < 1e-4) { dx = Math.random() - 0.5; dy = -1; d = Math.hypot(dx, dy); }
          const nx = dx / d, ny = dy / d, ov = rr - d;
          const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
          a.x -= nx * ov * (mb / tot); a.y -= ny * ov * (mb / tot);
          b.x += nx * ov * (ma / tot); b.y += ny * ov * (ma / tot);
        }
      }
      for (const b of balls) {
        if (b.x < b.r) b.x = b.r;
        if (b.x > W - b.r) b.x = W - b.r;
        if (b.y > H - b.r) { b.y = H - b.r; b.floor = true; }
        if (b.y < -300) b.y = -300;
      }
    }
    for (const b of balls) {
      b.vx = (b.x - b.px) / h; b.vy = (b.y - b.py) / h;
      // Position corrections turn into velocity; cap it so a crowded box can't launch balls.
      if (b.vy < -VUP) b.vy = -VUP;
      if (b.vx > VSIDE) b.vx = VSIDE; else if (b.vx < -VSIDE) b.vx = -VSIDE;
      if (b.vy > VMAX) b.vy = VMAX;
      const damp = Math.exp(-(b.floor ? 3.5 : 0.35) * h);
      b.vx *= damp; b.vy *= Math.exp(-0.2 * h);
    }
    for (const [a, b] of merges) doMerge(a, b);
    if (merges.length) balls = balls.filter(b => !b.dead);
    for (const b of balls) b.merged = false;
  }
}

function doMerge(a, b) {
  a.dead = b.dead = true;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const vx = (a.vx + b.vx) / 2, vy = (a.vy + b.vy) / 2;
  if (a.lv === MAX) {
    // Two 2048s: they vanish for a huge bonus, like two watermelons in Suika.
    gain(4096, x, y);
    burst(x, y, LEVELS[MAX].c, 60);
    sfx.big(); buzz([30, 40, 60]);
    return;
  }
  const lv = a.lv + 1;
  addBall(lv, x, y, vx, vy * 0.5, true);
  gain(LEVELS[lv].v, x, y);
  burst(x, y, LEVELS[lv].c, 10 + lv * 3);
  sfx.merge(lv); buzz(lv >= 8 ? 40 : 15);
  if (lv > topLevel) { topLevel = lv; buildLadder(lv); }
}

function gain(n, x, y) {
  score += n;
  popups.push({ x, y, txt: '+' + n, t: 0 });
  if (score > best) { best = score; store.set('best', best); }
  updateHud();
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5 + Math.random() * 0.4, t: 0, c: color, r: 2 + Math.random() * 4 });
  }
}

function drop() {
  if (!running || paused || over || cooldown > 0 || holding === null) return;
  const r = LEVELS[holding].r;
  const x = Math.max(r, Math.min(W - r, aimX));
  addBall(holding, x, AIM_Y, 0, 60);
  holding = null; cooldown = 0.5;
  sfx.drop(); buzz(8);
}

function update(dt) {
  if (cooldown > 0) {
    cooldown -= dt;
    if (cooldown <= 0 && holding === null) { holding = nextLevel; nextLevel = randDrop(); updateHud(); }
  }
  let acc = dt;
  while (acc > 1e-6) { const s = Math.min(STEP, acc); step(s); acc -= s; }

  let danger = false;
  for (const b of balls) {
    b.age += dt;
    if (b.age > 1.2 && b.y - b.r < LINE_Y && Math.abs(b.vy) < 120) {
      b.danger += dt; danger = true;
      if (b.danger > 2.2) { gameOver(); break; }
    } else b.danger = Math.max(0, b.danger - dt * 2);
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
  $('overText').innerHTML = `Score <b>${score}</b><br>Biggest number: <b>${LEVELS[topLevel].v}</b>` + (score >= best && score > 0 ? '<br>🏆 New best!' : '');
  setTimeout(() => $('overOv').classList.add('show'), 600);
}

// ---------- Rendering ----------
function resize() {
  const st = $('stage').getBoundingClientRect();
  const availW = st.width - 20, availH = st.height - 8;
  const pad = 14; // wall thickness in world units on each side
  scale = Math.min(availW / (W + pad * 2), availH / (H + pad));
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = (W + pad * 2) * scale, ch = (H + pad) * scale;
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}

function drawBall(x, y, r, lv, alpha = 1) {
  const L = LEVELS[lv];
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, lighten(L.c, 0.45));
  g.addColorStop(0.7, L.c);
  g.addColorStop(1, darken(L.c, 0.18));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.strokeStyle = darken(L.c, 0.3); ctx.stroke();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  const s = String(L.v);
  const f = r * (s.length <= 1 ? 1.05 : s.length === 2 ? 0.9 : s.length === 3 ? 0.7 : 0.56);
  ctx.font = `800 ${f}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = L.t;
  ctx.fillText(s, x, y + f * 0.06);
  ctx.globalAlpha = 1;
}

function render() {
  const pad = 14;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, W + pad * 2, H + pad);
  // box
  ctx.fillStyle = '#8a5528';
  roundRect(0, 0, W + pad * 2, H + pad, 18); ctx.fill();
  ctx.fillStyle = '#c98b4f';
  roundRect(3, 0, W + pad * 2 - 6, H + pad - 4, 16); ctx.fill();
  ctx.translate(pad, 0);
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(0, 0, W, H);
  // subtle grid
  ctx.strokeStyle = 'rgba(201,139,79,.12)'; ctx.lineWidth = 1;
  for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // overflow line
  const flashing = dangerFlash > 0 && Math.floor(dangerFlash * 6) % 2 === 0;
  ctx.setLineDash([10, 8]); ctx.lineWidth = flashing ? 4 : 2;
  ctx.strokeStyle = flashing ? '#e53935' : 'rgba(229,57,53,.45)';
  ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke();
  ctx.setLineDash([]);

  // aim guide + held ball
  if (holding !== null && !over) {
    const r = LEVELS[holding].r;
    const x = Math.max(r, Math.min(W - r, aimX));
    ctx.strokeStyle = 'rgba(91,58,30,.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, AIM_Y + r); ctx.lineTo(x, H); ctx.stroke();
    drawBall(x, AIM_Y, r, holding);
  }

  for (const b of balls) drawBall(b.x, b.y, b.r, b.lv);

  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
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
  return ((clientX - r.left) / r.width) * (W + 28) - 14;
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
resize(); updateHud(); buildLadder();
requestAnimationFrame(loop);

// Exposed for automated testing only.
window.__suika = { get balls() { return balls; }, get score() { return score; }, get over() { return over; }, addBall, LEVELS };
