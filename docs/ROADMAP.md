# Roadmap

Every card from the planning board, grouped into phases. Phase 1 is this first release.

## Phase 1: MVP (this release)

| Board card | Status |
| --- | --- |
| Create new weather app | ✅ |
| Containerized by Docker | ✅ Multi-stage image, healthcheck, compose file, amd64 + arm64 CI build |
| Unraid setup | ✅ `unraid/weather-scout.xml` template |
| Kid friendly | ✅ Kid Mode toggle and Kid Zone tab |
| Keep private information out of release | ✅ Keys in env only, `.env`/`data/` git-ignored, keys never sent to the browser |
| APIs and keys are server wide | ✅ One set of env vars for the whole server |
| Profiles/users for customization | ✅ Saved places, units, Kid Mode per user |
| SSO tinyauth sign in, username sign in | ✅ Both, usable together |
| Admin can link SSO and username | ✅ Family & settings |
| 7 to 10-day extended forecast, weekly forecast | ✅ 10-day |
| Current / feels like temp | ✅ |
| Hyperlocal minute-by-minute rain forecast | ✅ 15-minute nowcast for 2 hours (Open-Meteo). True 1-minute needs a paid source, see Phase 3 |
| Scannable hourly timeline (24-48 h) | ✅ 48-hour chart with scrubber |
| Fast-loading Doppler radar map, loopable | ✅ 55-minute NEXRAD loop. Precipitation type and storm tracks in Phase 2 |
| Pull alerts from NWS by local area | ✅ |
| Air Quality Index & UV | ✅ US AQI, PM2.5, PM10, ozone, UV |
| Wind data, temperature tracking | ✅ Current + hourly + daily |
| Pull up Virginia VDOT 511 cam feeds by map / state cameras / cameras on the map where they belong | ✅ Virginia, South Carolina, Maryland and Kentucky built in (public feeds, no keys), North Carolina with a free DriveNC key; other states plug in via cameras.json. WV, TN and DC: no documented public feed found yet |
| Kid Mode: gear checklist | ✅ |
| Kid Mode: playground / recess rating | ✅ |
| Kid Mode: golden hour / stargazing timers | ✅ Sunset countdown + tonight's cloud cover. Planet/Moon visibility in Phase 2 |
| Interactive raccoon avatar that dresses for the weather | ✅ Rule-based outfits. AI personality in Phase 3 |
| "Why is this happening?" micro-lessons | ✅ Rule-based cards for fog, thunder, rain, snow, pressure, humidity, wind, UV, wind chill, alerts |
| Dew point | ✅ With comfort words |
| Barometric pressure tracking | ✅ 3-hour trend. Migraine alerts in Phase 2 |

## Phase 2: Learning, notifications, richer maps

| Board card | Plan |
| --- | --- |
| Severe weather push notifications (watches, warnings, lightning, high wind) | Web Push from the server; background poll of NWS per saved place |
| Daily observation journal | Per-kid entries (icons, high/low, rain gauge), stored per user |
| Badges & achievements | First frost, thunderstorm spotted, double rainbow, journal streaks |
| Learning section for kids and adults | Lesson library; same lessons at two reading levels |
| Storm center: tornadoes, wildfires, hurricanes | Explainers + live data where it exists |
| Learn about clouds, droughts, El Niño, ocean | Lessons; US Drought Monitor and NOAA ENSO status feeds |
| Hurricane tracker | NHC active storms, cones and advisories on the map |
| Ocean data | NOAA NDBC buoys and tides |
| Live lightning | Strike markers with age rings and distance from you (source TBD: Blitzortung community feed or a paid API) |
| Radar precipitation type and storm cell tracks | Rain/snow/mix layer; NWS storm-track overlays |
| Local and national weather news, RSS feeds | Admin-managed RSS list (NWS office, local TV) |
| YouTube weather gurus | Admin-curated channel list (Ryan Hall Y'all, Max Velocity, Reed Timmer, …) |
| Admin can edit news and YouTube lists | Admin page |
| Health: barometric pressure warnings | Alerts on fast pressure swings for migraine/joint sensitivity |
| Health: pollen & particulates | Pollen needs a US source (Open-Meteo pollen is Europe-only); candidates: Google Pollen API, Tomorrow.io |
| Health: wet-bulb globe temperature | Compute WBGT from temp, humidity, wind and sun |
| Golden hour: planets and Moon | Moon phase/rise and bright planets from an astronomy library |
| Custom dashboards (pin, hide, rearrange widgets) | Drag-and-drop layout saved per user |
| Android APK | Wrap the PWA with a Trusted Web Activity (Bubblewrap) once push works |
| Windows 11 widget | PWA widgets (Windows supports them for installed PWAs) |

## Phase 3: Pro and AI features

| Board card | Plan |
| --- | --- |
| Weather expert that answers like a kid would understand | Chat backed by an LLM with the current forecast as context; needs one server-wide API key |
| Take a picture of a cloud, AI tells you about it | Vision model; pairs with the Interactive Cloud Identifier |
| AI-enabled web search | Same assistant, with search for "why" questions |
| AI-assisted ensembles (GraphCast, WeatherNext) with confidence intervals | Show AI model runs next to physics models, if a free source exists |
| ECMWF, GFS, ICON side-by-side model comparison | Open-Meteo per-model endpoints, plotted together |
| HRRR & NAM for short-fuse storms | Open-Meteo HRRR/NAM endpoints + model loop |
| Confidence & spread metrics (10th/50th/90th percentile) | Open-Meteo ensemble API |
| Base velocity / storm-relative velocity | NEXRAD Level 3 products (needs a radar renderer or a tile provider) |
| Correlation coefficient (debris signatures) | Same |
| KDP and ZDR (rain vs hail) | Same |
| Live animated cloud & sky chamber | Animated scene driven by real wind speed, cloud cover, precip type |
| Interactive cloud identifier | Field guide + camera match |
| Integrate with local weather stations | Ambient Weather / Ecowitt / Tempest APIs, or a local MQTT feed |
| Webhooks & smart home (Home Assistant, MQTT) | Outbound webhooks and MQTT publish on thresholds (frost, high wind) |
| Windy for maps | Windy Map Forecast API layer (needs a Windy key) |
| Integrate with Den-Duty | Need details on what Den-Duty is and what it should exchange |
