# Wire Atlas

Learn every country's shape, location, flag and capital on a grey wireframe globe.

- Spin, pinch/zoom and tap a country: it turns yellow and the pane shows its name, capital, flag, shape and location.
- **Start quiz**: Flag → Country, Map → Country, Map + flag → Capital, or a mix; pick a region and 10 / 20 / all questions.
  After every answer a recap card shows name, capital, flag, shape and location.

## Files
- `index.html`, `app.js` – the app
- `data.js` – Natural Earth 1:50m borders (world-atlas, simplified) + names, capitals, regions (mledoze/countries)
- `flags/` – SVG flags (flag-icons, MIT)
- `lib/` – d3-array, d3-geo, topojson-client (ISC)
- `sw.js` – offline cache (lists every file), `manifest.webmanifest`, icons

## Install
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online; after that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push.
