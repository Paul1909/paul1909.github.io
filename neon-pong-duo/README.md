# Neon Pong Duo — phone edition

A standalone, installable version of Neon Pong Duo. No build step, no npm, no API key,
no internet needed once it's installed.

## Files
- `index.html` — page layout and styles
- `game.js` — the game code
- `_headers` — Netlify security rule: only the site's own script files may run
  (this also stops Netlify's injected "Powered by Netlify" badge)
- `manifest.webmanifest` — makes it installable as a full-screen app
- `sw.js` — offline cache

Keep all game code in `game.js`. Code inside `<script>` tags in `index.html`, or
`onclick="..."` attributes, will be blocked by the security rule.
- `icon-*.png` — home-screen icons

## Put it on your phone (Android)
1. Go to https://app.netlify.com/drop and drag this **phone** folder onto the page.
2. Open the URL Netlify gives you in Chrome on your phone.
3. Chrome menu (⋮) → **Add to home screen** → **Install**.
4. Open it once while online. After that it works offline, full screen, portrait.

## Playing
- Lay the phone flat between the two players. Player 1 is at the top, Player 2 at the bottom.
- Both players touch their half to serve. Lifting a finger during the countdown cancels it.
- Pause with the ⏸ button on the centre line, or with the Android back gesture.
- Theme, score to win, ball speed and vibration are remembered between games.

## Updating later
Edit the files, change `VERSION` in `sw.js` (e.g. `npd-v2`), and drag the folder onto
your Netlify site's **Deploys** page again. The phone picks up the new version the next
time the app is opened online.
