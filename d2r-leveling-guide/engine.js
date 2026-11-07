// Level-by-level simulator: skills (prereqs, required level, hard-point cap), stats, quests, Akara respecs.
(function (root) {
  const STAT_KEYS = ['str', 'dex', 'vit', 'ene'];

  function questCredit(char) {
    // Returns { level: [{quest, done}] } — when each quest's reward lands in the plan.
    const out = {};
    for (const q of QUESTS) {
      const explicit = char.quests && Object.prototype.hasOwnProperty.call(char.quests, q.id) ? char.quests[q.id] : undefined;
      const done = explicit !== undefined ? explicit : defaultDone(q, char);
      let at = done ? Math.min(Math.max(q.lvl, 2), char.level) : Math.max(q.lvl, char.level + 1);
      at = Math.max(2, at);
      (out[at] = out[at] || []).push({ q, done });
    }
    return out;
  }
  function defaultDone(q, char) {
    if (q.diff < char.diff) return true;
    if (q.diff > char.diff) return false;
    return char.level >= q.lvl;
  }

  function dexForMaxBlock(level, blockPct) {
    if (!blockPct || blockPct <= 0) return 0;
    return Math.ceil(15 + (75 * 2 * level) / blockPct);
  }

  function statTarget(build, key, level, char) {
    let t = 0;
    for (const [lv, v] of (build.stats[key] || [])) if (level >= lv) t = v;
    if (key === 'dex' && build.shield && char.maxBlock) t = Math.max(t, Math.min(400, dexForMaxBlock(level, char.shieldBlock || build.shield)));
    return t;
  }

  function simulate(build, char, maxLevel = 99) {
    const cls = CLASSES[build.cls];
    const S = cls.skills;
    const stages = build.stages.slice().sort((a, b) => a.at - b.at);
    const credit = questCredit(char);
    const cap = (id, L) => Math.min(20, L - S[id][2] + 1);

    let pts = {}, earnedSkill = 0, unspentSkill = 0;
    let alloc = { str: 0, dex: 0, vit: 0, ene: 0 }, earnedStat = 0, unspentStat = 0;
    const respecPool = []; // difficulties whose Den of Evil is done
    const usedRespecs = [];
    const hist = [null];

    function missingPrereq(id) {
      for (const p of S[id][3]) {
        if (!pts[p]) return missingPrereq(p) || p;
      }
      return null;
    }
    function pick(L, pri) {
      for (const d of pri) {
        const [s, n, minL] = d;
        if (minL && L < minL) continue;
        const ids = Array.isArray(s) ? s : [s];
        const cands = ids.filter(id => S[id][2] <= L && (pts[id] || 0) < n && (pts[id] || 0) < cap(id, L));
        if (!cands.length) continue;
        cands.sort((a, b) => (pts[a] || 0) - (pts[b] || 0));
        const id = cands[0];
        return missingPrereq(id) || id;
      }
      return null;
    }

    for (let L = 1; L <= maxLevel; L++) {
      const ev = { level: L, skillAdds: {}, statAdds: {}, quests: [], respec: null, stage: null };
      if (L > 1) { earnedSkill++; unspentSkill++; earnedStat += 5; unspentStat += 5; }
      for (const { q } of (credit[L] || [])) {
        ev.quests.push(q);
        if (q.type === 'skill') { earnedSkill += q.n; unspentSkill += q.n; }
        else { earnedStat += q.n; unspentStat += q.n; }
        if (q.respec) respecPool.push(q.diff);
      }
      let stage = stages[0];
      for (const st of stages) if (st.at <= L) stage = st;
      ev.stage = stage;
      if (stage.respec && stage.at === L) {
        const d = respecPool.length ? respecPool.shift() : null;
        ev.respec = { diff: d, stage };
        usedRespecs.push({ level: L, diff: d, stage });
        pts = {}; unspentSkill = earnedSkill;
        alloc = { str: 0, dex: 0, vit: 0, ene: 0 }; unspentStat = earnedStat;
      }
      // skills
      let guard = 0;
      while (unspentSkill > 0 && guard++ < 500) {
        const id = pick(L, stage.pri);
        if (!id) break;
        pts[id] = (pts[id] || 0) + 1; unspentSkill--;
        ev.skillAdds[id] = (ev.skillAdds[id] || 0) + 1;
      }
      // stats: fill str, dex, ene targets in order; rest vitality
      for (const k of ['str', 'dex', 'ene']) {
        const need = statTarget(build, k, L, char) - (cls.base[k] + alloc[k]);
        const give = Math.max(0, Math.min(need, unspentStat));
        if (give) { alloc[k] += give; unspentStat -= give; ev.statAdds[k] = give; }
      }
      if (unspentStat > 0) { alloc.vit += unspentStat; ev.statAdds.vit = unspentStat; unspentStat = 0; }

      hist.push({ ...ev, pts: { ...pts }, alloc: { ...alloc }, unspentSkill, earnedSkill, earnedStat,
        stats: Object.fromEntries(STAT_KEYS.map(k => [k, cls.base[k] + alloc[k]])) });
    }
    return { hist, usedRespecs, stages };
  }

  function diffLabelForLevel(L) { return L < 30 ? 0 : L < 55 ? 1 : 2; }

  root.Engine = { simulate, questCredit, defaultDone, dexForMaxBlock, statTarget, diffLabelForLevel, STAT_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
