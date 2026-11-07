// Whisker Rush: menus, settings, audio, input and the main loop.
(() => {
const { buildCat, FURS, EYES, PATTERNS } = window.WRCat;
const { Race, TRACKS, DIFFS, TUNING, DEFAULTS } = window.WRGame;
const TEST_BUILD = true;   // shows the Tuning lab; the test copy also keeps its own saves

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = TEST_BUILD ? 'whisker-rush-test' : 'whisker-rush';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------- state ----------
const defaultCat = { name: 'Whiskers', gender: 'male', fur: 'ginger', pattern: 'tabby', eyes: 'green', speed: 5, jump: 5 };
let cat = { ...defaultCat, ...store.get('cat', {}) };
let settings = { control: 'joystick', side: 'left', sens: 1, invert: false, sound: true, music: true, vibe: true, ...store.get('settings', {}) };
let pick = { track: 'desert', diff: 'jaguar', ...store.get('pick', {}) };
let best = store.get('best', {});
let tuning = store.get('tuning', {});   // only the values changed from the defaults
const tuned = () => ({ ...DEFAULTS, ...tuning });

let race = null, paused = false, wakeLock = null, lastRank = 0, centerT = 0, hintT = 0, mode = 'menu';
const saveCat = () => store.set('cat', cat);
const saveSettings = () => store.set('settings', settings);

// ---------- renderer & menu preview ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.setClearColor(0x000000, 0);

const preview = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(32, 1, 0.1, 100),
  cat: null, spin: 0.6, drag: null, hop: 0, hopT: 3,
  init() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#fff2e0', '#5a3a6a', 2.2));
    const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 3); s.add(d);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.25, 40), new THREE.MeshLambertMaterial({ color: '#ffb22e' }));
    ped.position.y = -0.125; s.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    ring.rotation.x = Math.PI / 2; s.add(ring);
    this.camera.position.set(0, 1.7, 6.4);
    this.camera.lookAt(0, 0.65, 0);
    this.holder = new THREE.Group(); s.add(this.holder);
  },
  setCat(c) {
    if (this.cat) { this.holder.remove(this.cat.root); this.cat.dispose(); }
    this.cat = buildCat(c); this.holder.add(this.cat.root);
    this.cat.root.rotation.y = 0.5;
  },
  update(dt) {
    if (!this.cat) return;
    if (!this.drag) this.holder.rotation.y += dt * this.spin;
    this.hopT -= dt;
    if (this.hopT < 0) { this.hop = 0.55; this.hopT = 4 + Math.random() * 3; }
    if (this.hop > 0) { this.hop -= dt; const k = 1 - Math.abs(this.hop - 0.275) / 0.275; this.cat.root.position.y = Math.max(0, k) * 0.6; }
    else this.cat.root.position.y = 0;
    this.cat.update(dt, 0, this.hop > 0);
  },
  render() {
    const w = innerWidth, h = innerHeight, portrait = h > w;
    this.camera.aspect = w / h;
    this.camera.fov = portrait ? 56 : 30;
    const panel = portrait ? 0 : Math.min(460, w * 0.56);
    const tx = portrait ? w / 2 : (w - panel) / 2, ty = portrait ? h * 0.21 : h / 2;
    this.camera.setViewOffset(w, h, w / 2 - tx, h / 2 - ty, w, h);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  },
};
preview.init();
preview.setCat(cat);

canvas.addEventListener('pointerdown', e => { if (mode === 'menu') preview.drag = { x: e.clientX }; });
addEventListener('pointermove', e => { if (preview.drag) { preview.holder.rotation.y += (e.clientX - preview.drag.x) * 0.012; preview.drag.x = e.clientX; } });
addEventListener('pointerup', () => { preview.drag = null; });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (race) race.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ---------- audio (Web Audio, generated) ----------
const audio = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = this.ctx = new C();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = 0.16; this.mus.connect(this.master);
      const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch { this.ctx = null; }
  },
  tone(f0, f1, dur, type = 'sine', vol = 0.3, when = 0, dest) {
    if (!this.ctx || !settings.sound && !dest) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq, type = 'lowpass', when = 0, dest) {
    if (!this.ctx || !settings.sound && !dest) return;
    const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  },
  jump() { this.tone(330, 760, 0.17, 'square', 0.09); this.tone(660, 1500, 0.12, 'sine', 0.08); },
  land() { this.noise(0.08, 0.25, 500); },
  hit() { this.noise(0.3, 0.5, 900); this.tone(170, 45, 0.35, 'sine', 0.55); this.tone(600, 200, 0.2, 'sawtooth', 0.06); },
  // angry "MRRAOW" when the cat crashes into something: two detuned saws, growl tremolo, vowel filter
  angryMeow() {
    if (!this.ctx || !settings.sound) return;
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(), bp = c.createBiquadFilter(), trem = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(1000, t); bp.frequency.linearRampToValueAtTime(2200, t + 0.18); bp.frequency.linearRampToValueAtTime(800, t + 0.7);
    trem.gain.value = 0.6; lfo.frequency.value = 27; lg.gain.value = 0.45;
    lfo.connect(lg); lg.connect(trem.gain); trem.connect(bp); bp.connect(out); out.connect(this.sfx);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.7, t + 0.04); out.gain.setValueAtTime(0.6, t + 0.42); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    for (const det of [-14, 10]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(290, t); o.frequency.linearRampToValueAtTime(480, t + 0.2); o.frequency.linearRampToValueAtTime(240, t + 0.72);
      o.connect(trem); o.start(t); o.stop(t + 0.78);
    }
    lfo.start(t); lfo.stop(t + 0.78);
    this.noise(0.12, 0.35, 700);
  },
  hiss() {
    if (!this.ctx || !settings.sound) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), hp = c.createBiquadFilter(), pk = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; hp.type = 'highpass'; hp.frequency.value = 2400; pk.type = 'peaking'; pk.frequency.value = 5200; pk.gain.value = 10;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.03); g.gain.setValueAtTime(0.55, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + 0.72);
    this.noise(0.04, 0.6, 3000, 'bandpass');
  },
  pant(i) { this.noise(0.16, 0.22, i % 2 ? 1300 : 900, 'bandpass'); },
  groan() { this.tone(320, 140, 0.55, 'triangle', 0.25); },
  catnip() { [660, 880, 1100, 1320, 1760].forEach((f, i) => this.tone(f, f * 1.03, 0.14, 'triangle', 0.2, i * 0.06)); this.tone(220, 330, 0.5, 'sine', 0.15, 0.1); },
  fish() { this.tone(880, 880, 0.08, 'triangle', 0.25); this.tone(1320, 1320, 0.14, 'triangle', 0.25, 0.08); this.tone(1760, 1760, 0.16, 'triangle', 0.18, 0.16); },
  count(go) { go ? this.tone(1046, 1046, 0.45, 'square', 0.14) : this.tone(523, 523, 0.18, 'square', 0.14); },
  meow(pitch = 1) {
    if (!this.ctx || !settings.sound) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.Q.value = 5;
    o.frequency.setValueAtTime(520 * pitch, t); o.frequency.linearRampToValueAtTime(820 * pitch, t + 0.18); o.frequency.linearRampToValueAtTime(480 * pitch, t + 0.6);
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(2300, t + 0.2); bp.frequency.linearRampToValueAtTime(1000, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.setValueAtTime(0.5, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(bp); bp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.7);
  },
  windOn() {
    if (!this.ctx || this.wind) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
    this.wind = { s, f, g };
  },
  setWind(v) { if (this.wind) { const t = this.ctx.currentTime; this.wind.g.gain.setTargetAtTime(settings.sound ? v * 0.12 : 0, t, 0.15); this.wind.f.frequency.setTargetAtTime(400 + v * 900, t, 0.2); } },
  windOff() { if (this.wind) { try { this.wind.s.stop(); } catch {} this.wind = null; } },
  // little procedural racing loop, one key per track
  music: null,
  startMusic(trackId) {
    this.stopMusic();
    if (!this.ctx || !settings.music) return;
    const keys = { desert: [50, 'phr'], jungle: [55, 'maj'], city: [57, 'min'], volcano: [52, 'min'], ice: [60, 'maj'] };
    const [root, q] = keys[trackId] || [57, 'min'];
    const prog = q === 'maj' ? [0, 7, 9, 5] : q === 'phr' ? [0, 1, 0, -2] : [0, -4, -2, -5];
    const third = q === 'maj' ? 4 : 3;
    const step = 60 / 132 / 4;
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    let next = this.ctx.currentTime + 0.05, i = 0;
    const tick = () => {
      while (next < this.ctx.currentTime + 0.2) {
        const bar = Math.floor(i / 16) % 4, st = i % 16, r = root + prog[bar], when = next - this.ctx.currentTime;
        if (st % 8 === 0) this.tone(130, 42, 0.18, 'sine', 0.9, when, this.mus);
        if (st % 4 === 2) this.noise(0.05, 0.25, 7000, 'highpass', when, this.mus);
        if ([0, 3, 6, 8, 11, 14].includes(st)) this.tone(midi(r - 12), midi(r - 12) * 0.99, step * 1.6, 'triangle', 0.55, when, this.mus);
        if (st % 2 === 0) { const arp = [0, third, 7, 12, 7, third, 12, 7][(st / 2) | 0]; this.tone(midi(r + 12 + arp), midi(r + 12 + arp), step * 1.4, 'square', 0.07, when, this.mus); }
        next += step; i++;
      }
    };
    tick();
    this.music = setInterval(tick, 50);
  },
  stopMusic() { if (this.music) { clearInterval(this.music); this.music = null; } },
};
const vibe = p => { if (settings.vibe) navigator.vibrate?.(p); };

// ---------- screens ----------
let screenStack = ['title'];
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'tracks') renderTracks();
  if (id === 'custom') renderCustom();
  if (id === 'settings') renderSettings();
  if (id === 'title') renderTitle();
  if (id === 'tune') renderTune();
}
function go(id) { screenStack.push(id); show(id); }
function back() { screenStack.pop(); show(screenStack[screenStack.length - 1] || 'title'); }
$$('[data-back]').forEach(b => b.addEventListener('click', back));
$('#goRace').onclick = () => go('tracks');
$('#goCustom').onclick = () => go('custom');
$('#goSettings').onclick = () => go('settings');
$('#goTune').onclick = () => go('tune');
if (!TEST_BUILD) $('#goTune').style.display = 'none';

function renderTitle() {
  $('#whoName').textContent = cat.name || 'Your cat';
  $('#whoDot').style.background = (FURS.find(f => f.id === cat.fur) || FURS[0]).color;
}

function seg(el, items, value, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.dataset.v = it.v; b.innerHTML = it.html; b.classList.toggle('on', String(it.v) === String(value));
    b.onclick = () => { [...el.children].forEach(c => c.classList.toggle('on', c === b)); onPick(it.v); };
    el.appendChild(b);
  }
}

// ---------- customize ----------
function renderCustom() {
  $('#catName').value = cat.name;
  seg($('#gender'), [{ v: 'male', html: '♂ Male' }, { v: 'female', html: '♀ Female' }], cat.gender, v => { cat.gender = v; refreshCat(); });
  seg($('#pattern'), PATTERNS.map(p => ({ v: p.id, html: p.name })), cat.pattern, v => { cat.pattern = v; refreshCat(); });
  const furs = $('#furs'); furs.innerHTML = '';
  for (const f of FURS) {
    const b = document.createElement('button'); b.className = 'sw' + (f.id === cat.fur ? ' on' : ''); b.style.background = f.color; b.title = f.name; b.setAttribute('aria-label', f.name);
    b.onclick = () => { cat.fur = f.id; [...furs.children].forEach(c => c.classList.toggle('on', c === b)); refreshCat(); };
    furs.appendChild(b);
  }
  const eyes = $('#eyes'); eyes.innerHTML = '';
  for (const e of EYES) {
    const b = document.createElement('button'); b.className = 'sw' + (e.id === 'odd' ? ' odd' : '') + (e.id === cat.eyes ? ' on' : ''); b.style.background = e.l; b.title = e.name; b.setAttribute('aria-label', e.name);
    b.onclick = () => { cat.eyes = e.id; [...eyes.children].forEach(c => c.classList.toggle('on', c === b)); refreshCat(); };
    eyes.appendChild(b);
  }
  renderStats();
}
function renderStats() {
  for (const [id, v] of [['#barSpeed', cat.speed], ['#barJump', cat.jump]]) {
    $(id).innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('');
  }
  const t = tuned(), d = cat.speed - 5;
  const cruise = Math.round(Math.min(t.maxKmh, t.nominalKmh + d * t.statKmh)), spr = Math.round(Math.min(t.maxKmh, t.sprintKmh + d * t.statKmh));
  const jh = (t.jumpBase + cat.jump * t.jumpPerPoint).toFixed(2);
  $('#statHint').textContent = `Cruise ${cruise} km/h, sprint ${spr} km/h. Jump height ${jh} m: high jumpers clear rocks, crates and ice blocks.`;
}
$$('[data-stat]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.stat, o = k === 'speed' ? 'jump' : 'speed', d = +b.dataset.d;
  const nv = cat[k] + d;
  if (nv < 1 || nv > 9) return;
  cat[k] = nv; cat[o] = 10 - nv;
  renderStats();
}));
$('#catName').addEventListener('input', e => { cat.name = e.target.value.trim().slice(0, 12); });
$('#randomCat').onclick = () => {
  const r = a => a[(Math.random() * a.length) | 0];
  const sp = 2 + ((Math.random() * 7) | 0);
  const names = ['Whiskers', 'Tiger', 'Mittens', 'Pumpkin', 'Rocket', 'Nugget', 'Bubbles', 'Paws', 'Comet', 'Waffles', 'Muffin', 'Socks'];
  Object.assign(cat, { name: r(names), gender: r(['male', 'female']), fur: r(FURS).id, pattern: r(PATTERNS).id, eyes: r(EYES).id, speed: sp, jump: 10 - sp });
  renderCustom(); refreshCat();
};
$('#customDone').onclick = () => { if (!cat.name) cat.name = 'Whiskers'; saveCat(); back(); };
$('#custom [data-back]').addEventListener('click', () => { if (!cat.name) cat.name = 'Whiskers'; saveCat(); });
function refreshCat() { preview.setCat(cat); saveCat(); }

// ---------- track select ----------
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const ord = n => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
const medalOf = p => ['', '🥇', '🥈', '🥉'][p] || '';
function renderTracks() {
  const list = $('#trackList'); list.innerHTML = '';
  for (const t of TRACKS) {
    const b = best[t.id + ':' + pick.diff];
    const el = document.createElement('button');
    el.className = `track t-${t.id}` + (t.id === pick.track ? ' on' : '');
    el.innerHTML = `<div class="em">${t.emoji}</div><div class="nm">${t.name}</div><div class="best">${b ? `${medalOf(b.pos)} ${ord(b.pos)} · ${fmt(b.time)}` : t.blurb}</div>`;
    el.onclick = () => { pick.track = t.id; store.set('pick', pick); renderTracks(); };
    list.appendChild(el);
  }
  seg($('#diff'), DIFFS.map(d => ({ v: d.id, html: `${d.emoji} ${d.name}<small>${d.sub}</small>` })), pick.diff, v => { pick.diff = v; store.set('pick', pick); renderTracks(); });
}
$('#startRace').onclick = async () => {
  audio.init();
  if (settings.control === 'tilt') await askTilt();
  startRace(pick.track, pick.diff);
};

// ---------- settings ----------
function renderSettings() {
  const bool = [{ v: false, html: 'Off' }, { v: true, html: 'On' }];
  seg($('#setControl'), [{ v: 'joystick', html: '🕹️ Stick' }, { v: 'tilt', html: '📱 Tilt' }], settings.control, async v => { settings.control = v; saveSettings(); if (v === 'tilt') await askTilt(); });
  seg($('#setSide'), [{ v: 'left', html: 'Left' }, { v: 'right', html: 'Right' }], settings.side, v => { settings.side = v; saveSettings(); });
  seg($('#setInvert'), bool, settings.invert, v => { settings.invert = v; saveSettings(); });
  seg($('#setSound'), bool, settings.sound, v => { settings.sound = v; saveSettings(); audio.init(); if (v) audio.fish(); });
  seg($('#setMusic'), bool, settings.music, v => { settings.music = v; saveSettings(); });
  seg($('#setVibe'), bool, settings.vibe, v => { settings.vibe = v; saveSettings(); vibe(40); });
  $('#setSens').value = settings.sens;
}
$('#setSens').addEventListener('input', e => { settings.sens = +e.target.value; saveSettings(); });
$('#resetBest').onclick = () => { best = {}; store.set('best', best); toast('Best times cleared'); };

function toast(t, ms = 1800) {
  const el = $('#toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', ms);
}

// ---------- input ----------
const input = { steer: 0, sprint: false, jumpBuf: 0 };
let joySteer = 0, tiltSteer = 0, tiltAngle = null, tiltNeutral = 0, tiltSeen = false, useTilt = false;
const keys = {};
const acts = new Map();
let sprintHolds = 0, joyId = null, joyOrigin = null;
const joy = $('#joy'), knob = joy.querySelector('.knob');
const JOY_R = 52;

function joyRest() {
  const left = settings.side === 'left';
  joy.style.left = left ? `calc(${Math.max(90, innerWidth * 0.13)}px + env(safe-area-inset-left))` : `calc(100vw - ${Math.max(90, innerWidth * 0.13)}px - env(safe-area-inset-right))`;
  joy.style.top = `${innerHeight - Math.max(95, innerHeight * 0.24)}px`;
  joy.classList.add('idle'); knob.style.transform = '';
}

const touch = $('#touch');
touch.addEventListener('pointerdown', e => {
  e.preventDefault(); audio.init();
  if (paused || !race) return;
  const x = e.clientX, y = e.clientY;
  const zone = !useTilt && joyId === null && y > innerHeight * 0.3 && (settings.side === 'left' ? x < innerWidth * 0.42 : x > innerWidth * 0.58);
  if (zone) {
    joyId = e.pointerId; joyOrigin = { x, y };
    joy.style.left = x + 'px'; joy.style.top = y + 'px'; joy.classList.remove('idle');
    try { touch.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  const a = { t0: performance.now(), sprint: false };
  a.timer = setTimeout(() => { a.sprint = true; sprintHolds++; }, 200);
  acts.set(e.pointerId, a);
  try { touch.setPointerCapture(e.pointerId); } catch {}
});
touch.addEventListener('pointermove', e => {
  if (e.pointerId !== joyId) return;
  const dx = Math.max(-JOY_R, Math.min(JOY_R, e.clientX - joyOrigin.x));
  knob.style.transform = `translateX(${dx}px)`;
  const v = dx / JOY_R;
  joySteer = Math.abs(v) < 0.08 ? 0 : v;
});
function release(e) {
  if (e.pointerId === joyId) { joyId = null; joySteer = 0; joyRest(); return; }
  const a = acts.get(e.pointerId); if (!a) return;
  clearTimeout(a.timer); acts.delete(e.pointerId);
  if (a.sprint) sprintHolds = Math.max(0, sprintHolds - 1);
  else if (e.type === 'pointerup' && race && race.state === 'race') input.jumpBuf = 0.15;
}
touch.addEventListener('pointerup', release);
touch.addEventListener('pointercancel', release);
function clearTouches() { acts.forEach(a => clearTimeout(a.timer)); acts.clear(); sprintHolds = 0; joyId = null; joySteer = 0; joyRest(); }

// Up arrow / W behave like the screen: quick tap = jump, hold = sprint. Space always jumps.
let kbSprint = false, kbTimer = null;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (mode !== 'race' || e.target.tagName === 'INPUT') return;
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'Space') { input.jumpBuf = 0.15; e.preventDefault(); }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); clearTimeout(kbTimer); kbTimer = setTimeout(() => { kbTimer = null; kbSprint = true; }, 200); }
  if (e.code === 'Escape' || e.code === 'KeyP') paused ? resume() : pause();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (kbTimer) { clearTimeout(kbTimer); kbTimer = null; if (mode === 'race' && race && race.state === 'race') input.jumpBuf = 0.15; }
    kbSprint = false;
  }
});

async function askTilt() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    try { const r = await D.requestPermission(); if (r !== 'granted') toast('Tilt not allowed: using the joystick'); } catch {}
  }
}
addEventListener('deviceorientation', e => {
  if (e.beta == null) return;
  tiltSeen = true;
  const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  const b = e.beta, g = e.gamma || 0, rad = Math.PI / 180;
  let a;
  if (ang === 90 || ang === -270) a = b > 90 ? 180 - b : b < -90 ? -180 - b : b;
  else if (ang === 270 || ang === -90) { const bb = b > 90 ? 180 - b : b < -90 ? -180 - b : b; a = -bb; }
  else a = Math.asin(Math.max(-1, Math.min(1, Math.cos(b * rad) * Math.sin(g * rad)))) / rad * (ang === 180 ? -1 : 1);
  tiltAngle = a;
});
function readTilt() {
  if (tiltAngle == null) return 0;
  let d = (tiltAngle - tiltNeutral) * (settings.invert ? -1 : 1);
  if (Math.abs(d) < 1.5) d = 0;
  return Math.max(-1, Math.min(1, d / (24 / settings.sens)));
}

// ---------- race ----------

function startRace(trackId, diffId) {
  $('#loading').classList.add('active');
  $('#results').classList.remove('active');
  $('#pause').classList.remove('active');
  setTimeout(() => {
    if (race) { race.dispose(); race = null; }
    race = new Race(renderer, { track: trackId, diff: diffId, player: { ...cat }, tuning, onEvent });
    race.resize(innerWidth, innerHeight);
    mode = 'race'; paused = false; lastRank = 0;
    useTilt = settings.control === 'tilt';
    tiltNeutral = tiltAngle ?? 0;
    $('#hud').classList.toggle('joy-right', settings.side === 'right');
    joy.style.display = useTilt ? 'none' : '';
    clearTouches();
    show('hud');
    buildProgress();
    $('#hudCenter').innerHTML = '';
    $('#tipHint').style.opacity = 1;
    $('#tipHint').textContent = (useTilt ? 'Tap = jump · Hold = sprint · Tilt to steer' : 'Tap = jump · Hold = sprint · Stick to steer') + ' · 🐟 refills · 🌿 catnip = bigger stamina';
    hintT = 6;
    $('#loading').classList.remove('active');
    audio.windOn();
    keepAwake();
    if (!history.state || !history.state.race) history.pushState({ race: 1 }, '');
    if (useTilt) setTimeout(() => { if (race && !tiltSeen) { useTilt = false; joy.style.display = ''; joyRest(); toast('No tilt sensor found: using the joystick'); } }, 1500);
  }, 40);
}

function buildProgress() {
  const p = $('#hudProg'); p.innerHTML = '';
  race.progress().forEach(r => { const i = document.createElement('i'); if (r.isPlayer) i.className = 'me'; i.style.background = r.color; p.appendChild(i); });
}

function flash(cls) {
  const f = $('#flash'); f.className = 'flash ' + cls + ' on'; setTimeout(() => f.classList.remove('on'), 60);
}
function center(html, cls = 'msg', ms = 900) {
  $('#hudCenter').innerHTML = `<div class="${cls}">${html}</div>`;
  centerT = ms / 1000;
}

function onEvent(type, a, b) {
  if (type === 'count') { center(a, 'big', 900); audio.count(false); tiltNeutral = tiltAngle ?? tiltNeutral; }
  else if (type === 'go') { center('GO!', 'big', 800); audio.count(true); audio.startMusic(race.theme.id); vibe(30); }
  else if (type === 'jump') audio.jump();
  else if (type === 'land') audio.land();
  else if (type === 'hit') {
    center(['Mrraow!', 'Ouch!', 'Hey!', 'Grrr!'][(Math.random() * 4) | 0], 'msg', 800);
    flash(''); audio.hit(); audio.angryMeow(); vibe([60, 40, 60]);
  }
  else if (type === 'bump') { center(`Hiss! 😾 ${escapeHtml(a)}`, 'msg', 800); flash('bump'); audio.hiss(); vibe(40); }
  else if (type === 'fish') { center('🐟 Stamina full!', 'msg', 700); audio.fish(); vibe(15); }
  else if (type === 'catnip') { center(`🌿 Catnip! +${race.cfg.catnipBonus}% stamina`, 'msg', 1100); audio.catnip(); vibe([20, 30, 20]); }
  else if (type === 'nipEnd') center('Catnip wore off', 'msg', 900);
  else if (type === 'exhausted') { center('Exhausted! 💦', 'msg', 1200); audio.groan(); vibe(120); }
  else if (type === 'recovered') center('Got my breath back', 'msg', 700);
  else if (type === 'offtrack') center('Off track! Slow going', 'msg', 900);
  else if (type === 'msg') center(a, 'msg', 1200);
  else if (type === 'finish') {
    center(`FINISH!<br><span style="font-size:0.5em">${ord(a)} place</span>`, 'big', 3000);
    audio.stopMusic(); audio.setWind(0);
    audio.meow(a === 1 ? 1.1 : 0.9); if (a === 1) setTimeout(() => audio.meow(1.25), 450);
    vibe(a === 1 ? [80, 60, 80, 60, 200] : 120);
  }
  else if (type === 'results') showResults(a);
}

function showResults(list) {
  const me = list.findIndex(r => r.isPlayer) + 1;
  const key = pick.track + ':' + pick.diff;
  const myTime = list[me - 1].time;
  const prev = best[key];
  let sub = `${race.theme.name} · ${DIFFS.find(d => d.id === pick.diff).name} · ${fmt(myTime)}`;
  if (!prev || me < prev.pos || (me === prev.pos && myTime < prev.time)) {
    best[key] = { pos: me, time: myTime }; store.set('best', best);
    if (prev) sub += ' · New best!';
  }
  $('#resMedal').textContent = ['🏆', '🥈', '🥉', '😺', '😼', '🙀'][me - 1];
  $('#resTitle').textContent = me === 1 ? `${cat.name} wins!` : `${ord(me)} place`;
  $('#resSub').textContent = sub;
  const t0 = list[0].time;
  $('#resList').innerHTML = list.map((r, i) => `<li class="${r.isPlayer ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="dt" style="background:${r.color}"></span><span>${escapeHtml(r.name)}</span><span class="tm">${i ? '+' + (r.time - t0).toFixed(1) + 's' : fmt(r.time)}</span></li>`).join('');
  $('#results').classList.add('active');
  releaseAwake();
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#resAgain').onclick = () => startRace(pick.track, pick.diff);
$('#resNext').onclick = () => { const i = TRACKS.findIndex(t => t.id === pick.track); pick.track = TRACKS[(i + 1) % TRACKS.length].id; store.set('pick', pick); startRace(pick.track, pick.diff); };
$('#resMenu').onclick = quitRace;

function pause() {
  if (!race || paused || mode !== 'race' || $('#results').classList.contains('active')) return;
  paused = true; clearTouches();
  $('#pause').classList.add('active');
  audio.stopMusic(); audio.setWind(0);
}
function resume() {
  if (!paused) return;
  paused = false; $('#pause').classList.remove('active');
  if (race && race.state === 'race') audio.startMusic(race.theme.id);
}
function quitRace() {
  audio.stopMusic(); audio.windOff(); releaseAwake();
  if (race) { race.dispose(); race = null; }
  paused = false; mode = 'menu';
  $('#pause').classList.remove('active'); $('#results').classList.remove('active');
  screenStack = ['title']; show('title');
}
$('#pauseBtn').addEventListener('click', pause);
$('#resume').onclick = resume;
$('#restart').onclick = () => startRace(pick.track, pick.diff);
$('#quit').onclick = quitRace;

addEventListener('popstate', () => {
  if (mode === 'race' && race) {
    if ($('#results').classList.contains('active')) { quitRace(); return; }
    pause(); history.pushState({ race: 1 }, '');
  } else if (screenStack.length > 1) { back(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); audio.ctx?.suspend?.(); }
  else { audio.ctx?.resume?.(); if (mode === 'race') keepAwake(); }
});

async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseAwake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

// ---------- HUD ----------
let hudCache = {}, pantT = 0, pantN = 0;
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function updateHud(dt) {
  const p = race.player;
  const rank = race.rank(p);
  if (rank !== lastRank) { lastRank = rank; setText('#hudPos', `${rank}<small>${['th', 'st', 'nd', 'rd'][rank] || 'th'}</small>`); }
  setText('#hudTime', fmt(race.state === 'countdown' ? 0 : p.finished ? p.finishTime : race.time));
  setText('#hudSpeed', `${Math.round(race.kmh(p))} <small>km/h</small>`);
  $('#hudStam i').style.width = (p.stamina / p.maxSt * 100).toFixed(1) + '%';
  $('#hudStam').classList.toggle('tired', p.exhausted);
  $('#hudStam').classList.toggle('nip', p.nipT > 0);
  setText('#stamLbl', p.exhausted ? 'EXHAUSTED' : p.nipT > 0 ? `🌿 CATNIP ${Math.ceil(p.nipT)}s · STAMINA ${Math.round(p.stamina)}%` : `STAMINA ${Math.round(p.stamina)}%`);
  $('#hud').classList.toggle('tired', p.exhausted && race.state === 'race');
  $('#vign').classList.toggle('on', p.sprint);
  if (p.exhausted && race.state === 'race') { pantT -= dt; if (pantT <= 0) { pantT = 0.38; audio.pant(pantN++); } }
  const dots = $('#hudProg').children;
  race.progress().forEach((r, i) => { dots[i].style.left = (r.p * 100).toFixed(2) + '%'; });
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('#hudCenter').innerHTML = ''; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('#tipHint').style.opacity = 0; }
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (mode === 'race' && race) {
    if (!paused) {
      let st = useTilt ? readTilt() : joySteer;
      if (keys.ArrowLeft || keys.KeyA) st = -1;
      if (keys.ArrowRight || keys.KeyD) st = 1;
      input.steer = st;
      input.sprint = sprintHolds > 0 || kbSprint || !!keys.ShiftLeft || !!keys.ShiftRight;
      race.update(dt, input);
      input.jumpBuf = Math.max(0, input.jumpBuf - dt);
      updateHud(dt);
      audio.setWind(race.state === 'race' ? Math.min(1, race.player.speed / 40) : 0);
    }
    race.render();
  } else {
    preview.update(dt);
    preview.render();
  }
}
joyRest();
addEventListener('resize', joyRest);
renderTitle();
requestAnimationFrame(frame);

// ---------- Tuning lab ----------
const decimals = st => (String(st).split('.')[1] || '').length;
function tuneHelp() {
  const t = tuned();
  const sprintSecs = (100 / t.staminaDrain).toFixed(1), refill = t.staminaRegen ? (100 / t.staminaRegen).toFixed(0) : '∞';
  const rec = t.staminaRegen ? (t.recoverAt / t.staminaRegen).toFixed(1) : '∞';
  $('#tuneSummary').innerHTML = `A full stamina bar gives <b>${sprintSecs}s</b> of sprint; refilling from empty takes <b>${refill}s</b>. Running dry leaves you at ${t.exhaustedKmh} km/h for <b>${rec}s</b>. Race of ${t.raceLength} m ≈ <b>${Math.round(t.raceLength / (t.nominalKmh * t.pace))}s</b> at cruise speed. ${t.fishCount} fish and ${t.catnipCount} catnip per track.`;
}
function renderTune() {
  const list = $('#tuneList'); list.innerHTML = '';
  let group = '';
  for (const p of TUNING) {
    if (p.group !== group) { group = p.group; const h = document.createElement('h3'); h.textContent = group; list.appendChild(h); }
    const row = document.createElement('div'); row.className = 'trow';
    const val = tuned()[p.k];
    row.innerHTML = `<div class="tl"><span>${p.label}</span><b></b><button class="tr" title="Back to default">↺</button></div><input type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
    const inp = row.querySelector('input'), out = row.querySelector('b'), rst = row.querySelector('.tr');
    const show = v => { out.textContent = (+v).toFixed(decimals(p.step)) + (p.unit ? ' ' + p.unit : ''); const ch = +v !== p.def; row.classList.toggle('changed', ch); };
    inp.value = val; show(val);
    inp.addEventListener('input', () => {
      const v = +inp.value; if (v === p.def) delete tuning[p.k]; else tuning[p.k] = v;
      store.set('tuning', tuning); show(v); tuneHelp();
    });
    rst.onclick = () => { delete tuning[p.k]; store.set('tuning', tuning); inp.value = p.def; show(p.def); tuneHelp(); };
    list.appendChild(row);
  }
  tuneHelp();
}
$('#tuneReset').onclick = () => { if (confirm('Put every setting back to its default?')) { tuning = {}; store.set('tuning', tuning); renderTune(); toast('Back to defaults'); } };
$('#tuneCopy').onclick = async () => {
  const text = JSON.stringify(tuning);
  if (text === '{}') { toast('Everything is on default'); return; }
  try { await navigator.clipboard.writeText(text); toast('Copied: paste it to Claude or another phone'); }
  catch { prompt('Copy these settings:', text); }
};
$('#tunePaste').onclick = () => {
  const text = prompt('Paste settings copied from the Tuning lab:');
  if (!text) return;
  try {
    const o = JSON.parse(text), next = {};
    for (const p of TUNING) if (typeof o[p.k] === 'number') next[p.k] = Math.min(p.max, Math.max(p.min, o[p.k]));
    tuning = next; store.set('tuning', tuning); renderTune(); toast(`Loaded ${Object.keys(next).length} settings`);
  } catch { toast('That doesn\'t look like Tuning lab settings'); }
};
$('#tuneRace').onclick = () => { screenStack = ['title', 'tracks']; show('tracks'); };

// for automated tests
window.__wr = { get race() { return race; }, input, startRace, settings, get tuning() { return tuning; } };
})();
