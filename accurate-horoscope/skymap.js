// Interactive map of the whole sky above the horizon (looking up: north at top, east on the left).
// Pinch / scroll to zoom, drag to move, double-tap to reset, tap to name. Slider moves through
// the hours around the birth time. "Download" saves a high-resolution poster of the current view time.
function SkyMap(host, birthUTC, place) {
  const D2R = Math.PI / 180;
  const ZODIAC = new Set(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces', 'Ophiuchus']);
  const COLORS = { Sun: '#ffd25a', Moon: '#e9e6dc', Mercury: '#c9b9a6', Venus: '#fff3c4', Mars: '#ff7a52', Jupiter: '#f1d3a5', Saturn: '#e8cf8a', Uranus: '#9fe3e6', Neptune: '#7da2ff' };
  const MAXZ = 8;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  host.innerHTML = '';
  const wrap = mk('div', 'skymap'), title = mk('p', 'small sky-title'), canvas = mk('canvas');
  const info = mk('p', 'small center', 'Tap a star or planet.');
  const row = mk('div', 'skyrow'), clock = mk('span'), slider = mk('input');
  slider.type = 'range'; slider.min = -720; slider.max = 720; slider.step = 5; slider.value = 0;
  row.append(clock, slider);
  const btns = mk('div', 'skybtns');
  const allBtn = mk('button', 'chip mini', 'All names'), fsBtn = mk('button', 'chip mini', '⤢ Full screen'), dlBtn = mk('button', 'chip mini', '⬇ Download');
  btns.append(allBtn, fsBtn, dlBtn);
  const hint = mk('p', 'small center', 'Pinch or scroll to zoom · drag to move · double-tap to reset');
  wrap.append(title, canvas, info, row, btns, hint); host.appendChild(wrap);

  // Precess the catalogue once to the birth date.
  const T = Astro.cent(birthUTC);
  const stars = SKY_STARS.map(s => { const [ra, dec] = Astro.precess(s[0], s[1], T); return { ra, dec, mag: s[2], name: s[3] || '' }; });
  const lines = SKY_LINES.map(c => c.map(seg => seg.map(p => Astro.precess(p[0], p[1], T))));
  const names = SKY_NAMES.map(n => { const [ra, dec] = Astro.precess(n[1], n[2], T); return { name: n[0], ra, dec }; });
  const eps = Astro.obl(T), ecliptic = [];
  for (let l = 0; l <= 360; l += 3) ecliptic.push(Astro.eclToEq(l, 0, eps));

  let showAll = false, picked = null, zoom = 1, panX = 0, panY = 0, size = 0, full = false, last = null;
  const dateAt = () => new Date(birthUTC.getTime() + slider.value * 60000);
  const local = (d, o) => { try { return d.toLocaleString('en-GB', Object.assign({ timeZone: place.tz }, o)); } catch { return d.toLocaleString('en-GB', o); } };
  const fmtTime = d => local(d, { hour: '2-digit', minute: '2-digit' });
  const fmtDay = d => local(d, { day: 'numeric', month: 'long', year: 'numeric' });

  // Draw the sky into any canvas. S = map area in px, top = vertical offset.
  // The view transform (zoom/pan) scales the sky; text and lines keep their on-screen size.
  function render(ctx, S, o) {
    const u = S / 400, cx = S / 2, cy = (o.top || 0) + S / 2, R = S / 2 - 22 * u, z = o.zoom, k = 1 / z;
    const lst = Astro.norm(Astro.gmst(o.date) + place.lng);
    const project = (ra, dec) => {
      const [alt, az] = Astro.altAz(ra, dec, lst, place.lat);
      const r = R * Math.tan((90 - alt) / 2 * D2R);
      return { x: cx - r * Math.sin(az * D2R), y: cy - r * Math.cos(az * D2R), alt };
    };
    const bodies = Astro.skyBodies(o.date).map(b => Object.assign(b, project(b.eq[0], b.eq[1])));
    const sun = bodies[0], pts = [];

    ctx.save();
    ctx.translate(cx + o.panX, cy + o.panY); ctx.scale(z, z); ctx.translate(-cx, -cy);

    const sky = sun.alt > 0 ? ['#2f5f9e', '#1d3c6b'] : sun.alt > -12 ? ['#1d2a52', '#111833'] : ['#0e1330', '#070914'];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, sky[1]); g.addColorStop(1, sky[0]);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const starAlpha = sun.alt > 0 ? 0.18 : sun.alt > -12 ? 0.55 : 1;

    ctx.lineWidth = u * k; ctx.strokeStyle = 'rgba(255,255,255,.07)';
    for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, R * Math.tan((90 - a) / 2 * D2R), 0, 2 * Math.PI); ctx.stroke(); }

    const path = list => { ctx.beginPath(); let pen = false;
      for (const [ra, dec] of list) { const p = project(ra, dec); if (p.alt < -25) { pen = false; continue; } pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; }
      ctx.stroke(); };
    ctx.strokeStyle = `rgba(150,170,230,${0.35 * starAlpha + 0.05})`; ctx.lineWidth = u * k;
    for (const c of lines) for (const seg of c) path(seg);
    ctx.setLineDash([4 * u * k, 5 * u * k]); ctx.strokeStyle = 'rgba(226,184,102,.45)'; path(ecliptic); ctx.setLineDash([]);

    // stars grow a little when zoomed, and the brighter ones get names
    const grow = Math.sqrt(z) * k, nameLimit = o.exportMode ? 1.3 : z * 1.2 - 0.6;

    // Plan the Sun/Moon/planet labels first: every dot is an obstacle, and labels avoid each other and the edge.
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const big = b => b.name === 'Sun' || b.name === 'Moon';
    const up = bodies.filter(b => b.alt >= 0).sort((a, b) => big(b) - big(a));
    up.forEach(b => { b.r = (b.name === 'Sun' ? 7 : b.name === 'Moon' ? 6 : 3.2) * u * grow; });
    const placed = up.map(b => ({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }));
    ctx.font = `${11 * u * k}px system-ui, sans-serif`;
    for (const b of up) {
      const w = ctx.measureText(b.name).width, h = 12 * u * k, gp = 3 * u * k, r = b.r, far = r + 3 * gp;
      const spots = [[b.x + r + gp, b.y - h / 2], [b.x - r - gp - w, b.y - h / 2], [b.x - w / 2, b.y - r - gp - h], [b.x - w / 2, b.y + r + gp],
        [b.x + r, b.y - r - h], [b.x + r, b.y + r], [b.x - r - w, b.y - r - h], [b.x - r - w, b.y + r],
        [b.x + far, b.y - h / 2], [b.x - far - w, b.y - h / 2], [b.x - w / 2, b.y - far - h], [b.x - w / 2, b.y + far]];
      const fits = q => Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy) + q.w / 2 < R - 2 * u && !placed.some(p => hit(q, p));
      b.box = spots.map(([x, y]) => ({ x, y, w, h })).find(fits) || { x: spots[0][0], y: spots[0][1], w, h };
      placed.push(b.box);
    }
    ctx.font = `${10 * u * k}px system-ui, sans-serif`; ctx.textAlign = 'left';
    for (const s of stars) {
      const p = project(s.ra, s.dec); if (p.alt < 0) continue;
      const r = Math.max(0.5, (5.3 - s.mag) * 0.6) * u * grow;
      ctx.globalAlpha = Math.min(1, 0.35 + (5 - s.mag) * 0.15) * starAlpha; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill();
      if (s.name && s.mag < nameLimit) {
        const box = { x: p.x + r + 3 * u * k, y: p.y - 7 * u * k, w: ctx.measureText(s.name).width, h: 11 * u * k };
        if (!placed.some(q => hit(box, q))) { ctx.globalAlpha = 0.75 * Math.max(starAlpha, 0.5); ctx.fillStyle = '#cfd6ff'; ctx.fillText(s.name, box.x, p.y + 3 * u * k); }
      }
      if (s.name || s.mag < 3.5) pts.push({ x: p.x, y: p.y, label: s.name || 'Unnamed star', sub: `star · brightness ${s.mag}`, w: s.name ? 1 : 2 });
    }
    ctx.globalAlpha = 1;

    ctx.font = `${10 * u * k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    for (const n of names) {
      if (!showAll && !ZODIAC.has(n.name)) continue;
      const p = project(n.ra, n.dec); if (p.alt < 3) continue;
      ctx.fillStyle = ZODIAC.has(n.name) ? 'rgba(226,184,102,.75)' : 'rgba(170,180,220,.6)';
      ctx.fillText(n.name.toUpperCase(), p.x, p.y);
    }

    // Sun, Moon, planets
    ctx.font = `${11 * u * k}px system-ui, sans-serif`; ctx.textAlign = 'left';
    for (const b of up) {
      ctx.fillStyle = COLORS[b.name]; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(b.name, b.box.x, b.box.y + b.box.h * 0.82);
      pts.push({ x: b.x, y: b.y, label: b.name, sub: `${fmtDist(b.dist)} away`, w: 0 });
    }
    if (o.picked) { ctx.strokeStyle = '#e2b866'; ctx.lineWidth = 1.5 * u * k; ctx.beginPath(); ctx.arc(o.picked.x, o.picked.y, 10 * u * k, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.restore();

    ctx.strokeStyle = '#3a3f58'; ctx.lineWidth = 1.5 * u * k; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#8d8ba3'; ctx.font = `600 ${12 * u * k}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - R - 6 * u * k); ctx.fillText('S', cx, cy + R + 15 * u * k);
    ctx.fillText('E', cx - R - 10 * u * k, cy + 4 * u * k); ctx.fillText('W', cx + R + 10 * u * k, cy + 4 * u * k);
    ctx.restore();

    return { pts, sunUp: sun.alt > 0, below: bodies.filter(b => b.alt < 0 && b.name !== 'Sun').map(b => b.name) };
  }

  function clampPan() {
    const m = (size / 2) * (zoom - 1);
    panX = Math.max(-m, Math.min(m, panX)); panY = Math.max(-m, Math.min(m, panY));
  }
  function draw() {
    const want = full ? Math.min(innerWidth - 8, innerHeight - 210) : Math.min(wrap.clientWidth || 360, 720);
    const dpr = window.devicePixelRatio || 1;
    if (Math.round(want) !== size) {
      size = Math.max(240, Math.round(want));
      canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = canvas.style.height = size + 'px';
      clampPan();
    }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    const date = dateAt();
    last = render(ctx, size, { zoom, panX, panY, date, picked });
    clock.textContent = fmtTime(date) + (+slider.value === 0 ? ' · birth' : '');
    title.textContent = `The sky above ${place.name}, ${local(date, { day: 'numeric', month: 'short', year: 'numeric' })}` + (last.sunUp ? '. Daytime: the Sun hid the stars.' : '.');
    if (!picked) info.textContent = last.below.length ? `Below the horizon: ${last.below.join(', ')}.` : 'Tap a star or planet.';
  }

  // ---- gestures ----
  const toCanvas = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const toWorld = p => ({ x: size / 2 + (p.x - size / 2 - panX) / zoom, y: size / 2 + (p.y - size / 2 - panY) / zoom });
  function zoomAt(p, z) {
    z = Math.max(1, Math.min(MAXZ, z));
    const w = toWorld(p);
    panX = p.x - size / 2 - (w.x - size / 2) * z; panY = p.y - size / 2 - (w.y - size / 2) * z; zoom = z;
    clampPan(); draw();
  }
  function pick(p) {
    const w = toWorld(p); let best = null, bd = 22 * 22;
    for (const q of last.pts) { const d = ((q.x - w.x) * zoom) ** 2 + ((q.y - w.y) * zoom) ** 2 + q.w * 60; if (d < bd) { bd = d; best = q; } }
    picked = best ? { x: best.x, y: best.y } : null;
    info.textContent = best ? `${best.label} · ${best.sub}` : 'Tap a star or planet.';
    draw();
  }
  const ptrs = new Map(); let g = null, lastTap = 0;
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, toCanvas(e));
    const ps = [...ptrs.values()];
    if (ps.length === 1) g = { type: 'tap', s: ps[0], panX, panY };
    else if (ps.length === 2) g = { type: 'pinch', d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, z0: zoom, m0: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }, panX, panY };
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !g) return;
    ptrs.set(e.pointerId, toCanvas(e));
    const ps = [...ptrs.values()];
    if (g.type === 'pinch' && ps.length >= 2) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      const z = Math.max(1, Math.min(MAXZ, g.z0 * d / g.d0));
      const wx = size / 2 + (g.m0.x - size / 2 - g.panX) / g.z0, wy = size / 2 + (g.m0.y - size / 2 - g.panY) / g.z0;
      zoom = z; panX = m.x - size / 2 - (wx - size / 2) * z; panY = m.y - size / 2 - (wy - size / 2) * z;
      clampPan(); draw();
    } else if (ps.length === 1 && (g.type === 'tap' || g.type === 'pan')) {
      const dx = ps[0].x - g.s.x, dy = ps[0].y - g.s.y;
      if (g.type === 'tap' && Math.hypot(dx, dy) > 6) g.type = 'pan';
      if (g.type === 'pan') { panX = g.panX + dx; panY = g.panY + dy; clampPan(); draw(); }
    }
  });
  const end = e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (g && g.type === 'tap' && e.type === 'pointerup') {
      const now = Date.now();
      if (now - lastTap < 300) { zoom = 1; panX = panY = 0; picked = null; lastTap = 0; draw(); }
      else { lastTap = now; pick(p); }
    }
    if (ptrs.size === 1) { const q = [...ptrs.values()][0]; g = { type: 'pan', s: q, panX, panY }; }
    else if (!ptrs.size) g = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(toCanvas(e), zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  slider.addEventListener('input', () => { picked = null; draw(); });
  allBtn.addEventListener('click', () => { showAll = !showAll; allBtn.classList.toggle('on', showAll); draw(); });
  fsBtn.addEventListener('click', () => {
    full = !full; wrap.classList.toggle('full', full); document.body.style.overflow = full ? 'hidden' : '';
    fsBtn.textContent = full ? '✕ Close' : '⤢ Full screen'; size = 0; draw();
  });

  // ---- download: a 2000 px poster of the whole sky at the slider's time ----
  function poster() {
    const S = 2000, top = 190, H = S + top + 110, date = dateAt();
    const c = document.createElement('canvas'); c.width = S; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0d17'; x.fillRect(0, 0, S, H);
    x.textAlign = 'center'; x.fillStyle = '#e2b866'; x.font = '600 64px system-ui, sans-serif';
    x.fillText(`The sky above ${place.name}`, S / 2, 92);
    x.fillStyle = '#ece8df'; x.font = '40px system-ui, sans-serif';
    x.fillText(`${fmtDay(date)}, ${fmtTime(date)}`, S / 2, 152);
    render(x, S, { zoom: 1, panX: 0, panY: 0, top, date, exportMode: true });
    x.fillStyle = '#8d8ba3'; x.font = '30px system-ui, sans-serif';
    x.fillText('ACCURATE horoscope · looking straight up: north at top, east on the left', S / 2, H - 45);
    const ymd = ['year', 'month', 'day'].map(k => local(date, { [k]: k === 'year' ? 'numeric' : '2-digit' })).join('-');
    return { canvas: c, file: `sky-${ymd}-${place.name.replace(/[^\w]+/g, '-')}.png` };
  }
  dlBtn.addEventListener('click', () => {
    const { canvas: c, file } = poster();
    c.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  addEventListener('resize', () => { size = 0; draw(); });
  draw();
  return { poster };
}
