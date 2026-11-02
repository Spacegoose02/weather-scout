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
| Hyperlocal minute-by-minute rain forecast | ✅ 15-minute nowcast for 2 hours (Open-Meteo), with a "Next 2 hours" bar chart (light, moderate or heavy, rain or snow). True 1-minute needs a paid source, see Phase 3 |
| Scannable hourly timeline (24-48 h) | ✅ 48-hour chart with scrubber |
| Fast-loading Doppler radar map, loopable | ✅ 55-minute NEXRAD loop, plus an infrared satellite layer (NASA GIBS, GOES-East). Precipitation type and storm tracks in Phase 2 |
| Pull alerts from NWS by local area | ✅ |
| Air Quality Index & UV | ✅ US AQI, PM2.5, PM10, ozone, UV |
| Wind data, temperature tracking | ✅ Current + hourly + daily, and a Wind card with a compass, gusts and a 24-hour wind and gust chart |
| Pull up Virginia VDOT 511 cam feeds by map / state cameras / cameras on the map where they belong | ✅ Virginia, South Carolina, Maryland and Kentucky built in (public feeds, no keys), North Carolina with a free DriveNC key; other states plug in via cameras.json. WV, TN and DC: no documented public feed found yet |
| Kid Mode: gear checklist | ✅ |
| Kid Mode: playground / recess rating | ✅ |
| Kid Mode: golden hour / stargazing timers | ✅ Sunset countdown + tonight's cloud cover, plus Moon phase (Phase 2). Planets in Phase 2 |
| Interactive raccoon avatar that dresses for the weather | ✅ Rocky (new brand art, also the app icon) with rule-based outfits drawn on top. AI personality in Phase 3 |
| "Why is this happening?" micro-lessons | ✅ Rule-based cards for fog, thunder, rain, snow, pressure, humidity, wind, UV, wind chill, alerts |
| Dew point | ✅ With comfort words |
| Barometric pressure tracking | ✅ 3-hour trend. Migraine alerts in Phase 2 |

## Kid Zone games and learning

Eight kid features added after the MVP. They live in the Kid Zone under Today, Play, Explore and Badges. Signed-in kids keep their progress on the server; guests keep it in the browser.

| Feature | Status |
| --- | --- |
| Weather bingo: a daily card of things to spot (puddle, contrail, windy flag…) | ✅ New 3x3 card every day, picked to match the weather (puddles on rainy days, frost on cold ones). Badges for a line and for a full card |
| Kid forecaster: guess tomorrow's high and rain, earn points when the real weather comes in | ✅ Scored against Open-Meteo's measured weather for that day: up to 3 points for the high, 2 for rain |
| Rocky's daily fact: one fact or joke each morning, with read-aloud | ✅ 50 facts and jokes, read aloud with the browser's voice. Read-aloud also on Rocky's bubble, storm steps and experiments |
| Backyard experiments tied to badges (rain gauge, pinecone hygrometer, paper wind vane…) | ✅ Six experiments, each with its own badge, "Good today!" tips from the forecast and live readings to compare |
| Camera field trips: guided tours of the road cameras | ✅ Seven missions (raining now, snowiest, foggy, sunny, coldest, warmest, windiest) using live weather at up to 30 nearby cameras, with a passport to stamp. Needs camera feeds switched on |
| Storm-safe mode: calm steps during a warning, "where to go" checklist, no scary wording | ✅ Turns on for warnings and thunder. Tap-off steps, family safe spot, breathing helper, practice drill on calm days |
| What to wear: dress Rocky, then he says if it fits the forecast | ✅ Stars and tips from the same outfit rules Rocky uses |
| Seasons tracker: photos of the same tree or yard through the year | ✅ Named spots, side-by-side compare, season chips and a Four Seasons badge. Needs sign-in so photos are saved |

## Phase 2: Learning, notifications, richer maps

| Board card | Plan |
| --- | --- |
| Severe weather push notifications (watches, warnings, lightning, high wind) | ✅ Web Push per device: pick a place and warnings / watches / advisories (high wind is an NWS warning). Lightning alerts wait on a lightning source |
| Daily observation journal | Per-kid entries (icons, high/low, rain gauge), stored per user |
| Badges & achievements | 🚧 19 Kid Zone badges are in (bingo, forecaster, experiments, field trips, storm drill, seasons). Still to come: first frost, thunderstorm spotted, double rainbow, journal streaks |
| Learning section for kids and adults | Lesson library; same lessons at two reading levels |
| Storm center: tornadoes, wildfires, hurricanes | Explainers + live data where it exists |
| Learn about clouds, droughts, El Niño, ocean | Lessons; US Drought Monitor and NOAA ENSO status feeds |
| Hurricane tracker | ✅ Active NHC storms with forecast cones, tracks and advisories on the map, and a Hurricane tracker card on Today when a storm is within 2,000 miles |
| Ocean data | ✅ NOAA NDBC buoys on the map (waves, water temperature, wind) and a Tides card with the next highs and lows from the nearest CO-OPS station within 60 miles |
| Live lightning | Strike markers with age rings and distance from you (source TBD: Blitzortung community feed or a paid API) |
| Radar precipitation type and storm cell tracks | 🚧 Full-screen radar adds single-site NEXRAD (super-res), echo tops, MRMS 1 h / 24 h rain, HRRR future radar, nationwide warning polygons and SPC Day 1-3 outlooks. Rain/snow/mix and storm tracks still to come |
| Local and national weather news, RSS feeds | ✅ News & Videos tab, admin-managed RSS/Atom list (NWS office, local TV) |
| YouTube weather gurus | ✅ Admin-curated channels (paste a link or @handle), latest videos play in the app |
| Admin can edit news and YouTube lists | ✅ Family & settings |
| Health: barometric pressure warnings | ✅ Health & sky card flags 4+ hPa (watch) and 6+ hPa (big swing) changes within 6 hours. Push alerts come with notifications |
| Health: pollen & particulates | 🚧 Air & UV card on Today: AQI per pollutant (PM2.5, PM10, ozone, NO₂) and the main pollutant, a 48-hour AQI and UV strip and a sunscreen window. Pollen shows where Open-Meteo has it (Europe); a US source still needs a key (Google Pollen API, Tomorrow.io) |
| Health: wet-bulb globe temperature | ✅ Shade WBGT now and 24-hour peak, with heat-stress flag advice. Full-sun WBGT needs solar radiation, later |
| Golden hour: planets and Moon | 🚧 Moon phase, % lit and next full/new Moon on the Today card's Health & sky tile and in the Kid Zone's Sky watch (`server/src/sky.js`, also in `/api/connect/summary`). Next: moonrise/moonset and bright planets |
| Custom dashboards (pin, hide, rearrange widgets) | Drag-and-drop layout saved per user |
| Android APK | Wrap the PWA with a Trusted Web Activity (Bubblewrap) once push works |
| Windows 11 widget | PWA widgets (Windows supports them for installed PWAs) |

## Phase 3: Pro and AI features

| Board card | Plan |
| --- | --- |
| Weather expert that answers like a kid would understand | ✅ Ask an Expert tab (Ask Rocky in Kid Mode): Claude with the live forecast, alerts and air quality as context. Server-wide `ANTHROPIC_API_KEY`; hidden when no key is set |
| Take a picture of a cloud, AI tells you about it | ✅ Snap or upload a sky photo in the Ask tab: cloud type, confidence, what it means for the weather, a fun fact. Photos aren't stored |
| AI-enabled web search | ✅ *Search the web* toggle with cited sources; Kid Mode searches only NOAA/NWS/NASA-style science sites |
| AI-assisted ensembles (GraphCast, WeatherNext) with confidence intervals | ✅ Models tab shows Google DeepMind GraphCast and ECMWF AIFS next to the physics models, with ensemble confidence bands. WeatherNext has no free source yet |
| ECMWF, GFS, ICON side-by-side model comparison | ✅ Models tab: ECMWF, GFS, ICON and GEM plotted together (daily highs and next 72 hours), a side-by-side table and a day-by-day agreement rating |
| HRRR & NAM for short-fuse storms | 🚧 HRRR (3 km, 2 days) is in the Models tab. Next: NAM and a model radar loop |
| Confidence & spread metrics (10th/50th/90th percentile) | ✅ ECMWF (51 runs) or GFS (31 runs) ensemble: 10th-90th percentile band, median, High/Medium/Low confidence and the share of runs that bring rain, per day |
| Base velocity / storm-relative velocity | NEXRAD Level 3 products. No free tile source today (IEM only renders single-site reflectivity live), so this needs our own Level 3 renderer |
| Correlation coefficient (debris signatures) | Same |
| KDP and ZDR (rain vs hail) | Same |
| Live animated cloud & sky chamber | Animated scene driven by real wind speed, cloud cover, precip type |
| Interactive cloud identifier | Field guide + camera match |
| Integrate with local weather stations | Ambient Weather / Ecowitt / Tempest APIs, or a local MQTT feed |
| Webhooks & smart home (Home Assistant, MQTT) | Outbound webhooks and MQTT publish on thresholds (frost, high wind) |
| Windy for maps | Windy Map Forecast API layer (needs a Windy key) |
| Integrate with Den-Duty | 🚧 Step 1: weather card on Den-Duty kid boards and the family wall (Weather Scout app keys + `/api/connect/summary`). Next: weather steps in the morning routine, severe alerts through Den-Duty push |
