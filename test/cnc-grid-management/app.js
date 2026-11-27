// Game loop, screens, saving, sound, EVA voice, share, offline service worker.
'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Every key is prefixed with APP ('cnc-grid-management'), since all arcade games share one localStorage.
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(APP + ':' + k); } catch {} },
};
const opts = Object.assign({ sound: 1, voice: 1, vib: 1 }, store.get('opts', {}));
const saveOpts = () => store.set('opts', opts);
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

// ---------- sound (Web Audio, generated) ----------
let AC = null, master = null;
function ensureAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination); } catch { return; } }
  if (AC.state === 'suspended') AC.resume();
}
function tone(f, d, type = 'square', vol = .12, f2, delay = 0) {
  if (!AC || !opts.sound) return; const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02);
}
function noise(d, vol = .15, hp = 1500, delay = 0) {
  if (!AC || !opts.sound) return; const t = AC.currentTime + delay, n = AC.sampleRate * d | 0, b = AC.createBuffer(1, n, AC.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = AC.createBufferSource(); s.buffer = b; const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = AC.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
function sfx(k) {
  switch (k) {
    case 'click': tone(1200, .04, 'square', .05); break;
    case 'tick': tone(2400, .015, 'square', .025); break;
    case 'ready': tone(660, .08, 'square', .08); tone(990, .12, 'square', .08, null, .08); break;
    case 'place': noise(.25, .25, 200); tone(90, .25, 'sawtooth', .12, 50); break;
    case 'sell': tone(900, .06, 'square', .06); tone(1400, .08, 'square', .06, null, .06); noise(.15, .08, 3000); break;
    case 'cash': tone(1600, .05, 'square', .05); tone(2100, .07, 'square', .05, null, .05); break;
    case 'zap': noise(.3, .25, 2500); tone(180, .3, 'sawtooth', .08, 2400); break;
    case 'low': tone(300, .2, 'square', .09); tone(220, .3, 'square', .09, null, .22); break;
    case 'warn': tone(880, .09, 'square', .06); tone(880, .09, 'square', .06, null, .14); break;
    case 'connect': tone(523, .08, 'triangle', .12); tone(659, .08, 'triangle', .12, null, .08); tone(784, .16, 'triangle', .12, null, .16); break;
    case 'deny': tone(160, .18, 'square', .09); break;
    case 'obj': tone(784, .1, 'triangle', .12); tone(1046, .2, 'triangle', .12, null, .1); break;
    case 'ack': tone(700, .05, 'square', .05); tone(500, .05, 'square', .05, null, .05); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, .25, 'triangle', .14, null, i * .14)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, .3, 'sawtooth', .1, null, i * .18)); break;
  }
}
function vib(p) { if (opts.vib) navigator.vibrate?.(p); }

// EVA voice: the phone's own speech engine, works offline on most devices.
let voice = null;
function pickVoice() { const vs = speechSynthesis.getVoices(); voice = vs.find(v => /en[-_]GB/i.test(v.lang) && /female|samantha|serena|kate|hazel|susan|libby|sonia/i.test(v.name)) || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(t) {
  if (!opts.voice || !('speechSynthesis' in window) || !GM.playing) return;
  try { const u = new SpeechSynthesisUtterance(t); if (voice) u.voice = voice; u.rate = 1.02; u.pitch = .82; u.volume = .9; if (speechSynthesis.speaking) speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
}

// ---------- screens ----------
const SCREENS = ['title', 'brief', 'menu', 'help', 'end'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); $('app').classList.toggle('hidden', !GM.st || id === 'title' || id === 'brief'); }
let skTheme = store.get('skTheme', 'winter');
function titleScreen() {
  GM.playing = false; show('title');
  const prog = store.get('progress', {}), save = store.get('save', null);
  const cont = $('bContinue'); cont.classList.toggle('hidden', !save);
  if (save) { const M = MISSIONS.find(m => m.id === save.mission); $('contInfo').textContent = `${M.code} · ${M.name} · Day ${dayOf(save.hour)}`; }
  const list = $('missionList'); list.innerHTML = '';
  for (const M of MISSIONS) {
    const b = document.createElement('button'); b.className = 'mbtn';
    const p = prog[M.id];
    const extra = M.endless ? (p ? `Best: ${p.best} days` : 'Survive as long as you can') + ` · ${skTheme === 'winter' ? 'Winter' : 'Spring'} map` : (p && p.done ? '★ Accomplished' : M.brief[0].slice(0, 70) + '…');
    b.innerHTML = `${M.code}: ${M.name}<small>${extra}</small>`;
    b.onclick = () => { ensureAudio(); sfx('click'); briefing(M.id); };
    list.appendChild(b);
    if (M.endless) {
      const t = document.createElement('button'); t.className = 'mbtn'; t.style.cssText = 'margin-top:-2px;padding:6px;font-size:11px';
      t.textContent = 'Skirmish map: ' + (skTheme === 'winter' ? 'Winter' : 'Spring') + ' (tap to switch)';
      t.onclick = () => { skTheme = skTheme === 'winter' ? 'temperate' : 'winter'; store.set('skTheme', skTheme); titleScreen(); };
      list.appendChild(t);
    }
  }
  $('bSound').textContent = 'Sound: ' + (opts.sound ? 'on' : 'off'); $('bVoice').textContent = 'Voice: ' + (opts.voice ? 'on' : 'off');
}
let typing = 0;
function briefing(id) {
  const M = MISSIONS.find(m => m.id === id); show('brief');
  const el = $('briefText'), full = M.brief.join('\n\n'); el.innerHTML = '';
  const head = `<span class="h">${M.code} · ${M.name.toUpperCase()}</span>\n\n`;
  let i = 0; clearInterval(typing);
  typing = setInterval(() => { i += 2; el.innerHTML = head + full.slice(0, i).replace(/</g, '&lt;') + (i < full.length ? '█' : ''); if (i % 6 === 0) tone(2000 + Math.random() * 400, .01, 'square', .02); if (i >= full.length) clearInterval(typing); }, 22);
  el.onclick = () => { i = full.length; };
  $('briefGoals').innerHTML = M.goals.map(g => `<li>${g.text}</li>`).join('');
  $('bBriefGo').onclick = () => { clearInterval(typing); startGame(newGame(id, { theme: M.endless ? skTheme : undefined })); };
  $('bBriefBack').onclick = () => { clearInterval(typing); titleScreen(); };
}

function startGame(st) {
  GM.st = st; GM.sel = null; GM.ui.mode = null; GM.ui.place = null; GM.ui.lineDrag = null; GM.ui.mapArrow = null;
  if (!st.brk) st.brk = {};
  if (st.dirty !== 0 || !st.occS) derive(st);
  show(null); $('app').classList.remove('hidden');
  renderInit(st); resize();
  RD.cam.z = Math.min(RD.vw, RD.vh) < 500 ? 1.6 : 2.2;
  const y = st.structs[0]; centerOn(st, (y.x + 1.5) * TS + (matchMedia('(orientation: portrait)').matches ? 0 : 40), (y.y + 1.5) * TS);
  buildSidebar(st); showSel(); setMode(null);
  $('eva').innerHTML = ''; $('tut').classList.add('hidden');
  if (st.tut >= 0) tutCheck();
  shownCred = st.credits;
  GM.playing = true; GM.paused = false;
  history.pushState({ g: 1 }, '');
  wake();
  EVA(mission(st).name + '.', 'start');
  setTimeout(() => speak('Welcome back, Commander.'), 300);
}

function openMenu() {
  if (!GM.st || GM.st.over) return; GM.paused = true; show('menu'); $('app').classList.remove('hidden');
  const M = mission(GM.st);
  $('menuGoals').innerHTML = `<li style="list-style:none;color:var(--gold)">${M.code} · ${M.name}</li>` + M.goals.map(g => `<li class="${GM.st.goals[g.key] || ''}">${g.text}</li>`).join('');
  syncToggles(); save();
}
function resume() { GM.paused = false; show(null); $('app').classList.remove('hidden'); lastT = performance.now(); wake(); }
function syncToggles() { for (const [id, k] of [['tSound', 'sound'], ['tVoice', 'voice'], ['tVib', 'vib']]) { const b = $(id); b.textContent = opts[k] ? 'ON' : 'OFF'; b.classList.toggle('on', !!opts[k]); } }

// ---------- saving ----------
const DERIVED = new Set(['occS', 'occT', 'byId', 'islands', 'find', 'par', 'fx', 'acc', 'isl']);
function save() {
  const st = GM.st; if (!st || st.over) return;
  try { store.set('save', JSON.parse(JSON.stringify(st, (k, v) => DERIVED.has(k) ? undefined : v))); } catch {}
}
function loadSave() { const s = store.get('save', null); if (!s) return null; s.fx = []; s.dirty = 1; return s; }

// ---------- end of mission ----------
function onMissionEnd(st) {
  const M = mission(st), win = st.over.win;
  setTimeout(() => {
    GM.playing = false; store.del('save');
    const prog = store.get('progress', {}); const p = prog[M.id] || {};
    if (M.endless) { const days = Math.max(0, Math.floor((st.hour - (M.start || 6)) / 24)); p.best = Math.max(p.best || 0, days); p.done = 1; st.over.days = days; }
    else if (win) p.done = 1;
    prog[M.id] = p; store.set('progress', prog);
    speak(M.endless ? 'Battle control terminated.' : win ? 'Mission accomplished.' : 'Mission failed.'); sfx(win || M.endless ? 'win' : 'lose');
    show('end');
    const t = $('endTitle'); t.textContent = M.endless ? `Held for ${st.over.days} day${st.over.days === 1 ? '' : 's'}` : win ? 'Mission accomplished' : 'Mission failed'; t.className = 'sc ' + (win || M.endless ? 'win' : 'lose');
    $('endWhy').textContent = (M.endless ? (st.over.why || '') : win ? `${M.code} · ${M.name}` : st.over.why);
    const S_ = st.stats, rows = recapRows(st);
    $('endStats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span data-v="${b}">0</span>`).join('');
    countUp();
    $('endGoals').innerHTML = M.goals.filter(g => !M.endless).map(g => `<li class="${st.goals[g.key] || ''}">${g.text}</li>`).join('');
    const nextM = MISSIONS[MISSIONS.indexOf(M) + 1];
    const nb = $('bEndNext');
    if (win && nextM && !M.endless) { nb.textContent = 'Next: ' + nextM.name; nb.onclick = () => briefing(nextM.id); }
    else { nb.textContent = 'Try again'; nb.onclick = () => briefing(M.id); }
    recap = buildRecap(st);
  }, win ? 1200 : 900);
}
function recapRows(st) {
  const S_ = st.stats, served = S_.dem ? S_.served / S_.dem * 100 : 100;
  return [
    ['Energy delivered', (S_.served / 1000).toFixed(1) + ' GWh'], ['Share of demand served', served.toFixed(1) + ' %'],
    ['Hours with blackouts', S_.blackoutH.toFixed(1) + ' h'], ['CO₂ emitted', (S_.co2 / 1000).toFixed(1) + ' kt'],
    ['Credits earned', '$ ' + Math.round(S_.earned).toLocaleString('en-US')], ['Villages lit at the end', st.towns.filter(t => t.joined && t.lit).length + ' / ' + st.towns.length],
    ['Approval', Math.round(st.approval) + ' %'], ['Thieves stopped', (S_.arrests + S_.zaps) + ''],
  ];
}
function countUp() {
  const els = [...$('endStats').querySelectorAll('span[data-v]')]; let i = 0;
  const step = () => { if (i >= els.length) return; const el = els[i++]; el.textContent = el.dataset.v; tone(1500, .03, 'square', .04); setTimeout(step, 170); };
  setTimeout(step, 300);
}

// ---------- share ----------
let recap = null;
function buildRecap(st) {
  const M = mission(st), [c, x] = mk(1080, 1350); x.imageSmoothingEnabled = false;
  const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#2a0c08'); g.addColorStop(.5, '#0d0706'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  for (let y = 0; y < 1350; y += 3) { x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(0, y, 1080, 1); }
  x.textAlign = 'center';
  const tg = x.createLinearGradient(0, 40, 0, 130); tg.addColorStop(0, '#fff'); tg.addColorStop(.48, '#c3c6c9'); tg.addColorStop(.52, '#6c7176'); tg.addColorStop(1, '#d8dadc');
  x.font = '900 86px Impact, "Arial Black", sans-serif'; x.fillStyle = '#000'; x.fillText('COMMAND & CONQUER', 544, 134); x.fillStyle = tg; x.fillText('COMMAND & CONQUER', 540, 130);
  x.font = '900 46px Impact, "Arial Black", sans-serif'; x.fillStyle = '#e3281c'; x.fillText('G R I D   M A N A G E M E N T', 540, 196);
  const win = st.over && (st.over.win || M.endless);
  x.font = 'bold 38px monospace'; x.fillStyle = '#e2c45c'; x.fillText(`${M.code} · ${M.name.toUpperCase()}`, 540, 270);
  x.font = '900 70px Impact, "Arial Black", sans-serif'; x.fillStyle = win ? '#7dff6a' : '#ff4a3a';
  x.fillText(M.endless ? `HELD ${st.over.days} DAY${st.over.days === 1 ? '' : 'S'}` : win ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED', 540, 360);
  // the grid as seen on radar
  let mw = 980, mh = mw * st.H / st.W; if (mh > 500) { mh = 500; mw = mh * st.W / st.H; } const my = 400, mxp = (1080 - mw) / 2;
  x.fillStyle = '#000'; x.fillRect(mxp - 6, my - 6, mw + 12, mh + 12);
  const [rc] = mk(st.W * 4, st.H * 4); const rx = rc.getContext('2d'); rx.imageSmoothingEnabled = false; rx.drawImage(RD.radarBase, 0, 0, st.W * 4, st.H * 4);
  for (const k in st.lines) { rx.fillStyle = '#d02818'; rx.fillRect((k % st.W) * 4, ((k / st.W) | 0) * 4, 4, 4); }
  for (const o of st.structs) { const d = S[o.type]; rx.fillStyle = '#ff3a28'; rx.fillRect(o.x * 4, o.y * 4, d.fp[0] * 4, d.fp[1] * 4); }
  for (const t of st.towns) { rx.fillStyle = t.joined ? (t.lit ? '#ffe060' : '#5a6a8a') : '#bbb'; for (const [tx, ty] of t.tiles) rx.fillRect(tx * 4, ty * 4, 4, 4); }
  rx.fillStyle = '#000'; for (let k = 0; k < st.W * st.H; k++) if (!st.rev[k]) rx.fillRect((k % st.W) * 4, ((k / st.W) | 0) * 4, 4, 4);
  x.drawImage(rc, mxp, my, mw, mh);
  let y = my + mh + 66; x.textAlign = 'left'; x.font = 'bold 32px monospace';
  for (const [a, b] of recapRows(st).slice(0, 7)) { x.fillStyle = '#e8e2c8'; x.fillText(a, 70, y); x.textAlign = 'right'; x.fillStyle = '#e2c45c'; x.fillText(b, 1010, y); x.textAlign = 'left'; y += 48; }
  x.textAlign = 'center'; x.font = 'bold 30px monospace'; x.fillStyle = '#5dff5d'; x.fillText(GAME_URL.replace(/^https?:\/\//, ''), 540, 1318, 1000);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
async function share(withRecap) {
  const st = GM.st, M = st ? mission(st) : null;
  const text = withRecap && st && st.over
    ? (M.endless ? `I kept the lights on for ${st.over.days} days in Command and Conquer: Grid Management. Your turn: ${GAME_URL}` : `${st.over.win ? 'Mission accomplished' : 'Mission failed'}: ${M.name}, ${(st.stats.dem ? st.stats.served / st.stats.dem * 100 : 100).toFixed(0)} % of energy served. Command and Conquer: Grid Management: ${GAME_URL}`)
    : `Command and Conquer: Grid Management. Build plants, lay lines, keep the villages lit: ${GAME_URL}`;
  const blob = withRecap && recap ? await recap : null;
  const file = blob && new File([blob], APP + '-recap.png', { type: 'image/png' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Command and Conquer: Grid Management', text, url: GAME_URL });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = APP + '-recap.png'; a.click(); }
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast(GAME_URL); }
}

// ---------- loop ----------
let lastT = performance.now(), sideT = 0, radT = 0, selT = 0, saveH = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (t - lastT) / 1000); lastT = t;
  const st = GM.st; if (!st || !GM.playing) return;
  if (!GM.paused && !st.over) { window.G_speed = SPEEDS[st.speed]; update(st, dt, SPEEDS[st.speed]); }
  if (st.dirty) derive(st);
  updateShroud(st);
  draw(st, GM.sel, GM.ui);
  updateHud(st, dt);
  sideT += dt; if (sideT > .1) { sideT = 0; updateSidebar(st); }
  radT += dt; if (radT > .25) { radT = 0; drawRadar(st, $('radar'), has(st, 'dome') && !st.lowPower); }
  selT += dt; if (selT > .5) { selT = 0; if (GM.sel) showSel(); if (st.tut >= 0) tutCheck(); }
  if (Math.floor(st.hour / 3) !== saveH) { saveH = Math.floor(st.hour / 3); save(); }
}

// ---------- wake lock, back gesture, visibility ----------
let lock = null;
async function wake() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => lock = null); } } catch {} }
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (GM.playing && !GM.paused) openMenu(); } else if (GM.playing) wake(); });
addEventListener('popstate', () => { if (GM.playing && !GM.paused) { openMenu(); history.pushState({ g: 1 }, ''); } else if (GM.paused) { resume(); history.pushState({ g: 1 }, ''); } });
addEventListener('resize', () => { if (!RD.cv) return; resize(); if (GM.st) { clampCam(GM.st); const portrait = matchMedia('(orientation: portrait)').matches; if (portrait !== GM.portrait) { GM.portrait = portrait; buildSidebar(GM.st); } } });

// ---------- wire up ----------
function boot() {
  RD.cv = $('cv'); RD.ctx = RD.cv.getContext('2d'); GM.portrait = matchMedia('(orientation: portrait)').matches;
  initInput();
  $('bMenu').onclick = () => { sfx('click'); openMenu(); };
  $('bObj').onclick = () => { sfx('click'); openMenu(); };
  $('bSpeed').onclick = () => { ensureAudio(); sfx('click'); GM.st.speed = (GM.st.speed + 1) % SPEEDS.length; };
  $('bResume').onclick = () => { sfx('click'); resume(); };
  $('bRestart').onclick = () => { if (confirmTwice('bRestart', 'Sure? Restart')) { const id = GM.st.mission, th = GM.st.theme; store.del('save'); startGame(newGame(id, { theme: th })); } };
  $('bQuit').onclick = () => { if (confirmTwice('bQuit', 'Sure? Quit')) { save(); GM.st = null; titleScreen(); } };
  $('bHelp').onclick = () => { GM.helpBack = 'title'; show('help'); };
  $('bHelp2').onclick = () => { GM.helpBack = 'menu'; show('help'); $('app').classList.remove('hidden'); };
  $('bHelpBack').onclick = () => { if (GM.helpBack === 'menu') { show('menu'); $('app').classList.remove('hidden'); } else titleScreen(); };
  $('bShareGame').onclick = () => share(false); $('bShare2').onclick = () => share(false); $('bEndShare').onclick = () => share(true);
  $('bEndMenu').onclick = () => { GM.st = null; titleScreen(); };
  $('bContinue').onclick = () => { ensureAudio(); const s = loadSave(); if (s) startGame(s); };
  $('bSound').onclick = () => { opts.sound = opts.sound ? 0 : 1; saveOpts(); titleScreen(); };
  $('bVoice').onclick = () => { opts.voice = opts.voice ? 0 : 1; saveOpts(); titleScreen(); };
  for (const [id, k] of [['tSound', 'sound'], ['tVoice', 'voice'], ['tVib', 'vib']]) $(id).onclick = () => { opts[k] = opts[k] ? 0 : 1; saveOpts(); syncToggles(); if (k === 'voice' && !opts.voice) speechSynthesis?.cancel(); };
  titleScreen();
  requestAnimationFrame(frame);
}
function confirmTwice(id, txt) {
  const b = $(id); if (b.dataset.armed) { delete b.dataset.armed; b.textContent = b.dataset.orig; return true; }
  b.dataset.orig = b.textContent; b.dataset.armed = 1; b.textContent = txt; setTimeout(() => { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = b.dataset.orig; } }, 2500); return false;
}
boot();
