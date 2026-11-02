# Connecting other family apps

Weather Scout can hand a small, kid-safe weather summary to your other apps:
Den-Duty's kid boards and family wall, Home Assistant, or your own scripts.

## 1. Make a key

Sign in as an admin, open **Family & settings → Connected apps**, type a name
(for example "Den-Duty") and press **Make a key**. Copy the `wsk_…` key right away:
only a hash is stored, so it can't be shown again. Remove a key to cut an app off.

## 2. Call the summary

```
GET /api/connect/summary[?lat=..&lon=..&units=imperial|metric]
Authorization: Bearer wsk_...
```

With no `lat`/`lon` it uses the server's home location (`DEFAULT_LAT`/`DEFAULT_LON`).
It works even when `AUTH_REQUIRED=true`, because the key is the sign-in.

```jsonc
{
  "location": { "name": "Richmond, VA", "lat": 37.54, "lon": -77.44 },
  "units": { "temp": "°F", "wind": "mph", "precip": "in", "pressure": "hPa" },
  "current": { "temp": 52, "feelsLike": 47, "icon": "rain", "label": "Rain", "kidLabel": "Rainy", "isDay": true, "windSpeed": 5, "uv": 3 },
  "today": { "high": 60, "low": 42, "precipChance": 80, "icon": "rain", "kidLabel": "Rainy" },
  "raccoon": {
    "items": ["raincoat", "boots"], "mood": "happy", "maxPrecipChance": 80, "minFeelsLike": 47, "maxUv": 3,
    "art": { "full": "/rocky/rocky.png", "face": "/rocky/rocky-face.png", "icon": "/icon-192.png",
             "dressed": "/api/connect/rocky.svg?items=raincoat%2Cboots&mood=happy" }
  },
  "checklist": [{ "id": "raincoat", "emoji": "🧥", "label": "Rain jacket", "why": "Good chance of rain today." }],
  "playground": { "rating": "yellow", "label": "Okay, with care", "emoji": "⚠️", "reasons": ["It has been raining, so it may be wet or muddy."] },
  "sky": { "sunset": "2026-11-02T17:30", "minutesToSunset": 231, "stargazing": { "good": false, "text": "…" } },
  "airQuality": { "aqi": 38, "label": "Good", "color": "green", "kid": "Great air for playing outside!" },
  "alerts": [{ "id": "…", "event": "Wind Advisory", "severity": "Minor", "headline": "…", "kid": "It will be very windy…", "ends": "…" }],
  "alertsAvailable": true,
  "updatedAt": "2026-11-02T18:40:00.000Z"
}
```

`icon` is one of `clear`, `partly-cloudy`, `cloudy`, `fog`, `drizzle`, `rain`, `sleet`, `snow`, `thunder`.
`raccoon.art` paths are on your Weather Scout server (for example
`http://weather-scout:8080/rocky/rocky-face.png`) and need no key, so a Den-Duty card can show
the same Rocky as the app. `raccoon.art.dressed` is Rocky already wearing today's outfit with his
mood badge, as one SVG that works in a plain `<img>`:

```
GET /api/connect/rocky.svg?items=raincoat,boots&mood=happy
```

`items` is a comma list of `raincoat`, `winter-coat`, `jacket`, `t-shirt`, `pants`, `shorts`,
`swim-trunks`, `mittens`, `boots`, `snow-boots`, `sunglasses`, `beanie`, `sun-hat` (others are
ignored); `mood` is `happy`, `worried`, `shivering` or `hot`. It's drawn from the same pieces as
Kid Mode (`shared/rocky-outfit.js`) and is cached for a day. `playground.rating` is `green`, `yellow` or `red`. Alerts leave out the long NWS text.

Results are cached on the server (forecast 10 minutes, alerts 2 minutes), so polling every
few minutes is fine.

## Home Assistant example

For full Home Assistant sensors (MQTT discovery, severe-warning binary sensor, your own weather
station) see [HOME-ASSISTANT.md](HOME-ASSISTANT.md). The summary also has a `station` field with
the home weather station's latest reading, or `null`.


```yaml
rest:
  - resource: http://weather-scout:8080/api/connect/summary
    headers:
      Authorization: Bearer wsk_...
    scan_interval: 600
    sensor:
      - name: Recess check
        value_template: "{{ value_json.playground.rating }}"
      - name: Outside temperature
        value_template: "{{ value_json.current.temp }}"
        unit_of_measurement: "°F"
```
