// Atomic Chess: two players on one phone, or you against the bot. Optional chess clock.
'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(() => {
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // localStorage can throw (private mode, storage full); never let that break the app.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const settings = Object.assign({
    sound: true, vibe: true, hints: true, coords: true, layout: 'table',
    mode: 'bot', color: 'w', level: 4, minutes: 3, inc: 5,
  }, store.get('atomic-settings', {}));
  const saveSettings = () => store.set('atomic-settings', settings);
  Sound.enabled = settings.sound;
  const vibrate = p => { if (settings.vibe) { try { navigator.vibrate && navigator.vibrate(p); } catch {} } };

  const LEVELS = ['Beginner', 'Novice', 'Casual', 'Club', 'Strong', 'Expert', 'Master', 'Grandmaster'];
  const levelName = l => `${l} · ${LEVELS[l - 1]}`;

  const app = $('app'), boardEl = $('board'), sqLayer = $('squares'), pcLayer = $('pieces');
  const ORDER = 'qrbnp';
  const REASON = {
    explode: 'The enemy king was caught in the blast.',
    mate: 'Checkmate.',
    stalemate: 'Stalemate: no legal moves.',
    material: 'Only the kings are left.',
    fifty: '50 moves without a pawn move or capture.',
    repetition: 'The same position came up three times.',
    time: 'Out of time.',
    'timeout-draw': 'Out of time, but a lone king can never win.',
  };

  let G, ST, undoStack = [];
  let flipped = false, sel = -1, selMoves = [], ptr = null, busy = false, hoverSqs = [];
  let sqEls = [];
  const pcEls = new Map();

  // ---------- game state ----------
  function fresh() {
    const state = Atomic.initial();
    const mode = settings.mode === 'bot' ? 'bot' : 'friend';
    const human = mode === 'bot' ? (settings.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color) : 'w';
    const base = settings.minutes * 60000;
    return {
      state, last: null, moves: [], lost: { w: [], b: [] }, reps: { [Atomic.key(state)]: 1 }, result: null,
      mode, human, timeout: null,
      clock: base > 0 ? { base, inc: settings.inc * 1000, w: base, b: base, started: false } : null,
    };
  }
  function save() { store.set('atomic-game', { G, undo: undoStack.slice(-150) }); }
  function load() {
    const d = store.get('atomic-game', null);
    if (d && d.G && d.G.state && Array.isArray(d.G.state.board) && d.G.state.board.length === 64) {
      G = d.G; undoStack = d.undo || [];
      G.mode = G.mode || 'friend'; G.human = G.human || 'w';
      if (G.clock === undefined) G.clock = null;
    } else G = fresh();
  }
  function computeStatus() {
    ST = Atomic.status(G.state, G.reps[Atomic.key(G.state)] || 1);
    G.result = ST.over ? { winner: ST.winner, reason: ST.reason } : G.timeout || null;
  }
  const isBot = () => G.mode === 'bot';
  const botColor = () => Atomic.opp(G.human);
  const botsTurn = () => isBot() && !G.result && G.state.turn !== G.human;
  const tableMode = () => !isBot() && settings.layout === 'table';
  const wantFlip = () => isBot() ? G.human === 'b' : settings.layout === 'pass' && G.state.turn === 'b';

  // ---------- clock ----------
  // G.clock.w / .b hold each side's remaining ms at the start of the current turn.
  let paused = false, turnStart = performance.now();
  const ticked = { w: 0, b: 0 };
  const clockOn = () => !!(G.clock && G.clock.started && !G.result);
  const running = () => clockOn() && !paused;
  function clockLeft(c) {
    if (!G.clock) return Infinity;
    let t = G.clock[c];
    if (running() && G.state.turn === c) t -= performance.now() - turnStart;
    return t;
  }
  function fmt(ms) {
    ms = Math.max(0, ms);
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function renderClocks() {
    for (const c of ['w', 'b']) {
      const el = $(c === 'w' ? 'barW' : 'barB').querySelector('.clock');
      if (!G.clock) { el.classList.add('off'); continue; }
      const t = clockLeft(c);
      el.classList.remove('off');
      el.textContent = fmt(t);
      el.classList.toggle('on', running() && G.state.turn === c);
      el.classList.toggle('low', t < 20000);
    }
    $('pauseOv').classList.toggle('hidden', !(paused && clockOn()));
  }
  function pauseClock() {
    if (!clockOn() || paused) { if (botsTurn()) cancelBot(); return; }
    const c = G.state.turn;
    G.clock[c] = clockLeft(c);
    paused = true;
    cancelBot();
    save(); renderClocks(); renderBars();
  }
  function resumeClock() {
    if (!paused) return;
    paused = false;
    turnStart = performance.now();
    renderClocks(); renderBars();
    maybeBot();
  }
  const anyModal = () => modalIds.some(id => isOpen(id));
  function flag(c) {
    if (G.result) return;
    G.clock[c] = 0;
    cancelBot();
    const o = Atomic.opp(c);
    const bare = G.state.board.every(p => !p || p.c !== o || p.t === 'k');
    G.timeout = bare ? { winner: null, reason: 'timeout-draw' } : { winner: o, reason: 'time' };
    computeStatus(); clearSel(); clearHover();
    if (ptr && ptr.el) { ptr.el.classList.remove('dragging'); }
    ptr = null;
    renderAll(false); save();
    Sound.flag();
    setTimeout(showOver, 500);
  }
  setInterval(() => {
    if (!G || !G.clock) return;
    renderClocks();
    if (!running() || busy) return;
    const c = G.state.turn, t = clockLeft(c);
    if (t <= 0) { flag(c); return; }
    if (t < 10000 && (!isBot() || c === G.human)) {
      const s = Math.ceil(t / 1000);
      if (ticked[c] !== s) { ticked[c] = s; Sound.tick(); }
    }
  }, 100);

  // ---------- bot (Web Worker, with an in-page fallback) ----------
  // The bot normally thinks in a background worker. Some setups refuse workers (e.g. opening
  // index.html straight from a downloaded folder), so if the worker can't start, errors, or
  // stays silent too long, the bot runs inside the page instead. It can never hang.
  let worker = null, workerBroken = false, botReq = 0, botThinking = false, watchdog = 0;
  function cancelBot() {
    botReq++;
    clearTimeout(watchdog);
    if (botThinking && worker) { worker.terminate(); worker = null; }
    botThinking = false;
  }
  function getWorker() {
    if (workerBroken) return null;
    if (!worker) {
      try { worker = new Worker('bot.js'); } catch { workerBroken = true; return null; }
      worker.onmessage = onBotMessage;
      worker.onerror = () => { workerBroken = true; worker = null; if (botThinking) fallbackThink(botReq); };
    }
    return worker;
  }
  let pageBot = null;
  function loadPageBot() {
    if (window.AtomicBot) return Promise.resolve(window.AtomicBot);
    if (!pageBot) pageBot = new Promise(res => {
      const s = document.createElement('script');
      s.src = 'bot.js';
      s.onload = () => res(window.AtomicBot || null);
      s.onerror = () => res(null);
      document.head.appendChild(s);
    });
    return pageBot;
  }
  let lastJob = null;
  function fallbackThink(id) {
    clearTimeout(watchdog);
    if (id !== botReq || !lastJob) return;
    const job = lastJob;
    loadPageBot().then(bot => setTimeout(() => {
      if (id !== botReq) return;
      let move = null;
      try {
        // In the page the board can't redraw while the bot thinks, so keep it short.
        const r = bot && bot.think(job.state, job.history, job.level, Math.min(job.time, 1200));
        move = r ? bot.decode(r.move) : null;
      } catch { move = null; }
      onBotMessage({ data: { id, move } });
    }, 60));
  }
  function botBudget() {
    const caps = [0, 400, 400, 600, 900, 500, 900, 1600, 3000];
    let t = caps[settings.level] || 1500;
    if (G.clock) {
      const left = clockLeft(G.state.turn);
      t = Math.min(t, Math.max(60, left / 25 + G.clock.inc * 0.7));
    }
    return t;
  }
  let botT0 = 0;
  function maybeBot() {
    if (!botsTurn() || botThinking || busy || paused || anyModal()) return;
    botThinking = true;
    const id = ++botReq;
    botT0 = performance.now();
    const half = G.state.half;
    const history = half > 0 ? undoStack.slice(-half).map(s => s.state) : [];
    lastJob = { id, state: G.state, history, level: settings.level, time: botBudget() };
    renderBars();
    const w = getWorker();
    if (!w) { fallbackThink(id); return; }
    w.postMessage(lastJob);
    watchdog = setTimeout(() => {
      if (id !== botReq || !botThinking) return;
      if (worker) { worker.terminate(); worker = null; }
      workerBroken = true;
      fallbackThink(id);
    }, lastJob.time + 4000);
  }
  function onBotMessage(e) {
    const d = e.data;
    if (d.id !== botReq) return;
    clearTimeout(watchdog);
    botThinking = false;
    const minDelay = settings.level <= 4 ? 250 : 0; // weak levels pause a moment instead of moving instantly
    const delay = Math.max(0, minDelay - (performance.now() - botT0));
    setTimeout(() => playBot(d.id, d.move), delay);
  }
  function playBot(id, mv) {
    if (id !== botReq || !botsTurn() || busy || paused) return;
    let m = mv && ST.moves.find(x => x.from === mv.from && x.to === mv.to);
    if (!m) m = ST.moves[(Math.random() * ST.moves.length) | 0]; // safety net, should never happen
    if (m) doMove(m, false, (mv && mv.promo) || 'q');
  }

  // ---------- board drawing ----------
  function buildSquares() {
    sqLayer.textContent = '';
    sqEls = new Array(64);
    for (let v = 0; v < 64; v++) {
      const s = flipped ? 63 - v : v, r = s >> 3, c = s & 7;
      const d = document.createElement('div');
      d.className = 'sq ' + (((r + c) & 1) ? 'dark' : 'light');
      if (settings.coords) {
        if ((v & 7) === 0) { const e = document.createElement('span'); e.className = 'coord rk'; e.textContent = 8 - r; d.appendChild(e); }
        if ((v >> 3) === 7) { const e = document.createElement('span'); e.className = 'coord fl'; e.textContent = 'abcdefgh'[c]; d.appendChild(e); }
      }
      sqLayer.appendChild(d);
      sqEls[s] = d;
    }
  }

  function place(el, s) {
    const v = flipped ? 63 - s : s;
    el.style.transform = `translate(${(v & 7) * 100}%, ${(v >> 3) * 100}%)`;
  }

  function renderPieces(instant) {
    const b = G.state.board, seen = new Set();
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p) continue;
      seen.add(p.id);
      let el = pcEls.get(p.id), isNew = false;
      if (!el) { el = document.createElement('div'); el.className = 'pc'; isNew = true; pcEls.set(p.id, el); }
      const k = p.c + p.t;
      if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = Pieces.svg(p.c, p.t); }
      el.classList.toggle('upside', tableMode() && p.c === 'b');
      if (instant) el.classList.add('notrans');
      place(el, s);
      if (isNew) pcLayer.appendChild(el);
    }
    for (const [id, el] of pcEls) if (!seen.has(id)) { el.remove(); pcEls.delete(id); }
    if (instant) { void pcLayer.offsetWidth; for (const el of pcEls.values()) el.classList.remove('notrans'); }
  }

  function renderMarks() {
    for (const e of sqEls) e.classList.remove('last', 'sel', 'mv', 'cap', 'check');
    if (G.last) { sqEls[G.last.from].classList.add('last'); sqEls[G.last.to].classList.add('last'); }
    if (sel >= 0) {
      sqEls[sel].classList.add('sel');
      if (settings.hints) for (const m of selMoves) sqEls[m.to].classList.add(m.capture ? 'cap' : 'mv');
    }
    if (!G.result && ST.check) {
      const k = Atomic.findKing(G.state.board, G.state.turn);
      if (k >= 0) sqEls[k].classList.add('check');
    }
  }

  function renderBars() {
    const last = G.moves[G.moves.length - 1];
    for (const c of ['w', 'b']) {
      const bar = $(c === 'w' ? 'barW' : 'barB'), r = G.result, active = !r && G.state.turn === c;
      const bot = isBot() && c === botColor();
      bar.querySelector('.name').textContent = !isBot() ? (c === 'w' ? 'White' : 'Black') : bot ? '🤖 ' + LEVELS[settings.level - 1] : 'You';
      bar.classList.toggle('active', active);
      bar.classList.toggle('check', active && ST.check);
      bar.classList.toggle('result', !!r);
      const msg = bar.querySelector('.msg');
      msg.classList.remove('thinking');
      if (r) msg.textContent = bot ? (r.winner === c ? '🏆 Wins' : r.winner ? 'Beaten' : 'Draw') : (r.winner === c ? '🏆 You win!' : r.winner ? 'You lost' : 'Draw');
      else if (active && paused && clockOn()) msg.textContent = 'Paused';
      else if (active && bot) { msg.textContent = ST.check ? 'Check! Thinking' : 'Thinking'; msg.classList.add('thinking'); }
      else msg.textContent = active ? (ST.check ? 'Check!' : 'Your move') : bot ? '' : 'Waiting…';
      const lost = G.lost[c].filter(t => t !== 'k').sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      bar.querySelector('.lost').innerHTML = lost.map(t => Pieces.svg(c, t)).join('');
      const lastEl = bar.querySelector('.last');
      lastEl.textContent = '';
      if (active && last && !bot) {
        lastEl.append('Last: ');
        const b = document.createElement('b'); b.textContent = last.s + (last.x ? ' 💥' + last.x : ''); lastEl.append(b);
      }
    }
    renderClocks();
  }

  function renderMoveList() {
    const box = $('moveList');
    if (!G.moves.length) { box.textContent = 'No moves yet.'; return; }
    let html = '';
    for (let i = 0; i < G.moves.length; i += 2) {
      const a = G.moves[i], b = G.moves[i + 1];
      const f = m => m.s + (m.x ? '💥' : '');
      html += `<span class="n">${i / 2 + 1}.</span> ${f(a)} ${b ? f(b) : ''}&nbsp; `;
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function renderAll(instant) { renderPieces(instant); renderMarks(); renderBars(); renderMoveList(); }

  function applyLayout(instant = true) {
    app.classList.toggle('table', tableMode());
    const f = wantFlip();
    app.classList.toggle('swap', f);
    if (f !== flipped || !sqEls.length) { flipped = f; buildSquares(); }
    renderAll(instant);
  }

  function rebuild() { buildSquares(); renderAll(true); }

  function sizeBoard() {
    const wrap = $('boardWrap');
    const s = Math.max(8, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) / 8) * 8);
    boardEl.style.width = boardEl.style.height = s + 'px';
    boardEl.style.setProperty('--s', s / 8 + 'px');
    FX.resize();
  }

  // ---------- selection & input ----------
  function select(s) {
    sel = s;
    selMoves = ST.moves.filter(m => m.from === s);
    renderMarks();
  }
  function clearSel() { sel = -1; selMoves = []; }
  function clearHover() { for (const s of hoverSqs) sqEls[s] && sqEls[s].classList.remove('hover', 'blast'); hoverSqs = []; }
  function setHover(s) {
    clearHover();
    const m = s >= 0 && selMoves.find(x => x.to === s);
    if (!m) return;
    if (m.capture) {
      const r = s >> 3, c = s & 7;
      for (const [dr, dc] of [[0, 0], ...Atomic.AROUND]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) hoverSqs.push(rr * 8 + cc);
      }
      for (const h of hoverSqs) sqEls[h].classList.add('blast');
    } else { hoverSqs.push(s); sqEls[s].classList.add('hover'); }
  }

  function sqFromPoint(x, y) {
    const r = boardEl.getBoundingClientRect();
    const vc = Math.floor((x - r.left) / r.width * 8), vr = Math.floor((y - r.top) / r.height * 8);
    if (vc < 0 || vc > 7 || vr < 0 || vr > 7) return -1;
    const v = vr * 8 + vc;
    return flipped ? 63 - v : v;
  }
  // While dragging, hold the piece a bit beyond the finger so it stays visible.
  const liftDir = () => (tableMode() && G.state.turn === 'b') ? 1 : -1;

  let firstTouch = true;
  function onFirstTouch() {
    if (!firstTouch) return;
    firstTouch = false;
    try { history.pushState({ atomic: 1 }, ''); } catch {}
    keepAwake();
  }

  boardEl.addEventListener('pointerdown', e => {
    Sound.unlock(); onFirstTouch();
    if (paused && clockOn()) { e.preventDefault(); resumeClock(); return; }
    if (busy || G.result || ptr || botsTurn()) return;
    e.preventDefault();
    const s = sqFromPoint(e.clientX, e.clientY);
    if (s < 0) return;
    const p = G.state.board[s];
    const target = sel >= 0 ? selMoves.find(m => m.to === s) : null;
    try { boardEl.setPointerCapture(e.pointerId); } catch {}
    if (target) { ptr = { id: e.pointerId, mode: 'target', sq: s, move: target }; return; }
    if (p && p.c === G.state.turn) {
      const again = sel === s;
      if (!again) Sound.select();
      select(s);
      ptr = { id: e.pointerId, mode: 'piece', sq: s, again, x0: e.clientX, y0: e.clientY, dragging: false, el: pcEls.get(p.id) };
      return;
    }
    ptr = { id: e.pointerId, mode: 'none' };
    if (sel >= 0) { clearSel(); renderMarks(); }
  });

  boardEl.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId || ptr.mode !== 'piece' || !ptr.el) return;
    if (!ptr.dragging) {
      if (Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) < 8) return;
      ptr.dragging = true;
      ptr.el.classList.add('dragging');
    }
    const r = boardEl.getBoundingClientRect(), s = r.width / 8, lift = liftDir() * s * 0.35;
    ptr.el.style.transform = `translate(${e.clientX - r.left - s / 2}px, ${e.clientY - r.top - s / 2 + lift}px) scale(1.2)`;
    setHover(sqFromPoint(e.clientX, e.clientY + lift));
  });

  function endPointer(e, cancelled) {
    if (!ptr || ptr.id !== e.pointerId) return;
    const p = ptr; ptr = null;
    if (G.result) { renderPieces(true); return; }
    if (p.mode === 'piece') {
      if (p.dragging) {
        const s = boardEl.getBoundingClientRect().width / 8;
        const to = cancelled ? -1 : sqFromPoint(e.clientX, e.clientY + liftDir() * s * 0.35);
        clearHover();
        const m = selMoves.find(x => x.to === to);
        if (m) { doMove(m, true); return; }
        p.el.classList.remove('dragging');
        place(p.el, p.sq);
        if (to >= 0 && to !== p.sq) { Sound.illegal(); clearSel(); renderMarks(); }
      } else if (p.again) { clearSel(); renderMarks(); }
    } else if (p.mode === 'target' && !cancelled && sqFromPoint(e.clientX, e.clientY) === p.sq) {
      doMove(p.move, false);
    }
  }
  boardEl.addEventListener('pointerup', e => endPointer(e, false));
  boardEl.addEventListener('pointercancel', e => endPointer(e, true));

  // ---------- making a move ----------
  async function doMove(m, dragged, botPromo) {
    const me = G.state.turn;
    let promo = botPromo || 'q';
    if (m.promo && !m.capture && !botPromo) {
      busy = true;
      promo = await askPromo(me);
      busy = false;
      if (!promo || G.result) { clearSel(); renderPieces(true); renderMarks(); return; }
    }
    busy = true;
    const prev = G.state, mover = prev.board[m.from];
    const sanStr = Atomic.san(prev, m, promo);
    const res = Atomic.apply(prev, m, promo);
    const snapshot = JSON.parse(JSON.stringify(G));
    if (G.clock && G.clock.started && running()) snapshot.clock[me] = clockLeft(me);
    clearSel(); clearHover();

    const el = pcEls.get(mover.id);
    if (el) {
      el.classList.remove('dragging');
      if (dragged) el.classList.add('notrans');
      el.classList.add('lift');
      place(el, m.to);
      if (dragged) { void el.offsetWidth; el.classList.remove('notrans'); }
    }
    if (m.castle) {
      const row = me === 'w' ? 7 : 0, [rf, rt] = m.castle === 'K' ? [7, 5] : [0, 3];
      const rel = pcEls.get(prev.board[row * 8 + rf].id);
      if (rel) place(rel, row * 8 + rt);
    }
    renderMarks();
    if (!dragged) await wait(175);
    if (el) el.classList.remove('lift');

    // Clock: the mover's time is charged, then the increment is added.
    if (G.clock && !G.result) {
      if (G.clock.started) {
        const left = clockLeft(me);
        if (left <= 0) { busy = false; renderPieces(true); flag(me); return; }
        G.clock[me] = left + G.clock.inc;
      } else G.clock.started = true; // White's first move is free; the clock starts now
      paused = false;
      turnStart = performance.now();
      ticked[me] = 0;
    }
    if (G.result) { busy = false; renderPieces(true); return; }

    undoStack.push(snapshot);
    G.state = res.state;
    G.last = { from: m.from, to: m.to };
    for (const x of res.exploded) G.lost[x.p.c].push(x.p.t);
    const k = Atomic.key(G.state);
    G.reps[k] = (G.reps[k] || 0) + 1;
    computeStatus();
    const won = G.result && G.result.winner === me;
    G.moves.push({ s: sanStr + (won ? '#' : ST.check ? '+' : ''), x: res.exploded.length });
    renderAll(false);

    if (res.exploded.length) explode(res);
    else { if (m.castle) Sound.castle(); else Sound.move(); vibrate(10); }
    if (m.promo && !m.capture) Sound.promote();
    if (!G.result && ST.check) setTimeout(() => { Sound.check(); vibrate([20, 60, 20]); }, res.exploded.length ? 380 : 120);
    save();

    if (G.result) {
      const kingBoom = res.exploded.some(x => x.p.t === 'k');
      await wait(kingBoom ? 1600 : 600);
      busy = false;
      showOver();
      return;
    }
    if (!isBot() && settings.layout === 'pass') {
      await wait(res.exploded.length ? 900 : 450);
      await flipView();
    }
    busy = false;
    maybeBot();
  }

  function sqCenter(s) {
    const r = boardEl.getBoundingClientRect(), z = r.width / 8, v = flipped ? 63 - s : s;
    return { x: r.left + ((v & 7) + 0.5) * z, y: r.top + ((v >> 3) + 0.5) * z, s: z };
  }

  function explode(res) {
    const c = sqCenter(res.center);
    const king = res.exploded.some(x => x.p.t === 'k');
    const victims = res.exploded.map(x => {
      const at = x.mover ? c : sqCenter(x.sq);
      return { x: at.x, y: at.y, img: Pieces.img(x.p.c, x.p.t), rot: (tableMode() && x.p.c === 'b') ? Math.PI : 0 };
    });
    FX.explode({ x: c.x, y: c.y, s: c.s, victims, king });
    Sound.boom(res.exploded.length, king);
    vibrate(king ? [90, 40, 220, 60, 140] : [35, 25, 70]);

    const r0 = res.center >> 3, c0 = res.center & 7;
    for (const [dr, dc] of [[0, 0], ...Atomic.AROUND]) {
      const rr = r0 + dr, cc = c0 + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const b = document.createElement('div');
      b.className = 'burn';
      if (dr || dc) b.style.transform = 'scale(.8)';
      sqEls[rr * 8 + cc].appendChild(b);
      setTimeout(() => b.remove(), 3100);
    }

    const amp = king ? c.s * 0.3 : c.s * (0.05 + 0.025 * Math.min(res.exploded.length, 6));
    const n = king ? 18 : 9, frames = [];
    for (let i = 0; i < n; i++) {
      const d = amp * (1 - i / n);
      frames.push({ transform: `translate(${(Math.random() * 2 - 1) * d}px, ${(Math.random() * 2 - 1) * d}px)` });
    }
    frames.push({ transform: 'translate(0, 0)' });
    try { (king ? app : boardEl).animate(frames, { duration: king ? 850 : 380 }); } catch {}
  }

  function flipView() {
    return new Promise(done => {
      if (wantFlip() === flipped) return done();
      try {
        const a = boardEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'rotate(90deg) scale(.92)' }], { duration: 170, easing: 'ease-in' });
        a.onfinish = () => {
          applyLayout(true);
          boardEl.animate([{ opacity: 0, transform: 'rotate(-90deg) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 210, easing: 'ease-out' });
          done();
        };
      } catch { applyLayout(true); done(); }
    });
  }

  // ---------- dialogs ----------
  const modalIds = ['promo', 'over', 'newGame', 'menu', 'rules'];
  const pausing = ['newGame', 'menu', 'rules'];
  let promoResolve = null;
  const openedAt = {};
  const isOpen = id => !$(id).classList.contains('hidden');
  function open(id) {
    openedAt[id] = performance.now();
    $(id).classList.remove('hidden');
    if (pausing.includes(id)) pauseClock();
  }
  function close(id) {
    if (!isOpen(id)) return;
    $(id).classList.add('hidden');
    if (id === 'promo' && promoResolve) { const r = promoResolve; promoResolve = null; r(null); }
    if (id === 'rules') store.set('atomic-seen-rules', true);
    if (pausing.includes(id) && !anyModal()) { resumeClock(); maybeBot(); }
  }
  function closeTop() {
    for (const id of modalIds) if (isOpen(id)) { close(id); return true; }
    return false;
  }

  function askPromo(c) {
    return new Promise(resolve => {
      const box = $('promoChoices');
      box.textContent = '';
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.innerHTML = Pieces.svg(c, t);
        b.addEventListener('click', () => { promoResolve = null; $('promo').classList.add('hidden'); resolve(t); });
        box.appendChild(b);
      }
      $('promoCard').classList.toggle('upside', tableMode() && c === 'b');
      promoResolve = resolve;
      open('promo');
    });
  }

  function showOver() {
    const r = G.result;
    if (!r) return;
    let title;
    if (isBot()) title = !r.winner ? 'Draw' : r.winner === G.human ? 'You win!' : 'The bot wins';
    else title = r.winner ? (r.winner === 'w' ? 'White wins!' : 'Black wins!') : 'Draw';
    $('overTitle').textContent = title;
    $('overReason').textContent = REASON[r.reason] || '';
    $('overIcon').textContent = r.reason === 'explode' ? '💥' : r.reason === 'time' ? '⏱️' : r.winner ? '🏆' : '🤝';
    $('overCard').style.transform = tableMode() && r.winner === 'b' ? 'rotate(180deg)' : '';
    if (r.winner && !(isBot() && r.winner !== G.human)) Sound.win(); else if (!r.winner) Sound.draw();
    vibrate(r.winner ? [40, 40, 40, 40, 120] : 60);
    open('over');
  }

  function newGame() {
    for (const id of modalIds) if (isOpen(id)) { $(id).classList.add('hidden'); }
    promoResolve = null;
    cancelBot();
    G = fresh(); undoStack = []; clearSel(); clearHover();
    for (const el of pcEls.values()) el.remove();
    pcEls.clear();
    paused = false; turnStart = performance.now(); ticked.w = ticked.b = 0;
    computeStatus();
    flipped = !wantFlip(); // force a square rebuild
    applyLayout(true);
    save();
    Sound.castle();
    busy = false;
    setTimeout(maybeBot, 500);
  }

  function undo() {
    if (busy) return;
    cancelBot();
    let prev = undoStack.pop();
    if (!prev) { Sound.illegal(); renderBars(); maybeBot(); return; }
    // Against the bot, go back to your own turn (undoes the bot's reply and your move).
    if (isBot()) while (prev.state.turn !== G.human && undoStack.length) prev = undoStack.pop();
    for (const id of modalIds) if (isOpen(id)) $(id).classList.add('hidden');
    G = prev; clearSel(); clearHover();
    computeStatus();
    turnStart = performance.now(); paused = false;
    if (wantFlip() !== flipped) applyLayout(true); else renderAll(false);
    save();
    Sound.move();
    maybeBot();
  }

  // New-game dialog
  const ng = {};
  function syncSeg(id, val) { for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(val)); }
  function syncNewGame() {
    syncSeg('ngMode', ng.mode); syncSeg('ngColor', ng.color); syncSeg('ngMin', ng.minutes); syncSeg('ngInc', ng.inc);
    $('ngBot').classList.toggle('hidden', ng.mode !== 'bot');
    $('ngIncWrap').classList.toggle('hidden', ng.minutes === 0);
    $('ngLevel').value = ng.level;
    $('ngLevelName').textContent = levelName(ng.level);
  }
  function openNewGame() {
    Object.assign(ng, { mode: settings.mode, color: settings.color, level: settings.level, minutes: settings.minutes, inc: settings.inc });
    $('ngWarn').classList.toggle('hidden', !(G.moves.length && !G.result));
    syncNewGame();
    open('newGame');
  }
  for (const [id, key, num] of [['ngMode', 'mode'], ['ngColor', 'color'], ['ngMin', 'minutes', 1], ['ngInc', 'inc', 1]]) {
    for (const b of $(id).children) b.addEventListener('click', () => { ng[key] = num ? Number(b.dataset.v) : b.dataset.v; syncNewGame(); });
  }
  $('ngLevel').addEventListener('input', e => { ng.level = Number(e.target.value); syncNewGame(); });
  $('ngCancel').addEventListener('click', () => close('newGame'));
  $('ngStart').addEventListener('click', () => {
    Object.assign(settings, ng);
    saveSettings();
    newGame();
  });

  function syncMenu() {
    $('tSound').classList.toggle('on', settings.sound);
    $('tVibe').classList.toggle('on', settings.vibe);
    $('tHints').classList.toggle('on', settings.hints);
    $('tCoords').classList.toggle('on', settings.coords);
    for (const b of $('layoutSeg').children) b.classList.toggle('on', b.dataset.v === settings.layout);
    $('menuSeat').classList.toggle('hidden', isBot());
    $('menuBot').classList.toggle('hidden', !isBot());
    $('mLevel').value = settings.level;
    $('mLevelName').textContent = levelName(settings.level);
    $('btnFull').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    renderMoveList();
  }

  // ---------- wiring ----------
  $('btnUndo').addEventListener('click', () => { Sound.unlock(); onFirstTouch(); undo(); });
  $('btnNew').addEventListener('click', () => { Sound.unlock(); onFirstTouch(); openNewGame(); });
  $('btnRules').addEventListener('click', () => { onFirstTouch(); open('rules'); });
  $('btnMenu').addEventListener('click', () => { Sound.unlock(); onFirstTouch(); syncMenu(); open('menu'); });
  $('rulesClose').addEventListener('click', () => close('rules'));
  $('menuClose').addEventListener('click', () => close('menu'));
  $('overClose').addEventListener('click', () => close('over'));
  $('overNew').addEventListener('click', newGame);

  // Backdrop tap closes a dialog, but not the tap that opened it (touch sends a late click).
  for (const id of modalIds) $(id).addEventListener('click', e => {
    if (e.target.id === id && performance.now() - (openedAt[id] || 0) > 400) close(id);
  });

  const toggles = { tSound: 'sound', tVibe: 'vibe', tHints: 'hints', tCoords: 'coords' };
  for (const [id, key] of Object.entries(toggles)) {
    $(id).addEventListener('click', () => {
      settings[key] = !settings[key];
      saveSettings();
      if (key === 'sound') { Sound.enabled = settings.sound; Sound.select(); }
      if (key === 'vibe') vibrate(30);
      if (key === 'coords') rebuild();
      if (key === 'hints') renderMarks();
      syncMenu();
    });
  }
  for (const b of $('layoutSeg').children) {
    b.addEventListener('click', () => {
      settings.layout = b.dataset.v;
      saveSettings();
      applyLayout(true);
      syncMenu();
    });
  }
  $('mLevel').addEventListener('input', e => {
    settings.level = Number(e.target.value);
    saveSettings();
    $('mLevelName').textContent = levelName(settings.level);
    renderBars();
  });
  $('btnFull').addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } catch {}
  });
  document.addEventListener('fullscreenchange', () => { syncMenu(); });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeTop();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
  });

  // Android back gesture: close a dialog or open the menu instead of leaving the app.
  window.addEventListener('popstate', () => {
    if (!closeTop()) { syncMenu(); open('menu'); }
    try { history.pushState({ atomic: 1 }, ''); } catch {}
  });

  // Keep the screen on during a game; pause the clock when the app goes to the background.
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseClock();
    else { if (!firstTouch) keepAwake(); maybeBot(); }
  });

  window.addEventListener('resize', sizeBoard);
  if ('ResizeObserver' in window) new ResizeObserver(sizeBoard).observe($('boardWrap'));

  // ---------- start ----------
  Pieces.preload();
  FX.init($('fx'));
  load();
  computeStatus();
  if (clockOn()) paused = true; // a saved timed game resumes when you tap the board
  sizeBoard();
  applyLayout(true);
  if (!store.get('atomic-seen-rules', false)) open('rules');
  else setTimeout(maybeBot, 400);

  // Test hook (harmless in production): lets automated checks read the state.
  window.__atomic = { get G() { return G; }, get ST() { return ST; }, sqCenter, get paused() { return paused; } };
})();
