# Weather Scout

A self-hosted, kid-friendly weather station for the whole family. It runs in one
Docker container (Unraid friendly), keeps every API key on your server, and pulls
from free, official data sources.

**What's in this first release (MVP)**

- **Today**: current conditions, feels-like, dew point, pressure trend, UV, air quality,
  a 2-hour "rain starting in…" nowcast, a scrubbable 48-hour timeline and a 10-day forecast.
- **NWS alerts** for your exact location, most severe first, with plain-language kid versions.
- **Radar & Cams map**: a smooth, loopable NEXRAD radar animation, alert polygons, and
  state DOT 511 road cameras pinned where they really are (clustered, with live snapshots).
- **Kid Zone**: Rocky the raccoon dresses for the weather (raincoat when rain chance is over
  60%, beanie and mittens when it feels below 35°F, shades on sunny high-UV days), a tap-to-pack
  gear checklist, a green/yellow/red recess rating, "Why is this happening?" mini-lessons,
  and a sunset / stargazing countdown.
- **Profiles**: local username sign-in, tinyauth SSO, and admins can link an SSO identity to a
  username. Saved places, units and Kid Mode follow you between devices.
- Installable as a phone/desktop app (PWA manifest), light and dark themes.

See [docs/ROADMAP.md](docs/ROADMAP.md) for everything else on the board and when it lands,
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

## Run it

### Docker Compose

```bash
cp .env.example .env      # set your home lat/lon and NWS contact email
docker compose up -d      # http://localhost:8080
```

### Unraid

1. Copy `unraid/weather-scout.xml` to `/boot/config/plugins/dockerMan/templates-user/` on the
   flash drive.
2. *Docker > Add Container*, pick **weather-scout**, set your home latitude/longitude and NWS
   contact, and apply. App data lives in `/mnt/user/appdata/weather-scout`.

The image is built and published to `ghcr.io/spacegoose02/weather-scout` by GitHub Actions
on every push to `main` (amd64 and arm64).

### First visit

If you didn't set `ADMIN_USERNAME`/`ADMIN_PASSWORD`, the first visit asks you to create the
admin account. Admins manage people, SSO links and see camera feed health under
**Family & settings**.

## Keys and private data

Nothing secret lives in this repository.

- Settings and keys come from environment variables (`.env`, git-ignored, or the Unraid template).
- Camera feeds are defined in `/data/cameras.json` and refer to keys by variable name
  (`"keyEnv": "NY511_API_KEY"`), so the file itself is safe to share.
- The browser never sees upstream URLs or keys: camera snapshots are proxied through the server,
  and only for cameras in your configured feeds.
- The database, session secret and camera config live in the `/data` volume.

## Camera feeds

**Virginia, Maryland and Kentucky work out of the box.** With no config, Weather Scout loads
these public camera feeds (no keys needed):

| State | Source | What you get |
| --- | --- | --- |
| Virginia | 511 Virginia (VDOT) | Snapshots + live HLS video |
| Maryland | MD iMAP / CHART | Live video player |
| Kentucky | KYTC GIS | Snapshots |

Set `CAMERAS_DEFAULT_FEEDS` to `false` to turn them off, or to a list such as `va,md` to pick states.

To add other states or your own cameras, copy
[`server/cameras.example.json`](server/cameras.example.json) to `/data/cameras.json` and enable
the feeds you want (a cameras.json replaces the built-in list, so copy in the entries you want to keep). Supported types:

| type | for | key |
| --- | --- | --- |
| `ibi511` | States on the IBI/Castle Rock 511 developer API (511NY, 511GA, 511WI, 511AZ, Idaho, Alaska…) | free developer key from that state's 511 site |
| `geojson` | Any GeoJSON point layer with a snapshot (`image`), HLS (`video`) or player page (`embed`) property, such as 511 Virginia. Map property names with `fields`. |
| `arcgis` | An ArcGIS MapServer/FeatureServer layer URL (paged automatically), such as Maryland and Kentucky. Same `fields` mapping. | optional, sent as a query param (`keyParam`) or header (`keyHeader`) |
| `static` | Your own cameras (porch cam, sky cam) | none |

Feed health (camera counts and errors) shows under *Family & settings*.

## Data sources

| Data | Source | Key |
| --- | --- | --- |
| Forecast, current, hourly, 10-day, nowcast | [Open-Meteo](https://open-meteo.com/) best-match blend (HRRR, GFS, ECMWF, ICON, …) | none |
| Air quality (US AQI, PM2.5, PM10, ozone) | Open-Meteo Air Quality (CAMS) | none |
| Watches, warnings, advisories | [api.weather.gov](https://www.weather.gov/documentation/services-web-api) | none, but set `NWS_USER_AGENT` |
| Radar loop | NEXRAD composite tiles from [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) | none |
| Map | OpenStreetMap | none |
| Cameras | VA, MD and KY public feeds, plus any state 511 feed you add | none for the built-in states |

Open-Meteo's free tier is for non-commercial use, which fits a family server. All upstream
responses are cached on the server (forecast 10 min, alerts 2 min, cameras 15 min) so a house
full of devices only costs one request.

## Develop

```bash
npm install
npm run dev --workspace server   # API on :8080
npm run dev --workspace web      # UI on :5173, proxies /api
npm test                         # server (node:test) + web (vitest)
```

Node 22.13+ is required (uses the built-in `node:sqlite`).
