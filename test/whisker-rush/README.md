# Whisker Rush (test build)

Hidden test copy of Whisker Rush, not linked from the arcade page. It has the 🛠 Tuning lab on the title screen and keeps its own saves and offline cache (`whisker-rush-test`), separate from the live game.

## Files
- `index.html` – screens, HUD and styles
- `three.min.js` – Three.js r160 (bundled so it works offline)
- `cat.js` – cat model · `game.js` – tracks, obstacles, power-ups, bots, camera, and the `TUNING` list of mechanics with their defaults
- `app.js` – menus, Tuning lab, sound, touch/tilt/keyboard input, main loop
- `luna-purr.mp3`, `luna-auuu.mp3`: Luna's voice when you pet the cat
- `music-menu.mp3` (Catnip Quest) and `music-race.mp3` (Paws Forward): 128 kbps, loudness-matched
- `sw.js` – offline cache · `manifest.webmanifest` – install + fullscreen

## Controls
Left thumb stick: steer, up = faster, down = brake. Right thumb: tap = jump, hold = sprint. Keyboard: arrows/WASD like the stick; Space tap = jump, hold = sprint; C = camera; P = pause.

## Versions and rollback
To roll back: `git checkout <commit> -- test/whisker-rush`, commit, push.

Each version is one commit in the repo; the commit ID next to each version is what to restore for a rollback.

### v3 (8 Nov 2026) · commit 874623c
- 3 new tracks: Space Station (low gravity), Alpine Meadow, House Chase (room to room).
- Controls: left thumb stick steers, up = faster, down = brake; right thumb tap = jump, hold = sprint. Computer: arrows + Space (tap jump, hold sprint), C camera.
- How to play page; shown once before the first race.
- Petting the cat wags its tail and plays Luna's purr / "auuu" (alternating).
- Ghost power-up: run through obstacles and cats. Fish now come in groups (7 × 4 by default) plus 4 golden fish.
- Camera toggle: cat's eyes or behind the cat (Settings, 🎥 button, C key).
- Laser pointer dot in front of the leading cat; the rival cats chase it.
- Joystick more transparent.

### v2 (8 Nov 2026) · commit b04f27e
- Score: fish +1, golden fish that swim side to side +3 (both tunable). Score shown in the race and on the results.
- Leaderboard: top 10 per track and difficulty, saved on the phone.
- Tap your cat on the title or customise screen: it purrs and shows 3D hearts.
- Soundtrack: "Catnip Quest" in the menus, "Paws Forward" from GO. Music volume setting, mute button on menus and in the race.
- Tuning lab: new Score section (points, share of moving fish, swing width and speed).

### v1 (8 Nov 2026) · commit 17273ab
- First test build: 5 tracks, cat customiser, 3 difficulties, stamina/exhaustion, off-track slowdown, fish and catnip, hiss and angry meow, Tuning lab.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. To bake tuned values in, change the `def` values in `TUNING` (game.js).
