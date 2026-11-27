// Canvas renderer: chunky pixels, painter's order, night lights, weather, dithered shroud, radar.
'use strict';

const RD = {
  cv: null, ctx: null, dpr: 1, vw: 0, vh: 0, cam: { x: 0, y: 0, z: 2 },
  terrain: null, shroud: null, shImg: null, shRev: null, spr: null, houses: null, units: null, trees: null, puffs: null,
  flakes: [], anim: 0, flash: 0, radarBase: null,
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function renderInit(st) {
  RD.spr = makeStructures(st.theme); RD.houses = makeHouses(st.theme); RD.units = makeUnits(); RD.trees = makeTrees(st.theme); RD.puffs = makePuffs();
  RD.terrain = bakeTerrain(st);
  const [c, x] = mk(st.W * TS, st.H * TS); RD.shroud = c; RD.shCtx = x; RD.shImg = x.createImageData(st.W * TS, st.H * TS); RD.shRev = null;
  updateShroud(st, true);
  // radar base: one pixel per tile
  const [rc, rx] = mk(st.W, st.H); const img = rx.createImageData(st.W, st.H);
  const P = PAL[st.theme], hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const col = { [G]: hx(P.g[1]), [D]: hx(P.d[0]), [R]: hx(P.r[3]), [W]: hx(P.w[1]), [F]: hx(P.tree[1]), [ROAD]: hx(P.road[0]), [BRIDGE]: hx('#6e5137') };
  for (let k = 0; k < st.W * st.H; k++) { const c3 = col[st.t[k]] || col[G]; img.data.set([c3[0], c3[1], c3[2], 255], k * 4); }
  rx.putImageData(img, 0, 0); RD.radarBase = rc;
}

function updateShroud(st, full) {
  const Wd = st.W * TS, d = RD.shImg.data, prev = RD.shRev;
  let changed = [];
  if (full || !prev) { for (let k = 0; k < st.W * st.H; k++) changed.push(k); }
  else for (let k = 0; k < st.W * st.H; k++) if (prev[k] !== st.rev[k]) changed.push(k);
  if (!changed.length) return;
  RD.shRev = st.rev.slice();
  const todo = new Set();
  for (const k of changed) { const x = k % st.W, y = (k / st.W) | 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inb(st, x + i, y + j)) todo.add(idx(st, x + i, y + j)); }
  const rv = (x, y) => !inb(st, x, y) || st.rev[idx(st, x, y)];
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (const k of todo) {
    const tx = k % st.W, ty = (k / st.W) | 0, X = tx * TS, Y = ty * TS;
    minx = Math.min(minx, X); miny = Math.min(miny, Y); maxx = Math.max(maxx, X + TS); maxy = Math.max(maxy, Y + TS);
    const me = st.rev[k], nb = [];
    if (me) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && !rv(tx + i, ty + j)) nb.push([i, j]);
    for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
      let a = 255;
      if (me) {
        let dm = 99;
        for (const [i, j] of nb) {
          const dx = i < 0 ? px + 1 : i > 0 ? TS - px : 0, dy = j < 0 ? py + 1 : j > 0 ? TS - py : 0;
          const dd = (i && j) ? Math.hypot(dx, dy) : (i ? dx : dy); if (dd < dm) dm = dd;
        }
        const f = 1 - dm / 11; a = f > 0 && f * 16 > BAYER[(py & 3) * 4 + (px & 3)] + .5 ? 255 : 0;
      }
      const o = ((Y + py) * Wd + X + px) * 4; d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = a;
    }
  }
  RD.shCtx.putImageData(RD.shImg, 0, 0, minx, miny, maxx - minx, maxy - miny);
}

function resize() {
  const r = RD.cv.getBoundingClientRect(); RD.dpr = Math.min(window.devicePixelRatio || 1, 3);
  RD.vw = r.width; RD.vh = r.height; RD.cv.width = Math.round(r.width * RD.dpr); RD.cv.height = Math.round(r.height * RD.dpr);
  RD.ctx.imageSmoothingEnabled = false;
}
function clampCam(st) {
  const c = RD.cam, vw = RD.vw / c.z, vh = RD.vh / c.z, Wd = st.W * TS, Hd = st.H * TS, m = TS * 2;
  c.x = vw > Wd + m * 2 ? (Wd - vw) / 2 : Math.max(-m, Math.min(Wd - vw + m, c.x));
  c.y = vh > Hd + m * 2 ? (Hd - vh) / 2 : Math.max(-m - 40, Math.min(Hd - vh + m, c.y));
}
function centerOn(st, wx, wy) { RD.cam.x = wx - RD.vw / RD.cam.z / 2; RD.cam.y = wy - RD.vh / RD.cam.z / 2; clampCam(st); }
function toWorld(sx, sy) { return [RD.cam.x + sx / RD.cam.z, RD.cam.y + sy / RD.cam.z]; }

// ---------- live pixel helpers on the main canvas (world coords) ----------
function wline(ctx, x0, y0, x1, y1, col, sag = 0) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) { const t = i / n; ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * sag), 1, 1); }
}

function draw(st, sel, ui) {
  const ctx = RD.ctx, c = RD.cam, sc = c.z * RD.dpr, now = performance.now() / 1000; RD.anim = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, RD.cv.width, RD.cv.height);
  const ox = Math.round(c.x * sc), oy = Math.round(c.y * sc);
  ctx.setTransform(sc, 0, 0, sc, -ox, -oy); ctx.imageSmoothingEnabled = false;
  const vx = ox / sc, vy = oy / sc, vw = RD.cv.width / sc, vh = RD.cv.height / sc;
  const x0 = Math.max(0, Math.floor(vx / TS) - 1), x1 = Math.min(st.W - 1, Math.ceil((vx + vw) / TS) + 1);
  const y0 = Math.max(0, Math.floor(vy / TS) - 1), y1 = Math.min(st.H - 1, Math.ceil((vy + vh) / TS) + 4);
  // terrain
  const sx = Math.max(0, Math.floor(vx)), sy = Math.max(0, Math.floor(vy)), sw = Math.min(st.W * TS - sx, Math.ceil(vw) + 2), sh = Math.min(st.H * TS - sy, Math.ceil(vh) + 2);
  if (sw > 0 && sh > 0) ctx.drawImage(RD.terrain, sx, sy, sw, sh, sx, sy, sw, sh);
  // water glints
  const P = PAL[st.theme], fr = Math.floor(now * 3);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const v = st.t[ty * st.W + tx]; if (v !== W) continue; for (let i = 0; i < 2; i++) { const hsh = hash2(tx * 7 + i, ty * 3 + fr, 5); ctx.fillStyle = P.w[2 + (hsh > .5 ? 1 : 0)]; ctx.fillRect(tx * TS + (hsh * 22 | 0), ty * TS + (hash2(tx, ty + fr, i) * 22 | 0), 2, 1); } }

  // painter's list
  const L = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * st.W + tx;
    if (st.t[k] === F) L.push([(ty + 1) * TS - 2, 0, tx, ty]);
    if (st.lines[k] !== undefined) L.push([(ty + 1) * TS - 1, 1, tx, ty]);
  }
  for (const s of st.structs) { const d = S[s.type]; if (s.x + d.fp[0] < x0 - 2 || s.x > x1 + 1 || s.y > y1 || s.y + d.fp[1] < y0 - 2) continue; L.push([(s.y + d.fp[1]) * TS, 2, s]); }
  for (const t of st.towns) t.tiles.forEach(([x, y], i) => { if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1) L.push([(y + 1) * TS - 1, 3, t, i]); });
  for (const u of st.units) { if (u.x < x0 - 1 || u.x > x1 + 1 || u.y < y0 - 1 || u.y > y1) continue; if (u.type === 'thief' && !st.rev[idx(st, Math.round(u.x), Math.round(u.y))]) continue; L.push([(u.y + 1) * TS - 4, 4, u]); }
  L.sort((a, b) => a[0] - b[0]);
  const dark = darkness(st);
  for (const e of L) {
    if (e[1] === 0) { const v = (hash2(e[2], e[3], 1) * 4) | 0, j = (hash2(e[2], e[3], 2) * 6 - 3) | 0; ctx.fillStyle = P.shadow; ctx.fillRect(e[2] * TS + 5 + j, e[3] * TS + 20, 14, 3); ctx.drawImage(RD.trees[v], e[2] * TS + 2 + j, e[3] * TS - 7); }
    else if (e[1] === 1) { const k = e[3] * st.W + e[2]; const sp = st.brk[k] ? RD.spr.pylonX : RD.spr.pylon; ctx.drawImage(sp.c, e[2] * TS, e[3] * TS + sp.oy); if (st.lines[k] < 100 && !st.brk[k] && hash2(k, Math.floor(now * 6), 3) < .25) { ctx.fillStyle = '#ffe680'; ctx.fillRect(e[2] * TS + 4 + (hash2(k, Math.floor(now * 9), 4) * 16 | 0), e[3] * TS - 11, 1, 1); } }
    else if (e[1] === 2) drawStruct(ctx, st, e[2], now, sel);
    else if (e[1] === 3) { const t = e[2], [x, y] = t.tiles[e[3]], h = RD.houses[t.kinds[e[3]]]; ctx.drawImage(h.c, x * TS, y * TS + h.oy); }
    else drawUnit(ctx, st, e[2], now, sel);
  }
  drawWires(ctx, st, x0, x1, y0, y1, now);
  // effects
  drawFx(ctx, st, now);
  // night
  if (dark > 0) {
    ctx.fillStyle = `rgba(6,12,34,${dark})`; ctx.fillRect(vx, vy, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    for (const t of st.towns) if (t.lit && t.joined) {
      if (t.x < x0 - 4 || t.x > x1 + 4 || t.y < y0 - 4 || t.y > y1 + 2) continue;
      const g = ctx.createRadialGradient(t.x * TS + 12, t.y * TS + 12, 4, t.x * TS + 12, t.y * TS + 12, 70);
      g.addColorStop(0, `rgba(255,190,80,${.32 * dark})`); g.addColorStop(1, 'rgba(255,190,80,0)'); ctx.fillStyle = g; ctx.fillRect(t.x * TS - 60, t.y * TS - 60, 144, 144);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const t of st.towns) if (t.lit && t.joined) t.tiles.forEach(([x, y], i) => { const h = RD.houses[t.kinds[i]]; ctx.fillStyle = LIT; for (const [lx, ly, w, hh] of h.lights) if (hash2(x * 5 + lx, y + ly, 9) > .25) ctx.fillRect(x * TS + lx, y * TS + ly, w, hh); });
    for (const s of st.structs) {
      const sp = RD.spr[s.type], I = islandOf(st, s); const powered = I && I.gen && !(I.short > .01);
      if (powered) { ctx.fillStyle = '#ffe9a0'; for (const [lx, ly, w, hh] of sp.lights) ctx.fillRect(s.x * TS + lx, s.y * TS + ly, w, hh); }
    }
  }
  // beacons blink day and night
  if (Math.floor(now * 1.2) % 2 === 0) { ctx.fillStyle = '#ff3a28'; for (const s of st.structs) for (const [bx, by] of RD.spr[s.type].beacon) ctx.fillRect(s.x * TS + bx, s.y * TS + by, 1, 1); }
  // weather
  drawWeather(ctx, st, vx, vy, vw, vh, now);
  // shroud
  if (sw > 0 && sh > 0) ctx.drawImage(RD.shroud, sx, sy, sw, sh, sx, sy, sw, sh);
  // overlays
  drawOverlays(ctx, st, sel, ui, now);
}

function islandOf(st, s) { return st.islands.find(I => I.id === s.isl); }

function drawStruct(ctx, st, s, now, sel) {
  const sp = RD.spr[s.type], d = S[s.type], X = s.x * TS, Y = s.y * TS;
  ctx.drawImage(sp.c, X + sp.ox, Y + sp.oy);
  const run = s.out > .5;
  if (s.type === 'wind') {
    const sp2 = s.on ? (s.out / d.cap) * 9 + .4 * (s.avail > 0 ? 1 : 0) : 0; s.ang = (s.ang || hash2(s.x, s.y) * 6) + sp2 * (now - (s.lt || now)) * (window.G_speed || 1); s.lt = now;
    const hx = X + sp.hub[0], hy = Y + sp.hub[1];
    for (let k = 0; k < 3; k++) { const a = s.ang + k * 2.094; wline(ctx, hx, hy, hx + Math.cos(a) * 11, hy + Math.sin(a) * 11 * .9, '#f2f4f6'); wline(ctx, hx + 1, hy + 1, hx + Math.cos(a) * 10 + 1, hy + Math.sin(a) * 10 * .9 + 1, 'rgba(90,100,110,.6)'); }
    ctx.fillStyle = '#8a9096'; ctx.fillRect(hx - 1, hy - 1, 2, 2);
  } else if (s.type === 'dome') {
    const on = !st.lowPower, a = on ? now * 1.6 : 0, w = Math.round(Math.abs(Math.cos(a)) * 6) + 1;
    ctx.fillStyle = '#d9dde0'; ctx.fillRect(X + sp.dish[0] - w, Y + sp.dish[1] - 1, w * 2, 3); ctx.fillStyle = '#8d9397'; ctx.fillRect(X + sp.dish[0] - w, Y + sp.dish[1] + 1, w * 2, 1);
  } else if (s.type === 'bess') {
    const f = s.soc / d.energy; sp.leds.forEach(([lx, ly], i) => { const lit = f > i / 4; const col = s.pow > .5 ? '#ffb020' : s.pow < -.5 ? '#40c0ff' : '#40ff60'; ctx.fillStyle = lit && (Math.floor(now * 2 + i) % 3) ? col : '#1d3b22'; ctx.fillRect(X + lx, Y + ly, 2, 1); });
  } else if (s.type === 'solar') {
    const sn = st.weather.snow; if (sn > .02) { ctx.fillStyle = '#eef3f7'; for (const [px, py, w, h] of sp.panels) ctx.fillRect(X + px, Y + py, w, Math.ceil(h * sn)); }
  } else if (s.type === 'hydro' && run) {
    for (const [fx, fy] of sp.foam) for (let i = 0; i < 6; i++) { const hsh = hash2(fx + i, Math.floor(now * 8) + i, s.id); ctx.fillStyle = hsh > .5 ? '#ffffff' : '#cfe3ee'; ctx.fillRect(X + fx + (hsh * 8 | 0), Y + fy + (hash2(i, Math.floor(now * 8), 2) * 7 | 0), 2, 1); }
  } else if (s.type === 'tesla' && s.on) {
    const I = islandOf(st, s); if (I && I.gen && !(I.short > .01) && Math.random() < .25) { const tx = X + sp.tip[0], ty = Y + sp.tip[1]; let px = tx, py = ty; ctx.fillStyle = '#bfe8ff'; for (let i = 0; i < 4; i++) { px += (Math.random() - .5) * 6; py += (Math.random() - .3) * 4; ctx.fillRect(Math.round(px), Math.round(py), 1, 1); } }
  }
  // smoke from running thermal plants
  if (sp.smoke.length && run && Math.random() < (s.out / (d.cap || 1)) * .5 + .05) for (const [sx, sy, big] of sp.smoke) addFx(st, { k: 'puff', x: X + sx, y: Y + sy, r: big === 2 ? 3 : big ? 1 : 0, g: big === 2 ? 4 : 2, t: big === 2 ? 3.5 : 2.4, dark: s.type === 'coal' });
  if (s.st === 'trip') {
    if (Math.random() < .3) addFx(st, { k: 'puff', x: X + d.fp[0] * 12 + (Math.random() - .5) * 20, y: Y + 6, r: 1, g: 3, t: 2, dark: 1, black: 1 });
    if (Math.floor(now * 3) % 2) { ctx.fillStyle = '#ff3020'; ctx.fillRect(X + d.fp[0] * 12 - 3, Y - 6, 6, 6); ctx.fillStyle = '#fff'; ctx.fillRect(X + d.fp[0] * 12 - 1, Y - 5, 2, 3); ctx.fillRect(X + d.fp[0] * 12 - 1, Y - 1, 2, 1); }
  }
  if (!s.on && s.type !== 'yard') { ctx.fillStyle = 'rgba(0,0,10,.35)'; ctx.fillRect(X, Y + sp.oy, d.fp[0] * TS, sp.c.height); if (Math.floor(now * 1.5) % 2) drawPowerIcon(ctx, X + d.fp[0] * 12, Y + d.fp[1] * 12 - 4); }
  if (s.repairing && Math.floor(now * 2) % 2) drawWrench(ctx, X + d.fp[0] * 12, Y + 2);
}
function drawPowerIcon(ctx, x, y) { ctx.fillStyle = '#000'; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.fillStyle = '#ffd020'; ctx.fillRect(x - 3, y - 2, 1, 5); ctx.fillRect(x + 2, y - 2, 1, 5); ctx.fillRect(x - 2, y + 2, 4, 1); ctx.fillRect(x, y - 4, 1, 4); }
function drawWrench(ctx, x, y) { ctx.fillStyle = '#000'; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.fillStyle = '#e8e8e8'; for (let i = -3; i <= 3; i++) ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x + 2, y - 4, 2, 2); ctx.fillRect(x - 4, y + 2, 2, 2); }

function drawUnit(ctx, st, u, now, sel) {
  const X = u.x * TS + 12, Y = u.y * TS + 12;
  if (u.type === 'thief') {
    const fr = Math.floor(now * 6) % 2, img = (u.dir === 2 ? RD.units.thiefW : RD.units.thief)[u.path.length || u.state === 'steal' ? fr : 0];
    ctx.drawImage(img, Math.round(X - 4), Math.round(Y - 9));
    if (u.state === 'steal' && Math.random() < .5) { ctx.fillStyle = '#fff6a0'; ctx.fillRect(Math.round(X + (Math.random() - .5) * 8), Math.round(Y - 14 + Math.random() * 4), 1, 1); }
    if (u.zapped) { ctx.fillStyle = '#9fe0ff'; if (Math.floor(now * 8) % 2) ctx.fillRect(Math.round(X - 1), Math.round(Y - 12), 2, 1); }
    return;
  }
  const img = RD.units[u.type][u.dir || 0]; ctx.drawImage(img, Math.round(X - img.width / 2), Math.round(Y - img.height / 2));
  if (u.type === 'jeep' && Math.floor(now * 5) % 2) { ctx.fillStyle = Math.floor(now * 10) % 2 ? '#ff2a2a' : '#2a6aff'; ctx.fillRect(Math.round(X), Math.round(Y - img.height / 2), 1, 1); }
  if (u.working > 0) { u.working -= .016; if (Math.random() < .5) { ctx.fillStyle = '#fff2a0'; ctx.fillRect(Math.round(X + (Math.random() - .5) * 16), Math.round(Y - 4 + (Math.random() - .5) * 8), 1, 1); } }
}

function drawWires(ctx, st, x0, x1, y0, y1, now) {
  const node = (x, y) => { if (!inb(st, x, y)) return 0; const k = idx(st, x, y); if (st.lines[k] !== undefined) return st.brk[k] ? 0 : 1; if (st.occS[k] || st.occT[k]) return 2; return 0; };
  const wire = '#26282a';
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * st.W + tx, me = node(tx, ty); if (!me) continue;
    const X = tx * TS, Y = ty * TS;
    // right neighbour
    const r = node(tx + 1, ty);
    if (r && (me === 1 || r === 1)) {
      if (me === 1 && r === 1) { wline(ctx, X + 20, Y - 11, X + 27, Y - 11, wire, 1); wline(ctx, X + 17, Y - 7, X + 30, Y - 7, wire, 1); }
      else if (me === 1) { wline(ctx, X + 20, Y - 11, X + 26, Y + 2, wire); }
      else { wline(ctx, X + 22, Y + 2, X + 27, Y - 11, wire); }
    }
    const b = node(tx, ty + 1);
    if (b && (me === 1 || b === 1)) {
      if (me === 1 && b === 1) { wline(ctx, X + 3, Y - 11, X + 3, Y + 13, wire); wline(ctx, X + 20, Y - 11, X + 20, Y + 13, wire); }
      else if (me === 1) { wline(ctx, X + 12, Y - 8, X + 12, Y + 22, wire); }
      else { wline(ctx, X + 12, Y + 20, X + 12, Y + 13, wire); }
    }
    // a little current glint on energised lines
    if (me === 1 && hash2(k, Math.floor(now * 2), 7) < .06) { ctx.fillStyle = '#9fe4ff'; ctx.fillRect(X + 3 + ((now * 40 + k) % 18 | 0), Y - 11, 1, 1); }
  }
}

function drawFx(ctx, st, now) {
  const dt = Math.min(.05, now - (RD.lastFx || now)); RD.lastFx = now;
  const wx = (st.weather.wind - .3) * 14;
  for (const f of st.fx) {
    f.age += dt;
    if (f.k === 'puff') {
      const p = f.age / f.t; f.x += (wx + (f.black ? 0 : 1)) * dt; f.y -= (f.black ? 6 : 9) * dt * (1 - p * .5);
      const r = Math.min(6, Math.round(f.r + f.g * p)); ctx.globalAlpha = Math.max(0, .85 * (1 - p)) * (f.dark ? .9 : .75);
      const img = RD.puffs[f.black ? 'b' : f.dark ? 'g' : 'l'][r];
      ctx.drawImage(img, Math.round(f.x - img.width / 2), Math.round(f.y - img.height / 2)); ctx.globalAlpha = 1;
    } else if (f.k === 'bolt') {
      ctx.fillStyle = Math.random() < .5 ? '#e9f8ff' : '#7fd0ff';
      let px = f.x0, py = f.y0; const n = 10;
      for (let i = 1; i <= n; i++) { const t = i / n, nx = f.x0 + (f.x1 - f.x0) * t + (i < n ? (Math.random() - .5) * 8 : 0), ny = f.y0 + (f.y1 - f.y0) * t + (i < n ? (Math.random() - .5) * 8 : 0); wline(ctx, px, py, nx, ny, ctx.fillStyle); px = nx; py = ny; }
      RD.flash = Math.max(RD.flash, .06);
    } else if (f.k === 'spark') {
      for (let i = 0; i < 5; i++) { ctx.fillStyle = Math.random() < .5 ? '#fff6b0' : '#ffb030'; ctx.fillRect(Math.round(f.x + (Math.random() - .5) * 14 * f.age * 3), Math.round(f.y + (Math.random() - .3) * 10 * f.age * 3), 1, 1); }
    } else if (f.k === 'cash') {
      const p = f.age / f.t; ctx.globalAlpha = 1 - p; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(f.txt, f.x + 1, f.y - p * 16 + 1); ctx.fillStyle = '#7dff6a'; ctx.fillText(f.txt, f.x, f.y - p * 16); ctx.globalAlpha = 1;
    } else if (f.k === 'boom') {
      const p = f.age / f.t; ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffd36a'; ctx.fillRect(f.x - 2 - p * 8, f.y - 2 - p * 8, 4 + p * 16, 4 + p * 16); ctx.globalAlpha = 1;
    }
  }
  st.fx = st.fx.filter(f => f.age < f.t);
}

function drawWeather(ctx, st, vx, vy, vw, vh, now) {
  const w = st.weather, want = w.snowing === 2 ? 260 : w.snowing ? 90 : 0;
  const storm = activeEv(st, 'storm'), rain = st.theme === 'temperate' && (w.cloud > .88 || storm);
  const n = rain ? (storm ? 200 : 90) : want;
  while (RD.flakes.length < n) RD.flakes.push({ x: Math.random(), y: Math.random(), z: .4 + Math.random() * .6 });
  RD.flakes.length = n;
  const dt = Math.min(.05, now - (RD.lastW || now)); RD.lastW = now;
  const wx = (w.wind - .2) * (w.snowing === 2 ? 1.1 : .5);
  ctx.fillStyle = rain ? 'rgba(200,220,255,.55)' : '#ffffff';
  for (const f of RD.flakes) {
    f.x += (wx * f.z) * dt * .3; f.y += (rain ? 1.4 : .18) * f.z * dt;
    if (f.y > 1) { f.y -= 1; f.x = Math.random(); } f.x = ((f.x % 1) + 1) % 1;
    const px = Math.round(vx + f.x * vw), py = Math.round(vy + f.y * vh);
    if (rain) ctx.fillRect(px, py, 1, 3); else ctx.fillRect(px, py, f.z > .8 ? 2 : 1, f.z > .8 ? 2 : 1);
  }
  if (w.snowing === 2) { ctx.fillStyle = 'rgba(225,235,245,.14)'; ctx.fillRect(vx, vy, vw, vh); }
  if (storm && Math.random() < .004) RD.flash = .5;
  if (RD.flash > 0) { ctx.fillStyle = `rgba(230,240,255,${RD.flash})`; ctx.fillRect(vx, vy, vw, vh); RD.flash = Math.max(0, RD.flash - dt * 2); }
}

function bracket(ctx, x, y, w, h, col = '#fff') {
  ctx.fillStyle = col; const L = 4;
  ctx.fillRect(x, y, L, 1); ctx.fillRect(x, y, 1, L); ctx.fillRect(x + w - L, y, L, 1); ctx.fillRect(x + w - 1, y, 1, L);
  ctx.fillRect(x, y + h - 1, L, 1); ctx.fillRect(x, y + h - L, 1, L); ctx.fillRect(x + w - L, y + h - 1, L, 1); ctx.fillRect(x + w - 1, y + h - L, 1, L);
}
function hpBar(ctx, x, y, w, f, col) { ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 4); ctx.fillStyle = col || (f > .5 ? '#3ce03c' : f > .25 ? '#f0d020' : '#f03020'); ctx.fillRect(x, y, Math.max(1, Math.round(w * f)), 2); }

function drawOverlays(ctx, st, sel, ui, now) {
  // placement grid: white = ok, red = blocked (dithered like the classic)
  if (ui.place && ui.place.at) {
    const [x, y] = ui.place.at, r = canPlace(st, ui.place.type, x, y);
    for (const [cx, cy, ok] of r.cells) {
      ctx.fillStyle = ok ? 'rgba(255,255,255,.55)' : 'rgba(255,40,30,.6)';
      for (let j = 0; j < TS; j += 2) for (let i = (j / 2) % 2; i < TS; i += 2) ctx.fillRect(cx * TS + i, cy * TS + j, 1, 1);
    }
    const sp = RD.spr[ui.place.type]; ctx.globalAlpha = .55; ctx.drawImage(sp.c, x * TS + sp.ox, y * TS + sp.oy); ctx.globalAlpha = 1;
    ui.place.ok = r.ok; ui.place.why = r.why;
  }
  if (ui.lineDrag) {
    for (const [k, ok] of ui.lineDrag) { const x = k % st.W, y = (k / st.W) | 0; ctx.fillStyle = ok ? 'rgba(255,255,255,.6)' : 'rgba(255,40,30,.6)'; for (let j = 0; j < TS; j += 2) for (let i = (j / 2) % 2; i < TS; i += 2) ctx.fillRect(x * TS + i, y * TS + j, 1, 1); if (ok) { ctx.globalAlpha = .6; ctx.drawImage(RD.spr.pylon.c, x * TS, y * TS + RD.spr.pylon.oy); ctx.globalAlpha = 1; } }
  }
  if (ui.hover && (ui.mode === 'line' || ui.mode === 'sell' || ui.mode === 'repair') && !ui.lineDrag) {
    const [x, y] = ui.hover; ctx.fillStyle = ui.mode === 'line' ? 'rgba(255,255,255,.35)' : ui.mode === 'sell' ? 'rgba(255,220,60,.35)' : 'rgba(120,255,120,.35)'; ctx.fillRect(x * TS, y * TS, TS, TS);
  }
  if (sel) {
    if (sel.kind === 's') { const s = st.byId[sel.id]; if (s) { const d = S[s.type], sp = RD.spr[s.type]; const top = s.y * TS + Math.max(sp.oy, -20); bracket(ctx, s.x * TS - 1, top - 1, d.fp[0] * TS + 2, s.y * TS + d.fp[1] * TS - top + 2); const f = s.st === 'trip' ? 0.15 : 1; hpBar(ctx, s.x * TS, top - 5, d.fp[0] * TS, f); if (d.store) hpBar(ctx, s.x * TS, top - 9, d.fp[0] * TS, s.soc / d.energy, '#40b8ff'); } }
    if (sel.kind === 'u') { const u = st.units.find(u => u.id === sel.id); if (u) { bracket(ctx, Math.round(u.x * TS + 2), Math.round(u.y * TS + 2), 20, 20); hpBar(ctx, Math.round(u.x * TS + 4), Math.round(u.y * TS - 1), 16, 1); if (u.manual !== undefined) { const mx = u.manual % st.W, my = (u.manual / st.W) | 0; ctx.fillStyle = '#3cff3c'; ctx.fillRect(mx * TS + 11, my * TS + 8, 2, 8); ctx.fillRect(mx * TS + 8, my * TS + 11, 8, 2); } } }
    if (sel.kind === 't') { const t = st.towns[sel.i]; for (const [x, y] of t.tiles) bracket(ctx, x * TS, y * TS - 6, TS, TS + 6, '#ffe070'); }
    if (sel.kind === 'l') { const x = sel.k % st.W, y = (sel.k / st.W) | 0; bracket(ctx, x * TS, y * TS - 14, TS, TS + 14); if (st.lines[sel.k] !== undefined) hpBar(ctx, x * TS + 2, y * TS - 18, 20, st.lines[sel.k] / 100); }
  }
  // tutorial pointer on the map
  if (ui.mapArrow) { const [x, y] = ui.mapArrow, b = Math.sin(now * 6) * 3; ctx.fillStyle = '#ffe14a'; for (let i = 0; i < 7; i++) ctx.fillRect(x * TS + 12 - i, y * TS - 26 - i + b, i * 2 + 1, 1); ctx.fillRect(x * TS + 10, y * TS - 40 + b, 5, 8); }
  // damaged lines flash on the map so they're easy to find
  for (const k in st.brk) { if (Math.floor(now * 2) % 2) { const x = k % st.W, y = (k / st.W) | 0; ctx.fillStyle = '#ff3020'; ctx.fillRect(x * TS + 9, y * TS - 4, 6, 6); ctx.fillStyle = '#fff'; ctx.fillRect(x * TS + 11, y * TS - 3, 2, 3); ctx.fillRect(x * TS + 11, y * TS + 1, 2, 1); } }
}

// ---------- radar ----------
function drawRadar(st, rc, online) {
  const x = rc.getContext('2d'); x.imageSmoothingEnabled = false;
  const W2 = rc.width, H2 = rc.height;
  if (!online) { drawEmblem(x, W2, H2, st); return; }
  const s = Math.min(W2 / st.W, H2 / st.H), ox = (W2 - st.W * s) / 2, oy = (H2 - st.H * s) / 2;
  x.fillStyle = '#000'; x.fillRect(0, 0, W2, H2);
  x.drawImage(RD.radarBase, ox, oy, st.W * s, st.H * s);
  const now = performance.now() / 1000;
  for (const k in st.lines) { x.fillStyle = st.brk[k] ? (Math.floor(now * 3) % 2 ? '#ff0' : '#600') : '#d02818'; x.fillRect(ox + (k % st.W) * s, oy + ((k / st.W) | 0) * s, Math.ceil(s), Math.ceil(s)); }
  for (const o of st.structs) { const d = S[o.type]; x.fillStyle = o.st === 'trip' ? '#ff0' : '#ff3a28'; x.fillRect(ox + o.x * s, oy + o.y * s, d.fp[0] * s, d.fp[1] * s); }
  for (const t of st.towns) { x.fillStyle = t.joined ? (t.lit ? '#ffe060' : (Math.floor(now * 2) % 2 ? '#5a6a8a' : '#203050')) : '#e8e8e8'; for (const [tx, ty] of t.tiles) x.fillRect(ox + tx * s, oy + ty * s, Math.ceil(s), Math.ceil(s)); }
  for (const u of st.units) { if (u.type === 'thief') { if (!st.rev[idx(st, Math.round(u.x), Math.round(u.y))] || Math.floor(now * 4) % 2) continue; x.fillStyle = '#ff40ff'; } else x.fillStyle = '#fff'; x.fillRect(ox + u.x * s, oy + u.y * s, Math.max(2, s), Math.max(2, s)); }
  // shroud
  x.fillStyle = '#000'; for (let k = 0; k < st.W * st.H; k++) if (!st.rev[k]) x.fillRect(ox + (k % st.W) * s, oy + ((k / st.W) | 0) * s, Math.ceil(s), Math.ceil(s));
  // view box
  const c = RD.cam; x.strokeStyle = '#fff'; x.lineWidth = 1;
  x.strokeRect(Math.round(ox + c.x / TS * s) + .5, Math.round(oy + c.y / TS * s) + .5, Math.round(RD.vw / c.z / TS * s), Math.round(RD.vh / c.z / TS * s));
  RD.radarMap = { s, ox, oy };
}

// Our own emblem (shown while the radar is offline): lightning bolt in a cog.
function drawEmblem(x, W2, H2, st) {
  x.fillStyle = '#060606'; x.fillRect(0, 0, W2, H2);
  const now = performance.now() / 1000;
  for (let i = 0; i < W2 * H2 / 30; i++) { x.fillStyle = Math.random() < .5 ? '#151515' : '#0c0c0c'; x.fillRect(Math.random() * W2 | 0, Math.random() * H2 | 0, 1, 1); }
  const cx = W2 / 2, cy = H2 / 2 - 4, r = Math.min(W2, H2) * .3;
  x.save(); x.translate(cx, cy);
  x.fillStyle = '#7a1410'; x.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, rr = i % 2 ? r : r * 1.18; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill();
  x.fillStyle = '#c9a227'; x.beginPath(); x.arc(0, 0, r * .86, 0, Math.PI * 2); x.fill(); x.fillStyle = '#3a0a08'; x.beginPath(); x.arc(0, 0, r * .72, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f2f2f2'; x.beginPath(); const b = r * .62; x.moveTo(b * .2, -b); x.lineTo(-b * .45, b * .12); x.lineTo(-b * .02, b * .12); x.lineTo(-b * .25, b); x.lineTo(b * .48, -b * .18); x.lineTo(b * .05, -b * .18); x.closePath(); x.fill();
  x.restore();
  x.fillStyle = '#c9a227'; x.font = `bold ${Math.max(7, H2 * .1 | 0)}px monospace`; x.textAlign = 'center'; x.fillText(has(st, 'dome') ? (st.lowPower ? 'RADAR OFFLINE · LOW POWER' : '') : 'BUILD SCADA DOME', cx, H2 - 5);
}
