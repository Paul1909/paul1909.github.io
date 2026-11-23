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
const QUESTIONS = ['s-date', 's-sign', 's-time', 's-place', 's-chart'];
const saved = store.get('last', {});
const st = { dob: saved.dob || '', sign: saved.sign || null, time: saved.time || null, place: saved.place || null };
let idx = 0, chartTimer = 0, answers = [], natal = null;

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (iso, o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o));
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// Fallback when the birthplace is unknown: the phone's time zone, placed at its main city.
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
const HOME = (() => {
  const c = CITIES.find(c => c[4] === TZ);
  if (c) return { name: c[0], lat: c[2], lng: c[3], tz: TZ };
  return { name: TZ.split('/').pop().replace(/_/g, ' '), lat: 40, lng: -new Date().getTimezoneOffset() / 4, tz: TZ };
})();
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
const save = () => store.set('last', { dob: st.dob, sign: st.sign, time: st.time, place: st.place });

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

// ---------- birthplace: OpenStreetMap search (Photon), time zone looked up from coordinates ----------
const placeIn = $('in-place'), placeList = $('place-list');
let searchCtl = null, searchTimer = 0;
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function choosePlace(p) {
  let tz = 'UTC'; try { tz = tzlookup(p.lat, p.lng); } catch {}
  st.place = { name: p.name, sub: p.sub, lat: p.lat, lng: p.lng, tz }; save();
  placeIn.value = p.name; placeIn.blur(); showPlaces([p]); $('go-place').disabled = false;
}
function showPlaces(list, msg) {
  placeList.innerHTML = '';
  list.forEach(p => {
    const b = el('button', 'chip' + (st.place && st.place.lat === p.lat && st.place.lng === p.lng ? ' on' : ''), p.name);
    if (p.sub) b.appendChild(el('small', '', p.sub));
    b.addEventListener('click', () => choosePlace(p));
    placeList.appendChild(b);
  });
  if (msg) placeList.appendChild(el('p', 'small', msg));
}
const join = (...a) => a.filter((x, i) => x && a.indexOf(x) === i).join(', ');
async function photon(q, signal) {
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place`, { signal });
  if (!r.ok) throw r.status;
  return (await r.json()).features.map(f => { const p = f.properties, [lng, lat] = f.geometry.coordinates;
    return { name: p.name, sub: join(p.county !== p.name && p.state !== p.county ? p.county : '', p.state !== p.name ? p.state : '', p.country !== p.name ? p.country : ''), lat, lng }; });
}
async function nominatim(q, signal) {   // used only on Enter, as Nominatim asks
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=en&q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw r.status;
  return (await r.json()).map(x => { const parts = x.display_name.split(', ').filter(t => !/\d/.test(t)), n = parts.length;
    return { name: x.name || parts[0], sub: join(n > 2 ? parts[n - 2] : '', n > 1 ? parts[n - 1] : ''), lat: +x.lat, lng: +x.lon }; });
}
function localPlaces(q) {
  const f = fold(q);
  return CITIES.filter(c => fold(c[0]).startsWith(f)).slice(0, 6).map(c => ({ name: c[0], sub: c[1], lat: c[2], lng: c[3] }));
}
async function searchPlaces(q, enter) {
  if (searchCtl) searchCtl.abort();
  if (q.length < 2) { showPlaces([]); return; }
  const ctl = searchCtl = new AbortController();
  let res = null;
  try { res = await photon(q, ctl.signal); } catch (e) { if (ctl.signal.aborted) return; }
  if (!res && enter) { try { res = await nominatim(q, ctl.signal); } catch (e) { if (ctl.signal.aborted) return; } }
  if (ctl !== searchCtl) return;
  const seen = new Set();
  res = (res || []).filter(p => { const k = p.name + '|' + p.sub; if (seen.has(k) || !p.name) return false; seen.add(k); return true; }).slice(0, 7);
  if (res.length) showPlaces(res);
  else { const loc = localPlaces(q); showPlaces(loc, loc.length ? 'No connection: showing big cities only.' : 'Nothing found. Try another spelling or a nearby town.'); }
}
placeIn.addEventListener('input', () => {
  if (st.place && placeIn.value !== st.place.name) { st.place = null; save(); $('go-place').disabled = true; }
  clearTimeout(searchTimer); searchTimer = setTimeout(() => searchPlaces(placeIn.value.trim(), false), 350);
});
placeIn.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); searchPlaces(placeIn.value.trim(), true); } });
$('place-skip').addEventListener('click', () => { st.place = null; placeIn.value = ''; save(); showPlaces([]); next(); });
if (st.place) { placeIn.value = st.place.name; showPlaces([st.place]); $('go-place').disabled = false; }

// ---------- chart ----------
function computeNatal() {
  const loc = st.place || HOME, t = toUTC(st.dob, st.time || '12:00', loc.tz), utc = t.date;
  const ch = Astro.chart(utc, loc.lat, loc.lng);
  return { utc, loc, off: t.off, sun: Astro.sign(ch.sun), sunLon: ch.sun, moon: Astro.sign(ch.moon), asc: Astro.sign(ch.asc), sunJ2000: ch.sunJ2000 };
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
    if (!st.place) notes.push(`No birthplace, so your phone's time zone (${HOME.name}) is used.`);
    $('c-note').textContent = notes.join(' ');
    const o = natal.off, oh = Math.floor(Math.abs(o) / 60), om = Math.abs(o) % 60;
    $('c-src').textContent = `${fmtDate(st.dob, { day: 'numeric', month: 'short', year: 'numeric' })}, ${st.time || '12:00'}, ${natal.loc.name} (UTC${o < 0 ? '−' : '+'}${oh}${om ? ':' + pad(om) : ''})`;
  }, 1300);
}

// ---------- horoscope: Forer's 1949 profile, identical for everyone ----------
const dayOffset = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
function renderScope() {
  if (!natal) natal = computeNatal();
  const d = dayOffset(0);
  const card = $('scope-card'); card.innerHTML = '';
  const meta = el('div', 'meta'); meta.append(el('span', '', natal.sun.toUpperCase()), el('span', '', d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })));
  card.append(meta, el('p', '', FORER));
}

// ---------- rating ----------
const STATEMENTS = ['It describes me accurately.', 'It felt written for me.', 'It captures my personality.', "I'd read it again tomorrow."];
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
  const how = $('how'); how.innerHTML = '';
  how.append('Every sign gets these exact words, every day. This is the text from the Forer study of 1949. ');
  const a = el('a', '', 'The Barnum effect on Wikipedia'); a.href = 'https://en.wikipedia.org/wiki/Barnum_effect'; a.target = '_blank'; a.rel = 'noopener';
  how.appendChild(a);
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
  const head = el('p', 'q', 'Some interesting facts about celestial objects on the day you were born:'); head.style.fontSize = '22px'; out.appendChild(head);
  out.appendChild(el('p', 'small', fmtDate(st.dob)));

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
  SkyMap(map, natal.utc, { name: natal.loc.name, lat: natal.loc.lat, lng: natal.loc.lng, tz: natal.loc.tz });
}
