/* =============================================================
   Dots and Lines – computer opponent
   Runs as a Web Worker (so the board keeps animating while it
   thinks) and also works as a plain <script> fallback.

   Levels
     1 easy    – sometimes misses boxes, often gives boxes away
     2 medium  – never misses a box, avoids giving boxes, gives the
                 smallest chain when forced. Never "double-deals".
     3 hard    – medium + perfect endgame play (double-dealing,
                 keeping control of the long chains)
     4 expert  – hard + looks ahead during the opening to win the
                 long-chain parity battle
   ============================================================= */
(function (root) {
  'use strict';

  let ROWS = 0, COLS = 0, NH = 0, E = 0, BR = 0, BC = 0, B = 0;
  let adj = [], boxEdges = [], POW = [];
  let edge, sides, key = 0, free = 0;

  function init(rows, cols) {
    if (rows === ROWS && cols === COLS) return;
    ROWS = rows; COLS = cols;
    NH = ROWS * (COLS - 1);
    E = NH + (ROWS - 1) * COLS;
    BR = ROWS - 1; BC = COLS - 1; B = BR * BC;
    adj = []; boxEdges = []; POW = [];
    for (let e = 0; e < E; e++) POW.push(Math.pow(2, e));        // exact up to 2^52
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
      const a = [];
      if (r > 0) a.push((r - 1) * BC + c);
      if (r < BR) a.push(r * BC + c);
      adj.push(a);
    }
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
      const a = [];
      if (c > 0) a.push(r * BC + c - 1);
      if (c < BC) a.push(r * BC + c);
      adj.push(a);
    }
    for (let r = 0; r < BR; r++) for (let c = 0; c < BC; c++) {
      boxEdges.push([r * (COLS - 1) + c, (r + 1) * (COLS - 1) + c, NH + r * COLS + c, NH + r * COLS + c + 1]);
    }
    TT.clear();
  }

  const hIdx = (r, c) => r * (COLS - 1) + c;
  const vIdx = (r, c) => NH + r * COLS + c;
  function toMove(e) {
    if (e < NH) return { type: 'h', r: Math.floor(e / (COLS - 1)), c: e % (COLS - 1) };
    const k = e - NH;
    return { type: 'v', r: Math.floor(k / COLS), c: k % COLS };
  }

  function load(h, v) {
    init(h.length, h[0].length + 1);
    edge = new Uint8Array(E); sides = new Uint8Array(B); key = 0; free = E;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) if (h[r][c]) play(hIdx(r, c));
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) if (v[r][c]) play(vIdx(r, c));
  }

  /* ---------- board primitives ---------- */
  function play(e) {
    edge[e] = 1; key += POW[e]; free--;
    let done = 0;
    const a = adj[e];
    for (let i = 0; i < a.length; i++) if (++sides[a[i]] === 4) done++;
    return done;
  }
  function unplay(e) {
    edge[e] = 0; key -= POW[e]; free++;
    const a = adj[e];
    for (let i = 0; i < a.length; i++) sides[a[i]]--;
  }
  function freeEdgeOf(b, not) {
    const be = boxEdges[b];
    for (let i = 0; i < 4; i++) if (!edge[be[i]] && be[i] !== not) return be[i];
    return -1;
  }
  function otherBox(e, b) {
    const a = adj[e];
    return a.length === 2 ? (a[0] === b ? a[1] : a[0]) : -1;
  }
  function isSafe(e) {
    const a = adj[e];
    for (let i = 0; i < a.length; i++) if (sides[a[i]] >= 2) return false;
    return true;
  }
  function safeEdges() {
    const out = [];
    for (let e = 0; e < E; e++) if (!edge[e] && isSafe(e)) out.push(e);
    return out;
  }
  function freeEdges() {
    const out = [];
    for (let e = 0; e < E; e++) if (!edge[e]) out.push(e);
    return out;
  }
  function capturable() {
    const out = [];
    for (let b = 0; b < B; b++) if (sides[b] === 3) out.push(b);
    return out;
  }
  // Capturing this box can never be wrong: its last line goes to the
  // border or to a box that is not part of a running chain.
  function findForced() {
    for (let b = 0; b < B; b++) {
      if (sides[b] !== 3) continue;
      const f = freeEdgeOf(b, -1), x = otherBox(f, b);
      if (x < 0 || sides[x] !== 2) return f;
    }
    return -1;
  }
  // "Double-dealing": leave the last two boxes of a chain (or four of a loop)
  // to the opponent, so they have to open the next chain.
  function ddAllowed(x, g) {
    const z = otherBox(g, x);
    if (z < 0 || sides[z] <= 1) return true;
    if (sides[z] === 2) {
      const zf = freeEdgeOf(z, g), w = otherBox(zf, z);
      return w >= 0 && sides[w] === 3;
    }
    return false;
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* ---------- greedy helpers for the easy / medium bots ---------- */
  // how many boxes a greedy opponent collects after we play e
  function giveaway(e) {
    const stack = [e];
    play(e);
    let n = 0;
    for (;;) {
      const caps = capturable();
      if (!caps.length) break;
      const f = freeEdgeOf(caps[0], -1);
      n += play(f); stack.push(f);
    }
    for (let i = stack.length - 1; i >= 0; i--) unplay(stack[i]);
    return n;
  }
  function smallestSacrifice() {
    let best = Infinity, list = [];
    for (const e of freeEdges()) {
      const n = giveaway(e);
      if (n < best) { best = n; list = [e]; } else if (n === best) list.push(e);
    }
    return pick(list);
  }

  /* ---------- search (hard / expert) ---------- */
  // TT: position key -> packed { value, flag, depth, best move }
  const TT = new Map();
  const EXACT = 0, LOWER = 1, UPPER = 2, DEPTH_EXACT = 127;
  const ABORT = { abort: true };
  let nodes = 0, deadline = 0, fullWidthAt = 0;

  function ttPut(k, v, f, d, m) {
    if (TT.size > 400000) TT.clear();
    const vv = Math.max(-63, Math.min(63, Math.round(v))) + 64;
    TT.set(k, vv | (f << 7) | (Math.min(d, DEPTH_EXACT) << 9) | ((m + 1) << 16));
  }

  // Leaf estimate while safe moves still exist: the long-chain parity rule.
  // Whoever is on move when the safe moves run out has to open the first chain.
  function heuristic() {
    const stack = [];
    for (;;) {
      let s = -1;
      for (let e = 0; e < E; e++) if (!edge[e] && isSafe(e)) { s = e; break; }
      if (s < 0) break;
      play(s); stack.push(s);
    }
    const n = stack.length;
    for (let i = n - 1; i >= 0; i--) unplay(stack[i]);
    let left = 0;
    for (let b = 0; b < B; b++) if (sides[b] < 4) left++;
    const mag = 1 + (left >> 2);
    return n % 2 === 0 ? -mag : mag;
  }

  function search(depth, alpha, beta) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw ABORT;
    let gain = 0, f;
    const forced = [];
    while ((f = findForced()) >= 0) { gain += play(f); forced.push(f); }
    const v = free === 0 ? 0 : core(depth, alpha - gain, beta - gain);
    for (let i = forced.length - 1; i >= 0; i--) unplay(forced[i]);
    return gain + v;
  }

  // Candidate moves at a position without forced captures.
  // Returns null when this is a depth-limited leaf.
  function generate(depth, out) {
    const caps = capturable();
    if (caps.length) {
      for (const b of caps) {
        const f = freeEdgeOf(b, -1), x = otherBox(f, b);
        if (!out.includes(f)) out.push(f);
        const g = freeEdgeOf(x, f);
        if (g >= 0 && !out.includes(g) && ddAllowed(x, g)) out.push(g);
      }
      return { exact: false };
    }
    const safe = safeEdges();
    if (safe.length) {
      if (depth <= 0) return null;
      for (const e of safe) out.push(e);
      if (free <= fullWidthAt) for (let e = 0; e < E; e++) if (!edge[e] && !isSafe(e)) out.push(e);
      return { exact: false };
    }
    for (let e = 0; e < E; e++) if (!edge[e]) out.push(e);
    return { exact: true };
  }

  function core(depth, alpha, beta) {
    const k = key, a0 = alpha;
    const ent = TT.get(k);
    let ttMove = -1;
    if (ent !== undefined) {
      const v = (ent & 127) - 64, fl = (ent >> 7) & 3, d = (ent >> 9) & 127;
      ttMove = (ent >> 16) - 1;
      if (d >= depth || d === DEPTH_EXACT) {
        if (fl === EXACT) return v;
        if (fl === LOWER && v >= beta) return v;
        if (fl === UPPER && v <= alpha) return v;
      }
    }
    const moves = [];
    const g = generate(depth, moves);
    if (!g) return heuristic();
    if (ttMove >= 0) { const i = moves.indexOf(ttMove); if (i > 0) { moves[i] = moves[0]; moves[0] = ttMove; } }
    let best = -Infinity, bm = moves[0];
    for (let i = 0; i < moves.length; i++) {
      const e = moves[i];
      const c = play(e);
      const val = c > 0 ? c + search(depth, alpha - c, beta - c) : -search(depth - 1, -beta, -alpha);
      unplay(e);
      if (val > best) { best = val; bm = e; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    const flag = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    ttPut(k, best, flag, g.exact ? DEPTH_EXACT : Math.max(0, depth), bm);
    return best;
  }

  function rootSearch(depth, moves) {
    let alpha = -Infinity, best = -Infinity, bm = moves[0];
    for (const e of moves) {
      const c = play(e);
      const val = c > 0 ? c + search(depth, alpha - c, Infinity) : -search(depth - 1, -Infinity, -alpha);
      unplay(e);
      if (val > best) { best = val; bm = e; }
      if (best > alpha) alpha = best;
    }
    return { move: bm, value: best };
  }

  function think(ms, fullWidth) {
    const f = findForced();
    if (f >= 0) return f;
    deadline = Date.now() + ms; nodes = 0; fullWidthAt = fullWidth;
    let moves = [];
    const g = generate(1, moves);
    shuffle(moves);
    if (moves.length === 1) return moves[0];
    let best = null;
    for (let d = 1; d <= free + 1; d++) {
      try { best = rootSearch(d, moves); }
      catch (err) { if (err !== ABORT) throw err; break; }
      moves = [best.move].concat(moves.filter((m) => m !== best.move));
      if (g.exact) break;                    // endgame: one full search is exact
    }
    if (best) return best.move;
    // ran out of time before a single pass finished
    const caps = capturable();
    if (caps.length) return freeEdgeOf(caps[0], -1);
    const safe = safeEdges();
    return safe.length ? pick(safe) : smallestSacrifice();
  }

  /* ---------- level policies ---------- */
  function chooseEdge(level) {
    const caps = capturable();
    const safe = safeEdges();
    if (level <= 1) {
      if (caps.length && Math.random() < 0.6) return freeEdgeOf(pick(caps), -1);
      if (safe.length && Math.random() < 0.7) return pick(safe);
      return pick(freeEdges());
    }
    if (level === 2) {
      if (caps.length) return freeEdgeOf(caps[0], -1);
      if (safe.length) return pick(safe);
      return smallestSacrifice();
    }
    if (level === 3) {
      if (!caps.length && safe.length > 4) return pick(safe);
      return think(700, 12);
    }
    return think(1600, 18);
  }

  function choose(h, v, level) {
    load(h, v);
    if (free === 0) return null;
    return toMove(chooseEdge(level));
  }

  // exact value for the player to move (testing only)
  function exactValue(h, v) {
    load(h, v);
    deadline = Infinity; fullWidthAt = E;
    return search(999, -Infinity, Infinity);
  }

  const api = { choose, _exactValue: exactValue };
  root.DotsBot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // Web Worker mode
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (ev) => {
      const { id, h, v, level } = ev.data;
      let move = null;
      try { move = choose(h, v, level); } catch (e) { move = null; }
      root.postMessage({ id, move });
    };
  }
})(typeof self !== 'undefined' ? self : this);
