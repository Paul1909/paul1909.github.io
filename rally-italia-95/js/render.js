// OutRun-style pseudo-3D renderer: the road is projected segment by segment (far to near) as flat bands,
// with striped kerbs and ground, and everything else is a scaled pixel-art sprite.
import { makeSprites, bannerSprite, carSprites, backgrounds, rng } from './sprites.js';

const SEG = 2;           // samples per drawn segment (2 m each -> 4 m)
const NSEG = 150;        // draw distance in segments
const NEAR = 0.7;
const BAND = 3;          // segments per light/dark stripe

const THEMES = {
  toscana: { grass: ['#9db255', '#90a54a'], kerb: ['#c2ad82', '#a99470'], kerbW: 1.13, road: ['#dccca4', '#d2c299'], line: null, edge: null,
    sky: ['#2f6fd0', '#bcd8ef'], fog: '#cfe2ef' },
  passo: { grass: ['#6f9b4e', '#628c42'], kerb: ['#efefef', '#d22a2a'], kerbW: 1.12, road: ['#6e6e73', '#68686c'], line: '#eeeeee', edge: '#e8e8e8',
    sky: ['#2557c0', '#d6e4f2'], fog: '#dde8f2' },
  riviera: { grass: ['#cfc4b1', '#c4b9a5'], kerb: ['#e6dfd2', '#d9d2c4'], kerbW: 1.48, road: ['#8d837a', '#837970'], line: null, edge: '#5e5650',
    sky: ['#347ddc', '#f1e0c4'], fog: '#efdfc6' },
};
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`;

export class Road {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.S = makeSprites();
    this.cars = new Map();
    this.pts = []; for (let k = 0; k <= NSEG; k++) this.pts.push({ zc: 0, sx: 0, sy: 0, sc: 0, w: 0, i: 0 });
    this.segs = []; for (let k = 0; k < NSEG; k++) this.segs.push({ vis: false, clip: 0, items: [] });
  }
  resize(W, H) { this.cv.width = W; this.cv.height = H; this.W = W; this.H = H; this.g.imageSmoothingEnabled = false; this.F = H * 0.9; this.skyGrad = null; }
  carSprite(spec) { if (!this.cars.has(spec.id)) this.cars.set(spec.id, carSprites(spec)); return this.cars.get(spec.id); }

  setTrack(tr) {
    this.tr = tr; const def = tr.def, id = def.id, W = tr.W, N = tr.N, R = rng(id.length * 977 + 5);
    const T = this.T = THEMES[id];
    this.col = { grass: T.grass.map(hexRgb), kerb: T.kerb.map(hexRgb), road: T.road.map(hexRgb), fog: hexRgb(T.fog),
      line: T.line && hexRgb(T.line), edge: T.edge && hexRgb(T.edge) };
    this.bg = backgrounds(id); this.skyGrad = null;
    // barrier bands: [bottom m, top m, colour]
    this.wallBands = {
      toscana: [[-0.3, 0.8, hexRgb('#a3937a')], [0.8, 0.95, hexRgb('#c9bba0')]],
      passo: [[0.42, 0.62, hexRgb('#c3c9d0')], [0.62, 0.82, hexRgb('#9aa1aa')]],
      riviera: [[0.1, 0.9, hexRgb('#e3d9c6')], [0.9, 1.05, hexRgb('#b9ad98')]],
    }[id];
    this.wallH = 1;
    const P = this.props = new Array(N);
    const add = (i, type, lat, s = 1) => { i = tr.wrap(i); (P[i] ||= []).push({ type, lat, s }); };
    const clear = (i, lat, min) => { const x = tr.xs[i] - tr.tz[i] * lat, z = tr.zs[i] + tr.tx[i] * lat; const n = tr.nearestFar(x, z, min + 2); return !n || n.d >= min; };
    const wall = def.wall;
    for (let i = 0; i < N; i++) {
      const k = tr.curv[i], out = Math.sign(k) || 1, tight = Math.abs(k) > 1 / 45;
      if (id === 'toscana') {
        if (i % 6 === 0 && Math.sin(i / 60) > 0.35) for (const sd of [-1, 1]) if (clear(i, sd * (wall + 2.5), wall)) add(i, 'cypress', sd * (wall + 2.5), 0.9 + R() * 0.3);
        if (i % 3 === 0 && R() < 0.3) { const sd = R() < 0.5 ? -1 : 1, lat = sd * (wall + 5 + R() * 55); if (clear(i, lat, wall + 2)) add(i, R() < 0.5 ? 'umbrella' : 'olive', lat, 0.8 + R() * 0.5); }
        if (i % 4 === 0 && Math.sin(i / 37 + 1) > 0.6) for (const d of [12, 18, 24]) { const sd = Math.sin(i / 90) > 0 ? 1 : -1; if (clear(i, sd * (wall + d), wall + 4)) add(i, 'vines', sd * (wall + d)); }
        if (i % 130 === 40) { const sd = R() < 0.5 ? -1 : 1, lat = sd * (wall + 26 + R() * 40); if (clear(i, lat, wall + 12)) add(i, 'farm', lat, 0.9 + R() * 0.3); }
        if (tight && i % 10 === 0) add(i, 'bale', out * (wall - 1.2));
      } else if (id === 'passo') {
        if (i % 12 === 0) for (const sd of [-1, 1]) add(i, 'post', sd * (W / 2 + 0.55));
        if (i % 4 === 0) for (const sd of [-1, 1]) add(i, 'railpost', sd * wall);
        if (R() < 0.33) { const sd = R() < 0.5 ? -1 : 1, lat = sd * (wall + 3 + R() * 45); if (clear(i, lat, wall + 2)) add(i, R() < 0.82 ? 'pine' : 'rock', lat, 0.8 + R() * 0.6); }
        if (Math.abs(k) > 1 / 26 && i % 3 === 0 && R() < 0.7) { const lat = out * (wall + 2 + R() * 3); if (clear(i, lat, wall + 1.5)) add(i, 'fans', lat, 0.9 + R() * 0.2); }
      } else {
        if (i % 6 === 0) for (const sd of [-1, 1]) {
          const lat = sd * (wall + 0.6), x = tr.xs[i] - tr.tz[i] * lat, z = tr.zs[i] + tr.tx[i] * lat;
          if (z < -6) { if (i % 12 === 0) add(i, 'palm', sd * (W / 2 + 1.5), 0.9 + R() * 0.3); continue; }  // seafront: palms, open view to the sea
          if (Math.abs(k) > 1 / 60 && sd === -out) continue;  // keep the inside of corners open
          if (clear(i, lat, wall - 0.3)) add(i, 'house' + ((R() * 6) | 0), lat);
        }
        if (i % 15 === 0) for (const sd of [-1, 1]) add(i, 'lamp', sd * (W / 2 + 1.7));
        if (Math.abs(k) > 1 / 30 && i % 4 === 0 && R() < 0.6) add(i, 'fans', out * (W / 2 + 1.3), 0.8);
        if (i === Math.floor(N * 0.42)) add(i, 'tower', -(wall + 22));
      }
      if (tight && i % 8 === 0 && id !== 'riviera') add(i, k > 0 ? 'chevL' : 'chevR', out * (W / 2 + 2.2));
    }
    add(tr.wrap(Math.round((tr.startS + 60) / tr.ds)), 'board', -(wall + 2));
    // gates
    this.finishIdx = new Set();
    for (const t of tr.targets.filter(t => t.lap === 0)) {
      const i = tr.wrap(Math.round((tr.startS + t.at) / tr.ds));
      (P[i] ||= []).push({ type: 'gate', img: bannerSprite(t.kind === 'cp' ? 'CHECKPOINT' : tr.closed ? 'START · FINISH' : 'FINISH', t.kind === 'cp' ? '#d6a013' : '#c81d25') });
      if (t.kind !== 'cp') this.finishIdx.add(i >> 1);
    }
    if (!tr.closed) { const i = Math.round(tr.startS / tr.ds); (P[i] ||= []).push({ type: 'gate', img: bannerSprite('START', '#1f5fc2') }); this.finishIdx.add(i >> 1); }
  }

  // cam: {x, y, z, yaw, pitch, s}; cars: [{x,y,z,h,spec,turn,brake,i,hide,bounce}]; parts: [{x,y,z,size,col,a}]
  draw(cam, cars, parts) {
    const g = this.g, W = this.W, H = this.H, F = this.F, tr = this.tr, C = this.col, T = this.T;
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    const hor = H * 0.46, horizonY = hor + cam.pitch * F;
    const fogN = tr.def.fogNear, fogF = tr.def.fogFar;
    const fogAt = z => Math.min(1, Math.max(0, (z - fogN) / (fogF - fogN)));
    const proj = (wx, wy, wz, o) => {
      const dx = wx - cam.x, dz = wz - cam.z, zc = dx * fx + dz * fz, xc = dx * rx + dz * rz, yc = wy - cam.y - cam.pitch * zc;
      o.zc = zc; if (zc > 0.01) { o.sc = F / zc; o.sx = W / 2 + xc * o.sc; o.sy = hor - yc * o.sc; }
      return o;
    };
    // ---- sky and parallax ----
    if (!this.skyGrad) { this.skyGrad = g.createLinearGradient(0, 0, 0, H * 0.6); this.skyGrad.addColorStop(0, T.sky[0]); this.skyGrad.addColorStop(1, T.sky[1]); }
    g.fillStyle = this.skyGrad; g.fillRect(0, 0, W, H);
    const k = H / 240;
    for (const L of this.bg) {
      const lw = L.c.width * k, lh = L.c.height * k;
      let off = (-(cam.yaw / (Math.PI * 2)) * lw * 2 * L.par) % lw; if (off > 0) off -= lw;
      for (let x = off; x < W; x += lw) g.drawImage(L.c, Math.floor(x), Math.floor(horizonY - lh + 1), Math.ceil(lw) + 1, Math.ceil(lh));
    }
    g.fillStyle = mix(C.grass[1], C.fog, 0.85); g.fillRect(0, Math.floor(horizonY), W, H);

    // ---- project centre-line points, near to far ----
    const ds = tr.ds;
    let i0 = Math.floor(cam.s / ds); i0 -= ((i0 % SEG) + SEG) % SEG;
    const pts = this.pts, segs = this.segs;
    let n = 0;
    for (let kk = 0; kk <= NSEG; kk++) {
      let i = i0 + kk * SEG;
      if (!tr.closed && (i < 0 || i >= tr.N)) { if (i < 0) continue; break; }
      i = tr.wrap(i);
      const p = pts[n]; p.i = i; proj(tr.xs[i], tr.ys[i], tr.zs[i], p);
      n++;
    }
    // pull the nearest point up to the near plane so the road reaches the bottom edge
    for (let a = 0; a < n - 1; a++) {
      const p = pts[a], q = pts[a + 1];
      if (p.zc < NEAR && q.zc > NEAR) {
        const t = (NEAR - p.zc) / (q.zc - p.zc), i = p.i, j = q.i;
        proj(tr.xs[i] + (tr.xs[j] - tr.xs[i]) * t, tr.ys[i] + (tr.ys[j] - tr.ys[i]) * t, tr.zs[i] + (tr.zs[j] - tr.zs[i]) * t, p);
      }
    }
    const halfW = tr.W / 2;
    let maxy = H;
    for (let a = 0; a < n - 1; a++) {
      const p1 = pts[a], p2 = pts[a + 1], sg = segs[a];
      sg.clip = maxy; sg.items.length = 0;
      sg.vis = !(p1.zc < NEAR - 0.01 || p2.zc <= NEAR || p2.sy >= maxy || p2.sy >= p1.sy);
      if (sg.vis) maxy = p2.sy;
      p1.w = halfW * p1.sc; p2.w = halfW * p2.sc;
    }
    // ---- road bands, far to near ----
    const trap = (x1, y1, w1, x2, y2, w2, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x1 - w1, y1); g.lineTo(x2 - w2, y2); g.lineTo(x2 + w2, y2); g.lineTo(x1 + w1, y1); g.closePath(); g.fill();
    };
    for (let a = n - 2; a >= 0; a--) {
      const sg = segs[a]; if (!sg.vis) continue;
      const p1 = pts[a], p2 = pts[a + 1];
      const band = (Math.floor(p1.i / (SEG * BAND))) & 1, fog = fogAt(p2.zc);
      const y1 = Math.ceil(p1.sy), y2 = Math.floor(p2.sy);
      g.fillStyle = mix(C.grass[band], C.fog, fog); g.fillRect(0, y2, W, y1 - y2 + 1);
      trap(p1.sx, p1.sy + 1, p1.w * T.kerbW, p2.sx, p2.sy, p2.w * T.kerbW, mix(C.kerb[band], C.fog, fog));
      if (this.finishIdx.has(p1.i >> 1)) {
        for (let c = 0; c < 8; c++) {
          const u0 = -1 + c / 4, u1 = u0 + 0.25;
          g.fillStyle = c % 2 ? '#111' : '#f4f4f4'; g.beginPath();
          g.moveTo(p1.sx + u0 * p1.w, p1.sy + 1); g.lineTo(p2.sx + u0 * p2.w, p2.sy); g.lineTo(p2.sx + u1 * p2.w, p2.sy); g.lineTo(p1.sx + u1 * p1.w, p1.sy + 1); g.fill();
        }
        continue;
      }
      trap(p1.sx, p1.sy + 1, p1.w, p2.sx, p2.sy, p2.w, mix(C.road[band], C.fog, fog));
      if (C.edge) for (const sd of [-1, 1]) {
        const e1 = p1.sx + sd * p1.w * 0.94, e2 = p2.sx + sd * p2.w * 0.94;
        trap(e1, p1.sy + 1, p1.w * 0.025, e2, p2.sy, p2.w * 0.025, mix(C.edge, C.fog, fog));
      }
      if (C.line && band) trap(p1.sx, p1.sy + 1, p1.w * 0.022, p2.sx, p2.sy, p2.w * 0.022, mix(C.line, C.fog, fog));
    }

    // ---- walls, sprites and cars, far to near, clipped by nearer hill crests ----
    // Everything is placed the classic pseudo-3D way: x = road centre + road half-width * (lateral / half-width),
    // interpolated between the two ends of its segment, so it always lines up with the road edges.
    for (const c of cars) {
      if (c.hide) continue;
      const u = c.s / ds, rel = ((u - pts[0].i) % tr.N + tr.N) % tr.N, a = Math.floor(rel / SEG);
      if (a >= 0 && a < n - 1) { c._a = a; c._t = (rel - a * SEG) / SEG; segs[a].items.push(c); }
    }
    const S = this.S, wallH = this.wallH, wallLat = tr.def.wall;
    const lerp = (p, q, t) => ({ sx: p.sx + (q.sx - p.sx) * t, sy: p.sy + (q.sy - p.sy) * t, w: p.w + (q.w - p.w) * t, sc: p.sc + (q.sc - p.sc) * t, zc: p.zc + (q.zc - p.zc) * t });
    for (let a = n - 2; a >= 0; a--) {
      const sg = segs[a], clip = sg.clip, p1 = pts[a], p2 = pts[a + 1], i = p1.i;
      if (p2.zc < NEAR) continue;
      // barriers along both edges (stone wall / guard rail / sea wall) as quads, like OutRun's fences
      if (sg.vis && wallH) {
        const fog = fogAt(p2.zc), k1 = wallLat / halfW;
        for (const sd of [-1, 1]) {
          const x1 = p1.sx + sd * p1.w * k1, x2 = p2.sx + sd * p2.w * k1;
          for (const [lo, hi, col] of this.wallBands) {
            g.fillStyle = mix(col, C.fog, fog); g.beginPath();
            g.moveTo(x1, p1.sy - lo * p1.sc); g.lineTo(x2, p2.sy - lo * p2.sc); g.lineTo(x2, p2.sy - hi * p2.sc); g.lineTo(x1, p1.sy - hi * p1.sc); g.closePath(); g.fill();
          }
        }
      }
      for (let j = i; j < i + SEG; j++) {
        const list = this.props[tr.wrap(j)]; if (!list) continue;
        const q = lerp(p1, p2, (j - i) / SEG); if (q.zc < 2.5) continue;
        for (const pr of list) {
          if (pr.type === 'gate') { this.gate(pr, q, clip, fogAt(q.zc)); continue; }
          const sp = pr.type.startsWith('house') ? S.houses[+pr.type.slice(5)] : S[pr.type];
          this.blit(sp.c, q.sx + q.w * pr.lat / halfW, q.sy, sp.w * pr.s * q.sc, sp.h * pr.s * q.sc, clip, fogAt(q.zc));
        }
      }
      for (const c of sg.items) {
        const q = lerp(p1, p2, c._t); if (q.zc < 1.2) continue;
        const cs = this.carSprite(c.spec), img = cs.frames[(c.brake ? 1 : 0) + ':' + c.turn];
        this.blit(img, q.sx + q.w * c.lat / halfW, q.sy - ((c.lift || 0) + (c.bounce || 0)) * q.sc, cs.w * q.sc, cs.h * q.sc, clip, fogAt(q.zc) * 0.8);
      }
    }
    const tmp = { zc: 0, sc: 0, sx: 0, sy: 0 };
    // ---- dust (only beyond the player's car, so it never hides your own car) ----
    for (const p of parts) {
      if (p.life <= 0) continue;
      proj(p.x, p.y, p.z, tmp); if (tmp.zc < 7) continue;
      const s = Math.max(1, p.size * tmp.sc);
      g.globalAlpha = Math.min(0.4, p.life * 0.6) * Math.min(1, (tmp.zc - 7) / 4); g.fillStyle = p.col;
      g.fillRect(Math.round(tmp.sx - s / 2), Math.round(tmp.sy - s / 2), Math.round(s), Math.round(s));
    }
    g.globalAlpha = 1;
  }

  // draw a sprite anchored at its bottom centre, cropped below `clip`
  blit(img, sx, sy, w, h, clip, fog) {
    if (w < 0.6 || fog >= 0.98) return;
    const x = sx - w / 2, y = sy - h;
    if (x > this.W || x + w < 0 || y >= clip) return;
    const visH = Math.min(h, clip - y), srcH = img.height * visH / h;
    if (srcH < 0.5) return;
    if (fog > 0.05) this.g.globalAlpha = 1 - fog * 0.85;
    this.g.drawImage(img, 0, 0, img.width, srcH, Math.round(x), Math.round(y), Math.round(w), Math.round(visH));
    this.g.globalAlpha = 1;
  }

  gate(pr, q, clip, fog) {
    const tr = this.tr, g = this.g, halfW = tr.W / 2, k = (halfW + 1.1) / halfW;
    if (fog > 0.97) return;
    g.globalAlpha = 1 - fog * 0.85;
    const xl = q.sx - q.w * k, xr = q.sx + q.w * k, poleW = Math.max(1, 0.45 * q.sc), top = q.sy - 6.6 * q.sc;
    if (top < clip) {
      g.fillStyle = '#e8e8e8';
      for (const x of [xl, xr]) g.fillRect(Math.round(x - poleW / 2), Math.round(top), Math.round(poleW), Math.round(Math.min(q.sy, clip) - top));
      g.drawImage(pr.img, Math.round(xl - poleW / 2), Math.round(top), Math.round(xr - xl + poleW), Math.max(1, Math.round(1.5 * q.sc)));
    }
    g.globalAlpha = 1;
  }

  // big car for the car-select screen
  drawBig(spec, cx, cy, w, turn = 0) {
    const cs = this.carSprite(spec), img = cs.frames['0:' + turn], h = w * img.height / img.width;
    this.g.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  }
}
