// Rally Italia '95 — main game: menus, physics, AI, camera, HUD.
import * as THREE from './vendor/three.module.min.js';
import { TRACKS, buildTrack } from './js/tracks.js';
import { CARS, buildCar } from './js/cars.js';
import { buildWorld } from './js/world.js';
import { makeTextures, snap } from './js/gfx.js';
import { Sound } from './js/audio.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'rally-italia-95';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = t => { if (!isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
const DIFF = ['Easy', 'Normal', 'Hard'];
const AI_SKILL = [0.8, 0.88, 0.96];
const TRIAL_SLACK = [1.5, 1.3, 1.14];

const S = {
  music: store.get('music', true), sfx: store.get('sfx', true), vibe: store.get('vibe', true), res: store.get('res', 240),
  auto: store.get('auto', true), cam: store.get('cam', 0),
  car: store.get('car', 0), track: store.get('track', 0), mode: store.get('mode', 'race'), diff: store.get('diff', 1),
};
const vibrate = ms => { if (S.vibe) navigator.vibrate?.(ms); };

// ---------- renderer ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 2600);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.5));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2); sun.position.set(0.5, 1, 0.35); scene.add(sun);
const particleScale = { value: 200 };
function resize() {
  const w = innerWidth, h = innerHeight, rh = S.res, rw = Math.round(rh * w / h);
  renderer.setSize(rw, rh, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  snap.value.set(rw / 2.5, rh / 2.5);
  particleScale.value = rh / (2 * Math.tan(camera.fov * Math.PI / 360));
}
addEventListener('resize', resize); resize();

const TEX = makeTextures();
const sound = new Sound(); sound.setSfx(S.sfx); sound.musicOn = S.music;
// Load the soundtrack as a blob so it plays from the offline cache on every phone.
// Fetched on the first tap (as a blob, so it plays from the offline cache on every phone).
let musicLoading = false;
function loadMusic() {
  if (musicLoading) return; musicLoading = true;
  fetch('music.mp3').then(r => r.blob()).then(b => { sound.music.src = URL.createObjectURL(b); if (phase !== 'paused') sound.playMusic(); }).catch(() => { musicLoading = false; });
}
const _unlock = sound.unlock.bind(sound);
sound.unlock = () => { _unlock(); loadMusic(); };

// ---------- world state ----------
let tr = null, world = null, worldTrack = -1;
const carCache = new Map();
function setTrack(i) {
  if (worldTrack === i) return;
  if (world) world.dispose();
  tr = buildTrack(TRACKS[i]);
  world = buildWorld(scene, tr, TEX);
  const d = tr.def;
  scene.fog = new THREE.Fog(d.fog, d.fogNear, d.fogFar);
  worldTrack = i;
  miniDirty = true;
}
function carMesh(specIdx, slot) {
  const key = specIdx + ':' + slot;
  if (!carCache.has(key)) { const m = buildCar(CARS[specIdx]); carCache.set(key, m); }
  const m = carCache.get(key); scene.add(m.group); return m;
}
function hideAllCars() { for (const m of carCache.values()) scene.remove(m.group); }

// ---------- game state ----------
let G = null;      // current race
let phase = 'menu'; // menu | countdown | race | done | paused
let menuT = 0;

function surfaceAt(c) { return c.offRoad ? (tr.def.id === 'riviera' ? 0.8 : 0.66) : tr.def.grip; }

// Max speed the AI can take through each sample, then braking back from each corner.
function speedProfile(spec, gripScale) {
  const N = tr.N, ds = tr.ds, prof = new Float32Array(N), lat = spec.grip * tr.def.grip * gripScale;
  for (let i = 0; i < N; i++) {
    let k = 0; for (let j = -5; j <= 5; j++) k = Math.max(k, Math.abs(tr.curv[tr.wrap(i + j)]));
    prof[i] = Math.min(spec.vmax, Math.sqrt(lat / Math.max(k, 1e-4)));
  }
  const brake = spec.brake * 0.7 * tr.def.grip;
  for (let pass = 0; pass < (tr.closed ? 2 : 1); pass++)
    for (let i = N - 2; i >= -1; i--) {
      const a = tr.wrap(i), b = tr.wrap(i + 1); if (!tr.closed && i < 0) break;
      prof[a] = Math.min(prof[a], Math.sqrt(prof[b] * prof[b] + 2 * brake * ds));
    }
  return prof;
}
const profAt = (prof, s) => { let u = s / tr.ds; u = tr.closed ? ((u % tr.N) + tr.N) % tr.N : clamp(u, 0, tr.N - 1); return prof[Math.floor(u)]; };

// Ideal segment times for time trial limits: drive the profile with full acceleration.
function idealTimes(spec) {
  const prof = speedProfile(spec, 1.0);
  const out = []; let v = 0, t = 0, dist = -6, k = 0;
  const dt = 1 / 30;
  while (k < tr.targets.length && t < 2000) {
    const p = tr.at(tr.startS + dist);
    const acc = spec.accel * Math.max(0, 1 - (v / spec.vmax) ** 2) - 9.81 * p.grade;
    v = Math.min(profAt(prof, tr.startS + dist + 4), v + acc * dt);
    dist += v * dt; t += dt;
    if (dist >= tr.targets[k].at) { out.push(t); k++; }
  }
  return out.map((x, i) => x - (i ? out[i - 1] : 0));
}

function newRace() {
  hideAllCars();
  setTrack(S.track);
  const W = tr.W;
  const mk = (specIdx, slot, dist, lat, isPlayer) => {
    const spec = CARS[specIdx], mesh = carMesh(specIdx, slot), p = tr.at(tr.startS + dist, lat);
    return { spec, mesh, isPlayer, x: p.x, z: p.z, y: p.y, h: Math.atan2(p.fx, p.fz), vx: 0, vz: 0, vf: 0, steer: 0, idx: -1,
      dist, lat, v: 0, prevS: tr.startS + dist, finished: false, finishT: 0, gear: 1, rpm: IDLE, shiftT: 0, slip: 0, offRoad: false, roll: 0, pitch: 0, name: spec.short };
  };
  const cars = [];
  let player;
  if (S.mode === 'race') {
    const others = [0, 1, 2, 3].filter(i => i !== S.car);
    const slots = [[-6, -2.3], [-6, 2.3], [-14, -2.3]];
    others.forEach((ci, k) => cars.push(mk(ci, 1, slots[k][0], slots[k][1], false)));
    player = mk(S.car, 0, -14, 2.3, true);
  } else player = mk(S.car, 0, -6, 0, true);
  cars.unshift(player);
  const R = Math.random;
  for (const c of cars) if (!c.isPlayer) {
    c.prof = speedProfile(c.spec, 0.93);
    c.skill = AI_SKILL[S.diff] * (0.97 + R() * 0.05);
    c.targetLat = c.lat;
  }
  player.idx = tr.project(player.x, player.z, null).i;
  G = { cars, player, t: 0, count: 3.5, nextT: 0, msg: '', msgT: 0, shake: 0, wrongT: 0, lastDist: player.dist, camH: player.h, camPos: null, trialLeft: 0, splits: [], finishOrder: [] };
  if (S.mode === 'trial') {
    const ideal = idealTimes(player.spec);
    G.limits = ideal.map(x => Math.ceil(x * TRIAL_SLACK[S.diff] + 2));
    G.trialLeft = G.limits[0];
  }
  $('lap').textContent = ''; $('split').textContent = '';
  $('timerLbl').textContent = S.mode === 'trial' ? 'TIME LEFT' : 'TIME';
  $('gas').hidden = S.auto;
  phase = 'countdown';
  showScreen(null); $('hud').hidden = false;
  sound.unlock(); sound.playMusic();
  history.pushState({ race: 1 }, '');
  wake();
  lastBeep = 4;
}

// ---------- input ----------
const input = { left: false, right: false, gas: false, brake: false };
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Escape' || e.code === 'KeyP') && (phase === 'race' || phase === 'countdown')) pause();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && phase === 'paused') resume();
  if (e.code === 'KeyC') toggleCam();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const steerPointers = new Map();
function bindPad(el, name) {
  const set = v => { input[name] = v; el.classList.toggle('down', v); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); set(true); if (name === 'brake' || name === 'gas') vibrate(8); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(false));
}
// steering zone: finger can slide between ◀ and ▶
const zone = $('steerZone');
function steerFromPointer(e) {
  const r = zone.getBoundingClientRect(), side = e.clientX < r.left + r.width / 2 ? 'left' : 'right';
  steerPointers.set(e.pointerId, side); refreshSteer();
}
function refreshSteer() {
  const v = [...steerPointers.values()];
  input.left = v.includes('left'); input.right = v.includes('right');
  $('left').classList.toggle('down', input.left); $('right').classList.toggle('down', input.right);
}
zone.addEventListener('pointerdown', e => { e.preventDefault(); zone.setPointerCapture?.(e.pointerId); steerFromPointer(e); vibrate(6); });
zone.addEventListener('pointermove', e => { if (steerPointers.has(e.pointerId)) steerFromPointer(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, e => { steerPointers.delete(e.pointerId); refreshSteer(); });
bindPad($('brake'), 'brake'); bindPad($('gas'), 'gas');
document.addEventListener('contextmenu', e => e.preventDefault());

let inputOverride = null;
function readInput() {
  if (inputOverride) return inputOverride(G, tr);
  const k = keys;
  return {
    left: input.left || k.ArrowLeft || k.KeyA, right: input.right || k.ArrowRight || k.KeyD,
    gas: input.gas || k.ArrowUp || k.KeyW, brake: input.brake || k.ArrowDown || k.KeyS || k.Space,
  };
}

// ---------- gearbox (5-speed, automatic) ----------
// All four homologation cars had 5-speed boxes. Each gear tops out at a share of the car's top speed;
// the turbo engine pulls hardest 4000-6200 rpm, shifts up near the red line and cuts power for a moment.
const GEAR_TOP = [0.3, 0.48, 0.66, 0.84, 1.0];
const GEAR_MUL = [1.32, 1.14, 1.02, 0.95, 0.9];
const IDLE = 950, RED = 7000, UPSHIFT = 6750, DOWNSHIFT = 3100, SHIFT_TIME = 0.2;
const rpmAt = (spec, v, g) => IDLE + (RED - IDLE) * Math.abs(v) / (spec.vmax * GEAR_TOP[g - 1]);
function torque(rpm) {
  if (rpm < 2500) return 0.62 + (rpm - IDLE) / (2500 - IDLE) * 0.23;
  if (rpm < 4000) return 0.85 + (rpm - 2500) / 1500 * 0.25;  // turbo spooling up
  if (rpm < 6200) return 1.1;
  return Math.max(0.55, 1.1 - (rpm - 6200) / 1200 * 0.35);
}
function gearbox(c, vf, throttle, dt) {
  const sp = c.spec;
  c.shiftT = Math.max(0, (c.shiftT || 0) - dt);
  if (vf < -0.3) { c.gear = 1; c.reverse = true; } else if (vf > 0.3) c.reverse = false;
  let rpm = rpmAt(sp, vf, c.gear);
  if (c.shiftT <= 0 && !c.reverse) {
    if (c.gear < 5 && rpm > UPSHIFT && throttle) { c.gear++; c.shiftT = SHIFT_TIME; c.shifted = 1; }
    else if (c.gear > 1 && rpm < DOWNSHIFT && rpmAt(sp, vf, c.gear - 1) < UPSHIFT - 600) { c.gear--; c.shiftT = SHIFT_TIME * 0.6; c.shifted = -1; }
    rpm = rpmAt(sp, vf, c.gear);
  }
  // clutch slip pulling away in first / reverse
  if ((c.gear === 1 || c.reverse) && throttle) rpm = Math.max(rpm, 2600 + 1400 * throttle);
  rpm = clamp(rpm, IDLE, RED + 350);
  // the needle doesn't jump: it chases the target rpm
  c.rpm = (c.rpm || IDLE) + (rpm - (c.rpm || IDLE)) * Math.min(1, dt * (c.shiftT > 0 ? 10 : 18));
  if (c.shiftT > 0) return 0;                       // power cut while the clutch is in
  if (c.rpm >= RED + 300) return 0;                  // rev limiter
  return torque(c.rpm) * GEAR_MUL[c.gear - 1];
}

// ---------- player physics ----------
const tmpV = new THREE.Vector3();
function stepPlayer(c, inp, dt, canDrive) {
  const sp = c.spec;
  const want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const rate = want === 0 || Math.sign(want) !== Math.sign(c.steer) ? 7 : 3.2;
  c.steer += clamp(want - c.steer, -rate * dt, rate * dt);
  let throttle = 0, brake = 0;
  if (canDrive) {
    if (S.auto) { throttle = inp.brake ? 0 : 1; brake = inp.brake ? 1 : 0; }
    else { throttle = inp.gas ? 1 : 0; brake = inp.brake ? 1 : 0; }
  } else brake = c.finished ? 0.5 : 0;

  const fx = Math.sin(c.h), fz = Math.cos(c.h), sx = fz, sz = -fx;
  let vf = c.vx * fx + c.vz * fz, vr = c.vx * sx + c.vz * sz;
  const proj = tr.project(c.x, c.z, c.idx); c.idx = proj.i;
  const absD = Math.abs(proj.d);
  c.offRoad = absD > tr.W / 2 + (tr.def.id === 'riviera' ? 2.4 : 0.4);
  const g = surfaceAt(c);
  const vmax = sp.vmax * (c.offRoad ? 0.55 : 1);
  let a = 0;
  const drive = gearbox(c, vf, throttle, dt);
  c.revving = !canDrive && phase === 'countdown' && (S.auto || inp.gas);
  if (c.revving) c.rpm += ((4200 + Math.sin(performance.now() / 90) * 900) - c.rpm) * Math.min(1, dt * 6); // revving on the grid
  if (throttle) a += vf >= 0 ? sp.accel * Math.max(0, 1 - (vf / vmax) ** 2) * drive : sp.brake * 0.8;
  if (vf > vmax) a -= 3 + (vf - vmax) * 0.5;
  if (brake) { if (vf > 0.6) a -= sp.brake * (0.55 + 0.45 * g); else if (!throttle) a -= vf > -9 ? 5 : 0; }
  if (!throttle && !brake) a -= Math.sign(vf) * 1.2;
  a -= vf * 0.012 + (c.offRoad ? vf * 0.16 : 0);
  const at = tr.at(proj.s);
  a -= 9.81 * at.grade * (fx * at.fx + fz * at.fz);
  const oldVf = vf; vf += a * dt;
  if (brake && oldVf > 0 && vf < 0 && !(!throttle && oldVf < 0.6)) vf = 0;

  // lateral grip: kill sideways velocity up to the tyre limit; sliding scrubs speed
  const gl = sp.grip * g;
  const dv = Math.min(Math.abs(vr), gl * dt); vr -= Math.sign(vr) * dv;
  vf -= Math.sign(vf) * Math.abs(vr) * 0.55 * dt;
  c.slip = Math.abs(vr);

  // yaw from steering, limited so the car drifts but never spins
  const spd = Math.abs(vf);
  const yawMax = sp.turn * Math.min(1, spd / 5) / (1 + spd / 30);
  let yaw = -c.steer * yawMax * Math.sign(vf || 1);
  const slipAng = Math.atan2(vr, Math.max(2, spd));
  // heading rotating by +yaw increases vr in the new frame by -vf*yaw*dt (sign check), clamp growth past ~32°
  const grows = Math.sign(-yaw * vf) === Math.sign(slipAng) || slipAng === 0;
  if (Math.abs(slipAng) > 0.56 && grows) yaw *= 0.15;
  c.vx = fx * vf + sx * vr; c.vz = fz * vf + sz * vr; c.vf = vf;
  c.h += yaw * dt;
  c.yaw = yaw;
  c.x += c.vx * dt; c.z += c.vz * dt;

  // walls
  const p2 = tr.project(c.x, c.z, c.idx); c.idx = p2.i;
  const lim = tr.def.wall - 0.95;
  if (Math.abs(p2.d) > lim) {
    const sgn = Math.sign(p2.d), nX = -tr.tz[p2.i] * sgn, nZ = tr.tx[p2.i] * sgn; // outward normal
    const push = Math.abs(p2.d) - lim; c.x -= nX * push; c.z -= nZ * push;
    const vn = c.vx * nX + c.vz * nZ;
    if (vn > 0) {
      c.vx -= nX * vn * 1.25; c.vz -= nZ * vn * 1.25;
      const f = 1 - Math.min(0.45, vn / 25); c.vx *= f; c.vz *= f;
      if (vn > 2.5 && c.isPlayer) { sound.crash(vn / 15); vibrate(Math.min(60, vn * 4)); G.shake = Math.min(1, vn / 15); }
    }
    // scrape: swing the nose along the wall (prefer the race direction) so you never get pinned
    const ta = Math.atan2(tr.tx[p2.i], tr.tz[p2.i]);
    const d1 = angDiff(ta, c.h), d2 = angDiff(ta + Math.PI, c.h);
    c.h += (Math.abs(d1) <= Math.abs(d2) + 0.6 ? d1 : d2) * Math.min(1, dt * 3);
  }
  // height: road surface, blending to terrain on the verges
  const p3 = tr.project(c.x, c.z, c.idx);
  const roadY = p3.y + (tr.def.id === 'riviera' && Math.abs(p3.d) > tr.W / 2 ? 0.2 : 0.06);
  const blend = tr.def.id === 'riviera' ? 0 : smooth01(tr.W / 2, tr.W / 2 + 1.8, Math.abs(p3.d));
  c.y = blend > 0 ? roadY + (tr.groundAt(c.x, c.z) + 0.06 - roadY) * blend : roadY;
  c.gradeAlong = at.grade * (fx * at.fx + fz * at.fz);
  c.latAcc = yaw * vf;
  c.throttle = throttle;
  return p3;
}

// ---------- AI ----------
function stepAI(c, dt, canDrive) {
  const sp = c.spec, sPos = tr.startS + c.dist;
  let target = canDrive ? profAt(c.prof, sPos + 3) * c.skill : 0;
  if (c.finished) target = tr.closed ? target * 0.6 : 0;
  // gentle rubber band so the pack stays in sight
  if (S.mode === 'race' && canDrive && !c.finished) {
    const gap = c.dist - G.player.dist;
    if (gap > 120) target *= 0.94; else if (gap < -160) target *= 1.05;
  }
  // traffic: steer round the car ahead instead of driving through it
  for (const o of G.cars) if (o !== c) {
    const ahead = o.dist - c.dist;
    if (ahead > 0 && ahead < 12 && Math.abs(o.lat - c.lat) < 2.1) {
      const room = tr.W / 2 - 1.3;
      if (!(c.passT > 0)) {
        let side = o.lat > 0 ? -1 : 1, want = clamp(o.lat + side * 2.6, -room, room);
        if (Math.abs(want - o.lat) < 2.2) want = clamp(o.lat - side * 2.6, -room, room);
        c.targetLat = want; c.passT = 2.0;
      }
      const ov = o.isPlayer ? Math.max(0, o.vf) : o.v;
      if (ahead < 5) target = Math.min(target, ov * 0.98);
    }
  }
  const p = tr.at(sPos);
  const acc = sp.accel * Math.max(0, 1 - (c.v / sp.vmax) ** 2) - 9.81 * p.grade;
  if (c.v < target) c.v = Math.min(target, c.v + acc * dt);
  else c.v = Math.max(target, c.v - sp.brake * 0.8 * dt);
  c.v = Math.max(0, c.v);
  c.dist += c.v * dt;
  // racing line: drift toward the inside of the bend ahead
  let k = 0; for (let j = 8; j <= 40; j += 8) k += tr.at(sPos + j).k; k /= 5;
  const room = tr.W / 2 - 1.3;
  let want = clamp(-Math.sign(k) * Math.min(1, Math.abs(k) * 30) * room, -room, room);
  if (c.passT > 0) { want = c.targetLat; c.passT -= dt; }
  const latPrev = c.lat;
  if (c.v > 1) c.lat += clamp(want - c.lat, -2.2 * dt, 2.2 * dt); // hold the grid slot until moving
  const q = tr.at(tr.startS + c.dist, c.lat);
  c.x = q.x; c.z = q.z; c.y = q.y + 0.06;
  const dlat = (c.lat - latPrev) / Math.max(0.001, c.v * dt);
  c.h = Math.atan2(q.fx, q.fz) - Math.atan(dlat) * 0.8;
  c.vx = Math.sin(c.h) * c.v; c.vz = Math.cos(c.h) * c.v; c.vf = c.v;
  c.gradeAlong = q.grade; c.latAcc = c.v * c.v * q.k; c.slip = Math.abs(c.v * c.v * q.k) > sp.grip * 0.8 ? 3 : 0;
  c.steer = clamp(q.k * 25, -1, 1) * -1;
}

// player <-> AI contact: two circles per car (front and rear)
function collide() {
  const P = G.player;
  for (const o of G.cars) if (o !== P) {
    let best = null;
    for (const a of [-1.1, 1.1]) for (const b of [-1.1, 1.1]) {
      const ax = P.x + Math.sin(P.h) * a, az = P.z + Math.cos(P.h) * a, bx = o.x + Math.sin(o.h) * b, bz = o.z + Math.cos(o.h) * b;
      const d = Math.hypot(ax - bx, az - bz);
      if (d < 2.0 && (!best || d < best.d)) best = { d, nx: (ax - bx) / (d || 1), nz: (az - bz) / (d || 1) };
    }
    if (!best) continue;
    const pen = 2.0 - best.d, mP = P.spec.mass, mO = o.spec.mass;
    P.x += best.nx * pen * mO / (mP + mO); P.z += best.nz * pen * mO / (mP + mO);
    o.lat -= (best.nx * -Math.cos(Math.atan2(o.vx, o.vz)) + best.nz * Math.sin(Math.atan2(o.vx, o.vz))) * pen * mP / (mP + mO);
    const rv = (P.vx - o.vx) * best.nx + (P.vz - o.vz) * best.nz;
    if (rv < 0) {
      const j = -1.3 * rv / (1 / mP + 1 / mO);
      P.vx += j / mP * best.nx; P.vz += j / mP * best.nz;
      const of = Math.sin(o.h) * best.nx + Math.cos(o.h) * best.nz;
      o.v = Math.max(0, o.v - j / mO * of);
      if (-rv > 2) { sound.crash(-rv / 12); vibrate(Math.min(50, -rv * 5)); G.shake = Math.min(0.8, -rv / 12); }
    }
  }
  // AI never overlap each other
  for (const a of G.cars) for (const b of G.cars) if (a !== b && !a.isPlayer && !b.isPlayer) {
    const d = a.dist - b.dist;
    if (d > 0 && d < 4.4 && Math.abs(a.lat - b.lat) < 1.9) { b.dist = a.dist - 4.4; b.v = Math.min(b.v, a.v); }
  }
}

// ---------- particles (dust / smoke) ----------
const PMAX = 400;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pAlpha = new Float32Array(PMAX), pSize = new Float32Array(PMAX);
const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { scale: particleScale },
  vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
    void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; vA *= smoothstep(3.0, 10.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(vC, vA); }`,
});
const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false; scene.add(particles);
let pNext = 0;
function emit(x, y, z, vx, vy, vz, col, size, life) {
  const i = pNext; pNext = (pNext + 1) % PMAX;
  pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3); pCol.set(col, i * 3); pSize[i] = size; pLife[i] = life; pAlpha[i] = 0.5;
}
function stepParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
    pLife[i] -= dt; pAlpha[i] = Math.max(0, Math.min(0.5, pLife[i]));
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pSize[i] += dt * 1.3; pVel[i * 3] *= 0.97; pVel[i * 3 + 2] *= 0.97;
  }
  for (const n of ['position', 'alpha', 'size', 'color']) pGeo.attributes[n].needsUpdate = true;
}
const DUST = { toscana: [0.86, 0.8, 0.66], passo: [0.85, 0.85, 0.85], riviera: [0.8, 0.78, 0.74] };
function dust(c, dt) {
  const spd = Math.hypot(c.vx, c.vz);
  const gravel = tr.def.surface === 'gravel' || c.offRoad;
  let rate = 0;
  if (gravel && spd > 6) rate = spd * 0.9;
  if (c.slip > 2.2) rate += c.slip * 4;
  c.dustAcc = (c.dustAcc || 0) + rate * dt;
  const col = c.offRoad && tr.def.id !== 'riviera' ? [0.62, 0.52, 0.36] : DUST[tr.def.id];
  while (c.dustAcc > 1) {
    c.dustAcc -= 1;
    const back = -2.0, fx = Math.sin(c.h), fz = Math.cos(c.h), side = (Math.random() - 0.5) * 1.6;
    emit(c.x + fx * back + fz * side, c.y + 0.3, c.z + fz * back - fx * side, -c.vx * 0.15 + (Math.random() - 0.5) * 2, 0.8 + Math.random(), -c.vz * 0.15 + (Math.random() - 0.5) * 2,
      col, 0.6 + Math.random() * 0.6, 0.5 + Math.random() * 0.5);
  }
}

// ---------- race logic ----------
let lastBeep = 4;
function flash(text, sub = '', t = 1.2) { G.msg = text + (sub ? '<small>' + sub + '</small>' : ''); G.msgT = t; }
function update(dt) {
  const inp = readInput();
  if (phase === 'countdown') {
    G.count -= dt;
    const n = Math.ceil(G.count - 0.5);
    if (n !== lastBeep && n >= 1 && n <= 3) { lastBeep = n; sound.beep(440, 0.2); flash(String(n), '', 0.6); }
    if (G.count <= 0.5) { phase = 'race'; sound.beep(880, 0.45); flash('GO!', '', 0.8); vibrate(30); }
  }
  const driving = phase === 'race';
  if (driving || phase === 'done') G.t += dt;
  const P = G.player;
  const SUB = 4, h = dt / SUB;
  for (let k = 0; k < SUB; k++) {
    stepPlayer(P, inp, h, driving && !P.finished);
    for (const c of G.cars) if (!c.isPlayer) stepAI(c, h, phase !== 'countdown');
    if (G.cars.length > 1) collide();
  }
  // player progress along the course
  const pr = tr.project(P.x, P.z, P.idx);
  let ds = pr.s - P.prevS; if (tr.closed) { if (ds < -tr.L / 2) ds += tr.L; if (ds > tr.L / 2) ds -= tr.L; }
  P.dist += ds; P.prevS = pr.s; P.lat = pr.d;
  // checkpoints
  if (driving && !P.finished) {
    while (G.nextT < tr.targets.length && P.dist >= tr.targets[G.nextT].at) {
      const tg = tr.targets[G.nextT]; G.nextT++;
      G.splits.push(G.t);
      if (tg.kind === 'finish') { finish(); break; }
      if (S.mode === 'trial') {
        const add = G.limits[G.nextT] || 0; G.trialLeft += add;
        flash(tg.kind === 'lap' ? 'LAP ' + (tg.lap + 2) : 'CHECKPOINT', 'EXTENDED +' + add + 's', 1.4);
      } else flash(tg.kind === 'lap' ? (tg.lap + 2 === tr.def.laps ? 'FINAL LAP' : 'LAP ' + (tg.lap + 2)) : 'CHECKPOINT', 'SPLIT ' + fmt(G.t), 1.2);
      sound.beep(988, 0.12); setTimeout(() => sound.beep(1318, 0.18), 120); vibrate(20);
    }
    if (S.mode === 'trial') {
      G.trialLeft -= dt;
      if (G.trialLeft <= 0) { G.trialLeft = 0; timeUp(); }
    }
    // rescue: stuck for 3 s (e.g. nose in a wall) -> back on the road, facing the right way
    if (Math.hypot(P.vx, P.vz) < 1.2 && !inp.brake && phase === 'race') G.stuckT = (G.stuckT || 0) + dt; else G.stuckT = 0;
    if (G.stuckT > 3) {
      const q = tr.at(tr.startS + P.dist, 0);
      P.x = q.x; P.z = q.z; P.h = Math.atan2(q.fx, q.fz); P.vx = P.vz = P.vf = 0; P.steer = 0; P.gear = 1;
      P.idx = tr.project(P.x, P.z, null).i; P.prevS = tr.project(P.x, P.z, P.idx).s; G.camPos = null; G.stuckT = 0;
      flash('RESCUE', '', 1); sound.beep(520, 0.2);
    }
    // wrong way
    if (P.dist < G.lastDist - 0.02 && Math.abs(P.vf) > 4) G.wrongT += dt; else G.wrongT = Math.max(0, G.wrongT - dt * 2);
    G.lastDist = P.dist;
    if (G.wrongT > 1.2 && G.msgT <= 0) flash('WRONG WAY', '', 0.5);
  }
  for (const c of G.cars) if (!c.isPlayer && !c.finished && c.dist >= tr.raceLen && phase !== 'countdown') { c.finished = true; c.finishT = G.t; G.finishOrder.push(c); }
  for (const c of G.cars) dust(c, dt);
  stepParticles(dt);
  if (G.msgT > 0) G.msgT -= dt;
  // engine & tyre sound
  const spd = Math.abs(P.vf);
  sound.engine(clamp((P.rpm - IDLE) / (RED - IDLE), 0, 1.08), P.shiftT > 0 ? 0 : (P.throttle || P.revving ? 1 : 0), phase !== 'paused');
  if (P.shifted) { if (P.shifted > 0) sound.shift(); P.shifted = 0; }
  sound.tyres(Math.max(0, P.slip - 2) / 4, (tr.def.surface === 'gravel' || P.offRoad) ? spd / 60 : 0);
}

function placeOf(c) {
  const all = [...G.cars];
  all.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishT - b.finishT : b.dist - a.dist));
  return all.indexOf(c) + 1;
}
function finish() {
  const P = G.player; P.finished = true; P.finishT = G.t; G.finishOrder.push(P);
  const pos = placeOf(P);
  phase = 'done';
  flash(S.mode === 'trial' ? 'FINISH!' : ['', '1ST!', '2ND', '3RD', '4TH'][pos], fmt(G.t), 3);
  sound.beep(660, 0.15); setTimeout(() => sound.beep(880, 0.15), 160); setTimeout(() => sound.beep(1320, 0.4), 320);
  vibrate([40, 60, 40]);
  setTimeout(() => showResults(false), 2600);
}
function timeUp() {
  phase = 'done'; G.player.finished = true;
  flash('TIME UP', 'GAME OVER', 3); sound.beep(220, 0.6, 'sawtooth');
  setTimeout(() => showResults(true), 2600);
}
function showResults(dnf) {
  if (!G || phase === 'menu') return;
  const P = G.player, bestKey = 'best:' + tr.def.id;
  const best = store.get(bestKey, null);
  let head, sub = '', rows = '';
  if (S.mode === 'trial') {
    if (dnf) { head = 'Time up'; sub = 'Reached ' + G.splits.length + ' of ' + tr.targets.length + ' checkpoints'; }
    else {
      head = fmt(P.finishT);
      const rec = !best || P.finishT < best.t;
      if (rec) store.set(bestKey, { t: P.finishT, car: P.spec.short });
      sub = rec ? 'NEW RECORD!' : 'Record ' + fmt(best.t) + ' · ' + best.car;
    }
    rows = G.splits.map((t, i) => `<tr><td>${tr.targets[i].kind === 'cp' ? 'Checkpoint' : tr.targets[i].kind === 'lap' ? 'Lap' : 'Finish'}</td><td>${fmt(t)}</td></tr>`).join('');
  } else {
    const order = [...G.cars].map(c => ({ c, t: c.finished ? c.finishT : G.t + (tr.raceLen - c.dist) / Math.max(15, c.v || c.vf || 15) }));
    order.sort((a, b) => a.t - b.t);
    const pos = order.findIndex(o => o.c === P) + 1;
    head = ['', '1st place', '2nd place', '3rd place', '4th place'][pos];
    sub = tr.def.name + ' · ' + DIFF[S.diff];
    rows = order.map((o, i) => `<tr class="${o.c === P ? 'me' : ''}"><td>${i + 1}.</td><td>${o.c.spec.name}${o.c === P ? ' (you)' : ''}</td><td>${o.c.finished ? fmt(o.t) : '+' + fmt(o.t - P.finishT).replace(/^0:/, '')}</td></tr>`).join('');
    if (pos === 1) store.set('wins', store.get('wins', 0) + 1);
  }
  sound.silence();
  $('resHead').textContent = head; $('resSub').textContent = sub; $('resTable').innerHTML = rows;
  $('hud').hidden = true; showScreen('results');
  phase = 'results';
}

// ---------- camera ----------
function updateCamera(dt) {
  const P = G.player;
  const vh = Math.hypot(P.vx, P.vz) > 4 ? Math.atan2(P.vx, P.vz) : P.h;
  const dh = angDiff(P.h + angDiff(vh, P.h) * 0.45, G.camH);
  G.camH += dh * Math.min(1, dt * 5);
  const fx = Math.sin(G.camH), fz = Math.cos(G.camH);
  let px, py, pz, lx, ly, lz;
  if (S.cam === 1) { // bumper
    const hx = Math.sin(P.h), hz = Math.cos(P.h);
    px = P.x + hx * 1.2; py = P.y + 1.15; pz = P.z + hz * 1.2; lx = P.x + hx * 20; ly = P.y + 0.6 + P.gradeAlong * 20; lz = P.z + hz * 20;
    camera.position.set(px, py, pz);
  } else {
    const back = S.cam === 2 ? 11 : 7, up = S.cam === 2 ? 4.6 : 2.7;
    px = P.x - fx * back; pz = P.z - fz * back;
    py = Math.max(P.y + up, tr.groundAt(px, pz) + 1.2);
    if (!G.camPos) G.camPos = new THREE.Vector3(px, py, pz);
    G.camPos.lerp(tmpV.set(px, py, pz), Math.min(1, dt * 9));
    camera.position.copy(G.camPos);
    lx = P.x + fx * 5; ly = P.y + 1.1; lz = P.z + fz * 5;
  }
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.6; camera.position.y += (Math.random() - 0.5) * G.shake * 0.4; G.shake = Math.max(0, G.shake - dt * 2.5); }
  camera.lookAt(lx, ly, lz);
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function toggleCam() { S.cam = (S.cam + 1) % 3; store.set('cam', S.cam); if (G) G.camPos = null; }
$('camBtn').addEventListener('click', toggleCam);

// ---------- draw cars ----------
function poseCar(c, dt) {
  const m = c.mesh;
  m.group.position.set(c.x, c.y, c.z);
  m.group.rotation.set(0, c.h, 0);
  const targetPitch = -Math.atan(c.gradeAlong || 0);
  c.pitch += (targetPitch - c.pitch) * Math.min(1, dt * 8);
  const targetRoll = clamp((c.latAcc || 0) * 0.012, -0.09, 0.09);
  c.roll += (targetRoll - c.roll) * Math.min(1, dt * 6);
  m.bodyPivot.rotation.set(c.pitch, 0, c.roll);
  for (const w of m.wheels) { w.spin.rotation.x += (c.vf || 0) / 0.33 * dt; if (w.front) w.steer.rotation.y = -c.steer * 0.42; w.steer.position.y = 0.33; }
  m.shadow.rotation.x = c.pitch;
}

// ---------- HUD ----------
// LED rev counter, arcade style: 0-8000 rpm, red zone from 7000
const tacho = $('tacho'), tctx = tacho.getContext('2d');
let tachoKey = '';
function drawTacho(P) {
  const rpm = P.rpm || IDLE, gear = P.reverse ? 'R' : String(P.gear || 1), lit = Math.round(rpm / 250);
  const key = lit + gear + (P.shiftT > 0 ? 's' : '');
  if (key === tachoKey) return; tachoKey = key;
  const g = tctx, W = tacho.width, H = tacho.height, cx = W / 2, cy = H - 8, R1 = 112, R0 = 84, SEG = 32;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.5)'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, R1 + 8, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  for (let i = 0; i < SEG; i++) {
    const r0 = i * 250, a0 = Math.PI + (i / SEG) * Math.PI + 0.012, a1 = Math.PI + ((i + 1) / SEG) * Math.PI - 0.012;
    const on = i < lit;
    g.fillStyle = r0 >= RED ? (on ? '#ff3424' : '#4a1210') : r0 >= 5500 ? (on ? '#ffd21a' : '#4a3d0a') : (on ? '#39f06a' : '#0f3a1c');
    const grow = (i / SEG) * 10;
    g.beginPath(); g.arc(cx, cy, R1, a0, a1); g.arc(cx, cy, R0 + 6 - grow, a1, a0, true); g.closePath(); g.fill();
  }
  g.fillStyle = '#fff'; g.font = '15px "Racing Sans One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 1; k <= 8; k++) { const a = Math.PI + (k * 4 / SEG) * Math.PI; g.fillText(k, cx + Math.cos(a) * (R0 - 16), cy + Math.sin(a) * (R0 - 16)); }
  g.font = '9px system-ui, sans-serif'; g.fillStyle = '#c9d4f5'; g.fillText('x1000 rpm', cx, cy - 4);
  // gear box
  g.fillStyle = P.shiftT > 0 ? '#ffd21a' : '#0b1a4a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.fillRect(cx - 19, cy - 58, 38, 42); g.strokeRect(cx - 19, cy - 58, 38, 42);
  g.fillStyle = P.shiftT > 0 ? '#3a1300' : '#ffd21a'; g.font = 'italic 38px "Racing Sans One", Impact, sans-serif';
  g.fillText(gear, cx, cy - 36);
}

const mini = $('mini'), mctx = mini.getContext('2d');
let miniDirty = true, miniImg = null, miniMap = null;
function drawMini() {
  if (miniDirty) {
    const b = tr.bounds, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.12, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    miniMap = (x, z) => [75 + (x - cx) / span * 150 * -1, 75 - (z - cz) / span * 150];
    const off = document.createElement('canvas'); off.width = off.height = 150; const o = off.getContext('2d');
    o.lineWidth = 6; o.strokeStyle = 'rgba(0,0,0,.6)'; o.lineJoin = 'round'; o.beginPath();
    for (let i = 0; i < tr.N; i += 3) { const [x, y] = miniMap(tr.xs[i], tr.zs[i]); i ? o.lineTo(x, y) : o.moveTo(x, y); }
    if (tr.closed) o.closePath(); o.stroke(); o.lineWidth = 3; o.strokeStyle = '#fff'; o.stroke();
    for (const t of tr.targets.filter(t => t.lap === 0)) { const p = tr.at(tr.startS + t.at); const [x, y] = miniMap(p.x, p.z); o.fillStyle = t.kind === 'cp' ? '#ffd21a' : '#e01b24'; o.fillRect(x - 3, y - 3, 6, 6); }
    miniImg = off; miniDirty = false;
  }
  mctx.clearRect(0, 0, 150, 150); mctx.drawImage(miniImg, 0, 0);
  for (const c of [...G.cars].reverse()) {
    const [x, y] = miniMap(c.x, c.z);
    mctx.fillStyle = c.isPlayer ? '#ffd21a' : '#' + new THREE.Color(c.spec.accent).getHexString();
    mctx.strokeStyle = '#000'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(x, y, c.isPlayer ? 5 : 4, 0, 7); mctx.fill(); mctx.stroke();
  }
}
let hudCache = {};
function setText(id, v, html = false) { if (hudCache[id] !== v) { hudCache[id] = v; html ? $(id).innerHTML = v : $(id).textContent = v; } }
function updateHUD() {
  const P = G.player;
  if (S.mode === 'race') {
    setText('pos', placeOf(P) + '<small>/' + G.cars.length + '</small>', true);
  } else setText('pos', '', true);
  const lap = tr.closed ? Math.min(tr.def.laps, 1 + G.splits.filter((_, i) => tr.targets[i].kind !== 'cp').length) : 0;
  setText('lap', tr.closed ? 'LAP ' + lap + '/' + tr.def.laps : 'CP ' + Math.min(G.nextT, tr.targets.length - 1) + '/' + (tr.targets.length - 1));
  const t = S.mode === 'trial' ? G.trialLeft : G.t;
  setText('timer', S.mode === 'trial' ? Math.ceil(t).toString() : fmt(t));
  $('timer').classList.toggle('warn', S.mode === 'trial' && t < 6 && phase === 'race');
  setText('split', S.mode === 'trial' ? fmt(G.t) : '');
  setText('spd', Math.round(Math.abs(P.vf) * 3.6) + '<small> km/h</small>', true);
  drawTacho(P);
  setText('msg', G.msgT > 0 ? G.msg : '', true);
  drawMini();
}

// ---------- menus ----------
const screens = ['title', 'options', 'carSel', 'event', 'pause', 'results'];
let optReturn = 'title';
function showScreen(id) { for (const s of screens) $(s).hidden = s !== id; if (id) refreshOpts(); }
function refreshOpts() {
  document.querySelectorAll('[data-set]').forEach(b => {
    const k = b.dataset.set, v = b.dataset.v, cur = S[k];
    b.classList.toggle('on', String(typeof cur === 'boolean' ? (cur ? 1 : 0) : cur) === v);
  });
  document.querySelectorAll('[data-ev]').forEach(b => b.classList.toggle('on', String(S[b.dataset.ev]) === b.dataset.v));
  document.querySelectorAll('.tcard').forEach((c, i) => c.classList.toggle('on', i === S.track));
  $('autoHint').textContent = S.auto ? 'Steer + brake only' : 'Gas + brake pedals';
  const best = store.get('best:' + TRACKS[S.track].id, null);
  $('evHint').textContent = S.mode === 'race'
    ? `Race 3 rivals · ${TRACKS[S.track].laps > 1 ? TRACKS[S.track].laps + ' laps' : 'point to point'} · rivals pace: ${DIFF[S.diff]}`
    : `Beat the clock: each checkpoint adds time (${DIFF[S.diff]} = ${['generous', 'fair', 'tight'][S.diff]})` + (best ? ` · record ${fmt(best.t)} (${best.car})` : '');
}
document.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.set, v = b.dataset.v;
  S[k] = k === 'res' ? +v : v === '1'; store.set(k, S[k]);
  if (k === 'res') resize();
  if (k === 'sfx') sound.setSfx(S.sfx);
  if (k === 'music') { sound.setMusic(S.music); if (S.music && phase !== 'paused') sound.playMusic(); }
  if (k === 'auto') $('gas').hidden = S.auto;
  sound.beep(700, 0.05); refreshOpts();
}));
document.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.ev; S[k] = k === 'diff' ? +b.dataset.v : b.dataset.v; store.set(k, S[k]); sound.beep(700, 0.05); refreshOpts();
}));

// track cards with mini maps
TRACKS.forEach((def, i) => {
  const card = document.createElement('button'); card.className = 'tcard opt';
  card.innerHTML = `<canvas width="160" height="90"></canvas><div class="tn">${def.name}</div><div class="ts">${def.sub}</div>`;
  card.addEventListener('click', () => { S.track = i; store.set('track', i); sound.beep(700, 0.05); refreshOpts(); menuSetTrack(); });
  $('tracks').appendChild(card);
  const t = buildTrack(def), g = card.querySelector('canvas').getContext('2d'), b = t.bounds;
  const span = Math.max((b.maxX - b.minX) / 150, (b.maxZ - b.minZ) / 80), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  g.strokeStyle = '#ffd21a'; g.lineWidth = 3; g.beginPath();
  for (let k = 0; k < t.N; k += 3) { const x = 80 - (t.xs[k] - cx) / span, y = 45 - (t.zs[k] - cz) / span; k ? g.lineTo(x, y) : g.moveTo(x, y); }
  if (t.closed) g.closePath(); g.stroke();
});

function carStats() {
  const c = CARS[S.car];
  $('carName').textContent = c.name; $('carVer').textContent = c.ver + ' · 4WD turbo · ' + c.ps + ' CV';
  const bar = v => `<div class="bar"><i style="width:${Math.round(clamp(v, 0.06, 1) * 100)}%"></i></div>`;
  $('stats').innerHTML = `<b>Top speed</b>${bar(c.bars.speed)}<span>${c.kmh} km/h</span>
    <b>Acceleration</b>${bar(c.bars.accel)}<span>${c.psT} CV/t</span>
    <b>Handling</b>${bar(c.bars.handling)}<span>${(c.wb / 1000).toFixed(2)} m wb</span>
    <b>Weight</b>${bar(c.bars.weight)}<span>${c.kg} kg</span>`;
  hideAllCars(); menuCar = carMesh(S.car, 0);
}
let menuCar = null;
function menuSetTrack() {
  $('loading').hidden = false;
  setTimeout(() => { setTrack(S.track); placeMenuCar(); $('loading').hidden = true; }, 30);
}
function placeMenuCar() {
  if (!menuCar) menuCar = carMesh(S.car, 0);
  const p = tr.at(tr.startS - 25);
  menuCar.group.position.set(p.x, p.y + 0.06, p.z);
}
$('carPrev').addEventListener('click', () => { S.car = (S.car + 3) % 4; store.set('car', S.car); sound.beep(600, 0.05); carStats(); placeMenuCar(); });
$('carNext').addEventListener('click', () => { S.car = (S.car + 1) % 4; store.set('car', S.car); sound.beep(600, 0.05); carStats(); placeMenuCar(); });
$('carOk').addEventListener('click', () => { sound.beep(900, 0.08); showScreen('event'); });
$('carBack').addEventListener('click', () => { showScreen('title'); });
$('evBack').addEventListener('click', () => { showScreen('carSel'); });
$('evGo').addEventListener('click', () => { sound.unlock(); $('loading').hidden = false; setTimeout(() => { newRace(); $('loading').hidden = true; }, 30); });
$('optBtn').addEventListener('click', e => { e.stopPropagation(); sound.unlock(); optReturn = 'title'; showScreen('options'); });
$('optBack').addEventListener('click', () => showScreen(optReturn));
$('title').addEventListener('click', () => { sound.unlock(); sound.playMusic(); showScreen('carSel'); carStats(); placeMenuCar(); });

function pause() {
  if (phase !== 'race' && phase !== 'countdown') return;
  G.prevPhase = phase; phase = 'paused'; sound.silence(); sound.pauseMusic(); showScreen('pause');
  for (const k in input) input[k] = false; steerPointers.clear(); refreshSteer();
}
function resume() { if (phase !== 'paused') return; phase = G.prevPhase; showScreen(null); sound.playMusic(); history.pushState({ race: 1 }, ''); }
function toMenu() {
  phase = 'menu'; G = null; $('hud').hidden = true; sound.silence();
  hideAllCars(); menuCar = carMesh(S.car, 0); placeMenuCar(); showScreen('carSel'); carStats(); placeMenuCar();
}
$('pauseBtn').addEventListener('click', pause);
$('resume').addEventListener('click', resume);
$('restart').addEventListener('click', () => { sound.unlock(); newRace(); });
$('quit').addEventListener('click', toMenu);
$('again').addEventListener('click', () => { newRace(); });
$('toMenu').addEventListener('click', toMenu);
addEventListener('popstate', () => { if (phase === 'race' || phase === 'countdown') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); sound.pauseMusic(); }
  else { if (phase === 'menu' || phase === 'results') sound.playMusic(); wake(); }
});

let wakeLock = null;
async function wake() { try { if (!wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {} }

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && (phase === 'countdown' || phase === 'race' || phase === 'done')) {
    update(dt);
    for (const c of G.cars) poseCar(c, dt);
    updateCamera(dt);
    updateHUD();
  } else if (G && phase === 'paused') {
    // frozen frame
  } else if (tr) {
    // menu: orbit around the chosen car near the start line
    menuT += dt;
    const p = tr.at(tr.startS - 25), a = menuT * 0.35, r = 6.5;
    if (menuCar) { menuCar.group.rotation.y = Math.atan2(p.fx, p.fz); for (const w of menuCar.wheels) w.steer.rotation.y = 0; menuCar.bodyPivot.rotation.set(0, 0, 0); }
    const onCarSel = !$('carSel').hidden;
    camera.position.set(p.x + Math.sin(a) * r, p.y + (onCarSel ? 2.6 : 2.2), p.z + Math.cos(a) * r);
    camera.lookAt(p.x, p.y + (onCarSel ? -1.9 : 0.6), p.z);
    if (G == null) stepParticles(dt);
  }
  if (world) world.sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

// boot
setTrack(S.track); menuCar = carMesh(S.car, 0); placeMenuCar();
$('loading').hidden = true;
showScreen('title');
requestAnimationFrame(frame);

// test hook (used by automated checks only; harmless for players)
window.__rally = { get G() { return G; }, get phase() { return phase; }, get tr() { return tr; }, input, S, newRace, speedProfile,
  set pilot(f) { inputOverride = f; }, sim(sec) { for (let i = 0; i < sec * 60 && (phase === 'countdown' || phase === 'race' || phase === 'done'); i++) update(1 / 60); return phase; } };
