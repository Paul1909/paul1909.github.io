# Call of BESS

A first-person shooter set in a battery energy storage plant, somewhere in Germany.
Built with Claude Fable 5.2. Based on the game Saltline: same weapons and movement, new map, mission and sound.

## Files

- `index.html` – the page: styles and the few lines of markup
- `game.js` – the whole game, bundled (includes three.js)
- `suspended-haze.mp3` – background music

## Updating

Do not edit `game.js` by hand: it is generated. Change the sources, run `node join.js --web <this folder>` in the
source folder, and push the regenerated files.

Desktop browser with mouse and keyboard recommended. Needs an internet connection for the fonts only.
