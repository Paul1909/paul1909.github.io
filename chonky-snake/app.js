'use strict';
/* Chonky Snake: classic Snake, except every burger makes the snake a lot fatter and a little longer.
   The body is a fixed-length polyline; its radius grows. All sizes are in arena units. */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'chonky-snake';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = id => document.getElementById(id);
const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

const DIFFS = {
  easy:   { label: 'Easy',   speed: 5.2, grow: 0.075 },
  normal: { label: 'Normal', speed: 6.6, grow: 0.09 },
  hard:   { label: 'Hard',   speed: 8.2, grow: 0.11 },
};
const R0 = 0.5;        // starting body radius (diameter = 1 unit, like one classic Snake cell)
const LEN = 7;         // starting body length
const LEN_GROW = 0.45; // extra length per burger (salad and gym don't shrink it)
const FOOD_R = 0.55, PU_R = 0.62, PU_LIFE = 8, GYM_TIME = 5;
const FOOD_VIS = 0.62, PU_VIS = 0.95;   // drawn radius at scale 1
// Burgers and power-ups grow with the snake, so they stay in proportion as it fattens.
const itemScale = r => 1 + Math.max(0, r - R0) * 0.6;
const U = { x: 0, y: -1 }, D = { x: 0, y: 1 }, L = { x: -1, y: 0 }, R = { x: 1, y: 0 };
const RANKS = [[0, 'Noodle'], [2, 'Snacky Snek'], [4, 'Chubby'], [8, 'Chonker'], [15, "Heckin' Chonker"],
  [25, 'Mega Chonk'], [40, 'Absolute Unit'], [70, 'Oh Lawd He Comin’']];
const COL = { body: '#a3e44f', outline: '#2b6419', spot: 'rgba(46,110,26,.5)', hurt: '#ff7a7a', queasy: '#bfd25c' };

const settings = {
  diff: store.get('diff', 'normal'),
  sound: store.get('sound', true),
  vib: store.get('vib', true),
  arrows: store.get('arrows', true),
};
if (!DIFFS[settings.diff]) settings.diff = 'normal';

const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
let dpr = 1, view = { unit: 20, k: 20, ox: 0, oy: 0 };
let AW = 18, AH = 30;
let state = 'menu', pausedFrom = 'play';
let snake, food, pu, bulges, parts, floats, puddles, score, puIn, reason, dyingT = 0, shake = 0, tAnim = 0;
let recap = null;

function setState(s) { state = s; document.body.dataset.state = s; }

// ---------- geometry ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function pathDist(p, P) {
  if (P.length < 2) return dist(p, P[0]);
  let m = Infinity;
  for (let i = 0; i < P.length - 1; i++) m = Math.min(m, segDist(p, P[i], P[i + 1]));
  return m;
}
function pointAt(P, d) {
  for (let i = 0; i < P.length - 1; i++) {
    const l = dist(P[i], P[i + 1]);
    if (d <= l && l > 0) { const t = d / l; return { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t }; }
    d -= l;
  }
  const e = P[P.length - 1]; return { x: e.x, y: e.y };
}
// Cut the polyline (head first) to a fixed length.
function trim(P, len) {
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const l = dist(P[i], P[i + 1]);
    if (acc + l >= len && l > 0) {
      const t = (len - acc) / l;
      P[i + 1] = { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t };
      P.length = i + 2; return;
    }
    acc += l;
  }
}

// ---------- layout ----------
function layoutArena() {
  const w = stage.clientWidth || 360, h = stage.clientHeight || 640;
  const S = 18, ratio = Math.min(36 / S, Math.max(w, h) / Math.max(1, Math.min(w, h)));
  const long = Math.max(S, Math.round(S * ratio * 2) / 2);
  if (h >= w) { AW = S; AH = long; } else { AW = long; AH = S; }
}
function fit() {
  const w = stage.clientWidth, h = stage.clientHeight, pad = 10;
  const unit = Math.max(1, Math.min((w - 2 * pad) / AW, (h - 2 * pad) / AH));
  view = { unit, k: unit * dpr, ox: (w - AW * unit) / 2 * dpr, oy: (h - AH * unit) / 2 * dpr };
}
function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(stage.clientWidth * dpr));
  cv.height = Math.max(1, Math.round(stage.clientHeight * dpr));
  if (state === 'menu') newGame(); else fit();
}

// ---------- game ----------
const diff = () => DIFFS[settings.diff];
const speed = () => diff().speed * Math.min(1.3, 1 + 0.01 * score) * (snake.gym > 0 ? 1.15 : 1);
const weight = () => (snake.rT / R0) ** 2;
const rankFor = kg => RANKS.reduce((r, [min, name]) => kg >= min ? name : r, RANKS[0][1]);

function newGame() {
  layoutArena(); fit();
  const cx = AW / 2, cy = AH / 2 - 1;
  snake = {
    path: [{ x: cx, y: cy }, { x: cx, y: cy + LEN }], len: LEN, dir: U, prevDir: U, since: Infinity, queue: [],
    r: R0, rT: R0, ang: -Math.PI / 2, pulse: 0, dead: false, gym: 0,
  };
  bulges = []; parts = []; floats = []; puddles = []; score = 0; pu = null; puIn = 6; food = null; shake = 0; recap = null;
  food = findSpot(FOOD_R, FOOD_VIS);
  updateHud(false);
}

function findSpot(rad, vis = rad) {
  const s = snake, rn = s.rT + diff().grow, sc = itemScale(rn);
  rad *= sc;
  const m = Math.max(0.9, 0.75 * rn, vis * sc + 0.15);
  for (let k = 0; k < 400; k++) {
    const p = { x: m + Math.random() * (AW - 2 * m), y: m + Math.random() * (AH - 2 * m) };
    const relax = k > 200;
    if (pathDist(p, s.path) < s.rT * 1.15 + rad + (relax ? 0.1 : 0.8)) continue;
    if (!relax && dist(p, s.path[0]) < 3 + s.rT) continue;
    if (food && dist(p, food) < 2 * sc + 0.5) continue;
    return p;
  }
  return { x: AW / 2, y: m };
}

function startGame() {
  unlockAudio();
  newGame();
  showOverlay(null);
  setState('ready');
  pushHist(); wakeOn();
}

function startMoving(d) {
  const s = snake;
  if (d.x === -s.dir.x && d.y === -s.dir.y) {          // first move backwards: just flip the snake round
    s.path.reverse(); s.ang += Math.PI; s.prevDir = d;
  } else if (d.x !== s.dir.x || d.y !== s.dir.y) {
    s.path.unshift({ x: s.path[0].x, y: s.path[0].y }); s.prevDir = s.dir; s.since = 0;
  } else s.prevDir = d;
  s.dir = d;
  setState('play'); sfx.start();
}

function steer(d) {
  unlockAudio();
  if (state === 'ready') return startMoving(d);
  if (state !== 'play') return;
  const q = snake.queue, last = q.length ? q[q.length - 1] : snake.dir;
  if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
  if (q.length < 3) q.push(d);
}

function applyTurn(d) {
  const s = snake;
  s.path.splice(1, 0, { x: s.path[0].x, y: s.path[0].y });
  s.prevDir = s.dir; s.dir = d; s.since = 0;
}

// Head against the body, ignoring the stretch right behind the head (a 90° corner always passes this test).
function hitsSelf() {
  const s = snake, P = s.path, H = P[0], ex = 2.6 * s.r;
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], l = dist(a, b), s0 = acc;
    acc += l;
    if (acc <= ex || l === 0) continue;
    const t = Math.max(0, (ex - s0) / l);
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (segDist(H, p, b) < 1.7 * s.r) return true;
  }
  return false;
}

function step(h) {
  const s = snake;
  if (s.gym > 0) { s.gym = Math.max(0, s.gym - h); s.rT = Math.max(R0, s.rT - diff().grow * h); }  // gym: burns 1 size per second
  s.r += (s.rT - s.r) * Math.min(1, h * 6);
  if (s.queue.length) {
    const nd = s.queue[0];
    // Doubling back (a U-turn) needs at least one body width of room, or the snake would bite itself.
    const uTurn = nd.x === -s.prevDir.x && nd.y === -s.prevDir.y;
    if (!uTurn || s.since >= 2 * s.r * 1.04) {
      s.queue.shift();
      const same = nd.x === s.dir.x && nd.y === s.dir.y, back = nd.x === -s.dir.x && nd.y === -s.dir.y;
      if (!same && !back) applyTurn(nd);
    }
  }
  const v = speed(), mv = v * h, H = s.path[0];
  H.x += s.dir.x * mv; H.y += s.dir.y * mv; s.since += mv;
  trim(s.path, s.len);   // when len grows the tail simply waits while the head moves on
  for (const b of bulges) b.d += v * 0.5 * h;
  bulges = bulges.filter(b => b.d < s.len + s.r);

  // Walls only count when moving into them, so growing fat next to a wall isn't an instant death.
  const m = s.r * 0.95;
  if ((H.x < m && s.dir.x < 0) || (H.x > AW - m && s.dir.x > 0) || (H.y < m && s.dir.y < 0) || (H.y > AH - m && s.dir.y > 0)) return die('wall');
  if (hitsSelf()) return die('self');
  const isc = itemScale(s.r);
  if (food && dist(H, food) < s.r * 1.1 + FOOD_R * isc) eat();
  if (pu && dist(H, pu) < s.r * 1.1 + PU_R * isc) eatPowerUp();
}

function eat() {
  const s = snake, f = food;
  score++; s.rT += diff().grow; s.len += LEN_GROW; s.pulse = 1; bulges.push({ d: 0 });
  burst(f.x, f.y, ['#f0a848', '#6b3a1f', '#ffd23f', '#5fd45a'], 10);
  floats.push({ x: f.x, y: f.y, text: '+1', c: '#ffffff', t: 0 });
  sfx.munch(); if (score % 5 === 0) setTimeout(() => sfx.burp(), 260);
  buzz(15);
  food = null; food = findSpot(FOOD_R, FOOD_VIS);
  if (!pu && --puIn <= 0) { pu = Object.assign(findSpot(PU_R, PU_VIS), { t: 0, type: Math.random() < 0.55 ? 'salad' : 'gym' }); puIn = 6 + Math.floor(Math.random() * 4); }
  updateHud(true);
}

function eatPowerUp() {
  const s = snake, p = pu; pu = null;
  if (p.type === 'salad') {
    s.rT = Math.max(R0, s.rT - 3 * diff().grow);
    burst(p.x, p.y, ['#3ddc6a', '#b8f05a', '#ff5a4f', '#fff'], 14);
    floats.push({ x: p.x, y: p.y, text: 'Salad! Slimmer', c: '#b8f05a', t: 0 });
    sfx.salad();
  } else {
    s.gym = GYM_TIME;
    burst(p.x, p.y, ['#9aa3b5', '#ff3b4f', '#fff'], 14);
    floats.push({ x: p.x, y: p.y, text: 'Gym time!', c: '#ff8fab', t: 0 });
    sfx.gym();
  }
  buzz([10, 40, 10]);
  updateHud(true);
}

function die(why) {
  reason = why; snake.dead = true; snake.gym = 0; dyingT = 0; shake = 1;
  setState('dying'); sfx.die(); wakeOff();
  if (why === 'wall') {                       // bonk, then two heaves of burger puke
    buzz([40, 160, 120, 300, 200]);
    setTimeout(() => state === 'dying' && sfx.puke(), 300);
    setTimeout(() => state === 'dying' && sfx.puke(), 950);
  } else buzz([40, 60, 90]);
}

const PUKE = ['#c9d43c', '#b3c22e', '#d8e05a', '#e0a050', '#8a5a2b', '#a6b83a'];
function spew(dt) {
  const s = snake, rh = s.r * 1.12, fx = Math.cos(s.ang), fy = Math.sin(s.ang);
  const mx = s.path[0].x + fx * rh * 0.8, my = s.path[0].y + fy * rh * 0.8;
  const n = Math.round(dt * 160 + Math.random());
  for (let i = 0; i < n; i++) {
    const a = s.ang + (Math.random() - 0.5) * 2.2, sp = 5 + Math.random() * 8;
    parts.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.45, max: 0.8,
      c: PUKE[(Math.random() * PUKE.length) | 0], s: 0.1 + Math.random() * 0.16 * (0.7 + s.r), puke: true });
  }
}

function showOver() {
  setState('over');
  const key = 'best-' + settings.diff, best = store.get(key, 0), nb = score > best;
  if (nb) store.set(key, score);
  $('why').textContent = reason === 'wall' ? 'Bonk! Hit the wall and threw up.' : 'Ouch! You bit your own belly.';
  $('rank').textContent = rankFor(weight());
  $('oScore').textContent = score;
  $('oWeight').textContent = weight().toFixed(1);
  $('oBest').textContent = Math.max(best, score);
  $('newBest').hidden = !nb;
  $('oDiff').textContent = diff().label + ' mode';
  recap = buildRecap();
  showOverlay('over');
}

function burst(x, y, colors, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, max: 0.8, c: colors[i % colors.length], s: 0.08 + Math.random() * 0.1 });
  }
}

function pause() {
  if (state !== 'play' && state !== 'ready') return;
  pausedFrom = state; setState('pause'); showOverlay('pause'); wakeOff();
}
function resume() {
  if (state !== 'pause') return;
  setState(pausedFrom); showOverlay(null); pushHist(); wakeOn();
}
function toMenu() {
  newGame(); setState('menu'); showOverlay('menu'); refreshMenu(); wakeOff();
}

// ---------- loop ----------
let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
  tAnim += dt;
  if (state === 'play') {
    const n = Math.max(1, Math.ceil(speed() * dt / 0.08)), h = dt / n;
    for (let i = 0; i < n && state === 'play'; i++) step(h);
    if (pu && state === 'play' && (pu.t += dt) > PU_LIFE) { burst(pu.x, pu.y, ['#6b8f4e', '#3e5c2c'], 8); pu = null; }
  } else if (state === 'dying') {
    dyingT += dt;
    if (reason === 'wall' && ((dyingT > 0.3 && dyingT < 0.7) || (dyingT > 0.95 && dyingT < 1.45))) { spew(dt); shake = Math.max(shake, 0.25); }
    if (dyingT > (reason === 'wall' ? 2.1 : 1.0)) showOver();
  }
  animate(dt);
  render();
  if (state === 'menu') drawMenuArt();
  requestAnimationFrame(frame);
}
function animate(dt) {
  for (const p of parts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt; p.life -= dt;
    if (p.puke) {                              // splash off the walls, then settle into a puddle
      if (p.x < 0.1) { p.x = 0.1; p.vx = Math.abs(p.vx) * 0.35; p.vy *= 1.4; }
      if (p.x > AW - 0.1) { p.x = AW - 0.1; p.vx = -Math.abs(p.vx) * 0.35; p.vy *= 1.4; }
      if (p.y < 0.1) { p.y = 0.1; p.vy = Math.abs(p.vy) * 0.35; p.vx *= 1.4; }
      if (p.y > AH - 0.1) { p.y = AH - 0.1; p.vy = -Math.abs(p.vy) * 0.35; p.vx *= 1.4; }
      if (p.life <= 0 && puddles.length < 260) puddles.push({ x: p.x, y: p.y, r: p.s * (1.3 + Math.random()), c: p.c, a: Math.random() * 3 });
    }
  }
  parts = parts.filter(p => p.life > 0);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 0.9);
  const s = snake;
  s.pulse = Math.max(0, s.pulse - dt * 3);
  if (s.gym > 0 && state === 'play') {          // sweat drops while working out
    if (Math.random() < dt * 9) {
      const a = s.ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.8, H = s.path[0];
      parts.push({ x: H.x + Math.cos(a) * s.r, y: H.y + Math.sin(a) * s.r, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, max: 0.5, c: '#8fd3ff', s: 0.06 + s.r * 0.05 });
    }
    updateHud(false);
  }
  if (!s.dead) {
    const target = Math.atan2(s.dir.y, s.dir.x);
    const d = ((target - s.ang) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    s.ang += d * Math.min(1, dt * 18);
  }
  shake = Math.max(0, shake - dt * 2.5);
}

// ---------- drawing ----------
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b1a12'; ctx.fillRect(0, 0, cv.width, cv.height);
  const j = shake * 0.35 * view.k;
  drawWorld(ctx, view.k, view.ox + (Math.random() - 0.5) * j, view.oy + (Math.random() - 0.5) * j);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(20 * dpr)}px ${FONT}`; ctx.lineJoin = 'round';
  for (const f of floats) {
    const hw = ctx.measureText(f.text).width / 2 + 6 * dpr;
    const x = Math.max(hw, Math.min(cv.width - hw, view.ox + f.x * view.k)), y = view.oy + (f.y - 0.6 - f.t * 1.6) * view.k;
    ctx.globalAlpha = Math.min(1, 2.2 * (1 - f.t / 0.9));
    ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(10,30,15,.85)'; ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.c; ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawWorld(g, k, ox, oy) {
  g.setTransform(k, 0, 0, k, ox, oy);
  g.fillStyle = '#24502f'; rr(g, -0.35, -0.35, AW + 0.7, AH + 0.7, 0.9); g.fill();
  g.fillStyle = '#16341f'; rr(g, 0, 0, AW, AH, 0.6); g.fill();
  g.save(); rr(g, 0, 0, AW, AH, 0.6); g.clip();
  g.fillStyle = 'rgba(255,255,255,.03)';
  for (let x = 0; x < AW; x += 2) for (let y = 0; y < AH; y += 2) if ((x / 2 + y / 2) % 2 === 0) g.fillRect(x, y, 2, 2);
  g.restore();
  for (const d of puddles) { g.fillStyle = d.c; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(d.x, d.y, d.r * 1.25, d.r, d.a, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  if (food) drawBurger(g, food.x, food.y, 1.3 * itemScale(snake.r) * (1 + 0.06 * Math.sin(tAnim * 5)));
  if (pu) drawPowerUp(g, pu);
  const dots = list => { for (const p of list) { g.globalAlpha = Math.min(1, p.life / 0.3); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); } g.globalAlpha = 1; };
  dots(parts.filter(p => !p.puke));
  let body = COL.body;
  if (snake.dead) body = dyingT < 0.4 && Math.floor(dyingT * 8) % 2 === 0 ? COL.hurt : reason === 'wall' ? COL.queasy : COL.body;
  drawSnake(g, snake, bulges, food, body);
  dots(parts.filter(p => p.puke));
}

function drawBurger(g, x, y, sc = 1) {
  g.save(); g.translate(x, y); g.scale(sc, sc);
  g.lineWidth = 0.045; g.lineJoin = 'round'; g.strokeStyle = '#7a3e12';
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0.06, 0.4, 0.44, 0.12, 0, 0, 7); g.fill();
  g.fillStyle = '#e8a04c'; rr(g, -0.42, 0.12, 0.84, 0.2, 0.09); g.fill(); g.stroke();                 // bottom bun
  g.fillStyle = '#6b3a1f'; rr(g, -0.46, -0.03, 0.92, 0.17, 0.08); g.fill();                            // patty
  g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-0.44, -0.06); g.lineTo(0.44, -0.06); g.lineTo(0.3, 0.1);
  g.lineTo(0.18, 0.0); g.lineTo(0.02, 0.12); g.lineTo(-0.12, 0.0); g.lineTo(-0.3, 0.09); g.closePath(); g.fill();  // cheese
  g.strokeStyle = '#5fd45a'; g.lineWidth = 0.08; g.beginPath(); g.moveTo(-0.46, -0.08);
  for (let i = 1; i <= 8; i++) g.lineTo(-0.46 + i * 0.115, -0.08 + (i % 2 ? 0.05 : -0.01)); g.stroke();  // lettuce
  g.fillStyle = '#f0a848'; g.strokeStyle = '#7a3e12'; g.lineWidth = 0.045;
  g.beginPath(); g.moveTo(-0.45, -0.1); g.bezierCurveTo(-0.45, -0.5, 0.45, -0.5, 0.45, -0.1); g.closePath(); g.fill(); g.stroke();  // top bun
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-0.16, -0.3, 0.14, 0.05, -0.3, 0, 7); g.fill();
  g.fillStyle = '#fff6dc';
  for (const [sx, sy, a] of [[-0.2, -0.2, 0.4], [0.02, -0.32, -0.2], [0.2, -0.2, 0.6], [0.06, -0.17, 0.1]]) { g.beginPath(); g.ellipse(sx, sy, 0.045, 0.022, a, 0, 7); g.fill(); }
  g.restore();
}

function drawPowerUp(g, p) {
  const left = PU_LIFE - p.t;
  if (left < 2.5 && Math.floor(p.t * 6) % 2 === 0) return;
  g.save(); g.translate(p.x, p.y); const isc = itemScale(snake.r); g.scale(isc, isc);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(0, 0, 0.95, 0, 7); g.fill();
  g.strokeStyle = p.type === 'salad' ? 'rgba(184,240,90,.7)' : 'rgba(255,143,171,.75)'; g.lineWidth = 0.08; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, 0.95, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.max(0, left / PU_LIFE)); g.stroke();
  g.rotate(Math.sin(tAnim * 3) * 0.15); g.scale(1.25, 1.25);
  g.lineWidth = 0.05; g.lineJoin = 'round';
  if (p.type === 'salad') {
    for (const [lx, ly, c] of [[-0.24, -0.06, '#3ddc6a'], [0.22, -0.08, '#2fb85a'], [0, -0.2, '#5fe07a'], [-0.08, -0.04, '#9be15d']]) {
      g.fillStyle = c; g.beginPath(); g.arc(lx, ly, 0.2, 0, 7); g.fill();
    }
    g.fillStyle = '#ff5a4f'; g.beginPath(); g.arc(0.12, -0.12, 0.09, 0, 7); g.fill();
    g.fillStyle = '#ffe066'; g.beginPath(); g.arc(-0.2, -0.16, 0.06, 0, 7); g.fill();
    g.fillStyle = '#eaf6ff'; g.strokeStyle = '#7aa0c0';
    g.beginPath(); g.moveTo(-0.5, -0.02); g.lineTo(0.5, -0.02); g.bezierCurveTo(0.48, 0.42, -0.48, 0.42, -0.5, -0.02); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#8fd3ff'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(-0.3, 0.12); g.quadraticCurveTo(0, 0.2, 0.3, 0.12); g.stroke();
  } else {
    g.rotate(-0.5);
    g.strokeStyle = '#c9ced8'; g.lineWidth = 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-0.42, 0); g.lineTo(0.42, 0); g.stroke();
    g.fillStyle = '#3a3f4a'; g.strokeStyle = '#1b1e25'; g.lineWidth = 0.04;
    for (const sd of [-1, 1]) {
      rr(g, sd * 0.36 - 0.09, -0.32, 0.18, 0.64, 0.06); g.fill(); g.stroke();
      rr(g, sd * 0.2 - 0.06, -0.24, 0.12, 0.48, 0.05); g.fill(); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-0.4, -0.26, 0.05, 0.4); g.fillRect(0.32, -0.26, 0.05, 0.4);
  }
  g.restore();
}

// s: { path (head first), r, ang, dead, pulse }, bl: bulges [{d}], look: point the eyes follow
function drawSnake(g, s, bl, look, bodyColor) {
  const P = s.path, H = P[0];
  const r = s.r * (1 + 0.025 * Math.sin(tAnim * 7)) * (1 + 0.12 * s.pulse);
  const rh = r * 1.12;
  const blobs = bl.map(b => ({ p: pointAt(P, b.d), r: r * (1.3 - 0.2 * Math.min(1, b.d / (s.len || LEN))) }));
  const poly = (dx, dy) => { g.beginPath(); g.moveTo(P[0].x + dx, P[0].y + dy); for (let i = 1; i < P.length; i++) g.lineTo(P[i].x + dx, P[i].y + dy); };
  const shape = (color, extra, dx = 0, dy = 0, head = true) => {
    g.strokeStyle = g.fillStyle = color; g.lineWidth = 2 * r + 2 * extra; poly(dx, dy); g.stroke();
    for (const b of blobs) { g.beginPath(); g.arc(b.p.x + dx, b.p.y + dy, b.r + extra, 0, 7); g.fill(); }
    if (head) { g.beginPath(); g.arc(H.x + dx, H.y + dy, rh + extra, 0, 7); g.fill(); }
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  shape('rgba(0,0,0,.28)', 0, 0.14, 0.22);
  shape(COL.outline, 0.09);
  const body = bodyColor || COL.body;
  shape(body, 0, 0, 0, false);
  // skin spots, fixed in body coordinates
  g.setLineDash([0.001, 1.15 * r]); g.lineDashOffset = -1.25 * r;
  g.strokeStyle = COL.spot; g.lineWidth = 0.55 * r; poly(0, 0); g.stroke();
  g.setLineDash([]); g.lineDashOffset = 0;
  // sheen
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 0.7 * r; poly(-0.22 * r, -0.3 * r); g.stroke();
  // head
  g.fillStyle = body; g.beginPath(); g.arc(H.x, H.y, rh, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(H.x - 0.25 * rh, H.y - 0.35 * rh, 0.45 * rh, 0.3 * rh, -0.4, 0, 7); g.fill();

  const fx = Math.cos(s.ang), fy = Math.sin(s.ang), nx = -fy, ny = fx;
  const at = (f, n) => ({ x: H.x + fx * f * rh + nx * n * rh, y: H.y + fy * f * rh + ny * n * rh });
  // cheeks appear as it gets chubby
  const cheek = Math.min(0.55, Math.max(0, (s.r - 0.7) * 0.6));
  if (cheek > 0) {
    g.fillStyle = `rgba(255,120,150,${cheek})`;
    for (const sd of [-1, 1]) { const c = at(-0.02, sd * 0.74); g.beginPath(); g.arc(c.x, c.y, 0.2 * rh, 0, 7); g.fill(); }
  }
  // gym headband
  if (s.gym > 0) {
    const b1 = at(-0.12, -1.05), b2 = at(-0.12, 1.05);
    g.save(); g.beginPath(); g.arc(H.x, H.y, rh, 0, 7); g.clip();
    g.strokeStyle = '#ff3b4f'; g.lineWidth = 0.3 * rh; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(b1.x, b1.y); g.lineTo(b2.x, b2.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.07 * rh;
    g.beginPath(); g.moveTo(b1.x, b1.y); g.lineTo(b2.x, b2.y); g.stroke();
    g.restore(); g.lineCap = 'round';
    const k1 = at(-0.25, 0.95), k2 = at(-0.75, 1.25), k3 = at(-0.6, 0.9);
    g.strokeStyle = '#ff3b4f'; g.lineWidth = 0.14 * rh;
    g.beginPath(); g.moveTo(k1.x, k1.y); g.lineTo(k2.x, k2.y); g.moveTo(k1.x, k1.y); g.lineTo(k3.x, k3.y); g.stroke();
  }
  // puking mouth
  if (s.dead && reason === 'wall') {
    const m = at(0.72, 0);
    g.fillStyle = '#3a1020'; g.beginPath(); g.ellipse(m.x, m.y, 0.2 * rh, 0.3 * rh, s.ang, 0, 7); g.fill();
  }
  // tongue
  if (!s.dead && (tAnim + 0.3) % 1.9 < 0.22) {
    const a = at(0.95, 0), b = at(1.45, 0), c1 = at(1.62, 0.16), c2 = at(1.62, -0.16);
    g.strokeStyle = '#ff3d6e'; g.lineWidth = Math.max(0.05, 0.09 * rh);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c1.x, c1.y); g.moveTo(b.x, b.y); g.lineTo(c2.x, c2.y); g.stroke();
  }
  // nostrils
  g.fillStyle = 'rgba(30,70,20,.7)';
  for (const sd of [-1, 1]) { const n = at(0.8, sd * 0.17); g.beginPath(); g.arc(n.x, n.y, 0.05 * rh, 0, 7); g.fill(); }
  // eyes
  const er = 0.3 * rh;
  let lx = fx, ly = fy;
  if (look) { const dx = look.x - H.x, dy = look.y - H.y, l = Math.hypot(dx, dy) || 1; lx = dx / l; ly = dy / l; }
  const blink = !s.dead && tAnim % 3.3 < 0.12;
  for (const sd of [-1, 1]) {
    const e = at(0.3, sd * 0.48);
    g.strokeStyle = COL.outline; g.lineWidth = Math.max(0.04, 0.07 * rh);
    if (s.dead) {
      const q = er * 0.7;
      g.beginPath(); g.moveTo(e.x - q, e.y - q); g.lineTo(e.x + q, e.y + q); g.moveTo(e.x + q, e.y - q); g.lineTo(e.x - q, e.y + q); g.stroke();
    } else if (blink) {
      g.beginPath(); g.moveTo(e.x - nx * er, e.y - ny * er); g.lineTo(e.x + nx * er, e.y + ny * er); g.stroke();
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y, er, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#1b1535'; g.beginPath(); g.arc(e.x + lx * er * 0.42, e.y + ly * er * 0.42, er * 0.5, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x + lx * er * 0.42 - er * 0.18, e.y + ly * er * 0.42 - er * 0.2, er * 0.16, 0, 7); g.fill();
    }
  }
}

// ---------- menu art ----------
const art = $('menuArt'), actx = art.getContext('2d');
function drawMenuArt() {
  const w = art.clientWidth, h = art.clientHeight;
  if (!w || !h) return;
  const d = Math.min(3, window.devicePixelRatio || 1);
  if (art.width !== Math.round(w * d)) { art.width = Math.round(w * d); art.height = Math.round(h * d); }
  actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, art.width, art.height);
  const k = art.width / 16, cy = 3.5;
  actx.setTransform(k, 0, 0, k, 0, 0);
  const pts = [];
  for (let i = 0; i <= 26; i++) { const x = 10.6 - i * 0.22; pts.push({ x, y: cy + Math.sin(i * 0.3 + tAnim * 2.2) * 0.4 * Math.min(1, i / 6) }); }
  const s = { path: pts, r: 1.55 + 0.06 * Math.sin(tAnim * 2), ang: 0, dead: false, pulse: 0 };
  drawSnake(actx, s, [{ d: 3.0 + Math.sin(tAnim) * 0.3 }], { x: 14.3, y: cy }, false);
  drawBurger(actx, 14.2, cy + 0.15, 2.4 + 0.1 * Math.sin(tAnim * 5));
}

// ---------- HUD + overlays ----------
function updateHud(bump) {
  $('score').textContent = score;
  $('weight').textContent = weight().toFixed(1);
  if (bump) { const el = $('hudWeight'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function showOverlay(id) {
  for (const o of ['menu', 'pause', 'over']) $(o).hidden = o !== id;
}
function refreshMenu() {
  for (const b of document.querySelectorAll('#diffSeg button')) b.setAttribute('aria-pressed', String(b.dataset.diff === settings.diff));
  $('menuBest').textContent = store.get('best-' + settings.diff, 0);
  $('sndBtn').setAttribute('aria-pressed', String(settings.sound));
  $('vibBtn').setAttribute('aria-pressed', String(settings.vib));
  for (const b of document.querySelectorAll('.arrowsBtn')) b.setAttribute('aria-pressed', String(settings.arrows));
  document.body.dataset.arrows = settings.arrows ? 'on' : 'off';
}
let toastT = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- share ----------
function buildRecap() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#173520'); bg.addColorStop(1, '#0b1a12');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#a3e44f'; g.font = `900 92px ${FONT}`; g.fillText('Chonky Snake', 540, 118);
  g.fillStyle = '#ff8fab'; g.font = `900 54px ${FONT}`; g.fillText(rankFor(weight()), 540, 192);
  const bw = 920, bh = 800, bx = 80, by = 236;
  const k = Math.min(bw / (AW + 1), bh / (AH + 1));
  drawWorld(g, k, bx + (bw - AW * k) / 2, by + (bh - AH * k) / 2);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const best = Math.max(store.get('best-' + settings.diff, 0), score);
  const cols = [[String(score), 'burgers'], [weight().toFixed(1), 'kg'], [String(best), 'best']];
  cols.forEach(([v, l], i) => {
    const x = 220 + i * 320;
    g.fillStyle = 'rgba(0,0,0,.25)'; rr(g, x - 140, 1066, 280, 150, 28); g.fill();
    g.fillStyle = '#ecffd9'; g.font = `900 78px ${FONT}`; g.fillText(v, x, 1156);
    g.fillStyle = '#93b89c'; g.font = `700 32px ${FONT}`; g.fillText(l, x, 1196);
  });
  g.fillStyle = '#93b89c'; g.font = `700 32px ${FONT}`;
  g.fillText(`${diff().label} mode · ${GAME_URL.replace(/^https?:\/\//, '')}`, 540, 1290);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

async function share() {
  const text = `My snake got to ${weight().toFixed(1)} kg (${score} burgers, rank: ${rankFor(weight())}) in Chonky Snake. Your turn: ${GAME_URL}`;
  const blob = recap ? await recap : null;
  const file = blob && new File([blob], 'chonky-snake-score.png', { type: 'image/png' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Chonky Snake', text, url: GAME_URL });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chonky-snake-score.png'; a.click(); }
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast(GAME_URL); }
}

// ---------- sound ----------
let ac = null, noiseBuf = null;
function unlockAudio() {
  if (!settings.sound) return;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch {}
}
function tone(f0, f1, dur, type = 'triangle', vol = 0.1, delay = 0) {
  if (!settings.sound || !ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, delay = 0) {
  if (!settings.sound || !ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(ac.destination); s.start(t); s.stop(t + dur + 0.02);
}
const sfx = {
  munch() { noise(0.07, 0.35, 1800); noise(0.07, 0.3, 1300, 0.08); tone(520, 260, 0.09, 'triangle', 0.08); },
  burp() {
    if (!settings.sound || !ac) return;
    const t = ac.currentTime + 0.02, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(62, t + 0.45);
    lfo.frequency.value = 28; lg.gain.value = 16; lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(f).connect(g).connect(ac.destination); o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
  },
  salad() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0, 0.12, 'triangle', 0.09, i * 0.06)); },
  gym() { [196, 262, 330, 392, 523].forEach((f, i) => tone(f, 0, 0.1, 'square', 0.05, i * 0.07)); noise(0.08, 0.3, 900, 0.36); },
  puke() {
    if (!settings.sound || !ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.5);
    lfo.frequency.value = 13; lg.gain.value = 30; lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f).connect(g).connect(ac.destination); o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
    noise(0.5, 0.35, 700, 0.05);
  },
  start() { tone(440, 880, 0.12, 'square', 0.05); },
  die() { noise(0.2, 0.5, 300); tone(320, 55, 0.55, 'square', 0.08, 0.02); },
};
const buzz = p => { if (settings.vib) try { navigator.vibrate?.(p); } catch {} };

// ---------- screen on + back gesture ----------
let wl = null;
async function wakeOn() {
  try { if ('wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch {}
}
function wakeOff() { try { wl?.release(); } catch {} wl = null; }
let histPushed = false;
function pushHist() { if (!histPushed) { try { history.pushState({ chonky: 1 }, ''); histPushed = true; } catch {} } }
window.addEventListener('popstate', () => { histPushed = false; if (state === 'play' || state === 'ready') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(); else if (state === 'play' || state === 'ready') wakeOn();
});

// ---------- input ----------
const KEYS = { ArrowUp: U, ArrowDown: D, ArrowLeft: L, ArrowRight: R, w: U, s: D, a: L, d: R, W: U, S: D, A: L, D: R };
window.addEventListener('keydown', e => {
  const d = KEYS[e.key];
  if (d) { e.preventDefault(); flashArrow(Object.keys(DPAD).find(k => DPAD[k] === d)); steer(d); return; }
  if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (state === 'play' || state === 'ready') { e.preventDefault(); pause(); }
    else if (state === 'pause') { e.preventDefault(); resume(); }
  } else if (e.key === 'Enter' && (state === 'menu' || state === 'over')) { e.preventDefault(); startGame(); }
});
let sw = null;
stage.addEventListener('pointerdown', e => {
  unlockAudio();
  sw = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  try { stage.setPointerCapture(e.pointerId); } catch {}
});
stage.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.hypot(dx, dy) < 20) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? R : L) : (dy > 0 ? D : U));
  sw.x = e.clientX; sw.y = e.clientY; sw.moved = true;
});
const endSwipe = e => {
  if (sw && e.pointerId === sw.id && !sw.moved && state === 'ready' && e.type === 'pointerup') steer(snake.dir);
  sw = null;
};
stage.addEventListener('pointerup', endSwipe);
stage.addEventListener('pointercancel', endSwipe);

$('playBtn').onclick = startGame;
$('againBtn').onclick = startGame;
$('restartBtn').onclick = startGame;
$('menuBtn').onclick = toMenu;
$('quitBtn').onclick = toMenu;
$('resumeBtn').onclick = resume;
$('pauseBtn').onclick = () => (state === 'pause' ? resume() : pause());
$('shareBtn').onclick = share;
for (const b of document.querySelectorAll('#diffSeg button')) {
  b.onclick = () => { settings.diff = b.dataset.diff; store.set('diff', settings.diff); refreshMenu(); };
}
$('sndBtn').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); if (settings.sound) { unlockAudio(); sfx.start(); } refreshMenu(); };
for (const b of document.querySelectorAll('.arrowsBtn')) {
  b.onclick = () => { settings.arrows = !settings.arrows; store.set('arrows', settings.arrows); refreshMenu(); };
}
// On-screen arrows: react on touch-down (no click delay) and don't start a swipe underneath.
const DPAD = { up: U, down: D, left: L, right: R };
for (const b of document.querySelectorAll('#dpad button')) {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    flashArrow(b.dataset.d); steer(DPAD[b.dataset.d]); buzz(8);
  });
}
function flashArrow(name) {
  const b = document.querySelector(`#dpad button[data-d="${name}"]`); if (!b) return;
  b.classList.add('on'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 140);
}
$('vibBtn').onclick = () => { settings.vib = !settings.vib; store.set('vib', settings.vib); buzz(20); refreshMenu(); };

window.addEventListener('resize', resize);
setState('menu');
resize();
refreshMenu();
requestAnimationFrame(frame);
