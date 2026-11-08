'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All apps in the repo share one localStorage, so every key gets this app's prefix.
const APP = 'piano-chords';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

/* ---------- theory ---------- */
const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
// chord tone -> [letter steps above root, semitones above root]
const T = {
  '1': [0, 0], '2': [1, 2], 'b3': [2, 3], '3': [2, 4], '4': [3, 5], 'b5': [4, 6], '5': [4, 7], '#5': [4, 8],
  '6': [5, 9], 'bb7': [6, 9], 'b7': [6, 10], '7': [6, 11], 'b9': [8, 13], '9': [8, 14], '#9': [8, 15],
  '11': [10, 17], '#11': [10, 18], 'b13': [12, 20], '13': [12, 21],
};
const sym = s => s.replace(/b/g, '♭').replace(/#/g, '♯');
// Swap ♭/♯ characters for engraved Bravura glyphs, so every device draws them the same and well spaced.
const ACC_SVG = {
  '♭': `<svg class="ac fl" viewBox="0 -439 226 614" aria-hidden="true"><path transform="scale(1,-1)" d="${GLYPH.flat}"/></svg>`,
  '♯': `<svg class="ac sh" viewBox="0 -350 249 698" aria-hidden="true"><path transform="scale(1,-1)" d="${GLYPH.sharp}"/></svg>`,
};
const typo = s => String(s).replace(/[♭♯]/g, c => ACC_SVG[c]);
const accTxt = a => (a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));

// Modifier buttons. g = group (triad/sev/ext are exclusive within the group; add/alt combine freely).
const MODS = [
  { id: 'm', g: 'triad', row: 'common', name: 'minor', f: '1 ♭3 5', what: 'Lowers the 3rd by a half step.', key: '3rd sits 3 half steps above the root (major: 4).' },
  { id: 'dim', g: 'triad', row: 'common', name: 'diminished', f: '1 ♭3 ♭5', what: 'Minor 3rd and flat 5th. With 7 → m7♭5 (half-diminished).', key: 'Stack two minor 3rds: 3 + 3 half steps.' },
  { id: 'aug', g: 'triad', row: 'common', name: 'augmented', f: '1 3 ♯5', what: 'Raises the 5th by a half step.', key: 'Two major 3rds: 4 + 4. Symmetric, so only 4 different aug chords exist.' },
  { id: 'sus2', g: 'triad', row: 'common', sep: 1, name: 'suspended 2nd', f: '1 2 5', what: 'The 2nd replaces the 3rd: neither major nor minor.', key: '2nd = whole step above the root.' },
  { id: 'sus4', g: 'triad', row: 'common', name: 'suspended 4th', f: '1 4 5', what: 'The 4th replaces the 3rd; wants to resolve down to it.', key: '4th = whole step below the 5th.' },
  { id: '7', g: 'sev', row: 'common', sep: 1, name: 'dominant 7th', f: '1 3 5 ♭7', what: 'Adds the minor 7th. With m → m7.', key: '♭7 = whole step below the root, an octave up.' },
  { id: 'maj7', g: 'sev', row: 'common', name: 'major 7th', f: '1 3 5 7', what: 'Adds the major 7th. With m → m(maj7).', key: '7 = half step below the root, an octave up.' },

  { id: '5', g: 'triad', row: 'rare1', name: 'power chord', f: '1 5', what: 'Root and 5th only, no 3rd.', key: '5th = 7 half steps above the root.' },
  { id: '6', g: 'sev', row: 'rare1', name: 'sixth', f: '1 3 5 6', what: 'Adds the major 6th, no 7th. With 9 → 6/9.', key: '6 = whole step above the 5th. C6 has the notes of Am7.' },
  { id: 'dim7', label: '°7', g: 'sev', row: 'rare1', name: 'diminished 7th', f: '1 ♭3 ♭5 ♭♭7', what: 'Diminished triad plus a doubly-flat 7th (sounds like the 6th).', key: 'Stack minor 3rds 3 + 3 + 3. Only 3 different dim7 chords exist.' },
  { id: '9', g: 'ext', row: 'rare1', sep: 1, name: 'ninth', f: '1 3 5 ♭7 9', what: '7th chord plus the 9th. Uses ♭7 unless maj7 is set (→ maj9).', key: '9 = the 2nd an octave up: whole step above the root.' },
  { id: '11', g: 'ext', row: 'rare1', name: 'eleventh', f: '1 3 5 ♭7 9 11', what: '9th chord plus the 11th. Players often drop the 3rd, which clashes.', key: '11 = the 4th an octave up: half step above the 3rd.' },
  { id: '13', g: 'ext', row: 'rare1', name: 'thirteenth', f: '1 3 5 ♭7 9 13', what: '9th chord plus the 13th; the 11th is left out.', key: '13 = the 6th an octave up: whole step above the 5th.' },
  { id: 'add9', g: 'add', row: 'rare1', sep: 1, name: 'added 9th', f: '1 3 5 9', what: 'Adds the 9th without any 7th.', key: 'Whole step above the root, an octave up.' },
  { id: 'add11', g: 'add', row: 'rare1', name: 'added 11th', f: '1 3 5 11', what: 'Adds the 11th without any 7th.', key: 'The 4th, an octave up.' },

  { id: 'b5', g: 'alt', row: 'rare2', name: 'flat 5th', f: '♭5 for 5', what: 'Lowers the 5th by a half step.', key: 'Tritone: 6 half steps, exactly half an octave.' },
  { id: '#5', g: 'alt', row: 'rare2', name: 'sharp 5th', f: '♯5 for 5', what: 'Raises the 5th by a half step.', key: '8 half steps up, same key as the ♭6.' },
  { id: 'b9', g: 'alt', row: 'rare2', sep: 1, name: 'flat 9th', f: '♭9 for 9', what: 'Adds ♭9 (replaces 9). Classic on 7th chords heading to minor.', key: 'Half step above the root, an octave up.' },
  { id: '#9', g: 'alt', row: 'rare2', name: 'sharp 9th', f: '♯9 for 9', what: 'Adds ♯9 (replaces 9): major and minor 3rd together.', key: 'Same key as the ♭3, an octave up.' },
  { id: '#11', g: 'alt', row: 'rare2', name: 'sharp 11th', f: '♯11 for 11', what: 'Adds ♯11 (replaces 11): the Lydian colour.', key: 'Same key as the ♭5: a tritone above the root.' },
  { id: 'b13', g: 'alt', row: 'rare2', name: 'flat 13th', f: '♭13 for 13', what: 'Adds ♭13 (replaces 13).', key: 'Same key as the ♯5, an octave up.' },
];

const DEF = { root: 0, acc: 0, triad: null, sev: null, ext: null, add: [], alt: [], oct: 4, rare: matchMedia('(min-width: 900px)').matches };
const S = Object.assign({}, DEF, store.get('state', {}));

function isOn(m) {
  if (m.g === 'add') return S.add.includes(m.id);
  if (m.g === 'alt') return S.alt.includes(m.id);
  return S[m.g] === m.id;
}
function redundant(m) {
  return (m.id === 'b5' && S.triad === 'dim') || (m.id === '#5' && S.triad === 'aug') ||
    (m.id === 'add9' && S.ext) || (m.id === 'add11' && S.ext === '11');
}
function toggle(m) {
  if (m.g === 'add' || m.g === 'alt') {
    const a = S[m.g]; const i = a.indexOf(m.id);
    i < 0 ? a.push(m.id) : a.splice(i, 1);
  } else {
    S[m.g] = S[m.g] === m.id ? null : m.id;
    if (m.g === 'triad' && S.sev === 'dim7' && S.triad !== 'dim') S.sev = null;
    if (m.g === 'sev' && S.sev === 'dim7') S.triad = 'dim';
    if (m.g === 'sev' && S.sev === '6' && (S.ext === '11' || S.ext === '13')) S.ext = null;
    if (m.g === 'ext' && (S.ext === '11' || S.ext === '13') && S.sev === '6') S.sev = null;
  }
}

function tones() {
  const t = new Set(['1']); const { triad, sev, ext } = S; const alt = new Set(S.alt), add = new Set(S.add);
  if (triad === 'm' || triad === 'dim') t.add('b3');
  else if (triad === 'sus2') t.add('2');
  else if (triad === 'sus4') t.add('4');
  else if (triad !== '5') t.add('3');
  const fifth = triad === 'dim' ? 'b5' : triad === 'aug' ? '#5' : '5';
  const a5 = [];
  if (alt.has('b5') && triad !== 'dim') a5.push('b5');
  if (alt.has('#5') && triad !== 'aug') a5.push('#5');
  a5.forEach(x => t.add(x));
  if (!a5.length || fifth !== '5') t.add(fifth);
  if (sev === '7') t.add('b7'); else if (sev === 'maj7') t.add('7'); else if (sev === 'dim7') t.add('bb7'); else if (sev === '6') t.add('6');
  if (ext) { if (!sev) t.add('b7'); t.add('9'); if (ext === '11') t.add('11'); if (ext === '13') t.add('13'); }
  if (add.has('add9')) t.add('9');
  if (add.has('add11')) t.add('11');
  if (alt.has('b9') || alt.has('#9')) { t.delete('9'); if (alt.has('b9')) t.add('b9'); if (alt.has('#9')) t.add('#9'); }
  if (alt.has('#11')) { t.delete('11'); t.add('#11'); }
  if (alt.has('b13')) { t.delete('13'); t.add('b13'); }
  return t;
}

function chordName(t) {
  const has = x => t.has(x), tri = S.triad, minor = tri === 'm' || tri === 'dim';
  const sev = has('b7') ? '7' : has('7') ? 'maj' : has('bb7') ? 'dim7' : null;
  let n = null;
  if (sev === '7' || sev === 'maj') n = has('13') ? 13 : has('11') ? 11 : has('9') ? 9 : 7;
  const implied = new Set(n === 13 ? ['9', '13'] : n === 11 ? ['9', '11'] : n === 9 ? ['9'] : []);
  let q = '', post = '', triadNamed = false;
  if (sev === 'dim7') q = 'dim7';
  else if (n) q = (minor ? 'm' : '') + (sev === 'maj' ? (minor ? '(maj' + n + ')' : 'maj' + n) : n);
  else if (has('6')) { q = (minor ? 'm' : '') + '6'; if (has('9')) { q += '/9'; implied.add('9'); } }
  else { q = tri === 'm' ? 'm' : tri === 'dim' ? 'dim' : tri === 'aug' ? 'aug' : ''; triadNamed = true; }
  if (tri === 'sus2' || tri === 'sus4') post = tri;
  if (tri === '5') { if (t.size === 2) q = '5'; else post = 'no3'; }
  const alts = [];
  if (tri === 'dim' && !triadNamed && sev !== 'dim7') alts.push('b5');
  if (tri === 'aug' && !triadNamed) alts.push('#5');
  for (const x of ['b5', '#5', 'b9', '#9', '#11', 'b13']) {
    if (alts.includes(x)) continue;
    if (x === 'b5' || x === '#5') { if (S.alt.includes(x) && !((x === 'b5' && tri === 'dim') || (x === '#5' && tri === 'aug'))) alts.push(x); }
    else if (has(x)) alts.push(x);
  }
  const adds = ['9', '11', '13'].filter(x => has(x) && !implied.has(x)).map(x => 'add' + x);
  let s = q + post;
  if (alts.length) s += (sev || has('6')) ? alts.map(sym).join('') : '(' + alts.map(sym).join(',') + ')';
  if (adds.length) s += s ? '(' + adds.join(',') + ')' : adds[0] + (adds[1] ? '(' + adds.slice(1).join(',') + ')' : '');
  return s;
}

function build() {
  const t = tones();
  const rootStep = S.oct * 7 + S.root;
  const rootMidi = 12 * (S.oct + 1) + NAT[S.root] + S.acc;
  const notes = [...t].map(k => {
    const [d, s] = T[k], midi = rootMidi + s;
    let step = rootStep + d, acc = 0;
    const spell = () => acc = midi - (12 * (Math.floor(step / 7) + 1) + NAT[step % 7]);
    spell();
    if (acc > 2) { step++; spell(); } else if (acc < -2) { step--; spell(); }  // no triple sharps/flats
    const L = step % 7;
    return { k, step, midi, acc, name: LET[L] + accTxt(acc), root: k === '1' };
  }).sort((a, b) => a.midi - b.midi || a.step - b.step);
  return { notes, label: LET[S.root] + accTxt(S.acc), suffix: chordName(t) };
}

function invert(notes, k) {
  const a = notes.map(n => ({ ...n }));
  for (let i = 0; i < k; i++) {
    const n = a.shift(); a.push({ ...n, midi: n.midi + 12, step: n.step + 7 });
    a.sort((x, y) => x.midi - y.midi || x.step - y.step);
  }
  return a;
}

/* ---------- engraving (grand staff) ---------- */
const SP = 10, K = SP / 250, HW = 295 * K;
const ACCW = { '-2': 413 * K, '-1': 226 * K, '1': 249 * K, '2': 250 * K };
const ACCG = { '-2': 'dflat', '-1': 'flat', '1': 'sharp', '2': 'dsharp' };
const f1 = v => Math.round(v * 100) / 100;
const yOf = st => (st >= 28 ? (38 - st) * 5 : 100 + (26 - st) * 5);
const glyph = (n, x, y, cls = '', sx = 1, sy = 1) =>
  `<path${cls ? ` class="${cls}"` : ''} transform="translate(${f1(x)} ${f1(y)}) scale(${f1(K * sx * 1000) / 1000} ${f1(-K * sy * 1000) / 1000})" d="${GLYPH[n]}"/>`;

function measure(notes, treble) {
  if (!notes.length) return null;
  const mid = treble ? 34 : 22, steps = notes.map(n => n.step);
  const up = (mid - Math.min(...steps)) > (Math.max(...steps) - mid);
  const ord = [...notes].sort((a, b) => (up ? a.step - b.step : b.step - a.step));
  let prev = null, disp = false;
  for (const n of ord) {
    n.dx = 0;
    if (prev && Math.abs(n.step - prev.step) === 1 && !disp) { n.dx = up ? HW : -HW; disp = true; } else disp = false;
    prev = n;
  }
  const cols = [];
  for (const n of notes.filter(n => n.acc).sort((a, b) => b.step - a.step)) {
    let c = cols.find(c => c.items.every(o => Math.abs(o.step - n.step) >= 6));
    if (!c) { c = { items: [], w: 0 }; cols.push(c); }
    c.items.push(n); c.w = Math.max(c.w, ACCW[n.acc]);
  }
  const minDx = Math.min(0, ...notes.map(n => n.dx)), maxDx = Math.max(0, ...notes.map(n => n.dx));
  const left = cols.reduce((s, c) => s + c.w + 2, 0) - minDx + (cols.length ? 2 : 0);
  return { notes, treble, up, cols, minDx, maxDx, left };
}

function drawGroup(G, X, out, ext) {
  const { notes, treble, up, cols, minDx } = G;
  let ax = X + minDx - 2.5;
  for (const c of cols) {
    for (const n of c.items) {
      const y = yOf(n.step); out.push(glyph(ACCG[n.acc], ax - ACCW[n.acc], y));
      ext.min = Math.min(ext.min, y - 18); ext.max = Math.max(ext.max, y + 14);
    }
    ax -= c.w + 2;
  }
  for (const n of notes) {
    const y = yOf(n.step), x = X + n.dx, lines = [];
    if (treble) { for (let s = 40; s <= n.step; s += 2) lines.push(s); for (let s = 28; s >= n.step; s -= 2) lines.push(s); }
    else { for (let s = 16; s >= n.step; s -= 2) lines.push(s); }
    for (const s of lines) out.push(`<line class="ld" x1="${f1(x - 3.5)}" x2="${f1(x + HW + 3.5)}" y1="${yOf(s)}" y2="${yOf(s)}"/>`);
    out.push(glyph('head', x, y, n.root ? 'nh r' : 'nh'));
    ext.min = Math.min(ext.min, y - 6); ext.max = Math.max(ext.max, y + 6);
  }
  const ys = notes.map(n => yOf(n.step)), top = Math.min(...ys), bot = Math.max(...ys), midY = treble ? 20 : 120;
  let sx, y1, y2;
  if (up) { sx = X + HW - 0.6; y1 = bot - 1.6; y2 = Math.min(top - 35, midY); }
  else { sx = X + 0.6; y1 = top + 1.6; y2 = Math.max(bot + 35, midY); }
  out.push(`<line class="stem" x1="${f1(sx)}" x2="${f1(sx)}" y1="${f1(y1)}" y2="${f1(y2)}"/>`);
  ext.min = Math.min(ext.min, y2); ext.max = Math.max(ext.max, y2);
}

function engraveAll(chords) {
  const groups = chords.map(ns => [measure(ns.filter(n => n.step >= 28), true), measure(ns.filter(n => n.step < 28), false)].filter(Boolean));
  const all = groups.flat();
  const X = 48 + Math.max(4, ...all.map(g => g.left));
  const right = X + HW + Math.max(0, ...all.map(g => g.maxDx)) + 10;
  const ext = { min: -16, max: 146 };
  const bodies = groups.map(gs => { const out = []; gs.forEach(g => drawGroup(g, X, out, ext)); return out.join(''); });
  let frame = '';
  for (const y0 of [0, 100]) for (let i = 0; i < 5; i++) frame += `<line class="sl" x1="7" x2="${f1(right)}" y1="${y0 + i * 10}" y2="${y0 + i * 10}"/>`;
  frame += `<line class="sl" x1="7" x2="7" y1="0" y2="140"/><line class="sl" x1="${f1(right)}" x2="${f1(right)}" y1="0" y2="140"/>`;
  frame += glyph('brace', 0, 140, '', 1.5, 140 / (997 * K)) + glyph('gClef', 12, 30) + glyph('fClef', 12, 110);
  // symmetric around the middle of the grand staff, so the system centre is the svg centre
  const half = Math.ceil(Math.max(70 - ext.min, ext.max - 70) + 4);
  return { svgs: bodies.map(b => frame + b), vb: [-1, 70 - half, f1(right + 2), 2 * half] };
}

/* ---------- keyboard ---------- */
const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
const BOFF = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };

function kbRange(chords) {
  const ms = chords.flat().map(n => n.midi);
  let lo = Math.min(...ms), hi = Math.max(...ms);
  while (![0, 5].includes(((lo % 12) + 12) % 12)) lo--;
  while (![4, 11].includes(((hi % 12) + 12) % 12)) hi++;
  let whites = 0; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites++;
  return { lo, hi, whites };
}

const CAPW = { C: .68, D: .74, E: .63, F: .58, G: .74, A: .72, B: .66 };   // serif capital widths (em)
function keyLabel(name, cx, y, fs, bold) {
  const L = name[0], accs = [...name.slice(1)], sc = fs / 800;
  const lw = CAPW[L] * fs * (bold ? 1.06 : 1);
  const aw = accs.reduce((w, a) => w + (a === '♭' ? 226 : 249) * sc + fs * 0.03, 0);
  let x = cx - (lw + aw) / 2;
  let out = `<text class="kl" x="${f1(x + lw / 2)}" y="${f1(y)}" font-size="${fs}"${bold ? ' font-weight="bold"' : ''}>${L}</text>`;
  x += lw + fs * 0.04;
  for (const a of accs) {
    const flat = a === '♭', oy = flat ? y - 175 * sc : y + fs * 0.1 - 348 * sc;
    out += `<path class="kla" transform="translate(${f1(x)} ${f1(oy)}) scale(${f1(sc * 1e4) / 1e4} ${-f1(sc * 1e4) / 1e4})" d="${GLYPH[flat ? 'flat' : 'sharp']}"/>`;
    x += (flat ? 226 : 249) * sc + fs * 0.03;
  }
  return out;
}

function keyboard(notes, R, hU, labels) {
  const on = new Map(notes.map(n => [n.midi, n]));
  const W = 20, bw = 12.4, bh = hU * 0.62;
  let wk = '', bk = '', i = 0; const pos = {};
  for (let m = R.lo; m <= R.hi; m++) if (!isBlack(m)) pos[m] = i++;
  for (let m = R.lo; m <= R.hi; m++) {
    const n = on.get(m), cls = n ? (n.root ? ' r' : ' t') : '';
    if (!isBlack(m)) {
      const x = pos[m] * W;
      wk += `<rect class="w${cls}" x="${x}" y="0" width="${W}" height="${f1(hU)}" rx="1.5"/>`;
      if (labels && n) wk += keyLabel(n.name, x + W / 2, hU - 7, 9, n.root);
      else if (labels && m % 12 === 0) wk += `<text class="kc" x="${x + W / 2}" y="${f1(hU - 7)}" font-size="7">C${m / 12 - 1}</text>`;
    } else {
      const x = (pos[m - 1] + 1) * W - bw / 2 + BOFF[m % 12] * W;
      bk += `<rect class="b${cls}" x="${f1(x)}" y="0" width="${bw}" height="${f1(bh)}" rx="1"/>`;
      if (labels && n) bk += keyLabel(n.name, x + bw / 2, bh - 6, n.name.length > 2 ? 5.6 : 7, n.root);
    }
  }
  return wk + bk;
}

/* ---------- sound ---------- */
let ac = null, master = null, voices = [];
function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.7; master.connect(comp); comp.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
const PARTIALS = [1, 0.55, 0.3, 0.18, 0.1, 0.06, 0.035];
function pianoNote(midi, t, vel) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const out = ac.createGain(); out.gain.value = vel;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(16000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.5), t + 1.2);
  out.connect(lp); lp.connect(master);
  const sustain = Math.min(5, Math.max(0.7, 3.2 * Math.sqrt(261.6 / f)));
  const end = t + sustain * 2.2;
  PARTIALS.forEach((a, i) => {
    const h = i + 1, fr = f * h * Math.sqrt(1 + 0.0004 * h * h);
    if (fr > 18000) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = fr; o.detune.value = (i % 2 ? 1 : -1) * 1.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + 0.004);
    g.gain.setTargetAtTime(a * 0.4, t + 0.006, 0.09);
    g.gain.setTargetAtTime(0, t + 0.25, sustain / (0.6 + h * 0.5));
    o.connect(g); g.connect(out); o.start(t); o.stop(end);
  });
  voices.push({ out, end });
}
function stopSound() {
  if (!ac || !voices.length) return;
  const t = ac.currentTime;
  voices.forEach(v => { if (v.end > t) { v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.04); } });
  voices = [];
}
// tapping anywhere except a keyboard or staff silences the chord
document.addEventListener('pointerdown', e => { if (!e.target.closest('.block svg')) stopSound(); });

function playChord(notes) {
  audio();
  const t = ac.currentTime + 0.01;
  voices.forEach(v => { if (v.end > t) { v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.05); } });
  voices = [];
  const vel = 0.32 / Math.sqrt(notes.length);
  notes.forEach((n, i) => pianoNote(n.midi, t + i * 0.012, vel));
}

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
const blocks = [...document.querySelectorAll('.block')];
const tip = $('tip');
let current = null;

function mkBtn(label, cls) { const b = document.createElement('button'); b.innerHTML = typo(label); if (cls) b.className = cls; return b; }

// notes + accidentals
const noteBtns = [...LET].map((L, i) => {
  const b = mkBtn(L); b.onclick = () => { S.root = i; update(); }; $('notes').append(b); return b;
});
const accBtns = [[-1, '♭'], [1, '♯']].map(([a, s], i) => {
  const b = mkBtn(s, i === 0 ? 'sep' : ''); b.onclick = () => { S.acc = S.acc === a ? 0 : a; update(); }; $('notes').append(b); return b;
});

// modifiers
let hoverT = null;
MODS.forEach(m => {
  const b = mkBtn(m.label || sym(m.id), m.sep ? 'sep' : ''); m.el = b; $(m.row).append(b);
  let pressT = null, long = false;
  b.addEventListener('pointerdown', e => {
    long = false; if (e.pointerType === 'mouse') return;
    clearTimeout(pressT); pressT = setTimeout(() => { long = true; showTip(m); navigator.vibrate?.(10); }, 420);
  });
  ['pointerup', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressT)));
  b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { clearTimeout(hoverT); hoverT = setTimeout(() => showTip(m), 300); } });
  b.addEventListener('pointerleave', e => { clearTimeout(pressT); if (e.pointerType === 'mouse') { clearTimeout(hoverT); hideTip(); } });
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', () => { if (long) { long = false; return; } toggle(m); update(); });
});
const more = mkBtn('⋯', 'sep'); more.id = 'more'; more.title = 'More modifiers'; $('common').append(more);
more.onclick = () => { S.rare = !S.rare; update(); };

$('octDown').onclick = () => { S.oct = Math.max(2, S.oct - 1); update(); };
$('octUp').onclick = () => { S.oct = Math.min(6, S.oct + 1); update(); };

function showTip(m) {
  tip.innerHTML = typo(`<div class="h"><span><b>${m.label || sym(m.id)}</b> <i>${m.name}</i></span><span class="f">${m.f}</span></div><p>${m.what}</p><p class="k">${m.key}</p>`);
  tip.hidden = false;
  const r = m.el.getBoundingClientRect(), tw = tip.offsetWidth;
  tip.style.left = Math.max(10, Math.min(innerWidth - tw - 10, r.left + r.width / 2 - tw / 2)) + 'px';
  tip.style.top = (r.bottom + 8) + 'px';
}
function hideTip() { tip.hidden = true; }
document.addEventListener('pointerdown', e => { if (!tip.hidden && e.pointerType !== 'mouse') hideTip(); }, true);

// tapping a staff or keyboard plays that inversion
blocks.forEach((bl, i) => {
  bl.querySelectorAll('svg').forEach(svg => svg.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!current) return;
    playChord(current.inv[i]);
    bl.querySelectorAll('svg').forEach(s => { s.classList.remove('on'); void s.getBoundingClientRect(); s.classList.add('on'); });
    clearTimeout(bl._t); bl._t = setTimeout(() => bl.querySelectorAll('svg').forEach(s => s.classList.remove('on')), 380);
  }));
});

function update() {
  store.set('state', S);
  noteBtns.forEach((b, i) => b.classList.toggle('on', S.root === i));
  accBtns[0].classList.toggle('on', S.acc === -1); accBtns[1].classList.toggle('on', S.acc === 1);
  MODS.forEach(m => { m.el.classList.toggle('on', isOn(m)); m.el.classList.toggle('dim', !!redundant(m)); });
  $('rare').hidden = !S.rare;
  more.classList.toggle('open', S.rare);
  more.classList.toggle('has', !S.rare && MODS.some(m => m.row !== 'common' && isOn(m)));
  $('octDown').disabled = S.oct <= 2; $('octUp').disabled = S.oct >= 6;

  const c = build();
  c.inv = [c.notes, invert(c.notes, 1), invert(c.notes, 2)];
  current = c;
  $('name').innerHTML = typo(c.label) + (c.suffix ? `<small>${typo(c.suffix)}</small>` : '');
  $('formula').innerHTML = typo(c.notes.map(n => sym(n.k)).join('&ensp;') + '&emsp;·&emsp;<b>' + c.notes.map(n => n.name).join('&ensp;') + '</b>');
  draw();
}

function draw() {
  if (!current) return;
  const eng = engraveAll(current.inv), R = kbRange(current.inv);
  const W = blocks[0].clientWidth, H = blocks[0].clientHeight - 26;  // 13px each side: room for the inversion label
  if (W < 10 || H < 10) return;
  const [vx, vy, vw, vh] = eng.vb;
  let sh = H, sw = sh * vw / vh;
  if (sw > W * 0.34) { sw = W * 0.34; sh = sw * vh / vw; }
  const aw = W - sw - 8;
  let wpx = aw / R.whites, kh = Math.min(H, wpx * 6.2);
  if (H < wpx * 4) { wpx = H / 4; kh = H; }
  const hU = 20 * kh / wpx, labels = wpx >= 19;
  blocks.forEach((bl, i) => {
    const [st, kb] = bl.querySelectorAll('svg');
    st.setAttribute('viewBox', eng.vb.join(' ')); st.setAttribute('width', f1(sw)); st.setAttribute('height', f1(sh));
    st.innerHTML = eng.svgs[i];
    kb.setAttribute('viewBox', `-0.5 -0.5 ${R.whites * 20 + 1} ${f1(hU + 1)}`); kb.setAttribute('width', f1(wpx * R.whites)); kb.setAttribute('height', f1(kh));
    kb.innerHTML = keyboard(current.inv[i], R, hU, labels);
  });
}

new ResizeObserver(() => draw()).observe($('blocks'));
update();
