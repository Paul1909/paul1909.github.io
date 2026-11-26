'use strict';
// Render worker: computes one block of rows at a time and hands back smooth iteration values.
importScripts('fractal.js');

let refGen = -1, orb = null, orbLen = 0;

onmessage = ({ data: j }) => {
  if (j.type === 'ref') { refGen = j.gen; orb = j.orbit; orbLen = j.len; return; }
  if (j.kind === 'p' && j.gen !== refGen) { postMessage({ gen: j.gen, pass: j.pass, y0: j.y0, y1: j.y1, out: null }); return; }
  const out = renderRows(j, orb, orbLen);
  postMessage({ gen: j.gen, pass: j.pass, y0: j.y0, y1: j.y1, out }, [out.buffer]);
};
