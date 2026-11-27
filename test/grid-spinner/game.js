'use strict';
// Grid Spinner: the power grid as one shared spinning wheel. Keep it at 50 (or 60) Hz.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'grid-spinner';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (h, c, w) => { let d = Math.abs(h - c); d = Math.min(d, 24 - d); return Math.exp(-(d / w) * (d / w)); };
// Money is kept in EUR; Switzerland shows it in CHF.
const curOf = () => (G ? G.C : COUNTRIES.find(c => c.id === selCountry) || COUNTRIES[0]);
const fmtMoney = v => { const C = curOf(); v *= C.fx || 1; const neg = v < 0; v = Math.abs(v) / 1e6;
  const n = v >= 100 ? Math.round(v).toLocaleString('en-US').replace(/,/g, C.cur === 'CHF' ? "'" : ',') : v >= 10 ? v.toFixed(1) : v.toFixed(v >= 1 ? 1 : 2);
  return `${neg ? '−' : ''}${n} M${C.cur || 'EUR'}`; };
const fmtHz = f => f.toFixed(2);
const perMWh = v => { const C = curOf(); return `${Math.round(v * (C.fx || 1))} ${C.cur || 'EUR'}/MWh`; };

// ---------------------------------------------------------------- tuning
const HPS = 1 / 20;          // game hours per real second (one game day = 8 minutes)
const BAND = 0.2;            // admissible band ±Hz (European FCR is fully active at ±200 mHz)
const LIMIT = 1.0;           // ±1 Hz = instant blackout (load shedding / plant trips)
// Money runs on a yearly clock: one game day books a full year of bills, fuel and upkeep,
// so plants can cost what they cost in real life and still pay back within a game.
const YEAR = 365;
const DAY_S = 24 / HPS;      // real seconds per game day
const TARIFF = 110;          // €/MWh the consumers pay you
const PENALTY = 1.0e6;       // € per real second while outside the band
const BANKRUPT = -150e6;
const START_CASH = 250e6;
const BILL_MIN = 2e6, BILL_CAP = 12e6;   // a money tag shows from 2 M; uncollected bills stop growing at 12 M
const MAX_GENS = 20, MAX_LOADS = 12;

// kind: sync = spinning machine (inertia + governor), solar / wind = inverter, no inertia, bess / fly = storage
const TYPES = {
  peaker:   { name: 'Gas peaker', emoji: '', code: 'OCGT', kind: 'sync', cap: 40, ramp: 4, inertia: 25, droop: .2, tau: .8, fuel: 140, gas: true, maint: 0.6e6, capex: 36e6, start: 0.1e6, color: '#c92a2a', max: 8,
    desc: 'Open-cycle gas turbine: a jet engine on the ground. Spins up in seconds, but burns pricey gas. Your emergency button.' },
  hydro:    { name: 'Hydro', emoji: '', code: 'HYD', kind: 'sync', cap: 60, ramp: 3, inertia: 55, droop: .25, tau: 1.2, fuel: 5, maint: 1.8e6, capex: 180e6, start: 0.02e6, color: '#1971c2', max: 8,
    desc: 'Open the gates and the water does the work. Fast, cheap to run, lots of spinning mass. Limited by geography.' },
  ccgt:     { name: 'Gas CCGT', emoji: '', code: 'CCGT', kind: 'sync', cap: 100, ramp: 14, inertia: 90, droop: .15, tau: 1.5, fuel: 90, gas: true, maint: 2.5e6, capex: 120e6, start: 0.5e6, color: '#e67700', max: 6,
    desc: 'Combined-cycle gas: a gas turbine plus a steam turbine. The flexible workhorse. Takes a while to warm up.' },
  nuclear:  { name: 'Nuclear', emoji: '', code: 'NUC', kind: 'sync', cap: 250, ramp: 45, inertia: 260, droop: .05, tau: 3, fuel: 12, maint: 32e6, capex: 2500e6, start: 5e6, color: '#7048e8', max: 3,
    desc: 'Huge, steady and cheap per MWh, with a giant heavy rotor. Takes ages to spin up or down, so plan ahead.' },
  solar:    { name: 'Solar farm', emoji: '', code: 'PV', kind: 'solar', cap: 80, inertia: 0, fuel: 0, maint: 1e6, capex: 48e6, color: '#f08c00', max: 8,
    desc: 'Free fuel, zero inertia. Follows the sun and every passing cloud. Nothing at night.' },
  wind:     { name: 'Wind farm', emoji: '', code: 'WTG', kind: 'wind', cap: 70, inertia: 0, fuel: 0, maint: 2.8e6, capex: 105e6, color: '#0c8599', max: 8,
    desc: 'Free fuel, connected through inverters, so no inertia. Power grows with the cube of wind speed; shuts down in storms.' },
  bess:     { name: 'BESS', emoji: '', code: 'BESS', kind: 'bess', cap: 50, energy: 200, full: .14, tau: .12, inertia: 0, fuel: 0, maint: 1e6, capex: 47e6, color: '#2b8a3e', max: 6,
    desc: 'Battery energy storage, 50 MW / 200 MWh. Pushes or brakes automatically within a fraction of a second. Superb at holding the frequency, but it only stores so much.' },
  flywheel: { name: 'Flywheel', emoji: '', code: 'FW', kind: 'fly', cap: 20, energy: 5, full: .05, tau: .04, inertia: 150, fuel: 0, maint: 1.2e6, capex: 40e6, color: '#495057', max: 4,
    desc: 'A heavy wheel on magnetic bearings: real inertia plus millisecond response. Holds only seconds of energy.' },
};

const LOADS = {
  city:   { name: 'City homes', emoji: '', code: 'RES', base: 150, prof: 'res', noise: .02, tau: 2, kind: 'daily rhythm: morning and evening peaks' },
  office: { name: 'Offices & shops', emoji: '', code: 'COM', base: 90, prof: 'com', noise: .02, tau: 2, kind: 'busy 8 to 19, quiet at night' },
  data:   { name: 'Data centre', emoji: '', code: 'DC', base: 70, prof: 'flat', noise: .01, tau: 3, kind: 'flat, day and night' },
  factory:{ name: 'Factory', emoji: '', code: 'IND', base: 70, prof: 'ind', step: true, noise: .01, tau: 1, kind: 'shift work: big steps when machines start' },
  ev:     { name: 'EV chargers', emoji: '', code: 'EV', base: 45, prof: 'ev', noise: .08, tau: 1, kind: 'everyone plugs in after work' },
  steel:  { name: 'Steel mill', emoji: '', code: 'EAF', base: 60, prof: 'flat', arc: true, noise: 0, tau: .25, kind: 'electric arc furnace: wild jumps every few seconds' },
  rail:   { name: 'Railway', emoji: '', code: 'RAIL', base: 35, prof: 'rail', train: true, noise: .02, tau: .5, kind: 'spikes whenever a train pulls away' },
  heat:   { name: 'Heat pumps', emoji: '', code: 'HP', base: 55, prof: 'heat', noise: .03, tau: 3, kind: 'follows the weather' },
};
const LOAD_ERRATIC = { steel: 1, rail: 1, factory: 1, ev: 1 };

const COUNTRIES = [
  { id: 'ch', nb: 150, cur: 'CHF', fx: .93, flag: '🇨🇭', name: 'Switzerland', hz: 50, sun: .85, wind: .9, windMean: 5.5, hydroMax: 10,
    types: ['peaker', 'hydro', 'ccgt', 'nuclear', 'solar', 'wind', 'bess', 'flywheel'],
    start: [['nuclear', 1], ['hydro', 1], ['hydro', 1], ['ccgt', 1], ['solar', 1], ['hydro', 0], ['peaker', 0]],
    nukeLock: 'No new nuclear plants yet: the ban dates from 2018. Parliament voted in 2026 to lift it, but voters still have the last word. You keep the existing plant.',
    tag: 'Hydro + nuclear · new nuclear on hold', fact: 'Hydropower from the Alps makes more than half of Swiss electricity, and the Swiss grid spins in sync with the rest of continental Europe.' },
  { id: 'it', nb: 120, flag: '🇮🇹', name: 'Italy', hz: 50, sun: 1.2, wind: .9, windMean: 6.5, hydroMax: 5, noNuke: true, hot: true,
    types: ['peaker', 'hydro', 'ccgt', 'nuclear', 'solar', 'wind', 'bess', 'flywheel'],
    start: [['ccgt', 1], ['ccgt', 1], ['ccgt', 1], ['hydro', 1], ['peaker', 0], ['peaker', 0], ['solar', 1], ['solar', 1]],
    nukeLock: 'No nuclear yet: a 2026 law opens the door to small modular reactors, but the first units are not expected before the 2030s.',
    tag: 'Gas-heavy, strong sun · no nuclear', fact: 'Italy closed its nuclear plants after the 1987 referendum. Gas does the heavy lifting, and the southern sun is pushing solar up fast.' },
  { id: 'de', nb: 150, flag: '🇩🇪', name: 'Germany', hz: 50, sun: .9, wind: 1, windMean: 8.5, hydroMax: 2, noNuke: true,
    types: ['peaker', 'hydro', 'ccgt', 'nuclear', 'solar', 'wind', 'bess', 'flywheel'],
    start: [['ccgt', 1], ['ccgt', 1], ['hydro', 1], ['wind', 1], ['wind', 1], ['solar', 1], ['solar', 1], ['bess', 1], ['peaker', 0], ['peaker', 0]],
    nukeLock: 'No nuclear: Germany shut its last reactors in April 2023 and is not building new ones.',
    tag: 'Wind + sun · no nuclear', fact: 'Germany shut its last nuclear plants in April 2023. Wind and sun lead the mix, so keeping enough spinning mass is a real engineering topic.' },
  { id: 'fr', nb: 130, flag: '🇫🇷', name: 'France', hz: 50, sun: .95, wind: 1, windMean: 7.5, hydroMax: 5,
    types: ['peaker', 'hydro', 'ccgt', 'nuclear', 'solar', 'wind', 'bess', 'flywheel'],
    start: [['nuclear', 1], ['hydro', 1], ['ccgt', 1], ['wind', 1], ['solar', 1], ['ccgt', 0], ['peaker', 0]],
    tag: 'Nuclear giant · may build new reactors', fact: 'Roughly two thirds of French electricity is nuclear: big, heavy, steady machines. Great inertia, slow to change.' },
];
const DIFFS = {
  easy:   { name: 'Calm', grace: 14, E: .6, eventGap: 75, loadGap: 95, loads: ['city', 'office', 'data'] },
  normal: { name: 'Busy', grace: 10, E: 1, eventGap: 52, loadGap: 78, loads: ['city', 'office', 'data', 'factory', 'ev'] },
  hard:   { name: 'Wild', grace: 7, E: 1.4, eventGap: 36, loadGap: 60, loads: ['city', 'office', 'data', 'factory', 'ev', 'steel', 'rail'] },
};

function profile(p, h) {
  h = ((h % 24) + 24) % 24;
  switch (p) {
    case 'res': return .55 + .25 * bump(h, 8, 1.5) + .45 * bump(h, 19.5, 2.2) + .1 * bump(h, 13, 3);
    case 'com': return .35 + .65 * smooth(7, 9, h) * (1 - smooth(18, 20, h));
    case 'ind': return .4 + .6 * smooth(6.8, 7.2, h) * (1 - smooth(21.8, 22.2, h));
    case 'ev': return .2 + .9 * bump(h, 20, 2.2) + .2 * bump(h, 9, 1.5);
    case 'rail': return .3 + .7 * smooth(5, 6, h) * (1 - smooth(23.5, 24, h));
    case 'heat': return .7 + .3 * bump(h, 7, 2) + .3 * bump(h, 19, 3);
    default: return 1;
  }
}
const sunAt = h => { h = ((h % 24) + 24) % 24; return Math.max(0, Math.sin(Math.PI * (h - 6) / 14)); };
const windCurve = v => v < 3 ? 0 : v >= 12 ? 1 : (v * v * v - 27) / (1728 - 27);

// ---------------------------------------------------------------- state
let G = null, uid = 0;
// Settings: auto-collect bills (default on), sound, vibration.
const SET = Object.assign({ view: 'wheel', auto: true, sound: !store.get('muted', false), vibe: store.get('vibe', true) }, store.get('settings', {}));
if (SET.iso && !store.get('settings', {}).view) SET.view = '3d';   // older saved setting
delete SET.iso;
function setSetting(k, v) {
  SET[k] = v; store.set('settings', SET);
  if (k === 'sound') { AU.muted = !v; if (v) audioInit(); }
  if (k === 'auto' && v && G) collectAll();
  if (k === 'view') { applyView(); resetView(); }
  syncSwitches();
}
function syncSwitches() {
  document.querySelectorAll('.switch[data-set]').forEach(b => { b.classList.toggle('on', !!SET[b.dataset.set]); b.setAttribute('aria-pressed', !!SET[b.dataset.set]); });
  document.querySelectorAll('.vseg button').forEach(b => b.classList.toggle('on', SET.view === b.dataset.v));
}
document.querySelectorAll('.switch[data-set]').forEach(b => b.addEventListener('click', () => setSetting(b.dataset.set, !SET[b.dataset.set])));
document.querySelectorAll('.vseg button').forEach(b => b.addEventListener('click', () => setSetting('view', b.dataset.v)));
let selCountry = store.get('country', 'ch'), selDiff = store.get('diff', 'normal');

const TUT_D = { name: 'Tutorial', grace: 10, E: .5, eventGap: 52, loadGap: 1e9, loads: [] };
function newGame(cid, did, tut) {
  let C = COUNTRIES.find(c => c.id === cid) || COUNTRIES[0], D = DIFFS[did] || DIFFS.normal;
  if (tut) { C = Object.assign({}, C, { nb: 0, start: [] }); D = TUT_D; did = 'tutorial'; }
  G = {
    C, D, did, f0: C.hz, f: tut ? 0 : C.hz, t: 0, hour: tut ? 11 : 6, day: 1, cash: tut ? 1000e6 : START_CASH,
    units: [], loads: [], hist: [], full: [], histT: 0, secMin: C.hz, secMax: C.hz, secT: 0,
    cloud: .85, cloudHit: 1, cloudT: 0, wind: C.windMean, windEv: 0, windEvT: 0,
    demandEv: 1, demandEvT: 0, kettle: 0, kettleT: 0, fuelMul: 1, fuelT: 0,
    nextEvent: 60, nextLoad: 75 + rand(-10, 10), announced: null,
    alarm: 0, nbP: 0, over: false, hold: false, floats: [], paused: false, theta: 0, thetaRef: 0,
    rate: { rev: 0, fuel: 0, maint: 0, pen: 0 }, supply: 0, demand: 0, inertia: 0,
    stats: { minF: C.hz, maxF: C.hz, peak: 0, built: 0, events: 0, spent: 0, earned: 0, cleanBuilt: 0 },
    eh: {}, ms: {}, won: false, co2: 1, mix: { share: 0, full: false, fossil24: 0 },
  };
  uid = 0;
  if (tut) { G.tut = { i: 0, t: 0, wind: 9, cloud: 1, used: {} }; G.scale = 1; G.wind = 9; G.cloud = .95; ensurePlan(G.hour); layoutDirty = true; return; }
  for (const [t, on] of C.start) addUnit(t, !!on, !!on);
  // Loads: scale them so demand at 06:00 matches the starting fleet.
  for (const t of D.loads) addLoad(t, 1, true);
  let supply = 0;
  for (const u of G.units) if (u.engaged) supply += expectedOut(u);
  const raw = G.loads.reduce((s, L) => s + L.base * profile(LOADS[L.type].prof, 6), 0);
  G.scale = supply * .99 / raw;
  for (const L of G.loads) { L.base *= G.scale; L.P = L.base * profile(LOADS[L.type].prof, 6); }
  for (const u of G.units) if (u.engaged) { u.P = expectedOut(u); }
  ensurePlan(G.hour); G.wxHour = Math.floor(G.hour);
  G.supply = G.units.reduce((a, u) => a + u.P, 0); G.demand = G.loads.reduce((a, L) => a + L.P, 0);
  G.inertia = 60 + .15 * G.demand + G.C.nb * .8 + G.units.reduce((a, u) => a + (u.engaged && (u.T.kind === 'sync' || u.T.kind === 'fly') ? u.T.inertia : 0), 0);
  layoutDirty = true;
}
function expectedOut(u) {
  const T = u.T;
  if (T.kind === 'sync') return T.cap * (1 - T.droop);
  if (T.kind === 'wind') return T.cap * windCurve(G.wind) * G.C.wind;
  if (T.kind === 'solar') return T.cap * G.C.sun * sunAt(G.hour) * G.cloud;
  return 0;
}
function addUnit(type, engaged, ready) {
  const T = TYPES[type];
  const u = { id: ++uid, type, T, engaged, level: ready ? 1 : 0, droopP: 0, P: 0, soc: .5, trip: 0, tripWhy: '', repair: 0,
    phi: Math.random() * 6, gust: rand(-.1, .1), ph: Math.random() * 100, n: G.units.filter(x => x.type === type).length + 1 };
  G.units.push(u); layoutDirty = true; return u;
}
function addLoad(type, mult, initial) {
  const D = LOADS[type];
  const L = { id: ++uid, type, D, base: D.base * mult, P: 0, nz: 0, timer: rand(1, 4), lvl: 1, spike: 0,
    conn: initial ? 1 : 0, grow: 1, off: 0, n: G.loads.filter(x => x.type === type).length + 1 };
  G.loads.push(L); layoutDirty = true; return L;
}
const erratic = () => G.D.E * (1 + .2 * (G.day - 1));

// ---------------------------------------------------------------- simulation
function step(dt) {
  const g = G, C = g.C, f0 = g.f0;
  g.t += dt; if (g.tut) g.tut.t += dt; else g.hour += dt * HPS;
  const day = Math.floor((g.hour - 6) / 24) + 1;
  if (day !== g.day) { g.day = day; newDay(); }
  const h = g.hour, df = g.f - f0, E = erratic(), dH = dt * HPS;

  // weather: follows the hourly plan (that's the forecast), plus short-term noise
  ensurePlan(h);
  const wk = Math.floor(h), wf = smooth(0, 1, h - wk), p0 = g.plan[wk], p1 = g.plan[wk + 1];
  if (wk !== g.wxHour) { g.wxHour = wk; weatherNews(wk); }
  g.cloud = clamp(g.cloud + .3 * (p0.cloud + (p1.cloud - p0.cloud) * wf - g.cloud) * dt + (g.tut ? 0 : .06 * Math.sqrt(dt) * randn()), .2, 1);
  const front = g.tut ? g.tut.cloud < 1 : p0.ev === 'clouds';
  g.cloudHit += ((front ? (g.tut ? g.tut.cloud : .25) : 1) - g.cloudHit) * Math.min(1, dt / (front ? 1.5 : 4));
  const wT = p0.wind + (p1.wind - p0.wind) * wf;
  g.wind = Math.max(0, g.wind + (g.tut || Math.abs(wT - g.wind) > 6 ? 1.2 : .15) * (wT - g.wind) * dt + (g.tut ? 0 : .22 * Math.sqrt(dt) * randn()));
  if (g.demandEvT > 0) { g.demandEvT -= dt; } else g.demandEv += (1 - g.demandEv) * Math.min(1, dt / 4);
  if (g.kettleT > 0) { g.kettleT -= dt; g.kettle += (.1 - g.kettle) * Math.min(1, dt / .8); } else g.kettle += (0 - g.kettle) * Math.min(1, dt / 3);
  if (g.fuelT > 0) { g.fuelT -= dt; if (g.fuelT <= 0) { g.fuelMul = 1; ticker('⛽ Gas prices are back to normal', '', 'good'); } }

  // tutorial, before the first customer: plants idle in sync and simply spin the wheel up to nominal speed
  if (g.tut && !g.loads.length) {
    for (const u of g.units) { if (u.T.kind === 'sync') u.level = 0; u.P = 0; }
    const tgt = g.units.some(u => u.T.kind === 'sync' && u.engaged) ? f0 : 0, d = tgt - g.f;
    g.f += Math.sign(d) * Math.min(Math.abs(d), dt * (1.2 + Math.abs(d) * .35));
    g.supply = g.demand = 0; g.inertia = 60 + g.units.reduce((m, u) => m + (u.T.kind === 'sync' && u.engaged ? u.T.inertia : 0), 0);
    record(g, dt, 0); return;
  }

  // consumers
  let load = 0;
  for (const L of g.loads) {
    const D = L.D;
    let p = L.base * (L.flat ? 1 : profile(D.prof, h)) * L.grow;
    if (D.prof === 'heat') p *= g.demandEv;
    if (D.arc) { L.timer -= dt; if (L.timer <= 0) { L.timer = rand(1.2, 3.5) / Math.sqrt(E); L.lvl = clamp(1 + (Math.random() * 2 - 1) * .75 * Math.min(E, 1.35), .05, 2); } p *= L.lvl; }
    if (D.step) { L.timer -= dt; if (L.timer <= 0) { L.timer = rand(10, 24) / E; L.lvl = clamp(1 + (Math.random() * 2 - 1) * .3 * E, .5, 1.5); } p *= L.lvl; }
    if (D.train) { L.timer -= dt; if (L.timer <= 0) { L.timer = rand(5, 12) / Math.sqrt(E); L.spike = 1.2 * E; } L.spike *= Math.exp(-dt / 2.2); p += L.base * L.spike * profile('rail', h); }
    L.nz += -.4 * L.nz * dt + D.noise * E * 1.2 * Math.sqrt(dt) * randn();
    p *= (1 + L.nz) * g.demandEv * (1 + g.kettle * (D.prof === 'res' ? 2.2 : 0));
    if (L.off > 0) { L.off -= dt; p = 0; if (L.off <= 0) { L.conn = 0; ticker(`${D.emoji} ${D.name} is back online`, 'Watch the wheel slow as it reconnects.', 'info'); } }
    if (L.conn < 1) { L.conn = Math.min(1, L.conn + dt / (L.connT || 3)); p *= L.conn; }
    L.P += (Math.max(0, p) - L.P) * Math.min(1, dt / D.tau);
    load += L.P;
  }
  load *= 1 + 3 * df / f0;          // motors slow down a little with frequency (load damping)

  // neighbours on the same synchronous grid help a little (islands get almost nothing)
  g.nbP += (-clamp(df / BAND, -1, 1) * C.nb * BAND - g.nbP) * Math.min(1, dt / 2);
  // generators and storage
  let gen = g.nbP, M = 60 + .15 * load + C.nb * .8, fuel = (g.nbP > 0 ? g.nbP * 150 : g.nbP * 20) * dH * YEAR, maint = 0;
  for (const u of g.units) {
    const T = u.T;
    maint += T.maint / DAY_S * dt;
    if (u.repair > 0) { u.repair -= dt; if (u.repair <= 0) ticker(`🔧 ${T.emoji} ${T.name} ${u.n} is repaired`, 'Tap it to switch it back on.', 'good'); }
    if (T.kind === 'sync') {
      u.level = u.engaged ? Math.min(1, u.level + dt / T.ramp) : Math.max(0, u.level - dt / T.ramp);
      if (u.scrapWhenIdle && u.level <= 0) { g.scrapQ = g.scrapQ || []; g.scrapQ.push(u); }
      const reserve = T.droop * T.cap;
      if (u.level > 0) {
        const tgt = -clamp(df / BAND, -1, 1) * reserve;
        u.droopP += (tgt - u.droopP) * Math.min(1, dt / T.tau);
        M += T.inertia;
      } else u.droopP = 0;
      u.P = clamp(u.level * (T.cap - reserve + u.droopP), 0, T.cap);
      fuel += u.P * dH * YEAR * T.fuel * (T.gas ? g.fuelMul * g.co2 : 1);
    } else if (T.kind === 'solar' || T.kind === 'wind') {
      if (u.trip > 0) { u.trip -= dt; if (u.trip <= 0) u.tripWhy = ''; }
      let tgt = 0;
      if (u.engaged && u.trip <= 0) {
        if (T.kind === 'solar') {
          const c = clamp(g.cloud * (.88 + .12 * Math.sin(g.t * .21 + u.ph)), 0, 1) * g.cloudHit;
          tgt = Math.min(T.cap, T.cap * C.sun * sunAt(h) * c);
        } else {
          u.gw = (u.gw || 0) * (1 - .08 * dt) + .28 * Math.sqrt(dt) * randn();
          const v = Math.max(0, g.wind * (1 + u.gust) + u.gw);
          if (v > 25) { u.trip = rand(18, 26); u.tripWhy = 'storm cut-out'; }
          else tgt = T.cap * windCurve(v) * C.wind;
        }
      }
      u.P += (tgt - u.P) * Math.min(1, dt / (u.trip > 0 ? .15 : .6));
    } else { // bess / flywheel: droop on frequency, nudge state of charge back to 50 % when calm
      let tgt = 0;
      if (u.engaged) {
        const db = .01, d = Math.abs(df) > db ? df - Math.sign(df) * db : 0;
        tgt = -clamp(d / T.full, -1, 1) * T.cap;
        if (Math.abs(df) < .04) tgt += (u.soc - .5) * T.cap * (T.kind === 'fly' ? 1.2 : .5);
        tgt = clamp(tgt, -T.cap, T.cap);
        if (tgt > 0 && u.soc <= .02) tgt = 0;
        if (tgt < 0 && u.soc >= .98) tgt = 0;
        if (T.kind === 'fly') M += T.inertia;
      }
      u.P += (tgt - u.P) * Math.min(1, dt / T.tau);
      u.soc = clamp(u.soc - (u.P > 0 ? u.P : u.P * .9) * dH / T.energy, 0, 1);
    }
    gen += u.P;
  }

  if (g.scrapQ && g.scrapQ.length) { for (const u of g.scrapQ) if (g.units.includes(u)) scrap(u); g.scrapQ.length = 0; }
  g.f += (gen - load) / M * dt;
  g.supply = gen; g.demand = load; g.inertia = M;

  // money
  const rev = load * dH * YEAR * TARIFF, pen = Math.abs(g.f - f0) > BAND ? PENALTY * dt : 0;
  if (g.tut) { /* tutorial: unlimited budget, cash never moves */ }
  else if (SET.auto) g.cash += rev;
  else { // each consumer runs up a bill you collect by tapping its money tag; past the cap they stop paying
    const lf = 1 + 3 * df / f0;
    for (const L of g.loads) L.bill = Math.min(BILL_CAP, (L.bill || 0) + L.P * lf * dH * YEAR * TARIFF);
  }
  if (!g.tut) g.cash -= fuel + maint + pen;
  g.stats.earned += rev;
  const k = Math.min(1, dt / 1.5), r = g.rate;
  r.rev += (rev / dt - r.rev) * k; r.fuel += (fuel / dt - r.fuel) * k; r.maint += (maint / dt - r.maint) * k; r.pen += (pen / dt - r.pen) * k;

  // energy by source, per game hour, for the clean share (storage is left out: it only shifts energy)
  const ek = Math.floor(g.hour), eb = g.eh[ek] || (g.eh[ek] = { c: 0, f: 0 });
  for (const u of g.units) if (u.P > 0) { if (FOSSIL[u.type]) eb.f += u.P * dH; else if (CLEAN[u.type]) eb.c += u.P * dH; }
  record(g, dt, load);
  const d2 = g.f - f0;

  // tutorial: nothing random, nothing breaks
  if (g.tut) {
    g.f = clamp(g.f, f0 - 2.5, f0 + 2.5);
    if (Math.abs(d2) > BAND) { g.alarm = Math.min(g.D.grace - .01, g.alarm + dt); g.tut.sb = 0; }
    else { g.alarm = Math.max(0, g.alarm - dt * 1.5); if (!g.tut.sb) g.tut.sb = g.t; }
    return;
  }

  // events and new customers
  g.nextEvent -= dt; if (g.nextEvent <= 0) { fireEvent(); g.nextEvent = gap(g.D.eventGap); }
  g.nextLoad -= dt;
  if (!g.announced && g.nextLoad <= 12) announceLoad();
  if (g.nextLoad <= 0) { connectLoad(); g.nextLoad = gap(g.D.loadGap); }

  // safety
  if (Math.abs(d2) > BAND) { g.alarm += dt; if (g.alarm >= g.D.grace) return gameOver(d2 < 0 ? 'lowband' : 'highband'); }
  else g.alarm = Math.max(0, g.alarm - dt * 1.5);
  if (d2 <= -LIMIT) return gameOver('under');
  if (d2 >= LIMIT) return gameOver('over');
  if (g.cash < BANKRUPT) return gameOver('broke');
}
function record(g, dt, load) {
  g.stats.minF = Math.min(g.stats.minF, g.f); g.stats.maxF = Math.max(g.stats.maxF, g.f); g.stats.peak = Math.max(g.stats.peak, load);
  g.secMin = Math.min(g.secMin, g.f); g.secMax = Math.max(g.secMax, g.f);
  g.histT += dt; if (g.histT >= .1) { g.histT -= .1; g.hist.push(g.f); if (g.hist.length > 900) g.hist.splice(0, g.hist.length - 900); }
  g.secT += dt; if (g.secT >= 1) { g.secT -= 1; g.full.push([g.secMin, g.secMax]); g.secMin = g.secMax = g.f; }
}
const gap = base => Math.max(14, base * Math.pow(.85, G.day - 1) * rand(.7, 1.3));

function newDay() {
  for (const L of G.loads) L.grow *= 1.04;
  G.co2 = 1 + .1 * (G.day - 1);
  ticker(`Day ${G.day}: the CO₂ price goes up again`, `Gas plants now cost ${Math.round((G.co2 - 1) * 100)} % more to run. Demand grows, loads get wilder, surprises come faster.`, 'info');
  sfx('day');
}

// ---------------------------------------------------------------- weather plan (the forecast)
// One entry per game hour: wind speed, cloudiness, and maybe a storm, a calm spell or a cloud front.
// It is generated hours ahead, so the forecast strip can show what's coming.
function ensurePlan(h) {
  const g = G, C = g.C; g.plan = g.plan || {};
  for (let k = Math.floor(h) - 1; k <= Math.floor(h) + 8; k++) {
    if (g.tut) { g.plan[k] = { wind: g.tut.wind, cloud: .95, ev: g.tut.cloud < 1 ? 'clouds' : null }; continue; }
    if (g.plan[k]) continue;
    const prev = g.plan[k - 1] || { w0: C.windMean, cloud: .85 };
    const base = C.windMean * (1 + .15 * Math.sin(2 * Math.PI * (k - 3) / 24));
    const w0 = clamp(prev.w0 + .2 * (base - prev.w0) + 1.1 * randn(), .5, 18);
    const cloud = clamp(prev.cloud + .3 * (.85 - prev.cloud) + .13 * randn(), .3, 1);
    const e = { wind: w0, w0, cloud, ev: null };
    const day = Math.floor((k - 6) / 24) + 1;
    const p = k < 9 ? 0 : .14 * (52 / g.D.eventGap) / Math.pow(.85, day - 1), r = Math.random();
    if (r < p * .45) { if (sunAt(k + .5) > .3) e.ev = 'clouds'; }
    else if (r < p * .72) { e.ev = 'storm'; e.wind = 27; }
    else if (r < p) { e.ev = 'calm'; e.wind = 1.5; g.plan[k + 1] = { wind: 1.5, w0, cloud, ev: 'calm', cont: true }; }
    g.plan[k] = e;
  }
}
function weatherNews(k) {
  if (G.tut) return;
  const now = G.plan[k], soon = G.plan[k + 2], at = hhmm(k + 2);
  const solar = G.units.some(u => u.type === 'solar'), wind = G.units.some(u => u.type === 'wind');
  if (soon && soon.ev && !soon.cont) {
    if (soon.ev === 'clouds' && solar) ticker(`🔮 Forecast: a cloud front at ${at}`, 'Solar output will collapse for about an hour. Have something ready.', 'info');
    if (soon.ev === 'storm' && wind) ticker(`🔮 Forecast: storm at ${at}`, 'Wind farms will shut down above 25 m/s.', 'info');
    if (soon.ev === 'calm' && wind) ticker(`🔮 Forecast: no wind from ${at}`, 'Wind output will drop to almost nothing for two hours.', 'info');
  }
  if (now && now.ev && !now.cont) {
    G.stats.events++;
    if (now.ev === 'clouds') ticker('☁️ A cloud front rolls over the solar farms', 'Solar output can collapse in seconds, and comes back just as fast.', solar ? 'bad' : 'info');
    if (now.ev === 'storm') ticker('🌪️ Storm! Wind farms shut down above 25 m/s', 'Turbines feather their blades to protect themselves.', wind ? 'bad' : 'info');
    if (now.ev === 'calm') ticker('🍃 The wind dies down', 'Wind power goes with the cube of wind speed: half the wind, an eighth of the power.', wind ? 'bad' : 'info');
  }
}
function skyIcon(k) {
  const e = G.plan[k], sn = sunAt(k + .5);
  if (e && e.ev === 'clouds') return '🌧️';
  if (sn < .05) return '🌙';
  const c = e ? e.cloud : .85;
  return c > .8 ? (sn < .3 ? '🌅' : '☀️') : c > .62 ? '🌤️' : c > .45 ? '⛅' : '☁️';
}
function renderWx() {
  const g = G, k = Math.floor(g.hour);
  if (!g.plan) ensurePlan(g.hour);
  const sunPct = Math.round(sunAt(g.hour) * g.cloud * g.cloudHit * 100);
  const wcol = v => v > 25 ? 'var(--bad)' : v < 3 ? 'var(--muted)' : v >= 12 ? 'var(--ok)' : 'var(--text)';
  let html = `<div class="now"><span>${sunAt(g.hour) < .02 ? '🌙' : '☀️'} <b>${sunPct}%</b></span><span>🌬️ <b style="color:${wcol(g.wind)}">${g.wind.toFixed(1)}</b> m/s</span></div><div class="fc">`;
  for (let i = 1; i <= 6; i++) {
    const e = g.plan[k + i]; if (!e) continue;
    const w = e.ev === 'storm' ? '🌪️' : e.ev === 'calm' ? '🍃' : '';
    html += `<div class="c"><small>${String((k + i) % 24).padStart(2, '0')}h</small><span>${skyIcon(k + i)}</span><b style="color:${wcol(e.wind)}">${w}${Math.round(e.wind)}</b></div>`;
  }
  $('wx').innerHTML = html + '</div>';
}

// ---------------------------------------------------------------- events
const EVENTS = [
  { id: 'trip', w: () => 3, ok: () => syncCandidates().length > 0, run() {
      const c = syncCandidates(), u = pick(c), lost = Math.round(u.P);
      u.engaged = false; u.level = 0; u.droopP = 0; u.repair = 30;
      ticker(`⚠️ ${u.T.emoji} ${u.T.name} ${u.n} tripped! −${lost} MW in an instant`, 'Inertia slows the fall, automatic reserves catch it. Now replace the power.', 'bad');
      sfx('trip'); buzz([80, 50, 80]);
    } },
  { id: 'weather', w: () => 1, ok: () => G.demandEvT <= 0, run() {
      G.demandEv = 1.12; G.demandEvT = rand(40, 60);
      ticker(G.C.hot ? '🥵 Heatwave! Air conditioners everywhere (+12 %)' : '🥶 Cold snap! Heaters and heat pumps on full (+12 %)', 'Weather is the biggest driver of demand.', 'bad');
    } },
  { id: 'kettle', w: () => G.C.island ? 2.2 : .7, ok: () => G.kettleT <= 0 && G.kettle < .02, run() {
      G.kettleT = rand(7, 10); ticker('⚽ Half-time! Millions of kettles switch on at once', 'A real thing: grid operators watch the TV schedule for this.', 'bad');
    } },
  { id: 'loadtrip', w: () => 1.1, ok: () => G.loads.some(okTrip), run() {
      const L = pick(G.loads.filter(okTrip));
      L.off = rand(15, 25); L.P = 0;
      ticker(`🔌 ${L.D.emoji} ${L.D.name} suddenly disconnects (−${Math.round(L.base)} MW of demand)`, 'Losing load makes the wheel race. Too fast is as dangerous as too slow.', 'bad');
      sfx('trip');
    } },
  { id: 'fuel', w: () => .8, ok: () => G.fuelT <= 0 && G.units.some(u => u.T.gas), run() {
      G.fuelMul = 2.2; G.fuelT = rand(70, 100); ticker('⛽ Gas price spike! Gas plants cost double to run', 'Fuel is most of the cost of a gas plant. Lean on hydro, nuclear, wind and sun.', 'bad');
    } },
  { id: 'inverter', w: () => 1, ok: () => G.units.some(u => (u.T.kind === 'solar' || u.T.kind === 'wind') && u.engaged && u.trip <= 0 && u.P > 10), run() {
      const c = G.units.filter(u => (u.T.kind === 'solar' || u.T.kind === 'wind') && u.engaged && u.trip <= 0 && u.P > 10);
      const hit = c.sort(() => Math.random() - .5).slice(0, Math.min(2, c.length));
      let lost = 0; for (const u of hit) { lost += u.P; u.trip = rand(14, 20); u.tripWhy = 'inverter fault'; }
      ticker(`⚡ Inverter fault! ${hit.map(u => u.T.emoji).join(' ')} drop out (−${Math.round(lost)} MW)`, 'Power electronics disconnect fast when something looks wrong. They reconnect in ~15 s.', 'bad');
      sfx('trip');
    } },
];
function syncCandidates() {
  const maxCap = G.did === 'hard' ? 999 : 100;   // only Wild mode can lose a whole nuclear plant
  const c = G.units.filter(u => u.T.kind === 'sync' && u.engaged && u.level > .6 && u.T.cap <= maxCap);
  return c.some(u => u.T.cap <= 100) && Math.random() < .8 ? c.filter(u => u.T.cap <= 100) : c;
}
const okTrip = L => L.off <= 0 && L.conn >= 1 && L.P > 25 && L.P < 95 && L.type !== 'city';
const has = k => G.units.some(u => u.T.kind === k && u.engaged);
function fireEvent() {
  const ok = EVENTS.filter(e => e.ok()); if (!ok.length) return;
  let tot = ok.reduce((s, e) => s + e.w(), 0), r = Math.random() * tot;
  for (const e of ok) { r -= e.w(); if (r <= 0) { e.run(); G.stats.events++; return; } }
}
function pickNewLoad() {
  const early = ['city', 'office', 'data', 'factory', 'ev', 'heat'], late = ['steel', 'rail', 'factory', 'ev', 'data', 'heat'];
  const w = G.day >= 2 || G.did === 'hard' ? late.concat(early) : early.concat(G.did === 'normal' ? ['rail'] : []);
  return pick(w);
}
function announceLoad() {
  if (G.loads.length >= MAX_LOADS) { G.announced = { grow: pick(G.loads) }; return; }
  const type = pickNewLoad(), mult = rand(.45, .8) * (1 + .08 * (G.day - 1));
  G.announced = { type, mult };
  const D = LOADS[type], at = hhmm(G.hour + G.nextLoad * HPS);
  ticker(`📢 New customer at ${at}: ${D.emoji} ${D.name} (about +${Math.round(D.base * mult * profile(D.prof, G.hour + G.nextLoad * HPS))} MW)`, 'Get extra power ready before it connects.', 'info');
  sfx('ping');
}
function connectLoad() {
  const a = G.announced || {}; G.announced = null;
  if (a.grow) { a.grow.grow *= 1.15; ticker(`📈 ${a.grow.D.emoji} ${a.grow.D.name} grows by 15 %`, '', 'info'); return; }
  if (!a.type) return;
  const L = addLoad(a.type, a.mult, false);
  ticker(`🔌 ${L.D.emoji} ${L.D.name} connects`, L.D.kind[0].toUpperCase() + L.D.kind.slice(1) + '.', 'info');
}

// ---------------------------------------------------------------- mission: phase out fossil fuels
const FOSSIL = { peaker: 1, ccgt: 1 }, CLEAN = { hydro: 1, nuclear: 1, solar: 1, wind: 1 };
const MISSION = [
  { id: 'build', h: 'Build a new clean plant (hydro, solar, wind or nuclear)', bonus: 20e6, test: () => G.stats.cleanBuilt > 0 },
  { id: 's50', h: 'Clean share above 50 % over the last 24 h', bonus: 40e6, test: () => G.mix.full && G.mix.share >= .5 },
  { id: 's75', h: 'Clean share above 75 % over the last 24 h', bonus: 60e6, test: () => G.mix.full && G.mix.share >= .75 },
  { id: 's90', h: 'Clean share above 90 % over the last 24 h', bonus: 80e6, test: () => G.mix.full && G.mix.share >= .9 },
  { id: 'scrap', h: 'Scrap your last fossil plant', bonus: 100e6, test: () => !G.units.some(u => FOSSIL[u.type]) },
  { id: 'free', h: 'Run 24 h without burning any gas', bonus: 0, final: true, test: () => G.mix.full && G.mix.fossil24 < .5 && !G.units.some(u => FOSSIL[u.type]) },
];
function updateMix() {
  const g = G, k = Math.floor(g.hour); let c = 0, f = 0;
  for (let i = k - 23; i <= k; i++) { const e = g.eh[i]; if (e) { c += e.c; f += e.f; } }
  g.mix.share = c + f > 0 ? c / (c + f) : 0; g.mix.fossil24 = f; g.mix.full = g.hour - 6 >= 24;
}
function checkMission() {
  const g = G; if (g.tut || g.over) return;
  updateMix();
  for (const m of MISSION) {
    if (g.ms[m.id] || !m.test()) continue;
    g.ms[m.id] = true;
    if (m.final) { missionComplete(); continue; }
    g.cash += m.bonus;
    ticker(`Mission step done: ${m.h}`, `Green subsidy: +${fmtMoney(m.bonus)}.`, 'good'); sfx('day');
  }
  const done = MISSION.filter(m => g.ms[m.id]).length, next = MISSION.find(m => !g.ms[m.id]);
  $('missionN').textContent = `MISSION ${done}/${MISSION.length}`;
  $('missionTxt').textContent = next ? `${next.h} · clean ${Math.round(g.mix.share * 100)} %${g.mix.full ? '' : ' so far'}` : `Fossil-free! Clean ${Math.round(g.mix.share * 100)} %`;
}
function missionList() {
  return MISSION.map(m => `<li class="${G.ms[m.id] ? 'ok' : ''}">${G.ms[m.id] ? '✓' : '○'} ${m.h}${m.bonus ? ` <small>+${fmtMoney(m.bonus)}</small>` : ''}</li>`).join('');
}
function missionComplete() {
  const g = G; g.won = true; g.hold = true; renderRun(); closeSheet();
  const hrs = g.hour - 6, key = `win:${g.C.id}:${g.did}`, best = store.get(key, 0), isBest = !best || hrs < best;
  if (isBest) store.set(key, hrs);
  g.endTitle = 'FOSSIL-FREE';
  sfx('day'); buzz([40, 40, 40]);
  $('overH').textContent = 'FOSSIL-FREE'; $('overH').classList.add('win');
  $('overReason').textContent = `You ran the ${g.C.name} grid for a full day without burning gas, and every fossil plant is gone. Mission complete.`;
  $('overTime').textContent = survived();
  $('overBest').textContent = isBest ? '🏆 Fastest phase-out on this grid!' : `Fastest on this grid: ${fmtHours(best)}`;
  fillOverStats();
  $('keepBtn').classList.remove('hidden'); $('againBtn').classList.add('hidden');
  $('over').classList.remove('hidden');
  requestAnimationFrame(drawOverChart);
  recap = buildRecap();
}
$('keepBtn').addEventListener('click', () => { $('over').classList.add('hidden'); ticker('Keep the grid fossil-free and stable as long as you can.', 'The days keep getting harder.', 'info'); });

// ---------------------------------------------------------------- player actions
function collect(L, quiet) {
  if (!L.bill) return 0;
  const v = L.bill; G.cash += v; L.bill = 0;
  if (!quiet) { G.floats.push({ x: L.hx, y: L.hy, txt: '+' + fmtMoney(v), t: 0 }); sfx('coin'); buzz(10); }
  return v;
}
function collectAll() { for (const L of G.loads) collect(L, true); }
function build(type) {
  if (!G || G.over) return;
  if (G.tut && !tutAllows(type)) return toast('Follow the tutorial: use the highlighted card');
  if (type === 'nuclear' && G.C.nukeLock) return toast(G.C.nukeLock);
  const T = TYPES[type], cost = T.capex;
  const count = G.units.filter(u => u.type === type).length;
  const max = type === 'hydro' ? G.C.hydroMax : T.max;
  if (G.units.length >= MAX_GENS) return toast('The wheel is full: scrap something first');
  if (count >= max) return toast(type === 'hydro' ? `No more good valleys for dams in ${G.C.name}` : `Max ${max} × ${T.name}`);
  if (!G.tut && G.cash < cost) return toast(`Need ${fmtMoney(cost)} to build ${T.name}`);
  if (!G.tut) G.cash -= cost;
  G.stats.built++; G.stats.spent += cost; if (CLEAN[type]) G.stats.cleanBuilt++;
  addUnit(type, false, false);   // new assets arrive disconnected: tap them on the wheel to connect
  toast(G.tut ? `${T.name} built (free in the tutorial) · tap it to connect` : `${T.name} built (−${fmtMoney(cost)}) · tap it to connect`);
  if (G.tut) TUT[G.tut.i].onBuild?.(type);
  sfx('build'); buzz(15);
}
function toggle(u) {
  if (!G || G.over) return;
  const T = u.T;
  if (u.repair > 0) return toast(`Under repair: ${Math.ceil(u.repair)} s`);
  if (u.scrapWhenIdle) { u.scrapWhenIdle = false; }
  if (!u.engaged && T.kind === 'sync') {
    if (!G.tut && G.cash < T.start) return toast(`Start-up costs ${fmtMoney(T.start)}`);
    if (!G.tut) G.cash -= T.start;
  }
  u.engaged = !u.engaged;
  if (u.engaged && G.tut) TUT[G.tut.i].onConnect?.(u.type);
  if (T.kind === 'sync') toast(u.engaged ? `${T.emoji} ${T.name} ${u.n} spinning up (${T.ramp} s)` : `${T.emoji} ${T.name} ${u.n} winding down`);
  else toast(`${T.emoji} ${T.name} ${u.n} ${u.engaged ? 'connected' : 'disconnected'}`);
  sfx(u.engaged ? 'on' : 'off'); buzz(12);
}
// Remove one unit of a type from its card: idle ones go first; a running plant is switched off and scrapped once it has wound down.
function removeOne(type) {
  if (!G || G.over || G.tut) return;
  const list = G.units.filter(u => u.type === type && !u.scrapWhenIdle);
  if (!list.length) return;
  const idle = list.find(u => !u.engaged && (u.T.kind !== 'sync' || u.level <= 0));
  if (idle) return scrap(idle);
  const u = list.find(u => !u.engaged) || list[list.length - 1];
  if (u.T.kind === 'sync') {
    if (u.engaged) u.engaged = false;
    u.scrapWhenIdle = true; toast(`${u.T.name} ${u.n} winding down, then scrapped`); sfx('off');
  } else scrap(u);
}
function scrap(u) {
  if (u.T.kind === 'sync' && (u.engaged || u.level > 0)) return toast('Switch it off and let it wind down first');
  const refund = Math.round(u.T.capex * .3);
  G.cash += refund; G.units.splice(G.units.indexOf(u), 1); layoutDirty = true;
  toast(`Scrapped ${u.T.name} (+${fmtMoney(refund)})`); closeSheet();
}

// ---------------------------------------------------------------- rendering: wheel
const wheel = $('wheel'), wctx = wheel.getContext('2d');
const chart = $('chart'), cctx = chart.getContext('2d');
let layoutDirty = true, hits = [], W = 0, H = 0, DPR = 1, UIK = 1;
// Desktop scale: panels grow with the window (1 at 1440×880), so big screens are filled and stay readable.
function setScale() {
  const desk = innerWidth >= 900 && innerHeight >= 560;
  UIK = desk ? clamp(Math.min(innerWidth / 1440, innerHeight / 880), 1, 2.6) : 1;
  document.documentElement.style.setProperty('--kz', UIK.toFixed(3));
}
setScale(); window.addEventListener('resize', setScale);
function fitCanvas(cv, ctx) {
  const r = cv.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(r.width * DPR)), h = Math.max(1, Math.round(r.height * DPR));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return [r.width, r.height];
}
const unitOrder = ['nuclear', 'ccgt', 'hydro', 'peaker', 'solar', 'wind', 'bess', 'flywheel'];

// Light theme colours for everything drawn on canvas.
const TH = { tire: '#2d3540', face: '#f1f3f6', faceGen: '#ffffff', spoke: '#9aa5b1', ink: '#17202b', muted: '#5d6978',
  ok: '#2b8a3e', inband: '#5c940d', warn: '#d97706', bad: '#c92a2a', cyan: '#1971c2', pink: '#e8590c', grid: '#e3e8ee' };

// A rubber disc: dark tyre, light face, spokes ("legs") that show the spin. No teeth: discs drive each other by friction.
function disc(ctx, x, y, r, tyre, ang, spokes, spokeCol, face, spokeW) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = TH.tire; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = Math.max(1, tyre * .28);
  ctx.beginPath(); ctx.arc(x, y, r - tyre * .5, -2.7, -1.1); ctx.stroke();
  const fr = r - tyre;
  ctx.beginPath(); ctx.arc(x, y, fr, 0, Math.PI * 2); ctx.fillStyle = face; ctx.fill();
  ctx.strokeStyle = spokeCol; ctx.lineWidth = spokeW; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = ang + i * 2 * Math.PI / spokes;
    ctx.moveTo(x + Math.cos(a) * fr * .2, y + Math.sin(a) * fr * .2); ctx.lineTo(x + Math.cos(a) * fr * .9, y + Math.sin(a) * fr * .9);
  }
  ctx.stroke();
}
// Visual spin speed: proportional from standstill, then exaggerated around nominal so small deviations show.
function speedVis(f, f0) { const d = f - f0; return d >= -1 ? Math.max(0, 1 + 45 * d / f0) : Math.max(0, (1 + 45 * -1 / f0) * f / (f0 - 1)); }
function statusColor(df) {
  const a = Math.abs(df);
  return a <= .05 ? TH.ok : a <= BAND ? TH.inband : a <= .6 ? TH.warn : TH.bad;
}
const MONO = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
function label(ctx, txt, x, y, size) {
  ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.lineWidth = Math.max(2, size * .28); ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y); ctx.fillStyle = TH.ink; ctx.fillText(txt, x, y);
}

// ---------------------------------------------------------------- 3D world view (loaded only when switched on)
let V3 = null, V3loading = false, V3failed = false;
function applyView() {
  if (SET.view === '3d' && !V3 && !V3loading && !V3failed) {
    V3loading = true;
    import('./view3d.js').then(m => { V3 = m.create($('wheelWrap')); V3loading = false; V3.setVisible(SET.view === '3d'); })
      .catch(() => { V3loading = false; V3failed = true; SET.view = 'wheel'; syncSwitches(); toast('3D view is not available on this device'); });
  }
  if (V3) V3.setVisible(SET.view === '3d');
}
function pill(ctx, x, y, txt, col, fs, bg) {
  ctx.font = `800 ${fs}px ${MONO}`; const w = ctx.measureText(txt).width + fs * .9, h = fs * 1.55;
  ctx.fillStyle = bg || 'rgba(255,255,255,.92)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 3) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 1);
  return w;
}
// Round frequency tag in the top-left corner of the view (used by the road and 3D views).
const freqTagR = () => clamp(Math.min(W, H) * .11, 30, 64) * (UIK > 1 ? Math.min(UIK, 1.3) : 1);
function freqTag(ctx, g, df) {
  const col = statusColor(df), r = freqTagR(), x = r + 12, y = r + 12;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill(); ctx.lineWidth = Math.max(3, r * .08); ctx.strokeStyle = col; ctx.stroke();
  if (g.alarm > 0) {
    ctx.lineWidth = Math.max(4, r * .11); ctx.strokeStyle = TH.bad;
    ctx.beginPath(); ctx.arc(x, y, r + ctx.lineWidth, -Math.PI / 2, -Math.PI / 2 + Math.min(1, g.alarm / g.D.grace) * Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(r * .5)}px ${MONO}`; ctx.fillText(fmtHz(g.f), x, y - r * .06);
  ctx.font = `700 ${Math.round(r * .22)}px ${MONO}`; ctx.fillStyle = TH.muted; ctx.fillText('Hz', x, y + r * .42);
  hits.push({ x, y, r: r + 4, hub: true });
}
function drawIso(dt, frozen) {
  [W, H] = fitCanvas(wheel, wctx);
  const ctx = wctx, g = G, df = g.f - g.f0;
  ctx.clearRect(0, 0, W, H);
  clampView();
  const P = V3.frame(dt, g, W, H, { view: VW, orbit: ORB, speed: frozen ? 0 : speedVis(g.f, g.f0), sun: sunAt(g.hour) * g.cloudHit * (.6 + .4 * g.cloud), status: statusColor(df), alarm: g.alarm > 0 && Math.abs(df) > BAND });
  lastPitch = P.pitch;
  if (!hinted && !g.tut && !g.paused) orbitHint();
  hits = [];
  const fs = clamp(P.ppu * .36, 9, 19) * (UIK > 1 ? Math.min(UIK, 1.4) : 1);
  // generators: code + output, or their state
  for (const u of g.units) {
    const p = P.units.get(u.id); if (!p) continue;
    const T = u.T, idle = T.kind === 'sync' ? (!u.engaged && u.level <= 0) : !u.engaged;
    const txt = u.repair > 0 ? `${T.code} TRIP ${Math.ceil(u.repair)}s` : u.trip > 0 ? `${T.code} OFF ${Math.ceil(u.trip)}s` : idle ? `${T.code} idle`
      : T.kind === 'sync' && u.level < 1 && u.engaged ? `${T.code} ${Math.round(u.level * 100)}%` : `${T.code} ${(T.kind === 'bess' || T.kind === 'fly') && u.P > .5 ? '+' : ''}${Math.round(u.P)}`;
    ctx.globalAlpha = idle ? .75 : 1;
    pill(ctx, p.lx, p.ly, txt, u.repair > 0 || u.trip > 0 ? TH.bad : idle ? TH.muted : T.color, fs);
    ctx.globalAlpha = 1;
    hits.push({ x: p.x, y: p.y, r: p.r, u });
  }
  // consumers: code + demand, money tags
  for (const L of g.loads) {
    const p = P.loads.get(L.id); if (!p) continue;
    const w = pill(ctx, p.lx, p.ly, `${L.D.code} ${Math.round(L.P)}`, L.off > 0 ? TH.muted : TH.bad, fs);
    L.hx = p.lx; L.hy = p.ly;
    hits.push({ x: p.x, y: p.y, r: p.r, L });
    if (!SET.auto && L.bill >= BILL_MIN) {
      const br = Math.max(11, fs * 1.05), bx = p.lx + w / 2 + br * .9, by = p.ly - br * .6, full = L.bill >= BILL_CAP - 1;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = full ? TH.warn : TH.ok; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(br * (g.C.cur === 'CHF' ? .62 : 1.05))}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.C.cur === 'CHF' ? 'CHF' : '€', bx, by + 1);
      hits.push({ x: bx, y: by, r: br + 10, bill: L });
    }
  }
  // the grid node spins in the middle; the frequency sits in a round tag in the top-left corner
  hits.push({ x: P.hub.x, y: P.hub.y, r: P.hub.r * .9, hub: true });
  freqTag(ctx, g, df);
  // tutorial highlight
  if (g.tut) tutRings(ctx);
  // collected-money floats
  g.floats = g.floats.filter(f => (f.t += Math.max(dt, 1 / 60)) < 1.4);
  for (const f of g.floats) {
    ctx.globalAlpha = 1 - f.t / 1.4; ctx.font = `800 ${Math.round(fs * 1.3)}px ${MONO}`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(f.txt, f.x, f.y - 20 - f.t * 40); ctx.fillStyle = TH.ok; ctx.fillText(f.txt, f.x, f.y - 20 - f.t * 40);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- road view
// An endless road moving at the grid's pace. Generators are wheels standing on it (a second row rides on the first)
// and keep it rolling; consumers are brake blocks underneath that drag it back.
let roadOff = 0, roadRef = 0;
function drawRoad(dt) {
  [W, H] = fitCanvas(wheel, wctx);
  const ctx = wctx, g = G, df = g.f - g.f0, spd = speedVis(g.f, g.f0);
  ctx.clearRect(0, 0, W, H);
  // layout in world units, then fit to the panel
  const gens = g.units.slice().sort((a, b) => unitOrder.indexOf(a.type) - unitOrder.indexOf(b.type) || a.id - b.id);
  const nG = Math.max(4, gens.length), nL = Math.max(4, g.loads.length);
  const SG = 64, SL = 52, RG = 25, RT = 40;                   // wheel slot, load slot, wheel radius, road thickness
  const ww = Math.max(nG * SG, nL * SL) + 30;                  // the road is as long as the fleet needs
  const above = 2 * RG + RG * .45 + 12, below = RT + 14 + 8 + 42 + 12, wh = above + below;
  const tagH = 2 * freqTagR() + 18;                            // keep the corner frequency tag clear at 1x
  // 1x = a comfortable, tappable size set by the panel height; the road scrolls sideways when it's longer than the screen
  const k = Math.min((H - tagH) / wh, 1.7 * Math.max(1, UIK));
  RD = { k, cw: ww * k, ch: wh * k, top: tagH, zmin: Math.min(1, Math.max(.2, (W - 16) / (ww * k))) };
  const roadY = above;                                          // world units, content top = 0
  clampView();
  const s = VW.z * k;
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * VW.x, DPR * VW.y);
  hits = [];
  // road: endless, so draw it across the whole visible width
  const x0 = -VW.x / s - 20, x1 = (W - VW.x) / s + 20;
  roadOff += dt * 60 * spd; roadRef += dt * 60;
  ctx.fillStyle = '#3a4350'; ctx.fillRect(x0, roadY, x1 - x0, RT);
  ctx.fillStyle = '#2d3540'; ctx.fillRect(x0, roadY, x1 - x0, 3); ctx.fillRect(x0, roadY + RT - 3, x1 - x0, 3);
  // road sections (joints) and the dashed centre line move with the road
  const SEC = 120, sec0 = Math.floor((x0 + roadOff) / SEC) * SEC - roadOff;
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  for (let x = sec0; x < x1; x += SEC) ctx.fillRect(x, roadY + 3, 2, RT - 6);
  ctx.fillStyle = '#f1f3f5';
  const D = 40, d0 = Math.floor((x0 + roadOff) / D) * D - roadOff;
  for (let x = d0; x < x1; x += D) ctx.fillRect(x + 6, roadY + RT / 2 - 1.5, 20, 3);
  // reference marks at exactly nominal pace along the lower edge: if the dashes drift against them, the grid is off speed
  ctx.fillStyle = 'rgba(255,212,59,.9)';
  const r0 = Math.floor((x0 + roadRef) / D) * D - roadRef;
  for (let x = r0; x < x1; x += D) { ctx.beginPath(); ctx.moveTo(x, roadY + RT - 3); ctx.lineTo(x + 4, roadY + RT - 9); ctx.lineTo(x + 8, roadY + RT - 3); ctx.fill(); }
  // generators: wheels on top
  const roll = roadOff / RG;   // wheel angle so the rim moves with the road
  gens.forEach((u, i) => {
    const T = u.T;
    const on = T.kind === 'sync' ? (u.engaged || u.level > 0) : u.engaged;
    let x = (i + .5) * SG + 15, y = roadY - RG;                 // every wheel stands on the road
    if (!on) y -= RG * .45;                                     // idle: lifted off the road
    const live = T.kind === 'sync' ? u.level > 0 : (u.engaged && u.trip <= 0);
    u.rphi = live ? roll : (u.rphi || 0);
    ctx.globalAlpha = on ? 1 : .45;
    const frac = clamp(Math.abs(u.P) / T.cap, 0, 1);
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(27,21,53,.08)'; ctx.beginPath(); ctx.arc(x, y, RG + 4, 0, Math.PI * 2); ctx.stroke();
    if (frac > .01) { ctx.strokeStyle = u.P >= 0 ? TH.ok : TH.cyan; ctx.beginPath(); ctx.arc(x, y, RG + 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); }
    disc(ctx, x, y, RG, RG * .2, u.rphi, T.kind === 'fly' ? 6 : 4, T.color, TH.faceGen, 2.6);
    if (T.kind === 'bess' || T.kind === 'fly') {
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(27,21,53,.1)'; ctx.beginPath(); ctx.arc(x, y, RG * .66, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = u.soc < .15 ? TH.bad : TH.ok; ctx.beginPath(); ctx.arc(x, y, RG * .66, Math.PI / 2, Math.PI / 2 + u.soc * Math.PI * 2); ctx.stroke();
    }
    if (T.kind === 'sync' && u.level > 0 && u.level < 1) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = TH.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, RG * .66, -Math.PI / 2, -Math.PI / 2 + u.level * Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${T.code.length > 3 ? 8.5 : 10.5}px ${MONO}`; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
    ctx.strokeText(T.code, x, y - 4); ctx.fillStyle = T.color; ctx.fillText(T.code, x, y - 4);
    label(ctx, Math.round(u.P), x, y + 8, 9);
    ctx.globalAlpha = 1;
    if (u.repair > 0 || u.trip > 0) {
      ctx.strokeStyle = TH.bad; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 12, y - 12); ctx.lineTo(x + 12, y + 12); ctx.moveTo(x + 12, y - 12); ctx.lineTo(x - 12, y + 12); ctx.stroke();
    }
    hits.push({ x, y, r: RG + 6, u });
  });
  // consumers: brake blocks under the road
  const lw = SL - 10, lh = 42;
  g.loads.forEach((L, i) => {
    const x = (i + .5) * (ww - 30) / nL + 15, heat = L.off > 0 ? 0 : clamp(L.P / (L.base * 1.4 + 1), 0, 1);
    const shoeY = roadY + RT, y = shoeY + 14 + (L.off > 0 ? 8 : 0);
    // brake shoe pressing the underside of the road
    ctx.fillStyle = L.off > 0 ? '#c9ced6' : `rgb(${Math.round(150 + 90 * heat)}, ${Math.round(70 - 30 * heat)}, ${Math.round(70 - 30 * heat)})`;
    ctx.fillRect(x - lw * .35, shoeY + (L.off > 0 ? 6 : 0), lw * .7, 6);
    ctx.fillStyle = '#8d97a3'; ctx.fillRect(x - 2, shoeY + 6, 4, y - shoeY - 6);
    ctx.fillStyle = L.off > 0 ? '#e4e2ec' : `rgb(255, ${Math.round(236 - 110 * heat)}, ${Math.round(240 - 100 * heat)})`;
    ctx.strokeStyle = L.off > 0 ? '#aab4c0' : TH.bad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - lw / 2, y, lw, lh, 4) : ctx.rect(x - lw / 2, y, lw, lh); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = TH.bad;
    ctx.font = `800 ${L.D.code.length > 3 ? 9 : 11}px ${MONO}`; ctx.fillText(L.D.code, x, y + 13);
    label(ctx, Math.round(L.P), x, y + 29, 9.5);
    L.hx = x; L.hy = y;
    hits.push({ x, y: y + lh / 2, r: lw * .6, L });
    if (!SET.auto && L.bill >= BILL_MIN) {
      const br = 10, bx = x + lw / 2 - 2, by = y + 2, full = L.bill >= BILL_CAP - 1;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = full ? TH.warn : TH.ok; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${g.C.cur === 'CHF' ? 6.5 : 11}px ${MONO}`; ctx.fillText(g.C.cur === 'CHF' ? 'CHF' : '€', bx, by + 1);
      hits.push({ x: bx, y: by, r: br + 8, bill: L });
    }
  });
  if (g.tut) tutRings(ctx);
  g.floats = g.floats.filter(f => (f.t += Math.max(dt, 1 / 60)) < 1.4);
  for (const f of g.floats) {
    ctx.globalAlpha = 1 - f.t / 1.4; ctx.font = `800 12px ${MONO}`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(f.txt, f.x, f.y - 14 - f.t * 30); ctx.fillStyle = TH.ok; ctx.fillText(f.txt, f.x, f.y - 14 - f.t * 30);
  }
  ctx.globalAlpha = 1;
  // world hit circles -> screen
  for (const h of hits) { h.x = h.x * s + VW.x; h.y = h.y * s + VW.y; h.r *= s; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // tutorial: glide the road to the highlighted item if it's off screen
  if (g.tut && !press && !pinch) {
    const hl = TUT[g.tut.i].hl, t = hl && hits.find(h => (hl.unit && h.u && h.u.type === hl.unit) || (hl.load && h.L && h.L.type === hl.load));
    if (t && (t.x < t.r + 8 || t.x > W - t.r - 8)) { VW.x += (W / 2 - t.x) * .12; clampView(); }
  }
  // scroll bar: where you are along the road
  const cw = RD.cw * VW.z;
  if (cw > W + 1) {
    const bw = W - 24, kx = bw / cw, by = H - 7;
    ctx.fillStyle = 'rgba(31,42,55,.12)'; ctx.fillRect(12, by, bw, 4);
    ctx.fillStyle = 'rgba(31,42,55,.55)'; ctx.fillRect(12 + -VW.x * kx, by, Math.max(18, W * kx), 4);
    ctx.font = `700 ${11 * Math.min(UIK, 1.3)}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(31,42,55,.45)';
    if (VW.x < -2) { ctx.textAlign = 'left'; ctx.fillText('◀', 6, by - 12); }
    if (VW.x > W - cw + 2) { ctx.textAlign = 'right'; ctx.fillText('▶', W - 6, by - 12); }
  }
  freqTag(ctx, g, df);
}

function drawWheel(dt, dtReal) {
  if (SET.view === '3d' && V3) return drawIso(dtReal ?? dt, dt === 0);
  if (SET.view === 'road') return drawRoad(dt);
  [W, H] = fitCanvas(wheel, wctx);
  const ctx = wctx, g = G, df = g.f - g.f0;
  ctx.clearRect(0, 0, W, H);
  clampView(); ctx.setTransform(DPR * VW.z, 0, 0, DPR * VW.z, DPR * VW.x, DPR * VW.y);
  drawWheelBase(dt, ctx, g, df);
  for (const h of hits) { h.x = h.x * VW.z + VW.x; h.y = h.y * VW.z + VW.y; h.r *= VW.z; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function drawWheelBase(dt, ctx, g, df) {
  const Mx = Math.min(W, H) / 2 - 6;
  const cx = W / 2, cy = H / 2;
  const gens = g.units.slice().sort((a, b) => unitOrder.indexOf(a.type) - unitOrder.indexOf(b.type) || a.id - b.id);
  const n = Math.max(10, gens.length);
  const grMax = clamp(Mx * .15, 14, 96);
  let gr = grMax;
  for (let k = 0; k < 4; k++) gr = Math.min(grMax, (Mx - gr * 1.3) * Math.sin(Math.PI / n) * .95);
  const ring = Mx - gr * 1.3, R = ring - gr;

  // spin: exaggerate the deviation so you can see it
  const w0 = 2 * Math.PI * .3, speed = speedVis(g.f, g.f0);
  g.theta += dt * w0 * speed;
  g.thetaRef += dt * w0;
  hits = [];

  // ---- generators: small rubber discs pressing on the big one from outside
  gens.forEach((u, i) => {
    const T = u.T, a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(gens.length, 1) + (gens.length % 2 ? 0 : Math.PI / gens.length);
    const on = T.kind === 'sync' ? (u.engaged || u.level > 0) : u.engaged;
    const out = on ? 0 : gr * .45;
    const x = cx + (ring + out) * Math.cos(a), y = cy + (ring + out) * Math.sin(a);
    const live = T.kind === 'sync' ? (u.level > 0 || (g.tut && !g.loads.length && u.engaged && g.f > .5)) : (u.engaged && u.trip <= 0 && (T.kind === 'bess' || T.kind === 'fly' || u.P > .5));
    if (live && (T.kind === 'sync' || T.kind === 'fly')) u.phi -= dt * w0 * speed * (R / gr) * (T.kind === 'sync' && g.loads.length ? Math.max(.15, u.level) : 1);
    else if (live) u.phi -= dt * (T.kind === 'wind' ? 2 + u.P / T.cap * 6 : 1 + u.P / T.cap * 3) * (T.kind === 'bess' ? Math.sign(u.P || 1) : 1);
    ctx.globalAlpha = on ? 1 : .42;
    // output arc
    const frac = clamp(Math.abs(u.P) / T.cap, 0, 1), aw = Math.max(3, gr * .12);
    ctx.lineWidth = aw; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(27,21,53,.08)'; ctx.beginPath(); ctx.arc(x, y, gr + aw, 0, Math.PI * 2); ctx.stroke();
    if (frac > .01) { ctx.strokeStyle = u.P >= 0 ? TH.ok : TH.cyan; ctx.beginPath(); ctx.arc(x, y, gr + aw, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); }
    disc(ctx, x, y, gr, gr * .2, u.phi, T.kind === 'wind' ? 3 : T.kind === 'fly' ? 6 : 4, T.color, TH.faceGen, Math.max(2.5, gr * .11));
    ctx.lineWidth = Math.max(1.5, gr * .06); ctx.strokeStyle = T.color; ctx.beginPath(); ctx.arc(x, y, gr * .8, 0, Math.PI * 2); ctx.stroke();
    if (T.kind === 'bess' || T.kind === 'fly') { // state of charge
      ctx.lineWidth = Math.max(3, gr * .1); ctx.strokeStyle = 'rgba(27,21,53,.1)';
      ctx.beginPath(); ctx.arc(x, y, gr * .66, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = u.soc < .15 ? TH.bad : TH.ok;
      ctx.beginPath(); ctx.arc(x, y, gr * .66, Math.PI / 2, Math.PI / 2 + u.soc * Math.PI * 2); ctx.stroke();
    }
    if (T.kind === 'sync' && u.level > 0 && u.level < 1) { // spin-up progress
      ctx.setLineDash([3, 3]); ctx.strokeStyle = TH.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, gr * .66, -Math.PI / 2, -Math.PI / 2 + u.level * Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(gr * (T.code.length > 3 ? .34 : .42))}px ${MONO}`;
    ctx.lineWidth = Math.max(3, gr * .14); ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.strokeText(T.code, x, y - (gr >= 18 ? gr * .16 : 0));
    ctx.fillStyle = T.color; ctx.fillText(T.code, x, y - (gr >= 18 ? gr * .16 : 0));
    if (gr >= 18) label(ctx, Math.round(u.P), x, y + gr * .42, Math.round(gr * (gr > 30 ? .28 : .34)));
    ctx.globalAlpha = 1;
    if (u.repair > 0 || u.trip > 0) {
      ctx.strokeStyle = TH.bad; ctx.lineWidth = Math.max(3, gr * .1);
      ctx.beginPath(); ctx.moveTo(x - gr * .5, y - gr * .5); ctx.lineTo(x + gr * .5, y + gr * .5); ctx.moveTo(x + gr * .5, y - gr * .5); ctx.lineTo(x - gr * .5, y + gr * .5); ctx.stroke();
    }
    hits.push({ x, y, r: gr + 8, u });
  });

  // ---- the big rubber wheel
  const tyre = Math.max(8, R * .085);
  disc(ctx, cx, cy, R, tyre, g.theta, 6, TH.spoke, TH.face, Math.max(4, R * .04));
  // marker on the tyre, and a reference arrow turning at exactly nominal speed: the gap shows the phase drift
  ctx.fillStyle = TH.pink; ctx.beginPath(); ctx.arc(cx + Math.cos(g.theta) * (R - tyre / 2), cy + Math.sin(g.theta) * (R - tyre / 2), tyre * .36, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(g.thetaRef);
  const ar = R - tyre - 3, as = Math.max(6, R * .045);
  ctx.fillStyle = TH.ink; ctx.beginPath(); ctx.moveTo(ar, 0); ctx.lineTo(ar - as * 1.8, -as); ctx.lineTo(ar - as * 1.8, as); ctx.closePath(); ctx.fill();
  ctx.restore();

  // ---- consumers: brake pads pressing the tyre from inside
  const nl = g.loads.length, rIn = R * .64;
  const lr = Math.min(R * .15, nl ? rIn * Math.sin(Math.PI / Math.max(nl, 3)) * .82 : 99);
  g.loads.forEach((L, i) => {
    const a = Math.PI / 2 + (i - (nl - 1) / 2) * (2 * Math.PI / Math.max(nl, 1));
    const x = cx + rIn * Math.cos(a), y = cy + rIn * Math.sin(a);
    const heat = L.off > 0 ? 0 : clamp(L.P / (L.base * 1.4 + 1), 0, 1);
    const px = cx + (R - tyre - 2) * Math.cos(a), py = cy + (R - tyre - 2) * Math.sin(a);
    ctx.strokeStyle = `rgba(224, 35, 78, ${.25 + .7 * heat})`; ctx.lineWidth = Math.max(3, lr * (.18 + .3 * heat)); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * lr, y + Math.sin(a) * lr); ctx.lineTo(px, py); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, lr, 0, Math.PI * 2);
    ctx.fillStyle = L.off > 0 ? '#e4e2ec' : `rgb(255, ${Math.round(236 - 110 * heat)}, ${Math.round(240 - 100 * heat)})`; ctx.fill();
    ctx.lineWidth = Math.max(2, lr * .08); ctx.strokeStyle = L.off > 0 ? '#aaa6bd' : TH.bad; ctx.stroke();
    ctx.globalAlpha = L.off > 0 ? .4 : 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(lr * (L.D.code.length > 3 ? .38 : .46))}px ${MONO}`; ctx.fillStyle = TH.bad;
    ctx.fillText(L.D.code, x, y - (lr >= 17 ? lr * .16 : 0));
    if (lr >= 17) label(ctx, Math.round(L.P), x, y + lr * .52, Math.round(lr * .4));
    ctx.globalAlpha = 1;
    L.hx = x; L.hy = y;
    hits.push({ x, y, r: lr + 6, L });
    if (!SET.auto && L.bill >= BILL_MIN) { // money tag: tap to collect
      const br = Math.max(10, lr * .5), bx = x + lr * .78, by = y - lr * .78, full = L.bill >= BILL_CAP - 1;
      const k = .5 + .5 * Math.sin(performance.now() / 180);
      ctx.beginPath(); ctx.arc(bx, by, br + (full ? 2 * k : 0), 0, Math.PI * 2);
      ctx.fillStyle = full ? TH.warn : TH.ok; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(br * (g.C.cur === 'CHF' ? .62 : 1.05))}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.C.cur === 'CHF' ? 'CHF' : '€', bx, by + 1);
      hits.push({ x: bx, y: by, r: br + 10, bill: L });
    }
  });

  // ---- hub: frequency readout + alarm ring
  const hr = R * .34, col = statusColor(df);
  ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = Math.max(3, hr * .06); ctx.strokeStyle = col; ctx.stroke();
  if (g.alarm > 0) {
    ctx.lineWidth = Math.max(5, hr * .09); ctx.strokeStyle = TH.bad;
    ctx.beginPath(); ctx.arc(cx, cy, hr + ctx.lineWidth, -Math.PI / 2, -Math.PI / 2 + (g.alarm / g.D.grace) * Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(hr * .46)}px ${MONO}`;
  ctx.fillText(fmtHz(g.f), cx, cy - hr * .08);
  ctx.font = `700 ${Math.round(hr * .2)}px system-ui, sans-serif`; ctx.fillStyle = TH.muted;
  ctx.fillText('Hz', cx, cy + hr * .38);
  hits.push({ x: cx, y: cy, r: hr, hub: true });
  if (g.tut) tutRings(ctx);
  // collected-money floats
  g.floats = g.floats.filter(f => (f.t += Math.max(dt, 1 / 60)) < 1.4);
  for (const f of g.floats) {
    ctx.globalAlpha = 1 - f.t / 1.4; ctx.font = `800 ${Math.max(13, Math.round(R * .07))}px ${MONO}`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(f.txt, f.x, f.y - 20 - f.t * 40); ctx.fillStyle = TH.ok; ctx.fillText(f.txt, f.x, f.y - 20 - f.t * 40);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- rendering: chart
function drawFreqChart(ctx, w, h, data, f0, opts = {}) {
  const pad = opts.pad || { l: 38, r: 8, t: 16, b: 8 };
  let span = .6;
  for (const v of data) { const d = Math.abs((Array.isArray(v) ? (Math.abs(v[0] - f0) > Math.abs(v[1] - f0) ? v[0] : v[1]) : v) - f0); if (d > span - .05) span = Math.min(1.15, Math.max(span, d + .1)); }
  const x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = h - pad.b;
  const Y = f => clamp(y0 + (y1 - y0) * (.5 - (f - f0) / (2 * span)), y0, y1);
  // grid
  ctx.lineWidth = 1; ctx.strokeStyle = TH.grid; ctx.beginPath();
  for (let v = -Math.floor(span * 10) / 10; v <= span + 1e-9; v += .1) { const y = Math.round(Y(f0 + v)) + .5; ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  if (opts.slots) for (let k = 0; k <= 6; k++) { const x = Math.round(x0 + (x1 - x0) * k / 6) + .5; ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  ctx.stroke();
  // band
  ctx.fillStyle = 'rgba(43, 138, 62, .08)'; ctx.fillRect(x0, Y(f0 + BAND), x1 - x0, Y(f0 - BAND) - Y(f0 + BAND));
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(43, 138, 62, .6)';
  ctx.beginPath(); ctx.moveTo(x0, Y(f0 + BAND)); ctx.lineTo(x1, Y(f0 + BAND)); ctx.moveTo(x0, Y(f0 - BAND)); ctx.lineTo(x1, Y(f0 - BAND)); ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(23,32,43,.45)';
  ctx.beginPath(); ctx.moveTo(x0, Y(f0)); ctx.lineTo(x1, Y(f0)); ctx.stroke(); ctx.setLineDash([]);
  if (span > LIMIT - .1) {
    ctx.strokeStyle = 'rgba(201, 42, 42, .8)';
    ctx.beginPath(); ctx.moveTo(x0, Y(f0 - LIMIT)); ctx.lineTo(x1, Y(f0 - LIMIT)); ctx.moveTo(x0, Y(f0 + LIMIT)); ctx.lineTo(x1, Y(f0 + LIMIT)); ctx.stroke();
  }
  const fs = opts.font || 10;
  ctx.font = `600 ${fs}px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const roomy = Y(f0) - Y(f0 + BAND) > fs * 1.15;
  ctx.fillStyle = TH.ok; ctx.fillText((f0 + BAND).toFixed(1), x0 - 5, Y(f0 + BAND) - (roomy ? 0 : fs * .35)); ctx.fillText((f0 - BAND).toFixed(1), x0 - 5, Y(f0 - BAND) + (roomy ? 0 : fs * .35));
  if (roomy) { ctx.fillStyle = TH.muted; ctx.fillText(f0.toFixed(1), x0 - 5, Y(f0)); }
  if (span > LIMIT - .1) { ctx.fillStyle = TH.bad; ctx.fillText((f0 - LIMIT).toFixed(0), x0 - 5, Y(f0 - LIMIT)); ctx.fillText((f0 + LIMIT).toFixed(0), x0 - 5, Y(f0 + LIMIT)); }
  // line
  const N = opts.slots || data.length; if (data.length < 2) return;
  const X = i => x1 - (x1 - x0) * (data.length - 1 - i) / Math.max(1, N - 1);
  if (Array.isArray(data[0])) { // min / max envelope
    ctx.fillStyle = 'rgba(25, 113, 194, .22)'; ctx.beginPath();
    data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v[1])) : ctx.moveTo(X(i), Y(v[1])));
    for (let i = data.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(data[i][0]));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = TH.cyan; ctx.lineWidth = opts.lw || 1.5; ctx.beginPath();
    data.forEach((v, i) => { const m = (v[0] + v[1]) / 2; i ? ctx.lineTo(X(i), Y(m)) : ctx.moveTo(X(i), Y(m)); }); ctx.stroke();
    return;
  }
  ctx.lineWidth = opts.lw || 2; ctx.lineJoin = 'round';
  let cur = null;
  for (let i = 1; i < data.length; i++) {
    const c = Math.abs(data[i] - f0) > BAND ? TH.bad : TH.cyan;
    if (c !== cur) { if (cur) ctx.stroke(); ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(X(i - 1), Y(data[i - 1])); cur = c; }
    ctx.lineTo(X(i), Y(data[i]));
  }
  ctx.stroke();
  const last = data[data.length - 1];
  ctx.fillStyle = Math.abs(last - f0) > BAND ? TH.bad : TH.cyan;
  ctx.beginPath(); ctx.arc(X(data.length - 1), Y(last), 3, 0, Math.PI * 2); ctx.fill();
}
function drawChart() {
  const [w, h] = fitCanvas(chart, cctx), big = h > 150, k = big ? UIK : 1;
  cctx.clearRect(0, 0, w, h);
  drawFreqChart(cctx, w, h, G.hist, G.f0, { slots: 900, font: (big ? 13 : 10) * k, lw: (big ? 2.5 : 2) * k, pad: { l: (big ? 50 : 38) * k, r: 10 * k, t: (big ? 28 : 16) * k, b: 10 * k } });
  cctx.font = `700 ${(big ? 12.5 : 9.5) * k}px ${MONO}`; cctx.textAlign = 'left'; cctx.textBaseline = 'top'; cctx.fillStyle = TH.muted;
  const rocof = G.hist.length > 10 ? (G.hist[G.hist.length - 1] - G.hist[G.hist.length - 11]) : 0;
  cctx.fillText(`FREQUENCY [Hz] · 90 s · ROCOF ${rocof >= 0 ? '+' : '−'}${Math.abs(rocof).toFixed(2)} Hz/s`, (big ? 52 : 40) * k, (big ? 8 : 3) * k);
}
// ---------------------------------------------------------------- HUD, dock, mix
function buildDock() {
  const dock = $('dock'); dock.innerHTML = '';
  for (const type of G.C.types) {
    const T = TYPES[type], b = document.createElement('div');
    b.className = 'card'; b.dataset.t = type; b.style.setProperty('--c', T.color);
    const sub = T.kind === 'bess' ? `±${T.cap} MW · ${T.energy / T.cap} h` : T.kind === 'fly' ? `±${T.cap} MW · ${Math.round(T.energy / T.cap * 60)} min` : T.kind === 'sync' ? `${T.cap} MW` : `${T.cap} MW peak`;
    b.innerHTML = `<span class="nm">${T.name}</span><span class="sb">${sub}</span><span class="x">upkeep ${fmtMoney(T.maint)}/yr</span><span class="p">${fmtMoney(T.capex)}</span>
      <div class="pm"><button class="minus" aria-label="Remove one ${T.name}">−</button><span class="n">0</span><button class="plus" aria-label="Build a ${T.name}">+</button></div>`;
    b.title = `${T.name}: ${T.desc}`;
    if (type === 'nuclear' && G.C.nukeLock) { b.querySelector('.sb').textContent = 'not allowed'; b.querySelector('.p').textContent = 'locked'; b.addEventListener('click', e => { if (!e.target.closest('.minus')) toast(G.C.nukeLock); }); }
    b.querySelector('.plus').addEventListener('click', () => build(type));
    b.querySelector('.minus').addEventListener('click', () => removeOne(type));
    dock.appendChild(b);
  }
}
function updateHud() {
  const g = G, hh = ((g.hour % 24) + 24) % 24;
  $('clockT').textContent = `DAY ${g.day}  ${hhmm(g.hour)}`;
  $('clockS').textContent = `${g.C.name} · ${g.D.name} · ${g.f0} Hz${g.fuelMul > 1 ? ' · GAS ×2' : ''}`;
  $('cash').textContent = fmtMoney(g.cash);
  $('cash').style.color = g.cash < 0 ? '#ff8787' : '';
  const net = g.rate.rev - g.rate.fuel - g.rate.maint - g.rate.pen;
  $('net').textContent = `${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net) * DAY_S)}/yr`;
  $('net').className = net >= 0 ? 'pos' : 'neg';
  if (g.tut) { $('cash').textContent = 'UNLIMITED'; $('net').textContent = 'tutorial budget'; $('net').className = 'pos'; }
  $('supTxt').textContent = Math.round(g.supply); $('demTxt').textContent = Math.round(g.demand); $('inTxt').textContent = Math.round(g.inertia);
  // mix bar
  const by = {}; let tot = 0;
  for (const u of g.units) if (u.P > .5) { by[u.type] = (by[u.type] || 0) + u.P; tot += u.P; }
  const bar = $('mixBar'), denom = Math.max(tot, g.demand, 1);
  bar.innerHTML = unitOrder.filter(t => by[t]).map(t => `<span style="width:${(by[t] / denom * 100).toFixed(1)}%;background:${TYPES[t].color}" title="${TYPES[t].name}"></span>`).join('');
  // dock
  for (const c of $('dock').children) {
    const t = c.dataset.t, T = TYPES[t], cnt = g.units.filter(u => u.type === t).length, max = t === 'hydro' ? g.C.hydroMax : T.max;
    const locked = t === 'nuclear' && !!g.C.nukeLock;
    const canBuild = !locked && (g.tut ? tutAllows(t) : (g.cash >= T.capex && cnt < max && g.units.length < MAX_GENS));
    c.classList.toggle('lock', locked);
    c.querySelector('.plus').disabled = !canBuild; c.querySelector('.minus').disabled = !cnt || !!g.tut;
    c.classList.toggle('na', !!g.tut && !tutAllows(t));
    c.querySelector('.n').textContent = cnt;
  }
  // alarm pill
  const al = $('alarm'), df = g.f - g.f0;
  if (g.alarm > 0 && Math.abs(df) > BAND) {
    al.classList.remove('hidden');
    al.textContent = g.tut ? `${df < 0 ? 'UNDER' : 'OVER'}-FREQUENCY · a real game would black out soon` : `${df < 0 ? 'UNDER' : 'OVER'}-FREQUENCY · blackout in ${Math.max(0, g.D.grace - g.alarm).toFixed(1)} s`;
  } else al.classList.add('hidden');
  if (sheetFor) renderSheet();
  pumpTicker(false);
  renderWx();
  if (G.tut) { tutTick(); $('missionN').textContent = 'MISSION'; $('missionTxt').textContent = 'Phase out fossil fuels (starts in a real game)'; } else checkMission();
}
function hhmm(h) { h = ((h % 24) + 24) % 24; const m = Math.floor((h % 1) * 60 / 10) * 10; return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

// ---------------------------------------------------------------- ticker + toast
// One news line at a time, in a strip above the wheel. Bad news stays up longer and jumps the queue.
const tickQ = []; let tickUntil = 0, tickCur = null;
const EMO = /[\u{1F1E6}-\u{1F1FF}]|\p{Extended_Pictographic}|\uFE0F|\u20E3/gu;
const clean = t => String(t || '').replace(EMO, '').replace(/\s{2,}/g, ' ').replace(/^[\s:·-]+/, '').trim();
function ticker(msg, sub, kind) {
  const m = { msg: clean(msg), sub: clean(sub), kind: kind || '', ts: G ? hhmm(G.hour) : '' };
  if (m.kind === 'bad') { const i = tickQ.findIndex(x => x.kind !== 'bad'); i < 0 ? tickQ.push(m) : tickQ.splice(i, 0, m); } else tickQ.push(m);
  if (tickQ.length > 4) tickQ.splice(0, tickQ.length - 4);
  pumpTicker(true);
}
function pumpTicker(fresh) {
  const now = performance.now(), el = $('ticker');
  const minShow = tickQ.length ? 2600 : 0;
  if (tickQ.length && (!tickCur || now > tickUntil - (tickCur.kind === 'bad' ? 7000 : 5500) + minShow || (tickQ[0].kind === 'bad' && tickCur.kind !== 'bad'))) {
    tickCur = tickQ.shift(); tickUntil = now + (tickCur.kind === 'bad' ? 7000 : 5500);
    const tag = { bad: 'ALARM', info: 'INFO', good: 'OK' }[tickCur.kind] || 'NOTE';
    el.innerHTML = `<div class="tick ${tickCur.kind}"><span class="tg">${tag}</span><span class="ts">${tickCur.ts}</span>${tickCur.msg}${tickCur.sub ? `<i>${tickCur.sub}</i>` : ''}</div>`;
  } else if (tickCur && now > tickUntil && !fresh) { const d = el.firstChild; if (d) d.classList.add('gone'); tickCur = null; }
}
let toastT = 0;
function toast(m) {
  const t = $('toast'), ww = $('wheelWrap').getBoundingClientRect();
  t.style.top = ww.height ? `${Math.round(ww.top + 8)}px` : '';
  t.textContent = clean(m); t.classList.remove('hidden'); t.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.classList.add('hidden'), 260); }, Math.max(1700, t.textContent.length * 45)); }

// ---------------------------------------------------------------- unit / consumer sheet
let sheetFor = null;
function openSheet(x) { sheetFor = x; $('sheet').classList.remove('hidden'); renderSheet(); }
function closeSheet() { sheetFor = null; $('sheet').classList.add('hidden'); }
$('sheetX').addEventListener('click', closeSheet);
function renderSheet() {
  const x = sheetFor, body = $('sheetBody'), btns = $('sheetBtns');
  if (x.hub) {
    const df = G.f - G.f0;
    $('sheetTitle').textContent = '🎡 Grid frequency';
    body.innerHTML = `<div class="stats"><span>Frequency</span><b>${G.f.toFixed(3)} Hz</b><span>Target</span><b>${G.f0} ± ${BAND} Hz</b>
      <span>Supply − demand</span><b>${(G.supply - G.demand >= 0 ? '+' : '') + Math.round(G.supply - G.demand)} MW</b><span>Inertia</span><b>${Math.round(G.inertia)} MW·s/Hz</b></div>
      The orange dot rides on the wheel; the black arrow turns at exactly ${G.f0} Hz. When they drift apart, the grid has been running ${df < 0 ? 'slow' : 'fast'}. More inertia means the wheel changes speed more slowly.`;
    btns.innerHTML = ''; return;
  }
  if (x.L) {
    const L = x.L;
    $('sheetTitle').innerHTML = `<i class="code" style="--c:var(--bad)">${L.D.code}</i> ${L.D.name}${L.n > 1 ? ' ' + L.n : ''}`;
    body.innerHTML = `<div class="stats"><span>Demand now</span><b>${Math.round(L.P)} MW</b><span>Pays you</span><b>${fmtMoney(L.P * 8760 * TARIFF)}/yr</b>${SET.auto ? '' : `<span>Unpaid bill</span><b>${fmtMoney(L.bill || 0)}</b>`}</div>
      Behaviour: <b>${L.D.kind}</b>${LOAD_ERRATIC[L.type] ? ' (erratic)' : ''}.<br>You can't control consumers. They drag on the wheel and pay their bills.`;
    btns.innerHTML = ''; return;
  }
  const u = x.u, T = u.T;
  const st = u.repair > 0 ? `🔧 Tripped, repair in ${Math.ceil(u.repair)} s` : u.trip > 0 ? `⚡ Offline (${u.tripWhy}), back in ${Math.ceil(u.trip)} s`
    : T.kind === 'sync' ? (u.engaged ? (u.level < 1 ? `Spinning up · ${Math.round(u.level * 100)} %` : 'Running') : (u.level > 0 ? `Winding down · ${Math.round(u.level * 100)} %` : 'Idle'))
    : u.engaged ? (T.kind === 'bess' || T.kind === 'fly' ? (u.P > 1 ? 'Discharging (pushing)' : u.P < -1 ? 'Charging (braking)' : 'Standing by') : 'Connected') : 'Disconnected';
  $('sheetTitle').innerHTML = `<i class="code" style="--c:${T.color}">${T.code}</i> ${T.name} ${u.n}`;
  let rows = `<span>Status</span><b>${st}</b><span>Output</span><b>${Math.round(u.P)} / ${T.cap} MW</b>`;
  if (T.kind === 'bess' || T.kind === 'fly') rows += `<span>Charge</span><b>${Math.round(u.soc * 100)} % of ${T.energy} MWh</b>`;
  rows += `<span>Inertia</span><b>${T.inertia ? T.inertia : 'none'}</b>`;
  if (T.kind === 'sync') rows += `<span>Spin-up time</span><b>${T.ramp} s</b><span>Fuel + CO₂</span><b>${perMWh(T.fuel * (T.gas ? G.fuelMul * G.co2 : 1))}</b>`;
  rows += `<span>Upkeep</span><b>${fmtMoney(T.maint)}/yr</b><span>Build cost</span><b>${fmtMoney(T.capex)}</b>`;
  body.innerHTML = `<div class="stats">${rows}</div>${T.desc}`;
  const on = T.kind === 'sync' ? u.engaged : u.engaged;
  const lbl = T.kind === 'sync' ? (on ? '⏹ Switch off' : `▶ Switch on (${fmtMoney(T.start)})`) : (on ? '⏹ Disconnect' : '▶ Connect');
  const key = `${on}|${u.repair > 0}`;
  if (btns.dataset.key !== key + u.id) {
    btns.dataset.key = key + u.id;
    btns.innerHTML = `<button class="btn primary" id="sbT">${lbl}</button><button class="btn" id="sbS">Scrap +${fmtMoney(T.capex * .3)}</button>`;
    $('sbT').onclick = () => { toggle(u); renderSheet(); };
    $('sbS').onclick = () => scrap(u);
  }
}

// ---------------------------------------------------------------- input on the wheel / 3D world
// Tap = switch on/off or collect, long-press = details. Pinch (or mouse wheel) zooms, drag pans when zoomed.
const VW = { z: 1, x: 0, y: 0 };            // zoom and pan of the main view, in CSS px
const ZMAX = 4;
let RD = null;                               // road view: base scale and content size, set every frame
const isRoad = () => SET.view === 'road' && RD;
const is3D = () => SET.view === '3d' && V3;
const zMin = () => isRoad() ? RD.zmin : is3D() ? .5 : 1;
// 3D orbit: yaw around the grid node, pitch from low (.22) to straight down (1.5); pitch null = default for the screen shape
const ORB_YAW = Math.PI / 4, ORB = { yaw: ORB_YAW, pitch: null };
let lastPitch = .72;
const orbitMoved = () => Math.abs(ORB.yaw - ORB_YAW) > .01 || ORB.pitch !== null;
function clampView() {
  VW.z = clamp(VW.z, zMin(), ZMAX);
  if (isRoad()) {
    // the road scrolls sideways; when it's shorter than the screen it sits centred
    const cw = RD.cw * VW.z, ch = RD.ch * VW.z, room = H - RD.top;
    VW.x = cw <= W ? (W - cw) / 2 : clamp(VW.x, W - cw, 0);
    VW.y = ch <= room ? RD.top + (room - ch) / 2 : ch <= H ? clamp(VW.y, H - ch, RD.top) : clamp(VW.y, H - ch, 0);
  } else if (is3D()) {
    // free pan, but keep at least a third of the world on screen
    VW.x = clamp(VW.x, W * .35 - W * VW.z, W * .65); VW.y = clamp(VW.y, H * .35 - H * VW.z, H * .65);
  } else { VW.x = clamp(VW.x, W - W * VW.z, 0); VW.y = clamp(VW.y, H - H * VW.z, 0); }
  const zm = zMin();
  $('zoomReset').disabled = Math.abs(VW.z - 1) < .02 && (isRoad() ? VW.x >= -1 || RD.cw * VW.z <= W : !is3D() || (Math.abs(VW.x) < 1 && Math.abs(VW.y) < 1 && !orbitMoved())); $('zoomOut').disabled = VW.z < zm + .02; $('zoomIn').disabled = VW.z > ZMAX - .01;
}
const canPan = () => isRoad() ? RD.cw * VW.z > W + 1 || RD.ch * VW.z > H - RD.top + 1 : is3D() || VW.z > 1.01;
function zoomAt(mx, my, z) { const bx = (mx - VW.x) / VW.z, by = (my - VW.y) / VW.z; VW.z = clamp(z, zMin(), ZMAX); VW.x = mx - bx * VW.z; VW.y = my - by * VW.z; clampView(); }
function resetView() { VW.z = 1; VW.x = VW.y = 0; ORB.yaw = ORB_YAW; ORB.pitch = null; clampView(); }
$('zoomReset').addEventListener('click', resetView);
$('zoomIn').addEventListener('click', () => zoomAt(W / 2, H / 2, VW.z * 1.5));
$('zoomOut').addEventListener('click', () => zoomAt(W / 2, H / 2, VW.z / 1.5));
const ptrs = new Map();
let press = null, pinch = null;
const cancelPress = () => { if (press) clearTimeout(press.timer); press = null; };
const local = e => { const r = wheel.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
wheel.addEventListener('pointerdown', e => {
  audioInit();
  try { wheel.setPointerCapture(e.pointerId); } catch {}
  const { x, y } = local(e); ptrs.set(e.pointerId, { x, y });
  if (ptrs.size >= 2) { // second finger: start a pinch, forget the tap
    cancelPress();
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: VW.z, vx: VW.x, vy: VW.y };
    return;
  }
  let best = null, bd = 1e9;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y) - (h.bill ? 12 : 0); if (d < h.r && d < bd) { bd = d; best = h; } }
  press = { x, y, hit: best, long: false, vx: VW.x, vy: VW.y, pan: false, yaw: ORB.yaw, pitch: ORB.pitch ?? lastPitch,
    panBtn: e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey) };
  if (best) press.timer = setTimeout(() => { if (press && !press.pan) { press.long = true; openSheet(best); buzz(20); } }, 450);
});
wheel.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const p = local(e); ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const z = clamp(pinch.z * d / pinch.d, zMin(), ZMAX), bx = (pinch.mx - pinch.vx) / pinch.z, by = (pinch.my - pinch.vy) / pinch.z;
    VW.z = z; VW.x = mx - bx * z; VW.y = my - by * z; clampView();
    return;
  }
  if (!press) return;
  const dx = p.x - press.x, dy = p.y - press.y;
  if (!press.pan && Math.hypot(dx, dy) > 10) {
    clearTimeout(press.timer);
    if (is3D() && !press.panBtn) press.orbit = true;
    else if (canPan()) press.pan = true; else { press = null; return; }
  }
  if (press.orbit) {
    ORB.yaw = press.yaw - dx * .009;
    ORB.pitch = clamp(press.pitch + dy * .007, .22, 1.5);
    clampView();
  } else if (press.pan) { VW.x = press.vx + dx; VW.y = press.vy + dy; clampView(); }
});
function pointerEnd(e) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (!press) return; clearTimeout(press.timer);
  const h = press.hit, long = press.long, panned = press.pan || press.orbit; press = null;
  if (e.type === 'pointercancel' || !h || long || panned || !G || G.paused || G.over) return;
  audioInit();
  if (h.bill) return collect(h.bill);
  if (h.L && !SET.auto && h.L.bill >= BILL_MIN) return collect(h.L);
  if (h.u) toggle(h.u); else openSheet(h);
}
wheel.addEventListener('pointerup', pointerEnd);
wheel.addEventListener('pointercancel', pointerEnd);
wheel.addEventListener('wheel', e => {
  e.preventDefault();
  // road: sideways scroll (trackpad swipe or Shift + wheel) moves along the road; plain wheel zooms
  if (isRoad() && (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)) { VW.x -= e.deltaX || e.deltaY; clampView(); return; }
  const { x, y } = local(e); zoomAt(x, y, VW.z * Math.exp(-e.deltaY * .0015));
}, { passive: false });
wheel.addEventListener('contextmenu', e => e.preventDefault());
let hinted = false;
function orbitHint() {
  if (hinted) return; hinted = true;
  if (store.get('orbitHint', false)) return; store.set('orbitHint', true);
  toast(matchMedia('(pointer: coarse)').matches ? 'Drag to orbit · two fingers to pan and pinch to zoom · 1× resets the view' : 'Drag to orbit · right-drag or Shift-drag to pan · wheel to zoom · 1× resets the view');
}

// ---------------------------------------------------------------- loop
let last = performance.now(), hudT = 0, running = false;
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (G && !G.paused && !G.hold && !G.over) {
    let rem = dt; while (rem > 1e-6 && !G.over) { const s = Math.min(rem, 1 / 120); step(s); rem -= s; }
  }
  if (G && !$('game').classList.contains('hidden')) {
    drawWheel(G.paused || G.hold || G.over ? 0 : dt, dt); drawChart();
    hudT -= dt; if (hudT <= 0) { hudT = .12; updateHud(); }
    hum(G.f - G.f0, !G.paused && !G.hold && !G.over);
  }
  if (!$('menu').classList.contains('hidden')) drawMenuWheel(dt);
  if (!$('learn').classList.contains('hidden')) stepDemo(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- tutorial
// A guided sandbox: the clock stands still at 11:00, nothing random happens and nothing breaks.
const tu = t => G.units.find(u => u.type === t);
const tl = t => G.loads.find(L => L.type === t);
const inBand = () => Math.abs(G.f - G.f0) < BAND;
function tutLoad(type, mw, connT) { const L = addLoad(type, mw / LOADS[type].base, false); L.flat = true; L.connT = connT || 3; return L; }
function stableFor(sec) { return G.tut.sb && G.t - G.tut.sb >= sec; }
const TUT = [
  { e: '🎡', h: 'Meet the grid', hl: { hub: 1 },
    p: () => `This big rubber disc is the power grid. How fast it spins is the grid <b>frequency</b>, shown in the middle. Nothing drives it yet, so it stands still at <b>0 Hz</b>.` },
  { e: '💧', h: 'Build your first power plant', dock: ['hydro'], hl: { unit: 'hydro' }, done: () => !!tu('hydro')?.engaged,
    p: () => `Press <b>+</b> on the <b>Hydro</b> card. New assets arrive <b>disconnected</b>: a grey disc standing back from the wheel, not spinning. Then <b>tap it</b> to connect it. Its disc presses on the big wheel from outside, like a friction drive.` },
  { e: '🌀', h: 'Spinning up', hl: { hub: 1 }, done: () => Math.abs(G.f - G.f0) < .02,
    p: () => `Watch the plant accelerate the wheel up to <b>${G.f0} Hz</b>, the nominal frequency. Every generator in continental Europe turns in step at exactly this rate.` },
  { e: '🎯', h: 'Reading the wheel', dom: ['#chartWrap'], hl: { hub: 1 },
    p: () => `The <b>orange dot</b> turns with the wheel; the <b>black arrow</b> turns at exactly ${G.f0} Hz. If they drift apart, the grid has been running slow or fast. The chart shows the last 90 seconds: keep the line inside the <b>green band</b> (${G.f0 - BAND} to ${G.f0 + BAND} Hz). Tip: zoom with the <b>+ / −</b> buttons (or pinch), drag to move around, and <b>1×</b> zooms back out. Settings also has a <b>Road</b> and a <b>3D</b> view.` },
  { e: '🏘️', h: 'Your first customers', acts: [{ id: 'town', label: '🏘️ Connect a town (45 MW)', fn: () => tutLoad('city', 45) }], done: () => tl('city')?.conn >= 1,
    p: () => `Consumers are the <b>red brake pads inside</b> the wheel. Every home, motor and kettle drags on it. Connect a small town and watch the plant take the load.` },
  { e: '⚖️', h: 'Push equals drag', dom: ['#mix'], hl: { unit: 'hydro' },
    p: () => `The hydro plant ramped up with the town: the <b>green arc</b> around it is its output. Supply equals demand, so the wheel holds ${G.f0} Hz. The bar under the chart shows the power mix and the totals.` },
  { e: '🏢', h: 'Too much drag', acts: [{ id: 'office', label: '🏢 Connect offices (25 MW)', fn: () => tutLoad('office', 25) }],
    done: () => tl('office')?.conn >= 1 && G.f < G.f0 - .1,
    p: () => `Connect some offices. The hydro plant is nearly flat out, so the wheel will <b>slow down</b>. Outside the green band an alarm counts down to blackout (in the tutorial nothing breaks).` },
  { e: '🔥', h: 'Gas peaker to the rescue', dock: ['peaker'], hl: { unit: 'peaker' }, done: () => tu('peaker')?.level >= 1 && inBand(),
    p: () => `Build a <b>Gas peaker</b> with <b>+</b>, then <b>tap it</b> to connect it. An open-cycle gas turbine, basically a jet engine: full power in about <b>4 s</b>, but its fuel and CO₂ are pricey. Your emergency button.` },
  { e: '🏭', h: 'Gas CCGT: the workhorse', dock: ['ccgt'], hl: { unit: 'ccgt' }, done: () => tu('ccgt')?.level >= 1,
    onConnect: t => { if (t === 'ccgt' && !tl('data')) tutLoad('data', 85, TYPES.ccgt.ramp); },
    p: () => `A data centre wants 85 MW. Build a <b>Gas CCGT</b> and tap it to connect it (combined cycle: a gas turbine plus a steam turbine). Cheaper fuel and more spinning mass than the peaker, but it needs <b>14 s</b> to warm up: watch the dashed ring. The data centre connects as it ramps.` },
  { e: '✋', h: 'Switching plants on and off', hl: { unit: 'peaker' }, done: () => tu('peaker') && !tu('peaker').engaged && tu('peaker').level <= 0,
    p: () => `<b>Tap</b> a generator to switch it on or off. Idle ones turn grey and back off the wheel. <b>Long-press</b> one for its details. The <b>−</b> on a card removes one for good. Try it: tap the <b>gas peaker</b> to switch it off. The wheel slows a little, and the other plants push harder by themselves.` },
  { e: '⚛️', h: 'Nuclear (just a look)', dom: ['.card[data-t=nuclear]'],
    p: () => `Not for this small grid, but good to know: <b>250 MW</b>, a <b>45 s</b> spin-up, the heaviest rotor of all (most inertia), cheap fuel, no CO₂ and a huge build cost: ideal base load. Whether you may build one depends on the country. ${G.C.nukeLock ? G.C.name + ': ' + G.C.nukeLock : 'France may build new reactors.'}` },
  { e: '🌤️', h: 'Weather and forecast', dom: ['#wx'],
    p: () => `This strip shows the weather <b>now</b> (☀️ how much sun reaches the panels, 🌬️ wind speed) and the <b>forecast</b> for the next 6 hours. In a game, watch it for cloud fronts 🌧️, storms 🌪️ and calm spells 🍃: they hit solar and wind hard.` },
  { e: '☀️', h: 'Solar farm', dock: ['solar'], hl: { unit: 'solar' }, done: () => tu('solar')?.P > 20,
    onConnect: t => { if (t === 'solar' && !tl('factory')) tutLoad('factory', 50); },
    p: () => `A factory (50 MW) is coming. Build a <b>Solar farm</b> and connect it: free fuel, up to 80 MW at noon, nothing at night. It connects through an inverter, so it adds <b>no inertia</b> and can't push back on its own.` },
  { e: '☁️', h: 'A cloud passes', acts: [{ id: 'cloud', label: '☁️ Send a cloud', fn: () => { G.tut.cloud = .2; } }], done: () => G.tut.used.cloud && G.f < G.f0 - .15,
    p: () => `Send a cloud over the solar farm and watch: its output collapses within seconds and the wheel slows down. The forecast now shows rain 🌧️.` },
  { e: '🔋', h: 'BESS: the battery', dock: ['bess'], hl: { unit: 'bess' }, done: () => !!tu('bess')?.engaged && stableFor(2),
    p: () => `Build a <b>BESS</b> (50 MW / 200 MWh) and tap it to connect it. It reacts by itself in a fraction of a second: <b>discharging</b> pushes the wheel (green arc), <b>charging</b> brakes it (blue arc). The inner ring is its charge. No inertia, and it only holds so much energy.` },
  { e: '🌞', h: 'The sun is back', acts: [{ id: 'clear', label: '🌞 Clear the sky', fn: () => { G.tut.cloud = 1; } }], hl: { unit: 'bess' }, done: () => G.tut.used.clear && G.tut.t > 4,
    p: () => `Clear the sky before the battery runs empty. Solar comes back, and the battery soaks up the extra power to recharge (blue arc).` },
  { e: '🌬️', h: 'Wind farm', dock: ['wind'], hl: { unit: 'wind' }, done: () => tu('wind')?.P > 10,
    onConnect: t => { if (t === 'wind' && !tl('heat')) tutLoad('heat', 30); },
    acts: [{ id: 'gust', label: '💨 Strong wind', fn: () => { G.tut.wind = 14; }, after: () => !!tu('wind')?.engaged, again: 1 },
      { id: 'calm', label: '🍃 Calm', fn: () => { G.tut.wind = 2; }, after: () => !!tu('wind')?.engaged, again: 1 },
      { id: 'norm', label: '🌬️ Normal', fn: () => { G.tut.wind = 9; }, after: () => !!tu('wind')?.engaged, again: 1 }],
    p: () => `Heat pumps (30 MW) are waiting. Build a <b>Wind farm</b> and connect it: free fuel, no inertia. Power grows with the <b>cube</b> of wind speed (half the wind, an eighth of the power) and turbines shut down above 25 m/s. Then play with the wind.` },
  { e: '🌀', h: 'Flywheel', dock: ['flywheel'], dom: ['#mixTxt'], hl: { unit: 'flywheel' }, done: () => !!tu('flywheel')?.engaged,
    p: () => `Build a <b>Flywheel</b> and connect it: a heavy wheel on magnetic bearings. It adds real <b>inertia</b> (watch the Inertia number jump), so the grid wobbles less, and it reacts in milliseconds. It stores only a few minutes of energy.` },
  { e: '⚠️', h: 'A plant trips', hl: { unit: 'peaker' }, dock: ['hydro', 'peaker'],
    acts: [{ id: 'trip', label: '⚡ Trip the CCGT', fn: () => { const u = tu('ccgt'); if (u) { u.engaged = false; u.level = 0; u.droopP = 0; u.repair = 30; sfx('trip'); buzz([80, 50, 80]); } } }],
    done: () => G.tut.used.trip && G.units.filter(u => u.type === 'hydro' && u.engaged).length > 1 && stableFor(2),
    p: () => `Plants sometimes trip offline in an instant. Trip the CCGT and watch: inertia slows the fall, the battery and flywheel catch it, but only for a while. Replace the lost power: <b>tap the gas peaker</b> to bring it back and <b>build a second Hydro</b> plant (connect it too). In a real game, keep a few idle plants as a reserve for moments like this. (The CCGT needs 30 s of repairs.)` },
  { e: '🔌', h: 'Who are the consumers?', hl: { unit: 'ccgt' }, acts: [{ id: 'steel', label: '⚒️ Connect a steel mill (30 MW)', fn: () => tutLoad('steel', 30) }],
    done: () => tl('steel') && tu('ccgt')?.level >= 1 && stableFor(2),
    p: () => `You can't control consumers: they drag, and they pay. In a game you'll meet:<div class="cl">${Object.values(LOADS).map(D => `<span><i class="code" style="--c:var(--bad)">${D.code}</i> <b>${D.name}</b>: ${D.kind}</span>`).join('')}</div>Connect a steel mill to see an erratic one. It adds 30 MW, so balance it: as soon as the CCGT is repaired (its red ✕ disappears), <b>tap it</b> to switch it back on, then <b>tap the gas peaker</b> off.` },
  { e: '💶', h: 'Money', dom: ['#money'],
    p: () => `Top right: your cash and your net income. In this tutorial the budget is <b>unlimited</b>, so nothing here costs you anything. In a real game every plant has a real-world build cost, fuel, CO₂ and upkeep; customers pay ${perMWh(TARIFF)}; and penalties run while you're outside the band. <b>One game day books a whole year</b> of money. Tap the cash for the details.` },
  { e: '🌱', h: 'Your mission', dom: ['#mission'],
    p: () => `In a real game you start with gas plants. Your mission is to <b>phase them out</b>: build wind, solar, hydro and batteries, plus nuclear for base load where the country allows it, then switch off and scrap the gas plants. The green line under the chart tracks your progress and the <b>clean share</b> of the last 24 hours. Each step pays a green subsidy, and the CO₂ price rises every day. Run a full day with no gas and no fossil plants left, and the mission is complete.` },
  { e: '📢', h: 'In a real game', 
    p: () => `The clock runs once you press <b>▶ START</b> (and stops again with <b>⏸ PAUSE</b>): demand follows the day, with peaks in the morning and evening, and the sun sets. New customers are announced 📢 before they connect. Surprises happen: trips, storms, cold snaps, half-time kettle surges, gas price spikes. Each game day gets harder.` },
  { e: '🏁', h: "You're ready!", final: true,
    p: () => `One last thing: in a real game your budget is <b>not unlimited</b>. You start with ${fmtMoney(START_CASH)} and every plant, battery and start-up costs real money. Your income is the <b>bills your consumers pay</b>: they're collected automatically, or, if you switch <b>Auto-collect bills</b> off in the menu (☰), you must tap the green money tags on the consumers to cash in. Watch the net income, don't overbuild, and keep a reserve for surprises: below ${fmtMoney(BANKRUPT)} you're bankrupt and the game ends.<br><br>Keep the wheel at ${G.f0} Hz as long as you can. Pick a grid and a difficulty on the menu, or jump straight in.` },
];
function tutAllows(type) { return (TUT[G.tut.i].dock || []).includes(type); }
function startTutorial() {
  audioInit();
  newGame(selCountry, 'normal', true);
  ['over', 'pause', 'coach'].forEach(i => $(i).classList.add('hidden')); closeSheet();
  $('ticker').innerHTML = ''; tickQ.length = 0; tickCur = null;
  document.body.classList.add('tut');
  show('game'); buildDock(); G.hold = false; renderRun(); resetView(); tutEnter(0); updateHud();
  try { history.pushState({ g: 1 }, ''); } catch {}
  wake();
}
function endTutorial(play) {
  store.set('tutDone', true); store.set('coached', true);
  document.body.classList.remove('tut');
  if (G) G.over = true;
  $('tut').classList.add('hidden');
  if (play) startGame(); else toMenu();
}
function tutEnter(i) {
  const g = G.tut; g.i = i; g.t = 0; g.sb = 0; g.used = Object.assign({}, g.used);
  document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
  const st = TUT[i];
  for (const sel of st.dom || []) document.querySelectorAll(sel).forEach(el => el.classList.add('hl'));
  for (const t of st.dock || []) document.querySelectorAll(`.card[data-t=${t}]`).forEach((el, k) => { el.classList.add('hl'); if (!k) el.scrollIntoView({ block: 'nearest' }); });
  const el = $('tut'); el.classList.remove('hidden');
  el.innerHTML = `<div class="tbox${st.final ? ' final' : ''}"><div class="th"><span class="e">${String(i + 1).padStart(2, '0')}</span><b>${st.h}</b><small>of ${TUT.length}</small><button class="skip" id="tutSkip">Skip</button></div>
    <div class="tp">${st.p()}</div><div class="tb" id="tutBtns"></div></div>`;
  const btns = $('tutBtns');
  for (const a of st.acts || []) {
    const b = document.createElement('button'); b.className = 'btn'; b.dataset.a = a.id; b.textContent = a.label;
    b.onclick = () => { if (b.disabled) return; g.used[a.id] = true; a.fn(); audioInit(); sfx('on'); if (!a.again) b.disabled = true; tutTick(); };
    btns.appendChild(b);
  }
  if (st.final) {
    btns.insertAdjacentHTML('beforeend', `<button class="btn" id="tutMenu">🏠 Menu</button><button class="btn primary" id="tutPlay">▶ Play</button>`);
    $('tutMenu').onclick = () => endTutorial(false); $('tutPlay').onclick = () => endTutorial(true);
  } else {
    btns.insertAdjacentHTML('beforeend', `<button class="btn primary" id="tutNext">Next ▶</button>`);
    $('tutNext').onclick = () => { if (!$('tutNext').disabled) { sfx('ping'); tutEnter(i + 1); } };
  }
  $('tutSkip').onclick = () => endTutorial(false);
  tutTick();
}
function tutTick() {
  const g = G.tut, st = TUT[g.i];
  for (const a of st.acts || []) {
    const b = document.querySelector(`#tutBtns [data-a=${a.id}]`);
    if (b && a.after) b.disabled = !a.after();
    if (b && !a.again && g.used[a.id]) b.disabled = true;
  }
  const nx = $('tutNext');
  if (nx) { const done = !st.done || st.done(), ok = done || g.t > 40; nx.disabled = !ok; nx.classList.toggle('go', done && !!st.done); }
}
// Pulsing rings on the wheel around whatever the current step is about.
function tutRings(ctx) {
  const st = TUT[G.tut.i], hl = st.hl; if (!hl) return;
  const k = .5 + .5 * Math.sin(G.t * 6 + performance.now() / 160);
  ctx.strokeStyle = `rgba(255, 146, 20, ${.45 + .5 * k})`; ctx.lineWidth = 4;
  for (const h of hits) {
    if ((hl.hub && h.hub) || (hl.unit && h.u && h.u.type === hl.unit) || (hl.load && h.L && h.L.type === hl.load)) {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 4 + 4 * k, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ['menu', 'game']) $(s).classList.toggle('hidden', s !== id);
}
function startGame() {
  audioInit();
  document.body.classList.remove('tut'); $('tut').classList.add('hidden'); document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
  newGame(selCountry, selDiff);
  $('ticker').innerHTML = ''; tickQ.length = 0; tickCur = null;
  ['over', 'pause', 'coach'].forEach(i => $(i).classList.add('hidden')); closeSheet();
  show('game'); buildDock(); G.hold = true; renderRun(); resetView(); updateHud();
  try { history.pushState({ g: 1 }, ''); } catch {}
  wake();
  if (!store.get('coached', false)) coach(0);
  else ticker(`Morning in ${G.C.name}: demand is about to climb. Press ▶ START when ready.`, 'Grey discs are idle plants: tap to switch them on.', 'info');
}
function setHold(on) {
  if (!G || G.over) return;
  G.hold = on; if (!on) { last = performance.now(); wake(); audioInit(); }
  renderRun();
}
function renderRun() {
  const b = $('runBtn'), on = G && !G.hold;
  b.classList.toggle('running', !!on); b.classList.toggle('attn', !!(G && G.hold && G.t === 0 && !G.tut));
  $('runI').textContent = on ? '⏸' : '▶'; $('runT').textContent = on ? 'PAUSE' : 'START';
  $('holdTag').classList.toggle('hidden', !!on || !G);
  $('holdTag').textContent = G && G.t === 0 ? 'Clock stopped · press ▶ START when ready' : 'Paused · press ▶ START to resume';
}
$('runBtn').addEventListener('click', () => setHold(!G.hold));
function pause(on) {
  if (!G || G.over) return;
  G.paused = on; $('pause').classList.toggle('hidden', !on);
  if (on) renderEcon(); else { wake(); last = performance.now(); }
}
function renderEcon() {
  $('bankrupt').textContent = fmtMoney(BANKRUPT);
  updateMix(); $('missionList').innerHTML = missionList();
  $('co2Txt').textContent = G.co2 > 1 ? `CO₂ price: +${Math.round((G.co2 - 1) * 100)} % since day 1 (gas plants cost more every day).` : 'The CO₂ price rises every new day, so gas plants get more expensive to run.';
  const r = G.rate, net = r.rev - r.fuel - r.maint - r.pen;
  const row = (a, v, c) => `<tr><td>${a}</td><td class="${c}">${v}</td></tr>`;
  $('econ').innerHTML = row('Cash', fmtMoney(G.cash), G.cash < 0 ? 'neg' : '') +
    row(`Bills paid by consumers (${perMWh(TARIFF)})`, '+' + fmtMoney(r.rev * DAY_S) + '/yr', 'pos') + row('Fuel, CO₂ & imports', '−' + fmtMoney(r.fuel * DAY_S) + '/yr', 'neg') +
    row('Maintenance', '−' + fmtMoney(r.maint * DAY_S) + '/yr', 'neg') + row('Out-of-band penalties', '−' + fmtMoney(r.pen * DAY_S) + '/yr', r.pen > 0 ? 'neg' : '') +
    row('<b>Net</b>', `<b>${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net) * DAY_S)}/yr</b>`, net >= 0 ? 'pos' : 'neg');
}
$('pauseBtn').addEventListener('click', () => pause(true));
$('money').addEventListener('click', () => pause(true));
$('resumeBtn').addEventListener('click', () => pause(false));
$('pQuit').addEventListener('click', () => { G.over = true; $('pause').classList.add('hidden'); toMenu(); });
$('pHelp').addEventListener('click', () => { $('pause').classList.add('hidden'); coach(0); });
$('pLearn').addEventListener('click', () => openLearn());
window.addEventListener('popstate', () => { if (G && !G.over && !$('game').classList.contains('hidden')) { pause(true); try { history.pushState({ g: 1 }, ''); } catch {} } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G && !G.over && !$('game').classList.contains('hidden')) setHold(true); } else if (G && !G.paused) wake(); });
window.addEventListener('keydown', e => { if (e.key === ' ' && G && !G.over && !G.paused && !$('game').classList.contains('hidden')) { e.preventDefault(); setHold(!G.hold); } if (e.key === 'Escape' || e.key === 'p') { if (G && !G.over && !$('game').classList.contains('hidden')) pause(!G.paused); } });

function toMenu() { closeSheet(); document.body.classList.remove('tut'); $('tut').classList.add('hidden'); document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl')); show('menu'); ['over', 'pause'].forEach(i => $(i).classList.add('hidden')); renderMenu(); }

// ---- coach (first-time tutorial)
function coachSteps() {
  const f0 = G ? G.f0 : 50;
  return [
    ['', 'This wheel is the grid', `Its speed is the frequency, shown in the middle. Keep it at ${f0} Hz, inside the green band of the chart. New to this? The Tutorial on the menu walks you through every piece.`],
    ['', 'Outside: generators push', 'Tap one to switch it on or off. Grey ones are idle. They take time to spin up (nuclear takes ages). Long-press for details.'],
    ['', 'Inside: consumers drag', "Homes, offices, factories. You can't control them: some are steady, some are wild. When morning comes, demand climbs fast."],
    ['', 'Build with + and −', 'Each card at the bottom builds (+) or removes (−) a plant, wind or solar farm, battery or flywheel. New assets arrive disconnected: tap them to connect them, and keep some idle as a reserve. Consumers pay their bills to finance you.'],
    ['', 'Your mission', `Phase out the gas plants. Replace them with wind, solar, hydro and batteries, plus nuclear for base load where ${G ? G.C.name : 'the country'} allows it. The green line under the chart shows the next step and your clean share. The CO₂ price rises every day.`],
    ['', "Don't let it stop", `Outside the green band an alarm counts down to blackout. Hit ${f0 - 1} Hz and the grid sheds load instantly. The clock starts when you press ▶ START. How long can you last?`],
  ];
}
let coachI = 0;
function coach(i) {
  coachI = i; if (G) G.paused = true;
  const s = coachSteps(), c = s[i];
  $('coach').classList.remove('hidden');
  $('coachE').textContent = `STEP ${i + 1} / ${s.length}`; $('coachH').textContent = c[1]; $('coachP').textContent = c[2];
  $('coachDots').innerHTML = s.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('coachNext').textContent = i === s.length - 1 ? "Let's go" : 'Next';
}
$('coachNext').addEventListener('click', () => {
  if (coachI < coachSteps().length - 1) return coach(coachI + 1);
  $('coach').classList.add('hidden'); store.set('coached', true);
  if (G) { G.paused = false; last = performance.now(); ticker(`Morning in ${G.C.name}: demand is about to climb. Press ▶ START when ready.`, 'Grey discs are idle plants: tap to switch them on.', 'info'); }
});

// ---- game over
let recap = null;
const REASONS = {
  under: f0 => ['BLACKOUT', `The frequency crashed to ${f0 - LIMIT} Hz. Automatic load shedding cut whole regions off, and the rest followed.`],
  over: f0 => ['OVERSPEED', `The frequency shot up to ${f0 + LIMIT} Hz. Generators tripped to protect themselves and the grid collapsed.`],
  lowband: () => ['BLACKOUT', 'The wheel ran too slow for too long. Protection relays started disconnecting customers.'],
  highband: () => ['GRID TRIP', 'The wheel ran too fast for too long. Plants tripped one after another.'],
  broke: () => ['BANKRUPT', 'You ran out of money. The bank pulled the plug, and so did the plants.'],
};
function survived() { const hrs = G.hour - 6, d = Math.floor(hrs / 24), h = Math.floor(hrs % 24), m = Math.floor((hrs % 1) * 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; }
function gameOver(why) {
  if (G.over) return; G.over = true; closeSheet();
  sfx('over'); buzz([200, 80, 400]);
  const [title, text] = REASONS[why](G.f0);
  G.endTitle = title; G.endText = text;
  const hrs = G.hour - 6, key = `best:${G.C.id}:${G.did}`, best = store.get(key, 0), isBest = hrs > best;
  if (isBest) store.set(key, hrs);
  $('overH').textContent = title; $('overReason').textContent = text;
  $('overTime').textContent = survived();
  $('overBest').textContent = isBest ? '🏆 New record for this grid!' : `Best on this grid: ${fmtHours(best)}`;
  $('overH').classList.remove('win'); $('keepBtn').classList.add('hidden'); $('againBtn').classList.remove('hidden');
  fillOverStats();
  $('over').classList.remove('hidden');
  requestAnimationFrame(drawOverChart);
  recap = buildRecap();
}
function fillOverStats() {
  const s = G.stats; updateMix();
  const done = MISSION.filter(m => G.ms[m.id]).length;
  $('overStats').innerHTML = `<span>Grid</span><b>${G.C.flag} ${G.C.name} · ${G.D.name}</b><span>Mission</span><b>${done} / ${MISSION.length} steps</b>
    <span>Clean share (24 h)</span><b>${Math.round(G.mix.share * 100)} %</b><span>Peak demand</span><b>${Math.round(s.peak)} MW</b>
    <span>Lowest / highest</span><b>${fmtHz(s.minF)} / ${fmtHz(s.maxF)} Hz</b><span>Surprises survived</span><b>${s.events}</b>
    <span>Plants built</span><b>${s.built}</b><span>Cash left</span><b>${fmtMoney(G.cash)}</b>`;
}
function drawOverChart() {
  const cv = $('overChart'), ctx = cv.getContext('2d'), [w, h] = fitCanvas(cv, ctx);
  ctx.clearRect(0, 0, w, h); drawFreqChart(ctx, w, h, G.full, G.f0, { pad: { l: 34, r: 6, t: 8, b: 8 } });
}
function fmtHours(hrs) { if (!hrs) return '–'; const d = Math.floor(hrs / 24), h = Math.floor(hrs % 24), m = Math.floor((hrs % 1) * 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; }
$('againBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', toMenu);
$('oLearn').addEventListener('click', () => openLearn());

// ---- share recap
async function buildRecap() {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350;
  const c = cv.getContext('2d');
  c.fillStyle = '#e9edf2'; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = '#1f2a37'; c.fillRect(0, 0, 1080, 290);
  disc(c, 140, 150, 76, 14, .3, 6, TH.spoke, TH.face, 7);
  c.fillStyle = TH.pink; c.beginPath(); c.arc(140 + Math.cos(.3) * 69, 150 + Math.sin(.3) * 69, 6, 0, Math.PI * 2); c.fill();
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const gr = c.createLinearGradient(240, 0, 900, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#ffffff');
  c.fillStyle = gr; c.font = `800 64px ${MONO}`; c.fillText('GRID SPINNER', 240, 172);
  c.fillStyle = '#a9b6c5'; c.font = `500 32px ${MONO}`; c.fillText(`${G.C.name.toUpperCase()} · ${G.D.name} · ${G.f0} Hz`, 240, 232);
  c.textAlign = 'center';
  c.fillStyle = TH.ink; c.font = '600 40px system-ui, sans-serif'; c.fillText(G.endTitle === 'FOSSIL-FREE' ? 'I phased out fossil fuels in' : `I kept the grid at ${G.f0} Hz for`, 540, 360);
  c.fillStyle = TH.ink; c.font = `800 120px ${MONO}`; c.fillText(survived(), 540, 500);
  c.fillStyle = G.endTitle === 'FOSSIL-FREE' ? TH.ok : TH.bad; c.font = `900 44px ${MONO}`; c.fillText(G.endTitle, 540, 580);
  // chart
  c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(27,21,53,.12)'; c.lineWidth = 2;
  c.beginPath(); c.roundRect ? c.roundRect(70, 630, 940, 330, 28) : c.rect(70, 630, 940, 330); c.fill(); c.stroke();
  c.save(); c.translate(70, 630); drawFreqChart(c, 940, 330, G.full, G.f0, { pad: { l: 90, r: 24, t: 28, b: 28 }, font: 24, lw: 3 }); c.restore();
  // stats
  updateMix();
  const s = G.stats, cells = [['Clean share', `${Math.round(G.mix.share * 100)} %`], ['Mission', `${MISSION.filter(m => G.ms[m.id]).length}/${MISSION.length}`], ['Lowest', `${fmtHz(s.minF)} Hz`],
    ['Peak demand', `${Math.round(s.peak)} MW`], ['Plants built', `${s.built}`], ['Cash left', fmtMoney(G.cash)]];
  cells.forEach(([k, v], i) => {
    const x = 70 + (i % 3) * 320 + 150, y = 1040 + Math.floor(i / 3) * 120;
    c.fillStyle = TH.muted; c.font = '500 30px system-ui, sans-serif'; c.fillText(k, x, y);
    c.fillStyle = TH.ink; c.font = '800 46px system-ui, sans-serif'; c.fillText(v, x, y + 54);
  });
  c.fillStyle = TH.cyan; c.font = '600 32px system-ui, sans-serif'; c.fillText(GAME_URL.replace(/^https?:\/\//, ''), 540, 1305);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
async function share() {
  const text = G.won && G.endTitle === 'FOSSIL-FREE' ? `I phased out fossil fuels on the ${G.C.flag} ${G.C.name} grid in ${survived()} in Grid Spinner (${G.D.name}), and kept it at ${G.f0} Hz. Can you do it faster? ${GAME_URL}`
    : `I kept the ${G.C.flag} ${G.C.name} grid at ${G.f0} Hz for ${survived()} in Grid Spinner (${G.D.name}), ${Math.round(G.mix.share * 100)} % clean. Can you hold it longer? ${GAME_URL}`;
  const blob = recap ? await recap : null;
  const file = blob && new File([blob], 'grid-spinner.png', { type: 'image/png' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Grid Spinner', text, url: GAME_URL });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'grid-spinner.png'; a.click(); }
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast(GAME_URL); }
}
$('shareBtn').addEventListener('click', share);

// ---------------------------------------------------------------- menu
function renderMenu() {
  const box = $('countries');
  box.innerHTML = COUNTRIES.map(c => `<button class="country${c.id === selCountry ? ' on' : ''}" data-c="${c.id}"><span class="hz">${c.hz} Hz</span><b>${c.flag} ${c.name}</b><small>${c.tag}</small></button>`).join('');
  box.querySelectorAll('.country').forEach(b => b.addEventListener('click', () => { selCountry = b.dataset.c; store.set('country', selCountry); renderMenu(); }));
  document.querySelectorAll('#diffs button').forEach(b => { b.classList.toggle('on', b.dataset.d === selDiff); b.onclick = () => { selDiff = b.dataset.d; store.set('diff', selDiff); renderMenu(); }; });
  const C = COUNTRIES.find(c => c.id === selCountry);
  $('countryFact').textContent = C.fact;
  $('tutBtn').classList.toggle('hl', !store.get('tutDone', false));
  const best = store.get(`best:${selCountry}:${selDiff}`, 0);
  $('best').textContent = best ? `🏆 Your best on ${C.flag} ${DIFFS[selDiff].name}: ${fmtHours(best)}` : '';
}
$('playBtn').addEventListener('click', startGame);
$('learnBtn').addEventListener('click', () => openLearn());
$('tutBtn').addEventListener('click', startTutorial);
let menuA = 0;
function drawMenuWheel(dt) {
  const cv = $('menuWheel'), c = cv.getContext('2d'), s = cv.width, R = s * .3, r = 32;
  menuA += dt * 1.6;
  c.clearRect(0, 0, s, s); c.save(); c.translate(s / 2, s / 2);
  for (const t of ['nuclear', 'hydro', 'bess']) {
    const T = TYPES[t], a = { nuclear: -Math.PI / 2, hydro: Math.PI / 6, bess: Math.PI * 5 / 6 }[t], x = Math.cos(a) * (R + r), y = Math.sin(a) * (R + r);
    disc(c, x, y, r, 7, -menuA * R / r, 4, T.color, '#fff', 4);
    c.font = `700 ${T.code.length > 3 ? 12 : 14}px ${MONO}`; c.fillStyle = T.color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T.code, x, y + 1);
  }
  disc(c, 0, 0, R, 13, menuA, 6, TH.spoke, TH.face, 6);
  c.fillStyle = TH.pink; c.beginPath(); c.arc(Math.cos(menuA) * (R - 6.5), Math.sin(menuA) * (R - 6.5), 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill(); c.strokeStyle = TH.ok; c.lineWidth = 3; c.stroke();
  c.fillStyle = TH.ok; c.font = `900 15px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('50', 0, -2);
  c.font = '600 9px system-ui'; c.fillStyle = TH.muted; c.fillText('Hz', 0, 12);
  c.restore();
}

// ---------------------------------------------------------------- learn page + demo
function openLearn() {
  $('learn').classList.remove('hidden'); $('learn').scrollTop = 0;
  $('learnTypes').innerHTML = Object.values(TYPES).map(T => `<div class="t" style="--c:${T.color}"><i class="code" style="--c:${T.color}">${T.code}</i><div><b>${T.name}</b>
    <small>${T.kind === 'sync' ? `Spin-up ${T.ramp} s · inertia ${T.inertia}` : T.kind === 'fly' ? `Instant · inertia ${T.inertia}` : 'Instant · no inertia'} · ${fmtMoney(T.capex)}</small><small>${T.desc}</small></div></div>`).join('');
  demo.hist = []; demo.f = 50;
}
$('learnBack').addEventListener('click', () => $('learn').classList.add('hidden'));
const demo = { f: 50, M: 120, imb: 0, imbT: 0, hist: [], a: 0 };
$('dPush').addEventListener('click', () => { demo.imb = 30; demo.imbT = 3; sfx('on'); });
$('dDrag').addEventListener('click', () => { demo.imb = -30; demo.imbT = 3; sfx('off'); });
$('dHeavy').addEventListener('click', e => { demo.M = demo.M === 120 ? 600 : 120; e.target.textContent = demo.M === 120 ? 'Heavy wheel' : 'Light wheel'; });
function stepDemo(dt) {
  const cv = $('learnDemo'), ctx = cv.getContext('2d');
  const [w, h] = fitCanvas(cv, ctx);
  for (let k = 0; k < 4; k++) {
    const s = dt / 4;
    if (demo.imbT > 0) { demo.imbT -= s; if (demo.imbT <= 0) demo.imb = 0; }
    demo.f += (demo.imb - 150 * (demo.f - 50)) / demo.M * s;
  }
  demo.a += dt * 2 * Math.PI * .3 * Math.max(0, 1 + 45 * (demo.f - 50) / 50);
  demo.hist.push(demo.f); if (demo.hist.length > 300) demo.hist.shift();
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(h * .36, w * .17), cx = R + 22, cy = h / 2;
  const ty = demo.M > 200 ? R * .26 : R * .1;
  disc(ctx, cx, cy, R, ty, demo.a, 6, TH.spoke, TH.face, 4);
  ctx.fillStyle = TH.pink; ctx.beginPath(); ctx.arc(cx + Math.cos(demo.a) * (R - ty / 2), cy + Math.sin(demo.a) * (R - ty / 2), Math.max(3, ty * .3), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = statusColor(demo.f - 50); ctx.font = `900 15px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(demo.f.toFixed(2) + ' Hz', cx, cy + R + 8);
  if (demo.imbT > 0) { ctx.fillStyle = demo.imb > 0 ? TH.ok : TH.bad; ctx.font = '700 12px system-ui'; ctx.fillText(demo.imb > 0 ? 'more supply' : 'more demand', cx, 8); }
  ctx.save(); ctx.translate(cx + R + 22, 0);
  drawFreqChart(ctx, w - cx - R - 22, h, demo.hist, 50, { slots: 300, pad: { l: 34, r: 6, t: 10, b: 10 } });
  ctx.restore();
}

// ---------------------------------------------------------------- sound + vibration + screen
const AU = { ctx: null, muted: !SET.sound };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.type = 'sine'; o2.type = 'triangle'; g2.gain.value = .35;
    o1.connect(g); o2.connect(g2); g2.connect(g); o1.start(); o2.start();
    Object.assign(AU, { ctx, humGain: g, o1, o2 });
  } catch {}
}
function hum(df, on) {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime, f0 = G.f0;
  // transformers hum at twice the grid frequency; the pitch here exaggerates the deviation
  const base = 2 * f0 * (1 + 8 * df / f0);
  AU.o1.frequency.setTargetAtTime(base, t, .05); AU.o2.frequency.setTargetAtTime(base * 3, t, .05);
  AU.humGain.gain.setTargetAtTime(on && !AU.muted ? .05 : 0, t, .15);
  if (on && G.alarm > 0 && Math.abs(df) > BAND) { const k = Math.floor(G.t * 2); if (k !== AU.beepK) { AU.beepK = k; sfx('alarm'); } }
}
function tone(f, d, type = 'sine', v = .12, f2) {
  if (!AU.ctx || AU.muted) return;
  const t = AU.ctx.currentTime, o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(AU.ctx.destination); o.start(t); o.stop(t + d + .05);
}
function sfx(n) {
  switch (n) {
    case 'coin': tone(1200, .08, 'square', .05); setTimeout(() => tone(1800, .12, 'square', .05), 60); break;
    case 'build': tone(440, .12, 'triangle'); setTimeout(() => tone(660, .16, 'triangle'), 90); break;
    case 'on': tone(520, .1, 'triangle', .1); break;
    case 'off': tone(330, .1, 'triangle', .1); break;
    case 'trip': tone(300, .7, 'sawtooth', .12, 60); break;
    case 'alarm': tone(880, .18, 'square', .06); break;
    case 'ping': tone(990, .12, 'sine', .1); setTimeout(() => tone(1320, .14, 'sine', .08), 110); break;
    case 'day': tone(523, .2, 'sine', .1); setTimeout(() => tone(784, .3, 'sine', .1), 150); break;
    case 'over': tone(220, 1.4, 'sawtooth', .14, 40); break;
  }
}
syncSwitches();
const buzz = p => { try { if (SET.vibe) navigator.vibrate?.(p); } catch {} };
let wakeLock = null;
async function wake() { try { if (navigator.wakeLock && (!wakeLock || wakeLock.released)) wakeLock = await navigator.wakeLock.request('screen'); } catch {} }

renderMenu();
applyView();
