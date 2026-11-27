// Sidebar, cameos, map input, selection panel, EVA messages, tutorial.
'use strict';

const $ = id => document.getElementById(id);
const GM = { st: null, sel: null, ui: { mode: null, place: null, lineDrag: null, hover: null, mapArrow: null }, paused: false, playing: false, cams: {} };

// ---------- EVA: on-screen messages + voice ----------
const VOICED = { built: 'Construction complete', low: 'Low power', unit: 'Unit ready', warn: 1, trip: 1, thief: 'Intruders detected', ok: 'Power restored', obj: 'Objective complete', funds: 1, black: 'Blackout', line: 'Power line down', town: 1, cancel: 'Cancelled', hold: 'On hold', building: 'Building', sold: 'Structure sold', deny: 1, zap: 0, arrest: 1, extend: 1, fix: 0, grow: 0, day: 0, place: 0 };
const lastSaid = {};
function EVA(text, key = '', pos) {
  const box = $('eva'); if (!box) return;
  const now = performance.now();
  if (lastSaid['m' + key + text] && now - lastSaid['m' + key + text] < 2500) return;
  lastSaid['m' + key + text] = now;
  const d = document.createElement('div'); d.className = 'msg' + (/warn|trip|thief|line|black|low|deny/.test(key) ? (key === 'warn' ? ' warn' : ' bad') : ''); d.textContent = text;
  if (pos) { d.onclick = () => { centerOn(GM.st, pos.x * TS + 12, pos.y * TS + 12); }; d.style.cursor = 'pointer'; }
  box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 5200);
  const v = VOICED[key];
  if (v && (!lastSaid['v' + key] || now - lastSaid['v' + key] > 7000)) { lastSaid['v' + key] = now; speak(v === 1 ? text : v); }
  if (/warn|thief|line|trip/.test(key)) { sfx('warn'); vib([30, 40, 30]); }
}

// ---------- sidebar ----------
function buildSidebar(st) {
  const box = $('cameos'); box.innerHTML = ''; GM.cams = {};
  const portrait = matchMedia('(orientation: portrait)').matches;
  let order = [];
  if (portrait) order = ORDER_L.concat(ORDER_R);
  else for (let i = 0; i < Math.max(ORDER_L.length, ORDER_R.length); i++) { if (ORDER_L[i]) order.push(ORDER_L[i]); if (ORDER_R[i]) order.push(ORDER_R[i]); }
  for (const type of order) {
    if (!allowed(st, type)) continue;
    const el = document.createElement('div'); el.className = 'cam bevin'; el.dataset.type = type;
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; el.appendChild(c);
    const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = S[type].name.replace('Construction ', '').replace('Battery Bunker', 'Battery').replace('Nuclear Reactor', 'Nuclear').replace('Service Depot', 'Depot'); el.appendChild(lab);
    const ov = document.createElement('div'); ov.className = 'ov'; el.appendChild(ov);
    box.appendChild(el);
    const base = makeCameo(type, RD.spr, RD.houses, RD.units);
    GM.cams[type] = { el, c, x: c.getContext('2d'), ov, base, key: '' };
    let pressT = 0, longDone = false;
    el.addEventListener('pointerdown', e => { e.preventDefault(); longDone = false; clearTimeout(pressT); pressT = setTimeout(() => { longDone = true; cancelBuild(type); }, 550); });
    el.addEventListener('pointerup', e => { clearTimeout(pressT); if (!longDone) cameoTap(type); });
    el.addEventListener('pointerleave', () => clearTimeout(pressT));
    el.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(pressT); longDone = true; cancelBuild(type); });
  }
  updateSidebar(st, true);
}

function cameoState(st, type) {
  const d = S[type];
  if (!prereqOk(st, type)) return 'lock';
  if (d.line) return GM.ui.mode === 'line' ? 'active' : 'ok';
  const q = st.q[d.unit ? 'u' : 's'];
  if (q && q.type === type) return q.ready ? 'ready' : q.hold ? 'hold' : 'build';
  if (q) return 'busy';
  return 'ok';
}

function updateSidebar(st, force) {
  for (const type in GM.cams) {
    const cm = GM.cams[type], s = cameoState(st, type), q = st.q[S[type].unit ? 'u' : 's'];
    const prog = q && q.type === type ? Math.floor(q.prog * 48) : 0;
    const key = s + prog;
    if (!force && key === cm.key) continue; cm.key = key;
    const x = cm.x; x.drawImage(cm.base, 0, 0);
    if (s === 'build' || s === 'hold') {
      // clock wipe: dark overlay over the part still to build
      const a0 = -Math.PI / 2 + q.prog * Math.PI * 2;
      x.fillStyle = 'rgba(0,0,0,.62)'; x.beginPath(); x.moveTo(32, 24); x.arc(32, 24, 60, a0, Math.PI * 1.5); x.closePath(); x.fill();
    }
    if (s === 'busy') { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, 64, 48); }
    cm.el.classList.toggle('lock', s === 'lock');
    cm.ov.textContent = s === 'ready' ? 'READY' : s === 'hold' ? 'ON HOLD' : s === 'lock' ? '🔒' : s === 'active' ? 'ACTIVE' : '';
    cm.ov.style.color = s === 'ready' || s === 'active' ? '#7dff6a' : '#fff';
  }
}

function cameoTap(type) {
  const st = GM.st; if (!st || st.over) return;
  ensureAudio(); sfx('click');
  const d = S[type];
  status(`<b>${d.name}</b>${d.cost ? ' · $' + d.cost + (d.line ? '/tile' : '') : ''}${d.cap ? ' · ' + d.cap + ' MW' : ''}<br>${d.desc}`);
  if (!prereqOk(st, type)) { EVA('Requires ' + S[d.need].name + '.', 'deny'); sfx('deny'); return; }
  if (d.line) { setMode(GM.ui.mode === 'line' ? null : 'line'); return; }
  const kind = d.unit ? 'u' : 's', q = st.q[kind];
  if (!q) { st.q[kind] = { type, prog: 0, spent: 0, hold: 0, ready: 0 }; EVA(d.unit ? 'Training.' : 'Building.', 'building'); updateSidebar(st, true); return; }
  if (q.type !== type) { EVA('Unable to comply. Building in progress.', 'deny'); sfx('deny'); return; }
  if (q.ready && kind === 's') { setMode('place', type); return; }
  q.hold = q.hold ? 0 : 1; EVA(q.hold ? 'On hold.' : (d.unit ? 'Training.' : 'Building.'), q.hold ? 'hold' : 'building');
  updateSidebar(st, true);
}
function cancelBuild(type) {
  const st = GM.st; if (!st) return; const d = S[type]; const kind = d.unit ? 'u' : 's', q = st.q[kind];
  if (!q || q.type !== type) return;
  st.credits += q.spent; st.stats.spent -= q.spent; st.q[kind] = null; if (GM.ui.mode === 'place') setMode(null);
  EVA('Cancelled.', 'cancel'); sfx('sell'); vib(20); updateSidebar(st, true);
}

function setMode(mode, type) {
  const ui = GM.ui; ui.mode = mode; ui.place = mode === 'place' ? { type, at: null } : null; ui.lineDrag = null;
  if (mode && GM.sel) { GM.sel = null; showSel(); }
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('on', b.dataset.mode === mode);
  const pb = $('placeBar');
  if (mode === 'place') {
    pb.classList.remove('hidden');
    pb.innerHTML = `<span id="pbTxt">Tap the map to place ${S[type].name}</span><button class="go hidden" id="pbGo">✓ PLACE</button><button id="pbX">✗</button>`;
    $('pbGo').onclick = () => tryPlace(); $('pbX').onclick = () => setMode(null);
    // start with the ghost near the centre of the view
    const [wx, wy] = toWorld(RD.vw / 2, RD.vh / 2), fp = S[type].fp;
    ui.place.at = [Math.floor(wx / TS - fp[0] / 2 + .5), Math.floor(wy / TS - fp[1] / 2 + .5)];
    autoSpot(GM.st, ui.place);
    placeBarUpdate();
  } else if (mode === 'line') {
    pb.classList.remove('hidden'); pb.innerHTML = `<span>Drag from your base or a line to lay pylons · $${S.line.cost}/tile</span><button id="pbX">DONE</button>`; $('pbX').onclick = () => setMode(null);
  } else if (mode === 'sell' || mode === 'repair' || mode === 'power') {
    pb.classList.remove('hidden'); pb.innerHTML = `<span>${mode === 'sell' ? 'Tap a structure or line to sell it' : mode === 'repair' ? 'Tap a broken line or tripped plant' : 'Tap a plant to switch it on or off'}</span><button id="pbX">DONE</button>`; $('pbX').onclick = () => setMode(null);
  } else pb.classList.add('hidden');
  if (GM.st) updateSidebar(GM.st, true);
}
// When entering placement, nudge the ghost to the nearest valid spot so the first tap is useful.
function autoSpot(st, p) {
  const [x0, y0] = p.at; let best = null, bd = 1e9;
  for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
    const d = dx * dx + dy * dy; if (d >= bd) continue;
    if (canPlace(st, p.type, x0 + dx, y0 + dy).ok) { bd = d; best = [x0 + dx, y0 + dy]; }
  }
  if (best) { p.at = best; centerIfOff(st, best); }
}
function centerIfOff(st, [x, y]) { const wx = x * TS + 12, wy = y * TS + 12; const c = RD.cam; if (wx < c.x + 20 || wy < c.y + 30 || wx > c.x + RD.vw / c.z - 40 || wy > c.y + RD.vh / c.z - 40) centerOn(st, wx, wy); }
function placeBarUpdate() {
  const p = GM.ui.place; if (!p || !p.at) return; const r = canPlace(GM.st, p.type, p.at[0], p.at[1]);
  const go = $('pbGo'), tx = $('pbTxt'); if (!go) return;
  go.classList.toggle('hidden', !r.ok); tx.textContent = r.ok ? S[p.type].name + (S[p.type].ren === 'wind' ? ` · wind site ${Math.round(GM.st.hill[idx(GM.st, p.at[0], p.at[1])] * 100)} %` : '') : (r.why || 'Cannot deploy here');
}
function tryPlace() {
  const st = GM.st, p = GM.ui.place; if (!p || !p.at) return;
  const r = canPlace(st, p.type, p.at[0], p.at[1]);
  if (!r.ok) { EVA('Cannot deploy here.', 'deny'); sfx('deny'); return; }
  const s = addStruct(st, p.type, p.at[0], p.at[1]); st.q.s = null; st.stats.built++;
  derive(st); reveal(st); st.revDirty = 1;
  sfx('place'); vib(30);
  addFx(st, { k: 'boom', x: (s.x + S[s.type].fp[0] / 2) * TS, y: (s.y + S[s.type].fp[1] / 2) * TS, t: .35 });
  const had = GM.lastUnlock || ''; const unlocked = ORDER_L.concat(ORDER_R).filter(t => allowed(st, t) && S[t].need === p.type);
  if (unlocked.length) EVA('New construction options.', 'built');
  setMode(null); GM.sel = { kind: 's', id: s.id }; showSel();
}

function status(html) { $('status').innerHTML = html; }

// ---------- power bar + credits + HUD ----------
let shownCred = 0, credTick = 0;
function updateHud(st, dt) {
  // credits roll like an odometer
  const diff = st.credits - shownCred;
  if (Math.abs(diff) < 1) shownCred = st.credits; else shownCred += diff * Math.min(1, dt * 6) + Math.sign(diff) * Math.min(Math.abs(diff), 60 * dt);
  const cr = $('credits'); cr.textContent = '$ ' + Math.round(shownCred).toLocaleString('en-US'); cr.style.color = st.credits < 0 ? '#ff5a4a' : '';
  credTick += dt; if (diff > 2 && credTick > .09) { credTick = 0; sfx('tick'); }
  // power bar: what the joined grid can deliver now vs what it needs
  let load = 0, cap = 0, short = 0;
  for (const I of st.islands || []) { if (!I.load) continue; load += I.load; cap += I.cap || 0; short += I.short || 0; }
  const top = Math.max(60, load * 1.4, cap * 1.05);
  const pf = $('pfill'); pf.style.height = Math.min(100, cap / top * 100) + '%';
  pf.style.background = short > .01 ? '#ff2a1a' : cap < load * 1.1 ? '#ffd020' : '#3cff3c';
  $('pdem').style.bottom = Math.min(98, load / top * 100) + '%';
  $('pbar').title = `Demand ${Math.round(load)} MW · available ${Math.round(cap)} MW`;
  // clock and weather
  const w = st.weather, dome = has(st, 'dome');
  const evs = w.ev.map(e => EVENT_INFO[e.type].icon + ' ' + EVENT_INFO[e.type].name).join(' · ');
  const next = dome ? st.events.filter(e => !e.started && e.type !== 'thieves' && e.at - st.hour <= 12).sort((a, b) => a.at - b.at)[0] : null;
  const servedP = st.stats.dem > 0 ? Math.round(st.stats.served / st.stats.dem * 100) : 100;
  const hh = Math.floor(hod(st.hour)), mm = Math.floor((hod(st.hour) - hh) * 60 / 5) * 5;
  const M = mission(st), left = M.end ? Math.max(0, M.end + (st.extend || 0) - st.hour) : 0;
  const ap = Math.round(st.approval);
  $('clock').innerHTML = `<span class="k">DAY ${dayOf(st.hour)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span> · ${Math.round(w.temp)}°C · wind ${Math.round(w.wind * 100)}%` +
    `${evs ? ' · <span class="w">' + evs + '</span>' : ''}${next ? ' · <span class="w">forecast: ' + EVENT_INFO[next.type].name + ' in ' + Math.max(1, Math.round(next.at - st.hour)) + ' h</span>' : ''}<br>` +
    `served <span class="${servedP < 90 ? 'bad' : 'good'}">${servedP}%</span> · approval <span class="${ap < 40 ? 'bad' : ap > 65 ? 'good' : ''}">${ap}%</span> · load ${Math.round(load)} MW` +
    (st.flow ? ` · <span class="${st.flow.income - st.flow.cost < 0 ? 'bad' : 'good'}">${st.flow.income - st.flow.cost >= 0 ? '+' : ''}${Math.round(st.flow.income - st.flow.cost)} $/h</span>` : '') +
    (M.end ? ` · ends in ${Math.ceil(left)} h` : M.endless ? ` · day ${dayOf(st.hour)}` : '');
  $('bSpeed').textContent = SPEEDS[st.speed] + '×';
  const hh2 = $('hud').offsetHeight; if (hh2 !== updateHud.h) { updateHud.h = hh2; $('eva').style.top = (hh2 + 2) + 'px'; $('tut').style.top = matchMedia('(orientation: portrait)').matches ? '' : (hh2 + 6) + 'px'; }
}

// ---------- selection panel ----------
function showSel() {
  const st = GM.st, el = $('sel'), s = GM.sel;
  if (!s) { el.classList.add('hidden'); return; }
  let h = '', btns = [];
  if (s.kind === 's') {
    const o = st.byId[s.id]; if (!o) { GM.sel = null; return showSel(); }
    const d = S[o.type]; h = `<h4>${d.name}</h4>`;
    const I = islandOf(st, o);
    if (THERMAL(o.type)) {
      const stt = o.st === 'run' ? `RUNNING ${Math.round(o.out)} / ${d.cap} MW` : o.st === 'start' ? `STARTING · ${o.tmr.toFixed(1)} h` : o.st === 'trip' ? `<span style="color:#ff6a50">TRIPPED · repair ${o.tmr.toFixed(1)} h</span>` : d.auto && o.on ? 'AUTO · standby' : 'POWERED DOWN';
      h += stt + `<br>Fuel ${d.fuel} $/MWh · CO₂ ${d.co2} t/MWh (${st.co2Price.toFixed(1)} $/t)`;
    } else if (d.ren) {
      const pot = o.avail || 0; h += `${o.on ? 'OUTPUT ' + Math.round(o.out || 0) + ' / ' + d.cap + ' MW' : 'POWERED DOWN'}` + (o.on && pot - (o.out || 0) > .5 ? ` · ${Math.round(pot - o.out)} MW curtailed` : '') +
        `<br>${d.ren === 'wind' ? 'Site ' + Math.round(siteFactor(st, o) * 100) + ' % · wind ' + Math.round(st.weather.wind * 100) + ' %' + (st.weather.wind > .94 ? ' (storm stop)' : '') : 'Sun ' + Math.round(sunAt(st, st.hour) * 100) + ' % · snow ' + Math.round(st.weather.snow * 100) + ' %'}`;
    } else if (d.res) h += `${o.on ? 'OUTPUT ' + Math.round(o.out || 0) + ' / ' + d.cap + ' MW' : 'POWERED DOWN'}<br>Lake <div class="bar"><i style="width:${o.res / d.res * 100}%;background:#40a8ff"></i></div>`;
    else if (d.store) h += `${o.on ? (o.pow > .5 ? 'DISCHARGING ' + Math.round(o.pow) + ' MW' : o.pow < -.5 ? 'CHARGING ' + Math.round(-o.pow) + ' MW' : 'STANDBY') : 'POWERED DOWN'}<br>Charge ${Math.round(o.soc / d.energy * 100)} %<div class="bar"><i style="width:${o.soc / d.energy * 100}%;background:#40b8ff"></i></div>`;
    else h += d.desc;
    if (I && !I.gen) h += `<br><span style="color:#ff6a50">Not connected to any plant.</span>`;
    else if (I && I.short > .01) h += `<br><span style="color:#ff6a50">This grid is short by ${Math.round(I.short)} MW.</span>`;
    if (o.type !== 'yard' && (d.cap || d.store || o.type === 'tesla')) btns.push([d.auto ? (o.on ? 'AUTO ✓' : 'OFF') : (o.on ? 'POWER ON' : 'POWER OFF'), 'power']);
    if (o.st === 'trip') btns.push([o.repairing ? 'REPAIRING…' : 'REPAIR ($40/h)', 'repair']);
    if (o.type !== 'yard') btns.push(['SELL +$' + Math.round(d.cost * SELL_BACK), 'sell', 'red']);
  } else if (s.kind === 't') {
    const t = st.towns[s.i];
    h = `<h4>${t.name}</h4>Population ${t.pop.toLocaleString('en-US')} · demand ${Math.round(t.dem)} MW<br>` +
      (t.joined ? (t.lit ? '<span style="color:#7dff6a">Lights on</span>' : '<span style="color:#ff6a50">BLACKOUT</span>') : '<span style="color:#ffcf40">Not connected: run a power line to any house.</span>') +
      `<br>Mood ${Math.round(t.mood)} %<div class="bar"><i style="width:${t.mood}%;background:${t.mood < 35 ? '#ff4a3a' : t.mood < 60 ? '#ffd020' : '#3cff3c'}"></i></div>` + (t.smog ? '<span style="color:#ffcf40">Complains about coal smog.</span>' : '');
  } else if (s.kind === 'l') {
    const hp = st.lines[s.k]; if (hp === undefined) { GM.sel = null; return showSel(); }
    h = `<h4>Power line</h4>${st.brk[s.k] ? '<span style="color:#ff6a50">BROKEN</span>' : 'Condition ' + Math.round(hp) + ' %'}`;
    if (hp < 100) btns.push(['REPAIR $' + S.line.cost * 2, 'repair']);
    btns.push(['SELL', 'sell', 'red']);
  } else if (s.kind === 'u') {
    const u = st.units.find(u => u.id === s.id); if (!u) { GM.sel = null; return showSel(); }
    h = `<h4>${S[u.type].name}</h4>${u.type === 'truck' ? (u.path.length ? 'Driving to a job' : u.working > 0 ? 'Repairing' : 'Waiting for work') : (u.path.length ? 'On patrol' : 'Standing by')}<br>Tap the ground to send it there.`;
    btns.push(['SELL +$' + Math.round(S[u.type].cost * SELL_BACK), 'sell', 'red']);
  }
  el.innerHTML = h + (btns.length ? `<div class="row">${btns.map(([t, a, c]) => `<button data-a="${a}" class="${c || ''}">${t}</button>`).join('')}<button data-a="close">✗</button></div>` : `<div class="row"><button data-a="close">✗</button></div>`);
  el.classList.remove('hidden');
  el.querySelectorAll('button').forEach(b => b.onclick = () => selAction(b.dataset.a));
}
function selAction(a) {
  const st = GM.st, s = GM.sel; sfx('click');
  if (a === 'close') { GM.sel = null; return showSel(); }
  if (s.kind === 's') { const o = st.byId[s.id]; if (a === 'power') togglePower(o); if (a === 'repair') toggleRepair(o); if (a === 'sell') sellStruct(o); }
  if (s.kind === 'l') { if (a === 'repair') repairLine(s.k); if (a === 'sell') sellLine(s.k); }
  if (s.kind === 'u' && a === 'sell') { const i = st.units.findIndex(u => u.id === s.id); if (i >= 0) { st.credits += S[st.units[i].type].cost * SELL_BACK; st.units.splice(i, 1); EVA('Unit sold.', 'sold'); GM.sel = null; } }
  showSel();
}
function togglePower(o) { if (!o || o.type === 'yard') return; o.on = o.on ? 0 : 1; if (!o.on) { o.out = 0; } EVA(S[o.type].name + (o.on ? (S[o.type].auto ? ' on AUTO.' : ' powering up.') : ' powered down.'), 'power'); sfx('click'); }
function toggleRepair(o) { if (!o || o.st !== 'trip') { EVA('Nothing to repair.', 'deny'); return; } o.repairing = o.repairing ? 0 : 1; EVA(o.repairing ? 'Repairing.' : 'Repair stopped.', 'fix'); }
function sellStruct(o) {
  const st = GM.st; if (!o || o.type === 'yard') { EVA('Cannot sell the Construction Yard.', 'deny'); return; }
  st.credits += S[o.type].cost * SELL_BACK; st.structs.splice(st.structs.indexOf(o), 1); st.dirty = 1; derive(st);
  st.stats.sold = (st.stats.sold || 0) + 1; if (o.type === 'coal') st.stats.coalSold = (st.stats.coalSold || 0) + 1;
  addFx(st, { k: 'cash', x: (o.x + 1) * TS, y: o.y * TS, t: 1.6, txt: '+$' + Math.round(S[o.type].cost * SELL_BACK) });
  EVA('Structure sold.', 'sold'); sfx('sell'); vib(30); GM.sel = null;
}
function sellLine(k) { const st = GM.st; if (st.lines[k] === undefined) return; delete st.lines[k]; delete st.brk[k]; st.credits += 10; st.dirty = 1; derive(st); sfx('sell'); GM.sel = null; }
function repairLine(k) {
  const st = GM.st; if (st.lines[k] === undefined || st.lines[k] >= 100) return;
  const c = S.line.cost * 2; if (st.credits < c) { EVA('Insufficient funds.', 'funds'); return; }
  st.credits -= c; st.stats.fuel += c; st.lines[k] = 100; if (st.brk[k]) { delete st.brk[k]; st.dirty = 1; derive(st); }
  EVA('Line repaired.', 'fix'); sfx('place');
}

// ---------- map input ----------
const ptrs = new Map(); let gest = null, lastTap = 0;
function tileAt(sx, sy) { const [wx, wy] = toWorld(sx, sy); return [Math.floor(wx / TS), Math.floor(wy / TS), wx, wy]; }
function initInput() {
  const cv = $('cv');
  cv.addEventListener('pointerdown', e => {
    ensureAudio(); cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top, sx: e.clientX - r.left, sy: e.clientY - r.top, btn: e.button, t: performance.now() };
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: RD.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moved: true }; GM.ui.lineDrag = null; return; }
    gest = { moved: false, x: p.x, y: p.y };
    if (GM.ui.mode === 'line' && e.button === 0 && GM.st) { const [tx, ty] = tileAt(p.x, p.y); gest.line = [tx, ty]; lineDragUpdate(tx, ty); }
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!GM.st) return;
    const [tx, ty] = tileAt(x, y); GM.ui.hover = [tx, ty];
    if (e.pointerType === 'mouse' && GM.ui.mode === 'place' && !ptrs.size) { const fp = S[GM.ui.place.type].fp; GM.ui.place.at = [tx - (fp[0] >> 1), ty - (fp[1] >> 1)]; placeBarUpdate(); }
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2 && gest && gest.pinch) {
      p.x = x; p.y = y; const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = toWorld(gest.mx, gest.my);
      RD.cam.z = Math.max(1, Math.min(5, gest.z * d / gest.pinch));
      RD.cam.x = wx - mx / RD.cam.z; RD.cam.y = wy - my / RD.cam.z; gest.mx = mx; gest.my = my; gest.z = RD.cam.z; gest.pinch = d; clampCam(GM.st);
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    if (!gest) return;
    if (Math.hypot(x - p.sx, y - p.sy) > 7) gest.moved = true;
    if (gest.line && !(p.btn === 2 || p.btn === 1)) { lineDragUpdate(tx, ty); p.x = x; p.y = y; return; }
    if (gest.moved) { RD.cam.x -= dx / RD.cam.z; RD.cam.y -= dy / RD.cam.z; clampCam(GM.st); }
    p.x = x; p.y = y;
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!p || !GM.st) return;
    if (gest && gest.line) { if (ptrs.size === 0) commitLine(); gest = null; return; }
    if (gest && !gest.moved && !gest.pinch && ptrs.size === 0) { if (p.btn === 2) { setMode(null); GM.sel = null; showSel(); } else mapTap(p.x, p.y); }
    if (ptrs.size === 0) gest = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); gest = null; GM.ui.lineDrag = null; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault(); if (!GM.st) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const [wx, wy] = toWorld(x, y); RD.cam.z = Math.max(1, Math.min(5, RD.cam.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    RD.cam.x = wx - x / RD.cam.z; RD.cam.y = wy - y / RD.cam.z; clampCam(GM.st);
  }, { passive: false });
  // radar: tap or drag to move the view
  const rad = $('radar');
  const radJump = e => { if (!GM.st || !RD.radarMap || !has(GM.st, 'dome') || GM.st.lowPower) return; const r = rad.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * rad.width, y = (e.clientY - r.top) / r.height * rad.height; const m = RD.radarMap; centerOn(GM.st, (x - m.ox) / m.s * TS, (y - m.oy) / m.s * TS); };
  rad.addEventListener('pointerdown', e => { rad.setPointerCapture(e.pointerId); radJump(e); rad._d = 1; });
  rad.addEventListener('pointermove', e => { if (rad._d) radJump(e); });
  rad.addEventListener('pointerup', () => rad._d = 0);
  for (const b of document.querySelectorAll('.tbtn')) b.onclick = () => { ensureAudio(); sfx('click'); setMode(GM.ui.mode === b.dataset.mode ? null : b.dataset.mode); };
  addEventListener('keydown', e => {
    if (!GM.playing) return;
    if (e.key === 'Escape') { if (GM.ui.mode) setMode(null); else { GM.sel = null; showSel(); } }
    if (e.key === ' ') { e.preventDefault(); openMenu(); }
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (k) { RD.cam.x += k[0] * 48; RD.cam.y += k[1] * 48; clampCam(GM.st); }
    if (e.key === '+' || e.key === '=') { RD.cam.z = Math.min(5, RD.cam.z * 1.2); clampCam(GM.st); } if (e.key === '-') { RD.cam.z = Math.max(1, RD.cam.z / 1.2); clampCam(GM.st); }
  });
}

function lineDragUpdate(tx, ty) {
  const st = GM.st, [sx, sy] = gest.line, cells = [];
  const horizFirst = Math.abs(tx - sx) >= Math.abs(ty - sy);
  let x = sx, y = sy; const push = () => { if (inb(st, x, y)) cells.push(idx(st, x, y)); };
  push();
  if (horizFirst) { while (x !== tx) { x += Math.sign(tx - x); push(); } while (y !== ty) { y += Math.sign(ty - y); push(); } }
  else { while (y !== ty) { y += Math.sign(ty - y); push(); } while (x !== tx) { x += Math.sign(tx - x); push(); } }
  const chosen = new Set(), out = []; let cost = 0, broken = false;
  for (const k of cells) {
    if (st.lines[k] !== undefined || st.occS[k]) { out.push([k, true, 0]); chosen.add(k); continue; }   // pass through existing kit
    const ok = !broken && lineCellOk(st, k, chosen) && st.credits >= cost + lineCost(st, k);
    if (ok) { chosen.add(k); cost += lineCost(st, k); } else broken = true;
    out.push([k, ok, 1]);
  }
  GM.ui.lineDrag = out.filter(o => o[2]).map(o => [o[0], o[1]]);
  status(`<b>Power line</b> · ${GM.ui.lineDrag.filter(o => o[1]).length} tiles · $${cost}`);
}
function commitLine() {
  const st = GM.st, L = GM.ui.lineDrag; GM.ui.lineDrag = null; if (!L) return;
  let n = 0, cost = 0;
  for (const [k, ok] of L) { if (!ok) continue; const c = lineCost(st, k); if (st.credits < c) break; st.credits -= c; cost += c; st.stats.spent += c; st.lines[k] = 100; if (st.t[k] === F) st.t[k] = G; n++; }
  if (n) { st.dirty = 1; derive(st); reveal(st); st.revDirty = 1; sfx('place'); vib(15); if (GM.st.tut >= 0) tutCheck(); }
  else if (L.length) { EVA('Lines must connect to your base, a plant or another line.', 'deny'); sfx('deny'); }
}

function mapTap(sx, sy) {
  const st = GM.st, ui = GM.ui, [tx, ty, wx, wy] = tileAt(sx, sy);
  if (!inb(st, tx, ty)) return;
  const k = idx(st, tx, ty);
  if (ui.mode === 'place') {
    const p = ui.place, fp = S[p.type].fp;
    const inside = p.at && tx >= p.at[0] && ty >= p.at[1] && tx < p.at[0] + fp[0] && ty < p.at[1] + fp[1];
    if (inside && canPlace(st, p.type, p.at[0], p.at[1]).ok) return tryPlace();
    p.at = [tx - (fp[0] >> 1), ty - (fp[1] >> 1)]; placeBarUpdate(); sfx('click');
    if (now() - lastTap < 350 && canPlace(st, p.type, p.at[0], p.at[1]).ok) tryPlace();
    lastTap = now(); return;
  }
  if (ui.mode === 'line') { gest = { line: [tx, ty] }; lineDragUpdate(tx, ty); commitLine(); gest = null; return; }
  const sid = st.occS[k], o = sid ? st.byId[sid] : null;
  if (ui.mode === 'sell') { if (o) sellStruct(o); else if (st.lines[k] !== undefined) sellLine(k); showSel(); return; }
  if (ui.mode === 'repair') { if (o) toggleRepair(o); else if (st.lines[k] !== undefined) repairLine(k); return; }
  if (ui.mode === 'power') { if (o) togglePower(o); return; }
  // pick a unit first (small targets), then buildings, villages and lines
  const u = st.units.filter(u => u.type !== 'thief').find(u => Math.abs(u.x * TS + 12 - wx) < 13 && Math.abs(u.y * TS + 12 - wy) < 13);
  if (u) { GM.sel = { kind: 'u', id: u.id }; sfx('click'); return showSel(); }
  if (GM.sel && GM.sel.kind === 'u' && !o && !st.occT[k]) {
    const su = st.units.find(x => x.id === GM.sel.id);
    if (su && walkable(st, k)) { su.manual = k; su.path = []; sfx('ack'); EVA('Acknowledged.', 'ack'); return; }
  }
  if (o) { GM.sel = { kind: 's', id: o.id }; sfx('click'); return showSel(); }
  // tall sprites: a tap just above a building also selects it
  const o2 = st.occS[idx(st, tx, Math.min(st.H - 1, ty + 1))]; if (o2 && st.byId[o2] && S[st.byId[o2].type].fp[1] === 1) { GM.sel = { kind: 's', id: o2 }; return showSel(); }
  if (st.occT[k]) { GM.sel = { kind: 't', i: st.occT[k] - 1 }; sfx('click'); return showSel(); }
  if (st.lines[k] !== undefined) { GM.sel = { kind: 'l', k }; sfx('click'); return showSel(); }
  GM.sel = null; showSel();
}
const now = () => performance.now();

// ---------- tutorial (mission 1) ----------
const TUT = [
  { t: 'Welcome, Commander. The valley is dark. Tap the <b>Coal Plant</b> picture in the sidebar to start building.', hl: 'coal', done: st => st.q.s && st.q.s.type === 'coal' || has(st, 'coal') },
  { t: 'Building… When the picture says <b>READY</b>, tap it again, then tap the map next to your Construction Yard and press <b>✓ PLACE</b>.', hl: 'coal', done: st => has(st, 'coal') },
  { t: 'Power on. Now tap <b>Power Line</b> and drag a line from your base to <b>{0}</b>, the village to the north-east (arrow). Touching any house connects it.', hl: 'line', town: 0, done: st => st.towns[0].joined },
  { t: '<b>{0}</b> is connected. A coal plant needs 3 hours to warm up; after that every MWh you deliver pays credits. Coal is slow and dirty, so add a <b>Wind Turbine</b> or two. Wind is stronger near rocks.', hl: 'wind', done: st => has(st, 'wind') },
  { t: '<b>{1}</b> lies across the river. Lay a line to it. Long lines can end in a <b>Substation</b>, which lets you build plants out there too.', hl: 'line', town: 1, done: st => st.towns[1].joined },
  { t: 'Watch the <b>power bar</b> left of the pictures: the white mark is demand. Evenings peak. Build a <b>Gas Turbine</b>: it starts in minutes when demand jumps.', hl: 'gas', done: st => has(st, 'gas') },
  { t: 'Last one: a <b>SCADA Dome</b> brings the radar online and warns you about the weather.', hl: 'dome', done: st => has(st, 'dome') },
  { t: 'Well done. Hold the grid until <b>Day 2 · 08:00</b> with 90 % of energy served. Tap a plant to power it up or down. Speed up with the <b>1×</b> button.', hl: null, done: () => false },
];
function tutCheck() {
  const st = GM.st; if (!st || st.tut < 0) return;
  while (st.tut < TUT.length - 1 && TUT[st.tut].done(st)) { st.tut++; sfx('obj'); }
  const s = TUT[st.tut], box = $('tut');
  if (st.tutHidden) { box.classList.add('hidden'); } else {
    box.classList.remove('hidden');
    box.innerHTML = `<div>${s.t.replace('{0}', st.towns[0].name).replace('{1}', st.towns[1].name)}</div><div class="tb"><button id="tutSkip">Skip tutorial</button><button id="tutHide">Hide</button></div>`;
    $('tutSkip').onclick = () => { st.tut = -1; box.classList.add('hidden'); GM.ui.mapArrow = null; hl(null); };
    $('tutHide').onclick = () => { st.tutHidden = 1; box.classList.add('hidden'); };
  }
  hl(s.hl); GM.ui.mapArrow = s.town !== undefined ? [st.towns[s.town].x, st.towns[s.town].y - 1] : null;
}
function hl(type) { for (const t in GM.cams) GM.cams[t].el.classList.toggle('hl', t === type); }

// ---------- toast ----------
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.classList.add('hidden'), 400); }, 1800); }
