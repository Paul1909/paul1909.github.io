# Atomic Chess

Two-player atomic chess on one phone. Works fully offline once installed.

## Files

| File | What it is |
|---|---|
| `index.html` | Layout and styles |
| `engine.js` | Atomic chess rules (lichess rules, verified by perft to depth 5) |
| `pieces.js` | Chess piece artwork (SVG) |
| `sound.js` | Sound effects, synthesised live (no audio files) |
| `fx.js` | Explosion animation (flash, shockwave, fire, sparks, smoke, shattering pieces) |
| `app.js` | Board, touch input, game flow, settings, save/undo |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Makes it installable |
| `_headers` | Hides the "Powered by Netlify" badge (blocks injected scripts) |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | App icons |

## Playing

- Tap a piece, then tap its destination, or drag it. While dragging onto a capture, the 3×3 blast zone glows.
- **Menu → Seating**: *Face to face* (phone flat between you, Black's pieces and panel upside down), *Side by side* (everything upright), or *Pass & flip* (board turns to whoever is to move).
- Undo, sound, vibration, move hints and coordinates are in the toolbar/menu. The game is saved automatically.
- Android back gesture opens the menu instead of closing the app.

## Deploy (Netlify, free plan)

1. Log in at app.netlify.com. Go to **Projects → Add new project → Deploy manually** (or app.netlify.com/drop while logged in) and drag the `atomic-chess` folder, the one that directly contains `index.html`. If the site says "Page not found", you dropped the folder one level too high.
2. If Netlify marks the project as private or pre-launch, make it public. Chrome can't install a page that asks for a password.
3. On the phone, open the site in Chrome → ⋮ → **Add to home screen** → **Install**. On iPhone: Safari → Share → **Add to Home Screen**.
4. Open it once while online. After that it works offline.

## Updating later

Change the files, bump `VERSION` in `sw.js` (e.g. `atomic-chess-v2`), then open the project's **Deploys** page and drag the folder onto it again. The phone picks up the new version the next time the app is opened with internet. Each manual deploy uses some of the Free plan's monthly credits, so batch changes into one upload.

**If the badge still shows:** the deploy probably went out without `_headers` (some zip tools skip files starting with `_`, so drag the unzipped folder). On a paid plan the badge can also be switched off under Project configuration → General → Powered by Netlify badge.
