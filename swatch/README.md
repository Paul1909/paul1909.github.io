# Swatch: name that crayon

A colour swatch appears; name it. Crayola crayons (120) or Caran d'Ache Neopastels (96).
The intro asks who's playing: **For her** gets the whole box, **For him** only the basic names (red, blue, green…).
Light neutral theme: her side is written in Dancing Script, his in Arial. Minimal text, and the four choices never show their colours.
Three ways to guess: *Close calls* (four look-alike shades), *Open box* (four random names), *Write it* (type the name; one typo is forgiven on longer names).
Ten rounds, streak bonus, best score saved per player/box/mode on this device.

Originally made with Grok (React/Tailwind); rewritten as plain HTML/CSS/JS so it works offline in Paolo's Arcade.

## Files
- `index.html` – markup and styles
- `app.js` – game logic, sound, service worker registration
- `data.js` – colour names and hex values
- `fonts/` – Dancing Script and Arimo (an Arial clone for phones without Arial), both SIL Open Font License, bundled for offline use
- `sw.js` – offline cache
- `manifest.webmanifest`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` – install + icons

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating
Change the files, bump `VERSION` in `sw.js`, push. The phone picks up the new version next time the app is opened online.
