# Name That Tune: Backstreet Boys Edition

Hear a 15-second clip of a Backstreet Boys song and pick the right title from 4 options before the timer runs out.
10 rounds per game, up to 200 points a round (50 for the right answer + 10 for every second left).
White-skin variant of the Queen edition (`../queen-name-that-tune/`), same engine.

Song previews are streamed from Apple Music through the iTunes Search API while you play
(nothing is downloaded into this repo). Each answer links to the song on Apple Music.
The app itself opens offline, but the clips need an internet connection.

## Files
- `index.html`: screens and styles (white skin)
- `app.js`: game logic, Apple preview lookup, timer, scoring
- `songs.js`: the song pool for Easy / Medium / Hard (add or remove titles here)
- `sw.js`: offline cache for the app files
- `manifest.webmanifest` + icons: installable, fullscreen

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online.

## Updating
Change the files, bump `VERSION` in `sw.js`, push.
