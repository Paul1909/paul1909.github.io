// Grid Operator Tycoon: boot, game loop, saving, title and end screens, sound, share.
'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// All games in the repo share one localStorage, so every key gets this app's prefix (APP = 'grid-operator-tycoon', from data.js).
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(APP + ':' + k); } catch {} },
};
const installed = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
S.set = Object.assign({ sound: true, vib: true, thoughts: true, tips: true }, store.get('settings', {}));
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

// ---------------------------------------------------------------- sound (Web Audio, no files)
let AC = null;
function audioUnlock() {
  if (!S.set.sound) return;
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch {}
}
function tone(f, d, type = 'sine', v = 0.12, t0 = 0, f2) {
  if (!AC || !S.set.sound) return;
  const t = AC.currentTime + t0, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
}
function sfx(k) {
  if (!AC || !S.set.sound) return;
  if (k === 'tick') tone(900, 0.05, 'triangle', 0.05);
  else if (k === 'err') tone(220, 0.18, 'square', 0.06, 0, 160);
  else if (k === 'build') { tone(320, 0.08, 'square', 0.07); tone(480, 0.1, 'square', 0.07, 0.07); tone(160, 0.12, 'triangle', 0.1, 0.15); }
  else if (k === 'line') { tone(600, 0.06, 'triangle', 0.07); tone(800, 0.09, 'triangle', 0.07, 0.06); }
  else if (k === 'coin') { tone(988, 0.08, 'square', 0.06); tone(1319, 0.18, 'square', 0.06, 0.08); }
  else if (k === 'trip') { tone(440, 0.35, 'sawtooth', 0.06, 0, 110); }
  else if (k === 'black') { tone(300, 0.5, 'sawtooth', 0.05, 0, 60); }
  else if (k === 'demolish') { tone(140, 0.25, 'square', 0.08, 0, 60); }
  else if (k === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.06, i * 0.13));
  else if (k === 'lose') [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.18));
}
function buzz(ms) { if (S.set.vib) navigator.vibrate?.(ms); }
let wl = null;
async function wakeLock(on) {
  try {
    if (on && !wl && navigator.wakeLock) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    else if (!on && wl) { wl.release(); wl = null; }
  } catch {}
}
let lastTripSfx = 0;
S.onNews = n => { if (S.s && !$('app').classList.contains('hidden')) showToast(n.i, n.x, n.id); };
S.onTrip = () => { if (performance.now() - lastTripSfx > 1500) { sfx('trip'); buzz([30, 40, 30]); lastTripSfx = performance.now(); } };
S.onBlack = n => { if (performance.now() - lastTripSfx > 1500) { sfx('black'); lastTripSfx = performance.now(); if (R.bubbles.length < 2) thinkFor(S.s, n); } };
S.onCoin = () => sfx('coin');
S.onBuilt = () => sfx('coin');
S.onResearch = () => { sfx('win'); if (U.tool) refreshDrawer(); };
S.onMonth = () => { saveGame(); };
S.onEnd = o => { setTimeout(() => showEnd(o), 600); };

// ---------------------------------------------------------------- save / load
function saveGame() {
  const s = S.s; if (!s) return;
  const json = JSON.stringify(s, (k, v) => (k === 'idx' || k === 'islands' || k === 'now' || k === 'hourAcc') ? undefined : v);
  try { localStorage.setItem(APP + ':save:' + s.scId, json); } catch {}
  store.set('last', s.scId);
}
function loadGame(id) {
  const s = store.get('save:' + id, null);
  if (!s || s.v !== 1) return null;
  reindex(s); s.topoDirty = true; rebuildTopo(s); s.warm = true;
  return s;
}

// ---------------------------------------------------------------- game loop
let lastT = performance.now(), simAcc = 0, hudT = 0, panelT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try { tick(now); } catch (e) { console.error(e); }
}
function tick(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const s = S.s;
  if (s && !$('app').classList.contains('hidden')) {
    if (U.playing && !(s.over && !s.keepPlaying)) {
      simAcc += dt * SPEEDS[U.spd];
      let n = 0;
      while (simAcc >= STEP && n < 160) { step(s, STEP); simAcc -= STEP; n++; }
      if (n >= 160) simAcc = 0;
    }
    renderFrame(s, dt);
    tickThoughts(s, dt);
    tickTut(dt);
    hudT -= dt; if (hudT <= 0) { updHud(s); hudT = 0.25; }
    panelT -= dt; if (panelT <= 0) { renderPanel(false); panelT = 0.5; }
  }
}

function startGame(s) {
  S.s = s;
  prepMap(s);
  $('title').classList.add('hidden'); $('endScr').classList.add('hidden'); $('howto').classList.add('hidden');
  $('app').classList.remove('hidden');
  resize(); fitCamera(s); clampCam(s);
  R.sel = null; R.parts = []; R.bubbles = []; R.floats = [];
  setTool(null); closePanel();
  U.spd = 0; setPlaying(false);
  updHud(s); showTut();
  if (!history.state || !history.state.g) history.pushState({ g: 1 }, '');
  saveGame();
}
function exitToTitle() {
  saveGame(); setPlaying(false);
  $('app').classList.add('hidden'); $('menuScr').classList.add('hidden'); $('endScr').classList.add('hidden');
  S.s = null;
  showTitle();
}

// ---------------------------------------------------------------- title
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' };
function showTitle() {
  $('title').classList.remove('hidden');
  const medals = store.get('medals', {});
  $('scenList').innerHTML = SCENARIOS.map(sc => {
    const sv = store.get('save:' + sc.id, null);
    const cont = sv && sv.v === 1 && !(sv.over && !sv.keepPlaying) ? `<button class="btn small gold" data-cont="${sc.id}">▶ Continue · ${dateStr(sv.t)}</button>` : '';
    return `<div class="scen"><canvas data-mini="${sc.id}"></canvas><div class="sb">${medals[sc.id] ? `<span class="medal">${MEDAL[medals[sc.id]]}</span>` : ''}<h3>${sc.emoji} ${sc.name}</h3>
      <div class="st">${sc.stars ? '★'.repeat(sc.stars) + '☆'.repeat(3 - sc.stars) : 'free play'}${sc.years ? ` · ${sc.years} years` : ''}</div><p>${sc.blurb}</p>
      ${sc.goals.length ? `<ul class="gl">${sc.goals.map(g => `<li>${GOAL_TEXT[g.k](g.v)}</li>`).join('')}</ul>` : ''}
      <div class="acts">${cont}<button class="btn small ${cont ? '' : 'gold'}" data-new="${sc.id}">${cont ? 'New game' : '▶ Play'}</button></div></div></div>`;
  }).join('');
  // draw map thumbnails a little later so the title shows at once
  let k = 0;
  const minis = [...document.querySelectorAll('[data-mini]')];
  const next = () => {
    const c = minis[k++]; if (!c) return;
    try {
      const s = newGame(c.dataset.mini), dpr = Math.min(2, devicePixelRatio || 1);
      c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      drawMiniMap(g, s, 4, 4, c.clientWidth - 8, c.clientHeight - 8);
    } catch (e) { console.warn(e); }
    setTimeout(next, 30);
  };
  setTimeout(next, 60);
}
function initTitle() {
  $('scenList').addEventListener('click', e => {
    const c = e.target.closest('[data-cont]'), n = e.target.closest('[data-new]');
    audioUnlock();
    if (c) { const s = loadGame(c.dataset.cont); if (s) { sfx('coin'); startGame(s); } }
    if (n) {
      const id = n.dataset.new, sv = store.get('save:' + id, null);
      const go = () => { sfx('coin'); startGame(newGame(id)); };
      if (sv && !(sv.over && !sv.keepPlaying)) confirmBox('Start over?', 'Your saved game of this scenario will be replaced.', 'New game', go); else go();
    }
  });
  $('howBtn').onclick = () => { $('howto').classList.remove('hidden'); $('howto').scrollTop = 0; };
  $('howBack').onclick = () => $('howto').classList.add('hidden');
  $('setBtn').onclick = () => { renderSettings($('settingsBox2')); $('setScr').classList.remove('hidden'); };
  $('setDone').onclick = () => $('setScr').classList.add('hidden');
  $('shareApp').onclick = () => shareApp();
}
function renderSettings(box) {
  const items = [['sound', 'Sound', 'Clicks, alarms and coins'], ['vib', 'Vibration', 'Buzz on trips and builds'], ['thoughts', 'Town thoughts', 'Speech bubbles over towns'], ['tips', 'Advisor tips', 'The guided tour in First Spark']];
  box.innerHTML = items.map(([k, n, d]) => `<div class="setting"><span>${n}<small>${d}</small></span><button class="switch ${S.set[k] ? 'on' : ''}" data-set="${k}" aria-label="${n}"></button></div>`).join('');
  box.onclick = e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    S.set[b.dataset.set] = !S.set[b.dataset.set]; store.set('settings', S.set);
    b.classList.toggle('on', S.set[b.dataset.set]);
    if (b.dataset.set === 'sound' && S.set.sound) { audioUnlock(); sfx('coin'); }
    if (b.dataset.set === 'tips' && S.s) showTut();
  };
}

// ---------------------------------------------------------------- menu
function openMenu() { setPlaying(false); renderSettings($('settingsBox')); $('menuScr').classList.remove('hidden'); }
function initMenu() {
  $('menuBtn').onclick = () => { openMenu(); sfx('tick'); };
  $('mResume').onclick = () => { $('menuScr').classList.add('hidden'); };
  $('mNews').onclick = () => { $('menuScr').classList.add('hidden'); openPanel('news'); };
  $('mHow').onclick = () => { $('menuScr').classList.add('hidden'); $('howto').classList.remove('hidden'); $('howto').scrollTop = 0; };
  $('mShare').onclick = () => { $('menuScr').classList.add('hidden'); shareGrid(false); };
  $('mRestart').onclick = () => confirmBox('Restart?', 'Start this scenario again from scratch.', 'Restart', () => { $('menuScr').classList.add('hidden'); startGame(newGame(S.s.scId)); });
  $('mQuit').onclick = () => exitToTitle();
  $('menuScr').addEventListener('click', e => { if (e.target.id === 'menuScr') $('menuScr').classList.add('hidden'); });
  $('playBtn').onclick = () => { audioUnlock(); setPlaying(!U.playing); sfx('tick'); };
  $('spdBtn').onclick = () => { U.spd = (U.spd + 1) % SPEEDS.length; setPlaying(true); sfx('tick'); };
  addEventListener('popstate', () => {
    if ($('app').classList.contains('hidden')) return;
    history.pushState({ g: 1 }, '');
    if (!$('modal').classList.contains('hidden')) { $('modal').classList.add('hidden'); return; }
    if (!$('howto').classList.contains('hidden')) { $('howto').classList.add('hidden'); return; }
    if (!$('menuScr').classList.contains('hidden')) { $('menuScr').classList.add('hidden'); return; }
    if (U.tool) { setTool(null); return; }
    if (U.panel) { closePanel(); return; }
    openMenu();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); } else if (U.playing) { wl = null; wakeLock(true); } });
}

// ---------------------------------------------------------------- end screen
function endStats(s) {
  const L = last12(s) || s.months.reduce((a, m) => { for (const k of CATS) a.gen[k] += m.gen[k]; for (const k of ['served', 'dem', 'shed', 'co2', 'imp', 'exp', 'curt']) a[k] += m[k]; return a; }, newAcc());
  const sh = shares(L);
  return [['Approval', `${Math.round(approval(s))} %`], ['People served', fmtPop(popTotal(s))], ['Renewables', `${Math.round(sh.renew * 100)} %`],
    ['CO₂', `${Math.round(sh.co2)} g/kWh`], ['Reliability', `${(sh.rel * 100).toFixed(2)} %`], ['Cash', s.sc.sandbox ? '∞' : fmtM(s.cash)]];
}
function showEnd(o) {
  const s = S.s; if (!s) return;
  setPlaying(false); saveGame();
  const win = o.res === 'win';
  if (win) { const m = store.get('medals', {}), rank = { bronze: 1, silver: 2, gold: 3 }; if ((rank[o.medal] || 0) > (rank[m[s.scId]] || 0)) { m[s.scId] = o.medal; store.set('medals', m); } }
  sfx(win ? 'win' : 'lose');
  $('endEm').textContent = win ? MEDAL[o.medal] : o.why === 'bankrupt' ? '🏦' : o.why === 'licence' ? '🏛️' : '⌛';
  $('endH').textContent = win ? 'Scenario complete!' : 'Scenario failed';
  const why = { bankrupt: 'The bank took over: you were in the red for four months running.', licence: 'The regulator revoked your licence after six months of rock-bottom approval.', deadline: `Time's up: not every goal was met by the end of Year ${s.sc.years}.` };
  $('endP').innerHTML = win ? `${esc(s.sc.name)} done in ${dateStr(s.t)}. ${o.medal === 'gold' ? 'Two years early or more: gold!' : o.medal === 'silver' ? 'A year early: silver!' : 'Just in time: bronze!'}` : why[o.why];
  $('endStats').innerHTML = endStats(s).map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('');
  $('endScr').classList.remove('hidden');
  recap = buildRecap(s, o);
}
function initEnd() {
  $('endShare').onclick = () => shareGrid(true);
  $('endKeep').onclick = () => { S.s.keepPlaying = true; $('endScr').classList.add('hidden'); saveGame(); };
  $('endBack').onclick = () => exitToTitle();
}

// ---------------------------------------------------------------- share
let recap = null;
function buildRecap(s, o) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#5fa8e8'); bg.addColorStop(1, '#1f5596');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '900 86px system-ui, sans-serif'; g.lineWidth = 10; g.strokeStyle = '#3b2f1e'; g.strokeText('GRID OPERATOR', W / 2, 120); g.fillStyle = '#ffc857'; g.fillText('GRID OPERATOR', W / 2, 120);
  g.font = '900 60px system-ui, sans-serif'; g.lineWidth = 8; g.strokeText('TYCOON', W / 2, 192); g.fillStyle = '#fff'; g.fillText('TYCOON', W / 2, 192);
  const head = o ? (o.res === 'win' ? `${MEDAL[o.medal]} ${s.sc.name} complete!` : `${s.sc.name}: so close…`) : `${s.sc.emoji} My grid in ${s.sc.name}`;
  g.font = '800 46px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(head, W / 2, 272);
  g.font = '600 32px system-ui, sans-serif'; g.fillStyle = '#dbe9ff'; g.fillText(`${dateStr(s.t)} · ${s.nodes.filter(n => n.k === 'plant').length} plants · ${Math.round(s.lines.reduce((a, l) => a + l.len, 0) * 10)} km of lines`, W / 2, 320);
  g.fillStyle = 'rgba(255,248,232,.96)'; g.strokeStyle = '#3b2f1e'; g.lineWidth = 6;
  roundRect(g, 60, 350, W - 120, 560, 30); g.fill(); g.stroke();
  g.save(); roundRect(g, 66, 356, W - 132, 548, 26); g.clip(); g.fillStyle = '#2a6db8'; g.fillRect(66, 356, W - 132, 548); drawMiniMap(g, s, 80, 366, W - 160, 528); g.restore();
  const st = endStats(s);
  st.forEach(([a, b], i) => {
    const x = 60 + (i % 3) * 330, y = 950 + Math.floor(i / 3) * 150;
    g.fillStyle = '#fff8e8'; roundRect(g, x, y, 300, 128, 22); g.fill(); g.stroke();
    g.fillStyle = '#7a6a52'; g.font = '700 26px system-ui, sans-serif'; g.fillText(a.toUpperCase(), x + 150, y + 46);
    g.fillStyle = '#2b2216'; g.font = '900 44px system-ui, sans-serif'; g.fillText(b, x + 150, y + 102);
  });
  g.fillStyle = '#fff'; g.font = '700 30px system-ui, sans-serif'; g.fillText(GAME_URL.replace(/^https?:\/\//, ''), W / 2, H - 36);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function doShare(text, blob) {
  const file = blob && new File([blob], `${APP}.png`, { type: 'image/png' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Grid Operator Tycoon', text, url: GAME_URL });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${APP}.png`; a.click(); }
  try { await navigator.clipboard.writeText(text); showToast('🔗', 'Link copied'); } catch { showToast('🔗', GAME_URL); }
}
async function shareGrid(end) {
  const s = S.s; if (!s) return;
  const o = end ? s.over : null;
  const blob = await (end && recap ? recap : buildRecap(s, o));
  const L = last12(s), sh = L ? shares(L) : null;
  const text = o && o.res === 'win'
    ? `I beat ${s.sc.name} in Grid Operator Tycoon ${MEDAL[o.medal]} with ${Math.round(approval(s))} % approval${sh ? ` and ${Math.round(sh.renew * 100)} % renewables` : ''}. Your turn: ${GAME_URL}`
    : `I'm running the power grid of ${s.sc.name} in Grid Operator Tycoon: ${fmtPop(popTotal(s))} customers, ${Math.round(approval(s))} % approval. Can you keep the lights on? ${GAME_URL}`;
  doShare(text, blob);
}
function shareApp() { doShare(`Grid Operator Tycoon: build a country's power grid, keep the lights on, keep the towns happy. ${GAME_URL}`, null); }

// ---------------------------------------------------------------- boot
initRender($('map'));
initInput(); initDrawer(); initPanel(); initAdvisor(); initTitle(); initMenu(); initEnd();
showTitle();
requestAnimationFrame(frame);
