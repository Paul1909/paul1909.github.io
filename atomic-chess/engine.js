// Atomic chess rules engine (lichess rules).
// Board: array of 64, index = row*8 + col, row 0 = rank 8 (Black's back rank).
// Piece: { c: 'w'|'b', t: 'p'|'n'|'b'|'r'|'q'|'k', id }
'use strict';

const Atomic = (() => {
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const AROUND = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISH_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const FILES = 'abcdefgh';

  const sq = (r, c) => r * 8 + c;
  const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const opp = c => (c === 'w' ? 'b' : 'w');
  const name = s => FILES[s & 7] + (8 - (s >> 3));

  function initial() {
    const board = new Array(64).fill(null);
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    let id = 1;
    for (let c = 0; c < 8; c++) {
      board[sq(0, c)] = { c: 'b', t: back[c], id: id++ };
      board[sq(1, c)] = { c: 'b', t: 'p', id: id++ };
      board[sq(6, c)] = { c: 'w', t: 'p', id: id++ };
      board[sq(7, c)] = { c: 'w', t: back[c], id: id++ };
    }
    return { board, turn: 'w', castle: { wK: true, wQ: true, bK: true, bQ: true }, ep: -1, half: 0, full: 1 };
  }

  function clone(s) {
    return { board: s.board.map(p => (p ? { ...p } : null)), turn: s.turn, castle: { ...s.castle }, ep: s.ep, half: s.half, full: s.full };
  }

  function findKing(board, c) {
    for (let i = 0; i < 64; i++) { const p = board[i]; if (p && p.t === 'k' && p.c === c) return i; }
    return -1;
  }

  // Could a piece of colour `by` capture on square s? Kings never capture in atomic, so they don't count.
  function attacked(board, s, by) {
    const r = s >> 3, c = s & 7;
    const pr = by === 'w' ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      if (on(pr, c + dc)) { const p = board[sq(pr, c + dc)]; if (p && p.c === by && p.t === 'p') return true; }
    }
    for (const [dr, dc] of KNIGHT) {
      const rr = r + dr, cc = c + dc;
      if (on(rr, cc)) { const p = board[sq(rr, cc)]; if (p && p.c === by && p.t === 'n') return true; }
    }
    for (const [dirs, a, b] of [[ROOK_D, 'r', 'q'], [BISH_D, 'b', 'q']]) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (on(rr, cc)) {
          const p = board[sq(rr, cc)];
          if (p) { if (p.c === by && (p.t === a || p.t === b)) return true; break; }
          rr += dr; cc += dc;
        }
      }
    }
    return false;
  }

  function kingsTouch(board) {
    const a = findKing(board, 'w'), b = findKing(board, 'b');
    if (a < 0 || b < 0) return false;
    return Math.abs((a >> 3) - (b >> 3)) <= 1 && Math.abs((a & 7) - (b & 7)) <= 1;
  }

  // In atomic, touching kings can never be in check (capturing one would blow up both).
  function inCheck(board, c) {
    const k = findKing(board, c);
    if (k < 0 || kingsTouch(board)) return false;
    return attacked(board, k, opp(c));
  }

  function kingSafeOn(board, from, to, c) {
    const b = board.slice(); b[to] = b[from]; b[from] = null;
    return !inCheck(b, c);
  }

  function pseudo(s) {
    const { board, turn } = s, moves = [];
    const add = (from, to, extra) => moves.push(Object.assign({ from, to }, extra));
    for (let from = 0; from < 64; from++) {
      const p = board[from];
      if (!p || p.c !== turn) continue;
      const r = from >> 3, c = from & 7;
      if (p.t === 'p') {
        const dir = turn === 'w' ? -1 : 1, start = turn === 'w' ? 6 : 1, last = turn === 'w' ? 0 : 7;
        const r1 = r + dir;
        if (on(r1, c) && !board[sq(r1, c)]) {
          add(from, sq(r1, c), r1 === last ? { promo: true } : {});
          if (r === start && !board[sq(r + 2 * dir, c)]) add(from, sq(r + 2 * dir, c), { double: true });
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (!on(r1, cc)) continue;
          const t = sq(r1, cc), q = board[t];
          if (q && q.c !== turn) add(from, t, { capture: true, promo: r1 === last });
          else if (!q && t === s.ep) add(from, t, { capture: true, ep: true });
        }
      } else if (p.t === 'n' || p.t === 'k') {
        for (const [dr, dc] of (p.t === 'n' ? KNIGHT : AROUND)) {
          const rr = r + dr, cc = c + dc;
          if (!on(rr, cc)) continue;
          const t = sq(rr, cc), q = board[t];
          if (!q) add(from, t, {});
          else if (q.c !== turn && p.t !== 'k') add(from, t, { capture: true });
        }
        if (p.t === 'k') castles(s, from, add);
      } else {
        const dirs = p.t === 'r' ? ROOK_D : p.t === 'b' ? BISH_D : ROOK_D.concat(BISH_D);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (on(rr, cc)) {
            const t = sq(rr, cc), q = board[t];
            if (!q) add(from, t, {});
            else { if (q.c !== turn) add(from, t, { capture: true }); break; }
            rr += dr; cc += dc;
          }
        }
      }
    }
    return moves;
  }

  function castles(s, from, add) {
    const { board, turn } = s, row = turn === 'w' ? 7 : 0;
    if (from !== sq(row, 4) || inCheck(board, turn)) return;
    const tryC = (side, rookCol, pass, empty) => {
      if (!s.castle[turn + side]) return;
      const rook = board[sq(row, rookCol)];
      if (!rook || rook.t !== 'r' || rook.c !== turn) return;
      if (empty.some(cc => board[sq(row, cc)])) return;
      for (const cc of pass) if (!kingSafeOn(board, from, sq(row, cc), turn)) return;
      add(from, sq(row, side === 'K' ? 6 : 2), { castle: side });
    };
    tryC('K', 7, [5, 6], [5, 6]);
    tryC('Q', 0, [3, 2], [1, 2, 3]);
  }

  // Returns { state, exploded: [{sq, p, mover}], center }
  function apply(s, m, promoType) {
    const n = clone(s), b = n.board, me = s.turn, p = b[m.from];
    const exploded = [];
    let center = -1;
    n.ep = -1;
    if (m.capture) {
      center = m.to;
      const capSq = m.ep ? m.to + (me === 'w' ? 8 : -8) : m.to;
      exploded.push({ sq: capSq, p: b[capSq] }); b[capSq] = null;
      exploded.push({ sq: m.from, p, mover: true }); b[m.from] = null;
      const r = m.to >> 3, c = m.to & 7;
      for (const [dr, dc] of AROUND) {
        const rr = r + dr, cc = c + dc;
        if (!on(rr, cc)) continue;
        const t = sq(rr, cc), q = b[t];
        if (q && q.t !== 'p') { exploded.push({ sq: t, p: q }); b[t] = null; }
      }
      n.half = 0;
    } else {
      b[m.to] = m.promo ? { ...p, t: promoType || 'q' } : p;
      b[m.from] = null;
      if (m.castle) {
        const row = me === 'w' ? 7 : 0;
        const [rf, rt] = m.castle === 'K' ? [7, 5] : [0, 3];
        b[sq(row, rt)] = b[sq(row, rf)]; b[sq(row, rf)] = null;
      }
      if (m.double) n.ep = (m.from + m.to) / 2;
      n.half = p.t === 'p' ? 0 : s.half + 1;
    }
    const cr = n.castle, is = (i, t, c) => b[i] && b[i].t === t && b[i].c === c;
    if (!is(60, 'k', 'w')) cr.wK = cr.wQ = false;
    if (!is(4, 'k', 'b')) cr.bK = cr.bQ = false;
    if (!is(63, 'r', 'w')) cr.wK = false;
    if (!is(56, 'r', 'w')) cr.wQ = false;
    if (!is(7, 'r', 'b')) cr.bK = false;
    if (!is(0, 'r', 'b')) cr.bQ = false;
    n.turn = opp(me);
    if (me === 'b') n.full++;
    return { state: n, exploded, center };
  }

  function legalMoves(s) {
    return pseudo(s).filter(m => {
      const b = apply(s, m).state.board;
      if (findKing(b, s.turn) < 0) return false;          // never blow up your own king
      if (findKing(b, opp(s.turn)) < 0) return true;      // blowing up theirs wins at once
      return !inCheck(b, s.turn);
    });
  }

  function key(s) {
    let k = '';
    for (const p of s.board) k += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
    const c = s.castle;
    return k + s.turn + (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') + s.ep;
  }

  function status(s, reps) {
    const b = s.board;
    if (findKing(b, 'w') < 0) return { over: true, winner: 'b', reason: 'explode', moves: [] };
    if (findKing(b, 'b') < 0) return { over: true, winner: 'w', reason: 'explode', moves: [] };
    const moves = legalMoves(s), check = inCheck(b, s.turn);
    if (!moves.length) return check
      ? { over: true, winner: opp(s.turn), reason: 'mate', check, moves }
      : { over: true, winner: null, reason: 'stalemate', check, moves };
    if (b.every(p => !p || p.t === 'k')) return { over: true, winner: null, reason: 'material', check, moves };
    if (s.half >= 100) return { over: true, winner: null, reason: 'fifty', check, moves };
    if (reps >= 3) return { over: true, winner: null, reason: 'repetition', check, moves };
    return { over: false, check, moves };
  }

  function san(s, m, promoType) {
    const p = s.board[m.from];
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    const to = name(m.to);
    if (p.t === 'p') return (m.capture ? FILES[m.from & 7] + 'x' : '') + to + (m.promo && !m.capture ? '=' + (promoType || 'q').toUpperCase() : '');
    const others = legalMoves(s).filter(o => o.to === m.to && o.from !== m.from && s.board[o.from].t === p.t);
    let dis = '';
    if (others.length) {
      const sameFile = others.some(o => (o.from & 7) === (m.from & 7));
      const sameRank = others.some(o => (o.from >> 3) === (m.from >> 3));
      dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : name(m.from);
    }
    return p.t.toUpperCase() + dis + (m.capture ? 'x' : '') + to;
  }

  return { initial, clone, apply, legalMoves, status, inCheck, findKing, key, san, opp, name, AROUND };
})();

if (typeof module !== 'undefined') module.exports = Atomic;
