// Rally Havoc — arcade rally racing through live traffic.
// Everything is in road coordinates: s = distance along the road, d = offset to the right.
import * as THREE from './three.min.js';

/* ============================== platform ============================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'rally-havoc';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};
const settings = { sound: store.get('sound', true), vibe: store.get('vibe', true), color: store.get('color', 0), gfx: store.get('gfx', 'high'),
  cam: store.get('cam', 'chase'), model: Math.min(5, Math.max(0, store.get('model', 0) | 0)), road: Object.assign({ traffic: true, police: true, obstacles: true, peds: true }, store.get('road', {})), ctrl: store.get('ctrl', 'halves') };
const progress = store.get('progress', { unlocked: 1, best: {} });
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const vibrate = ms => { if (settings.vibe) try { navigator.vibrate?.(ms); } catch {} };

/* ============================== utils ============================== */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const R = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmtTime = t => { const m = Math.floor(t / 60), s = Math.floor(t - m * 60), d = Math.floor((t - Math.floor(t)) * 10); return m + "'" + (s < 10 ? '0' : '') + s + '"' + d; };
const ord = n => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
const $ = id => document.getElementById(id);

/* ============================== stages ============================== */
const STAGES = [
  { name: 'Borgo Verde', dmg: 0.44, sub: 'Village & vineyards · gentle start', len: 3000, seed: 11, tb: 0.45, traffic: 0.648, oncoming: 0.475, bus: 0.12, peds: 0.78, props: 0.65, ramps: 0.9, rival: 41.5, kmax: 0.0105, hills: 11, sky: 'day' },
  { name: 'Valle Rossa', dmg: 0.546, sub: 'Fast valley roads · jumps', len: 3500, seed: 23, tb: 0.35, traffic: 0.821, oncoming: 0.648, bus: 0.14, peds: 0.91, props: 0.8, ramps: 1.4, rival: 43, kmax: 0.0118, hills: 16, sky: 'sunset' },
  { name: 'Città Alta', dmg: 0.651, sub: 'Rush hour downtown · buses', len: 3600, seed: 37, tb: 0.75, traffic: 1.166, oncoming: 0.821, bus: 0.24, peds: 1.56, props: 0.85, ramps: 0.7, rival: 43.5, kmax: 0.01, hills: 10, sky: 'overcast' },
  { name: 'Passo Nebbia', dmg: 0.748, sub: 'Foggy mountain pass · rocks', len: 4200, seed: 41, tb: 0.3, traffic: 0.95, oncoming: 0.864, bus: 0.16, peds: 1.04, props: 1.15, ramps: 1.1, rival: 44.5, kmax: 0.0128, hills: 24, sky: 'fog' },
  { name: 'Gran Finale', dmg: 0.836, sub: 'Dusk · everything, everywhere', len: 5000, seed: 53, tb: 0.5, traffic: 1.382, oncoming: 1.037, bus: 0.2, peds: 1.69, props: 1.25, ramps: 1.3, rival: 45.5, kmax: 0.0122, hills: 17, sky: 'dusk' },
];
const SKIES = {
  day:      { top: 0x2f7fd6, hor: 0xbfe0f4, fog: 0xcfe6f2, near: 90, far: 340, sun: 0xfff4e0, sunI: 2.7, sky: 0xdcecff, gnd: 0x6b7a4a, hemiI: 1.25, lamps: false,
              sunDir: [-0.45, 0.8, 0.4], cloud: 0.5, cloudCol: 0xffffff, shadow: 0.8, emis: 0, beams: 0, spot: 0, glow: 2.6, env: 0.8, mt: 0.38, expo: 1.0, smoke: 1 },
  sunset:   { top: 0x2c3c78, hor: 0xf5a066, fog: 0xe9a57a, near: 80, far: 320, sun: 0xffa868, sunI: 3.0, sky: 0xffcfa8, gnd: 0x5a4a3a, hemiI: 1.0, lamps: false,
              sunDir: [-0.55, 0.3, 0.78], cloud: 0.55, cloudCol: 0xffb48a, shadow: 0.75, emis: 0.5, beams: 0.12, spot: 0, glow: 3.0, env: 0.8, mt: 0.45, expo: 1.05, smoke: 0.9 },
  overcast: { top: 0x7c8896, hor: 0xc7ced4, fog: 0xc7ced4, near: 60, far: 270, sun: 0xe6ebf0, sunI: 1.3, sky: 0xdfe5ea, gnd: 0x5f6658, hemiI: 1.7, lamps: false,
              sunDir: [-0.3, 0.9, 0.3], cloud: 1.0, cloudCol: 0xcdd3d8, shadow: 0.45, emis: 0.3, beams: 0.1, spot: 0, glow: 2.8, env: 0.9, mt: 0.3, expo: 1.05, smoke: 0.9 },
  fog:      { top: 0xaab3b9, hor: 0xd6dbde, fog: 0xd6dbde, near: 18, far: 165, sun: 0xeef2f5, sunI: 1.0, sky: 0xe8edf0, gnd: 0x6a7068, hemiI: 1.75, lamps: false,
              sunDir: [-0.3, 0.85, 0.4], cloud: 0, cloudCol: 0xd6dbde, shadow: 0.3, emis: 0.5, beams: 0.3, spot: 250, glow: 3.0, env: 0.9, mt: 0, expo: 1.0, smoke: 0.9 },
  dusk:     { top: 0x0c1436, hor: 0x9a4e6c, fog: 0x5a4064, near: 50, far: 270, sun: 0x9c9cff, sunI: 0.9, sky: 0x8a86c8, gnd: 0x2a2630, hemiI: 0.95, lamps: true,
              sunDir: [0.5, 0.45, 0.72], cloud: 0.4, cloudCol: 0x7a5a86, shadow: 0.55, emis: 1.9, beams: 0.55, spot: 700, glow: 3.0, env: 0.8, mt: 0.5, expo: 1.2, smoke: 0.4 },
};
const RIVALS = [
  { name: 'Bianchi', model: 'tempesta', col: 0x2f6fe0, acc: 0xffffff, skill: 1.0, aggr: 0.5 },
  { name: 'Kowalski', model: 'saetta', col: 0xe8e8e8, acc: 0xd2232a, skill: 0.985, aggr: 0.8 },
  { name: 'Müller', model: 'vento', col: 0x1c1c1c, acc: 0xffc61a, skill: 0.97, aggr: 0.3 },
  { name: 'Dupont', model: 'fulmine', col: 0x19a35a, acc: 0xffffff, skill: 0.955, aggr: 0.6 },
  { name: 'Svensson', model: 'duna', col: 0xf0b400, acc: 0x1f4ea8, skill: 0.94, aggr: 0.4 },
];
const PLAYER_COLORS = [
  { col: 0xd8261c, acc: 0xffffff, css: '#d8261c' },
  { col: 0xf2f2f2, acc: 0x1f4ea8, css: '#f2f2f2' },
  { col: 0xff7a00, acc: 0x111111, css: '#ff7a00' },
  { col: 0x8a2be2, acc: 0x39e0ff, css: '#8a2be2' },
];

/* ============================== renderer ============================== */
const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoundedBoxGeometry } = THREE;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
const PR_MAX = isTouch ? 1.5 : 2;
let pixelRatio = Math.min(window.devicePixelRatio || 1, PR_MAX);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 480);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
{ const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 460; sc.updateProjectionMatrix(); }
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
const sunDir = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
// two helper lights that are always in the scene (so shaders never recompile mid-race)
const boomLight = new THREE.PointLight(0xffa040, 0, 0, 2); scene.add(boomLight); let boomT = 0;
const headSpot = new THREE.SpotLight(0xfff0d0, 0, 0, 0.55, 0.7, 2); headSpot.position.set(0, 1.0, 1.6); headSpot.target.position.set(0, 0.3, 16);
scene.fog = new THREE.Fog(0xcfe6f2, 90, 340);
let portrait = false, skyCfg = null;

// Sky: gradient + sun + drifting clouds in one shader; the same dome feeds the reflections on the cars.
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, fogc: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
  cloudCol: { value: new THREE.Color() }, sunDir: { value: sunDir }, cloud: { value: 0.4 }, disk: { value: 1 }, time: { value: 0 } };
const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec3 top, hor, fogc, sunCol, cloudCol, sunDir; uniform float cloud, disk, time; varying vec3 vD;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
    void main(){
      vec3 d = normalize(vD); float h = max(d.y, 0.0);
      vec3 c = mix(hor, top, pow(h, 0.55));
      float sd = max(dot(d, sunDir), 0.0);
      c += sunCol * (pow(sd, 64.0) * 0.45 + pow(sd, 6.0) * 0.14);
      c += sunCol * disk * smoothstep(0.9990, 0.9996, sd) * 5.0;
      if (cloud > 0.0 && d.y > 0.0) {
        vec2 uv = d.xz / (d.y + 0.16) * 1.1 + vec2(time * 0.006, 0.0); float n = fbm(uv);
        float cl = smoothstep(1.0 - cloud, 1.3 - cloud, n * 1.4) * smoothstep(0.0, 0.18, d.y);
        vec3 cc = mix(cloudCol * 0.72, cloudCol, smoothstep(0.35, 0.8, n)) + sunCol * pow(sd, 8.0) * 0.3;
        c = mix(c, cc, cl * 0.92);
      }
      c = mix(fogc, c, smoothstep(-0.01, 0.09, d.y));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
const skyGeo = new THREE.SphereGeometry(380, 32, 16);
const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);
const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(skyGeo, skyMat));
const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null;
// distant mountain silhouette for depth
const mountMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false });
const mount = (() => {
  const N = 140, Rr = 360, pos = [], colr = [], hh = [];
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; hh.push(Math.max(5, 15 + 15 * Math.sin(a * 5 + 0.5) + 9 * Math.sin(a * 11 + 2) + 5 * Math.sin(a * 23 + 1) + 4 * Math.sin(i * 12.9898) )); }
  hh[N] = hh[0];
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const x0 = Math.cos(a0) * Rr, z0 = Math.sin(a0) * Rr, x1 = Math.cos(a1) * Rr, z1 = Math.sin(a1) * Rr;
    pos.push(x0, -12, z0, x1, -12, z1, x1, hh[i + 1], z1, x0, -12, z0, x1, hh[i + 1], z1, x0, hh[i], z0);
    const t0 = 1 - hh[i] / 60, t1 = 1 - hh[i + 1] / 60;
    colr.push(1, 1, 1, 1, 1, 1, t1, t1, t1, 1, 1, 1, t1, t1, t1, t0, t0, t0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  const m = new THREE.Mesh(g, mountMat); m.renderOrder = -1; m.frustumCulled = false; mountMat.side = THREE.DoubleSide; scene.add(m); return m;
})();
function setSky(cfg) {
  skyCfg = cfg;
  skyU.top.value.set(cfg.top); skyU.hor.value.set(cfg.hor); skyU.fogc.value.set(cfg.fog); skyU.sunCol.value.set(cfg.sun); skyU.cloudCol.value.set(cfg.cloudCol); skyU.cloud.value = cfg.cloud;
  sunDir.set(cfg.sunDir[0], cfg.sunDir[1], cfg.sunDir[2]).normalize();
  scene.fog.color.set(cfg.fog); scene.fog.near = cfg.near; scene.fog.far = cfg.far;
  camera.far = Math.max(440, cfg.far + 120); camera.updateProjectionMatrix();
  renderer.setClearColor(cfg.fog); renderer.toneMappingExposure = cfg.expo;
  sun.color.set(cfg.sun); sun.intensity = cfg.sunI; sun.shadow.intensity = cfg.shadow;
  hemi.color.set(cfg.sky); hemi.groundColor.set(cfg.gnd); hemi.intensity = cfg.hemiI;
  mountMat.color.set(cfg.fog).lerp(_c.set(cfg.top), cfg.mt);
  matLampHead.color.set(cfg.lamps ? 0xfff0b0 : 0xd8d8d0).multiplyScalar(cfg.lamps ? 3 : 1);
  matLights.color.setScalar(cfg.glow);
  matBuild.emissiveIntensity = cfg.emis;
  matBeam.opacity = cfg.beams; SMK.mat.uniforms.boost.value = cfg.smoke;
  // reflections for the car paint and glass
  skyU.disk.value = 0;
  const rt = pmrem.fromScene(envScene, 0, 1, 1000);
  skyU.disk.value = 1;
  if (envRT) envRT.dispose(); envRT = rt;
  scene.environment = rt.texture; scene.environmentIntensity = cfg.env;
}

/* ============================== textures ============================== */
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4; return t;
}
const blobTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const sprTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
function bannerTex(text, bg, fg) {
  return canvasTex(512, 96, (g, w, h) => {
    for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) { g.fillStyle = ((x + y) / 32) % 2 ? '#111' : '#eee'; g.fillRect(x, y, 32, 32); }
    g.fillStyle = bg; g.fillRect(64, 10, w - 128, h - 20);
    g.fillStyle = fg; g.font = 'italic 900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}
const numTexCache = {};
function numTex(n) {
  return numTexCache[n] ||= canvasTex(64, 64, (g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.font = 'italic 900 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35);
  });
}

/* ============================== materials & geometry ============================== */
function drawFacade(g, emis) {
  const S = 256;
  if (!emis) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 3); }
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 250, 512, 6); g.fillRect(0, 506, 512, 6);          // floor bands
  } else { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); }
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
    const k = cy * 2 + cx, x = cx * S + 78, y = cy * S + 46, w = 100, h = 150;
    if (emis) {
      if (k === 1 || k === 2) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, k === 1 ? '#ffe2a0' : '#c9955a'); gr.addColorStop(1, k === 1 ? '#ffb85a' : '#8a5a30'); g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = '#000'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.42, w, 4); }
      continue;
    }
    g.fillStyle = '#e6dfd0'; g.fillRect(x - 9, y - 9, w + 18, h + 18);                               // stone frame
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#5d7f9c'); gr.addColorStop(0.5, '#2c3e52'); gr.addColorStop(1, '#1d2a38');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.moveTo(x, y + h * 0.5); g.lineTo(x + w * 0.7, y); g.lineTo(x + w, y); g.lineTo(x + w * 0.2, y + h); g.lineTo(x, y + h); g.fill();
    g.fillStyle = '#efe9dc'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.42, w, 4);    // mullions
    g.fillStyle = '#cfc7b6'; g.fillRect(x - 14, y + h + 9, w + 28, 9);                                 // sill
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 14, y + h + 18, w + 28, 5);
    if (k === 0 || k === 3) { g.fillStyle = k === 0 ? '#2f6b40' : '#7a4a2c'; g.fillRect(x - 42, y - 4, 31, h + 8); g.fillRect(x + w + 11, y - 4, 31, h + 8);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let q = 4; q < h; q += 11) { g.fillRect(x - 40, y + q, 27, 3); g.fillRect(x + w + 13, y + q, 27, 3); } }
    if (k === 1) { g.fillStyle = 'rgba(240,235,220,0.5)'; g.fillRect(x, y, w, h * 0.3); }                 // half-drawn blind
    if (k === 2) { g.fillStyle = '#23262b'; g.fillRect(x - 30, y + h - 44, w + 60, 5); g.fillRect(x - 30, y + h + 4, w + 60, 6); for (let q = -28; q <= w + 28; q += 12) g.fillRect(x + q, y + h - 44, 3, 50); }  // balcony
  }
}
const facadeTex = canvasTex(512, 512, g => drawFacade(g, false), true);
const facadeEmisTex = canvasTex(512, 512, g => drawFacade(g, true), true);
const grainTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.04 + Math.random() * 0.1})` : `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 26, 0, 7); g.fill(); }
}, true);
const beamTex = canvasTex(64, 128, (g) => {
  g.save(); g.translate(32, 14); g.scale(1, 3.6);
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(-32, -4, 64, 40); g.restore();
});
// Vehicles, people and props share one PBR material; roughness/metalness ride along per vertex.
const matV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
matV.onBeforeCompile = sh => {
  sh.vertexShader = 'attribute vec3 aRM;\nvarying vec3 vRM;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
  sh.fragmentShader = 'varying vec3 vRM;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
};
// Car bodies: physical material with a clear coat that only the paint and glass get (third aRM channel).
const matCar = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
matCar.onBeforeCompile = sh => {
  sh.vertexShader = 'attribute vec3 aRM;\nvarying vec3 vRM;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
  sh.fragmentShader = 'varying vec3 vRM;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n material.clearcoat *= vRM.z;\n#endif');
};
const matLights = new THREE.MeshBasicMaterial({ vertexColors: true });
const matBrake = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1808).multiplyScalar(6) });
const matChar = new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.95, metalness: 0.1 });
const matTrack = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: grainTex });
const matBuild = new THREE.MeshLambertMaterial({ vertexColors: true, map: facadeTex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: facadeEmisTex, emissiveIntensity: 0 });
const matTree = new THREE.MeshLambertMaterial({ vertexColors: true });
const matPole = new THREE.MeshLambertMaterial({ color: 0x3a3d40 });
const matShadow = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const matLampHead = new THREE.MeshBasicMaterial({ color: 0xd8d8d0 });
// additive "light on the ground" decals fade to black in fog instead of to the fog colour
const fogToBlack = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);\n#endif'); };
const matBeam = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xfff0cc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
matBeam.onBeforeCompile = fogToBlack;
const matPool = new THREE.MeshBasicMaterial({ map: sprTex, color: 0xffb060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
matPool.onBeforeCompile = fogToBlack;
const hdr = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
const LAMP = {
  rOn: hdr(0xff2a1a, 4), rOff: new THREE.MeshBasicMaterial({ color: 0x3a1210 }),
  yOn: hdr(0xffc21a, 3), yOff: new THREE.MeshBasicMaterial({ color: 0x3a3010 }),
  gOn: hdr(0x2bff6a, 3), gOff: new THREE.MeshBasicMaterial({ color: 0x0f3018 }),
};
const geoPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const TPL = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18).toNonIndexed(),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed(),
  cone: new THREE.ConeGeometry(1, 1, 10).toNonIndexed(),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dode: new THREE.DodecahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.2, 6, 16).toNonIndexed(),
  wedge: (() => { // ramp: rises from z=0 to z=1 (height 1)
    const P = [
      [-.5,0,0],[.5,0,0],[.5,1,1], [-.5,0,0],[.5,1,1],[-.5,1,1],
      [-.5,0,1],[.5,0,1],[.5,1,1], [-.5,0,1],[.5,1,1],[-.5,1,1],
      [-.5,0,0],[-.5,1,1],[-.5,0,1], [.5,0,0],[.5,0,1],[.5,1,1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); g.computeVertexNormals(); return g;
  })(),
};
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();
const P_ = (tpl, sx, sy, sz, x, y, z, col, rx = 0, ry = 0, rz = 0) => ({ tpl, sx, sy, sz, x, y, z, col, rx, ry, rz });
const DARK = 0x1a1a1c, GLASS = 0x1c2832, TYRE = 0x161616, RIM = 0xa8acb0;
const RMT = new Map([[GLASS, [0.03, 0.1, 1]], [TYRE, [0.9, 0, 0]], [DARK, [0.55, 0.1, 0.2]], [RIM, [0.22, 1, 0.5]]]);
function merge(parts, paint = false) {
  const G = p => typeof p.tpl === 'string' ? TPL[p.tpl] : p.tpl;
  let count = 0; for (const p of parts) count += G(p).attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), rm = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    const g = G(p), Pa = g.attributes.position, Na = g.attributes.normal;
    const m = p.rm || RMT.get(p.col) || (paint ? [0.34, 0.15, 1] : [0.85, 0, 0]);
    _m4.compose(_p3.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s3.set(p.sx, p.sy, p.sz));
    _n3.getNormalMatrix(_m4); _c.set(p.col);
    for (let i = 0; i < Pa.count; i++, o++) {
      _v1.fromBufferAttribute(Pa, i).applyMatrix4(_m4); pos[o * 3] = _v1.x; pos[o * 3 + 1] = _v1.y; pos[o * 3 + 2] = _v1.z;
      _v1.fromBufferAttribute(Na, i).applyMatrix3(_n3).normalize(); nor[o * 3] = _v1.x; nor[o * 3 + 1] = _v1.y; nor[o * 3 + 2] = _v1.z;
      col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b; rm[o * 3] = m[0]; rm[o * 3 + 1] = m[1]; rm[o * 3 + 2] = m[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aRM', new THREE.BufferAttribute(rm, 3));
  geo.computeBoundingSphere(); return geo;
}
const geoCache = {};
const cached = (key, fn) => geoCache[key] ||= fn();

/* ---------- vehicle models (all face +z, +x is the car's left) ---------- */
// Bodies are lofted shells: a rounded cross-section swept along the car, with the hood/roof line,
// wheel arches, flares and tumblehome all driven by curves. Colours are assigned per triangle,
// so glass, pillars, seams, trim and liveries are painted straight onto one smooth surface.
const HPI = Math.PI / 2;
const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
function curve(pts) {   // smooth curve through [z, y] keys (cubic Hermite / Catmull-Rom)
  const P = pts.slice().sort((a, b) => a[0] - b[0]), n = P.length;
  return z => {
    if (z <= P[0][0]) return P[0][1];
    if (z >= P[n - 1][0]) return P[n - 1][1];
    let i = 0; while (z > P[i + 1][0]) i++;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const h = p2[0] - p1[0], t = (z - p1[0]) / h, t2 = t * t, t3 = t2 * t;
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}
function stations(z0, z1, E, fine, base, extra, endK) {
  const s = [z0, z1, ...extra];
  for (let z = z0; z <= z1; z += base) s.push(z);
  for (const [a, b, st] of fine) for (let z = a; z <= b; z += st) s.push(z);
  if (E > 0) for (let k = 1; k <= endK; k++) { const d = E * (1 - Math.cos(k / endK * HPI)); s.push(z0 + d, z1 - d); }
  s.sort((a, b) => a - b);
  const out = [];
  for (const z of s) if (z >= z0 && z <= z1 && (!out.length || z - out[out.length - 1] > 0.005)) out.push(z);
  out[out.length - 1] = z1;
  return out;
}
function secOf(B, z) {
  let W = B.W(z), yb = B.yb(z), yt = B.yt(z);
  if (B.E > 0) {
    const u = Math.min(z - B.z0, B.z1 - z) / B.E;
    if (u < 1) { const f = Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))); W *= f; const m = (yb + yt) / 2, hh = (yt - yb) / 2 * Math.sqrt(f); yb = m - hh; yt = m + hh; }
  }
  return { W, yb, yt };
}
function halfAt(B, z, y) {    // half width of the shell at (z, y), or -1 outside
  const s = secOf(B, z); if (y < s.yb || y > s.yt) return -1;
  const h = (y - s.yb) / (s.yt - s.yb), ey = Math.abs(2 * h - 1);
  return s.W * Math.pow(Math.max(0, 1 - Math.pow(ey, B.n)), 1 / B.n) * (1 - B.taper * h * h);
}
function endZ(B, x, y, front) {  // where the nose (front) or tail surface is at (x, y)
  if (front) { for (let z = B.z1; z > 0; z -= 0.004) if (halfAt(B, z, y) >= Math.abs(x)) return z; return B.z1; }
  for (let z = B.z0; z < 0; z += 0.004) if (halfAt(B, z, y) >= Math.abs(x)) return z; return B.z0;
}
const _cl = new Map();
const rgbOf = hex => { let c = _cl.get(hex); if (!c) { c = new THREE.Color(hex); _cl.set(hex, c); } return c; };
function loft(B, zs, NT, cls, opt = {}) {
  const open = opt.t0 !== undefined, t0 = open ? opt.t0 : 0, t1 = open ? opt.t1 : Math.PI * 2;
  const ring = open ? NT + 1 : NT, NZ = zs.length, lift = opt.lift || 0;
  const pos = new Float32Array(NZ * ring * 3), aux = new Float32Array(NZ * ring * 2);
  for (let i = 0; i < NZ; i++) {
    const z = zs[i], s = secOf(B, z);
    for (let j = 0; j < ring; j++) {
      const t = open ? t0 + (t1 - t0) * j / NT : j / NT * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      const ex = sgnPow(c, 2 / B.n), ey = sgnPow(sn, 2 / B.n), h = (ey + 1) / 2, k = i * ring + j;
      pos[k * 3] = s.W * ex * (1 - B.taper * h * h); pos[k * 3 + 1] = s.yb + h * (s.yt - s.yb) + lift; pos[k * 3 + 2] = z;
      aux[k * 2] = c; aux[k * 2 + 1] = sn;
    }
  }
  const idx = [];
  for (let i = 0; i < NZ - 1; i++) for (let j = 0; j < (open ? NT : NT); j++) {
    const j2 = open ? j + 1 : (j + 1) % NT, a = i * ring + j, b = i * ring + j2, c = (i + 1) * ring + j2, d = (i + 1) * ring + j;
    idx.push(a, b, c, a, c, d);
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g0.setAttribute('aux', new THREE.BufferAttribute(aux, 2));
  g0.setIndex(idx); g0.computeVertexNormals();
  const g = g0.toNonIndexed(); g0.dispose();
  const P = g.attributes.position.array, N = g.attributes.normal.array, A = g.attributes.aux.array, cnt = P.length / 3;
  const colA = new Float32Array(cnt * 3), rmA = new Float32Array(cnt * 3), o = {};
  for (let v = 0; v < cnt; v += 6) {   // one decision per quad (its two triangles), so edges never zigzag
    o.x = o.y = o.z = o.nx = o.ny = o.nz = o.c = o.s = 0;
    for (let k = v; k < v + 6; k++) { o.x += P[k * 3]; o.y += P[k * 3 + 1]; o.z += P[k * 3 + 2]; o.nx += N[k * 3]; o.ny += N[k * 3 + 1]; o.nz += N[k * 3 + 2]; o.c += A[k * 2]; o.s += A[k * 2 + 1]; }
    for (const key of ['x', 'y', 'z', 'nx', 'ny', 'nz', 'c', 's']) o[key] /= 6;
    const r = cls(o), cc = rgbOf(r[0]);
    for (let k = v; k < v + 6; k++) { colA[k * 3] = cc.r; colA[k * 3 + 1] = cc.g; colA[k * 3 + 2] = cc.b; rmA[k * 3] = r[1]; rmA[k * 3 + 1] = r[2]; rmA[k * 3 + 2] = r[3]; }
  }
  g.deleteAttribute('aux');
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.setAttribute('aRM', new THREE.BufferAttribute(rmA, 3));
  if (!opt.both) return g;
  // thin panel: add the back face slightly below
  const g2 = g.clone(), p2 = g2.attributes.position.array, n2 = g2.attributes.normal.array;
  for (let v = 0; v < p2.length; v += 9) for (const arr of [p2, n2]) for (let q = 0; q < 3; q++) { const t = arr[v + 3 + q]; arr[v + 3 + q] = arr[v + 6 + q]; arr[v + 6 + q] = t; }
  for (let k = 0; k < n2.length; k++) n2[k] = -n2[k];
  for (let k = 1; k < p2.length; k += 3) p2[k] -= 0.012;
  return concat([g, g2]);
}
function concat(list) {
  const names = ['position', 'normal', 'color', 'aRM'], out = new THREE.BufferGeometry();
  for (const nm of names) {
    const sz = list[0].attributes[nm].itemSize; let n = 0; for (const g of list) n += g.attributes[nm].count;
    const arr = new Float32Array(n * sz); let o = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
  }
  out.computeBoundingSphere(); return out;
}
function xform(geo, x, y, z, ry) { const g = geo.clone(); g.applyMatrix4(_m4.compose(_p3.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s3.set(1, 1, 1))); return g; }
let buildLo = false;
const rboxGeo = (sx, sy, sz, r) => cached('rb' + [sx, sy, sz, r], () => { const g = new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)); const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
const RB = (sx, sy, sz, r, x, y, z, colr, rx = 0, ry = 0, rz = 0) => buildLo ? P_('box', sx, sy, sz, x, y, z, colr, rx, ry, rz) : P_(rboxGeo(sx, sy, sz, r), 1, 1, 1, x, y, z, colr, rx, ry, rz);
const withRM = (p, rm) => { p.rm = rm; return p; };

// materials per triangle: [colour, roughness, metalness, clearcoat]
const UNDER = 0x101112, TRIMC = 0x1a1b1d;
const M_GLASS = [GLASS, 0.03, 0.1, 1], M_TRIM = [TRIMC, 0.55, 0.05, 0.15], M_UNDER = [UNDER, 0.9, 0, 0];
const M_CHROME = [0xd8dce0, 0.12, 1, 0.6], M_PLATE = [0xf2f2ee, 0.5, 0, 0.3];
const paintCache = new Map();
function paintRM(hex, metal) { const k = hex + '_' + metal; let r = paintCache.get(k); if (!r) { r = [hex, metal ? 0.3 : 0.38, metal ? 0.55 : 0.03, 1]; paintCache.set(k, r); } return r; }
const darker = (hex, k) => rgbOf(hex).clone().multiplyScalar(k).getHex();

function wheelGeo(r, w, lo, rim = RIM, spokes = 5) {
  return cached('wh' + [r, w, lo, rim, spokes], () => {
    const seg = lo ? 8 : 20, ri = r * 0.66;
    const prof = [[ri, -w / 2], [r - 0.05, -w / 2], [r - 0.012, -w / 2 + 0.022], [r, -w / 2 + 0.06], [r, w / 2 - 0.06], [r - 0.012, w / 2 - 0.022], [r - 0.05, w / 2], [ri, w / 2]];
    const mk = pts => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
    let lt = mk(prof);
    if (lt.attributes.normal.getX(3) < 0) { lt.dispose(); lt = mk(prof.slice().reverse()); }
    lt.rotateZ(-HPI); const tyre = lt.toNonIndexed(); tyre.deleteAttribute('uv'); lt.dispose();
    const rimRM = rim === RIM ? [0.22, 1, 0.5] : [0.32, 0.15, 1];
    const parts = [withRM(P_(tyre, 1, 1, 1, 0, 0, 0, TYRE), [0.9, 0, 0])];
    if (lo) parts.push(withRM(P_('cyl6', ri * 0.98, w * 0.8, ri * 0.98, 0.01, 0, 0, rim, 0, 0, HPI), rimRM));
    else {
      parts.push(withRM(P_('cyl', ri, w * 0.88, ri, 0, 0, 0, 0x262626, 0, 0, HPI), [0.7, 0.3, 0]));
      parts.push(withRM(P_('torus', ri * 0.96, ri * 0.96, 0.18, w * 0.4, 0, 0, rim, 0, HPI, 0), rimRM));
      for (let k = 0; k < spokes; k++) { const a = k / spokes * Math.PI * 2; parts.push(withRM(P_('box', 0.04, ri * 0.86, ri * (spokes > 5 ? 0.2 : 0.26), w * 0.37, Math.cos(a) * ri * 0.47, Math.sin(a) * ri * 0.47, rim, a, 0, 0), rimRM)); }
      parts.push(withRM(P_('cyl', ri * 0.24, 0.06, ri * 0.24, w * 0.4, 0, 0, rim, 0, 0, HPI), rimRM));
    }
    return merge(parts);
  });
}

function bodySpec(S) {
  const B = { z0: -S.L / 2, z1: S.L / 2, n: S.n, taper: S.taper, E: S.E, Ra: S.r + (S.arch ?? 0.05) };
  const Ra = B.Ra, zf = Math.max(...S.zs) + Ra, zr = Math.min(...S.zs) - Ra;
  B.yt = curve(S.top);
  B.W = z => { let w = S.hw; if (S.flare) for (const zw of S.zs) { const d = Math.abs(z - zw), R = Ra + 0.3; if (d < R) w += S.flare * (0.5 + 0.5 * Math.cos(Math.PI * d / R)); } return w; };
  B.yb = z => {
    let y = S.sill;
    if (z > zf) y += S.noseLift * smooth(zf, B.z1, z); else if (z < zr) y += S.tailLift * smooth(zr, B.z0, z);
    for (const zw of S.zs) { const d = z - zw; if (Math.abs(d) <= Ra) y = Math.max(y, S.r * 0.98 + Math.sqrt(Ra * Ra - d * d)); }
    return y;
  };
  return B;
}
function cabinSpec(S, B) {
  const C = S.cab, yb = z => B.yt(z) - 0.06;
  return { z0: C.z0, z1: C.z1, n: C.n || 4, taper: C.taper, E: 0, W: () => C.W, yb, yt: curve([[C.z1, yb(C.z1)], ...C.roof, [C.z0, yb(C.z0)]]) };
}
function bodyCls(S, B) {
  const P = paintRM(S.paint, S.metal), SEAM = [darker(S.paint, 0.25), 0.6, 0, 0], ACC = S.acc !== undefined ? paintRM(S.acc, false) : P;
  return o => {
    if (o.ny < (S.flare ? -0.75 : -0.55)) return M_UNDER;
    if (S.hoodZ && o.z > S.hoodZ[0] + 0.03 && o.z < S.hoodZ[1] - 0.03 && o.ny > 0.8 && Math.abs(o.c) < 0.6) return M_UNDER;   // engine bay below the bonnet
    if (S.extraCls) { const r = S.extraCls(o, B); if (r) return r; }
    if (Math.abs(o.nx) > 0.5) {
      if (S.seams && o.y < B.yt(o.z) - 0.05 && o.y > B.yb(o.z) + 0.03) for (const z of S.seams) if (Math.abs(o.z - z) < 0.013) return SEAM;
      if (S.band && o.y > S.band[0] && o.y < S.band[1] && Math.abs(o.z) < S.L / 2 - 0.3 && (!S.bandZ || (o.z > S.bandZ[0] && o.z < S.bandZ[1]))) return ACC;
      if (S.darkSill && o.y < S.sill + 0.11) return M_TRIM;
    }
    if (o.y < S.sill + 0.12 && Math.abs(o.nz) > 0.3) return M_TRIM;       // bumper lips
    return P;
  };
}
function cabCls(S, C) {
  const P = paintRM(S.paint, S.metal), cab = S.cab, PIL = cab.pillarCol ? [cab.pillarCol, 0.4, 0, 1] : P;
  return o => {
    if (o.s < -0.3) return M_UNDER;
    if (o.y < C.yb(o.z) + 0.05) return M_TRIM;
    if (S.cabExtra) { const r = S.cabExtra(o); if (r) return r; }
    const a = Math.abs(o.c);
    if (o.z > cab.zA) return a > 0.88 ? P : M_GLASS;
    if (o.z < cab.zC) return a > (cab.cW || 0.88) ? P : M_GLASS;
    if (a < 0.62 && o.s > 0) return P;
    for (const zb of cab.pillars) if (Math.abs(o.z - zb) < 0.055) return PIL;
    if (cab.sideGlass && !cab.sideGlass(o)) return P;
    return M_GLASS;
  };
}
function carDetails(S, B, b, l, lo) {
  const hw = S.hw, P = S.paint;
  b.push(withRM(P_('box', 2 * (hw - 0.2), 0.3, S.L - 0.9, 0, S.sill + 0.03, 0, UNDER), M_UNDER.slice(1)));
  for (const zw of S.zs) {   // dark wheel wells, sized to stay inside the bodywork
    let hwMin = B.W(zw) - 0.07;
    for (let y = S.r + B.Ra * 0.05; y <= S.r + B.Ra * 0.95; y += 0.04) for (const dz of [-B.Ra * 0.9, 0, B.Ra * 0.9]) { const h = halfAt(B, zw + dz, y); if (h > 0) hwMin = Math.min(hwMin, h - 0.05); }
    b.push(withRM(P_('box', 2 * hwMin, B.Ra * 0.95, B.Ra * 1.9, 0, S.r + B.Ra * 0.5, zw, UNDER), M_UNDER.slice(1)));
  }
  const H = S.head;
  for (const sx of [-1, 1]) {
    const x = sx * H.x, z = endZ(B, x, H.y, true);
    b.push(withRM(RB(H.w + 0.06, H.h + 0.06, 0.14, 0.035, x, H.y, z - 0.055, TRIMC), M_TRIM.slice(1)));
    l.push(RB(H.w, H.h, 0.08, 0.03, x, H.y, z - 0.025, 0xfff6dc));
    const T = S.tail, zt = endZ(B, sx * T.x, T.y, false);
    b.push(withRM(RB(T.w + 0.05, T.h + 0.05, 0.12, 0.03, sx * T.x, T.y, zt + 0.045, TRIMC), M_TRIM.slice(1)));
    l.push(RB(T.w, T.h, 0.08, 0.03, sx * T.x, T.y, zt + 0.022, 0xd8140e));
    if (!lo && T.rev) l.push(RB(T.w * 0.3, T.h * 0.6, 0.08, 0.02, sx * (T.x - T.w * 0.32), T.y, zt + 0.018, 0xf0f0f0));
  }
  if (S.grille) { const G = S.grille, z = endZ(B, 0, G.y, true); b.push(withRM(RB(G.w, G.h, 0.12, 0.04, 0, G.y, z - 0.04, TRIMC), M_TRIM.slice(1))); }
  if (!lo && S.plate !== false) {
    const yp = S.plateY ?? S.sill + 0.17;
    b.push(withRM(RB(0.52, 0.12, 0.04, 0.012, 0, yp, endZ(B, 0, yp, true) - 0.005, 0xf2f2ee), M_PLATE.slice(1)));
    b.push(withRM(P_('box', 0.05, 0.1, 0.01, -0.23, yp, endZ(B, 0, yp, true) + 0.016, 0x1f4ea8), M_PLATE.slice(1)));
    const yr = S.plateRY ?? yp + 0.1;
    b.push(withRM(RB(0.52, 0.12, 0.04, 0.012, 0, yr, endZ(B, 0, yr, false) + 0.005, 0xf2f2ee), M_PLATE.slice(1)));
  }
  if (S.cab && !lo) {
    const zm = S.cab.z1 - 0.2, ym = B.yt(zm) + 0.05, xm = Math.max(0, halfAt(B, zm, B.yt(zm) - 0.1)) + 0.08;
    for (const sx of [-1, 1]) { b.push(RB(0.12, 0.1, 0.17, 0.04, sx * xm, ym, zm, P)); b.push(withRM(P_('box', 0.1, 0.03, 0.06, sx * (xm - 0.07), ym - 0.02, zm + 0.02, TRIMC), M_TRIM.slice(1))); }
    for (const z of (S.seams || []).slice(0, -1)) {
      const zh = z - 0.2, yh = B.yt(zh) - 0.12, xh = halfAt(B, zh, yh);
      if (xh > 0) for (const sx of [-1, 1]) b.push(withRM(P_('box', 0.03, 0.035, 0.15, sx * (xh + 0.006), yh, zh, TRIMC), M_TRIM.slice(1)));
    }
  }
  if (S.exhaust !== false) b.push(withRM(P_('cyl', 0.045, 0.22, 0.045, -0.5, 0.26, endZ(B, 0.5, 0.3, false) + 0.02, 0x666666, HPI), M_CHROME.slice(1)));
}
function buildCar(S, lo) {
  buildLo = lo;
  const B = bodySpec(S), Ra = B.Ra;
  const fine = S.zs.map(zw => [zw - Ra - 0.03, zw + Ra + 0.03, lo ? 0.16 : 0.065]);
  const extra = [...S.zs.flatMap(zw => [zw - Ra, zw + Ra]), ...(lo ? [] : (S.seams || []).flatMap(z => [z - 0.013, z + 0.013])), ...(lo ? [] : S.extraSt || [])];
  const geos = [loft(B, stations(B.z0, B.z1, B.E, fine, lo ? 0.5 : 0.24, extra, lo ? 3 : 6), lo ? 12 : 28, bodyCls(S, B))];
  if (S.cab) {
    const C = cabinSpec(S, B), cab = S.cab;
    const cx = lo ? [] : [...cab.pillars.flatMap(z => [z - 0.055, z + 0.055]), cab.zA, cab.zC];
    geos.push(loft(C, stations(C.z0, C.z1, 0, [[cab.zA - 0.1, C.z1, lo ? 0.22 : 0.08], [C.z0, cab.zC + 0.1, lo ? 0.22 : 0.08]], lo ? 0.4 : 0.16, cx, 0), lo ? 10 : 24, cabCls(S, C)));
  }
  if (!S.sepWheels) { const wg = wheelGeo(S.r, S.w, lo, S.rim, S.spokes); for (const zw of S.zs) for (const sx of [-1, 1]) geos.push(xform(wg, sx * S.x, S.r, zw, sx < 0 ? Math.PI : 0)); }
  const b = [], l = [];
  carDetails(S, B, b, l, lo);
  if (S.more) S.more(B, b, l, lo);
  geos.push(merge(b, true)); buildLo = false;
  return { geo: concat(geos), lights: l.length ? merge(l) : null, B };
}

// bright, saturated paint only, so every car stands out against asphalt, fog and dusk
const CAR_COLORS = [0xff2a1a, 0x1e7bff, 0xf4f4f4, 0x2fe05a, 0xffd21a, 0xff7a10, 0x22d8ff, 0xff3fa4, 0xa04cff, 0xb6ff1a, 0x10e0b0, 0xff5a7a];
const SOLID = new Set([0xf4f4f4, 0xecf0f1, 0xf1c40f, 0xf4c20d, 0xd35400]);
const BUS_COLORS = [0xe8731a, 0x2b8a3e, 0x1e5fb4, 0xc0392b];
const SPEC = {
  sedan: col => ({ L: 4.5, hw: 0.89, n: 4.5, taper: 0.1, E: 0.26, sill: 0.27, noseLift: 0.09, tailLift: 0.13, r: 0.33, w: 0.22, x: 0.76, zs: [1.42, -1.36],
    top: [[2.25, 0.68], [2.08, 0.8], [1.6, 0.86], [0.9, 0.92], [0.6, 0.94], [-1.4, 0.97], [-1.95, 0.96], [-2.25, 0.86]],
    cab: { z1: 0.78, z0: -1.66, W: 0.74, taper: 0.27, roof: [[0.05, 1.41], [-0.3, 1.45], [-0.85, 1.44], [-1.18, 1.35]], zA: 0.08, zC: -1.02, cW: 0.74, pillars: [-0.42], pillarCol: TRIMC },
    seams: [0.73, -0.42, -1.12], head: { x: 0.6, y: 0.7, w: 0.42, h: 0.12 }, tail: { x: 0.64, y: 0.82, w: 0.4, h: 0.13, rev: true }, grille: { y: 0.56, w: 0.7, h: 0.12 } }),
  hatch: col => ({ L: 3.8, hw: 0.84, n: 4.5, taper: 0.1, E: 0.24, sill: 0.27, noseLift: 0.08, tailLift: 0.12, r: 0.31, w: 0.2, x: 0.72, zs: [1.24, -1.18],
    top: [[1.9, 0.67], [1.72, 0.79], [1.25, 0.87], [0.7, 0.93], [-1.6, 0.97], [-1.9, 0.92]],
    cab: { z1: 0.7, z0: -1.86, W: 0.71, taper: 0.25, roof: [[0.0, 1.43], [-0.4, 1.47], [-1.35, 1.45], [-1.63, 1.36]], zA: 0.02, zC: -1.5, cW: 0.8, pillars: [-0.62], pillarCol: TRIMC },
    seams: [0.66, -0.62], head: { x: 0.56, y: 0.71, w: 0.36, h: 0.13 }, tail: { x: 0.66, y: 0.92, w: 0.2, h: 0.24, rev: true }, grille: { y: 0.55, w: 0.6, h: 0.11 } }),
  van: col => ({ L: 4.9, hw: 0.93, n: 6, taper: 0.05, E: 0.22, sill: 0.33, noseLift: 0.06, tailLift: 0.05, r: 0.34, w: 0.22, x: 0.8, zs: [1.62, -1.55],
    top: [[2.45, 0.74], [2.25, 0.93], [1.85, 1.02], [1.4, 1.08], [-2.3, 1.1], [-2.45, 1.08]],
    cab: { z1: 1.35, z0: -2.43, W: 0.88, n: 6, taper: 0.1, roof: [[0.62, 1.9], [0.3, 1.98], [-2.2, 1.98], [-2.34, 1.9]], zA: 0.45, zC: -2.3, cW: 0.8, pillars: [-0.22], sideGlass: o => o.z > -0.22 },
    seams: [1.25, -0.24, -0.32], head: { x: 0.62, y: 0.82, w: 0.36, h: 0.16 }, tail: { x: 0.82, y: 1.0, w: 0.16, h: 0.4 }, grille: { y: 0.62, w: 0.9, h: 0.18 }, darkSill: true }),
  bus: col => ({ L: 11.4, hw: 1.25, n: 9, taper: 0.03, E: 0.38, sill: 0.4, noseLift: 0.05, tailLift: 0.05, r: 0.5, w: 0.3, x: 1.0, zs: [3.75, -2.95], arch: 0.07,
    top: [[5.7, 2.8], [5.4, 2.98], [-5.5, 2.98], [-5.7, 2.85]], plate: false, exhaust: false,
    head: { x: 0.85, y: 0.8, w: 0.4, h: 0.18 }, tail: { x: 1.0, y: 1.0, w: 0.28, h: 0.5 },
    extraSt: (() => { const s = []; for (let z = -5.6; z <= 5.6; z += 1.3) s.push(z, z + 0.1); s.push(4.35, 5.25, -0.2, 0.7); return s; })(),
    extraCls: o => {
      const side = Math.abs(o.nx) > 0.6;
      if (side) {
        if (o.x < 0 && ((o.z > 4.35 && o.z < 5.25) || (o.z > -0.2 && o.z < 0.7)) && o.y > 0.55 && o.y < 2.72) return Math.abs(o.z - 4.8) < 0.03 || Math.abs(o.z - 0.25) < 0.03 ? M_TRIM : M_GLASS;
        if (o.y > 1.6 && o.y < 2.72) return (((o.z + 5.6) % 1.3) + 1.3) % 1.3 < 0.1 ? null : M_GLASS;
        if (o.y > 1.18 && o.y < 1.34) return paintRM(0xf2f2f2, false);
        if (o.y < 0.62) return paintRM(darker(col, 0.6), false);
      }
      if (o.nz > 0.5 && o.y > 1.05 && o.y < 2.62 && Math.abs(o.x) < 1.12) return M_GLASS;
      if (o.nz < -0.5 && o.y > 1.9 && o.y < 2.62 && Math.abs(o.x) < 1.02) return M_GLASS;
      if (Math.abs(o.nz) > 0.5 && o.y < 0.72) return M_TRIM;
      return null;
    },
    more: (B, b, l) => { b.push(RB(1.5, 0.32, 2.6, 0.1, 0, 3.08, -1.6, 0xd6d6d6)); b.push(RB(1.2, 0.26, 1.4, 0.08, 0, 3.05, 2.4, 0xd6d6d6));
      l.push(RB(1.7, 0.26, 0.06, 0.02, 0, 2.86, endZ(B, 0, 2.86, true) - 0.01, 0xffb020));
      for (const sx of [-1, 1]) b.push(withRM(RB(0.08, 0.5, 0.3, 0.03, sx * 1.36, 2.3, 5.45, TRIMC), M_TRIM.slice(1))); } }),
};
SPEC.police = col => Object.assign(SPEC.sedan(col), { band: [0.5, 0.72], bandZ: [-1.08, 0.98], extraSt: [-1.08, 0.98], acc: 0x1f4ea8, more: (B, b, l) => {
  b.push(withRM(RB(1.12, 0.07, 0.32, 0.02, 0, 1.475, -0.35, TRIMC), M_TRIM.slice(1)));
  const zp = endZ(B, 0, 0.5, true); b.push(withRM(RB(1.0, 0.07, 0.06, 0.03, 0, 0.62, zp + 0.03, TRIMC), M_TRIM.slice(1)), withRM(RB(1.0, 0.07, 0.06, 0.03, 0, 0.42, zp + 0.03, TRIMC), M_TRIM.slice(1)));
  for (const x of [-0.42, 0.42]) b.push(withRM(RB(0.07, 0.3, 0.06, 0.03, x, 0.52, zp + 0.03, TRIMC), M_TRIM.slice(1))); } });
SPEC.taxi = col => Object.assign(SPEC.sedan(col), { more: (B, b, l) => { b.push(withRM(RB(0.66, 0.06, 0.3, 0.02, 0, 1.47, -0.4, TRIMC), M_TRIM.slice(1))); l.push(RB(0.6, 0.18, 0.26, 0.05, 0, 1.58, -0.4, 0xfff4c0)); } });
function trafficGeo(type, col) {
  return cached(type + col, () => {
    const mk = () => Object.assign(SPEC[type](col), { paint: col, metal: false });   // solid paint reads brighter than metallic
    const hi = buildCar(mk(), false), lo = buildCar(mk(), true);
    return { hi: hi.geo, lo: lo.geo, lights: hi.lights };
  });
}
/* ---------- rally car line-up: five different machines, each with its own handling ---------- */
// st: spd = top speed, acc = acceleration, hdl = steering & grip, arm = armour (damage taken / arm), off = speed kept off-road
// bars: what the menu shows (1-5)
const TRIM_RM = () => M_TRIM.slice(1), UNDER_RM = () => M_UNDER.slice(1), CHROME_RM = () => M_CHROME.slice(1);
const exhaust = (B, x, r = 0.055) => withRM(P_('cyl', r, 0.22, r, x, 0.26, endZ(B, x, 0.3, false) + 0.02, 0x666666, HPI), CHROME_RM());
const mudflaps = (b, S, rearCol) => { for (const zw of S.zs) for (const sx of [-1, 1]) b.push(withRM(P_('box', 0.34, 0.32, 0.02, sx * S.x, 0.2, zw - S.r - 0.12, zw < 0 ? rearCol : TRIMC), [0.8, 0, 0])); };
const CAR_MODELS = [
  { id: 'fulmine', name: 'FULMINE HF', cls: 'GROUP A HOT HATCH', bars: [3, 4, 5, 3], st: { spd: 1.0, acc: 1.06, hdl: 1.12, arm: 1.0, mass: 1.0, off: 0.62 },
    rim: 0xe6e6e6, spokes: 6, hoodAcc: true, pod: { z: 1.7, n: 4 }, roundelZ: -0.1,
    spec(col, acc) { return { L: 4.0, hw: 0.84, flare: 0.07, n: 4.2, taper: 0.12, E: 0.22, sill: 0.27, noseLift: 0.07, tailLift: 0.1, r: 0.36, w: 0.27, x: 0.8, zs: [1.3, -1.3], sepWheels: true,
      paint: col, acc, metal: false, darkSill: true, band: [0.4, 0.5], hoodZ: [0.86, 1.82],
      top: [[2.0, 0.68], [1.85, 0.83], [1.3, 0.91], [0.82, 0.96], [-1.65, 0.99], [-2.0, 0.93]],
      cab: { z1: 0.8, z0: -1.95, W: 0.72, taper: 0.26, roof: [[0.08, 1.44], [-0.3, 1.48], [-1.3, 1.46], [-1.6, 1.36]], zA: 0.12, zC: -1.52, cW: 0.82, pillars: [-0.62] },
      cabExtra: o => (o.s > 0.5 && Math.abs(o.x) < 0.2 && o.z < 0.12 && o.z > -1.52) ? paintRM(acc, false) : null,
      seams: [0.76, -0.64], head: { x: 0.6, y: 0.72, w: 0.34, h: 0.12 }, tail: { x: 0.62, y: 0.84, w: 0.34, h: 0.13, rev: true }, grille: { y: 0.58, w: 0.62, h: 0.1 },
      more(B, b) {
        const C = cabinSpec(this, B);
        b.push(RB(0.38, 0.1, 0.42, 0.04, 0, C.yt(-0.25) + 0.03, -0.25, acc));                       // roof scoop
        b.push(withRM(P_('box', 0.24, 0.06, 0.04, 0, C.yt(-0.25) + 0.04, -0.03, TRIMC), TRIM_RM()));
        b.push(exhaust(B, 0.5)); mudflaps(b, this, acc);
      } }; },
    spoiler(B, C, col, acc) { const ry = C.yt(-1.5) + 0.05; return [RB(1.62, 0.05, 0.42, 0.02, 0, ry + 0.04, -1.72, acc, -0.12), RB(0.04, 0.16, 0.44, 0.015, -0.8, ry + 0.06, -1.72, col), RB(0.04, 0.16, 0.44, 0.015, 0.8, ry + 0.06, -1.72, col),
      withRM(P_('box', 0.05, 0.1, 0.2, -0.45, ry - 0.02, -1.6, TRIMC), TRIM_RM()), withRM(P_('box', 0.05, 0.1, 0.2, 0.45, ry - 0.02, -1.6, TRIMC), TRIM_RM())]; } },

  { id: 'vento', name: 'VENTO GT-4', cls: 'TURBO COUPE', bars: [5, 3, 3, 3], st: { spd: 1.07, acc: 0.96, hdl: 0.96, arm: 0.95, mass: 1.0, off: 0.6 },
    rim: 0xd8b03a, spokes: 5, hoodAcc: false, pod: { z: 1.88, n: 2 }, roundelZ: -0.15,
    spec(col, acc) { return { L: 4.4, hw: 0.86, flare: 0.06, n: 4.4, taper: 0.12, E: 0.28, sill: 0.24, noseLift: 0.06, tailLift: 0.1, r: 0.35, w: 0.27, x: 0.79, zs: [1.38, -1.32], sepWheels: true,
      paint: col, acc, metal: false, darkSill: true, band: [0.36, 0.44], hoodZ: [0.8, 1.95],
      top: [[2.2, 0.58], [2.05, 0.72], [1.55, 0.8], [0.8, 0.87], [-1.5, 0.92], [-2.0, 0.96], [-2.2, 0.9]],
      cab: { z1: 0.72, z0: -2.0, W: 0.71, taper: 0.32, roof: [[-0.05, 1.27], [-0.45, 1.3], [-1.0, 1.24], [-1.55, 1.08]], zA: 0.0, zC: -1.0, cW: 0.86, pillars: [-0.72] },
      cabExtra: o => (o.s > 0.5 && Math.abs(o.x) < 0.12 && o.z < 0 && o.z > -1.0) ? paintRM(acc, false) : null,
      seams: [0.68, -0.7], head: { x: 0.56, y: 0.5, w: 0.44, h: 0.08 }, tail: { x: 0.5, y: 0.82, w: 0.56, h: 0.1, rev: true }, grille: { y: 0.37, w: 1.1, h: 0.08 },
      more(B, b) {
        const zf = endZ(B, 0, 0.3, true); b.push(withRM(RB(1.66, 0.035, 0.22, 0.015, 0, 0.255, zf - 0.03, TRIMC), TRIM_RM()));   // front splitter
        for (const sx of [-1, 1]) { const xh = halfAt(B, -0.4, 0.64); if (xh > 0) b.push(withRM(RB(0.03, 0.11, 0.34, 0.02, sx * (xh + 0.004), 0.64, -0.4, UNDER), UNDER_RM())); }   // side intakes
        const zr = endZ(B, 0, 0.32, false); b.push(withRM(RB(1.2, 0.08, 0.16, 0.02, 0, 0.3, zr + 0.06, UNDER), UNDER_RM()));   // diffuser
        b.push(exhaust(B, 0.42, 0.06)); b.push(exhaust(B, 0.56, 0.06));
      } }; },
    hoodExtra(B) { const p = []; for (const sx of [-1, 1]) p.push(withRM(RB(0.26, 0.03, 0.42, 0.015, sx * 0.3, B.yt(1.35) + 0.015, 1.35, UNDER), UNDER_RM())); return p; },
    spoiler(B, C, col, acc) { const y = B.yt(-1.95) + 0.17; return [RB(1.6, 0.045, 0.32, 0.02, 0, y, -1.98, acc, -0.08), RB(0.04, 0.14, 0.34, 0.015, -0.78, y + 0.03, -1.98, col), RB(0.04, 0.14, 0.34, 0.015, 0.78, y + 0.03, -1.98, col),
      withRM(P_('box', 0.05, 0.16, 0.14, -0.5, y - 0.09, -1.95, TRIMC), TRIM_RM()), withRM(P_('box', 0.05, 0.16, 0.14, 0.5, y - 0.09, -1.95, TRIMC), TRIM_RM())]; } },

  { id: 'tempesta', name: 'TEMPESTA EVO', cls: '4WD RALLY SEDAN', bars: [4, 4, 4, 4], st: { spd: 1.03, acc: 1.02, hdl: 1.05, arm: 1.1, mass: 1.05, off: 0.66 },
    rim: 0xc9a227, spokes: 6, hoodAcc: false, pod: { z: 1.88, n: 4 }, roundelZ: 0.1,
    spec(col, acc) { return { L: 4.4, hw: 0.87, flare: 0.08, n: 4.4, taper: 0.11, E: 0.25, sill: 0.27, noseLift: 0.08, tailLift: 0.12, r: 0.35, w: 0.27, x: 0.8, zs: [1.4, -1.25], sepWheels: true,
      paint: col, acc, metal: false, darkSill: true, band: [0.42, 0.52], hoodZ: [0.92, 1.95],
      top: [[2.2, 0.66], [2.05, 0.79], [1.6, 0.87], [0.9, 0.94], [-1.3, 1.0], [-1.8, 1.02], [-2.2, 0.95]],
      cab: { z1: 0.86, z0: -1.45, W: 0.74, taper: 0.27, roof: [[0.15, 1.43], [-0.2, 1.47], [-0.85, 1.46], [-1.1, 1.38]], zA: 0.18, zC: -1.0, cW: 0.8, pillars: [-0.4] },
      cabExtra: o => (o.s > 0.5 && Math.abs(o.x) < 0.16 && o.z < 0.18 && o.z > -1.0) ? paintRM(acc, false) : null,
      seams: [0.82, -0.38, -1.15], head: { x: 0.6, y: 0.66, w: 0.4, h: 0.13 }, tail: { x: 0.62, y: 0.88, w: 0.38, h: 0.13, rev: true }, grille: { y: 0.5, w: 0.74, h: 0.12 },
      more(B, b) {
        const C = cabinSpec(this, B);
        b.push(withRM(RB(0.5, 0.05, 0.3, 0.02, 0, C.yt(-0.5) + 0.02, -0.5, TRIMC), TRIM_RM()));        // roof vent
        const zf = endZ(B, 0, 0.32, true); for (const sx of [-1, 1]) b.push(withRM(RB(0.22, 0.12, 0.06, 0.03, sx * 0.55, 0.38, zf - 0.02, 0xfff3c8), [0.3, 0, 0.5]));   // fog lamps
        b.push(exhaust(B, 0.5, 0.07)); mudflaps(b, this, acc);
      } }; },
    hoodExtra(B, col) { const y = B.yt(1.3); return [RB(0.62, 0.11, 0.5, 0.04, 0, y + 0.05, 1.3, col), withRM(RB(0.5, 0.07, 0.03, 0.01, 0, y + 0.06, 1.56, UNDER), UNDER_RM())]; },   // bonnet scoop
    spoiler(B, C, col, acc) { const y = B.yt(-1.95) + 0.34; return [RB(1.66, 0.05, 0.36, 0.02, 0, y, -1.98, col, -0.1), RB(1.66, 0.04, 0.03, 0.01, 0, y + 0.03, -2.16, acc),
      RB(0.05, 0.36, 0.2, 0.02, -0.62, y - 0.17, -1.95, col), RB(0.05, 0.36, 0.2, 0.02, 0.62, y - 0.17, -1.95, col)]; } },

  { id: 'saetta', name: 'SAETTA B', cls: 'GROUP B MONSTER', bars: [5, 5, 2, 2], st: { spd: 1.09, acc: 1.14, hdl: 0.9, arm: 0.8, mass: 0.9, off: 0.58 },
    rim: 0xb8bcc0, spokes: 5, hoodAcc: true, pod: { z: 1.62, n: 2 }, roundelZ: 0.15,
    spec(col, acc) {
      const st = []; for (let z = -1.85; z <= -1.0; z += 1 / 14) st.push(z);
      return { L: 4.0, hw: 0.94, flare: 0.08, n: 4.2, taper: 0.15, E: 0.22, sill: 0.24, noseLift: 0.05, tailLift: 0.08, r: 0.37, w: 0.31, x: 0.86, zs: [1.3, -1.22], sepWheels: true,
      paint: col, acc, metal: false, darkSill: true, band: [0.38, 0.46], hoodZ: [0.82, 1.75], extraSt: st,
      top: [[2.0, 0.55], [1.85, 0.69], [1.3, 0.77], [0.75, 0.82], [-0.9, 0.93], [-1.6, 1.0], [-2.0, 0.97]],
      extraCls: o => {
        if (o.ny > 0.55 && o.z < -1.0 && o.z > -1.85 && Math.abs(o.x) < 0.62 && Math.floor((o.z + 2) * 14) % 2 === 0) return M_UNDER;   // engine cover louvres
        return null; },
      cab: { z1: 0.72, z0: -0.98, W: 0.72, taper: 0.34, roof: [[0.0, 1.22], [-0.35, 1.25], [-0.72, 1.18]], zA: 0.06, zC: -0.74, cW: 0.9, pillars: [], sideGlass: o => o.z > -0.62 },
      cabExtra: o => (o.s > 0.5 && Math.abs(o.x) < 0.14 && o.z < 0.06 && o.z > -0.74) ? paintRM(acc, false) : null,
      seams: [0.7, -0.6], head: { x: 0.62, y: 0.47, w: 0.3, h: 0.09 }, tail: { x: 0.66, y: 0.86, w: 0.3, h: 0.14, rev: true }, grille: { y: 0.34, w: 1.1, h: 0.1 },
      more(B, b) {
        const zf = endZ(B, 0, 0.3, true); b.push(withRM(RB(1.8, 0.035, 0.26, 0.015, 0, 0.255, zf - 0.04, TRIMC), TRIM_RM()));
        for (const sx of [-1, 1]) { const xh = halfAt(B, -0.62, 0.66); if (xh > 0) b.push(withRM(RB(0.04, 0.2, 0.4, 0.03, sx * (xh + 0.004), 0.66, -0.62, UNDER), UNDER_RM())); }   // side air intakes
        const zr = endZ(B, 0, 0.32, false); b.push(withRM(RB(1.5, 0.1, 0.18, 0.02, 0, 0.32, zr + 0.07, UNDER), UNDER_RM()));
        for (const x of [-0.4, -0.25]) b.push(exhaust(B, x, 0.06));
      } }; },
    spoiler(B, C, col, acc) { const y = B.yt(-1.85) + 0.42; return [RB(1.92, 0.06, 0.48, 0.02, 0, y, -1.85, acc, -0.14), RB(0.05, 0.3, 0.56, 0.015, -0.95, y + 0.04, -1.85, col), RB(0.05, 0.3, 0.56, 0.015, 0.95, y + 0.04, -1.85, col),
      withRM(P_('box', 0.06, 0.42, 0.18, -0.45, y - 0.22, -1.82, TRIMC), TRIM_RM()), withRM(P_('box', 0.06, 0.42, 0.18, 0.45, y - 0.22, -1.82, TRIMC), TRIM_RM())]; } },

  { id: 'duna', name: 'DUNA 4X4', cls: 'DESERT RAID TRUCK', bars: [2, 2, 3, 5], st: { spd: 0.95, acc: 0.9, hdl: 0.92, arm: 1.6, mass: 1.6, off: 0.86 },
    rim: 0x2c2c2c, spokes: 6, hoodAcc: false, pod: { z: -0.05, n: 4, roof: true }, roundelZ: 0.25, bullBar: true,
    spec(col, acc) { return { L: 4.7, hw: 0.95, flare: 0.09, n: 5.5, taper: 0.06, E: 0.24, sill: 0.52, noseLift: 0.08, tailLift: 0.06, r: 0.47, w: 0.34, x: 0.84, zs: [1.5, -1.45], arch: 0.08, sepWheels: true,
      paint: col, acc, metal: false, darkSill: true, hoodZ: [0.86, 2.15],
      top: [[2.35, 1.0], [2.2, 1.12], [1.7, 1.2], [0.85, 1.25], [-0.5, 1.27], [-2.35, 1.25]],
      extraCls: o => (o.ny > 0.6 && o.z < -0.62 && o.z > -2.25) ? [0x1c1d20, 0.85, 0, 0.1] : null,     // bed cover
      cab: { z1: 0.76, z0: -0.56, W: 0.86, n: 6, taper: 0.14, roof: [[0.12, 1.96], [-0.12, 2.0], [-0.42, 1.97]], zA: 0.14, zC: -0.5, cW: 0.86, pillars: [-0.17] },
      seams: [0.7, -0.58], head: { x: 0.62, y: 0.9, w: 0.32, h: 0.15 }, tail: { x: 0.82, y: 0.98, w: 0.12, h: 0.34 }, grille: { y: 0.8, w: 1.1, h: 0.2 }, plateY: 0.7,
      more(B, b, l, lo) {
        const C = cabinSpec(this, B);
        for (const sx of [-1, 1]) b.push(withRM(P_('cyl', 0.045, 0.72, 0.045, sx * 0.72, B.yt(-0.7) + 0.34, -0.7, 0x222222), TRIM_RM()));   // roll bar behind the cab
        b.push(withRM(P_('cyl', 0.045, 1.48, 0.045, 0, B.yt(-0.7) + 0.7, -0.7, 0x222222, 0, 0, HPI), TRIM_RM()));
        const ys = B.yt(-1.6) + 0.16; b.push(withRM(P_('cyl', 0.44, 0.3, 0.44, 0, ys, -1.6, TYRE), [0.9, 0, 0]), withRM(P_('cyl', 0.29, 0.31, 0.29, 0, ys, -1.6, 0x2c2c2c), [0.35, 0.3, 1]));   // spare wheel on the bed
        const xs = halfAt(B, 0.55, 1.1); if (xs > 0) {   // snorkel
          b.push(withRM(P_('cyl', 0.06, 1.0, 0.06, xs + 0.05, 1.55, 0.6, 0x222222), TRIM_RM()));
          b.push(withRM(P_('cyl', 0.065, 0.2, 0.065, xs + 0.05, 2.05, 0.66, 0x222222, HPI), TRIM_RM())); }
        b.push(withRM(RB(1.4, 0.06, 1.2, 0.02, 0, 0.4, 1.4, 0x888888), [0.5, 0.8, 0]));            // skid plate
        b.push(exhaust(B, 0.55, 0.07)); mudflaps(b, this, acc);
      } }; },
    hoodExtra(B) { const p = []; for (const sx of [-1, 1]) p.push(withRM(RB(0.34, 0.035, 0.24, 0.015, sx * 0.38, B.yt(1.4) + 0.02, 1.4, UNDER), UNDER_RM())); return p; },
    spoiler(B, C, col, acc) { const y = C.yt(-0.2) + 0.08, p = [];   // roof rack
      for (const sx of [-1, 1]) p.push(withRM(P_('box', 0.05, 0.06, 0.95, sx * 0.62, y, -0.15, 0x222222), TRIM_RM()));
      for (const z of [-0.5, -0.15, 0.2]) p.push(withRM(P_('box', 1.28, 0.04, 0.05, 0, y + 0.02, z, 0x222222), TRIM_RM()));
      return p; } },

  { id: 'volta', name: 'VOLTA E', cls: 'ELECTRIC HYPERCAR', bars: [5, 5, 5, 1], electric: true, st: { spd: 1.1, acc: 1.2, hdl: 1.15, arm: 0.55, mass: 0.95, off: 0.6, electric: true },
    rim: 0x2a2e33, spokes: 10, hoodAcc: false, pod: { z: 1.8, n: 0 }, roundelZ: -0.1,
    spec(col, acc) { return { L: 4.5, hw: 0.9, flare: 0.05, n: 4.6, taper: 0.14, E: 0.32, sill: 0.22, noseLift: 0.05, tailLift: 0.08, r: 0.35, w: 0.28, x: 0.81, zs: [1.42, -1.38], sepWheels: true, exhaust: false,
      paint: col, acc, metal: true, darkSill: true, band: [0.34, 0.4], hoodZ: [0.85, 2.0],
      top: [[2.25, 0.5], [2.1, 0.62], [1.6, 0.72], [0.85, 0.82], [-1.6, 0.9], [-2.1, 0.92], [-2.25, 0.84]],
      cab: { z1: 0.9, z0: -2.1, W: 0.74, taper: 0.36, roof: [[0.1, 1.22], [-0.5, 1.26], [-1.3, 1.16], [-1.85, 0.98]], zA: 0.15, zC: -1.3, cW: 0.9, pillars: [-0.6], pillarCol: TRIMC },
      cabExtra: o => (o.s > 0.6 && Math.abs(o.x) < 0.5 && o.z < 0.15 && o.z > -1.3) ? M_GLASS : null,     // panoramic glass roof
      seams: [0.8, -0.65], head: { x: 0.38, y: 0.6, w: 0.74, h: 0.05 }, tail: { x: 0.38, y: 0.84, w: 0.74, h: 0.06 }, grille: { y: 0.34, w: 1.3, h: 0.06 },   // full-width light bars, closed grille
      more(B, b) {
        const zf = endZ(B, 0, 0.3, true); b.push(withRM(RB(1.7, 0.035, 0.24, 0.015, 0, 0.235, zf - 0.03, TRIMC), TRIM_RM()));   // splitter
        const zr = endZ(B, 0, 0.3, false); b.push(withRM(RB(1.4, 0.09, 0.2, 0.02, 0, 0.28, zr + 0.07, UNDER), UNDER_RM()));      // diffuser, no exhaust
        for (const sx of [-1, 1]) { const xh = halfAt(B, 0.35, 0.62); if (xh > 0) b.push(withRM(RB(0.02, 0.05, 0.3, 0.01, sx * (xh + 0.004), 0.62, 0.35, 0xd8dce0), M_CHROME.slice(1))); }   // flush door handles
      } }; },
    spoiler(B, C, col, acc) { const y = B.yt(-2.1) + 0.03; return [RB(1.5, 0.035, 0.22, 0.015, 0, y, -2.1, acc, -0.2)]; } },   // ducktail lip
];
const modelIdx = id => Math.max(0, CAR_MODELS.findIndex(m => m.id === id));
function rallyGeo(mi, col, acc) {
  return cached('rally' + mi + '_' + col + '_' + acc, () => {
    const M = CAR_MODELS[mi], S = M.spec(col, acc);
    const hi = buildCar(S, false), lo = buildCar(M.spec(col, acc), true), B = hi.B, C = cabinSpec(S, B);
    // detachable parts: bonnet, front bumper, wing
    const hz = S.hoodZ, hcol = M.hoodAcc ? acc : col;
    let hood = loft(B, stations(hz[0], hz[1], 0, [], 0.08, [], 0), 18, o => o.ny > -0.4 ? paintRM(hcol, false) : M_UNDER, { t0: 0.2 * Math.PI, t1: 0.8 * Math.PI, lift: 0.014, both: true });
    if (M.hoodExtra) hood = concat([hood, merge(M.hoodExtra(B, col, acc), true)]);
    const yb = S.sill + 0.06, zb = endZ(B, 0, yb, true);
    const bp = M.bullBar
      ? [withRM(P_('cyl', 0.05, 1.7, 0.05, 0, yb + 0.05, zb + 0.12, 0x2a2a2a, 0, 0, HPI), TRIM_RM()), withRM(P_('cyl', 0.05, 1.3, 0.05, 0, yb + 0.42, zb + 0.12, 0x2a2a2a, 0, 0, HPI), TRIM_RM()),
         ...[-0.6, -0.2, 0.2, 0.6].map(x => withRM(P_('cyl', 0.045, 0.42, 0.045, x, yb + 0.23, zb + 0.12, 0x2a2a2a), TRIM_RM()))]
      : [withRM(RB(1.76, 0.16, 0.26, 0.05, 0, yb, zb - 0.06, TRIMC), TRIM_RM())];
    bp.push(withRM(P_('box', 0.06, 0.06, 0.1, 0.45, yb + 0.02, zb + (M.bullBar ? 0.05 : 0.06), 0xd8261c), [0.5, 0, 0.5]));   // tow hook
    const bumper = merge(bp, true), spoiler = merge(M.spoiler(B, C, col, acc), true);
    const T_ = S.tail, brk = [];
    for (const sx of [-1, 1]) { const zt = endZ(B, sx * T_.x, T_.y, false); brk.push(RB(T_.w + 0.03, T_.h + 0.02, 0.03, 0.02, sx * T_.x, T_.y, zt - 0.008, 0xffffff)); }
    // light pod on the bonnet (or the roof bar on the truck)
    const pb = [], pl = [], P = M.pod, yp = P.roof ? C.yt(P.z) + 0.14 : B.yt(P.z) + 0.13, sp = P.roof ? 0.36 : 0.4;
    if (P.n) pb.push(withRM(RB(sp * P.n + 0.1, 0.06, 0.08, 0.02, 0, yp - 0.1, P.z, TRIMC), TRIM_RM()));
    for (let k = 0; k < P.n; k++) { const x = (k - (P.n - 1) / 2) * sp; pb.push(withRM(P_('cyl', 0.13, 0.14, 0.13, x, yp, P.z, TRIMC, HPI), TRIM_RM())); pl.push(P_('cyl', 0.11, 0.04, 0.11, x, yp, P.z + 0.06, 0xfff3c8, HPI)); }
    const yr = S.sill + 0.43; let xr = 0; for (let y = yr - 0.26; y <= yr + 0.26; y += 0.02) xr = Math.max(xr, halfAt(B, M.roundelZ, y));
    return { hi: hi.geo, lo: lo.geo, lights: hi.lights, brake: merge(brk), podBody: merge(pb), podLights: merge(pl), hood, bumper, spoiler,
      wheel: wheelGeo(S.r, S.w, false, M.rim, M.spokes), roundel: { x: xr + 0.006, y: yr, z: M.roundelZ }, dims: { L: S.L, hw: S.hw + (S.flare || 0) * 0.5, x: S.x, r: S.r, zs: S.zs } };
  });
}
const SKIN = [0xf0c8a0, 0xd8a47a, 0xa86a42, 0x6b4428, 0xf5d5b8];
const SHIRT = [0xd23b3b, 0x2f6fd0, 0x2a9a5a, 0xf0c030, 0xffffff, 0x8a3fd0, 0xff7a2a, 0x333333, 0x3ac0c0];
const PANTS = [0x2a3550, 0x333333, 0x5a4a3a, 0x6a6a6a, 0x1f2f6a];
function pedGeo(sh, sk) {
  return cached('ped' + sh + '_' + sk, () => merge([
    P_('box', 0.5, 0.62, 0.28, 0, 1.18, 0, sh),
    P_('box', 0.14, 0.58, 0.14, -0.33, 1.15, 0, sh), P_('box', 0.14, 0.58, 0.14, 0.33, 1.15, 0, sh),
    P_('box', 0.12, 0.12, 0.12, -0.33, 0.82, 0, sk), P_('box', 0.12, 0.12, 0.12, 0.33, 0.82, 0, sk),
    P_('box', 0.27, 0.3, 0.27, 0, 1.66, 0, sk),
    P_('box', 0.29, 0.1, 0.29, 0, 1.84, -0.01, 0x2a1a10),
  ]));
}
function legGeo(c) { return cached('leg' + c, () => merge([P_('box', 0.19, 0.8, 0.21, 0, -0.4, 0, c), P_('box', 0.2, 0.1, 0.3, 0, -0.8, 0.04, 0x222222)])); }

const PROPS = {
  cone: () => merge([P_('cone', 0.27, 0.72, 0.27, 0, 0.42, 0, 0xff6a10), P_('cyl', 0.17, 0.1, 0.17, 0, 0.5, 0, 0xffffff), P_('box', 0.62, 0.06, 0.62, 0, 0.03, 0, 0x222222)]),
  barrelR: () => merge([P_('cyl', 0.36, 0.92, 0.36, 0, 0.46, 0, 0xd62b1e), P_('cyl', 0.37, 0.07, 0.37, 0, 0.3, 0, 0x8a1a10), P_('cyl', 0.37, 0.07, 0.37, 0, 0.66, 0, 0x8a1a10), P_('box', 0.3, 0.22, 0.02, 0, 0.5, 0.36, 0xffd21a)]),
  barrelB: () => merge([P_('cyl', 0.36, 0.92, 0.36, 0, 0.46, 0, 0x2a5fb8), P_('cyl', 0.37, 0.07, 0.37, 0, 0.3, 0, 0x1a3a7a), P_('cyl', 0.37, 0.07, 0.37, 0, 0.66, 0, 0x1a3a7a)]),
  hay: () => merge([P_('cyl', 0.62, 1.3, 0.62, 0, 0.62, 0, 0xd9b44a, 0, 0, Math.PI / 2), P_('cyl', 0.5, 1.32, 0.5, 0, 0.62, 0, 0xc49a36, 0, 0, Math.PI / 2)]),
  rock: () => merge([P_('dode', 1.0, 0.75, 1.05, 0, 0.45, 0, 0x7b7670, 0.3, 0.5, 0), P_('dode', 0.6, 0.5, 0.6, 0.6, 0.3, 0.3, 0x6a655f, 0.7, 0, 0.2)]),
  barrier: () => { const p = []; for (let i = 0; i < 6; i++) p.push(P_('box', 0.62, 0.95, 0.55, -1.55 + i * 0.62, 0.48, 0, i % 2 ? 0xffffff : 0xd8261c)); p.push(P_('box', 3.75, 0.12, 0.62, 0, 0.06, 0, 0x555555)); p.push(P_('cyl', 0.12, 0.08, 0.12, -1.6, 1.0, 0, 0xffb000, Math.PI / 2)); p.push(P_('cyl', 0.12, 0.08, 0.12, 1.6, 1.0, 0, 0xffb000, Math.PI / 2)); return merge(p); },
  // ramp: red deck with white side rails and dark posts; the glowing parts are in rampGlow
  ramp: () => { const a = -Math.atan2(1.15, 6.5), p = [P_('wedge', 3.2, 1.15, 6.5, 0, 0, -3.25, 0xc81a12)];
    for (const x of [-1.55, 1.55]) p.push(P_('box', 0.14, 0.08, 6.6, x, 0.6, 0, 0xf4f4f4, a));
    return merge(p); },
  rampGlow: () => {
    const a = -Math.atan2(1.15, 6.5), p = [], Y = 0xffc400, chev = (z, y, pitch, w = 1.25) => { for (const sd of [-1, 1]) p.push(P_('box', 0.3, 0.035, w, sd * 0.42, y, z - 0.38, Y, pitch, sd * 0.72)); };
    for (const z of [-2.1, -0.2, 1.7]) chev(z, (z + 3.25) / 6.5 * 1.15 + 0.05, a);                       // chevrons up the slope
    for (const z of [-6.5, -10.5, -14.5, -18.5]) chev(z, 0.045, 0, 1.35);                                 // arrows painted on the road
    return merge(p); },
  oil: () => merge([P_('cyl', 2.2, 0.02, 1.7, 0, 0.03, 0, 0x0b0b10), P_('cyl', 1.2, 0.022, 0.9, 0.5, 0.034, 0.3, 0x1a1830)]),
  wrench: () => merge([P_('torus', 0.75, 0.75, 0.9, 0, 0, 0, 0x2bff6a), P_('box', 0.9, 0.28, 0.12, 0, 0, 0, 0xffffff), P_('box', 0.28, 0.9, 0.12, 0, 0, 0, 0xffffff)]),
  turbo: () => merge([P_('torus', 0.8, 0.8, 0.9, 0, 0, 0, 0x3db7ff), P_('cyl', 0.26, 0.8, 0.26, 0, -0.05, 0, 0x1a5cff), P_('cyl', 0.27, 0.12, 0.27, 0, 0.05, 0, 0xffffff), P_('cone', 0.26, 0.2, 0.26, 0, 0.45, 0, 0x1a5cff), P_('cyl', 0.08, 0.16, 0.08, 0, 0.6, 0, 0xff2a1a)]),
  triangle: () => merge([P_('cone', 0.4, 0.05, 0.4, 0, 0.42, 0, 0xff2a1a, Math.PI / 2, 0, 0), P_('box', 0.05, 0.42, 0.05, 0, 0.2, 0, 0x333333)]),
};
const propGeo = t => cached('prop_' + t, PROPS[t]);

/* ============================== track ============================== */
const START_S = 104, SEG = 2, CH = 50, RW = 7;
const LANES = [-5.25, -1.75, 1.75, 5.25];
const T = { n: 0, len: 0, X: null, Z: null, Y: null, H: null, K: null, town: null, inter: null, rail: null, inters: [], feats: [], buildings: [], trees: [], lamps: [], group: null, stage: null };
const tr0 = { x: 0, y: 0, z: 0, h: 0, k: 0, slope: 0, town: 0 }, trW = { ...tr0 };
function trackAt(s, o = tr0) {
  const f = clamp(s / SEG, 0, T.n - 1.001), i = f | 0, t = f - i;
  o.x = T.X[i] + (T.X[i + 1] - T.X[i]) * t; o.z = T.Z[i] + (T.Z[i + 1] - T.Z[i]) * t;
  o.y = T.Y[i] + (T.Y[i + 1] - T.Y[i]) * t; o.h = T.H[i] + (T.H[i + 1] - T.H[i]) * t;
  o.k = T.K[i]; o.slope = (T.Y[i + 1] - T.Y[i]) / SEG; o.town = T.town[i]; return o;
}
function worldPos(s, d, y, out) {
  const t = trackAt(s, trW), c = Math.cos(t.h), sn = Math.sin(t.h);
  return out.set(t.x - c * d, t.y + y, t.z + sn * d);
}
const isTownAt = s => T.town[clamp(Math.floor(s / SEG), 0, T.n - 1)] === 1;
const wallAt = s => isTownAt(s) ? 11.2 : 18.5;   // outer limit (props); cars use wallCheck, which also knows the guard rails

function buildTrack(st) {
  const rng = mulberry32(st.seed);
  const total = st.len + 700, n = Math.ceil(total / SEG) + 2;
  T.n = n; T.len = st.len; T.stage = st;
  // zones
  const zones = []; let s = 0, town = false;
  while (s < total) {
    let L = town ? 360 + rng() * 260 : clamp((380 + rng() * 320) * (1 - st.tb) / st.tb, 240, 1300);
    if (!zones.length) L = Math.max(L, 420);
    zones.push({ a: s, b: s + L, town }); s += L; town = !town;
  }
  const townA = new Uint8Array(n);
  for (const z of zones) if (z.town) for (let i = Math.floor(z.a / SEG); i < Math.min(n, Math.ceil(z.b / SEG)); i++) townA[i] = 1;
  // intersections
  const inters = [];
  for (const z of zones) if (z.town) {
    let p = z.a + 90;
    while (p < z.b - 80) { if (p > 240 && Math.abs(p - st.len) > 60) inters.push({ s: p, off: rng() * 20, G: 8 + rng() * 3, Yl: 2, Rd: 7 + rng() * 2, spawnT: [0.5, 1.4], cyc: -1, light: 'G', objs: [] }); p += 150 + rng() * 80; }
  }
  const interA = new Int16Array(n).fill(-1);
  inters.forEach((I, idx) => { for (let i = 0; i < n; i++) if (i * SEG < I.s + 7 && (i + 1) * SEG > I.s - 7) interA[i] = idx; });
  // curvature, heading, position
  const X = new Float32Array(n), Z = new Float32Array(n), Y = new Float32Array(n), H = new Float32Array(n), K = new Float32Array(n);
  let h = 0, k = 0, target = 0, next = 0, x = 0, zz = 0;
  for (let i = 0; i < n; i++) {
    // town streets bend gently, open road bends hard; straight only at the start, the finish and through crossroads
    const si = i * SEG, townSoon = townA[Math.min(n - 1, i + 25)] || townA[i], km = townSoon ? st.kmax * 0.55 : st.kmax;
    const nearX = inters.some(I => si > I.s - 75 && si < I.s + 25);
    if (si < 190 || nearX || Math.abs(si - st.len) < 70) target = 0;
    else if (si >= next || Math.abs(target) > km) {
      target = rng() < 0.1 ? 0 : (rng() * 2 - 1) * km;
      if (rng() < 0.45) target = Math.sign(target || 1) * km * (0.75 + rng() * 0.25);
      next = si + 35 + rng() * 85;
    }
    if (h > 1.0 && target > 0) target = -target;
    if (h < -1.0 && target < 0) target = -target;
    k += clamp(target - k, -0.00022, 0.00022);
    K[i] = k; H[i] = h; X[i] = x; Z[i] = zz;
    h += k * SEG; x += Math.sin(h) * SEG; zz += Math.cos(h) * SEG;
  }
  // elevation: hills only in the countryside, blended
  const cw = new Float32Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + (townA[i] ? 0.55 : 1);   // towns sit on gentler slopes
  const rad = 45;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - rad), b = Math.min(n, i + rad + 1); cw[i] = (pre[b] - pre[a]) / (b - a); }
  const p1 = rng() * 6, p2 = rng() * 6, p3 = rng() * 6;
  for (let i = 0; i < n; i++) {
    const si = i * SEG;
    const hill = st.hills * (Math.sin(si * 0.0042 + p1) * 0.45 + Math.sin(si * 0.0105 + p2) * 0.35 + Math.sin(si * 0.024 + p3) * 0.2);
    Y[i] = hill * cw[i] * smooth(160, 340, si);
  }
  // crossroads sit on level ground: blend the road to the crossing's own height around it
  const Y0 = Float32Array.from(Y);
  for (const I of inters) {
    const c = Math.round(I.s / SEG), yI = Y0[clamp(c, 0, n - 1)];
    for (let i = Math.max(0, c - 30); i < Math.min(n, c + 31); i++) { const w = smooth(14, 60, Math.abs(i * SEG - I.s)); Y[i] = yI + (Y[i] - yI) * w; }
  }
  Object.assign(T, { X, Z, Y, H, K, town: townA, inter: interA, inters, zones });
  T.rail = new Uint8Array(n); for (let i = 0; i < n; i++) T.rail[i] = !townA[i] && Math.abs(K[i]) > 0.0032 ? 1 : 0;

  // buildings
  const PAL = [0xd9a55b, 0xc8643c, 0xe8d8b0, 0xe6c86e, 0xd99a8a, 0xb7ae9e, 0xece4d4, 0xc9b28a, 0xe0b48c];
  T.buildings = [];
  for (const z of zones) if (z.town) for (const side of [-1, 1]) {
    let p = z.a + 4;
    while (p < z.b - 6) {
      const w = 9 + rng() * 12, c = p + w / 2;
      if (!inters.some(I => Math.abs(I.s - c) < w / 2 + 9)) T.buildings.push({ s: c, side, w, dep: 8 + rng() * 9, h: 7 + rng() * 14 * (st.tb > 0.6 ? 1.4 : 1), col: PAL[(rng() * PAL.length) | 0] });
      p += w + rng() * 2.5;
    }
  }
  // trees & lamps
  T.trees = []; T.lamps = [];
  for (let si = 0; si < total; si += 7) {
    if (isTownAt(si)) { if (si % 28 < 7 && !inters.some(I => Math.abs(I.s - si - 3) < 15)) for (const side of [-1, 1]) T.lamps.push({ s: si + 3, d: side * 10.9 }); continue; }
    for (const side of [-1, 1]) {
      if (rng() < 0.75) T.trees.push({ s: si + rng() * 7, d: side * (20 + Math.pow(rng(), 1.6) * 56), sc: 0.7 + rng() * 0.8, round: rng() < 0.4, c: rng() });
    }
  }
  // static features: obstacles, pickups, ramps, jaywalkers, breakdowns
  const F = []; let fs = 320;
  const nearInter = q => inters.some(I => Math.abs(I.s - q) < 28);
  while (fs < st.len - 120) {
    const town = isTownAt(fs);
    if (!(town && nearInter(fs))) {
      const r = rng(), lane = LANES[(rng() * 4) | 0];
      if (town) {
        if (r < 0.2) F.push({ t: 'jay', s: fs, d: (rng() < 0.5 ? -1 : 1) * 9.3 });
        else if (r < 0.34) { for (let i = 0; i < 3 + (rng() * 3 | 0); i++) F.push({ t: rng() < 0.45 ? 'barrelR' : 'barrelB', s: fs + rng() * 4, d: lane + (rng() - 0.5) * 2.2 }); }
        else if (r < 0.5) addWorks(F, fs, lane, rng);
        else if (r < 0.62) addBreakdown(F, fs, rng);
        else if (r < 0.74) F.push({ t: 'oil', s: fs, d: lane });
        else if (r < 0.86) F.push({ t: 'jay', s: fs, d: (rng() < 0.5 ? -1 : 1) * 9.3 });
        else F.push({ t: 'jay', s: fs, d: (rng() < 0.5 ? -1 : 1) * 9.3 });
      } else {
        if (r < 0.28) { for (let i = 0; i < 1 + (rng() * (st.sky === 'fog' ? 3 : 2) | 0); i++) F.push({ t: 'rock', s: fs + rng() * 8, d: lane + (rng() - 0.5) * 3 }); }
        else if (r < 0.4) { for (let i = 0; i < 2 + (rng() * 3 | 0); i++) F.push({ t: 'hay', s: fs + rng() * 5, d: lane + (rng() - 0.5) * 2.5 }); }
        else if (r < 0.52) addWorks(F, fs, lane, rng);
        else if (r < 0.62) { for (let i = 0; i < 3 + (rng() * 3 | 0); i++) F.push({ t: rng() < 0.5 ? 'barrelR' : 'barrelB', s: fs + rng() * 4, d: lane + (rng() - 0.5) * 2.2 }); }
        else if (r < 0.72) F.push({ t: 'oil', s: fs, d: lane });
        else if (r < 0.8) addBreakdown(F, fs, rng);
        else { for (let i = 0; i < 2; i++) F.push({ t: 'hay', s: fs + rng() * 5, d: lane + (rng() - 0.5) * 2.5 }); }
      }
    }
    fs += (town ? 75 : 95) / st.props * (0.65 + rng() * 0.8);
  }
  // jump ramps on their own schedule: one side of the road, or both sides at once
  for (let q = 260; q < st.len - 160; q += (230 + rng() * 200) / st.ramps) {
    if (nearInter(q) || (isTownAt(q) && rng() < 0.3)) continue;
    // one lane wide, so traffic can steer around; sometimes one in each direction's inner lane
    const lanes = rng() < 0.3 ? [1.75, -1.75] : [LANES[(rng() * 4) | 0]];
    for (let k = F.length - 1; k >= 0; k--) if (Math.abs(F[k].s - q) < 18 && F[k].t !== 'jay' && lanes.some(d => Math.abs(F[k].d - d) < 2.6)) F.splice(k, 1);
    for (const d of lanes) F.push({ t: 'ramp', s: q, d });
  }
  // power-ups come in rows across the road, one identical pickup per lane:
  // every car can grab one, nobody can take them all
  for (let q = 300; q < st.len - 100; q += 140 + rng() * 90) {
    if (nearInter(q)) continue;
    for (let k = F.length - 1; k >= 0; k--) if (Math.abs(F[k].s - q) < 12 && F[k].t !== 'jay' && F[k].t !== 'ramp') F.splice(k, 1);
    if (F.some(f => f.t === 'ramp' && Math.abs(f.s - q) < 25)) continue;
    const t = rng() < 0.75 ? 'turbo' : 'wrench';
    for (const d of LANES) F.push({ t, s: q, d });
  }
  F.sort((a, b) => a.s - b.s); T.feats = F; T.featIdx = 0;
}
function addWorks(F, s, lane, rng) {
  F.push({ t: 'barrier', s: s + 14, d: lane });
  for (let i = 0; i < 5; i++) F.push({ t: 'cone', s: s + i * 3, d: lane + Math.sign(lane) * (1.6 - i * 0.4) * (rng() < 2 ? 1 : 1) });
}
function addBreakdown(F, s, rng) {
  const d = rng() < 0.65 ? 5.25 : -5.25;
  F.push({ t: 'parked', s, d, sub: rng() < 0.3 ? 'bus' : 'van' });
  F.push({ t: 'triangle', s: s - Math.sign(d) * 12, d });
}

/* ---------- track meshes ---------- */
class GB {
  constructor(uv) { this.p = []; this.c = []; this.u = uv ? [] : null; this.planar = uv === 'planar'; }
  tri(a, b, c, col, ua, ub, uc) {
    this.p.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
    if (this.planar) this.u.push(a[0] * 0.21, a[2] * 0.21, b[0] * 0.21, b[2] * 0.21, c[0] * 0.21, c[2] * 0.21);
    else if (this.u) this.u.push(...ua, ...ub, ...uc);
  }
  quad(a, b, c, d, col, ua, ub, uc, ud) { this.tri(a, b, c, col, ua, ub, uc); this.tri(a, c, d, col, ua, uc, ud); }
  mesh(mat) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}
const SP = (i, d, y) => { const h = T.H[i]; return [T.X[i] - Math.cos(h) * d, T.Y[i] + y, T.Z[i] + Math.sin(h) * d]; };
const SW = (s, d, y) => { const v = worldPos(s, d, y, _v1); return [v.x, v.y, v.z]; };
const col = hex => new THREE.Color(hex);
const C = {
  kerbR: col(0xe0201a), kerbW: col(0xf4f4f4),
  asph: col(0x4a4c50), asph2: col(0x46484c), white: col(0xeeeeee), yellow: col(0xf0c020), curb: col(0xbdb6aa), pave: col(0xa69e92),
  lot: col(0x8f897e), gravel: col(0x9a8a6a), grass1: col(0x5f8a3a), grass2: col(0x5a8236), rail: col(0xc4c8cc), post: col(0x6a6a6a),
  cross: col(0x46484c), roof: col(0x8a3b26), finW: col(0xffffff), finB: col(0x111111),
};
function rib(g, i, d0, d1, y, c, y1 = y) { g.quad(SP(i, d0, y), SP(i, d1, y1), SP(i + 1, d1, y1), SP(i + 1, d0, y), c); }
function wall(g, i, d, y0, y1, c) { g.quad(SP(i, d, y0), SP(i + 1, d, y0), SP(i + 1, d, y1), SP(i, d, y1), c); }
function rect(g, s0, s1, d0, d1, y, c) { g.quad(SW(s0, d0, y), SW(s0, d1, y), SW(s1, d1, y), SW(s1, d0, y), c); }

function buildTrackMeshes(st) {
  if (T.group) { scene.remove(T.group); T.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }
  const grp = T.group = new THREE.Group(); scene.add(grp);
  const n = T.n;
  for (let i0 = 0; i0 < n - 1; i0 += CH) {
    const i1 = Math.min(n - 1, i0 + CH), g = new GB('planar');
    for (let i = i0; i < i1; i++) {
      const si = i * SEG, town = T.town[i], inter = T.inter[i];
      rib(g, i, -RW, RW, 0, (si / 6 | 0) % 2 ? C.asph : C.asph2);
      if (inter < 0) {
        rib(g, i, -0.22, -0.08, 0.015, C.white); rib(g, i, 0.08, 0.22, 0.015, C.white);
        if (i % 6 < 3) { rib(g, i, -3.57, -3.43, 0.015, C.white); rib(g, i, 3.43, 3.57, 0.015, C.white); }
        const kc = i % 2 ? C.kerbR : C.kerbW;                         // red/white racing kerbs, 2 m tiles
        rib(g, i, -7, -6.25, 0.03, kc); rib(g, i, 6.25, 7, 0.03, kc);
      }
      for (const sd of [-1, 1]) {
        if (town) {
          if (inter < 0) {
            wall(g, i, sd * RW, 0, 0.15, C.curb);
            rib(g, i, sd * RW, sd * 11.5, 0.15, C.pave);
            rib(g, i, sd * 11.5, sd * 80, 0.1, C.lot);
          }
        } else {
          rib(g, i, sd * RW, sd * 10, -0.02, C.gravel);
          rib(g, i, sd * 10, sd * 80, -0.06, (si / 14 | 0) % 2 ? C.grass1 : C.grass2, -0.6);
          if (T.rail[i]) { wall(g, i, sd * 10.5, 0.45, 0.78, C.rail); if (i % 2 === 0) wall(g, i, sd * 10.55, 0, 0.5, C.post); }
        }
      }
    }
    for (const I of T.inters) {
      if (I.s < i0 * SEG || I.s >= i1 * SEG) continue;
      for (const sd of [-1, 1]) {
        rect(g, I.s - 6.5, I.s + 6.5, sd * RW, sd * 80, 0.005, C.cross);
        for (let q = 9; q < 80; q += 6) rect(g, I.s - 0.12, I.s + 0.12, sd * q, sd * (q + 3), 0.02, C.white);
        rect(g, I.s - 7, I.s - 6.5, sd * RW, sd * 80, 0.12, C.curb); rect(g, I.s + 6.5, I.s + 7, sd * RW, sd * 80, 0.12, C.curb);
      }
      for (let d = -6.4; d < 6.4; d += 1.1) { rect(g, I.s - 10.6, I.s - 7.6, d, d + 0.55, 0.02, C.white); rect(g, I.s + 7.6, I.s + 10.6, d, d + 0.55, 0.02, C.white); }
      rect(g, I.s - 12.4, I.s - 11.9, 0, RW, 0.02, C.white); rect(g, I.s + 11.9, I.s + 12.4, -RW, 0, 0.02, C.white);
    }
    for (const L of [START_S, T.len]) if (L >= i0 * SEG && L < i1 * SEG) {
      for (let a = 0; a < 2; a++) for (let d = -RW; d < RW - 0.01; d += 1) rect(g, L + a, L + a + 1, d, d + 1, 0.02, ((d + RW + a) | 0) % 2 ? C.finW : C.finB);
    }
    const m = g.mesh(matTrack); if (m) { m.receiveShadow = true; grp.add(m); }
  }
  // ground plane far below for the horizon
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: st.tb > 0.6 ? 0x8f897e : 0x5a7e36 }));
  ground.position.set(T.X[T.n >> 1], Math.min(...T.Y) - 2.5, T.Z[T.n >> 1]); grp.add(ground);
  // buildings, chunked
  const bchunks = {};
  for (const b of T.buildings) { const k = (b.s / (SEG * CH)) | 0; (bchunks[k] ||= []).push(b); }
  for (const k in bchunks) {
    const g = new GB(true);
    for (const b of bchunks[k]) {
      const s0 = b.s - b.w / 2, s1 = b.s + b.w / 2, d0 = b.side * 11.8, d1 = b.side * (11.8 + b.dep), H = b.h, c = col(b.col);
      const fx = Math.max(1, Math.round(b.w / 3.2)) / 2, fy = Math.max(1, Math.round(H / 3.3)) / 2, fd = Math.max(1, Math.round(b.dep / 3.2)) / 2;
      const A = SW(s0, d0, 0), B = SW(s1, d0, 0), Cc = SW(s1, d1, 0), D = SW(s0, d1, 0);
      const up = p => [p[0], p[1] + H, p[2]], base = p => [p[0], Math.min(p[1], -0.5), p[2]];
      g.quad(base(A), base(B), up(B), up(A), c, [0, 0], [fx, 0], [fx, fy], [0, fy]);
      g.quad(base(B), base(Cc), up(Cc), up(B), c, [0, 0], [fd, 0], [fd, fy], [0, fy]);
      g.quad(base(D), base(A), up(A), up(D), c, [0, 0], [fd, 0], [fd, fy], [0, fy]);
      g.quad(base(Cc), base(D), up(D), up(Cc), c, [0, 0], [fx, 0], [fx, fy], [0, fy]);
      const r = [0.02, 0.02]; g.quad(up(A), up(B), up(Cc), up(D), C.roof, r, r, r, r);
      const ledge = col(0xd9d2c4);
      g.quad(SW(s0, d0 - b.side * 0.25, H), SW(s1, d0 - b.side * 0.25, H), SW(s1, d0, H), SW(s0, d0, H), ledge, r, r, r, r);
    }
    const m = g.mesh(matBuild); if (m) { m.castShadow = m.receiveShadow = true; grp.add(m); }
  }
  // instanced trees, in 300 m groups so far-away ones are culled
  const dummy = new THREE.Object3D();
  const mkInst = (geo, mat, list, colFn, place, cast = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => { place(t, dummy); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); if (colFn) im.setColorAt(i, colFn(t)); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = cast; im.userData.shared = true; grp.add(im);
    return im;
  };
  const trunkGeo = cached('g_trunk', () => new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0));
  const W = 0xffffff;
  const pineGeo = cached('g_pine', () => merge([P_('cone', 1.95, 2.7, 1.95, 0, 2.5, 0, 0xd8d8d8), P_('cone', 1.5, 2.4, 1.5, 0, 4.0, 0, 0xececec), P_('cone', 1.0, 2.2, 1.0, 0, 5.4, 0, W)]));
  const roundGeo = cached('g_round', () => merge([P_('ico', 2.0, 1.7, 2.0, 0, 3.9, 0, 0xe4e4e4, 0.3, 0.2, 0), P_('ico', 1.4, 1.2, 1.4, 1.15, 3.3, 0.3, 0xd0d0d0, 0, 1, 0.4), P_('ico', 1.35, 1.15, 1.35, -0.9, 4.7, -0.4, W, 0.5, 2, 0), P_('ico', 1.1, 0.95, 1.1, -0.5, 3.1, 1.0, 0xc8c8c8, 1, 0, 0.3)]));
  const placeT = (t, o) => { worldPos(t.s, t.d, -0.25 - (Math.abs(t.d) - 10) / 70 * 0.54, o.position); o.rotation.set(0, t.c * 6, 0); o.scale.setScalar(t.sc); };
  const tch = {};
  for (const t of T.trees) (tch[(t.s / 300) | 0] ||= []).push(t);
  for (const k in tch) {
    const list = tch[k];
    mkInst(trunkGeo, matTree, list, () => _c.set(0x5a3e2a), (t, o) => { placeT(t, o); o.scale.set(t.sc, t.sc * 2.6, t.sc); }, false);
    mkInst(pineGeo, matTree, list.filter(t => !t.round), t => _c.set(0x2f5a2a).offsetHSL(0, 0, (t.c - 0.5) * 0.08), placeT);
    mkInst(roundGeo, matTree, list.filter(t => t.round), t => _c.set(0x4f7d2e).offsetHSL((t.c - 0.5) * 0.04, 0, (t.c - 0.5) * 0.1), placeT);
  }
  // roadside marker posts in the countryside
  // (kept off the shoulder: they stand at the grass edge, where you can still clip them)
  const posts = [];
  for (let s = 20; s < T.n * SEG - 20; s += 24) if (!isTownAt(s) && !T.rail[(s / SEG) | 0]) for (const sd of [-1, 1]) posts.push({ s, d: sd * 9.85 });
  T.postIM = mkInst(cached('g_post', () => merge([P_('box', 0.11, 0.95, 0.11, 0, 0.47, 0, 0xf2f2f2), P_('box', 0.115, 0.16, 0.115, 0, 0.72, 0, 0x151515), P_('box', 0.12, 0.09, 0.02, 0, 0.72, -0.055, 0xff5a1a)])), matV, posts, null,
    (p, o) => { worldPos(p.s, p.d, -0.03, o.position); o.rotation.set(0, trackAt(p.s).h, 0); o.scale.setScalar(1); }, false);
  // street lamps
  if (T.lamps.length) {
    const lampAt = (l, o, dIn, y) => { worldPos(l.s, l.d - Math.sign(l.d) * dIn, y, o.position); o.rotation.set(0, trackAt(l.s).h, 0); o.scale.setScalar(1); };
    T.lampIM = [];
    T.lampIM.push(mkInst(cached('g_lpole', () => new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6).translate(0, 3.25, 0)), matPole, T.lamps, null, (l, o) => lampAt(l, o, 0, 0.15)));
    T.lampIM.push(mkInst(cached('g_larm', () => new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0, 6.42, 0)), matPole, T.lamps, null, (l, o) => lampAt(l, o, 0.75, 0.15), false));
    T.lampIM.push(mkInst(cached('g_lhead', () => new THREE.BoxGeometry(0.7, 0.1, 0.32).translate(0, 6.34, 0)), matLampHead, T.lamps, null, (l, o) => lampAt(l, o, 1.35, 0.15), false));
    if (SKIES[st.sky].lamps) T.lampIM.push(mkInst(geoPlane, matPool, T.lamps, null, (l, o) => { lampAt(l, o, 2.6, 0.2); o.scale.set(13, 1, 13); }, false));
  }
  // the pole register: everything a car can hit
  T.falls = [];
  T.poles = posts.map((p, i) => ({ s: p.s, d: p.d, r: 0.1, big: false, kind: 'post', i, up: true }));
  T.lamps.forEach((l, i) => T.poles.push({ s: l.s, d: l.d, r: 0.16, big: true, kind: 'lamp', i, up: true }));
  // traffic lights
  for (const I of T.inters) {
    I.objs = [];
    for (const dir of [1, -1]) {
      const gr = new THREE.Group();
      const parts = [P_('cyl', 0.12, 5.6, 0.12, -8.2, 2.8, 0, 0x2a2c2e), P_('box', 5.2, 0.16, 0.16, -5.7, 5.5, 0, 0x2a2c2e), P_('box', 0.5, 1.35, 0.42, -3.4, 4.85, 0, 0x1b1c1e),
        P_('box', 0.75, 1.6, 0.04, -3.4, 4.85, 0.22, 0x111111), P_('box', 0.5, 1.35, 0.42, -8.2, 2.55, -0.15, 0x1b1c1e)];
      gr.add(new THREE.Mesh(cached('tlpole', () => merge(parts)), matV));
      const lampGeo = cached('tllamp', () => merge([P_('cyl', 0.19, 0.06, 0.19, 0, 0, 0, 0xffffff, Math.PI / 2)]));
      const lamps = [['r', 5.3], ['y', 4.85], ['g', 4.4]].map(([c, y]) => {
        const m = new THREE.Mesh(lampGeo, LAMP[c + 'Off']); m.position.set(-3.4, y, -0.23); gr.add(m);
        const m2 = new THREE.Mesh(lampGeo, LAMP[c + 'Off']); m2.position.set(-8.2, y - 2.3, -0.38); gr.add(m2);
        return [m, m2];
      });
      worldPos(I.s - dir * 12.6, 0, 0.15, gr.position); gr.rotation.y = trackAt(I.s).h + (dir < 0 ? Math.PI : 0);
      grp.add(gr); I.objs.push(lamps);
      T.poles.push({ s: I.s - dir * 12.6, d: dir * 8.2, r: 0.18, big: true, kind: 'tl', obj: gr, up: true });
    }
  }
  T.poles.sort((a, b) => a.s - b.s);
  // start & finish gantries
  for (const [L, txt, bg] of [[START_S, 'START', '#d8261c'], [T.len, 'FINISH', '#1f4ea8']]) {
    const gr = new THREE.Group();
    gr.add(new THREE.Mesh(cached('gantry', () => merge([P_('box', 0.5, 6.5, 0.5, -8.3, 3.25, 0, 0xdddddd), P_('box', 0.5, 6.5, 0.5, 8.3, 3.25, 0, 0xdddddd), P_('box', 17, 0.3, 0.6, 0, 6.6, 0, 0x333333)])), matV));
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4), new THREE.MeshBasicMaterial({ map: bannerTex(txt, bg, '#fff'), side: THREE.DoubleSide }));
    ban.position.set(0, 5.3, 0); ban.rotation.y = Math.PI; gr.add(ban);
    worldPos(L + 0.5, 0, 0, gr.position); gr.rotation.y = trackAt(L).h; grp.add(gr);
  }
}

/* ============================== particles ============================== */
const PMAX = 3200;
function makePS(blending, cap) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), pcol = new Float32Array(cap * 4), psize = new Float32Array(cap);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(pcol, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(psize, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: sprTex }, scale: { value: 500 }, boost: { value: blending === THREE.AdditiveBlending ? 1.3 : 1 } },
    vertexShader: 'attribute float psize; attribute vec4 pcol; uniform float scale; varying vec4 vC; void main(){ vC=pcol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=psize*scale/max(0.6,-mv.z); }',
    fragmentShader: 'uniform sampler2D map; uniform float boost; varying vec4 vC; void main(){ float a=texture2D(map,gl_PointCoord).a*vC.a; if(a<0.01) discard; gl_FragColor=vec4(pow(vC.rgb, vec3(2.2))*boost,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, blending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return { pts, geo, mat, pos, pcol, psize, cap, idx: 0, live: 0, vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap),
    s0: new Float32Array(cap), s1: new Float32Array(cap), grav: new Float32Array(cap), c0: new Float32Array(cap * 3), c1: new Float32Array(cap * 3), a0: new Float32Array(cap), drag: new Float32Array(cap) };
}
const FX = makePS(THREE.AdditiveBlending, PMAX), SMK = makePS(THREE.NormalBlending, PMAX);
SMK.pts.renderOrder = 1; FX.pts.renderOrder = 2;
function emit(ps, x, y, z, vx, vy, vz, life, s0, s1, grav, c0, c1, a0 = 1, drag = 0.5) {
  const i = ps.idx; ps.idx = (ps.idx + 1) % ps.cap;
  ps.pos[i * 3] = x; ps.pos[i * 3 + 1] = y; ps.pos[i * 3 + 2] = z;
  ps.vel[i * 3] = vx; ps.vel[i * 3 + 1] = vy; ps.vel[i * 3 + 2] = vz;
  ps.life[i] = ps.max[i] = life; ps.s0[i] = s0; ps.s1[i] = s1; ps.grav[i] = grav; ps.a0[i] = a0; ps.drag[i] = drag;
  ps.c0[i * 3] = c0[0]; ps.c0[i * 3 + 1] = c0[1]; ps.c0[i * 3 + 2] = c0[2];
  ps.c1[i * 3] = c1[0]; ps.c1[i * 3 + 1] = c1[1]; ps.c1[i * 3 + 2] = c1[2];
}
function updatePS(ps, dt) {
  const { pos, vel, life, max, pcol, psize } = ps;
  for (let i = 0; i < ps.cap; i++) {
    if (life[i] <= 0) { if (psize[i] !== 0) { psize[i] = 0; pcol[i * 4 + 3] = 0; } continue; }
    life[i] -= dt; const t = 1 - Math.max(0, life[i]) / max[i], dr = Math.max(0, 1 - ps.drag[i] * dt);
    vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - ps.grav[i] * dt; vel[i * 3 + 2] *= dr;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    psize[i] = life[i] > 0 ? ps.s0[i] + (ps.s1[i] - ps.s0[i]) * t : 0;
    pcol[i * 4] = ps.c0[i * 3] + (ps.c1[i * 3] - ps.c0[i * 3]) * t;
    pcol[i * 4 + 1] = ps.c0[i * 3 + 1] + (ps.c1[i * 3 + 1] - ps.c0[i * 3 + 1]) * t;
    pcol[i * 4 + 2] = ps.c0[i * 3 + 2] + (ps.c1[i * 3 + 2] - ps.c0[i * 3 + 2]) * t;
    pcol[i * 4 + 3] = life[i] > 0 ? ps.a0[i] * (1 - t * t) : 0;
  }
  ps.geo.attributes.position.needsUpdate = true; ps.geo.attributes.pcol.needsUpdate = true; ps.geo.attributes.psize.needsUpdate = true;
}
function clearPS(ps) { ps.life.fill(0); }
const COL = {
  fire0: [1, 0.85, 0.4], fire1: [0.9, 0.18, 0.02], spark0: [1, 0.95, 0.6], spark1: [1, 0.4, 0.05],
  smokeG0: [0.62, 0.62, 0.62], smokeG1: [0.8, 0.8, 0.8], smokeB0: [0.12, 0.11, 0.1], smokeB1: [0.3, 0.29, 0.28],
  tyre0: [0.9, 0.9, 0.9], tyre1: [0.95, 0.95, 0.95], dust0: [0.72, 0.62, 0.45], dust1: [0.8, 0.72, 0.58],
  blue0: [0.55, 0.8, 1], blue1: [0.1, 0.3, 1], flash: [1, 0.95, 0.8],
};
const _w = new THREE.Vector3();
function sparks(s, d, y, n, vs = 0) {
  worldPos(s, d, y, _w);
  for (let i = 0; i < n; i++) emit(FX, _w.x, _w.y, _w.z, R(-6, 6), R(1, 7), R(-6, 6), R(0.25, 0.6), 0.35, 0.1, 18, COL.spark0, COL.spark1, 1, 1.5);
  void vs;
}
function puff(ps, s, d, y, n, c0, c1, sz, life, vy = 1, a = 0.7, spread = 1) {
  worldPos(s, d, y, _w);
  for (let i = 0; i < n; i++) emit(ps, _w.x + R(-spread, spread) * 0.4, _w.y, _w.z + R(-spread, spread) * 0.4, R(-1, 1) * spread, vy * R(0.6, 1.4), R(-1, 1) * spread, life * R(0.7, 1.3), sz * 0.5, sz * R(1.4, 2.2), -0.3, c0, c1, a, 0.8);
}

/* ============================== audio ============================== */
// Engine: 4-cylinder synth driven by a simulated gearbox (rpm + gear), so pitch climbs through each gear
// and drops on every shift, with a throttle cut, exhaust pops and a turbo blow-off.
const AU = { ctx: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = AU.ctx = new AC();
  AU.master = ctx.createGain(); AU.master.gain.value = settings.sound ? 0.75 : 0; AU.master.connect(ctx.destination);
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), dd = buf.getChannelData(0);
  for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
  AU.noise = buf;
  // engine voice: one recorded-style engine cycle (4 cylinder firings, each a short exhaust pulse with its own
  // strength) looped and pitched by rpm, then through a drive stage and fixed exhaust/body resonances.
  // Pulses stay separate at idle (lumpy burble) and blur into a howl at high rpm, like a real 4-cylinder.
  AU.eSrc = ctx.createBufferSource(); AU.eSrc.buffer = engineCycle(ctx); AU.eSrc.loop = true;
  AU.drive = ctx.createGain(); AU.drive.gain.value = 1;
  const shaper = ctx.createWaveShaper(), curveN = 2048, cv = new Float32Array(curveN);
  for (let i = 0; i < curveN; i++) { const x = i / (curveN - 1) * 2 - 1; cv[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  shaper.curve = cv; shaper.oversample = '2x';
  AU.eF = ctx.createBiquadFilter(); AU.eF.type = 'lowpass'; AU.eF.frequency.value = 900; AU.eF.Q.value = 0.9;
  const boom = ctx.createBiquadFilter(); boom.type = 'peaking'; boom.frequency.value = 95; boom.Q.value = 1.1; boom.gain.value = 7;     // exhaust boom
  const pipe = ctx.createBiquadFilter(); pipe.type = 'peaking'; pipe.frequency.value = 480; pipe.Q.value = 1.6; pipe.gain.value = 4;    // pipe resonance
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 35;
  AU.eG = ctx.createGain(); AU.eG.gain.value = 0;
  AU.eSrc.connect(AU.drive); AU.drive.connect(shaper); shaper.connect(AU.eF); AU.eF.connect(boom); boom.connect(pipe); pipe.connect(hp); hp.connect(AU.eG); AU.eG.connect(AU.master);
  AU.eSrc.start();
  // electric motor: clean sine whine + triangle overtone + high inverter whine, rising with road speed
  AU.evG = ctx.createGain(); AU.evG.gain.value = 0; AU.evF = ctx.createBiquadFilter(); AU.evF.type = 'lowpass'; AU.evF.frequency.value = 4000;
  AU.ev = [['sine', 1, 1], ['triangle', 2.0, 0.22], ['sine', 3.02, 0.06], ['sine', 0.5, 0.55]].map(([type, mul, g]) => {
    const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; gg.gain.value = g; o.connect(gg); gg.connect(AU.evF); o.start(); return { o, mul }; });
  AU.evF.connect(AU.evG); AU.evG.connect(AU.master);
  const loopNoise = () => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };
  // intake / exhaust roar
  const bpI = ctx.createBiquadFilter(); bpI.type = 'bandpass'; bpI.Q.value = 1.4; AU.iF = bpI;
  AU.iG = ctx.createGain(); AU.iG.gain.value = 0; loopNoise().connect(bpI); bpI.connect(AU.iG); AU.iG.connect(AU.master);
  // tyre squeal
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 5;
  AU.sG = ctx.createGain(); AU.sG.gain.value = 0; loopNoise().connect(bp); bp.connect(AU.sG); AU.sG.connect(AU.master);
  // gravel rumble
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  AU.rG = ctx.createGain(); AU.rG.gain.value = 0; loopNoise().connect(lp); lp.connect(AU.rG); AU.rG.connect(AU.master);
  // police siren (two-tone)
  AU.sir = ctx.createOscillator(); AU.sir.type = 'square'; const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 1800;
  AU.sirG = ctx.createGain(); AU.sirG.gain.value = 0; AU.sir.connect(sl); sl.connect(AU.sirG); AU.sirG.connect(AU.master); AU.sir.start();
  // turbo whistle
  AU.tw = ctx.createOscillator(); AU.tw.type = 'sine'; AU.tG = ctx.createGain(); AU.tG.gain.value = 0; AU.tw.connect(AU.tG); AU.tG.connect(AU.master); AU.tw.start();
}
const ENGINE_BASE_RPM = 1000;
function engineCycle(ctx) {
  // one full 4-stroke cycle (2 revolutions) at ENGINE_BASE_RPM: firings at uneven strength and slightly uneven timing
  const sr = ctx.sampleRate, n = Math.round(sr * 120 / ENGINE_BASE_RPM), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), rnd = mulberry32(1997);
  const amp = [1, 0.8, 0.93, 0.74], off = [0, 0.2535, 0.4975, 0.7515];
  for (let k = 0; k < 4; k++) {
    const t0 = Math.round(off[k] * n), a = amp[k], ph = rnd() * 6;
    for (let j = 0; j < Math.min(n, sr * 0.06); j++) {
      const t = j / sr, i = (t0 + j) % n;
      const env = Math.exp(-t / 0.0055) - Math.exp(-t / 0.0005);
      d[i] += a * env * (Math.sin(2 * Math.PI * 118 * t + ph) * 0.9 + Math.sin(2 * Math.PI * 263 * t + ph * 2) * 0.4 + (rnd() * 2 - 1) * 0.55)
            + a * Math.exp(-t / 0.016) * Math.sin(2 * Math.PI * 47 * t) * 0.55;          // low thump of each firing
    }
  }
  let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
  let pk = 0; for (let i = 0; i < n; i++) { d[i] -= m; pk = Math.max(pk, Math.abs(d[i])); }
  for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
  return b;
}
function setSound(on) { settings.sound = on; store.set('sound', on); if (AU.master) AU.master.gain.value = on ? 0.75 : 0; }
function audioMute() { if (AU.ctx) for (const g of [AU.eG, AU.iG, AU.sG, AU.rG, AU.tG, AU.sirG]) { g.gain.cancelScheduledValues(0); g.gain.value = 0; } }
function audioUpdate(p, drift, off, active) {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime, rpm = p.rpm, rn = clamp((rpm - 800) / 6800, 0, 1), th = active ? p.throttle : 0;
  const f = rpm / 30;                                   // firing frequency of a 4-cylinder (2 pulses per rev)
  const ev = !!(p.M && p.M.electric);
  AU.evG.gain.setTargetAtTime(ev ? (active ? 0.045 + th * 0.03 + rn * 0.03 : 0.018) : 0, t, 0.05);
  if (ev) { const fe = 55 + p.v * 8.5; for (const x of AU.ev) x.o.frequency.setTargetAtTime(fe * x.mul, t, 0.03); AU.evF.frequency.setTargetAtTime(700 + th * 900, t, 0.05); }   // ~55 Hz hum at rest to ~450 Hz whine flat out
  AU.eSrc.playbackRate.setTargetAtTime(rpm / ENGINE_BASE_RPM, t, 0.012);
  AU.drive.gain.setTargetAtTime(0.7 + th * 1.6 + (p.turbo > 0 ? 0.5 : 0), t, 0.03);                // load: harder, rougher
  AU.eF.frequency.setTargetAtTime(500 + rn * 2400 + th * 1500 + (p.turbo > 0 ? 700 : 0), t, 0.03);  // off throttle = muffled
  AU.eG.gain.setTargetAtTime(ev ? 0 : active ? 0.12 - th * 0.03 + rn * 0.045 : 0.07, t, 0.03);
  // lifting off at high rpm: overrun crackle from the exhaust
  if (!ev && active && th < 0.3 && rpm > 3800 && Math.random() < 0.09) sfxNoise(0.03 + Math.random() * 0.04, 700 + Math.random() * 900, 0.08 + Math.random() * 0.1, 'lowpass');
  AU.iF.frequency.setTargetAtTime(f * 4 + 300, t, 0.03);
  AU.iG.gain.setTargetAtTime(active && !ev ? th * (0.015 + rn * 0.05) : 0, t, 0.04);
  AU.sG.gain.setTargetAtTime(clamp(drift, 0, 1) * 0.11, t, 0.05);
  AU.rG.gain.setTargetAtTime(off ? clamp(p.v / 30, 0, 1) * 0.35 : 0, t, 0.08);
  AU.tw.frequency.setTargetAtTime(1800 + rn * 2600, t, 0.05);
  AU.sir.frequency.setValueAtTime(Math.floor(t * 1.5) % 2 ? 466 : 622, t);
  AU.sirG.gain.setTargetAtTime(active ? clamp(1 - police.nearest / 170, 0, 1) * 0.045 : 0, t, 0.1);
  AU.tG.gain.setTargetAtTime(active && !ev && (p.turbo > 0 || rn > 0.6) ? (p.turbo > 0 ? 0.022 : 0.006) * th : 0, t, 0.08);
}
function sfxNoise(dur, freq, gain, type = 'lowpass', f2) {
  if (!AU.ctx || !settings.sound) return;
  const c = AU.ctx, t = c.currentTime, src = c.createBufferSource(); src.buffer = AU.noise;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(AU.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function sfxTone(f, dur, type = 'square', gain = 0.12, f2, delay = 0) {
  if (!AU.ctx || !settings.sound) return;
  const c = AU.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.05);
}
// Gearbox: 6 speeds, automatic. Speed at the 7400 rpm limit in each gear (m/s).
const GEAR_TOP = [0, 12, 19, 26, 33, 40, 58];
function rpmIn(g, v) { return 900 + v / GEAR_TOP[g] * 6500; }
function updateGearbox(p, dt, inp, air) {
  const live = p.alive && (game.state === 'race' || game.state === 'finished' || game.state === 'countdown');
  if (p.M && p.M.electric) {   // single-speed electric motor: revs follow road speed, no shifts, no limiter
    p.gear = 1; p.shiftT = 0; if (!live || game.state === 'countdown') p.throttle = game.state === 'countdown' ? 0.1 : 0;
    p.rpm = 800 + clamp(p.v / 60, 0, 1.1) * 6800 + (air ? 600 * p.throttle : 0); return;
  }
  if (!p.gear) { p.gear = 1; p.rpm = 900; p.shiftT = 0; }
  if (p.shiftT > 0) p.shiftT -= dt;
  let target;
  if (game.state === 'countdown' || p.v < 1.2 && game.state !== 'race') {
    // on the grid: any input revs the engine, with the limiter bouncing at the top
    const rev = inp.L || inp.R || inp.brake || inp.hand;
    target = rev ? 7300 + Math.sin(game.t * 40) * 250 : 950 + Math.sin(game.t * 7) * 40;
    p.throttle = rev ? 1 : 0.15; p.gear = 1;
  } else {
    if (p.shiftT <= 0 && live) {
      if (rpmIn(p.gear, p.v) > 7250 && p.gear < 6 && p.throttle > 0.5) { p.gear++; p.shiftT = 0.2; shiftSfx(true, p.rpm); }
      else if (p.gear > 1 && rpmIn(p.gear, p.v) < 4600 && rpmIn(p.gear - 1, p.v) < 6300) { p.gear--; p.shiftT = 0.14; shiftSfx(false, p.rpm); }
    }
    target = rpmIn(p.gear, p.v);
    if (air) target += 1800 * p.throttle;                    // wheels spinning in the air
    else if (p.drift > 0.1) target += Math.min(1400, p.drift * 2600) * p.throttle;
    if (p.shiftT > 0) p.throttle = 0;                          // clutch in: throttle cut
    if (!live) p.throttle = 0;
  }
  target = clamp(target, 800, 7600);
  if (target >= 7550 && p.throttle > 0.5) target -= Math.random() * 500;   // rev limiter
  p.rpm += (target - p.rpm) * (1 - Math.exp(-(p.shiftT > 0 ? 18 : 11) * dt));
}
function shiftSfx(up, rpm) {
  if (!AU.ctx || !settings.sound) return;
  if (up) {
    if (rpm > 6000 && Math.random() < 0.75) { sfxNoise(0.07, 700, 0.32, 'lowpass'); sfxTone(60 + Math.random() * 30, 0.06, 'square', 0.1); }   // exhaust pop
    if (Math.random() < 0.6) sfxNoise(0.28, 4200, 0.045, 'bandpass', 1400);                                                              // blow-off "pssh"
  } else { sfxNoise(0.05, 500, 0.2, 'lowpass'); }
}
let lastCrash = 0;
const SFX = {
  crash(i) { const now = performance.now(); if (now - lastCrash < 70) return; lastCrash = now; sfxNoise(0.18 + i * 0.25, 900 + i * 1800, 0.15 + i * 0.5, 'lowpass', 200); sfxTone(90, 0.2, 'triangle', 0.15 * i + 0.05, 40); },
  scrape() { sfxNoise(0.12, 3000, 0.08, 'bandpass'); },
  boom(vol = 1) { sfxNoise(1.6, 900, 0.9 * vol, 'lowpass', 60); sfxTone(70, 1.0, 'sine', 0.6 * vol, 25); sfxNoise(0.4, 4000, 0.3 * vol, 'highpass'); },
  beep(hi) { sfxTone(hi ? 880 : 440, hi ? 0.5 : 0.22, 'square', 0.12); },
  horn() { sfxTone(392, 0.35, 'square', 0.05); sfxTone(494, 0.35, 'square', 0.05); },
  pickup() { [660, 880, 1320].forEach((f, i) => sfxTone(f, 0.12, 'triangle', 0.15, null, i * 0.06)); },
  turbo() { sfxNoise(0.9, 400, 0.3, 'bandpass', 3000); sfxTone(200, 0.6, 'sawtooth', 0.06, 600); },
  near() { sfxNoise(0.35, 2400, 0.12, 'bandpass', 500); },
  oof() { sfxTone(300, 0.25, 'triangle', 0.15, 120); },
  land() { sfxNoise(0.2, 300, 0.3, 'lowpass'); },
};

/* ============================== input ============================== */
// Touch: each finger is assigned a zone (L, R, B = brake, H = handbrake) from where it is on screen.
const input = { kL: false, kR: false, kB: false, kH: false, kN: false, touches: new Map() };
const touchEl = $('touch');
function rectOf(id, pad = 14) { const el = $(id); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left - pad, r: r.right + pad, t: r.top - pad, b: r.bottom + pad, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; }
const inRect = (q, x, y) => q && x >= q.l && x <= q.r && y >= q.t && y <= q.b;
function touchZone(x, y) {
  if (x >= innerWidth / 2) { const a = rectOf('padB'), b = rectOf('padN'); return a && b ? (y < (a.cy + b.cy) / 2 ? 'N' : 'B') : 'B'; }   // NOS sits above BRAKE
  const a = rectOf('padL'), b = rectOf('padR');
  return a && b ? (x < (a.cx + b.cx) / 2 ? 'L' : 'R') : 'L';
}
touchEl.addEventListener('pointerdown', e => { audioInit(); input.touches.set(e.pointerId, touchZone(e.clientX, e.clientY)); try { touchEl.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
touchEl.addEventListener('pointermove', e => { if (input.touches.has(e.pointerId)) input.touches.set(e.pointerId, touchZone(e.clientX, e.clientY)); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) touchEl.addEventListener(ev, e => input.touches.delete(e.pointerId));
addEventListener('keydown', e => {
  if (game.state === 'entry') { entryKey(e); return; }
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.kL = true;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.kR = true;
  else if (k === 'ArrowDown' || k === 's' || k === 'S') input.kB = true;
  else if (k === ' ') input.kH = true;
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'n' || k === 'N' || k === 'Shift') input.kN = true;
  else if (k === 'c' || k === 'C') { if (game.state !== 'menu') cycleCamera(); }
  else if (k === 'p' || k === 'P' || k === 'Escape') { if (game.state === 'race' || game.state === 'countdown') pauseGame(); else if (game.state === 'paused') resumeGame(); }
  else return;
  audioInit(); e.preventDefault();
});
addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.kL = false;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.kR = false;
  else if (k === 'ArrowDown' || k === 's' || k === 'S') input.kB = false;
  else if (k === ' ') input.kH = false;
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'n' || k === 'N' || k === 'Shift') input.kN = false;
});
addEventListener('blur', () => { input.kL = input.kR = input.kB = input.kH = input.kN = false; input.touches.clear(); });
function readInput() {
  let L = input.kL, Rr = input.kR, B = input.kB, H = input.kH, N = input.kN;
  for (const v of input.touches.values()) { if (v === 'L') L = true; else if (v === 'R') Rr = true; else if (v === 'B') B = true; else if (v === 'N') N = true; }
  const steer = (Rr ? 1 : 0) - (L ? 1 : 0);
  return { steer, brake: B, hand: H, nos: N, L, R: Rr, B, H, N };
}

/* ============================== entities ============================== */
let ents = [];
const pool = {};
function getMesh(key, make) { const p = pool[key]; if (p && p.length) return p.pop(); return make(); }
function freeMesh(e) {
  if (!e.mesh) return;
  scene.remove(e.mesh);
  if (e.key && !e.charred && !e.noPool) (pool[e.key] ||= []).push(e.mesh);
  e.mesh = null;
}
function shadowMesh(w, l) { const m = new THREE.Mesh(geoPlane, matShadow); m.scale.set(w, 1, l); m.position.y = 0.04; m.userData.shadow = true; return m; }
function beamMesh(frontZ, w = 4.4) { const m = new THREE.Mesh(geoPlane, matBeam); m.scale.set(w, 1, 11); m.position.set(0, 0.07, frontZ + 5.2); m.userData.fx = true; m.renderOrder = 1; return m; }
const cast = m => { m.castShadow = true; return m; };
function lodMesh(g, far) { const lod = new THREE.LOD(); lod.addLevel(cast(new THREE.Mesh(g.hi, matCar)), 0); lod.addLevel(cast(new THREE.Mesh(g.lo, matCar)), far); return lod; }
function vehicleMesh(type, color) {
  const g = trafficGeo(type, color), gr = new THREE.Group();
  gr.add(lodMesh(g, type === 'bus' ? 85 : 55)); const li = new THREE.Mesh(g.lights, matLights); gr.add(li);
  const sz = type === 'bus' ? [3.4, 12.5] : type === 'hatch' ? [2.4, 4.4] : [2.5, 5.2];
  const sh = shadowMesh(sz[0], sz[1]); gr.add(sh);
  const beam = beamMesh({ bus: 5.7, van: 2.6, hatch: 1.8 }[type] || 2.15, type === 'bus' ? 5 : 4.4); gr.add(beam);
  gr.userData = { lights: li, shadow: sh, beam };
  return gr;
}
const geoRoundel = new THREE.PlaneGeometry(0.5, 0.5), numMat = {};
function rallyMesh(mi, colr, acc, num) {
  const g = rallyGeo(mi, colr, acc), gr = new THREE.Group(), D = g.dims;
  const li = new THREE.Mesh(g.lights, matLights);
  const bumper = cast(new THREE.Mesh(g.bumper, matCar)), hood = cast(new THREE.Mesh(g.hood, matCar)), spoiler = cast(new THREE.Mesh(g.spoiler, matCar));
  const brake = new THREE.Mesh(g.brake, matBrake); brake.visible = false; brake.userData.fx = true;
  const pod = new THREE.Group(); pod.add(cast(new THREE.Mesh(g.podBody, matCar)), new THREE.Mesh(g.podLights, matLights));
  gr.add(lodMesh(g, 70), li, bumper, hood, spoiler, brake, pod);
  const whl = [];
  for (const z of D.zs) for (const x of [-D.x, D.x]) {
    const w = cast(new THREE.Mesh(g.wheel, matCar)); w.position.set(x, D.r, z); w.rotation.order = 'YXZ';
    w.userData.base = x < 0 ? Math.PI : 0; w.rotation.y = w.userData.base; gr.add(w); whl.push(w);
  }
  for (const sd of [-1, 1]) {
    const nm = new THREE.Mesh(geoRoundel, numMat[num] ||= new THREE.MeshLambertMaterial({ map: numTex(num), transparent: true }));
    nm.position.set(sd * g.roundel.x, g.roundel.y, g.roundel.z); nm.rotation.y = sd * Math.PI / 2; gr.add(nm);
  }
  const sh = shadowMesh(2 * D.hw + 0.9, D.L + 1); gr.add(sh);
  const beam = beamMesh(D.L / 2, 4.8); gr.add(beam);
  gr.userData = { dims: D, lights: li, brake, pod, shadow: sh, beam, wheels: whl, parts: [{ m: bumper, at: 0.75 }, { m: hood, at: 0.45 }, { m: spoiler, at: 0.25 }] };
  return gr;
}
function pedMesh(sh, sk, pa) {
  const gr = new THREE.Group();
  gr.add(cast(new THREE.Mesh(pedGeo(sh, sk), matV)));
  const l1 = cast(new THREE.Mesh(legGeo(pa), matV)), l2 = cast(new THREE.Mesh(legGeo(pa), matV));
  l1.position.set(-0.12, 0.86, 0); l2.position.set(0.12, 0.86, 0); gr.add(l1, l2);
  const s = shadowMesh(0.9, 0.9); gr.add(s);
  gr.userData = { legs: [l1, l2], shadow: s };
  return gr;
}
function propMesh(t) {
  const gr = new THREE.Group();
  const flat = t === 'oil', glow = t === 'wrench' || t === 'turbo';
  const m = new THREE.Mesh(propGeo(t), glow ? matLights : matV); if (!flat && !glow) m.castShadow = true; gr.add(m);
  if (t === 'ramp') { const g2 = new THREE.Mesh(propGeo('rampGlow'), matLights); g2.renderOrder = 1; gr.add(g2); }
  if (!flat && !glow && t !== 'triangle') { const s = shadowMesh(t === 'barrier' ? 4.4 : t === 'ramp' ? 3.9 : t === 'rock' ? 2.8 : 1.4, t === 'ramp' ? 7.5 : t === 'rock' ? 2.8 : 1.4); gr.add(s); gr.userData.shadow = s; }
  return gr;
}

const BASE = { s: 0, d: 0, y: 0, vs: 0, vd: 0, vy: 0, hs: 2, hd: 0.9, mass: 1, hp: 60, maxhp: 60, alive: true, ang: 0, spin: 0, knock: 0, roll: 0, pitchX: 0,
  mesh: null, key: null, solid: true, vehicle: false, lastHit: -9, lastByPlayer: -99, rel: 0, fire: 0, wreck: false, charred: false, hard: undefined, airT: 0 };
function addEnt(kind, o) {
  const e = Object.assign({}, BASE, { kind }, o);
  e.inv = e.mass === Infinity ? 0 : 1 / e.mass;
  ents.push(e); if (e.mesh) scene.add(e.mesh);
  return e;
}
function removeEnt(e) { freeMesh(e); e.dead = true; }

let player = null;
const DBG = { on: false, log: [] };
const game = { state: 'menu', stageIdx: 0, t: 0, raceT: 0, count: 0, endT: 0, shake: 0, place: 6, finishOrder: [], stats: null, score: 0, tipT: 0 };

function spawnRallyCars(colorIdx) {
  const pc = PLAYER_COLORS[colorIdx] || PLAYER_COLORS[0];
  // 14 m between rival rows (~10 m bumper to bumper, more than a NOS flame reaches), you 20 m behind the last one
  const grid = [[98, 1.75], [84, 5.25], [70, 1.75], [56, 5.25], [42, 1.75], [22, 3.5]];
  RIVALS.forEach((r, i) => {
    const st = T.stage;
    const rm = modelIdx(r.model), RM = CAR_MODELS[rm], rg = rallyGeo(rm, r.col, r.acc).dims;
    addEnt('rival', { h: RM.id === 'duna' ? 2.0 : 1.5, name: r.name, s: grid[i][0], d: grid[i][1], hs: rg.L / 2 + 0.05, hd: rg.hw + 0.04, mass: RM.st.mass, hp: 100 * RM.st.arm, maxhp: 100 * RM.st.arm, vehicle: true,
      mesh: rallyMesh(rm, r.col, r.acc, i + 2), colorCss: '#' + new THREE.Color(r.col).getHexString(), noPool: true,
      base: st.rival * r.skill, nos: 0, boostT: 0, aggr: r.aggr, look: 55 + r.skill * 30, think: Math.random() * 0.3, targetD: grid[i][1], ramT: 0, finished: false });
  });
  const pm = settings.model, PM = CAR_MODELS[pm], pg = rallyGeo(pm, pc.col, pc.acc).dims;
  player = addEnt('player', { h: PM.id === 'duna' ? 2.0 : 1.5, M: PM.st, s: grid[5][0], d: grid[5][1], hs: pg.L / 2 + 0.05, hd: pg.hw + 0.04, mass: PM.st.mass, hp: 100, maxhp: 100, vehicle: true,
    mesh: rallyMesh(pm, pc.col, pc.acc, 1), noPool: true, v: 0, vh: 0, yaw: 0, steer: 0, turbo: 0, nos: 0, oil: 0, onRamp: false, drift: 0, finished: false });
  player.mesh.add(headSpot, headSpot.target);
}

/* ---------- police ---------- */
// Breaking a rule raises the wanted level (max 3). Each level puts one more patrol car on your tail;
// level 3 also sets up a roadblock ahead. Get boxed in and stopped = BUSTED. Shake them off = ESCAPED.
const police = { heat: 0, bust: 0, spawnT: 0, calmT: 0, cool: {}, block: false, wrongT: 0, nearest: 999 };
const matSirenR = new THREE.MeshBasicMaterial({ color: 0xff1010 }), matSirenB = new THREE.MeshBasicMaterial({ color: 0x1040ff });
function policeMesh() {
  const gr = vehicleMesh('police', 0xf4f4f4);
  for (const [x, m] of [[-0.27, matSirenR], [0.27, matSirenB]]) { const s = new THREE.Mesh(rboxGeo(0.46, 0.13, 0.24, 0.04), m); s.position.set(x, 1.565, -0.35); s.userData.fx = true; gr.add(s); }
  return gr;
}
function resetPolice() { Object.assign(police, { heat: 0, bust: 0, spawnT: 0, calmT: 0, cool: {}, block: false, wrongT: 0, nearest: 999 }); }
function violation(kind, text) {
  if (game.state !== 'race' || !player.alive || !settings.road.police) return;
  if (game.t - (police.cool[kind] ?? -99) < 9) return;
  police.cool[kind] = game.t;
  police.heat = Math.min(3, police.heat + 1); police.calmT = 0; police.spawnT = Math.min(police.spawnT, 0.6);
  game.stats.viol++;
  msg(text, 'hot'); msg(police.heat === 1 ? 'POLICE ALERTED!' : 'WANTED LEVEL ' + police.heat + '!', 'blue');
}
function spawnCop(s, d, vs, block, ang = 0) {
  const key = 'policeX';
  return addEnt('police', { sub: 'police', s, d, hs: 2.2, hd: 0.92, mass: 1.4, hp: 150, maxhp: 150, vehicle: true, key, mesh: getMesh(key, policeMesh),
    vs, ang, think: 0, targetD: d, block, parked: block, giveUp: false, nos: 0, boostT: 0 });
}
function spawnChaser() {
  const s = Math.max(4, player.s - R(85, 110));
  const lanes = [1.75, 5.25, -1.75].sort((a, b) => Math.abs(a - player.d) - Math.abs(b - player.d));
  for (const d of lanes) if (laneFree(s, d, 14)) { spawnCop(s, d, player.v + 9, false); return true; }
  return false;
}
function spawnRoadblock() {
  const s = player.s + 270;
  if (s > T.len - 60 || T.inters.some(I => Math.abs(I.s - s) < 25)) return false;
  for (const e of ents) if (!e.dead && Math.abs(e.s - s) < 12 && e.solid) removeEnt(e);
  spawnCop(s, 1.75, 0, true, 0.45); spawnCop(s + 1.5, 5.3, 0, true, -0.5);
  msg('ROADBLOCK AHEAD!', 'blue');
  return true;
}
function updatePoliceWorld(dt) {
  const cops = ents.filter(e => e.kind === 'police' && !e.dead);
  police.nearest = 999;
  for (const c of cops) if (c.alive && !c.giveUp) police.nearest = Math.min(police.nearest, Math.hypot(c.s - player.s, c.d - player.d));
  // traffic-rule checks
  if (game.state === 'race' && player.alive) {
    for (const I of T.inters) { const line = I.s - 12.2; if (game.prevS < line && player.s >= line && I.light === 'R') violation('red', 'RAN A RED LIGHT!'); }
    if (player.d < -0.9 && player.d > -RW && player.v > 8) { police.wrongT += dt; if (police.wrongT > 4.5) { violation('wrong', 'WRONG WAY!'); police.wrongT = 0; } } else police.wrongT = Math.max(0, police.wrongT - dt * 2);
  }
  if (police.heat <= 0 || game.state !== 'race') { police.bust = Math.max(0, police.bust - dt); return; }
  const chasers = cops.filter(c => c.alive && !c.block && !c.giveUp);
  police.spawnT -= dt;
  const maxCops = police.heat >= 3 ? 2 : 1;                 // one patrol car, two at three stars
  if (chasers.length < maxCops && police.spawnT <= 0) police.spawnT = spawnChaser() ? 7 : 0.5;
  if (police.heat >= 3 && !police.block) police.block = spawnRoadblock();
  const boxed = chasers.some(c => Math.abs(c.s - player.s) < 7 && Math.abs(c.d - player.d) < 3.6);
  if (boxed && player.v < 11) police.bust += dt; else police.bust = Math.max(0, police.bust - dt * 0.6);
  if (police.bust > 3.2) {
    game.state = 'busted'; game.endT = 2.4; msg('BUSTED!', 'hot'); vibrate([200, 80, 200]);
    sfxTone(392, 0.4, 'square', 0.08); sfxTone(523, 0.4, 'square', 0.08, null, 0.4); return;
  }
  const close = chasers.some(c => player.s - c.s < 200);
  police.calmT = close ? 0 : police.calmT + dt;
  if (police.calmT > 6) {
    police.heat = 0; police.bust = 0; police.block = false;
    for (const c of cops) c.giveUp = true;
    addScore(1000); game.stats.escapes++; msg('ESCAPED! +1000', 'gold'); SFX.pickup();
  }
}
function updatePolice(e, dt) {
  if (!e.alive) return wreckStep(e, dt);
  if (e.block) { const f = Math.exp(-3 * dt); e.vs *= f; e.vd *= f; e.s += e.vs * dt; e.d += e.vd * dt; wallCheck(e); if (e.knock > 0) { e.knock -= dt; e.ang += e.spin * dt; e.spin *= Math.exp(-2 * dt); } return; }
  const p = player, ds = p.s - e.s, chasing = !e.giveUp && p.alive && game.state === 'race';
  let target, tD = e.targetD;
  e.think -= dt;
  if (!chasing) target = e.giveUp ? 12 : 0;
  else if (ds > 20) {                                          // catching up: fast, weaving through traffic
    target = Math.min(56, p.v + 14);
    if (e.boostT > 0) { e.boostT -= dt; target = 66; } else if (e.nos > 0 && ds > 45) { e.nos--; e.boostT = 3; }
    if (e.think <= 0) {
      e.think = 0.25; let best = e.targetD, bs = -1e9;
      for (const L of [...LANES, p.d]) { const sc = Math.min(4, blockersAhead(e, L, 60, 1)) - Math.abs(L - p.d) * 0.12 - Math.abs(L - e.d) * 0.05; if (sc > bs) { bs = sc; best = L; } }
      e.targetD = best;
    }
    tD = e.targetD;
    if (blockersAhead(e, e.d, 35, 1) < 0.8 && Math.abs(tD - e.d) < 1) target = Math.min(target, e.vs * 0.6);
  } else if (ds > -3) { target = p.v + (ds > 5 ? 8 : 2.5); tD = p.d; }   // on your bumper or alongside: ram
  else { target = Math.max(0, p.v - 8); tD = p.d; }                     // in front: cut in and brake
  if (e.knock > 0) { e.knock -= dt; e.vs += clamp(target - e.vs, -6, 3) * dt * 0.5; e.vd *= Math.exp(-2 * dt); }
  else {
    e.vs += clamp(target - e.vs, -16 * dt, 9 * dt);
    const want = clamp((tD - e.d) * 2.6, -8, 8);
    e.vd += clamp(want - e.vd, -24 * dt, 24 * dt);
    e.spin *= Math.exp(-4 * dt);
  }
  const tr = trackAt(e.s, tr1);
  if (Math.abs(e.d) > RW + 0.3) e.vs = Math.min(e.vs, Math.max(target * 0.8, 20));
  e.s += e.vs * dt / Math.max(0.5, 1 + tr.k * e.d); e.d += e.vd * dt;
  wallCheck(e); steerAngle(e, dt, 0);
  e.braking = target < e.vs - 2;
}

/* ---------- poles: solid street furniture ---------- */
// Small marker posts get knocked flying like pedestrians. Lamp posts and traffic lights are heavy:
// they hurt the car and stop it hard, then topple over.
const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _pm = new THREE.Matrix4(), ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
function poleIndex(s) { let lo = 0, hi = T.poles.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T.poles[m].s < s) lo = m + 1; else hi = m; } return lo; }
function worldVel(e, out) {   // the entity's velocity as a world-space vector
  const h = trackAt(e.s, tr1).h; _fw.set(Math.sin(h), 0, Math.cos(h)); _rt.set(-Math.cos(h), 0, Math.sin(h));
  return out.copy(_fw).multiplyScalar(e.vs).addScaledVector(_rt, e.vd);
}
function hideInst(im, i) { if (im) { im.setMatrixAt(i, ZERO_M); im.instanceMatrix.needsUpdate = true; } }
function pokePoles(e) {
  if (!T.poles) return;
  const sp = e === player ? player.v : Math.hypot(e.vs, e.vd);
  for (let i = poleIndex(e.s - e.hs - 0.4); i < T.poles.length; i++) {
    const P = T.poles[i]; if (P.s > e.s + e.hs + 0.4) break;
    if (!P.up || e.y + CLEAR > (P.big ? (P.kind === 'tl' ? 5.6 : 6.5) : 0.95) || Math.abs(P.d - e.d) > e.hd + P.r || Math.abs(P.s - e.s) > e.hs + P.r) continue;
    if (!P.big) { if (sp > 1) knockPost(P, e, sp); continue; }
    if (sp > 4) topplePole(P, e, sp);
    else { e.s = P.s - Math.sign(P.s - e.s || 1) * (e.hs + P.r); e.vs = 0; if (e === player) player.v *= 0.3; }   // crawled into it: it holds
  }
}
function knockPost(P, e, sp) {
  P.up = false; hideInst(T.postIM, P.i);
  const m = new THREE.Mesh(T.postIM.geometry, matV); m.castShadow = true;
  worldPos(P.s, P.d, 0, m.position); m.rotation.y = trackAt(P.s, tr1).h; scene.add(m);
  worldVel(e, _v1).multiplyScalar(0.75); const side = Math.sign(P.d - e.d) || 1;
  _v1.addScaledVector(_rt, side * R(2, 4));
  debris.push({ m, vx: _v1.x, vy: 3 + sp * 0.12, vz: _v1.z, rx: R(-9, 9), rz: R(-9, 9), life: 12, s: P.s });
  e.vs *= 0.97;
  if (e === player) { player.v *= 0.97; sfxTone(180, 0.08, 'triangle', 0.12, 90); sparks(P.s, P.d, 0.6, 4); vibrate(10); }
}
function topplePole(P, e, sp) {
  P.up = false;
  const me = e === player;
  damage(e, 6 + sp * 0.55, null);
  e.vs *= 0.5; e.vd *= 0.5;
  if (me) { player.v *= 0.5; game.shake = Math.min(2, game.shake + 0.9); SFX.crash(clamp(sp / 30, 0.3, 1)); msg(P.kind === 'tl' ? 'TRAFFIC LIGHT DOWN!' : 'LAMP POST DOWN!', 'hot'); }
  else if (Math.abs(P.s - player.s) < 120) SFX.crash(0.3);
  if (e.inv > 0) e.spin += (Math.sign(P.d - e.d) || 1) * R(0.3, 0.8) * (me ? 1 : 0);
  sparks(P.s, P.d, 1.2, 18);
  // pivot at the base, everything above it falls in the direction the car was going
  const pivot = new THREE.Object3D(); worldPos(P.s, P.d, 0.15, pivot.position); T.group.add(pivot); pivot.updateMatrixWorld();
  if (P.kind === 'tl') { P.obj.updateMatrixWorld(); pivot.attach(P.obj); }
  else for (const im of T.lampIM) {
    if (!im) continue;
    if (im.material === matPool) { hideInst(im, P.i); continue; }
    im.getMatrixAt(P.i, _pm); const m = new THREE.Mesh(im.geometry, im.material); m.applyMatrix4(_pm); m.castShadow = true;
    T.group.add(m); m.updateMatrixWorld(); pivot.attach(m); hideInst(im, P.i);
  }
  worldVel(e, _v1); _v1.y = 0; if (_v1.lengthSq() < 0.01) _v1.set(1, 0, 0); _v1.normalize();
  T.falls.push({ pivot, axis: new THREE.Vector3(0, 1, 0).cross(_v1).normalize(), ang: 0.05, w: 0.6 + sp * 0.03, s: P.s, d: P.d, done: false });
}
function updateFalls(dt) {
  for (const F of T.falls) {
    if (F.done) continue;
    F.w += (3 + 9 * Math.sin(F.ang)) * dt; F.ang += F.w * dt;
    if (F.ang >= Math.PI / 2 - 0.04) {
      F.ang = Math.PI / 2 - 0.04; if (F.w > 1.5) F.w = -F.w * 0.18; else F.done = true;
      if (Math.abs(F.s - player.s) < 80) { sfxNoise(0.25, 260, 0.35, 'lowpass'); sparks(F.s, F.d, 0.2, 6); }
    }
    F.pivot.quaternion.setFromAxisAngle(F.axis, F.ang);
  }
}

/* ---------- static features ---------- */
function activateFeatures() {
  const ahead = player.s + 560;
  while (T.featIdx < T.feats.length && T.feats[T.featIdx].s < ahead) {
    const f = T.feats[T.featIdx++];
    if (f.s < player.s - 20) continue;
    makeFeature(f);
  }
}
function makeFeature(f) {
  const t = f.t;
  if (t === 'jay' && !settings.road.peds) return;
  if (!settings.road.obstacles && t !== 'jay' && t !== 'ramp' && t !== 'wrench' && t !== 'turbo') return;   // ramps and power-ups always stay
  if (t === 'jay') { spawnPed(f.s, f.d, 'jay'); return; }
  if (t === 'parked') {
    const type = f.sub, c = type === 'bus' ? pick(BUS_COLORS) : pick(CAR_COLORS);
    addEnt('traffic', { sub: type, s: f.s, d: f.d, dir: Math.sign(f.d), hs: type === 'bus' ? 5.6 : 2.4, hd: type === 'bus' ? 1.25 : 0.95, mass: type === 'bus' ? 6 : 1.8,
      hp: type === 'bus' ? 220 : 80, maxhp: type === 'bus' ? 220 : 80, vehicle: true, key: type + c, mesh: getMesh(type + c, () => vehicleMesh(type, c)),
      tSpeed: 0, parked: true, laneD: f.d, ang: f.d > 0 ? 0 : Math.PI, hazard: true });
    return;
  }
  const spec = {
    cone: { hs: 0.3, hd: 0.3, mass: 0.04, hard: 0, light: true },
    barrelR: { hs: 0.38, hd: 0.38, mass: 0.35, hard: 0.35, explosive: true },
    barrelB: { hs: 0.38, hd: 0.38, mass: 0.35, hard: 0.35 },
    hay: { hs: 0.62, hd: 0.66, mass: 0.7, hard: 0.25 },
    rock: { hs: 1.0, hd: 1.0, mass: Infinity, hard: 1.5 },
    barrier: { hs: 0.32, hd: 1.88, mass: Infinity, hard: 1.3 },
    triangle: { hs: 0.25, hd: 0.3, mass: 0.03, hard: 0, light: true },
    ramp: { hs: 3.25, hd: 1.6, solid: false, zone: 'ramp', mass: Infinity },
    oil: { hs: 2.0, hd: 2.0, solid: false, zone: 'oil', mass: Infinity },
    wrench: { hs: 1.0, hd: 1.0, solid: false, zone: 'wrench', mass: Infinity, y: 1.1 },
    turbo: { hs: 1.0, hd: 1.0, solid: false, zone: 'turbo', mass: Infinity, y: 1.1 },
  }[t];
  if (!spec) return;
  const e = addEnt('prop', Object.assign({ sub: t, s: f.s, d: f.d, key: 'p_' + t, mesh: getMesh('p_' + t, () => propMesh(t)), ang: t === 'barrier' || t === 'ramp' || t === 'oil' ? 0 : Math.random() * 6, hp: 1, maxhp: 1, tumble: 0 }, spec));
  if (t === 'rock') e.ang = f.s;
  if (t === 'ramp') for (const o of ents) if (!o.dead && o.kind === 'traffic' && Math.abs(o.s - e.s) < e.hs + 4 && Math.abs(o.d - e.d) < 2.4) removeEnt(o);   // ramps appear far ahead; clear any car parked on the spot
  return e;
}

/* ---------- traffic ---------- */
function laneFree(s, d, gap) {
  for (const o of ents) if (!o.dead && Math.abs(o.d - d) < 2.6 && Math.abs(o.s - s) < gap && o.solid) return false;
  return true;
}
function spawnTraffic(dir, sAt) {
  if (!settings.road.traffic) return;
  const st = T.stage;
  const s = sAt ?? (dir > 0 ? player.s + R(230, 340) : player.s + R(300, 420));
  if (s > T.len + 150) return;
  const lanes = dir > 0 ? [1.75, 5.25] : [-1.75, -5.25];
  const d = pick(lanes);
  const isBus = Math.random() < st.bus && Math.abs(d) > 4;
  const type = isBus ? 'bus' : pick(['sedan', 'sedan', 'hatch', 'hatch', 'van', 'taxi']);
  if (!laneFree(s, d, isBus ? 26 : 18)) return;
  if (T.inters.some(I => Math.abs(I.s - s) < 16)) return;
  if (ents.some(o => !o.dead && o.zone === 'ramp' && Math.abs(o.d - d) < 2 && Math.abs(o.s - s) < 16)) return;
  const c = type === 'bus' ? pick(BUS_COLORS) : type === 'taxi' ? 0xf4c20d : pick(CAR_COLORS);
  const spd = type === 'bus' ? R(10, 12.5) : R(13, 19);
  addEnt('traffic', { sub: type, s, d, dir, hs: { bus: 5.6, hatch: 1.85, van: 2.4 }[type] || 2.2, hd: { bus: 1.25, hatch: 0.85, van: 0.95 }[type] || 0.9,
    mass: { bus: 6, van: 1.8, hatch: 1.0 }[type] || 1.2, hp: { bus: 220, van: 80 }[type] || 60, maxhp: { bus: 220, van: 80 }[type] || 60,
    vehicle: true, key: type + c, mesh: getMesh(type + c, () => vehicleMesh(type, c)), tSpeed: spd, vs: spd * dir, laneD: d, ang: dir > 0 ? 0 : Math.PI,
    lcT: R(5, 14) });
}
function spawnCross(I, k) {
  if (!settings.road.traffic) return;
  const dir = k ? 1 : -1, d = -dir * 44, s = I.s + (k ? -3 : 3);
  for (const o of ents) if (!o.dead && o.kind === 'cross' && Math.abs(o.s - s) < 1 && Math.abs(o.d - d) < 9) return;
  const type = pick(['sedan', 'hatch', 'van', 'taxi', 'sedan']), c = type === 'taxi' ? 0xf4c20d : pick(CAR_COLORS);
  addEnt('cross', { sub: type, s, d, hs: 0.95, hd: type === 'van' ? 2.4 : 2.2, mass: type === 'van' ? 1.8 : 1.2, hp: 60, maxhp: 60, vehicle: true,
    key: type + c, mesh: getMesh(type + c, () => vehicleMesh(type, c)), vd: dir * R(12, 15), ang: dir * Math.PI / 2, crossDir: dir });
}
function spawnPed(s, d, mode, vd0 = 0) {
  const sh = pick(SHIRT), sk = pick(SKIN), pa = pick(PANTS), key = 'ped' + sh + sk + pa;
  return addEnt('ped', { s, d, hs: 0.32, hd: 0.32, mass: 0.15, hp: 1, maxhp: 1, key, mesh: getMesh(key, () => pedMesh(sh, sk, pa)),
    mode, state: mode === 'jay' ? 'wait' : 'walk', vd: vd0, vs: mode === 'side' ? (Math.random() < 0.5 ? -1 : 1) * R(1, 1.5) : 0,
    phase: Math.random() * 6, agil: R(0.35, 0.8), dodged: false, downT: 0, ang: vd0 ? (vd0 > 0 ? Math.PI / 2 : -Math.PI / 2) : 0 });
}
function lightState(I, t) {
  const cyc = I.G + I.Yl + I.Rd, ph = (t + I.off) % cyc;
  return { st: ph < I.G ? 'G' : ph < I.G + I.Yl ? 'Y' : 'R', ph, cyc: Math.floor((t + I.off) / cyc), rStart: I.G + I.Yl, cycLen: cyc };
}
function updateWorld(dt) {
  const st = T.stage, ps = player.s, t = game.t;
  activateFeatures();
  // traffic density
  let same = 0, opp = 0, sidePeds = 0;
  for (const e of ents) {
    if (e.dead) continue;
    if (e.kind === 'traffic' && !e.parked && !e.wreck) { if (e.dir > 0 && e.s > ps + 100) same++; if (e.dir < 0 && e.s > ps + 60) opp++; }
    if (e.kind === 'ped' && e.mode === 'side') sidePeds++;
  }
  {
    if (same < st.traffic * 3.2 && Math.random() < dt * 3) spawnTraffic(1);
    if (opp < st.oncoming * 3.2 && Math.random() < dt * 3) spawnTraffic(-1);
  }
  // sidewalk walkers in town
  if (settings.road.peds && sidePeds < 10 * st.peds) {
    const s = ps + R(80, 320);
    if (isTownAt(s) && !T.inters.some(I => Math.abs(I.s - s) < 12)) spawnPed(s, (Math.random() < 0.5 ? -1 : 1) * R(8.6, 10.6), 'side');
  }
  // intersections: lights, cross traffic, crossing pedestrians
  for (const I of T.inters) {
    const L = lightState(I, t);
    if (L.st !== I.light) {
      I.light = L.st;
      for (const lamps of I.objs) for (const m of lamps[0]) m.material = LAMP[L.st === 'R' ? 'rOn' : 'rOff'];
      for (const lamps of I.objs) { for (const m of lamps[1]) m.material = LAMP[L.st === 'Y' ? 'yOn' : 'yOff']; for (const m of lamps[2]) m.material = LAMP[L.st === 'G' ? 'gOn' : 'gOff']; }
    }
    if (I.s < ps - 30 || I.s > ps + 340) continue;
    if (L.st === 'R') {
      const into = L.ph - L.rStart;
      if (into > 0.2 && into < I.Rd - 4.0) for (let k = 0; k < 2; k++) { I.spawnT[k] -= dt; if (I.spawnT[k] <= 0) { I.spawnT[k] = R(1.2, 2.4); spawnCross(I, k); } }
      if (I.cyc !== L.cyc && I.s > ps + 25) {
        I.cyc = L.cyc;
        const n = Math.round(R(0.5, 2.5) * st.peds);
        if (settings.road.peds) for (let i = 0; i < n; i++) { const sd = Math.random() < 0.5 ? -1 : 1; spawnPed(I.s + (Math.random() < 0.5 ? -9 : 9) + R(-1, 1), sd * R(8.2, 9.8), 'cross', -sd * R(1.6, 2.2)); }
      }
    }
  }
}
function nextLight(e, dir) {
  // returns distance to the stop line ahead and the light state, or null
  for (const I of T.inters) {
    const line = I.s - dir * 12.2, dist = (line - e.s) * dir;
    if (dist > 0.5 && dist < 50) return { dist, st: I.light };
  }
  return null;
}

/* ============================== damage & explosions ============================== */
const msgsEl = $('msgs');
function msg(text, cls = 'good') {
  const d = document.createElement('div'); d.textContent = text; d.className = cls; msgsEl.appendChild(d);
  while (msgsEl.children.length > 3) msgsEl.firstChild.remove();
  setTimeout(() => d.remove(), 1300);
}
function addScore(n) { game.score = Math.max(0, game.score + n); }
function damage(e, amt, by) {
  if (!e.alive || !e.vehicle || amt <= 0) return;
  if (by === player && e !== player) { amt *= 1.35; e.lastByPlayer = game.t; addScore(Math.round(amt * 3)); }
  if (e === player) amt *= T.stage.dmg * (game.state === 'finished' ? 0.3 : 1) / (player.M ? player.M.arm : 1);
  e.hp -= amt;
  if (DBG.on && (e === player || e.kind === 'rival')) DBG.log.push([game.raceT.toFixed(2), e.kind, e.name || '', Math.round(amt), by ? by.kind + ':' + (by.sub || '') : 'wall/fall', Math.round(e.s), e.d.toFixed(1)].join(' '));
  if (e === player) { game.shake = Math.min(1.4, game.shake + amt * 0.03); vibrate(Math.min(80, 15 + amt * 2)); if (amt > 12) msg('-' + Math.round(amt) + '% CAR', 'hot'); }
  const parts = e.mesh?.userData.parts;
  if (parts) for (const p of parts) if (!p.gone && e.hp / e.maxhp < p.at) { p.gone = true; detach(e, p.m); }
  if (e.hp <= 0) explode(e);
}
const debris = [];
const _dq = new THREE.Quaternion(), _dp = new THREE.Vector3();
function detach(e, m) {
  m.getWorldPosition(_dp); m.getWorldQuaternion(_dq);
  e.mesh.remove(m); scene.add(m); m.position.copy(_dp); m.quaternion.copy(_dq);
  debris.push({ m, vx: R(-4, 4), vy: R(4, 8), vz: R(-4, 4), rx: R(-8, 8), rz: R(-8, 8), life: 6, s: e.s });
  sparks(e.s, e.d, 0.8, 12);
}
const debrisGeo = new THREE.BoxGeometry(0.5, 0.25, 0.7);
function explode(e) {
  if (!e.alive) return;
  e.alive = false; e.wreck = true; e.hp = 0;
  e.mass = e.sub === 'bus' ? 8 : 4; e.inv = 1 / e.mass;
  e.vy = e.sub === 'bus' ? 4 : 7.5; e.spin = R(-4, 4); e.knock = 999; e.fire = R(6, 9); e.rollT = Math.random() < 0.4 ? Math.PI : R(-0.5, 0.5);
  if (e.mesh) {
    e.charred = true;
    e.mesh.traverse(o => { if (o.userData.fx) o.visible = false; else if (o.isMesh && !o.userData.shadow) o.material = matChar; });
    if (e.mesh.userData.lights) e.mesh.userData.lights.visible = false;
    const parts = e.mesh.userData.parts; if (parts) for (const p of parts) if (!p.gone) { p.gone = true; detach(e, p.m); }
  }
  worldPos(e.s, e.d, 1, _w);
  boomLight.position.set(_w.x, _w.y + 1.5, _w.z); boomT = 0.55;
  for (let i = 0; i < 4; i++) emit(FX, _w.x, _w.y + 0.5, _w.z, 0, 0, 0, 0.22, 5 + i * 2, 10 + i * 2, 0, COL.flash, COL.fire0, 0.55, 0);
  for (let i = 0; i < 70; i++) emit(FX, _w.x, _w.y, _w.z, R(-9, 9), R(2, 14), R(-9, 9), R(0.5, 1.3), R(1.5, 3.5), R(4, 8), -2, COL.fire0, COL.fire1, 0.55, 2.2);
  for (let i = 0; i < 40; i++) emit(FX, _w.x, _w.y, _w.z, R(-16, 16), R(4, 18), R(-16, 16), R(0.4, 1.0), 0.4, 0.15, 20, COL.spark0, COL.spark1, 1, 0.5);
  for (let i = 0; i < 40; i++) emit(SMK, _w.x + R(-1, 1), _w.y + R(0, 2), _w.z + R(-1, 1), R(-3, 3), R(2, 7), R(-3, 3), R(1.8, 3.5), R(2, 4), R(8, 14), -0.5, COL.smokeB0, COL.smokeB1, 0.85, 1.2);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(debrisGeo, matChar);
    m.position.copy(_w); scene.add(m);
    debris.push({ m, vx: R(-10, 10), vy: R(6, 15), vz: R(-10, 10), rx: R(-10, 10), rz: R(-10, 10), life: R(3, 6), s: e.s, own: true });
  }
  // shockwave: pushes and hurts neighbours, so explosions can chain
  for (const o of ents) {
    if (o === e || o.dead) continue;
    const ds = o.s - e.s, dd = o.d - e.d, dist = Math.hypot(ds, dd);
    if (dist > 10) continue;
    const f = 1 - dist / 10;
    if (o.inv > 0) { const nx = ds / (dist || 1), nd = dd / (dist || 1); o.vs += nx * 14 * f * Math.min(1, o.inv); o.vd += nd * 14 * f * Math.min(1, o.inv); o.vy += 4 * f * Math.min(1, o.inv * 2); o.knock = Math.max(o.knock, 0.8); }
    if (o === player) { player.spin += R(-2, 2) * f; }
    if (o.vehicle) damage(o, 20 * f, game.t - e.lastByPlayer < 4 ? player : null);
    if (o.kind === 'ped') flingPed(o, e, 8 * f);
  }
  const dp = Math.abs(e.s - player.s);
  SFX.boom(clamp(1.2 - dp / 160, 0.15, 1));
  game.shake = Math.min(2, game.shake + Math.max(0, 1.6 - dp / 40));
  if (dp < 40) vibrate(120);
  if (e.M && e.M.electric) {   // battery pack goes up: white-blue flash, arcing sparks, a fire that burns longer
    for (let i = 0; i < 60; i++) emit(FX, _w.x, _w.y, _w.z, R(-12, 12), R(3, 16), R(-12, 12), R(0.3, 0.8), 0.5, 0.15, 14, [0.8, 0.9, 1], [0.2, 0.5, 1], 1, 0.6);
    e.fire = 14;
  }
  if (e === player) { game.state = 'wrecked'; game.endT = 2.6; msg(e.M && e.M.electric ? 'BATTERY FIRE!' : 'WRECKED!', 'hot'); vibrate([150, 60, 250]); }
  else if (game.state === 'race' || game.state === 'finished') {
    const mine = game.t - e.lastByPlayer < 4;
    if (e.kind === 'rival') { if (mine) { msg(e.name.toUpperCase() + ' TAKEN OUT! +1500', 'gold'); game.stats.rivals++; addScore(1500); } }
    else if (e.kind === 'police') { if (mine) { game.stats.cops++; addScore(1000); msg('POLICE TAKEDOWN +1000', 'gold'); police.spawnT = Math.max(police.spawnT, 8); } }
    else if (mine && e.vehicle) { violation('wreck', 'HIT AND RUN!'); game.stats.cars++; addScore(e.sub === 'bus' ? 800 : 300); msg(e.sub === 'bus' ? 'BUS WRECKED +800' : 'WRECKED +300', 'gold'); }
  }
}
function propHit(p, by, impact) {
  if (p.sub === 'barrelR' && impact > 7 && p.alive) { p.vehicle = false; p.alive = false; p.lastByPlayer = by === player ? game.t : -99; explodeBarrel(p); return; }
  p.knock = 2; p.vy = Math.min(9, impact * 0.35 + (p.light ? 3 : 1)); p.tumble = R(-12, 12);
  if (p.light) p.solid = false;
}
function explodeBarrel(p) {
  p.solid = false; p.mass = 1; p.inv = 1;
  const fake = { s: p.s, d: p.d, vs: 0, vd: 0, kind: 'prop', lastByPlayer: p.lastByPlayer, alive: true, mesh: null, vehicle: false, maxhp: 1 };
  ents.push(fake); explode(fake); fake.dead = true;
  removeEnt(p);
  if (game.t - p.lastByPlayer < 1) addScore(150);
}
function flingPed(ped, by, force) {
  if (ped.state === 'flung') return;
  const sd = ped.d >= by.d ? 1 : -1;
  ped.state = 'flung'; ped.vy = 4 + force * 0.25; ped.vd = sd * (3 + force * 0.25); ped.vs = (by.vs || 0) * 0.35; ped.tumble = R(6, 10) * sd; ped.solid = false;
  if (by === player && game.state === 'race') { game.stats.peds++; addScore(-1000); msg('PEDESTRIAN! -1000', 'hot'); SFX.oof(); player.v *= 0.72; vibrate(40); violation('ped', 'HIT A PEDESTRIAN!'); }
}

/* ============================== collisions ============================== */
let sorted = [];
// heights (m) for vertical overlap: a car in the air only hits what is actually tall enough to reach it
const CLEAR = 0.28;   // ground clearance: the body starts this far above the wheels' contact point
const H_SUB = { sedan: 1.47, taxi: 1.6, hatch: 1.5, van: 2.1, bus: 3.1, police: 1.65, cone: 0.75, barrelR: 0.95, barrelB: 0.95, hay: 1.25, rock: 1.1, barrier: 1.05, triangle: 0.45 };
const hOf = e => e.h || H_SUB[e.sub] || (e.kind === 'ped' ? 1.9 : 1.5);
function collide(a, b) {
  const dsv = b.s - a.s, ddv = b.d - a.d;
  const os = a.hs + b.hs - Math.abs(dsv); if (os <= 0) return;
  const od = a.hd + b.hd - Math.abs(ddv); if (od <= 0) return;
  if (a.y + CLEAR > b.y + hOf(b) || b.y + CLEAR > a.y + hOf(a)) return;   // one passes over the other
  if (a.kind === 'ped' || b.kind === 'ped') {
    const ped = a.kind === 'ped' ? a : b, o = ped === a ? b : a;
    if (o.vehicle && Math.hypot(o.vs, o.vd) > 2) flingPed(ped, o, Math.hypot(o.vs, o.vd));
    return;
  }
  const ia = a.inv, ib = b.inv, tot = ia + ib; if (tot === 0) return;
  let nx = 0, nd = 0, corr;
  if (os < od) { nx = dsv >= 0 ? 1 : -1; corr = os; } else { nd = ddv >= 0 ? 1 : -1; corr = od; }
  a.s -= nx * corr * ia / tot; a.d -= nd * corr * ia / tot; b.s += nx * corr * ib / tot; b.d += nd * corr * ib / tot;
  const rv = (b.vs - a.vs) * nx + (b.vd - a.vd) * nd;
  if (rv >= 0) return;
  const j = -(1.25) * rv / tot;
  a.vs -= j * ia * nx; a.vd -= j * ia * nd; b.vs += j * ib * nx; b.vd += j * ib * nd;
  // tangential friction
  if (nd !== 0) { const tv = b.vs - a.vs, f = clamp(tv, -2, 2) * 0.3; a.vs += f * ia / tot * 2; b.vs -= f * ib / tot * 2; }
  const impact = -rv;
  const spinK = nd !== 0 ? clamp(dsv / (a.hs + b.hs), -1, 1) : clamp(ddv / (a.hd + b.hd), -1, 1) * 0.6;
  if (impact > 2) {
    if (a.inv > 0) { a.spin -= spinK * impact * 0.09 * Math.min(2, ib / Math.max(ia, 0.01)); if (impact > 5 && a !== player) a.knock = Math.max(a.knock, 0.4 + impact * 0.04); }
    if (b.inv > 0) { b.spin += spinK * impact * 0.09 * Math.min(2, ia / Math.max(ib, 0.01)); if (impact > 5 && b !== player) b.knock = Math.max(b.knock, 0.4 + impact * 0.04); }
  }
  const K = 0.62;
  if (impact > 2.5) {
    const hb = b.hard ?? clamp(b.mass / a.mass, 0.3, 2.2), ha = a.hard ?? clamp(a.mass / b.mass, 0.3, 2.2);
    if (a.vehicle) damage(a, (impact - 2) * K * hb, b.kind === 'player' ? player : b);
    if (b.vehicle) damage(b, (impact - 2) * K * ha, a.kind === 'player' ? player : a);
    if (a.kind === 'prop' && a.inv > 0) propHit(a, b, impact);
    if (b.kind === 'prop' && b.inv > 0) propHit(b, a, impact);
    const cs = a.s + nx * a.hs, cd = a.d + nd * a.hd;
    if ((a.hard ?? 1) > 0.1 && (b.hard ?? 1) > 0.1) sparks(cs, cd, 0.7, Math.min(24, 4 + impact | 0));
    const dp = Math.abs(cs - player.s);
    if (dp < 120) { const vol = clamp(impact / 30, 0.05, 1) * clamp(1.2 - dp / 120, 0, 1); if (a === player || b === player) SFX.crash(vol); else if (vol > 0.08) SFX.crash(vol * 0.6); }
    a.lastHit = b.lastHit = game.t;
    const pl = a === player ? a : b === player ? b : null, other = pl === a ? b : a;
    if (pl && other.kind === 'police' && impact > 5) violation('cop', 'RAMMED THE POLICE!');
    else if (pl && (other.kind === 'traffic' || other.kind === 'cross') && impact > 14) violation('crash', 'RECKLESS DRIVING!');
  } else if (impact > 1 && (a === player || b === player)) { SFX.scrape(); sparks(a.s + nx * a.hs, a.d + nd * a.hd, 0.6, 3); }
}
function collisions() {
  sorted = ents.filter(e => !e.dead && e.solid);
  sorted.sort((a, b) => a.s - b.s);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.s - a.s > 15) break;
      if (a.inv === 0 && b.inv === 0) continue;
      if (a.kind === 'ped' && b.kind === 'ped') continue;
      if (a.kind === 'prop' && b.kind === 'prop' && a.knock <= 0 && b.knock <= 0) continue;
      collide(a, b);
    }
  }
}
// can this car touch that zone from the height it's at? (ramps handle their own height)
function zoneReach(e, z) {
  if (z.zone === 'ramp') return true;
  if (z.zone === 'oil') return e.y < 0.25;
  return e.y + CLEAR < (z.y || 0) + 0.85;   // pickups float at ~1.1 m: fly over them and you miss them
}
function zones(e) {
  // non-solid props: ramps, oil, pickups (rally cars only)
  for (const z of ents) {
    if (z.dead || !z.zone || Math.abs(z.s - e.s) > z.hs + 2) continue;
    if (!zoneReach(e, z)) continue;
    if (Math.abs(z.d - e.d) > z.hd + (z.zone === 'ramp' ? TRACK : e.hd)) continue;
    if (z.zone === 'ramp') rampTouch(e, z);
    else if (z.zone === 'oil') {
      if (e === player) { if (player.oil <= 0) { player.spin += (Math.random() < 0.5 ? -1 : 1) * R(1.8, 2.6); msg('OIL!', 'hot'); } player.oil = 1.1; }
      else if (e.kind === 'rival' && !e.oiled) { e.oiled = true; e.spin += R(-2, 2); e.knock = 0.8; }
    } else if (e === player && game.state === 'race' && Math.abs((e.rowS ?? -99) - z.s) > 2 && !(z.zone === 'turbo' && player.M && player.M.electric)) {   // one pickup per row; the electric leaves NOS bottles
      e.rowS = z.s;
      if (z.zone === 'wrench') { const fix = player.M && player.M.electric ? 50 : 30; player.hp = Math.min(100, player.hp + fix); msg('REPAIR +' + fix + '%', 'good'); }   // the fragile electric gets a bigger fix
      else { player.nos++; msg('NOS +1', 'blue'); }
      SFX.pickup(); vibrate(20); addScore(100); removeEnt(z);
    }
  }
}

/* ============================== updates ============================== */
const tr1 = { ...tr0 };
// Ramps, per wheel: each side of the car (left/right wheel track) sits on the ramp surface or on the road.
// Straight on = clean jump. One side on = the car leaves tilted and keeps rolling in the air;
// how it lands decides: shrug it off, a hard damaging landing, or a full barrel roll.
const TRACK = 0.8;                                 // half the distance between left and right wheels
function rampTouch(e, z) {
  const u = e.s - (z.s - z.hs); if (u < 0 || u > 2 * z.hs) return;
  const h = u / (2 * z.hs) * 1.15, off = e.d - z.d, a = Math.abs(off), inner = z.hd - TRACK;
  if (a > z.hd + TRACK) return;                                   // neither wheel line reaches the ramp
  // f = how badly off-centre: 0 = both wheel lines on the ramp, 1 = only the outermost wheel edge catches it
  const f = a <= inner ? 0 : clamp((a - inner) / (2 * TRACK), 0.08, 1);
  const hUp = h, hDown = h * (1 - f), side = f ? (off > 0 ? 1 : -1) : 0;   // car right of the ramp -> its left wheels ride up
  const hL = side >= 0 ? hUp : hDown, hR = side >= 0 ? hDown : hUp, ty = (hL + hR) / 2;
  if (e.y > ty + 0.3 && !e.onRamp) return;                       // flying over it
  const c = e.rampC;
  if (!c || ty > c.ty) e.rampC = { z, ty, h, roll: Math.atan2(hL - hR, 2 * TRACK), f, side };
}
function verticalStep(e, dt) {
  const c = e.rampC; e.rampC = null;
  if (c && !e.rolling) {
    e.y = c.ty; e.vy = 0; e.rRoll = c.roll; e.onRamp = c.z; e.rampF = c.f; e.rampSide = c.side;
    return;
  }
  if (e.onRamp) {                                   // just left the ramp: off the end, or off its side
    const z = e.onRamp, sp = Math.abs(e.vs), f = e.rampF || 0, side = e.rampSide, offEnd = e.s >= z.s + z.hs - 0.5;
    e.onRamp = null;
    e.vy = offEnd ? (sp * 0.17 + 1.5) * (1 - 0.45 * f) : 0.5;
    e.rollV = side * (offEnd ? sp * 0.07 * f : 1.0 + e.y * 2);    // one side launched harder than the other -> rotation
    if (side && e.inv > 0) { e.spin += side * R(0.2, 0.6); if (e !== player) e.knock = Math.max(e.knock, 0.6); }
    if (e === player && offEnd) {
      player.jumpBoost = 2.8; player.v = Math.min(60, player.v + 6 * (1 - 0.5 * f));   // launch boost, carried on landing
      sfxNoise(0.6, 500, 0.22, 'bandpass', 2600);
      if (f < 0.3) { msg('JUMP BOOST! +200', 'blue'); addScore(200); } else { msg('EDGE JUMP! BOOST', 'gold'); addScore(100); }
    }
  }
  if (e.rolling) { rollStep(e, dt); return; }
  if (e.y > 0 || e.vy > 0) {
    e.vy -= 22 * dt; e.y += e.vy * dt;
    if (e.rollV) e.rRoll = (e.rRoll || 0) + e.rollV * dt;
    if (e.y <= 0) {
      e.y = 0;
      const hard = e.vy < -12;
      if (e.vehicle && e.rRoll) landRoll(e, hard);
      else if (hard && e.vehicle) { damage(e, (-e.vy - 12) * 1.4, null); if (e === player) { SFX.land(); game.shake += 0.3; } sparks(e.s, e.d, 0.2, 6); }
      if (e.kind === 'prop' && e.vy < -3) e.vy = -e.vy * 0.3; else e.vy = 0;
    }
  }
  if (e.rolling) rollStep(e, dt);
  else if (e.y <= 0 && e.rRoll && !e.onRamp) e.rRoll *= Math.exp(-10 * dt);   // settle back onto four wheels
}
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
function landRoll(e, hard) {
  const r = wrapA(e.rRoll), a = Math.abs(r), me = e === player;
  if (a < 0.55) {                                    // lands on the wheels, a bit lopsided
    if (hard) damage(e, (-e.vy - 12) * 1.4, null);
    if (me) { SFX.land(); game.shake += 0.25; }
    e.rRoll = r; e.rollV = 0;
  } else if (a < 1.25) {                             // slams down on two wheels
    damage(e, 9 + a * 6, null); sparks(e.s, e.d, 0.3, 14);
    if (e.inv > 0) e.spin += Math.sign(r) * R(0.8, 1.6);
    if (me) { SFX.crash(0.5); game.shake += 0.7; msg('HARD LANDING!', 'hot'); player.v *= 0.85; }
    else { e.vs *= 0.85; e.knock = Math.max(e.knock, 0.8); }
    e.rRoll = r; e.rollV = 0;
  } else {                                           // over it goes: barrel roll until back on the wheels
    e.rolling = true; e.rollDir = Math.sign(e.rollV || r) || 1; e.rRoll = r;
    damage(e, 20, null); sparks(e.s, e.d, 0.5, 24);
    if (me) { SFX.crash(0.8); game.shake += 1.1; msg('BARREL ROLL!', 'hot'); vibrate([60, 40, 90]); }
    else e.knock = Math.max(e.knock, 2);
  }
}
function rollStep(e, dt) {
  // keep rotating the same way to the next upright position, scraping along and losing speed
  const target = e.rollDir > 0 ? Math.ceil(e.rRoll / (2 * Math.PI) - 0.02) * 2 * Math.PI : Math.floor(e.rRoll / (2 * Math.PI) + 0.02) * 2 * Math.PI;
  const left = target - e.rRoll;
  e.rRoll += Math.sign(left) * Math.min(Math.abs(left), 7.5 * dt);
  e.y = Math.abs(Math.sin(e.rRoll)) * 0.75;           // body rides up when the car is on its side
  if (e === player) player.v = Math.max(0, player.v - 9 * dt); else e.vs *= Math.exp(-0.9 * dt);
  if (Math.random() < dt * 25) sparks(e.s, e.d, 0.4, 2);
  if (Math.abs(left) < 0.02) { e.rolling = false; e.rRoll = 0; e.y = 0; e.vy = 0; e.rollV = 0; if (e === player) SFX.land(); }
}
function updatePlayer(p, dt, inp) {
  const tr = trackAt(p.s, tr1);
  const air = (p.y > 0.08 && !p.onRamp) || p.rolling;
  const racing = game.state === 'race' || game.state === 'finished';
  const steerIn = racing || game.state === 'wrecked' ? inp.steer : 0;
  p.steer += clamp(steerIn - p.steer, -dt * 8, dt * 8);
  const off = Math.abs(p.d) > RW + 0.2;
  const M = p.M || CAR_MODELS[0].st;
  let vmax = 46 * M.spd * (0.78 + 0.22 * Math.max(0, p.hp) / p.maxhp);
  if (off) vmax *= tr.town ? Math.max(0.82, M.off) : M.off;
  if (!tr.town && Math.abs(p.d) > 10.3) vmax *= 0.72;          // grass: slower still than the gravel shoulder
  if (p.jumpBoost > 0) { p.jumpBoost -= dt; if (!air) vmax = Math.max(vmax, 55); }
  if (p.turbo > 0) vmax = 58;
  if (game.state === 'countdown' || game.state === 'menu') vmax = 0;
  if (game.state === 'finished') vmax = 24;
  if (game.state === 'busted') { vmax = 0; p.v = Math.max(0, p.v - 14 * dt); }
  if (!p.alive) vmax = 0;
  const vt = vmax * (1 - 0.05 * Math.abs(p.steer));
  if (!air) {
    if (inp.brake && racing) p.v = Math.max(0, p.v - 21 * dt);                // foot brake: strong, keeps grip
    else if (p.v < vt) p.v += (p.turbo > 0 || p.jumpBoost > 0 ? 24 : (7 + 8 * (1 - p.v / 46)) * M.acc) * dt;
    else p.v -= Math.min(p.v - vt, (off ? 22 : p.alive ? 7 : 12) * dt);
    if (inp.hand && racing) p.v = Math.max(0, p.v - 12 * dt);
  }
  p.throttle = !inp.brake && p.v < vt + 0.6 && racing ? 1 : 0.15;
  p.braking = (inp.brake || inp.hand) && racing;
  const vn = clamp(p.v / 46, 0, 1.3);
  const rate = (2.1 - 1.3 * Math.min(vn, 1.1)) * M.hdl * (air ? 0.2 : 1) * clamp(p.v / 4, 0, 1);
  let dyaw = p.steer * rate * (inp.hand && racing ? 1.7 : 1) + tr.k * p.v * 0.55;   // the road does 45% of the cornering for you
  if (Math.abs(steerIn) < 0.1 && !inp.hand && !air) dyaw -= p.yaw * 1.9;
  p.yaw += dyaw * dt + p.spin * dt; p.spin *= Math.exp(-3.2 * dt);
  p.yaw = clamp(p.yaw, -1.35, 1.35);
  let grip = 7.5 * M.hdl - 2.6 * vn * Math.abs(p.steer);
  if (inp.hand && racing) grip = 1.5;
  if (off) grip *= 0.7;
  if (p.oil > 0) { grip = 0.5; p.oil -= dt; }
  if (air) grip = 0;
  p.vh += tr.k * p.v * 0.55 * dt;
  p.vh += (p.yaw - p.vh) * (1 - Math.exp(-grip * dt));
  const slip = Math.abs(p.yaw - p.vh);
  p.drift = !air && p.v > 16 ? slip : 0;
  if (p.drift > 0.08) {
    p.v -= p.drift * 3.2 * dt;
    if (game.state === 'race') addScore(Math.round(p.drift * dt * 400));
  }
  if (p.turbo > 0) p.turbo -= dt;
  p.vs = p.v * Math.cos(p.vh); p.vd = p.v * Math.sin(p.vh);
  updateGearbox(p, dt, inp, air);
}
function integratePlayer(p, dt) {
  const tr = trackAt(p.s, tr1);
  p.s += p.vs * dt / Math.max(0.5, 1 + tr.k * p.d);
  p.d += p.vd * dt;
  if (p.v < 6 && p.alive && Math.abs(p.steer) > 0.2 && p.y < 0.1) p.d += p.steer * (6 - p.v) * 0.45 * dt;   // crawl sideways out of a jam
  wallCheck(p);
}
function syncPlayerFromVel(p) {
  const fs = Math.max(p.vs, 0);
  p.v = Math.hypot(fs, p.vd); p.vh = Math.atan2(p.vd, Math.max(fs, 0.5));
  if (Math.abs(p.vh) > 1.4) p.vh = Math.sign(p.vh) * 1.4;
}
const RAIL_D = 10.5, GRASS_MAX = 18.5;
const railAt = s => !isTownAt(s) && T.rail && T.rail[clamp(Math.floor(s / SEG), 0, T.n - 1)];
function wallCheck(e) {
  // town: buildings. Countryside: open grass out to GRASS_MAX; guard rails are a barrier from both sides.
  const a = Math.abs(e.d), sd = Math.sign(e.d) || 1;
  let lim = null, inward = false;
  if (isTownAt(e.s)) {
    if (a > 12.2) {   // came in off the grass: slam into the first building
      if (e.vehicle && e.alive) { const v = e === player ? player.v : Math.abs(e.vs); damage(e, 5 + v * 0.5, null); sparks(e.s, e.d, 0.8, 16); if (e === player) { player.v *= 0.35; SFX.crash(0.7); game.shake += 0.8; } }
      e.vs *= 0.35; e.d = sd * (11.2 - e.hd); e.vd = 0; return;
    }
    if (a > 11.2 - e.hd) lim = 11.2 - e.hd;
  }
  else if (railAt(e.s)) {
    if (a <= RAIL_D) { if (a > RAIL_D - 0.3 - e.hd) lim = RAIL_D - 0.3 - e.hd; }        // road side of the rail
    else if (a < RAIL_D + 0.3 + e.hd) { lim = RAIL_D + 0.3 + e.hd; inward = true; }      // grass side of the rail
    else if (a > GRASS_MAX - e.hd) lim = GRASS_MAX - e.hd;
  } else if (a > GRASS_MAX - e.hd) lim = GRASS_MAX - e.hd;
  if (lim === null) return;
  const dir = inward ? -sd : sd, vdOut = e.vd * dir;      // dir: the way the barrier pushes back against
  e.d = sd * lim;
  if (vdOut > 0) {
    e.vd = -dir * vdOut * 0.35; e.vs *= 0.94;
    if (vdOut > 3.5 && e.vehicle) {
      damage(e, (vdOut - 3) * 0.9, null);
      sparks(e.s, e.d + dir * e.hd, 0.6, 10);
      if (e === player) { SFX.crash(clamp(vdOut / 25, 0.1, 0.7)); p_spinWall(e, dir, vdOut); }
    } else if (e === player && vdOut > 1) { SFX.scrape(); sparks(e.s, e.d + dir * e.hd, 0.6, 3); }
    if (e === player) e.yaw *= 0.6;
  }
}
function p_spinWall(e, sd, v) { e.spin -= sd * v * 0.04; }

function rampAhead(e, laneD, dir, look) {
  for (const o of ents) if (!o.dead && o.zone === 'ramp' && Math.abs(o.d - laneD) < 1.5) { const ds = (o.s - e.s) * dir; if (ds > -o.hs - 3 && ds < look) return true; }
  return false;
}
function blockersAhead(e, laneD, look, dir) {
  // time-to-contact with the nearest thing ahead in a lane
  let best = 99;
  const v = Math.max(1, Math.abs(e.vs));
  for (const o of ents) {
    if (o === e || o.dead) continue;
    if (!o.solid && o.zone !== 'oil' && !(o.zone === 'ramp' && e.kind === 'traffic')) continue;
    if (o.zone === 'oil' && e.kind === 'traffic') continue;
    const ds = (o.s - e.s) * dir; if (ds < -1 || ds > look) continue;
    let lat = Math.abs(o.d - laneD);
    if (o.kind === 'cross') lat = Math.abs(o.d + o.vd * Math.min(2, ds / v) - laneD);
    if (lat > o.hd + e.hd + (o.kind === 'ped' ? 1.2 : 0.4)) continue;
    const close = v - o.vs * dir, gap = ds - (o.hs || 0) - e.hs;   // bumper-to-bumper distance
    const ttc = close <= 0.5 ? (gap < 4 ? 0.2 : 99) : Math.max(0, gap) / close;
    if (ttc < best) best = ttc;
  }
  return best;
}
function updateRival(r, dt) {
  if (!r.alive) return wreckStep(r, dt);
  const racing = game.state === 'race' || game.state === 'finished' || game.state === 'wrecked';
  r.think -= dt;
  if (r.think <= 0 && racing) {
    r.think = R(0.15, 0.3);
    let best = r.targetD, bestScore = -1e9;
    for (const L of LANES) {
      let sc = Math.min(4, blockersAhead(r, L, r.look, 1));
      sc -= Math.abs(L - r.d) * 0.08 + (L < 0 ? 0.25 : 0) + R(0, 0.25);
      sc += pickupAhead(r, L, r.hp < 75) * 0.9;
      if (sc > bestScore) { bestScore = sc; best = L; }
    }
    r.targetD = best; r.ttc = blockersAhead(r, r.d, 40, 1);
    // aggression: lean on the player when alongside
    const ds = player.s - r.s, dd = player.d - r.d;
    if (player.alive && Math.abs(ds) < 3.5 && Math.abs(dd) < 4.2 && Math.random() < r.aggr * 0.35) { r.ramT = 0.6; r.ramD = player.d; }
  }
  let target = racing ? r.base * (0.8 + 0.2 * r.hp / r.maxhp) : 0;
  // rivals fire their NOS on a clear straight, mostly when the player is close or late in the stage
  if (r.boostT > 0) r.boostT -= dt;
  else if (r.nos > 0 && game.state === 'race' && r.ttc > 2.5 && Math.abs(trackAt(r.s + 40, tr1).k) < 0.004 &&
    ((Math.abs(player.s - r.s) < 60 && Math.random() < dt * 0.6) || (r.s > T.len * 0.7 && Math.random() < dt * 0.3))) {
    r.nos--; r.boostT = 3.5;
  }
  if (r.boostT > 0 && racing) target *= 1.3;
  const gap = r.s - player.s;
  if (player.alive && game.state === 'race') {
    if (gap > 70) target *= 1 - Math.min(0.14, (gap - 70) / 1200);
    if (gap < -50) target *= 1 + Math.min(0.16, (-gap - 50) / 700);
  }
  if (r.finished) target = 22;
  if (r.ttc < 0.9 && Math.abs(r.targetD - r.d) < 1) target = Math.min(target, Math.max(6, r.vs * 0.6));
  r.braking = racing && target < r.vs - 2.5;
  let tD = r.targetD;
  if (r.ramT > 0) { r.ramT -= dt; tD = r.ramD; }
  if (r.knock > 0) { r.knock -= dt; r.vs += clamp(target - r.vs, -6, 3) * dt * 0.5; r.vd *= Math.exp(-2 * dt); }
  else {
    r.vs += clamp(target - r.vs, -14 * dt, (r.boostT > 0 ? 18 : 7) * dt);
    const want = clamp((tD - r.d) * 2.4, -7.5, 7.5);
    r.vd += clamp(want - r.vd, -22 * dt, 22 * dt);
    r.spin *= Math.exp(-4 * dt);
  }
  const tr = trackAt(r.s, tr1);
  if (Math.abs(r.d) > RW + 0.3) r.vs = Math.min(r.vs, target * 0.75);
  r.s += r.vs * dt / Math.max(0.5, 1 + tr.k * r.d); r.d += r.vd * dt;
  wallCheck(r);
  steerAngle(r, dt, 0);
  if (!r.finished && r.s >= T.len && game.state !== 'menu') { r.finished = true; game.finishOrder.push(r); }
}
function steerAngle(e, dt, base) {
  if (e.knock > 0 || !e.alive) { e.ang += e.spin * dt; e.spin *= Math.exp(-1.5 * dt); return; }
  const sp = Math.hypot(e.vs, e.vd);
  if (sp > 1.5) {
    let tgt = Math.atan2(e.vd, e.vs);
    if (e.kind === 'traffic' && e.dir < 0 && sp < 3) tgt = Math.PI;
    let diff = tgt - e.ang; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    e.ang += diff * (1 - Math.exp(-6 * dt));
  } else if (base !== undefined && e.kind !== 'cross') {
    let diff = base - e.ang; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); e.ang += diff * (1 - Math.exp(-2 * dt));
  }
}
function wreckStep(e, dt) {
  const f = Math.exp(-2.2 * dt);
  e.vs *= f; e.vd *= f;
  e.s += e.vs * dt; e.d += e.vd * dt; wallCheck(e);
  e.ang += e.spin * dt; e.spin *= Math.exp(-1.2 * dt);
  e.roll = lerp(e.roll, e.rollT ?? 0, 1 - Math.exp(-3 * dt));
}
function updateTraffic(e, dt) {
  if (!e.alive) return wreckStep(e, dt);
  if (e.parked) { e.vs *= Math.exp(-3 * dt); e.vd *= Math.exp(-3 * dt); e.s += e.vs * dt; e.d += e.vd * dt; wallCheck(e); if (e.knock > 0) { e.knock -= dt; e.ang += e.spin * dt; e.spin *= Math.exp(-2 * dt); } return; }
  const dir = e.dir;
  let target = e.tSpeed;
  const ttc = blockersAhead(e, e.d, 40, dir);
  if (ttc < 2.5) target = Math.min(target, Math.max(0, Math.abs(e.vs) * (ttc - 0.6) / 2));
  const L = nextLight(e, dir);
  if (L && L.st !== 'G' && !(L.st === 'Y' && L.dist < 9)) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 4.5 * (L.dist - 1))));
  // a ramp in our lane ahead: move over in good time (traffic never drives onto ramps)
  if (!e.changing && rampAhead(e, e.laneD, dir, 70)) { const other = dir * (Math.abs(e.laneD) > 3 ? 1.75 : 5.25); if (!rampAhead(e, other, dir, 70) && blockersAhead(e, other, 30, dir) > 2) { e.laneD = other; e.changing = true; } }
  // stuck behind a wreck or obstacle (not a light): pull into the other lane
  if (Math.abs(e.vs) < 1.5 && !(L && L.st !== 'G')) e.stuckT = (e.stuckT || 0) + dt; else e.stuckT = 0;
  if (e.stuckT > 1.5 && !e.changing) { const other = dir * (Math.abs(e.laneD) > 3 ? 1.75 : 5.25); if (blockersAhead(e, other, 20, dir) > 2) { e.laneD = other; e.changing = true; e.stuckT = 0; } }
  // lane change now and then (same direction only) — keeps the player guessing
  e.lcT -= dt;
  if (e.lcT <= 0 && !e.changing) {
    e.lcT = R(6, 14);
    const other = dir * (Math.abs(e.laneD) > 3 ? 1.75 : 5.25);
    if (e.sub !== 'bus' && blockersAhead(e, other, 25, dir) > 3 && Math.abs(player.s - e.s) > 14) { e.laneD = other; e.changing = true; }
  }
  if (e.knock > 0) { e.knock -= dt; const f = Math.exp(-2.5 * dt); e.vs *= f; e.vd *= f; }
  else {
    const sp = e.vs * dir;
    e.vs = dir * (sp + clamp(target - sp, -10 * dt, 3.5 * dt));
    const want = clamp((e.laneD - e.d) * 1.2, -1.6, 1.6) * (Math.abs(e.vs) < 3 && e.changing ? 0.6 : 1);
    e.vd += clamp(want - e.vd, -6 * dt, 6 * dt);
    if (Math.abs(e.laneD - e.d) < 0.1) e.changing = false;
    // drift back to a lane after being shoved
    if (Math.abs(e.d - e.laneD) > 2.2) { const ln = dir > 0 ? [1.75, 5.25] : [-1.75, -5.25]; e.laneD = ln.reduce((a, b) => Math.abs(b - e.d) < Math.abs(a - e.d) ? b : a); }
  }
  const tr = trackAt(e.s, tr1);
  e.s += e.vs * dt / Math.max(0.5, 1 + tr.k * e.d); e.d += e.vd * dt;
  wallCheck(e);
  steerAngle(e, dt, dir > 0 ? 0 : Math.PI);
}
function updateCross(e, dt) {
  if (!e.alive) return wreckStep(e, dt);
  if (e.knock > 0) { e.knock -= dt; const f = Math.exp(-2.5 * dt); e.vs *= f; e.vd *= f; }
  else { e.vd += clamp(e.crossDir * 13.5 - e.vd, -8 * dt, 6 * dt); e.vs *= Math.exp(-4 * dt); }
  e.s += e.vs * dt; e.d += e.vd * dt;
  steerAngle(e, dt);
  if (Math.abs(e.d) > 55) removeEnt(e);
}
function updatePed(e, dt) {
  if (e.state === 'flung') {
    e.s += e.vs * dt; e.d += e.vd * dt; e.vs *= Math.exp(-1 * dt);
    e.tumbleA = (e.tumbleA || 0) + e.tumble * dt;
    if (e.y <= 0 && e.vy <= 0) { e.state = 'down'; e.downT = 1.3; e.vs = e.vd = 0; e.tumbleA = Math.PI / 2 * Math.sign(e.tumble || 1); }
    return;
  }
  if (e.state === 'down') {
    e.downT -= dt; if (e.downT <= 0) { e.state = 'walk'; e.tumbleA = 0; e.mode = 'leave'; e.vd = Math.sign(e.d || 1) * 2.4; e.vs = 0; e.solid = true; e.ang = e.vd > 0 ? Math.PI / 2 : -Math.PI / 2; }
    return;
  }
  if (e.state === 'dodge') { e.s += e.vs * dt; e.d += e.vd * dt; if (e.y <= 0 && e.vy <= 0) { e.state = 'walk'; e.vd = e.dvd || 0; e.vs = e.dvs || 0; } return; }
  if (e.state === 'wait') {
    if (player.s > e.s - 75 && player.s < e.s) { e.state = 'walk'; e.vd = -Math.sign(e.d) * R(2.6, 3.6); e.ang = e.vd > 0 ? Math.PI / 2 : -Math.PI / 2; }
    return;
  }
  // walking
  if (e.mode === 'cross') {
    const I = T.inters.find(I => Math.abs(I.s - e.s) < 14);
    if (I && I.light === 'G' && Math.abs(e.vd) < 3) e.vd = Math.sign(e.vd) * 3.2;   // hurry when the light changes
    if (Math.abs(e.d) > 10.3 && Math.sign(e.d) === Math.sign(e.vd)) { e.vd = 0; e.mode = 'side'; e.vs = (Math.random() < 0.5 ? -1 : 1) * 1.2; }
  }
  if ((e.mode === 'jay' || e.mode === 'leave') && Math.abs(e.d) > 10.5 && Math.sign(e.d) === Math.sign(e.vd)) { e.vd = 0; e.mode = 'side'; e.vs = (Math.random() < 0.5 ? -1 : 1) * 1.2; }
  // dodge an incoming car (sometimes)
  if (!e.dodged && Math.abs(e.d) < 9) {
    for (const v of [player, ...ents.filter(o => o.kind === 'rival' && Math.abs(o.s - e.s) < 30)]) {
      const sp = v.vs; if (sp < 8 || !v.alive) continue;
      const ds = e.s - v.s;
      if (ds > 2 && ds < sp * 0.42 && Math.abs(e.d - v.d) < 1.9) {
        e.dodged = true;
        if (Math.random() < e.agil) { e.state = 'dodge'; e.dvd = e.vd; e.dvs = e.vs; e.vy = 4.2; e.vd = (e.d >= v.d ? 1 : -1) * 5.5; e.vs = 0; }
        break;
      }
    }
  }
  e.s += e.vs * dt; e.d += e.vd * dt;
  const sp = Math.hypot(e.vs, e.vd);
  if (sp > 0.2) e.ang = Math.atan2(e.vd, e.vs);
  e.phase += sp * dt * 5.5;
}
function updateProp(e, dt) {
  if (e.knock > 0 && e.inv > 0) {
    e.knock -= dt;
    const f = Math.exp(-(e.y > 0 ? 0.3 : 3) * dt); e.vs *= f; e.vd *= f;
    e.s += e.vs * dt; e.d += e.vd * dt;
    e.tumbleA = (e.tumbleA || 0) + e.tumble * dt; if (e.y <= 0) e.tumble *= Math.exp(-4 * dt);
    if (Math.abs(e.d) > wallAt(e.s) - 0.4) { e.d = Math.sign(e.d) * (wallAt(e.s) - 0.4); e.vd *= -0.3; }
  }
  if (e.zone === 'wrench' || e.zone === 'turbo') e.ang += dt * 2.5;
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt;
    d.vy -= 22 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
    d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
    const gy = trackAt(d.s, tr1).y + 0.12;
    if (d.m.position.y < gy) { d.m.position.y = gy; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
    if (d.life <= 0 || d.s < player.s - 80) { scene.remove(d.m); debris.splice(i, 1); }
  }
}
function nearMisses() {
  if (game.state !== 'race' || !player.alive || player.v < 15) return;
  for (const e of ents) {
    if (e.dead || !e.vehicle || e === player || !e.alive) continue;
    const rel = Math.sign(e.s - player.s);
    if (e.rel && rel !== e.rel && rel !== 0) {
      const gap = Math.abs(e.d - player.d) - e.hd - player.hd;
      if (gap > 0 && gap < 1.15 && game.t - e.lastHit > 1 && game.t - player.lastHit > 0.6) {
        const onc = (e.kind === 'traffic' && e.dir < 0) || e.kind === 'cross';
        const big = e.sub === 'bus';
        const bonus = (onc ? 30 : 18) + (big ? 8 : 0);
        void bonus;
        addScore(onc ? 250 : 120); game.stats.near++;
        msg(onc ? 'CLOSE CALL!' : 'NEAR MISS', onc ? 'gold' : 'good'); SFX.near();
        if (e.kind === 'traffic' && Math.random() < 0.5) SFX.horn();
      }
    }
    e.rel = rel;
  }
}

/* ============================== rendering of entities ============================== */
const _pos = new THREE.Vector3();
function placeEnt(e, dt) {
  const m = e.mesh; if (!m) return;
  const tr = trackAt(e.s, tr1);
  const ground = e.kind === 'prop' || e.kind === 'ped' ? (Math.abs(e.d) > RW && tr.town ? 0.15 : 0) : 0;
  worldPos(e.s, e.d, e.y + ground, m.position);
  const rotY = tr.h - (e === player ? e.yaw : e.ang);
  const pitch = -Math.atan(tr.slope * Math.cos(e === player ? e.yaw : e.ang));
  let roll = 0, px = pitch;
  if (e === player) {
    roll = -e.steer * 0.05 * clamp(e.v / 40, 0, 1) - (e.yaw - e.vh) * 0.15;
    if (e.y > 0.1 && !e.onRamp) px -= clamp(e.vy * 0.025, -0.25, 0.25);
    if (e.onRamp) px -= 0.17;
  } else if (e.onRamp) px -= 0.17;
  if (e.wreck) roll += e.roll;
  if (e.rRoll && !e.wreck) roll += e.rRoll;
  if (e.kind === 'prop') { px += e.tumbleA || 0; }
  if (e.kind === 'ped') {
    px += e.tumbleA || 0;
    const legs = m.userData.legs, sw = e.state === 'walk' ? Math.sin(e.phase) * 0.6 : e.state === 'dodge' ? 0.7 : 0;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
  }
  m.rotation.set(px, rotY, roll, 'YXZ');
  const sh = m.userData.shadow; if (sh) { sh.position.y = 0.04 - e.y; sh.visible = e.y < 6; }
  const bm = m.userData.beam; if (bm) bm.visible = matBeam.opacity > 0 && e.alive && !e.parked && e.y < 0.5 && Math.abs(e.s - player.s) < 260;
  const bk = m.userData.brake; if (bk) bk.visible = e.alive && !!e.braking;
  if (m.userData.pod) m.userData.pod.visible = !(e === player && (settings.cam === 'hood' || settings.cam === 'bumper'));
  const wh = m.userData.wheels;
  if (wh && e.alive) { const sp = (e === player ? e.v : e.vs) * dt / 0.36, st = e === player ? -e.steer * 0.42 : clamp(-e.vd * 0.06, -0.4, 0.4); for (let i = 0; i < 4; i++) { const w = wh[i]; w.rotation.x += w.userData.base ? -sp : sp; if (i < 2) w.rotation.y = w.userData.base + st; } }
}

/* ============================== camera ============================== */
const CAMS = ['chase', 'far', 'hood', 'bumper'], CAM_NAMES = { chase: 'CHASE', far: 'FAR CHASE', hood: 'BONNET', bumper: 'BUMPER' };
const camState = { s: 0, d: 0, y: 3, init: false, look: new THREE.Vector3() };
function cycleCamera() {
  settings.cam = CAMS[(CAMS.indexOf(settings.cam) + 1) % CAMS.length]; store.set('cam', settings.cam);
  camState.init = false; syncToggles();
  if (game.state === 'race' || game.state === 'countdown') msg('CAMERA: ' + CAM_NAMES[settings.cam], 'blue');
}
function updateCamera(dt) {
  const p = player, mode = settings.cam;
  if (game.state === 'menu') {
    // frame the car inside the menu's car window: aim at the car, then shift the view so it lands in the box
    const box = $('carView').getBoundingClientRect(), W = innerWidth, H = innerHeight, a = game.t * 0.3;
    const showBox = !$('menu').classList.contains('hidden') && box.height > 20 && box.bottom > 0 && box.top < H;
    camera.fov = showBox ? 38 : portrait ? 72 : 55;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let D = 12;
    if (showBox) D = Math.max(6.2 * W / box.width / (2 * t * W / H), 3.4 * H / box.height / (2 * t));
    const el = 0.32;
    worldPos(p.s + Math.cos(a) * D * Math.cos(el), p.d + Math.sin(a) * D * Math.cos(el), 0.7 + D * Math.sin(el), camera.position);
    worldPos(p.s, p.d, 0.7, camState.look); camera.lookAt(camState.look);
    camera.near = 0.3;
    if (showBox) camera.setViewOffset(W, H, W / 2 - (box.left + box.width / 2), H / 2 - (box.top + box.height / 2), W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camState.init = false; return;
  }
  if (camera.view && camera.view.enabled) camera.clearViewOffset();
  let fov;
  if (mode === 'hood' || mode === 'bumper') {
    // mounted on the car: follows the car's own heading, no lag
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), hood = mode === 'hood';
    const fwd = hood ? 0.5 : 2.4, h = (hood ? 1.3 : 0.62) + p.y;
    worldPos(p.s + fwd * cy, p.d + fwd * sy, h, camera.position);
    worldPos(p.s + (fwd + 14) * cy, p.d + (fwd + 14) * sy, h - (hood ? (portrait ? 0.05 : 0.35) : 0.1) - (p.y > 0.1 && !p.onRamp ? p.vy * 0.06 : 0), camState.look);
    if (game.shake > 0) { const sk = game.shake * 0.12; camera.position.x += R(-sk, sk); camera.position.y += R(-sk, sk); camera.position.z += R(-sk, sk); game.shake = Math.max(0, game.shake - dt * 2.2); }
    camera.lookAt(camState.look);
    camera.rotateZ(clamp(-(p.yaw - p.vh) * 0.25 + p.steer * 0.02, -0.12, 0.12));   // body roll
    camera.near = 0.12;
    fov = (portrait ? 82 : hood ? 66 : 72) + clamp(p.v / 46, 0, 1.3) * 8 + (p.turbo > 0 ? 8 : 0);
    camState.init = false;
  } else {
    const far = mode === 'far';
    const dist = (portrait ? 10.5 : 8.6) * (far ? 1.55 : 1), hgt = (portrait ? 4.7 : 3.4) * (far ? 1.65 : 1);
    const yawB = clamp(p.yaw, -0.9, 0.9) * 0.55;
    const ts = p.s - dist * Math.cos(yawB), td = p.d - dist * Math.sin(yawB);
    const k = camState.init ? 1 - Math.exp(-8 * dt) : 1;
    camState.s = ts; camState.d = lerp(camState.d, td, k);
    camState.y = lerp(camState.y, hgt + p.y * 0.7, camState.init ? 1 - Math.exp(-5 * dt) : 1);
    camState.init = true;
    worldPos(camState.s, camState.d, camState.y, camera.position);
    const gy = trackAt(camState.s, tr1).y + 1.2; if (camera.position.y < gy) camera.position.y = gy;
    worldPos(p.s + (far ? 10 : 6) * Math.cos(yawB * 0.5), p.d + (far ? 10 : 6) * Math.sin(yawB * 0.5), 1.1 + p.y, camState.look);
    if (game.shake > 0) {
      const sk = game.shake * 0.35;
      camera.position.x += R(-sk, sk); camera.position.y += R(-sk, sk) * 0.6; camera.position.z += R(-sk, sk);
      game.shake = Math.max(0, game.shake - dt * 2.2);
    }
    camera.lookAt(camState.look);
    camera.near = 0.3;
    fov = (portrait ? 74 : 60) * (far ? 0.9 : 1) + clamp(p.v / 46, 0, 1.3) * 7 + (p.turbo > 0 ? 7 : 0);
  }
  camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix();
}

/* ============================== effects per frame ============================== */
let fxAcc = 0;
function vehicleFx(dt) {
  fxAcc += dt; if (fxAcc < 1 / 30) return; const step = fxAcc; fxAcc = 0;
  for (const e of ents) {
    if (e.dead || !e.vehicle || Math.abs(e.s - player.s) > 250) continue;
    const frac = e.hp / e.maxhp;
    const front = e.kind === 'cross' ? 0 : Math.cos(e.ang) * e.hs * 0.6, side = e.kind === 'cross' ? Math.sign(e.vd) * e.hd * 0.6 : 0;
    if (e.wreck) {
      if (e.fire > 0) { e.fire -= step; worldPos(e.s, e.d, 0.9 + e.y, _w); for (let i = 0; i < 3; i++) emit(FX, _w.x + R(-0.8, 0.8), _w.y, _w.z + R(-0.8, 0.8), R(-0.5, 0.5), R(2, 4), R(-0.5, 0.5), R(0.4, 0.8), 1.4, 0.6, -1, COL.fire0, COL.fire1, 0.9, 1); }
      if (Math.random() < 0.6) puff(SMK, e.s, e.d, 1.5 + e.y, 1, COL.smokeB0, COL.smokeB1, 2.2, 3, 2.5, 0.6);
      continue;
    }
    if (e.burnT > 0) {   // flames licking over the bonnet + black smoke
      e.burnT -= step; worldPos(e.s + (e.kind === 'cross' ? 0 : Math.cos(e.ang) * e.hs * 0.5), e.d, 1.0 + e.y, _w);
      for (let i = 0; i < 4; i++) emit(FX, _w.x + R(-0.7, 0.7), _w.y + R(-0.2, 0.2), _w.z + R(-0.7, 0.7), R(-0.4, 0.4), R(2.5, 4.5), R(-0.4, 0.4), R(0.3, 0.5), 0.9, 0.35, -1, COL.fire0, COL.fire1, 0.6, 1);
      if (Math.random() < 0.7) puff(SMK, e.s, e.d, 1.6 + e.y, 1, COL.smokeB0, COL.smokeB1, 1.6, 1.8, 2.2, 0.7, 0.6);
    }
    if (frac < 0.6 && Math.random() < (0.9 - frac)) puff(SMK, e.s + front, e.d + side, 1.0 + e.y, 1, frac < 0.3 ? COL.smokeB0 : COL.smokeG0, frac < 0.3 ? COL.smokeB1 : COL.smokeG1, 1.0, 1.4, 1.5, 0.55, 0.6);
    if (frac < 0.3 && Math.random() < 0.5) { worldPos(e.s + front, e.d + side, 1.0 + e.y, _w); emit(FX, _w.x, _w.y, _w.z, R(-0.4, 0.4), R(1, 2.5), R(-0.4, 0.4), 0.4, 0.8, 0.3, -1, COL.fire0, COL.fire1, 0.9, 1); }
  }
  const p = player;
  if (!p.alive) return;
  const back = -1.9;
  if (p.drift > 0.12 && p.y < 0.1) for (const sd of [-0.8, 0.8]) puff(SMK, p.s + back, p.d + sd, 0.25, 1, COL.tyre0, COL.tyre1, 1.0, 1.1, 0.6, clamp(p.drift * 1.6, 0.2, 0.7), 0.8);
  if (Math.abs(p.d) > RW + 0.2 && p.v > 8 && !trackAt(p.s, tr1).town && p.y < 0.1) puff(SMK, p.s + back, p.d, 0.3, 2, COL.dust0, COL.dust1, 1.4, 1.2, 1, 0.55, 1.2);
  for (const e of ents) { if (e === p) continue; if (!e.dead && e.alive && e.boostT > 0 && Math.abs(e.s - p.s) < 150) nosTrail(e, e.ang, false, step, true); else if (e.trail) e.trail = null; }
  if (p.turbo > 0 || p.jumpBoost > 0 && p.y < 0.2 && !(p.M && p.M.electric)) nosTrail(p, p.yaw, p.turbo > 0, step, p.turbo > 0); else p.trail = null;
}

// NOS: two fat blue contrails from the twin exhausts. Particles are laid along the path travelled
// since the last tick, so the trails stay continuous at 200 km/h, and they hang in the air behind the car.
const _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3(), NOS0 = [0.15, 0.45, 1], NOS1 = [0.02, 0.12, 0.85], FLAME0 = [0.45, 0.7, 1];
// NOS flames scorch whatever sits behind the exhausts: cars catch fire and can blow up, red barrels go off.
function nosBurn(src, dt) {
  const mine = src === player, reach = 9;
  for (const e of ents) {
    if (e === src || e.dead) continue;
    const gap = (src.s - src.hs) - (e.s + (e.hs || 0.5));        // distance from the exhausts to the front of the target
    if (gap < -1.2 || gap > reach || Math.abs(e.d - src.d) > (e.hd || 0.5) + 0.9 || Math.abs(e.y - src.y) > 2) continue;
    const f = 1 - Math.max(0, gap) / reach;
    if (e.vehicle && e.alive) {
      damage(e, (18 + 46 * f) * dt, mine ? player : null);
      if (!e.burnT || e.burnT <= 0) {
        if (mine) msg(e.kind === 'police' ? 'COPS ON FIRE!' : e.kind === 'rival' ? e.name.toUpperCase() + ' TOASTED!' : 'SCORCHED!', 'gold');
        else if (e === player) msg('NOS BURN!', 'hot');
      }
      e.burnT = 0.5;
    } else if (e.kind === 'prop' && e.explosive && e.alive && f > 0.3) { e.lastByPlayer = mine ? game.t : -99; e.alive = false; explodeBarrel(e); }
  }
}
function nosTrail(e, yaw, big, step = 1 / 30, flame = false) {
  const c = Math.cos(yaw), sn = Math.sin(yaw), z = -2.15, now = [];
  for (const x of [-0.5, 0.5]) worldPos(e.s + z * c + x * sn, e.d + z * sn - x * c, 0.3 + e.y, _t0), now.push(_t0.clone());
  const prev = e.trail; e.trail = now;
  if (!prev) return;
  const n = big ? 9 : 5;
  for (let k = 0; k < 2; k++) {
    if (prev[k].distanceToSquared(now[k]) > 64) continue;
    if (flame) {   // the flame jet itself: shoots ~3-4 m out of each exhaust
      _v1.subVectors(now[k], prev[k]); const sp = _v1.length() / step; _v1.normalize();
      for (let i = 0; i < 2; i++) {
        const j = R(18, 26), u = R(0, 1);
        emit(FX, now[k].x - _v1.x * u * 0.3, now[k].y, now[k].z - _v1.z * u * 0.3, _v1.x * (sp - j) + R(-0.6, 0.6), R(-0.2, 0.5), _v1.z * (sp - j) + R(-0.6, 0.6),
          R(0.08, 0.13), big ? 0.5 : 0.4, big ? 0.95 : 0.75, 0, [0.85, 0.55, 0.22], [0.7, 0.18, 0.02], 0.4, 0);
      }
    }
    for (let i = 0; i < n; i++) {
      _t1.copy(prev[k]).lerp(now[k], i / n);
      emit(FX, _t1.x, _t1.y, _t1.z, R(-0.12, 0.12), R(0.05, 0.3), R(-0.12, 0.12), R(0.05, 0.07), big ? 0.45 : 0.35, big ? 0.6 : 0.5, -0.3, NOS0, NOS1, 0.6, 0.4);
      if (i % 3 === 0) emit(FX, _t1.x, _t1.y, _t1.z, 0, R(0, 0.2), 0, 0.05, 0.3, 0.15, 0, COL.blue0, NOS0, 0.7, 0);   // hot core at the nozzle
    }
  }
}

/* ============================== HUD ============================== */
const hud = { nos: $('nosIcons'), padN: $('padN'), padNc: $('padNc'), lastNos: -1, wanted: $('wanted'), stars: $('stars'), bustI: $('bustI'), gear: $('gear'), padB: $('padB'), seg: [], lit: -1, pos: $('posN'), time: $('time'), score: $('score'), spd: $('spdN'), hp: $('hpBar'), tb: $('tbBar'), tbWrap: $('tbWrap'), bar: $('progBar'), dots: $('progDots'), padL: $('padL'), padR: $('padR'), acc: 0 };
function buildDots() {
  hud.dots.innerHTML = '';
  for (const e of ents) if (e.kind === 'rival' || e === player) {
    const i = document.createElement('i'); i.style.background = e === player ? PLAYER_COLORS[settings.color].css : e.colorCss; if (e === player) i.className = 'me';
    hud.dots.appendChild(i); e.dot = i;
  }
}
function computePlace() {
  if (player.finished) return game.place;
  let ahead = game.finishOrder.length;
  for (const e of ents) if (e.kind === 'rival' && !e.finished && e.alive && e.s > player.s) ahead++;
  return ahead + 1;
}
(function buildTach() {
  const svg = $('tachSvg'), N = 26, cx = 66, cy = 64, r0 = 47, r1 = 61, A0 = 215, A1 = -35, NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < N; i++) {
    const a0 = (A0 + (A1 - A0) * i / N) * Math.PI / 180, a1 = (A0 + (A1 - A0) * (i + 0.78) / N) * Math.PI / 180;
    const pt = (r, a) => (cx + Math.cos(a) * r).toFixed(1) + ',' + (cy - Math.sin(a) * r).toFixed(1);
    const g = document.createElementNS(NS, 'polygon'); g.setAttribute('points', [pt(r0, a0), pt(r1, a0), pt(r1, a1), pt(r0, a1)].join(' '));
    g.setAttribute('class', 'seg' + (i >= N - 4 ? ' red' : i >= N - 9 ? ' mid' : '')); svg.appendChild(g); hud.seg.push(g);
  }
})();
function updateHud(dt, inp) {
  hud.padL.classList.toggle('on', inp.L); hud.padR.classList.toggle('on', inp.R); hud.padB.classList.toggle('on', inp.B); hud.padN.classList.toggle('on', inp.N);
  const lit = Math.round(clamp((player.rpm - 800) / 6800, 0, 1) * hud.seg.length);
  if (lit !== hud.lit) { for (let i = 0; i < hud.seg.length; i++) hud.seg[i].classList.toggle('on', i < lit); hud.lit = lit; }
  hud.acc += dt; if (hud.acc < 0.08) return; hud.acc = 0;
  if (!player.finished && player.alive) game.place = computePlace();
  hud.pos.textContent = game.place;
  hud.time.textContent = fmtTime(game.raceT);
  hud.score.textContent = game.score.toLocaleString('en-US');
  hud.wanted.classList.toggle('hidden', police.heat <= 0 && police.bust <= 0);
  hud.stars.textContent = '★'.repeat(police.heat) + '☆'.repeat(3 - police.heat);
  hud.bustI.style.width = clamp(police.bust / 3.2, 0, 1) * 100 + '%';
  hud.gear.textContent = player.M && player.M.electric ? 'E' : player.shiftT > 0 ? 'N' : player.gear || 'N';
  hud.spd.textContent = Math.round(player.v * 3.6);
  const hpF = Math.max(0, player.hp) / 100;
  hud.hp.style.width = ((1 - hpF) * 100) + '%';    // DAMAGE fills up as the car gets hurt
  hud.hp.style.background = hpF > 0.6 ? 'linear-gradient(180deg,#a6ff8a,#20c040)' : hpF > 0.3 ? 'linear-gradient(180deg,#fff3a0,#ffb000)' : 'linear-gradient(180deg,#ffb0a0,#e01800)';
  const lock = 0;
  const nk = player.nos + (player.turbo > 0 ? 100 : 0) + (lock > 0 ? 1000 * lock : 0);
  if (nk !== hud.lastNos) {
    hud.lastNos = nk; const n = player.nos;
    hud.nos.innerHTML = player.M && player.M.electric ? '<span class="none">ELECTRIC</span>' : n === 0 ? '<span class="none">EMPTY</span>' : n <= 6 ? '<i></i>'.repeat(n) : '<i></i><b>×' + n + '</b>';
    hud.padNc.textContent = lock > 0 ? lock + 'S' : '×' + n; hud.padN.classList.toggle('empty', n === 0 || lock > 0);
    hud.nos.classList.toggle('locked', lock > 0);
  }
  hud.nos.classList.toggle('burn', player.turbo > 0); hud.padN.classList.toggle('burn', player.turbo > 0);
  hud.bar.style.width = clamp(player.s / T.len, 0, 1) * 100 + '%';
  for (const e of ents) if (e.dot) { e.dot.style.left = clamp((e.s - 20) / (T.len - 20), 0, 1) * 100 + '%'; e.dot.classList.toggle('dead', !e.alive); }
}

/* ============================== game flow ============================== */
function clearEntities() {
  for (const e of ents) freeMesh(e);
  ents = []; for (const d of debris) scene.remove(d.m); debris.length = 0;
  clearPS(FX); clearPS(SMK);
}
function loadStage(idx, forMenu = false) {
  game.stageIdx = idx;
  const st = STAGES[idx];
  clearEntities();
  buildTrack(st); buildTrackMeshes(st); setSky(SKIES[st.sky]);
  spawnRallyCars(settings.color);
  for (const I of T.inters) { I.light = ''; I.cyc = -1; }
  game.t = 0; game.raceT = 0; game.score = 0; game.place = 6; game.finishOrder = []; game.shake = 0;
  game.stats = { near: 0, rivals: 0, cars: 0, peds: 0, cops: 0, viol: 0, escapes: 0 }; resetPolice(); game.prevS = 0;
  camState.init = false;
  // pre-populate traffic so the road is alive from the start
  for (let i = 0; i < 30; i++) { spawnTraffic(1, R(200, 560)); spawnTraffic(-1, R(90, 560)); }
  if (!forMenu) {
    buildDots();
    game.state = 'countdown'; game.count = 3.6; game.lastBeep = 4;
    show('hud'); $('pauseBtn').classList.remove('hidden'); $('camBtn').classList.remove('hidden'); hide('menu'); hide('result'); hide('pause');
    for (const id of ['padL', 'padR', 'padB', 'padN']) $(id).classList.toggle('hidden', !isTouch || (id === 'padN' && !!player.M.electric)); $('keysHint').classList.toggle('hidden', isTouch);
    player.gear = 1; player.rpm = 900; player.shiftT = 0; hud.lastNos = -1; game.nosHeld = false;
    try { history.pushState({ rh: 1 }, ''); } catch {}
    requestWake();
  } else game.state = 'menu';
}
const show = id => $(id).classList.remove('hidden'), hide = id => $(id).classList.add('hidden');
function pauseGame() {
  if (game.state !== 'race' && game.state !== 'countdown') return;
  game.prevState = game.state; game.state = 'paused'; show('pause'); syncToggles();
  audioMute();
}
function resumeGame() { if (game.state !== 'paused') return; game.state = game.prevState; hide('pause'); audioInit(); last = performance.now(); }
function toMenu() {
  hide('pause'); hide('result'); hide('entry'); hide('hud'); hide('count'); hide('tip'); $('pauseBtn').classList.add('hidden'); $('camBtn').classList.add('hidden');
  loadStage(game.stageIdx, true); renderMenu(); show('menu'); releaseWake();
}
function finishRace(reason) {
  const wrecked = !!reason;
  const idx = game.stageIdx, st = STAGES[idx];
  const place = wrecked ? 0 : game.place;
  hide('hud'); $('pauseBtn').classList.add('hidden'); $('camBtn').classList.add('hidden'); hide('tip');
  let bonus = 0;
  if (!wrecked) { bonus = [0, 3000, 2000, 1000][place] || 0; addScore(bonus + Math.round(player.hp * 10)); }
  const title = $('resTitle'), sub = $('resSub');
  if (wrecked) { title.textContent = reason === 'busted' ? 'BUSTED!' : 'TOTALLED!'; title.className = 'res-title ' + (reason === 'busted' ? 'chrome' : 'hotc'); sub.textContent = st.name.toUpperCase() + ' - GAME OVER'; }
  else { title.textContent = place === 1 ? 'YOU WIN!' : ord(place).toUpperCase() + (place <= 3 ? ' PLACE!' : ' PLACE'); title.className = 'res-title ' + (place <= 3 ? 'gold' : 'chrome'); sub.textContent = st.name.toUpperCase() + ' - ' + fmtTime(game.finishTime); }
  const rows = [['Time', wrecked ? '—' : fmtTime(game.finishTime)], ['Score', game.score.toLocaleString('en-US')], ['Near misses', game.stats.near], ['Rivals taken out', game.stats.rivals], ['Cars wrecked', game.stats.cars], ['Pedestrians hit', game.stats.peds], ['Police takedowns', game.stats.cops], ['Police escapes', game.stats.escapes], ['Car condition', Math.max(0, Math.round(player.hp)) + '%']];
  if (!wrecked && bonus) rows.splice(2, 0, ['Podium bonus', '+' + bonus]);
  const best = progress.best[idx] || {};
  let newBest = false;
  if (!wrecked) {
    if (!best.place || place < best.place || (place === best.place && game.finishTime < best.time)) { best.place = place; best.time = game.finishTime; newBest = true; }
    if (place <= 3 && progress.unlocked < idx + 2) { progress.unlocked = Math.min(STAGES.length, idx + 2); if (idx + 1 < STAGES.length) rows.push(['Unlocked', STAGES[idx + 1].name]); }
  }
  if (!best.score || game.score > best.score) { best.score = game.score; rows.push(['Best score', 'NEW!']); }
  progress.best[idx] = best; store.set('progress', progress);
  if (newBest && !wrecked) sub.textContent += ' - NEW RECORD!';
  $('resStats').innerHTML = rows.map(([a, b]) => `<span>${String(a).toUpperCase()}</span><b>${String(b).toUpperCase()}</b>`).join('');
  const canNext = idx + 1 < STAGES.length && progress.unlocked > idx + 1;
  $('nextBtn').classList.toggle('hidden', !canNext);
  releaseWake();
  const tag = (reason === 'busted' ? 'BUSTED' : reason ? 'DNF' : ord(place).toUpperCase()) + (Object.values(settings.road).every(Boolean) ? '' : '*');
  const hl = hsList(idx), rank = hl.filter(e => e.s >= game.score).length;
  if (rank < 5 && game.score > 0) openEntry(idx, rank, game.score, tag); else showResult(idx, -1);
}
function renderMenu() {
  renderModel();
  const el = $('stages'); el.innerHTML = '';
  STAGES.forEach((st, i) => {
    const b = document.createElement('button'), best = progress.best[i];
    const locked = i + 1 > progress.unlocked;
    b.className = 'stage' + (locked ? ' locked' : '');
    b.innerHTML = `<div class="info"><div class="nm">${st.name}</div></div>` +
      `<div class="best">${locked ? 'LOCKED<br>TOP 3 TO<br>UNLOCK' : (best && best.place ? 'BEST <b>' + ord(best.place).toUpperCase() + '</b><br>' + fmtTime(best.time) + '<br>' : '') + 'HI <b>' + hsList(i)[0].s.toLocaleString('en-US') + '</b> ' + hsList(i)[0].n}</div>`;
    b.onclick = () => { audioInit(); loadStage(i); };
    el.appendChild(b);
  });
  const sw = $('swatches'); sw.innerHTML = '';
  PLAYER_COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'sw' + (i === settings.color ? ' sel' : ''); b.style.background = c.css; b.setAttribute('aria-label', 'Car colour ' + (i + 1));
    b.onclick = () => { settings.color = i; store.set('color', i); renderMenu(); swapPlayerColor(); };
    sw.appendChild(b);
  });
  syncToggles();
}
function setModel(k) {
  settings.model = (k + CAR_MODELS.length) % CAR_MODELS.length; store.set('model', settings.model);
  swapPlayerColor(); renderModel(); sfxTone(520 + settings.model * 60, 0.06, 'square', 0.06);
}
function renderModel() {
  const M = CAR_MODELS[settings.model];
  $('carName').textContent = M.name; $('carCls').textContent = M.cls + '  ' + (settings.model + 1) + '/' + CAR_MODELS.length;
  $('carStats').innerHTML = ['SPEED', 'ACCEL', 'HANDLING', 'ARMOUR'].map((n, i) => `<span>${n}</span><i>${'<b class="on"></b>'.repeat(M.bars[i])}${'<b></b>'.repeat(5 - M.bars[i])}</i>`).join('');
}
(function carSwipe() {
  const el = $('carView'); let x0 = null, y0 = 0, id = null;
  el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; id = e.pointerId; });
  el.addEventListener('pointerup', e => {
    if (x0 === null || e.pointerId !== id) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.2) { audioInit(); setModel(settings.model + (dx < 0 ? 1 : -1)); }
  });
  el.addEventListener('pointercancel', () => { x0 = null; });
  $('carPrev').onclick = () => { audioInit(); setModel(settings.model - 1); };
  $('carNext').onclick = () => { audioInit(); setModel(settings.model + 1); };
})();
function swapPlayerColor() {
  if (!player) return;
  const pc = PLAYER_COLORS[settings.color]; scene.remove(player.mesh); player.mesh = rallyMesh(settings.model, pc.col, pc.acc, 1); player.mesh.add(headSpot, headSpot.target); scene.add(player.mesh);
  const PM = CAR_MODELS[settings.model], D = player.mesh.userData.dims; Object.assign(player, { h: PM.id === 'duna' ? 2.0 : 1.5, M: PM.st, hs: D.L / 2 + 0.05, hd: D.hw + 0.04, mass: PM.st.mass, inv: 1 / PM.st.mass });
}
const ROAD_OPTS = [['traffic', 'TRAFFIC'], ['police', 'POLICE'], ['obstacles', 'OBSTACLES'], ['peds', 'PEOPLE']];
const OPT = {
  cam: { label: () => 'CAMERA: ' + CAM_NAMES[settings.cam], click: () => cycleCamera() },
  gfx: { label: () => 'EFFECTS: ' + (settings.gfx === 'low' ? 'FAST' : 'HIGH'), off: () => settings.gfx === 'low', click: () => { settings.gfx = settings.gfx === 'low' ? 'high' : 'low'; store.set('gfx', settings.gfx); applyQuality(settings.gfx === 'low' ? 0 : 3); } },
  sound: { label: () => 'SOUND: ' + (settings.sound ? 'ON' : 'OFF'), off: () => !settings.sound, click: () => setSound(!settings.sound) },
  vibe: { label: () => 'RUMBLE: ' + (settings.vibe ? 'ON' : 'OFF'), off: () => !settings.vibe, touchOnly: true, click: () => { settings.vibe = !settings.vibe; store.set('vibe', settings.vibe); vibrate(20); } },
};
function syncToggles() {
  document.querySelectorAll('[data-opt]').forEach(b => { const o = OPT[b.dataset.opt]; b.textContent = o.label(); b.classList.toggle('off', !!(o.off && o.off())); b.classList.toggle('hidden', !!(o.touchOnly && !isTouch)); });
}
for (const [k, name] of ROAD_OPTS) OPT['road_' + k] = { label: () => name + ': ' + (settings.road[k] ? 'ON' : 'OFF'), off: () => !settings.road[k],
  click: () => { settings.road[k] = !settings.road[k]; store.set('road', settings.road); loadStage(game.stageIdx, true); } };
document.querySelectorAll('[data-opt]').forEach(b => { b.onclick = () => { audioInit(); OPT[b.dataset.opt].click(); syncToggles(); }; });
/* ---------- high scores (top 5 per stage, 3-letter initials, arcade style) ---------- */
const HS_SEED = [['PAO', 9000], ['SEG', 7000], ['NAM', 5000], ['TTO', 3000], ['ACE', 1500]];
const HS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function hsList(i) {
  const all = store.get('hiscores', {});
  return all[i] || HS_SEED.map(([n, sc]) => ({ n, s: Math.round(sc * (1 + i * 0.25) / 10) * 10, r: 'CPU' }));
}
function hsSave(i, list) { const all = store.get('hiscores', {}); all[i] = list; store.set('hiscores', all); }
function hsRows(list, hi) {
  return list.map((e, k) => `<span class="${k === hi ? 'me' : ''}">${ord(k + 1).toUpperCase()}</span><span class="${k === hi ? 'me' : ''}">${e.n}</span><span class="${k === hi ? 'me' : ''}">${e.r}</span><b class="${k === hi ? 'me' : ''}">${e.s.toLocaleString('en-US')}</b>`).join('');
}
const entry = { rank: -1, cur: 0, ch: [0, 0, 0], idx: 0, score: 0, tag: '' };
function openEntry(idx, rank, score, tag) {
  Object.assign(entry, { idx, rank, score, tag, cur: 0 });
  const last = String(store.get('initials', 'AAA'));
  entry.ch = [0, 1, 2].map(k => Math.max(0, HS_CHARS.indexOf(last[k] || 'A')));
  $('entrySub').textContent = STAGES[idx].name.toUpperCase() + ' - ' + score.toLocaleString('en-US') + ' PTS - ' + ord(rank + 1).toUpperCase() + ' PLACE';
  renderEntry(); show('entry'); game.state = 'entry'; SFX.pickup();
}
function renderEntry() {
  document.querySelectorAll('#slots .slot').forEach((el, k) => { el.querySelector('.ch').textContent = HS_CHARS[entry.ch[k]]; el.classList.toggle('cur', k === entry.cur); });
}
function entryStep(k, dir) { entry.cur = k; entry.ch[k] = (entry.ch[k] + dir + HS_CHARS.length) % HS_CHARS.length; renderEntry(); sfxTone(dir > 0 ? 660 : 520, 0.05, 'square', 0.06); }
function entryOk() {
  if (game.state !== 'entry') return;
  const name = entry.ch.map(c => HS_CHARS[c]).join('');
  store.set('initials', name);
  const list = hsList(entry.idx); list.splice(entry.rank, 0, { n: name, s: entry.score, r: entry.tag }); list.length = 5; hsSave(entry.idx, list);
  hide('entry'); showResult(entry.idx, entry.rank); sfxTone(880, 0.3, 'square', 0.1);
}
function entryKey(e) {
  const k = e.key;
  if (/^[a-zA-Z0-9]$/.test(k)) { entry.ch[entry.cur] = HS_CHARS.indexOf(k.toUpperCase()); entry.cur = Math.min(2, entry.cur + 1); renderEntry(); }
  else if (k === 'ArrowUp') entryStep(entry.cur, 1);
  else if (k === 'ArrowDown') entryStep(entry.cur, -1);
  else if (k === 'ArrowLeft' || k === 'Backspace') { entry.cur = Math.max(0, entry.cur - 1); renderEntry(); }
  else if (k === 'ArrowRight') { entry.cur = Math.min(2, entry.cur + 1); renderEntry(); }
  else if (k === 'Enter') entryOk();
  else return;
  e.preventDefault();
}
document.querySelectorAll('#slots .slot').forEach((el, k) => {
  el.querySelector('.up').onclick = () => entryStep(k, 1);
  el.querySelector('.dn').onclick = () => entryStep(k, -1);
  el.querySelector('.ch').onclick = () => { entry.cur = k; renderEntry(); };
});
$('entryOk').onclick = entryOk;
function showResult(idx, hi) {
  $('resHSt').textContent = 'HIGH SCORES - ' + STAGES[idx].name.toUpperCase();
  $('resHS').innerHTML = hsRows(hsList(idx), hi);
  show('result'); game.state = 'result';
}
function showScores() {
  $('scoresList').innerHTML = STAGES.map((st, i) => `<div class="sect pix">STAGE ${i + 1} - ${st.name.toUpperCase()}</div><div class="hs">${hsRows(hsList(i), -1)}</div>`).join('');
  show('scores');
}
$('scoresBtn').onclick = showScores;
$('scoresBack').onclick = () => hide('scores');
$('howBtn').onclick = () => $('howto').classList.toggle('hidden');
$('camBtn').onclick = () => cycleCamera();
$('pauseBtn').onclick = () => game.state === 'paused' ? resumeGame() : pauseGame();
$('resumeBtn').onclick = resumeGame;
$('restartBtn').onclick = () => { hide('pause'); loadStage(game.stageIdx); };
$('quitBtn').onclick = toMenu;
$('retryBtn').onclick = () => loadStage(game.stageIdx);
$('nextBtn').onclick = () => loadStage(game.stageIdx + 1);
$('menuBtn').onclick = toMenu;
addEventListener('popstate', () => { if (game.state === 'race' || game.state === 'countdown') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else if (game.state === 'race') requestWake(); });

let wakeLock = null;
async function requestWake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseWake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

/* ============================== main loop ============================== */
/* ============================== graphics quality ============================== */
// 3 = bloom + shadows at full resolution, 2 = same at lower resolution, 1 = shadows only, 0 = plain.
let composer = null;
const Q = { level: 3, lock: location.hash === '#hq', n: 0, sum: 0 };
function makeComposer() {
  try {
    const gl = renderer.getContext(), fl = gl.getExtension('EXT_color_buffer_float'), hf = gl.getExtension('EXT_color_buffer_half_float');
    if (!fl && !hf) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: fl ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.5, 1.6));
    composer.addPass(new OutputPass());
  } catch { composer = null; }
}
function applyQuality(level) {
  Q.level = level; Q.n = 0; Q.sum = 0;
  sun.castShadow = level >= 1; matShadow.opacity = level >= 1 ? 0.45 : 1; matCar.clearcoat = level >= 2 ? 1 : 0;
  pixelRatio = Math.min(window.devicePixelRatio || 1, level === 3 ? PR_MAX : level === 0 ? 1 : 1.25);
  renderer.setPixelRatio(pixelRatio);
  if (level >= 2 && !composer) makeComposer();
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  portrait = h > w * 1.05;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); }
  const sc = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  FX.mat.uniforms.scale.value = SMK.mat.uniforms.scale.value = sc;
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));

const countEl = $('count'), countN = $('countN');
let last = performance.now(), perf = { n: 0, sum: 0, done: false };
function step(dt, inp) {
  const st = game.state;
  if (st === 'countdown') {
    game.count -= dt;
    const n = Math.ceil(game.count - 0.6);
    if (n !== game.lastBeep) {
      game.lastBeep = n;
      if (n <= 3) countEl.classList.remove('hidden');
      if (n >= 1 && n <= 3) { countN.textContent = n; countN.className = 'gold'; SFX.beep(false); }
      else if (n <= 0) { countN.textContent = 'GO!'; countN.className = 'gold greenc'; countEl.classList.remove('hidden'); SFX.beep(true); game.state = 'race'; setTimeout(() => countEl.classList.add('hidden'), 700); }
    }
  }
  if (inp.nos && !game.nosHeld) useNos(); game.nosHeld = inp.nos;
  if (game.state === 'race') { game.raceT += dt; if (game.raceT > 4 && game.raceT - dt <= 4) hide('tip'); }
  game.t += dt;

  const subs = Math.min(4, Math.ceil(dt / (1 / 110)));
  const h = dt / subs;
  for (let k = 0; k < subs; k++) {
    if (player.alive) updatePlayer(player, h, inp);
    else { player.vs *= Math.exp(-2 * h); player.vd *= Math.exp(-2 * h); player.yaw += player.spin * h; player.spin *= Math.exp(-1.2 * h); player.roll = lerp(player.roll, player.rollT ?? 0, 1 - Math.exp(-3 * h)); }
    for (const e of ents) {
      if (e.dead || e === player) continue;
      if (e.kind === 'rival') updateRival(e, h);
      else if (e.kind === 'police') updatePolice(e, h);
      else if (e.kind === 'traffic') updateTraffic(e, h);
      else if (e.kind === 'cross') updateCross(e, h);
      else if (e.kind === 'ped') updatePed(e, h);
      else if (e.kind === 'prop') updateProp(e, h);
      if (e.vehicle || e.kind === 'ped' || (e.kind === 'prop' && e.inv > 0)) { if (e.vehicle && e.alive && (e.kind === 'rival' || e.kind === 'police')) zonesRival(e); verticalStep(e, h); }
    }
    if (player.alive) { zones(player); }
    integratePlayer(player, h);
    verticalStep(player, h);
    collisions();
    for (const e of ents) if (!e.dead && e.vehicle && e !== player && Math.abs(e.s - player.s) < 300) pokePoles(e);
    if (player.alive) { pokePoles(player); }
    syncPlayerFromVel(player);
  }
  nearMisses();
  updateWorld(dt);
  updatePoliceWorld(dt); game.prevS = player.s;
  updateFalls(dt);
  if (game.state === 'race' || game.state === 'finished') { if (player.alive && player.turbo > 0) nosBurn(player, dt); for (const e of ents) if (!e.dead && e.alive && e.boostT > 0) nosBurn(e, dt); }
  // finish / despawn
  if (game.state === 'race' && player.s >= T.len) {
    game.place = computePlace(); player.finished = true; game.finishTime = game.raceT; game.state = 'finished'; game.endT = 2.4;
    msg(game.place === 1 ? 'WINNER!' : 'FINISHED ' + ord(game.place).toUpperCase(), 'gold'); SFX.pickup();
  }
  if (game.state === 'finished' || game.state === 'wrecked' || game.state === 'busted') { game.endT -= dt; if (game.endT <= 0) finishRace(game.state === 'finished' ? null : game.state); }
  for (const e of ents) {
    if (e.dead || e.kind === 'rival' || e === player) continue;
    const back = e.kind === 'police' && !e.giveUp && e.alive ? 330 : 70;
    if (e.s < player.s - back || e.s > player.s + 600) removeEnt(e);
  }
  if (ents.length > 60 || ents.some(e => e.dead)) ents = ents.filter(e => !e.dead);
}
function zonesRival(e) {
  for (const z of ents) {
    if (z.dead || !z.zone) continue;
    if (Math.abs(z.s - e.s) > z.hs + 2) continue;
    zonesOne(e, z);
  }
}
function zonesOne(e, z) {
  if (!zoneReach(e, z)) return;
  if (Math.abs(z.d - e.d) > z.hd + (z.zone === 'ramp' ? TRACK : e.hd)) return;
  if (z.zone === 'ramp') rampTouch(e, z);
  else if (z.zone === 'oil' && e.kind === 'rival' && !e.oiled) { e.oiled = true; e.spin += R(-2, 2); e.knock = 0.8; }
  else if ((z.zone === 'wrench' || z.zone === 'turbo') && (e.kind === 'rival' || e.kind === 'police') && game.state === 'race' && Math.abs((e.rowS ?? -99) - z.s) > 2) {
    e.rowS = z.s;
    if (z.zone === 'wrench') e.hp = Math.min(e.maxhp, e.hp + 30); else e.nos = (e.nos || 0) + 1;
    removeEnt(z);
  }
}
// a power-up in lane L a little way ahead (rivals steer for them)
function pickupAhead(e, L, want) {
  for (const z of ents) if (!z.dead && (z.zone === 'turbo' || (z.zone === 'wrench' && want)) && Math.abs(z.d - L) < 1.2 && z.s - e.s > 12 && z.s - e.s < 90) return 1;
  return 0;
}
function useNos() {
  if (game.state !== 'race' || !player.alive || player.turbo > 0) return;
  if (player.M && player.M.electric) { msg('ELECTRIC - NO NOS', 'hot'); return; }
  if (player.nos <= 0) { msg('NO NOS - GRAB A BOTTLE', 'hot'); return; }
  player.nos--; player.turbo = 3.5; msg('NOS!', 'blue'); SFX.turbo(); vibrate(30);
}
const warm = []; for (const c of CAR_COLORS) for (const t of ['sedan', 'hatch', 'van']) warm.push([t, c]); warm.push(['taxi', 0xf4c20d]); for (const c of BUS_COLORS) warm.push(['bus', c]);
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) return;
  const rawDt = dt; dt = Math.min(dt, 1 / 20);
  const inp = readInput();
  if (warm.length && (game.state === 'menu' || game.state === 'result' || game.state === 'paused')) { const [t, c] = warm.pop(); trafficGeo(t, c); }
  if (game.state !== 'paused' && game.state !== 'result' && game.state !== 'entry') {
    step(dt, inp);
    if (game.state !== 'menu') updateHud(dt, inp);
  } else if (game.state === 'result' || game.state === 'entry') { game.t += dt; }
  if (player) {
    { const adt = game.state === 'paused' || game.state === 'result' ? 0 : dt; for (const e of ents) if (!e.dead) placeEnt(e, adt); }
    if (!DBG.cam) updateCamera(game.state === 'paused' ? 0 : dt);
  }
  if (game.state !== 'paused') { vehicleFx(dt); updatePS(FX, dt); updatePS(SMK, dt); updateDebris(dt); }
  sky.position.copy(camera.position); mount.position.copy(camera.position); skyU.time.value += dt;
  if (player) {   // the shadow box and the helper lights follow the car
    worldPos(player.s + 42, player.d, 0, sun.target.position); sun.position.copy(sun.target.position).addScaledVector(sunDir, 220);
    headSpot.intensity = player.alive ? skyCfg.spot : 0;
  }
  { const on = Math.floor(game.t * 7) % 2; matSirenR.color.setRGB(on ? 6 : 0.25, 0.1 * on, 0.05 * on); matSirenB.color.setRGB(0.05 * (1 - on), 0.25 * (1 - on) + 0.02, on ? 0.25 : 6); }
  if (boomT > 0) { boomT -= dt; boomLight.intensity = Math.max(0, boomT) * 550; }
  if (player) audioUpdate(player, player.drift * 2.5, (Math.abs(player.d) > RW + 0.2 && !trackAt(player.s, tr1).town) || (Math.abs(Math.abs(player.d) - 6.6) < 0.9 && player.y < 0.1), player.alive && (game.state === 'race' || game.state === 'countdown' || game.state === 'finished'));
  if (composer && Q.level >= 2) composer.render(); else renderer.render(scene, camera);
  // adaptive quality: step down while the device cannot hold ~45 fps
  if (game.state === 'race' && !Q.lock && Q.level > 0) {
    Q.n++; Q.sum += rawDt;
    if (Q.n >= 90) { if (Q.sum / Q.n > 1 / 44) applyQuality(Q.level - 1); else { Q.n = 0; Q.sum = 0; } }
  }
}

/* ============================== boot ============================== */
applyQuality(settings.gfx === 'low' ? 0 : 3);
loadStage(0, true);
renderMenu();
requestAnimationFrame(t => { last = t; frame(t); });
window.__rh = { makeFeature, spawnTrafficAt(s, d, type = 'sedan') { const c = 0xff2a1a; return addEnt('traffic', { sub: type, s, d, dir: 1, hs: type === 'bus' ? 5.6 : 2.2, hd: type === 'bus' ? 1.25 : 0.9, mass: type === 'bus' ? 6 : 1.2, hp: 60, maxhp: 60, vehicle: true, key: type + c, mesh: getMesh(type + c, () => vehicleMesh(type, c)), tSpeed: 0, parked: true, laneD: d, ang: 0 }); }, AU, audioInit, audioReset() { AU.ctx = null; }, spawnCop, policeMesh, input, settings, cycleCamera, vehicleMesh, rallyMesh, renderer, DBG, Q, applyQuality, scene, camera, sim(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { const inp = readInput(); step(dt, inp); vehicleFx(dt); updatePS(FX, dt); updatePS(SMK, dt); updateDebris(dt); if (game.state === 'result') break; } }, game, get player() { return player; }, get ents() { return ents; }, input, loadStage, T, STAGES };
