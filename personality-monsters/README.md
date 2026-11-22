# Personality Monsters

Two players share one phone, tablet or computer. Each takes a Big Five personality test (30 or 60 questions), then their answers hatch a 3D monster. The monsters fight; the results screen compares both tests and explains every stat.

## How personality becomes stats

| Stat | Comes from (one trait each) |
|---|---|
| ❤️ Health | 125 + 0.5 × Agreeableness |
| 🛡️ Defense (% damage shrugged off) | 5 + 0.3 × Conscientiousness |
| 🦷 Attack | 22 + 0.09 × Neuroticism |
| ⚡ Speed | 55 + 0.22 × Extraversion |
| ✨ Cosmic slam chance (2.2× hit) | 5 + 0.3 × Openness |

Looks (all cute, pastel and round): Openness → number of eyes, antennae, squashy mochi body; low Agreeableness → soft back nubs, a pout with tiny fangs, grumpy brows; high Agreeableness → smile and halo; Conscientiousness → tummy patch with buttons; Extraversion → size; Neuroticism → sweat drop and jitters. Colour is random. Each monster is simply called after its player.

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
