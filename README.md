<p align="center">
  <img src="docs/brand/rocky.png" alt="Rocky the raccoon, the face of Weather Scout" width="200" />
</p>

# Weather Scout

Meet **Rocky the raccoon**, the face of Weather Scout. Rocky greets kids in the Kid Zone, dresses
for the day's weather, stays calm with them in storm-safe mode, and is the app icon on every phone
and desktop it's installed on.

A self-hosted, kid-friendly weather station for the whole family. It runs in one
Docker container (Unraid friendly), keeps every API key on your server, and pulls
from free, official data sources.

**What's in this first release (MVP)**

- **Today**: current conditions, feels-like, dew point, pressure trend, UV, air quality,
  a 2-hour "rain starting in…" nowcast, a scrubbable 48-hour timeline and a 10-day forecast.
- **Your own dashboard**: Today is a grid of cards you can pick, drag into order and size (S, M, L):
  forecast, radar loop, nearby cameras, alerts, tides, why-lessons, Rocky's outfit, the Den-Duty board,
  a weather journal and Stargazing tonight (which planets are up, where to look, moonrise and moonset).
  Layouts are saved per account; guests get a sensible default that an admin can replace with their own.
- **On this day**: a dashboard card with today's forecast against the 1991–2020 normal, the record
  high, low, wettest and snowiest for today's date, where today ranks, notable past years, a chart and
  table of every year since 1940, and how the date has warmed or cooled. In the US the records come from
  the nearest NOAA ThreadEx city station (via ACIS, often back to the 1800s); elsewhere from Open-Meteo's
  free ERA5 archive. Kids get a **weather time machine** in Kid Zone › Explore: slide back through the
  years, play "warmer or colder than today?", hear Rocky's record book and earn the Time Traveler badge.
- **Next 2 hours, wind, air & UV**: a 15-minute rain chart for the next 2 hours, a wind compass
  with a 24-hour wind and gust chart, and an air quality breakdown by pollutant with 48-hour AQI and
  UV strips and a sunscreen window. The map adds an infrared satellite layer.
- **Hurricanes & ocean**: active storms from the National Hurricane Center with forecast cones and
  tracks on the map, NOAA buoys (waves, water temperature, wind), and today's tides when you're near
  the coast.
- **Ocean** (🌊 tab, made for kids with a grown-up view too): the latest ocean discoveries from NOAA Ocean
  Exploration, Schmidt Ocean Institute, MBARI and ScienceDaily, with kid-sized summaries, topic tags, "wow
  word" meanings and read-aloud (and "Rocky, explain it!" when the AI helper is on); a creature of the week
  from 26 sea animals; a depth explorer that dives from the waves to Challenger Deep through every zone;
  the nearest live NOAA buoys (waves, water temperature) and tides; and an ocean quiz. Five Ocean explorer
  badges. Change the news sources with `OCEAN_FEEDS`.
- **Models**: what ECMWF, GFS, ICON, GEM, HRRR and the AI models AIGFS (NOAA's GraphCast-based model) and AIFS each predict,
  plotted together, with an ensemble confidence band (10th to 90th percentile), a High/Medium/Low
  confidence rating per day and a side-by-side table. Forecast maps show any one model (or two
  side by side) across the region for temperature, rain and snow, wind, clouds or pressure, every
  3 hours with a play button. US places start on the whole lower 48. Keyless (Open-Meteo grid on Esri/OSM tiles); ECMWF, GFS and ICON
  also open in Windy.
- **Health & sky**: pressure-swing warnings for migraine-sensitive folks, wet-bulb globe temperature
  heat stress, moon phase and sunrise/sunset.
- **NWS alerts** for your exact location, most severe first, with plain-language kid versions.
- **Family safety plan** (🛡️ in the account menu, the Safety plan dashboard card, or the alerts banner):
  a shelter spot for tornadoes, severe thunderstorms, floods and hurricanes, meeting places, emergency
  contacts, an editable Ready.gov-style emergency kit checklist, drill log, and a one-page printout for
  the fridge. Grown-ups (admins) edit it; anyone signed in can tick off the kit. When a tornado, severe
  thunderstorm, flood or hurricane **warning** comes in, a big "where to shelter" pop-up opens on its own
  (once per warning) with your family's spot; in Kid Mode Rocky walks kids through it calmly. Warning push
  notifications say where to shelter, and the plan is cached on each device in case the internet drops.
- **Radar & Cams map**: a smooth, loopable NEXRAD radar animation, alert polygons, and a **full-screen
  radar** (single NEXRAD sites, echo tops, rain totals, HRRR future radar, every active NWS warning
  nationwide with a warnings list, SPC severe outlooks, dark map), plus
  state DOT 511 road cameras pinned where they really are (clustered, with live snapshots).
  A **🌬️ Windy** button opens [Windy](https://www.windy.com) right where you're looking: animated
  wind, gusts, rain, temperature, clouds, pressure, storm energy and waves from ECMWF, GFS or ICON,
  at the ground or up to the jet stream, with a one-line kid explanation of each layer.
- **Kid Zone**: Rocky the raccoon dresses for the weather (raincoat when rain chance is over
  60%, beanie and mittens when it feels below 35°F, shades on sunny high-UV days), a tap-to-pack
  gear checklist, a green/yellow/red recess rating, "Why is this happening?" mini-lessons,
  and a sunset / stargazing countdown. Plus Rocky's daily fact or joke (read aloud), weather
  bingo, a kid forecaster game, dress-Rocky, backyard experiments, camera field trips, a
  seasons photo tracker, badges, and a calm storm-safe mode during warnings.
- **Junior Storm Chaser** (Kid Zone › Storm Chaser): *Chase Day*, where Rocky explains today's Storm Prediction
  Center outlook in kid words (risk level, target states, tornado, hail and wind odds, the storm ingredients and what it
  means at home); *Pick your target*, where kids tap the outlook map before 3 PM Central and are scored that evening
  against real SPC storm reports, with points, chaser ranks and a chase log; *Live chase*, with the Storm Center's trusted storm chaser list, shown only while tornado or severe
  thunderstorm warnings are up and starting muted; and *Storm cards*, collectible cards made from the day's
  real storm reports with rarity, power and a binder. Nine chaser badges go on the badge shelf.
- **Storm picture of the day**: a real tornado or lightning photo every day in the Kid Zone (and as a
  dashboard card), with a kid caption, a fun fact and a 🔊 button so Rocky reads it aloud. Photos
  come from Wikimedia Commons (mostly NOAA / NSSL public domain shots of the sky, never damage or
  people); the photographer and license are pulled live from Commons and shown under every picture,
  and anything not freely licensed is skipped. Kids can flip through the last three weeks in an
  album and earn the *Storm Gazer* badge. Admins can hide any picture for everyone (right on the
  card, or in *Family & settings*) and add their own from Commons. Needs outbound access to
  `commons.wikimedia.org` and `upload.wikimedia.org`.
- **Profiles**: local username sign-in, tinyauth SSO, and admins can link an SSO identity to a
  username. Saved places, units and Kid Mode follow you between devices.
- **News & Videos**: local and national weather news. Your NWS office's outlook, forecast
  discussion and public statements show up on their own; admins add RSS feeds (local TV, NOAA,
  NASA, with one-click suggestions) and YouTube channels, playlists or single videos in
  *Family & settings*, mark each local or national and kid-safe, reorder, pause, and hide single
  stories. Kid Mode shows only kid-safe sources and skips stories about deaths or injuries.
- **Severe weather alerts on your phone**: tap 🔔 to get a push notification when the NWS issues a
  warning, watch or advisory for your place, even with the app closed. Needs an https address
  (behind your reverse proxy); on iPhone, add Weather Scout to the Home Screen first.
- **Rocky's morning briefing**: a short kid-friendly rundown of the day (temperature, rain chance,
  what to wear, recess, any alerts, plus a fun fact) at the top of the Kid Zone, with a 🔊 button that
  reads it in the Kokoro voice. In 🔔 alerts, tick *Rocky's morning briefing* and pick a time to get it
  as a notification every morning at that place's local time; tapping it opens the briefing ready to
  play. Works without AI; with the AI helper on, *Rocky's own words* lets Rocky retell it.
- **Ask an Expert / Ask Rocky** (optional, runs on Claude or your own Ollama): a chat that answers weather
  questions using your live forecast and alerts, in kid language as Rocky when Kid Mode is on.
  Snap a photo of the sky and it names the cloud and what it means. Turn on web search for
  "why" and news questions (kid-safe science sites only in Kid Mode). See [AI helper](#ai-helper).
- **Connected apps**: a keyed, kid-safe weather summary for Den-Duty boards, Home Assistant or
  scripts ([docs/CONNECT.md](docs/CONNECT.md)).
- **Your own weather station** (Ecowitt, Ambient Weather, Tempest, or anything that speaks the
  Weather Underground protocol) next to the forecast, and **Home Assistant** sensors over MQTT
  with auto-discovery, or its REST API ([docs/HOME-ASSISTANT.md](docs/HOME-ASSISTANT.md)).
- Installable as a phone/desktop app (PWA manifest with Rocky app icons), light and dark themes.

See [docs/ROADMAP.md](docs/ROADMAP.md) for everything else on the board and when it lands,
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

## Run it

### Docker Compose

```bash
cp .env.example .env      # optional: sign-in settings; everything else can be set in the app
docker compose up -d      # http://localhost:8080
```

### Unraid

1. Copy `unraid/weather-scout.xml` to `/boot/config/plugins/dockerMan/templates-user/` on the
   flash drive.
2. *Docker > Add Container*, pick **weather-scout** and apply. The template only asks for the
   port, the app data folder (`/mnt/user/appdata/weather-scout`) and sign-in. Everything else is set
   in the app (see [Settings](#settings)).

The image is built and published to `ghcr.io/spacegoose02/weather-scout` by GitHub Actions
(amd64 and arm64). Every push to `main` updates `:latest`; a release tag such as `v0.1.0`
also publishes `:0.1.0` and `:0.1`, so you can pin a version in Unraid instead of following `latest`.

### First visit

If you didn't set `ADMIN_USERNAME`/`ADMIN_PASSWORD`, the first visit asks you to create the
admin account. Admins manage people, SSO links, settings and camera feed health under
👤 → **Family & settings**.

### Settings

Sign in as an admin and open 👤 → **Family & settings**. Two panels cover everything that used to be a
container variable:

- **AI helper & Rocky's voice**: Claude or Ollama, models, daily limit, web search, Kokoro voice, speed
  and fallback, with *Test connection* and *Preview voice*.
- **App settings**: home place and units (with a place search), NWS contact, road camera keys, Windy key,
  weather stations (upload token, names, Ambient, Tempest), Home Assistant (MQTT and REST), push alerts,
  the SSO sign-out link and the Android app fingerprint. Camera keys, Ambient, Tempest, MQTT and Home
  Assistant each have a *Test* button.

Saved settings are kept in the database in `/data`, take effect right away (no restart), and win over
environment variables, which become the defaults. Keys are write-only: after saving, the page only shows
the last 4 characters. Each field says whether its value is *saved here*, *from Unraid template* (an
environment variable) or the *default*, and *use template value* goes back to the environment variable.

A few settings stay in the container on purpose, because they are needed before the app can start or
decide who can reach this page at all:

| Setting | Why it stays in the container |
| --- | --- |
| Port, `/data` path (`DATA_DIR`) | Needed before the app starts and finds its database |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Create the first admin, before anyone can sign in |
| `AUTH_REQUIRED`, `AUTH_TRUST_PROXY_HEADERS`, `AUTH_PROXY_*_HEADER`, `AUTH_AUTO_CREATE_SSO_USERS`, `SECURE_COOKIES`, `SESSION_SECRET`, `SESSION_DAYS` | Decide who can sign in and depend on your reverse proxy. A wrong value saved in the app could lock everyone out (or let anyone in) with no way back except the container settings |
| `VAPID_*` | Generated on first start and kept in `/data`; changing them breaks every push subscription |
| `CAMERA_FEEDS_JSON`, `CAMERAS_FILE`, `IP_LOCATION` | Advanced; custom feeds live in `/data/cameras.json` |

Every other variable in this README still works (handy for Docker Compose); a value saved in the app
simply wins over it. Existing Unraid installs keep their variables as defaults.

### HTTPS (for "Use my location" and phone alerts)

Browsers only share GPS location, and only allow push notifications, on **https://** pages
(or `localhost`). On plain `http://<unraid-ip>:8080` the 🎯 button explains this and offers an
approximate location from your internet connection instead (set `IP_LOCATION=false` to turn
that off). Searching a city or ZIP always works.

To get https on Unraid, put Weather Scout behind a reverse proxy, for example:

- **Nginx Proxy Manager** or **SWAG** (Community Apps): point a hostname such as
  `weather.example.com` at `http://<unraid-ip>:8080` and request a Let's Encrypt certificate.
  Turn on websockets support. If you use tinyauth, add it here.
- **Tailscale**: `tailscale serve --bg 8080` on the Unraid host gives an
  `https://<host>.<tailnet>.ts.net` address that works on every device in your tailnet, with
  nothing exposed to the internet.
- **Cloudflare Tunnel** (`cloudflared`): a public https hostname without opening ports.

Behind https, also set `SECURE_COOKIES=true`.

### Android app and Windows 11 widget

Once you have https, GitHub Actions can build an **Android app** (APK) that opens your server
full screen, and Windows 11 can show a **Weather Scout today** card on the Widgets board.
Setup, signing keys and install steps are in [docs/APPS.md](docs/APPS.md).

## Keys and private data

Nothing secret lives in this repository.

- Settings and keys come from *Family & settings* (stored in the database in `/data`) or environment
  variables (`.env`, git-ignored, or the Unraid template). Saved keys are never sent back to the browser.
- Camera feeds are defined in `/data/cameras.json` and refer to keys by variable name
  (`"keyEnv": "NY511_API_KEY"`), so the file itself is safe to share.
- The browser never sees upstream URLs or keys: camera snapshots are proxied through the server,
  and only for cameras in your configured feeds.
- The database, session secret and camera config live in the `/data` volume.

## Camera feeds

**Virginia, South Carolina, Maryland, Kentucky and Delaware work out of the box. North Carolina, New York,
Georgia and Ohio switch on with a free key.** With no config, Weather Scout loads these camera feeds:

| State | Source | What you get |
| --- | --- | --- |
| Virginia | 511 Virginia (VDOT) | Snapshots + live HLS video |
| South Carolina | 511 South Carolina (SCDOT) | Snapshots + live HLS video |
| Maryland | MD iMAP / CHART | Live video player |
| Kentucky | KYTC GIS | Snapshots (refresh every 30 s) |
| Delaware | DelDOT on Delaware FirstMap | Live HLS video |
| North Carolina | DriveNC | Snapshots, with `NC_DRIVENC_API_KEY` |
| New York | 511NY | Snapshots (some live video), with `NY511_API_KEY` |
| Georgia | 511GA | Snapshots, with `GA511_API_KEY` |
| Ohio | OHGO | Snapshots, with `OHGO_API_KEY` |

### Getting the free camera keys

Each key takes a few minutes and costs nothing. Keys stay on your server; they are never sent to the browser.

| Setting | Steps |
| --- | --- |
| `NC_DRIVENC_API_KEY` | Create an account at [drivenc.gov](https://www.drivenc.gov), sign in, then request a key on the [developer page](https://www.drivenc.gov/developers/doc). |
| `NY511_API_KEY` | Create an account at [511ny.org](https://511ny.org), then request a key on the [developer page](https://511ny.org/developers/doc). |
| `GA511_API_KEY` | Create an account at [511ga.org](https://511ga.org), then request a key on the [developer page](https://511ga.org/developers/doc). |
| `OHGO_API_KEY` | [Register with OHGO](https://publicapi.ohgo.com/docs/registration); the key arrives by email. |

Paste the key under **Family & settings → App settings → Road cameras**, press *Test*, then *Save
app settings*. The state switches on right away, no restart. (Setting the variable in `.env` or the
container also works.) *Family & settings* then shows the state with its camera count; until then it
lists the state as needing a key, with a link to get one.

Not built in yet: West Virginia (WV511) and Tennessee (SmartWay) have no public camera feed we could
find (SmartWay's camera list sits behind its own website), and Pennsylvania (511PA) gives feeds only
after a [data-feed request to PennDOT](https://www.pa.gov/services/penndot/request-access-to-transportation-related-data-feeds.html).
Once you have access, add them to `cameras.json`.

Set *Built-in camera feeds* (`CAMERAS_DEFAULT_FEEDS`) to `false` to turn them off, or to a list such as `va,md,nc` to pick states.

To add other states or your own cameras, copy
[`server/cameras.example.json`](server/cameras.example.json) to `/data/cameras.json` and enable
the feeds you want (a cameras.json replaces the built-in list, so copy in the entries you want to keep). Supported types:

| type | for | key |
| --- | --- | --- |
| `ibi511` | States on the IBI/Castle Rock 511 developer API (511NY, 511GA, 511WI, 511AZ, Idaho, Alaska…) | free developer key from that state's 511 site |
| `geojson` | Any GeoJSON point layer with a snapshot (`image`), HLS (`video`) or player page (`embed`) property, such as 511 Virginia. Map property names with `fields`. |
| `arcgis` | An ArcGIS MapServer/FeatureServer layer URL (paged automatically), such as Maryland and Kentucky. Same `fields` mapping. | optional, sent as a query param (`keyParam`) or header (`keyHeader`) |
| `ohgo` | Ohio's OHGO public API | `keyEnv` |
| `static` | Your own cameras (porch cam, sky cam) | none |

Feed health (camera counts and errors) shows under *Family & settings*.

## AI helper

The **Ask an Expert** tab (called **Ask Rocky** in Kid Mode) appears once the server has either
an Anthropic API key (Claude) or the address of an Ollama server (models you run yourself).
Without either, the tab is simply hidden and everything else works as before.

**Easiest:** sign in as an admin, open 👤 → *Family & settings* → *AI helper & Rocky's voice*, fill in
a Claude key or an Ollama address, press *Test connection*, then *Save*. It takes effect right away,
no restart. Values saved there are kept in the data folder (`/data`), win over the environment
variables below, and keys are never shown again (only their last 4 characters). *Use template
value* next to a field goes back to the environment variable.

- **Claude**: create a key at [console.anthropic.com](https://console.anthropic.com/) (pay as you
  go) and paste it in *Family & settings* (or set `ANTHROPIC_API_KEY`).
- **Ollama**: enter its address in *Family & settings* (or `OLLAMA_URL`), e.g. `http://192.168.1.20:11434`, and pull a model that can see
  photos, e.g. `ollama pull gemma3`. Free and private, but answers are slower and less accurate
  than Claude on most home hardware.

| Setting | Default | What |
| --- | --- | --- |
| `AI_PROVIDER` | (blank) | `anthropic`, `ollama` or `off`. Blank picks whichever is set up, Claude first |
| `ANTHROPIC_API_KEY` | (blank) | Claude key. Stays on the server, never sent to the browser |
| `AI_MODEL` | `claude-opus-5-5` | Any Claude model id, e.g. `claude-sonnet-5-5` or `claude-haiku-5-5` for lower cost |
| `OLLAMA_URL` | (blank) | Your Ollama server, reachable from the Weather Scout container |
| `OLLAMA_MODEL` | `gemma3` | Chat model. Must be pulled on the Ollama server |
| `OLLAMA_VISION_MODEL` | same as `OLLAMA_MODEL` | Model for cloud photos, if your chat model can't see images (e.g. `qwen2.5vl`, `llama3.2-vision`) |
| `OLLAMA_API_KEY` | (blank) | Free key from [ollama.com](https://ollama.com/settings/keys). Only needed for *Search the web* with Ollama |
| `AI_WEB_SEARCH` | `true` | Lets people tick *Search the web*. In Kid Mode searches only read NOAA, NWS, NASA, USGS and similar science sites |
| `AI_DAILY_LIMIT` | `40` | Questions and photos per person (or per device for guests) per day. `0` = no limit |

With Ollama, *Search the web* looks the question up with Ollama's web search first and hands the
results to your local model, since most local models can't search on their own. Without an
`OLLAMA_API_KEY` the search box is hidden.

Each question sends the model your place's current conditions, the next 12 hours, the week
ahead, air quality and active NWS alerts, so answers are about *your* weather. Cloud photos
are shrunk in the browser to a few hundred KB, are not saved, and only go to the model. Web search
is billed by Anthropic per search on top of tokens.

## Read-aloud voice (Kokoro)

Rocky reads facts, storm steps, experiments and Ask Rocky answers aloud. By default that uses the
device's built-in voice, which often sounds robotic. For a natural voice, run
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) (a small open text-to-speech model; on
Unraid, add the `ghcr.io/remsky/kokoro-fastapi-cpu` container, port 8880) and either fill in
*Family & settings* → *Rocky's read-aloud voice* (pick the voice, speed and press *Preview voice*)
or set:

| Setting | Default | What |
| --- | --- | --- |
| `KOKORO_URL` | (blank) | e.g. `http://192.168.1.20:8880`. Blank = device voice |
| `KOKORO_VOICE` | `af_heart` | Rocky's default voice. Kids can pick another under 🗣️ *Voice* in the Kid Zone or Ask tab |
| `KOKORO_SPEED` | `1` | 0.5 to 2 |
| `KOKORO_FALLBACK` | `browser` | When Kokoro can't answer: `browser` reads with the device's own voice, `off` stays quiet |

Speech goes through the Weather Scout server (and is cached), so phones never talk to Kokoro
directly. If Kokoro is down, read-aloud quietly falls back to the device voice (unless
`KOKORO_FALLBACK=off`).

## Windy maps

The 🌬️ *Windy* button on the Radar & Cams map works with no setup: it opens the free Windy embed.
For the full Windy map (smoother layer switching, no embed limits), get a **Map Forecast API** key at
[api.windy.com/keys](https://api.windy.com/keys), set its allowed domain to your Weather Scout address,
and paste it under *Family & settings → App settings → Windy maps* (or set `WINDY_MAP_KEY`). Windy map keys are browser keys, so the key
is sent to the browser inside the Windy map page; it is never in the repository or `/api/config`, and
the page needs sign-in when `AUTH_REQUIRED=true`. Which models and layers show depends on your key's plan.

### Windy webcams

Windy also runs a big library of public webcams (beaches, mountains, towns, airports). To show them on the
Radar & Cams map, make a **Webcams API** key at [api.windy.com/keys](https://api.windy.com/keys) (a different
key from the Map Forecast one; the free plan is fine), paste it under *Family & settings → App settings →
Windy maps & webcams*, and press *Test Webcams key*. Then:

- *Layers → Cameras → Windy webcams* switches the 🌄 pins on or off (next to the state road cameras).
- *🌄 Webcams near me* on the map opens the closest webcams to the place you're looking at, with a big
  picture and today's timelapse.

Without a key the layer and the button stay hidden. The key stays on the server: it is never sent to the
browser, put in the repository or the Unraid template. Windy's picture links expire (10 minutes on the free
plan), so Weather Scout only keeps the webcam list for 5 minutes, lets the browser load pictures straight from
Windy (it never downloads or stores them), and credits every webcam to Windy.com with a link to its page.

### Live storm chasers

*Learn → Storm Center* shows storm chasers who are streaming live on YouTube, and a small pop-up
appears when they're live while severe warnings or watches are active near you. Each person picks
*When storms are near me* (default), *Whenever storm chasers are live*, or *Never* under the list.
With no setup, Weather Scout checks a trusted list of chaser channels (Ryan Hall Y'all, Reed Timmer,
Pecos Hank, Max Velocity, Live Storms Media, Vince Waelti) through their public live pages. Admins
can change the list, and add an optional YouTube Data API v3 key, in *Family & settings*: the key adds
viewer counts and, for grown-ups, a YouTube search for other live chasers (about 7,200 of the free
10,000 daily quota units at most). Kid Mode only ever shows the trusted list.

## Live lightning

The Radar & Cams map has a **⚡ Lightning** layer (normal and full screen) with every strike from the last
30 minutes, fading from white-hot to red as it ages. Under *🔔 Alerts* you pick a distance (5 to 50 miles):
the app shows a banner when lightning strikes inside it, with the 30-30 rule countdown ("stay inside until
30 minutes after the last strike"), and each device can also get a push notification plus an all-clear.
Kid Mode adds Rocky's **Count to 30** thunder timer.

- **NOAA GOES satellite lightning (GLM)** is on by default: free, no key, the whole Americas, about a minute
  behind, located to roughly 8 km. The server only downloads it (about 1 MB a minute) while someone has the
  map or banner open, or a device has lightning push alerts on.
- **Blitzortung.org ground sensors** are optional: strikes within seconds, located to a few hundred meters.
  Their data is free for **private, non-commercial use only** and is credited on the map, so it stays off
  until an admin turns it on for a personal home server. Please consider
  [hosting a sensor](https://www.blitzortung.org/en/cover_your_area.php) if you use it.

Admins change both, and pick GOES-East or GOES-West, in *Family & settings → ⚡ Live lightning*. The same
names also work as environment variables (`LIGHTNING_GLM`, `LIGHTNING_GLM_SATELLITE`,
`LIGHTNING_BACKFILL_MIN`, `BLITZORTUNG_ENABLED`), but saved settings win.

## Data sources

| Data | Source | Key |
| --- | --- | --- |
| Forecast, current, hourly, 10-day, nowcast | [Open-Meteo](https://open-meteo.com/) best-match blend (HRRR, GFS, ECMWF, ICON, …) | none |
| Hurricanes | [National Hurricane Center](https://www.nhc.noaa.gov/) active storms, cones and tracks | none |
| Buoys and tides | NOAA [NDBC](https://www.ndbc.noaa.gov/) and [Tides & Currents](https://tidesandcurrents.noaa.gov/) | none |
| Model comparison and ensembles | Open-Meteo per-model forecasts and [ensemble API](https://open-meteo.com/en/docs/ensemble-api) | none |
| Air quality (US AQI, PM2.5, PM10, ozone) | Open-Meteo Air Quality (CAMS) | none |
| Pollen | Open-Meteo (CAMS) in Europe; [Google Pollen API](https://developers.google.com/maps/documentation/pollen) for the US and elsewhere | none in Europe; optional `GOOGLE_POLLEN_API_KEY` (set it in Family & settings) |
| Watches, warnings, advisories | [api.weather.gov](https://www.weather.gov/documentation/services-web-api) | none, but set `NWS_USER_AGENT` |
| Satellite | NASA [GIBS](https://earthdata.nasa.gov/gibs) GOES-East infrared | none |
| Severe outlooks | NOAA [Storm Prediction Center](https://www.spc.noaa.gov/) | none |
| Lightning | NOAA [GOES GLM](https://registry.opendata.aws/noaa-goes/) on AWS Open Data; optional [Blitzortung.org](https://www.blitzortung.org/) (private, non-commercial use) | none |
| Radar loop | NEXRAD composite tiles from [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/) | none |
| Map | OpenStreetMap | none |
| Wind and model maps | [Windy](https://www.windy.com) embed, or the Map Forecast API | none for the embed, optional `WINDY_MAP_KEY` |
| Cameras | VA, SC, MD, KY and DE public feeds; NC, NY, GA and OH with free keys; plus any state 511 feed you add | none for VA, SC, MD, KY, DE |
| Webcams (optional) | [Windy Webcams API](https://api.windy.com/webcams) | a free Windy Webcams key, set in Family & settings |
| Ask an Expert, cloud photos, web search (optional) | [Claude](https://www.anthropic.com/claude) via the Anthropic API, or your own [Ollama](https://ollama.com/) | `ANTHROPIC_API_KEY`, or `OLLAMA_URL` |
| Live storm chasers | YouTube live streams from a trusted chaser list, plus YouTube search with a key | none; optional `YOUTUBE_API_KEY` (set it in Family & settings) |
| Read-aloud voice (optional) | Your own [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) | none |

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

## Brand

Rocky's master art is [`docs/brand/rocky-master.png`](docs/brand/rocky-master.png). Every app icon,
favicon and in-app Rocky image is generated from it:

```bash
python3 scripts/make-brand-assets.py   # needs Pillow
```

See [docs/brand/README.md](docs/brand/README.md) for which file is used where.
