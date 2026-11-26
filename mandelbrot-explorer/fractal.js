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
function mbPert(dcr, dci, orb, len, maxIter, sa) {
  var zr = 0, zi = 0, m = 0, i0 = 0;
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

// One block of rows of a render pass. Grid cell (gx, gy) sits at device pixel ((gx+.5)*step, (gy+.5)*step).
function renderRows(j, orb, len) {
  var gw = j.gw, rows = j.y1 - j.y0, out = new Float32Array(gw * rows);
  var hw = j.W / 2, hh = j.H / 2, sc = j.sc, it = j.it, k = 0;
  for (var gy = j.y0; gy < j.y1; gy++) {
    var oy = -((gy + 0.5) * j.step - hh) * sc;
    for (var gx = 0; gx < gw; gx++) {
      var ox = ((gx + 0.5) * j.step - hw) * sc;
      out[k++] = j.kind === 'p' ? mbPert(ox, oy, orb, len, it, j.sa)
               : j.kind === 'j' ? juliaPlain(j.cx + ox, j.cy + oy, j.jr, j.ji, it)
               : mbPlain(j.cx + ox, j.cy + oy, it);
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { saCoeffs: saCoeffs, mbPlain: mbPlain, juliaPlain: juliaPlain, mbPert: mbPert, refOrbit: refOrbit, renderRows: renderRows };
