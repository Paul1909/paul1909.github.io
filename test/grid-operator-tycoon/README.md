# Grid Operator Tycoon

RollerCoaster Tycoon, but for a country's power grid. Build plants, string pylons between them and the towns, keep the lights on and the books in the black. Works offline once opened, installs as a fullscreen phone app.

- **Isometric country map**: sea, beaches, plains, forests, hills, snowy mountains and rivers. Drag to pan, pinch or scroll to zoom. Day and night, rain, snow, storms.
- **Plants**: solar, wind, offshore wind, hydro dams (lake fills with snowmelt), gas peaker, CCGT, coal, nuclear, small modular reactor, battery (BESS), pumped hydro, substations. Real-ish costs, sizes, ramp rates, start-up times and forced outages. Wind and sun sites differ per tile (shown while placing).
- **Lines**: 110 / 220 / 380 kV, cost per tile with terrain (subsea cables cost 3.5×). Power flow is a real DC load flow, so flows split over parallel paths. Overloaded lines heat up and trip, and storms knock lines out. Loops keep towns lit (N-1).
- **Dispatch**: automatic merit order with ramp limits, start-up planning, batteries charging cheap and covering peaks and trips, hydro water value, imports and exports at the neighbours' spot price. Shortfalls become rolling blackouts with fines.
- **Towns**: RCT-style thought bubbles, mood from tariff, blackouts, smog, pylons and turbines in view, nuclear next door and clean power. Happy towns grow; approval is the average mood. Big customers (data centres, battery factories, electrolysers) ask for connections with a deadline.
- **Tycoon layer**: cash, loans (automatic emergency loans first), tariff slider, maintenance level, R&D budget and tree (control centre redispatch, smart meters, dynamic line rating, 380 kV, Batteries 2.0, bifacial solar, offshore wind, pumped hydro, SMR), yearly accounts, rising CO₂ price, gas price spikes, weather events with a forecast.
- **Scenarios**: First Spark (guided tour), Coal Country (phase out coal), Alpine Republic (old nuclear retires), Windward Isles (subsea cables, 75 % renewables), Sandbox. Gold / silver / bronze for finishing early. Autosaves every game month.
- **Share ↗** on the end screen and in the menu: a recap picture of your grid plus the link.

One game hour per second at 1× (3× and 8× too). Each game day stands for a whole month of cash flow.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup and styles, How to play |
| `data.js` | Plant catalogue, research, events, scenarios, thoughts |
| `world.js` | Map generator, scenario setup, building rules |
| `sim.js` | Weather, demand, dispatch, load flow, economy, towns, goals |
| `render.js` | Isometric canvas renderer |
| `ui.js` | Touch/mouse input, tools, HUD, panels, advisor, thought bubbles |
| `app.js` | Game loop, saving, title and end screens, sound, share, service worker registration |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install + fullscreen |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Candy Tile icons (pylon), made with `icons/make_icons.py` helpers |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push.
