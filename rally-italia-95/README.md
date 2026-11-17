# Rally Italia '95

An OutRun-style arcade rally game (pseudo-3D sprite-scaled road, pixel-art sprites, parallax backgrounds) for Paolo's Arcade. Runs offline once installed.

## Play
- **Race**: you vs the other three cars. **Time trial**: alone against a countdown; every checkpoint adds time.
- **Tracks**: Colline Toscane (countryside, gravel, 2 laps) · Passo dello Stelvio (uphill hairpins, point to point) · Riviera Ligure (urban, cobbles, 2 laps).
- **Difficulty**: Easy / Normal / Hard sets the rivals' pace in a race and how much time each checkpoint gives in time trial.
- **Auto-accelerate** (on by default): you only steer and brake. Hold BRAKE when stopped to reverse.
- **Gearbox**: 5-speed automatic (like the real cars' 5-speed boxes). Shifts up near 6750 rpm with a short power cut, shifts down below ~3100 rpm. The current gear shows under the speed; R when reversing.
- Keyboard: arrows / WASD, Space = brake, C = camera, P = pause.

## Cars (road-car homologation specs → game stats)
| Car | Power | Weight | Top speed | Wheelbase |
|---|---|---|---|---|
| Lancia Delta HF Integrale Evo II (1993) | 215 CV | 1340 kg | 220 km/h | 2480 mm |
| Subaru Impreza WRX GC8 (1994) | 240 PS | 1230 kg | 230 km/h | 2520 mm |
| Toyota Celica GT-Four ST205 (1994) | 255 PS | 1390 kg | 245 km/h | 2545 mm |
| Mitsubishi Lancer Evo III (1995) | 270 PS | 1260 kg | 239 km/h | 2510 mm |

Top speed = claimed top speed; acceleration from power-to-weight; handling from weight and wheelbase; mass is used in collisions and braking. Liveries are colour schemes only, no sponsor names or logos.

## Files
- `index.html` menus, HUD and styles · `app.js` game loop, physics, AI, camera
- `js/tracks.js` track layouts · `js/render.js` pseudo-3D road renderer + roadside scenery · `js/sprites.js` procedural pixel-art sprites, car frames and backgrounds · `js/cars.js` car specs · `js/audio.js` sound
- `fonts/` Racing Sans One (SIL OFL) · `music.mp3` soundtrack ("Full Throttle")
- `sw.js` offline cache · `manifest.webmanifest` install/fullscreen · icons

## Install on the phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version the next time the app is opened online (sometimes a second open is needed).
