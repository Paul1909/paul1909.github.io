// Personality Monsters — two players take a Big Five test, their scores become monsters, the monsters fight.
import * as THREE from './three.min.js';

// ---------------------------------------------------------------- PWA + storage
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'personality-monsters';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(APP + ':' + k); } catch {} },
};

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PCOL = ['#ff5fa2', '#36d6ff'];

// ---------------------------------------------------------------- Big Five items (original wording, 12 per trait, half reverse-keyed)
const TRAITS = {
  O: { name: 'Openness', emoji: '🌈', lo: 'practical, likes the familiar', hi: 'curious, imaginative, loves new things' },
  C: { name: 'Conscientiousness', emoji: '📋', lo: 'spontaneous, a bit chaotic', hi: 'organised, reliable, plans ahead' },
  E: { name: 'Extraversion', emoji: '🎉', lo: 'quiet, reserved, recharges alone', hi: 'outgoing, energetic, loud' },
  A: { name: 'Agreeableness', emoji: '🤗', lo: 'blunt, competitive, sceptical', hi: 'kind, trusting, cooperative' },
  N: { name: 'Neuroticism', emoji: '🌪️', lo: 'calm, steady, hard to rattle', hi: 'worries, moody, reacts strongly' },
};
const TORDER = ['O', 'C', 'E', 'A', 'N'];
const ITEMS = {
  E: [
    ['I feel energised after a party.', 1], ['I start conversations with strangers.', 1], ['I like being the centre of attention.', 1],
    ['I prefer a quiet night in to a night out.', -1], ['I keep to the background in groups.', -1], ["I don't have much to say to people I don't know.", -1],
    ['I laugh out loud a lot.', 1], ['I take charge when a group needs direction.', 1], ['I make friends easily.', 1],
    ['I need a lot of time alone to recharge.', -1], ['I find small talk tiring.', -1], ['I would rather listen than talk.', -1],
  ],
  A: [
    ['I care about how other people feel.', 1], ['I make time to help others, even when I am busy.', 1], ['I trust people until they give me a reason not to.', 1],
    ['I enjoy winning an argument more than finding agreement.', -1], ["I'm not really interested in other people's problems.", -1], ['I can be blunt to the point of rude.', -1],
    ['I forgive easily.', 1], ['I try to make people feel welcome.', 1], ["I'd rather cooperate than compete.", 1],
    ['I hold grudges.', -1], ['I get my way, even if others lose out.', -1], ['I get suspicious when people are nice to me.', -1],
  ],
  C: [
    ['I finish what I start.', 1], ['I keep my things tidy.', 1], ['I plan ahead instead of improvising.', 1],
    ['I leave chores until the last minute.', -1], ['I lose track of my stuff.', -1], ['I get distracted easily when I should be working.', -1],
    ['I pay attention to details.', 1], ['I like following a schedule.', 1], ['I do things properly, even when nobody checks.', 1],
    ['I forget appointments or deadlines.', -1], ['My workspace is usually a mess.', -1], ['I act first and think later.', -1],
  ],
  N: [
    ['I worry about things a lot.', 1], ['I get stressed easily.', 1], ['My mood changes quickly.', 1],
    ['I stay calm under pressure.', -1], ['I rarely feel sad or down.', -1], ['I bounce back quickly from setbacks.', -1],
    ['I get irritated easily.', 1], ['I replay awkward things I said, over and over.', 1], ['Small problems can ruin my day.', 1],
    ['I seldom feel anxious.', -1], ["I'm relaxed most of the time.", -1], ['Criticism rolls right off me.', -1],
  ],
  O: [
    ['I have a vivid imagination.', 1], ['I love trying new foods and experiences.', 1], ['I enjoy thinking about abstract ideas.', 1],
    ["I'm not interested in art or poetry.", -1], ['I prefer routine over novelty.', -1], ['I find philosophical discussions boring.', -1],
    ['I get curious about how things work.', 1], ['I like visiting places I have never been.', 1], ['I come up with original ideas.', 1],
    ['I find it hard to imagine things that do not exist.', -1], ['I stick to what I know.', -1], ['I like things to be simple and straightforward.', -1],
  ],
};
function buildQuiz(len) {
  const per = len / 5, quiz = [];
  const pools = {};
  for (const t of TORDER) {
    const pos = ITEMS[t].filter(i => i[1] > 0).slice(0, per / 2);
    const neg = ITEMS[t].filter(i => i[1] < 0).slice(0, per / 2);
    pools[t] = []; for (let i = 0; i < per / 2; i++) pools[t].push(pos[i], neg[i]);
  }
  for (let r = 0; r < per; r++) {
    for (let k = 0; k < 5; k++) {
      const t = TORDER[(k + r * 2) % 5];
      const [text, key] = pools[t][r];
      quiz.push({ t, text, key });
    }
  }
  return quiz;
}
function scoreQuiz(quiz, answers) {
  const sum = {}, n = {};
  quiz.forEach((q, i) => { const v = answers[i] ?? 3; const s = q.key > 0 ? v : 6 - v; sum[q.t] = (sum[q.t] || 0) + s; n[q.t] = (n[q.t] || 0) + 1; });
  const out = {}; for (const t of TORDER) out[t] = Math.round(((sum[t] / n[t]) - 1) / 4 * 100);
  return out;
}

// ---------------------------------------------------------------- Personality → stats
const STAT = {
  HP: { name: 'Health', icon: '❤️', unit: '', max: 260, why: 'How much punishment it can take. Kind and reliable people grow sturdy monsters.' },
  DEF: { name: 'Defense', icon: '🛡️', unit: '%', max: 55, why: 'Share of every hit it shrugs off. Organised + emotionally steady = thick skin.' },
  ATK: { name: 'Attack', icon: '🦷', unit: '', max: 44, why: 'Bite strength. Low Agreeableness (grumpy, competitive) and Neuroticism (stressed) bite hardest.' },
  SPD: { name: 'Speed', icon: '⚡', unit: '', max: 100, why: 'How often it acts. Extraverts are fast; nervous energy adds jitter-speed.' },
  SPC: { name: 'Cosmic slam', icon: '✨', unit: '%', max: 22, why: 'Chance of a weird cosmic body-slam for 1.8× damage. Pure Openness.' },
  BLK: { name: 'Block', icon: '🫧', unit: '%', max: 18, why: 'Chance to raise a shield bubble and cancel a hit. Conscientious = always prepared.' },
  HUG: { name: 'Self-hug', icon: '🤗', unit: '%', max: 15, why: 'When hurt, chance to stop and hug itself instead of attacking, healing 10% of max health. Agreeableness.' },
  TAN: { name: 'Tantrum', icon: '😤', unit: '%', max: 20, why: 'Chance to throw a tantrum: either RAGE (next hit ×2) or trip over its own feet. Neuroticism.' },
};
const SORDER = ['HP', 'DEF', 'ATK', 'SPD', 'SPC', 'BLK', 'HUG', 'TAN'];
function computeStats(t) {
  const parts = {
    HP: [['base', 85], ['Agreeableness', 1.1 * t.A, 'A'], ['Conscientiousness', 0.65 * t.C, 'C']],
    DEF: [['base', 5], ['Conscientiousness', 0.24 * t.C, 'C'], ['calm (low Neuroticism)', 0.24 * (100 - t.N), 'N']],
    ATK: [['base', 13], ['grumpiness (low Agreeableness)', 0.21 * (100 - t.A), 'A'], ['Neuroticism', 0.1 * t.N, 'N']],
    SPD: [['base', 30], ['Extraversion', 0.4 * t.E, 'E'], ['nervous energy (Neuroticism)', 0.3 * t.N, 'N']],
    SPC: [['base', 4], ['Openness', 0.18 * t.O, 'O']],
    BLK: [['Conscientiousness', 0.18 * t.C, 'C']],
    HUG: [['Agreeableness', 0.15 * t.A, 'A']],
    TAN: [['Neuroticism', 0.2 * t.N, 'N']],
  };
  const s = { parts };
  for (const k of SORDER) s[k] = parts[k].reduce((a, p) => a + Math.round(p[1]), 0);
  return s;
}

// ---------------------------------------------------------------- Seeded random
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- Sound (all synthesised, nothing to download)
const Sound = {
  ctx: null, master: null, muted: store.get('muted', false), quiet: false,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) { this.muted = m; store.set('muted', m); if (this.master) this.master.gain.value = m ? 0 : 0.55; updateMuteButtons(); },
  ok() { return this.ctx && !this.muted && !this.quiet; },
  tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.3, delay = 0, attack = 0.006, vib = 0, vibRate = 8, filter, q = 1 }) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    if (filter) { const f = c.createBiquadFilter(); f.type = filter[0]; f.frequency.value = filter[1]; f.Q.value = q; node.connect(f); node = f; }
    node.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f0 = 2000, f1 = f0, q = 1, delay = 0 }) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.05);
  },
  click() { this.tone({ f0: 700, f1: 380, dur: 0.06, vol: 0.12 }); },
  pop() { this.tone({ f0: 220, f1: 900, dur: 0.12, vol: 0.25 }); },
  boing() { this.tone({ f0: 160, f1: 560, dur: 0.32, vol: 0.3, vib: 40, vibRate: 16 }); this.tone({ f0: 560, f1: 200, dur: 0.3, vol: 0.2, delay: 0.3, vib: 30, vibRate: 18 }); },
  bonk() { this.tone({ type: 'triangle', f0: 320, f1: 85, dur: 0.16, vol: 0.55 }); this.noise({ dur: 0.05, vol: 0.4, type: 'highpass', f0: 2500 }); },
  splat() { this.noise({ dur: 0.28, vol: 0.6, type: 'bandpass', f0: 1800, f1: 180, q: 2 }); this.tone({ f0: 140, f1: 40, dur: 0.22, vol: 0.4 }); },
  squeak() { this.tone({ type: 'square', f0: 900, f1: 1500, dur: 0.1, vol: 0.12, filter: ['lowpass', 2500] }); this.tone({ type: 'square', f0: 1500, f1: 700, dur: 0.12, vol: 0.1, delay: 0.1, filter: ['lowpass', 2500] }); },
  boom(big) {
    this.noise({ dur: big ? 1.6 : 0.7, vol: big ? 0.9 : 0.6, type: 'lowpass', f0: 3500, f1: 60 });
    this.tone({ f0: big ? 110 : 90, f1: 28, dur: big ? 0.9 : 0.5, vol: 0.7 });
  },
  clang() { [880, 1333, 1771, 2650].forEach((f, i) => this.tone({ type: 'square', f0: f, f1: f * 0.98, dur: 0.45 - i * 0.06, vol: 0.07, filter: ['highpass', 600] })); },
  heal() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ f0: f, dur: 0.28, vol: 0.18, delay: i * 0.07 })); },
  fart() { this.tone({ type: 'sawtooth', f0: 105, f1: 62, dur: 0.75, vol: 0.4, vib: 14, vibRate: 31, filter: ['lowpass', 420] }); this.noise({ dur: 0.6, vol: 0.18, type: 'lowpass', f0: 320, f1: 120 }); },
  growl() { this.tone({ type: 'sawtooth', f0: 75, f1: 130, dur: 0.35, vol: 0.32, vib: 22, vibRate: 35, filter: ['lowpass', 700] }); this.tone({ type: 'sawtooth', f0: 130, f1: 55, dur: 0.45, vol: 0.32, delay: 0.33, vib: 22, vibRate: 35, filter: ['lowpass', 700] }); },
  whoosh() { this.noise({ dur: 0.2, vol: 0.28, type: 'bandpass', f0: 350, f1: 2600, q: 1.4 }); },
  ding() { this.tone({ f0: 1568, dur: 0.7, vol: 0.2 }); this.tone({ f0: 2093, dur: 0.9, vol: 0.14, delay: 0.08 }); },
  voice(p) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const f = p * (0.75 + Math.random() * 0.8); this.tone({ type: 'square', f0: f, f1: f * (0.7 + Math.random() * 0.7), dur: 0.08, vol: 0.13, delay: i * 0.075, filter: ['lowpass', 1500] }); }
  },
  kazoo(notes) {
    let t = 0;
    for (const [f, d] of notes) { this.tone({ type: 'sawtooth', f0: f, f1: f * 1.01, dur: d * 0.95, vol: 0.22, delay: t, attack: 0.03, vib: f * 0.03, vibRate: 6, filter: ['bandpass', 1300], q: 2.5 }); t += d; }
  },
};
function buzz(ms) { if (!Sound.muted) navigator.vibrate?.(ms); }
function updateMuteButtons() {
  $('#btnMute1').textContent = Sound.muted ? '🔇 Sound off' : '🔊 Sound on';
  $('#btnMute2').textContent = Sound.muted ? '🔇' : '🔊';
}

// ---------------------------------------------------------------- three.js scene
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1550, 30, 75);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
const camTarget = new THREE.Vector3(0, 0.9, 0);
const camBase = new THREE.Vector3(0, 5, 12);
let shake = 0;

const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color('#2b1466') }, mid: { value: new THREE.Color('#8a2be2') }, bot: { value: new THREE.Color('#ff7eb3') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bot, mid, smoothstep(-0.2, 0.15, h)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
}));
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xfff0ff, 0x4a2a6a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4, 10, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
scene.add(sun);

// Arena: a pizza-slice coloured disc with a gold rim
(function arena() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const cols = ['#ffb3d9', '#b3ecff', '#fff1a8', '#c9ffb3'];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 256, i / 16 * Math.PI * 2, (i + 1) / 16 * Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(256, 256, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(256, 256, 55, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshToonMaterial({ color: '#6a3fb0' });
  const top = new THREE.MeshToonMaterial({ map: tex });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 0.6, 64), [side, top, side]);
  floor.position.y = -0.3; floor.receiveShadow = true; scene.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7.05, 0.22, 12, 80), new THREE.MeshToonMaterial({ color: '#ffd23f' }));
  rim.rotation.x = Math.PI / 2; scene.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, post = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshToonMaterial({ color: cols[i % 4] }));
    post.position.set(Math.cos(a) * 7.05, 0.25, Math.sin(a) * 7.05); scene.add(post);
  }
})();

// Floating background candy
const deco = [];
(function decor() {
  const r = rng(7);
  const geos = [new THREE.SphereGeometry(1, 16, 12), new THREE.TorusGeometry(0.8, 0.3, 12, 24), new THREE.IcosahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0)];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(pickR(r, geos), new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL(r(), 0.8, 0.65) }));
    const a = r() * Math.PI * 2, d = 16 + r() * 18;
    m.position.set(Math.cos(a) * d, 1 + r() * 14, Math.sin(a) * d - 6);
    m.scale.setScalar(0.6 + r() * 1.6);
    m.userData = { y: m.position.y, ph: r() * 6, sp: 0.3 + r() * 0.6, rs: (r() - 0.5) * 0.8 };
    scene.add(m); deco.push(m);
  }
})();

// ---------------------------------------------------------------- Particles (one instanced mesh, recycled)
const PMAX = 500;
const pGeo = new THREE.IcosahedronGeometry(0.11, 0);
const pMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pMesh.frustumCulled = false; scene.add(pMesh);
const parts = []; for (let i = 0; i < PMAX; i++) { parts.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 1, g: 9, rot: 0 }); pMesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
let pNext = 0;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _col = new THREE.Color();
function emit(pos, { n = 30, colors = ['#ffd23f', '#ff5fa2', '#36d6ff', '#ffffff'], speed = 5, up = 3, size = 1, life = 0.9, grav = 9, spread = 1 } = {}) {
  for (let k = 0; k < n; k++) {
    const idx = pNext, pt = parts[idx]; pNext = (pNext + 1) % PMAX;
    pt.on = true; pt.p.copy(pos);
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pt.v.set(Math.sin(ph) * Math.cos(th) * spread, Math.abs(Math.cos(ph)), Math.sin(ph) * Math.sin(th) * spread).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    pt.v.y += up * Math.random();
    pt.max = pt.life = life * (0.6 + Math.random() * 0.7); pt.s = size * (0.6 + Math.random() * 1.2); pt.g = grav; pt.rot = Math.random() * 6;
    pMesh.setColorAt(idx, _col.set(pick(colors)));
  }
  pMesh.instanceColor.needsUpdate = true;
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const pt = parts[i];
    if (pt.on) {
      pt.life -= dt; if (pt.life <= 0) pt.on = false;
      pt.v.y -= pt.g * dt; pt.v.multiplyScalar(1 - 0.8 * dt); pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.05) { pt.p.y = 0.05; pt.v.y *= -0.4; pt.v.x *= 0.7; pt.v.z *= 0.7; }
      pt.rot += dt * 8;
    }
    const sc = pt.on ? pt.s * Math.min(1, pt.life / pt.max * 2.5) : 0;
    _m4.compose(pt.p, _q.setFromEuler(_e.set(pt.rot, pt.rot * 0.7, 0)), _s.setScalar(sc));
    pMesh.setMatrixAt(i, _m4);
  }
  pMesh.instanceMatrix.needsUpdate = true;
}
// Expanding flash spheres + ground rings
const fx = [];
function flash(pos, color = '#fff6c0', size = 1.6, dur = 0.35, ring = true) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  s.position.copy(pos); scene.add(s); fx.push({ o: s, t: 0, dur, size, kind: 'ball' });
  if (ring) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.04, pos.z); scene.add(r); fx.push({ o: r, t: 0, dur: dur * 1.8, size: size * 2.2, kind: 'ring' });
  }
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const p = f.t / f.dur;
    if (p >= 1) { scene.remove(f.o); f.o.geometry.dispose(); f.o.material.dispose(); fx.splice(i, 1); continue; }
    f.o.scale.setScalar(0.2 + f.size * (1 - Math.pow(1 - p, 3)));
    f.o.material.opacity = (f.kind === 'ball' ? 0.9 : 0.8) * (1 - p);
  }
}
function explosion(pos, colors, big = false) {
  emit(pos, { n: big ? 140 : 45, colors, speed: big ? 9 : 5, up: big ? 6 : 3, size: big ? 1.5 : 1, life: big ? 1.6 : 0.9 });
  flash(pos, pick(['#fff6c0', '#ffe0f0', '#d0fbff']), big ? 3.2 : 1.4, big ? 0.55 : 0.3);
  if (big) setTimeout(() => flash(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), '#ff9a3c', 2.4, 0.5, false), 90);
}

// ---------------------------------------------------------------- Floating text + name tags
const floaters = [];
const _v = new THREE.Vector3();
function toScreen(p) { _v.copy(p).project(camera); return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z]; }
function floatText(pos, text, color = '#fff', size = 30, dur = 1.2) {
  const el = document.createElement('div'); el.className = 'floater'; el.textContent = text;
  el.style.color = color; el.style.fontSize = size + 'px'; $('#floaters').appendChild(el);
  floaters.push({ el, p: pos.clone(), t: 0, dur, dx: (Math.random() - 0.5) * 40 });
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; const p = f.t / f.dur;
    if (p >= 1) { f.el.remove(); floaters.splice(i, 1); continue; }
    const [x, y] = toScreen(f.p);
    const pop = p < 0.15 ? 0.5 + p / 0.15 * 0.8 : 1.3 - Math.min(0.3, (p - 0.15) * 1.5);
    f.el.style.transform = `translate(${x + f.dx * p - 0}px, ${y - p * 90}px) translate(-50%, -50%) scale(${pop})`;
    f.el.style.left = '0'; f.el.style.top = '0';
    f.el.style.opacity = p > 0.7 ? (1 - p) / 0.3 : 1;
  }
}
function clearFloaters() { floaters.forEach(f => f.el.remove()); floaters.length = 0; }

// ---------------------------------------------------------------- Monster generation
function makeSpec(traits, stats, seed, avoidHue) {
  const r = rng(seed);
  const O = traits.O / 100, A = traits.A / 100, C = traits.C / 100, E = traits.E / 100, N = traits.N / 100;
  let hue = r();
  if (avoidHue != null) for (let k = 0; k < 20 && Math.min(Math.abs(hue - avoidHue), 1 - Math.abs(hue - avoidHue)) < 0.22; k++) hue = r();
  const shapes = [['blob', 3], ['pear', 2], ['bean', 1.6], ['mochi', 0.6 + O * 2]];
  let tot = shapes.reduce((a, s) => a + s[1], 0), x = r() * tot, shape = 'blob';
  for (const [s, w] of shapes) { x -= w; if (x <= 0) { shape = s; break; } }
  return {
    // soft pastel colours
    hue, sat: 0.5 + 0.25 * r(), light: 0.64 + 0.08 * r(), hue2: (hue + 0.3 + r() * 0.4) % 1,
    shape, w: 1.0 + r() * 0.22, h: 0.88 + r() * 0.2,
    scale: 0.82 + E * 0.42,
    eyes: clamp(1 + Math.round(O * 2.6 + (r() - 0.5) * 1.1), 1, 4),
    spikes: clamp(Math.round((1 - A) * 6 + (r() - 0.5) * 1.5), 0, 6), spikeLen: 0.16 + (1 - A) * 0.18,
    sharp: A < 0.5,
    legs: r() < 0.3 + O * 0.3 ? 4 : 2,
    arms: true,
    spots: r() < 0.5 ? Math.round(3 + r() * 4) : 0,
    antenna: O > 0.8 ? 2 : O > 0.55 ? 1 : 0,
    plate: C > 0.55, halo: A > 0.72, brows: A < 0.42, sweat: N > 0.62,
    tail: r() < 0.5, jitter: N,
    voice: 130 + (1 - E) * 120 + r() * 90,
  };
}

const UP = new THREE.Vector3(0, 1, 0);
function buildMonster(spec) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const mats = [];
  const M = (color, o = {}) => { const m = new THREE.MeshToonMaterial({ color, ...o }); mats.push(m); return m; };
  const cMain = new THREE.Color().setHSL(spec.hue, spec.sat, spec.light);
  const c2 = new THREE.Color().setHSL(spec.hue2, 0.7, 0.76);
  const cDark = new THREE.Color().setHSL(spec.hue, 0.45, 0.4);
  const mBody = M(cMain);
  const m2 = M(c2), mDark = M(cDark), mWhite = M('#ffffff'), mBlack = M('#2a1d33'), mRed = M('#ff7a94');
  const mBelly = M(new THREE.Color().setHSL(spec.hue, spec.sat * 0.5, 0.86)), mCheek = M('#ff9ec0');
  const mIris = M(new THREE.Color().setHSL(spec.hue2, 0.55, 0.42));
  const mGlow = new THREE.MeshBasicMaterial({ color: c2 });
  const mShine = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  // round, squishy bodies only
  let geo;
  switch (spec.shape) {
    case 'pear': {
      const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; const r = Math.sin(t * Math.PI) * (1.0 - 0.32 * t) + 0.02; pts.push(new THREE.Vector2(i === 0 || i === 24 ? 0.001 : r, t * 1.9 - 0.95)); }
      geo = new THREE.LatheGeometry(pts, 40); break;
    }
    case 'bean': geo = new THREE.CapsuleGeometry(0.8, 0.35, 10, 28); break;
    case 'mochi': { geo = new THREE.SphereGeometry(1, 40, 28); geo.scale(1.15, 0.8, 1.05); break; }
    default: geo = new THREE.SphereGeometry(1, 40, 28);
  }
  const body = new THREE.Mesh(geo, mBody);
  body.scale.set(spec.w, spec.h, spec.w * 0.92);
  rig.add(body);
  rig.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(body);
  const footH = 0.14;
  const lift = footH - box.min.y;
  body.position.y = lift; rig.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(body);
  const cy = (box.min.y + box.max.y) / 2, hh = (box.max.y - box.min.y) / 2, hw = (box.max.x - box.min.x) / 2, hd = (box.max.z - box.min.z) / 2;
  const nm = new THREE.Matrix3().getNormalMatrix(body.matrixWorld);
  const ray = new THREE.Raycaster();
  const hit = (o, d) => { ray.set(o, d.clone().normalize()); const h = ray.intersectObject(body, false)[0]; if (!h) return null; return { p: h.point, n: h.face.normal.clone().applyMatrix3(nm).normalize() }; };
  const place = (obj, h, out = 0) => { obj.position.copy(h.p).addScaledVector(h.n, out); obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.n); };
  const r = rng(Math.floor(spec.hue * 1e7) + spec.eyes);

  // big shiny eyes
  const eyes = [];
  const eyeY = cy + hh * 0.2;
  const es = [0, 0.38, 0.28, 0.22, 0.19][spec.eyes] * Math.min(hw, 1.15);
  const spread = [0, 0, 0.4, 0.56, 0.62][spec.eyes];
  for (let i = 0; i < spec.eyes; i++) {
    const t = spec.eyes === 1 ? 0 : i / (spec.eyes - 1) * 2 - 1;
    const x = t * hw * spread, y = eyeY + (spec.eyes > 2 ? (1 - Math.abs(t)) * hh * 0.16 : 0);
    const s = es * (0.95 + r() * 0.1);
    const h = hit(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)); if (!h) continue;
    const g = new THREE.Group(); place(g, h, s * 0.18);
    const white = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 18), mWhite); white.scale.z = 0.55; g.add(white);
    const pupil = new THREE.Group(); pupil.position.z = s * 0.34; g.add(pupil);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(s * 0.7, 20, 14), mIris); iris.scale.z = 0.4; pupil.add(iris);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.42, 16, 12), mBlack); dot.scale.z = 0.4; dot.position.z = s * 0.08; pupil.add(dot);
    const gl1 = new THREE.Mesh(new THREE.SphereGeometry(s * 0.2, 10, 8), mShine); gl1.position.set(s * 0.24, s * 0.26, s * 0.3); pupil.add(gl1);
    const gl2 = new THREE.Mesh(new THREE.SphereGeometry(s * 0.09, 8, 6), mShine); gl2.position.set(-s * 0.2, -s * 0.22, s * 0.3); pupil.add(gl2);
    if (spec.brows) { // little grumpy eyebrows
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.12, s * 0.7, 4, 8), mDark);
      b.rotation.z = Math.PI / 2 + (t < 0 ? -0.35 : t > 0 ? 0.35 : 0); b.position.set(0, s * 1.15, s * 0.2); g.add(b);
    }
    rig.add(g); eyes.push({ g, pupil, s, tx: 0, ty: 0 });
  }
  // rosy cheeks
  for (const sd of [-1, 1]) {
    const h = hit(new THREE.Vector3(sd * hw * (spec.eyes === 1 ? 0.5 : 0.62), eyeY - es * 1.25, 5), new THREE.Vector3(0, 0, -1)); if (!h) continue;
    const ck = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mCheek); ck.scale.set(es * 0.55, es * 0.3, 0.03); place(ck, h, 0.01); rig.add(ck);
  }
  // small mouth: a smile, or a little pout with tiny fangs if not so agreeable
  let mouth = null;
  {
    const h = hit(new THREE.Vector3(0, eyeY - es * 1.35, 5), new THREE.Vector3(0, 0, -1));
    if (h) {
      mouth = new THREE.Group(); place(mouth, h, 0.02);
      const mw = Math.max(0.12, hw * 0.16), mh = mw * 0.75;
      const smile = new THREE.Mesh(new THREE.TorusGeometry(mw, mw * 0.2, 8, 20, Math.PI), mBlack);
      smile.rotation.z = Math.PI; if (spec.sharp) { smile.scale.set(0.55, 0.35, 1); smile.position.y = mh * 0.1; } mouth.add(smile);
      const open = new THREE.Group(); open.visible = false; mouth.add(open);
      const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mBlack); hole.scale.set(mw, mh, 0.08); open.add(hole);
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mRed); tongue.scale.set(mw * 0.55, mh * 0.45, 0.06); tongue.position.set(0, -mh * 0.45, 0.04); open.add(tongue);
      if (spec.sharp) for (const sd of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(mw * 0.18, mw * 0.4, 8), mWhite); f.rotation.x = Math.PI;
        f.position.set(sd * mw * 0.45, -mh * 0.05, 0.05); mouth.add(f);
      }
      mouth.userData = { smile, open };
      rig.add(mouth);
    }
  }
  // soft rounded nubs on the back (more = less agreeable)
  for (let i = 0, tries = 0; i < spec.spikes && tries < 60; tries++) {
    const th = (i / Math.max(1, spec.spikes)) * Math.PI * 1.2 - Math.PI * 0.6 + (r() - 0.5) * 0.3 + Math.PI;
    const el = 0.5 + r() * 0.8;
    const dir = new THREE.Vector3(Math.sin(th) * Math.cos(el), Math.sin(el), Math.cos(th) * Math.cos(el));
    const h = hit(new THREE.Vector3(0, cy, 0).addScaledVector(dir, 6), dir.clone().negate()); if (!h) continue;
    const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.07 + spec.spikeLen * 0.25, spec.spikeLen, 6, 10), m2);
    sp.position.copy(h.p).addScaledVector(h.n, spec.spikeLen * 0.45); sp.quaternion.setFromUnitVectors(UP, h.n);
    rig.add(sp); i++;
  }
  // soft spots
  for (let i = 0, tries = 0; i < spec.spots && tries < 40; tries++) {
    const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    if (dir.z > 0.2 && dir.y > -0.6) continue;
    const h = hit(new THREE.Vector3(0, cy, 0).addScaledVector(dir, 6), dir.clone().negate()); if (!h) continue;
    const sz = 0.08 + r() * 0.12, sp = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), m2);
    sp.scale.set(sz, sz, sz * 0.25); place(sp, h, 0.0); rig.add(sp); i++;
  }
  // tummy patch with two little buttons (conscientious)
  if (spec.plate) {
    const h = hit(new THREE.Vector3(0, cy - hh * 0.5, 5), new THREE.Vector3(0, 0, -1));
    if (h) {
      const g = new THREE.Group(); place(g, h, 0.0);
      const pl = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), mBelly); pl.scale.set(hw * 0.4, hh * 0.26, 0.05); g.add(pl);
      for (const j of [0.08, -0.08]) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m2); bt.position.set(0, j * hh, 0.05); g.add(bt); }
      rig.add(g);
    }
  }
  // stubby little arms
  const arms = [];
  if (spec.arms) for (const sd of [-1, 1]) {
    const h = hit(new THREE.Vector3(sd * 6, cy - hh * 0.15, 0.1), new THREE.Vector3(-sd, 0, 0)); if (!h) continue;
    const pivot = new THREE.Group(); pivot.position.copy(h.p).addScaledVector(h.n, -0.05);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mBody); arm.scale.set(0.12, 0.22, 0.12); arm.position.y = -0.16; pivot.add(arm);
    pivot.rotation.z = sd * 0.55; rig.add(pivot); arms.push({ pivot, sd });
  }
  // round little feet
  const legs = [];
  {
    const spots = spec.legs === 2 ? [[-0.4, 0.15], [0.4, 0.15]] : [[-0.42, 0.38], [0.42, 0.38], [-0.42, -0.3], [0.42, -0.3]];
    for (const [lx, lz] of spots) {
      const g = new THREE.Group(); g.position.set(lx * hw, 0, lz * hd);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mDark); foot.scale.set(0.2, 0.13, 0.26); foot.position.set(0, 0.11, 0.04); g.add(foot);
      rig.add(g); legs.push(g);
    }
  }
  // top point for antenna / halo
  const topHit = hit(new THREE.Vector3(0, 10, 0.05), new THREE.Vector3(0, -1, 0));
  const topY = topHit ? topHit.p.y : box.max.y;
  if (spec.antenna) for (let k = 0; k < spec.antenna; k++) {
    const sx = spec.antenna === 1 ? 0 : (k ? 0.22 : -0.22);
    const h = hit(new THREE.Vector3(sx, 10, 0), new THREE.Vector3(0, -1, 0)); if (!h) continue;
    const g = new THREE.Group(); g.position.copy(h.p); g.rotation.z = -sx * 1.5;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), mDark); st.position.y = 0.27; g.add(st);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), mGlow); ball.position.y = 0.58; g.add(ball);
    rig.add(g);
  }
  let halo = null;
  if (spec.halo) { halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 28), new THREE.MeshBasicMaterial({ color: '#ffe36b' })); halo.rotation.x = Math.PI / 2; halo.position.y = topY + (spec.antenna ? 0.8 : 0.35); rig.add(halo); }
  let sweat = null;
  if (spec.sweat) {
    sweat = new THREE.Group();
    const dm = new THREE.MeshToonMaterial({ color: '#9ee8ff' }); mats.push(dm);
    const d1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dm); sweat.add(d1);
    const d2 = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.12, 10), dm); d2.position.y = 0.08; sweat.add(d2);
    const h = hit(new THREE.Vector3(hw * 0.7, eyeY + 0.1, 5), new THREE.Vector3(-0.3, 0, -1));
    sweat.userData.p = h ? h.p.clone().addScaledVector(h.n, 0.08) : new THREE.Vector3(hw, eyeY, 0.4);
    sweat.position.copy(sweat.userData.p); rig.add(sweat);
  }
  let tail = null;
  if (spec.tail) {
    const h = hit(new THREE.Vector3(0, cy - hh * 0.4, -6), new THREE.Vector3(0, 0, 1));
    if (h) {
      tail = new THREE.Group(); tail.position.copy(h.p);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), m2); puff.position.set(0, 0, -0.1); tail.add(puff);
      rig.add(tail);
    }
  }
  rig.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  root.scale.setScalar(spec.scale);
  const height = (Math.max(topY, box.max.y) + (spec.halo ? 0.5 : spec.antenna ? 0.65 : 0.05)) * spec.scale;
  const radius = Math.max(hw, hd) * spec.scale;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0, depthWrite: false }));
  shield.position.y = cy; shield.scale.set(hw * 1.5, hh * 1.4, hw * 1.5); shield.visible = false; rig.add(shield);
  return {
    root, rig, body, eyes, mouth, arms, legs, halo, sweat, tail, shield, mats, cy: cy * spec.scale, height, radius, spec,
    base: new THREE.Vector3(), facing: 0, off: new THREE.Vector3(), spin: 0, tilt: 0, roll: 0, squash: 1, armUp: 0, mouthOpen: 0, flash: 0, rage: 0, shieldT: 0,
    walk: 0, dead: false, phase: Math.random() * 6, hug: 0,
  };
}
function disposeMonster(m) {
  if (!m) return;
  m.root.parent?.remove(m.root);
  m.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => x.dispose()); });
}
const _white = new THREE.Color(1, 1, 1), _red = new THREE.Color(1, 0.1, 0);
function updateMonster(m, t, dt) {
  const idle = !m.dead;
  const bob = idle ? Math.sin(t * (3 + m.spec.jitter * 3) + m.phase) : 0;
  const jit = idle ? m.spec.jitter * m.spec.jitter * 0.05 : 0;
  m.rig.position.set((Math.random() - 0.5) * jit, Math.max(0, bob) * 0.06, (Math.random() - 0.5) * jit);
  const sq = m.squash * (1 + bob * 0.035);
  m.rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  m.root.position.copy(m.base).add(m.off);
  m.root.rotation.set(m.tilt, m.facing + m.spin, m.roll, 'YXZ');
  // googly pupils
  for (const e of m.eyes) {
    if (Math.random() < dt * 2.5) { e.tx = (Math.random() - 0.5) * e.s * 0.6; e.ty = (Math.random() - 0.5) * e.s * 0.5; }
    e.pupil.position.x += (e.tx - e.pupil.position.x) * Math.min(1, dt * 14);
    e.pupil.position.y += (e.ty - e.pupil.position.y) * Math.min(1, dt * 14);
  }
  if (m.mouth) {
    const { smile, open } = m.mouth.userData;
    open.visible = m.mouthOpen > 0.15; smile.visible = !open.visible;
    open.scale.set(0.7 + m.mouthOpen * 0.5, 0.5 + m.mouthOpen * 1.2, 1);
  }
  // blink now and then
  if (!m.dead) {
    m.blink = (m.blink ?? 1 + Math.random() * 3) - dt;
    const shut = m.blink < 0.12;
    if (m.blink < 0) m.blink = 2 + Math.random() * 3.5;
    for (const e of m.eyes) e.g.scale.y = shut ? 0.12 : 1;
  }
  for (const a of m.arms) {
    const wave = Math.sin(t * 5 + m.phase + a.sd) * 0.12;
    const hugZ = -a.sd * 0.4, hugX = -1.2;
    a.pivot.rotation.z = lerp(a.sd * (0.55 + wave) + a.sd * m.armUp * 2.0 + Math.sin(t * 30) * m.armUp * 0.3, hugZ, m.hug);
    a.pivot.rotation.x = lerp(-m.armUp * 0.5, hugX, m.hug);
  }
  m.legs.forEach((l, i) => { l.position.y = Math.max(0, Math.sin(m.walk + i * Math.PI) * 0.12); });
  if (m.halo) { m.halo.rotation.z += dt * 1.5; m.halo.position.y += Math.sin(t * 2.5) * 0.002; }
  if (m.tail) m.tail.rotation.y = Math.sin(t * (4 + m.spec.jitter * 8)) * 0.5;
  if (m.sweat) { const k = (t * 0.7 + m.phase) % 1; m.sweat.position.copy(m.sweat.userData.p); m.sweat.position.y -= k * 0.35; m.sweat.scale.setScalar(k < 0.85 ? 1 : (1 - k) / 0.15); }
  m.flash = Math.max(0, m.flash - dt * 5);
  const glow = m.rage ? 0.25 + Math.sin(t * 14) * 0.15 : 0;
  for (const mt of m.mats) mt.emissive.setRGB(0, 0, 0).lerp(_red, glow).lerp(_white, m.flash * 0.85);
  if (m.shieldT > 0) { m.shieldT = Math.max(0, m.shieldT - dt); m.shield.visible = true; m.shield.material.opacity = Math.min(0.55, m.shieldT * 1.2); }
  else m.shield.visible = false;
}

// ---------------------------------------------------------------- Game clock, tweens, timers (respect pause + speed)
let gameTime = 0, speedMul = 1, paused = false;
const timers = [], tweens = [];
const wait = ms => new Promise(res => timers.push({ at: gameTime + ms / 1000, res }));
const ease = { io: p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, in: p => p * p, out: p => 1 - (1 - p) * (1 - p), lin: p => p };
const tween = (dur, fn, e = ease.io) => new Promise(res => tweens.push({ t0: gameTime, dur, fn, e, res }));
function runClock() {
  for (let i = timers.length - 1; i >= 0; i--) if (gameTime >= timers[i].at) { const t = timers[i]; timers.splice(i, 1); t.res(); }
  for (const tw of tweens.slice()) {
    const p = Math.min(1, (gameTime - tw.t0) / tw.dur); tw.fn(tw.e(p));
    if (p >= 1) { tweens.splice(tweens.indexOf(tw), 1); tw.res(); }
  }
}
function abortAll() { timers.length = 0; tweens.length = 0; }

// ---------------------------------------------------------------- Layout + camera
let mons = [null, null];
let mode = 'menu'; // menu | reveal | fight | results
function layout() {
  const asp = innerWidth / innerHeight;
  const pos = asp < 0.8 ? [[-1.55, 1.5], [1.55, -1.5]] : asp < 1.3 ? [[-2, 0.9], [2, -0.9]] : [[-2.7, 0.45], [2.7, -0.45]];
  mons.forEach((m, i) => { if (!m) return; m.base.set(pos[i][0], 0, pos[i][1]); });
  const camDir = new THREE.Vector3(0, asp < 0.8 ? 0.72 : 0.42, 1).normalize();
  camTarget.y = asp < 0.8 ? 0.55 : 0.9;
  mons.forEach((m, i) => {
    if (!m) return; const o = mons[1 - i];
    const toOpp = o ? o.base.clone().sub(m.base).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    const toCam = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    const f = toOpp.multiplyScalar(1).add(toCam.multiplyScalar(1.7));   // turned towards the viewer so you see their faces
    m.facing = Math.atan2(f.x, f.z);
  });
  // pull the camera back until both monsters (plus room for HUD/ticker) fit
  camera.aspect = asp; camera.updateProjectionMatrix();
  const pts = [];
  mons.forEach(m => { if (!m) return; const r = m.radius * 1.3 + 0.5; pts.push(m.base.clone().add(new THREE.Vector3(-r, 0, 0)), m.base.clone().add(new THREE.Vector3(r, 0, 0)), m.base.clone().add(new THREE.Vector3(0, m.height + 0.6, 0))); });
  // keep the monsters between the on-screen UI (HUD/tags on top, cards/ticker at the bottom)
  let top = 0.6, bot = -0.55;
  const ndc = px => 1 - 2 * px / innerHeight;
  if (mode === 'fight') { top = ndc($('#s-fight .hud').getBoundingClientRect().bottom + 30); bot = ndc($('#ticker').getBoundingClientRect().top - 6); }
  else if (mode === 'reveal') { top = ndc(46); bot = ndc($('#revealCards').getBoundingClientRect().top - 6); }
  if (!(top - bot > 0.5)) { top = 0.6; bot = -0.55; }
  const baseY = camTarget.y, want = (top + bot) / 2, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const aim = d => {
    camTarget.y = baseY;
    for (let k = 0; k < 3; k++) {
      camera.position.copy(camTarget).addScaledVector(camDir, d); camera.lookAt(camTarget); camera.updateMatrixWorld();
      if (!pts.length) return;
      const ys = pts.map(p => p.clone().project(camera).y), mid = (Math.max(...ys) + Math.min(...ys)) / 2;
      camTarget.y += (mid - want) * tanH * d * 0.9;
    }
    camera.position.copy(camTarget).addScaledVector(camDir, d); camera.lookAt(camTarget); camera.updateMatrixWorld();
  };
  for (let d = 5; d < 40; d += 0.25) {
    aim(d);
    if (pts.every(p => { const v = p.clone().project(camera); return Math.abs(v.x) < 0.88 && v.y < top && v.y > bot; })) break;
  }
  camBase.copy(camera.position);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  layout();
}
addEventListener('resize', resize);

// Name tags over monsters
const tags = [null, null];
function makeTags() {
  tags.forEach(t => t?.remove());
  mons.forEach((m, i) => {
    const el = document.createElement('div'); el.className = 'tag'; el.style.background = PCOL[i];
    el.textContent = S.names[i];
    $('#floaters').appendChild(el); tags[i] = el;
  });
}
function updateTags() {
  mons.forEach((m, i) => {
    const el = tags[i]; if (!el || !m) return;
    const vis = !m.dead && m.root.visible && (mode === 'reveal' || mode === 'fight');
    el.style.display = vis ? '' : 'none'; if (!vis) return;
    const [x, y] = toScreen(m.root.position.clone().add(new THREE.Vector3(0, m.height + 0.15, 0)));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.fontSize = mode === 'fight' ? '11px' : '14px';
  });
}

// ---------------------------------------------------------------- Portraits for the results screen
let pr = null;
function portrait(m) {
  if (!pr) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(320, 320, false);
    const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xfff0ff, 0x4a2a6a, 1.8)); const l = new THREE.DirectionalLight(0xffffff, 2.4); l.position.set(3, 6, 6); s.add(l);
    pr = { r, s, c: new THREE.PerspectiveCamera(30, 1, 0.1, 50) };
  }
  const parent = m.root.parent;
  const saved = { p: m.root.position.clone(), q: m.root.quaternion.clone(), vis: m.root.visible };
  pr.s.add(m.root); m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0.45, 0); m.root.visible = true;
  m.rig.position.set(0, 0, 0); m.rig.scale.set(1, 1, 1); m.shield.visible = false;
  m.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m.root), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
  const dim = Math.max(sz.x, sz.y, sz.z);
  pr.c.position.set(c.x, c.y + dim * 0.25, c.z + dim * 2.3); pr.c.lookAt(c);
  pr.r.render(pr.s, pr.c);
  const url = pr.r.domElement.toDataURL('image/png');
  if (parent) parent.add(m.root);
  m.root.position.copy(saved.p); m.root.quaternion.copy(saved.q); m.root.visible = saved.vis;
  return url;
}

// ---------------------------------------------------------------- Session state + screens
const QUIZ = { 30: buildQuiz(30), 60: buildQuiz(60) };
let S = freshSession();
function freshSession() { return { names: store.get('names', ['', '']), len: store.get('len', 30), answers: [[], []], player: 0, qi: 0, phase: 'title', seedBump: 0, traits: [null, null] }; }
function saveSession() { store.set('session', { names: S.names, len: S.len, answers: S.answers, player: S.player, qi: S.qi, phase: S.phase }); }
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + id));
  canvas.style.visibility = (id === 'reveal' || id === 'fight') ? 'visible' : 'hidden';
  if (id === 'q' || id === 'fight') wake(true); else wake(false);
  if (id !== 'title') { if (!history.state) history.pushState({ pm: 1 }, ''); }
}
let wakeLock = null, wantWake = false;
async function wake(on) {
  wantWake = on;
  try { if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantWake) wake(true); });

// Title
const nameIn = [$('#name1'), $('#name2')];
nameIn.forEach((el, i) => { el.value = S.names[i] || ''; el.addEventListener('input', () => { S.names[i] = el.value.trim(); store.set('names', [nameIn[0].value.trim(), nameIn[1].value.trim()]); }); });
function setLen(l) { S.len = l; store.set('len', l); document.querySelectorAll('#lenSeg button').forEach(b => b.classList.toggle('on', +b.dataset.len === l)); }
document.querySelectorAll('#lenSeg button').forEach(b => b.addEventListener('click', () => { Sound.init(); Sound.click(); setLen(+b.dataset.len); }));
setLen(S.len === 60 ? 60 : 30);
function finalNames() { S.names = [nameIn[0].value.trim() || 'Player 1', nameIn[1].value.trim() || 'Player 2']; if (S.names[0] === S.names[1]) S.names[1] += ' 2'; }
$('#btnStart').addEventListener('click', () => {
  Sound.init(); Sound.pop(); finalNames();
  S.answers = [[], []]; S.player = 0; S.qi = 0; S.phase = 'hand0'; saveSession(); handover(0);
});
$('#btnResume').addEventListener('click', () => {
  Sound.init(); Sound.pop();
  const s = store.get('session', null); if (!s) return;
  Object.assign(S, s); nameIn[0].value = S.names[0]; nameIn[1].value = S.names[1];
  if (S.phase === 'q') startTest(S.player, S.qi); else handover(S.phase === 'hand1' ? 1 : 0);
});
$('#btnDemo').addEventListener('click', () => {
  Sound.init(); Sound.pop(); finalNames();
  const rnd = () => { const t = {}; for (const k of TORDER) { const x = Math.random(); t[k] = Math.round(x < 0.2 ? 5 + Math.random() * 25 : x > 0.8 ? 70 + Math.random() * 25 : 25 + Math.random() * 50); } return t; };
  S.traits = [rnd(), rnd()]; S.seedBump = Math.floor(Math.random() * 1e6); S.fromDemo = true;
  startReveal();
});
$('#btnMute1').addEventListener('click', () => { Sound.init(); Sound.setMuted(!Sound.muted); Sound.click(); });
$('#btnMute2').addEventListener('click', () => { Sound.init(); Sound.setMuted(!Sound.muted); Sound.click(); });
updateMuteButtons();
function showTitle() {
  abortAll(); clearFloaters(); tags.forEach(t => t && (t.style.display = 'none'));
  mode = 'menu'; speedMul = 1; paused = false; Sound.quiet = false;
  const s = store.get('session', null);
  $('#btnResume').style.display = s && ['hand0', 'q', 'hand1'].includes(s.phase) ? '' : 'none';
  show('title');
}

// Handover
function handover(p) {
  S.phase = 'hand' + p; saveSession();
  const me = esc(S.names[p]), other = esc(S.names[1 - p]);
  $('#handTitle').innerHTML = p === 0 ? `${me} goes first!` : `Pass the phone to ${me}!`;
  $('#handSub').innerHTML = p === 0
    ? `${other}, look away. Answer honestly, ${me}: your monster is made from your answers.`
    : `${other}'s monster is incubating 🥚. No peeking at ${me}'s answers!`;
  $('#btnHand').textContent = `I'M ${S.names[p].toUpperCase()}, LET'S GO`;
  $('#btnHand').onclick = () => { Sound.init(); Sound.pop(); startTest(p, 0); };
  show('hand');
}

// Questions
let qLock = false;
function startTest(p, qi) { S.player = p; S.qi = qi; S.phase = 'q'; saveSession(); show('q'); renderQ(); }
function renderQ() {
  const quiz = QUIZ[S.len], q = quiz[S.qi], p = S.player;
  $('#qChip').textContent = `${S.names[p]}'s test`; $('#qChip').style.background = PCOL[p];
  $('#qCount').textContent = `${S.qi + 1} / ${quiz.length}`;
  $('#qBar').style.width = (S.qi / quiz.length * 100) + '%'; $('#qBar').style.background = PCOL[p];
  const el = $('#qText'); el.textContent = q.text; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  const prev = S.answers[p][S.qi];
  document.querySelectorAll('#likert button').forEach(b => b.classList.toggle('picked', +b.dataset.v === prev));
  $('#qBack').style.visibility = S.qi > 0 ? 'visible' : 'hidden';
}
document.querySelectorAll('#likert button').forEach(b => b.addEventListener('click', () => {
  if (qLock) return; qLock = true; Sound.init();
  const v = +b.dataset.v; S.answers[S.player][S.qi] = v; b.classList.add('picked');
  Sound.tone({ f0: 300 + v * 90, f1: 420 + v * 120, dur: 0.08, vol: 0.12 }); buzz(10);
  setTimeout(() => {
    qLock = false;
    const quiz = QUIZ[S.len];
    if (S.qi < quiz.length - 1) { S.qi++; saveSession(); renderQ(); }
    else finishTest(S.player);
  }, 140);
}));
$('#qBack').addEventListener('click', () => { if (S.qi > 0) { S.qi--; Sound.click(); renderQ(); saveSession(); } });
$('#qQuit').addEventListener('click', () => { saveSession(); showTitle(); });
function finishTest(p) {
  if (p === 0) { handover(1); return; }
  S.traits = [scoreQuiz(QUIZ[S.len], S.answers[0]), scoreQuiz(QUIZ[S.len], S.answers[1])];
  S.phase = 'done'; S.fromDemo = false; store.del('session');
  S.seedBump = Math.floor(Math.random() * 1e6);
  startReveal();
}

// ---------------------------------------------------------------- Reveal
function spawnMonsters() {
  mons.forEach(disposeMonster);
  const st = S.traits.map(computeStats);
  let prevHue = null;
  mons = S.traits.map((t, i) => {
    const seed = hashStr(JSON.stringify(t) + S.names[i] + i + ':' + S.seedBump);
    const spec = makeSpec(t, st[i], seed, prevHue); prevHue = spec.hue;
    const m = buildMonster(spec);
    m.stats = st[i]; m.traits = t; m.name = S.names[i] + "'s monster"; m.idx = i;
    return m;
  });
  mons.forEach(m => { m.portrait = portrait(m); scene.add(m.root); });
  layout(); makeTags();
}
function statRows(m, keys) {
  return keys.map(k => `<div class="srow"><span>${k}</span><div class="sb"><i style="width:${clamp(m.stats[k] / STAT[k].max * 100, 3, 100)}%;background:${PCOL[m.idx]}"></i></div><span>${m.stats[k]}${STAT[k].unit}</span></div>`).join('');
}
function startReveal() {
  abortAll(); clearFloaters();
  spawnMonsters();
  mode = 'reveal'; paused = false; speedMul = 1;
  $('#revealCards').innerHTML = mons.map((m, i) => `<div class="mcard" style="border-color:${PCOL[i]}"><div class="t">${esc(S.names[i])}</div><div class="sub">monster</div>${statRows(m, ['HP', 'ATK', 'DEF', 'SPD'])}<div class="compact">❤️${m.stats.HP} 🦷${m.stats.ATK} 🛡️${m.stats.DEF}% ⚡${m.stats.SPD}</div></div>`).join('');
  show('reveal'); resize();
  const b = $('#revealBanner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  mons.forEach((m, i) => {
    m.squash = 0.01;
    wait(250 + i * 450).then(() => {
      Sound.boing(); Sound.voice(m.spec.voice);
      explosion(m.base.clone().add(new THREE.Vector3(0, m.cy, 0)), ['#ffffff', PCOL[i], '#ffd23f']);
      tween(0.6, p => { m.squash = 0.01 + p * 0.99 + Math.sin(p * Math.PI * 3) * (1 - p) * 0.4; }, ease.out);
    });
  });
}
$('#btnReroll').addEventListener('click', () => { Sound.init(); Sound.click(); S.seedBump++; startReveal(); });
$('#btnFight').addEventListener('click', () => { Sound.init(); startFight(); });

// ---------------------------------------------------------------- Fight
let F = null;
const VERBS = ['chomps', 'bonks', 'headbutts', 'slaps', 'wobbles into', 'bites', 'sneezes on', 'belly-flops onto', 'karate-chops', 'nibbles aggressively at', 'boops', 'drop-kicks', 'licks (aggressively)', 'judo-flips'];
const SFX = ['BONK!', 'SPLAT!', 'POW!', 'WHAM!', 'BOINK!', 'SQUISH!', 'THWACK!', 'ZONK!'];
function ticker(html) { $('#ticker').innerHTML = html; }
const nm = i => `<b style="color:${PCOL[i]}">${esc(S.names[i])}</b>`;
function setHP(i) {
  const m = mons[i], frac = clamp(F.hp[i] / m.stats.HP, 0, 1), el = $('#hp' + (i + 1));
  el.querySelector('i').style.width = (frac * 100) + '%'; el.querySelector('b').style.width = (frac * 100) + '%';
  el.querySelector('.num').textContent = `${Math.ceil(F.hp[i])} / ${m.stats.HP}`;
}
function banner(text) { const b = $('#fightBanner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function startFight() {
  abortAll(); clearFloaters();
  mons.forEach(m => { Object.assign(m, { dead: false, off: new THREE.Vector3(), spin: 0, tilt: 0, roll: 0, squash: 1, armUp: 0, mouthOpen: 0, rage: 0, hug: 0, flash: 0 }); m.root.visible = true; if (!m.root.parent) scene.add(m.root); });
  layout();
  F = { t0: gameTime, hp: mons.map(m => m.stats.HP), gauge: [Math.random() * 40, Math.random() * 40], busy: true, over: false, sudden: false, mul: 1.25,
    rec: mons.map(() => ({ dmg: 0, hits: 0, crits: 0, blocks: 0, slams: 0, hugs: 0, healed: 0, rages: 0, trips: 0, selfDmg: 0 })) };
  mode = 'fight'; speedMul = 1; paused = false; Sound.quiet = false;
  $('#btnSpeed').textContent = '1×'; $('#btnPause').textContent = '❚❚';
  mons.forEach((m, i) => { const el = $('#hp' + (i + 1)); el.querySelector('.nm').textContent = S.names[i]; el.querySelector('.pl').textContent = ''; setHP(i); });
  show('fight'); resize();
  ticker('3… 2… 1…');
  (async () => {
    await wait(600); banner('FIGHT!'); Sound.kazoo([[392, 0.12], [523, 0.12], [659, 0.25]]); buzz(30);
    ticker(`${nm(0)} vs ${nm(1)}. Only one leaves the arena!`);
    await wait(900); F.busy = false;
  })();
}
function fightTick(dt) {
  if (!F || F.over || paused) return;
  const el = gameTime - F.t0;
  if (el > 40 && !F.sudden) { F.sudden = true; banner('SUDDEN DEATH!'); Sound.growl(); ticker('🔥 SUDDEN DEATH! Damage keeps rising until someone drops!'); }
  F.mul = 1.25 * (F.sudden ? 2 + (el - 40) / 6 : 1);
  if (F.busy) return;
  for (let i = 0; i < 2; i++) F.gauge[i] += mons[i].stats.SPD * 0.86 * dt;
  const a = F.gauge[0] >= 100 && F.gauge[0] >= F.gauge[1] ? 0 : F.gauge[1] >= 100 ? 1 : -1;
  if (a < 0) return;
  F.gauge[a] -= 100; F.busy = true;
  act(a).then(() => { if (!F || F.over) return; F.busy = false; });
}
async function act(a) {
  const m = mons[a], st = m.stats;
  let ko;
  if (Math.random() * 100 < st.TAN) ko = await tantrum(a);
  else if (F.hp[a] < st.HP * 0.8 && Math.random() * 100 < st.HUG) await hug(a);
  else ko = await attack(a, Math.random() * 100 < st.SPC);
  if (ko != null) await finish(ko);
}
function dirTo(a) { return mons[1 - a].base.clone().sub(mons[a].base).setY(0); }
async function attack(a, special) {
  const A = mons[a], d = 1 - a, D = mons[d];
  const full = dirTo(a), dist = Math.max(0.3, full.length() - (A.radius + D.radius) * 0.85), dir = full.normalize();
  Sound.voice(A.spec.voice);
  if (!special) {
    ticker(`${nm(a)} ${pick(VERBS)} ${nm(d)}!`);
    await tween(0.2, p => { A.off.copy(dir).multiplyScalar(-0.35 * p); A.squash = 1 - 0.22 * p; A.mouthOpen = p; A.armUp = p; });
    Sound.whoosh();
    await tween(0.17, p => { A.off.copy(dir).multiplyScalar(-0.35 + (dist + 0.35) * p); A.squash = 0.78 + 0.4 * p; A.walk += 0.6; }, ease.in);
    const res = impact(a, 1, false);
    await Promise.all([res.kb, tween(0.38, p => { A.off.copy(dir).multiplyScalar(dist * (1 - p)); A.squash = 1.18 - 0.18 * p; A.mouthOpen = 1 - p; A.armUp = 1 - p; A.walk += 0.4; }, ease.out)]);
    return res.ko;
  }
  F.rec[a].slams++;
  ticker(`${nm(a)} goes ✨<b>COSMIC</b>✨ and launches into the sky!`);
  Sound.boing(); floatText(A.root.position.clone().add(new THREE.Vector3(0, A.height, 0)), '✨ COSMIC! ✨', '#e8a8ff', 26);
  await tween(0.22, p => { A.squash = 1 - 0.35 * p; });
  emit(A.root.position.clone(), { n: 25, colors: ['#e8a8ff', '#a8f0ff', '#ffffff'], speed: 3, up: 2 });
  await tween(0.75, p => {
    A.off.copy(dir).multiplyScalar(dist * p * 1.05); A.off.y = Math.sin(p * Math.PI) * 3.2;
    A.spin = p * Math.PI * 4; A.squash = 0.8 + 0.4 * Math.sin(p * Math.PI);
    if (Math.random() < 0.5) emit(A.root.position.clone().add(new THREE.Vector3(0, A.cy, 0)), { n: 2, colors: ['#e8a8ff', '#ffd23f', '#a8f0ff'], speed: 1, up: 0, life: 0.6, grav: 0 });
  }, ease.io);
  A.spin = 0; A.squash = 0.55;
  const res = impact(a, 1.8, true);
  await Promise.all([res.kb, tween(0.5, p => { A.off.copy(dir).multiplyScalar(dist * 1.05 * (1 - p)); A.off.y = Math.sin(p * Math.PI) * 0.8; A.squash = 0.55 + 0.45 * p; }, ease.out)]);
  return res.ko;
}
function impact(a, mult, special) {
  const A = mons[a], d = 1 - a, D = mons[d], rec = F.rec[a];
  const dir = dirTo(a).normalize();
  const hitPos = D.root.position.clone().add(new THREE.Vector3(0, D.cy, 0)).addScaledVector(dir, -D.radius * 0.6);
  let dmg = A.stats.ATK * (0.85 + Math.random() * 0.3) * mult * F.mul;
  if (A.rage) { dmg *= 2; A.rage = 0; floatText(hitPos.clone().add(new THREE.Vector3(0, 0.8, 0)), 'RAGE ×2', '#ff6b4a', 24); }
  const crit = !special && Math.random() < 0.08; if (crit) dmg *= 1.5;
  const blocked = Math.random() * 100 < D.stats.BLK;
  if (blocked) {
    F.rec[d].blocks++; D.shieldT = 0.6; Sound.clang(); buzz(15);
    floatText(hitPos.clone().add(new THREE.Vector3(0, 0.5, 0)), 'BLOCKED!', '#9ff3ff', 28);
    emit(hitPos, { n: 18, colors: ['#9ff3ff', '#ffffff'], speed: 4, up: 1, size: 0.7, life: 0.5 });
    ticker(`${nm(d)} pops a shield bubble. <b>BLOCKED!</b>`);
    if (!special) return { ko: null, kb: Promise.resolve() };
    dmg *= 0.5;
  }
  dmg = Math.max(1, Math.round(dmg * (1 - D.stats.DEF / 100)));
  F.hp[d] = Math.max(0, F.hp[d] - dmg); setHP(d);
  rec.dmg += dmg; rec.hits++; if (crit) rec.crits++;
  D.flash = 1; shake = special ? 0.5 : crit ? 0.3 : 0.15; buzz(special ? 60 : 25);
  const colors = ['#ffffff', '#ffd23f', PCOL[a], '#' + new THREE.Color().setHSL(A.spec.hue, 0.9, 0.6).getHexString()];
  explosion(hitPos, colors, special);
  if (special) { Sound.boom(false); Sound.bonk(); } else pick([() => Sound.bonk(), () => Sound.splat(), () => Sound.squeak()])();
  floatText(hitPos, '-' + dmg, crit || special ? '#ffd23f' : '#ffffff', crit || special ? 44 : 34);
  floatText(hitPos.clone().add(new THREE.Vector3(0, 0.9, 0)), crit ? 'CRITICAL WOBBLE!' : pick(SFX), pick(['#ffd23f', '#ff5fa2', '#36d6ff', '#6cf08a']), crit ? 24 : 20, 0.9);
  if (crit) ticker(`💥 <b>CRITICAL WOBBLE!</b> ${nm(d)} loses ${dmg} HP!`);
  else if (special) ticker(`✨ COSMIC SLAM! ${nm(d)} loses ${dmg} HP!`);
  const ko = F.hp[d] <= 0 ? a : null;
  const kb = ko != null ? Promise.resolve() : tween(0.36, p => { const k = Math.sin(p * Math.PI) * (special ? 0.7 : 0.4); D.off.copy(dir).multiplyScalar(k); D.tilt = Math.sin(p * Math.PI) * 0.35; D.squash = 1 - Math.sin(p * Math.PI) * 0.25; }, ease.lin);
  return { ko, kb };
}
async function tantrum(a) {
  const A = mons[a], rec = F.rec[a];
  ticker(`${nm(a)} throws a <b>TANTRUM</b>! 😤`); Sound.growl(); buzz(40);
  floatText(A.root.position.clone().add(new THREE.Vector3(0, A.height + 0.2, 0)), '😤', '#fff', 40);
  await tween(0.7, p => { A.off.set(Math.sin(p * 60) * 0.12, Math.abs(Math.sin(p * 18)) * 0.25, 0); A.armUp = Math.abs(Math.sin(p * 20)); A.mouthOpen = 0.6; A.flash = 0.25; });
  A.off.set(0, 0, 0); A.armUp = 0; A.mouthOpen = 0;
  if (Math.random() < 0.5) {
    rec.rages++; A.rage = 1;
    ticker(`${nm(a)} is <b style="color:#ff6b4a">FURIOUS</b>. Next hit does double damage!`);
    floatText(A.root.position.clone().add(new THREE.Vector3(0, A.height, 0)), 'RAGE!', '#ff6b4a', 34);
    emit(A.root.position.clone().add(new THREE.Vector3(0, A.height * 0.8, 0)), { n: 20, colors: ['#ff3b1f', '#ff9a3c', '#3a3a3a'], speed: 2, up: 3, grav: -1, life: 1 });
    await wait(500); return null;
  }
  rec.trips++;
  const self = Math.max(1, Math.round(A.stats.ATK * 0.45 * F.mul * (1 - A.stats.DEF / 100)));
  ticker(`${nm(a)} trips over its own feet. Self-own! −${self}`);
  await tween(0.3, p => { A.tilt = p * 1.35; A.off.y = Math.sin(p * Math.PI) * 0.3; }, ease.in);
  Sound.fart(); shake = 0.12; emit(A.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { n: 22, colors: ['#c8e68a', '#a3c45c', '#e8f5c0'], speed: 2, up: 1, life: 1.1, grav: 1 });
  F.hp[a] = Math.max(0, F.hp[a] - self); rec.selfDmg += self; setHP(a); A.flash = 0.8;
  floatText(A.root.position.clone().add(new THREE.Vector3(0, A.cy, 0)), '-' + self, '#c8e68a', 30);
  if (F.hp[a] <= 0) return 1 - a;
  await wait(350);
  await tween(0.35, p => { A.tilt = 1.35 * (1 - p); A.off.y = Math.sin(p * Math.PI) * 0.4; }, ease.out);
  return null;
}
async function hug(a) {
  const A = mons[a], rec = F.rec[a];
  const heal = Math.min(Math.round(A.stats.HP * 0.1 + 4), A.stats.HP - Math.ceil(F.hp[a]));
  rec.hugs++; rec.healed += heal;
  ticker(`${nm(a)} pauses for a little self-hug. 🤗 +${heal} HP`); Sound.heal();
  await tween(0.35, p => { A.hug = p; A.squash = 1 - 0.12 * p; });
  F.hp[a] = Math.min(A.stats.HP, F.hp[a] + heal); setHP(a);
  floatText(A.root.position.clone().add(new THREE.Vector3(0, A.height, 0)), '+' + heal + ' 💖', '#6cf08a', 32);
  emit(A.root.position.clone().add(new THREE.Vector3(0, A.cy, 0)), { n: 30, colors: ['#ff8fc8', '#ff5fa2', '#ffffff', '#6cf08a'], speed: 1.5, up: 3, grav: -1.5, life: 1.3, size: 1.2 });
  await tween(0.6, p => { A.squash = 0.88 + Math.sin(p * Math.PI * 4) * 0.06; });
  await tween(0.3, p => { A.hug = 1 - p; A.squash = 0.88 + 0.12 * p; });
}
async function finish(w) {
  F.over = true;
  const l = 1 - w, W = mons[w], L = mons[l];
  L.dead = true;
  const pos = L.root.position.clone().add(new THREE.Vector3(0, L.cy, 0));
  explosion(pos, ['#ffffff', '#ffd23f', '#ff5fa2', '#36d6ff', '#6cf08a', '#ff6b4a'], true);
  Sound.boom(true); shake = 0.9; buzz([80, 40, 120]);
  banner('K.O.!');
  ticker(`💥 ${nm(l)} is launched out of the arena!`);
  const away = L.base.clone().sub(W.base).setY(0).normalize();
  setTimeout(() => Sound.ding(), 500);
  await tween(1.3, p => { L.off.copy(away).multiplyScalar(p * 14); L.off.y = Math.sin(p * Math.PI * 0.8) * 9; L.spin = p * 14; L.roll = p * 6; }, ease.lin);
  L.root.visible = false;
  emit(L.root.position.clone(), { n: 30, colors: ['#ffd23f', '#ffffff'], speed: 3, life: 0.8 });
  ticker(`🏆 ${nm(w)} wins for <b style="color:${PCOL[w]}">${esc(S.names[w])}</b>!`);
  Sound.kazoo([[392, 0.14], [523, 0.14], [659, 0.14], [784, 0.3], [659, 0.14], [784, 0.5]]);
  for (let k = 0; k < 3; k++) {
    await tween(0.22, p => { W.squash = 1 - 0.3 * p; W.armUp = p; });
    emit(W.root.position.clone().add(new THREE.Vector3(0, W.height + 0.5, 0)), { n: 40, colors: ['#ff5fa2', '#36d6ff', '#ffd23f', '#6cf08a', '#ffffff'], speed: 5, up: 4, life: 1.4 });
    await tween(0.45, p => { W.off.y = Math.sin(p * Math.PI) * 1.3; W.squash = 0.7 + 0.5 * Math.sin(p * Math.PI); W.spin = (k % 2 ? -1 : 1) * p * Math.PI * 2; });
    W.spin = 0;
  }
  W.armUp = 0; W.squash = 1;
  await wait(900);
  F.winner = w; F.duration = gameTime - F.t0;
  Sound.quiet = false;
  showResults();
}
$('#btnSpeed').addEventListener('click', () => { Sound.click(); speedMul = speedMul === 1 ? 2 : speedMul === 2 ? 3 : 1; $('#btnSpeed').textContent = speedMul + '×'; });
$('#btnPause').addEventListener('click', () => { Sound.click(); paused = !paused; $('#btnPause').textContent = paused ? '▶' : '❚❚'; });
$('#btnSkip').addEventListener('click', () => { if (!F || F.over) return; Sound.click(); Sound.quiet = true; speedMul = 12; paused = false; $('#btnSpeed').textContent = '⏭'; });

// ---------------------------------------------------------------- Results
function mirrorRow(label, sub, a, b, max, unit = '') {
  const w = v => clamp(v / max * 100, 2, 100);
  return `<div class="mrow"><div class="lbl"><b style="color:${PCOL[0]}">${a}${unit}</b><em>${label}${sub ? `<br><span style="font-weight:500">${sub}</span>` : ''}</em><b style="color:${PCOL[1]}">${b}${unit}</b></div>
    <div class="mbars"><div><i style="width:${w(a)}%;background:${PCOL[0]}"></i></div><div><i style="width:${w(b)}%;background:${PCOL[1]}"></i></div></div></div>`;
}
function looks(m) {
  const s = m.spec, t = m.traits, out = [];
  out.push(`${s.eyes} eye${s.eyes > 1 ? 's' : ''} (Openness ${t.O})`);
  if (s.shape === 'mochi') out.push(`squashy mochi body (Openness)`);
  if (s.antenna) out.push(`${s.antenna === 2 ? 'two cosmic antennae' : 'a cosmic antenna'} (Openness ${t.O})`);
  out.push(s.spikes ? `${s.spikes} soft back nub${s.spikes > 1 ? 's' : ''} (Agreeableness ${t.A}, lower = more)` : `no back nubs at all (Agreeableness ${t.A})`);
  out.push(s.sharp ? `a pout with tiny fangs (Agreeableness ${t.A})` : `a sweet smile (Agreeableness ${t.A})`);
  if (s.brows) out.push(`grumpy little eyebrows (low Agreeableness)`);
  if (s.halo) out.push(`a halo (very agreeable)`);
  if (s.plate) out.push(`a tidy tummy patch with buttons (Conscientiousness ${t.C})`);
  out.push(`size ×${s.scale.toFixed(2)} (Extraversion ${t.E})`);
  if (s.sweat) out.push(`nervous sweat drop (Neuroticism ${t.N})`);
  if (t.N > 55) out.push(`shakes and jitters (Neuroticism ${t.N})`);
  return out;
}
function showResults() {
  mode = 'results'; abortAll(); clearFloaters();
  const w = F.winner, l = 1 - w, W = mons[w];
  const R = F.rec;
  let h = `
  <div class="winner"><div class="crown">🏆</div><h2 style="color:${PCOL[w]}">${esc(W.name)} wins!</h2>
    <div class="small">${esc(S.names[w])}'s monster survived with ${Math.ceil(F.hp[w])} of ${W.stats.HP} HP after ${Math.round(F.duration)} seconds of chaos.</div></div>
  <div class="portraits">${mons.map((m, i) => `<div class="portrait ${i === w ? 'won' : 'lost'}" style="border-color:${PCOL[i]}"><img src="${m.portrait}" alt=""><div class="t">${esc(S.names[i])}</div></div>`).join('')}</div>
  <div class="card"><h3>Personality test (0–100)</h3><div class="mirror">
    ${TORDER.map(k => mirrorRow(`${TRAITS[k].emoji} ${TRAITS[k].name}`, `low: ${TRAITS[k].lo} · high: ${TRAITS[k].hi}`, mons[0].traits[k], mons[1].traits[k], 100)).join('')}
  </div>${S.fromDemo ? '<p class="small" style="margin:10px 0 0">(Random demo scores: nobody took the test.)</p>' : ''}</div>
  <div class="card"><h3>Monster stats</h3><div class="mirror">
    ${SORDER.map(k => mirrorRow(`${STAT[k].icon} ${STAT[k].name}`, '', mons[0].stats[k], mons[1].stats[k], STAT[k].max, STAT[k].unit)).join('')}
  </div></div>
  <div class="card"><h3>How your personality built your monster</h3><div class="explain">
    ${SORDER.map(k => `<div class="ex"><div class="h">${STAT[k].icon} ${STAT[k].name}</div><div class="why">${STAT[k].why}</div><div class="math">
      ${mons.map((m, i) => `<div><b style="color:${PCOL[i]}">${esc(S.names[i])}:</b> ${m.stats.parts[k].map(p => p[2] ? `${Math.round(p[1])} from ${p[0]} (${m.traits[p[2]]})` : `${p[1]} ${p[0]}`).join(' + ')} = <b>${m.stats[k]}${STAT[k].unit}</b></div>`).join('')}
    </div></div>`).join('')}
    <div class="ex"><div class="h">🎨 Looks</div><div class="why">Colour is random; everything else comes from the test.</div><div class="math">
      ${mons.map((m, i) => `<div style="margin-bottom:4px"><b style="color:${PCOL[i]}">${esc(S.names[i])}:</b> ${looks(m).join(', ')}.</div>`).join('')}
    </div></div>
  </div></div>
  <div class="card"><h3>Fight recap</h3><table class="recap">
    <tr><th style="color:${PCOL[0]}">${esc(S.names[0])}</th><th></th><th style="color:${PCOL[1]}">${esc(S.names[1])}</th></tr>
    ${[['Damage dealt', 'dmg'], ['Hits landed', 'hits'], ['Critical wobbles', 'crits'], ['Cosmic slams', 'slams'], ['Hits blocked', 'blocks'], ['Self-hugs', 'hugs'], ['HP healed', 'healed'], ['Rage tantrums', 'rages'], ['Tripped over own feet', 'trips']]
      .map(([lbl, k]) => `<tr><td>${R[0][k]}</td><td>${lbl}</td><td>${R[1][k]}</td></tr>`).join('')}
  </table></div>
  <div class="btns">
    <button class="big" id="rRematch">⚔️ REMATCH</button>
    <button class="btn2" id="rReroll">🎲 Same personalities, new monsters</button>
    <button class="btn2" id="rNew">👥 New players</button>
  </div>
  <p class="small" style="text-align:center">Just for fun. A real Big Five assessment uses validated questionnaires, and no personality trait is “good” or “bad” in real life, only in monster battles.</p>`;
  $('#resWrap').innerHTML = h;
  show('res'); $('#s-res').scrollTop = 0;
  Sound.kazoo([[523, 0.1], [659, 0.1], [784, 0.2]]);
  $('#rRematch').onclick = () => { Sound.init(); Sound.pop(); startFight(); };
  $('#rReroll').onclick = () => { Sound.init(); Sound.pop(); S.seedBump++; startReveal(); };
  $('#rNew').onclick = () => { Sound.init(); Sound.click(); mons.forEach(disposeMonster); mons = [null, null]; F = null; showTitle(); };
}

// ---------------------------------------------------------------- Back gesture: pause/step back instead of leaving
addEventListener('popstate', () => {
  const active = document.querySelector('.screen.active')?.id;
  if (active === 's-title') return;
  history.pushState({ pm: 1 }, '');
  if (active === 's-q') { if (S.qi > 0) { S.qi--; renderQ(); } else { saveSession(); showTitle(); } }
  else if (active === 's-fight') { paused = true; $('#btnPause').textContent = '▶'; }
  else if (active === 's-hand') { saveSession(); showTitle(); }
  else if (active === 's-reveal' || active === 's-res') { showTitle(); }
});

// ---------------------------------------------------------------- Main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const gdt = paused ? 0 : dt * speedMul;
  gameTime += gdt;
  runClock();
  if (mode === 'fight') fightTick(gdt);
  if (mode !== 'reveal' && mode !== 'fight') return; // nothing to draw behind solid screens
  mons.forEach(m => m && updateMonster(m, gameTime, gdt));
  updateParticles(gdt); updateFx(gdt);
  for (const d of deco) { d.position.y = d.userData.y + Math.sin(gameTime * d.userData.sp + d.userData.ph) * 0.6; d.rotation.y += d.userData.rs * dt; d.rotation.x += d.userData.rs * 0.5 * dt; }
  shake = Math.max(0, shake - dt * 1.8);
  camera.position.copy(camBase).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  camera.lookAt(camTarget);
  renderer.render(scene, camera);
  updateFloaters(gdt || dt * 0.0001); updateTags();
}
resize();
showTitle();
requestAnimationFrame(frame);
document.addEventListener('pointerdown', () => Sound.init(), { once: true });
