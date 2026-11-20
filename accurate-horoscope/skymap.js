// Interactive map of the whole sky above the horizon (looking up: north at top, east on the left).
// Drag the slider to move through the hours around the birth time; tap anything to name it.
function SkyMap(host, birthUTC, place) {
  const D2R = Math.PI / 180;
  const ZODIAC = new Set(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces', 'Ophiuchus']);
  const COLORS = { Sun: '#ffd25a', Moon: '#e9e6dc', Mercury: '#c9b9a6', Venus: '#fff3c4', Mars: '#ff7a52', Jupiter: '#f1d3a5', Saturn: '#e8cf8a', Uranus: '#9fe3e6', Neptune: '#7da2ff' };

  host.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'skymap';
  const title = document.createElement('p'); title.className = 'small';
  const canvas = document.createElement('canvas');
  const info = document.createElement('p'); info.className = 'small center'; info.textContent = 'Tap a star or planet.';
  const row = document.createElement('div'); row.className = 'skyrow';
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = -720; slider.max = 720; slider.step = 5; slider.value = 0;
  const clock = document.createElement('span');
  const allBtn = document.createElement('button'); allBtn.className = 'chip mini'; allBtn.textContent = 'All names';
  row.append(clock, slider, allBtn);
  wrap.append(title, canvas, row, info); host.appendChild(wrap);

  // Precess the catalogue once to the birth date.
  const T = Astro.cent(birthUTC);
  const stars = SKY_STARS.map(s => { const [ra, dec] = Astro.precess(s[0], s[1], T); return { ra, dec, mag: s[2], name: s[3] || '' }; });
  const lines = SKY_LINES.map(c => c.map(seg => seg.map(p => Astro.precess(p[0], p[1], T))));
  const names = SKY_NAMES.map(n => { const [ra, dec] = Astro.precess(n[1], n[2], T); return { name: n[0], ra, dec }; });
  const eps = Astro.obl(T), ecliptic = [];
  for (let l = 0; l <= 360; l += 4) ecliptic.push(Astro.eclToEq(l, 0, eps));

  let showAll = false, picked = null, size = 0, R = 0, cx = 0, cy = 0, pts = [], date = birthUTC;
  const fmtTime = d => { try { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: place.tz }); } catch { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } };

  function project(ra, dec, lst) {
    const [alt, az] = Astro.altAz(ra, dec, lst, place.lat);
    const r = R * Math.tan((90 - alt) / 2 * D2R);
    return { x: cx - r * Math.sin(az * D2R), y: cy - r * Math.cos(az * D2R), alt };
  }
  function draw() {
    const w = Math.min(host.clientWidth || 340, 440), dpr = window.devicePixelRatio || 1;
    if (w !== size) { size = w; canvas.width = w * dpr; canvas.height = w * dpr; canvas.style.width = canvas.style.height = w + 'px'; }
    R = size / 2 - 20; cx = cy = size / 2;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    date = new Date(birthUTC.getTime() + slider.value * 60000);
    const offMin = +slider.value;
    clock.textContent = fmtTime(new Date(date.getTime())) + (offMin === 0 ? ' · birth' : '');
    const lst = Astro.norm(Astro.gmst(date) + place.lng);
    const bodies = Astro.skyBodies(date).map(b => Object.assign(b, project(b.eq[0], b.eq[1], lst)));
    const sun = bodies[0];

    // sky colour follows the Sun: day, twilight, night
    const sky = sun.alt > 0 ? ['#2f5f9e', '#1d3c6b'] : sun.alt > -12 ? ['#1d2a52', '#111833'] : ['#0e1330', '#070914'];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, sky[1]); g.addColorStop(1, sky[0]);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const starAlpha = sun.alt > 0 ? 0.18 : sun.alt > -12 ? 0.55 : 1;

    // altitude rings
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, R * Math.tan((90 - a) / 2 * D2R), 0, 2 * Math.PI); ctx.stroke(); }

    // constellation lines
    ctx.strokeStyle = `rgba(150,170,230,${0.35 * starAlpha + 0.05})`; ctx.lineWidth = 1;
    for (const c of lines) for (const seg of c) {
      ctx.beginPath(); let pen = false;
      for (const [ra, dec] of seg) { const p = project(ra, dec, lst); if (p.alt < -25) { pen = false; continue; } pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; }
      ctx.stroke();
    }
    // ecliptic: the path of the Sun, Moon and planets
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(226,184,102,.45)'; ctx.beginPath(); let pen = false;
    for (const [ra, dec] of ecliptic) { const p = project(ra, dec, lst); if (p.alt < -25) { pen = false; continue; } pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; }
    ctx.stroke(); ctx.setLineDash([]);

    // stars
    pts = [];
    for (const s of stars) {
      const p = project(s.ra, s.dec, lst); if (p.alt < 0) continue;
      const r = Math.max(0.5, (5.3 - s.mag) * 0.6);
      ctx.globalAlpha = Math.min(1, (0.35 + (5 - s.mag) * 0.15)) * starAlpha; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill();
      if (s.name || s.mag < 3.5) pts.push({ x: p.x, y: p.y, label: s.name || 'Unnamed star', sub: `star · brightness ${s.mag}`, w: s.name ? 1 : 2 });
    }
    ctx.globalAlpha = 1;

    // constellation names
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const n of names) {
      if (!showAll && !ZODIAC.has(n.name)) continue;
      const p = project(n.ra, n.dec, lst); if (p.alt < 3) continue;
      ctx.fillStyle = ZODIAC.has(n.name) ? 'rgba(226,184,102,.75)' : 'rgba(170,180,220,.6)';
      ctx.fillText(n.name.toUpperCase(), p.x, p.y);
    }

    // Sun, Moon, planets
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
    const placed = [], hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const b of bodies.filter(b => b.alt >= 0).sort((a, b) => (a.name === 'Sun' || a.name === 'Moon' ? -1 : 0) - (b.name === 'Sun' || b.name === 'Moon' ? -1 : 0))) {
      const r = b.name === 'Sun' ? 7 : b.name === 'Moon' ? 6 : 3.2;
      ctx.fillStyle = COLORS[b.name]; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 2 * Math.PI); ctx.fill();
      // label: right, left, above or below the dot, inside the circle and clear of other labels
      const w = ctx.measureText(b.name).width, h = 12;
      const spots = [[b.x + r + 3, b.y - 6], [b.x - r - 3 - w, b.y - 6], [b.x - w / 2, b.y - r - 15], [b.x - w / 2, b.y + r + 3]];
      const fits = q => Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy) + q.w / 2 < R - 2 && !placed.some(o => hit(q, o));
      let box = spots.map(([x, y]) => ({ x, y, w, h })).find(fits) || { x: spots[0][0], y: spots[0][1], w, h };
      placed.push(box); ctx.fillStyle = '#fff'; ctx.fillText(b.name, box.x, box.y + 10);
      pts.push({ x: b.x, y: b.y, label: b.name, sub: `${fmtDist(b.dist)} away`, w: 0 });
    }
    if (picked) { ctx.strokeStyle = '#e2b866'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(picked.x, picked.y, 10, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.restore();

    // horizon and compass
    ctx.strokeStyle = '#3a3f58'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#8d8ba3'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - R - 6); ctx.fillText('S', cx, cy + R + 15); ctx.fillText('E', cx - R - 10, cy + 4); ctx.fillText('W', cx + R + 10, cy + 4);

    const below = bodies.filter(b => b.alt < 0 && b.name !== 'Sun').map(b => b.name);
    title.textContent = `The sky above ${place.name}, ${fmtDate(dayKeyUTC(date, place.tz), { day: 'numeric', month: 'short', year: 'numeric' })}` +
      (sun.alt > 0 ? '. Daytime: the Sun hid the stars.' : '.');
    if (!picked) info.textContent = below.length ? `Below the horizon: ${below.join(', ')}.` : 'Tap a star or planet.';
  }
  function dayKeyUTC(d, tz) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch { return d.toISOString().slice(0, 10); }
  }
  canvas.addEventListener('pointerdown', e => {
    const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    let best = null, bd = 22 * 22;
    for (const p of pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2 + p.w * 60; if (d < bd) { bd = d; best = p; } }
    picked = best ? { x: best.x, y: best.y } : null;
    info.textContent = best ? `${best.label} · ${best.sub}` : 'Tap a star or planet.';
    draw();
  });
  slider.addEventListener('input', () => { picked = null; draw(); });
  allBtn.addEventListener('click', () => { showAll = !showAll; allBtn.classList.toggle('on', showAll); draw(); });
  addEventListener('resize', draw);
  draw();
}
