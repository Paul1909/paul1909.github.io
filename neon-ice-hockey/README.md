# Neon Ice Hockey

Two-player neon air hockey for one phone. Installable, works offline, no build step,
no external libraries. Sound effects are generated in code (no audio files).

## Files
- `index.html` — page layout and styles
- `game.js` — the game code (physics, controls, sound effects)
- `_headers` — Netlify security rule: only the site's own script files may run
  (this also stops Netlify's injected "Powered by Netlify" badge)
- `manifest.webmanifest` — makes it installable as a full-screen app
- `sw.js` — offline cache
- `icon-*.png` — home-screen icons

Keep all game code in `game.js`. Code inside `<script>` tags in `index.html`, or
`onclick="..."` attributes, will be blocked by the security rule.

## Put it on your phone (Android)
1. Log in at https://app.netlify.com → Projects → **Add new project → Deploy manually**,
   and drag this **neon-ice-hockey** folder onto the drop zone.
2. Turn off the badge too if you like: Project configuration → General →
   Powered by Netlify badge (the `_headers` rule already blocks it).
3. Open the site's URL in Chrome on your phone → ⋮ → **Add to home screen** → **Install**.
4. Open it once while online. After that it works offline, full screen, portrait.

## Playing
- Lay the phone flat between the two players. Player 1 is at the top, Player 2 at the bottom.
- Drag your mallet anywhere in your own half. Both players touch their half to face off.
- Score by getting the puck into the other player's goal. After a goal, the player who
  conceded gets the puck.
- Pause: a quick swipe up from the bottom edge (or the Android back gesture) opens
  Resume / Quit to Menu.
- Theme, goals to win, sound and vibration are remembered between games.

## Stopping the notification pane during play
A web app can't block Android's edge swipes. To lock them out, use Android's App pinning:
Settings → Security (→ More security settings) → App pinning → On. Open the game, open
Recents (swipe up from the bottom and hold), tap the game's icon at the top of its preview
→ Pin. To unpin: swipe up from the bottom and hold.

## Updating later
Edit the files, change `VERSION` in `sw.js` (e.g. `nih-v2`), and drag the folder onto
the bottom of your Netlify site's **Deploys** page. The phone picks up the new version the
next time the app is opened online.
