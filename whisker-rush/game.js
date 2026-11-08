// Race world: track, themes, obstacles, power-ups, racers, bots and camera.
(() => {
const { FURS, EYES, PATTERNS, buildCat } = window.WRCat;

const W = 14;          // track width (m)
let LENGTH = 1500;     // race distance, set from the tuning on each race
const S0 = -120, STEP = 2;
let G = 24;            // gravity, set from the tuning (and lower in space)
let JUMPMUL = 1;       // space jumps are higher
const EYE = 1.08;      // player eye height

// Every tunable game mechanic. The Tuning lab builds its sliders from this list.
const TUNING = [
  { group: 'Race', k: 'raceLength', label: 'Race length', min: 600, max: 3000, step: 100, def: 1500, unit: 'm' },
  { group: 'Race', k: 'pace', label: 'Game pace (how fast 1 km/h feels)', min: 0.5, max: 1.2, step: 0.05, def: 0.8, unit: '×' },
  { group: 'Speed', k: 'nominalKmh', label: 'Cruise speed (no input)', min: 15, max: 45, step: 1, def: 30, unit: 'km/h' },
  { group: 'Speed', k: 'sprintKmh', label: 'Sprint speed', min: 25, max: 60, step: 1, def: 44, unit: 'km/h' },
  { group: 'Speed', k: 'maxKmh', label: 'Speed cap (best cat, full sprint)', min: 30, max: 70, step: 1, def: 48, unit: 'km/h' },
  { group: 'Speed', k: 'statKmh', label: 'Extra speed per Speed point above 5', min: 0, max: 3, step: 0.25, def: 1, unit: 'km/h' },
  { group: 'Speed', k: 'accelKmh', label: 'Extra speed with stick up / ↑ (accelerate)', min: 0, max: 15, step: 1, def: 6, unit: 'km/h' },
  { group: 'Speed', k: 'brakeKmh', label: 'Speed with stick down / ↓ (brake)', min: 0, max: 30, step: 1, def: 10, unit: 'km/h' },
  { group: 'Speed', k: 'exhaustedKmh', label: 'Exhausted speed', min: 3, max: 30, step: 1, def: 12, unit: 'km/h' },
  { group: 'Stamina', k: 'staminaDrain', label: 'Sprint drain', min: 10, max: 100, step: 5, def: 35, unit: '%/s' },
  { group: 'Stamina', k: 'staminaRegen', label: 'Regeneration when not sprinting', min: 0, max: 40, step: 1, def: 10, unit: '%/s' },
  { group: 'Stamina', k: 'accelDrain', label: 'Accelerate drain (stick up / ↑)', min: 0, max: 60, step: 1, def: 12, unit: '%/s' },
  { group: 'Stamina', k: 'brakeRegen', label: 'Regeneration while braking', min: 1, max: 4, step: 0.1, def: 1.5, unit: '×' },
  { group: 'Stamina', k: 'recoverAt', label: 'Exhaustion ends at', min: 5, max: 100, step: 5, def: 35, unit: '%' },
  { group: 'Off-track', k: 'offTrackWidth', label: 'Room beside the track (each side)', min: 0, max: 15, step: 1, def: 6, unit: 'm' },
  { group: 'Off-track', k: 'offTrackKeep', label: 'Speed kept off-track', min: 10, max: 100, step: 5, def: 45, unit: '%' },
  { group: 'Jump', k: 'jumpBase', label: 'Base jump height', min: 0.6, max: 2, step: 0.05, def: 0.95, unit: 'm' },
  { group: 'Jump', k: 'jumpPerPoint', label: 'Extra height per Jump point', min: 0, max: 0.3, step: 0.01, def: 0.11, unit: 'm' },
  { group: 'Jump', k: 'gravity', label: 'Gravity (higher = snappier jumps)', min: 10, max: 40, step: 1, def: 24, unit: '' },
  { group: 'Power-ups', k: 'fishGroups', label: 'Fish groups per track (each fish refills 100%)', min: 0, max: 20, step: 1, def: 7, unit: '' },
  { group: 'Power-ups', k: 'fishPerGroup', label: 'Fish in each group', min: 3, max: 8, step: 1, def: 4, unit: '' },
  { group: 'Power-ups', k: 'goldCount', label: 'Golden fish per track (single, moving)', min: 0, max: 15, step: 1, def: 4, unit: '' },
  { group: 'Power-ups', k: 'catnipCount', label: 'Catnip per track', min: 0, max: 15, step: 1, def: 3, unit: '' },
  { group: 'Power-ups', k: 'catnipBonus', label: 'Catnip extra max stamina', min: 0, max: 200, step: 10, def: 60, unit: '%' },
  { group: 'Power-ups', k: 'catnipDuration', label: 'Catnip lasts', min: 2, max: 40, step: 1, def: 15, unit: 's' },
  { group: 'Power-ups', k: 'ghostCount', label: 'Ghosts per track', min: 0, max: 10, step: 1, def: 2, unit: '' },
  { group: 'Power-ups', k: 'ghostDuration', label: 'Ghost lasts (run through obstacles)', min: 1, max: 20, step: 0.5, def: 6, unit: 's' },
  { group: 'Score', k: 'fishPoints', label: 'Points for a fish', min: 0, max: 10, step: 1, def: 1, unit: '' },
  { group: 'Score', k: 'goldPoints', label: 'Points for a moving (golden) fish', min: 0, max: 20, step: 1, def: 3, unit: '' },
  { group: 'Score', k: 'goldSway', label: 'How far moving fish swing (each way)', min: 1, max: 6, step: 0.5, def: 3.5, unit: 'm' },
  { group: 'Score', k: 'goldSpeed', label: 'How fast moving fish swing', min: 0.5, max: 4, step: 0.1, def: 1.6, unit: '×' },
  { group: 'Obstacles', k: 'obstacleGap', label: 'Average gap between obstacles', min: 8, max: 80, step: 1, def: 25, unit: 'm' },
  { group: 'Obstacles', k: 'wideShare', label: 'Share that are jump-only barriers', min: 0, max: 80, step: 5, def: 20, unit: '%' },
  { group: 'Obstacles', k: 'hitKeep', label: 'Speed kept after hitting one', min: 0, max: 100, step: 5, def: 30, unit: '%' },
  { group: 'Obstacles', k: 'stumbleTime', label: 'Stumble time after a hit', min: 0.2, max: 3, step: 0.1, def: 0.9, unit: 's' },
  { group: 'Obstacles', k: 'bumpKeep', label: 'Speed kept after a cat bump', min: 30, max: 100, step: 5, def: 85, unit: '%' },
  { group: 'Rival cats', k: 'kittenSpeed', label: 'Kitten: rivals’ speed', min: 50, max: 130, step: 1, def: 82, unit: '%' },
  { group: 'Rival cats', k: 'kittenSkill', label: 'Kitten: rivals dodge', min: 0, max: 100, step: 5, def: 45, unit: '%' },
  { group: 'Rival cats', k: 'jaguarSpeed', label: 'Jaguar: rivals’ speed', min: 50, max: 130, step: 1, def: 95, unit: '%' },
  { group: 'Rival cats', k: 'jaguarSkill', label: 'Jaguar: rivals dodge', min: 0, max: 100, step: 5, def: 75, unit: '%' },
  { group: 'Rival cats', k: 'lionSpeed', label: 'Lion: rivals’ speed', min: 50, max: 130, step: 1, def: 104, unit: '%' },
  { group: 'Rival cats', k: 'lionSkill', label: 'Lion: rivals dodge', min: 0, max: 100, step: 5, def: 90, unit: '%' },
];
const DEFAULTS = Object.fromEntries(TUNING.map(t => [t.k, t.def]));

const DIFFS = [
  { id: 'kitten', name: 'Kitten', emoji: '🐱', sub: 'Easy', density: 1.35, sprint: 0.25, ahead: 0.88, behind: 1.0, greedy: 0.35 },
  { id: 'jaguar', name: 'Jaguar', emoji: '🐆', sub: 'Medium', density: 1.0, sprint: 0.6, ahead: 0.95, behind: 1.05, greedy: 0.1 },
  { id: 'lion', name: 'Lion', emoji: '🦁', sub: 'Hard', density: 0.8, sprint: 1.0, ahead: 0.99, behind: 1.07, greedy: 0 },
];

const BOT_NAMES = ['Mochi', 'Pepper', 'Ziggy', 'Biscuit', 'Luna', 'Oscar', 'Cleo', 'Smokey', 'Ginger', 'Pixel', 'Noodle', 'Pumpkin', 'Mango', 'Tofu', 'Shadow', 'Bella', 'Milo', 'Olive', 'Sushi', 'Pretzel'];

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- textures ----------
function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, base, cols, n, a = 1, b = 3) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    const s = a + Math.random() * (b - a);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}
function cracks(g, w, h, color, n, width) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
}
function radialTex(inner, outer) {
  return tex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}
function checker(cols, rows) {
  return tex(cols * 16, rows * 16, (g) => {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 16, j * 16, 16, 16);
    }
  });
}

// ---------- materials & parts ----------
const MC = new Map();
function M(color, kind = 'lambert', extra = {}) {
  const key = color + kind + JSON.stringify(Object.keys(extra));
  if (MC.has(key) && !Object.keys(extra).length) return MC.get(key);
  const m = kind === 'basic' ? new THREE.MeshBasicMaterial({ color, ...extra }) : new THREE.MeshLambertMaterial({ color, ...extra });
  if (!Object.keys(extra).length) MC.set(key, m);
  return m;
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}
const P = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => ({ geo, mat, m: mat4(x, y, z, rx, ry, rz, sx, sy, sz) });

class Batch {
  constructor(parts) { this.parts = parts; this.list = []; }
  add(m, color) { this.list.push([m, color]); }
  build(group) {
    if (!this.list.length) return;
    const tmp = new THREE.Matrix4();
    for (const p of this.parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, this.list.length);
      this.list.forEach(([m, c], i) => {
        tmp.multiplyMatrices(m, p.m); im.setMatrixAt(i, tmp);
        if (p.tint) im.setColorAt(i, c || new THREE.Color('#fff'));
      });
      im.frustumCulled = false;
      group.add(im);
    }
  }
}

// geometry helpers (shared)
const GEO = {
  cyl: (rt, rb, h, seg = 7) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return g; },
  cone: (r, h, seg = 7) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return g; },
  box: (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; },
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dodeca: r => new THREE.DodecahedronGeometry(r, 0),
  sphere: (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b),
  half: () => new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  plane: () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; },
};

// ---------- scenery builders ----------
const SCN = {
  cactus: () => {
    const g = M('#3f8f3a');
    return [P(GEO.cyl(0.38, 0.42, 4.2), g), P(GEO.cyl(0.24, 0.24, 1.4), g, 0.75, 1.9, 0), P(GEO.cyl(0.22, 0.22, 0.6), g, 0.2, 1.75, 0, 0, 0, -Math.PI / 2),
      P(GEO.cyl(0.22, 0.22, 1.1), g, -0.7, 2.6, 0), P(GEO.cyl(0.2, 0.2, 0.6), g, -0.15, 2.45, 0, 0, 0, Math.PI / 2)];
  },
  rock: c => [P(GEO.dodeca(1), M(c || '#a37b52'), 0, 0.3, 0, 0, 0, 0, 1.4, 0.9, 1.1)],
  dune: () => [P(GEO.half(), M('#e6b56d'), 0, -0.2, 0, 0, 0, 0, 14, 3.5, 9)],
  tree: () => [P(GEO.cyl(0.45, 0.7, 8), M('#5b3b22')), P(GEO.ico(3.4, 0), M('#2f7d32'), 0, 9, 0), P(GEO.ico(2.6, 0), M('#3c9a40'), 1.6, 7.4, 1), P(GEO.ico(2.2, 0), M('#276b2b'), -1.5, 7.8, -0.8)],
  palm: () => {
    const parts = [P(GEO.cyl(0.25, 0.4, 7.5), M('#7a5a36'), 0, 0, 0, 0.08, 0, 0.05)];
    const leaf = new THREE.BoxGeometry(0.7, 0.08, 3.4); leaf.translate(0, 0, 1.7);
    for (let i = 0; i < 6; i++) parts.push(P(leaf, M('#3c9a3a'), 0.3, 7.4, 0.55, 0.45, i * Math.PI / 3, 0));
    return parts;
  },
  fern: () => [P(GEO.cone(1.3, 2.2), M('#4a9c3c')), P(GEO.cone(0.9, 1.6), M('#5db04a'), 0.6, 0, 0.4)],
  bush: () => [P(GEO.ico(1.3, 1), M('#357a2e'), 0, 0.7, 0, 0, 0, 0, 1.3, 0.8, 1.1)],
  building: () => {
    const t = tex(128, 256, (g, w, h) => {
      g.fillStyle = '#1e2033'; g.fillRect(0, 0, w, h);
      const cols = ['#ffd77a', '#fff3c4', '#8fe3ff', '#ffb36b'];
      for (let x = 0; x < 8; x++) for (let y = 0; y < 24; y++) {
        if (Math.random() < 0.62) continue;
        g.fillStyle = cols[(Math.random() * 4) | 0]; g.fillRect(4 + x * 15.5, 4 + y * 10.5, 9, 6);
      }
    });
    const em = t.clone(); em.needsUpdate = true;
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff', map: t, emissive: '#ffffff', emissiveMap: em, emissiveIntensity: 0.7 });
    return [Object.assign(P(GEO.box(1, 1, 1), m), { tint: true })];
  },
  neon: () => [Object.assign(P(new THREE.BoxGeometry(1, 1, 0.2), M('#ffffff', 'basic')), { tint: true })],
  lamp: () => [P(GEO.cyl(0.1, 0.14, 6.2), M('#3a3d48')), P(new THREE.BoxGeometry(0.12, 0.12, 1.8), M('#3a3d48'), 0, 6.1, 0.85), P(GEO.sphere(0.28), M('#fff1b8', 'basic'), 0, 5.9, 1.7)],
  glow: () => [P(GEO.plane(), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,220,140,0.55)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.05, 0, 0, 0, 0, 9, 1, 9)],
  lavarock: () => [P(GEO.dodeca(1), M('#2a2220'), 0, 0.3, 0, 0, 0, 0, 1.3, 1, 1.1)],
  deadtree: () => [P(GEO.cyl(0.15, 0.3, 4), M('#1f1816')), P(GEO.cyl(0.07, 0.12, 2), M('#1f1816'), 0, 2.4, 0, 0, 0, 0.8), P(GEO.cyl(0.07, 0.1, 1.6), M('#1f1816'), 0, 2.9, 0, 0.7, 0, -0.5)],
  vent: () => [P(GEO.cone(2.2, 2.4), M('#2b2422')), P(GEO.sphere(0.6), M('#ff6a1a', 'basic'), 0, 2.3, 0, 0, 0, 0, 1, 0.4, 1)],
  pine: () => [P(GEO.cyl(0.25, 0.35, 1.5), M('#5a3d26')), P(GEO.cone(2.4, 3.2), M('#2e5d43'), 0, 1.2, 0), P(GEO.cone(1.9, 2.8), M('#356a4c'), 0, 2.9, 0), P(GEO.cone(1.3, 2.4), M('#2e5d43'), 0, 4.5, 0),
    P(GEO.cone(0.75, 1.2), M('#ffffff'), 0, 5.8, 0), P(GEO.cone(1.6, 0.6), M('#f4fbff'), 0, 3.5, 0)],
  crystal: () => [P(new THREE.OctahedronGeometry(1, 0), M('#9fe3ff', 'lambert', { emissive: '#2a6f8a' }), 0, 2, 0, 0, 0, 0, 0.8, 2.4, 0.8), P(new THREE.OctahedronGeometry(1, 0), M('#c8f1ff'), 0.9, 1, 0.3, 0, 0, 0.5, 0.5, 1.3, 0.5)],
  mound: () => [P(GEO.half(), M('#f4f9fd'), 0, -0.1, 0, 0, 0, 0, 3, 1.2, 2.4)],
  // --- space
  asteroid: () => [P(GEO.ico(1, 0), M('#6d6a75'), 0, 0, 0, 0.4, 0, 0.3, 1.3, 1, 1.1), P(GEO.ico(0.5, 0), M('#55525c'), 0.95, 0.45, 0.2)],
  beacon: () => [P(GEO.box(0.9, 0.15, 0.9), M('#5a6378')), P(GEO.cyl(0.1, 0.16, 4.5), M('#8a93a8')), P(GEO.sphere(0.32), M('#46e0ff', 'basic'), 0, 4.7, 0)],
  // --- mountains
  fir: () => [P(GEO.cyl(0.25, 0.35, 1.5), M('#5a3d26')), P(GEO.cone(2.3, 3.4), M('#2f6b3a'), 0, 1.2, 0), P(GEO.cone(1.8, 3.0), M('#357a42'), 0, 3.0, 0), P(GEO.cone(1.2, 2.6), M('#2f6b3a'), 0, 4.8, 0)],
  cow: () => cowParts(),
  chalet: () => {
    const roof = new THREE.Shape(); roof.moveTo(-3.8, 0); roof.lineTo(3.8, 0); roof.lineTo(0, 3); roof.lineTo(-3.8, 0);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 6.4, bevelEnabled: false }); rg.translate(0, 0, -3.2);
    return [P(GEO.box(6, 4, 5.4), M('#8a5530')), P(rg, M('#5a3420'), 0, 4, 0), P(GEO.box(1.2, 1.2, 0.1), M('#ffe7a8', 'basic'), -1.5, 1.8, 2.72), P(GEO.box(1.2, 1.2, 0.1), M('#ffe7a8', 'basic'), 1.5, 1.8, 2.72),
      P(GEO.box(6.2, 0.25, 1.2), M('#6a4022'), 0, 2.6, 3.2), P(GEO.box(0.9, 1.8, 0.1), M('#4a2a14'), 0, 0, 2.72)];
  },
  bale: () => [P(new THREE.CylinderGeometry(0.9, 0.9, 1.7, 14), M('#d9b54a'), 0, 0.9, 0, 0, 0, Math.PI / 2)],
};

// shared part lists
function cowParts() {
  const Wc = M('#f6f3ee'), B = M('#1d1b1b'), pink = M('#f2a5b0'), horn = M('#e9dcc0');
  const p = [P(GEO.box(2.4, 1.1, 1.0), Wc, 0, 0.8, 0), P(GEO.box(0.7, 0.55, 1.03), B, -0.4, 1.15, 0), P(GEO.box(0.5, 0.4, 1.03), B, 0.6, 1.4, 0),
    P(GEO.box(0.7, 0.7, 0.7), Wc, 1.45, 1.35, 0), P(GEO.box(0.35, 0.36, 0.62), pink, 1.88, 1.35, 0), P(GEO.box(0.12, 0.12, 0.08), B, 1.72, 1.9, 0.18), P(GEO.box(0.12, 0.12, 0.08), B, 1.72, 1.9, -0.18),
    P(GEO.cone(0.07, 0.32, 5), horn, 1.45, 2.05, 0.26), P(GEO.cone(0.07, 0.32, 5), horn, 1.45, 2.05, -0.26), P(GEO.cyl(0.05, 0.05, 0.9), Wc, -1.25, 1.05, 0, 0, 0, 0.35)];
  for (const [x, z] of [[0.9, 0.35], [0.9, -0.35], [-0.9, 0.35], [-0.9, -0.35]]) p.push(P(GEO.cyl(0.13, 0.13, 0.8), Wc, x, 0, z));
  p.push(P(GEO.box(0.5, 0.25, 0.5), M('#f4b8c4'), -0.6, 0.6, 0));
  return p;
}

// ---------- house furniture (front faces +Z) ----------
const FURN = {
  sofa: c => [P(GEO.box(4.6, 1.3, 2.4), M(c)), P(GEO.box(4.6, 2.2, 0.6), M(c), 0, 1.2, -0.9), P(GEO.box(0.6, 2.0, 2.4), M(c), -2.3, 0, 0), P(GEO.box(0.6, 2.0, 2.4), M(c), 2.3, 0, 0),
    P(GEO.box(1.9, 0.4, 1.7), M('#f3e6d0'), -0.98, 1.3, 0.25), P(GEO.box(1.9, 0.4, 1.7), M('#f3e6d0'), 0.98, 1.3, 0.25)],
  table: () => [P(GEO.box(3.6, 0.25, 2.2), M('#a06a3a'), 0, 2.6, 0), ...[[1.6, 0.9], [-1.6, 0.9], [1.6, -0.9], [-1.6, -0.9]].map(([x, z]) => P(GEO.cyl(0.12, 0.12, 2.6), M('#7a4a26'), x, 0, z))],
  shelf: () => {
    const t = tex(128, 256, (g, w, h) => {
      g.fillStyle = '#6a4026'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) { let x = 8; while (x < w - 12) { const bw = 6 + Math.random() * 8, bh = 30 + Math.random() * 22; g.fillStyle = `hsl(${Math.random() * 360},55%,${40 + Math.random() * 25}%)`; g.fillRect(x, r * 64 + 60 - bh, bw, bh); x += bw + 1; } g.fillStyle = '#4a2a14'; g.fillRect(0, r * 64 + 58, w, 6); }
    });
    return [P(GEO.box(3, 8, 1.3), new THREE.MeshLambertMaterial({ map: t }))];
  },
  floorlamp: () => { const sh = new THREE.CylinderGeometry(0.6, 1.0, 1.2, 14, 1, true); sh.translate(0, 6.4, 0); return [P(GEO.cyl(0.6, 0.7, 0.15), M('#333')), P(GEO.cyl(0.07, 0.07, 6), M('#333')), P(sh, new THREE.MeshBasicMaterial({ color: '#fff1c8', side: THREE.DoubleSide }))]; },
  plant: () => [P(GEO.cyl(0.8, 0.6, 1.4), M('#c4683a')), P(GEO.ico(1.3, 0), M('#3c8a3a'), 0, 2.4, 0, 0, 0, 0, 1, 1.4, 1), P(GEO.ico(0.9, 0), M('#4aa048'), 0.5, 3.3, 0.3)],
  bed: c => [P(GEO.box(4.2, 1.6, 3.4), M('#8a5a3a')), P(GEO.box(4.0, 0.5, 3.2), M(c), 0, 1.6, 0.05), P(GEO.box(1.4, 0.45, 0.9), M('#ffffff'), -1, 2.1, -1.0), P(GEO.box(1.4, 0.45, 0.9), M('#ffffff'), 1, 2.1, -1.0), P(GEO.box(4.2, 3.4, 0.3), M('#6a4026'), 0, 0, -1.75)],
  counter: () => [P(GEO.box(4, 3.2, 2.2), M('#f2efe8')), P(GEO.box(4.1, 0.2, 2.3), M('#4a4a52'), 0, 3.2, 0), P(GEO.box(0.06, 2.6, 0.06), M('#999'), 0, 0.3, 1.12)],
  fridge: () => [P(GEO.box(2.4, 6.6, 2.2), M('#dfe4ea')), P(GEO.box(0.1, 1.4, 0.12), M('#888'), 0.9, 3.8, 1.12), P(GEO.box(2.4, 0.05, 0.05), M('#999'), 0, 4.4, 1.12)],
  bathtub: () => [P(GEO.box(4.4, 1.8, 2.4), M('#ffffff')), P(GEO.box(4.0, 0.05, 2.0), M('#8fd3ff', 'basic'), 0, 1.62, 0), P(GEO.cyl(0.08, 0.08, 1.2), M('#c0c0c8'), 1.8, 1.8, -0.9)],
  wardrobe: () => [P(GEO.box(3.6, 8, 1.6), M('#b98a5a')), P(GEO.box(0.06, 7.6, 0.1), M('#6a4a2a'), 0, 0.2, 0.82), P(GEO.box(0.1, 0.6, 0.12), M('#e8d090'), -0.3, 4, 0.84), P(GEO.box(0.1, 0.6, 0.12), M('#e8d090'), 0.3, 4, 0.84)],
  blocks: () => [P(GEO.box(1.2, 1.2, 1.2), M('#e84a4a')), P(GEO.box(1.2, 1.2, 1.2), M('#3a8ae8'), 1.3, 0, 0.2), P(GEO.box(1.2, 1.2, 1.2), M('#f2c230'), 0.6, 1.2, 0.1, 0, 0.5, 0), P(GEO.sphere(0.7), M('#5ac85a'), -1.4, 0.7, 0.4)],
  painting: () => {
    const t = tex(128, 96, (g, w, h) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 7; i++) { g.fillStyle = `hsl(${Math.random() * 360},60%,55%)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 0, 7); g.fill(); } });
    return [P(new THREE.BoxGeometry(2.8, 2.2, 0.12), M('#c9a24a')), P(new THREE.BoxGeometry(2.4, 1.8, 0.14), new THREE.MeshLambertMaterial({ map: t }))];
  },
  window: () => [P(new THREE.BoxGeometry(3.4, 3.8, 0.12), M('#ffffff')), P(new THREE.BoxGeometry(3.0, 3.4, 0.14), M('#a9dcff', 'basic')), P(new THREE.BoxGeometry(0.12, 3.4, 0.16), M('#ffffff')), P(new THREE.BoxGeometry(3.0, 0.12, 0.16), M('#ffffff'))],
};

// rooms of the house track, in order; the race passes through them one after another
const ROOMS = [
  { name: 'Living room', emoji: '🛋️', items: ['sofa', 'shelf', 'floorlamp', 'plant', 'table'], fabric: '#4f7cac',
    floor: () => tex(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${40 + Math.random() * 10}%,${42 + Math.random() * 8}%)`; g.fillRect(i * 32, 0, 32, h); g.fillStyle = 'rgba(60,30,10,0.35)'; g.fillRect(i * 32, 0, 2, h); g.fillRect(i * 32, (i * 97) % h, 32, 2); } }),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#f1e2c6'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(200,150,90,0.25)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, h); g.fillStyle = '#e9e1d4'; g.fillRect(0, h - 10, w, 10); }) },
  { name: 'Kitchen', emoji: '🍳', items: ['counter', 'fridge', 'counter', 'table', 'plant'], fabric: '#c44',
    floor: () => tex(128, 128, (g) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#2b2b33' : '#f4f1ea'; g.fillRect(i * 32, j * 32, 32, 32); } }),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#cfeee0'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 16) for (let y = h * 0.62; y < h - 10; y += 12) g.fillRect(x + 1, y + 1, 14, 10); g.fillStyle = '#e9e1d4'; g.fillRect(0, h - 10, w, 10); }) },
  { name: 'Hallway', emoji: '🚪', items: ['plant', 'shelf', 'floorlamp', 'blocks'], fabric: '#6a8',
    floor: () => tex(256, 256, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = `hsl(25,${35 + Math.random() * 10}%,${30 + Math.random() * 8}%)`; g.fillRect(i * 32, j * 32, 32, 32); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(i * 32, j * 32, 32, 32); } }),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#cfe0f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#b8cde4'; g.fillRect(0, h * 0.55, w, 6); g.fillStyle = '#e9e1d4'; g.fillRect(0, h - 10, w, 10); }) },
  { name: 'Bedroom', emoji: '🛏️', items: ['bed', 'wardrobe', 'floorlamp', 'plant'], fabric: '#b06ac0',
    floor: () => tex(256, 256, (g, w, h) => speckle(g, w, h, '#c9a9c9', ['#b998b9', '#d8bcd8', '#bfa0c0'], 4000, 1, 3)),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#ddd0ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let x = 8; x < w; x += 24) for (let y = 8; y < h - 12; y += 24) { g.beginPath(); g.arc(x + (y % 48 ? 12 : 0), y, 3, 0, 7); g.fill(); } g.fillStyle = '#e9e1d4'; g.fillRect(0, h - 10, w, 10); }) },
  { name: 'Bathroom', emoji: '🛁', items: ['bathtub', 'plant', 'bathtub'], fabric: '#4ab',
    floor: () => tex(128, 128, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i * 3 + j) % 5 ? '#7fc4e8' : '#4a9ccc'; g.fillRect(i * 16 + 1, j * 16 + 1, 14, 14); } }),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#d8e4ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) g.fillRect(x + 1, y + 1, 14, 14); }) },
  { name: "Kids' room", emoji: '🧸', items: ['blocks', 'bed', 'shelf', 'blocks'], fabric: '#f2a03a',
    floor: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#9ad0a0', ['#86c08c', '#acdcb0'], 2000, 1, 3); for (let i = 0; i < 18; i++) { g.fillStyle = `hsl(${Math.random() * 360},70%,60%)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10, 0, 7); g.fill(); } }),
    wall: () => tex(128, 128, (g, w, h) => { g.fillStyle = '#fbe9a6'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb84a'; g.font = '20px sans-serif'; for (let i = 0; i < 6; i++) g.fillText('★', Math.random() * (w - 20), 20 + Math.random() * (h - 40)); g.fillStyle = '#e9e1d4'; g.fillRect(0, h - 10, w, 10); }) },
];

// ---------- obstacle builders (collision box: w across track, d along, h tall) ----------
const OBS = {
  cactus: { h: 3.3, w: 1.3, d: 1.0, kind: 'block', parts: () => SCN.cactus().map(p => (p.m.premultiply(mat4(0, 0, 0, 0, Math.PI / 2, 0, 0.8, 0.8, 0.8)), p)) },
  rock: { h: 1.3, w: 2.2, d: 1.8, kind: 'block', parts: () => [P(GEO.dodeca(1), M('#9c7650'), 0, 0.35, 0, 0.3, 0.5, 0, 1.1, 0.95, 0.9)] },
  grayrock: { h: 1.3, w: 2.2, d: 1.8, kind: 'block', parts: () => [P(GEO.dodeca(1), M('#7d7d78'), 0, 0.35, 0, 0.3, 0.5, 0, 1.1, 0.95, 0.9)] },
  fence: { h: 0.75, d: 0.4, kind: 'wide', parts: () => [P(GEO.box(1, 0.16, 0.16), M('#8a5a2e'), 0, 0.25, 0), P(GEO.box(1, 0.16, 0.16), M('#a06a38'), 0, 0.58, 0)] },
  tumbleweed: { h: 1.1, w: 1.3, d: 1.3, kind: 'block', move: 3.5, parts: () => [P(GEO.ico(0.65, 1), new THREE.MeshLambertMaterial({ color: '#9c7a45', wireframe: true }), 0, 0.65, 0)] },
  log: { h: 0.66, d: 0.7, kind: 'wide', parts: () => [P(new THREE.CylinderGeometry(0.33, 0.33, 1, 9), M('#6b4423'), 0, 0.33, 0, 0, 0, Math.PI / 2)] },
  stump: { h: 1.0, w: 1.4, d: 1.4, kind: 'block', parts: () => [P(GEO.cyl(0.62, 0.72, 1.0, 9), M('#6b4423')), P(GEO.cyl(0.58, 0.58, 0.02, 9), M('#c49a64'), 0, 1.0, 0)] },
  cone: { h: 0.95, w: 0.9, d: 0.9, kind: 'block', parts: () => [P(GEO.box(0.9, 0.08, 0.9), M('#ff6a1a')), P(GEO.cone(0.38, 0.9, 12), M('#ff7a22')), P(new THREE.CylinderGeometry(0.22, 0.27, 0.16, 12), M('#ffffff'), 0, 0.45, 0)] },
  trashcan: { h: 1.45, w: 1.1, d: 1.1, kind: 'block', parts: () => [P(GEO.cyl(0.52, 0.45, 1.3, 12), M('#6f7a86')), P(GEO.cyl(0.57, 0.57, 0.12, 12), M('#4e5762'), 0, 1.3, 0)] },
  crate: { h: 1.2, w: 1.3, d: 1.3, kind: 'block', parts: () => [P(GEO.box(1.3, 1.2, 1.3), M('#9b6a3a'))] },
  barrier: { h: 0.75, d: 0.4, kind: 'wide', parts: () => {
    const t = tex(128, 16, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8262b'; g.fillRect(i * 16, 0, 16, 16); } }, 4, 1);
    return [P(GEO.box(1, 0.35, 0.18), new THREE.MeshLambertMaterial({ map: t }), 0, 0.4, 0), P(GEO.box(1, 0.06, 0.4), M('#333'), 0, 0, 0)];
  } },
  boulder: { h: 1.5, w: 2.1, d: 1.9, kind: 'block', parts: () => [P(GEO.dodeca(1), M('#3a2d2a'), 0, 0.5, 0, 0.4, 0.2, 0, 1.05, 1.0, 0.95), P(GEO.sphere(0.25), M('#ff5a10', 'basic'), 0.5, 0.9, 0.6)] },
  ridge: { h: 0.62, d: 0.8, kind: 'wide', parts: () => [P(GEO.box(1, 0.5, 0.8), M('#2a2220')), P(GEO.box(1, 0.1, 0.3), M('#ff6a1a', 'basic'), 0, 0.5, 0)] },
  spike: { h: 3.0, w: 1.3, d: 1.3, kind: 'block', parts: () => [P(GEO.cone(0.65, 3.0, 5), M('#1b1820')), P(GEO.cone(0.35, 1.6, 5), M('#2c2533'), 0.5, 0, 0.2)] },
  snowman: { h: 2.6, w: 1.4, d: 1.4, kind: 'block', parts: () => [P(GEO.sphere(0.7), M('#ffffff'), 0, 0.65, 0), P(GEO.sphere(0.5), M('#ffffff'), 0, 1.6, 0), P(GEO.sphere(0.36), M('#ffffff'), 0, 2.28, 0),
    P(new THREE.ConeGeometry(0.07, 0.4, 6), M('#ff7a1a'), 0, 2.28, -0.5, -Math.PI / 2), P(GEO.sphere(0.05), M('#111', 'basic'), 0.13, 2.38, -0.3), P(GEO.sphere(0.05), M('#111', 'basic'), -0.13, 2.38, -0.3),
    P(GEO.cyl(0.3, 0.3, 0.35, 10), M('#222'), 0, 2.55, 0)] },
  iceblock: { h: 1.25, w: 1.9, d: 1.5, kind: 'block', parts: () => [P(GEO.box(1.9, 1.25, 1.5), new THREE.MeshLambertMaterial({ color: '#a8e4f7', transparent: true, opacity: 0.85, emissive: '#1d5a72' }))] },
  drift: { h: 0.62, d: 0.9, kind: 'wide', parts: () => [P(new THREE.CylinderGeometry(0.45, 0.45, 1, 10, 1, false, 0, Math.PI), M('#ffffff'), 0, 0.12, 0, 0, 0, Math.PI / 2)] },
  // space
  asteroidO: { h: 1.4, w: 2.2, d: 1.9, kind: 'block', parts: () => [P(GEO.dodeca(1), M('#77737f'), 0, 0.45, 0, 0.3, 0.5, 0, 1.1, 0.95, 0.95), P(GEO.sphere(0.25), M('#4d4a55'), 0.5, 0.9, 0.6), P(GEO.sphere(0.2), M('#4d4a55'), -0.5, 0.7, 0.7)] },
  antenna: { h: 3.0, w: 1.1, d: 1.1, kind: 'block', parts: () => { const dish = new THREE.ConeGeometry(0.7, 0.4, 14, 1, true); return [P(GEO.cyl(0.5, 0.55, 0.4), M('#5a6378')), P(GEO.cyl(0.08, 0.08, 2.6), M('#aab3c6')), P(dish, new THREE.MeshLambertMaterial({ color: '#d9dee8', side: THREE.DoubleSide }), 0, 2.2, 0, 2.2, 0, 0), P(GEO.sphere(0.13), M('#ff3040', 'basic'), 0, 2.95, 0)]; } },
  spacecrate: { h: 1.3, w: 1.4, d: 1.4, kind: 'block', parts: () => [P(GEO.box(1.4, 1.3, 1.4), M('#9aa4b8')), P(GEO.box(1.44, 0.22, 1.44), M('#ffc22e', 'basic'), 0, 0.5, 0), P(GEO.box(0.5, 0.5, 0.05), M('#46e0ff', 'basic'), 0, 0.3, 0.72)] },
  energybar: { h: 0.7, d: 0.4, kind: 'wide', parts: () => [P(GEO.box(1, 0.16, 0.16), M('#ff3060', 'basic'), 0, 0.48, 0), P(GEO.box(1, 0.06, 0.06), M('#ffc0d0', 'basic'), 0, 0.53, 0), P(GEO.box(1, 0.1, 0.4), M('#3a4050'), 0, 0, 0)] },
  probe: { h: 1.25, w: 1.3, d: 1.3, kind: 'block', move: 3.5, parts: () => [P(GEO.sphere(0.6, 14, 10), M('#c8ced8'), 0, 0.65, 0), P(new THREE.TorusGeometry(0.62, 0.06, 6, 20), M('#46e0ff', 'basic'), 0, 0.65, 0, Math.PI / 2, 0, 0), P(GEO.cyl(0.03, 0.03, 0.9), M('#888'), 0, 1.1, 0), P(GEO.cyl(0.03, 0.03, 0.9), M('#888'), 0.4, 0.9, 0, 0, 0, -0.8)] },
  // mountains
  haybale: { h: 1.3, w: 1.7, d: 1.3, kind: 'block', parts: () => [P(new THREE.CylinderGeometry(0.65, 0.65, 1.7, 14), M('#d9b54a'), 0, 0.65, 0, 0, 0, Math.PI / 2), P(new THREE.TorusGeometry(0.66, 0.04, 4, 16), M('#b8902a'), 0.4, 0.65, 0, 0, Math.PI / 2, 0), P(new THREE.TorusGeometry(0.66, 0.04, 4, 16), M('#b8902a'), -0.4, 0.65, 0, 0, Math.PI / 2, 0)] },
  cowO: { h: 2.35, w: 3.3, d: 1.1, kind: 'block', parts: () => cowParts().map(p => (p.m.premultiply(mat4(-0.35, 0, 0)), p)) },
  cheese: { h: 1.35, w: 0.8, d: 1.35, kind: 'block', move: 3.5, parts: () => [P(new THREE.CylinderGeometry(0.66, 0.66, 0.5, 18), M('#f2c94c'), 0, 0, 0, Math.PI / 2, 0, 0), P(new THREE.TorusGeometry(0.62, 0.06, 6, 18), M('#d9a530'), 0, 0, 0.25), P(new THREE.TorusGeometry(0.62, 0.06, 6, 18), M('#d9a530'), 0, 0, -0.25)] },
  // house
  toyball: { h: 1.1, w: 1.1, d: 1.1, kind: 'block', parts: () => [P(GEO.sphere(0.55, 14, 10), M('#e8423a'), 0, 0.55, 0), P(new THREE.TorusGeometry(0.555, 0.09, 6, 20), M('#ffffff'), 0, 0.55, 0, 0, 0.6, 0), P(new THREE.TorusGeometry(0.555, 0.09, 6, 20), M('#2a7ae8'), 0, 0.55, 0, Math.PI / 2, 0, 0)] },
  plantpot: { h: 2.7, w: 1.4, d: 1.4, kind: 'block', parts: () => [P(GEO.cyl(0.62, 0.45, 1.1, 12), M('#c4683a')), P(GEO.ico(0.8, 0), M('#3c8a3a'), 0, 1.75, 0, 0, 0, 0, 1, 1.3, 1), P(GEO.ico(0.5, 0), M('#4aa048'), 0.3, 2.3, 0.2)] },
  basket: { h: 1.35, w: 1.6, d: 1.4, kind: 'block', parts: () => [P(GEO.cyl(0.8, 0.65, 1.2, 14), M('#c9a066')), P(GEO.sphere(0.5), M('#7aa8e8'), -0.2, 1.15, 0, 0, 0, 0, 1, 0.5, 1), P(GEO.sphere(0.45), M('#f28aa8'), 0.3, 1.2, 0.1, 0, 0, 0, 1, 0.45, 1)] },
  books: { h: 0.85, w: 1.5, d: 1.1, kind: 'block', parts: () => [P(GEO.box(1.5, 0.3, 1.1), M('#3a6ab8')), P(GEO.box(1.35, 0.28, 1.0), M('#c84a3a'), 0.05, 0.3, 0, 0, 0.15, 0), P(GEO.box(1.2, 0.27, 0.95), M('#e8b83a'), -0.05, 0.58, 0, 0, -0.1, 0)] },
  rug: { h: 0.64, d: 0.7, kind: 'wide', parts: () => [P(new THREE.CylinderGeometry(0.32, 0.32, 1, 12), M('#b8433a'), 0, 0.32, 0, 0, 0, Math.PI / 2), P(new THREE.CylinderGeometry(0.2, 0.2, 1.01, 12), M('#e8c46a'), 0, 0.32, 0, 0, 0, Math.PI / 2)] },
  roomba: { h: 0.45, w: 1.5, d: 1.5, kind: 'block', move: 3.5, parts: () => [P(GEO.cyl(0.75, 0.75, 0.3, 24), M('#2e2f36')), P(GEO.cyl(0.55, 0.55, 0.05, 24), M('#4a4b55'), 0, 0.3, 0), P(GEO.sphere(0.07), M('#3aff6a', 'basic'), 0, 0.36, 0.4)] },
};

// ---------- themes ----------
const TRACKS = [
  {
    id: 'desert', name: 'Desert Dunes', emoji: '🏜️', blurb: 'Cacti, rocks and rolling tumbleweeds', seed: 11,
    sky: '#4f9de0', horizon: '#f7d9a4', fog: '#f0d4a2', near: 70, far: 340,
    hemi: ['#fff4dc', '#b98a50', 2.0], sun: ['#fff1d0', 2.2], sunDir: [0.4, 0.55, 0.7], sunDisc: '#fff8e0',
    ground: () => tex(256, 256, (g, w, h) => {
      speckle(g, w, h, '#e2b36c', ['#d8a45c', '#efc688', '#c8924c'], 1800);
      g.strokeStyle = 'rgba(180,120,60,0.25)'; g.lineWidth = 2;
      for (let y = 0; y < h; y += 18) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 20) * 4); g.stroke(); }
    }),
    track: () => tex(256, 256, (g, w, h) => {
      speckle(g, w, h, '#c99a5c', ['#b5844a', '#d8ab6c', '#a77a44'], 2400);
      g.fillStyle = 'rgba(120,80,40,0.18)'; for (const x of [70, 100, 156, 186]) g.fillRect(x, 0, 8, h);
    }),
    curb: '#b07a42',
    scenery: [['cactus', 3, 3, 45, 0.8, 1.4], ['rock', 2, 3, 60, 0.6, 2.2], ['dune', 3, 25, 110, 1, 2.6], ['rock', 2, 1, 15, 0.3, 0.7]],
    obstacles: { block: ['cactus', 'rock', 'rock'], wide: ['fence'], moving: ['tumbleweed'] },
    particles: { color: '#f1d3a0', count: 160, size: 0.12, mode: 'dust' },
    landmarks: 'desert',
  },
  {
    id: 'jungle', name: 'Jungle Run', emoji: '🌴', blurb: 'Logs, stumps and mossy rocks', seed: 23,
    sky: '#79c2b0', horizon: '#d8efc8', fog: '#a9cfa0', near: 35, far: 230,
    hemi: ['#e6ffd8', '#3d5f2c', 2.0], sun: ['#fff7d6', 1.8], sunDir: [-0.4, 0.75, 0.5], sunDisc: '#fffbe6',
    ground: () => tex(256, 256, (g, w, h) => speckle(g, w, h, '#3f7a35', ['#356b2c', '#4f8f40', '#2c5c26', '#5a9a3e'], 2600, 1, 4)),
    track: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#7a5233', ['#6a452a', '#8a6140', '#5b3b22'], 2600, 1, 4); g.fillStyle = 'rgba(60,110,40,0.35)'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); }),
    curb: '#2f6a2a',
    scenery: [['tree', 4, 3, 50, 0.8, 1.4], ['palm', 3, 2, 40, 0.8, 1.3], ['fern', 3, 1, 25, 0.6, 1.4], ['bush', 3, 1, 30, 0.7, 1.6], ['tree', 3, 50, 110, 1.2, 2]],
    obstacles: { block: ['stump', 'grayrock', 'stump'], wide: ['log', 'log'], moving: [] },
    particles: { color: '#d8f06a', count: 140, size: 0.14, mode: 'leaves' },
    landmarks: 'jungle',
  },
  {
    id: 'city', name: 'Neon City', emoji: '🏙️', blurb: 'Cones, bins and barriers at night', seed: 37,
    sky: '#0b1030', horizon: '#5a2f72', fog: '#2b2350', near: 50, far: 300,
    hemi: ['#b9b6ff', '#2a2440', 1.6], sun: ['#c8d4ff', 1.0], sunDir: [0.3, 0.8, -0.4], sunDisc: '#e8eeff',
    ground: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#3c3c48', ['#34343f', '#474756'], 1200); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }),
    track: () => tex(256, 256, (g, w, h) => {
      speckle(g, w, h, '#34353d', ['#2c2d34', '#3f4049', '#26272d'], 3000);
      g.fillStyle = '#f2c230'; g.fillRect(4, 0, 6, h); g.fillRect(w - 10, 0, 6, h);
      g.fillStyle = '#eeeeee'; for (const x of [83, 168]) g.fillRect(x, 0, 5, h * 0.5);
    }),
    curb: '#8c8c96',
    scenery: [['building', 4, 9, 20, 1, 1], ['building', 3, 22, 45, 1, 1]],
    obstacles: { block: ['cone', 'trashcan', 'crate', 'cone'], wide: ['barrier'], moving: [] },
    particles: null,
    landmarks: 'city', lamps: true,
  },
  {
    id: 'volcano', name: 'Volcano Rush', emoji: '🌋', blurb: 'Lava rivers, boulders and obsidian spikes', seed: 41,
    sky: '#1d0a0a', horizon: '#b03a1c', fog: '#5c2216', near: 45, far: 270,
    hemi: ['#ffb08a', '#3a1a12', 1.7], sun: ['#ff9a66', 1.6], sunDir: [0, 0.6, 1], sunDisc: null,
    ground: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#2d2321', ['#241c1a', '#3a2e2b', '#1c1514'], 2200); cracks(g, w, h, '#ff6a1a', 6, 2); }),
    track: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#4a3c38', ['#3d312e', '#574743', '#332926'], 2600); cracks(g, w, h, 'rgba(255,110,30,0.7)', 3, 1.5); }),
    curb: 'lava',
    scenery: [['lavarock', 4, 2, 40, 0.6, 2.2], ['deadtree', 2, 3, 40, 0.8, 1.3], ['vent', 1, 8, 60, 0.8, 1.6], ['lavarock', 2, 40, 100, 2, 4]],
    obstacles: { block: ['boulder', 'spike', 'boulder'], wide: ['ridge'], moving: [] },
    particles: { color: '#ff8a2a', count: 220, size: 0.18, mode: 'embers' },
    landmarks: 'volcano', lavaRivers: true,
  },
  {
    id: 'ice', name: 'Frozen Lake', emoji: '❄️', blurb: 'Slippery ice, snowmen and ice blocks', seed: 53,
    sky: '#6fb3ea', horizon: '#e8f5ff', fog: '#dcecf8', near: 55, far: 300,
    hemi: ['#ffffff', '#9fb8cc', 2.1], sun: ['#ffffff', 1.8], sunDir: [-0.5, 0.5, 0.7], sunDisc: '#ffffff',
    ground: () => tex(256, 256, (g, w, h) => speckle(g, w, h, '#eef5fb', ['#dfeaf3', '#ffffff', '#d4e3ef'], 1600, 1, 5)),
    track: () => tex(256, 256, (g, w, h) => {
      speckle(g, w, h, '#bfe2f4', ['#aed8ee', '#d4effb', '#9fd0ea'], 1500, 2, 6);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + Math.random() * 40, y + 60 + Math.random() * 60); g.stroke(); }
    }),
    curb: '#ffffff', slippery: true,
    scenery: [['pine', 4, 3, 50, 0.8, 1.5], ['crystal', 2, 3, 35, 0.6, 1.4], ['mound', 3, 1, 25, 0.6, 1.6], ['pine', 3, 50, 110, 1.2, 2]],
    obstacles: { block: ['snowman', 'iceblock', 'iceblock'], wide: ['drift'], moving: [] },
    particles: { color: '#ffffff', count: 260, size: 0.14, mode: 'snow' },
    landmarks: 'ice',
  },
  {
    id: 'space', name: 'Space Station', emoji: '🚀', blurb: 'Low gravity, asteroids and laser fences', seed: 67,
    sky: '#05030f', horizon: '#1a1040', fog: '#0a0820', near: 90, far: 420,
    hemi: ['#b8c8ff', '#2a2050', 1.7], sun: ['#ffffff', 2.4], sunDir: [0.6, 0.5, 0.3], sunDisc: '#fff8f0',
    space: true, gravMul: 0.55, jumpMul: 1.3,
    ground: null,
    track: () => tex(256, 256, (g, w, h) => {
      speckle(g, w, h, '#5d667a', ['#535b6e', '#687288', '#4a5163'], 1200);
      g.strokeStyle = 'rgba(20,24,34,0.7)'; g.lineWidth = 3;
      for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffc22e' : '#222'; g.fillRect(0, i * 16, 8, 16); g.fillRect(w - 8, i * 16, 8, 16); }
      g.fillStyle = 'rgba(70,224,255,0.5)'; g.fillRect(w / 2 - 2, 0, 4, h * 0.4);
    }),
    curb: 'neon',
    scenery: [['asteroid', 4, 6, 120, 1, 5, -40, 45], ['asteroid', 2, 2, 30, 0.4, 1.4, -6, 14], ['beacon', 2, 0.2, 1.5, 1, 1.2]],
    obstacles: { block: ['asteroidO', 'antenna', 'spacecrate', 'spacecrate'], wide: ['energybar'], moving: ['probe'] },
    particles: { color: '#cfe0ff', count: 220, size: 0.1, mode: 'static' },
    landmarks: 'space',
  },
  {
    id: 'mountains', name: 'Alpine Meadow', emoji: '🏔️', blurb: 'Cows, hay bales and rolling cheese', seed: 71,
    sky: '#4f9fe6', horizon: '#dcefff', fog: '#cfe3f2', near: 70, far: 380,
    hemi: ['#ffffff', '#5a8a3a', 2.1], sun: ['#fff6e0', 2.2], sunDir: [-0.3, 0.7, 0.6], sunDisc: '#fffbe8',
    ground: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#5aa83c', ['#4f9a34', '#68b848', '#4a8f30'], 2400, 1, 4); for (let i = 0; i < 70; i++) { g.fillStyle = ['#ffffff', '#ffe14a', '#c58aff', '#ff8ab0'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }),
    track: () => tex(256, 256, (g, w, h) => { speckle(g, w, h, '#b9aa8e', ['#a8997c', '#cbbda2', '#968a72', '#d8ccb4'], 3200, 1, 4); }),
    curb: '#4a8a30',
    scenery: [['fir', 4, 3, 55, 0.8, 1.5], ['cow', 1, 3, 30, 0.9, 1.1], ['chalet', 1, 12, 60, 1, 1.3], ['bale', 1, 2, 25, 0.9, 1.2], ['rock', 2, 1, 40, 0.4, 1.6, 0, 0, '#8d8d88'], ['fir', 3, 55, 120, 1.2, 2]],
    obstacles: { block: ['haybale', 'grayrock', 'cowO', 'haybale'], wide: ['fence'], moving: ['cheese'] },
    particles: { color: '#fff6b0', count: 90, size: 0.12, mode: 'leaves' },
    landmarks: 'mountains',
  },
  {
    id: 'house', name: 'House Chase', emoji: '🏠', blurb: 'Room to room: toys, plants and a robot vacuum', seed: 83,
    sky: '#efe0c8', horizon: '#efe0c8', fog: '#ead9bf', near: 50, far: 240,
    hemi: ['#fff6e6', '#a08060', 2.3], sun: ['#fff2d8', 1.1], sunDir: [0.2, 1, 0.3], sunDisc: null,
    indoor: true, ground: null,
    track: () => tex(128, 256, (g, w, h) => {
      g.fillStyle = '#9e2f2a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8c46a'; g.fillRect(6, 0, 6, h); g.fillRect(w - 12, 0, 6, h);
      g.fillStyle = '#7a2420'; g.fillRect(16, 0, w - 32, h);
      g.strokeStyle = '#e8c46a'; g.lineWidth = 3;
      for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(w / 2, y + 8); g.lineTo(w - 26, y + 32); g.lineTo(w / 2, y + 56); g.lineTo(26, y + 32); g.closePath(); g.stroke(); }
    }),
    curb: '#efe2bd',
    scenery: [],
    obstacles: { block: ['toyball', 'plantpot', 'basket', 'books', 'toyball'], wide: ['rug'], moving: ['roomba'] },
    particles: { color: '#fff3d0', count: 120, size: 0.08, mode: 'leaves' },
    landmarks: null,
  },
];

// ---------- track geometry ----------
function makeTrack(seed) {
  const R = mulberry(seed);
  const n = Math.ceil((LENGTH + 260 - S0) / STEP) + 1;
  const px = new Float32Array(n), pz = new Float32Array(n), hd = new Float32Array(n);
  const A1 = 0.55 + R() * 0.3, L1 = 100 + R() * 60, F1 = R() * 6;
  const A2 = 0.28 + R() * 0.2, L2 = 45 + R() * 25, F2 = R() * 6;
  const head = s => {
    if (s <= 0) return 0;
    const ramp = Math.min(1, s / 140), endRamp = Math.min(1, Math.max(0, (LENGTH + 60 - s) / 120));
    const f = A1 * Math.sin(s / L1 + F1) + A2 * Math.sin(s / L2 + F2) - (A1 * Math.sin(F1) + A2 * Math.sin(F2));
    return f * ramp * (0.3 + 0.7 * endRamp);
  };
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const s = S0 + i * STEP, h = head(s);
    px[i] = x; pz[i] = z; hd[i] = h;
    x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
  }
  const o = { x: 0, z: 0, h: 0 };
  function at(s, out = o) {
    let f = (s - S0) / STEP;
    if (f < 0) f = 0; if (f > n - 1.001) f = n - 1.001;
    const i = f | 0, t = f - i;
    out.x = px[i] + (px[i + 1] - px[i]) * t;
    out.z = pz[i] + (pz[i + 1] - pz[i]) * t;
    out.h = hd[i] + (hd[i + 1] - hd[i]) * t;
    return out;
  }
  function world(s, lat, y, v) {
    at(s);
    return v.set(o.x - Math.cos(o.h) * lat, y, o.z + Math.sin(o.h) * lat);
  }
  // coarse samples for clearance checks
  const cs = [];
  for (let s = S0; s < LENGTH + 260; s += 8) { at(s); cs.push(o.x, o.z); }
  function clearance(x, z) {
    let m = 1e9;
    for (let i = 0; i < cs.length; i += 2) { const dx = cs[i] - x, dz = cs[i + 1] - z, d = dx * dx + dz * dz; if (d < m) m = d; }
    return Math.sqrt(m);
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]); }
  return { at, world, clearance, bounds: { minX, maxX, minZ, maxZ } };
}

function ribbon(tr, a, b, y, s0, s1, step, tile) {
  const n = Math.floor((s1 - s0) / step) + 1;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6), idx = [];
  const p = { x: 0, z: 0, h: 0 };
  for (let i = 0; i < n; i++) {
    const s = s0 + i * step; tr.at(s, p);
    const rx = -Math.cos(p.h), rz = Math.sin(p.h);
    pos.set([p.x + rx * a, y, p.z + rz * a, p.x + rx * b, y, p.z + rz * b], i * 6);
    uv.set([0, s / tile, 1, s / tile], i * 4);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    if (i < n - 1) { const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3; idx.push(a0, b0, a1, b0, b1, a1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// vertical strip following the track at a fixed sideways offset (house walls)
function wallStrip(tr, lat, y0, y1, s0, s1, step, tile) {
  const n = Math.floor((s1 - s0) / step) + 1;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6), idx = [];
  const p = { x: 0, z: 0, h: 0 }, sg = Math.sign(lat);
  for (let i = 0; i < n; i++) {
    const s = s0 + i * step; tr.at(s, p);
    const rx = -Math.cos(p.h), rz = Math.sin(p.h), x = p.x + rx * lat, z = p.z + rz * lat;
    pos.set([x, y0, z, x, y1, z], i * 6);
    uv.set([s / tile, 0, s / tile, (y1 - y0) / tile], i * 4);
    nor.set([-sg * rx, 0, -sg * rz, -sg * rx, 0, -sg * rz], i * 6);
    if (i < n - 1) { const a0 = i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; idx.push(a0, b0, a1, a1, b0, b1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function blend(c, fog, k) { return new THREE.Color(c).lerp(new THREE.Color(fog), k); }

function buildLandmarks(kind, tr, group, th, R) {
  const B = tr.bounds, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
  const far = (c, k = 0.5) => new THREE.MeshBasicMaterial({ color: blend(c, th.fog, k), fog: false });
  const ring = (count, dmin, dmax, fn) => {
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const s = R() * (LENGTH + 200), side = R() < 0.5 ? -1 : 1, off = dmin + R() * (dmax - dmin);
        const p = tr.world(s, side * off, 0, new THREE.Vector3());
        if (tr.clearance(p.x, p.z) < dmin * 0.8) continue;
        fn(p, i); break;
      }
    }
  };
  if (kind === 'desert') {
    ring(5, 380, 650, (p) => { const s = 60 + R() * 70; const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.9, 4), far('#d9a560', 0.45)); m.position.set(p.x, s * 0.45, p.z); m.rotation.y = R() * 3; group.add(m); });
    ring(5, 300, 600, (p) => { const r = 40 + R() * 60, h = 30 + R() * 40; const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 7), far('#c46d3c', 0.5)); m.position.set(p.x, h / 2, p.z); group.add(m); });
  } else if (kind === 'jungle') {
    ring(9, 300, 600, (p) => { const r = 120 + R() * 100, h = 150 + R() * 120; const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), far('#2f6a35', 0.5)); m.position.set(p.x, h / 2 - 10, p.z); group.add(m); });
  } else if (kind === 'city') {
    const t = SCN.building()[0].mat.map;
    ring(40, 120, 300, (p) => { const w = 20 + R() * 30, h = 50 + R() * 160; const m = new THREE.Mesh(GEO.box(w, h, w), new THREE.MeshBasicMaterial({ map: t, color: blend('#ffffff', th.fog, 0.35), fog: false })); m.position.set(p.x, 0, p.z); group.add(m); });
  } else if (kind === 'volcano') {
    const end = tr.world(LENGTH + 100, 0, 0, new THREE.Vector3()); tr.at(LENGTH + 100);
    const dir = new THREE.Vector3(Math.sin(tr.at(LENGTH).h), 0, Math.cos(tr.at(LENGTH).h));
    const c = end.clone().addScaledVector(dir, 520);
    const v = new THREE.Mesh(new THREE.CylinderGeometry(70, 360, 300, 12, 1, true), far('#3b1a12', 0.35));
    v.position.set(c.x, 150, c.z); group.add(v);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(70, 16), new THREE.MeshBasicMaterial({ color: '#ff6a10', fog: false }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(c.x, 296, c.z); group.add(lava);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,140,40,0.9)', 'rgba(255,60,0,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(420, 300, 1); glow.position.set(c.x, 330, c.z); group.add(glow);
    for (let i = 0; i < 6; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(60,40,40,0.8)', 'rgba(60,40,40,0)'), fog: false, depthWrite: false }));
      sm.scale.setScalar(160 + i * 50); sm.position.set(c.x + (R() - 0.5) * 80, 360 + i * 60, c.z + (R() - 0.5) * 80); group.add(sm);
    }
    ring(6, 300, 600, (p) => { const r = 100 + R() * 80, h = 90 + R() * 80; const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), far('#2a1410', 0.4)); m.position.set(p.x, h / 2 - 5, p.z); group.add(m); });
  } else if (kind === 'ice') {
    ring(10, 300, 650, (p) => {
      const r = 110 + R() * 100, h = 140 + R() * 140;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), far('#8fa9c4', 0.45)); m.position.set(p.x, h / 2 - 10, p.z); group.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), far('#ffffff', 0.25)); cap.position.set(p.x, h - 10 - h * 0.19 + 1, p.z); group.add(cap);
    });
  } else if (kind === 'space') {
    const planet = (p, r, c, ring, k = 0.15) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshLambertMaterial({ color: c, fog: false, emissive: new THREE.Color(c).multiplyScalar(0.25) }));
      m.position.copy(p); group.add(m);
      if (ring) { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, r * 0.25, 2, 64), new THREE.MeshBasicMaterial({ color: ring, fog: false, transparent: true, opacity: 0.7 })); t.position.copy(p); t.rotation.set(1.2, 0.3, 0); t.scale.z = 0.05; group.add(t); }
    };
    ring(1, 600, 700, p => planet(p.setY(260), 170, '#d49a6a', '#e8cfa0'));
    ring(1, 500, 650, p => planet(p.setY(120), 90, '#3a7ad8'));
    ring(2, 400, 600, p => planet(p.setY(60 + R() * 200), 30 + R() * 30, '#a9a6b0'));
    for (let i = 0; i < 5; i++) ring(1, 500, 800, p => {
      const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(['rgba(160,80,255,0.35)', 'rgba(60,140,255,0.3)', 'rgba(255,80,160,0.25)'][i % 3], 'rgba(0,0,0,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      n.scale.setScalar(500 + R() * 400); n.position.set(p.x, 100 + R() * 300, p.z); group.add(n);
    });
  } else if (kind === 'mountains') {
    ring(12, 320, 700, (p) => {
      const r = 120 + R() * 110, h = 170 + R() * 150;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), far('#6f7f8f', 0.4)); m.position.set(p.x, h / 2 - 10, p.z); group.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.4, 7), far('#ffffff', 0.2)); cap.position.set(p.x, h - 10 - h * 0.2 + 1, p.z); group.add(cap);
    });
    ring(1, 520, 620, (p) => {   // one tall, crooked peak
      const m = new THREE.Mesh(new THREE.ConeGeometry(150, 520, 4), far('#5f6a76', 0.35)); m.position.set(p.x, 250, p.z); m.rotation.set(0.08, 0.6, 0.05); group.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(62, 215, 4), far('#ffffff', 0.15)); cap.position.set(p.x + 20, 410, p.z); cap.rotation.copy(m.rotation); group.add(cap);
    });
    ring(10, 150, 300, (p) => { const m = new THREE.Mesh(GEO.half(), far('#4f9a3a', 0.35)); m.scale.set(60 + R() * 60, 25 + R() * 30, 50 + R() * 50); m.position.set(p.x, -2, p.z); group.add(m); });
  }
}

// ---------- racer ----------
class Racer {
  constructor(o, cfg) {
    Object.assign(this, o);
    const d = o.speedStat - 5;
    this.nomKmh = Math.min(cfg.maxKmh, cfg.nominalKmh + d * cfg.statKmh);
    this.sprKmh = Math.min(cfg.maxKmh, cfg.sprintKmh + d * cfg.statKmh);
    this.jumpH = (cfg.jumpBase + o.jumpStat * cfg.jumpPerPoint) * JUMPMUL;
    this.jumpV = Math.sqrt(2 * G * this.jumpH);
    this.tApex = this.jumpV / G;
    this.y = 0; this.vy = 0; this.vx = 0; this.speed = 0; this.steer = 0;
    this.stamina = 100; this.maxSt = 100; this.nipT = 0; this.sprint = false; this.exhausted = false;
    this.stumble = 0; this.hitId = -1; this.finished = false; this.finishTime = 0; this.tx = this.x; this.dec = new Map();
    this.wander = 2 + Math.random() * 3; this.mul = 1; this.botSprint = false; this.bumpCd = 0; this.offTrack = false;
    this.throttle = 0; this.ghostT = 0;
  }
}

// ---------- the race ----------
class Race {
  constructor(renderer, opts) {
    this.renderer = renderer; this.o = opts; this.events = opts.onEvent || (() => {});
    this.cfg = { ...DEFAULTS, ...(opts.tuning || {}) };
    this.theme = TRACKS.find(t => t.id === opts.track) || TRACKS[0];
    LENGTH = this.cfg.raceLength; G = this.cfg.gravity * (this.theme.gravMul || 1); JUMPMUL = this.theme.jumpMul || 1;
    this.pace = this.cfg.pace; this.OFF = this.cfg.offTrackWidth;
    this.view = opts.view === 'third' ? 'third' : 'first';
    this.diff = DIFFS.find(d => d.id === opts.diff) || DIFFS[1];
    this.L = LENGTH;
    this.state = 'countdown'; this.count = 3.6; this.lastCount = 4; this.time = 0; this.clock = 0; this.doneT = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1600);
    this.scene.add(this.camera);
    this.tmp = new THREE.Vector3();
    this.score = 0; this.fishCaught = 0; this.goldCaught = 0;
    this.finalStretch = false; this.shake = 0; this.orbit = 0; this.offMsgT = 0;
    this.build();
  }

  build() {
    const th = this.theme, sc = this.scene, R = mulberry(th.seed * 7 + Math.round(this.diff.density * 100));
    const tr = this.track = makeTrack(th.seed);
    const OFF = this.OFF;
    const world = new THREE.Group(); sc.add(world); this.world = world;
    sc.fog = new THREE.Fog(th.fog, th.near, th.far);
    sc.background = new THREE.Color(th.fog);

    // sky dome
    const sky = new THREE.SphereGeometry(1400, 24, 14);
    const cols = [], top = new THREE.Color(th.sky), hor = new THREE.Color(th.horizon), fog = new THREE.Color(th.fog);
    const pa = sky.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 1400;
      const c = y < 0 ? fog.clone() : y < 0.06 ? fog.clone().lerp(hor, y / 0.06) : hor.clone().lerp(top, Math.min(1, Math.pow((y - 0.06) / 0.6, 0.7)));
      cols.push(c.r, c.g, c.b);
    }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1; sc.add(this.sky);
    if (th.indoor) this.sky.visible = false;
    if (th.space) {   // star field that travels with the camera
      const n = 1800, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1300); sp.set([v.x, Math.abs(v.y) * 0.9 - 80, v.z], i * 3); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false })));
    }
    if (th.sunDisc) {
      this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(th.sunDisc, 'rgba(255,255,255,0)'), fog: false, depthWrite: false }));
      this.sun.scale.setScalar(th.id === 'city' ? 90 : 160); sc.add(this.sun);
      this.sunDir = new THREE.Vector3(...th.sunDir).normalize();
    }

    // lights
    sc.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
    const dl = new THREE.DirectionalLight(th.sun[0], th.sun[1]); dl.position.set(...th.sunDir); sc.add(dl);

    // ground
    if (th.ground) {
      const B = tr.bounds, size = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) + 1600;
      const gt = th.ground(); gt.repeat.set(size / 14, size / 14);
      const gmat = new THREE.MeshLambertMaterial({ map: gt });
      if (th.id === 'volcano') { gmat.emissive = new THREE.Color('#ffffff'); gmat.emissiveMap = gt; gmat.emissiveIntensity = 0.12; }
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), gmat);
      ground.rotation.x = -Math.PI / 2; ground.position.set((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
      world.add(ground);
    }

    // track + curbs
    const tt = th.track();
    const tmat = new THREE.MeshLambertMaterial({ map: tt });
    if (th.id === 'volcano') { tmat.emissive = new THREE.Color('#ffffff'); tmat.emissiveMap = tt; tmat.emissiveIntensity = 0.15; }
    if (th.id === 'ice') { tmat.emissive = new THREE.Color('#2a5670'); }
    world.add(new THREE.Mesh(ribbon(tr, -W / 2, W / 2, 0.03, S0 + 10, LENGTH + 250, 2, 10), tmat));
    const curbM = th.curb === 'lava' ? M('#ff5a14', 'basic') : th.curb === 'neon' ? M('#46e0ff', 'basic') : M(th.curb);
    if (th.space) {   // metal deck beside the track, with glowing rails on the outer edge
      const gt = tex(64, 64, (g, w, h) => { g.fillStyle = '#2a2f3c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3d4456'; g.lineWidth = 3; for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
      const deck = new THREE.MeshLambertMaterial({ map: gt }), a = W / 2 + 1.2, b = W / 2 + OFF + 3.5;
      world.add(new THREE.Mesh(ribbon(tr, a, b, 0.02, S0 + 10, LENGTH + 250, 2, 3), deck));
      world.add(new THREE.Mesh(ribbon(tr, -b, -a, 0.02, S0 + 10, LENGTH + 250, 2, 3), deck));
      const rail = M('#ff4fd8', 'basic');
      world.add(new THREE.Mesh(ribbon(tr, b - 0.3, b, 0.05, S0 + 10, LENGTH + 250, 2, 3), rail));
      world.add(new THREE.Mesh(ribbon(tr, -b, -b + 0.3, 0.05, S0 + 10, LENGTH + 250, 2, 3), rail));
    }
    if (th.indoor) this.buildHouse(R, world);
    world.add(new THREE.Mesh(ribbon(tr, W / 2, W / 2 + 1.2, 0.05, S0 + 10, LENGTH + 250, 2, 10), curbM));
    world.add(new THREE.Mesh(ribbon(tr, -W / 2 - 1.2, -W / 2, 0.05, S0 + 10, LENGTH + 250, 2, 10), curbM));
    if (th.lavaRivers) {
      this.lavaTex = tex(64, 256, (g, w, h) => { speckle(g, w, h, '#ff5a10', ['#ffb020', '#ff2a00', '#ffd060', '#c82000'], 900, 2, 8); });
      const lm = new THREE.MeshBasicMaterial({ map: this.lavaTex });
      const a = W / 2 + OFF + 1.5;
      world.add(new THREE.Mesh(ribbon(tr, a, a + 8, 0.04, S0 + 10, LENGTH + 250, 2, 14), lm));
      world.add(new THREE.Mesh(ribbon(tr, -a - 8, -a, 0.04, S0 + 10, LENGTH + 250, 2, 14), lm));
    }
    // start & finish lines
    const ck = checker(14, 2); ck.repeat.set(1, 1);
    const ckM = new THREE.MeshLambertMaterial({ map: ck });
    world.add(new THREE.Mesh(ribbon(tr, -W / 2, W / 2, 0.06, -0.8, 0.8, 1.6, 1.6), ckM));
    world.add(new THREE.Mesh(ribbon(tr, -W / 2, W / 2, 0.06, LENGTH - 0.8, LENGTH + 0.8, 1.6, 1.6), ckM));
    this.buildArch(LENGTH, 'FINISH', world);
    this.buildArch(0, 'START', world);

    // scenery, kept clear of the track and the off-track strip
    const batches = {};
    const batch = (type, color) => (batches[type + (color || '')] ||= new Batch(SCN[type](color)));
    const tilt = th.id === 'city' ? 0 : 1;
    const edge = W / 2 + OFF + 1.5;
    for (let s = S0 + 20; s < LENGTH + 240; s += 7) {
      for (const side of [-1, 1]) {
        for (const [type, wgt, a, b, s1, s2, y1 = 0, y2 = 0, col] of th.scenery) {
          if (R() > wgt / 5) continue;
          const off = edge + a + R() * (b - a), ss = s + R() * 7;
          const p = tr.world(ss, side * off, y1 + R() * (y2 - y1), new THREE.Vector3());
          if (tr.clearance(p.x, p.z) < edge + (type === 'dune' ? 22 : type === 'building' ? 6 : 0.5)) continue;
          if (p.y !== 0 && Math.abs(p.y) < 4 && tr.clearance(p.x, p.z) < edge + 3) continue;
          const k = s1 + R() * (s2 - s1);
          if (type === 'building') {
            const bw = 6 + R() * 6, bh = 10 + R() * 40, bd = 6 + R() * 6;
            const h = tr.at(ss).h;
            const col = new THREE.Color().setHSL(0.6 + R() * 0.2, 0.25, 0.55 + R() * 0.3);
            batch('building').add(mat4(p.x, 0, p.z, 0, h, 0, bw, bh, bd), col);
            if (R() < 0.35) {
              const front = tr.world(ss, side * (off - bd / 2 - 0.15), 0, new THREE.Vector3());
              const nc = new THREE.Color().setHSL(R(), 1, 0.6);
              batch('neon').add(mat4(front.x, 4 + R() * Math.min(bh - 6, 14), front.z, 0, h, 0, 2 + R() * 3, 0.6 + R() * 1.2, 1), nc);
            }
          } else {
            batch(type, col).add(mat4(p.x, p.y, p.z, p.y ? R() * 6.28 : 0, R() * 6.28, 0, k, k * (0.85 + R() * 0.3 * tilt), k));
          }
        }
      }
    }
    if (th.lamps) {
      for (let s = 10; s < LENGTH + 200; s += 26) for (const side of [-1, 1]) {
        const ss = s + (side > 0 ? 13 : 0), h = tr.at(ss).h;
        const p = tr.world(ss, side * (W / 2 + OFF + 0.8), 0, new THREE.Vector3());
        batch('lamp').add(mat4(p.x, 0, p.z, 0, h + side * Math.PI / 2, 0));
        const g = tr.world(ss, side * (W / 2 - 1.5), 0, new THREE.Vector3());
        batch('glow').add(mat4(g.x, 0, g.z, 0, h, 0));
      }
    }
    Object.values(batches).forEach(b => b.build(world));
    buildLandmarks(th.landmarks, tr, world, th, R);

    this.buildObstacles(R, world);
    this.buildPickups(R, world);
    this.buildLaser();
    this.buildParticles();
    this.buildRacers();
  }

  // the house track: rooms one after another, each with its own floor, wallpaper and furniture
  buildHouse(R, world) {
    const tr = this.track, OFF = this.OFF, wl = W / 2 + OFF + 5, H = 9.5;
    const seg = Math.max(180, LENGTH / 6);
    this.roomSeg = seg;
    const batches = {};
    const batch = (key, parts) => (batches[key] ||= new Batch(parts()));
    const trim = M('#f4efe6');
    const ceilM = new THREE.MeshLambertMaterial({ color: '#fbf6ee', side: THREE.DoubleSide });
    for (let a = S0 + 10, i = 0; a < LENGTH + 250; a += seg, i++) {
      const b = Math.min(a + seg, LENGTH + 250), room = ROOMS[i % ROOMS.length];
      const ft = room.floor(); ft.repeat.set(wl * 2 / 6, 1);
      world.add(new THREE.Mesh(ribbon(tr, -wl, wl, 0.01, a, b, 2, 6), new THREE.MeshLambertMaterial({ map: ft })));
      const wt = room.wall();
      const wm = new THREE.MeshLambertMaterial({ map: wt, side: THREE.DoubleSide });
      world.add(new THREE.Mesh(wallStrip(tr, wl, 0, H, a, b, 2, 8), wm));
      world.add(new THREE.Mesh(wallStrip(tr, -wl, 0, H, a, b, 2, 8), wm));
      world.add(new THREE.Mesh(ribbon(tr, -wl, wl, H, a, b, 4, 20), ceilM));
      // doorway between rooms
      if (i > 0) {
        const h = tr.at(a).h, c = tr.world(a, 0, 0, new THREE.Vector3());
        batch('doorpost', () => [P(GEO.box(1.4, H, 1.4), trim)]).add(mat4(c.x - Math.cos(h) * (wl - 0.7), 0, c.z + Math.sin(h) * (wl - 0.7), 0, h, 0));
        batch('doorpost', () => [P(GEO.box(1.4, H, 1.4), trim)]).add(mat4(c.x + Math.cos(h) * (wl - 0.7), 0, c.z - Math.sin(h) * (wl - 0.7), 0, h, 0));
        batch('lintel', () => [P(GEO.box(1, 1.8, 1.4), trim)]).add(mat4(c.x, H - 1.8, c.z, 0, h, 0, wl * 2, 1, 1));
      }
      // furniture along both walls, pictures and windows on the walls, lamps on the ceiling
      for (let s = a + 8; s < b - 8; s += 10 + R() * 6) for (const side of [-1, 1]) {
        if (R() < 0.75) {
          const type = room.items[(R() * room.items.length) | 0];
          const depth = { sofa: 2.6, bed: 3.6, bathtub: 2.4, counter: 2.3, fridge: 2.3, wardrobe: 1.7, shelf: 1.4, table: 2.3 }[type] || 2;
          const p = tr.world(s, side * (wl - depth / 2 - 0.2), 0, new THREE.Vector3());
          batch(type + i, () => FURN[type](room.fabric)).add(mat4(p.x, 0, p.z, 0, tr.at(s).h + side * Math.PI / 2, 0));
        }
      }
      for (let s = a + 14; s < b - 10; s += 22 + R() * 10) for (const side of [-1, 1]) {
        const kind = R() < 0.45 ? 'window' : 'painting';
        const p = tr.world(s, side * (wl - 0.1), kind === 'window' ? 5.2 : 5.6, new THREE.Vector3());
        batch(kind, () => FURN[kind]()).add(mat4(p.x, p.y, p.z, 0, tr.at(s).h + side * Math.PI / 2, 0));
      }
      for (let s = a + 12; s < b - 6; s += 26) {
        const p = tr.world(s, 0, H - 0.05, new THREE.Vector3());
        batch('ceilLamp', () => [P(new THREE.CircleGeometry(1.4, 20), M('#fff6d8', 'basic'), 0, 0, 0, Math.PI / 2, 0, 0)]).add(mat4(p.x, p.y, p.z));
      }
    }
    Object.values(batches).forEach(b => b.build(world));
  }

  buildArch(s, text, world) {
    const th = this.theme, tr = this.track, h = tr.at(s).h;
    const c = tr.world(s, 0, 0, new THREE.Vector3());
    const g = new THREE.Group(); g.position.copy(c); g.rotation.y = h; world.add(g);
    const pm = M(th.id === 'city' ? '#ff3fa4' : th.id === 'volcano' ? '#2a2220' : '#f4f4f4');
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(GEO.box(0.6, 6.2, 0.6), pm); post.position.set(sx * (W / 2 + 0.9), 0, 0); g.add(post); }
    const bt = tex(512, 64, (ctx) => {
      for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(i * 16, j * 16, 16, 16); }
      ctx.fillStyle = text === 'FINISH' ? '#e8262b' : '#1f7ae0'; ctx.fillRect(140, 6, 232, 52);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 34);
    });
    bt.wrapS = THREE.ClampToEdgeWrapping;
    const ban = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 1.4, 0.3), [pm, pm, pm, pm, new THREE.MeshBasicMaterial({ map: bt }), new THREE.MeshBasicMaterial({ map: bt })]);
    ban.position.set(0, 5.6, 0); g.add(ban);
  }

  buildObstacles(R, world) {
    const th = this.theme, tr = this.track, d = this.diff, c = this.cfg;
    const obs = [];
    const pick = a => a[(R() * a.length) | 0];
    const half = W / 2;
    let id = 0;
    const place = (type, x, s, wOverride) => {
      const def = OBS[type];
      const o = { id: id++, type, s, x, h: def.h, w: wOverride || def.w, d: def.d, kind: def.kind, move: def.move || 0, ph: R() * 6.28 };
      obs.push(o); return o;
    };
    let s = 75;
    const O = th.obstacles;
    while (s < LENGTH - 60) {
      if (R() < c.wideShare / 100) {                     // jump-only barrier
        const full = R() < 0.55;
        const w = full ? W + 0.4 : W * (0.5 + R() * 0.2);
        const x = full ? 0 : (R() < 0.5 ? -1 : 1) * (half - w / 2);
        place(pick(O.wide), x, s, w);
      } else {
        const r = R();
        if (r < 0.45) {                                  // single block
          const t = pick(O.block);
          place(t, (R() - 0.5) * (W - OBS[t].w - 1), s);
        } else if (r < 0.85 || !O.moving.length) {       // pair leaving a gap
          const gapC = (R() - 0.5) * (W - 5), gapW = 3.2 + R() * 1.5;
          const t1 = pick(O.block), t2 = pick(O.block);
          const xl = gapC - gapW / 2 - OBS[t1].w / 2, xr = gapC + gapW / 2 + OBS[t2].w / 2;
          if (xl > -half + OBS[t1].w / 2) place(t1, xl, s + (R() - 0.5) * 2);
          if (xr < half - OBS[t2].w / 2) place(t2, xr, s + (R() - 0.5) * 2);
        } else {
          place(pick(O.moving), (R() - 0.5) * 6, s);
        }
      }
      s += c.obstacleGap * (0.65 + R() * 0.7) * d.density;
    }
    obs.sort((a, b) => a.s - b.s);
    this.obs = obs;

    const batches = {};
    this.movers = [];
    for (const o of obs) {
      const def = OBS[o.type], h = tr.at(o.s).h;
      const p = tr.world(o.s, o.x, 0, new THREE.Vector3());
      if (o.move) {
        const g = new THREE.Group();
        def.parts().forEach(pt => { const m = new THREE.Mesh(pt.geo, pt.mat); m.applyMatrix4(pt.m); g.add(m); });
        world.add(g); o.mesh = g; this.movers.push(o);
        continue;
      }
      const b = (batches[o.type] ||= new Batch(def.parts()));
      if (o.kind === 'wide') b.add(mat4(p.x, 0, p.z, 0, h, 0, o.w, 1, 1));
      else b.add(mat4(p.x, 0, p.z, 0, h, 0));
    }
    Object.values(batches).forEach(b => b.build(world));
  }

  // fish (stamina back to full) and catnip (bigger stamina bar for a while), spread evenly along the track
  buildPickups(R, world) {
    const tr = this.track, c = this.cfg, list = [];
    const free = (s, x, moving) => !this.obs.some(o => Math.abs(o.s - s) < o.d / 2 + 2 && (moving || Math.abs(o.x - x) < o.w / 2 + 1.2));
    const near = (s, d) => list.some(p => Math.abs(p.s - s) < d);
    // spread n items evenly along the track; make(s) returns the items to place there, or null if the spot is no good
    const spread = (n, shift, make) => {
      if (n <= 0) return;
      const span = (LENGTH - 180) / n;
      for (let i = 0; i < n; i++) for (let tries = 0; tries < 40; tries++) {
        const s = 90 + span * (i + 0.5) + (R() - 0.5) * span * 0.6 + shift;
        if (s > LENGTH - 40) continue;
        const items = make(s); if (!items) continue;
        list.push(...items); break;
      }
    };
    // fish always come in groups (a line or a diagonal), never alone
    const per = Math.max(3, Math.round(c.fishPerGroup)), gap = 2.4;
    spread(Math.round(c.fishGroups), 0, s => {
      const diag = R() < 0.5 ? 0 : (R() < 0.5 ? -0.75 : 0.75);
      const x0 = (R() - 0.5) * (W - 2.5 - Math.abs(diag) * per * 2);
      const items = [];
      for (let k = 0; k < per; k++) {
        const fs = s + k * gap, fx = Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, x0 + diag * (k - (per - 1) / 2)));
        if (!free(fs, fx) || near(fs, 3)) return null;
        items.push({ type: 'fish', s: fs, x: fx, taken: false });
      }
      return items;
    });
    const single = (type, n, shift, moving) => spread(n, shift, s => {
      const amp = moving ? Math.min(c.goldSway, W / 2 - 1.2) : 0, x = (R() - 0.5) * (W - 2.5 - amp * 2);
      if (!free(s, x, moving) || near(s, 5)) return null;
      return [{ type, s, x, x0: x, amp, gold: type === 'gold', ph: R() * 6.28, taken: false }];
    });
    single('gold', Math.round(c.goldCount), 23, true);
    single('catnip', Math.round(c.catnipCount), 47, false);
    single('ghost', Math.round(c.ghostCount), 71, false);
    list.sort((a, b) => a.s - b.s);
    this.pickups = list;

    const fbody = GEO.sphere(0.32, 10, 8); fbody.scale(1, 0.55, 0.32);
    const ftail = new THREE.ConeGeometry(0.22, 0.3, 4); ftail.rotateZ(Math.PI / 2); ftail.translate(-0.42, 0, 0);
    const fm = M('#5ec8ff', 'lambert', { emissive: '#1e6aa0' }), tm = M('#ffb02e', 'lambert', { emissive: '#7a4a00' });
    const gm = M('#ffd23a', 'lambert', { emissive: '#8a5a00' }), gtm = M('#ff7a1a', 'lambert', { emissive: '#7a2a00' });
    const goldGlow = new THREE.SpriteMaterial({ map: radialTex('rgba(255,220,80,0.85)', 'rgba(255,180,0,0)'), depthWrite: false, blending: THREE.AdditiveBlending });
    const eyeG = GEO.sphere(0.04, 6, 4), eyeM = M('#111', 'basic');
    const leaf = GEO.sphere(0.5, 8, 6); leaf.scale(0.22, 0.05, 0.42);
    const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.8, 5); stem.translate(0, 0.4, 0);
    const leafM = M('#6cff5a', 'lambert', { emissive: '#1f7a12' }), stemM = M('#3c8a2a');
    const glowM = new THREE.SpriteMaterial({ map: radialTex('rgba(140,255,110,0.8)', 'rgba(80,255,60,0)'), depthWrite: false, blending: THREE.AdditiveBlending });
    const ghostM = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#8aa0c8', transparent: true, opacity: 0.85 });
    const ghostGlow = new THREE.SpriteMaterial({ map: radialTex('rgba(190,220,255,0.7)', 'rgba(150,190,255,0)'), depthWrite: false, blending: THREE.AdditiveBlending });
    const ghostG = { head: new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body: new THREE.CylinderGeometry(0.45, 0.48, 0.6, 16, 1, true), hem: new THREE.ConeGeometry(0.13, 0.22, 6), eye: GEO.sphere(0.07, 8, 6) };
    ghostG.head.translate(0, 0.1, 0); ghostG.body.translate(0, -0.2, 0);
    for (const p of list) {
      const g = new THREE.Group();
      if (p.type === 'fish' || p.type === 'gold') {
        g.add(new THREE.Mesh(fbody, p.gold ? gm : fm)); g.add(new THREE.Mesh(ftail, p.gold ? gtm : tm));
        if (p.gold) { const gl = new THREE.Sprite(goldGlow); gl.scale.setScalar(1.6); g.add(gl); g.scale.setScalar(1.15); }
        const eye = new THREE.Mesh(eyeG, eyeM); eye.position.set(0.18, 0.05, 0.1); g.add(eye);
      } else if (p.type === 'ghost') {
        g.add(new THREE.Mesh(ghostG.body, ghostM)); g.add(new THREE.Mesh(ghostG.head, ghostM));
        for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(ghostG.hem, ghostM); const a = k / 5 * Math.PI * 2; t.position.set(Math.cos(a) * 0.36, -0.42, Math.sin(a) * 0.36); t.rotation.x = Math.PI; g.add(t); }
        for (const sx of [-0.15, 0.15]) { const e = new THREE.Mesh(ghostG.eye, eyeM); e.position.set(sx, 0.3, 0.4); e.scale.set(0.7, 1.2, 0.5); g.add(e); }
        const mo = new THREE.Mesh(ghostG.eye, eyeM); mo.position.set(0, 0.08, 0.43); mo.scale.set(0.8, 1.1, 0.4); g.add(mo);
        const gl = new THREE.Sprite(ghostGlow); gl.scale.setScalar(2.2); g.add(gl);
        p.ghost = true;
      } else {
        const sprig = new THREE.Group(); sprig.position.y = -0.45; g.add(sprig);
        sprig.add(new THREE.Mesh(stem, stemM));
        for (let k = 0; k < 6; k++) {
          const l = new THREE.Mesh(leaf, leafM);
          const yy = 0.2 + (k >> 1) * 0.22, side = k % 2 ? 1 : -1;
          l.position.set(side * 0.16, yy, 0); l.rotation.set(0, side * 0.3 + (k >> 1) * 1.2, side * -0.5);
          sprig.add(l);
        }
        const glow = new THREE.Sprite(glowM); glow.scale.setScalar(1.8); g.add(glow);
      }
      tr.world(p.s, p.x, 1.0, g.position); g.rotation.y = tr.at(p.s).h;
      world.add(g); p.mesh = g;
    }
  }

  // the red laser dot the cats are all chasing, always just ahead of the leader
  buildLaser() {
    const g = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: '#ff1a1a', depthWrite: false }));
    dot.rotation.x = -Math.PI / 2; g.add(dot);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,40,40,0.9)', 'rgba(255,0,0,0)'), depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.3); glow.position.y = 0.15; g.add(glow);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,60,60,0.55)', 'rgba(255,0,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.01; g.add(halo);
    this.scene.add(g); this.laser = g; this.laserS = 8; this.laserX = 0;
  }

  updateLaser(dt) {
    let lead = -1e9;
    for (const r of this.racers) lead = Math.max(lead, r.s);
    const t = this.clock;
    const ahead = this.state === 'countdown' ? 5 : 7 + Math.sin(t * 1.3) * 2.5 + Math.sin(t * 3.7) * 0.8;
    this.laserS = lead + ahead;
    const lim = W / 2 - 1.2;
    const x = (Math.sin(t * 0.9) * 0.55 + Math.sin(t * 2.3 + 1) * 0.3 + Math.sin(t * 5.1) * 0.15) * lim;
    this.laserX = x + (Math.random() - 0.5) * 0.06;   // a little hand shake
    this.track.world(this.laserS, this.laserX, 0.07, this.laser.position);
  }

  buildParticles() {
    const p = this.theme.particles; if (!p) return;
    const pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * (p.mode === 'dust' ? 3 : 18); pos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: p.color, size: p.size, transparent: true, opacity: 0.9, depthWrite: false, blending: p.mode === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.particles = new THREE.Points(g, m); this.particles.frustumCulled = false;
    this.scene.add(this.particles); this.pmode = p.mode;
  }

  buildRacers() {
    const pl = this.o.player, c = this.cfg;
    const names = BOT_NAMES.filter(n => n.toLowerCase() !== (pl.name || '').toLowerCase()).sort(() => Math.random() - 0.5);
    const grid = [[0, -4], [0, 0], [0, 4], [-5, -4], [-5, 4]];
    this.racers = [];
    const sweatTex = tex(64, 64, g => {
      g.fillStyle = '#7fd4ff';
      for (const [x, y, s] of [[20, 26, 11], [44, 18, 8], [40, 44, 9]]) {
        g.beginPath(); g.moveTo(x, y - s * 1.6); g.quadraticCurveTo(x + s, y, x, y + s); g.quadraticCurveTo(x - s, y, x, y - s * 1.6); g.fill();
      }
    });
    const mk = (cfg, s, x, isPlayer) => {
      const r = new Racer({ ...cfg, s, x, isPlayer }, c);
      r.cat = buildCat(cfg);
      r.cat.root.visible = !isPlayer;
      this.scene.add(r.cat.root);
      const sh = new THREE.Mesh(GEO.plane(), new THREE.MeshBasicMaterial({ map: this.shadowTex ||= radialTex('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
      sh.scale.set(1.4, 1, 2.2); this.scene.add(sh); r.shadow = sh;
      if (!isPlayer) {
        r.tag = this.nameTag(cfg.name, r.cat.furColor); this.scene.add(r.tag);
        r.sweat = new THREE.Sprite(new THREE.SpriteMaterial({ map: sweatTex, depthWrite: false })); r.sweat.scale.setScalar(0.8); r.sweat.visible = false; this.scene.add(r.sweat);
      }
      this.racers.push(r); return r;
    };
    this.player = mk({ ...pl, speedStat: pl.speed, jumpStat: pl.jump }, -5, 0, true);
    const rnd = Math.random, furs = FURS.filter(f => f.id !== pl.fur).sort(() => rnd() - 0.5);
    const skill = c[this.diff.id + 'Skill'] / 100;
    for (let i = 0; i < 5; i++) {
      const sp = 3 + Math.floor(rnd() * 5);
      mk({
        name: names[i], fur: furs[i % furs.length].id, eyes: EYES[(rnd() * EYES.length) | 0].id, pattern: PATTERNS[(rnd() * PATTERNS.length) | 0].id,
        gender: rnd() < 0.5 ? 'male' : 'female', speedStat: sp, jumpStat: 10 - sp, skill,
      }, grid[i][0], grid[i][1], false);
    }
    this.racers.forEach(r => { r.botJitter = 0.97 + rnd() * 0.06; r.greedy = rnd() < this.diff.greedy; });
    this.buildPaws();
  }

  nameTag(name, color) {
    const t = tex(256, 64, (g) => {
      g.fillStyle = 'rgba(10,10,20,0.6)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
      g.fillStyle = color; g.beginPath(); g.arc(34, 32, 13, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 30px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(name.slice(0, 12), 56, 33);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
    s.scale.set(2.0, 0.5, 1); return s;
  }

  buildPaws() {
    const pl = this.player.cat, o = this.o.player;
    const furM = new THREE.MeshLambertMaterial({ color: pl.furColor }), pawM = new THREE.MeshLambertMaterial({ color: o.pattern === 'socks' ? '#fbfbf7' : pl.furColor }), bean = new THREE.MeshLambertMaterial({ color: '#f29bb0' });
    this.pawMats = [furM, pawM, bean];
    this.paws = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8), furM);
      leg.rotation.x = -1.25; leg.position.set(0, -0.05, 0.05); g.add(leg);
      const paw = new THREE.Mesh(GEO.sphere(0.085, 10, 8), pawM); paw.scale.set(1, 0.65, 1.2); paw.position.set(0, 0.03, -0.27); g.add(paw);
      for (const bx of [-0.04, 0, 0.04]) { const b = new THREE.Mesh(GEO.sphere(0.018, 6, 4), bean); b.position.set(bx, -0.02, -0.34); g.add(b); }
      g.position.set(sx * 0.2, -0.42, -0.5); g.scale.setScalar(0.85);
      this.camera.add(g); this.paws.push(g);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.baseFov = w < h ? 82 : 64;
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
  }

  rank(r) {
    let n = 1;
    for (const o of this.racers) if (o !== r && this.ahead(o, r)) n++;
    return n;
  }
  ahead(a, b) {
    if (a.finished && b.finished) return a.finishTime < b.finishTime;
    if (a.finished !== b.finished) return a.finished;
    return a.s > b.s;
  }

  pickX(p) { return p.amp ? p.x0 + Math.sin(this.clock * this.cfg.goldSpeed + p.ph) * p.amp : p.x; }

  obsX(o) { return o.move ? o.x + Math.sin(this.clock * 1.4 + o.ph) * o.move : o.x; }

  firstObs(s) {
    const a = this.obs; let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].s < s) lo = m + 1; else hi = m; }
    return lo;
  }

  jump(r) {
    if (r.y > 0 || r.stumble > 0.5) return false;
    r.vy = r.jumpV; r.y = 0.001;
    if (r.isPlayer) this.events('jump');
    return true;
  }

  kmh(r) { return r.speed / this.pace; }

  setView(v) { this.view = v; this.camX = undefined; }

  update(dt, input) {
    this.clock += dt;
    if (this.state === 'countdown') {
      this.count -= dt;
      const c = Math.ceil(this.count);
      if (c !== this.lastCount && c <= 3 && c >= 1) { this.lastCount = c; this.events('count', c); }
      if (this.count <= 0) { this.state = 'race'; this.events('go'); }
      input.jumpBuf = 0;
      this.racers.forEach(r => r.cat.update(dt, 0, false));
    } else {
      this.time += dt;
      const steps = Math.ceil(dt / (1 / 90));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.step(h, input);
      if (this.state === 'done') {
        this.doneT += dt;
        if (this.doneT > 3.2 && !this.resultsSent) { this.resultsSent = true; this.events('results', this.results()); }
      }
    }
    this.animate(dt);
  }

  step(dt, input) {
    const th = this.theme, diff = this.diff, pl = this.player, c = this.cfg;
    const half = W / 2;
    for (const r of this.racers) {
      if (r.isPlayer) {
        if (this.state === 'done') { r.steer = 0; r.wantSprint = false; r.throttle = 0; }
        else {
          r.steer = input.steer; r.wantSprint = input.sprint; r.throttle = input.throttle || 0;
          if (input.jumpBuf > 0 && this.jump(r)) input.jumpBuf = 0;
        }
      } else {
        this.think(r, dt);
      }
      if (r.bumpCd > 0) r.bumpCd -= dt;

      // catnip wears off
      if (r.nipT > 0) {
        r.nipT -= dt;
        if (r.nipT <= 0) { r.nipT = 0; r.maxSt = 100; r.stamina = Math.min(r.stamina, 100); if (r.isPlayer) this.events('nipEnd'); }
      }

      if (r.ghostT > 0) { r.ghostT -= dt; if (r.ghostT <= 0) { r.ghostT = 0; if (r.isPlayer) this.events('ghostEnd'); } }

      // stamina: sprinting (or accelerating) drains it, anything else refills it; running dry means exhaustion
      r.sprint = r.wantSprint && !r.exhausted && r.stumble <= 0 && !r.finished && r.stamina > 0;
      const accel = !r.sprint && !r.exhausted && r.throttle > 0.05 ? r.throttle : 0;
      if (r.sprint || (accel && c.accelDrain > 0)) {
        r.stamina -= (r.sprint ? c.staminaDrain : c.accelDrain * accel) * dt;
        if (r.stamina <= 0) {
          r.stamina = 0; r.sprint = false; r.exhausted = true;
          if (r.isPlayer) this.events('exhausted');
        }
      } else {
        r.stamina = Math.min(r.maxSt, r.stamina + c.staminaRegen * (r.throttle < -0.05 ? c.brakeRegen : 1) * dt);
      }
      if (r.exhausted && r.stamina >= c.recoverAt) { r.exhausted = false; if (r.isPlayer) this.events('recovered'); }

      // forward speed
      let kmh = r.exhausted ? c.exhaustedKmh : r.sprint ? r.sprKmh : r.nomKmh;
      if (!r.exhausted && !r.sprint && r.throttle > 0) kmh += (Math.min(c.maxKmh, r.nomKmh + c.accelKmh) - r.nomKmh) * r.throttle;
      if (!r.sprint && r.throttle < 0) kmh += (Math.min(kmh, c.brakeKmh) - kmh) * -r.throttle;
      let target = kmh * this.pace;
      if (!r.isPlayer) target *= (c[diff.id + 'Speed'] / 100) * r.mul * r.botJitter;
      const wasOff = r.offTrack;
      r.offTrack = Math.abs(r.x) > half + 0.25;
      if (r.offTrack) target *= c.offTrackKeep / 100;
      if (r.isPlayer && r.offTrack && !wasOff && this.state === 'race' && this.offMsgT <= 0) { this.offMsgT = 3; this.events('offtrack'); }
      if (r.finished) target = Math.max(0, 7 - (this.time - r.finishTime) * 1.4);
      if (r.stumble > 0) { target *= 0.35; r.stumble -= dt; }
      const k = r.speed < target ? 1.3 : (r.offTrack ? 3.5 : 2.5);
      r.speed += (target - r.speed) * Math.min(1, k * dt);
      r.s += r.speed * dt;

      // lateral
      const kl = (th.slippery ? 2.0 : 9) * (r.y > 0 ? 0.35 : 1);
      r.vx += (r.steer * 10 - r.vx) * Math.min(1, kl * dt);
      r.x += r.vx * dt;
      const lim = r.isPlayer ? half + Math.max(0, this.OFF - 0.45) : half - 0.55;
      if (r.x > lim) { r.x = lim; r.vx = th.slippery ? -Math.abs(r.vx) * 0.4 : 0; }
      if (r.x < -lim) { r.x = -lim; r.vx = th.slippery ? Math.abs(r.vx) * 0.4 : 0; }

      // vertical
      if (r.y > 0) {
        r.vy -= G * dt; r.y += r.vy * dt;
        if (r.y <= 0) { r.y = 0; r.vy = 0; if (r.isPlayer) this.events('land'); }
      }

      // obstacles (a ghost cat runs straight through them)
      for (let i = r.ghostT > 0 ? this.obs.length : this.firstObs(r.s - 4); i < this.obs.length; i++) {
        const o = this.obs[i];
        if (o.s > r.s + 4) break;
        if (o.id === r.hitId) continue;
        if (Math.abs(o.s - r.s) > o.d / 2 + 0.55) continue;
        const ox = this.obsX(o);
        if (Math.abs(ox - r.x) > o.w / 2 + 0.38) continue;
        if (r.y > o.h) continue;
        this.hit(r, o, ox);
      }

      // finish
      if (!r.finished && r.s >= LENGTH) {
        r.finished = true; r.sprint = false;
        r.finishTime = this.time - (r.s - LENGTH) / Math.max(1, r.speed);
        if (r.isPlayer) { this.state = 'done'; this.events('finish', this.rank(r)); }
      }
    }
    if (this.offMsgT > 0) this.offMsgT -= dt;

    // power-ups (player only)
    if (this.state === 'race') {
      for (const p of this.pickups) {
        if (p.taken || Math.abs(p.s - pl.s) > 1.3 || Math.abs(this.pickX(p) - pl.x) > 1.1 || pl.y > 2.2) continue;
        p.taken = true; p.mesh.visible = false;
        if (p.type === 'ghost') {
          pl.ghostT = c.ghostDuration; this.events('ghost');
        } else if (p.type === 'fish' || p.type === 'gold') {
          pl.stamina = pl.maxSt; pl.exhausted = false;
          const pts = p.gold ? c.goldPoints : c.fishPoints;
          this.score += pts; this.fishCaught++; if (p.gold) this.goldCaught++;
          this.events('fish', pts, p.gold);
        } else {
          pl.nipT = c.catnipDuration; pl.maxSt = 100 + c.catnipBonus;
          pl.stamina = Math.min(pl.maxSt, pl.stamina + c.catnipBonus);
          if (pl.stamina >= c.recoverAt) pl.exhausted = false;
          this.events('catnip');
        }
      }
      if (!this.finalStretch && pl.s > LENGTH - 180) { this.finalStretch = true; this.events('msg', 'Final stretch!'); }
      if (this.roomSeg) {
        const ri = Math.floor((pl.s - S0 - 10) / this.roomSeg);
        if (ri !== this.room) { if (this.room !== undefined && pl.s > 0) { const rm = ROOMS[ri % ROOMS.length]; this.events('msg', `${rm.emoji} ${rm.name}`); } this.room = ri; }
      }
    }

    // cat vs cat bumps: push apart, both lose speed, the player's cat hisses
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.ghostT > 0 || b.ghostT > 0) continue;
      if (Math.abs(a.s - b.s) > 1.4 || Math.abs(a.y - b.y) > 0.6) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) > 0.9) continue;
      const push = (0.9 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
      if (a.bumpCd <= 0 && b.bumpCd <= 0 && !a.finished && !b.finished) {
        a.speed *= c.bumpKeep / 100; b.speed *= c.bumpKeep / 100;
        a.bumpCd = b.bumpCd = 1.2;
        a.vx -= Math.sign(dx || 1) * 3; b.vx += Math.sign(dx || 1) * 3;
        if (a.isPlayer || b.isPlayer) { this.shake = 0.25; this.events('bump', (a.isPlayer ? b : a).name); }
      }
    }
  }

  hit(r, o, ox) {
    const c = this.cfg;
    r.hitId = o.id;
    r.speed *= c.hitKeep / 100; r.stumble = c.stumbleTime;
    r.vx = (r.x >= ox ? 1 : -1) * 4;
    if (r.y > 0) r.vy = Math.min(r.vy, 0);
    if (r.isPlayer) { this.shake = 0.6; this.events('hit'); }
  }

  think(r, dt) {
    const diff = this.diff, pl = this.player;
    // keep the pack together a little
    const gap = r.s - pl.s;
    const want = this.state === 'done' ? 1 : gap > 35 ? diff.ahead : gap < -30 ? diff.behind : 1;
    r.mul += (want - r.mul) * Math.min(1, dt * 0.5);
    // sprint bursts; careful bots stop at 20% stamina, greedy ones run themselves dry
    if (r.exhausted) r.botSprint = false;
    else {
      if (!r.botSprint && r.stamina > 80 && Math.random() < diff.sprint * dt * 0.7) r.botSprint = true;
      if (diff.id === 'lion' && r.s > LENGTH - 220 && r.stamina > 30) r.botSprint = true;
      if (r.stamina < (r.greedy ? 0.5 : 20)) r.botSprint = false;
    }
    r.wantSprint = r.botSprint;
    // wander between lanes
    r.wander -= dt;
    if (r.wander < 0) {   // chase the laser dot, more or less
      r.wander = 1.5 + Math.random() * 3;
      const want = (this.laserX || 0) + (Math.random() - 0.5) * 6;
      r.tx = Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, want));
    }
    // obstacles ahead
    const look = r.speed * 1.0 + 7;
    for (let i = this.firstObs(r.s - 0.5); i < this.obs.length; i++) {
      const o = this.obs[i];
      const dist = o.s - r.s;
      if (dist > look) break;
      if (o.id === r.hitId || dist < -o.d / 2) continue;
      const ox = this.obsX(o), m = o.w / 2 + 0.75;
      if (Math.abs(r.x - ox) > m && Math.abs(r.tx - ox) > m) continue;
      let dec = r.dec.get(o.id);
      if (!dec) {
        const canJump = o.h < r.jumpH - 0.3;
        dec = { see: Math.random() < r.skill, jump: canJump && (o.kind === 'wide' ? Math.random() < 0.85 : Math.random() < 0.45), err: (Math.random() - 0.5) * (1 - r.skill) * 6 };
        if (o.kind === 'wide' && o.w > W) dec.jump = canJump;
        r.dec.set(o.id, dec);
      }
      if (!dec.see) continue;
      if (dec.jump) {
        if (r.y === 0 && dist < r.speed * r.tApex + dec.err + 0.3) this.jump(r);
      } else {
        r.tx = this.freeLane(r, look);
      }
      break;
    }
    r.steer = Math.max(-1, Math.min(1, (r.tx - r.x) * 0.6));
  }

  freeLane(r, look) {
    let best = r.x, bd = 1e9;
    for (let x = -W / 2 + 0.9; x <= W / 2 - 0.9; x += 0.5) {
      let ok = true;
      for (let i = this.firstObs(r.s); i < this.obs.length; i++) {
        const o = this.obs[i]; if (o.s - r.s > look) break;
        const dec = r.dec.get(o.id);
        if (dec && dec.jump) continue;
        if (Math.abs(x - this.obsX(o)) < o.w / 2 + 0.8) { ok = false; break; }
      }
      const d = Math.abs(x - r.x);
      if (ok && d < bd) { bd = d; best = x; }
    }
    return best;
  }

  animate(dt) {
    const tr = this.track, cam = this.camera, pl = this.player, v = this.tmp;
    for (const r of this.racers) {
      const c = r.cat;
      tr.world(r.s, r.x, r.y, c.root.position);
      const h = tr.at(r.s).h;
      c.root.rotation.y = h + Math.atan2(-r.vx, Math.max(4, r.speed)) * 0.8;
      c.root.rotation.z = r.stumble > 0 ? Math.sin(this.clock * 30) * 0.15 : 0;
      c.root.rotation.x = r.exhausted ? 0.12 : 0;
      c.update(dt, r.speed * (r.exhausted ? 1.4 : 1), r.y > 0.05);
      tr.world(r.s, r.x, 0.06, r.shadow.position); r.shadow.rotation.y = h;
      const k = 1 - Math.min(0.6, r.y / 3); r.shadow.scale.set(1.4 * k, 1, 2.2 * k);
      if (r.tag) {
        tr.world(r.s, r.x, r.y + 1.85, r.tag.position);
        r.tag.visible = r.s - pl.s > 2.5 && r.s - pl.s < 70;
        r.sweat.visible = r.exhausted && Math.abs(r.s - pl.s) < 60;
        if (r.sweat.visible) tr.world(r.s, r.x + 0.5, r.y + 1.45 + Math.abs(Math.sin(this.clock * 6)) * 0.15, r.sweat.position);
      }
    }
    for (const o of this.movers) {
      tr.world(o.s, this.obsX(o), 0, o.mesh.position);
      o.mesh.rotation.z += dt * 3; o.mesh.rotation.y = tr.at(o.s).h;
    }
    for (const p of this.pickups) if (!p.taken && Math.abs(p.s - pl.s) < 120) {
      if (p.ghost) { tr.world(p.s, p.x + Math.sin(this.clock * 1.7 + p.ph) * 0.4, 1.0, p.mesh.position); p.mesh.rotation.y = tr.at(p.s).h + Math.PI + Math.sin(this.clock * 2) * 0.5; p.mesh.position.y = 1.1 + Math.sin(this.clock * 3 + p.s) * 0.2; continue; }
      if (p.amp) { tr.world(p.s, this.pickX(p), 1.0, p.mesh.position); p.mesh.rotation.y = tr.at(p.s).h + (Math.cos(this.clock * this.cfg.goldSpeed + p.ph) > 0 ? Math.PI : 0); }
      else p.mesh.rotation.y += dt * 3;
      p.mesh.position.y = 1.0 + Math.sin(this.clock * 4 + p.s) * 0.15;
    }
    if (this.lavaTex) this.lavaTex.offset.y -= dt * 0.15;
    this.updateLaser(dt);
    // ghost: the player's cat (paws or body) turns see-through, flickering just before it ends
    const ga = pl.ghostT > 0 ? (pl.ghostT < 1.2 && Math.sin(this.clock * 30) > 0 ? 0.8 : 0.3) : 1;
    if (ga !== this.ghostA) { this.ghostA = ga; pl.cat.setOpacity(ga); this.pawMats.forEach(m => { if (m.transparent !== ga < 1) m.needsUpdate = true; m.transparent = ga < 1; m.opacity = ga; }); }
    for (const r of this.racers) if (!r.isPlayer) { const a = r.ghostT > 0 ? 0.35 : 1; if (r.alpha !== a) { r.alpha = a; r.cat.setOpacity(a); } }

    // camera
    if (this.state === 'done') {
      pl.cat.root.visible = true;
      this.paws.forEach(p => p.visible = false);
      this.orbit += dt * 0.6;
      const h = tr.at(pl.s).h, a = h + Math.PI - 0.6 + this.orbit;
      const c = pl.cat.root.position;
      cam.position.set(c.x + Math.sin(a) * 3.6, 1.6, c.z + Math.cos(a) * 3.6);
      cam.lookAt(c.x, 0.9, c.z);
      cam.fov += (55 - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix();
    } else if (this.view === 'third') {
      // behind and above the cat
      pl.cat.root.visible = true; this.paws.forEach(p => p.visible = false);
      const sway = pl.exhausted ? Math.sin(this.clock * 3.2) * 0.1 : 0;
      this.camX = this.camX === undefined ? pl.x : this.camX + (pl.x - this.camX) * Math.min(1, dt * 6);
      tr.world(pl.s - 4.6, this.camX * 0.9, 2.7 + pl.y * 0.5, cam.position);
      tr.world(pl.s + 7, this.camX + pl.vx * 0.2 + sway, 0.9 + pl.y * 0.4, v);
      cam.lookAt(v);
      if (this.shake > 0) { this.shake -= dt; const sh = this.shake * 0.15; cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh; }
      const fov = this.baseFov + (pl.speed / 30) * 5 + (pl.sprint ? 7 : 0);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
    } else {
      pl.cat.root.visible = false; this.paws.forEach(p => p.visible = true);
      const run = Math.min(1, pl.speed / 20);
      const tired = pl.exhausted;
      const ph = this.clock * (pl.speed * 0.5 + 3) * (tired ? 0.7 : 1);
      const bob = pl.y > 0 ? 0 : Math.abs(Math.sin(ph)) * (tired ? 0.14 : 0.07) * Math.max(run, tired ? 0.6 : 0);
      const sway = tired ? Math.sin(this.clock * 3.2) * 0.12 : 0;
      tr.world(pl.s + 0.5, pl.x + sway, EYE + pl.y + bob - (tired ? 0.12 : 0), cam.position);
      tr.world(pl.s + 12, pl.x + pl.vx * 0.25 + sway * 2, EYE * 0.75 + pl.y * 0.55 - (tired ? 0.5 : 0), v);
      cam.lookAt(v);
      cam.rotateZ(-pl.vx * 0.012 + sway * 0.3);
      let sh = this.shake > 0 ? this.shake * 0.12 : 0;
      if (this.shake > 0) this.shake -= dt;
      if (pl.offTrack && pl.y === 0) sh += 0.025;
      if (sh > 0) {
        cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh;
        cam.rotateZ((Math.random() - 0.5) * sh);
      }
      const fov = this.baseFov + (pl.speed / 30) * 6 + (pl.sprint ? 9 : 0);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
      const air = pl.y > 0.05;
      this.paws.forEach((p, i) => {
        const q = ph + i * Math.PI;
        const ty = air ? -0.42 : -0.44 + Math.sin(q) * 0.07 * run - (tired ? 0.05 : 0);
        const tz = air ? -0.52 : -0.5 - Math.cos(q) * 0.09 * run;
        p.position.y += (ty - p.position.y) * Math.min(1, dt * 18);
        p.position.z += (tz - p.position.z) * Math.min(1, dt * 18);
        p.rotation.x = air ? -0.15 : Math.sin(q) * 0.25 * run;
      });
    }
    if (this.sun) this.sun.position.copy(cam.position).addScaledVector(this.sunDir, 900);
    this.sky.position.copy(cam.position);

    // particles
    if (this.particles) {
      const a = this.particles.geometry.attributes.position, arr = a.array, cp = cam.position, n = arr.length / 3, mode = this.pmode;
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        if (mode === 'snow') { y -= dt * 2.2; x += Math.sin(this.clock + i) * dt * 0.6; }
        else if (mode === 'embers') { y += dt * (1.5 + (i % 5) * 0.4); x += Math.sin(this.clock * 2 + i) * dt * 0.8; }
        else if (mode === 'leaves') { y -= dt * 0.8; x += Math.sin(this.clock * 1.5 + i) * dt * 1.2; }
        else { x += dt * 6; y = (y + dt * 0.2) % 3; }
        if (x - cp.x > 40) x -= 80; if (x - cp.x < -40) x += 80;
        if (z - cp.z > 40) z -= 80; if (z - cp.z < -40) z += 80;
        if (mode === 'embers' ? y > 18 : y < 0) y = mode === 'embers' ? 0 : 18;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      a.needsUpdate = true;
    }
  }

  results() {
    const t = this.time;
    for (const r of this.racers) if (!r.finished) { r.finishTime = t + (LENGTH - r.s) / Math.max(8, r.speed * 0.9); r.finished = true; }
    return [...this.racers].sort((a, b) => a.finishTime - b.finishTime).map(r => ({ name: r.name, time: r.finishTime, isPlayer: r.isPlayer, color: r.cat.furColor }));
  }

  progress() {
    return this.racers.map(r => ({ p: Math.max(0, Math.min(1, r.s / LENGTH)), isPlayer: r.isPlayer, color: r.cat.furColor }));
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach(m => { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); });
    });
    this.racers.forEach(r => r.cat.dispose());
    MC.clear();
  }
}

window.WRGame = { Race, TRACKS, DIFFS, TUNING, DEFAULTS };
})();
