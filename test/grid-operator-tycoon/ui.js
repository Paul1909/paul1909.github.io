// Grid Operator Tycoon: input, tools, HUD, panels, advisor, town thoughts.
'use strict';
const $ = id => document.getElementById(id);
const U = { tool: null, build: null, tier: 1, from: null, pend: null, panel: null, arg: null, playing: false, spd: 0, lastPanelIn: 0, tut: null, tutT: 0, thoughtT: 0 };

const fmtM = v => { const a = Math.abs(v); const t = a >= 10000 ? (a / 1000).toFixed(0) + 'B' : a >= 1000 ? (a / 1000).toFixed(2) + 'B' : a >= 100 ? Math.round(a) + 'M' : a.toFixed(1) + 'M'; return (v < 0 ? '−€' : '€') + t; };
const fmtMW = v => v >= 1000 ? (v / 1000).toFixed(2) + ' GW' : Math.round(v) + ' MW';
const fmtPop = p => p >= 1e6 ? (p / 1e6).toFixed(2) + 'M' : Math.round(p / 1000) + 'k';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cashOf = s => s.sc.sandbox ? Infinity : s.cash;

// ---------------------------------------------------------------- input
function initInput() {
  const cv = $('map'), pts = new Map();
  let pan = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pts.size === 1) { pan = { x: e.offsetX, y: e.offsetY, cx: R.cam.x, cy: R.cam.y }; moved = false; }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: R.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: R.cam.x, cy: R.cam.y }; moved = true;
    }
    audioUnlock();
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(e.offsetX, e.offsetY, false); return; }
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), z = clamp(pinch.z * d / pinch.d, 0.3, 3);
      const wx = (pinch.mx - R.W / 2) / pinch.z + pinch.cx, wy = (pinch.my - R.H / 2) / pinch.z + pinch.cy;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      R.cam.z = z; R.cam.x = wx - (mx - R.W / 2) / z; R.cam.y = wy - (my - R.H / 2) / z; clampCam(S.s);
    } else if (pan) {
      const dx = e.offsetX - pan.x, dy = e.offsetY - pan.y;
      if (!moved && Math.hypot(dx, dy) > 9) moved = true;
      if (moved) { R.cam.x = pan.cx - dx / R.cam.z; R.cam.y = pan.cy - dy / R.cam.z; clampCam(S.s); }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const wasOne = pts.size === 1;
    pts.delete(e.pointerId);
    if (wasOne && !moved && e.type === 'pointerup') tap(e.offsetX, e.offsetY, e.pointerType !== 'mouse');
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, cx: R.cam.x, cy: R.cam.y }; }
    if (!pts.size) pan = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { R.hover = null; R.ghost = null; R.lineTo = null; } });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const z0 = R.cam.z, z = clamp(z0 * Math.exp(-e.deltaY * 0.0015), 0.3, 3);
    const wx = (e.offsetX - R.W / 2) / z0 + R.cam.x, wy = (e.offsetY - R.H / 2) / z0 + R.cam.y;
    R.cam.z = z; R.cam.x = wx - (e.offsetX - R.W / 2) / z; R.cam.y = wy - (e.offsetY - R.H / 2) / z; clampCam(S.s);
  }, { passive: false });
  addEventListener('keydown', e => {
    if (!S.s || $('app').classList.contains('hidden') || e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!U.playing); }
    else if (['1', '2', '3'].includes(e.key)) { U.spd = +e.key - 1; setPlaying(true); }
    else if (e.key === 'b' || e.key === 'B') setTool('build');
    else if (e.key === 'l' || e.key === 'L') setTool('line');
    else if (e.key === 'Escape') { if (U.tool) setTool(null); else closePanel(); }
  });
}
function tileOf(x, y) { const { fx, fy } = screenToTile(x, y); return { x: Math.floor(fx), y: Math.floor(fy) }; }
function pickNode(x, y) {
  const s = S.s; let best = null, bd = 1e9;
  for (const n of s.nodes) {
    const [cx, cy] = sp(n.x + 0.5, n.y + 0.5, tileH(s, n.x, n.y));
    const d = Math.hypot(cx - x, (cy - 12 * R.cam.z) - y);
    if (d < Math.max(22, 30 * R.cam.z) && d < bd) { bd = d; best = n; }
  }
  return best;
}
function pickLine(x, y) {
  const s = S.s; let best = null, bd = 14;
  for (const l of s.lines) {
    const g = lineGeom(s, l); if (!g) continue;
    for (let k = 1; k < g.length; k++) {
      const a = sp(g[k - 1].x, g[k - 1].y, g[k - 1].top), b = sp(g[k].x, g[k].y, g[k].top);
      const d = segDist({ x, y }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      if (d < bd) { bd = d; best = l; }
    }
  }
  return best;
}
function hover(x, y, touch) {
  if (!S.s) return;
  const t = tileOf(x, y);
  R.hover = tileAt(S.s, t.x, t.y) >= 0 ? t : null;
  if (!R.hover) { R.ghost = null; R.lineTo = null; return; }
  if (U.tool === 'build' && U.build) R.ghost = ghostFor(t.x, t.y, touch);
  if (U.tool === 'line' && U.from) R.lineTo = evalLine(t.x, t.y, touch);
}
function tap(x, y, touch) {
  const s = S.s; if (!s) return;
  const t = tileOf(x, y);
  if (U.tool === 'build' && U.build) return tapBuild(t.x, t.y, touch);
  if (U.tool === 'line') return tapLine(t.x, t.y, touch, x, y);
  const n = pickNode(x, y);
  if (n) return select(n.id);
  const l = pickLine(x, y);
  if (l) return select('L' + l.id);
  deselect();
}

// ---------------------------------------------------------------- build tool
function stars(v, k) { const n = k === 'wind' ? (v < 0.95 ? 1 : v < 1.06 ? 2 : v < 1.18 ? 3 : 4) : (v < 0.96 ? 1 : v < 1.02 ? 2 : v < 1.08 ? 3 : 4); return '★'.repeat(n) + '☆'.repeat(4 - n); }
function ghostFor(x, y, touch) {
  const s = S.s, type = U.build, P = PLANTS[type], prob = siteProblem(s, type, x, y), cost = buildCost(s, type, x, y);
  if (prob) return { ok: false, icon: P.icon, label: prob };
  if (cost > cashOf(s)) return { ok: false, icon: P.icon, label: `Need ${fmtM(cost)}` };
  const i = x + y * s.map.W;
  const site = type === 'wind' || type === 'offshore' ? ` · wind ${stars(s.map.wind[i], 'wind')}` : type === 'solar' ? ` · sun ${stars(s.map.sun[i], 'sun')}` : '';
  const pend = touch && U.pend && U.pend.x === x && U.pend.y === y;
  return { ok: true, icon: P.icon, label: `${P.code} ${fmtM(cost)}${site}${touch && !pend ? '' : ''}` };
}
function computeValid() {
  const s = S.s, type = U.build;
  if (!type) { R.valid = null; R.overlayCol = null; return; }
  const M = s.map, v = new Float32Array(M.W * M.H);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    const i = x + y * M.W;
    if (siteProblem(s, type, x, y)) continue;
    v[i] = type === 'wind' || type === 'offshore' ? M.wind[i] : type === 'solar' ? M.sun[i] : 1;
  }
  R.valid = v;
  R.overlayCol = type === 'wind' || type === 'offshore' ? q => `rgba(30,200,190,${clamp((q - 0.8) * 1.1, 0.12, 0.6)})`
    : type === 'solar' ? q => `rgba(255,170,20,${clamp((q - 0.85) * 1.6, 0.12, 0.6)})` : () => 'rgba(80,230,120,.25)';
}
function tapBuild(x, y, touch) {
  const s = S.s, type = U.build;
  if (tileAt(s, x, y) < 0) return;
  R.hover = { x, y };
  if (touch && !(U.pend && U.pend.x === x && U.pend.y === y)) {
    U.pend = { x, y }; R.ghost = ghostFor(x, y, true);
    if (R.ghost.ok) R.ghost.label += ' · tap again';
    sfx('tick'); return;
  }
  const prob = siteProblem(s, type, x, y), cost = buildCost(s, type, x, y);
  if (prob) { quickToast('🚫', prob); sfx('err'); return; }
  if (cost > cashOf(s)) { quickToast('💸', `Not enough cash (${fmtM(cost)}). Borrow in 💰 Money.`); sfx('err'); return; }
  if (!s.sc.sandbox) s.cash -= cost;
  addFin(s, 'build', -cost);
  const n = addPlant(s, type, x, y, { cost });
  floatText(n, '−' + fmtM(cost).slice(1), '#ffd23f');
  sfx('build'); buzz(20);
  U.pend = null; R.ghost = ghostFor(x, y, touch);
  computeValid(); refreshDrawer();
  if (PLANTS[type].nuc) quickToast('⚛️', 'Nuclear takes 28 months to build. Patience!');
}

// ---------------------------------------------------------------- line tool
function evalLine(x, y, touch) {
  const s = S.s, a = s.idx[U.from];
  if (!a) return null;
  const n = nodeAt(s, x, y), T0 = TIERS[U.tier];
  const b = n || { x, y, k: 'new' };
  if (n && n.id === a.id) return null;
  const len = lineLen(a, b);
  let why = '';
  if (!n) { const p = siteProblem(s, 'sub', x, y); if (p) why = p === 'Tile already in use' ? p : 'Lines end on land (or an offshore farm)'; }
  if (!why && len > T0.max) why = `Too long for ${T0.name} (max ${T0.max} tiles)`;
  if (!why && n && linkBetween(s, a, n)) why = 'Already linked. Tap the line to upgrade it.';
  if (!why && n && n.k === 'border' && a.k === 'border') why = 'Two borders? Nice try.';
  const cost = lineCost(s, a, b, U.tier) + (n ? 0 : PLANTS.sub.cost);
  if (!why && cost > cashOf(s)) why = `Need ${fmtM(cost)}`;
  const pend = U.pend && U.pend.x === x && U.pend.y === y;
  const label = why || `${T0.name} · ${Math.round(len * 10)} km · ${fmtM(cost)}${n ? '' : ' + substation'}${touch && !pend ? ' · tap again' : ''}`;
  return { ok: !why, label, why, cost, n, len };
}
function tapLine(x, y, touch, sx, sy) {
  const s = S.s;
  let n = nodeAt(s, x, y) || (pickNode(sx, sy));
  if (n) { x = n.x; y = n.y; }
  if (!U.from) {
    if (n) { U.from = n.id; R.lineFrom = n.id; U.pend = null; sfx('tick'); refreshDrawer(); }
    else quickToast('👉', 'Start a line on a plant, town, substation or border.');
    return;
  }
  if (n && n.id === U.from) { U.from = null; R.lineFrom = null; R.lineTo = null; U.pend = null; refreshDrawer(); return; }
  R.hover = { x, y };
  const ev = evalLine(x, y, touch);
  if (!ev) return;
  if (touch && !(U.pend && U.pend.x === x && U.pend.y === y)) { U.pend = { x, y }; R.lineTo = evalLine(x, y, true); sfx('tick'); return; }
  if (!ev.ok) { quickToast('🚫', ev.why); sfx('err'); return; }
  const a = s.idx[U.from];
  let b = ev.n;
  if (!b) { b = addPlant(s, 'sub', x, y, { cost: PLANTS.sub.cost }); }
  const lc = lineCost(s, a, b, U.tier);
  if (!s.sc.sandbox) s.cash -= ev.cost;
  addFin(s, 'build', -ev.cost);
  addLine(s, a, b, U.tier, { cost: lc });
  floatText(b, '−' + fmtM(ev.cost).slice(1), '#ffd23f');
  sfx('line'); buzz(15);
  U.from = b.id; R.lineFrom = b.id; U.pend = null; R.lineTo = null;
  refreshDrawer();
}

// ---------------------------------------------------------------- tools + drawer
function setTool(t) {
  if (U.tool === t) t = null;
  U.tool = t; U.pend = null; U.from = null; R.lineFrom = null; R.lineTo = null; R.ghost = null;
  if (t !== 'build') { U.build = null; R.valid = null; }
  document.querySelectorAll('#toolbar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (t) { closePanel(); $('drawer').classList.remove('hidden'); refreshDrawer(); }
  else $('drawer').classList.add('hidden');
  advisorPos();
}
function refreshDrawer() {
  const s = S.s, body = $('drawerBody'), hint = $('drawerHint');
  if (U.tool === 'build') {
    const cards = BUILD_ORDER.filter(t => !(PLANTS[t].nuc && !s.sc.nuclear)).map(t => {
      const P = PLANTS[t], ok = unlockedType(s, t), cost = buildCost(s, t, -1, -1);
      const cap = P.store ? `${P.cap} MW · ${t === 'bess' && hasResearch(s, 'bess2') ? 6 : P.hours} h` : P.cap ? `${P.cap} MW` : 'junction';
      return `<button class="card ${U.build === t ? 'on' : ''} ${!ok || cost > cashOf(s) ? 'dis' : ''}" data-b="${t}">${ok ? '' : '<span class="lock">🔒</span>'}<span class="ic">${P.icon}</span><b>${P.name}</b><small>${cap}</small><span class="pr">${fmtM(cost)}</span></button>`;
    }).join('');
    body.innerHTML = `<div class="cards">${cards}</div>`;
    const P = PLANTS[U.build];
    hint.innerHTML = P ? `<b>${P.name}</b> · ${P.where}` : 'Pick something to build, then tap the map.';
  } else if (U.tool === 'line') {
    body.innerHTML = `<div class="tiers">${[1, 2, 3].map(k => { const T0 = TIERS[k], ok = !T0.research || hasResearch(s, T0.research); return `<button class="card ${U.tier === k ? 'on' : ''} ${ok ? '' : 'dis'}" data-tier="${k}">${ok ? '' : '<span class="lock">🔒</span>'}<b>${T0.name}</b><small>${fmtMW(T0.cap)} · ≤ ${T0.max} tiles</small><span class="pr">€${T0.cost}M / tile</span></button>`; }).join('')}</div>`;
    hint.innerHTML = U.from ? `From <b>${esc(short(s.idx[U.from]))}</b>: tap where the line goes (empty ground adds a substation). Tap the start again to stop.` : 'Tap a plant, town, substation or border to start a line.';
  }
}
function initDrawer() {
  $('drawerBody').addEventListener('click', e => {
    const b = e.target.closest('[data-b]'), t = e.target.closest('[data-tier]');
    if (b) {
      const type = b.dataset.b, P = PLANTS[type];
      if (!unlockedType(S.s, type)) { quickToast('🔒', `${P.name} needs research: ${RESEARCH.find(r => r.id === P.research).name}.`); return; }
      U.build = U.build === type ? null : type; U.pend = null; R.ghost = null;
      computeValid(); refreshDrawer(); sfx('tick');
      if (U.build) quickToast(P.icon, `${P.desc}`);
    }
    if (t) {
      const k = +t.dataset.tier, T0 = TIERS[k];
      if (T0.research && !hasResearch(S.s, T0.research)) { quickToast('🔒', '380 kV needs research first.'); return; }
      U.tier = k; U.pend = null; refreshDrawer(); sfx('tick');
    }
  });
  $('drawerX').onclick = () => setTool(null);
  document.querySelectorAll('#toolbar [data-tool]').forEach(b => b.onclick = () => { setTool(b.dataset.tool); sfx('tick'); });
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { openPanel(b.dataset.p); sfx('tick'); });
}

// ---------------------------------------------------------------- selection + panels
function select(id) {
  R.sel = id; openPanel('inspect', id); sfx('tick');
  if (innerWidth < 900 && S.s) {   // keep the selected thing visible above the bottom sheet
    const o = S.s.idx[id]; if (!o) return;
    const a = typeof id === 'string' ? S.s.idx[o.a] : o, b = typeof id === 'string' ? S.s.idx[o.b] : o;
    const [, y] = sp((a.x + b.x) / 2 + 0.5, (a.y + b.y) / 2 + 0.5);
    const top = $('panel').getBoundingClientRect().top || R.H * 0.45;
    if (y > top - 40) { R.cam.y += (y - (top - 40) * 0.55) / R.cam.z; clampCam(S.s); }
  }
}
function deselect() { R.sel = null; if (U.panel === 'inspect') closePanel(); }
function openPanel(p, arg) {
  if (U.panel === p && arg === U.arg && p !== 'inspect') { closePanel(); return; }
  if (U.tool && p !== 'inspect') setTool(null);
  U.panel = p; U.arg = arg;
  if (p !== 'inspect') R.sel = null;
  $('panel').classList.remove('hidden');
  $('panelB').scrollTop = 0;
  renderPanel(true);
  document.querySelectorAll('#toolbar [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  advisorPos();
}
function closePanel() {
  U.panel = null; U.arg = null; R.sel = null;
  $('panel').classList.add('hidden');
  document.querySelectorAll('#toolbar [data-p]').forEach(b => b.classList.remove('on'));
  advisorPos();
}
function renderPanel(force) {
  if (!U.panel || !S.s) return;
  if (!force && performance.now() - U.lastPanelIn < 1300) return;
  const s = S.s;
  let t = '', h = '';
  if (U.panel === 'inspect') {
    const o = s.idx[U.arg];
    if (!o) { closePanel(); return; }
    [t, h] = typeof U.arg === 'string' ? inspectLine(s, o) : inspectNode(s, o);
  } else if (U.panel === 'grid') [t, h] = gridPanel(s);
  else if (U.panel === 'money') [t, h] = moneyPanel(s);
  else if (U.panel === 'research') [t, h] = researchPanel(s);
  else if (U.panel === 'goals') [t, h] = goalsPanel(s);
  else if (U.panel === 'news') [t, h] = ['📰 News', `<div class="newsl">${s.news.map(n => `<div><small>${dateStr(n.t)}</small>${n.i} ${esc(n.x)}</div>`).join('') || 'Nothing yet.'}</div>`];
  $('panelT').innerHTML = t;
  if ($('panelB').dataset.h !== h) { $('panelB').innerHTML = h; $('panelB').dataset.h = h; }
  const c = $('mixChart'); if (c) drawMixChart(c, s);
}
const row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
const bar = (f, col) => `<div class="bar"><i style="width:${clamp(f * 100, 0, 100).toFixed(1)}%;background:${col || 'var(--green)'}"></i></div>`;

function inspectNode(s, n) {
  if (n.k === 'town') {
    const p = n.parts || {};
    const pn = { price: 'Tariff', rel: 'Blackouts', smog: 'Smog', view: 'Pylons & turbines', nuke: 'Reactor nearby', green: 'Clean power', smart: 'Smart meters', wait: 'No electricity yet' };
    const parts = Object.entries(p).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => a[1] - b[1]).map(([k, v]) => row(pn[k] || k, `<span class="${v < 0 ? 'neg' : 'pos'}">${v > 0 ? '+' : ''}${v.toFixed(0)}</span>`)).join('');
    const size = n.pop < 40000 ? 'Village' : n.pop < 90000 ? 'Town' : n.pop < 160000 ? 'Large town' : n.pop < 300000 ? 'City' : 'Metropolis';
    const supply = !n.conn ? '<span class="neg">Not connected</span>' : n.dark ? `<span class="neg">Blackout: ${Math.round((n.f || 0) * 100)} % cut</span>` : '<span class="pos">Powered</span>';
    return [`🏘️ ${esc(n.name)}`, `${!n.conn ? `<div class="warn">${n.renOnly ? 'Only solar or wind reaches this town. It needs a source that also runs at night: gas, hydro, a battery or a border.' : 'This town has no electricity. Connect it to a working plant with a line.'}</div>` : ''}
      ${row('Size', `${size} · ${fmtPop(n.pop)} people`)}${row('Supply', supply)}${row(n.conn ? 'Demand now' : 'Would need', fmtMW(n.conn ? n.dem : (n.need || 0)))}
      ${row('Bills paid this year', fmtM(n.yr ? n.yr.rev : 0))}
      <div class="sec">Mood ${satEmoji(n.sat)} ${Math.round(n.sat)} / 100</div>${bar(n.sat / 100, n.sat < 40 ? 'var(--red)' : n.sat < 60 ? 'var(--gold)' : 'var(--green)')}
      <div class="note">Happy towns (60+) grow and buy more power. Below 45 they start to shrink.</div>
      ${parts ? `<div class="sec">What moves the mood</div>${parts}` : ''}
      ${n.thoughts && n.thoughts.length ? `<div class="sec">Overheard</div>${n.thoughts.map(t => `<div class="thought">${t}</div>`).join('')}` : ''}`];
  }
  if (n.k === 'border') {
    const imp = n.out > 1 ? `Importing ${fmtMW(n.out)}` : n.out < -1 ? `Exporting ${fmtMW(-n.out)}` : 'Idle';
    return [`🛂 Border: ${esc(n.name)}`, `${row('Trade now', imp)}${row('Spot price', `€${Math.round(s.spot || 0)}/MWh`)}${row('Interconnector', fmtMW(n.cap))}
      ${row('Imported this year', `${Math.round(n.yr.imp / 1000 * MONTH_F)} GWh`)}${row('Exported this year', `${Math.round(n.yr.exp / 1000 * MONTH_F)} GWh`)}
      <div class="note">Connect a line here to trade with ${esc(n.name)}. When power is short you import at spot +€6; spare cheap power is exported at spot −€6. ${n.isl !== undefined && s.islands[n.isl] && s.islands[n.isl].ids.length > 1 ? '' : '<b>Not connected yet.</b>'}</div>`];
  }
  if (n.k === 'ind') {
    const left = n.deadline - dayOf(s.t);
    return [`${n.icon} ${esc(n.name)}`, `${n.conn ? '<div class="good">Contract signed. A steady, well-paying customer.</div>' : `<div class="warn">Wants a connection within <b>${Math.max(0, left)} months</b>, or it goes elsewhere.</div>`}
      ${row('Load', fmtMW(n.mw))}${row('Pays', `tariff + €${n.prem}/MWh`)}${n.conn ? row('Paid this year', fmtM(n.yr.rev)) + row('Supply', n.f > 0.01 ? '<span class="neg">Cut!</span>' : '<span class="pos">Powered</span>') : ''}`];
  }
  const P = PLANTS[n.type];
  const lines = s.lines.filter(l => l.a === n.id || l.b === n.id);
  if (n.type === 'sub') {
    return [`🔌 Substation`, `${n.st === 'build' ? '<div class="note">Under construction…</div>' : ''}${row('Lines connected', lines.length)}${row('Upkeep', `€${P.om}M / yr`)}
      <div class="note">${P.desc}</div><div class="acts"><button class="btn small red" data-act="demolish">🗑️ Demolish</button></div>`];
  }
  let status;
  if (n.st === 'build') status = `🏗️ Under construction: ${Math.ceil(n.build)} month${Math.ceil(n.build) > 1 ? 's' : ''} left`;
  else if (n.st === 'trip') status = `💥 Tripped, repair in ${Math.ceil(n.repair)} h`;
  else if (n.st === 'off') status = '💤 Switched off (mothballed)';
  else if (THERMAL(n.type) && n.com && n.startT > 0) status = `⏳ Starting up, ${n.startT.toFixed(1)} h to go`;
  else if (THERMAL(n.type) && !n.com) status = '⏸ On standby (starts when needed)';
  else if (P.store) status = n.out > 1 ? `▼ Discharging ${fmtMW(n.out)}` : n.out < -1 ? `▲ Charging ${fmtMW(-n.out)}` : 'Waiting';
  else status = `Running ${fmtMW(n.out || 0)}`;
  const i = n.x + n.y * s.map.W;
  let extra = '';
  if (P.store) extra = `<div class="sec">Charge ${Math.round(n.soc / storeE(n) * 100)} % of ${fmtMW(storeE(n)).replace('MW', 'MWh').replace('GW', 'GWh')}</div>${bar(n.soc / storeE(n), CAT_COL.storage)}`;
  else extra = `<div class="sec">Output ${Math.round((n.out || 0) / n.cap * 100)} % of ${fmtMW(n.cap)}</div>${bar((n.out || 0) / n.cap, CAT_COL[P.cat])}`;
  if (n.type === 'hydro') extra += `<div class="sec">Lake ${Math.round(n.res / (n.cap * P.res) * 100)} %</div>${bar(n.res / (n.cap * P.res), CAT_COL.hydro)}`;
  const site = n.type === 'solar' ? row('Site (sun)', stars(s.map.sun[i], 'sun')) : P.cat === 'wind' ? row('Site (wind)', stars(s.map.wind[i], 'wind')) : '';
  const cost = THERMAL(n.type) ? row('Running cost', `€${Math.round(varCost(s, n))}/MWh`) + row('CO₂', `${P.co2} t/MWh`) + row('Start-up time', P.start < 1 ? `${Math.round(P.start * 60)} min` : `${P.start} h`) : '';
  const cap = lines.reduce((a, l) => a + TIERS[l.tier].cap, 0);
  const warnLines = n.st !== 'build' && P.cap && !lines.length ? '<div class="warn">Not connected: build a line to a town or substation.</div>'
    : n.cap > cap && lines.length ? `<div class="warn">Its lines carry ${fmtMW(cap)}, less than the plant’s ${fmtMW(n.cap)}. Expect overloads.</div>` : '';
  const btns = n.st === 'build' ? `<button class="btn small red" data-act="cancel">✖ Cancel (70 % back)</button>`
    : `${n.st === 'off' ? '<button class="btn small green" data-act="toggle">▶ Switch on</button>' : n.st === 'on' ? '<button class="btn small" data-act="toggle">💤 Switch off</button>' : ''}<button class="btn small red" data-act="demolish">🗑️ Demolish</button>`;
  return [`${P.icon} ${esc(n.name)} <span class="chip">${P.code}</span>`, `<div class="row"><span>Status</span><b>${status}</b></div>${warnLines}${extra}
    ${site}${row('Capacity', fmtMW(n.cap))}${cost}${row('Upkeep', `€${(P.om * n.cap / P.cap).toFixed(1)}M / yr`)}${n.st !== 'build' ? row('Energy this year', `${Math.round(n.yr.e / 1000 * MONTH_F)} GWh`) + row('Earnings this year', fmtM(n.yr.earn)) : ''}
    ${row('Age', `${Math.floor((n.age || 0) / 12)} years`)}${n.retire ? row('Retires', `${MONTHS[n.retire % 12]} Y${Math.floor(n.retire / 12) + 1}`) : ''}
    <div class="note">${P.desc}</div><div class="acts">${btns}</div>`];
}
function inspectLine(s, l) {
  const T0 = TIERS[l.tier], cap = lineCap(s, l), a = s.idx[l.a], b = s.idx[l.b];
  const st = l.st === 'build' ? `🏗️ Building, ${Math.ceil(l.build * 30)} days left` : l.st === 'trip' ? `🔧 Tripped, back in ${Math.ceil(l.repair)} h` : 'In service';
  const nxt = l.tier < 3 ? TIERS[l.tier + 1] : null, nxtOk = nxt && (!nxt.research || hasResearch(s, nxt.research));
  const upCost = nxt ? lineCost(s, a, b, l.tier + 1) * 0.8 : 0;
  const dir = Math.abs(l.flow) > 1 ? (l.flow > 0 ? `${esc(short(a))} → ${esc(short(b))}` : `${esc(short(b))} → ${esc(short(a))}`) : '—';
  return [`🗼 ${T0.name} line`, `${row('Route', `${esc(short(a))} – ${esc(short(b))}`)}${row('Length', `${Math.round(l.len * 10)} km`)}${row('Status', st)}
    ${l.st === 'ok' ? `<div class="sec">Flow ${fmtMW(Math.abs(l.flow))} of ${fmtMW(cap)} (${Math.round(l.load * 100)} %)</div>${bar(l.load, LOADCOL(l.load))}${row('Direction', dir)}` : ''}
    ${l.heat > 0.01 ? `<div class="sec">Heat 🔥 ${Math.round(l.heat * 100)} %</div>${bar(l.heat, 'var(--red)')}<div class="warn">Overloaded! It trips when the heat bar is full. Upgrade it, build a parallel route or move generation closer to the load.</div>` : ''}
    ${l.upg ? `<div class="note">🏗️ Upgrading to ${TIERS[l.upg.tier].name}, ${Math.ceil(l.upg.left * 30)} days left. It stays in service meanwhile.</div>` : ''}
    ${row('Upkeep', `€${(l.cost * 0.02).toFixed(2)}M / yr`)}
    <div class="acts">${nxt && !l.upg && l.st !== 'build' ? `<button class="btn small gold" data-act="upgrade" ${nxtOk && upCost <= cashOf(s) ? '' : 'disabled'}>⬆ ${nxt.name} · ${fmtM(upCost)}${nxtOk ? '' : ' 🔒'}</button>` : ''}<button class="btn small red" data-act="rmline">🗑️ Remove</button></div>`];
}
function gridPanel(s) {
  const now = s.now || newTot(), gen = now.gen;
  const tot = CATS.reduce((a, k) => a + gen[k], 0) || 1;
  const mixBar = `<div class="mix">${CATS.filter(k => gen[k] > 0.5).map(k => `<i style="width:${gen[k] / tot * 100}%;background:${CAT_COL[k]}" title="${CAT_NAME[k]}"></i>`).join('')}</div>`;
  const leg = `<div class="legend">${CATS.filter(k => gen[k] > 0.5).map(k => `<span style="--c:${CAT_COL[k]}">${CAT_NAME[k]} ${fmtMW(gen[k])}</span>`).join('')}</div>`;
  const L = last12(s), part = !L && s.months.length ? s.months.reduce((a, m) => { for (const k of CATS) a.gen[k] += m.gen[k]; for (const k of ['served', 'dem', 'shed', 'co2', 'imp', 'exp', 'curt']) a[k] += m[k]; return a; }, newAcc()) : null;
  const sh = (L || part) ? shares(L || part) : null;
  const fleet = {};
  for (const n of s.nodes) if (n.k === 'plant') { const k = n.type; fleet[k] = fleet[k] || { c: 0, mw: 0, b: 0 }; fleet[k].c++; if (n.st === 'build') fleet[k].b++; else fleet[k].mw += n.cap; }
  const ev = activeEv(s), nx = s.ev.find(e => e.start > s.t);
  const wx = `${ev ? `${EVENTS[ev.k].icon} <b>${EVENTS[ev.k].name}</b> now. ` : ''}${nx ? `🔮 ${EVENTS[nx.k].icon} ${EVENTS[nx.k].name} in ~${Math.max(1, Math.round(nx.start - s.t))} h.` : 'No warnings.'}`;
  return ['📊 Grid', `${now.shed > 0.5 ? `<div class="warn">⚡ Rolling blackouts: ${fmtMW(now.shed)} short! Build fast plants or batteries, or connect a border.</div>` : ''}
    ${row('Demand now', fmtMW(now.D))}${row('Spot price', `€${Math.round(s.spot || 0)}/MWh`)}${row('Imports / exports', `${fmtMW(now.imp)} / ${fmtMW(now.exp)}`)}
    ${now.curt > 1 ? row('Curtailed (wasted) renewables', fmtMW(now.curt)) : ''}
    <div class="sec">Generation now</div>${mixBar}${leg}
    <div class="sec">Last 48 hours</div><canvas class="chart" id="mixChart"></canvas>
    <div class="sec">${L ? 'Last 12 months' : 'So far'}</div>
    ${sh ? row('Renewables', `${Math.round(sh.renew * 100)} %`) + row('Clean (incl. nuclear)', `${Math.round(sh.clean * 100)} %`) + row('CO₂ intensity', `${Math.round(sh.co2)} g/kWh`) + row('Reliability', `${(sh.rel * 100).toFixed(2)} %`) + row('Imports', `${Math.round(sh.imp * 100)} % of demand`) : '<div class="note">Stats appear after the first month.</div>'}
    <div class="sec">Weather</div><div class="note">💨 Wind ${s.w.v.toFixed(0)} m/s · ☁️ cloud ${Math.round(s.w.c * 100)} % · 🌡️ ${MONTHS[monthOf(s.t)]}<br>${wx}</div>
    <div class="sec">Your fleet</div>${Object.keys(fleet).length ? BUILD_ORDER.filter(k => fleet[k]).map(k => row(`${PLANTS[k].icon} ${PLANTS[k].name} × ${fleet[k].c}`, `${fmtMW(fleet[k].mw)}${fleet[k].b ? ` <small>(+${fleet[k].b} building)</small>` : ''}`)).join('') : '<div class="note">No plants yet.</div>'}
    ${row('Lines', `${s.lines.length} · ${Math.round(s.lines.reduce((a, l) => a + l.len, 0) * 10)} km`)}`];
}
function drawMixChart(c, s) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (!w) return;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const H = s.hours; if (H.length < 2) { g.fillStyle = '#7a6a52'; g.font = '12px system-ui'; g.fillText('Charts fill in as the clock runs.', 10, h / 2); return; }
  const mx = Math.max(10, ...H.map(x => Math.max(x.D, CATS.reduce((a, k) => a + x.gen[k], 0)))) * 1.1;
  const X = i => 6 + (w - 12) * i / 47, Y = v => h - 16 - (h - 24) * v / mx;
  const cum = H.map(() => 0);
  for (const k of CATS) {
    g.beginPath();
    H.forEach((x, i) => g.lineTo(X(i), Y(cum[i] + x.gen[k])));
    for (let i = H.length - 1; i >= 0; i--) g.lineTo(X(i), Y(cum[i]));
    g.closePath(); g.fillStyle = CAT_COL[k]; g.fill();
    H.forEach((x, i) => cum[i] += x.gen[k]);
  }
  g.strokeStyle = '#2b2216'; g.lineWidth = 1.6; g.beginPath(); H.forEach((x, i) => g.lineTo(X(i), Y(x.D))); g.stroke();
  g.fillStyle = 'rgba(214,69,52,.75)';
  H.forEach((x, i) => { if (x.shed > 0.5) g.fillRect(X(i) - 2, Y(x.D), 4, Y(x.D - x.shed) - Y(x.D)); });
  g.fillStyle = '#7a6a52'; g.font = '10px system-ui';
  g.fillText(fmtMW(mx / 1.1), 8, 12); g.fillText('48 h ago', 8, h - 4); g.textAlign = 'right'; g.fillText('now · black line = demand', w - 8, h - 4); g.textAlign = 'left';
}
function moneyPanel(s) {
  const y = s.fin.y, ly = s.fin.ly || {};
  const K = [['sales', 'Electricity sales'], ['exp', 'Exports'], ['imp', 'Imports'], ['fuel', 'Fuel & start-ups'], ['co2', 'CO₂ certificates'], ['om', 'Plant upkeep'], ['grid', 'Line upkeep'], ['fines', 'Blackout fines'], ['interest', 'Loan interest'], ['rd', 'Research'], ['build', 'Construction']];
  const sum = o => K.reduce((a, [k]) => a + (o[k] || 0), 0);
  const f = v => `<span class="${v < -0.05 ? 'neg' : ''}">${v ? fmtM(v) : '–'}</span>`;
  const sb = s.sc.sandbox;
  return ['💰 Money', `${row('Cash', sb ? '∞ (sandbox)' : `<span class="${s.cash < 0 ? 'neg' : ''}">${fmtM(s.cash)}</span>`)}${sb ? '' : row('Loan', `${fmtM(s.loan)} of ${fmtM(s.sc.loanMax)} · 5 %/yr`)}
    ${sb ? '' : `<div class="acts" style="margin-top:6px"><button class="btn small" data-act="borrow" ${s.loan + 100 > s.sc.loanMax ? 'disabled' : ''}>🏦 Borrow €100M</button><button class="btn small" data-act="repay" ${s.loan < 100 || s.cash < 100 ? 'disabled' : ''}>Repay €100M</button></div>`}
    <div class="sec">Tariff: <b id="tarV">€${s.tariff}/MWh</b></div><input type="range" min="90" max="300" step="5" value="${s.tariff}" id="tarR">
    <div class="note">Fair price is about €160. Higher tariffs earn more but towns grumble; cheaper power makes them happy and grow.</div>
    <div class="sec">Maintenance</div><div class="seg">${MAINT.map((m, i) => `<button data-act="maint:${i}" class="${s.maint === i ? 'on' : ''}">${m.name}</button>`).join('')}</div>
    <div class="note">More maintenance costs more upkeep, but plants break down less and crews repair plants and lines faster.</div>
    <div class="sec">Research budget</div><div class="seg">${R_BUDGETS.map((b, i) => `<button data-act="rd:${i}" class="${s.rdB === i ? 'on' : ''}">${b ? `€${b}M` : 'None'}</button>`).join('')}</div>
    <div class="sec">Accounts</div>
    <table class="fin"><tr><td></td><td><b>Year ${yearOf(s.t)}</b></td><td><b>Last year</b></td></tr>
    ${K.map(([k, n]) => `<tr><td>${n}</td><td>${f(y[k] || 0)}</td><td>${s.fin.ly ? f(ly[k] || 0) : '–'}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${f(sum(y))}</td><td>${s.fin.ly ? f(sum(ly)) : '–'}</td></tr></table>
    <div class="note">CO₂ price €${s.co2p}/t, rising €${s.sc.co2Rise} a year. Gas ${s.w.gas > 1 ? '<b class="neg">double price!</b>' : 'normal'}.</div>`];
}
function researchPanel(s) {
  const list = RESEARCH.filter(r => !r.nuc || s.sc.nuclear).map(r => {
    const done = hasResearch(s, r.id), cur = s.res.cur === r.id, p = (s.res.prog[r.id] || 0) / r.cost;
    return `<div class="ritem ${done ? 'done' : cur ? 'cur' : ''}"><div class="rh"><span>${r.icon} ${r.name}</span>${done ? '✅' : `<small>€${r.cost}M</small>`}</div><p>${r.desc}</p>
      ${done ? '' : `${p > 0 ? bar(p, 'var(--blue)') : ''}${cur ? '<small><b>Researching…</b></small>' : `<button class="btn small" data-act="res:${r.id}">🔬 Research this</button>`}`}</div>`;
  }).join('');
  const eta = s.res.cur && s.rdB ? Math.ceil((RESEARCH.find(r => r.id === s.res.cur).cost - (s.res.prog[s.res.cur] || 0)) / R_BUDGETS[s.rdB] * 12) : null;
  return ['🔬 Research', `<div class="sec">Budget per year</div><div class="seg">${R_BUDGETS.map((b, i) => `<button data-act="rd:${i}" class="${s.rdB === i ? 'on' : ''}">${b ? `€${b}M` : 'None'}</button>`).join('')}</div>
    ${s.res.cur ? `<div class="good">${s.rdB ? `Done in about ${eta} months.` : 'Budget is zero: nothing happens!'}</div>` : '<div class="note">Pick a project. Money is only spent while something is being researched.</div>'}${list}`];
}
function goalsPanel(s) {
  const sc = s.sc, gs = goalState(s), towns = s.nodes.filter(n => n.k === 'town').sort((a, b) => a.sat - b.sat);
  const left = sc.years ? sc.years * 12 - dayOf(s.t) : 0;
  return [`🎯 ${sc.emoji} ${esc(sc.name)}`, `${sc.years ? `<div class="note">Deadline: end of Year ${sc.years} · <b>${Math.max(0, left)} months left</b>. All goals at once wins. 2+ years early = 🥇, 1+ = 🥈.</div>` : '<div class="note">Sandbox: no goals, no deadline. Build freely!</div>'}
    ${gs.map(g => `<div class="goal"><span class="gi">${g.ok ? '✅' : '⬜'}</span><div><b>${g.txt}</b><small>${g.now}</small></div></div>`).join('')}
    <div class="sec">Country</div>${row('Approval', `${satEmoji(approval(s))} ${Math.round(approval(s))} %`)}${row('People', fmtPop(popTotal(s)))}${row('Towns connected', `${towns.filter(t => t.conn).length} / ${towns.length}`)}
    <div class="sec">Towns (grumpiest first)</div>${towns.map(t => `<div class="row" data-act="loc:${t.id}" style="cursor:pointer"><span>${t.conn ? satEmoji(t.sat) : '🕯️'} ${esc(t.name)}</span><b>${t.conn ? Math.round(t.sat) : 'no power'} · ${fmtPop(t.pop)}</b></div>`).join('')}`];
}
function initPanel() {
  const pb = $('panelB');
  pb.addEventListener('pointerdown', () => U.lastPanelIn = performance.now());
  pb.addEventListener('input', e => {
    U.lastPanelIn = performance.now();
    if (e.target.id === 'tarR') { S.s.tariff = +e.target.value; $('tarV').textContent = `€${S.s.tariff}/MWh`; }
  });
  pb.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    U.lastPanelIn = 0;
    const s = S.s, [act, arg] = b.dataset.act.split(':'), o = s.idx[U.arg];
    sfx('tick');
    if (act === 'toggle') { if (o.st === 'off') { o.st = 'on'; o.com = false; } else if (o.st === 'on') { o.st = 'off'; o.com = false; o.out = 0; if (PLANTS[o.type].nuc) quickToast('⚛️', 'Restarting a reactor takes a day and a half.'); } }
    if (act === 'cancel') { const back = o.cost * 0.7; if (!s.sc.sandbox) s.cash += back; addFin(s, 'build', back); removeNode(s, o); closePanel(); }
    if (act === 'demolish') {
      const sal = o.k === 'plant' ? o.cost * (o.type === 'nuclear' || o.type === 'smr' ? -0.1 : 0.2) : 0;
      confirmBox('🗑️ Demolish?', `${esc(o.name)} and its lines will be removed. ${sal > 0 ? `You get ${fmtM(sal)} for scrap.` : sal < 0 ? `Decommissioning costs ${fmtM(-sal)}.` : ''}`, 'Demolish', () => {
        if (!s.sc.sandbox) s.cash += sal; addFin(s, 'build', sal);
        removeNode(s, o); closePanel(); sfx('demolish');
        logNews(s, '🗑️', `${o.name} was demolished.`);
      });
    }
    if (act === 'upgrade') {
      const a = s.idx[o.a], bb = s.idx[o.b], c = lineCost(s, a, bb, o.tier + 1) * 0.8;
      if (c > cashOf(s)) return;
      if (!s.sc.sandbox) s.cash -= c; addFin(s, 'build', -c); o.cost += c;
      o.upg = { tier: o.tier + 1, left: 0.5 + o.len / 25 }; sfx('build');
    }
    if (act === 'rmline') { confirmBox('🗑️ Remove line?', 'Nothing is refunded.', 'Remove', () => { removeLine(s, o); closePanel(); sfx('demolish'); }); }
    if (act === 'borrow') { s.loan += 100; s.cash += 100; sfx('coin'); }
    if (act === 'repay') { s.loan -= 100; s.cash -= 100; sfx('coin'); }
    if (act === 'maint') s.maint = +arg;
    if (act === 'rd') s.rdB = +arg;
    if (act === 'res') { s.res.cur = arg; if (!s.rdB) s.rdB = 1; }
    if (act === 'loc') locate(+arg);
    renderPanel(true);
  });
  $('panelX').onclick = () => { closePanel(); sfx('tick'); };
}
function locate(id) {
  const s = S.s, o = s.idx[id];
  if (!o) return;
  let x, y;
  if (typeof id === 'string') { const a = s.idx[o.a], b = s.idx[o.b]; x = (a.x + b.x) / 2 + 0.5; y = (a.y + b.y) / 2 + 0.5; }
  else { x = o.x + 0.5; y = o.y + 0.5; }
  const w = iso(x, y); R.cam.x = w.x; R.cam.y = w.y + (innerWidth < 900 ? 80 / R.cam.z : 0);
  R.cam.z = Math.max(R.cam.z, 0.9); clampCam(s);
  select(id);
}

// ---------------------------------------------------------------- HUD
function setPlaying(p) {
  U.playing = p && !(S.s && S.s.over && !S.s.keepPlaying);
  $('playBtn').textContent = U.playing ? '❚❚' : '▶';
  $('playBtn').classList.toggle('on', !U.playing);
  $('spdBtn').textContent = SPEEDS[U.spd] + '×';
  wakeLock(U.playing);
}
function updHud(s) {
  const c = $('cashV');
  c.textContent = s.sc.sandbox ? '∞' : fmtM(s.cash);
  c.classList.toggle('neg', s.cash < 0 && !s.sc.sandbox);
  $('dateV').textContent = `${dateStr(s.t)} ${timeStr(s.t)}`;
  const a = approval(s);
  $('apprV').textContent = `${satEmoji(a)} ${Math.round(a)}%`;
  const now = s.now || { D: 0, shed: 0 };
  $('loadV').textContent = now.shed > 0.5 ? `⚡ −${fmtMW(now.shed)}` : `⚡ ${fmtMW(now.D)}`;
  $('hLoad').classList.toggle('shed', now.shed > 0.5);
  const ev = activeEv(s), sun = sunNow(s);
  const wi = ev ? EVENTS[ev.k].icon : R.night > 0.6 ? '🌙' : s.w.c > 0.7 ? '☁️' : s.w.c > 0.4 ? '⛅' : '☀️';
  $('wxV').textContent = `${wi} ${s.w.v.toFixed(0)} m/s`;
  const dot = !s.res.cur && RESEARCH.some(r => !hasResearch(s, r.id) && (!r.nuc || s.sc.nuclear));
  const rb = document.querySelector('#toolbar [data-p=research]');
  if (dot && !rb.querySelector('.dot')) rb.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
  if (!dot && rb.querySelector('.dot')) rb.querySelector('.dot').remove();
}

// ---------------------------------------------------------------- toasts, modal
function showToast(icon, text, id) {
  const box = $('toasts');
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<i>${icon}</i><span>${esc(text)}</span>`;
  if (id !== undefined) { el.style.cursor = 'pointer'; el.onclick = () => { locate(id); el.remove(); }; }
  box.prepend(el);
  while (box.children.length > (innerWidth < 600 ? 2 : 3)) box.lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
function quickToast(i, t) { showToast(i, t); }
function confirmBox(h, body, ok, fn) {
  $('modalH').textContent = h; $('modalB').innerHTML = body;
  $('modalA').innerHTML = `<button class="btn" id="mNo">Cancel</button><button class="btn red" id="mYes">${ok}</button>`;
  $('modal').classList.remove('hidden');
  $('mNo').onclick = () => $('modal').classList.add('hidden');
  $('mYes').onclick = () => { $('modal').classList.add('hidden'); fn(); };
}

// ---------------------------------------------------------------- thoughts
function thinkFor(s, n) {
  let cat;
  if (n.dark) cat = 'black';
  else if (!n.conn) cat = 'wait';
  else {
    const p = n.parts || {}, opts = [];
    if (p.rel < -3) opts.push(['black', -p.rel]);
    if (p.price < -3) opts.push(['pricey', -p.price]);
    if (p.price > 3) opts.push(['cheap', p.price * 0.6]);
    if (p.smog < -2) opts.push(['smog', -p.smog * 1.2]);
    if (p.view < -2) opts.push([Math.random() < 0.6 ? 'pylons' : 'wind', -p.view]);
    if (p.nuke < -2) opts.push(['nuke', 4]);
    if (p.green > 4) opts.push(['green', p.green * 0.5]);
    if (n.boom) opts.push(['grow', 4]);
    opts.push(['good', n.sat > 60 ? 6 : 1]);
    let tw = opts.reduce((a, o) => a + o[1], 0), r = Math.random() * tw;
    for (const [k, w] of opts) { r -= w; if (r <= 0) { cat = k; break; } }
    cat = cat || 'good';
  }
  const L = THOUGHTS[cat], [e, t] = L[Math.floor(Math.random() * L.length)];
  n.thoughts = [`${e} “${t}”`, ...(n.thoughts || [])].slice(0, 3);
  if (S.set.thoughts && R.bubbles.length < (innerWidth < 600 ? 2 : 4) && !R.bubbles.some(b => b.id === n.id)) R.bubbles.push({ id: n.id, emoji: e, text: t, life: 0, max: 3.8 });
}
function tickThoughts(s, dt) {
  if (!U.playing) return;
  U.thoughtT -= dt;
  if (U.thoughtT > 0) return;
  U.thoughtT = 2.4 + Math.random() * 1.5;
  const vis = s.nodes.filter(n => n.k === 'town').filter(n => { const [x, y] = sp(n.x + 0.5, n.y + 0.5); return x > 40 && x < R.W - 40 && y > 90 && y < R.H - 120; });
  if (!vis.length) return;
  const n = vis[Math.floor(Math.random() * vis.length)];
  if (R.bubbles.some(b => b.id === n.id)) return;
  thinkFor(s, n);
}

// ---------------------------------------------------------------- advisor (First Spark tour)
const TUT = [
  { t: 'Welcome, grid operator!', p: 'The six towns of this valley have never had electricity. You have €700M to change that. Tap <b>🏗️ Build</b> below.', done: () => U.tool === 'build' },
  { t: 'Place a power plant', p: 'Pick the <b>🏭 Gas CCGT</b> card (400 MW, enough for the valley to start). Then tap a green tile next to the biggest town, and tap it again to build.', done: s => s.nodes.some(n => n.k === 'plant') },
  { t: 'Connect it', p: 'Now tap <b>🗼 Lines</b>. Pick <b>220 kV</b>, tap your new plant, then tap the town next to it (twice to confirm).', done: s => s.lines.length > 0 },
  { t: 'Start the clock', p: 'Press <b>▶</b> at the top right. The plant takes a few months to build: use <b>3×</b> or <b>8×</b> to speed up. Each day on the clock is a whole month.', done: () => U.playing },
  { t: 'Reach every town', p: 'Keep stringing lines from town to town. Tap empty ground to drop a substation as a junction. A town lights up once a working plant reaches it.', done: s => s.nodes.filter(n => n.k === 'town' && n.conn).length >= 3 },
  { t: 'Watch the wires', p: 'Colours show how busy a line is: green, yellow, orange, then <b>red</b> at 100 %. A red line heats up 🔥 and trips. Thin 110 kV lines carry only 220 MW.', info: 1 },
  { t: 'Plants break down', p: 'Now and then a plant trips 💥. Big plants can’t make up the gap fast, so towns get a blackout. A <b>🔋 battery</b> or a <b>🔥 gas peaker</b> covers it in seconds. A second line to a town (a loop) keeps it lit when one line trips.', info: 1 },
  { t: 'Your goals', p: 'Connect all six towns and reach <b>70 % approval</b> by the end of Year 3. Check <b>🎯 Goals</b>, set the tariff in <b>💰 Money</b>, and start some <b>🔬 research</b>. Good luck!', info: 1 },
];
function showTut() {
  const s = S.s;
  if (!s || s.tut < 0 || s.tut >= TUT.length || !S.set.tips) { $('advisor').classList.add('hidden'); return; }
  const st = TUT[s.tut];
  $('advT').innerHTML = st.t; $('advP').innerHTML = st.p;
  $('advOk').classList.toggle('hidden', !st.info);
  $('advOk').textContent = s.tut === TUT.length - 1 ? 'Let’s go!' : 'Got it';
  $('advisor').classList.remove('hidden');
  U.tutT = 0; advisorPos();
}
function tickTut(dt) {
  const s = S.s;
  if (!s || s.tut < 0 || s.tut >= TUT.length) return;
  U.tutT += dt;
  const st = TUT[s.tut];
  if (!st.info && st.done(s)) { s.tut++; sfx('coin'); showTut(); }
}
function advisorPos() { const up = !$('drawer').classList.contains('hidden') || !$('panel').classList.contains('hidden'); $('advisor').classList.toggle('up', up && innerWidth < 900 || (!$('drawer').classList.contains('hidden') && innerWidth >= 900)); }
function initAdvisor() {
  $('advOk').onclick = () => { S.s.tut++; showTut(); sfx('tick'); };
  $('advSkip').onclick = () => { S.s.tut = -1; showTut(); sfx('tick'); };
}
