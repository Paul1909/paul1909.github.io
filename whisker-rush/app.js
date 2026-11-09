// Whisker Rush: menus, settings, audio, input and the main loop.
(() => {
const { buildCat, FURS, EYES, PATTERNS } = window.WRCat;
const { Race, TRACKS, DIFFS, TUNING, DEFAULTS } = window.WRGame;
const TEST_BUILD = false;  // true = test copy: shows the Tuning lab and the TEST badge, keeps its own saves
const BUILD = 'v4';

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
let settings = { control: 'joystick', side: 'left', view: 'first', sens: 1, invert: false, sound: true, music: true, musicVol: 35, muted: false, vibe: true, ...store.get('settings', {}) };
let pick = { track: 'desert', diff: 'jaguar', ...store.get('pick', {}) };
let board = store.get('board', {});   // leaderboard: 'track:difficulty' -> top 10 entries
let tuning = store.get('tuning', {});   // only the values changed from the defaults
const tuned = () => ({ ...DEFAULTS, ...tuning });

let curScreen = 'title';
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
    this.updateHearts(dt);
  },
  // tapping the cat: it purrs and shows you some love
  hearts: [], loveT: 0, ray: new THREE.Raycaster(),
  tap(e) {
    if (!this.cat || (curScreen !== 'custom' && curScreen !== 'title')) return;
    this.ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
    if (this.ray.intersectObject(this.cat.root, true).length) this.love();
  },
  petN: 0,
  love() {
    audio.init(); vibe([25, 35, 25, 35, 25, 35, 25, 35, 25]);
    // Luna's own voice: a purr, then an "auuu", then a purr again...
    if (settings.sound && !settings.muted) {
      const clip = ['luna-purr.mp3', 'luna-auuu.mp3'][this.petN++ % 2];
      (this.clips ||= {})[clip] ||= new Audio(clip);
      const a = this.clips[clip]; a.currentTime = 0; a.volume = 1; a.play().catch(() => audio.purr());
    }
    this.loveT = 1.9;
    if (!this.heartGeo) {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.38);
      sh.bezierCurveTo(-0.08, -0.3, -0.5, -0.05, -0.5, 0.2);
      sh.bezierCurveTo(-0.5, 0.48, -0.18, 0.56, 0, 0.32);
      sh.bezierCurveTo(0.18, 0.56, 0.5, 0.48, 0.5, 0.2);
      sh.bezierCurveTo(0.5, -0.05, 0.08, -0.3, 0, -0.38);
      this.heartGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 4, curveSegments: 18 });
      this.heartGeo.center();
    }
    const add = (x, y, size, vy, delay, color) => {
      const m = new THREE.Mesh(this.heartGeo, new THREE.MeshLambertMaterial({ color, emissive: '#5a0018', transparent: true }));
      m.position.set(x, y, 0.3); m.scale.setScalar(0.001);
      this.scene.add(m);
      this.hearts.push({ m, t: -delay, life: 1.9, size, vy, spin: (Math.random() - 0.5) * 2 });
    };
    add(0, 1.5, 0.6, 0.28, 0, '#ff2d63');
    for (let i = 0; i < 5; i++) add((Math.random() - 0.5) * 1.6, 1.0 + Math.random() * 0.4, 0.2 + Math.random() * 0.12, 0.4 + Math.random() * 0.3, 0.1 + i * 0.12, ['#ff5c8a', '#ff86a8', '#ff3d6e'][i % 3]);
  },
  updateHearts(dt) {
    for (const h of this.hearts) {
      h.t += dt; if (h.t < 0) continue;
      const p = h.t / h.life;
      const pop = p < 0.18 ? 1 + 1.7 * Math.pow(p / 0.18 - 1, 3) + 0.7 * Math.pow(p / 0.18 - 1, 2) : 1;
      h.m.scale.setScalar(Math.max(0.001, h.size * pop));
      h.m.position.y += h.vy * dt;
      h.m.rotation.y = Math.sin(h.t * 3 + h.spin) * 0.6;
      h.m.material.opacity = 1 - Math.max(0, (p - 0.6) / 0.4);
    }
    this.hearts = this.hearts.filter(h => { if (h.t < h.life) return true; this.scene.remove(h.m); h.m.material.dispose(); return false; });
    if (this.cat) {
      if (this.loveT > 0) { this.loveT -= dt; this.cat.wag = 1; this.cat.head.rotation.z = Math.sin(this.loveT * 9) * 0.22; this.cat.head.rotation.x = -0.15; }
      else { this.cat.wag = 0; this.cat.head.rotation.z = 0; this.cat.head.rotation.x = 0; }
    }
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

canvas.addEventListener('pointerdown', e => { if (mode === 'menu') preview.drag = { x: e.clientX, x0: e.clientX, y0: e.clientY, t: performance.now() }; });
addEventListener('pointermove', e => { if (preview.drag) { preview.holder.rotation.y += (e.clientX - preview.drag.x) * 0.012; preview.drag.x = e.clientX; } });
addEventListener('pointerup', e => {
  const d = preview.drag; preview.drag = null;
  if (d && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 12 && performance.now() - d.t < 450) preview.tap(e);
});

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
      this.master = c.createGain(); this.master.gain.value = settings.muted ? 0 : 1; this.master.connect(c.destination);
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
  // Luna's real hiss for cat bumps (falls back to the generated hiss if the clip can't play)
  lunaHiss() {
    if (!settings.sound || settings.muted) return;
    const a = (this.hissClip ||= new Audio('luna-hiss.mp3'));
    a.currentTime = 0; a.volume = 1;
    a.play().catch(() => this.hiss());
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
  purr() {
    if (!this.ctx || !settings.sound) return;
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), lp = c.createBiquadFilter(), am = c.createGain(), out = c.createGain();
    const lfo = c.createOscillator(), depth = c.createGain(), hum = c.createOscillator(), humG = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 420;
    lfo.type = 'square'; lfo.frequency.setValueAtTime(23, t); lfo.frequency.setValueAtTime(26, t + 1.0);
    depth.gain.value = 0.5; am.gain.value = 0.5; lfo.connect(depth); depth.connect(am.gain);
    hum.type = 'sine'; hum.frequency.value = 58; humG.gain.value = 0.5; hum.connect(humG); humG.connect(am);
    src.connect(lp); lp.connect(am); am.connect(out); out.connect(this.sfx);
    const g = out.gain;
    g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(0.9, t + 0.15); g.setValueAtTime(0.8, t + 0.75); g.exponentialRampToValueAtTime(0.15, t + 0.92);
    g.exponentialRampToValueAtTime(0.75, t + 1.1); g.setValueAtTime(0.65, t + 1.6); g.exponentialRampToValueAtTime(0.0001, t + 2.0);
    [src, lfo, hum].forEach(n => { n.start(t); n.stop(t + 2.05); });
  },
  ghost() {
    if (!this.ctx || !settings.sound) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), v = c.createOscillator(), vg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.linearRampToValueAtTime(620, t + 0.5); o.frequency.linearRampToValueAtTime(260, t + 1.1);
    v.frequency.value = 7; vg.gain.value = 25; v.connect(vg); vg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    o.connect(g); g.connect(this.sfx); o.start(t); v.start(t); o.stop(t + 1.2); v.stop(t + 1.2);
  },
  unghost() { this.tone(500, 900, 0.18, 'triangle', 0.15); },
  goldFish() { this.fish(); [1568, 2093, 2637].forEach((f, i) => this.tone(f, f, 0.12, 'sine', 0.12, 0.22 + i * 0.07)); },
  setMute(m) { if (this.master) this.master.gain.value = m ? 0 : 1; },
};
// ---------- music: Catnip Quest in the menus, Paws Forward from the start of each race ----------
const music = {
  menu: null, race: null, want: null,
  init() {
    if (this.menu) return;
    const el = src => { const a = new Audio(src); a.loop = true; a.preload = 'auto'; return a; };
    this.menu = el('music-menu.mp3'); this.race = el('music-race.mp3');
    this.apply();
  },
  off() { return settings.muted || !settings.music; },
  apply() {
    if (!this.menu) return;
    for (const a of [this.menu, this.race]) { a.volume = Math.min(1, settings.musicVol / 100); a.muted = this.off(); }
    if (this.off()) { this.menu.pause(); this.race.pause(); } else if (this.want) this[this.want].play().catch(() => {});
  },
  play(which, fromStart) {
    this.init(); this.want = which;
    (which === 'menu' ? this.race : this.menu).pause();
    const a = this[which];
    if (fromStart) a.currentTime = 0;
    if (!this.off()) a.play().catch(() => {});
  },
  stop() { this.want = null; if (this.menu) { this.menu.pause(); this.race.pause(); } },
  hold() { if (this.menu) { this.menu.pause(); this.race.pause(); } },
};
// phones only allow sound after a tap, so the menu music starts on the first one
document.addEventListener('pointerdown', () => { audio.init(); if (mode === 'menu' && (!music.menu || music.menu.paused)) music.play('menu'); }, true);
function toggleView() {
  settings.view = settings.view === 'third' ? 'first' : 'third'; saveSettings();
  if (race) race.setView(settings.view);
  toast(settings.view === 'third' ? 'Camera: behind the cat' : 'Camera: cat\'s eyes', 1000);
}
$('#viewBtn').addEventListener('click', e => { e.stopPropagation(); toggleView(); });
function setMuted(m, user = true) {
  settings.muted = m; saveSettings();
  if (user) { audio.init(); audio.setMute(m); music.apply(); }
  $$('.mutebtn').forEach(b => { b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-label', m ? 'Sound on' : 'Mute'); });
}
$$('.mutebtn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setMuted(!settings.muted); }));
setMuted(settings.muted, false);

const vibe = p => { if (settings.vibe) navigator.vibrate?.(p); };

// ---------- screens ----------
let screenStack = ['title'];
function show(id) {
  curScreen = id;
  document.body.classList.toggle('in-menu', id !== 'hud');
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'tracks') renderTracks();
  if (id === 'custom') renderCustom();
  if (id === 'settings') renderSettings();
  if (id === 'title') renderTitle();
  if (id === 'tune') renderTune();
  if (id === 'board') renderBoard();
  if (id === 'howto') store.set('seenHowto', true);
}
function go(id) { screenStack.push(id); show(id); }
function back() { screenStack.pop(); show(screenStack[screenStack.length - 1] || 'title'); }
$$('[data-back]').forEach(b => b.addEventListener('click', back));
$('#goRace').onclick = () => go('tracks');
$('#goCustom').onclick = () => go('custom');
$('#goSettings').onclick = () => go('settings');
$('#goTune').onclick = () => go('tune');
$('#goHow').onclick = () => go('howto');
$('#goBoard').onclick = () => go('board');

function renderTitle() {
  $('#whoName').textContent = cat.name || 'Your cat';
  $('#buildTag').textContent = 'TEST BUILD ' + BUILD;
  $('#buildTag').style.display = TEST_BUILD ? '' : 'none';
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
    const b = (board[t.id + ':' + pick.diff] || [])[0];
    const el = document.createElement('button');
    el.className = `track t-${t.id}` + (t.id === pick.track ? ' on' : '');
    el.innerHTML = `<div class="em">${t.emoji}</div><div class="nm">${t.name}</div><div class="best">${b ? `🏆 ${b.score} pts · ${medalOf(b.pos)}${ord(b.pos)} · ${fmt(b.time)}` : t.blurb}</div>`;
    el.onclick = () => { pick.track = t.id; store.set('pick', pick); renderTracks(); };
    list.appendChild(el);
  }
  seg($('#diff'), DIFFS.map(d => ({ v: d.id, html: `${d.emoji} ${d.name}<small>${d.sub}</small>` })), pick.diff, v => { pick.diff = v; store.set('pick', pick); renderTracks(); });
}
$('#startRace').onclick = async () => {
  if (!store.get('seenHowto', false)) { store.set('seenHowto', true); go('howto'); return; }
  audio.init();
  if (settings.control === 'tilt') await askTilt();
  startRace(pick.track, pick.diff);
};

// ---------- settings ----------
function renderSettings() {
  const bool = [{ v: false, html: 'Off' }, { v: true, html: 'On' }];
  seg($('#setControl'), [{ v: 'joystick', html: '🕹️ Stick' }, { v: 'tilt', html: '📱 Tilt' }], settings.control, async v => { settings.control = v; saveSettings(); if (v === 'tilt') await askTilt(); });
  seg($('#setView'), [{ v: 'first', html: '👀 Cat\'s eyes' }, { v: 'third', html: '🎥 Behind' }], settings.view, v => { settings.view = v; saveSettings(); });
  seg($('#setSide'), [{ v: 'left', html: 'Left' }, { v: 'right', html: 'Right' }], settings.side, v => { settings.side = v; saveSettings(); });
  seg($('#setInvert'), bool, settings.invert, v => { settings.invert = v; saveSettings(); });
  seg($('#setSound'), bool, settings.sound, v => { settings.sound = v; saveSettings(); audio.init(); if (v) audio.fish(); });
  seg($('#setMusic'), bool, settings.music, v => { settings.music = v; saveSettings(); music.apply(); });
  $('#setVol').value = settings.musicVol;
  seg($('#setVibe'), bool, settings.vibe, v => { settings.vibe = v; saveSettings(); vibe(40); });
  $('#setSens').value = settings.sens;
}
$('#setSens').addEventListener('input', e => { settings.sens = +e.target.value; saveSettings(); });
$('#setVol').addEventListener('input', e => { settings.musicVol = +e.target.value; saveSettings(); music.apply(); });
$('#resetBest').onclick = () => { if (confirm('Clear the whole leaderboard?')) { board = {}; store.set('board', board); toast('Leaderboard cleared'); } };

function toast(t, ms = 1800) {
  const el = $('#toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', ms);
}

// ---------- input ----------
const input = { steer: 0, throttle: 0, sprint: false, jumpBuf: 0 };
let joyThrottle = 0;
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
  let dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y;
  const len = Math.hypot(dx, dy); if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const v = dx / JOY_R, t = -dy / JOY_R;
  joySteer = Math.abs(v) < 0.08 ? 0 : v;
  // up = accelerate, down = brake; a dead zone in the middle so steering doesn't brake by accident
  joyThrottle = Math.abs(t) < 0.3 ? 0 : Math.sign(t) * (Math.abs(t) - 0.3) / 0.7;
});
function release(e) {
  if (e.pointerId === joyId) { joyId = null; joySteer = 0; joyThrottle = 0; joyRest(); return; }
  const a = acts.get(e.pointerId); if (!a) return;
  clearTimeout(a.timer); acts.delete(e.pointerId);
  if (a.sprint) sprintHolds = Math.max(0, sprintHolds - 1);
  else if (e.type === 'pointerup' && race && race.state === 'race') input.jumpBuf = 0.15;
}
touch.addEventListener('pointerup', release);
touch.addEventListener('pointercancel', release);
function clearTouches() { acts.forEach(a => clearTimeout(a.timer)); acts.clear(); sprintHolds = 0; joyId = null; joySteer = 0; joyThrottle = 0; kbSprint = false; joyRest(); }

// Computer: arrows (or WASD) are the joystick: ←/→ steer, ↑ accelerate, ↓ brake.
// Space is the right thumb: quick tap = jump, hold = sprint.
var kbSprint = false, kbTimer = null;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (mode !== 'race' || e.target.tagName === 'INPUT') return;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space') { clearTimeout(kbTimer); kbTimer = setTimeout(() => { kbTimer = null; kbSprint = true; }, 200); }
  if (e.code === 'KeyC') toggleView();
  if (e.code === 'Escape' || e.code === 'KeyP') paused ? resume() : pause();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') {
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
  music.hold();
  if (!audio.hissClip) { audio.hissClip = new Audio('luna-hiss.mp3'); audio.hissClip.preload = 'auto'; }
  setTimeout(() => {
    if (race) { race.dispose(); race = null; }
    race = new Race(renderer, { track: trackId, diff: diffId, player: { ...cat }, tuning, view: settings.view, onEvent });
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
    $('#tipHint').textContent = (useTilt ? 'Tilt to steer' : '◀▶ steer · ▲ faster · ▼ brake') + ' · tap = jump · hold = sprint · chase the 🔴';
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
  else if (type === 'go') { center('GO!', 'big', 800); audio.count(true); music.play('race', true); vibe(30); }
  else if (type === 'jump') audio.jump();
  else if (type === 'land') audio.land();
  else if (type === 'hit') {
    center(['Mrraow!', 'Ouch!', 'Hey!', 'Grrr!'][(Math.random() * 4) | 0], 'msg', 800);
    flash(''); audio.hit(); audio.angryMeow(); vibe([60, 40, 60]);
  }
  else if (type === 'bump') { center(`Hiss! 😾 ${escapeHtml(a)}`, 'msg', 800); flash('bump'); audio.lunaHiss(); vibe(40); }
  else if (type === 'fish') {
    if (b) { center(`✨ Golden fish! +${a}`, 'msg', 900); audio.goldFish(); vibe([15, 30, 15]); }
    else { center(`🐟 +${a} · stamina full`, 'msg', 700); audio.fish(); vibe(15); }
  }
  else if (type === 'catnip') { center(`🌿 Catnip! +${race.cfg.catnipBonus}% stamina`, 'msg', 1100); audio.catnip(); vibe([20, 30, 20]); }
  else if (type === 'nipEnd') center('Catnip wore off', 'msg', 900);
  else if (type === 'ghost') { center(`👻 Ghost cat! ${race.cfg.ghostDuration}s through anything`, 'msg', 1200); audio.ghost(); vibe([30, 60, 30]); }
  else if (type === 'ghostEnd') { center('Solid again', 'msg', 700); audio.unghost(); }
  else if (type === 'exhausted') { center('Exhausted! 💦', 'msg', 1200); audio.groan(); vibe(120); }
  else if (type === 'recovered') center('Got my breath back', 'msg', 700);
  else if (type === 'offtrack') center('Off track! Slow going', 'msg', 900);
  else if (type === 'msg') center(a, 'msg', 1200);
  else if (type === 'finish') {
    center(`FINISH!<br><span style="font-size:0.5em">${ord(a)} place</span>`, 'big', 3000);
    audio.setWind(0);
    audio.meow(a === 1 ? 1.1 : 0.9); if (a === 1) setTimeout(() => audio.meow(1.25), 450);
    vibe(a === 1 ? [80, 60, 80, 60, 200] : 120);
  }
  else if (type === 'results') showResults(a);
}

function showResults(list) {
  const me = list.findIndex(r => r.isPlayer) + 1;
  const key = pick.track + ':' + pick.diff;
  const myTime = list[me - 1].time;
  const sub = `${race.theme.name} · ${DIFFS.find(d => d.id === pick.diff).name} · ${fmt(myTime)}`;
  const entry = { name: cat.name || 'Whiskers', color: (FURS.find(f => f.id === cat.fur) || FURS[0]).color, score: race.score, fish: race.fishCaught, gold: race.goldCaught, pos: me, time: myTime, date: Date.now() };
  const list0 = board[key] || [];
  const list1 = [...list0, entry].sort(byScore);
  const place = list1.indexOf(entry) + 1;
  board[key] = list1.slice(0, 10); store.set('board', board);
  const lb = place === 1 && list0.length ? '🏆 New high score!' : place === 1 ? '🏆 First score on this leaderboard' : place <= 10 ? `#${place} on the leaderboard` : '';
  $('#resScore').innerHTML = `<b>${race.score}</b> pts <span>· 🐟 ${race.fishCaught - race.goldCaught} + ✨ ${race.goldCaught} golden</span>${lb ? `<em>${lb}</em>` : ''}`;
  $('#resMedal').textContent = ['🏆', '🥈', '🥉', '😺', '😼', '🙀'][me - 1];
  $('#resTitle').textContent = me === 1 ? `${cat.name} wins!` : `${ord(me)} place`;
  $('#resSub').textContent = sub;
  const t0 = list[0].time;
  $('#resList').innerHTML = list.map((r, i) => `<li class="${r.isPlayer ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="dt" style="background:${r.color}"></span><span>${escapeHtml(r.name)}</span><span class="tm">${i ? '+' + (r.time - t0).toFixed(1) + 's' : fmt(r.time)}</span></li>`).join('');
  $('#results').classList.add('active');
  releaseAwake();
}
const byScore = (a, b) => b.score - a.score || a.pos - b.pos || a.time - b.time;

// ---------- leaderboard ----------
let boardPick = null;
function renderBoard() {
  boardPick ||= { track: pick.track, diff: pick.diff };
  seg($('#boardTrack'), TRACKS.map(t => ({ v: t.id, html: `${t.emoji}<small>${t.name.split(' ')[0]}</small>` })), boardPick.track, v => { boardPick.track = v; renderBoardList(); });
  seg($('#boardDiff'), DIFFS.map(d => ({ v: d.id, html: `${d.emoji} ${d.name}` })), boardPick.diff, v => { boardPick.diff = v; renderBoardList(); });
  renderBoardList();
}
function renderBoardList() {
  const list = board[boardPick.track + ':' + boardPick.diff] || [];
  const day = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  $('#boardList').innerHTML = list.length ? list.map((r, i) => `<li><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="dt" style="background:${r.color}"></span><span class="nm">${escapeHtml(r.name)}<small>${day(r.date)} · ${ord(r.pos)} place · ${fmt(r.time)}</small></span><span class="pts">${r.score}<small>pts</small></span></li>`).join('')
    : '<li class="empty">No races here yet. Go set the first score!</li>';
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#resAgain').onclick = () => startRace(pick.track, pick.diff);
$('#resNext').onclick = () => { const i = TRACKS.findIndex(t => t.id === pick.track); pick.track = TRACKS[(i + 1) % TRACKS.length].id; store.set('pick', pick); startRace(pick.track, pick.diff); };
$('#resMenu').onclick = quitRace;

function pause() {
  if (!race || paused || mode !== 'race' || $('#results').classList.contains('active')) return;
  paused = true; clearTouches();
  $('#pause').classList.add('active');
  music.hold(); audio.setWind(0);
}
function resume() {
  if (!paused) return;
  paused = false; $('#pause').classList.remove('active');
  if (race && music.want === 'race' && !music.off()) music.race.play().catch(() => {});
}
function quitRace() {
  audio.windOff(); releaseAwake();
  music.play('menu');
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
  if (document.hidden) { pause(); music.hold(); audio.ctx?.suspend?.(); }
  else { audio.ctx?.resume?.(); if (mode === 'race') keepAwake(); else if (music.want === 'menu') music.play('menu'); }
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
  setText('#hudScore', `${race.score}<small> pts</small>`);
  setText('#hudSpeed', `${Math.round(race.kmh(p))} <small>km/h</small>`);
  $('#hudStam i').style.width = (p.stamina / p.maxSt * 100).toFixed(1) + '%';
  $('#hudStam').classList.toggle('tired', p.exhausted);
  $('#hudStam').classList.toggle('nip', p.nipT > 0);
  setText('#stamLbl', p.exhausted ? 'EXHAUSTED' : p.nipT > 0 ? `🌿 CATNIP ${Math.ceil(p.nipT)}s · STAMINA ${Math.round(p.stamina)}%` : `STAMINA ${Math.round(p.stamina)}%`);
  $('#hud').classList.toggle('tired', p.exhausted && race.state === 'race');
  $('#hud').classList.toggle('ghost', p.ghostT > 0 && race.state === 'race');
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
      let th = useTilt ? 0 : joyThrottle;
      if (keys.ArrowUp || keys.KeyW) th = 1;
      if (keys.ArrowDown || keys.KeyS) th = -1;
      input.throttle = th;
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
  $('#tuneSummary').innerHTML = `A full stamina bar gives <b>${sprintSecs}s</b> of sprint; refilling from empty takes <b>${refill}s</b>. Running dry leaves you at ${t.exhaustedKmh} km/h for <b>${rec}s</b>. Race of ${t.raceLength} m ≈ <b>${Math.round(t.raceLength / (t.nominalKmh * t.pace))}s</b> at cruise speed. Per track: ${t.fishGroups} groups of ${t.fishPerGroup} fish, ${t.goldCount} golden fish, ${t.catnipCount} catnip, ${t.ghostCount} ghosts.`;
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
