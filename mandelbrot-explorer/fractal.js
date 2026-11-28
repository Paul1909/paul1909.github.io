'use strict';
// Escape-time maths shared by the page (Surprise me) and the render workers.
// A value >= 0 is the smooth iteration count of an escaping point; -1 means "inside".

var BAIL = 65536; // |z|^2 bailout (|z| > 256) keeps the smooth colouring smooth

function smoothVal(i, mag) {
  var s = i + 1 - Math.log(Math.log(mag) * 0.5) / Math.LN2;
  return s > 0 ? s : 0;
}

// Plain double precision Mandelbrot, with cardioid/bulb test and Brent periodicity check.
function mbPlain(cr, ci, maxIter) {
  var xq = cr - 0.25, q = xq * xq + ci * ci;
  if (q * (q + xq) <= 0.25 * ci * ci) return -1;
  if ((cr + 1) * (cr + 1) + ci * ci <= 0.0625) return -1;
  var zr = 0, zi = 0, zr2 = 0, zi2 = 0, pr = 0, pi = 0, per = 0, lim = 8;
  for (var i = 0; i < maxIter; i++) {
    zi = 2 * zr * zi + ci; zr = zr2 - zi2 + cr;
    zr2 = zr * zr; zi2 = zi * zi;
    if (zr2 + zi2 > BAIL) return smoothVal(i, zr2 + zi2);
    if (zr === pr && zi === pi) return -1;
    if (++per === lim) { per = 0; lim += lim; pr = zr; pi = zi; }
  }
  return -1;
}

// Julia set for the parameter (jr, ji), starting from z = (zr, zi).
function juliaPlain(zr, zi, jr, ji, maxIter) {
  var zr2 = zr * zr, zi2 = zi * zi, pr = zr, pi = zi, per = 0, lim = 8;
  for (var i = 0; i < maxIter; i++) {
    zi = 2 * zr * zi + ji; zr = zr2 - zi2 + jr;
    zr2 = zr * zr; zi2 = zi * zi;
    if (zr2 + zi2 > BAIL) return smoothVal(i, zr2 + zi2);
    if (zr === pr && zi === pi) return -1;
    if (++per === lim) { per = 0; lim += lim; pr = zr; pi = zi; }
  }
  return -1;
}

// Deep zoom: perturbation against a high-precision reference orbit (orb = [Z0r, Z0i, Z1r, ...]),
// with rebasing, so one reference is enough and there are no glitches. (dcr, dci) is the offset
// of this pixel from the reference point, which can be as small as 1e-300.
function mbPert(dcr, dci, orb, len, maxIter, sa, ic) {
  var zr = 0, zi = 0, m = 0, i0 = 0, sr = 1e9, si = 1e9, per = 0, lim = 8, pm = 1, pe = 0;
  if (sa && sa.n > 0) {
    // Series approximation: jump straight to iteration n with delta = a*u + b*u^2 + c*u^3, u = dc / dcmax.
    var ur = dcr / sa.d, ui = dci / sa.d, u2r = ur * ur - ui * ui, u2i = 2 * ur * ui;
    var u3r = u2r * ur - u2i * ui, u3i = u2r * ui + u2i * ur;
    zr = sa.ar * ur - sa.ai * ui + sa.br * u2r - sa.bi * u2i + sa.cr * u3r - sa.ci * u3i;
    zi = sa.ar * ui + sa.ai * ur + sa.br * u2i + sa.bi * u2r + sa.cr * u3i + sa.ci * u3r;
    m = i0 = sa.n;
  }
  for (var i = i0; i < maxIter; i++) {
    var Zr = orb[2 * m], Zi = orb[2 * m + 1];
    var nzr = 2 * (Zr * zr - Zi * zi) + (zr * zr - zi * zi) + dcr;
    var nzi = 2 * (Zr * zi + Zi * zr) + 2 * zr * zi + dci;
    zr = nzr; zi = nzi; m++;
    var Fr = orb[2 * m] + zr, Fi = orb[2 * m + 1] + zi;
    var mag = Fr * Fr + Fi * Fi;
    if (mag > BAIL) return smoothVal(i, mag);
    pm *= 4 * mag;
    if (pm > 1e100) { pm *= 1e-100; pe++; } else if (pm < 1e-100) { pm *= 1e100; pe--; }
    if (ic && mag > 1e-12 && Math.abs(Fr - sr) + Math.abs(Fi - si) < 1e-15 && attractingLog(pm, pe, per + 1)) return -1; // attracting cycle: inside
    if (++per === lim) { per = 0; lim += lim; sr = Fr; si = Fi; pm = 1; pe = 0; }
    if (mag < zr * zr + zi * zi || m === len - 1) { zr = Fr; zi = Fi; m = 0; }
  }
  return -1;
}

// Series approximation coefficients, scaled by dcmax (the largest pixel offset) so nothing over- or underflows.
// Stops while the cubic term is still far below one pixel's worth of change (h = pixel size).
function saCoeffs(orb, len, dcmax, h, maxIter) {
  var tol = 1e-3 * h / dcmax, ar = 0, ai = 0, br = 0, bi = 0, cr = 0, ci = 0;
  var best = { n: 0, d: dcmax, ar: 0, ai: 0, br: 0, bi: 0, cr: 0, ci: 0 };
  var end = Math.min(len - 2, maxIter - 1);
  for (var n = 0; n < end; n++) {
    var Zr = 2 * orb[2 * n], Zi = 2 * orb[2 * n + 1];
    var nar = Zr * ar - Zi * ai + dcmax, nai = Zr * ai + Zi * ar;
    var nbr = Zr * br - Zi * bi + ar * ar - ai * ai, nbi = Zr * bi + Zi * br + 2 * ar * ai;
    var ncr = Zr * cr - Zi * ci + 2 * (ar * br - ai * bi), nci = Zr * ci + Zi * cr + 2 * (ar * bi + ai * br);
    if (!(Math.hypot(ncr, nci) < tol * Math.hypot(nar, nai))) break;
    ar = nar; ai = nai; br = nbr; bi = nbi; cr = ncr; ci = nci;
    best = { n: n + 1, d: dcmax, ar: ar, ai: ai, br: br, bi: bi, cr: cr, ci: ci };
  }
  return best;
}

// Reference orbit of the point (X, Y) / 2^P, computed with BigInt fixed point.
function refOrbit(X, Y, P, maxIter) {
  var B = BigInt(P), B1 = BigInt(P - 1), k = Math.pow(2, -P);
  var out = new Float64Array(2 * (maxIter + 1));
  var zr = 0n, zi = 0n, len = maxIter + 1;
  for (var n = 1; n <= maxIter; n++) {
    var t = zr * zi;
    zr = ((zr * zr - zi * zi) >> B) + X;
    zi = (t >> B1) + Y;
    var a = Number(zr) * k, b = Number(zi) * k;
    out[2 * n] = a; out[2 * n + 1] = b;
    if (a * a + b * b > 1e6) { len = n + 1; break; }
  }
  return { orbit: out, len: len };
}

// ---------------------------------------------------------------- Multibrot: z -> z^d + c
// Whole d: repeated multiplication. Other d: principal branch, z^d = |z|^d * e^(i d arg z), which is what makes the seams.
function isWhole(d) { return Math.abs(d - Math.round(d)) < 1e-9; }
function smoothD(i, mag, ld) {
  var s = i + 1 - Math.log(Math.log(mag) * 0.5) / ld;
  return s > 0 ? s : 0;
}
function iterD(zr, zi, cr, ci, maxIter, d) {
  var whole = isWhole(d), di = Math.round(d), h = d / 2, ld = Math.log(d);
  var pr = zr, pi = zi, per = 0, lim = 8, nr, ni;
  for (var i = 0; i < maxIter; i++) {
    if (whole) {
      nr = zr; ni = zi;
      for (var k = 1; k < di; k++) { var t = nr * zr - ni * zi; ni = nr * zi + ni * zr; nr = t; }
    } else {
      var r2 = zr * zr + zi * zi;
      if (r2 === 0) { nr = 0; ni = 0; }
      else { var m = Math.pow(r2, h), a = d * Math.atan2(zi, zr); nr = m * Math.cos(a); ni = m * Math.sin(a); }
    }
    zr = nr + cr; zi = ni + ci;
    var mag = zr * zr + zi * zi;
    if (mag > BAIL) return smoothD(i, mag, ld);
    if (zr === pr && zi === pi) return -1;
    if (++per === lim) { per = 0; lim += lim; pr = zr; pi = zi; }
  }
  return -1;
}
function mbD(cr, ci, maxIter, d) { return d === 2 ? mbPlain(cr, ci, maxIter) : iterD(0, 0, cr, ci, maxIter, d); }
function juliaD(zr, zi, jr, ji, maxIter, d) { return d === 2 ? juliaPlain(zr, zi, jr, ji, maxIter) : iterD(zr, zi, jr, ji, maxIter, d); }

// Deep zoom for whole d >= 3: delta' = (Z + delta)^d - Z^d + dc, expanded with binomials so tiny deltas keep their digits.
var BINOM = [];
for (var bn = 0; bn <= 12; bn++) { BINOM[bn] = [1]; for (var bk = 1; bk <= bn; bk++) BINOM[bn][bk] = BINOM[bn][bk - 1] * (bn - bk + 1) / bk; }
var ZPr = new Float64Array(13), ZPi = new Float64Array(13);
function mbPertD(dcr, dci, orb, len, maxIter, d, ic) {
  var zr = 0, zi = 0, m = 0, Cb = BINOM[d], ld = Math.log(d), sr = 1e9, si = 1e9, per = 0, lim = 8, pm = 1, pe = 0, d2 = d * d;
  for (var i = 0; i < maxIter; i++) {
    var Zr = orb[2 * m], Zi = orb[2 * m + 1];
    ZPr[0] = 1; ZPi[0] = 0;
    for (var j = 1; j < d; j++) { ZPr[j] = ZPr[j - 1] * Zr - ZPi[j - 1] * Zi; ZPi[j] = ZPr[j - 1] * Zi + ZPi[j - 1] * Zr; }
    var ar = 1, ai = 0; // Horner over the coefficients C(d,k) Z^(d-k), k = d .. 1
    for (var k = d - 1; k >= 1; k--) {
      var t = ar * zr - ai * zi; ai = ar * zi + ai * zr; ar = t;
      ar += Cb[k] * ZPr[d - k]; ai += Cb[k] * ZPi[d - k];
    }
    var nzr = ar * zr - ai * zi + dcr, nzi = ar * zi + ai * zr + dci;
    zr = nzr; zi = nzi; m++;
    var Fr = orb[2 * m] + zr, Fi = orb[2 * m + 1] + zi;
    var mag = Fr * Fr + Fi * Fi;
    if (mag > BAIL) return smoothD(i, mag, ld);
    var g = d2; for (var q = 1; q < d; q++) g *= mag;
    pm *= g;
    if (pm > 1e100) { pm *= 1e-100; pe++; } else if (pm < 1e-100) { pm *= 1e100; pe--; }
    if (ic && mag > 1e-12 && Math.abs(Fr - sr) + Math.abs(Fi - si) < 1e-15 && attractingLog(pm, pe, per + 1)) return -1; // attracting cycle: inside
    if (++per === lim) { per = 0; lim += lim; sr = Fr; si = Fi; pm = 1; pe = 0; }
    if (mag < zr * zr + zi * zi || m === len - 1) { zr = Fr; zi = Fi; m = 0; }
  }
  return -1;
}
// Reference orbit for z^d + c in BigInt fixed point (whole d).
function refOrbitD(X, Y, P, maxIter, d) {
  if (d === 2) return refOrbit(X, Y, P, maxIter);
  var B = BigInt(P), k = Math.pow(2, -P), out = new Float64Array(2 * (maxIter + 1));
  var zr = 0n, zi = 0n, len = maxIter + 1;
  for (var n = 1; n <= maxIter; n++) {
    var wr = zr, wi = zi;
    for (var e = 1; e < d; e++) { var t = (wr * zr - wi * zi) >> B; wi = (wr * zi + wi * zr) >> B; wr = t; }
    zr = wr + X; zi = wi + Y;
    var a = Number(zr) * k, b = Number(zi) * k;
    out[2 * n] = a; out[2 * n + 1] = b;
    if (a * a + b * b > 1e6) { len = n + 1; break; }
  }
  return { orbit: out, len: len };
}

// Interior test for the deep-zoom loops: when the orbit comes back to (almost) the same point after p steps,
// the pixel is inside only if that cycle is attracting, i.e. the product of the derivatives d*F^(d-1) along
// those p steps is below 1 in size. The product is tracked on the precise perturbed orbit (pm * 1e100^pe,
// squared magnitudes), because orbits creeping past a neutral point also look settled for a while.
// It only runs when the reference point itself is inside (ic), the slow all-black case it exists for, and a
// return must be within 1e-15, the floor real cycles settle to; orbits that only shadow a nearby baby set
// from outside come close but not that close. Matches right next to 0 are ignored: two points that both hug the critical point look like a return
// even when the orbit is about to escape. A real cycle gets confirmed at one of its other points.
var LOG_ATTRACT = 2 * Math.log(0.95), LN1E100 = Math.log(1e100);
function attractingLog(pm, pe, p) { return Math.log(pm) + pe * LN1E100 < LOG_ATTRACT * Math.max(1, p / 64); }

// True when the reference orbit ran to the end and settled into a cycle, i.e. the centre is inside the set.
function refInside(o, maxIter) {
  if (o.len <= maxIter) return false;
  var N = o.len - 1;
  for (var p = 1; p <= 64 && N - p >= 0; p++)
    if (Math.abs(o.orbit[2 * N] - o.orbit[2 * (N - p)]) + Math.abs(o.orbit[2 * N + 1] - o.orbit[2 * (N - p) + 1]) < 1e-12) return true;
  return false;
}

// One block of rows of a render pass. Grid cell (gx, gy) sits at device pixel ((gx+.5)*step, (gy+.5)*step).
function renderRows(j, orb, len) {
  var gw = j.gw, rows = j.y1 - j.y0, out = new Float32Array(gw * rows);
  var hw = j.W / 2, hh = j.H / 2, sc = j.sc, it = j.it, k = 0;
  var d = j.d || 2;
  for (var gy = j.y0; gy < j.y1; gy++) {
    var oy = -((gy + 0.5) * j.step - hh) * sc;
    for (var gx = 0; gx < gw; gx++) {
      var ox = ((gx + 0.5) * j.step - hw) * sc;
      out[k++] = j.kind === 'p' ? (d === 2 ? mbPert(ox, oy, orb, len, it, j.sa, j.ic) : mbPertD(ox, oy, orb, len, it, d, j.ic))
               : j.kind === 'j' ? juliaD(j.cx + ox, j.cy + oy, j.jr, j.ji, it, d)
               : mbD(j.cx + ox, j.cy + oy, it, d);
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { refInside: refInside, mbD: mbD, juliaD: juliaD, mbPertD: mbPertD, refOrbitD: refOrbitD, iterD: iterD, saCoeffs: saCoeffs, mbPlain: mbPlain, juliaPlain: juliaPlain, mbPert: mbPert, refOrbit: refOrbit, renderRows: renderRows };
