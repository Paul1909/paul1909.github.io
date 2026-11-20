// Astronomy engine: positions accurate to well under a degree for 1800-2050.
// Planets: JPL "Approximate Positions of the Planets" (Standish), Table 1.
// Moon: Astronomical Almanac low-precision series. Sun: Earth's orbit.
(function (root) {
  const D2R = Math.PI / 180, AU = 1.495978707e11, LY = 9.4607e15, C = 299792458;
  const norm = d => ((d % 360) + 360) % 360;
  const sin = d => Math.sin(d * D2R), cos = d => Math.cos(d * D2R);
  const jd = date => date.getTime() / 86400000 + 2440587.5;
  const cent = date => (jd(date) - 2451545) / 36525;

  // a, e, I, L, long.peri, long.node  +  rates per century
  const EL = {
    Mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    Venus:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    Earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    Mars:    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    Jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    Saturn:  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    Uranus:  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    Neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    Pluto:   [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  };

  function kepler(M, e) {             // M in radians
    let E = e > 0.8 ? Math.PI : M;
    for (let i = 0; i < 60; i++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
    return E;
  }
  function orbitXYZ(a, e, I, w, O, Mdeg) { // heliocentric ecliptic J2000, AU
    const M = norm(Mdeg + 180) - 180;
    const E = kepler(M * D2R, e);
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = cos(w), sw = sin(w), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I);
    return [
      (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      (sw * sI) * xp + (cw * sI) * yp,
    ];
  }
  function helio(name, T) {
    const p = EL[name], k = i => p[i] + p[i + 6] * T;
    const a = k(0), e = k(1), I = k(2), L = k(3), wb = k(4), O = k(5);
    return orbitXYZ(a, e, I, wb - O, O, L - wb);
  }
  // Halley's Comet: elements of the 1986 apparition; mean motion taken between real perihelia.
  const HALLEY_PERI = [2391564.5 /*1835-11-16*/, 2418781.6 /*1910-04-20*/, 2446470.96 /*1986-02-09*/, 2474040.5 /*2061-07-28*/];
  function halley(date) {
    const t = jd(date), P = HALLEY_PERI;
    let i = 0; while (i < P.length - 2 && t > P[i + 1]) i++;
    const per = P[i + 1] - P[i], M = 360 * (t - P[i]) / per;
    const e = 0.96714, q = 0.58598, a = q / (1 - e);
    return orbitXYZ(a, e, 162.2627, 111.3325, 58.4201, M);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = v => Math.hypot(v[0], v[1], v[2]);
  const lon = v => norm(Math.atan2(v[1], v[0]) / D2R);

  function moon(T) {
    const l = 218.32 + 481267.881 * T + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T)
      + 0.66 * sin(235.7 + 890534.22 * T) + 0.21 * sin(269.9 + 954397.74 * T) - 0.19 * sin(357.5 + 35999.05 * T)
      - 0.11 * sin(186.5 + 966404.03 * T);
    const par = 0.9508 + 0.0518 * cos(135.0 + 477198.87 * T) + 0.0095 * cos(259.3 - 413335.36 * T)
      + 0.0078 * cos(235.7 + 890534.22 * T) + 0.0028 * cos(269.9 + 954397.74 * T);
    return { lon: norm(l), km: 6378.14 / sin(par) };
  }
  const PREC = 1.396971;  // general precession in longitude, degrees per century

  // Ascendant: ecliptic point rising on the eastern horizon.
  function ascendant(date, latDeg, lonDeg) {
    const d = jd(date) - 2451545, T = d / 36525;
    const ramc = norm(280.46061837 + 360.98564736629 * d + lonDeg);
    const eps = 23.4392911 - 0.0130042 * T;
    return norm(Math.atan2(cos(ramc), -(sin(ramc) * cos(eps) + Math.tan(latDeg * D2R) * sin(eps))) / D2R);
  }

  const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const sign = l => SIGNS[Math.floor(norm(l) / 30)];
  // Where the IAU constellations sit along the ecliptic (J2000 longitude where the Sun enters each).
  const CONST = [[29.1, 'Aries'], [53.5, 'Taurus'], [90.4, 'Gemini'], [118.3, 'Cancer'], [138.2, 'Leo'], [174.2, 'Virgo'],
    [218.0, 'Libra'], [241.0, 'Scorpius'], [247.7, 'Ophiuchus'], [266.3, 'Sagittarius'], [299.7, 'Capricornus'], [327.5, 'Aquarius'], [351.6, 'Pisces']];
  function constellation(lonJ2000) {
    const l = norm(lonJ2000); let name = 'Pisces';
    for (const [start, n] of CONST) if (l >= start) name = n;
    return name;
  }

  function chart(date, lat, lng) {
    const T = cent(date);
    const earth = helio('Earth', T);
    const sunJ2000 = lon(sub([0, 0, 0], earth));
    return {
      sun: norm(sunJ2000 + PREC * T), sunJ2000,
      moon: moon(T).lon,
      asc: ascendant(date, lat, lng),
    };
  }

  // Voyager distance from the Sun (AU), interpolated between mission milestones.
  const VOY = {
    1: { launch: Date.UTC(1977, 8, 5), pts: [[1977.68, 0.01], [1979.18, 5.2], [1980.87, 9.5], [1990.12, 40.5], [1998.13, 69.4], [2004.96, 94.0], [2012.65, 121.6]], rate: 3.57 },
    2: { launch: Date.UTC(1977, 7, 20), pts: [[1977.64, 0.01], [1979.52, 5.2], [1981.65, 9.6], [1986.07, 19.2], [1989.65, 30.1], [2007.67, 84.0], [2018.85, 119.0]], rate: 3.15 },
  };
  function voyagerAU(n, date) {
    const v = VOY[n]; if (date.getTime() < v.launch) return null;
    const y = 1970 + date.getTime() / 31557600000, p = v.pts;
    for (let i = 0; i < p.length - 1; i++) if (y <= p[i + 1][0]) return Math.max(0.01, p[i][1] + (p[i + 1][1] - p[i][1]) * (y - p[i][0]) / (p[i + 1][0] - p[i][0]));
    const last = p[p.length - 1]; return last[1] + v.rate * (y - last[0]);
  }

  // Everything that was "up there" on a date. dist in metres, mass in kg.
  function sky(date) {
    const T = cent(date), earth = helio('Earth', T), out = [];
    const m = moon(T);
    out.push({ name: 'Moon', dist: m.km * 1000, mass: 7.342e22 });
    out.push({ name: 'Sun', dist: len(earth) * AU, mass: 1.989e30 });
    const MASS = { Mercury: 3.301e23, Venus: 4.867e24, Mars: 6.417e23, Jupiter: 1.898e27, Saturn: 5.683e26, Uranus: 8.681e25, Neptune: 1.024e26, Pluto: 1.303e22 };
    for (const n of Object.keys(MASS)) {
      const g = sub(helio(n, T), earth);
      out.push({ name: n, dist: len(g) * AU, mass: MASS[n], sign: sign(lon(g) + PREC * T) });
    }
    out.push({ name: "Halley's Comet", dist: len(sub(halley(date), earth)) * AU, mass: 2.2e14 });
    const t = date.getTime(), made = [];
    if (t >= Date.UTC(1998, 10, 20)) made.push({ name: 'ISS', dist: 4.0e5, mass: 4.2e5, note: 'overhead, at best' });
    if (t >= Date.UTC(1990, 3, 24)) made.push({ name: 'Hubble', dist: 5.4e5, mass: 1.11e4, note: 'overhead, at best' });
    if (t >= Date.UTC(2021, 11, 25)) made.push({ name: 'James Webb', dist: 1.5e9, mass: 6.2e3 });
    for (const n of [1, 2]) { const au = voyagerAU(n, date); if (au) made.push({ name: 'Voyager ' + n, dist: au * AU, mass: 722, approx: true }); }
    return { bodies: out, made, sputnik: t >= Date.UTC(1957, 9, 4) };
  }

  // How many times stronger the tidal pull (the part of gravity that can push or stretch you)
  // of a 70 kg doctor 1 m away was, compared to a body of `mass` kg at `dist` metres.
  const doctorWins = (mass, dist) => 70 * dist ** 3 / mass;

  root.Astro = { chart, sky, sign, constellation, SIGNS, doctorWins, AU, LY, C, jd, ascendant, cent, helio, moon, halley, norm };
  if (typeof module !== 'undefined') module.exports = root.Astro;
})(typeof window !== 'undefined' ? window : globalThis);
