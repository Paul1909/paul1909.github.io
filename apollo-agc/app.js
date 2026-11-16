// Apollo AGC — app shell: DSKY, live view of the running software, lessons, code reader, tour.
'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

const APP = 'apollo-agc';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const oct = (n, w = 5) => (n >>> 0).toString(8).padStart(w, '0');
const PER_SEC = 85333;          // memory cycles per second
const IDLE = new Set(['ADVAN', 'DUMMYJOB', 'SUPDXCHZ', 'POSTJUMP', 'BANKJUMP', 'Q+10000', 'PRIO12', 'SMODECHK', 'CHECKNJ', 'SELFCHK', 'NUDIRECT']);

// ---------------------------------------------------------------------------
// Program data (rope, address map, source) — loaded once per program.
const progs = {};
async function loadProg(id) {
  if (progs[id]) return progs[id];
  const [rb, mb, j] = await Promise.all([
    fetch(`data/${id}.rope`).then(r => r.arrayBuffer()),
    fetch(`data/${id}.map`).then(r => r.arrayBuffer()),
    fetch(`data/${id}.json`).then(r => r.json()),
  ]);
  const P = { id, info: PROGRAMS[id], rope: new Uint16Array(rb), map: new Uint32Array(mb), files: j.files, symbols: j.symbols, erasable: j.erasable };
  P.lines = P.files.map(f => f.text.split('\n'));
  P.fileIdx = Object.fromEntries(P.files.map((f, i) => [f.name, i]));
  // routine label for every line (nearest label above it in the same file)
  P.lineLabel = P.lines.map(ls => {
    const out = new Array(ls.length + 2).fill(''); let cur = '';
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (/^[^\s#$]/.test(l)) { const t = l.split(/\s+/)[0]; if (t && !/^[+-]?\d/.test(t) && !/^(SETLOC|BANK|BLOCK|EBANK=|SBANK=|COUNT\*?)$/.test(t)) cur = t; }
      out[i + 1] = cur;
    }
    return out;
  });
  // routine id for every rope address (for the "running now" view)
  P.routineNames = []; P.routineAt = []; const rkey = new Map();
  P.routineOf = new Int32Array(P.map.length).fill(-1);
  for (let a = 0; a < P.map.length; a++) {
    const v = P.map[a]; if (!v) continue;
    const f = v >>> 16, l = v & 0xffff, nm = P.lineLabel[f][l] || P.files[f].name;
    const key = f + ':' + nm;
    let id2 = rkey.get(key);
    if (id2 === undefined) { id2 = P.routineNames.length; rkey.set(key, id2); P.routineNames.push(nm); P.routineAt.push(a); }
    P.routineOf[a] = id2;
  }
  P.rev = {};
  for (const [k, v] of Object.entries(P.symbols)) if (!(v in P.rev)) P.rev[v] = k;
  for (const k of HOOKS) if (P.symbols[k] !== undefined) P.rev[P.symbols[k]] = k;
  // verb / noun / alarm / checklist tables, parsed from the program's own documentation
  const aoi = P.lines[P.fileIdx['ASSEMBLY_AND_OPERATION_INFORMATION.agc']] || [];
  const table = (start, end, re, cols = 1, cont = false) => {
    const out = {}; let on = false, lastKey = null;
    for (const l of aoi) {
      if (!on && l.includes(start)) { on = true; continue; }
      if (on && end && l.includes(end)) break;
      if (!on) continue;
      const m = l.match(re);
      if (m) {
        lastKey = null;
        if (!(m[1] in out)) { out[m[1]] = m[2].split(/\t+|\s{3,}/).slice(0, cols).map(x => x.trim()).filter(Boolean).join(': ').replace(/\s+\*$/, ''); lastKey = m[1]; }
      } else if (cont && lastKey && /^#\t\t+\S/.test(l)) {
        out[lastKey] += ' ' + l.replace(/^#\s+/, '').split(/\t+|\s{3,}/)[0].trim();
        lastKey = null;
      } else lastKey = null;
    }
    return out;
  };
  P.verbs = table('VERB LIST FOR', 'IN THE FOLLOWING NOUN LIST', /^#\s*(\d\d)\s+(\S.*)$/);
  P.nouns = table('IN THE FOLLOWING NOUN LIST', 'REGISTERS AND SCALING', /^#\s*(\d\d)\s+(\S.*)$/);
  P.alarms = table('ALARM CODES FOR', 'CHECKLIST CODES FOR', /^#\s*(\d{5})\s+\*?\s*(\S.*)$/, 1, true);
  P.checklist = table('CHECKLIST CODES FOR', 'OPTION CODES FOR', /^#\s*(\d{5})\s+(\S.*)$/, 2);
  progs[id] = P;
  return P;
}
function lineOf(P, rope) { const v = P.map[rope]; return v ? { f: v >>> 16, l: v & 0xffff } : null; }
function bankAddr(rope) { const b = Math.floor(rope / 1024), o = rope % 1024; return b === 2 || b === 3 ? oct((b === 2 ? 0o4000 : 0o6000) + o, 4) : `${oct(b, 2)},${oct(0o2000 + o, 4)}`; }
function findLine(P, fi, label, find) {
  const ls = P.lines[fi]; if (!ls) return 1;
  if (label) { const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s'); for (let i = 0; i < ls.length; i++) if (re.test(ls[i])) return i + 1; }
  if (find) { for (let i = 0; i < ls.length; i++) if (ls[i].includes(find)) return i + 1; }
  return 1;
}

// ---------------------------------------------------------------------------
// Emulator state
let P = null, agc = null;
let craft = store.get('craft', 'luminary099');
let speed = 1, running = true;
const ev = [];                      // event log
let evSeq = 0;
const pendingStart = new Map();     // rope addr -> name, for "job/task starts" events
let ruptCount = new Uint32Array(11), ruptRate = new Float32Array(11);
let busy = 0, total = 0, load = 0, stolen0 = 0;
let lastHits = null, lastDelta = new Uint32Array(40 * 1024), hot = [];
let lessonSeen = {};

function agcSeconds() { return agc ? agc.cycles / PER_SEC : 0; }
function fmtT(s) { const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; }

function addEvent(e) {
  e.t = agcSeconds(); e.seq = ++evSeq;
  const last = ev[ev.length - 1];
  if (last && last.text === e.text && last.kind === e.kind) { last.n = (last.n || 1) + 1; last.t = e.t; last.seq = e.seq; return; }
  ev.push(e); if (ev.length > 200) ev.shift();
  logDirty = true;
}

function read2CADR(q) {
  const w1 = agc.peek(q), w2 = agc.peek(q + 1);
  if (w1 >= 0o4000) return (w1 < 0o6000 ? 2 : 3) * 1024 + (w1 & 0o1777);
  if (w1 >= 0o2000) { let fb = (w2 >> 10) & 0o37; if (fb >= 0o30 && (w2 & 0o100)) fb += 0o10; return fb * 1024 + (w1 & 0o1777); }
  return -1;
}
function nameAt(r) { if (r < 0) return '?'; if (P.rev[r]) return P.rev[r]; const id = P.routineOf[r]; return id >= 0 ? P.routineNames[id] : bankAddr(r); }

function onHook(r) {
  const h = agc.hooks[r];
  if (h & 2) {
    const nm = pendingStart.get(r);
    if (nm) { addEvent({ kind: nm.kind, text: `▶ ${nm.name} runs`, rope: r }); pendingStart.delete(r); if (!(h & 1)) agc.hooks[r] = 0; else agc.hooks[r] = 1; }
  }
  if (!(h & 1)) return;
  const name = P.rev[r], q = agc.m[2] & 0o7777, a = agc.m[0];
  if (name === 'NOVAC' || name === 'FINDVAC') {
    const t = read2CADR(q), prio = ((a & 0o77777) >> 9).toString(8);
    addEvent({ kind: 'job', text: `Job queued: ${nameAt(t)} (priority ${prio})`, rope: t });
    if (t >= 0 && !pendingStart.has(t)) { pendingStart.set(t, { name: nameAt(t), kind: 'job' }); agc.hooks[t] |= 2; }
  } else if (name === 'WAITLIST' || name === 'LONGCALL') {
    const t = read2CADR(q);
    const dt = name === 'WAITLIST' ? `in ${((a & 0o77777) / 100).toFixed(2)} s` : 'later';
    addEvent({ kind: 'task', text: `Task scheduled ${dt}: ${nameAt(t)}`, rope: t });
    if (t >= 0 && !pendingStart.has(t)) { pendingStart.set(t, { name: nameAt(t), kind: 'task' }); agc.hooks[t] |= 2; }
  } else if (name === 'ALARM' || name === 'BAILOUT' || name === 'BAILOUT1' || name === 'POODOO' || name === 'POODOO1') {
    const code = oct(agc.peek(q), 5);
    const what = P.alarms[code] ? ': ' + P.alarms[code] : '';
    addEvent({ kind: 'alarm', alarm: code.replace(/^0/, ''), text: `${name === 'ALARM' ? 'Program alarm' : name.replace(/1$/, '') + ' (software restart)'} ${code}${what}`, rope: r });
    if (code.endsWith('1202') || code.endsWith('1201')) toast(`${code.slice(1)} alarm! Executive overflow`);
  } else if (name === 'SLAP1') {
    addEvent({ kind: 'rst', name: 'SLAP1', text: 'Fresh start (SLAP1): all jobs and tasks dropped', rope: r });
  } else if (name === 'GOPROG') {
    addEvent({ kind: 'rst', name: 'GOPROG', text: `Hardware restart → GOPROG${agc.lastAlarm ? ' (' + agc.lastAlarm + ' alarm)' : ''}`, rope: r });
    agc.lastAlarm = '';
  }
}

async function boot(id) {
  $('#loading').style.display = 'flex';
  $('#loadmsg').textContent = `Weaving the core rope for ${PROGRAMS[id].name}…`;
  try { P = await loadProg(id); } catch (e) { $('#loadmsg').textContent = 'Could not load program data. Open the app once while online.'; return; }
  craft = id; store.set('craft', id);
  agc = new AGC(P.rope);
  for (const k of HOOKS) if (P.symbols[k] !== undefined) agc.hooks[P.symbols[k]] = 1;
  agc.onHook = onHook;
  agc.onRupt = i => { ruptCount[i]++; };
  agc.steal = 0;
  ev.length = 0; pendingStart.clear(); lastHits = new Uint32Array(agc.hits.length); hot = [];
  addEvent({ kind: 'rst', text: `Power on: ${P.info.name} (${P.info.craft} ${P.info.crew})`, rope: 2 * 1024 });
  buildDsky();
  $('#craftBtn').textContent = P.info.short;
  $('#subtitle').textContent = P.info.name;
  buildLive();
  buildFileSel();
  if (codeState.prog === null) openCode(craft, P.fileIdx['MAIN.agc'] || 0, 1, false);
  $('#loading').style.display = 'none';
}

// ---------------------------------------------------------------------------
// DSKY
const SEG = (() => {
  const H = (x1, x2, y) => `${x1},${y} ${x1 + 1},${y - 1} ${x2 - 1},${y - 1} ${x2},${y} ${x2 - 1},${y + 1} ${x1 + 1},${y + 1}`;
  const V = (x, y1, y2) => `${x},${y1} ${x + 1},${y1 + 1} ${x + 1},${y2 - 1} ${x},${y2} ${x - 1},${y2 - 1} ${x - 1},${y1 + 1}`;
  return { a: H(2.4, 9.6, 1.4), b: V(10.6, 2.2, 9.6), c: V(10.6, 10.4, 17.8), d: H(2.4, 9.6, 18.6), e: V(1.4, 10.4, 17.8), f: V(1.4, 2.2, 9.6), g: H(2.4, 9.6, 10) };
})();
const DIGSEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcfgd', ' ': '' };
function digitSvg() { return `<svg class="dg" viewBox="0 0 12 20">${'abcdefg'.split('').map(s => `<polygon class="seg" data-s="${s}" points="${SEG[s]}"/>`).join('')}</svg>`; }
function signSvg() { return `<svg class="dg" viewBox="0 0 12 20"><polygon class="seg" data-s="h" points="${'1.5,10 2.5,9 9.5,9 10.5,10 9.5,11 2.5,11'}"/><polygon class="seg" data-s="v" points="${'6,5 7,6 7,14 6,15 5,14 5,6'}"/></svg>`; }
let dskyEls = null, dskyLast = {};
const LAMPS = {
  LM: [['uplink', 'UPLINK ACTY', 0], ['temp', 'TEMP', 1], ['noAtt', 'NO ATT', 0], ['gimbal', 'GIMBAL LOCK', 1], ['stby', 'STBY', 0], ['prog', 'PROG', 1], ['keyRel', 'KEY REL', 0], ['restart', 'RESTART', 1], ['oprErr', 'OPR ERR', 0], ['tracker', 'TRACKER', 1], ['prio', 'PRIO DISP', 0], ['alt', 'ALT', 1], ['noDap', 'NO DAP', 0], ['vel', 'VEL', 1]],
  CM: [['uplink', 'UPLINK ACTY', 0], ['temp', 'TEMP', 1], ['noAtt', 'NO ATT', 0], ['gimbal', 'GIMBAL LOCK', 1], ['stby', 'STBY', 0], ['prog', 'PROG', 1], ['keyRel', 'KEY REL', 0], ['restart', 'RESTART', 1], ['oprErr', 'OPR ERR', 0], ['tracker', 'TRACKER', 1], [null, '', 0], [null, '', 1], [null, '', 0], [null, '', 1]],
};
const KEYLAYOUT = [
  ['VERB', 1, '2/4'], ['NOUN', 1, '4/6'], ['+', 2, '1/3'], ['-', 2, '3/5'], ['0', 2, '5/7'],
  ['7', 3, '1/3'], ['4', 3, '3/5'], ['1', 3, '5/7'], ['8', 4, '1/3'], ['5', 4, '3/5'], ['2', 4, '5/7'],
  ['9', 5, '1/3'], ['6', 5, '3/5'], ['3', 5, '5/7'], ['CLR', 6, '1/3'], ['PRO', 6, '3/5'], ['KEYREL', 6, '5/7'],
  ['ENTR', 7, '2/4'], ['RSET', 7, '4/6'],
];
function buildDsky() {
  const lamps = LAMPS[P.info.craft].map(([k, t, amber]) => `<div class="lamp${amber ? ' amber' : ''}${k ? '' : ' blank'}" data-l="${k || ''}">${t}</div>`).join('');
  const reg = n => `<div class="reg" data-r="${n}">${signSvg()}${digitSvg().repeat(5)}</div>`;
  const keys = KEYLAYOUT.map(([k, c, r]) => `<button class="key" data-k="${k}" style="grid-column:${c};grid-row:${r}" aria-label="${k}">${k === 'KEYREL' ? '<small>KEY<br>REL</small>' : k === 'ENTR' || k === 'RSET' || k === 'VERB' || k === 'NOUN' || k === 'CLR' || k === 'PRO' ? `<small>${k}</small>` : k}</button>`).join('');
  $('#dsky').innerHTML = `<div class="dsky-top"><div class="lamps" id="lampsPanel">${lamps}</div>
    <div class="el" id="elPanel">
      <div class="compacty" id="compActy">COMP<br>ACTY</div>
      <div class="elcell"><span class="ellabel on">PROG</span><div class="digits" data-d="prog">${digitSvg().repeat(2)}</div></div>
      <div class="elcell"><span class="ellabel on" data-lab="verb">VERB</span><div class="digits" data-d="verb">${digitSvg().repeat(2)}</div></div>
      <div class="elcell"><span class="ellabel on" data-lab="noun">NOUN</span><div class="digits" data-d="noun">${digitSvg().repeat(2)}</div></div>
      <div class="bar"></div>${reg('r1')}<div class="bar"></div>${reg('r2')}<div class="bar"></div>${reg('r3')}
    </div></div><div class="keys" id="keysPanel">${keys}</div>`;
  dskyEls = {
    lamps: [...document.querySelectorAll('#lampsPanel .lamp')], compActy: $('#compActy'), el: $('#elPanel'),
    d: {}, r: {}, lab: { verb: document.querySelector('[data-lab=verb]'), noun: document.querySelector('[data-lab=noun]') },
  };
  for (const k of ['prog', 'verb', 'noun']) dskyEls.d[k] = [...document.querySelectorAll(`[data-d=${k}] svg`)];
  for (const k of ['r1', 'r2', 'r3']) dskyEls.r[k] = [...document.querySelectorAll(`[data-r=${k}] svg`)];
  dskyLast = {};
  for (const b of document.querySelectorAll('#keysPanel .key')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); pressKey(k, true); try { b.setPointerCapture(e.pointerId); } catch {} });
    const up = () => { b.classList.remove('down'); if (k === 'PRO') pressKey(k, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  updateKeyHints();
}
function setDigit(svg, ch) {
  const on = DIGSEG[ch] || '';
  for (const p of svg.children) p.classList.toggle('on', on.includes(p.dataset.s));
}
function setSign(svg, ch) { svg.children[0].classList.toggle('on', ch === '+' || ch === '-'); svg.children[1].classList.toggle('on', ch === '+'); }
function renderDsky() {
  if (!agc || !dskyEls) return;
  const s = agc.dskyState();
  const key = JSON.stringify(s);
  if (key === dskyLast.key) return s;
  dskyLast.key = key;
  for (const el of dskyEls.lamps) { const l = el.dataset.l; if (l) el.classList.toggle('on', !!s.lamps[l]); }
  dskyEls.compActy.classList.toggle('on', s.lamps.compActy);
  dskyEls.el.classList.toggle('off', s.elOff || s.lamps.stby && !(agc.ch[0o13] & 0o1000));
  const vn = s.vnBlank;
  for (const k of ['prog', 'verb', 'noun']) {
    const str = s[k];
    dskyEls.d[k].forEach((svg, i) => setDigit(svg, k !== 'prog' && vn ? ' ' : str[i]));
  }
  dskyEls.lab.verb.classList.toggle('on', true); dskyEls.lab.noun.classList.toggle('on', true);
  for (const k of ['r1', 'r2', 'r3']) { const str = s[k]; dskyEls.r[k].forEach((svg, i) => i === 0 ? setSign(svg, str[0]) : setDigit(svg, str[i])); }
  return s;
}

let haptics = store.get('haptics', true);
function pressKey(k, down) {
  if (!agc) return;
  if (k === 'PRO') { agc.pro(down); if (down) { haptics && navigator.vibrate?.(12); addEvent({ kind: 'key', text: 'PRO pressed (polled by T4RUPT, ch 32 bit 14)', rope: P.symbols.PROCEEDE ?? -1 }); } else addEvent({ kind: 'key', text: 'PRO released', rope: -1 }); lessonKey(k); return; }
  if (!down) return;
  haptics && navigator.vibrate?.(12);
  agc.key(AGC.KEYS[k]);
  addEvent({ kind: 'key', text: `Key ${k === 'KEYREL' ? 'KEY REL' : k} → KEYRUPT1 (code ${oct(AGC.KEYS[k], 2)})`, rope: P.symbols.KEYRUPT1 ?? -1 });
  lessonKey(k);
}
const KBD = { v: 'VERB', n: 'NOUN', '+': '+', '=': '+', '-': '-', c: 'CLR', Enter: 'ENTR', e: 'ENTR', r: 'RSET', k: 'KEYREL', Escape: 'RSET' };
window.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea') || !$('#tab-fly').classList.contains('active')) return;
  if (e.repeat) return;
  let k = /^\d$/.test(e.key) ? e.key : KBD[e.key];
  if (e.key === 'p') k = 'PRO';
  if (k) { e.preventDefault(); pressKey(k, true); }
});
window.addEventListener('resize', () => updateSheet());
window.addEventListener('keyup', e => { if (e.key === 'p' && agc) pressKey('PRO', false); });

// ---------------------------------------------------------------------------
// Live "inside the AGC" panel
function buildLive() {
  $('#live').innerHTML = `
  <div class="card" id="nowCard"><h3>Now <span class="r small" id="clock"></span></h3>
    <div class="vn" id="vn"></div>
    <div class="row" style="margin-top:8px">
      <div class="seg-ctl" id="speedCtl"><button data-s="0">❚❚</button><button data-s="1">1×</button><button data-s="10">10×</button></div>
      <span style="flex:1"></span>
      <button class="btn" id="powerBtn">⏻ Power cycle</button>
    </div>
  </div>
  <div class="card"><h3>CPU load <span class="r small" id="loadTxt"></span></h3>
    <div class="loadbar"><i id="loadBar"></i></div>
    <div class="small" id="loadNote"></div>
    <div class="row small" style="margin-top:8px;gap:6px">Core sets <span id="cores" style="font-family:var(--mono);letter-spacing:2px"></span></div>
    <div class="small" style="margin-top:8px">Cycle stealing (radar CDU pulses): <b id="stealTxt">0%</b></div>
    <input type="range" id="steal" min="0" max="90" step="5" value="0" aria-label="Cycle stealing">
  </div>
  <div class="card"><h3>Running now <span class="r small">last second · tap for code</span></h3><div class="hot" id="hot"></div></div>
  <div class="card"><h3>Event log <span class="r small">tap for code</span></h3><div class="log" id="log"></div></div>
  <div class="card"><h3>Interrupts per second</h3><div class="rupts" id="rupts"></div></div>
  <div class="card"><h3>Registers <span class="r small">octal</span></h3><div class="regs" id="regs"></div>
    <div class="small" style="margin-top:8px">The AGC used ones'-complement 15-bit words. Z is the program counter, BB the bank selection.</div></div>
  <div class="card small">Running the real ${esc(P.info.name)} binary, assembled from the Apollo&nbsp;11 source and checked bit for bit against the original rope dump. There is no simulated spacecraft around it (IMU, radar, engines), so mission programs like the landing can't fly here.
    <div class="row" style="margin-top:8px"><label><input type="checkbox" id="hapt" ${haptics ? 'checked' : ''}> Vibrate on key press</label></div></div>`;
  document.querySelectorAll('#speedCtl button').forEach(b => b.onclick = () => { const s = +b.dataset.s; running = s > 0; if (s) speed = s; updateSpeed(); });
  updateSpeed();
  $('#powerBtn').onclick = () => { boot(craft); toast('Power cycled: fresh rope, empty memory'); };
  $('#steal').oninput = e => { agc.steal = +e.target.value / 100; $('#stealTxt').textContent = e.target.value + '%'; };
  $('#hapt').onchange = e => { haptics = e.target.checked; store.set('haptics', haptics); };
  $('#hot').onclick = e => { const b = e.target.closest('[data-rope]'); if (b) gotoRope(+b.dataset.rope); };
  $('#log').onclick = e => { const b = e.target.closest('[data-rope]'); if (b && +b.dataset.rope >= 0) gotoRope(+b.dataset.rope); };
  logDirty = true;
}
function updateSpeed() { document.querySelectorAll('#speedCtl button').forEach(b => b.classList.toggle('on', running ? +b.dataset.s === speed : b.dataset.s === '0')); }
function setSteal(v) { if (!agc) return; agc.steal = v; const el = $('#steal'); if (el) { el.value = Math.round(v * 100); $('#stealTxt').textContent = Math.round(v * 100) + '%'; } }

let logDirty = true;
function coresInUse() {
  let n = 0; const E = P.erasable;
  if (E.PRIORITY !== undefined) for (let k = 0; k < 8; k++) if (agc.m[E.PRIORITY + 12 * k] !== 0o77777) n++;
  return n;
}
function coresHtml() {
  const n = coresInUse();
  return Array.from({ length: 8 }, (_, i) => `<span style="color:${i < n ? (n >= 7 ? 'var(--red)' : 'var(--green)') : '#3a4552'}">■</span>`).join('') + ` <span class="small">${n}/8 in use</span>`;
}
function renderLive(s) {
  if (!agc || !s) return;
  const t2 = agc.m[0o24], t1 = agc.m[0o25];
  const cs = t2 * 16384 + t1, h = Math.floor(cs / 360000), mi = Math.floor(cs / 6000) % 60, se = (cs % 6000) / 100;
  $('#clock').textContent = `AGC clock ${h}:${String(mi).padStart(2, '0')}:${se.toFixed(2).padStart(5, '0')}`;
  const pg = s.prog.trim(), vb = s.verb.trim(), nn = s.noun.trim();
  let vnHtml = `<div><b>P${pg || '--'}</b> ${pg === '88' ? 'lamp test' : pg ? esc(P.info.progs[pg] || 'program ' + pg) : 'no program selected'}</div>`;
  if (vb) vnHtml += `<div><b>V${vb}</b> ${esc((P.verbs[vb] || '').toLowerCase()) || '—'}</div>`;
  if (nn) vnHtml += `<div><b>N${nn}</b> ${esc((P.nouns[nn] || '').toLowerCase()) || '—'}</div>`;
  if (vb === '05' && nn === '09') { for (const r of ['r1', 'r2', 'r3']) { const c = s[r].trim(); if (c && P.alarms[c] && c !== '00000') vnHtml += `<div><b>${c}</b> ${esc(P.alarms[c].toLowerCase())}</div>`; } }
  if (vb === '50' && nn === '25') { const c = s.r1.trim(); if (P.checklist[c]) vnHtml += `<div><b>${c}</b> ${esc(P.checklist[c].toLowerCase())}</div>`; }
  if (agc.ch[0o11] & 0o40) vnHtml += `<div class="small">Flashing verb/noun: the computer is waiting for you.</div>`;
  $('#vn').innerHTML = vnHtml;
  const pct = Math.round(load * 100);
  $('#loadTxt').textContent = pct + '% busy';
  $('#loadBar').style.width = pct + '%';
  $('#loadNote').textContent = agc.standby ? 'Standby: the CPU is stopped, only timers run.' :
    agc.steal > 0 ? `${Math.round(agc.steal * 100)}% of memory cycles stolen by counter pulses; the rest goes to the program.` :
    pct < 30 ? 'Mostly idle: the Executive has no jobs, so it runs self-check in the idle loop.' : 'Busy with jobs and interrupts.';
  $('#cores').innerHTML = coresHtml();
  $('#hot').innerHTML = hot.slice(0, 6).map(h => {
    const note = ROUTINE_NOTES[h.name] || '';
    const L = lineOf(P, h.rope), file = L ? P.files[L.f].name.replace(/\.agc$/, '') : '';
    return `<button class="hotrow" data-rope="${h.rope}"><span class="nm">${esc(h.name)}${IDLE.has(h.name) ? ' <span class="small">(idle)</span>' : ''}</span><span class="pc">${(h.frac * 100).toFixed(1)}%</span>
      <span class="ds">${esc(note || file)}${note ? ' · ' + esc(file) : ''}</span><span class="hb"><i style="width:${Math.min(100, h.frac * 100)}%"></i></span></button>`;
  }).join('') || '<div class="small">Paused.</div>';
  $('#rupts').innerHTML = [3, 4, 5, 8, 2, 1].map(i => `<div class="rupt"><b>${ruptRate[i].toFixed(0)}</b>${RUPTS[i]}<br><span class="small">${RUPT_NOTES[RUPTS[i]]}</span></div>`).join('');
  const m = agc.m;
  $('#regs').innerHTML = [['A', m[0], 6], ['L', m[1], 6], ['Q', m[2], 6], ['Z', m[5], 4], ['BB', m[6], 5], ['TIME1', m[0o25], 5]].map(([k, v, w]) => `<span><i>${k}</i> ${oct(v, w)}</span>`).join('');
  if (logDirty) {
    logDirty = false;
    $('#log').innerHTML = ev.slice(-40).reverse().map(e => `<div data-rope="${e.rope ?? -1}"><span class="t">${fmtT(e.t)}</span><span class="k-${e.kind}">${esc(e.text)}${e.n > 1 ? ` ×${e.n}` : ''}</span></div>`).join('');
  }
}

function updateStats(dtMs) {
  // CPU load (COMP ACTY duty cycle + interrupts + stolen cycles), routines, interrupt rates
  if (total > 0) { const b = (busy + (agc.stolen - stolen0)) / total; load = load * 0.6 + Math.min(1, b) * 0.4; }
  busy = 0; total = 0; stolen0 = agc.stolen;
  const sec = dtMs / 1000;
  for (let i = 1; i <= 10; i++) { ruptRate[i] = ruptRate[i] * 0.5 + (ruptCount[i] / Math.max(sec, 0.05)) / (running ? speed : 1) * 0.5; ruptCount[i] = 0; }
  const hits = agc.hits, agg = new Map(); let sum = 0;
  for (let a = 0; a < hits.length; a++) {
    const d = hits[a] - lastHits[a]; lastDelta[a] = d; if (!d) continue;
    sum += d; const id = P.routineOf[a]; if (id < 0) continue;
    agg.set(id, (agg.get(id) || 0) + d);
  }
  lastHits.set(hits);
  if (sum > 0) {
    hot = [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([id, c]) => ({ name: P.routineNames[id], rope: P.routineAt[id], frac: c / sum }));
  }
  heatFrame = codeState.prog === craft ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Main loop
let lastT = 0, acc = 0, statT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!agc) return;
  const dt = Math.min(100, t - (lastT || t)); lastT = t;
  if (running) {
    acc += dt * PER_SEC / 1000 * speed;
    let n = Math.floor(acc); acc -= n;
    if (n > PER_SEC) n = PER_SEC;
    const a = agc;
    for (let i = 0; i < n; i++) { a.cycle(); if ((a.ch[9] & 2) || a.inIsr) busy++; }
    total += n;
  }
  const s = renderDsky() || agc.dskyState();
  if (lesson) lessonTick(s);
  if (t - statT > 400) {
    const d = t - statT; statT = t;
    updateStats(d);
    if ($('#tab-fly').classList.contains('active')) renderLive(s);
    const sc = $('#shCores'); if (sc) sc.innerHTML = 'Core sets ' + coresHtml();
    if ($('#tab-code').classList.contains('active')) renderHeat();
  }
}

// ---------------------------------------------------------------------------
// Tabs
function showTab(name) {
  document.querySelectorAll('section.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'code') { requestAnimationFrame(() => renderCode(true)); }
  updateSheet();
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$('#craftBtn').onclick = () => {
  const other = craft === 'luminary099' ? 'comanche055' : 'luminary099';
  if (confirm(`Switch to ${PROGRAMS[other].name} (${PROGRAMS[other].craft} ${PROGRAMS[other].crew})? The computer will power up fresh.`)) { endLesson(); boot(other); }
};
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------------------------------------------------------------------------
// Code viewer
const LH = 18;
const codeState = { prog: null, file: 0, sel: 0, tour: null, pendingScroll: 0 };
let heatFrame = 0;
function buildFileSel() {
  const sel = $('#fileSel');
  const groups = Object.entries(PROGRAMS).map(([id, info]) => {
    const p = progs[id];
    if (!p) return `<optgroup label="${esc(info.short)} · ${esc(info.name)}"><option value="${id}|0">(tap to load ${esc(info.name)})</option></optgroup>`;
    return `<optgroup label="${esc(info.short)} · ${esc(info.name)}">${p.files.map((f, i) => `<option value="${id}|${i}">${esc(f.name.replace(/\.agc$/, ''))}${f.pages ? ' · ' + esc(f.pages.replace(/^pp\.\s*/, 'p. ')) : ''}</option>`).join('')}</optgroup>`;
  }).join('');
  sel.innerHTML = groups;
  if (codeState.prog) sel.value = `${codeState.prog}|${codeState.file}`;
}
$('#fileSel').onchange = async e => { const [id, f] = e.target.value.split('|'); await openCode(id, +f, 1, false); };
async function openCode(id, fi, line, select = true, tour = null) {
  if (!progs[id]) { toast('Loading source…'); await loadProg(id); buildFileSel(); }
  codeState.prog = id; codeState.file = fi; codeState.sel = select ? line : 0; codeState.tour = tour;
  codeState.pendingScroll = line;
  $('#fileSel').value = `${id}|${fi}`;
  $('#lineInfo').classList.remove('show');
  renderCode(true);
  if (select) showLineInfo(line);
}
function gotoRope(r) {
  const L = lineOf(P, r); if (!L) { toast('No source line for that address'); return; }
  showTab('code'); openCode(craft, L.f, L.l, true);
}
function hl(line) {
  if (/^\s*##/.test(line)) return `<span class="${/^\s*## Page/.test(line) ? 'c-pg' : 'c-ann'}">${esc(line)}</span>`;
  const i = line.indexOf('#');
  const code = i >= 0 ? line.slice(0, i) : line, cm = i >= 0 ? line.slice(i) : '';
  let out = '';
  const m = code.match(/^(\S*)(\s*)(\S*)(.*)$/);
  if (m) {
    out = (m[1] ? `<span class="c-lb">${esc(m[1])}</span>` : '') + esc(m[2]) + (m[3] ? `<span class="c-op">${esc(m[3])}</span>` : '') + esc(m[4]);
    if (m[1].startsWith('$')) out = `<span class="c-pg">${esc(code)}</span>`;
  } else out = esc(code);
  return out + (cm ? `<span class="c-cm">${esc(cm)}</span>` : '');
}
let codeRange = [0, 0];
function renderCode(force) {
  const p = progs[codeState.prog]; if (!p) return;
  const lines = p.lines[codeState.file], wrap = $('#codeWrap'), inner = $('#codeInner');
  inner.style.height = (lines.length * LH + 8) + 'px';
  if (codeState.pendingScroll) {
    const target = Math.max(0, (codeState.pendingScroll - 1) * LH - wrap.clientHeight * 0.3);
    wrap.scrollTop = target; wrap.scrollLeft = 0; codeState.pendingScroll = 0;
  }
  const first = Math.max(0, Math.floor(wrap.scrollTop / LH) - 15), last = Math.min(lines.length, Math.ceil((wrap.scrollTop + wrap.clientHeight) / LH) + 15);
  if (!force && first === codeRange[0] && last === codeRange[1]) return;
  codeRange = [first, last];
  const tr = codeState.tour;
  let html = '';
  for (let i = first; i < last; i++) {
    const ln = i + 1;
    const cls = 'cl' + (ln === codeState.sel ? ' sel' : '') + (tr && ln >= tr[0] && ln <= tr[1] ? ' tour' : '');
    html += `<div class="${cls}" data-l="${ln}" style="top:${i * LH}px"><span class="ln">${ln}</span><span class="tx">${hl(lines[i])}</span></div>`;
  }
  inner.innerHTML = html;
  renderHeat();
}
$('#codeWrap').addEventListener('scroll', () => requestAnimationFrame(() => renderCode(false)), { passive: true });
$('#codeInner').addEventListener('click', e => { const d = e.target.closest('.cl'); if (d) { codeState.sel = +d.dataset.l; renderCode(true); showLineInfo(codeState.sel); } });

let lineAddrCache = { key: '', map: null };
function lineAddrs(p, fi) {
  const key = p.id + ':' + fi;
  if (lineAddrCache.key === key) return lineAddrCache.map;
  const mp = new Map();
  for (let a = 0; a < p.map.length; a++) { const v = p.map[a]; if (v && (v >>> 16) === fi) { const l = v & 0xffff; if (!mp.has(l)) mp.set(l, []); mp.get(l).push(a); } }
  lineAddrCache = { key, map: mp };
  return mp;
}
function renderHeat() {
  if (!agc || codeState.prog !== craft) return;
  const p = progs[codeState.prog], la = lineAddrs(p, codeState.file);
  for (const d of document.querySelectorAll('#codeInner .cl')) {
    const addrs = la.get(+d.dataset.l); let c = 0;
    if (addrs) for (const a of addrs) c += lastDelta[a];
    const ln = d.firstChild;
    if (c > 0) { const al = Math.min(0.85, 0.18 + Math.log10(c + 1) * 0.16); ln.style.background = `rgba(60,200,100,${al})`; d.classList.add('heat'); }
    else if (d.classList.contains('heat')) { ln.style.background = ''; d.classList.remove('heat'); }
  }
}
function showLineInfo(ln) {
  const p = progs[codeState.prog], fi = codeState.file, txt = p.lines[fi][ln - 1] || '';
  const addrs = lineAddrs(p, fi).get(ln) || [];
  const label = p.lineLabel[fi][ln];
  const live = codeState.prog === craft && agc;
  const execd = live ? addrs.reduce((s, a) => s + agc.hits[a], 0) : 0;
  let html = `<div><b>${esc(p.files[fi].name)}</b> line ${ln}${label ? ` · in <span class="mono" style="color:var(--accent)">${esc(label)}</span>` : ''}</div>`;
  if (addrs.length) html += `<div class="mono small" style="margin-top:4px">Rope ${addrs.map(a => bankAddr(a)).join(', ')} = ${addrs.map(a => oct(p.rope[a])).join(' ')}${live ? ` · executed ${execd.toLocaleString()}×` : ''}</div>`;
  else if (/^\s*#/.test(txt) || !txt.trim()) html += `<div class="small" style="margin-top:4px">${/^\s*##/.test(txt) ? 'Note added by the transcribers (not in the original).' : 'Comment from the original programmers.'}</div>`;
  else html += `<div class="small" style="margin-top:4px">Assembler directive or erasable definition (no rope word).</div>`;
  // operand that names a label
  const code = txt.split('#')[0].trim().split(/\s+/);
  const targets = code.slice(1).filter(t => p.symbols[t] !== undefined && t !== label).slice(0, 2);
  html += `<div class="row">${targets.map(t => `<button class="btn" data-go="${esc(t)}">Go to ${esc(t)}</button>`).join('')}<button class="btn" data-close>Close</button></div>`;
  const li = $('#lineInfo'); li.innerHTML = html; li.classList.add('show');
  li.querySelectorAll('[data-go]').forEach(b => b.onclick = () => gotoSymbol(codeState.prog, b.dataset.go));
  li.querySelector('[data-close]').onclick = () => li.classList.remove('show');
}
function gotoSymbol(id, name) {
  const p = progs[id]; const r = p.symbols[name]; if (r === undefined) return;
  const v = p.map[r]; if (!v) return;
  openCode(id, v >>> 16, v & 0xffff, true, codeState.tour && null);
}
$('#followBtn').onclick = () => {
  if (!hot.length) { toast('Nothing running'); return; }
  const h = hot.find(x => !IDLE.has(x.name)) || hot[0];
  gotoRope(h.rope); toast(`Now running: ${h.name}`);
};
// search
let searchT = 0;
$('#search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(doSearch, 150); });
$('#search').addEventListener('focus', doSearch);
document.addEventListener('pointerdown', e => { if (!e.target.closest('#searchRes,#search')) $('#searchRes').classList.remove('show'); });
function doSearch() {
  const q = $('#search').value.trim(), res = $('#searchRes');
  const p = progs[codeState.prog];
  if (!q || !p) { res.classList.remove('show'); return; }
  const Q = q.toUpperCase(), out = [];
  const syms = Object.keys(p.symbols).filter(k => k.includes(Q)).sort((a, b) => (a.startsWith(Q) ? 0 : 1) - (b.startsWith(Q) ? 0 : 1) || a.length - b.length).slice(0, 15);
  for (const k of syms) { const v = p.map[p.symbols[k]]; if (v) out.push({ f: v >>> 16, l: v & 0xffff, t: `<b>${esc(k)}</b><span>${esc(p.files[v >>> 16].name)}:${v & 0xffff}</span>` }); }
  if (q.length >= 3) {
    let n = 0;
    outer: for (let f = 0; f < p.lines.length; f++) for (let i = 0; i < p.lines[f].length; i++) {
      if (p.lines[f][i].toUpperCase().includes(Q)) { out.push({ f, l: i + 1, t: `${esc(p.files[f].name)}:${i + 1}<span>${esc(p.lines[f][i].trim().slice(0, 90))}</span>` }); if (++n >= 25) break outer; }
    }
  }
  res.innerHTML = out.map((o, i) => `<button data-i="${i}">${o.t}</button>`).join('') || '<button disabled>No matches</button>';
  res.classList.add('show');
  res.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const o = out[+b.dataset.i]; res.classList.remove('show'); openCode(codeState.prog, o.f, o.l, true); });
}

// ---------------------------------------------------------------------------
// Lessons (coach sheet on the DSKY tab) and tour (sheet on the Code tab)
let lesson = null, tourIdx = -1, sheetMini = false;
let done = store.get('done', {});
function buildTrain() {
  const cheat = [['V05 N09 E', 'Show alarm codes'], ['V16 N36 E', 'Monitor the AGC clock'], ['V25 N36 E', 'Load the clock'], ['V35 E', 'Lamp test'], ['V36 E', 'Fresh start'], ['V37 E nn E', 'Change program to Pnn'], ['V27 N02 E addr E', 'Show a word of fixed memory (octal)'], ['V01 N02 E addr E', 'Show a word of erasable memory'], ['V11 N01 E addr E', 'Monitor a word (octal)'], ['V33 E', 'Proceed without data'], ['V34 E', 'Terminate'], ['PRO (hold)', 'In P06: enter or leave standby'], ['RSET', 'Clear PROG, OPR ERR, RESTART lamps'], ['KEY REL', 'Give the display back to the program']];
  $('#train').innerHTML = `<h2>Astronaut training</h2><p>Short hands-on lessons. Each one makes you key real commands on the DSKY, then shows what the Apollo 11 software did inside.</p>
    ${LESSONS.map((l, i) => `<button class="item${done[l.id] ? ' done' : ''}" data-les="${i}"><span class="n">${done[l.id] ? '✓' : i + 1}</span><span><h4>${esc(l.title)}</h4><p>${esc(l.sub)}</p></span></button>`).join('')}
    <h2 style="margin-top:18px">How the AGC works</h2>
    <details class="box"><summary>The machine</summary><div>A 15-bit ones'-complement computer (plus a parity bit) running at about 85,000 memory cycles per second (11.7 µs each). 2,048 words of erasable core memory and 36,864 words of <b>core rope</b>: read-only memory where each bit is a wire threaded through or around a magnetic core, woven by hand at Raytheon. Memory is reached through banks, so most code jumps between banks constantly (BANKJUMP, POSTJUMP in the live view).</div></details>
    <details class="box"><summary>Executive and Waitlist</summary><div>Two schedulers. The <b>Executive</b> runs <i>jobs</i> by priority, each holding one of 8 <b>core sets</b> (12 words for its registers); jobs needing more scratch space also get a VAC area. The <b>Waitlist</b> runs short <i>tasks</i> at precise times, driven by the TIME3 counter and T3RUPT. Tasks hand longer work to the Executive. When nothing is queued the Executive idles and runs self-check.</div></details>
    <details class="box"><summary>Interrupts and counters</summary><div>Hardware counters (TIME1–TIME6, IMU angles, accelerometers) are incremented by "stealing" a memory cycle between instructions. When one overflows it raises an interrupt: T3RUPT for the Waitlist, T4RUPT every 120 ms for the DSKY and IMU, T5RUPT for the autopilot, T6RUPT for jet timing, DOWNRUPT for telemetry, KEYRUPT for the keyboard.</div></details>
    <details class="box"><summary>Restarts and the 1202</summary><div>If the hardware sees trouble (a stuck loop, no interrupts, a parity error) it forces a restart to address 4000. The software can also restart itself (BAILOUT). Either way, the <b>phase tables</b> say which protected jobs to resume and from where. On Apollo 11 a misconfigured rendezvous radar made its CDU counters steal roughly 15% of all memory cycles. The landing software was already about 85% busy, so jobs piled up, the Executive ran out of core sets (1202) or VAC areas (1201), and restarted. Essential guidance resumed within milliseconds each time, and the landing continued.</div></details>
    <details class="box"><summary>DSKY cheat sheet</summary><div><table class="cheat">${cheat.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div></details>
    <details class="box"><summary>About this app</summary><div>The software is the real Apollo 11 code: Luminary 099 (LM) and Comanche 055 (CM), transcribed from MIT's printouts by the Virtual AGC project (github.com/virtualagc/virtualagc, mirrored at github.com/chrislgarry/Apollo-11). It was assembled with the yaYUL assembler and the result matches the original rope dumps word for word. The CPU emulator is a JavaScript port of Virtual AGC's yaAGC (GPL v2). Everything runs on your phone, offline.</div></details>`;
  document.querySelectorAll('[data-les]').forEach(b => b.onclick = () => startLesson(+b.dataset.les));
}
async function startLesson(i) {
  const L = LESSONS[i];
  if (L.craft && L.craft !== P.info.craft) {
    const id = L.craft === 'LM' ? 'luminary099' : 'comanche055';
    if (!confirm(`This lesson uses ${PROGRAMS[id].crew}'s computer (${PROGRAMS[id].name}). Switch and power it up?`)) return;
    await boot(id);
  }
  lesson = { i, step: 0, ok: false }; tourIdx = -1; sheetMini = false;
  showTab('fly'); $('#tab-fly').scrollTop = 0; enterStep();
}
function endLesson() { stopMash(); lesson = null; clearFocus(); updateKeyHints(); updateSheet(); }
let mashTimers = [];
function stopMash() { mashTimers.forEach(clearTimeout); mashTimers = []; }
function enterStep() {
  stopMash();
  lesson.ok = false; lesson.keyPos = 0; lesson.start = agc ? agc.cycles : 0; lesson.evStart = evSeq; lessonSeen = {};
  const st = LESSONS[lesson.i].steps[lesson.step];
  clearFocus();
  if (st.focus) { const el = { dsky: '#dsky', lamps: '#lampsPanel', el: '#elPanel', keys: '#keysPanel' }[st.focus]; const n = $(el); if (n) { n.style.outline = '3px solid var(--accent)'; n.style.outlineOffset = '2px'; n.scrollIntoView({ block: 'nearest' }); } }
  updateKeyHints(); updateSheet();
}
function clearFocus() { for (const s of ['#dsky', '#lampsPanel', '#elPanel', '#keysPanel']) { const n = $(s); if (n) n.style.outline = ''; } }
function lessonKey(k) {
  if (!lesson || lesson.ok) return;
  const st = LESSONS[lesson.i].steps[lesson.step];
  if (!st.keys) return;
  if (st.keys[lesson.keyPos] === k) lesson.keyPos++;
  else lesson.keyPos = st.keys[0] === k ? 1 : 0;
  updateKeyHints();
}
function updateKeyHints() {
  document.querySelectorAll('#keysPanel .key.hint').forEach(b => b.classList.remove('hint'));
  if (!lesson || lesson.ok) return;
  const st = LESSONS[lesson.i].steps[lesson.step];
  let k = st.hold || (st.keys && st.keys[lesson.keyPos]);
  if (k) { const b = document.querySelector(`#keysPanel .key[data-k="${k === 'KEY REL' ? 'KEYREL' : k}"]`); if (b) b.classList.add('hint'); }
}
function lessonTick(s) {
  if (!lesson || lesson.ok) return;
  const st = LESSONS[lesson.i].steps[lesson.step];
  for (const [k, v] of Object.entries(s.lamps)) if (v) lessonSeen[k] = true;
  if (!st.check) return;
  const x = { flash: !!(agc.ch[0o11] & 0o40), ch11: agc.ch[0o11], seen: lessonSeen, events: ev.filter(e => e.seq > lesson.evStart), stepSecs: (agc.cycles - lesson.start) / PER_SEC, steal: agc.steal };
  let ok = false; try { ok = st.check(s, x); } catch {}
  if (ok) { stopMash(); lesson.ok = true; haptics && navigator.vibrate?.([20, 40, 20]); updateKeyHints(); updateSheet(); }
}
function updateSheet() {
  const sh = $('#sheet');
  const onFly = $('#tab-fly').classList.contains('active'), onCode = $('#tab-code').classList.contains('active');
  sh.classList.toggle('mini', sheetMini);
  if (lesson && onFly) {
    const L = LESSONS[lesson.i], st = L.steps[lesson.step], last = lesson.step === L.steps.length - 1;
    const codeBtn = st.code && (!st.code.craft || st.code.craft === P.info.craft) ? `<button class="btn" id="shCode">See the code</button>` : '';
    sh.innerHTML = `<div class="hd">LESSON ${lesson.i + 1} · ${esc(L.title.toUpperCase())} · ${lesson.step + 1}/${L.steps.length}<button class="min" id="shMin">${sheetMini ? '▴' : '▾'}</button><button class="x" id="shX" aria-label="Close">×</button></div>
      <div class="bd">${st.text}${st.action ? `<p><button class="btn primary" id="shAct">${esc(st.action.label)}</button></p>` : ''}${st.gauge ? `<div id="shCores" class="small" style="font-family:var(--mono);letter-spacing:1px">Core sets ${coresHtml()}</div>` : ''}${lesson.ok && st.inside ? `<div class="inside"><b style="color:var(--green)">Inside the AGC:</b> ${st.inside}</div>` : ''}</div>
      <div class="ft">${lesson.step > 0 ? '<button class="btn" id="shBack">‹</button>' : ''}${lesson.ok ? '<span class="ok">✓ Done</span>' : st.check ? '<span class="small">Waiting for you…</span>' : ''}<span class="sp"></span>${lesson.ok || !st.check ? codeBtn : ''}${lesson.ok || !st.check ? `<button class="btn primary" id="shNext">${last ? 'Finish' : 'Next ›'}</button>` : '<button class="btn" id="shSkip">Skip</button>'}</div>`;
    sh.classList.add('show');
    const top = $('#dsky').getBoundingClientRect().bottom + 6, tabs = $('#tabs').getBoundingClientRect().height;
    sh.style.maxHeight = Math.max(150, innerHeight - top - tabs - 10) + 'px';
    $('#shX').onclick = endLesson;
    $('#shMin').onclick = () => { sheetMini = !sheetMini; updateSheet(); };
    const nx = $('#shNext'); if (nx) nx.onclick = () => { if (last) { done[L.id] = true; store.set('done', done); buildTrain(); toast('Lesson complete!'); endLesson(); } else { lesson.step++; enterStep(); } };
    const sk = $('#shSkip'); if (sk) sk.onclick = () => { lesson.ok = true; updateKeyHints(); updateSheet(); };
    const bk = $('#shBack'); if (bk) bk.onclick = () => { lesson.step--; enterStep(); };
    const ac = $('#shAct'); if (ac) ac.onclick = () => {
      if (st.action.mash) { for (let i = 0; i < st.action.mash; i++) mashTimers.push(setTimeout(() => pressKey(['1', '2', '3', 'CLR'][i % 4], true), i * 45)); return; }
      setSteal(st.action.steal); toast(st.action.steal ? `Stealing ${Math.round(st.action.steal * 100)}% of cycles` : 'Cycle stealing off');
    };
    const cb = $('#shCode'); if (cb) cb.onclick = () => openLessonCode(st.code);
  } else if (tourIdx >= 0 && onCode) {
    const T = TOUR[tourIdx];
    sh.innerHTML = `<div class="hd">TOUR ${tourIdx + 1}/${TOUR.length} · ${T.craft === 'LM' ? 'LUMINARY 099' : 'COMANCHE 055'}<button class="min" id="shMin">${sheetMini ? '▴' : '▾'}</button><button class="x" id="shX" aria-label="Close">×</button></div>
      <div class="bd"><p><b>${esc(T.title)}</b></p>${T.html}</div>
      <div class="ft"><button class="btn" id="shPrev" ${tourIdx === 0 ? 'disabled' : ''}>‹ Prev</button><span class="sp"></span><span class="small">${esc(T.file.replace(/\.agc$/, ''))}</span><span class="sp"></span><button class="btn primary" id="shNext" ${tourIdx === TOUR.length - 1 ? 'disabled' : ''}>Next ›</button></div>`;
    sh.classList.add('show'); sh.style.maxHeight = '';
    $('#shX').onclick = () => { tourIdx = -1; codeState.tour = null; renderCode(true); updateSheet(); };
    $('#shMin').onclick = () => { sheetMini = !sheetMini; updateSheet(); };
    $('#shPrev').onclick = () => goTour(tourIdx - 1);
    $('#shNext').onclick = () => goTour(tourIdx + 1);
  } else sh.classList.remove('show');
}
async function openLessonCode(c) {
  showTab('code');
  const p = progs[craft], fi = p.fileIdx[c.file];
  if (fi === undefined) return;
  if (c.rope !== undefined) { const L = lineOf(p, c.rope); if (L) return openCode(craft, L.f, L.l, true); }
  openCode(craft, fi, findLine(p, fi, c.label, c.find), true);
}
function buildTour() {
  $('#tour').innerHTML = `<h2>Guided tour of the code</h2><p>${TOUR.length} stops through the Apollo 11 source, from power-on to the landing. Each one opens the real code with the lines highlighted.</p>
    ${TOUR.map((t, i) => `<button class="item" data-tour="${i}"><span class="n">${i + 1}</span><span><h4>${esc(t.title)}</h4><p>${t.html.replace(/<[^>]+>/g, '').slice(0, 120)}…</p><span class="tag">${t.craft === 'LM' ? 'Luminary 099' : 'Comanche 055'} · ${esc(t.file)}</span></span></button>`).join('')}`;
  document.querySelectorAll('[data-tour]').forEach(b => b.onclick = () => goTour(+b.dataset.tour));
}
async function goTour(i) {
  if (i < 0 || i >= TOUR.length) return;
  tourIdx = i; lesson = null; clearFocus(); updateKeyHints(); sheetMini = false;
  const T = TOUR[i], id = T.craft === 'LM' ? 'luminary099' : 'comanche055';
  showTab('code');
  if (!progs[id]) { toast('Loading source…'); await loadProg(id); buildFileSel(); }
  const p = progs[id], fi = p.fileIdx[T.file] ?? 0;
  const ln = findLine(p, fi, T.label, T.find);
  await openCode(id, fi, ln, false, [ln, ln + (T.span || 6) - 1]);
  updateSheet();
}

// ---------------------------------------------------------------------------
buildTrain(); buildTour();
boot(craft).then(() => requestAnimationFrame(frame));
