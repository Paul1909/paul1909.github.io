# ACCURATE horoscope

A guided horoscope (Sun, Moon and rising sign calculated from birth date, time and city), a short accuracy rating, then the reveal: the text was random, and the real sky on your birthday could not have influenced anything.

- The horoscope is the same for everyone: Bertram Forer's 1949 personality profile. The reveal names the study and links to Forer on Wikipedia.
- Birthplace: searched worldwide in OpenStreetMap (Photon search as you type; Nominatim on Enter if Photon is down; built-in big-city list if offline). The time zone comes from the coordinates (`tzlookup.js`), so historical summer time is applied. "I don't know" falls back to the phone's time zone.
- Last page ends with an interactive map of the sky above the birthplace at the birth time (slider for ±12 h, tap to name stars and planets).

## Files
- `index.html`: screens and styles
- `app.js`: flow, horoscope generator, reveal, sky page
- `astro.js`: astronomy (JPL planet elements, Moon series, ascendant, Halley, Voyagers)
- `data.js`: the Forer text, constellation stars
- `skymap.js`, `skydata.js`: sky map and star catalogue (d3-celestial data by Olaf Frohn, BSD-3-Clause)
- `tzlookup.js`: coordinates → time zone (@photostructure/tz-lookup, CC0)
- `cities.js`: cities with coordinates, used to place the phone's time zone
- `manifest.webmanifest`, icons: home-screen icon
- `sw.js`: stub that removes the old offline cache from phones that had it

## Install on a phone
- Android: open the address in Chrome → ⋮ → **Add to home screen** → **Install**. It opens fullscreen from the icon.
- iPhone: Safari → Share → **Add to Home Screen**.
- Needs internet (no offline mode).
