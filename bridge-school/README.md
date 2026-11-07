# Bridge School

Learn contract bridge on your phone: 10 short lessons, a points-counting drill, an opening-bid drill, and full hands to play as declarer against computer defenders. Works offline once opened.

Play: https://paul1909.github.io/bridge-school/

## Files

- `index.html` – markup and styles
- `engine.js` – bridge rules: dealing, opening-bid rules, card-play logic for the defenders and the Hint button, scoring
- `app.js` – the interface (lessons, drills, play table) and service-worker registration
- `sw.js` – offline cache
- `manifest.webmanifest` – makes it installable, opens fullscreen
- `fonts/` – Bodoni Moda and Figtree, bundled so they work offline
- `icon.svg`, `icon-*.png`, `apple-touch-icon.png` – icons

## Install on your phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js` (e.g. `bridge-school-v2`), and push. The phone picks up the new version the next time the app is opened with internet (sometimes on the second open).
