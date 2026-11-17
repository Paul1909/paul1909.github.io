// Retro rendering helpers: pixel textures, vertex-snapping materials, tiny geometry merger.
import * as THREE from '../vendor/three.module.min.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Shared uniform: screen-space snap grid for the PS1/Saturn-style vertex wobble.
export const snap = { value: new THREE.Vector2(160, 120) };

export function retro(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uSnap = snap;
    sh.vertexShader = 'uniform vec2 uSnap;\n' + sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
      if (gl_Position.w > 0.0) { vec2 p = gl_Position.xy / gl_Position.w; p = floor(p * uSnap + 0.5) / uSnap; gl_Position.xy = p * gl_Position.w; }`);
  };
  mat.customProgramCacheKey = () => 'retro';
  return mat;
}

export function lambert(opts) { return retro(new THREE.MeshLambertMaterial({ flatShading: true, ...opts })); }

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
function noise(g, w, h, base, amp, r, size = 1) {
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const n = (r() - 0.5) * amp;
    g.fillStyle = hex(base[0] + n, base[1] + n, base[2] + n * 0.8); g.fillRect(x, y, size, size);
  }
}

export function makeTextures() {
  const r = rng(1995);
  const T = {};
  // road textures: u runs across the road (0..1), v along it
  T.gravel = canvasTex(32, 64, (g, w, h) => {
    noise(g, w, h, [214, 200, 170], 34, r);
    for (let y = 0; y < h; y++) for (const cx of [9, 23]) { // darker wheel ruts
      g.fillStyle = 'rgba(120,100,70,0.22)'; g.fillRect(cx - 2 + (r() * 2 | 0), y, 4, 1);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? '#8f826c' : '#f2ead8'; g.fillRect(r() * w | 0, r() * h | 0, 1, 1); }
  });
  T.tarmac = canvasTex(32, 64, (g, w, h) => {
    noise(g, w, h, [88, 88, 92], 26, r);
    g.fillStyle = '#e8e8e0'; g.fillRect(1, 0, 1, h); g.fillRect(w - 2, 0, 1, h);
    g.fillStyle = '#e8e8e0'; g.fillRect(w / 2 - 0.5 | 0, 0, 1, h / 2);
  });
  T.cobble = canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = '#4a4440'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4 % 2) * 2; x < w + 4; x += 4) {
      const v = 120 + r() * 50; g.fillStyle = hex(v, v * 0.93, v * 0.85); g.fillRect(x, y, 3, 3);
    }
  });
  T.grass = canvasTex(32, 32, (g, w, h) => noise(g, w, h, [190, 190, 190], 46, r));
  T.rock = canvasTex(32, 32, (g, w, h) => noise(g, w, h, [150, 146, 140], 50, r, 2));
  T.stone = canvasTex(32, 16, (g, w, h) => {
    g.fillStyle = '#6d655a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = -(y % 8); x < w; x += 8) { const v = 150 + r() * 50; g.fillStyle = hex(v, v * 0.92, v * 0.8); g.fillRect(x + 1, y + 1, 6, 3); }
  });
  T.paving = canvasTex(16, 16, (g, w, h) => { noise(g, w, h, [196, 186, 170], 20, r); g.fillStyle = '#9a8f80'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
  // one window bay x one floor, light wall (tinted per building by vertex colour)
  T.facade = canvasTex(16, 16, (g, w, h) => {
    noise(g, w, h, [236, 230, 218], 14, r);
    g.fillStyle = '#2e5a3a'; g.fillRect(3, 3, 3, 9); g.fillRect(10, 3, 3, 9);  // shutters
    g.fillStyle = '#1d1d26'; g.fillRect(6, 3, 4, 9);
    g.fillStyle = '#b8ab98'; g.fillRect(3, 12, 10, 1);
  });
  T.checker = canvasTex(16, 4, (g, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x, y, 1, 1); } });
  return T;
}

export function bannerTex(text, bg = '#c81d25', fg = '#ffffff') {
  return canvasTex(128, 16, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 1, w, 1); g.fillRect(0, h - 2, w, 1);
    g.font = 'bold italic 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  }, false);
}

// ---------- geometry ----------
// Box with per-vertex colour, returned non-indexed.
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z); return paint(g, color);
}
export function paint(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
// Hexahedron from 8 corners (bottom 4 then top 4, each ccw seen from above: -x-z, +x-z, +x+z, -x+z).
// faceColors: {top, bottom, sides:[front(+z), back(-z), left(-x), right(+x)]}
export function hexa(c, colors) {
  const [b0, b1, b2, b3, t0, t1, t2, t3] = c;
  const quads = [
    [t0, t3, t2, t1, colors.top], [b0, b1, b2, b3, colors.bottom ?? colors.top],
    [b3, b2, t2, t3, colors.front], [b1, b0, t0, t1, colors.back],
    [b0, b3, t3, t0, colors.left], [b2, b1, t1, t2, colors.right],
  ];
  const pos = [], col = [];
  for (const [a, b, cc, d, color] of quads) {
    const C = new THREE.Color(color);
    for (const p of [a, b, cc, a, cc, d]) { pos.push(...p); col.push(C.r, C.g, C.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}
export function merge(list) {
  list = list.map(g => g.index ? g.toNonIndexed() : g);
  const names = ['position', 'normal', 'color', 'uv'];
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const size = nm === 'uv' ? 2 : 3;
    let total = 0; for (const g of list) total += g.attributes.position.count;
    const arr = new Float32Array(total * size); let off = 0;
    for (const g of list) {
      const a = g.attributes[nm];
      if (a) arr.set(a.array, off); else if (nm === 'color') arr.fill(1, off, off + g.attributes.position.count * 3);
      off += g.attributes.position.count * size;
    }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) if (!g.attributes.normal) { out.computeVertexNormals(); break; }
  return out;
}
