# Weather Scout brand

Rocky the raccoon is the face of Weather Scout. `rocky-master.png` (1024x1024, transparent) is
the source for every image below; rebuild them all with `python3 scripts/make-brand-assets.py`.

| File | Used for |
| --- | --- |
| `web/public/rocky/rocky.webp` | Rocky in the Kid Zone, What to wear and storm-safe mode, with outfits drawn on top (`Raccoon.jsx`) |
| `web/public/rocky/rocky-face.webp` | Small inline Rocky in tabs, buttons and tips (`RockyFace.jsx`) |
| `web/public/rocky/rocky.png`, `rocky-face.png` | Connected apps such as Den-Duty (`raccoon.art` in `/api/connect/summary`) |
| `web/public/icon-192.png`, `icon-512.png` | Header logo, PWA icons, Unraid template icon |
| `web/public/icon-maskable-512.png` | Android adaptive icon (Rocky inside the safe circle) |
| `web/public/apple-touch-icon.png` | iOS home screen |
| `web/public/favicon.ico`, `favicon-32.png` | Browser tab |
| `docs/brand/rocky.png`, `weather-scout-icon.png` | README and other docs |

**Colors**: sky blue `#2f6fde` (theme), icon sky gradient `#4f98ff` to `#2360d6`, sun `#ffcd40`.
Rocky's own art is grayscale, so his outfits (yellow raincoat, red beanie and mittens) carry the color.

**Outfits** are SVG shapes in `Raccoon.jsx`, drawn in the master art's 1024x1024 coordinates. If the
master art changes pose, update the shapes and the `BODY` crop in both `Raccoon.jsx` and the script.
