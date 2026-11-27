# Command and Conquer: Grid Management

A grid operator game in the style of a classic 90s real-time strategy game: snowy pixel-art map, metal sidebar with build pictures, power bar, radar and an EVA voice. Instead of armies you build power plants, string pylons to villages and keep the lights on through the winter. Fan parody, not affiliated with EA; every sprite is drawn in code.

- **Sidebar**: credits counter, radar (needs a SCADA Dome and enough power), REPAIR / SELL / POWER tools, power bar (what your plants can deliver now vs demand), build pictures with the clock-wipe timer and READY.
- **Plants**: coal, gas turbine (AUTO start), wind, solar, hydro dam (across the river), nuclear reactor, battery bunker (BESS). Plus power lines, substations (outposts), SCADA Dome, Service Depot, Tesla Coil, Repair Truck, Patrol Jeep.
- **Grid**: villages connect when a line touches a house; each connected island of lines is balanced on its own, so a broken line can black out a village. Ramp rates, start-up times, minimum loads, trips, curtailment, battery charging and gas shaving.
- **Trouble**: blizzards and storms snap lines, copper thieves strip pylons, cold snaps, windless dark spells, plant trips. Day and night, snow on solar panels, fog of war.
- **Missions**: 1 Operation First Light (guided tutorial), 2 Cold Front, 3 Operation Clean Sweep (phase out coal), Skirmish: Endless Winter (winter or spring map).
- **Share ↗** on the end screen (recap picture + link), on the title screen and in the pause menu.

One game hour = 5 seconds at 1× (2× and 4× too). Autosaves every 3 game hours; Continue on the title screen.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup, styles, screens, field manual |
| `data.js` | Structure catalogue, missions, events |
| `sprites.js` | Procedural pixel art: terrain, buildings, villages, units, cameos |
| `world.js` | Map generator, occupancy, grid islands, placement rules, path finding |
| `sim.js` | Weather, demand, dispatch, economy, villages, units, goals |
| `render.js` | Canvas renderer, shroud, night lights, weather, radar |
| `ui.js` | Sidebar, input, selection panel, EVA messages, tutorial |
| `app.js` | Loop, screens, saving, sound, voice, share, service worker registration |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install + fullscreen |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Candy Tile icons (Tesla coil), made with `icons/make_icons.py` helpers |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline. Landscape plays best.

## Updating

Change the files, bump `VERSION` in `sw.js`, push.
