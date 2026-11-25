// Word Scramble Fun: unscramble the same word in several languages at once.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the arcade share one localStorage, so every key gets this app's prefix.
const APP = 'word-scramble-fun';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = id => document.getElementById(id);
const GAME_URL = new URL('./', location.href).href.replace(/[?#].*$/, '');

// ---------- Settings ----------
let chosenLangs = store.get('langs', ['EN', 'IT']).filter(c => LANGS.some(l => l.code === c));
let chosenLen = store.get('length', 'all');
let soundOn = store.get('sound', true);

const langBox = $('langs');
LANGS.forEach(l => {
  const b = document.createElement('button');
  b.className = 'chip lang';
  b.dataset.code = l.code;
  b.textContent = `${l.flag} ${l.name}`;
  b.addEventListener('click', () => {
    chosenLangs = chosenLangs.includes(l.code) ? chosenLangs.filter(c => c !== l.code) : [...chosenLangs, l.code];
    // Keep the rows in the same order as the buttons.
    chosenLangs = LANGS.map(x => x.code).filter(c => chosenLangs.includes(c));
    store.set('langs', chosenLangs);
    tap(); renderSetup();
  });
  langBox.appendChild(b);
});
document.querySelectorAll('.len').forEach(b => b.addEventListener('click', () => {
  chosenLen = b.dataset.len; store.set('length', chosenLen); tap(); renderSetup();
}));
$('sound').addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); renderSetup(); tap(); });

const configKey = () => chosenLangs.join('-') + '/' + chosenLen;
const wordCount = () => chosenLen === 'all' ? WORDS.length : Math.min(+chosenLen, WORDS.length);

function renderSetup() {
  document.querySelectorAll('.lang').forEach(b => b.classList.toggle('on', chosenLangs.includes(b.dataset.code)));
  document.querySelectorAll('.len').forEach(b => b.classList.toggle('on', b.dataset.len === chosenLen));
  $('sound').textContent = soundOn ? '🔊 Sound on' : '🔇 Sound off';
  $('start').disabled = chosenLangs.length === 0;
  $('note').textContent = chosenLangs.length === 0 ? 'Choose at least one language' : '';
  const best = store.get('best', {})[configKey()];
  $('best').innerHTML = best ? `Best time for this setup: <b>${best.toFixed(1)} s</b>` : '';
}
renderSetup();

// ---------- Sound + vibration ----------
let ctx = null;
function audio() {
  if (!soundOn) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(freq, dur = 0.08, type = 'sine', vol = 0.15, delay = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const buzz = p => { if (soundOn) navigator.vibrate?.(p); };
const tap = () => { tone(660, 0.05, 'triangle', 0.1); buzz(8); };
const untap = () => { tone(440, 0.05, 'triangle', 0.08); buzz(8); };
const wrong = () => { tone(180, 0.18, 'square', 0.07); tone(140, 0.22, 'square', 0.07, 0.12); buzz([30, 40, 30]); };
const right = () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'sine', 0.14, i * 0.07)); buzz(20); };
const setDone = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, i * 0.08)); buzz([20, 40, 20]); };

// ---------- Game state ----------
let deck = [], idx = 0, score = 0, rows = [], playing = false, solvedClues = [];
let startTime = 0, pausedAt = 0, timerId = null, wakeLock = null, advanceId = null;

const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function scramble(word) {
  if (new Set(word).size < 2) return word.split('');
  let s; do { s = shuffle(word.split('')); } while (s.join('') === word);
  return s;
}

const elapsed = () => ((pausedAt || performance.now()) - startTime) / 1000;
const showTime = () => { $('time').textContent = elapsed().toFixed(1); };
function pauseClock() { if (!pausedAt) pausedAt = performance.now(); }
function resumeClock() { if (pausedAt) { startTime += performance.now() - pausedAt; pausedAt = 0; } }

async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && playing) keepAwake(); });

function show(screen) {
  $('setup').classList.toggle('on', screen === 'setup');
  $('game').classList.toggle('on', screen === 'game');
}

function startGame() {
  if (!chosenLangs.length) return;
  audio();
  deck = shuffle(WORDS).slice(0, wordCount());
  idx = 0; score = 0; solvedClues = []; playing = true;
  $('score').textContent = 0;
  $('endVeil').classList.remove('on');
  show('game');
  startTime = performance.now(); pausedAt = 0;
  clearInterval(timerId); timerId = setInterval(showTime, 100); showTime();
  keepAwake();
  if (!history.state?.[APP]) history.pushState({ [APP]: 1 }, '');
  loadSet();
}

function loadSet() {
  const set = deck[idx];
  const clue = $('clue');
  clue.textContent = set.clue;
  clue.classList.remove('pop'); void clue.offsetWidth; clue.classList.add('pop');
  $('counter').textContent = `${idx + 1} / ${deck.length}`;
  const box = $('rows'); box.innerHTML = '';
  rows = chosenLangs.filter(c => set[c]).map(code => {
    const word = set[code].toUpperCase();
    const row = { code, word, letters: scramble(word), filled: Array(word.length).fill(null), solved: false };
    const el = document.createElement('div'); el.className = 'row';
    const lang = LANGS.find(l => l.code === code);
    el.innerHTML = `<div class="flag">${lang.flag} <small>${lang.code}</small></div>`;
    const slots = document.createElement('div'); slots.className = 'tiles'; slots.style.setProperty('--n', word.length);
    const pool = document.createElement('div'); pool.className = 'tiles'; pool.style.setProperty('--n', word.length);
    row.slotEls = row.filled.map((_, i) => {
      const t = document.createElement('div'); t.className = 'tile slot';
      t.addEventListener('click', () => removeAt(row, i));
      slots.appendChild(t); return t;
    });
    row.letterEls = row.letters.map((ch, i) => {
      const t = document.createElement('div'); t.className = 'tile letter'; t.textContent = ch;
      t.addEventListener('click', () => place(row, i));
      pool.appendChild(t); return t;
    });
    el.append(slots, pool); box.appendChild(el);
    row.el = el;
    return row;
  });
  box.parentElement.scrollTop = 0;
}

function place(row, li) {
  if (!playing || row.solved || row.filled.includes(li)) return;
  const slot = row.filled.indexOf(null);
  if (slot < 0) return;
  row.filled[slot] = li;
  row.slotEls[slot].textContent = row.letters[li];
  row.slotEls[slot].classList.add('filled');
  row.letterEls[li].classList.add('used');
  tap();
  if (!row.filled.includes(null)) check(row);
}

function removeAt(row, si) {
  if (!playing || row.solved || row.filled[si] === null) return;
  row.letterEls[row.filled[si]].classList.remove('used');
  row.filled[si] = null;
  row.slotEls[si].textContent = '';
  row.slotEls[si].classList.remove('filled');
  untap();
}

function check(row) {
  const guess = row.filled.map(i => row.letters[i]).join('');
  if (guess !== row.word) {
    wrong();
    row.el.classList.remove('shake'); void row.el.offsetWidth; row.el.classList.add('shake');
    setTimeout(() => row.el.classList.remove('shake'), 500);
    return;
  }
  row.solved = true; row.el.classList.add('done');
  score += 10; $('score').textContent = score;
  if (rows.every(r => r.solved)) {
    score += 25; $('score').textContent = score;
    solvedClues.push(deck[idx].clue);
    setDone();
    advanceId = setTimeout(() => {
      advanceId = null;
      if (!playing) return;
      idx++;
      if (idx >= deck.length) finish(); else loadSet();
    }, 1200);
  } else {
    right();
  }
}

// ---------- Keyboard (desktop) ----------
document.addEventListener('keydown', e => {
  if (!playing || e.metaKey || e.ctrlKey || e.altKey || $('quitVeil').classList.contains('on')) return;
  if (e.key === 'Escape') { askQuit(); return; }
  if (/^[a-z]$/i.test(e.key)) {
    const ch = e.key.toUpperCase();
    for (const row of rows) {
      if (row.solved || !row.filled.includes(null)) continue;
      const li = row.letters.findIndex((c, i) => c === ch && !row.filled.includes(i));
      if (li >= 0) { place(row, li); e.preventDefault(); return; }
    }
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    for (let r = rows.length - 1; r >= 0; r--) {
      const row = rows[r];
      if (row.solved) continue;
      for (let s = row.filled.length - 1; s >= 0; s--) if (row.filled[s] !== null) { removeAt(row, s); return; }
    }
  }
});

// ---------- Quit ----------
function askQuit() {
  if (!playing) return;
  pauseClock();
  $('quitVeil').classList.add('on');
}
function keepPlaying() {
  $('quitVeil').classList.remove('on');
  resumeClock();
}
function stopGame() {
  playing = false;
  clearInterval(timerId); timerId = null;
  clearTimeout(advanceId); advanceId = null;
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}
function toMenu() {
  stopGame();
  $('quitVeil').classList.remove('on');
  $('endVeil').classList.remove('on');
  $('rows').innerHTML = '';
  renderSetup();
  show('setup');
  if (history.state?.[APP]) history.back();
}
$('quit').addEventListener('click', askQuit);
$('keep').addEventListener('click', keepPlaying);
$('confirmQuit').addEventListener('click', toMenu);
$('start').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('menu').addEventListener('click', toMenu);

// Android back gesture: ask before leaving a game instead of closing the app.
window.addEventListener('popstate', () => {
  if (playing) {
    history.pushState({ [APP]: 1 }, '');
    if ($('quitVeil').classList.contains('on')) keepPlaying(); else askQuit();
  } else if ($('endVeil').classList.contains('on')) {
    $('endVeil').classList.remove('on'); renderSetup(); show('setup');
  }
});

// ---------- Results ----------
let recap = null, lastResult = null;

function finish() {
  pauseClock(); showTime();
  const time = +elapsed().toFixed(1);
  stopGame();
  const bests = store.get('best', {});
  const prev = bests[configKey()];
  const record = !prev || time < prev;
  if (record) { bests[configKey()] = time; store.set('best', bests); }
  const flags = chosenLangs.map(c => LANGS.find(l => l.code === c).flag).join(' ');
  lastResult = { score, time, words: deck.length, flags, langs: [...chosenLangs], clues: [...solvedClues], record, prev };
  $('endScore').textContent = score;
  $('endSub').textContent = `${deck.length} word${deck.length === 1 ? '' : 's'} · ${flags} · ${time.toFixed(1)} s`;
  $('endRecord').textContent = record ? (prev ? `New best time! (was ${prev.toFixed(1)} s)` : 'Best time set!') : `Best time: ${prev.toFixed(1)} s`;
  $('endEmojis').textContent = solvedClues.join('');
  $('endVeil').classList.add('on');
  recap = buildRecap(lastResult);
}

function buildRecap(r) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font');
  g.fillStyle = '#e7f5ff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b3d9ff'; g.fillRect(0, 0, W, 16); g.fillRect(0, H - 16, W, 16);

  // Title tiles
  const word = 'SCRAMBLE', ts = 96, gap = 14, x0 = (W - (word.length * ts + (word.length - 1) * gap)) / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [...word].forEach((ch, i) => {
    const x = x0 + i * (ts + gap), y = 90;
    g.save(); g.translate(x + ts / 2, y + ts / 2); g.rotate((i % 2 ? 5 : -6) * Math.PI / 180);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#8cbce6'; g.lineWidth = 5;
    roundRect(g, -ts / 2, -ts / 2, ts, ts, 16); g.fill(); g.stroke();
    g.fillStyle = '#0d47a1'; g.font = `800 58px ${font}`; g.fillText(ch, 0, 4);
    g.restore();
  });
  g.fillStyle = '#2a6daa'; g.font = `700 52px ${font}`; g.fillText('Word Scramble Fun', W / 2, 270);

  // Score card
  g.fillStyle = '#ffffff'; roundRect(g, 90, 330, W - 180, 470, 36); g.fill();
  g.fillStyle = '#5b6b7a'; g.font = `700 40px ${font}`; g.fillText(`${r.words} word${r.words === 1 ? '' : 's'} unscrambled in`, W / 2, 400);
  g.fillStyle = '#0d47a1'; g.font = `800 170px ${font}`; g.fillText(`${r.time.toFixed(1)} s`, W / 2, 530);
  g.fillStyle = '#f57c00'; g.font = `800 44px ${font}`;
  g.fillText(r.record ? 'New best time!' : `Score ${r.score}`, W / 2, 650);
  g.font = `64px ${font}`; g.fillStyle = '#333'; g.fillText(r.flags, W / 2, 735);

  // Clues solved
  const per = 10, es = 76, rowsN = Math.ceil(r.clues.length / per), shown = r.clues.slice(0, per * 4);
  g.font = `60px ${font}`;
  shown.forEach((e, i) => {
    const row = Math.floor(i / per), inRow = Math.min(per, shown.length - row * per);
    const x = W / 2 + (i % per - (inRow - 1) / 2) * (es + 12), y = 880 + row * (es + 16);
    g.fillText(e, x, y);
  });
  if (rowsN > 4) { g.fillStyle = '#5b6b7a'; g.font = `700 36px ${font}`; g.fillText('…', W / 2, 880 + 4 * (es + 16)); }

  g.fillStyle = '#2a6daa'; g.font = `700 40px ${font}`; g.fillText('Your turn:', W / 2, 1230);
  g.fillStyle = '#0d47a1'; g.font = `700 36px ${font}`; g.fillText(GAME_URL.replace(/^https?:\/\//, ''), W / 2, 1285);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

async function share() {
  if (!lastResult) return;
  const r = lastResult;
  const text = `I unscrambled ${r.words} word${r.words === 1 ? '' : 's'} in ${r.flags} in ${r.time.toFixed(1)} s on Word Scramble Fun. Your turn: ${GAME_URL}`;
  const blob = recap ? await recap : null;
  const file = blob && new File([blob], 'word-scramble-fun.png', { type: 'image/png' });
  try {
    if (file && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text });
    if (navigator.share) return await navigator.share({ title: 'Word Scramble Fun', text, url: GAME_URL });
  } catch (e) { if (e?.name === 'AbortError') return; }
  if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'word-scramble-fun.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast(GAME_URL); }
}
$('shareBtn').addEventListener('click', share);

let toastId = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastId); toastId = setTimeout(() => t.classList.remove('on'), 2000);
}
