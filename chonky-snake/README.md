# Chonky Snake

Classic Snake with one twist: every burger makes the snake **a lot fatter** and only **a little longer** (+0.45 units of length, about half a starting body width). It slowly turns from a noodle into a long fat sausage that barely fits in the arena. Salad and the gym slim it down but don't shorten it. Works offline once opened, installs as a fullscreen phone app.

- Swipe anywhere, tap the semi-transparent on-screen arrows (switch them off with ✛ Arrows in the menu or pause screen), or use arrow keys / WASD. Space, P or Esc pauses; Android's back swipe pauses too.
- A fat snake needs one body width of room to turn back on itself (a U-turn), so tight turns get harder as it grows.
- Walls only kill you when you drive into them; self-bites count everywhere except right behind the head.
- Every 6–9 burgers a power-up appears for 8 seconds: 🥗 salad (instantly 3 sizes slimmer) or 🏋️ gym (5-second workout: headband, sweat, burns one size per second and moves 15% faster).
- Crash into a wall and the snake throws up its burgers (the puddle stays on the share picture).
- Burgers and power-ups grow along with the snake, so they stay in proportion.
- Weight in kg (starts at 1.0) grows with the square of the snake's width. Ranks go from Noodle up to Absolute Unit.
- Easy / Normal / Hard change speed and how fast it fattens. Best score is kept per difficulty.
- Share ↗ on the game-over screen sends a picture of the arena at the end plus the link.

Files: `index.html` (markup + styles), `app.js` (game), `sw.js` (offline cache), `manifest.webmanifest`, Candy Tile icons.


## Install

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

**Updating:** change the files, bump `VERSION` in `sw.js`, push.
