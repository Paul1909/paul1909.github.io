// Low-poly cat model built from primitives. Faces +Z, feet on y = 0.
(() => {

const FURS = [
  { id: 'ginger', name: 'Ginger', color: '#e5852c', belly: '#f6d2a8' },
  { id: 'black', name: 'Black', color: '#2a272f', belly: '#46424d' },
  { id: 'white', name: 'Snow', color: '#f3f0ea', belly: '#ffffff' },
  { id: 'grey', name: 'Grey', color: '#8e949c', belly: '#cfd3d8' },
  { id: 'cream', name: 'Cream', color: '#e9cf9e', belly: '#fbf0dc' },
  { id: 'brown', name: 'Chocolate', color: '#6e4426', belly: '#b08560' },
  { id: 'blue', name: 'Blue', color: '#6c7d95', belly: '#b0bccb' },
  { id: 'lilac', name: 'Lilac', color: '#b29cb3', belly: '#e6daE6' },
];

const EYES = [
  { id: 'green', name: 'Green', l: '#46c443', r: '#46c443' },
  { id: 'yellow', name: 'Yellow', l: '#f3d22c', r: '#f3d22c' },
  { id: 'blue', name: 'Blue', l: '#3d9cf0', r: '#3d9cf0' },
  { id: 'amber', name: 'Amber', l: '#f39a1c', r: '#f39a1c' },
  { id: 'copper', name: 'Copper', l: '#c45f28', r: '#c45f28' },
  { id: 'hazel', name: 'Hazel', l: '#9b8b3c', r: '#9b8b3c' },
  { id: 'odd', name: 'Odd-eyed', l: '#3d9cf0', r: '#f3d22c' },
];

const PATTERNS = [
  { id: 'solid', name: 'Solid' },
  { id: 'tabby', name: 'Tabby' },
  { id: 'socks', name: 'Socks' },
];

const lam = c => new THREE.MeshLambertMaterial({ color: c });

function buildCat(o) {
  const fur = FURS.find(f => f.id === o.fur) || FURS[0];
  const eye = EYES.find(e => e.id === o.eyes) || EYES[0];
  const furM = lam(fur.color);
  const bellyM = lam(fur.belly);
  const darkM = lam(new THREE.Color(fur.color).multiplyScalar(fur.id === 'black' ? 0.6 : 0.55));
  const pinkM = lam('#f29bb0');
  const blackM = new THREE.MeshBasicMaterial({ color: '#111111' });
  const whiteM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const socksM = lam('#fbfbf7');
  const mats = [furM, bellyM, darkM, pinkM, blackM, whiteM, socksM];
  const geos = [];
  const G = g => (geos.push(g), g);
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(G(g), m); k.position.set(x, y, z); return k; };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = mesh(new THREE.CapsuleGeometry(0.33, 0.78, 4, 12), furM, 0, 0.66, 0);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  const chest = mesh(new THREE.SphereGeometry(0.27, 10, 8), bellyM, 0, 0.6, 0.4);
  chest.scale.set(0.95, 1, 0.8);
  body.add(chest);

  // collar
  const collarC = o.gender === 'female' ? '#ff4f93' : '#2f6fe0';
  const collar = mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), lam(collarC), 0, 0.84, 0.6);
  mats.push(collar.material);
  collar.rotation.x = Math.PI / 2 - 0.5;
  body.add(collar);
  if (o.gender !== 'female') {
    const goldM = lam('#ffcc33'); mats.push(goldM);
    body.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), goldM, 0, 0.7, 0.74));
  }

  if (o.pattern === 'tabby') {
    for (const z of [-0.42, -0.12, 0.18]) {
      const st = mesh(new THREE.TorusGeometry(0.335, 0.024, 4, 12, Math.PI * 0.62), darkM, 0, 0.66, z);
      st.rotation.z = Math.PI * 0.19;
      body.add(st);
    }
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.74);
  head.scale.setScalar(1.15);
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.3, 14, 10), furM);
  skull.scale.set(1.05, 0.92, 0.95);
  head.add(skull);
  const muzzle = mesh(new THREE.SphereGeometry(0.14, 10, 8), o.pattern === 'socks' ? socksM : bellyM, 0, -0.09, 0.22);
  muzzle.scale.set(1.3, 0.8, 0.9);
  head.add(muzzle);
  head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), pinkM, 0, -0.03, 0.33));
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.12, 0.25, 4), furM, sx * 0.16, 0.25, -0.02);
    ear.rotation.z = -sx * 0.28; ear.rotation.y = Math.PI / 4;
    head.add(ear);
    const inner = mesh(new THREE.ConeGeometry(0.07, 0.16, 4), pinkM, sx * 0.155, 0.23, 0.03);
    inner.rotation.z = -sx * 0.28; inner.rotation.y = Math.PI / 4;
    head.add(inner);
    const eyeM = lam(sx < 0 ? eye.l : eye.r); mats.push(eyeM);
    const e = mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeM, sx * 0.115, 0.04, 0.24);
    head.add(e);
    const pupil = mesh(new THREE.SphereGeometry(0.045, 8, 6), blackM, sx * 0.117, 0.04, 0.29);
    pupil.scale.set(0.38, 1.05, 0.5);
    head.add(pupil);
    head.add(mesh(new THREE.SphereGeometry(0.016, 6, 4), whiteM, sx * 0.1, 0.075, 0.305));
    if (o.pattern === 'tabby') {
      const stripe = mesh(new THREE.BoxGeometry(0.035, 0.12, 0.04), darkM, sx * 0.05, 0.2, 0.2);
      stripe.rotation.x = -0.5;
      head.add(stripe);
    }
  }
  if (o.pattern === 'tabby') {
    const st = mesh(new THREE.BoxGeometry(0.035, 0.14, 0.04), darkM, 0, 0.21, 0.21);
    st.rotation.x = -0.5; head.add(st);
  }
  if (o.gender === 'female') {
    const bowM = lam('#ff4f93'); mats.push(bowM);
    const bow = new THREE.Group();
    bow.position.set(0.16, 0.25, 0.1);
    bow.rotation.z = -0.4;
    for (const sx of [-1, 1]) {
      const c = mesh(new THREE.ConeGeometry(0.06, 0.12, 6), bowM, sx * 0.06, 0, 0);
      c.rotation.z = sx * Math.PI / 2;
      bow.add(c);
    }
    bow.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), bowM));
    head.add(bow);
  }
  // whiskers
  const wpts = [];
  for (const sx of [-1, 1]) for (const dy of [-0.03, 0, 0.03]) {
    wpts.push(sx * 0.12, -0.08, 0.3, sx * 0.42, -0.08 + dy * 3, 0.26 + Math.abs(dy) * 2);
  }
  const wg = G(new THREE.BufferGeometry());
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpts, 3));
  const wm = new THREE.LineBasicMaterial({ color: fur.id === 'white' ? '#888888' : '#f4f4f4' }); mats.push(wm);
  head.add(new THREE.LineSegments(wg, wm));

  // legs
  const legGeo = G(new THREE.CylinderGeometry(0.1, 0.085, 0.5, 7));
  legGeo.translate(0, -0.25, 0);
  const pawGeo = G(new THREE.SphereGeometry(0.11, 8, 6));
  const pawM = o.pattern === 'socks' ? socksM : furM;
  const legs = [];
  for (const [x, z] of [[0.17, 0.45], [-0.17, 0.45], [0.17, -0.45], [-0.17, -0.45]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.6, z);
    pivot.add(new THREE.Mesh(legGeo, furM));
    const paw = new THREE.Mesh(pawGeo, pawM);
    paw.position.set(0, -0.53, 0.03); paw.scale.set(1, 0.7, 1.2);
    pivot.add(paw);
    body.add(pivot);
    legs.push(pivot);
  }

  // tail: chain of 3 segments
  const tail = new THREE.Group();
  tail.position.set(0, 0.76, -0.7);
  body.add(tail);
  let parent = tail;
  const segs = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    if (i > 0) seg.position.y = 0.3;
    const g = G(new THREE.CylinderGeometry(0.05 - i * 0.008, 0.058 - i * 0.008, 0.32, 6));
    g.translate(0, 0.15, 0);
    seg.add(new THREE.Mesh(g, o.pattern === 'tabby' && i === 2 ? darkM : furM));
    seg.rotation.x = i === 0 ? -0.4 : -0.35;
    parent.add(seg);
    parent = seg;
    segs.push(seg);
  }

  if (o.gender === 'female') root.scale.setScalar(0.94);

  let phase = Math.random() * 6;
  let t = Math.random() * 10;
  function update(dt, speed, air) {
    t += dt;
    phase += dt * (speed * 0.5 + (speed > 0.5 ? 3 : 0));
    const run = Math.min(1, speed / 6);
    if (air) {
      legs[0].rotation.x = legs[1].rotation.x = THREE.MathUtils.lerp(legs[0].rotation.x, -1.0, 0.3);
      legs[2].rotation.x = legs[3].rotation.x = THREE.MathUtils.lerp(legs[2].rotation.x, 1.0, 0.3);
      body.position.y = 0;
      body.rotation.x = -0.12;
    } else {
      const a = 0.8 * run;
      legs[0].rotation.x = Math.sin(phase) * a;
      legs[1].rotation.x = Math.sin(phase + 0.5) * a;
      legs[2].rotation.x = Math.sin(phase + Math.PI) * a;
      legs[3].rotation.x = Math.sin(phase + Math.PI + 0.5) * a;
      body.position.y = Math.abs(Math.sin(phase)) * 0.06 * run;
      body.rotation.x = Math.sin(phase * 2) * 0.04 * run;
    }
    segs[0].rotation.z = Math.sin(t * 3) * 0.25;
    segs[1].rotation.z = Math.sin(t * 3 - 0.8) * 0.3;
    segs[0].rotation.x = -0.4 - run * 0.7;
    head.rotation.y = Math.sin(t * 0.7) * 0.08 * (1 - run);
  }

  function dispose() {
    geos.forEach(g => g.dispose());
    mats.forEach(m => m.dispose());
  }

  return { root, body, head, legs, update, dispose, furColor: fur.color, bellyColor: fur.belly };
}

window.WRCat = { FURS, EYES, PATTERNS, buildCat };
})();
