// Grid Operator Tycoon: simulation. Weather, demand, merit-order dispatch, DC load flow, economy, towns.
'use strict';

const LS = (() => { const a = [.68, .64, .62, .62, .64, .72, .86, 1, 1.06, 1.04, 1.02, 1.01, 1, .98, .97, .98, 1.03, 1.12, 1.22, 1.2, 1.1, .98, .86, .76]; const m = a.reduce((x, y) => x + y) / 24; return a.map(v => v / m); })();
const hourOf = t => ((t % 24) + 24) % 24;
const dayOf = t => Math.floor(t / 24);
const monthOf = t => dayOf(t) % 12;
const yearOf = t => Math.floor(dayOf(t) / 12) + 1;
const pad2 = v => String(v).padStart(2, '0');
const dateStr = t => `${MONTHS[monthOf(t)]} Y${yearOf(t)}`;
const timeStr = t => `${pad2(Math.floor(hourOf(t)))}:${pad2(Math.floor((hourOf(t) % 1) * 60 / 10) * 10)}`;
function loadF(h) { const i = Math.floor(h), f = h - i; return LS[i % 24] * (1 - f) + LS[(i + 1) % 24] * f; }
function seasonF(s, m) { return 1 + (s.sc.seasonAmp || 0.14) * Math.cos(2 * Math.PI * (m - 0.4) / 12); }
function activeEv(s, t = s.t) { return s.ev.find(e => e.start <= t && t < e.end); }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 2; }
function logNews(s, icon, text, id, quiet) {
  s.news.unshift({ t: s.t, i: icon, x: text, id });
  if (s.news.length > 60) s.news.length = 60;
  if (S.onNews && !quiet) S.onNews(s.news[0]);
}

function demandOf(s, n, t = s.t) {
  const h = hourOf(t), m = monthOf(t);
  if (n.k === 'ind') return n.mw * (0.94 + 0.06 * Math.sin((h - 6) / 24 * 2 * Math.PI));
  const ev = activeEv(s, t);
  let f = loadF(h) * seasonF(s, m) * (1 + 0.012 * (yearOf(t) - 1));
  if (ev && ev.k === 'cold') f *= 1.16;
  if (ev && ev.k === 'heat') f *= 1.07;
  if (hasResearch(s, 'smart')) f *= 1 - 0.07 * clamp((loadF(h) - 1) / 0.2, 0, 1);
  return n.pop * 0.00085 * f;
}
function sunNow(s, t = s.t) {
  const h = hourOf(t), m = monthOf(t), c = Math.cos(2 * Math.PI * (m - 5.5) / 12);
  const L = 12 + 3.6 * c, x = (h - (12.5 - L / 2)) / L;
  if (x <= 0 || x >= 1) return 0;
  return (0.66 + 0.34 * c) * Math.pow(Math.sin(Math.PI * x), 1.3);
}
function windCF(v) { if (v < 3 || v > 25) return 0; if (v >= 12) return 1; const x = (v - 3) / 9; return x * x; }
function renAvail(s, u) {
  const i = u.x + u.y * s.map.W;
  if (u.type === 'solar') return u.cap * sunNow(s) * (1 - 0.72 * s.w.c) * 0.85 * s.map.sun[i] * (u.boost || 1);
  return u.cap * windCF(s.w.v * s.map.wind[i]);
}
function varCost(s, u) { const P = PLANTS[u.type]; return P.fuel * (P.gas ? s.w.gas : 1) + P.co2 * s.co2p; }
function derate(s, u) { const ev = activeEv(s); return ev && ev.k === 'heat' && ['coal', 'nuclear', 'smr', 'ccgt'].includes(u.type) ? 0.82 : 1; }
function spotPrice(s) {
  const h = hourOf(s.t), m = monthOf(s.t), ev = activeEv(s);
  let p = 62 + 0.4 * s.co2p + 80 * (loadF(h) - 0.95) + 110 * (seasonF(s, m) - 1) - 38 * sunNow(s) * (1 - s.w.c) + s.w.p;
  if (s.w.gas > 1) p += 55;
  if (ev && ev.k === 'calm') p += 40;
  if (ev && ev.k === 'cold') p += 30;
  return clamp(p, 4, 400);
}
function lineX(l) { return Math.max(0.3, l.len * TIERS[l.tier].x); }
function lineCap(s, l) {
  const dlr = hasResearch(s, 'dlr') && (s.w.v > 8 || [11, 0, 1].includes(monthOf(s.t)));
  return TIERS[l.tier].cap * (dlr ? 1.2 : 1);
}
const inflowF = [0.22, 0.22, 0.35, 0.6, 0.85, 0.9, 0.75, 0.55, 0.45, 0.4, 0.32, 0.25];
function inflow(s, u) { const ev = activeEv(s); return u.cap * 0.75 * (inflowF[monthOf(s.t)] + (ev && ev.k === 'cloud' ? 0.25 : 0)); }
function storeE(u) { return u.cap * u.hours; }
const P_STORE = n => !!(PLANTS[n.type] && PLANTS[n.type].store);

// ---------------------------------------------------------------- topology
function invert(B) {
  const n = B.length, A = B.map((r, i) => { const row = new Float64Array(2 * n); row.set(r); row[n + i] = 1; return row; });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-9;
    for (let k = 0; k < 2 * n; k++) A[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map(r => r.slice(n));
}
function rebuildTopo(s) {
  const adj = {};
  for (const n of s.nodes) adj[n.id] = [];
  for (const l of s.lines) if (l.st === 'ok') { adj[l.a].push(l); adj[l.b].push(l); }
  s.islands = [];
  const seen = new Set();
  for (const n of s.nodes) {
    if (seen.has(n.id)) continue;
    const ids = [], ls = new Set(), q = [n.id];
    seen.add(n.id);
    while (q.length) {
      const id = q.pop(); ids.push(id);
      for (const l of adj[id]) { ls.add(l); const o = l.a === id ? l.b : l.a; if (!seen.has(o)) { seen.add(o); q.push(o); } }
    }
    const isl = { ids, lines: [...ls], pos: {} };
    ids.forEach((id, i) => { isl.pos[id] = i; s.idx[id].isl = s.islands.length; });
    if (ids.length > 1) {
      const m = ids.length - 1, B = Array.from({ length: m }, () => new Float64Array(m));
      for (const l of isl.lines) {
        const a = isl.pos[l.a], b = isl.pos[l.b], y = 1 / lineX(l);
        if (a) B[a - 1][a - 1] += y;
        if (b) B[b - 1][b - 1] += y;
        if (a && b) { B[a - 1][b - 1] -= y; B[b - 1][a - 1] -= y; }
      }
      isl.binv = invert(B);
    }
    s.islands.push(isl);
  }
  s.topoDirty = false;
}
function solvePF(isl, inj) {
  const n = isl.ids.length;
  if (n < 2) return;
  const th = new Float64Array(n);
  for (let i = 1; i < n; i++) { const row = isl.binv[i - 1]; let v = 0; for (let j = 1; j < n; j++) v += row[j - 1] * inj[j]; th[i] = v; }
  for (const l of isl.lines) l.flow = (th[isl.pos[l.a]] - th[isl.pos[l.b]]) / lineX(l);
}
function ptdf(isl, l, k) {
  if (!k) return 0;
  const a = isl.pos[l.a], b = isl.pos[l.b];
  return ((a ? isl.binv[a - 1][k - 1] : 0) - (b ? isl.binv[b - 1][k - 1] : 0)) / lineX(l);
}

// ---------------------------------------------------------------- dispatch of one island
function dispatchIsland(s, isl, dt, tot, dry) {
  const nodes = isl.ids.map(id => s.idx[id]);
  const src = nodes.some(n => n.k === 'border' || (n.k === 'plant' && n.st === 'on'));
  const firm = nodes.some(n => n.k === 'border' || (n.k === 'plant' && n.st !== 'build' && n.type !== 'sub' && !PLANTS[n.type].ren));
  const loads = nodes.filter(n => n.k === 'town' || n.k === 'ind');
  let D = 0;
  for (const L of loads) {
    if (src && firm && !L.conn && !dry) onConnect(s, L);
    L.renOnly = src && !firm;
    L.dem = L.conn ? demandOf(s, L) : 0;
    D += L.dem;
  }
  for (const n of nodes) if (n.k === 'plant') { n.avail = 0; if (n.st !== 'on') { n.out = 0; n.price = 0; } if (P_STORE(n)) n.out = 0; }
  isl.D = D; isl.price = 0; isl.shed = 0;
  if (!src) {
    for (const L of loads) { L.f = L.conn ? 1 : 0; L.served = 0; }
    isl.shed = D; isl.price = 0;
    for (const l of isl.lines) { l.flow = 0; l.load = 0; }
    if (tot) tot.shed += D;
    return;
  }
  const warm = s.warm, offers = [], bids = [];
  for (const u of nodes) {
    if (u.k === 'border') { offers.push({ u, p: s.spot + 6, lo: 0, hi: u.cap }); bids.push({ u, p: s.spot - 6, max: u.cap }); continue; }
    if (u.k !== 'plant' || u.st !== 'on' || u.type === 'sub') continue;
    const P = PLANTS[u.type];
    if (P.ren) { u.avail = renAvail(s, u); offers.push({ u, p: 0, lo: 0, hi: u.avail }); }
    else if (u.type === 'hydro') {
      const E = u.cap * P.res, inf = inflow(s, u), lvl = u.res / E;
      const hi = Math.min(u.cap, u.res / dt + inf);
      const lo = lvl > 0.97 ? Math.min(hi, inf) : 0;
      u.avail = hi;
      offers.push({ u, p: 25 + 110 * Math.pow(1 - lvl, 1.5), lo, hi });
    } else if (P.store) {
      const E = storeE(u), soc = u.soc / E;
      const dhi = Math.min(u.cap, u.soc / dt);
      u.avail = dhi;
      if (dhi > 0.5) offers.push({ u, p: soc > 0.3 ? 118 : soc > 0.12 ? 190 : 420, lo: 0, hi: dhi });
      const ch = Math.min(u.cap, (E - u.soc) / (P.eff * dt));
      if (ch > 0.5) bids.push({ u, p: soc < 0.85 ? 62 : 25, max: ch, store: 1 });
    } else { // thermal
      if (!u.com) { u.out = 0; continue; }
      if (u.startT > 0) {
        if (!dry) u.startT -= dt;
        if (u.startT > 0 && !warm) { u.out = 0; continue; }
        u.startT = 0; u.out = P.min * u.cap * derate(s, u);
      }
      const cap = u.cap * derate(s, u), r = P.ramp * u.cap * dt;
      let lo = P.min * cap, hi = cap;
      if (!warm) { lo = Math.max(lo, u.out - r); hi = Math.min(hi, Math.max(u.out + r, P.min * cap)); }
      lo = Math.min(lo, hi);
      u.avail = hi;
      offers.push({ u, p: varCost(s, u), lo, hi });
    }
  }
  // merit-order clearing
  offers.sort((a, b) => a.p - b.p);
  let S0 = 0;
  for (const o of offers) { o.x = o.lo; S0 += o.lo; }
  let need = D - S0, shortage = 0, price = 0;
  if (need >= 0) {
    for (const o of offers) { if (need <= 1e-9) break; const add = Math.min(o.hi - o.x, need); if (add > 0) { o.x += add; need -= add; price = o.p; } }
    if (need > 1e-6) { shortage = need; price = 3000; }
  }
  let surplus = need < 0 ? -need : 0;
  bids.sort((a, b) => b.p - a.p);
  for (const b of bids) {
    b.x = 0;
    if (surplus > 0) { const a = Math.min(b.max, surplus); b.x += a; surplus -= a; }
    for (const o of offers) {
      if (b.x >= b.max - 1e-9) break;
      if (o.p >= b.p) break;
      if (o.u === b.u || (o.u.k === 'border' && b.u.k === 'border')) continue;
      const add = Math.min(o.hi - o.x, b.max - b.x);
      if (add > 0) { o.x += add; b.x += add; price = Math.max(price, o.p); }
    }
  }
  if (surplus > 0) { // must-run surplus nobody wants: force units down
    price = 0;
    for (let i = offers.length - 1; i >= 0 && surplus > 0; i--) { const o = offers[i], c = Math.min(o.x, surplus); o.x -= c; surplus -= c; o.u.forced = true; }
  }
  // demand response
  if (shortage > 0 && hasResearch(s, 'smart')) shortage = Math.max(0, shortage - D * 0.05);
  isl.price = price; isl.shed = shortage;
  // outputs
  for (const n of nodes) if (n.k === 'border') n.out = 0;
  for (const o of offers) o.u.out = (o.u.k === 'border' ? o.u.out : 0) + o.x;
  if (!dry) { const pc = Math.min(price, 400); for (const n of nodes) if (n.k === 'plant') n.pE = n.pE === undefined ? pc : n.pE + (pc - n.pE) * Math.min(1, dt / 5); }
  for (const b of bids) b.u.out -= b.x;
  const f = D > 0 ? shortage / D : 0;
  for (const L of loads) { L.f = L.conn ? f : 0; L.served = L.dem * (1 - f); }
  // load flow (+ automatic redispatch with the control centre)
  const inj = new Float64Array(nodes.length);
  const setInj = () => nodes.forEach((n, i) => { inj[i] = (n.k === 'town' || n.k === 'ind') ? -n.served : (n.out || 0); });
  setInj();
  solvePF(isl, inj);
  if (hasResearch(s, 'scada') && isl.binv) {
    for (let it = 0; it < 8; it++) {
      let worst = null, wl = 0.97;
      for (const l of isl.lines) { const ld = Math.abs(l.flow) / lineCap(s, l); if (ld > wl) { wl = ld; worst = l; } }
      if (!worst) break;
      const sg = Math.sign(worst.flow), cap = lineCap(s, worst);
      let dec = null, inc = null, dv = -1e9, iv = 1e9;
      for (const o of offers) {
        const k = isl.pos[o.u.id], v = sg * ptdf(isl, worst, k);
        if (o.x - o.lo > 1 && v > dv) { dv = v; dec = o; }
        if (o.hi - o.x > 1 && v < iv) { iv = v; inc = o; }
      }
      if (!dec || !inc || dec === inc || dv - iv < 0.05) break;
      const dP = Math.min((Math.abs(worst.flow) - 0.95 * cap) / (dv - iv), dec.x - dec.lo, inc.hi - inc.x);
      if (dP <= 0.5) break;
      dec.x -= dP; inc.x += dP; dec.u.out -= dP; inc.u.out += dP;
      setInj(); solvePF(isl, inj);
    }
  }
  if (dry) return;
  // storage, reservoirs
  for (const u of nodes) {
    if (u.k !== 'plant' || u.st !== 'on') continue;
    const P = PLANTS[u.type];
    if (P.store) { u.soc = clamp(u.soc + (u.out < 0 ? -u.out * P.eff : -u.out) * dt, 0, storeE(u)); }
    if (u.type === 'hydro') u.res = clamp(u.res + (inflow(s, u) - u.out) * dt, 0, u.cap * P.res);
    if (THERMAL(u.type) && u.com) {
      const lo = offers.find(o => o.u === u);
      const idle = u.forced || (lo && u.out <= lo.lo + 1 && price < varCost(s, u));
      u.idleT = idle ? u.idleT + dt : 0; u.upT += dt; u.forced = false;
    }
  }
  // line heating and protection
  for (const l of isl.lines) {
    const cap = lineCap(s, l);
    l.load = Math.abs(l.flow) / cap;
    if (l.load > 2.2) { tripLine(s, l, 'protection'); continue; }
    if (l.load > 1) {
      l.heat += (l.load - 1) * dt * 1.6;
      if (!l.warned) { l.warned = true; logNews(s, '⚠️', `${lineName(s, l)} overloaded (${Math.round(l.load * 100)} %)`, 'L' + l.id); }
    } else { l.heat = Math.max(0, l.heat - dt * 0.4); if (l.load < 0.9) l.warned = false; }
    if (l.heat >= 1) tripLine(s, l, 'overload');
  }
  commitIsland(s, nodes, loads, dt);
  // accounting
  if (!tot) return;
  const F = MONTH_F * dt;
  tot.D += D; tot.shed += shortage;
  for (const L of loads) {
    const r = L.served * (s.tariff + (L.k === 'ind' ? L.prem : 0)) * F / 1e6;
    tot.sales += r; L.yr && (L.yr.rev += r);
  }
  for (const u of nodes) {
    if (u.k === 'border') {
      const imp = Math.max(0, u.out), exp = Math.max(0, -u.out);
      tot.imp += imp; tot.exp += exp; tot.gen.import += imp;
      tot.impC += imp * (s.spot + 6) * F / 1e6; tot.expR += exp * (s.spot - 6) * F / 1e6;
      u.yr.imp += imp * dt; u.yr.exp += exp * dt;
      continue;
    }
    if (u.k !== 'plant' || u.st !== 'on') continue;
    const P = PLANTS[u.type], out = u.out;
    if (P.ren) tot.curt += Math.max(0, (u.avail || 0) - out);
    if (P.store) { if (out > 0) tot.gen.storage += out; }
    else tot.gen[P.cat] += out;
    let vc = 0;
    if (THERMAL(u.type)) {
      vc = out * varCost(s, u) * F / 1e6;
      tot.fuel += out * P.fuel * (P.gas ? s.w.gas : 1) * F / 1e6;
      tot.co2c += out * P.co2 * s.co2p * F / 1e6;
      tot.co2 += out * P.co2;
    }
    u.yr.e += Math.max(0, out) * dt;
    u.yr.earn += out * Math.min(price, 400) * F / 1e6 - vc;
  }
}
function commitIsland(s, nodes, loads, dt) {
  const units = nodes.filter(n => n.k === 'plant' && n.st === 'on' && THERMAL(n.type));
  if (!units.length) return;
  let cap = 0, largest = 0;
  for (const n of nodes) {
    if (n.k === 'border') cap += n.cap * 0.8;
    else if (n.k === 'plant' && n.st === 'on') {
      const P = PLANTS[n.type];
      if (P.ren) cap += (n.avail || 0) * 0.5;
      else if (P.store) cap += n.soc > storeE(n) * 0.15 ? n.cap * 0.8 : 0;
      else if (n.type === 'hydro') cap += n.res > n.cap * 10 ? n.cap : n.avail || 0;
      else if (n.com) { cap += n.cap; largest = Math.max(largest, n.cap); }
    }
  }
  const futD = h => loads.reduce((a, L) => a + (L.conn ? demandOf(s, L, s.t + h) : 0), 0);
  const border = nodes.some(n => n.k === 'border');
  const off = units.filter(u => !u.com).sort((a, b) => varCost(s, a) - varCost(s, b));
  for (const u of off) {
    const P = PLANTS[u.type];
    const need = futD(P.start + 0.5) * 1.1 + largest * 0.3;
    const exportable = border && s.spot - 10 > varCost(s, u) && P.start <= 2;
    const cheap = u.pE !== undefined && varCost(s, u) < u.pE - 5 && futD(P.start + 0.5) > 0;
    if (cap < need || exportable || cheap) {
      u.com = true; u.startT = P.start; u.upT = 0; u.idleT = 0; cap += u.cap; largest = Math.max(largest, u.cap);
      const c = (P.startCost || 0) * u.cap * MONTH_F / 1e6;
      s.cash -= s.sc.sandbox ? 0 : c; s.fin.y.fuel = (s.fin.y.fuel || 0) + c;
    }
  }
  const on = units.filter(u => u.com && u.startT <= 0 && !PLANTS[u.type].nuc).sort((a, b) => varCost(s, b) - varCost(s, a));
  for (const u of on) {
    if (u.idleT > 3 && u.upT > 4) {
      const mx = largest === u.cap ? Math.max(0, ...on.filter(o => o !== u && o.com).map(o => o.cap)) : largest;
      let peak = 0;
      for (let h = 1; h <= PLANTS[u.type].start + 3; h++) peak = Math.max(peak, futD(h));
      if (cap - u.cap >= peak * 1.12 + mx * 0.4) { u.com = false; u.out = 0; u.idleT = 0; cap -= u.cap; }
    }
  }
}

// ---------------------------------------------------------------- events on the network
function lineName(s, l) { const a = s.idx[l.a], b = s.idx[l.b]; return `${TIERS[l.tier].name} ${short(a)}–${short(b)}`; }
function short(n) { return n ? (n.k === 'plant' ? n.name : n.k === 'sub' ? 'substation' : n.name) : '?'; }
function tripLine(s, l, why) {
  l.st = 'trip'; l.heat = 0; l.flow = 0; l.load = 0; l.warned = false;
  l.repair = (why === 'storm' ? 8 : 6) * MAINT[s.maint].rep;
  s.topoDirty = true;
  logNews(s, why === 'storm' ? '🌪️' : '🔥', `${lineName(s, l)} tripped (${why === 'storm' ? 'storm damage' : why === 'protection' ? 'severe overload' : 'overheated'}). Repair crews dispatched.`, 'L' + l.id);
  if (S.onTrip) S.onTrip();
}
function onConnect(s, n) {
  n.conn = true; n.sat = Math.min(100, n.sat + 14);
  logNews(s, '🎉', n.k === 'ind' ? `${n.name} is connected. Contract signed!` : `${n.name} is on the grid!`, n.id);
  if (S.onCoin) S.onCoin();
}

function updWeather(s, dt) {
  const w = s.w, m = monthOf(s.t), ev = activeEv(s);
  let wm = 7.5 + 2 * Math.cos(2 * Math.PI * (m - 0.5) / 12), cm = 0.48 + 0.14 * Math.cos(2 * Math.PI * (m - 0.5) / 12);
  if (ev) { if (ev.k === 'storm') wm = 21; if (ev.k === 'calm') { wm = 1.5; cm = 0.92; } if (ev.k === 'cloud') cm = 0.95; if (ev.k === 'heat') cm = 0.06; }
  const sq = Math.sqrt(dt);
  w.v = clamp(w.v + (wm - w.v) * 0.12 * dt + gauss() * 1.3 * sq, 0, 32);
  w.c = clamp(w.c + (cm - w.c) * 0.1 * dt + gauss() * 0.08 * sq, 0, 1);
  w.p = clamp(w.p - w.p * 0.1 * dt + gauss() * 6 * sq, -40, 40);
  w.gas = ev && ev.k === 'gas' ? 2 : 1;
  // plan the next event a day or two ahead, so there's a forecast
  const pending = s.ev.some(e => e.start > s.t);
  if (!pending && Math.random() < dt / 34) {
    const mo = monthOf(s.t + 36), opts = Object.entries(EVENTS).filter(([, e]) => e.months.includes(mo));
    let tw = opts.reduce((a, [, e]) => a + e.w, 0), r = Math.random() * tw, k = opts[0][0];
    for (const [id, e] of opts) { r -= e.w; if (r <= 0) { k = id; break; } }
    const E = EVENTS[k], start = s.t + 18 + Math.random() * 30;
    s.ev.push({ k, start, end: start + E.dur[0] + Math.random() * (E.dur[1] - E.dur[0]) });
    logNews(s, '🔮', `Forecast: ${E.name.toLowerCase()} in about ${Math.round((start - s.t) / 24 * 10) / 10 < 1.5 ? 'a day' : '2 days'}. ${E.desc}`);
  }
  s.ev = s.ev.filter(e => e.end > s.t - 1);
  for (const e of s.ev) if (!e.on && e.start <= s.t) { e.on = true; logNews(s, EVENTS[e.k].icon, `${EVENTS[e.k].name} has arrived.`); }
}

function progress(s, dt) {
  const d = dt / 24;
  for (const n of [...s.nodes]) {
    if (n.k !== 'plant' && n.k !== 'sub') continue;
    if (n.st === 'build') {
      n.build -= d;
      if (n.build <= 0) {
        n.st = 'on'; n.build = 0; n.com = false; n.out = 0;
        if (n.k === 'plant') logNews(s, '✅', `${n.name} is finished and ready to run.`, n.id);
        s.topoDirty = true; if (S.onBuilt) S.onBuilt();
      }
    } else if (n.st === 'trip') {
      n.repair -= dt;
      if (n.repair <= 0) { n.st = 'on'; n.com = false; logNews(s, '🔧', `${n.name} is repaired.`, n.id, true); }
    }
  }
  for (const l of s.lines) {
    if (l.st === 'build') { l.build -= d; if (l.build <= 0) { l.st = 'ok'; s.topoDirty = true; } }
    else if (l.st === 'trip') { l.repair -= dt; if (l.repair <= 0) { l.st = 'ok'; s.topoDirty = true; logNews(s, '🔧', `${lineName(s, l)} is back in service.`, 'L' + l.id, true); } }
    if (l.upg) { l.upg.left -= d; if (l.upg.left <= 0) { l.tier = l.upg.tier; delete l.upg; s.topoDirty = true; logNews(s, '🗼', `Upgrade done: ${lineName(s, l)}.`, 'L' + l.id); } }
  }
  // forced outages and storm damage
  const M = MAINT[s.maint], ev = activeEv(s);
  for (const n of s.nodes) {
    if (n.k !== 'plant' || n.st !== 'on') continue;
    const P = PLANTS[n.type];
    if (!P.fo || (n.out || 0) <= 0) continue;
    const p = P.fo / HOURS_YEAR * M.fo * (n.age > 360 ? 1.5 : 1) * dt;
    if (Math.random() < p) {
      n.st = 'trip'; n.com = false; n.out = 0; n.repair = P.repair * M.rep * (0.7 + 0.6 * Math.random());
      logNews(s, '💥', `${n.name} tripped! Out for about ${Math.ceil(n.repair)} h.`, n.id);
      if (S.onTrip) S.onTrip();
    }
  }
  if (ev && ev.k === 'storm') for (const l of s.lines) if (l.st === 'ok' && Math.random() < 0.003 * l.len / 5 * M.fo * dt) tripLine(s, l, 'storm');
}

// ---------------------------------------------------------------- towns
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const u = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1);
  return Math.hypot(a.x + u * dx - p.x, a.y + u * dy - p.y);
}
function townParts(s, n) {
  if (!n.conn) return { wait: -24 };
  const p = { price: (160 - s.tariff) * 0.2, rel: -Math.min(50, n.outE * 160), smog: 0, view: 0, nuke: 0, green: (s.clean24 || 0) * 12 };
  for (const o of s.nodes) {
    if (o.k !== 'plant' || o.st === 'build') continue;
    const d = Math.hypot(o.x - n.x, o.y - n.y);
    if (o.type === 'coal' && d < 6.5) p.smog -= 13 * (1 - d / 6.5) * (0.35 + 0.65 * ((o.out || 0) / o.cap));
    if ((o.type === 'ccgt' || o.type === 'ocgt') && d < 4.5) p.smog -= 3 * (1 - d / 4.5);
    if (PLANTS[o.type].nuc && d < 5) p.nuke -= 7;
    if ((o.type === 'wind') && d < 2.5) p.view -= 3;
  }
  let v = 0;
  for (const l of s.lines) { if (l.a === n.id || l.b === n.id) continue; const A = s.idx[l.a], B = s.idx[l.b]; if (A && B && segDist(n, A, B) < 1.1) v -= 2.5; }
  p.view += Math.max(v, -10);
  if (hasResearch(s, 'smart')) p.smart = 3;
  return p;
}
function updTowns(s, dt, hourTick) {
  for (const n of s.nodes) {
    if (n.k !== 'town') continue;
    if (hourTick || !n.parts) n.parts = townParts(s, n);
    const f = n.conn ? (n.f || 0) : 0;
    n.outE += (f - n.outE) * Math.min(1, dt / 24);
    const tgt = clamp(64 + Object.values(n.parts).reduce((a, b) => a + b, 0), 0, 100);
    n.sat += (tgt - n.sat) * Math.min(1, (tgt < n.sat ? 0.12 : 0.06) * dt);
    if (f > 0.02) { n.sat = Math.max(0, n.sat - f * 3 * dt); if (!n.dark) { n.dark = true; if (S.onBlack) S.onBlack(n); } }
    else n.dark = false;
    if (!n.conn) n.need = demandOf(s, n);
  }
}
function approval(s) {
  let a = 0, p = 0;
  for (const n of s.nodes) if (n.k === 'town') { a += n.sat * n.pop; p += n.pop; }
  return p ? a / p : 0;
}
function popTotal(s) { return s.nodes.reduce((a, n) => a + (n.k === 'town' ? n.pop : 0), 0); }

// ---------------------------------------------------------------- main step
function newTot() { return { gen: Object.fromEntries(CATS.map(c => [c, 0])), D: 0, shed: 0, curt: 0, imp: 0, exp: 0, co2: 0, sales: 0, impC: 0, expR: 0, fuel: 0, co2c: 0 }; }
function addFin(s, k, v) { s.fin.y[k] = (s.fin.y[k] || 0) + v; }
function step(s, dt) {
  const d0 = dayOf(s.t), h0 = Math.floor(s.t);
  s.t += dt;
  updWeather(s, dt);
  s.spot = spotPrice(s);
  progress(s, dt);
  if (s.topoDirty) rebuildTopo(s);
  const tot = newTot();
  for (const isl of s.islands) dispatchIsland(s, isl, dt, tot, false);
  s.warm = false;
  if (s.topoDirty) rebuildTopo(s);
  const hourTick = Math.floor(s.t) !== h0;
  updTowns(s, dt, hourTick);
  // money
  const F = MONTH_F * dt, M = MAINT[s.maint];
  let om = 0, grid = 0;
  for (const n of s.nodes) if ((n.k === 'plant' || n.k === 'sub') && n.st !== 'build') om += PLANTS[n.type].om * M.om * (n.st === 'off' ? 0.4 : 1) * (n.cap / (PLANTS[n.type].cap || 1) || 1);
  for (const l of s.lines) grid += l.cost * 0.02;
  const y = dt / HOURS_YEAR;
  const fines = tot.shed * 900 * F / 1e6;
  const interest = s.loan * 0.05 * y;
  const rd = s.res.cur ? R_BUDGETS[s.rdB] * y : 0;
  addFin(s, 'sales', tot.sales); addFin(s, 'exp', tot.expR); addFin(s, 'imp', -tot.impC); addFin(s, 'fuel', -tot.fuel);
  addFin(s, 'co2', -tot.co2c); addFin(s, 'om', -om * y); addFin(s, 'grid', -grid * y); addFin(s, 'fines', -fines);
  addFin(s, 'interest', -interest); addFin(s, 'rd', -rd);
  if (!s.sc.sandbox) s.cash += tot.sales + tot.expR - tot.impC - tot.fuel - tot.co2c - om * y - grid * y - fines - interest - rd;
  if (s.res.cur) s.res.prog[s.res.cur] = (s.res.prog[s.res.cur] || 0) + R_BUDGETS[s.rdB] * y;
  // stats
  const c = s.cur;
  for (const k of CATS) c.gen[k] += tot.gen[k] * dt;
  c.served += (tot.D - tot.shed) * dt; c.dem += tot.D * dt; c.shed += tot.shed * dt;
  c.co2 += (tot.co2 + tot.imp * IMPORT_CO2) * dt; c.imp += tot.imp * dt; c.exp += tot.exp * dt; c.curt += tot.curt * dt;
  if (tot.shed > 0.5) s.stats.blackH += dt;
  s.stats.peak = Math.max(s.stats.peak, tot.D);
  s.now = tot;
  const ha = s.hourAcc || (s.hourAcc = { gen: Object.fromEntries(CATS.map(k => [k, 0])), D: 0, shed: 0, p: 0, n: 0 });
  for (const k of CATS) ha.gen[k] += tot.gen[k]; ha.D += tot.D; ha.shed += tot.shed; ha.p += s.spot; ha.n++;
  if (hourTick) {
    const n = ha.n || 1;
    s.hours.push({ t: Math.floor(s.t), gen: Object.fromEntries(CATS.map(k => [k, ha.gen[k] / n])), D: ha.D / n, shed: ha.shed / n, p: ha.p / n });
    if (s.hours.length > 48) s.hours.shift();
    s.hourAcc = null;
    const h24 = s.hours.slice(-24);
    let cl = 0, all = 0;
    for (const h of h24) { cl += h.gen.nuclear + h.gen.hydro + h.gen.wind + h.gen.solar; all += h.gen.nuclear + h.gen.hydro + h.gen.wind + h.gen.solar + h.gen.coal + h.gen.gas + h.gen.import; }
    s.clean24 = all > 0 ? cl / all : 0;
  }
  if (s.res.cur) {
    const R = RESEARCH.find(r => r.id === s.res.cur);
    if (s.res.prog[R.id] >= R.cost) {
      s.res.done.push(R.id); s.res.cur = null;
      logNews(s, '🔬', `Research done: ${R.name}! ${R.desc}`);
      if (R.id === 'ehv' || R.id === 'dlr') s.topoDirty = true;
      const nxt = RESEARCH.find(r => !s.res.done.includes(r.id) && (!r.nuc || s.sc.nuclear));
      if (S.onResearch) S.onResearch(R);
    }
  }
  if (dayOf(s.t) !== d0) monthEnd(s);
}

function last12(s) {
  const ms = s.months.slice(-12);
  if (ms.length < 12) return null;
  const a = newAcc();
  for (const m of ms) { for (const k of CATS) a.gen[k] += m.gen[k]; for (const k of ['served', 'dem', 'shed', 'co2', 'imp', 'exp', 'curt']) a[k] += m[k]; }
  return a;
}
function shares(a) {
  const tot = CATS.filter(k => k !== 'storage').reduce((x, k) => x + a.gen[k], 0) || 1;
  return {
    renew: (a.gen.hydro + a.gen.wind + a.gen.solar) / tot,
    clean: (a.gen.hydro + a.gen.wind + a.gen.solar + a.gen.nuclear) / tot,
    co2: a.served > 0 ? a.co2 / a.served * 1000 : 0,
    rel: a.dem > 0 ? 1 - a.shed / a.dem : 1,
    imp: a.dem > 0 ? a.imp / a.dem : 0,
  };
}
function goalState(s) {
  const L = last12(s), sh = L && shares(L), towns = s.nodes.filter(n => n.k === 'town');
  const noData = 'needs 12 months of data';
  return s.sc.goals.map(g => {
    let ok = false, now = '';
    if (g.k === 'allConn') { const c = towns.filter(t => t.conn).length; ok = c === towns.length; now = `${c} of ${towns.length} towns`; }
    if (g.k === 'approval') { const a = approval(s); ok = a >= g.v; now = `now ${Math.round(a)} %`; }
    if (g.k === 'noCoal') { const c = s.nodes.filter(n => n.type === 'coal').length; ok = c === 0; now = c ? `${c} left` : 'done'; }
    if (g.k === 'co2') { ok = !!sh && sh.co2 <= g.v; now = sh ? `${Math.round(sh.co2)} g/kWh` : noData; }
    if (g.k === 'rel') { ok = !!sh && sh.rel * 100 >= g.v; now = sh ? `${(sh.rel * 100).toFixed(2)} %` : noData; }
    if (g.k === 'renew') { ok = !!sh && sh.renew * 100 >= g.v; now = sh ? `${Math.round(sh.renew * 100)} %` : noData; }
    if (g.k === 'imports') { ok = !!sh && sh.imp * 100 <= g.v; now = sh ? `${Math.round(sh.imp * 100)} %` : noData; }
    return { txt: GOAL_TEXT[g.k](g.v), ok, now };
  });
}

function monthEnd(s) {
  const d = dayOf(s.t), m = monthOf(s.t);
  s.months.push({ ...s.cur, cash: s.cash, appr: approval(s), pop: popTotal(s), d });
  if (s.months.length > 160) s.months.shift();
  s.cur = newAcc();
  const r = Math.random;
  // towns grow when happy and powered
  for (const n of s.nodes) {
    if (n.k !== 'town' || !n.conn) continue;
    const g = clamp((n.sat - 55) / 20 * 0.005, -0.006, 0.01);
    n.pop = Math.max(5000, n.pop * (1 + g));
    if (g > 0.006 && r() < 0.15) n.boom = 1;
  }
  for (const n of s.nodes) if (n.k === 'plant' || n.k === 'sub') n.age = (n.age || 0) + 1;
  // retirements
  for (const n of [...s.nodes]) {
    if (!n.retire) continue;
    if (d === n.retire - 6) logNews(s, '📅', `${n.name} retires in 6 months. Plan its replacement!`, n.id);
    if (d === n.retire - 1) logNews(s, '📅', `${n.name} shuts down for good next month.`, n.id);
    if (d >= n.retire) { logNews(s, '🏁', `${n.name} has been retired after a long life.`); removeNode(s, n); }
  }
  // industrial customers asking for a connection
  for (const n of [...s.nodes]) if (n.k === 'ind' && !n.conn && d >= n.deadline) { logNews(s, '🚚', `${n.name} gave up waiting and went elsewhere.`); removeNode(s, n); }
  if (!s.sc.tutorial && d >= s.indNext) {
    s.indNext = d + 7 + r() * 9;
    const towns = s.nodes.filter(n => n.k === 'town' && n.conn);
    const t = towns[Math.floor(r() * towns.length)];
    if (t) {
      const I = IND_TYPES[Math.floor(r() * IND_TYPES.length)];
      const spots = [];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = t.x + dx, y = t.y + dy, dd = Math.hypot(dx, dy), tt = tileAt(s, x, y);
        if (dd < 2 || dd > 4.5 || tt < 0 || isWater(tt) || tt === T.MOUNT || nodeAt(s, x, y)) continue;
        spots.push({ x, y });
      }
      if (spots.length) {
        const p = spots[Math.floor(r() * spots.length)];
        const mw = Math.round(I.mw[0] + r() * (I.mw[1] - I.mw[0]));
        const n = { id: s.nextId++, k: 'ind', kind: I.kind, icon: I.icon, x: p.x, y: p.y, name: `${t.name} ${I.name}`, mw, prem: 30, deadline: d + 6, conn: false, dem: 0, served: 0, yr: { rev: 0 } };
        s.nodes.push(n); reindex(s); s.topoDirty = true;
        logNews(s, I.icon, `A ${I.name} wants ${mw} MW near ${t.name}. Connect it within 6 months: it pays €${n.prem}/MWh above tariff.`, n.id);
      }
    }
  }
  if (m === 0) { // new year
    s.co2p += s.sc.co2Rise;
    s.fin.ly = s.fin.y; s.fin.y = {};
    for (const n of s.nodes) if (n.yr) n.yr = n.k === 'border' ? { imp: 0, exp: 0 } : n.k === 'town' || n.k === 'ind' ? { rev: 0 } : { e: 0, earn: 0 };
    logNews(s, '🎆', `Happy new year! Year ${yearOf(s.t)} begins. CO₂ now €${s.co2p}/t.`);
  }
  // money trouble and approval trouble
  if (!s.sc.sandbox) {
    while (s.cash < 0 && s.loan + 100 <= s.sc.loanMax) { s.loan += 100; s.cash += 100; logNews(s, '🏦', `Emergency loan: the bank lent you €100M (loan now €${s.loan}M).`); }
    if (s.cash < 0) { s.negM++; logNews(s, '🏦', s.negM >= 3 ? 'Final warning from the bank: get your cash above zero next month!' : `You are €${Math.round(-s.cash)}M in the red. Borrow or cut costs.`); }
    else s.negM = 0;
    const a = approval(s);
    if (a < 25) { s.lowM++; logNews(s, '🏛️', `The regulator is unhappy: approval ${Math.round(a)} %. (${6 - s.lowM} months to fix it)`); }
    else s.lowM = 0;
  }
  if (!s.over && !s.sc.sandbox && !s.keepPlaying) {
    const gs = goalState(s);
    if (gs.length && gs.every(g => g.ok)) endGame(s, 'win');
    else if (s.negM >= 4) endGame(s, 'lose', 'bankrupt');
    else if (s.lowM >= 6) endGame(s, 'lose', 'licence');
    else if (s.sc.years && d >= s.sc.years * 12) endGame(s, 'lose', 'deadline');
  }
  if (S.onMonth) S.onMonth();
}
function endGame(s, res, why) {
  const left = s.sc.years * 12 - dayOf(s.t);
  s.over = { res, why, d: dayOf(s.t), medal: res === 'win' ? (left >= 24 ? 'gold' : left >= 12 ? 'silver' : 'bronze') : null };
  if (S.onEnd) S.onEnd(s.over);
}

// Inherited grids: upgrade lines that would be overloaded at a winter peak, with any one plant out,
// and with the borders importing or exporting flat out.
function calibrateGrid(s) {
  const t0 = s.t, plants = s.nodes.filter(n => n.k === 'plant');
  const cases = [{ t: 18.5, spot: null }, { t: 18.5, spot: 5 }, { t: 3, spot: 390 }, ...plants.map(p => ({ t: 18.5, spot: null, out: p }))];
  for (let it = 0; it < 6; it++) {
    let changed = false;
    for (const c of cases) {
      s.t = c.t; s.spot = c.spot === null ? spotPrice(s) : c.spot;
      if (c.out) c.out.st = 'trip';
      rebuildTopo(s); s.warm = true;
      for (const isl of s.islands) dispatchIsland(s, isl, STEP, null, true);
      if (c.out) c.out.st = 'on';
      for (const l of s.lines) if (l.st === 'ok' && Math.abs(l.flow) / TIERS[l.tier].cap > 0.8 && l.tier < 3) { l.tier++; changed = true; }
    }
    if (!changed) break;
  }
  for (const l of s.lines) l.cost = lineCost(s, s.idx[l.a], s.idx[l.b], l.tier);
  s.t = t0; s.warm = true;
  for (const n of s.nodes) n.out = n.k === 'plant' && THERMAL(n.type) ? n.cap * PLANTS[n.type].min : 0;
  for (const l of s.lines) { l.flow = 0; l.load = 0; }
  rebuildTopo(s);
}
