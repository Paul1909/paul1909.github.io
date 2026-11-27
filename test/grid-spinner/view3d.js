// Grid Spinner: the isometric 3D world view (three.js, bundled in the folder so it works offline).
// Every asset is a little low-poly model joined to one central node ("the grid") by a neon wire.
// Nothing spins: on/off shows with lights, smoke, water and energy pulses running along the wires.
import * as THREE from './three.min.js';

const ORDER = ['nuclear', 'ccgt', 'hydro', 'peaker', 'solar', 'wind', 'bess', 'flywheel'];
// Wire colours: green neon to generators, red neon to consumers (a battery's wire turns red while it charges)
const NEON_GEN = new THREE.Color('#40e070'), NEON_LOAD = new THREE.Color('#ff4d5e'), WIRE_OFF = new THREE.Color('#aab4c0');
const CORE_GEN = new THREE.Color('#2b8a3e'), CORE_LOAD = new THREE.Color('#c92a2a');
const GREY = new THREE.Color('#b9c0c8');
const MS = 1.3;   // model scale
const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export function create(wrap, api) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cv = renderer.domElement; cv.className = 'v3';
  wrap.insertBefore(cv, wrap.firstChild);

  const scene = new THREE.Scene();
  const bgDay = new THREE.Color('#e4eaf0'), bgNight = new THREE.Color('#1e2733');
  scene.background = bgDay.clone();
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 300);
  const target = new THREE.Vector3(0, .6, 0);
  cam.position.set(40, 50, 40); cam.lookAt(target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a96a3, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(14, 26, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  sun.shadow.bias = -.0006; scene.add(sun);

  // ---------- materials and little builders
  const mats = { push() {} };   // materials live with their asset and are disposed with it
  function mat(color, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .75, metalness: .05, flatShading: true }, o));
    m.userData.base = new THREE.Color(color); mats.push(m); return m;
  }
  const shared = {
    concrete: () => mat('#d5d9de'), wall: () => mat('#f4f5f7'), dark: () => mat('#4a5563'), roofGrey: () => mat('#8d97a3'),
  };
  function box(w, h, d, m, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; return o;
  }
  function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; return o;
  }
  function roof(w, h, d, m, x = 0, y = 0, z = 0) { // triangular prism along x
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
  }
  const glowMat = color => { const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: color, emissiveIntensity: 0, roughness: .4 }); m.userData.glow = true; return m; };

  // ---------- ground and the central node
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .5, 72), new THREE.MeshStandardMaterial({ color: '#cfd8cf', roughness: .95 }));
  ground.position.y = -.25; ground.receiveShadow = true; scene.add(ground);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.012, 1.03, .48, 72), new THREE.MeshStandardMaterial({ color: '#9aa7a0', roughness: .9 }));
  rim.position.y = -.27; scene.add(rim);
  const hub = new THREE.Group(); scene.add(hub);
  hub.add(cyl(1.7, 1.9, .35, mat('#5b6675'), 0, 0, 0, 6));
  hub.add(cyl(1.25, 1.25, .12, mat('#2f3a47'), 0, .35, 0, 6));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; hub.add(box(.16, 1.7, .16, mat('#6b7787'), Math.cos(a) * .75, .45, Math.sin(a) * .75)); }
  hub.add(cyl(.32, .45, 1.9, mat('#8994a3'), 0, .45, 0, 8));
  const orbMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#2b8a3e', emissiveIntensity: 1.4, roughness: .3 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(.62, 24, 16), orbMat); orb.position.y = 2.95; orb.castShadow = true; hub.add(orb);
  const haloMat = new THREE.MeshBasicMaterial({ color: '#2b8a3e', transparent: true, opacity: .22, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), haloMat); halo.position.y = 2.95; hub.add(halo);
  const alarmMat = new THREE.MeshBasicMaterial({ color: '#c92a2a', transparent: true, opacity: 0, depthWrite: false });
  const alarmRing = new THREE.Mesh(new THREE.TorusGeometry(2.3, .09, 8, 48), alarmMat); alarmRing.rotation.x = Math.PI / 2; alarmRing.position.y = .4; hub.add(alarmRing);
  const HUB_IN = new THREE.Vector3(0, 2.4, 0);

  // ---------- asset models
  function model(type) {
    const g = new THREE.Group(), fx = { smoke: [], glow: [], led: null, water: null, train: null, blink: [] };
    const add = o => (g.add(o), o);
    switch (type) {
      case 'peaker': {
        add(box(2, .12, 1.6, shared.concrete()));
        add(box(1.3, .8, 1, mat('#e9ecef'), -.15, .12, 0)); add(box(1.32, .1, 1.02, mat('#c92a2a'), -.15, .92, 0));
        add(cyl(.17, .22, 1.5, mat('#8d97a3'), .7, .12, -.3)); fx.smoke.push(new THREE.Vector3(.7, 1.7, -.3)); break;
      }
      case 'ccgt': {
        add(box(2.3, .12, 1.9, shared.concrete()));
        add(box(1.5, 1.05, 1.1, mat('#eef0f2'), -.25, .12, .1)); add(box(1.52, .12, 1.12, mat('#e67700'), -.25, 1.17, .1));
        add(box(.7, .7, .8, mat('#c9ced4'), .75, .12, .35));
        add(cyl(.17, .22, 1.9, mat('#8d97a3'), .75, .12, -.55)); add(cyl(.15, .2, 1.6, mat('#8d97a3'), .3, .12, -.65));
        fx.smoke.push(new THREE.Vector3(.75, 2.1, -.55), new THREE.Vector3(.3, 1.8, -.65)); break;
      }
      case 'hydro': {
        add(box(2.4, .1, 2, mat('#b5c4a8')));
        const lake = new THREE.Mesh(new THREE.BoxGeometry(2.2, .5, .9), new THREE.MeshStandardMaterial({ color: '#4dabf7', roughness: .2, transparent: true, opacity: .85 }));
        lake.position.set(0, .35, -.5); g.add(lake);
        add(box(2.3, 1.05, .32, mat('#c8ccd1'), 0, .1, .05)); add(box(2.32, .08, .4, mat('#1971c2'), 0, 1.15, .05));
        add(box(.6, .45, .5, mat('#e9ecef'), .6, .1, .6));
        const wm = new THREE.MeshStandardMaterial({ color: '#a5d8ff', emissive: '#4dabf7', emissiveIntensity: .3, transparent: true, opacity: 0, roughness: .1 });
        const fall = new THREE.Mesh(new THREE.BoxGeometry(.5, .95, .06), wm); fall.position.set(-.4, .62, .25); g.add(fall); fx.water = wm; break;
      }
      case 'nuclear': {
        add(box(2.6, .12, 2.2, shared.concrete()));
        const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = t * 2.3; pts.push(new THREE.Vector2(.85 - .45 * Math.sin(Math.PI * t * .8) + .08 * t, y)); }
        const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat('#eceff2', { side: THREE.DoubleSide })); tower.position.set(-.5, .12, -.2); tower.castShadow = true; g.add(tower);
        add(box(.9, .7, .8, mat('#dfe3e8'), .75, .12, .45));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#7048e8')); dome.position.set(.75, .82, .45); dome.castShadow = true; g.add(dome);
        fx.smoke.push(new THREE.Vector3(-.45, 2.5, -.2)); fx.steam = true; break;
      }
      case 'solar': {
        add(box(2.4, .06, 2, mat('#c5d3b8')));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
          const m = glowMat('#74c0fc'); m.color.set('#1c3d6e'); m.userData.base = new THREE.Color('#1c3d6e'); mats.push(m); fx.glow.push(m);
          const p = new THREE.Mesh(new THREE.BoxGeometry(.95, .05, .5), m); p.position.set(-.55 + c * 1.1, .45, -.6 + r * .62); p.rotation.x = -.45; p.castShadow = true; g.add(p);
          g.add(box(.05, .38, .05, shared.dark(), -.55 + c * 1.1, .06, -.6 + r * .62));
        }
        break;
      }
      case 'wind': {
        add(box(2.2, .06, 2, mat('#c5d3b8')));
        for (const [x, z, s] of [[-.45, -.3, 1], [.55, .45, .8]]) {
          const t = new THREE.Group(); t.position.set(x, .06, z); t.scale.setScalar(s); g.add(t);
          t.add(cyl(.05, .1, 2.7, mat('#f4f6f8')));
          t.add(box(.18, .16, .42, mat('#f4f6f8'), 0, 2.65, 0));
          const hubm = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), mat('#0c8599')); hubm.position.set(0, 2.73, .24); t.add(hubm);
          for (let b = 0; b < 3; b++) { // blades stand still
            const bl = new THREE.Mesh(new THREE.BoxGeometry(.07, 1, .025), mat('#ffffff')); bl.geometry.translate(0, .5, 0);
            bl.position.set(0, 2.73, .27); bl.rotation.z = b * Math.PI * 2 / 3 + .35; bl.castShadow = true; t.add(bl);
          }
          const lm = glowMat('#ff4040'); const l = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), lm); l.position.set(0, 2.76, -.18); t.add(l); fx.blink.push(lm);
        }
        break;
      }
      case 'bess': {
        add(box(2.4, .1, 1.7, shared.concrete()));
        for (const z of [-.38, .38]) {
          add(box(1.9, .6, .58, mat('#f1f3f5'), 0, .1, z));
          add(box(1.92, .05, .6, mat('#2b8a3e'), 0, .7, z));
        }
        const lm = glowMat('#40c057'); const led = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, .03), lm); led.geometry.translate(.8, 0, 0);
        led.position.set(-.8, .45, .69); g.add(led); fx.led = { mesh: led, mat: lm };
        break;
      }
      case 'flywheel': {
        add(box(1.8, .1, 1.6, shared.concrete()));
        add(cyl(.62, .66, .75, mat('#868e96'), -.2, .1, 0, 20));
        const rm = glowMat('#b197fc'); const ring = new THREE.Mesh(new THREE.TorusGeometry(.5, .06, 8, 28), rm); ring.rotation.x = Math.PI / 2; ring.position.set(-.2, .88, 0); g.add(ring); fx.glow.push(rm);
        add(box(.45, .5, .4, mat('#dee2e6'), .55, .1, .45));
        break;
      }
      // ---------- consumers
      case 'city': {
        add(box(2.4, .06, 2.2, mat('#c5d3b8')));
        const win = glowMat('#ffd43b'); fx.glow.push(win);
        for (const [x, z, c] of [[-.6, -.5, '#f8f0e3'], [.55, -.55, '#e7f0fb'], [-.5, .55, '#fbe9e7'], [.6, .5, '#f3f0ff']]) {
          add(box(.75, .55, .65, mat(c), x, .06, z)); add(roof(.8, .38, .72, mat('#c0504d'), x, .61, z));
          const w = new THREE.Mesh(new THREE.BoxGeometry(.18, .16, .02), win); w.position.set(x + .15, .35, z + .335); g.add(w);
        }
        break;
      }
      case 'office': {
        add(box(2.2, .06, 2, mat('#cfd6dc')));
        const win = glowMat('#ffe066'); fx.glow.push(win);
        for (const [x, z, h] of [[-.45, -.2, 2.1], [.55, .35, 1.4]]) {
          add(box(.85, h, .85, mat('#9ec5e8', { roughness: .3 }), x, .06, z));
          for (let k = .4; k < h; k += .35) { const s = new THREE.Mesh(new THREE.BoxGeometry(.87, .06, .87), win); s.position.set(x, .06 + k, z); g.add(s); }
        }
        break;
      }
      case 'data': {
        add(box(2.3, .06, 1.9, mat('#cfd6dc')));
        add(box(2, .75, 1.4, mat('#495057'), 0, .06, 0));
        for (let i = 0; i < 3; i++) add(box(.4, .2, .4, mat('#adb5bd'), -.6 + i * .6, .81, -.2));
        for (let i = 0; i < 10; i++) { const m = glowMat(i % 3 ? '#51cf66' : '#4dabf7'); fx.blink.push(m); const l = new THREE.Mesh(new THREE.BoxGeometry(.08, .05, .02), m); l.position.set(-.8 + i * .18, .45, .71); g.add(l); }
        break;
      }
      case 'factory': {
        add(box(2.4, .06, 2, mat('#cfd6dc')));
        add(box(1.8, .6, 1.2, mat('#e9ecef'), -.1, .06, 0));
        for (let i = 0; i < 3; i++) add(roof(1.22, .35, .6, mat('#868e96'), -.7 + i * .6, .66, 0)).rotation.y = 0;
        add(cyl(.12, .16, 1.6, mat('#a61e4d'), .85, .06, -.5)); fx.smoke.push(new THREE.Vector3(.85, 1.7, -.5));
        const win = glowMat('#ffd43b'); fx.glow.push(win); const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, .14, .02), win); w.position.set(-.1, .4, .61); g.add(w);
        break;
      }
      case 'ev': {
        add(box(2.2, .06, 1.8, mat('#adb5bd')));
        for (let i = 0; i < 3; i++) {
          add(box(.14, .5, .12, mat('#f1f3f5'), -.7 + i * .7, .06, -.5));
          const m = glowMat('#40c057'); fx.blink.push(m); const l = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .02), m); l.position.set(-.7 + i * .7, .45, -.43); g.add(l);
        }
        for (const [x, c] of [[-.7, '#4dabf7'], [0, '#ff8787'], [.7, '#ffd43b']]) { add(box(.4, .2, .7, mat(c), x, .1, .2)); add(box(.32, .14, .36, mat('#dee2e6'), x, .3, .15)); }
        break;
      }
      case 'steel': {
        add(box(2.4, .06, 2, mat('#ced4da')));
        add(box(1.7, 1.1, 1.3, mat('#adb5bd'), -.2, .06, 0)); add(roof(1.72, .35, 1.32, mat('#495057'), -.2, 1.16, 0));
        const fm = glowMat('#ff6b00'); fx.glow.push(fm); fx.flicker = fm;
        const f = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .02), fm); f.position.set(-.2, .3, .66); g.add(f);
        add(cyl(.12, .16, 1.9, mat('#495057'), .85, .06, -.55)); fx.smoke.push(new THREE.Vector3(.85, 2, -.55));
        break;
      }
      case 'rail': {
        add(box(2.4, .06, 1.6, mat('#ced4da')));
        for (let i = 0; i < 9; i++) add(box(.08, .04, .6, mat('#8d6e63'), -1.05 + i * .26, .06, 0));
        for (const z of [-.2, .2]) add(box(2.3, .04, .05, mat('#868e96'), 0, .1, z));
        const tr = new THREE.Group(); tr.position.y = .14; g.add(tr);
        tr.add(box(.8, .38, .42, mat('#c92a2a'), -.2, 0, 0)); tr.add(box(.6, .34, .42, mat('#f1f3f5'), .55, 0, 0));
        tr.add(box(.06, .3, .02, mat('#495057'), -.2, .38, 0)); fx.train = tr;
        break;
      }
      case 'heat': {
        add(box(2.2, .06, 2, mat('#c5d3b8')));
        add(box(1.1, .7, .9, mat('#fff4e6'), -.3, .06, -.1)); add(roof(1.15, .45, .98, mat('#5c7cfa'), -.3, .76, -.1));
        add(box(.5, .4, .3, mat('#f1f3f5'), .65, .06, .45));
        const m = glowMat('#ff922b'); fx.glow.push(m); const grille = new THREE.Mesh(new THREE.CircleGeometry(.12, 12), m); grille.position.set(.65, .26, .61); g.add(grille);
        const win = glowMat('#ffd43b'); fx.glow.push(win); const w = new THREE.Mesh(new THREE.BoxGeometry(.25, .18, .02), win); w.position.set(-.3, .4, .36); g.add(w);
        break;
      }
    }
    g.traverse(o => { if (o.isMesh && !o.material.userData.glow && !o.material.userData.base) o.material.userData.base = o.material.color.clone(); });
    return { g, fx };
  }

  // ---------- smoke / steam puffs (pooled)
  const puffGeo = new THREE.SphereGeometry(.18, 8, 6);
  const puffs = [];
  function puff(pos, steam) {
    let p = puffs.find(p => !p.visible);
    if (!p) { if (puffs.length > 140) return; p = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#fff', transparent: true, opacity: .7, depthWrite: false, roughness: 1 })); puffs.push(p); scene.add(p); }
    p.visible = true; p.position.copy(pos); p.userData.t = 0; p.userData.v = new THREE.Vector3((Math.random() - .5) * .25, .9 + Math.random() * .4, (Math.random() - .5) * .25);
    p.material.color.set(steam ? '#ffffff' : '#adb5bd'); p.scale.setScalar(.6);
  }
  function stepPuffs(dt) {
    for (const p of puffs) if (p.visible) {
      const u = p.userData; u.t += dt; p.position.addScaledVector(u.v, dt); p.scale.setScalar(.6 + u.t * 1.6);
      p.material.opacity = Math.max(0, .65 * (1 - u.t / 1.8)); if (u.t > 1.8) p.visible = false;
    }
  }

  // ---------- wires with energy pulses
  const pulseGeo = new THREE.SphereGeometry(.11, 8, 6);
  function makeWire(o) {
    const w = { core: null, glow: null, curve: null, pulses: [], key: '' };
    w.coreMat = new THREE.MeshStandardMaterial({ color: '#2b8a3e', emissive: NEON_GEN, emissiveIntensity: 1, roughness: .3 });
    w.glowMat = new THREE.MeshBasicMaterial({ color: NEON_GEN, transparent: true, opacity: .22, depthWrite: false });
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' })); p.userData.t = i / 3; scene.add(p); w.pulses.push(p); }
    o.wire = w;
  }
  function layoutWire(o) {
    const w = o.wire, a = o.g.position, key = a.x.toFixed(2) + ',' + a.z.toFixed(2);
    if (key === w.key) return; w.key = key;
    const dir = new THREE.Vector3(-a.x, 0, -a.z).normalize();
    const start = new THREE.Vector3(a.x + dir.x * 1.45, .3, a.z + dir.z * 1.45);
    const mid = start.clone().lerp(HUB_IN, .5); mid.y += 1.6;
    w.curve = new THREE.QuadraticBezierCurve3(start, mid, HUB_IN.clone());
    if (w.core) { scene.remove(w.core, w.glow); w.core.geometry.dispose(); w.glow.geometry.dispose(); }
    w.core = new THREE.Mesh(new THREE.TubeGeometry(w.curve, 28, .055, 6), w.coreMat);
    w.glow = new THREE.Mesh(new THREE.TubeGeometry(w.curve, 28, .15, 8), w.glowMat);
    scene.add(w.core, w.glow);
  }
  function dropWire(o) {
    const w = o.wire; if (!w) return;
    scene.remove(w.core, w.glow, ...w.pulses); w.core?.geometry.dispose(); w.glow?.geometry.dispose();
  }

  // ---------- objects for units and loads
  const objs = new Map();   // key 'u12' / 'L7' -> object
  const tmpC = new THREE.Color();
  function getObj(key, type, isLoad) {
    let o = objs.get(key);
    if (!o) {
      const m = model(type); o = { key, type, isLoad, g: m.g, fx: m.fx, appear: 0, rm: -1, on: 0, last: 0, tgt: new THREE.Vector3(), placed: false, smokeT: 0 };
      o.g.scale.setScalar(.001); scene.add(o.g); makeWire(o); objs.set(key, o);
    }
    return o;
  }
  function tint(o, on, alarm) {
    o.g.traverse(m => {
      if (!m.isMesh) return; const mt = m.material;
      if (mt.userData.glow) return;
      const base = mt.userData.base; if (!base) return;
      tmpC.copy(GREY).lerp(base, .25 + .75 * on);
      if (alarm) tmpC.lerp(new THREE.Color('#ff6b6b'), alarm);
      mt.color.copy(tmpC);
    });
  }

  // two half-ring slots: generators on the left of the screen, consumers on the right
  function slots(n, side) {
    const out = [], inner = Math.min(n, 7), rings = [[inner, 7.4], [n - inner, 11.6]];
    const center = side < 0 ? Math.PI * .95 : -Math.PI * .05;   // generators back-left, consumers front-right
    for (const [cnt, r] of rings) {
      if (cnt <= 0) continue;
      const span = Math.min(Math.PI * .94, (cnt - 1) * 3.2 / r + .001);
      for (let i = 0; i < cnt; i++) {
        const a = center + (cnt === 1 ? 0 : -span / 2 + span * i / (cnt - 1));
        out.push(new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r));
      }
    }
    return out;
  }

  let worldR = 10, ppu = 20, W = 1, H = 1;
  function resize(w, h) {
    if (w === W && h === H) return; W = w; H = h;
    renderer.setSize(w, h, false); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    fit();
  }
  function fit() {
    // portrait screens look more from above, so the round world fills more of the tall panel
    const aspect = W / H, e = aspect < .9 ? .98 : .72, d = 70;
    cam.position.set(target.x + Math.cos(e) * d / Math.SQRT2, target.y + Math.sin(e) * d, target.z + Math.cos(e) * d / Math.SQRT2); cam.lookAt(target);
    const halfW = worldR * 1.02, halfH = worldR * Math.sin(e) * 1.02 + 2.6 * Math.cos(e) + .4;
    let hw = halfW, hh = halfH;
    if (aspect > halfW / halfH) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(cam, { left: -hw, right: hw, top: hh, bottom: -hh }); cam.updateProjectionMatrix();
    ppu = H / (2 * hh);
  }
  const v = new THREE.Vector3();
  function project(p, y) { v.set(p.x, y, p.z).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; }

  // ---------- per-frame update; returns screen positions for the 2D overlay and taps
  function frame(dt, G, w, h, opts) {
    resize(w, h);
    const time = performance.now() / 1000;
    // day and night
    const s = opts.sun, k = Math.min(1, s * 1.6);
    scene.background.copy(bgNight).lerp(bgDay, .2 + .8 * k);
    sun.intensity = .25 + 1.7 * k; hemi.intensity = .45 + .75 * k;
    // layout
    const gens = G.units.slice().sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.id - b.id);
    const gs = slots(gens.length, -1), ls = slots(G.loads.length, 1);
    let far = 7.4; for (const p of gs.concat(ls)) far = Math.max(far, Math.hypot(p.x, p.z));
    const wr = far + 2.3; if (Math.abs(wr - worldR) > .01) { worldR += (wr - worldR) * Math.min(1, dt * 4 + (objs.size ? 0 : 1)); fit(); }
    ground.scale.set(worldR, 1, worldR); rim.scale.set(worldR, 1, worldR);
    const seen = new Set(), out = { units: new Map(), loads: new Map(), hub: null, ppu };
    const place = (o, p) => { o.tgt.copy(p); if (!o.placed) { o.g.position.copy(p); o.placed = true; } else o.g.position.lerp(p, Math.min(1, dt * 5)); };
    gens.forEach((u, i) => {
      const o = getObj('u' + u.id, u.type, false); seen.add(o.key); place(o, gs[i]);
      // face the hub
      o.g.rotation.y = Math.atan2(-o.g.position.x, -o.g.position.z) + Math.PI;
      const T = u.T, onT = T.kind === 'sync' ? Math.max(u.engaged ? .35 : 0, u.level) : (u.engaged && u.trip <= 0 ? 1 : 0);
      o.on += (onT - o.on) * Math.min(1, dt * 3);
      const frac = Math.min(1, Math.abs(u.P) / T.cap), bad = u.repair > 0 || u.trip > 0;
      tint(o, o.on, bad ? .35 + .35 * Math.sin(time * 8) : 0);
      for (const m of o.fx.glow) m.emissiveIntensity = (T.kind === 'solar' ? frac * 1.2 : o.on * 1.4);
      for (const m of o.fx.blink) m.emissiveIntensity = o.on > .5 && Math.sin(time * 3 + u.id) > .3 ? 2 : 0;
      if (o.fx.water) o.fx.water.opacity = .85 * frac;
      if (o.fx.led) { const l = o.fx.led; l.mesh.scale.x = Math.max(.02, u.soc); l.mat.emissive.set(u.P < -1 ? '#22b8cf' : '#40c057'); l.mat.emissiveIntensity = o.on ? 1.2 + .8 * frac : .15; }
      o.smokeT -= dt; if (o.fx.smoke.length && frac > .02 && o.smokeT <= 0) { o.smokeT = .5 / (.3 + frac); for (const p of o.fx.smoke) puff(o.g.localToWorld(p.clone()), !!o.fx.steam); }
      wireState(o, u.P / T.cap, o.on, dt, false);
      out.units.set(u.id, proj(o));
    });
    G.loads.forEach((L, i) => {
      const o = getObj('L' + L.id, L.type, true); seen.add(o.key); place(o, ls[i]);
      o.g.rotation.y = Math.atan2(-o.g.position.x, -o.g.position.z) + Math.PI;
      const on = L.off > 0 ? 0 : 1, frac = Math.min(1.5, L.P / (L.base + 1));
      o.on += (on - o.on) * Math.min(1, dt * 3); tint(o, o.on, 0);
      const night = 1 - k;
      for (const m of o.fx.glow) m.emissiveIntensity = o.on * (m === o.fx.flicker ? frac * (1.2 + Math.random() * .8) : (.35 + 1.4 * night) * Math.min(1, frac + .2));
      for (const m of o.fx.blink) m.emissiveIntensity = o.on && Math.random() > .35 ? 1.6 : .1;
      if (o.fx.train) o.fx.train.position.x = Math.sin(time * .8 + L.id) * .45 * Math.min(1, (L.spike || 0) + .25);
      o.smokeT -= dt; if (o.fx.smoke.length && o.on && o.smokeT <= 0) { o.smokeT = .8 / (.3 + frac); for (const p of o.fx.smoke) puff(o.g.localToWorld(p.clone()), false); }
      wireState(o, -frac, o.on, dt, true);
      out.loads.set(L.id, proj(o));
    });
    // build / scrap animations
    for (const o of objs.values()) {
      if (!seen.has(o.key) && o.rm < 0) o.rm = 0;
      if (o.rm >= 0) {
        o.rm += dt / .6; const t = Math.min(1, o.rm);
        o.g.scale.setScalar(Math.max(.001, (1 - t) * MS)); o.g.position.y = -t * .8; o.g.rotation.y += dt * 0;
        if (o.wire.core) { o.wire.coreMat.emissiveIntensity = 0; o.wire.glowMat.opacity = .22 * (1 - t); }
        if (t >= 1) { scene.remove(o.g); dropWire(o); objs.delete(o.key); o.g.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); }
        continue;
      }
      if (o.appear < 1) { o.appear = Math.min(1, o.appear + dt / .7); o.g.scale.setScalar(Math.max(.001, easeOutBack(o.appear) * MS)); o.g.position.y = (1 - o.appear) * -1; if (Math.random() < .3) puff(o.g.position.clone().setY(.2), true); }
      layoutWire(o);
    }
    // hub: status colour, alarm pulse
    const col = new THREE.Color(opts.status);
    orbMat.emissive.copy(col); haloMat.color.copy(col);
    const al = opts.alarm; halo.scale.setScalar(1.05 + .15 * Math.sin(time * (al ? 9 : 2)));
    alarmMat.opacity = al ? .35 + .35 * Math.sin(time * 10) : 0;
    hub.position.y = 0;
    stepPuffs(dt);
    renderer.render(scene, cam);
    const hp = project(new THREE.Vector3(0, 0, 0), 3.9), hc = project(new THREE.Vector3(0, 0, 0), 2.4);
    out.hub = { x: hc.x, y: hc.y, lx: hp.x, ly: hp.y, r: 1.6 * ppu };
    out.ppu = ppu;
    return out;
  }
  function proj(o) {
    const p = o.g.position, c = project(p, 1), t = project(p, MS * (o.isLoad ? 1.6 : (o.type === 'wind' ? 3.3 : o.type === 'nuclear' ? 2.7 : 1.9)));
    return { x: c.x, y: c.y, lx: t.x, ly: t.y, r: 1.5 * ppu };
  }
  function wireState(o, flow, on, dt, isLoad) {
    const w = o.wire; if (!w.curve) return;
    const lit = Math.min(1, Math.abs(flow) * 1.5) * on;
    const red = isLoad || flow < -.01, neon = red ? NEON_LOAD : NEON_GEN;
    w.coreMat.emissive.copy(WIRE_OFF).lerp(neon, Math.min(1, on * 1.5)); w.coreMat.emissiveIntensity = .15 + 1.2 * lit;
    w.coreMat.color.copy(WIRE_OFF).lerp(red ? CORE_LOAD : CORE_GEN, on);
    w.glowMat.color.copy(neon); w.glowMat.opacity = .05 + .3 * lit;
    for (const p of w.pulses) p.material.color.copy(neon).lerp(new THREE.Color('#ffffff'), .55);
    // pulses run towards the grid for producers, towards the asset for consumers and charging batteries
    const sp = .25 + Math.abs(flow) * .9, toHub = flow > 0;
    for (const p of w.pulses) {
      p.visible = lit > .03;
      p.userData.t = (p.userData.t + dt * sp) % 1;
      const t = toHub ? p.userData.t : 1 - p.userData.t;
      p.position.copy(w.curve.getPointAt(t));
    }
  }
  function setVisible(b) { cv.style.display = b ? '' : 'none'; }
  return { frame, setVisible, el: cv };
}
