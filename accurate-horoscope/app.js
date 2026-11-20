if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All apps in the arcade share one localStorage, so every key gets this app's prefix.
const APP = 'accurate-horoscope';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const $ = id => document.getElementById(id);
const S = [...document.querySelectorAll('section')];
const QUESTIONS = ['s-name', 's-date', 's-sign', 's-time', 's-place', 's-chart'];
const st = Object.assign({ name: '', dob: '', sign: null, time: null, city: null }, store.get('last', {}));
let idx = 0, chartTimer = 0, tense = 1, answers = [], natal = null;

// ---------- helpers ----------
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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

// Local birth time in a city -> UTC instant (uses the browser's time-zone history).
function tzOffsetMin(tz, date) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(date).forEach(x => p[x.type] = +x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(date.getTime() / 60000) * 60000) / 60000;
}
function toUTC(dob, time, tz) {
  const [y, m, d] = dob.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let off = 0; try { off = tzOffsetMin(tz, new Date(guess)); off = tzOffsetMin(tz, new Date(guess - off * 60000)); } catch {}
  return { date: new Date(guess - off * 60000), off };
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
const save = () => store.set('last', { name: st.name, dob: st.dob, sign: st.sign, time: st.time, city: st.city });

// ---------- questions ----------
const nameIn = $('in-name');
nameIn.value = st.name;
nameIn.addEventListener('input', () => { st.name = nameIn.value.trim(); save(); });
nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { nameIn.blur(); next(); } });

const dateIn = $('in-date');
dateIn.max = dayKey(new Date());
const dateOk = () => /^\d{4}-\d\d-\d\d$/.test(dateIn.value) && dateIn.value >= '1900-01-01' && dateIn.value <= dateIn.max;
dateIn.value = st.dob || '';
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

const placeIn = $('in-place'), list = $('place-list');
function renderPlaces() {
  const q = fold(placeIn.value.trim()); list.innerHTML = '';
  let hits = [];
  if (q) {
    const scored = CITIES.map((c, i) => { const n = fold(c[0]), k = fold(c[1]);
      return [n.startsWith(q) ? 0 : n.includes(q) ? 1 : k.startsWith(q) ? 2 : 9, i]; }).filter(x => x[0] < 9);
    scored.sort((a, b) => a[0] - b[0] || CITIES[a[1]][0].localeCompare(CITIES[b[1]][0]));
    hits = scored.slice(0, 6).map(x => x[1]);
  } else if (st.city != null) hits = [st.city];
  hits.forEach(i => {
    const b = el('button', 'chip' + (i === st.city ? ' on' : ''), CITIES[i][0]); b.appendChild(el('small', '', CITIES[i][1]));
    b.addEventListener('click', () => { st.city = i; save(); placeIn.value = CITIES[i][0]; placeIn.blur(); renderPlaces(); $('go-place').disabled = false; });
    list.appendChild(b);
  });
  if (q && !hits.length) list.appendChild(el('p', 'small', 'No match. Try a bigger city nearby.'));
}
placeIn.addEventListener('input', () => { if (st.city != null && placeIn.value !== CITIES[st.city][0]) { st.city = null; $('go-place').disabled = true; } renderPlaces(); });
if (st.city != null && CITIES[st.city]) { placeIn.value = CITIES[st.city][0]; $('go-place').disabled = false; } else st.city = null;
renderPlaces();

// ---------- chart ----------
function computeNatal() {
  const c = CITIES[st.city], t = toUTC(st.dob, st.time || '12:00', c[4]);
  const ch = Astro.chart(t.date, c[2], c[3]);
  return { utc: t.date, off: t.off, city: c, sun: Astro.sign(ch.sun), sunLon: ch.sun, moon: Astro.sign(ch.moon), asc: Astro.sign(ch.asc), sunJ2000: ch.sunJ2000 };
}
function runChart() {
  $('chart-wait').hidden = false; $('chart-out').hidden = true; $('go-chart').hidden = true;
  natal = computeNatal();
  chartTimer = setTimeout(() => {
    $('chart-wait').hidden = true; $('chart-out').hidden = false; $('go-chart').hidden = false;
    $('chart-hello').textContent = st.name ? `${st.name}, here's your sky.` : "Here's your sky.";
    $('c-sun').textContent = natal.sun; $('c-moon').textContent = natal.moon; $('c-asc').textContent = natal.asc;
    const notes = [];
    if (st.sign && st.sign !== natal.sun) {
      const gap = (Astro.SIGNS.indexOf(st.sign) - Astro.SIGNS.indexOf(natal.sun) + 12) % 12, deg = natal.sunLon % 30;
      const edge = (gap === 1 && deg > 28) || (gap === 11 && deg < 2);
      notes.push(edge ? `Not ${st.sign}: you were born close to the line between two signs, and the Sun was in ${natal.sun}.` : `Not ${st.sign}: on that date the Sun was in ${natal.sun}.`);
    }
    if (!st.time) notes.push('No birth time, so noon is assumed. Astrologers do the same.');
    $('c-note').textContent = notes.join(' ');
    const o = natal.off, sign = o < 0 ? '−' : '+', oh = Math.floor(Math.abs(o) / 60), om = Math.abs(o) % 60;
    $('c-src').textContent = `${fmtDate(st.dob, { day: 'numeric', month: 'short', year: 'numeric' })}, ${st.time || '12:00'}, ${natal.city[0]} (UTC${sign}${oh}${om ? ':' + pad(om) : ''})`;
  }, 1300);
}

// ---------- horoscope ----------
function horoscope(dob, day, t, signs) {
  const r = rng(`accurate|${dob}|${day}`), pick = a => a[Math.floor(r() * a.length)];
  const headline = pick(H.headlines), planet = pick(H.planets), aspect = pick(H.aspects);
  const target = [`${signs.sun} Sun`, `${signs.moon} Moon`, `${signs.asc} rising`][Math.floor(r() * 3)];
  const house = pick(H.houses), story = pick(H.stories), advice = pick(H.advice), colour = pick(H.colours);
  const number = 1 + Math.floor(r() * 99), love = 1 + Math.floor(r() * 5), work = 1 + Math.floor(r() * 5), energy = 1 + Math.floor(r() * 5);
  return {
    headline, advice, colour, number, love, work, energy,
    sky: `${planet} ${conj('{was|is|will be}', t)} ${aspect} your ${target}, in your ${house} house.`,
    story: conj(story, t),
  };
}
const dayOffset = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const bar = n => '●'.repeat(n) + '○'.repeat(5 - n);
function fillCard(card, h, label, t, extraTop) {
  card.innerHTML = '';
  if (extraTop) card.appendChild(el('p', 'small', extraTop));
  const meta = el('div', 'meta'); meta.append(el('span', '', label[0]), el('span', '', label[1])); card.appendChild(meta);
  card.append(el('h2', '', h.headline), el('p', 'small', h.sky), el('p', '', h.story));
  const tip = el('p', ''); tip.append(el('b', '', (t === 0 ? 'Lesson' : 'Tip') + '  ')); tip.querySelector('b').style.color = 'var(--gold)';
  tip.append(h.advice); card.appendChild(tip);
  const m = el('div', 'meter');
  [['Love', h.love], ['Work', h.work], ['Energy', h.energy]].forEach(([k, v]) => { const s = el('span', '', k + ' '); s.appendChild(el('i', '', bar(v))); m.appendChild(s); });
  card.appendChild(m);
  card.appendChild(el('p', 'small', `Lucky number ${h.number} · Lucky colour ${h.colour}`));
}
function renderScope() {
  if (!natal) natal = computeNatal();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', +b.dataset.t === tense));
  const d = dayOffset(tense - 1);
  const h = horoscope(st.dob, dayKey(d), tense, natal);
  fillCard($('scope-card'), h, [natal.sun.toUpperCase(), d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })], tense);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { tense = +b.dataset.t; renderScope(); }));

// ---------- rating ----------
const STATEMENTS = ['It matched my day.', 'It felt written for me.', 'The tip was useful.', "I'd read it again tomorrow."];
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
function stranger() {
  const t = Date.UTC(1950, 0, 1) + Math.random() * (Date.UTC(2010, 0, 1) - Date.UTC(1950, 0, 1));
  const d = new Date(t), iso = d.toISOString().slice(0, 10);
  const c = Astro.chart(new Date(iso + 'T12:00:00Z'), 0, 0);
  const signs = { sun: Astro.sign(c.sun), moon: Astro.sign(c.moon), asc: Astro.SIGNS[Math.floor(Math.random() * 12)] };
  const h = horoscope(iso, dayKey(dayOffset(0)), 1, signs);
  fillCard($('other-card'), h, [signs.sun.toUpperCase(), 'Today'], 1, `Today, a ${signs.sun} born ${fmtDate(iso)} got:`);
}
$('other-btn').addEventListener('click', stranger);
function renderReveal() {
  const mean = answers.reduce((a, b) => a + b, 0) / answers.length;
  $('score').textContent = Math.round((mean - 1) / 4 * 100) + '%';
  $('how').textContent = 'Each line was drawn from a shuffled list, using one number made from your birth date and the day\'s date. Your signs were only pasted in by name.';
  $('forer').textContent = `In 1949, psychologist Bertram Forer gave every student the same generic profile. They rated it 4.3 out of 5. You gave yours ${mean.toFixed(1)}.`;
  stranger();
}

// ---------- the real sky ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sig = (x, n = 3) => Number(x.toPrecision(n)).toLocaleString('en-US');
function fmtDist(m) { const km = m / 1000; return km < 1e6 ? sig(km, 4) + ' km' : km < 1e9 ? sig(km / 1e6) + ' M km' : sig(km / 1e9) + ' bn km'; }
function fmtLight(m) { const s = m / Astro.C; return s < 1 ? Math.max(1, Math.round(s * 1000)) + ' ms' : s < 90 ? s.toFixed(1) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; }
function fmtWin(x) {
  if (x < 1e6) return sig(x, 2) + '×';
  const e = Math.floor(Math.log10(x)), mnt = Math.round(x / 10 ** e);
  const sup = n => [...String(n)].map(c => SUP[c]).join('');
  return mnt === 10 ? '10' + sup(e + 1) : `${mnt} × 10${sup(e)}`;
}
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

  const t = el('table'); t.innerHTML = '<tr><th></th><th>Distance</th><th>Light</th><th>Doctor wins by</th></tr>';
  const row = (name, b, note) => {
    const tr = el('tr'), td = el('td', '', name); if (note) { td.append(' '); td.appendChild(el('small', '', note)); }
    tr.append(td, el('td', '', (b.approx ? '~' : '') + fmtDist(b.dist)), el('td', '', fmtLight(b.dist)), el('td', '', fmtWin(Astro.doctorWins(b.mass, b.dist))));
    t.appendChild(tr);
  };
  sky.bodies.forEach(b => row(b.name, b));
  const made = sky.made.slice();
  if (sky.sputnik && !made.some(m => m.name === 'ISS' || m.name === 'Hubble')) made.unshift({ name: 'A satellite', dist: 4e5, mass: 1000, note: '1 t' });
  made.forEach(b => row(b.name, b, b.note === '1 t' ? '1 t' : ''));
  out.appendChild(t);
  if (!sky.sputnik) out.appendChild(el('p', 'small', 'No artificial satellites yet: Sputnik 1 launched on 4 October 1957.'));
  out.appendChild(el('p', 'small', 'Doctor: 70 kg, 1 m from you. Compared by tidal pull, the only part of gravity that can push or stretch a body; the rest moves you and Earth together. Satellites assumed directly overhead.'));
  const end = el('p', 'stamp', "Nothing up there could tell your day apart from anyone else's."); end.style.fontSize = '22px'; end.style.marginTop = '8px';
  out.appendChild(end);
}
