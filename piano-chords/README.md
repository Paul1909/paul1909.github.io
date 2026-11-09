# Piano Chords

Build any chord and see it in root position, 1st and 2nd inversion, on keyboard and grand staff.
Tap a keyboard or staff to hear that inversion. Long-press (or hover) a modifier for what it does and how to find it on the keys.

## Files
- `index.html` – layout and styles
- `app.js` – chord theory, engraving, keyboards, sound, service worker registration
- `glyphs.js` – music symbols from the Bravura font (SIL Open Font License)
- `piano/` – piano samples: *Splendid Grand Piano* by Akai (a Steinway, public domain), mezzo-forte layer, trimmed to 5 s
- `sw.js` – offline cache
- `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` – install + icons

## Install
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. Opens fullscreen.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online; after that it works offline.

## Update
Change the files, bump `VERSION` in `sw.js`, push.
