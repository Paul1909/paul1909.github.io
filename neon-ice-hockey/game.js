(() => {
  'use strict';

  // ---------- Config ----------
  const THEMES = [
    { id: 'ice',       name: 'Ice',       p1: '#22d3ee', p2: '#f43f5e', puck: '#ffffff', rink: '#7dd3fc' },
    { id: 'classic',   name: 'Classic',   p1: '#3b82f6', p2: '#ef4444', puck: '#ffffff', rink: '#94a3b8' },
    { id: 'cyberpunk', name: 'Cyberpunk', p1: '#d946ef', p2: '#06b6d4', puck: '#fde047', rink: '#a78bfa' },
    { id: 'matrix',    name: 'Matrix',    p1: '#22c55e', p2: '#ffffff', puck: '#4ade80', rink: '#16a34a' },
  ];
  const GOAL_OPTIONS = [3, 5, 7, 10];

  // Physics, in rink-heights per second so it feels the same on every phone
  const FRICTION = 0.32;       // ice: the puck glides for a long time
  const E_WALL = 0.88;         // bounciness off the boards
  const E_MALLET = 0.85;       // bounciness off a mallet
  const PUCK_MAX = 2.2;        // max puck speed (rink-heights / s)
  const MALLET_MAX = 4.0;      // max mallet speed (rink-heights / s)
  const GOAL_PAUSE = 1300;     // ms of celebration after a goal

  // Pause gesture
  const EDGE = 36;             // px strip at the bottom/top edge: touches starting here don't grab a mallet
  const SWIPE_DIST = 90;       // px upwards
  const SWIPE_TIME = 700;      // ms

  const S = { START: 'START', READY: 'READY', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING', GOAL: 'GOAL', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

  // ---------- Saved settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('nih.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('nih.' + k, JSON.stringify(v)); } catch {} },
  };
  const settings = {
    theme: THEMES.find(t => t.id === store.get('theme', 'ice')) || THEMES[0],
    goals: GOAL_OPTIONS.includes(store.get('goals', 5)) ? store.get('goals', 5) : 5,
    sound: store.get('sound', true),
    vibrate: store.get('vibrate', true),
  };

  // ---------- Sound effects (synthesised, no files) ----------
  const sfx = {
    ctx: null, out: null, noiseBuf: null, lastHit: 0, lastWall: 0,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.connect(this.ctx.destination);
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.7;
        this.out.connect(comp);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    ok() { return settings.sound && this.ctx && this.ctx.state === 'running'; },
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, to = null, attack = 0.004 } = {}) {
      const c = this.ctx, t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.3, at = 0, type = 'bandpass', freq = 2000, q = 1, to = null } = {}) {
      const c = this.ctx, t = c.currentTime + at;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf;
      f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.out);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    },
    hit(power) {           // mallet strikes puck: plastic "clack"
      if (!this.ok()) return;
      const now = performance.now();
      if (now - this.lastHit < 45) return;
      this.lastHit = now;
      const p = Math.max(0.15, Math.min(1, power));
      this.noise(0.05, { vol: 0.55 * p, freq: 2600, q: 1.2 });
      this.tone(1100 + 500 * p, 0.07, { type: 'triangle', vol: 0.35 * p, to: 500 });
      this.tone(180, 0.08, { vol: 0.25 * p, to: 90 });
    },
    wall(power) {          // puck off the boards: duller "tock"
      if (!this.ok()) return;
      const now = performance.now();
      if (now - this.lastWall < 45) return;
      this.lastWall = now;
      const p = Math.max(0.1, Math.min(1, power));
      this.noise(0.04, { vol: 0.35 * p, type: 'lowpass', freq: 1400 });
      this.tone(420, 0.06, { type: 'triangle', vol: 0.22 * p, to: 220 });
    },
    goal() {               // whoosh + boom + rising arpeggio
      if (!this.ok()) return;
      this.noise(0.5, { vol: 0.35, freq: 400, to: 4000, q: 0.8 });
      this.tone(140, 0.5, { vol: 0.5, to: 45 });
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.1, at: 0.12 + i * 0.09 }));
      this.tone(1047, 0.5, { type: 'sawtooth', vol: 0.07, at: 0.48 });
    },
    count() { if (this.ok()) this.tone(660, 0.13, { type: 'square', vol: 0.1 }); },
    go()    { if (this.ok()) { this.tone(990, 0.3, { type: 'square', vol: 0.12 }); this.tone(1485, 0.3, { type: 'sine', vol: 0.08 }); } },
    win() {
      if (!this.ok()) return;
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
        this.tone(f, i === 6 ? 0.7 : 0.18, { type: 'square', vol: 0.09, at: i * 0.13 }));
      this.tone(262, 1.4, { type: 'sawtooth', vol: 0.05, at: 0 });
    },
    click() { if (this.ok()) this.tone(1500, 0.035, { type: 'triangle', vol: 0.08 }); },
  };

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const bgx = bg.getContext('2d');
  const el = {
    hud: $('hud'), s1: $('s1'), s2: $('s2'),
    readyLayer: $('readyLayer'), r1: $('r1'), r2: $('r2'),
    countLayer: $('countLayer'), c1: $('c1'), c2: $('c2'),
    goalLayer: $('goalLayer'), g1: $('g1'), g2: $('g2'), flash: $('flash'),
    menu: $('menu'), result: $('result'), f1: $('f1'), f2: $('f2'), winText: $('winText'),
    themes: $('themes'), goals: $('goals'),
    startBtn: $('startBtn'), fsBtn: $('fsBtn'), vibBtn: $('vibBtn'), soundBtn: $('soundBtn'),
    pauseSheet: $('pauseSheet'), pauseScore: $('pauseScore'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  };

  // ---------- Game state ----------
  let state = S.START;
  let W = 0, H = 0, dpr = 1, insetTop = 0, insetBottom = 0;
  const rink = { x0: 0, x1: 0, y0: 0, y1: 0, cx: 0, cy: 0, w: 0, h: 0, gL: 0, gR: 0 };
  let R = 28, r = 16;                         // mallet and puck radius
  const m1 = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };   // player 1 (top)
  const m2 = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 };   // player 2 (bottom)
  const puck = { x: 0, y: 0, vx: 0, vy: 0 };
  const trail = [];
  let score1 = 0, score2 = 0, winner = 0, lastScorer = 0;
  let countdownStart = 0, lastCount = -1, goUntil = 0, goalAt = 0;
  let p1Ready = false, p2Ready = false;
  let lastBuzz = 0;

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const buzz = ms => { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } };
  const alpha = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };

  function readInsets() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    insetTop = parseFloat(cs.paddingTop) || 0;
    insetBottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
  }

  // ---------- Layout ----------
  function layout() {
    const old = { ...rink };
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = bg.width = Math.round(W * dpr);
    canvas.height = bg.height = Math.round(H * dpr);
    readInsets();

    const M = 8;
    rink.x0 = M; rink.x1 = W - M;
    rink.y0 = insetTop + M; rink.y1 = H - insetBottom - M;
    rink.w = rink.x1 - rink.x0; rink.h = rink.y1 - rink.y0;
    rink.cx = (rink.x0 + rink.x1) / 2; rink.cy = (rink.y0 + rink.y1) / 2;
    const goalHalf = rink.w * 0.2;
    rink.gL = rink.cx - goalHalf; rink.gR = rink.cx + goalHalf;
    R = clamp(rink.w * 0.085, 22, 46);
    r = clamp(rink.w * 0.05, 13, 27);

    if (old.w) {
      // keep everything where it was, relative to the rink
      const map = o => {
        o.x = rink.x0 + (o.x - old.x0) / old.w * rink.w;
        o.y = rink.y0 + (o.y - old.y0) / old.h * rink.h;
      };
      for (const o of [m1, m2, puck]) map(o);
      m1.tx = m1.x; m1.ty = m1.y; m2.tx = m2.x; m2.ty = m2.y;
      puck.vx *= rink.h / old.h; puck.vy *= rink.h / old.h;
      trail.length = 0;
    } else {
      resetPositions();
    }
    drawRink();
  }

  function resetPositions() {
    m1.x = m1.tx = rink.cx; m1.y = m1.ty = rink.y0 + rink.h * 0.16;
    m2.x = m2.tx = rink.cx; m2.y = m2.ty = rink.y1 - rink.h * 0.16;
    m1.vx = m1.vy = m2.vx = m2.vy = 0;
    puck.x = rink.cx; puck.y = rink.cy; puck.vx = puck.vy = 0;
    trail.length = 0;
  }

  function placePuckFor(player) {
    // the player who conceded gets the puck, resting in their half
    puck.x = rink.cx;
    puck.y = player === 1 ? rink.y0 + rink.h * 0.3 : rink.y1 - rink.h * 0.3;
    puck.vx = puck.vy = 0;
    trail.length = 0;
  }

  function clampMallet(m, side) {
    const minY = side === 1 ? rink.y0 + R : rink.cy + R;
    const maxY = side === 1 ? rink.cy - R : rink.y1 - R;
    return { x: clamp(m.tx, rink.x0 + R, rink.x1 - R), y: clamp(m.ty, minY, maxY) };
  }

  // ---------- Static rink drawing (cached) ----------
  function drawRink() {
    const t = settings.theme, g = bgx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#03060b';
    g.fillRect(0, 0, W, H);

    // ice sheen
    const grad = g.createRadialGradient(rink.cx, rink.cy, 10, rink.cx, rink.cy, Math.max(W, H) * 0.7);
    grad.addColorStop(0, alpha(t.rink, 0.09));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // faint skate scratches (same pattern every time)
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.strokeStyle = 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const x = rink.x0 + rnd() * rink.w, y = rink.y0 + rnd() * rink.h, len = 30 + rnd() * 90, a = rnd() * Math.PI;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 10, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }

    // centre line, circle, dot
    g.shadowBlur = 10; g.shadowColor = t.rink;
    g.strokeStyle = alpha(t.rink, 0.45); g.lineWidth = 2;
    g.beginPath(); g.moveTo(rink.x0, rink.cy); g.lineTo(rink.x1, rink.cy); g.stroke();
    g.strokeStyle = alpha(t.rink, 0.3);
    g.beginPath(); g.arc(rink.cx, rink.cy, rink.w * 0.17, 0, Math.PI * 2); g.stroke();
    g.fillStyle = alpha(t.rink, 0.5);
    g.beginPath(); g.arc(rink.cx, rink.cy, 4, 0, Math.PI * 2); g.fill();

    // goal creases
    const gh = (rink.gR - rink.gL) / 2;
    g.strokeStyle = alpha(t.p1, 0.45); g.shadowColor = t.p1;
    g.beginPath(); g.arc(rink.cx, rink.y0, gh, 0, Math.PI); g.stroke();
    g.strokeStyle = alpha(t.p2, 0.45); g.shadowColor = t.p2;
    g.beginPath(); g.arc(rink.cx, rink.y1, gh, Math.PI, Math.PI * 2); g.stroke();

    // boards, with gaps for the goals
    const cr = 22;
    g.shadowBlur = 16; g.shadowColor = t.rink;
    g.strokeStyle = alpha(t.rink, 0.85); g.lineWidth = 3;
    g.beginPath();
    g.moveTo(rink.gR, rink.y0);
    g.arcTo(rink.x1, rink.y0, rink.x1, rink.y1, cr);
    g.arcTo(rink.x1, rink.y1, rink.x0, rink.y1, cr);
    g.lineTo(rink.gR, rink.y1);
    g.moveTo(rink.gL, rink.y1);
    g.arcTo(rink.x0, rink.y1, rink.x0, rink.y0, cr);
    g.arcTo(rink.x0, rink.y0, rink.x1, rink.y0, cr);
    g.lineTo(rink.gL, rink.y0);
    g.stroke();

    // goal mouths
    for (const [y, c, dir] of [[rink.y0, t.p1, -1], [rink.y1, t.p2, 1]]) {
      g.shadowBlur = 22; g.shadowColor = c;
      g.strokeStyle = c; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(rink.gL, y + dir * 3); g.lineTo(rink.gR, y + dir * 3); g.stroke();
      g.fillStyle = c;
      for (const x of [rink.gL, rink.gR]) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    }
    g.shadowBlur = 0; g.lineCap = 'butt';
  }

  // ---------- State transitions ----------
  function setState(next) {
    state = next;
    const inGame = next === S.READY || next === S.COUNTDOWN || next === S.PLAYING || next === S.GOAL;
    el.hud.classList.toggle('hidden', !(inGame || next === S.PAUSED));
    el.readyLayer.classList.toggle('hidden', next !== S.READY);
    el.countLayer.classList.toggle('hidden', next !== S.COUNTDOWN && !(next === S.PLAYING && performance.now() < goUntil));
    el.goalLayer.classList.toggle('hidden', next !== S.GOAL);
    el.menu.classList.toggle('hidden', !(next === S.START || next === S.GAMEOVER));
    el.pauseSheet.classList.toggle('hidden', next !== S.PAUSED);

    if (next === S.READY) { p1Ready = p2Ready = false; refreshReady(); }
    if (next === S.COUNTDOWN) { countdownStart = performance.now(); lastCount = -1; }
    if (next === S.GAMEOVER) renderMenu();
    if (next === S.PAUSED) el.pauseScore.textContent = `P1 ${score1} — ${score2} P2`;

    if (inGame || next === S.PAUSED) wakeLock.on(); else wakeLock.off();
  }

  function renderScores() { el.s1.textContent = score1; el.s2.textContent = score2; }

  function renderReady() {
    el.r1.classList.toggle('on', p1Ready);
    el.r2.classList.toggle('on', p2Ready);
    el.r1.querySelector('b').textContent = p1Ready ? 'Ready!' : 'Waiting...';
    el.r2.querySelector('b').textContent = p2Ready ? 'Ready!' : 'Waiting...';
  }

  function showCount(text, cls) {
    for (const c of [el.c1, el.c2]) {
      c.querySelector('span').textContent = text;
      c.classList.remove('pop', 'fade');
      void c.offsetWidth;
      c.classList.add(cls);
    }
  }

  function startMatch() {
    sfx.unlock();
    score1 = score2 = 0; winner = 0;
    renderScores();
    resetPositions();
    pushGameHistory();
    setState(S.READY);
  }

  function goalScored(by) {
    if (by === 1) score1++; else score2++;
    lastScorer = by;
    renderScores();
    const color = by === 1 ? settings.theme.p1 : settings.theme.p2;
    for (const g of [el.g1, el.g2]) {
      g.style.color = color;
      g.style.textShadow = `0 0 30px ${color}`;
      const s = g.querySelector('span');
      s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
    }
    el.flash.style.background = color;
    el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on');
    buzz([60, 40, 90]);
    trail.length = 0;

    if (score1 >= settings.goals || score2 >= settings.goals) {
      winner = by;
      sfx.goal();
      setTimeout(() => sfx.win(), 450);
    } else {
      sfx.goal();
    }
    goalAt = performance.now();
    setState(S.GOAL);
  }

  function finishGoal() {
    if (winner) { setState(S.GAMEOVER); return; }
    placePuckFor(lastScorer === 1 ? 2 : 1);
    setState(S.PLAYING);
  }

  function pause() {
    if (state === S.GOAL) {
      if (winner) return;
      placePuckFor(lastScorer === 1 ? 2 : 1);
    }
    if (state === S.READY || state === S.COUNTDOWN || state === S.PLAYING || state === S.GOAL) setState(S.PAUSED);
  }

  // ---------- Physics ----------
  function hitMallet(m) {
    const dx = puck.x - m.x, dy = puck.y - m.y;
    const d = Math.hypot(dx, dy), min = R + r;
    if (d >= min) return;
    let nx, ny;
    if (d > 0.001) { nx = dx / d; ny = dy / d; } else { nx = 0; ny = m === m1 ? 1 : -1; }
    puck.x = m.x + nx * min;
    puck.y = m.y + ny * min;
    const vn = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
    if (vn < 0) {
      puck.vx -= (1 + E_MALLET) * vn * nx;
      puck.vy -= (1 + E_MALLET) * vn * ny;
      const power = -vn / (rink.h * 1.2);
      sfx.hit(power);
      const now = performance.now();
      if (now - lastBuzz > 60) { lastBuzz = now; buzz(power > 0.5 ? 18 : 10); }
    }
  }

  function hitPost(px, py) {
    const dx = puck.x - px, dy = puck.y - py, d = Math.hypot(dx, dy);
    if (d >= r || d < 0.001) return;
    const nx = dx / d, ny = dy / d;
    puck.x = px + nx * r; puck.y = py + ny * r;
    const vn = puck.vx * nx + puck.vy * ny;
    if (vn < 0) {
      puck.vx -= (1 + E_WALL) * vn * nx; puck.vy -= (1 + E_WALL) * vn * ny;
      sfx.wall(-vn / rink.h);
    }
  }

  function walls() {
    if (puck.x - r < rink.x0) { puck.x = rink.x0 + r; if (puck.vx < 0) { sfx.wall(-puck.vx / rink.h); puck.vx = -puck.vx * E_WALL; } }
    else if (puck.x + r > rink.x1) { puck.x = rink.x1 - r; if (puck.vx > 0) { sfx.wall(puck.vx / rink.h); puck.vx = -puck.vx * E_WALL; } }

    const inMouth = puck.x > rink.gL && puck.x < rink.gR;
    if (puck.y - r < rink.y0 && !inMouth) { puck.y = rink.y0 + r; if (puck.vy < 0) { sfx.wall(-puck.vy / rink.h); puck.vy = -puck.vy * E_WALL; } }
    if (puck.y + r > rink.y1 && !inMouth) { puck.y = rink.y1 - r; if (puck.vy > 0) { sfx.wall(puck.vy / rink.h); puck.vy = -puck.vy * E_WALL; } }

    hitPost(rink.gL, rink.y0); hitPost(rink.gR, rink.y0);
    hitPost(rink.gL, rink.y1); hitPost(rink.gR, rink.y1);
  }

  function capPuck() {
    const sp = Math.hypot(puck.vx, puck.vy), max = PUCK_MAX * rink.h;
    if (sp > max) { puck.vx *= max / sp; puck.vy *= max / sp; }
  }

  function moveMallets(dt, live) {
    // returns start/end positions; mallet speed is limited so it can't teleport through the puck
    const res = [];
    for (const [m, side] of [[m1, 1], [m2, 2]]) {
      const t = clampMallet(m, side);
      let dx = t.x - m.x, dy = t.y - m.y;
      const dist = Math.hypot(dx, dy), maxMove = MALLET_MAX * rink.h * dt;
      if (dist > maxMove) { dx *= maxMove / dist; dy *= maxMove / dist; }
      m.vx = dt > 0 ? dx / dt : 0; m.vy = dt > 0 ? dy / dt : 0;
      res.push({ m, sx: m.x, sy: m.y, ex: m.x + dx, ey: m.y + dy });
    }
    if (!live) {
      // not in play: mallets move but can't shove the resting puck
      for (const o of res) {
        o.m.x = o.ex; o.m.y = o.ey;
        if (state === S.GOAL) continue;
        const ddx = o.m.x - puck.x, ddy = o.m.y - puck.y, d = Math.hypot(ddx, ddy), min = R + r;
        if (d < min) {
          const nx = d > 0.001 ? ddx / d : 0, ny = d > 0.001 ? ddy / d : (o.m === m1 ? -1 : 1);
          o.m.x = puck.x + nx * min; o.m.y = puck.y + ny * min;
        }
      }
    }
    return res;
  }

  function step(dt) {
    const mv = moveMallets(dt, true);
    const travel = Math.max(
      Math.hypot(puck.vx, puck.vy) * dt,
      ...mv.map(o => Math.hypot(o.ex - o.sx, o.ey - o.sy))
    );
    const n = clamp(Math.ceil(travel / (r * 0.35)), 1, 60);
    const h = dt / n;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      for (const o of mv) { o.m.x = o.sx + (o.ex - o.sx) * f; o.m.y = o.sy + (o.ey - o.sy) * f; }
      puck.x += puck.vx * h;
      puck.y += puck.vy * h;
      hitMallet(m1); hitMallet(m2);
      capPuck();
      walls();
      if (puck.y < rink.y0 - r * 0.6) { goalScored(2); return; }
      if (puck.y > rink.y1 + r * 0.6) { goalScored(1); return; }
    }
    const k = Math.exp(-FRICTION * dt);
    puck.vx *= k; puck.vy *= k;
    if (Math.hypot(puck.vx, puck.vy) < 3) puck.vx = puck.vy = 0;
    trail.push({ x: puck.x, y: puck.y });
    if (trail.length > 12) trail.shift();
  }

  // ---------- Drawing ----------
  function circle(x, y, rad) { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); }

  function drawMallet(m, color) {
    ctx.shadowBlur = 22; ctx.shadowColor = color;
    ctx.fillStyle = 'rgba(4,8,14,0.92)';
    circle(m.x, m.y, R); ctx.fill();
    const lw = R * 0.2;
    ctx.lineWidth = lw; ctx.strokeStyle = color;
    circle(m.x, m.y, R - lw / 2); ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.lineWidth = Math.max(2, R * 0.08); ctx.strokeStyle = alpha(color, 0.7);
    circle(m.x, m.y, R * 0.45); ctx.stroke();
    ctx.fillStyle = color;
    circle(m.x, m.y, R * 0.22); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw() {
    const t = settings.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state !== S.GOAL && state !== S.START && state !== S.GAMEOVER) {
      ctx.fillStyle = t.puck;
      for (let i = 0; i < trail.length; i++) {
        const k = (i + 1) / trail.length;
        ctx.globalAlpha = k * 0.16;
        circle(trail[i].x, trail[i].y, r * (0.5 + 0.5 * k)); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 18; ctx.shadowColor = t.puck;
      circle(puck.x, puck.y, r); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      circle(puck.x, puck.y, r * 0.62); ctx.stroke();
    }

    drawMallet(m1, t.p1);
    drawMallet(m2, t.p2);
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    if (state === S.COUNTDOWN) {
      moveMallets(dt, false);
      const left = 3 - Math.floor((now - countdownStart) / 1000);
      if (left !== lastCount && left > 0) { lastCount = left; showCount(String(left), 'pop'); sfx.count(); buzz(8); }
      if (left <= 0) {
        goUntil = now + 700;
        showCount('GO!', 'fade');
        sfx.go();
        setState(S.PLAYING);
      }
    } else if (state === S.PLAYING) {
      if (goUntil && now > goUntil) { goUntil = 0; el.countLayer.classList.add('hidden'); }
      step(dt);
    } else if (state === S.GOAL) {
      moveMallets(dt, false);
      if (now - goalAt > GOAL_PAUSE) finishGoal();
    } else if (state === S.READY) {
      moveMallets(dt, false);
    }

    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Touch input ----------
  // Each finger belongs to the half where it first touched, so a mallet never
  // jumps to the other player's finger. Fingers that start in the thin strip at
  // the very bottom edge don't grab a mallet: a quick swipe up from there pauses.
  const fingers = new Map(); // id -> { side: 0|1|2, sx, sy, t, x, y }

  function onTouch(e) {
    if (state === S.START || state === S.GAMEOVER || state === S.PAUSED) { fingers.clear(); return; }
    e.preventDefault();
    const now = performance.now();

    for (const tch of e.changedTouches) {
      const id = tch.identifier, x = tch.clientX, y = tch.clientY;
      if (e.type === 'touchstart') {
        let side = y < rink.cy ? 1 : 2;
        if (y > H - insetBottom - EDGE || y < insetTop + EDGE) side = 0;
        fingers.set(id, { side, sx: x, sy: y, t: now, x, y });
      } else if (e.type === 'touchmove') {
        const f = fingers.get(id);
        if (!f) continue;
        f.x = x; f.y = y;
        if (f.side === 0 && f.sy > rink.cy && now - f.t <= SWIPE_TIME) {
          const dy = f.sy - y, dx = Math.abs(x - f.sx);
          if (dy > SWIPE_DIST && dx < dy * 0.6) { fingers.clear(); buzz(15); pause(); return; }
        }
      } else {
        fingers.delete(id);
      }
    }

    let a = null, b = null;
    for (const f of fingers.values()) {
      if (f.side === 1 && !a) a = f;
      else if (f.side === 2 && !b) b = f;
    }
    if (a) { m1.tx = a.x; m1.ty = a.y; }
    if (b) { m2.tx = b.x; m2.ty = b.y; }

    if (state === S.READY || state === S.COUNTDOWN) {
      if (!!a !== p1Ready || !!b !== p2Ready) { p1Ready = !!a; p2Ready = !!b; renderReady(); }
      if (state === S.READY && a && b) setState(S.COUNTDOWN);
      else if (state === S.COUNTDOWN && !(a && b)) setState(S.READY);
    }
  }
  function refreshReady() {
    for (const f of fingers.values()) { if (f.side === 1) p1Ready = true; if (f.side === 2) p2Ready = true; }
    renderReady();
    if (state === S.READY && p1Ready && p2Ready) setState(S.COUNTDOWN);
  }

  const stage = $('stage');
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    stage.addEventListener(type, onTouch, { passive: false });
  }

  // Mouse fallback for trying it on a computer: moves the mallet in the half under the pointer.
  stage.addEventListener('mousemove', e => {
    const m = e.clientY < rink.cy ? m1 : m2;
    m.tx = e.clientX; m.ty = e.clientY;
  });

  // ---------- Menu ----------
  function renderMenu() {
    document.documentElement.style.setProperty('--p1', settings.theme.p1);
    document.documentElement.style.setProperty('--p2', settings.theme.p2);

    el.themes.innerHTML = '';
    for (const t of THEMES) {
      const b = document.createElement('button');
      b.className = 'theme' + (t.id === settings.theme.id ? ' sel' : '');
      b.innerHTML = `<div class="dots"><span style="background:${t.p1};box-shadow:0 0 8px ${t.p1}"></span><span style="background:${t.p2};box-shadow:0 0 8px ${t.p2}"></span></div>${t.name}`;
      b.onclick = () => { sfx.unlock(); sfx.click(); settings.theme = t; store.set('theme', t.id); drawRink(); renderMenu(); };
      el.themes.appendChild(b);
    }

    el.goals.innerHTML = '';
    for (const n of GOAL_OPTIONS) {
      const b = document.createElement('button');
      b.className = 'pill' + (n === settings.goals ? ' sel' : '');
      b.textContent = n;
      b.onclick = () => { sfx.unlock(); sfx.click(); settings.goals = n; store.set('goals', n); renderMenu(); };
      el.goals.appendChild(b);
    }

    el.soundBtn.querySelector('span').textContent = 'Sound: ' + (settings.sound ? 'On' : 'Off');
    el.vibBtn.classList.toggle('hidden', !navigator.vibrate);
    el.vibBtn.querySelector('span').textContent = 'Buzz: ' + (settings.vibrate ? 'On' : 'Off');

    const over = state === S.GAMEOVER;
    el.result.classList.toggle('hidden', !over);
    if (over) {
      el.f1.textContent = score1; el.f1.style.color = settings.theme.p1;
      el.f2.textContent = score2; el.f2.style.color = settings.theme.p2;
      el.winText.textContent = `Player ${winner} wins!`;
    }
    el.startBtn.textContent = over ? 'Rematch' : 'Face Off';
    renderFsBtn();
  }

  el.startBtn.onclick = startMatch;
  el.soundBtn.onclick = () => { sfx.unlock(); settings.sound = !settings.sound; store.set('sound', settings.sound); sfx.click(); renderMenu(); };
  el.vibBtn.onclick = () => { sfx.unlock(); sfx.click(); settings.vibrate = !settings.vibrate; store.set('vibrate', settings.vibrate); buzz(20); renderMenu(); };
  el.resumeBtn.onclick = () => { sfx.unlock(); sfx.click(); setState(S.READY); };
  el.quitBtn.onclick = () => { sfx.click(); resetPositions(); setState(S.START); renderMenu(); };

  // ---------- Fullscreen ----------
  const isInstalled = () =>
    matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function renderFsBtn() {
    const canFs = !!document.documentElement.requestFullscreen && !isInstalled();
    el.fsBtn.classList.toggle('hidden', !canFs);
    el.fsBtn.querySelector('span').textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen';
  }
  el.fsBtn.onclick = () => {
    sfx.unlock(); sfx.click();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };
  document.addEventListener('fullscreenchange', renderFsBtn);

  // ---------- Keep the screen awake during a match ----------
  const wakeLock = {
    lock: null, want: false,
    async on() {
      this.want = true;
      if (this.lock || !('wakeLock' in navigator)) return;
      try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } catch {}
    },
    off() { this.want = false; if (this.lock) { this.lock.release().catch(() => {}); this.lock = null; } },
  };

  // ---------- Phone lifecycle ----------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); if (sfx.ctx) sfx.ctx.suspend().catch(() => {}); }
    else { if (wakeLock.want) wakeLock.on(); if (sfx.ctx) sfx.ctx.resume().catch(() => {}); }
  });

  // Android back gesture: pause instead of leaving the app mid-match
  function pushGameHistory() { if (!history.state || !history.state.nih) history.pushState({ nih: 1 }, ''); }
  window.addEventListener('popstate', () => {
    if (state === S.READY || state === S.COUNTDOWN || state === S.PLAYING || state === S.GOAL) {
      pause();
      history.pushState({ nih: 1 }, '');
    } else if (state === S.PAUSED) {
      history.pushState({ nih: 1 }, '');
      setState(S.READY);
    }
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ---------- Offline support ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- Go ----------
  layout();
  renderMenu();
  setState(S.START);
  requestAnimationFrame(t => { last = t; frame(t); });

  // test hook (harmless): lets automated tests read the game state
  window.__nih = { get state() { return state; }, puck, m1, m2, rink, get score() { return [score1, score2]; } };
})();
