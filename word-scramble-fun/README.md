# Word Scramble Fun

An emoji clue appears with its word scrambled in every language you picked (English, Italian, German, French, Lithuanian, Dutch). Tap the letters in order to rebuild each word; tap a placed letter to take it back. A wrong word shakes. On a keyboard, type the letters and use Backspace.

10 points per word, 25 more when every language for that clue is solved. Play 10, 20 or all 31 words; the best time is saved per language set and length on this device. The results screen has a Share button that sends a recap picture plus the link.

Older app, refactored into Paolo's Arcade: plain HTML/CSS/JS, works offline, alerts replaced by in-app screens.

## Files
- `index.html` – markup and styles
- `app.js` – game logic, sound, share recap, service worker registration
- `words.js` – languages and the word list (add a row to add a word)
- `sw.js` – offline cache
- `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` – install + icons

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version next time the app is opened online.
