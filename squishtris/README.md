# Squishtris

Tower-building with physics blocks. Build up to the gold line and keep the tower there for 2 seconds to finish the level. Each level gives you a few pieces, and a row that gets 90 % full vanishes (the bars on the right warn you).

Materials: **Glass** shatters if it falls or gets knocked too hard, so carry it down gently. **Wood** is a solid block. **Jelly** squishes and spreads into gaps.

## Controls

- Drag the field left/right to move, tap to rotate, flick down to drop (drag down slowly for a soft drop).
- Or use the buttons: ◀ ▶ move, ▼ soft drop (hold), ⤓ hard drop, ⟳ rotate.
- Squishiness (Firm / Squishy / Jelly), sound and vibration are in the menu.

## Files

| File | What it is |
|---|---|
| `index.html` | Layout, styles, menus |
| `app.js` | Physics (shape-matching soft bodies), game logic, rendering, input, sound |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Makes it installable and fullscreen |
| `icon.svg`, `icon-*.png`, `apple-touch-icon.png` | Icons |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js` (e.g. `squishtris-v2`), push. Phones pick up the new version the next time the app is opened online (sometimes a second open is needed).
