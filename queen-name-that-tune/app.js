'use strict';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All games in the arcade share one localStorage, so every key gets this app's prefix.
const APP = 'queen-name-that-tune';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const ROUNDS = 10;     // rounds per game
const CLIP = 15;       // seconds of music per round (also the answer timer)
const OPTIONS = 4;     // answers to choose from
const COUNTRY = 'us';  // Apple store used for the previews
const CACHE_DAYS = 7;  // how long a found preview link is remembered

const $ = id => document.getElementById(id);
const audio = $('audio');
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- settings ---------------- */
let muted = store.get('muted', false);
let vibeOn = store.get('vibe', true);
function paintToggles() {
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
  $('vibeBtn').style.opacity = vibeOn ? 1 : .4;
}
$('muteBtn').onclick = () => { muted = !muted; store.set('muted', muted); paintToggles(); fx('tap'); };
$('vibeBtn').onclick = () => { vibeOn = !vibeOn; store.set('vibe', vibeOn); paintToggles(); buzz(20); };
paintToggles();
const buzz = ms => { if (vibeOn) navigator.vibrate?.(ms); };

/* ---------------- sound effects (Web Audio, no files) ---------------- */
let ac;
function fx(kind) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const notes = { ok: [[660, 0], [880, .09], [1320, .18]], ko: [[220, 0], [165, .14]], tap: [[520, 0]], end: [[523, 0], [659, .12], [784, .24], [1047, .36]] }[kind] || [];
    notes.forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + t;
      o.type = kind === 'ko' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 0.25);
    });
  } catch {}
}

/* ---------------- finding previews on Apple (iTunes Search API) ---------------- */
// JSONP is the documented way to call the Search API from a web page.
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'qntt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const s = document.createElement('script');
    const timer = setTimeout(() => { clean(); reject(new Error('timeout')); }, 12000);
    function clean() { clearTimeout(timer); try { delete window[cb]; } catch { window[cb] = undefined; } s.remove(); }
    window[cb] = data => { clean(); resolve(data); };
    s.onerror = () => { clean(); reject(new Error('network')); };
    s.src = url + '&callback=' + cb;
    document.head.appendChild(s);
  });
}

// "Don't Stop Me Now (Remastered 2011)" and "Don’t Stop Me Now - 2011 Mix" both become "dont stop me now".
const norm = s => String(s).toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/\s+-\s+.*$/, '')
  .replace(/['’`]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ').trim();
const isQueen = a => /^queen(\s*(&|and|,|feat)\b.*)?$/i.test(String(a).trim());
const AVOID = /\b(live|remix|instrumental|demo|a ?cappella|karaoke|bbc|session|alternat\w*|backing|rehearsal|take \d|outtake|rough mix|early version)\b/i;

const LIVE = /\blive\b|wembley|montreal|hammersmith|odeon|rainbow|budapest|on fire/i;
const OTHER = /\b(remix|instrumental|demo|a ?cappella|karaoke|bbc|session|alternat\w*|backing|rehearsal|take \d|outtake|rough mix|early version)\b/i;
let cache = store.get('tracks', {});
// live = true looks for a concert recording instead of the studio version.
async function findTrack(title, live) {
  const key = title + (live ? '|live' : '');
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_DAYS * 864e5) return hit;
  const url = 'https://itunes.apple.com/search?media=music&entity=song&limit=' + (live ? 50 : 30) + '&country=' + COUNTRY +
    '&term=' + encodeURIComponent('queen ' + title + (live ? ' live' : ''));
  const data = await jsonp(url);
  const want = norm(title);
  const picks = (data.results || [])
    .filter(r => r.previewUrl && isQueen(r.artistName) && norm(r.trackName) === want)
    .filter(r => !live || LIVE.test(r.trackName) || LIVE.test(r.collectionName || ''))
    .map(r => {
      const name = r.trackName, alb = r.collectionName || '';
      const bad = live
        ? (OTHER.test(name) ? 4 : 0) + (LIVE.test(name) ? 0 : 1)
        : (AVOID.test(name) ? 2 : 0) + (AVOID.test(alb) ? 1 : 0);
      return { r, bad };
    })
    .sort((a, b) => a.bad - b.bad);
  if (!picks.length) return null;
  const r = picks[0].r;
  const t = {
    preview: r.previewUrl,
    link: r.trackViewUrl || r.collectionViewUrl || '',
    art: (r.artworkUrl100 || '').replace('100x100', '200x200'),
    album: r.collectionName || '',
    year: (r.releaseDate || '').slice(0, 4),
    live: !!live,
    at: Date.now(),
  };
  cache[key] = t; store.set('tracks', cache);
  return t;
}
function forget(song) { delete cache[song.title + (song.live ? '|live' : '')]; store.set('tracks', cache); }

/* ---------------- levels ---------------- */
const uniq = list => { const seen = new Set(); return list.filter(t => { const n = norm(t); if (seen.has(n)) return false; seen.add(n); return true; }); };
// Titles offered as wrong answers on each level.
function answerPool(level) {
  if (level === 'hard') return uniq([...LEVELS.hard.songs, ...LEVELS.hard.live, ...LEVELS.medium.songs]);
  return uniq(LEVELS[level].songs);
}
const bestOf = level => store.get('best-' + level, 0);

/* ---------------- screens ---------------- */
const screens = ['home', 'loading', 'play', 'results'];
function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); window.scrollTo(0, 0); }

const LEVEL_UI = { easy: ['👑', '#b6ff4a'], medium: ['👑👑', '#3ef2ff'], hard: ['👑👑👑', '#ff4fd8'] };
function paintHome() {
  $('levels').innerHTML = Object.entries(LEVELS).map(([id, L]) => {
    const best = bestOf(id);
    return `<button class="lvl" data-level="${id}" style="--c:${LEVEL_UI[id][1]}">
      <span class="crowns">${LEVEL_UI[id][0]}</span>
      <span><span class="a">${esc(L.answer)}</span><span class="b">${esc(L.blurb)}</span></span>
      <span class="lv">${esc(L.name)}${best ? `<small>best ${best}</small>` : ''}</span>
    </button>`;
  }).join('');
  $('levels').querySelectorAll('.lvl').forEach(b => b.onclick = () => startGame(b.dataset.level));
  $('offlineWarn').classList.toggle('hidden', navigator.onLine !== false);
}
window.addEventListener('online', paintHome);
window.addEventListener('offline', paintHome);

/* ---------------- game state ---------------- */
let game = null;   // { rounds: [...], spares: [...], i, score }
let timer = null;  // { start, raf, left, paused }
let clipStop = null;
let loadToken = 0;
let lastLevel = null;

async function startGame(level) {
  level = LEVELS[level] ? level : (game && game.level) || lastLevel || 'easy';
  lastLevel = level;
  if (navigator.onLine === false) { paintHome(); show('home'); buzz(40); return; }
  fx('tap');
  show('loading');
  $('loadRetry').classList.add('hidden'); $('loadHome').classList.add('hidden');
  const token = ++loadToken;
  const L = LEVELS[level];
  // How many live recordings this game needs (hard level only); the rest are studio versions.
  const liveWanted = level === 'hard' ? (L.liveRounds || 0) : 0;
  const pool = [
    ...shuffle(uniq(L.live || [])).map(title => ({ title, live: true })),
    ...shuffle(uniq(L.songs)).map(title => ({ title, live: false })),
  ];
  const found = [];
  const used = new Set();
  let failures = 0;
  const count = live => found.filter(f => f.live === live).length;
  const need = live => live ? count(true) < liveWanted + 1 : count(false) < ROUNDS - liveWanted + 1;
  const update = () => { $('loadText').textContent = `Finding song previews… ${Math.min(found.length, ROUNDS)}/${ROUNDS}`; };
  update();
  // Look songs up a few at a time until we have 10 (+ spares in case a clip won't play).
  async function worker() {
    while (token === loadToken) {
      const item = pool.find(p => !p.taken && need(p.live) && !used.has(norm(p.title)));
      if (!item) break;
      item.taken = true;
      try {
        const t = await findTrack(item.title, item.live);
        if (t && !used.has(norm(item.title)) && need(item.live)) { used.add(norm(item.title)); found.push({ title: item.title, ...t, live: item.live }); }
      } catch { failures++; }
      update();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (token !== loadToken) return;
  // Put the live rounds at random places among the studio ones, keep the leftovers as spares.
  const live = shuffle(found.filter(f => f.live)), studio = shuffle(found.filter(f => !f.live));
  const nLive = Math.min(live.length, liveWanted);
  const picked = shuffle([...live.slice(0, nLive), ...studio.slice(0, ROUNDS - nLive)]);
  const spares = [...studio.slice(ROUNDS - nLive), ...live.slice(nLive)];
  if (picked.length < ROUNDS) {
    $('loadText').textContent = failures
      ? "Couldn't reach Apple Music. Check your connection and try again."
      : 'Not enough song previews were found right now. Try again in a minute.';
    $('loadRetry').classList.remove('hidden'); $('loadHome').classList.remove('hidden');
    return;
  }
  game = { level, rounds: [], spares, i: 0, score: 0 };
  game.rounds = picked.map(makeRound);
  $('levelName').textContent = L.name;
  history.pushState({ qntt: 1 }, '');
  wake(true);
  show('play');
  setupRound();
}

function makeRound(song) {
  const wrong = shuffle(answerPool(game.level).filter(s => norm(s) !== norm(song.title))).slice(0, OPTIONS - 1);
  return { song, options: shuffle([song.title, ...wrong]), picked: null, points: 0 };
}

function setupRound() {
  const r = game.rounds[game.i];
  stopAudio(); stopTimer();
  $('roundNo').textContent = game.i + 1;
  $('scoreNo').textContent = game.score;
  $('playBtn').classList.remove('hidden');
  $('countWrap').classList.add('hidden');
  $('hint').textContent = 'Tap to play the clip';
  $('ring').classList.remove('low');
  setRing(1);
  $('after').classList.add('hidden');
  const opts = $('options');
  opts.classList.add('waiting');
  opts.innerHTML = r.options.map((o, k) =>
    `<button class="opt" data-k="${k}" disabled><span class="k">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`).join('');
  opts.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.k));
}

// Called from a tap (Play or Next), which phones need before they allow audio.
function playClip() {
  const r = game.rounds[game.i];
  fx('tap');
  $('playBtn').classList.add('hidden');
  $('countWrap').classList.remove('hidden');
  $('count').textContent = CLIP;
  $('hint').textContent = 'Loading clip…';
  $('stage').classList.add('paused');
  audio.src = r.song.preview;
  audio.currentTime = 0;
  audio.volume = 1;
  const p = audio.play();
  if (p && p.catch) p.catch(() => clipFailed());
}

audio.addEventListener('playing', () => {
  if (!game || !$('play').offsetParent) return;
  const r = game.rounds[game.i];
  $('stage').classList.remove('paused');
  if (r.picked !== null) return;              // already answered, just finishing the clip
  if (timer && timer.paused) { resumeTimer(); return; }
  if (!timer) startTimer();
});
audio.addEventListener('error', () => { if (game && audio.getAttribute('src')) clipFailed(); });

function clipFailed() {
  if (!game) return;
  const r = game.rounds[game.i];
  if (r.picked !== null || timer) return;
  forget(r.song);
  if (game.spares.length) {
    // Swap in a spare song and let the player tap again.
    game.rounds[game.i] = makeRound(game.spares.shift());
    setupRound();
    $('hint').textContent = "That clip didn't load. Here's another song, tap to play";
  } else {
    $('playBtn').classList.remove('hidden');
    $('countWrap').classList.add('hidden');
    $('hint').textContent = "The clip didn't load. Tap to try again";
  }
}

/* ---------------- timer ---------------- */
const RING = 276.46;
function setRing(frac) { $('ringBar').style.strokeDashoffset = String(RING * (1 - Math.max(0, Math.min(1, frac)))); }
function startTimer() {
  timer = { start: performance.now(), used: 0, paused: false, raf: 0 };
  $('options').classList.remove('waiting');
  $('options').querySelectorAll('.opt').forEach(b => b.disabled = false);
  $('hint').textContent = game.rounds[game.i].song.live ? 'Live recording! Which song is this?' : 'Which song is this?';
  tick();
}
function elapsed() { return timer ? timer.used + (timer.paused ? 0 : (performance.now() - timer.start) / 1000) : 0; }
function tick() {
  if (!timer || timer.paused) return;
  const left = CLIP - elapsed();
  setRing(left / CLIP);
  $('count').textContent = Math.max(0, Math.ceil(left));
  $('ring').classList.toggle('low', left <= 5);
  if (left <= 0) { answer(-1); return; }
  timer.raf = requestAnimationFrame(tick);
}
function pauseTimer() {
  if (!timer || timer.paused) return;
  timer.used = elapsed(); timer.paused = true; cancelAnimationFrame(timer.raf);
}
function resumeTimer() {
  if (!timer || !timer.paused) return;
  timer.start = performance.now(); timer.paused = false; tick();
}
function stopTimer() { if (timer) cancelAnimationFrame(timer.raf); timer = null; }

/* ---------------- answering ---------------- */
function answer(k) {
  const r = game.rounds[game.i];
  if (r.picked !== null || !timer) return;
  const left = Math.max(0, CLIP - elapsed());
  const playedFor = elapsed();
  stopTimer();
  r.picked = k;
  const correct = k >= 0 && r.options[k] === r.song.title;
  r.points = correct ? 50 + Math.ceil(left) * 10 : 0;
  game.score += r.points;
  $('scoreNo').textContent = game.score;

  // Let the clip finish its 15 seconds, then stop.
  clearTimeout(clipStop);
  clipStop = setTimeout(stopAudio, Math.max(0, (CLIP - playedFor) * 1000));

  $('options').querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (r.options[j] === r.song.title) b.classList.add('right');
    else if (j === k) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  $('ring').classList.remove('low');
  $('count').textContent = correct ? '✓' : '✗';
  $('hint').textContent = '';
  const v = $('verdict');
  v.className = 'verdict ' + (correct ? 'ok' : 'ko');
  v.textContent = correct ? `+${r.points} points!` : k < 0 ? "Time's up!" : 'Not this time';
  const s = r.song;
  $('reveal').innerHTML = `
    ${s.art ? `<img src="${esc(s.art)}" alt="">` : ''}
    <div style="min-width:0">
      <div class="t">${s.live ? '<span class="livetag">LIVE</span>' : ''}${esc(s.title)}</div>
      <div class="s">${esc([s.album, s.year].filter(Boolean).join(' · '))}</div>
      ${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">Listen on Apple Music ↗</a>` : ''}
    </div>`;
  $('nextBtn').textContent = game.i + 1 < ROUNDS ? 'Next song ▶' : 'See results ▶';
  $('after').classList.remove('hidden');
  fx(correct ? 'ok' : 'ko');
  buzz(correct ? 25 : [40, 60, 40]);
  setTimeout(() => $('after').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
}

function next() {
  game.i++;
  if (game.i >= ROUNDS) { finish(); return; }
  setupRound();
  playClip();   // the Next tap starts the next clip straight away
}

function finish() {
  stopAudio(); stopTimer(); wake(false);
  const best = bestOf(game.level);
  const isBest = game.score > best;
  if (isBest) store.set('best-' + game.level, game.score);
  $('finalLevel').textContent = LEVELS[game.level].name + ' level';
  const right = game.rounds.filter(r => r.points > 0).length;
  $('finalScore').textContent = game.score;
  $('finalLine').textContent = `${right} of ${ROUNDS} songs right · best ${Math.max(best, game.score)}`;
  $('rank').textContent = right === 10 ? 'Champion of the world' : right >= 8 ? 'Rock star' : right >= 5 ? 'Real fan' : right >= 3 ? 'Warming up' : 'Back to the records';
  $('newBest').classList.toggle('hidden', !isBest);
  $('summary').innerHTML = game.rounds.map(r => `
    <li><span class="mk ${r.points ? 'ok' : 'ko'}">${r.points ? '✓' : '✗'}</span>
      <span class="nm">${r.song.live ? '<span class="livetag">LIVE</span>' : ''}${esc(r.song.title)}</span>
      <span class="pts">${r.points ? '+' + r.points : '0'}</span>
      ${r.song.link ? `<a href="${esc(r.song.link)}" target="_blank" rel="noopener" aria-label="Listen on Apple Music">↗</a>` : ''}
    </li>`).join('');
  fx('end');
  show('results');
}

/* ---------------- sharing ---------------- */
function shareText() {
  const right = game.rounds.filter(r => r.points > 0).length;
  const grid = game.rounds.map(r => r.points ? (r.song.live ? '🎤' : '🟩') : '🟥').join('');
  const url = new URL('./', location.href).href;
  return {
    text: `👑 Name That Tune: Queen Edition (${LEVELS[game.level].name})\n` +
          `I scored ${game.score} points and named ${right}/${ROUNDS} songs!\n${grid}\nCan you beat me?`,
    url: /^https?:/.test(url) ? url : '',
  };
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}
async function share() {
  if (!game) return;
  fx('tap');
  const { text, url } = shareText();
  if (navigator.share) {
    try { await navigator.share({ title: 'Name That Tune: Queen Edition', text, ...(url ? { url } : {}) }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const all = url ? text + '\n' + url : text;
  try { await navigator.clipboard.writeText(all); toast('Score copied, paste it to your friends'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = all; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Score copied, paste it to your friends'); } catch { toast("Couldn't share on this device"); }
    ta.remove();
  }
}

function stopAudio() {
  clearTimeout(clipStop);
  try { audio.pause(); } catch {}
}

function quit() {
  stopAudio(); stopTimer(); wake(false);
  game = null; loadToken++;
  paintHome(); show('home');
}

/* ---------------- phone niceties ---------------- */
let lock = null;
async function wake(on) {
  try {
    if (on && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (!game) return;
  if (document.hidden) {
    pauseTimer(); try { audio.pause(); } catch {}
  } else {
    wake(true);
    const r = game.rounds[game.i];
    if (timer && timer.paused && r.picked === null && $('play').offsetParent) {
      $('hint').textContent = 'Paused. Tap ▶ to continue';
      $('countWrap').classList.add('hidden');
      $('playBtn').classList.remove('hidden');
      $('playBtn').onclick = () => {
        $('playBtn').onclick = onPlayTap;
        $('playBtn').classList.add('hidden'); $('countWrap').classList.remove('hidden');
        $('hint').textContent = 'Which song is this?';
        audio.play().catch(() => {});
      };
    }
  }
});
// Android back swipe quits to the start screen instead of closing the app.
window.addEventListener('popstate', () => { if (game) quit(); });

/* ---------------- buttons ---------------- */
const onPlayTap = () => playClip();
$('playBtn').onclick = onPlayTap;
$('loadRetry').onclick = () => startGame(lastLevel);
$('loadHome').onclick = quit;
$('nextBtn').onclick = next;
$('shareBtn').onclick = share;
$('againBtn').onclick = () => startGame(game ? game.level : lastLevel);
$('levelBtn').onclick = () => { game = null; paintHome(); show('home'); };
$('quitBtn').onclick = () => { if (history.state && history.state.qntt) history.back(); else quit(); };

paintHome();
