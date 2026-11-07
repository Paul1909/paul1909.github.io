# Whisker Rush (test build)

Hidden test copy of Whisker Rush, not linked from the arcade page. It has the 🛠 Tuning lab on the title screen and keeps its own saves and offline cache (`whisker-rush-test`), separate from the live game.

## Files
- `index.html` – screens, HUD and styles
- `three.min.js` – Three.js r160 (bundled so it works offline)
- `cat.js` – cat model · `game.js` – tracks, obstacles, power-ups, bots, camera, and the `TUNING` list of mechanics with their defaults
- `app.js` – menus, Tuning lab, sound, touch/tilt/keyboard input, main loop
- `sw.js` – offline cache · `manifest.webmanifest` – install + fullscreen

## Controls
Tap = jump, hold = sprint, stick or tilt to steer. Keyboard: ↑/W tap = jump, hold = sprint; Space = jump; ←/→ steer; P = pause.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. To bake tuned values in, change the `def` values in `TUNING` (game.js).
