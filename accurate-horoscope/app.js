// No offline mode: remove this app's old service worker and cache, if a phone still has them.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => { if (r.scope.includes('/accurate-horoscope/')) r.unregister(); })).catch(() => {});
}
if (window.caches) caches.keys().then(ks => ks.forEach(k => { if (k.startsWith('accurate-horoscope-')) caches.delete(k); })).catch(() => {});

// All apps in the arcade share one localStorage, so every key gets this app's prefix.
const APP = 'accurate-horoscope';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = id => document.getElementById(id);
const S = [...document.querySelectorAll('section')];
const QUESTIONS = ['s-date', 's-sign', 's-time', 's-chart'];
const saved = store.get('last', {});
const st = { dob: saved.dob || '', sign: saved.sign || null, time: saved.time || null };
let idx = 0, chartTimer = 0, tense = 1, answers = [], natal = null;

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (iso, o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o));
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function rng(str) {        // FNV-1a hash -> mulberry32: same text in, same numbers out
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const conj = (s, t) => s.replace(/\{([^}]*)\}/g, (_, g) => g.split('|')[t]);

// Where the birth time is read from: the phone's time zone, placed at its main city.
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const HOME = (() => {
  const c = CITIES.find(c => c[4] === TZ);
  if (c) return { name: c[0], lat: c[2], lng: c[3] };
  return { name: TZ.split('/').pop().replace(/_/g, ' '), lat: 40, lng: -new Date().getTimezoneOffset() / 4 };
})();
function tzOffsetMin(tz, date) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(date).forEach(x => p[x.type] = +x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000;
}
function toUTC(dob, time) {
  const [y, m, d] = dob.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let off = 0; try { off = tzOffsetMin(TZ, new Date(guess)); off = tzOffsetMin(TZ, new Date(guess - off * 60000)); } catch {}
  return new Date(guess - off * 60000);
}

// ---------- navigation (Android back swipe steps back) ----------
function show(i) {
  clearTimeout(chartTimer);
  S[idx].classList.remove('on'); idx = Math.max(0, Math.min(S.length - 1, i)); S[idx].classList.add('on');
  window.scrollTo(0, 0); enter(S[idx].id);
}
function next() { history.pushState({ i: idx + 1 }, ''); show(idx + 1); }
history.replaceState({ i: 0 }, '');
addEventListener('popstate', e => show(e.state ? e.state.i : 0));
document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) next(); }));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => history.back()));
$('restart').addEventListener('click', () => history.go(-idx));

function enter(id) {
  const q = QUESTIONS.indexOf(id), dots = S[idx].querySelector('.dots');
  if (dots && q >= 0) dots.innerHTML = QUESTIONS.map((_, i) => `<i class="${i <= q ? 'on' : ''}"></i>`).join('');
  if (id === 's-chart') runChart();
  if (id === 's-scope') renderScope();
  if (id === 's-rate') renderRate();
  if (id === 's-reveal') renderReveal();
  if (id === 's-sky') renderSky();
}
const save = () => store.set('last', { dob: st.dob, sign: st.sign, time: st.time });

// ---------- questions ----------
const dateIn = $('in-date');
dateIn.max = dayKey(new Date());
const dateOk = () => /^\d{4}-\d\d-\d\d$/.test(dateIn.value) && dateIn.value >= '1900-01-01' && dateIn.value <= dateIn.max;
dateIn.value = st.dob;
dateIn.addEventListener('input', () => { $('go-date').disabled = !dateOk(); if (dateOk()) { st.dob = dateIn.value; save(); } });
$('go-date').disabled = !dateOk();

const grid = $('sign-grid');
Astro.SIGNS.forEach(s => {
  const b = el('button', 'chip' + (st.sign === s ? ' on' : ''), s);
  b.addEventListener('click', () => { st.sign = s; save(); grid.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); setTimeout(next, 150); });
  grid.appendChild(b);
});
$('sign-unsure').addEventListener('click', () => { st.sign = null; save(); grid.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); next(); });

const timeIn = $('in-time');
timeIn.value = st.time || '';
timeIn.addEventListener('input', () => { st.time = timeIn.value || null; $('go-time').disabled = !st.time; save(); });
$('go-time').disabled = !st.time;
$('time-unknown').addEventListener('click', () => { st.time = null; timeIn.value = ''; save(); next(); });

// ---------- chart ----------
function computeNatal() {
  const utc = toUTC(st.dob, st.time || '12:00');
  const ch = Astro.chart(utc, HOME.lat, HOME.lng);
  return { utc, sun: Astro.sign(ch.sun), sunLon: ch.sun, moon: Astro.sign(ch.moon), asc: Astro.sign(ch.asc), sunJ2000: ch.sunJ2000 };
}
function runChart() {
  $('chart-wait').hidden = false; $('chart-out').hidden = true; $('go-chart').hidden = true;
  natal = computeNatal();
  chartTimer = setTimeout(() => {
    $('chart-wait').hidden = true; $('chart-out').hidden = false; $('go-chart').hidden = false;
    $('chart-hello').textContent = "Here's your sky.";
    $('c-sun').textContent = natal.sun; $('c-moon').textContent = natal.moon; $('c-asc').textContent = natal.asc;
    const notes = [];
    if (st.sign && st.sign !== natal.sun) {
      const gap = (Astro.SIGNS.indexOf(st.sign) - Astro.SIGNS.indexOf(natal.sun) + 12) % 12, deg = natal.sunLon % 30;
      const edge = (gap === 1 && deg > 28) || (gap === 11 && deg < 2);
      notes.push(edge ? `Not ${st.sign}: you were born close to the line between two signs, and the Sun was in ${natal.sun}.` : `Not ${st.sign}: on that date the Sun was in ${natal.sun}.`);
    }
    if (!st.time) notes.push('No birth time, so noon is assumed. Astrologers do the same.');
    $('c-note').textContent = notes.join(' ');
    $('c-src').textContent = `${fmtDate(st.dob, { day: 'numeric', month: 'short', year: 'numeric' })}, ${st.time || '12:00'}, ${HOME.name} time`;
  }, 1300);
}

// ---------- horoscope: one paragraph of advice, 5-6 sentences ----------
function horoscope(dob, day, t) {
  const r = rng(`accurate|${dob}|${day}`), pick = a => a[Math.floor(r() * a.length)];
  const headline = pick(H.headlines), opener = pick(H.openers), story = pick(H.stories), a1 = pick(H.advice);
  let a2 = pick(H.advice); while (a2 === a1) a2 = pick(H.advice);
  return { headline, text: [conj(opener, t), conj(story, t), a1, a2, pick(H.closers)].join(' ') };
}
const dayOffset = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
function fillCard(card, h, label, extraTop) {
  card.innerHTML = '';
  if (extraTop) card.appendChild(el('p', 'small', extraTop));
  const meta = el('div', 'meta'); meta.append(el('span', '', label[0]), el('span', '', label[1])); card.appendChild(meta);
  card.append(el('h2', '', h.headline), el('p', '', h.text));
}
function renderScope() {
  if (!natal) natal = computeNatal();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', +b.dataset.t === tense));
  const d = dayOffset(tense - 1);
  fillCard($('scope-card'), horoscope(st.dob, dayKey(d), tense), [natal.sun.toUpperCase(), d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })]);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { tense = +b.dataset.t; renderScope(); }));

// ---------- rating ----------
const STATEMENTS = ['It matched my day.', 'It felt written for me.', 'The advice was useful.', "I'd read it again tomorrow."];
function renderRate() {
  const box = $('rate-list'); box.innerHTML = '';
  answers = answers.length ? answers : STATEMENTS.map(() => 0);
  STATEMENTS.forEach((s, qi) => {
    const w = el('div', 'lik'); w.appendChild(el('p', '', s));
    const sc = el('div', 'scale');
    for (let v = 1; v <= 5; v++) {
      const b = el('button', answers[qi] === v ? 'on' : '', v);
      b.addEventListener('click', () => { answers[qi] = v; sc.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j + 1 === v)); $('go-rate').disabled = answers.includes(0); });
      sc.appendChild(b);
    }
    const ends = el('div', 'ends'); ends.append(el('span', '', 'Not at all'), el('span', '', 'Completely'));
    w.append(sc, ends); box.appendChild(w);
  });
  $('go-rate').disabled = answers.includes(0);
}

// ---------- reveal ----------
function renderReveal() {
  const mean = answers.reduce((a, b) => a + b, 0) / answers.length;
  $('score').textContent = Math.round((mean - 1) / 4 * 100) + '%';
  $('how').textContent = 'Each sentence was drawn from a shuffled list, using one number made from your birth date and the day\'s date. Your signs were never used.';
}

// ---------- the real sky ----------
const sig = (x, n = 3) => Number(x.toPrecision(n)).toLocaleString('en-US');
function fmtDist(m) { const km = m / 1000; return km < 1e6 ? sig(km, 4) + ' km' : km < 1e9 ? sig(km / 1e6) + ' M km' : sig(km / 1e9) + ' bn km'; }
function fmtLight(m) { const s = m / Astro.C; return s < 1 ? Math.max(1, Math.round(s * 1000)) + ' ms' : s < 90 ? s.toFixed(1) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; }
const IAU = { Scorpio: 'Scorpius', Capricorn: 'Capricornus' };
function renderSky() {
  if (!natal) natal = computeNatal();
  const out = $('sky-out'), sky = Astro.sky(natal.utc), year = +st.dob.slice(0, 4);
  out.innerHTML = '';
  const fact = html => { const p = el('p', 'fact'); p.innerHTML = html; out.appendChild(p); };
  out.appendChild(el('p', 'small', 'Your birthday · ' + fmtDate(st.dob)));

  const real = Astro.constellation(natal.sunJ2000), drift = Math.round(23.86 + 0.01397 * (year - 2000));
  if (real === (IAU[natal.sun] || natal.sun)) fact(`The Sun stood in front of <b>${real}</b>, but only by luck: Earth's axis has wobbled ~${drift}° since horoscope dates were fixed, 2,000 years ago.`);
  else fact(`You're a <b>${natal.sun}</b>, yet the Sun stood in front of <b>${real}</b>${real === 'Ophiuchus' ? ', the 13th constellation horoscopes leave out' : ''}. Earth's axis has wobbled ~${drift}° since horoscope dates were fixed.`);
  const [star, ly] = SIGN_STARS[natal.sun];
  fact(`<b>${star}</b>, ${natal.sun}'s brightest star, is ~${ly} light-years away. Its light reaching Earth that day left it around ${year - ly}.`);

  const t = el('table'); t.innerHTML = '<tr><th></th><th>Distance</th><th>Light takes</th></tr>';
  const row = b => { const tr = el('tr'); tr.append(el('td', '', b.name), el('td', '', (b.approx ? '~' : '') + fmtDist(b.dist)), el('td', '', fmtLight(b.dist))); t.appendChild(tr); };
  sky.bodies.forEach(row);
  sky.made.forEach(row);
  out.appendChild(t);
  if (!sky.sputnik) out.appendChild(el('p', 'small', 'No artificial satellites yet: Sputnik 1 launched on 4 October 1957.'));
  else if (sky.made.some(m => m.name === 'ISS' || m.name === 'Hubble')) out.appendChild(el('p', 'small', 'ISS and Hubble shown at their height above the ground.'));
  const end = el('p', 'stamp', "Nothing up there could tell your day apart from anyone else's."); end.style.fontSize = '22px'; end.style.marginTop = '8px';
  out.appendChild(end);
  const map = el('div'); map.style.marginTop = '10px'; out.appendChild(map);
  SkyMap(map, natal.utc, { name: HOME.name, lat: HOME.lat, lng: HOME.lng, tz: TZ });
}
