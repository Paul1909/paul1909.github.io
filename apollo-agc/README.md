# Apollo AGC

An offline phone app that runs the real Apollo 11 guidance computer software on an emulated
Apollo Guidance Computer, with a working DSKY, a live view of what the software is doing,
hands-on astronaut lessons, a source-code reader and a guided tour of the code.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup and styles |
| `app.js` | The app: DSKY, live panel, lessons, code viewer, tour |
| `agc.js` | The AGC CPU emulator (JavaScript port of Virtual AGC's yaAGC `agc_engine.c`) |
| `content.js` | Lesson steps, tour stops, program names, notes |
| `data/luminary099.*` | Lunar Module (Eagle) software: `.rope` binary, `.map` address→source line, `.json` source + symbols |
| `data/comanche055.*` | Command Module (Columbia) software, same layout |
| `sw.js` | Offline cache |
| `manifest.webmanifest`, icons | Install as an app, fullscreen |

## Where the code comes from

- Source: Luminary 099 and Comanche 055 as transcribed by the Virtual AGC project
  (github.com/virtualagc/virtualagc; the popular github.com/chrislgarry/Apollo-11 repo is an older copy of the same files).
  The Virtual AGC copy is used because it has been proofed against the original octal rope listings.
- Assembled with Virtual AGC's `yaYUL`. The resulting binaries are identical, word for word,
  to the `Luminary099.binsource` and `Comanche055.binsource` rope dumps.
- The emulator is a port of yaAGC (GPL v2), so this app is GPL v2 too. The Apollo source is public domain.

Not simulated: the spacecraft around the computer (IMU, radar, engines, hand controllers),
so mission programs like P63 can't fly. Everything the computer does on its own (Executive,
Waitlist, interrupts, restarts, PINBALL displays, alarms, standby) is the real code running.

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js`, push. Phones pick up the new version the next time
the app is opened online (a second open may be needed).
