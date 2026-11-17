// Sound: soundtrack via <audio>, engine / tyres / beeps synthesised with Web Audio.
export class Sound {
  constructor() {
    this.ctx = null; this.sfxOn = true; this.musicOn = true;
    this.music = new Audio('music.mp3'); this.music.loop = true; this.music.preload = 'auto'; this.music.volume = 0.55;
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.sfxOn ? 0.5 : 0; this.master.connect(c.destination);
      // engine: two detuned oscillators through a lowpass
      this.eGain = c.createGain(); this.eGain.gain.value = 0;
      this.eFilter = c.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 900;
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
      this.o2 = c.createOscillator(); this.o2.type = 'square';
      const g2 = c.createGain(); g2.gain.value = 0.4;
      this.o1.connect(this.eFilter); this.o2.connect(g2); g2.connect(this.eFilter);
      this.eFilter.connect(this.eGain); this.eGain.connect(this.master);
      this.o1.start(); this.o2.start();
      // noise for tyres and gravel
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const mk = (type, f, q) => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = c.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(this.master); src.start();
        return g;
      };
      this.screech = mk('bandpass', 1900, 6);
      this.rumble = mk('lowpass', 500, 0.7);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setSfx(on) { this.sfxOn = on; if (this.master) this.master.gain.value = on ? 0.5 : 0; }
  setMusic(on) { this.musicOn = on; if (!on) this.music.pause(); }
  playMusic() { if (this.musicOn) { const p = this.music.play(); p?.catch?.(() => {}); } }
  pauseMusic() { this.music.pause(); }
  engine(rpm01, load, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 42 + rpm01 * 175;
    this.o1.frequency.setTargetAtTime(f, t, 0.03); this.o2.frequency.setTargetAtTime(f * 0.501, t, 0.03);
    this.eFilter.frequency.setTargetAtTime(500 + rpm01 * 1400 + load * 600, t, 0.05);
    this.eGain.gain.setTargetAtTime(on ? 0.16 + load * 0.1 : 0, t, 0.05);
  }
  tyres(slip, gravel) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.screech.gain.setTargetAtTime(Math.min(0.22, slip * 0.2), t, 0.05);
    this.rumble.gain.setTargetAtTime(Math.min(0.35, gravel), t, 0.08);
  }
  beep(freq = 660, dur = 0.15, type = 'square', vol = 0.25) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  // short exhaust 'pop' + clutch click on each upshift
  shift() {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.35, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 0.14);
    this.beep(1800, 0.03, 'square', 0.05);
  }
  crash(power = 1) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(Math.min(0.6, 0.2 + power * 0.3), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 0.4);
  }
  silence() { if (this.ctx) { this.engine(0, 0, false); this.tyres(0, 0); } }
}
