// Chess piece artwork (original SVG), used both in the DOM and as images for explosion shards.
'use strict';

const Pieces = (() => {
  const COLORS = {
    w: { f: '#f6f0e2', s: '#1b1e26', d: '#1b1e26' },
    b: { f: '#2a2f39', s: '#07080b', d: '#d9cfb6' },
  };
  const BASE = '<rect x="22" y="78" width="56" height="10" rx="4"/>';
  const SHAPES = {
    p: () => `<path d="M37 79 C37 64 42 55 45 47 H55 C58 55 63 64 63 79 Z"/>
      <rect x="36" y="42" width="28" height="7" rx="3.5"/><circle cx="50" cy="29" r="12.5"/>${BASE}`,
    r: d => `<path d="M31 79 L34 46 H66 L69 79 Z"/>
      <path d="M27 47 V20 H37 V28 H45 V20 H55 V28 H63 V20 H73 V47 Z"/>${BASE}
      <path d="M36 56 H64" stroke="${d}" stroke-width="3" fill="none"/>`,
    n: d => `<path d="M35 79 C34 66 40 58 47 50 C42 52 36 54 31 57 C27 60 21 58 20 53 C19 49 21 46 24 43 L35 28 C36 23 39 19 43 17 L44 9 L51 15 C61 16 70 25 71 40 C72 55 68 67 67 79 Z"/>${BASE}
      <circle cx="40" cy="29" r="3.2" fill="${d}" stroke="none"/>
      <path d="M52 19 C61 23 65 33 65 46" stroke="${d}" stroke-width="2.6" fill="none"/>`,
    b: d => `<path d="M41 65 C41 72 34 75 32 79 H68 C66 75 59 72 59 65 Z"/>
      <path d="M50 20 C35 32 31 47 38 60 H62 C69 47 65 32 50 20 Z"/>
      <rect x="35" y="58" width="30" height="8" rx="4"/><circle cx="50" cy="15" r="5.5"/>${BASE}
      <path d="M57 32 L45 46" stroke="${d}" stroke-width="4" fill="none"/>`,
    q: d => `<path d="M29 66 L20 31 L33 50 L35 25 L44 47 L50 21 L56 47 L65 25 L67 50 L80 31 L71 66 Z"/>
      <circle cx="20" cy="29" r="5"/><circle cx="35" cy="23" r="5"/><circle cx="50" cy="18" r="5"/><circle cx="65" cy="23" r="5"/><circle cx="80" cy="29" r="5"/>
      <path d="M30 66 H70 L73 79 H27 Z"/>${BASE}
      <path d="M33 72 H67" stroke="${d}" stroke-width="3" fill="none"/>`,
    k: d => `<path d="M46 5 H54 V11 H60 V18 H54 V27 H46 V18 H40 V11 H46 Z"/>
      <path d="M28 66 C17 54 20 38 33 38 C41 38 46 44 50 51 C54 44 59 38 67 38 C80 38 83 54 72 66 Z"/>
      <path d="M50 52 C44 43 44 33 50 26 C56 33 56 43 50 52 Z"/>
      <path d="M30 66 H70 L73 79 H27 Z"/>${BASE}
      <path d="M33 72 H67" stroke="${d}" stroke-width="3" fill="none"/>`,
  };

  function svg(c, t) {
    const k = COLORS[c];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${k.f}" stroke="${k.s}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${SHAPES[t](k.d)}</g></svg>`;
  }

  const images = {};
  function preload() {
    for (const c of ['w', 'b']) for (const t of 'pnbrqk') {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(c, t).replace('<svg ', '<svg width="128" height="128" '));
      images[c + t] = img;
    }
  }
  const img = (c, t) => images[c + t];

  return { svg, preload, img };
})();

if (typeof module !== 'undefined') module.exports = Pieces;
