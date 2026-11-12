# Name That Tune: Queen Edition

Hear a 15-second clip of a Queen song and pick the right title from 4 options before the timer runs out.
10 rounds per game, up to 200 points a round (50 for the right answer + 10 for every second left).

Song previews are streamed from Apple Music through the iTunes Search API while you play
(nothing is downloaded into this repo). Each answer links to the song on Apple Music.
The app itself opens offline, but the clips need an internet connection.

## Files
- `index.html`: screens and styles
- `app.js`: game logic, Apple preview lookup, timer, scoring
- `songs.js`: the song pool (add or remove titles here)
- `sw.js`: offline cache for the app files
- `manifest.webmanifest` + icons: installable, fullscreen

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**.
- iPhone: Safari → Share → **Add to Home Screen**.

## Updating
Change the files, bump `VERSION` in `sw.js`, push.
