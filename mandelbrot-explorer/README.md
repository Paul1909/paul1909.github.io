# Mandelbrot Explorer

Pinch your way into the Mandelbrot set. Works offline once opened, installs as a fullscreen phone app.

- Drag to move, pinch or scroll to zoom, double-tap to dive in, tap once to hide the buttons.
- Famous places (Seahorse Valley, Elephant Valley, the baby Mandelbrot, deep dives to ×10²⁸).
- 8 colour palettes, colour bands slider, colour cycling.
- Julia: shows the Julia set of the point under the cross.
- Surprise: dives to a random spot on the edge.
- Share ↗: sends a picture of the view plus a link that opens exactly this spot.
- Deep zoom down to ×10²⁵⁰: past ×10¹² it switches to perturbation maths against one BigInt reference orbit, so the picture stays sharp where plain doubles turn to blocks.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup and styles |
| `app.js` | View, gestures, colouring, places, share, service worker registration |
| `fractal.js` | Escape-time maths (plain, Julia, perturbation, reference orbit), shared by page and workers |
| `worker.js` | Render worker; the page runs several in parallel |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install + fullscreen |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Icons, made by `icons/make_icons.py` |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push. When the icon changes, rerun `python3 icons/make_icons.py mandelbrot-explorer`.
