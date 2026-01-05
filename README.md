# Food Monitor (static PWA)

Mobile-only PWA to snap meals (often on a scale), ask OpenAI to guess foods/weight/macros, then store text+numbers locally (photos never saved).

## Use
```
python3 -m http.server 3000   # or any static host
# open http://localhost:3000
```
Enter your OpenAI API key in the UI (kept in localStorage). You can open `index.html` directly, but service worker/manifest and camera prompts work best from localhost/HTTPS. Paths are relative so GitHub Pages works at `https://vitorhpepz.github.io/food/`.

## Internals
- `index.html`, `styles.css`, `app.js` – UI + OpenAI Vision (`gpt-5.2`) call from the browser.
- `sw.js` – caches static assets.
- `manifest.webmanifest` – PWA metadata (no bundled icons).

Keep images reasonable (<8MB). If the model returns non-JSON, the raw text shows and you can edit/save manually.
