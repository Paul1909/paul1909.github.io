# Chonky Snake (test build)

Classic Snake with one twist: every apple makes the snake **fatter instead of longer**. The body length never changes, so the snake slowly turns from a noodle into a sausage into a blob that barely fits in the arena. Works offline once opened, installs as a fullscreen phone app.

- Swipe anywhere (or arrow keys / WASD) to steer. Space, P or Esc pauses; Android's back swipe pauses too.
- A fat snake needs one body width of room to turn back on itself (a U-turn), so tight turns get harder as it grows.
- Walls only kill you when you drive into them; self-bites count everywhere except right behind the head.
- Every 6–9 apples a leaf appears for 8 seconds. Eating it slims the snake by three sizes.
- Weight in kg (starts at 1.0) grows with the square of the snake's width. Ranks go from Noodle up to Absolute Unit.
- Easy / Normal / Hard change speed and how fast it fattens. Best score is kept per difficulty.
- Share ↗ on the game-over screen sends a picture of the arena at the end plus the link.

Files: `index.html` (markup + styles), `app.js` (game), `sw.js` (offline cache), `manifest.webmanifest`, Candy Tile icons.

This build lives in `test/` and isn't linked from the homepage yet. To promote it: move the folder to the repo root, add the glyph to `icons/make_icons.py` and the card to the homepage, bump `VERSION` in `sw.js`.

## Install

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

**Updating:** change the files, bump `VERSION` in `sw.js`, push.
