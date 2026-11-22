# Personality Monsters

Two players share one phone, tablet or computer. Each takes a Big Five personality test (30 or 60 questions), then their answers hatch a 3D monster. The monsters fight; the results screen compares both tests and explains every stat.

## How personality becomes stats

| Stat | Comes from |
|---|---|
| ❤️ Health | 85 + 1.1 × Agreeableness + 0.65 × Conscientiousness |
| 🛡️ Defense (% damage shrugged off) | 5 + 0.24 × Conscientiousness + 0.24 × (100 − Neuroticism) |
| 🦷 Attack | 13 + 0.21 × (100 − Agreeableness) + 0.1 × Neuroticism |
| ⚡ Speed | 30 + 0.4 × Extraversion + 0.3 × Neuroticism |
| ✨ Cosmic slam chance (1.8× hit) | 4 + 0.18 × Openness |
| 🫧 Block chance | 0.18 × Conscientiousness |
| 🤗 Self-hug heal chance | 0.15 × Agreeableness |
| 😤 Tantrum chance (rage ×2 or trip) | 0.2 × Neuroticism |

Looks: Openness → eyes, antennae, weird body shapes; low Agreeableness → spikes, pointy teeth, angry brows; high Agreeableness → halo; Conscientiousness → armour plate; Extraversion → size; Neuroticism → sweat drop and jitters. Colour is random.

## Files

- `index.html`: screens and styles
- `app.js`: test, scoring, monster generator, fight, results, sounds (Web Audio, no files)
- `three.min.js`: three.js r187, bundled locally so it works offline
- `sw.js`: offline cache; `manifest.webmanifest` + icons: install as an app

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version the next time the app is opened online (sometimes a second open is needed).
