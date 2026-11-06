// Explosion effects on a full-screen canvas: flash, shockwave, fireball, sparks, smoke,
// and the destroyed pieces shattering into spinning shards.
'use strict';

const FX = (() => {
  let cv, g, dpr = 1, W = 0, H = 0, parts = [], running = false, last = 0;
  const sprites = {};

  function sprite(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return c;
  }

  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    sprites.hot = sprite([[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,230,140,0.9)'], [0.7, 'rgba(255,150,40,0.35)'], [1, 'rgba(255,100,0,0)']]);
    sprites.fire = sprite([[0, 'rgba(255,190,70,1)'], [0.4, 'rgba(255,100,20,0.75)'], [0.75, 'rgba(200,40,10,0.3)'], [1, 'rgba(120,20,0,0)']]);
    sprites.smoke = sprite([[0, 'rgba(48,46,52,0.9)'], [0.5, 'rgba(40,40,46,0.5)'], [1, 'rgba(30,30,36,0)']]);
    sprites.shadow = sprite([[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    resize();
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  // o = { x, y, s: square size px, victims: [{x, y, img, rot}], king: bool }
  function explode(o) {
    const { x, y, s } = o, m = o.king ? 2.3 : 1 + Math.min(o.victims.length, 6) * 0.12;
    parts.push({ k: 'flash', x, y, life: 0, max: o.king ? 0.6 : 0.28, r: s * 2.4 * m });
    parts.push({ k: 'ring', x, y, life: 0, max: 0.55, r0: s * 0.3, r1: s * 2 * m, w: s * 0.22 });
    if (o.king) {
      parts.push({ k: 'ring', x, y, life: -0.15, max: 0.9, r0: s * 0.5, r1: s * 5, w: s * 0.3 });
      parts.push({ k: 'flash', x, y, life: -0.2, max: 0.9, r: s * 4 });
    }
    for (let i = 0; i < 14 * m; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.4, 1.6) * s * m;
      parts.push({ k: 'fire', x: x + rnd(-0.25, 0.25) * s, y: y + rnd(-0.25, 0.25) * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rnd(-0.05, 0), max: rnd(0.45, 0.9) * (o.king ? 1.5 : 1), r: rnd(0.35, 0.7) * s * (o.king ? 1.4 : 1) });
    }
    for (let i = 0; i < 60 * m; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(3, 13) * s;
      parts.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.3, 0.9), w: rnd(1.2, 3) });
    }
    for (let i = 0; i < 10 * m; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.2, 0.8) * s;
      parts.push({ k: 'smoke', x: x + rnd(-0.4, 0.4) * s, y: y + rnd(-0.4, 0.4) * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - s * 0.3,
        life: rnd(-0.15, 0), max: rnd(1.3, 2.4) * (o.king ? 1.5 : 1), r0: s * rnd(0.3, 0.5), r1: s * rnd(1, 1.7) * (o.king ? 1.6 : 1) });
    }
    for (let i = 0; i < 12 * m; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.5, 3) * s;
      parts.push({ k: 'ember', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(1, 2.2), r: rnd(1.5, 3) });
    }
    // Shatter every destroyed piece into a 3x3 grid of shards that fly out, spin and bounce.
    for (const v of o.victims) {
      if (!v.img || !v.img.complete) continue;
      let dx = v.x - x, dy = v.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 1) { const a = rnd(0, Math.PI * 2); dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
      for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
        const ox = (gx - 1) / 3 * s, oy = (gy - 1) / 3 * s;
        const c = Math.cos(v.rot || 0), sn = Math.sin(v.rot || 0);
        const px = v.x + ox * c - oy * sn, py = v.y + ox * sn + oy * c;
        const sp = rnd(2, 6.5) * s * (o.king ? 1.4 : 1);
        const a = Math.atan2(dy, dx) + rnd(-0.9, 0.9) + Math.atan2(oy, ox || 0.001) * 0.15;
        parts.push({ k: 'shard', img: v.img, sx: gx * 128 / 3, sy: gy * 128 / 3, x: px, y: py, s,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0, vz: rnd(3, 7) * s, g: s * 22,
          rot: v.rot || 0, vr: rnd(-14, 14), life: 0, max: rnd(1.1, 1.7) });
      }
    }
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const p of parts) {
      p.life += dt;
      if (p.life < 0) continue;
      if (p.vx !== undefined) {
        const drag = p.k === 'spark' ? 0.04 : p.k === 'shard' ? 1 : p.k === 'smoke' ? 0.4 : 0.15;
        if (p.k !== 'shard') { const f = Math.pow(drag, dt); p.vx *= f; p.vy *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (p.k === 'shard') {
        p.vz -= p.g * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.45; p.vy *= 0.45; p.vr *= 0.5; }
        if (p.z === 0) { const f = Math.pow(0.05, dt); p.vx *= f; p.vy *= f; }
      }
    }
    parts = parts.filter(p => p.life < p.max);
    draw();
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
  }

  function blit(img, x, y, r, a) {
    if (a <= 0 || r <= 0) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(img, x - r, y - r, r * 2, r * 2);
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    for (const p of parts) if (p.k === 'smoke' && p.life >= 0) {
      const k = p.life / p.max;
      blit(sprites.smoke, p.x, p.y, p.r0 + (p.r1 - p.r0) * Math.sqrt(k), (k < 0.15 ? k / 0.15 : 1 - k) * 0.55);
    }
    for (const p of parts) if (p.k === 'shard') {
      const k = p.life / p.max, a = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const sc = 1 + p.z / (p.s * 2.2), sz = p.s / 3;
      blit(sprites.shadow, p.x, p.y + p.z * 0.15, sz * 0.7, a * 0.6 / sc);
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y - p.z * 0.55);
      g.rotate(p.rot); g.scale(sc, sc);
      g.drawImage(p.img, p.sx, p.sy, 128 / 3, 128 / 3, -sz / 2, -sz / 2, sz, sz);
      g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.life < 0) continue;
      const k = p.life / p.max;
      if (p.k === 'fire') {
        const r = p.r * (0.6 + k * 0.9);
        blit(sprites.fire, p.x, p.y, r, 1 - k);
        blit(sprites.hot, p.x, p.y, r * 0.6, Math.pow(1 - k, 3));
      } else if (p.k === 'spark') {
        g.globalAlpha = 1 - k;
        g.strokeStyle = `rgb(255,${Math.round(230 - k * 140)},${Math.round(120 - k * 100)})`;
        g.lineWidth = p.w * (1 - k) + 0.5;
        g.beginPath(); g.moveTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); g.lineTo(p.x, p.y); g.stroke();
      } else if (p.k === 'ember') {
        blit(sprites.hot, p.x, p.y, p.r * 2.2, (1 - k) * (0.6 + 0.4 * Math.sin(p.life * 30)));
      } else if (p.k === 'flash') {
        blit(sprites.hot, p.x, p.y, p.r * (0.5 + k * 0.6), Math.pow(1 - k, 2));
      } else if (p.k === 'ring') {
        const e = 1 - Math.pow(1 - k, 3);
        g.globalAlpha = (1 - k) * 0.85;
        g.strokeStyle = 'rgb(255,215,150)';
        g.lineWidth = Math.max(0.5, p.w * (1 - k));
        g.beginPath(); g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, Math.PI * 2); g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  return { init, resize, explode };
})();
