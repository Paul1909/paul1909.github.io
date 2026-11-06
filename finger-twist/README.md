# Finger Twist

Twister for fingers on one phone, for 1–4 players. Each player owns a colour (red, blue, yellow, green).
On your turn a tile lights up in your colour: put a finger on it and keep it there. Once you have the
maximum number of fingers down (4 with 2 players, 3 with 3, 2 with 4, 5 solo), each turn asks you to
move one: the finger marked with a white ↑ goes to the new tile. Lift a finger, slide off a tile or miss
the timer and you are out. Last colour standing wins. Solo mode counts how many moves you last.

Speeds: Chill (no timer), Normal (7 s down to 3.5 s), Fast (4.5 s down to 2.2 s).
Options: sound, voice announcements (uses the phone's own offline voice if installed), vibration, fullscreen.

Works fully offline once opened.

## Files

| File | What it is |
|---|---|
| `index.html` | Screens and styles |
| `app.js` | Game logic, touch handling, sounds, service worker registration |
| `sw.js` | Offline cache (bump `VERSION` on every update) |
| `manifest.webmanifest` | Makes it installable (name, colours, icons) |
| `_headers` | Blocks the "Powered by Netlify" badge |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | App icons |

## Deploy on Netlify

1. Log in at app.netlify.com (free account). Go to **Projects → Add new project → Deploy manually**
   and drag this `finger-twist` folder (the one that directly contains `index.html`). If the site shows
   "Page not found", the folder one level too high was dropped.
2. If Netlify marks the project as private or pre-launch, make it public. Chrome can't install a page
   that asks for a password.
3. On the phone, open the site's address in Chrome → ⋮ → **Add to home screen** → **Install**.
   On iPhone: Safari → Share → **Add to Home Screen**.
4. Open it once while online. After that it works offline.

## Updating later

Change the files, bump `VERSION` in `sw.js` (e.g. `finger-twist-v2`), then open the project's **Deploys**
page on Netlify and drag the folder onto it again. The phone picks up the new version the next time the
app is opened with internet. Each manual deploy uses some of the Free plan's monthly credits, so batch
changes into one upload.

If the badge still shows, the deploy probably went out without `_headers` (some zip tools skip files
starting with `_`), so drag the folder itself rather than a re-zipped copy.
