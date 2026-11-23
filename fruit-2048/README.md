# Fruit 2048

Offline phone game for Paolo's Arcade (GitHub Pages).

Files: `index.html` (layout + styles), `app.js` (game), `sw.js` (offline cache), `manifest.webmanifest` (install + fullscreen), icons.

## Install
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version the next time it's opened online.
