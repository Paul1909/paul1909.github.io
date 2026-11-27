// Simulation: weather, demand, dispatch per grid island, economy, villages, units, events, goals.
'use strict';

const hod = h => ((h % 24) + 24) % 24;
const dayOf = h => Math.floor(h / 24) + 1;
function profile(h) { const a = Math.floor(hod(h)), f = hod(h) - a; return PROFILE[a] * (1 - f) + PROFILE[(a + 1) % 24] * f; }
function sunAt(st, h) {
  const [rise, set, peak] = st.theme === 'winter' ? [7.8, 16.6, .62] : [6.2, 19.4, .95];
  const x = hod(h); if (x <= rise || x >= set) return 0;
  return Math.sin(Math.PI * (x - rise) / (set - rise)) * peak;
}
function windCF(w) { if (w < .1 || w > .94) return 0; return Math.min(1, Math.pow((w - .1) / .58, 3)); }
function darkness(st) {
  const [rise, set] = st.theme === 'winter' ? [7.8, 16.6] : [6.2, 19.4], x = hod(st.hour);
  const raw = x < rise ? -(rise - x) / 3 : x > set ? -(x - set) / 3 : Math.sin(Math.PI * (x - rise) / (set - rise));
  return .55 * Math.max(0, Math.min(1, (.12 - raw) / .3));
}
function mission(st) { return MISSIONS.find(m => m.id === st.mission); }
function activeEv(st, type) { return st.weather.ev.find(e => e.type === type); }

function siteFactor(st, s) {
  const d = S[s.type]; let f = 0, n = 0;
  for (let j = 0; j < d.fp[1]; j++) for (let i = 0; i < d.fp[0]; i++) { f += st.hill[idx(st, s.x + i, s.y + j)]; n++; }
  return f / n;
}
function renewOut(st, s) {
  const d = S[s.type], w = st.weather;
  if (!s.on) return 0;
  if (d.ren === 'wind') return w.wind > .94 ? 0 : d.cap * windCF(Math.min(.93, w.wind * siteFactor(st, s)));
  if (d.ren === 'sun') return d.cap * sunAt(st, st.hour) * (1 - .78 * w.cloud) * (1 - w.snow);
  return 0;
}

// ---------- weather and events ----------
function weatherStep(st, h) {
  const w = st.weather, M = mission(st), dome = has(st, 'dome');
  // scheduled events: warn ahead if the dome is up, then start them
  for (const e of st.events) {
    if (!e.warned && dome && e.at - st.hour <= 6 && e.at > st.hour && e.type !== 'thieves') { e.warned = 1; EVA(EVENT_INFO[e.type].warn + ` (${Math.max(1, Math.round(e.at - st.hour))} h)`, 'warn'); }
    if (!e.started && st.hour >= e.at) {
      e.started = 1;
      if (e.type === 'thieves') spawnThieves(st, e.n || 2);
      else { w.ev.push({ type: e.type, until: e.at + e.dur }); if (!e.warned) EVA(EVENT_INFO[e.type].name + '!', 'warn'); }
    }
  }
  st.events = st.events.filter(e => !e.started || e.type !== 'thieves' ? true : st.hour - e.at < 1);
  w.ev = w.ev.filter(e => e.until > st.hour);
  // endless mode keeps the weather coming, scheduled 8-16 h ahead so the forecast can see it
  if (M.endless) {
    const ahead = st.events.filter(e => !e.started).length;
    if (ahead < 2) {
      const day = dayOf(st.hour), r = Math.random();
      const last = st.events.reduce((m, e) => Math.max(m, e.at), st.hour);
      const at = Math.max(last + 4, st.hour + 8 + Math.random() * 8);
      const type = r < .3 ? 'thieves' : r < .5 ? 'blizzard' : r < .65 ? 'coldsnap' : r < .82 ? 'calm' : 'storm';
      st.events.push({ at, type, dur: type === 'coldsnap' ? 14 + day * 2 : type === 'calm' ? 8 + day * 2 : 5 + Math.min(6, day), n: 1 + Math.min(6, day) });
    }
  }
  const bl = activeEv(st, 'blizzard'), calm = activeEv(st, 'calm'), storm = activeEv(st, 'storm'), cold = activeEv(st, 'coldsnap');
  w.retarget = (w.retarget || 0) - h;
  if (w.retarget <= 0) { w.retarget = 2 + Math.random() * 4; w.windT = .12 + Math.random() * .55; w.cloudT = Math.random(); }
  let wt = w.windT, ct = w.cloudT;
  if (bl) { wt = .82 + Math.random() * .1; ct = 1; } if (storm) { wt = .97; ct = .8; } if (calm) { wt = .06; ct = .96; }
  w.wind += (wt - w.wind) * Math.min(1, h * .8) + (Math.random() - .5) * .04; w.wind = Math.max(0, Math.min(1, w.wind));
  w.cloud += (ct - w.cloud) * Math.min(1, h * .6); w.cloud = Math.max(0, Math.min(1, w.cloud));
  w.snowing = st.theme === 'winter' && (bl || (w.cloud > .9 && !calm)) ? (bl ? 2 : 1) : 0;
  if (w.snowing) w.snow = Math.min(1, w.snow + (bl ? .35 : .08) * h);
  else if (sunAt(st, st.hour) > .1) w.snow = Math.max(0, w.snow - .14 * h);
  const base = st.theme === 'winter' ? -4 : 9;
  w.temp = base - 3.5 * Math.cos((hod(st.hour) - 15) / 24 * Math.PI * 2) - (cold ? 11 : 0) - (bl ? 5 : 0);
  // ice and wind knock lines down
  if (bl || storm) {
    const p = (bl ? .045 : .03) * h;
    for (const k in st.lines) if (!st.brk[k] && Math.random() < p) damageLine(st, +k, 25 + Math.random() * 45, bl ? 'ice' : 'wind');
  }
}

function damageLine(st, k, dmg, why) {
  if (st.lines[k] === undefined || st.brk[k]) return;
  st.lines[k] = Math.max(0, st.lines[k] - dmg);
  if (st.lines[k] <= 0) {
    st.brk[k] = 1; st.dirty = 1; st.stats.linesLost = (st.stats.linesLost || 0) + 1;
    EVA(why === 'thief' ? 'Copper stolen: power line down.' : 'Power line down.', 'line', { x: k % st.W, y: (k / st.W) | 0 });
    addFx(st, { k: 'spark', x: (k % st.W) * TS + 12, y: ((k / st.W) | 0) * TS - 6, t: 1.2 });
  }
}

function spawnThieves(st, n) {
  let made = 0;
  for (let i = 0; i < n * 20 && made < n; i++) {
    const side = Math.random() * 4 | 0; let x, y;
    if (side === 0) { x = 0; y = Math.random() * st.H | 0; } else if (side === 1) { x = st.W - 1; y = Math.random() * st.H | 0; } else if (side === 2) { y = 0; x = Math.random() * st.W | 0; } else { y = st.H - 1; x = Math.random() * st.W | 0; }
    if (!walkable(st, idx(st, x, y))) continue;
    st.units.push({ id: st.nextId++, type: 'thief', x, y, path: [], state: 'go', dir: 0, t: 0, retry: 0 }); made++;
  }
  if (made && Object.keys(st.lines).length) EVA('Intruders detected.', 'thief');
}

// ---------- one simulation step ----------
function simStep(st) {
  const h = STEP_H, M = mission(st);
  const prevDay = dayOf(st.hour);
  st.hour += h;
  weatherStep(st, h);
  if (st.dirty) derive(st);
  const w = st.weather, tempF = 1 + Math.max(0, 12 - w.temp) * .012;
  const grow = M.endless ? 1 + (dayOf(st.hour) - 1) * .03 : 1;
  for (const town of st.towns) { town.dem = town.pop * .012 * profile(st.hour) * tempF * grow; town.served = 0; }

  // plant states
  for (const s of st.structs) {
    const d = S[s.type];
    if (d.res) { s.res = Math.min(d.res, s.res + d.inflow * (st.theme === 'winter' ? .6 : 1) * h); }
    if (!THERMAL(s.type)) continue;
    const boost = s.fixBoost ? 3 : 1; s.fixBoost = 0;
    if (s.st === 'trip') { s.out = 0; s.tmr -= h * boost * (s.repairing ? 2 : 1); if (s.repairing) { pay(st, 40 * h); } if (s.tmr <= 0) { s.repairing = 0; s.st = d.auto ? 'off' : (s.on ? 'start' : 'off'); s.tmr = d.start; EVA(d.name + ' repaired.', 'fix'); } continue; }
    if (!s.on) { s.st = 'off'; s.out = 0; continue; }
    if (s.st === 'off' && !d.auto) { s.st = 'start'; s.tmr = d.start; }
    if (s.st === 'start') { s.out = 0; s.tmr -= h; if (s.tmr <= 0) { s.st = 'run'; s.out = d.cap * d.min; } continue; }
    if (s.st === 'run' && Math.random() < d.trip / 24 * h) { s.st = 'trip'; s.tmr = d.fix; s.out = 0; EVA(d.name + ' tripped!', 'trip', { x: s.x, y: s.y }); st.stats.trips = (st.stats.trips || 0) + 1; }
  }

  // dispatch, island by island
  let baseShort = 0; const baseIsl = st.structs[0] ? st.structs[0].isl : -1;
  let anyShed = [];
  for (const I of st.islands) {
    if (I.gen) for (const town of I.towns) if (!town.joined) { town.joined = 1; st.everJoined = 1; EVA(town.name + ' connected.', 'town', { x: town.x, y: town.y }); sfx('connect'); reveal(st); st.revDirty = 1; }
    const towns = I.towns.filter(t => t.joined);
    const loadT = towns.reduce((a, t) => a + t.dem, 0);
    const loadB = I.structs.reduce((a, s) => a + ((S[s.type].load || 0) * (s.type === 'tesla' && !s.on ? 0 : 1)), 0);
    const load = loadT + loadB;
    let ren = 0; const rens = [];
    for (const s of I.structs) if (S[s.type].ren) { const a = renewOut(st, s); s.avail = a; ren += a; rens.push(s); }
    const th = I.structs.filter(s => THERMAL(s.type)).sort((a, b) => S[a.type].fuel - S[b.type].fuel);
    const hyd = I.structs.filter(s => S[s.type].res && s.on);
    const bess = I.structs.filter(s => S[s.type].store && s.on);
    let need = load - ren;
    const order = [...th.filter(s => s.type !== 'gas'), ...hyd, ...th.filter(s => s.type === 'gas')];
    for (const s of order) {
      const d = S[s.type];
      if (d.res) { const hi = Math.min(d.cap, s.res / h); const tg = Math.max(0, Math.min(need, hi)); s.out = tg; s.hi = hi; need -= tg; continue; }
      if (s.st !== 'run' || loadT < .01) { s.out = 0; continue; }   // nobody to supply yet: hot standby, no fuel
      const lo = d.cap * d.min, hi = d.cap, tg = Math.max(lo, Math.min(hi, need)), rr = d.cap * d.ramp * h;
      s.out = Math.max(lo, Math.min(hi, Math.max(s.out - rr, Math.min(s.out + rr, tg)))); need -= s.out;
    }
    let sup = ren + order.reduce((a, s) => a + s.out, 0), bal = sup - load;
    let bessPow = 0;
    for (const b of bess) b.pow = 0;
    if (bal < 0) {
      for (const s of hyd) { const add = Math.min(s.hi - s.out, -bal); s.out += add; bal += add; }
      for (const b of bess) { if (bal >= 0) break; const p = Math.min(S.bess.cap, b.soc / h, -bal); b.soc -= p * h; b.pow = p; bal += p; bessPow += p; }
    } else if (bal > 0) {
      for (const s of hyd) { const cut = Math.min(s.out, bal); s.out -= cut; bal -= cut; }
      for (const b of bess) { if (bal <= 0) break; const p = Math.min(S.bess.cap, (S.bess.energy - b.soc) / (h * S.bess.eff), bal); b.soc += p * h * S.bess.eff; b.pow = -p; bal -= p; }
    }
    // batteries shave expensive gas
    for (const g of th.filter(s => s.type === 'gas' && s.st === 'run')) {
      const lo = S.gas.cap * S.gas.min; let room = g.out - lo;
      for (const b of bess) { if (room <= 0) break; if (b.soc < S.bess.energy * .3 || b.pow < 0) continue; const p = Math.min(S.bess.cap - Math.max(0, b.pow), b.soc / h, room); if (p <= 0) continue; b.soc -= p * h; b.pow += p; g.out -= p; room -= p; }
    }
    // curtail renewables if still long
    let used = ren;
    if (bal > 0) { const c = Math.min(ren, bal); used = ren - c; bal -= c; }
    const k = ren > 0 ? used / ren : 0; for (const s of rens) s.out = s.avail * k;
    // gas on auto: start on shortfall or thin reserve, stop when idling at minimum
    const head = th.reduce((a, s) => a + (s.st === 'run' ? S[s.type].cap - s.out : 0), 0) + hyd.reduce((a, s) => a + (s.hi - s.out), 0) + bess.reduce((a, b) => a + Math.min(S.bess.cap, b.soc / 1) , 0);
    const gasAuto = th.filter(s => s.type === 'gas' && s.on);
    if ((bal < -.5 || head < load * .08) && gasAuto.some(g => g.st === 'off')) { const g = gasAuto.find(g => g.st === 'off'); g.st = 'start'; g.tmr = S.gas.start; }
    for (const g of gasAuto) { if (g.st === 'run' && g.out <= S.gas.cap * S.gas.min + .5 && head > load * .25 + S.gas.cap) { g.idle = (g.idle || 0) + h; if (g.idle > 1.5) { g.st = 'off'; g.out = 0; g.idle = 0; } } else g.idle = 0; }
    // shed villages if short
    let short = Math.max(0, -bal);
    I.short = short; I.over = Math.max(0, bal);
    const avail = Math.max(0, sup + bessPow - loadB);
    if (!I.gen && !bess.length) short = loadT + loadB;
    const shed = new Set();
    if (short > .01) {
      const cand = towns.slice().sort((a, b) => (a.shedFor - b.shedFor) || (b.dem - a.dem));
      let got = 0; for (const t of cand) { if (got >= short) break; shed.add(t); got += t.dem; }
      if (got < short && I.id === baseIsl) baseShort = short - got;
    }
    for (const t of towns) {
      const was = t.lit; t.lit = !shed.has(t); t.served = t.lit ? t.dem : 0;
      if (!t.lit) { t.shedFor += h; t.outH += h; if (was || t.first === undefined) { anyShed.push(t); } } else t.shedFor = Math.max(0, t.shedFor - h * .25);
      t.first = 1;
    }
    I.load = load; I.sup = sup + bessPow; I.cap = ren + th.reduce((a, s) => a + (s.st === 'run' ? S[s.type].cap : 0), 0) + hyd.reduce((a, s) => a + s.hi, 0) + bess.reduce((a, b) => a + Math.min(S.bess.cap, b.soc), 0);
  }
  for (const town of st.towns) if (!town.joined) { town.lit = 0; town.served = 0; }
  if (anyShed.length) EVA('Blackout in ' + anyShed.map(t => t.name).slice(0, 2).join(' and ') + '.', 'black', { x: anyShed[0].x, y: anyShed[0].y });
  const baseI = st.islands.find(I => I.id === baseIsl);
  const low = baseI && baseI.gen && baseI.towns.some(t => t.joined) ? (baseI.short > .01) : 0;
  if (low && !st.lowPower) { EVA('Low power.', 'low'); sfx('low'); }
  if (!low && st.lowPower) EVA('Power restored.', 'ok');
  st.lowPower = low ? 1 : 0;

  // economy
  let dem = 0, served = 0, fuel = 0, co2 = 0, up = 0;
  for (const town of st.towns) if (town.joined) { dem += town.dem * h; served += town.served * h; }
  for (const s of st.structs) { const d = S[s.type]; up += (d.up || 0) * h; if (d.fuel !== undefined) { fuel += s.out * d.fuel * h; co2 += s.out * d.co2 * h; } }
  if (M.co2Rise) st.co2Price = M.co2 + M.co2Rise * (dayOf(st.hour) - 1);
  const income = served * TARIFF, tax = co2 * st.co2Price;
  st.credits += income - fuel - tax - up;
  const S_ = st.stats; S_.dem += dem; S_.served += served; S_.shed += dem - served; S_.co2 += co2; S_.earned += income; S_.fuel += fuel + tax + up;
  if (dem - served > .01) S_.blackoutH += h;
  st.last24.push([dem, served]); if (st.last24.length > 24 / h) st.last24.shift();
  st.flow = { income: income / h, cost: (fuel + tax + up) / h };

  // villages
  let pw = 0, mw = 0;
  for (const town of st.towns) {
    if (!town.joined) { town.mood += (45 - town.mood) * .05 * h; continue; }
    let smog = 0; for (const s of st.structs) if (S[s.type].smog && s.out > 0 && Math.hypot(s.x + 1 - town.x, s.y + 1 - town.y) < 8) smog += 10;
    const target = 90 - smog;
    if (town.lit) town.mood += Math.max(-2 * h, Math.min(5 * h, target - town.mood)); else town.mood -= 6 * h;
    town.mood = Math.max(0, Math.min(100, town.mood)); town.smog = smog;
    pw += town.pop; mw += town.pop * town.mood;
  }
  st.approval = pw ? mw / pw : 55;
  // new day: villages that were happy grow
  if (dayOf(st.hour) !== prevDay) {
    const grown = [];
    for (const town of st.towns) if (town.joined) { if (town.mood > 65 && town.dayOut < 1) { town.pop = Math.round(town.pop * (M.endless ? 1.06 : 1.03)); grown.push(town.name); } }
    for (const town of st.towns) town.dayOut = 0;
    EVA('Day ' + dayOf(st.hour) + '.', 'day');
    if (grown.length) EVA(grown.slice(0, 3).join(', ') + (grown.length > 1 ? ' are' : ' is') + ' growing.', 'grow');
  }
  for (const town of st.towns) if (town.joined && !town.lit) town.dayOut = (town.dayOut || 0) + h;

  // tutorial safety net and money trouble
  if (M.tutorial && st.credits < 1200) { st.credits += 3000; EVA('Reinforcement funds have arrived.', 'funds'); }
  checkGoals(st);
}

function pay(st, c) { st.credits -= c; st.stats.fuel += c; }

// ---------- goals ----------
function goalCtx(st) {
  const M = mission(st), served = () => st.stats.dem > 0 ? st.stats.served / st.stats.dem : 1;
  return {
    hour: st.hour - (st.extend || 0), end: M.end || 1e9,
    townLit: i => st.towns[i] && st.towns[i].joined && st.towns[i].lit,
    lit: () => st.towns.filter(t => t.joined && t.lit).length,
    served, approval: () => st.approval, count: t => st.structs.filter(s => s.type === t).length,
    served24: () => { let d = 0, s = 0; for (const [a, b] of st.last24) { d += a; s += b; } return d ? s / d : 1; },
    done: k => st.goals[k] === 'done',
  };
}
function checkGoals(st) {
  if (st.over) return;
  const M = mission(st), c = goalCtx(st);
  for (const g of M.goals) {
    if (g.sticky && st.goals[g.key] === 'done') continue;
    const r = g.check(c);
    if (r === 'extend') { st.extend = (st.extend || 0) + 8; EVA('Hold the line a little longer, Commander.', 'extend'); continue; }
    if (r === 'done' && st.goals[g.key] !== 'done') { st.goals[g.key] = 'done'; if (!M.endless && M.goals.length > 1) EVA('Objective complete.', 'obj'); }
    else if (r === 'fail') { st.goals[g.key] = 'fail'; return endMission(st, false, g.text); }
    else if (r === null && !g.sticky && st.goals[g.key] === 'done') st.goals[g.key] = null;
  }
  const allDone = M.goals.every(g => st.goals[g.key] === 'done');
  if (!M.endless && allDone && st.hour - (st.extend || 0) >= (M.end || 0)) return endMission(st, true);
  if (st.credits < -3000) return endMission(st, false, 'The treasury ran dry.');
  st.lowAppr = st.approval < 15 ? (st.lowAppr || 0) + STEP_H : 0;
  if (st.lowAppr === STEP_H) EVA('Warning: approval collapsing. Restore power now!', 'warn');
  if (st.everJoined && st.lowAppr >= 4 && !M.tutorial) return endMission(st, false, 'The villages lost all faith in you.');
}
function endMission(st, win, why) {
  st.over = { win, why: why || '', hour: st.hour };
  onMissionEnd(st);
}

// ---------- continuous update (units, building, effects) ----------
function update(st, dt, speed) {
  const dtH = dt * speed / SEC_PER_H;
  st.acc = (st.acc || 0) + dtH;
  let n = 0;
  while (st.acc >= STEP_H && n++ < 40) { st.acc -= STEP_H; simStep(st); if (st.over) return; }
  buildStep(st, dt * speed);
  unitsStep(st, dtH);
  teslaStep(st, dtH);
}

function buildStep(st, dts) {
  for (const kind of ['s', 'u']) {
    const q = st.q[kind]; if (!q || q.ready || q.hold) continue;
    const d = S[q.type]; let dp = dts / d.sec * (st.lowPower ? .5 : 1);
    dp = Math.min(dp, 1 - q.prog);
    const c = d.cost * dp;
    if (st.credits < c) { if (!q.broke) { q.broke = 1; EVA('Insufficient funds.', 'funds'); } continue; }
    q.broke = 0; st.credits -= c; q.spent += c; q.prog += dp; st.stats.spent += c;
    if (q.prog >= .9999) {
      if (kind === 's') { q.ready = 1; EVA('Construction complete.', 'built'); sfx('ready'); }
      else { if (deployUnit(st, q.type)) { st.q.u = null; EVA('Unit ready.', 'unit'); sfx('ready'); } else { q.ready = 1; } }
    }
  }
}

function deployUnit(st, type) {
  const dep = st.structs.find(s => s.type === 'depot'); if (!dep) return false;
  const p = pathTo(st, dep.x + 1, dep.y + 2, k => walkable(st, k) && !st.units.some(u => idx(st, Math.round(u.x), Math.round(u.y)) === k), 400);
  let k = p ? p[p.length - 1] : null;
  if (k === null) { for (let j = -1; j <= 2 && k === null; j++) for (let i = -1; i <= 2; i++) { const x = dep.x + i, y = dep.y + j; if (inb(st, x, y) && walkable(st, idx(st, x, y))) { k = idx(st, x, y); break; } } }
  if (k === null) return false;
  st.units.push({ id: st.nextId++, type, x: k % st.W, y: (k / st.W) | 0, path: [], dir: 1, t: 0, state: 'idle', home: [dep.x, dep.y] });
  st.revDirty = 1; reveal(st);
  return true;
}

function moveAlong(st, u, sp, dtH) {
  let left = sp * dtH;
  while (left > 0 && u.path.length) {
    const k = u.path[0], tx = k % st.W, ty = (k / st.W) | 0;
    if (!walkable(st, k) && !(Math.round(u.x) === tx && Math.round(u.y) === ty)) { u.path = []; u.blocked = 1; return; }
    const dx = tx - u.x, dy = ty - u.y, dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) u.dir = dx > 0 ? 0 : 2; else if (dist > .01) u.dir = dy > 0 ? 1 : 3;
    if (dist <= left) { u.x = tx; u.y = ty; u.path.shift(); left -= dist; } else { u.x += dx / dist * left; u.y += dy / dist * left; left = 0; }
  }
  u.t += dtH;
}

function unitsStep(st, dtH) {
  if (dtH <= 0) return;
  const thieves = st.units.filter(u => u.type === 'thief');
  let reveal_ = 0;
  for (const u of st.units.slice()) {
    const tile = () => idx(st, Math.round(u.x), Math.round(u.y));
    u.think = (u.think || 0) - dtH;
    if (u.type === 'thief') {
      const sp = u.state === 'flee' ? 6.5 : 4;
      if (u.state === 'go') {
        if (!u.path.length && u.think <= 0) {
          u.think = .5;
          const keys = Object.keys(st.lines).map(Number).filter(k => !st.brk[k]);
          if (!keys.length) { u.state = 'flee'; continue; }
          const teslas = st.structs.filter(s => s.type === 'tesla');
          const safe = keys.filter(k => !teslas.some(t => Math.hypot(t.x - k % st.W, t.y - ((k / st.W) | 0)) < 6.5));
          const pool = (safe.length ? safe : keys);
          const goal = new Set(); for (const k of pool) { if (walkable(st, k)) goal.add(k); }
          if (!goal.size) for (const k of pool) for (const [dx, dy] of DIRS) { const x = k % st.W + dx, y = ((k / st.W) | 0) + dy; if (inb(st, x, y) && walkable(st, idx(st, x, y))) goal.add(idx(st, x, y)); }
          const p = pathTo(st, u.x, u.y, k => goal.has(k));
          if (p) { u.path = p.slice(1); u.target = p[p.length - 1]; } else { u.retry++; if (u.retry > 4) u.state = 'flee'; }
        }
        moveAlong(st, u, sp, dtH);
        if (!u.path.length && u.target !== undefined && tile() === u.target) u.state = 'steal';
      } else if (u.state === 'steal') {
        const here = tile(), x = Math.round(u.x), y = Math.round(u.y);
        let k = st.lines[here] !== undefined && !st.brk[here] ? here : -1;
        if (k < 0) for (const [dx, dy] of DIRS) { const m = idx(st, x + dx, y + dy); if (inb(st, x + dx, y + dy) && st.lines[m] !== undefined && !st.brk[m]) { k = m; break; } }
        if (k < 0) { u.state = 'go'; u.target = undefined; continue; }
        u.steal = k; damageLine(st, k, 55 * dtH, 'thief');
        if (st.brk[k]) u.state = 'flee';
      } else if (u.state === 'flee') {
        if (!u.path.length && u.think <= 0) { u.think = .5; const p = pathTo(st, u.x, u.y, k => { const x = k % st.W, y = (k / st.W) | 0; return x === 0 || y === 0 || x === st.W - 1 || y === st.H - 1; }); u.path = p ? p.slice(1) : []; if (!p) { st.units.splice(st.units.indexOf(u), 1); continue; } }
        moveAlong(st, u, sp, dtH);
        const x = Math.round(u.x), y = Math.round(u.y);
        if (!u.path.length && (x === 0 || y === 0 || x === st.W - 1 || y === st.H - 1)) st.units.splice(st.units.indexOf(u), 1);
      }
      continue;
    }
    const d = S[u.type];
    if (u.manual !== undefined) {
      if (!u.path.length) { const p = pathTo(st, u.x, u.y, k => k === u.manual); u.path = p ? p.slice(1) : []; if (!p || !u.path.length) u.manual = undefined; }
      moveAlong(st, u, d.speed, dtH); reveal_ = 1;
      if (!u.path.length) { u.manual = undefined; u.think = 1; }
      if (u.type === 'truck') repairAround(st, u, dtH);
      continue;
    }
    if (u.type === 'truck') {
      if (!u.path.length && u.think <= 0 && !repairAround(st, u, dtH)) {
        u.think = .3;
        const goal = new Set(), claimed = new Set(st.units.filter(o => o !== u && o.goal !== undefined).map(o => o.goal));
        const addAround = (x, y, w, h) => { for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) { const m = idx(st, x + i, y + j); if (inb(st, x + i, y + j) && walkable(st, m) && st.rev[m]) goal.add(m); } };
        for (const k in st.lines) if (st.lines[k] < 100 && st.rev[k] && !claimed.has(+k)) addAround(k % st.W, (k / st.W) | 0, 1, 1);
        for (const s of st.structs) if (s.st === 'trip') addAround(s.x, s.y, S[s.type].fp[0], S[s.type].fp[1]);
        const p = goal.size ? pathTo(st, u.x, u.y, k => goal.has(k)) : null;
        if (p && p.length > 1) { u.path = p.slice(1); u.goal = p[p.length - 1]; } else u.goal = undefined;
      }
      moveAlong(st, u, d.speed, dtH); if (u.path.length) reveal_ = 1;
      if (!u.path.length) repairAround(st, u, dtH);
    } else if (u.type === 'jeep') {
      const near = thieves.filter(t => st.rev[idx(st, Math.round(t.x), Math.round(t.y))] && Math.abs(t.x - u.x) + Math.abs(t.y - u.y) < 16)
        .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
      if (near) {
        if (Math.hypot(near.x - u.x, near.y - u.y) < .8) {
          st.units.splice(st.units.indexOf(near), 1); thieves.splice(thieves.indexOf(near), 1);
          st.credits += 150; st.stats.arrests++; EVA('Thief arrested. +150 credits.', 'arrest'); addFx(st, { k: 'cash', x: u.x * TS + 12, y: u.y * TS, t: 1.5, txt: '+150' }); sfx('cash');
          u.path = [];
        } else if (u.think <= 0 || !u.path.length) {
          u.think = .15; const tk = idx(st, Math.round(near.x), Math.round(near.y));
          const p = pathTo(st, u.x, u.y, k => k === tk || (Math.abs(k % st.W - tk % st.W) + Math.abs(((k / st.W) | 0) - ((tk / st.W) | 0)) <= 1), 3000); u.path = p ? p.slice(1) : [];
        }
      } else if (!u.path.length && u.think <= 0) {
        u.think = 2 + Math.random() * 2;
        const keys = Object.keys(st.lines).map(Number).filter(k => walkable(st, k));
        if (keys.length) { const k = keys[Math.random() * keys.length | 0]; const p = pathTo(st, u.x, u.y, m => m === k, 3000); u.path = p ? p.slice(1, 40) : []; }
      }
      moveAlong(st, u, d.speed, dtH); if (u.path.length) reveal_ = 1;
    }
  }
  if (reveal_) { const before = st.rev.reduce((a, b) => a + b, 0); reveal(st); if (st.rev.reduce((a, b) => a + b, 0) !== before) st.revDirty = 1; }
}

function repairAround(st, u, dtH) {
  const x = Math.round(u.x), y = Math.round(u.y); let did = false;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const m = idx(st, x + i, y + j); if (!inb(st, x + i, y + j)) continue;
    if (st.lines[m] !== undefined && st.lines[m] < 100) { st.lines[m] = Math.min(100, st.lines[m] + 110 * dtH); did = true; if (st.lines[m] >= 100 && st.brk[m]) { delete st.brk[m]; st.dirty = 1; EVA('Line repaired.', 'fix'); } u.working = .3; }
    const sid = st.occS[m]; if (sid) { const s = st.byId[sid]; if (s && s.st === 'trip') { s.fixBoost = 1; did = true; u.working = .3; } }
  }
  return did;
}

function teslaStep(st, dtH) {
  const thieves = st.units.filter(u => u.type === 'thief'); if (!thieves.length) return;
  for (const s of st.structs) {
    if (s.type !== 'tesla' || !s.on) continue;
    const I = st.islands.find(I => I.id === s.isl); if (!I || !I.gen || I.short > .01) continue;
    s.cd = (s.cd || 0) - dtH; if (s.cd > 0) continue;
    const t = thieves.find(t => Math.hypot(t.x - s.x, t.y - s.y) <= S.tesla.range && t.state !== 'zapped');
    if (!t) continue;
    s.cd = .5;
    addFx(st, { k: 'bolt', x0: s.x * TS + 12, y0: s.y * TS - 26, x1: t.x * TS + 12, y1: t.y * TS + 6, t: .45 });
    sfx('zap'); vib(25);
    if (!t.zapped) { t.zapped = 1; st.credits += 60; st.stats.zaps++; addFx(st, { k: 'cash', x: t.x * TS + 12, y: t.y * TS, t: 1.5, txt: '+60' }); EVA('Copper recovered.', 'zap'); }
    t.state = 'flee'; t.path = []; t.think = 0;
  }
}

function addFx(st, f) { f.age = 0; st.fx.push(f); if (st.fx.length > 400) st.fx.shift(); }
