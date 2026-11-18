# Rally Havoc

Arcade rally racing in Three.js through live traffic. The car accelerates by itself; you only steer.
Crash damage builds up until your car explodes; you can wreck rivals and traffic too.
Five stages (village, valley, downtown, foggy pass, dusk finale) with traffic both ways, buses,
traffic lights with cross traffic, pedestrians, road works, rocks, oil, ramps, explosive barrels,
repair and turbo pickups. Top 3 unlocks the next stage.

## Controls
- Phone / iPad: hold the left or right half of the screen to steer, red button = brake, hold both halves = handbrake (drift).
  Options → "Controls: Buttons" puts both arrows on the left and Brake + Drift on the right.
- Keyboard: ← → or A / D steer, ↓ / S brake, Space handbrake, C camera, P or Esc pause.
- Cameras: chase, far chase, bonnet, bumper (CAM button, C key, or Options).
- Near misses, drifts and jumps fill the TURBO bar; when full you get a 3-second boost.

## Look and sound
90s arcade styling (fonts in `fonts/`, Russo One and Press Start 2P, SIL Open Font License), rendered at full resolution.
Power-ups come in rows of four across the road (one per lane), so each car can grab one. The engine is a synth driven by a
6-speed automatic gearbox: rpm climbs through each gear, drops on shifts, with throttle cut, exhaust pops and blow-off.

## Graphics
Real-time shadows, reflective car paint and glass, a shader sky with clouds, bloom on lights and explosions,
headlights and lit windows on the dusk and fog stages. The game lowers the quality by itself if the device
cannot hold about 45 fps; the **Graphics: high / fast** button in the menu forces the light version.

## Files
| File | What it is |
|---|---|
| `index.html` | Markup, HUD and menus, all CSS |
| `app.js` | The whole game (track generator, driving model, traffic AI, damage, effects, audio, UI) |
| `fonts/` | The two arcade fonts (OFL) |
| `three.min.js` | Three.js r187 plus its bloom/post-processing add-ons, minified local copy (MIT), so the game works offline |
| `sw.js` | Offline cache (service worker) |
| `manifest.webmanifest` | Makes it installable and fullscreen |
| `icon.svg`, `icon-*.png`, `apple-touch-icon.png` | Icons |

Saved data (unlocked stages, best results, settings) lives in `localStorage` under keys starting with `rally-havoc:`.

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone / iPad: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js` (e.g. `rally-havoc-v2`), push. Phones pick up the new version
the next time the game is opened with internet (a second open may be needed).

Tuning knobs live at the top of `app.js` in `STAGES` (length, traffic, pedestrians, props, rival speed, damage multiplier).
