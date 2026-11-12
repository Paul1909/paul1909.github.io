# Dots and Lines (Punti e Linee)

The pen-and-paper classic on a 4 × 5 box board: two players on one phone, or you against the bot.

## Files

- `index.html` – screens and styles
- `game.js` – rules, drawing, touch input, sound, autosave, single-player driver
- `bot.js` – the computer opponent (runs in a Web Worker; also loaded on the page as a fallback)
- `sw.js` – offline cache
- `manifest.webmanifest`, icons – install as a fullscreen app

## Bot levels

1. **Easy** – sometimes misses boxes and often hands them over.
2. **Medium** – never misses a box, avoids giving boxes, sacrifices the smallest chain when it must.
3. **Hard** – Medium plus perfect endgame play (double-dealing, keeping control of long chains).
4. **Expert** – Hard plus a time-limited look-ahead search in the opening to win the long-chain battle.

## Install

- Android: open https://paul1909.github.io/dots-and-lines/ in Chrome → ⋮ → **Add to home screen** → **Install**.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push.
