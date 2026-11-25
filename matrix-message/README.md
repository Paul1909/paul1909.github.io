# Matrix Message

Type a message (up to 280 characters, a tweet), watch it decode out of Matrix rain, and send it to someone.

- **Secret link**: the message and your settings travel in the link (after the `#`). The other person sees "Incoming transmission", taps, and watches it decode.
- **Picture + link**: a 1080×1350 still of the decoded message plus the link.
- **Video**: records the animation on the phone (MP4 where the browser supports it, otherwise WebM) and shares it.

Short messages sit on one row. If a message is too long for one readable row it wraps onto two; very long messages use more rows (turning the phone sideways reduces them). Press Enter in the text box for a line break of your own.

Settings (remembered on the device, and sent along with the link): rain characters (Classic, Katakana, 0 1, Hex, A–Z, symbols, hearts, your message's own letters, or any custom characters including emoji), animation length (4–30 s), rain speed, trail length, rain colour, message colour, ending (fade to message / keep raining / loop), uppercase, CRT scanlines.

## Files

| File | What it is |
|---|---|
| `index.html` | Page, styles, composer + settings markup |
| `app.js` | Rain engine, layout, links, sharing, video recording, service worker registration |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Makes it installable and fullscreen |
| `icon.svg`, `icon-*.png`, `apple-touch-icon.png` | Icons |

## Install on a phone

- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Open it once while online. After that it works offline.

## Updating

Change the files, bump `VERSION` in `sw.js` (`matrix-message-v2`, …), push. Phones pick up the new version the next time the app is opened online.
