// The four cars: real road-car homologation figures, the game stats derived from them, and low-poly models.
import * as THREE from '../vendor/three.module.min.js';
import { box, hexa, merge, lambert } from './gfx.js';

// ps = metric horsepower, kg = kerb weight, kmh = claimed top speed, wb = wheelbase (mm), len = length (mm)
export const CARS = [
  { id: 'delta', name: 'Lancia Delta HF Integrale', short: 'DELTA HF', ver: 'Evoluzione II · 1993', ps: 215, kg: 1340, kmh: 220, wb: 2480, len: 3900,
    body: 0xf2f1ec, accent: 0xc8202a, accent2: 0x1d2f74, rim: 0xdedede, shape: 'hatch' },
  { id: 'impreza', name: 'Subaru Impreza WRX', short: 'IMPREZA', ver: 'GC8 · 1994', ps: 240, kg: 1230, kmh: 230, wb: 2520, len: 4340,
    body: 0x1c3a9a, accent: 0xf3c517, accent2: 0xf3c517, rim: 0xc9a33a, shape: 'sedan' },
  { id: 'celica', name: 'Toyota Celica GT-Four', short: 'CELICA', ver: 'ST205 · 1994', ps: 255, kg: 1390, kmh: 245, wb: 2545, len: 4420,
    body: 0xf0efe8, accent: 0xc3161c, accent2: 0x1b8a3c, rim: 0xd8d8d8, shape: 'coupe' },
  { id: 'evo', name: 'Mitsubishi Lancer Evo III', short: 'EVO III', ver: 'CE9A · 1995', ps: 270, kg: 1260, kmh: 239, wb: 2510, len: 4310,
    body: 0xf4f4f4, accent: 0xd0121b, accent2: 0x222222, rim: 0xe0e0e0, shape: 'wing' },
];

// Game physics from the specs:
//  top speed = claimed top speed; acceleration from power-to-weight;
//  handling from weight and wheelbase (lighter + shorter = nimbler); mass drives collisions and braking.
for (const c of CARS) {
  c.vmax = c.kmh / 3.6;
  c.psT = Math.round(c.ps / c.kg * 1000);
  c.accel = 2.1 + c.psT * 0.022;
  c.handling = Math.max(0.3, Math.min(1, 1 - (c.kg - 1230) / 1000 * 0.9 - (c.wb - 2480) / 100 * 0.5));
  c.grip = 9.81 * (1.22 + 0.3 * c.handling); // arcade tyres: a bit more grip than real life
  c.turn = 1.45 + 0.6 * c.handling;
  c.brake = 13 * Math.pow(1230 / c.kg, 0.4);
  c.mass = c.kg;
  c.bars = {
    speed: (c.kmh - 195) / 55,
    accel: (c.psT - 140) / 80,
    handling: c.handling,
    weight: (c.kg - 1000) / 450,
  };
}

const GLASS = 0x1b2330, BLACK = 0x161616, LIGHT = 0xfff3c4, TAIL = 0xb0101a;

export function buildCar(spec) {
  const B = spec.body, A = spec.accent, A2 = spec.accent2;
  const L = spec.len / 1000, hl = L / 2, hw = 0.86, wbh = spec.wb / 2000;
  const parts = [];
  const shape = spec.shape;
  // lower body with sloping hood and tail
  const belt = shape === 'coupe' ? 0.9 : 0.96, hoodY = shape === 'hatch' ? 0.9 : 0.86;
  const v = (x, y, z) => [x, y, z];
  parts.push(hexa([
    v(-hw, 0.32, -hl), v(hw, 0.32, -hl), v(hw, 0.32, hl), v(-hw, 0.32, hl),
    v(-hw, belt, -hl + 0.05), v(hw, belt, -hl + 0.05), v(hw, hoodY - 0.1, hl - 0.05), v(-hw, hoodY - 0.1, hl - 0.05),
  ], { top: B, front: B, back: B, left: B, right: B, bottom: BLACK }));
  // cabin
  const cab = {
    hatch: [-hl + 0.25, 0.78, -hl + 0.35, -0.05],
    sedan: [-1.05, 0.95, -0.62, 0.22],
    coupe: [-hl + 0.45, 0.92, -0.95, 0.08],
    wing: [-1.0, 0.92, -0.6, 0.2],
  }[shape];
  const roofY = shape === 'coupe' ? 1.3 : 1.38, cw = 0.8, rw = 0.66;
  parts.push(hexa([
    v(-cw, belt - 0.01, cab[0]), v(cw, belt - 0.01, cab[0]), v(cw, belt - 0.01, cab[1]), v(-cw, belt - 0.01, cab[1]),
    v(-rw, roofY, cab[2]), v(rw, roofY, cab[2]), v(rw, roofY, cab[3]), v(-rw, roofY, cab[3]),
  ], { top: B, front: GLASS, back: GLASS, left: GLASS, right: GLASS, bottom: B }));
  // pillar/roof accent and side livery bands
  if (spec.id === 'delta') {
    parts.push(box(1.74, 0.07, L * 0.92, A, 0, 0.66, -0.05), box(1.75, 0.05, L * 0.9, A2, 0, 0.58, -0.05), box(1.75, 0.035, L * 0.88, 0x3c8fd8, 0, 0.52, -0.05));
    parts.push(box(1.3, 0.03, 0.9, A2, 0, hoodY - 0.04, hl - 0.6));
  } else if (spec.id === 'impreza') {
    parts.push(box(1.75, 0.09, L * 0.7, A, 0, 0.62, 0.1), box(0.35, 0.03, 1.1, A, 0.45, hoodY - 0.05, hl - 0.7));
    parts.push(box(0.12, 0.05, 0.5, BLACK, 0, hoodY - 0.02, hl - 0.9)); // hood scoop
  } else if (spec.id === 'celica') {
    parts.push(box(1.75, 0.16, L * 0.86, A, 0, 0.58, 0), box(1.75, 0.04, L * 0.8, A2, 0, 0.47, 0));
    parts.push(hexa([v(-0.66, roofY, cab[2]), v(0.66, roofY, cab[2]), v(0.66, roofY, cab[3]), v(-0.66, roofY, cab[3]),
      v(-0.66, roofY + 0.02, cab[2]), v(0.66, roofY + 0.02, cab[2]), v(0.66, roofY + 0.02, cab[3]), v(-0.66, roofY + 0.02, cab[3])],
      { top: A, front: A, back: A, left: A, right: A }));
  } else {
    for (let k = 0; k < 3; k++) parts.push(box(1.76, 0.07, 0.35, A, 0, 0.5 + k * 0.13, 0.6 - k * 0.45));
    parts.push(box(0.6, 0.03, 0.35, BLACK, 0, hoodY - 0.05, hl - 0.9));
  }
  // wheel arch flares
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) parts.push(box(0.1, 0.32, 0.95, B, sx * (hw + 0.03), 0.62, sz * wbh));
  // front: grille, lights, rally light pod
  parts.push(box(1.1, 0.16, 0.06, BLACK, 0, 0.62, hl + 0.01));
  for (const sx of [-1, 1]) parts.push(box(0.36, 0.12, 0.05, LIGHT, sx * 0.62, 0.68, hl + 0.02), box(0.3, 0.1, 0.05, TAIL, sx * 0.6, 0.78, -hl - 0.02));
  for (let k = 0; k < 4; k++) parts.push(box(0.2, 0.2, 0.08, LIGHT, -0.48 + k * 0.32, 0.5, hl + 0.06));
  parts.push(box(1.7, 0.14, 0.12, BLACK, 0, 0.38, hl), box(1.7, 0.14, 0.12, BLACK, 0, 0.38, -hl));
  // mud flaps
  for (const sx of [-1, 1]) parts.push(box(0.36, 0.26, 0.03, A === 0xf3c517 ? 0xf3c517 : 0xd0121b, sx * 0.62, 0.26, -wbh - 0.42));
  // spoilers
  if (shape === 'hatch') parts.push(box(1.3, 0.05, 0.3, B, 0, roofY + 0.02, cab[2] - 0.08));
  if (shape === 'sedan') parts.push(box(1.4, 0.05, 0.28, B, 0, 1.12, -hl + 0.22), box(0.06, 0.14, 0.12, B, -0.6, 1.04, -hl + 0.22), box(0.06, 0.14, 0.12, B, 0.6, 1.04, -hl + 0.22));
  if (shape === 'coupe') parts.push(box(1.55, 0.05, 0.3, A, 0, 1.08, -hl + 0.22), box(0.06, 0.16, 0.12, A, -0.66, 1.0, -hl + 0.22), box(0.06, 0.16, 0.12, A, 0.66, 1.0, -hl + 0.22));
  if (shape === 'wing') parts.push(box(1.64, 0.06, 0.36, B, 0, 1.28, -hl + 0.24), box(0.07, 0.34, 0.14, B, -0.62, 1.1, -hl + 0.24), box(0.07, 0.34, 0.14, B, 0.62, 1.1, -hl + 0.24), box(0.05, 0.26, 0.4, A, -0.83, 1.28, -hl + 0.24), box(0.05, 0.26, 0.4, A, 0.83, 1.28, -hl + 0.24));
  // door roundel (blank race-number panel)
  for (const sx of [-1, 1]) parts.push(box(0.03, 0.34, 0.5, 0xffffff, sx * (hw + 0.012), 0.78, 0.15));

  const mat = carMaterial();
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group(); group.add(bodyPivot);
  const bodyMesh = new THREE.Mesh(merge(parts), mat); bodyPivot.add(bodyMesh);

  const tire = merge([
    new THREE.CylinderGeometry(0.33, 0.33, 0.25, 8).rotateZ(Math.PI / 2),
  ]);
  paintAll(tire, BLACK);
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 6).rotateZ(Math.PI / 2); paintAll(rim, spec.rim);
  const wheelGeo = merge([tire, rim]);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const steer = new THREE.Group(); steer.position.set(sx * 0.78, 0.33, sz * wbh);
    const spin = new THREE.Mesh(wheelGeo, mat); steer.add(spin); group.add(steer);
    wheels.push({ steer, spin, front: sz > 0 });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, L + 0.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }));
  shadow.position.y = 0.04; shadow.renderOrder = 1; group.add(shadow);
  return { group, bodyPivot, wheels, shadow };
}

let _carMat = null;
function carMaterial() { return _carMat || (_carMat = lambert({ vertexColors: true })); }
function paintAll(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
