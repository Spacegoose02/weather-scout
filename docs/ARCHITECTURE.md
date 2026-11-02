# Architecture

```
 browser (React + Leaflet PWA)
     │   /api/*  (same origin, cookie session or tinyauth headers)
     ▼
 Weather Scout server (Node 22, Fastify)  ──►  /data volume
     │  TTL cache + request coalescing          weather-scout.db (SQLite: users, sessions, prefs)
     │                                           cameras.json, .session-secret
     ├─► Open-Meteo forecast + air quality + geocoding
     ├─► api.weather.gov alerts + points
     ├─► state 511 camera feeds (keys from env)
     └─► camera snapshot proxy (only for known camera ids)

 browser ──► IEM NEXRAD radar tiles, OpenStreetMap tiles (public, no key)
```

## Why these choices

- **One container, one process.** The server serves the built web app and the API, so Unraid
  only needs one port and one appdata folder. No Redis or Postgres to babysit.
- **Built-in SQLite (`node:sqlite`).** No native build step, so the image works on amd64 and
  arm64 without compilers.
- **Server-side keys and proxying.** Every key lives in env vars on the server. The browser only
  calls our `/api`, which also lets http-only DOT cameras show on an https site.
- **Normalize at the edge.** Providers (`server/src/providers/*`) turn each upstream format into
  one shape, so adding a data source (Tomorrow.io, a local weather station, Windy) doesn't touch
  the UI.
- **Kid logic is pure functions** (`server/src/kid.js`): outfit, checklist, recess rating, lessons.
  They are unit tested with synthetic forecasts and work in °F or °C.

## Sign-in model

| Mode | How |
| --- | --- |
| Guest | Default. Weather is visible on your LAN; prefs stay in the browser. |
| Local | Username + password (scrypt). Signed, httpOnly session cookie, 30 days. 5 bad tries locks that username for a minute. |
| tinyauth SSO | tinyauth authenticates at the proxy and forwards `Remote-User`/`Remote-Email`/`Remote-Name`. With `AUTH_TRUST_PROXY_HEADERS=true` the server maps `Remote-User` to a user's `sso_subject`, creating the user on first visit if `AUTH_AUTO_CREATE_SSO_USERS=true`. |
| Linking | An admin sets a user's SSO identity in *Family & settings*, so an existing local profile works through SSO too. |
| Locked down | `AUTH_REQUIRED=true` blocks all weather endpoints for guests. |

Only trust proxy headers when the container is reachable **only** through the proxy (don't publish
the port to the LAN), otherwise anyone can send a fake `Remote-User` header.

### tinyauth example (Traefik labels)

```yaml
labels:
  traefik.http.routers.weather.rule: Host(`weather.example.com`)
  traefik.http.routers.weather.middlewares: tinyauth
  traefik.http.middlewares.tinyauth.forwardauth.address: http://tinyauth:3000/api/auth/traefik
  traefik.http.middlewares.tinyauth.forwardauth.authResponseHeaders: Remote-User,Remote-Email,Remote-Name
```

Then set `AUTH_TRUST_PROXY_HEADERS=true` and `SSO_LOGOUT_URL=https://auth.example.com/logout`.

## Code map

```
server/src/
  app.js            routes, auth hooks, error handling
  config.js         env parsing, per-install session secret
  cache.js          TTL cache, fetch helper
  db.js / auth.js   SQLite schema, users, sessions, SSO mapping
  kid.js            Kid Zone logic
  health.js         pressure swings, WBGT heat stress
  sky.js            moon phase
  media.js          admin news/YouTube lists
  push.js           Web Push: subscriptions, VAPID keys, alert loop
  ai.js             Ask an Expert / Rocky chat, cloud photos, web search (Claude or Ollama)
  tts.js            Kokoro read-aloud proxy and voice list
  weathercodes.js   WMO codes with kid descriptions
  providers/        openmeteo, nws, radar, cameras, news (RSS/Atom/YouTube)
web/src/
  App.jsx           layout, tabs, data loading
  components/       CurrentConditions, HourlyTimeline, DailyForecast, Details,
                    AlertsBanner, WeatherMap, KidMode, Raccoon (Rocky + outfits),
                    RockyFace, SignIn, Admin
public/             Rocky art, app icons, favicon (built by scripts/make-brand-assets.py)
```

## API

| Endpoint | What |
| --- | --- |
| `GET /api/weather?lat&lon&units` | Everything the Today and Kid views need in one call |
| `GET /api/forecast`, `/api/alerts`, `/api/air` | The pieces, individually |
| `GET /api/radar` | Radar frame list (tile URL templates) |
| `GET /api/push/key`, `POST /api/push/subscribe`, `/unsubscribe`, `/status`, `/test` | Web Push sign-up per device; a background loop (every `PUSH_POLL_SECONDS`) checks NWS for each subscribed place and sends each new alert once |
| `GET /api/ai/status`, `POST /api/ai/chat`, `POST /api/ai/cloud` | AI helper (only with `ANTHROPIC_API_KEY`): chat with the live forecast as context, cloud photo identifier, optional web search |
| `GET /api/tts/voices`, `POST /api/tts` | Kokoro read-aloud (only with `KOKORO_URL`): English voice list, and MP3 speech for a text |
| `GET/POST /api/stations/push[/:token]` | Personal weather station uploads (Ecowitt form POST, Ambient and Weather Underground GET). Token or home network only; no sign-in |
| `GET /api/stations?units` | Latest reading from each station, converted, plus the primary station id |
| `GET /api/admin/integrations` | Station and Home Assistant (MQTT/REST) status |
| `GET /api/news?lat&lon&kid` | Local and national weather news, YouTube videos, and the local NWS office's products (with lat/lon); `kid=true` keeps kid-safe items only |
| `GET /api/cameras?south&west&north&east` | Cameras in the map view |
| `GET /api/cameras/image/:id` | Snapshot proxy |
| `GET /api/geocode?q`, `/api/reverse-geocode?lat&lon` | Place search |
| `POST /api/auth/login`, `/logout`, `/setup`; `GET /api/auth/me` | Sign-in |
| `GET/PUT /api/me/preferences` | Per-user settings |
| `/api/admin/users` (GET, POST, PATCH `:id`, DELETE `:id`), `/api/admin/cameras`, `/api/admin/app-keys`, `/api/admin/media` | Admin |
| `GET /api/tropics` | Active NHC storms plus their forecast cones and tracks as GeoJSON (15 min cache) |
| `GET /api/buoys?south&west&north&east&units` | Latest NDBC buoy observations in view (15 min cache) |
| `GET /api/tides?lat&lon&units` | Nearest tide station within 60 miles and its next highs and lows (60 min cache) |
| `GET /api/models?lat&lon&units` | Daily and 72-hour forecasts from each model (ECMWF, GFS, ICON, GEM, HRRR, GraphCast, AIFS) plus day-by-day agreement (30 min cache) |
| `GET /api/ensemble?lat&lon&units&model=ecmwf_ifs025\|gfs_seamless` | Ensemble 10th/50th/90th percentiles, confidence and rain chance (60 min cache) |
| `GET /api/radar` | Radar products for the map (composite loop, single site, echo tops, rain totals, future radar) and the satellite layer |
| `GET /api/radar/sites` | NEXRAD sites and which are reporting (10 min cache) |
| `GET /api/alerts/national` | Every active NWS alert with a polygon, colored and ranked, plus counts (2 min cache) |
| `GET /api/outlook?day=1-3` | SPC convective outlook categories (15 min cache) |
| `GET /api/connect/summary` (Bearer app key) | Kid-safe summary for Den-Duty and other apps, see [CONNECT.md](CONNECT.md) |
