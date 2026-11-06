// All sounds are synthesised with the Web Audio API: no audio files, works offline.
'use strict';

const Sound = (() => {
  let ctx = null, master = null, noise = null;
  let enabled = true;

  function unlock() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
        master = ctx.createGain(); master.gain.value = 0.85;
        master.connect(comp); comp.connect(ctx.destination);
        const len = ctx.sampleRate * 2;
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { return null; }
    return ctx;
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  function noiseHit({ t, dur, type = 'lowpass', f0, f1, q = 0.7, peak = 0.5, a = 0.003 }) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  }

  function tone({ t, type = 'sine', f0, f1, dur, peak = 0.3, a = 0.004 }) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + a + dur + 0.05);
  }

  const go = fn => { if (enabled && unlock()) fn(ctx.currentTime + 0.01); };

  function click(t, vol = 1) {
    noiseHit({ t, dur: 0.045, type: 'bandpass', f0: 2600, q: 1.3, peak: 0.45 * vol });
    tone({ t, type: 'triangle', f0: 380, f1: 160, dur: 0.07, peak: 0.3 * vol });
  }

  function blast(t, size, king) {
    const dur = king ? 2.6 : 0.75 + 0.12 * size;
    noiseHit({ t, dur, f0: king ? 3200 : 2400, f1: 50, peak: 1, a: 0.004 });
    tone({ t, f0: king ? 95 : 120, f1: 28, dur: dur * 0.75, peak: 1, a: 0.006 });
    tone({ t, type: 'square', f0: 70, f1: 24, dur: 0.35, peak: 0.18 });
    noiseHit({ t, dur: 0.14, type: 'highpass', f0: 2800, peak: 0.45, a: 0.001 });
    const bits = 4 + size * 3 + (king ? 14 : 0);
    for (let i = 0; i < bits; i++) {
      const tt = t + 0.25 + Math.random() * (king ? 1.6 : 0.8);
      noiseHit({ t: tt, dur: 0.03, type: 'bandpass', f0: 1800 + Math.random() * 4000, q: 4, peak: 0.12 + Math.random() * 0.12, a: 0.001 });
    }
  }

  return {
    unlock,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    select: () => go(t => tone({ t, f0: 1500, f1: 1100, dur: 0.03, peak: 0.06 })),
    move: () => go(t => click(t)),
    castle: () => go(t => { click(t); click(t + 0.12, 0.9); }),
    illegal: () => go(t => tone({ t, type: 'square', f0: 150, f1: 115, dur: 0.12, peak: 0.07 })),
    check: () => go(t => {
      tone({ t, type: 'triangle', f0: 880, dur: 0.11, peak: 0.22 });
      tone({ t: t + 0.13, type: 'triangle', f0: 1175, dur: 0.2, peak: 0.22 });
    }),
    promote: () => go(t => [523, 659, 784, 1047].forEach((f, i) =>
      tone({ t: t + i * 0.07, type: 'triangle', f0: f, dur: 0.2, peak: 0.16 }))),
    boom: (size, king) => go(t => {
      blast(t, size, king);
      if (king) {
        blast(t + 0.28, size, false);
        noiseHit({ t: t + 0.1, dur: 3.2, f0: 260, f1: 35, peak: 0.6, a: 0.2 });
      }
    }),
    win: () => go(t => [392, 494, 587, 784, 988].forEach((f, i) =>
      tone({ t: t + i * 0.09, type: 'triangle', f0: f, dur: 1.3 - i * 0.1, peak: 0.12, a: 0.02 }))),
    draw: () => go(t => {
      tone({ t, type: 'triangle', f0: 523, dur: 0.35, peak: 0.14 });
      tone({ t: t + 0.25, type: 'triangle', f0: 392, dur: 0.6, peak: 0.14 });
    }),
  };
})();
