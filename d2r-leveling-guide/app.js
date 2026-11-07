if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// All apps in the Pages repo share one localStorage, so every key gets this app's prefix.
const APP = 'd2r-leveling-guide';
const store = {
  get(k, d) { try { const v = localStorage.getItem(APP + ':' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(APP + ':' + k, JSON.stringify(v)); } catch {} },
};

const STAT_NAMES = { str: 'Strength', dex: 'Dexterity', vit: 'Vitality', ene: 'Energy' };
const STAT_SHORT = { str: 'Str', dex: 'Dex', vit: 'Vit', ene: 'Ene' };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const buildById = id => BUILDS.find(b => b.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const state = {
  chars: store.get('chars', []),
  active: store.get('active', null),
  tab: store.get('tab', 'now'),
  draft: null,
};
if (!state.chars.find(c => c.id === state.active)) state.active = state.chars[0] ? state.chars[0].id : null;

function cur() { return state.chars.find(c => c.id === state.active) || null; }
function save() { store.set('chars', state.chars); store.set('active', state.active); store.set('tab', state.tab); }

function sigil(clsKey, size) {
  const c = CLASSES[clsKey];
  const st = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.1)}px;` : '';
  return `<div class="sigil" style="${st}background:radial-gradient(circle at 35% 30%, #fff6, transparent 55%), ${c.color}">${c.name[0]}</div>`;
}

let simCache = { key: '', res: null };
function sim(c) {
  const key = JSON.stringify([c.build, c.level, c.diff, c.quests, c.maxBlock, c.shieldBlock]);
  if (simCache.key !== key) simCache = { key, res: Engine.simulate(buildById(c.build), c, 99) };
  return simCache.res;
}

const skillName = (cls, id) => CLASSES[cls].skills[id][0];
function addsHtml(cls, ev, opts = {}) {
  const parts = [];
  const sm = opts.short ? ' sm' : '';
  for (const [id, n] of Object.entries(ev.skillAdds)) parts.push(`<span class="add${sm}"><b>+${n}</b>${esc(skillName(cls, id))}</span>`);
  for (const k of ['str', 'dex', 'vit', 'ene']) if (ev.statAdds[k]) parts.push(`<span class="add stat${sm}"><b>+${ev.statAdds[k]}</b>${opts.short ? STAT_SHORT[k] : STAT_NAMES[k]}</span>`);
  return parts.join('');
}

// ---------------- NOW ----------------
function renderNow(c) {
  const b = buildById(c.build), cls = CLASSES[b.cls], r = sim(c), L = c.level;
  const h = r.hist[L], prev = r.hist[L - 1];
  let html = '';

  html += `<section class="card">
    <div class="hero">${sigil(b.cls)}<div class="who"><div class="name">${esc(c.name || cls.name)}</div><div class="build">${esc(cls.name)} · ${esc(b.name)}</div></div>
      <button class="chip-btn" data-act="edit">Edit</button></div>
    <div class="lvl"><button data-act="lvl" data-d="-1" aria-label="Level down">−</button>
      <div class="num"><b>${L}</b><span>Character level</span></div>
      <button data-act="lvl" data-d="1" aria-label="Level up">+</button></div>
    <div class="seg">${DIFFS.map((d, i) => `<button class="${c.diff === i ? 'on' : ''}" data-act="diff" data-i="${i}">${d}</button>`).join('')}</div>
  </section>`;

  // Respec banners
  for (const rs of r.usedRespecs) {
    const where = rs.diff === null ? null : DIFFS[rs.diff];
    const howTo = where ? `Use your <b style="display:inline">${where}</b> respec: make a ${where} game, talk to Akara → "Reset Skills". Then spend everything as shown below.`
      : 'No free respec yet — finish Den of Evil first (any difficulty), or cube a Token of Absolution.';
    if (L >= rs.level && L <= rs.level + 2) {
      html += `<div class="banner respec"><div class="ic">⟲</div><div><b>Respec at level ${rs.level}: ${esc(rs.stage.title.replace(/^Respec → /, ''))}</b>${howTo}</div></div>`;
    } else if (L >= rs.level - 4 && L < rs.level) {
      html += `<div class="banner soon"><div class="ic">⏳</div><div><b>Respec in ${rs.level - L} level${rs.level - L > 1 ? 's' : ''} (level ${rs.level})</b>Keep playing the current setup. At ${rs.level}: ${esc(rs.stage.title)}${where ? ` — uses your ${where} Akara respec.` : '.'}</div></div>`;
    }
  }

  // This level
  const isRespec = h.respec !== null;
  let body = '';
  if (L === 1) body = '<p class="muted">Level 1 has no points yet. Your first skill and stat points arrive at level 2.</p>';
  else {
    body = `<div class="adds">${addsHtml(b.cls, h)}${h.unspentSkill ? `<span class="add save"><b>${h.unspentSkill}</b>skill point${h.unspentSkill > 1 ? 's' : ''} saved</span>` : ''}</div>`;
    if (isRespec) body = `<p class="small" style="color:#ff9c86">After the respec, all points are spent fresh — follow the full lists below.</p>` + body;
    if (h.quests.length) body += `<p class="small muted">Includes quest rewards: ${h.quests.map(q => esc(q.name) + ' (' + DIFFS[q.diff] + ')').join(', ')}.</p>`;
    if (h.unspentSkill) body += `<p class="small muted">Saved points are spent as soon as the next planned skill unlocks.</p>`;
  }
  html += `<section class="card"><h2>${isRespec ? 'Respec allocation' : 'Spend at this level'}<small>Level ${L}</small></h2>${body}</section>`;

  // Skills
  let sk = '';
  cls.trees.forEach((tname, ti) => {
    const rows = Object.entries(cls.skills).filter(([id, s]) => s[1] === ti && h.pts[id]).map(([id, s]) => {
      const p = h.pts[id], pd = isRespec ? 0 : p - ((prev && prev.pts[id]) || 0);
      return `<div class="sk ${pd ? 'new' : ''}"><span class="nm">${esc(s[0])}</span><span class="delta">${pd ? '+' + pd : ''}</span><span class="pts">${p}</span><div class="bar"><i style="width:${p * 5}%"></i></div></div>`;
    }).join('');
    if (rows) sk += `<div class="tree"><h3>${esc(tname)}</h3>${rows}</div>`;
  });
  const spent = Object.values(h.pts).reduce((a, v) => a + v, 0);
  html += `<section class="card"><h2>Skill points<small>${spent} spent${h.unspentSkill ? ` · ${h.unspentSkill} saved` : ''}</small></h2>${sk || '<p class="muted">None yet.</p>'}</section>`;

  // Stats
  const stc = ['str', 'dex', 'vit', 'ene'].map(k => {
    const added = h.stats[k] - cls.base[k], d = h.statAdds[k] && !isRespec ? h.statAdds[k] : 0;
    return `<div class="stat"><div class="k">${STAT_SHORT[k]}</div><div class="v">${h.stats[k]}</div><div class="d ${d ? 'up' : ''}">${d ? '+' + d + ' now' : added ? '+' + added : 'base'}</div></div>`;
  }).join('');
  let blockUi = '';
  if (b.shield) {
    const need = Engine.dexForMaxBlock(L, c.shieldBlock || b.shield);
    blockUi = `<label class="toggle"><input type="checkbox" data-act="maxblock" ${c.maxBlock ? 'checked' : ''}> Go max block (75%)</label>
      ${c.maxBlock ? `<label class="toggle">Shield "Chance to Block" <input type="number" inputmode="numeric" min="10" max="90" value="${c.shieldBlock || b.shield}" data-act="shield">%</label>
      <p class="small muted">Needs ${need} base Dexterity at level ${L} (rises with level). Paladins: add Holy Shield's block bonus to the number.</p>` : ''}`;
  }
  html += `<section class="card"><h2>Stats<small>${h.earnedStat} points earned</small></h2><div class="stats">${stc}</div>
    <p class="small muted" style="margin-top:8px">${esc(b.statNote)}</p>${blockUi}</section>`;

  // Next levels
  let nx = '';
  for (let k = 1; k <= 6 && L + k <= 99; k++) {
    const e = r.hist[L + k];
    nx += `<div class="r ${e.respec ? 'rs' : ''}"><div class="lv">Lv ${L + k}</div><div>${e.respec ? `<span class="tag r">RESPEC → ${esc(e.stage.title.replace(/^Respec → /, ''))}</span><br>` : ''}${e.respec ? '<span class="small muted">Full reallocation — see this level when you get there.</span>' : `<div class="adds">${addsHtml(b.cls, e, { short: true })}</div>` }${!Object.keys(e.skillAdds).length ? '<span class="muted small">Save skill point</span>' : ''}${e.quests.map(q => `<span class="tag qt">${esc(q.name)}</span>`).join('')}</div></div>`;
  }
  if (nx) html += `<section class="card"><h2>Next levels</h2><div class="rows">${nx}</div></section>`;

  // Stage
  const st = h.stage;
  html += `<section class="card"><h2>${st.respec ? 'Build' : 'Leveling phase'}<small>from level ${st.at}</small></h2>
    <p style="font-family:var(--serif);color:var(--gold2);font-size:16px;margin-top:0">${esc(st.title)}</p>
    <p>${esc(st.play)}</p>
    <p class="small"><span class="muted">Mercenary:</span> ${esc(b.merc)}</p>
    ${(st.gear || []).length ? `<div class="label" style="margin-top:10px">Gear goals (self-found)</div>${st.gear.map(rwHtml).join('')}` : ''}
  </section>`;

  // Quests
  html += `<section class="card"><details><summary>Quest rewards</summary>
    <p class="small muted">Ticked = done. Skill/stat points from these are included in the plan. Den of Evil also unlocks that difficulty's Akara respec.</p>
    ${QUESTS.filter(q => q.diff <= c.diff).map(q => {
      const done = c.quests && q.id in c.quests ? c.quests[q.id] : Engine.defaultDone(q, c);
      return `<label class="q"><input type="checkbox" data-act="quest" data-q="${q.id}" ${done ? 'checked' : ''}><span>${DIFFS[q.diff]} · ${esc(q.name)}</span><span class="rew">${q.type === 'skill' ? '+' + q.n + ' skill' : '+5 stats'}${q.respec ? ' · respec' : ''}</span></label>`;
    }).join('')}
  </details></section>`;
  return html;
}

function rwHtml(key) {
  const w = RW[key]; if (!w) return '';
  return `<div class="rw"><div class="t"><b>${esc(w[0])}</b><span class="runes">${esc(w[1])}</span></div><div class="why">${esc(w[2])} · lvl ${w[3]} — ${esc(w[4])}</div></div>`;
}

// ---------------- ROADMAP ----------------
function roadmapRows(c) {
  const b = buildById(c.build), r = sim(c), rows = [];
  for (let L = 2; L <= 99; L++) {
    const e = r.hist[L];
    const sig = JSON.stringify([e.skillAdds, e.statAdds]);
    const special = e.respec || e.quests.length || e.stage.at === L;
    const last = rows[rows.length - 1];
    if (!special && last && !last.special && last.sig === sig && last.to === L - 1) { last.to = L; continue; }
    rows.push({ from: L, to: L, sig, e, special });
  }
  return { rows, r, b };
}

function renderRoad(c) {
  const { rows, r, b } = roadmapRows(c);
  const cls = CLASSES[b.cls];
  let html = `<section class="card"><div class="hero">${sigil(b.cls, 40)}<div class="who"><div class="name">${esc(b.name)}</div><div class="build">${esc(b.tag)}</div></div></div>
    <p class="small" style="margin-top:10px">${esc(b.blurb)}</p>`;
  if (r.usedRespecs.length) {
    html += r.usedRespecs.map((rs, i) => `<div class="banner respec" style="margin:8px 0 0"><div class="ic">⟲</div><div><b>Respec ${i + 1} · level ${rs.level}</b>${esc(rs.stage.title)} — ${rs.diff === null ? 'needs a Den of Evil or Token of Absolution' : 'Akara in ' + DIFFS[rs.diff]}</div></div>`).join('');
    const left = 3 - r.usedRespecs.filter(x => x.diff !== null).length;
    html += `<p class="small muted" style="margin-top:8px">${left} of 3 free respecs left over for experiments later.</p>`;
  } else html += `<div class="banner info" style="margin:8px 0 0"><div class="ic">✓</div><div><b>No respec needed</b>All three Akara respecs stay free for later.</div></div>`;
  html += `</section>`;

  const bands = [[0, 2, 29], [1, 30, 54], [2, 55, 99]];
  for (const [di, a, z] of bands) {
    const list = rows.filter(x => x.from >= a && x.from <= z);
    if (!list.length) continue;
    html += `<div class="dhead">${DIFFS[di]} <small>~lv ${a === 2 ? 1 : a}–${z === 99 ? '99' : z}</small></div><section class="card"><div class="rows">`;
    for (const x of list) {
      const e = x.e, here = c.level >= x.from && c.level <= x.to;
      const lv = x.from === x.to ? x.from : `${x.from}–${x.to}`;
      let content = '';
      if (e.stage.at === x.from && !e.respec && x.from > 2) content += `<span class="tag">${esc(e.stage.title)}</span><br>`;
      if (e.respec) {
        const all = Object.entries(e.pts).sort((p, q) => q[1] - p[1]).map(([id, n]) => `${esc(skillName(b.cls, id))} ${n}`).join(' · ');
        const st = ['str', 'dex', 'vit', 'ene'].map(k => `${STAT_SHORT[k]} ${e.stats[k]}`).join(' · ');
        content += `<span class="tag r">RESPEC${e.respec.diff !== null ? ' · Akara ' + DIFFS[e.respec.diff] : ''}</span> <b style="color:#ffb4a2">${esc(e.stage.title.replace(/^Respec → /, ''))}</b><div class="small" style="margin-top:4px">${all}</div><div class="small muted">Stats: ${st}</div>`;
      } else {
        const sk = Object.entries(e.skillAdds).map(([id, n]) => `${esc(skillName(b.cls, id))}${n > 1 ? ' ×' + n : ''}`).join(', ');
        const stt = ['str', 'dex', 'vit', 'ene'].filter(k => e.statAdds[k]).map(k => `${e.statAdds[k]} ${STAT_SHORT[k]}`).join(' + ');
        content += `${sk ? `<span style="color:var(--text)">${sk}</span>` : '<span class="muted">save skill point</span>'} <span class="tag st">${stt}${x.to > x.from ? ' each' : ''}</span>`;
      }
      content += e.quests.map(q => `<span class="tag qt">${esc(q.name)}</span>`).join('');
      html += `<div class="r ${e.respec ? 'rs' : ''} ${here ? 'cur' : ''}" data-act="goto" data-l="${x.from}"><div class="lv">${lv}</div><div>${content}</div></div>`;
    }
    html += `</div></section>`;
  }
  // Final build summary
  const fin = r.hist[90];
  html += `<section class="card"><h2>At level 90</h2>${cls.trees.map((t, ti) => {
    const s = Object.entries(cls.skills).filter(([id, s]) => s[1] === ti && fin.pts[id]).map(([id, s]) => `${esc(s[0])} <b style="color:var(--gold2)">${fin.pts[id]}</b>`).join(' · ');
    return s ? `<div class="tree"><h3>${esc(t)}</h3><p class="small" style="margin:0">${s}</p></div>` : '';
  }).join('')}<p class="small muted" style="margin-top:10px">Tap any roadmap row to jump the Now tab to that level.</p></section>`;
  return html;
}

// ---------------- OFFLINE ----------------
function renderOffline(c) {
  const b = c ? buildById(c.build) : null;
  let html = `<section class="card"><h2>Akara respecs</h2><ul class="tips">${AKARA.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
  html += `<section class="card"><h2>/players in single player</h2><p class="small muted">Type in chat (Enter). More players = more monster life, more XP and better drop chances.</p>
    <table class="pl"><tr><td>/players 1</td><td>Questing and fast leveling — kills fastest.</td></tr>
    <tr><td>/players 3</td><td>Good balance; Countess and Andariel runs early on.</td></tr>
    <tr><td>/players 5</td><td>Extra XP if you already clear easily.</td></tr>
    <tr><td>/players 8</td><td>Boss and magic-find runs (best drops). Monsters are far tougher.</td></tr></table></section>`;
  html += OFFLINE.map(o => `<section class="card"><h2>${esc(o.diff)}<small>${esc(o.range)}</small></h2><ul class="tips">${o.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('');
  if (b) {
    const keys = [...new Set(b.stages.flatMap(s => s.gear || []))].sort((x, y) => RW[x][3] - RW[y][3]);
    html += `<section class="card"><h2>Runewords for ${esc(b.name)}</h2><p class="small muted">All runewords, including former ladder-only ones, work in offline single player.</p>${keys.map(rwHtml).join('')}</section>`;
  }
  html += `<section class="card"><details><summary>All leveling runewords</summary>${Object.keys(RW).sort((x, y) => RW[x][3] - RW[y][3]).map(rwHtml).join('')}</details></section>`;
  html += `<section class="card"><h2>Max block math</h2><p class="small">Block% = Shield block × (Dex − 15) ÷ (Level × 2), capped at 75%. So the Dexterity you need is <b>15 + 150 × Level ÷ Shield block</b>. Use the "Chance to Block" shown on the shield (it already includes your class bonus).</p></section>`;
  html += `<p class="foot">Plans follow common community leveling routes (Icy Veins, Maxroll) for D2R: Reign of the Warlock, patch 3.2. Skill caps, prerequisites and quest rewards are simulated level by level.<br>Not affiliated with Blizzard Entertainment.</p>`;
  return html;
}

// ---------------- HEROES ----------------
function renderHeroes() {
  let html = `<section class="card"><h2>Your heroes<small>${state.chars.length}</small></h2>`;
  if (!state.chars.length) html += `<div class="empty">No heroes yet.</div>`;
  html += `<div class="heroes">${state.chars.map(c => {
    const b = buildById(c.build);
    return `<div class="h ${c.id === state.active ? 'on' : ''}">${sigil(b.cls, 40)}<div class="who" data-act="pick" data-id="${c.id}"><div class="name" style="font-family:var(--serif);color:var(--gold2)">${esc(c.name || CLASSES[b.cls].name)}</div><div class="small muted">${esc(b.name)} · Lv ${c.level} · ${DIFFS[c.diff]}</div></div>
      <button class="chip-btn" data-act="pick" data-id="${c.id}">Open</button></div>`;
  }).join('')}</div>
    <button class="btn pri" style="width:100%;margin-top:10px" data-act="new">+ New hero</button></section>`;
  return html;
}

// ---------------- SETUP SHEET ----------------
function openSetup(existing) {
  const base = existing ? JSON.parse(JSON.stringify(existing)) : { id: 'c' + Date.now().toString(36), name: '', cls: null, build: null, level: 1, diff: 0, quests: {}, maxBlock: false };
  if (base.build && !base.cls) base.cls = buildById(base.build).cls;
  state.draft = { ...base, editing: !!existing };
  history.pushState({ sheet: 1 }, '');
  renderSheet();
}
function closeSetup() { state.draft = null; document.getElementById('sheet').innerHTML = ''; document.body.style.overflow = ''; }

function renderSheet() {
  const d = state.draft, el = document.getElementById('sheet');
  if (!d) { el.innerHTML = ''; return; }
  document.body.style.overflow = 'hidden';
  const builds = d.cls ? BUILDS.filter(b => b.cls === d.cls) : [];
  el.innerHTML = `<div class="sheet"><div class="wrap">
    <h1>${d.editing ? 'Edit hero' : 'New hero'}</h1>
    <div class="label">Name (optional)</div>
    <input class="txt" maxlength="24" placeholder="e.g. Kashya's Bane" value="${esc(d.name)}" data-act="dname">
    <div class="label">Class</div>
    <div class="classes">${Object.entries(CLASSES).map(([k, cl]) => `<button class="cls ${d.cls === k ? 'on' : ''}" data-act="dcls" data-k="${k}">${sigil(k)}${cl.name}</button>`).join('')}</div>
    ${d.cls ? `<div class="label">Build you want to end up with</div>${builds.map(b => `<button class="bcard ${d.build === b.id ? 'on' : ''}" data-act="dbuild" data-id="${b.id}">
      <div class="bn">${esc(b.name)}<span class="pill ${b.respecs ? 'r' : 'g'}">${b.respecs ? b.respecs + ' respec' : 'no respec'}</span></div>
      <div class="bt">${esc(b.tag)}</div><div class="bb">${esc(b.blurb)}</div></button>`).join('')}` : ''}
    <div class="label">Current level</div>
    <div class="lvl" style="margin-top:0"><button data-act="dlvl" data-d="-1">−</button><div class="num"><b>${d.level}</b><span>level</span></div><button data-act="dlvl" data-d="1">+</button></div>
    <div class="label">Difficulty you are playing</div>
    <div class="seg" style="margin-top:0">${DIFFS.map((x, i) => `<button class="${d.diff === i ? 'on' : ''}" data-act="ddiff" data-i="${i}">${x}</button>`).join('')}</div>
    <p class="small muted" style="margin-top:14px">Changing class or build later is fine — the plan is recalculated instantly. If you are already past a respec point, use a respec and copy the allocation from the Now tab.</p>
  </div>
  <div class="sheetbar">
    ${d.editing ? '<button class="btn danger" data-act="ddel">Delete</button>' : ''}
    ${state.chars.length || d.editing ? '<button class="btn" data-act="dcancel">Cancel</button>' : ''}
    <button class="btn pri" data-act="dsave" ${d.build ? '' : 'disabled style="opacity:.45"'}>${d.editing ? 'Save' : 'Start guide'}</button>
  </div></div>`;
}

// ---------------- MAIN RENDER ----------------
function render() {
  const app = document.getElementById('app'), c = cur();
  let tab = state.tab;
  if (!c && tab !== 'offline') tab = 'heroes';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.getElementById('heroBtn').textContent = c ? `${CLASSES[buildById(c.build).cls].name} · ${c.level}` : 'Heroes';
  // Replacing the content would otherwise reset the scroll position, so keep it.
  const y = window.scrollY;
  app.style.minHeight = app.offsetHeight + 'px';
  app.innerHTML = tab === 'now' ? renderNow(c) : tab === 'road' ? renderRoad(c) : tab === 'offline' ? renderOffline(c) : renderHeroes();
  app.style.minHeight = '';
  const tabChanged = render.lastTab !== tab;
  render.lastTab = tab;
  if (tabChanged) {
    window.scrollTo(0, 0);
    const here = tab === 'road' && app.querySelector('.r.cur');
    if (here) here.scrollIntoView({ block: 'center' });
  } else {
    window.scrollTo(0, y);
  }
}

function setLevel(c, L) {
  c.level = clamp(L, 1, 99);
  save(); render();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, c = cur(), d = state.draft;
  switch (act) {
    case 'tab': state.tab = t.dataset.tab; save(); render(); window.scrollTo(0, 0); break;
    case 'lvl': if (c) setLevel(c, c.level + Number(t.dataset.d)); break;
    case 'diff': if (c) { c.diff = Number(t.dataset.i); save(); render(); } break;
    case 'edit': if (c) openSetup(c); break;
    case 'goto': if (c) { c.level = Number(t.dataset.l); state.tab = 'now'; save(); render(); window.scrollTo(0, 0); } break;
    case 'pick': state.active = t.dataset.id; state.tab = 'now'; render.lastTab = null; save(); render(); break;
    case 'new': openSetup(null); break;
    case 'dcls': d.cls = t.dataset.k; if (!d.build || buildById(d.build).cls !== d.cls) d.build = null; renderSheet(); break;
    case 'dbuild': d.build = t.dataset.id; renderSheet(); break;
    case 'dlvl': d.level = clamp(d.level + Number(t.dataset.d), 1, 99); if (d.level >= 55 && d.diff < 2 && !d.diffTouched) d.diff = 2; else if (d.level >= 30 && d.diff < 1 && !d.diffTouched) d.diff = 1; renderSheet(); break;
    case 'ddiff': d.diff = Number(t.dataset.i); d.diffTouched = true; renderSheet(); break;
    case 'dcancel': history.back(); break;
    case 'ddel':
      if (d.editing && confirmDelete(d)) {
        state.chars = state.chars.filter(x => x.id !== d.id);
        if (state.active === d.id) state.active = state.chars[0] ? state.chars[0].id : null;
        save(); history.back();
      }
      break;
    case 'dsave': {
      if (!d.build) break;
      const { editing, cls, diffTouched, ...obj } = d;
      obj.name = (obj.name || '').trim();
      const i = state.chars.findIndex(x => x.id === obj.id);
      if (i >= 0) state.chars[i] = obj; else state.chars.push(obj);
      state.active = obj.id; state.tab = 'now'; render.lastTab = null; save();
      history.back();
      break;
    }
  }
});
let deleteArmed = null;
function confirmDelete(d) {
  // Two taps instead of a blocking confirm() dialog.
  if (deleteArmed === d.id) { deleteArmed = null; return true; }
  deleteArmed = d.id;
  const btn = document.querySelector('[data-act="ddel"]');
  if (btn) btn.textContent = 'Tap again';
  setTimeout(() => { if (deleteArmed === d.id) { deleteArmed = null; if (btn) btn.textContent = 'Delete'; } }, 2500);
  return false;
}

document.addEventListener('change', e => {
  const t = e.target, c = cur();
  if (t.dataset.act === 'quest' && c) { c.quests = { ...(c.quests || {}), [t.dataset.q]: t.checked }; save(); render(); }
  if (t.dataset.act === 'maxblock' && c) { c.maxBlock = t.checked; save(); render(); }
  if (t.dataset.act === 'shield' && c) { c.shieldBlock = clamp(Number(t.value) || 0, 10, 90); save(); render(); }
});
document.addEventListener('input', e => {
  if (e.target.dataset.act === 'dname' && state.draft) state.draft.name = e.target.value;
});
window.addEventListener('popstate', () => { if (state.draft) { closeSetup(); render(); } });

render();
if (!state.chars.length) openSetup(null);
