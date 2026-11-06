// Atomic chess bot. Runs in a Web Worker so the board stays smooth while it thinks.
// Self-contained (integer board, make/unmake, Zobrist hashing, alpha-beta with
// quiescence, transposition table, killer/history ordering, PVS + late-move reductions).
// Board index = row*8 + col, row 0 = rank 8 (same as engine.js).
(function () {
'use strict';

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const CAP = 1, EP = 2, DBL = 4, CK = 8, CQ = 16, PRO = 32;
const VAL = [0, 100, 300, 320, 500, 950, 0];
const GAINV = [0, 100, 300, 320, 500, 950, 30000];
const MATE = 100000, INF = 1000000, MAXPLY = 64;
const TYPE = { p: P, n: N, b: B, r: R, q: Q, k: K };
const LETTER = ['', 'p', 'n', 'b', 'r', 'q', 'k'];

// ---- precomputed tables ----
const KN = [], KG = [], RAYS = [], CENT = new Int8Array(64), ADJ = new Uint8Array(64 * 64);
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
for (let s = 0; s < 64; s++) {
  const r = s >> 3, c = s & 7;
  KN[s] = []; KG[s] = []; RAYS[s] = [];
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) KN[s].push(rr * 8 + cc);
  }
  for (const [dr, dc] of DIRS) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { KG[s].push(rr * 8 + cc); ADJ[s * 64 + rr * 8 + cc] = 1; }
    const ray = [];
    let a = r + dr, b = c + dc;
    while (a >= 0 && a < 8 && b >= 0 && b < 8) { ray.push(a * 8 + b); a += dr; b += dc; }
    RAYS[s].push(ray);
  }
  CENT[s] = Math.round((3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5))) * 2);
}

// ---- material + piece-square values, kept up to date incrementally (white-positive) ----
const PSQ = new Int16Array(13 * 64);
for (let a = 1; a <= 6; a++) for (let s = 0; s < 64; s++) for (const sg of [1, -1]) {
  const r = s >> 3, c = s & 7;
  let v = VAL[a];
  if (a === P) { const adv = sg === 1 ? 6 - r : r - 1; v += adv * adv * 3 + (c >= 2 && c <= 5 ? 4 : 0); }
  else if (a === N) v += CENT[s] * 8;
  else if (a === B) v += CENT[s] * 5;
  else if (a === Q) v += CENT[s] * 2;
  else if (a === K) v -= (sg === 1 ? 7 - r : r) * 12;
  PSQ[(a * sg + 6) * 64 + s] = sg * v;
}

// ---- Zobrist keys (two 32-bit halves) ----
let seed = 0x2545F491;
const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZL = new Int32Array(13 * 64), ZH = new Int32Array(13 * 64);
for (let i = 0; i < 13 * 64; i++) { ZL[i] = rnd32(); ZH[i] = rnd32(); }
const ZCL = new Int32Array(16), ZCH = new Int32Array(16), ZEL = new Int32Array(64), ZEH = new Int32Array(64);
for (let i = 0; i < 16; i++) { ZCL[i] = rnd32(); ZCH[i] = rnd32(); }
for (let i = 0; i < 64; i++) { ZEL[i] = rnd32(); ZEH[i] = rnd32(); }
const ZSL = rnd32(), ZSH = rnd32();

// ---- position ----
// Undo information lives in preallocated typed arrays (no garbage per move = much faster on phones).
const MAXS = 160, MB = 256;
const bd = new Int8Array(64);
const kingSq = [-1, -1]; // [white, black]
let side = 1, castle = 0, ep = -1, half = 0, hLo = 0, hHi = 0, mat = 0;
let sp = 0, chTop = 0, histN = 0;
const chSq = new Int8Array(MAXS * 16), chP = new Int8Array(MAXS * 16);
const sMat = new Int32Array(MAXS), sLo = new Int32Array(MAXS), sHi = new Int32Array(MAXS), sCh = new Int32Array(MAXS), sHalf = new Int32Array(MAXS);
const sCastle = new Int8Array(MAXS), sEp = new Int8Array(MAXS), sK0 = new Int8Array(MAXS), sK1 = new Int8Array(MAXS);
const histLo = new Int32Array(MAXS + 2048);
const moveBuf = new Int32Array(MAXS * MB), scoreBuf = new Int32Array(MAXS * MB);

function put(s, p) {
  const o = bd[s];
  chSq[chTop] = s; chP[chTop] = o; chTop++;
  if (o) {
    hLo ^= ZL[(o + 6) * 64 + s]; hHi ^= ZH[(o + 6) * 64 + s]; mat -= PSQ[(o + 6) * 64 + s];
    if (o === K) kingSq[0] = -1; else if (o === -K) kingSq[1] = -1;
  }
  bd[s] = p;
  if (p) {
    hLo ^= ZL[(p + 6) * 64 + s]; hHi ^= ZH[(p + 6) * 64 + s]; mat += PSQ[(p + 6) * 64 + s];
    if (p === K) kingSq[0] = s; else if (p === -K) kingSq[1] = s;
  }
}
function xorState() {
  hLo ^= ZCL[castle]; hHi ^= ZCH[castle];
  if (ep >= 0) { hLo ^= ZEL[ep]; hHi ^= ZEH[ep]; }
}

function make(m) {
  const from = m & 63, to = (m >> 6) & 63, fl = (m >> 12) & 63, pr = (m >> 18) & 7;
  sMat[sp] = mat; sLo[sp] = hLo; sHi[sp] = hHi; sCastle[sp] = castle; sEp[sp] = ep; sHalf[sp] = half;
  sK0[sp] = kingSq[0]; sK1[sp] = kingSq[1]; sCh[sp] = chTop; sp++;
  xorState();
  const p = bd[from];
  if (fl & CAP) {
    const cap = (fl & EP) ? to + (side === 1 ? 8 : -8) : to;
    put(cap, 0); put(from, 0);
    const nb = KG[to];
    for (let i = 0; i < nb.length; i++) { const q = bd[nb[i]]; if (q !== 0 && q !== 1 && q !== -1) put(nb[i], 0); }
    half = 0;
  } else {
    put(from, 0);
    put(to, (fl & PRO) ? pr * side : p);
    if (fl & CK) { put(to - 1, bd[to + 1]); put(to + 1, 0); }
    else if (fl & CQ) { put(to + 1, bd[to - 2]); put(to - 2, 0); }
    half = (p === 1 || p === -1) ? 0 : half + 1;
  }
  ep = (fl & DBL) ? (from + to) >> 1 : -1;
  if (castle) {
    if (bd[60] !== K) castle &= ~3;
    if (bd[63] !== R) castle &= ~1;
    if (bd[56] !== R) castle &= ~2;
    if (bd[4] !== -K) castle &= ~12;
    if (bd[7] !== -R) castle &= ~4;
    if (bd[0] !== -R) castle &= ~8;
  }
  xorState();
  side = -side; hLo ^= ZSL; hHi ^= ZSH;
  histLo[histN++] = hLo;
}

function unmake() {
  sp--; histN--;
  const c0 = sCh[sp];
  for (let i = chTop - 1; i >= c0; i--) bd[chSq[i]] = chP[i];
  chTop = c0;
  mat = sMat[sp]; hLo = sLo[sp]; hHi = sHi[sp]; castle = sCastle[sp]; ep = sEp[sp]; half = sHalf[sp];
  kingSq[0] = sK0[sp]; kingSq[1] = sK1[sp]; side = -side;
}

// Can colour `by` capture on s? (kings never capture in atomic)
function attacked(s, by) {
  const r = s >> 3, c = s & 7;
  if (by === 1) { if (r < 7) { if (c > 0 && bd[s + 7] === P) return true; if (c < 7 && bd[s + 9] === P) return true; } }
  else if (r > 0) { if (c > 0 && bd[s - 9] === -P) return true; if (c < 7 && bd[s - 7] === -P) return true; }
  const kn = N * by, kl = KN[s];
  for (let i = 0; i < kl.length; i++) if (bd[kl[i]] === kn) return true;
  const rk = R * by, qn = Q * by, bs = B * by, rays = RAYS[s];
  for (let d = 0; d < 8; d++) {
    const ray = rays[d], a = d < 4 ? rk : bs;
    for (let i = 0; i < ray.length; i++) {
      const q = bd[ray[i]];
      if (q) { if (q === a || q === qn) return true; break; }
    }
  }
  return false;
}

function inCheck(col) {
  const k = kingSq[col === 1 ? 0 : 1];
  if (k < 0) return false;
  const o = kingSq[col === 1 ? 1 : 0];
  if (o >= 0 && ADJ[k * 64 + o]) return false; // touching kings are never in check
  return attacked(k, -col);
}

function safeKing(from, to, col) {
  const i = col === 1 ? 0 : 1;
  bd[to] = bd[from]; bd[from] = 0; kingSq[i] = to;
  const ok = !inCheck(col);
  bd[from] = bd[to]; bd[to] = 0; kingSq[i] = from;
  return ok;
}

function gen(n, capsOnly) {
  const s = side, out = moveBuf;
  for (let from = 0; from < 64; from++) {
    const p = bd[from] * s;
    if (p <= 0) continue;
    if (p === P) {
      const dir = s === 1 ? -8 : 8, r = from >> 3, c = from & 7, pre = s === 1 ? 1 : 6, start = s === 1 ? 6 : 1;
      const one = from + dir;
      if (bd[one] === 0) {
        if (r === pre) {
          if (capsOnly) out[n++] = from | one << 6 | PRO << 12 | Q << 18;
          else { const b = from | one << 6 | PRO << 12; out[n++] = b | Q << 18; out[n++] = b | N << 18; out[n++] = b | R << 18; out[n++] = b | B << 18; }
        } else if (!capsOnly) {
          out[n++] = from | one << 6;
          if (r === start && bd[one + dir] === 0) out[n++] = from | (one + dir) << 6 | DBL << 12;
        }
      }
      for (let dc = -1; dc <= 1; dc += 2) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const t = one + dc, q = bd[t];
        if (q * s < 0) out[n++] = from | t << 6 | CAP << 12;
        else if (q === 0 && t === ep) out[n++] = from | t << 6 | (CAP | EP) << 12;
      }
    } else if (p === N) {
      const kl = KN[from];
      for (let i = 0; i < kl.length; i++) {
        const t = kl[i], q = bd[t];
        if (q === 0) { if (!capsOnly) out[n++] = from | t << 6; }
        else if (q * s < 0) out[n++] = from | t << 6 | CAP << 12;
      }
    } else if (p === K) {
      if (capsOnly) continue;
      const kl = KG[from];
      for (let i = 0; i < kl.length; i++) if (bd[kl[i]] === 0) out[n++] = from | kl[i] << 6;
      const home = s === 1 ? 60 : 4, kb = s === 1 ? 1 : 4, qb = s === 1 ? 2 : 8;
      if (from === home && (castle & (kb | qb)) && !inCheck(s)) {
        if ((castle & kb) && bd[home + 1] === 0 && bd[home + 2] === 0 && bd[home + 3] === R * s &&
          safeKing(home, home + 1, s) && safeKing(home, home + 2, s)) out[n++] = home | (home + 2) << 6 | CK << 12;
        if ((castle & qb) && bd[home - 1] === 0 && bd[home - 2] === 0 && bd[home - 3] === 0 && bd[home - 4] === R * s &&
          safeKing(home, home - 1, s) && safeKing(home, home - 2, s)) out[n++] = home | (home - 2) << 6 | CQ << 12;
      }
    } else {
      const d0 = p === B ? 4 : 0, d1 = p === R ? 4 : 8, rays = RAYS[from];
      for (let d = d0; d < d1; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const t = ray[i], q = bd[t];
          if (q === 0) { if (!capsOnly) out[n++] = from | t << 6; }
          else { if (q * s < 0) out[n++] = from | t << 6 | CAP << 12; break; }
        }
      }
    }
  }
  return n;
}

// Exact material swing of a capture (in atomic there is no recapture of the capturer: it explodes too).
function gain(m) {
  const from = m & 63, to = (m >> 6) & 63, fl = (m >> 12) & 63, s = side;
  const cap = (fl & EP) ? to + (s === 1 ? 8 : -8) : to;
  const a = bd[cap], b = bd[from];
  let g = GAINV[a > 0 ? a : -a] - GAINV[b > 0 ? b : -b];
  const nb = KG[to];
  for (let i = 0; i < nb.length; i++) {
    const n = nb[i];
    if (n === from || n === cap) continue;
    const q = bd[n];
    if (q === 0 || q === 1 || q === -1) continue;
    const v = GAINV[q > 0 ? q : -q];
    g += q * s < 0 ? v : -v;
  }
  return g;
}

function evaluate() {
  let sc = mat;
  // Atomic king danger: every own piece next to your king is a fuse. For the side to move, an
  // enemy-attacked piece next to its own king means the king can be blown up next move.
  // (Threats against the other king are found by the capture search, so they are not checked here.)
  for (let i = 0; i < 2; i++) {
    const k = kingSq[i];
    if (k < 0) continue;
    const col = i === 0 ? 1 : -1, nb = KG[k], toMove = col === side;
    let pen = 0;
    for (let j = 0; j < nb.length; j++) {
      if (bd[nb[j]] * col > 0) { pen += 8; if (toMove && attacked(nb[j], -col)) pen += 70; }
    }
    sc -= col * pen;
  }
  return sc * side + 10;
}

// ---- search ----
const TT_SIZE = 1 << 19, TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
const killers = new Int32Array(MAXPLY * 2 + 4), history = new Int32Array(4096);
let nodes = 0, stopAt = 0, stopped = false;

function isRep() {
  const n = histN - 1, lim = Math.max(0, n - half);
  for (let i = n - 2; i >= lim; i -= 2) if (histLo[i] === hLo) return true;
  return false;
}

function orderScores(b, e, ttm, ply) {
  const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
  for (let i = b; i < e; i++) {
    const m = moveBuf[i], fl = (m >> 12) & 63;
    let v;
    if (m === ttm) v = 100000000;
    else if (fl & CAP) { const g = gain(m); v = g >= 0 ? 1000000 + g : g - 1000; }
    else if (fl & PRO) v = 900000 + ((m >> 18) & 7);
    else if (m === k1) v = 800000;
    else if (m === k2) v = 700000;
    else v = history[m & 4095];
    scoreBuf[i] = v;
  }
}
function pick(i, e) {
  let b = i, bs = scoreBuf[i];
  for (let j = i + 1; j < e; j++) if (scoreBuf[j] > bs) { b = j; bs = scoreBuf[j]; }
  if (b !== i) {
    const t = moveBuf[i]; moveBuf[i] = moveBuf[b]; moveBuf[b] = t;
    scoreBuf[b] = scoreBuf[i]; scoreBuf[i] = bs;
  }
  return moveBuf[i];
}

function qs(alpha, beta, ply, qd) {
  if ((++nodes & 1023) === 0 && Date.now() > stopAt) stopped = true;
  if (stopped) return 0;
  const me = side, mi = me === 1 ? 0 : 1;
  const check = inCheck(me);
  if (!check || qd > 6 || ply >= MAXPLY) {
    const st = evaluate();
    if (st >= beta) return st;
    if (st > alpha) alpha = st;
    if (qd > 6 || ply >= MAXPLY) return alpha;
  }
  const b = sp * MB, e = gen(b, !check);
  orderScores(b, e, 0, Math.min(ply, MAXPLY));
  let best = check ? -INF : alpha, legal = 0;
  for (let i = b; i < e; i++) {
    const m = pick(i, e);
    if (!check && scoreBuf[i] < 0) break; // only captures that win material
    make(m);
    if (kingSq[mi] < 0) { unmake(); continue; }
    let v;
    if (kingSq[1 - mi] < 0) v = MATE - ply - 1;
    else if (inCheck(me)) { unmake(); continue; }
    else v = -qs(-beta, -alpha, ply + 1, qd + 1);
    unmake();
    legal++;
    if (stopped) return 0;
    if (v > best) best = v;
    if (v > alpha) { alpha = v; if (alpha >= beta) break; }
  }
  if (check) return legal ? best : -MATE + ply;
  return alpha;
}

function search(depth, alpha, beta, ply) {
  if ((++nodes & 1023) === 0 && Date.now() > stopAt) stopped = true;
  if (stopped) return 0;
  const me = side, mi = me === 1 ? 0 : 1;
  if (half >= 100 || isRep()) return 0;
  if (alpha < -MATE + ply) alpha = -MATE + ply;
  if (beta > MATE - ply - 1) beta = MATE - ply - 1;
  if (alpha >= beta) return alpha;
  if (ply >= MAXPLY) return evaluate();
  const check = inCheck(me);
  if (check) depth++;
  if (depth <= 0) return qs(alpha, beta, ply, 0);

  const ti = hLo & TT_MASK;
  let ttm = 0;
  if (ttFlag[ti] && ttKey[ti] === hHi) {
    ttm = ttMove[ti];
    if (ttDepth[ti] >= depth) {
      let s = ttScore[ti];
      if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;
      const f = ttFlag[ti];
      if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
    }
  }

  const b = sp * MB, e = gen(b, false);
  orderScores(b, e, ttm, ply);
  const a0 = alpha;
  let best = -INF, bestM = 0, legal = 0;
  for (let i = b; i < e; i++) {
    const m = pick(i, e), fl = (m >> 12) & 63;
    make(m);
    if (kingSq[mi] < 0) { unmake(); continue; }
    let v;
    if (kingSq[1 - mi] < 0) { v = MATE - ply - 1; legal++; }
    else if (inCheck(me)) { unmake(); continue; }
    else {
      legal++;
      if (legal === 1) v = -search(depth - 1, -beta, -alpha, ply + 1);
      else {
        let red = 0;
        if (depth >= 3 && !check && !(fl & (CAP | PRO)) && legal > 3 && !inCheck(side)) red = legal > 10 ? 2 : 1;
        v = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (!stopped && v > alpha && (red > 0 || v < beta)) v = -search(depth - 1, -beta, -alpha, ply + 1);
      }
    }
    unmake();
    if (stopped) return 0;
    if (v > best) {
      best = v; bestM = m;
      if (v > alpha) {
        alpha = v;
        if (alpha >= beta) {
          if (!(fl & CAP)) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            history[m & 4095] += depth * depth;
            if (history[m & 4095] > 400000) for (let h = 0; h < 4096; h++) history[h] >>= 1;
          }
          break;
        }
      }
    }
  }
  if (!legal) return check ? -MATE + ply : 0;
  let st = best;
  if (st > MATE - 1000) st += ply; else if (st < -MATE + 1000) st -= ply;
  ttKey[ti] = hHi; ttMove[ti] = bestM; ttScore[ti] = st; ttDepth[ti] = depth;
  ttFlag[ti] = best <= a0 ? 3 : best >= beta ? 2 : 1;
  return best;
}

// ---- levels ----
// 1-4 score every move at a shallow depth and pick with random noise (human-like mistakes);
// 5-8 search properly with iterative deepening. `time` is the most a move may take;
// strong levels stop early once the best move has stayed the same for a few depths.
const LEVELS = [null,
  { name: 'Beginner', multi: true, depth: 1, noise: 320, blunder: 0.3, time: 400 },
  { name: 'Novice', multi: true, depth: 1, noise: 150, blunder: 0.12, time: 400 },
  { name: 'Casual', multi: true, depth: 2, noise: 80, blunder: 0.05, time: 600 },
  { name: 'Club', multi: true, depth: 3, noise: 35, blunder: 0, time: 900 },
  { name: 'Strong', depth: 4, time: 500 },
  { name: 'Expert', depth: 7, time: 900, settle: 6 },
  { name: 'Master', depth: 12, time: 1600, settle: 8 },
  { name: 'Grandmaster', depth: 60, time: 3000, settle: 10 },
];

function loadState(st) {
  bd.fill(0); kingSq[0] = kingSq[1] = -1;
  for (let s = 0; s < 64; s++) {
    const p = st.board[s];
    if (!p) continue;
    const v = TYPE[p.t] * (p.c === 'w' ? 1 : -1);
    bd[s] = v;
    if (v === K) kingSq[0] = s; else if (v === -K) kingSq[1] = s;
  }
  side = st.turn === 'w' ? 1 : -1;
  const c = st.castle || {};
  castle = (c.wK ? 1 : 0) | (c.wQ ? 2 : 0) | (c.bK ? 4 : 0) | (c.bQ ? 8 : 0);
  ep = st.ep >= 0 ? st.ep : -1; half = st.half || 0;
  hLo = 0; hHi = 0; mat = 0;
  for (let s = 0; s < 64; s++) if (bd[s]) { hLo ^= ZL[(bd[s] + 6) * 64 + s]; hHi ^= ZH[(bd[s] + 6) * 64 + s]; mat += PSQ[(bd[s] + 6) * 64 + s]; }
  xorState();
  if (side === -1) { hLo ^= ZSL; hHi ^= ZSH; }
}

function think(state, histStates, level, maxTime) {
  const L = LEVELS[level] || LEVELS[5];
  histN = 0; sp = 0; chTop = 0;
  for (const h of histStates || []) { loadState(h); histLo[histN++] = hLo; }
  loadState(state); histLo[histN++] = hLo;
  killers.fill(0);
  for (let h = 0; h < 4096; h++) history[h] >>= 2;
  const t0 = Date.now(), budget = Math.max(60, Math.min(L.time, maxTime || Infinity));
  stopAt = t0 + budget; stopped = false; nodes = 0;

  const me = side, mi = me === 1 ? 0 : 1, e = gen(0, false);
  const all = Array.from(moveBuf.subarray(0, e)), root = [];
  for (const m of all) {
    make(m);
    const ok = kingSq[mi] >= 0 && (kingSq[1 - mi] < 0 || !inCheck(me));
    const win = ok && kingSq[1 - mi] < 0;
    unmake();
    if (ok) root.push({ m, win, score: 0 });
  }
  if (!root.length) return null;
  const done = (m, score, depth) => ({ move: m, score, depth, nodes, ms: Date.now() - t0 });
  if (root.length === 1) return done(root[0].m, 0, 0);

  if (L.multi) {
    if (Math.random() < L.blunder) return done(root[(Math.random() * root.length) | 0].m, 0, 0);
    for (const r of root) r.score = -INF;
    root.sort(() => Math.random() - 0.5);
    for (const r of root) {
      make(r.m);
      const v = r.win ? MATE - 1 : -search(L.depth - 1, -INF, INF, 1);
      unmake();
      if (stopped) break;
      r.score = v;
    }
    let best = root[0], bestN = -Infinity;
    for (const r of root) {
      if (r.score === -INF) continue;
      const n = r.score + (Math.random() * 2 - 1) * L.noise;
      if (n > bestN) { bestN = n; best = r; }
    }
    return done(best.m, best.score, L.depth);
  }

  const win = root.find(r => r.win);
  if (win) return done(win.m, MATE - 1, 1);
  let best = root[0].m, bestScore = 0, depthDone = 0, stable = 0;
  for (let d = 1; d <= L.depth; d++) {
    root.sort((a, b) => b.score - a.score);
    let alpha = -INF, iterBest = null;
    for (let i = 0; i < root.length; i++) {
      const r = root[i];
      make(r.m);
      let v;
      if (i === 0) v = -search(d - 1, -INF, -alpha, 1);
      else {
        v = -search(d - 1, -alpha - 1, -alpha, 1);
        if (!stopped && v > alpha) v = -search(d - 1, -INF, -alpha, 1);
      }
      unmake();
      if (stopped) break;
      r.score = i === 0 || v > alpha ? v : -INF + 1 + i; // keep order of failed moves
      if (v > alpha) { alpha = v; iterBest = r; }
    }
    if (iterBest) {
      stable = iterBest.m === best ? stable + 1 : 0;
      best = iterBest.m; bestScore = iterBest.score;
    }
    if (stopped) break;
    depthDone = d;
    const used = Date.now() - t0;
    if (Math.abs(bestScore) > MATE - 1000) break;          // forced win or loss found
    if (used > budget * 0.45) break;                        // next depth would not finish in time
    if (L.settle && d >= L.settle && stable >= 3 && used > budget * 0.12) break; // move is settled
  }
  return done(best, bestScore, depthDone);
}

const decode = m => ({ from: m & 63, to: (m >> 6) & 63, promo: ((m >> 12) & PRO) ? LETTER[(m >> 18) & 7] : null });

if (typeof module !== 'undefined') {
  module.exports = { think, decode, gen, make, unmake, loadState, inCheck, kingSq, moveBuf, get side() { return side; }, get sp() { return sp; }, LEVELS };
} else if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = e => {
    const d = e.data;
    let r = null;
    try { r = think(d.state, d.history, d.level, d.time); } catch (err) { r = null; }
    self.postMessage({ id: d.id, move: r ? decode(r.move) : null, score: r && r.score, depth: r && r.depth, nodes: r && r.nodes, ms: r && r.ms });
  };
} else {
  // Loaded as a normal page script: the fallback when a background worker isn't available.
  window.AtomicBot = { think, decode };
}
})();
