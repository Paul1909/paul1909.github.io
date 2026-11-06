(() => {
  'use strict';

  // ---------- Config ----------
  const THEMES = [
    { id: 'classic',   name: 'Classic',   p1: '#3b82f6', p2: '#ef4444', ball: '#ffffff' },
    { id: 'cyberpunk', name: 'Cyberpunk', p1: '#d946ef', p2: '#06b6d4', ball: '#ffffff' },
    { id: 'sunset',    name: 'Sunset',    p1: '#f97316', p2: '#8b5cf6', ball: '#fef3c7' },
    { id: 'matrix',    name: 'Matrix',    p1: '#22c55e', p2: '#ffffff', ball: '#4ade80' },
  ];
  const LENGTHS = [3, 5, 11, 15, 21];
  // Speeds are in screen-heights per second, so the game feels the same on
  // any phone size and any refresh rate (60/90/120 Hz).
  const SPEEDS = [
    { id: 'chill',  name: 'Chill',  start: 0.26, inc: 0.016, max: 1.3 },
    { id: 'normal', name: 'Normal', start: 0.36, inc: 0.022, max: 1.6 },
    { id: 'fast',   name: 'Fast',   start: 0.50, inc: 0.030, max: 2.0 },
  ];
  const PADDLE_W = 0.25;   // fraction of screen width
  const PADDLE_H = 15;     // px
  const PADDLE_GAP = 40;   // px from edge (keeps fingers away from the system edge swipes)
  const BALL_R = 8;        // px
  const MAX_BOUNCE = Math.PI / 4;

  const S = { START: 'START', READY: 'READY', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

  // ---------- Saved settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('npd.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('npd.' + k, JSON.stringify(v)); } catch {} },
  };
  const settings = {
    theme: THEMES.find(t => t.id === store.get('theme', 'classic')) || THEMES[0],
    maxScore: LENGTHS.includes(store.get('maxScore', 5)) ? store.get('maxScore', 5) : 5,
    speed: SPEEDS.find(s => s.id === store.get('speed', 'normal')) || SPEEDS[1],
    vibrate: store.get('vibrate', true),
  };

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const el = {
    hud: $('hud'), s1: $('s1'), s2: $('s2'),
    readyLayer: $('readyLayer'), r1: $('r1'), r2: $('r2'),
    countLayer: $('countLayer'), c1: $('c1'), c2: $('c2'),
    menu: $('menu'), result: $('result'), f1: $('f1'), f2: $('f2'), winText: $('winText'),
    themes: $('themes'), lengths: $('lengths'), speeds: $('speeds'),
    startBtn: $('startBtn'), fsBtn: $('fsBtn'), vibBtn: $('vibBtn'),
    pauseSheet: $('pauseSheet'), pauseScore: $('pauseScore'),
    resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
  };

  // ---------- Game state ----------
  let state = S.START;
  let W = 0, H = 0, dpr = 1, insetTop = 0, insetBottom = 0;
  const p1 = { x: 0, y: 0, w: 0, h: PADDLE_H };
  const p2 = { x: 0, y: 0, w: 0, h: PADDLE_H };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, speed: 0, r: BALL_R };
  const trail = [];
  let score1 = 0, score2 = 0, winner = 0;
  let midRally = false;          // true when resuming after a pause
  let countdownStart = 0, lastCount = -1, goUntil = 0;
  let p1Ready = false, p2Ready = false;

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const buzz = ms => { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } };

  function readInsets() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    insetTop = parseFloat(cs.paddingTop) || 0;
    insetBottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
  }

  function layout() {
    const oldW = W, oldH = H;
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    readInsets();

    const pw = W * PADDLE_W;
    // keep paddles where the players left them (relative), or centre them
    const r1 = oldW ? (p1.x + p1.w / 2) / oldW : 0.5;
    const r2 = oldW ? (p2.x + p2.w / 2) / oldW : 0.5;
    p1.w = p2.w = pw;
    p1.x = clamp(r1 * W - pw / 2, 0, W - pw);
    p2.x = clamp(r2 * W - pw / 2, 0, W - pw);
    p1.y = insetTop + PADDLE_GAP;
    p2.y = H - insetBottom - PADDLE_GAP - PADDLE_H;

    // scale the ball instead of resetting it (mobile browsers resize a lot)
    if (oldW && oldH) {
      ball.x *= W / oldW; ball.y *= H / oldH;
      ball.vx *= H / oldH; ball.vy *= H / oldH; ball.speed *= H / oldH;
      trail.length = 0;
    } else {
      ball.x = W / 2; ball.y = H / 2;
    }
  }

  function serve(towards) {
    // towards: 1 = up (player 1), 2 = down (player 2)
    ball.x = W / 2; ball.y = H / 2;
    ball.speed = settings.speed.start * H;
    const angle = Math.random() * Math.PI / 4 - Math.PI / 8;
    const dir = towards === 1 ? -1 : 1;
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = Math.cos(angle) * ball.speed * dir;
    trail.length = 0;
  }

  // ---------- State transitions ----------
  function setState(next) {
    state = next;
    const inGame = next === S.READY || next === S.COUNTDOWN || next === S.PLAYING;
    el.hud.classList.toggle('hidden', !(inGame || next === S.PAUSED));
    el.readyLayer.classList.toggle('hidden', next !== S.READY);
    el.countLayer.classList.toggle('hidden', next !== S.COUNTDOWN && !(next === S.PLAYING && performance.now() < goUntil));
    el.menu.classList.toggle('hidden', !(next === S.START || next === S.GAMEOVER));
    el.pauseSheet.classList.toggle('hidden', next !== S.PAUSED);

    if (next === S.READY) { p1Ready = p2Ready = false; renderReady(); }
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
      const span = c.querySelector('span');
      span.textContent = text;
      c.classList.remove('pop', 'fade');
      void c.offsetWidth; // restart animation
      c.classList.add(cls);
    }
  }

  function startMatch() {
    score1 = score2 = 0; winner = 0; midRally = false;
    renderScores();
    serve(1);
    pushGameHistory();
    setState(S.READY);
  }

  function pointScored(by) {
    if (by === 1) score1++; else score2++;
    renderScores();
    buzz(by === 1 ? [40, 40, 40] : 60);
    if (score1 >= settings.maxScore || score2 >= settings.maxScore) {
      winner = by;
      setState(S.GAMEOVER);
      return;
    }
    midRally = false;
    serve(by);
    setState(S.READY);
  }

  function pause() {
    if (state === S.READY || state === S.COUNTDOWN || state === S.PLAYING) {
      if (state === S.PLAYING) midRally = true;
      setState(S.PAUSED);
    }
  }

  // ---------- Physics ----------
  function hitPaddle(p, top) {
    const movingToward = top ? ball.vy < 0 : ball.vy > 0;
    if (!movingToward) return false;
    if (ball.x + ball.r < p.x || ball.x - ball.r > p.x + p.w) return false;
    if (top) { if (ball.y - ball.r > p.y + p.h || ball.y + ball.r < p.y) return false; }
    else     { if (ball.y + ball.r < p.y || ball.y - ball.r > p.y + p.h) return false; }

    const rel = clamp((ball.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
    const angle = rel * MAX_BOUNCE;
    ball.speed = Math.min(ball.speed + settings.speed.inc * H, settings.speed.max * H);
    ball.vx = ball.speed * Math.sin(angle);
    ball.vy = ball.speed * Math.cos(angle) * (top ? 1 : -1);
    ball.y = top ? p.y + p.h + ball.r : p.y - ball.r;
    buzz(12);
    return true;
  }

  function step(dt) {
    // sub-steps so a fast ball can never tunnel through a paddle
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / (ball.r * 0.5)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
      else if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }

      hitPaddle(p1, true) || hitPaddle(p2, false);

      if (ball.y < -ball.r) { pointScored(2); return; }
      if (ball.y > H + ball.r) { pointScored(1); return; }
    }
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 10) trail.shift();
  }

  // ---------- Drawing ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    const t = settings.theme;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // centre line
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    // paddles
    for (const [p, color] of [[p1, t.p1], [p2, t.p2]]) {
      ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
      roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill();
    }

    // ball (hidden while waiting to serve, like the original)
    const showBall = state === S.PLAYING || state === S.COUNTDOWN || ((state === S.READY || state === S.PAUSED) && midRally);
    if (showBall) {
      ctx.shadowBlur = 0; ctx.fillStyle = t.ball;
      for (let i = 0; i < trail.length; i++) {
        const k = (i + 1) / trail.length;
        ctx.globalAlpha = k * 0.18;
        ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, ball.r * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 12; ctx.shadowColor = t.ball;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); // clamp big gaps (tab switches)
    last = now;

    if (state === S.COUNTDOWN) {
      const left = 3 - Math.floor((now - countdownStart) / 1000);
      if (left !== lastCount && left > 0) { lastCount = left; showCount(String(left), 'pop'); buzz(8); }
      if (left <= 0) {
        goUntil = now + 700;
        showCount('GO!', 'fade');
        midRally = true;
        setState(S.PLAYING);
      }
    } else if (state === S.PLAYING) {
      if (goUntil && now > goUntil) { goUntil = 0; el.countLayer.classList.add('hidden'); }
      step(dt);
    }

    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Touch input ----------
  // Swipe up from the bottom edge = pause (Resume / Quit to Menu).
  // Only a quick, mostly-vertical flick that starts near the bottom edge counts,
  // so normal side-to-side paddle moves never trigger it.
  const SWIPE_ZONE = 70;      // px above the bottom edge where the swipe must start
  const SWIPE_DIST = 90;      // px it must travel upwards
  const SWIPE_TIME = 700;     // ms
  const swipes = new Map();   // touch id -> { x, y, t }

  function trackSwipe(e) {
    if (e.type === 'touchstart') {
      for (const tch of e.changedTouches) {
        if (tch.clientY > H - insetBottom - SWIPE_ZONE) swipes.set(tch.identifier, { x: tch.clientX, y: tch.clientY, t: performance.now() });
      }
    } else if (e.type === 'touchmove') {
      for (const tch of e.changedTouches) {
        const s = swipes.get(tch.identifier);
        if (!s) continue;
        const dy = s.y - tch.clientY, dx = Math.abs(tch.clientX - s.x);
        if (performance.now() - s.t > SWIPE_TIME) { swipes.delete(tch.identifier); continue; }
        if (dy > SWIPE_DIST && dx < dy * 0.6) { swipes.clear(); buzz(15); pause(); return true; }
      }
    } else {
      for (const tch of e.changedTouches) swipes.delete(tch.identifier);
    }
    return false;
  }

  function onTouch(e) {
    if (state === S.START || state === S.GAMEOVER || state === S.PAUSED) { swipes.clear(); return; }
    e.preventDefault();
    if (trackSwipe(e)) return;

    let a = false, b = false;
    for (const tch of e.touches) {
      const x = tch.clientX;
      if (tch.clientY < H / 2) { a = true; p1.x = clamp(x - p1.w / 2, 0, W - p1.w); }
      else                     { b = true; p2.x = clamp(x - p2.w / 2, 0, W - p2.w); }
    }

    if (state === S.READY || state === S.COUNTDOWN) {
      if (a !== p1Ready || b !== p2Ready) { p1Ready = a; p2Ready = b; renderReady(); }
      if (state === S.READY && a && b) setState(S.COUNTDOWN);
      else if (state === S.COUNTDOWN && !(a && b)) setState(S.READY);
    }
  }
  const stage = $('stage');
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    stage.addEventListener(type, onTouch, { passive: false });
  }

  // Mouse fallback for trying it on a computer: moves the paddle on the half the pointer is over.
  stage.addEventListener('mousemove', e => {
    if (state !== S.PLAYING && state !== S.READY && state !== S.COUNTDOWN) return;
    const p = e.clientY < H / 2 ? p1 : p2;
    p.x = clamp(e.clientX - p.w / 2, 0, W - p.w);
  });

  // ---------- Menu ----------
  function renderMenu() {
    document.documentElement.style.setProperty('--p1', settings.theme.p1);
    document.documentElement.style.setProperty('--p2', settings.theme.p2);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#050505');

    el.themes.innerHTML = '';
    for (const t of THEMES) {
      const b = document.createElement('button');
      b.className = 'theme' + (t.id === settings.theme.id ? ' sel' : '');
      b.innerHTML = `<div class="dots"><span style="background:${t.p1};box-shadow:0 0 8px ${t.p1}"></span><span style="background:${t.p2};box-shadow:0 0 8px ${t.p2}"></span></div>${t.name}`;
      b.onclick = () => { settings.theme = t; store.set('theme', t.id); renderMenu(); };
      el.themes.appendChild(b);
    }

    el.lengths.innerHTML = '';
    for (const n of LENGTHS) {
      const b = document.createElement('button');
      b.className = 'pill' + (n === settings.maxScore ? ' sel' : '');
      b.textContent = n;
      b.onclick = () => { settings.maxScore = n; store.set('maxScore', n); renderMenu(); };
      el.lengths.appendChild(b);
    }

    el.speeds.innerHTML = '';
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.className = 'pill' + (s.id === settings.speed.id ? ' sel' : '');
      b.textContent = s.name;
      b.onclick = () => { settings.speed = s; store.set('speed', s.id); renderMenu(); };
      el.speeds.appendChild(b);
    }

    el.vibBtn.classList.toggle('hidden', !navigator.vibrate);
    el.vibBtn.querySelector('span').textContent = 'Vibration: ' + (settings.vibrate ? 'On' : 'Off');

    const over = state === S.GAMEOVER;
    el.result.classList.toggle('hidden', !over);
    if (over) {
      el.f1.textContent = score1; el.f1.style.color = settings.theme.p1;
      el.f2.textContent = score2; el.f2.style.color = settings.theme.p2;
      el.winText.textContent = `Player ${winner} wins!`;
    }
    el.startBtn.textContent = over ? 'Rematch' : 'Enter Arena';
    renderFsBtn();
  }

  el.startBtn.onclick = startMatch;
  el.vibBtn.onclick = () => { settings.vibrate = !settings.vibrate; store.set('vibrate', settings.vibrate); buzz(20); renderMenu(); };
  el.resumeBtn.onclick = () => setState(S.READY);
  el.quitBtn.onclick = () => { midRally = false; setState(S.START); renderMenu(); };

  // ---------- Fullscreen ----------
  const isInstalled = () =>
    matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function renderFsBtn() {
    const canFs = !!document.documentElement.requestFullscreen && !isInstalled();
    el.fsBtn.classList.toggle('hidden', !canFs);
    el.fsBtn.querySelector('span').textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen';
  }
  el.fsBtn.onclick = () => {
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
    if (document.hidden) pause();
    else if (wakeLock.want) wakeLock.on();
  });

  // Android back gesture: pause instead of leaving the app mid-match
  function pushGameHistory() { if (!history.state || !history.state.npd) history.pushState({ npd: 1 }, ''); }
  window.addEventListener('popstate', () => {
    if (state === S.READY || state === S.COUNTDOWN || state === S.PLAYING) {
      pause();
      history.pushState({ npd: 1 }, '');
    } else if (state === S.PAUSED) {
      history.pushState({ npd: 1 }, '');
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
})();
