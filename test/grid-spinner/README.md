# Grid Spinner

**Mission: phase out fossil fuels.** Every grid starts with gas plants; replace them with wind, solar, hydro and batteries, plus nuclear for base load where the country allows it (new nuclear only in France; Switzerland keeps its existing plant), without letting the grid fall over. Six mission steps (first clean build, clean share 50 / 75 / 90 % over 24 h, last fossil plant scrapped, 24 h without gas) pay green subsidies; the CO₂ price rises every day. Completing the mission shows a FOSSIL-FREE screen with share and keep-playing.

New assets arrive **disconnected** (grey, not spinning): tap them on the wheel to connect them, and keep some idle as a reserve for emergencies.

The power grid as one giant shared rubber wheel. Its speed is the grid frequency (50 Hz). Generators are smaller discs pressing on it from outside, consumers are brake pads on the inside. Keep it in the ±0.2 Hz band as long as you can. Works offline once opened, installs as a fullscreen phone app.

- 4 grids: Switzerland (money in MCHF), Italy, Germany, France (MEUR), each with its own mix, weather and a starting fleet.
- 3 difficulties (Calm / Busy / Wild): more consumers, more erratic loads, faster surprises. Every game day it gets harder.
- Spinners: gas peaker, hydro, gas CCGT, nuclear (spin-up times 3–45 s, real inertia, automatic governor response), solar and wind (follow sun, clouds and wind; no inertia; storms and inverter trips), BESS and flywheel (automatic frequency response, limited energy; the flywheel adds inertia).
- Consumers: city homes, offices, data centre, factory, EV chargers, steel mill (arc furnace), railway, heat pumps.
- Surprises: plant trips, cloud fronts, storms, calm spells (these three come with a forecast), heatwaves / cold snaps, half-time kettle surge, big load disconnects, gas price spikes, inverter faults, new customers.
- Economy at real-world ballpark prices: build cost (OCGT 36, CCGT 120, hydro 180, nuclear 2,500, solar 48, wind 105, BESS 50 MW / 200 MWh 47, flywheel 40 MEUR), yearly upkeep, fuel + CO₂ per MWh, start-up cost, out-of-band penalties. Consumers pay 110 EUR/MWh. Money runs on a yearly clock (one game day = one year of cash flow). Bankrupt below −150 MEUR.
- Game over: 10 s (Calm 14 s, Wild 7 s) outside the band, or ±1 Hz at any moment.
- Engineering dashboard look (light, steel palette, type codes like CCGT / HYD / PV / BESS, monospace readouts, event log); on a desktop the wheel fills the screen with a side panel (chart, mix, all build cards).
- 🎓 Tutorial: a guided sandbox that starts from a still wheel at 0 Hz. Build the first hydro plant and watch it spin the grid up to 50 Hz, connect a town, then meet every plant, battery and consumer step by step (23 steps, skippable).
- Weather strip: sun and wind now, plus a 6-hour forecast. Cloud fronts, storms and calm spells are planned hours ahead, show up in the forecast and get a 🔮 warning 2 hours before they hit.
- Learn page with an interactive push/drag demo, plus a short first-game coach.
- Share ↗ on the game-over screen: recap picture plus link.

Views: the spinning wheel (default) or, with **3D world view** on in Settings, an isometric three.js world (`view3d.js` + bundled `three.min.js` r187, loaded only when switched on): cute low-poly plants, batteries, houses, offices, data centre, factory, chargers, steel mill, railway and heat pumps, all joined by neon wires (green to generators, red to consumers; a battery's turns red while it charges) to a central grid node that shows the frequency. Nothing spins: build pops up, scrap sinks, on/off shows as lights, smoke, steam, water and energy pulses on the wires; day and night follow the game clock. Same rules, same taps.

Controls: ▶ START / ⏸ PAUSE runs or stops the clock (a game starts stopped, so you can look around first). Tap a generator disc to switch it on/off, long-press for details. Each card has **+** (build one) and **−** (remove one: idle units go first, a running plant winds down and is then scrapped), so everything fits on a phone screen without scrolling. ☰ opens the menu: settings and the cash flow.

Bills: with **Auto-collect bills** on (the default, in Settings) customers' payments go straight to your cash. Switch it off and each consumer runs up a bill; a green money tag appears from 2 M and you tap it (or the consumer) to cash in. Uncollected bills stop growing at 12 M.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup, styles, Learn page |
| `game.js` | Simulation, drawing, menus, sound, share, service worker registration |
| `view3d.js`, `three.min.js` | 3D world view (three.js r187, MIT) |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install + fullscreen |
| `icon*.png`, `icon.svg`, `apple-touch-icon.png` | Icons, made by `icons/make_icons.py` |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push.
