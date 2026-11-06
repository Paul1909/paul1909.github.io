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
| `bot.js` | The computer opponent (runs in a background worker so the board stays smooth) |
| `app.js` | Board, touch input, game flow, bot mode, chess clock, settings, save/undo |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Makes it installable |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | App icons |

## Playing

- Tap a piece, then tap its destination, or drag it. While dragging onto a capture, the 3×3 blast zone glows.
- **New** opens the game setup: play a friend or the bot, pick your colour, the bot level (1 Beginner … 8 Grandmaster) and the clock (minutes each + seconds added per move; default 3 + 5). The bot level can also be changed mid-game in the Menu.
- The clock starts with White's first move. Opening the menu or leaving the app pauses it; tap the board to resume. Undo against the bot takes back your last move and the bot's reply.
- **Menu → Seating** (friend games): *Face to face* (phone flat between you, Black's pieces and panel upside down), *Side by side* (everything upright), or *Pass & flip* (board turns to whoever is to move).
- Undo, sound, vibration, move hints and coordinates are in the toolbar/menu. The game is saved automatically.
- Android back gesture opens the menu instead of closing the app.

## Hosting

Lives in the `atomic-chess/` folder of the GitHub Pages arcade (paul1909.github.io/atomic-chess/).
Install on the phone: open the page in Chrome → ⋮ → **Add to home screen**, open it once online, then it works offline.

**Updating:** change the files and bump `VERSION` in `sw.js` (e.g. `atomic-chess-v5`), so installed copies pick up the new version next time they're opened online. `sw.js` only clears `atomic-chess-*` caches, so the other games' offline copies on the same site are left alone.
