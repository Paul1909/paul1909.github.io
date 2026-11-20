# ACCURATE horoscope

A guided horoscope (Sun, Moon and rising sign calculated from birth date, time and city), a short accuracy rating, then the reveal: the text was random, and the real sky on your birthday could not have influenced anything.

- Same birth date on the same day gives the same horoscope; it changes every day (seeded from birth date + day).
- Works offline once opened online.

## Files
- `index.html`: screens and styles
- `app.js`: flow, horoscope generator, reveal, sky page
- `astro.js`: astronomy (JPL planet elements, Moon series, ascendant, Halley, Voyagers)
- `data.js`: horoscope text database, constellation stars
- `cities.js`: birthplaces with coordinates and time zones
- `sw.js`, `manifest.webmanifest`, icons: offline + install

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push.
