# ACCURATE horoscope

A guided horoscope (Sun, Moon and rising sign calculated from birth date, time and city), a short accuracy rating, then the reveal: the text was random, and the real sky on your birthday could not have influenced anything.

- Same birth date on the same day gives the same horoscope; it changes every day (seeded from birth date + day).
- No birthplace question: the birth time is read in the phone's time zone, placed at that zone's main city (for the rising sign).
- Last page ends with an interactive map of the sky above the phone's time-zone city at the birth time (slider for ±12 h, tap to name stars and planets).

## Files
- `index.html`: screens and styles
- `app.js`: flow, horoscope generator, reveal, sky page
- `astro.js`: astronomy (JPL planet elements, Moon series, ascendant, Halley, Voyagers)
- `data.js`: horoscope text database, constellation stars
- `skymap.js`, `skydata.js`: sky map and star catalogue (d3-celestial data by Olaf Frohn, BSD-3-Clause)
- `cities.js`: cities with coordinates, used to place the phone's time zone
- `manifest.webmanifest`, icons: home-screen icon
- `sw.js`: stub that removes the old offline cache from phones that had it

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Needs internet (no offline mode).
