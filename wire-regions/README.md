# Wire Regions

Wire Atlas for the inside of a country: Swiss cantons, Italian regions, Dutch provinces, Lithuanian counties and US states.

- The first page asks for a country. The game then stays inside it (the flag button on the map goes back).
- Flat grey-line map, same colours as Wire Atlas. Drag, pinch or +/- to zoom, tap a region: it turns yellow and the card shows name, capital, flag and shape.
- **Start quiz**: pick what to show and what to ask among the five (name, capital, flag, location, shape), in the country's own words
  (e.g. Italy: nome, capoluogo, bandiera, posizione, forma). Italy and the US can be narrowed to an area.

## Files
- `index.html`, `app.js` – the app
- `meta.js` – names, capitals, areas and the local words for each country
- `geo.js` – outlines, projected and simplified from Natural Earth 1:10m (public domain), lakes cut out
- `flags/` – region flags (Wikimedia Commons via amckenna41/iso3166-flags and google/region-flags); big ones converted to WebP
- `sw.js` – offline cache (lists every file), `manifest.webmanifest`, icons

## Install
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online; after that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push.
