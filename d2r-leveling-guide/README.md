# D2R Leveling Guide

Offline leveling planner for Diablo II: Resurrected (Reign of the Warlock, patch 3.2).
Pick a class and the build you want to end up with, enter your level and difficulty, and the app tells you
where every skill and stat point goes, level by level, and when to respec at Akara.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup and styles |
| `app.js` | UI (Now / Roadmap / Offline / Heroes tabs), saved heroes, service worker registration |
| `engine.js` | Level-by-level simulator: prerequisites, required levels, hard-point cap (clvl − req + 1), quest rewards, Akara respecs |
| `data.js` | Skill trees for all 8 classes, 24 builds with staged plans, runewords, offline tips |
| `sw.js` | Offline cache — bump `VERSION` on every update |
| `manifest.webmanifest`, `icon*` | Install / home-screen icon |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Adding or changing a build

Each build in `data.js` is a list of stages. A stage has a start level (`at`), an optional `respec: true`,
and a priority list `pri` of `[skillId, targetPoints, optionalMinLevel]`. Each new point goes to the first entry
that can still take one; prerequisites get their point automatically. Stats use target values per level
(`stats: { str: [[level, value], ...] }`), the rest goes into Vitality.

## Updating

Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version the next time the app is opened online.
