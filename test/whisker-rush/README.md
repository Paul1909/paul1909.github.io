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

## Handover notes (for continuing in a new chat)

**Where things are**
- Repo `Paul1909/paul1909.github.io` (GitHub Pages, branch `main`). The test build lives in `test/whisker-rush/` and is not linked from the arcade page. Test URL: https://paul1909.github.io/test/whisker-rush/
- No live version yet. When publishing: copy the folder to `whisker-rush/`, set `TEST_BUILD = false` in `app.js`, set `APP = 'whisker-rush'` in `sw.js` and the manifest names to "Whisker Rush", and add a card to the arcade `index.html`.
- Plain scripts, no build step: `three.min.js` (r160, global `THREE`) → `cat.js` (`window.WRCat`) → `game.js` (`window.WRGame`) → `app.js`. It also runs by double-clicking `index.html`.

**Release routine (every change)**
1. Bump `VERSION` in `sw.js` (`whisker-rush-test-vN`) and `BUILD` in `app.js` (shown on the title badge).
2. Every file in the folder (except `sw.js` and `README.md`) must be listed in `sw.js` `FILES`, or it will be missing offline.
3. Add a `### vN` entry below, push, then write the commit ID into it.
4. Roll back: `git checkout <commit> -- test/whisker-rush`, commit, push.

**Rules that matter**
- Several games share the `paul1909.github.io` origin, so `localStorage` keys are prefixed `whisker-rush-test:` and the service worker only deletes its own caches (`APP + '-v'`).
- Relative paths only, no CDN or remote files, and fullscreen comes from the manifest.
- Paolo tests on Android (landscape). He wants to try each round on the test URL before anything goes live.

**Game design (current)**
- Speeds are in km/h and converted by `pace`: cruise 30, faster +6 (stick up / ↑, drains 12%/s), sprint 44 (hold, drains 35%/s), cap 48, brake 10 (refills 1.5× faster). An empty bar means exhausted at 12 km/h until it is back to 35%.
- Off-track: 6 m each side at 45% speed. Obstacles: `block` (jump if low enough, else steer), `wide` (jump-only), `move` (swings side to side). Pits were removed on purpose.
- Power-ups: fish in groups of ≥3 (+1, full stamina), golden fish single and moving (+3), catnip (bigger bar for a while), ghost (pass through obstacles and cats).
- Every number is in the `TUNING` list in `game.js`, which also builds the Tuning lab sliders. To bake in Paolo's tuned values, change the `def` fields.
- Rival cats: speed and dodge skill per difficulty, a gentle rubber band, and they steer towards the laser dot ahead of the leader.
- Tracks: `TRACKS` in `game.js` (theme, scenery, obstacle sets, landmarks). Special flags: `space` (low gravity, no ground), `indoor` (house rooms from `ROOMS`, walls and ceiling).
- Music: `music-menu.mp3` (Catnip Quest) in the menus and `music-race.mp3` (Paws Forward) from GO. Pet sounds: `luna-purr.mp3` and `luna-auuu.mp3`, alternating.
- The leaderboard is per phone (top 10 per track and difficulty). An online one would need an outside service.

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
