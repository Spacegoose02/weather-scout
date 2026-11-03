# Weather stations and Home Assistant

Weather Scout can read your own backyard weather station and share everything it knows with
Home Assistant. Both are optional. Set them up in the app under 👤 → *Family & settings* → *App
settings* (*Weather stations* and *Home Assistant*, each with a *Test* button), or with the
environment variables below, which become the defaults. Nothing is stored in the repository.

## Personal weather stations

A reporting station shows up under the current conditions on the Today tab ("🏡 Ecowitt
station" with temperature, humidity, wind, rain today, UV, lightning and indoor temperature),
in the connected-app summary (`station`), and in Home Assistant. Readings older than 15 minutes
are hidden. Status and station ids are in **Family & settings → Weather stations**.

### Ecowitt (local, no cloud)

In the **WS View Plus** or **Ecowitt** app, open your gateway or console, then
**Weather Services → Customized**:

| Field | Value |
| --- | --- |
| Customized | Enable |
| Protocol | Ecowitt |
| Server IP / hostname | your Weather Scout server, e.g. `192.168.1.20` |
| Path | `/api/stations/push` (or `/api/stations/push/YOUR_TOKEN`) |
| Port | `8080` (the Web UI port) |
| Upload interval | 60 seconds |

### Ambient Weather (local)

In **awnet**, open the console, then **Customized**: enable it, protocol **Ambient Weather**,
server IP and port as above, and path `/api/stations/push?` (note the `?` at the end) or
`/api/stations/push/YOUR_TOKEN?`.

### Ambient Weather (cloud)

If your console can't push locally, make an API key and an application key on
[ambientweather.net/account](https://ambientweather.net/account) and set `AMBIENT_API_KEY` and
`AMBIENT_APPLICATION_KEY`. Every station on the account is polled every `STATION_POLL_SECONDS`.

### Tempest (WeatherFlow)

- **Cloud:** make a personal access token at
  [tempestwx.com/settings/tokens](https://tempestwx.com/settings/tokens) and set `TEMPEST_TOKEN`.
  All stations on the account are used, or list some in `TEMPEST_STATION_IDS`.
- **Local:** the Tempest hub broadcasts readings on UDP port 50222. Set `TEMPEST_UDP=true`.
  Broadcasts don't reach a container on Docker's default bridge network, so on Unraid set the
  container's network to **Host** or **br0** (its own IP). Set `STATION_ELEVATION_M` so station
  pressure can be turned into sea-level pressure.

### Anything else (Weather Underground protocol)

Many stations and tools (WeeWX, Meteobridge, older consoles) can upload to a "custom
Weather Underground server". Point it at
`http://YOUR_SERVER:8080/api/stations/push?ID=backyard&PASSWORD=YOUR_TOKEN` style uploads; the
standard WU fields (`tempf`, `humidity`, `windspeedmph`, `baromin`, `dailyrainin`, ...) are read.

### Who may upload

- With **`STATION_PUSH_TOKEN`** set, every upload must carry it: as the last part of the path
  (`/api/stations/push/TOKEN`), as `?token=`, or as the Weather Underground `PASSWORD`. Use this
  when uploads go through a reverse proxy or the port is reachable from the internet.
- Without a token, only uploads sent **straight from your home network** are accepted
  (private IP addresses, not through a proxy).

Uploads never need a sign-in, even with `AUTH_REQUIRED=true`.

### Settings

| Setting | Default | What |
| --- | --- | --- |
| `STATION_PUSH_TOKEN` | (blank) | Secret for local uploads (see above) |
| `STATION_NAMES` | (blank) | Friendly names, e.g. `ecowitt_3419d586=Backyard,tempest_st_00012345=Garden`. Ids are in Family & settings |
| `STATION_PRIMARY` | (blank) | The station id to show first. Blank = the freshest one |
| `STATION_POLL_SECONDS` | `120` | Cloud polling interval (60 or more) |
| `STATION_ELEVATION_M` | (blank) | Station elevation in meters, for Tempest sea-level pressure |
| `AMBIENT_API_KEY`, `AMBIENT_APPLICATION_KEY` | (blank) | Ambient Weather cloud |
| `TEMPEST_TOKEN` | (blank) | Tempest cloud |
| `TEMPEST_STATION_IDS` | (blank) | Comma list. Blank = all stations on the token |
| `TEMPEST_UDP` | `false` | Listen for Tempest hub broadcasts |
| `TEMPEST_UDP_PORT` | `50222` | |

## Home Assistant

### MQTT (recommended)

Set `MQTT_URL` to your broker (for example the Mosquitto add-on: `mqtt://192.168.1.10:1883`, or
`mqtts://` for TLS) plus `MQTT_USERNAME` and `MQTT_PASSWORD`. With Home Assistant's MQTT
integration set up, two kinds of devices appear on their own (MQTT discovery):

- **Weather Scout (your home name):** temperature, feels like, humidity, dew point, pressure,
  wind speed, gust and direction, UV, cloud cover, condition, "Rocky says", today's high, low
  and rain chance, air quality index, number of weather alerts, top alert, recess check
  (green/yellow/red, with the reasons as attributes), what to wear, and a **Severe weather
  warning** binary sensor (on while any NWS warning is active, with every alert as attributes).
- **One device per weather station** with the sensors that station has (rain today, rain rate,
  solar radiation, lightning, indoor temperature, ...).

The home forecast is sent every `HA_PUBLISH_SECONDS`, and station readings as soon as they
arrive (at most every 30 seconds per station). Messages are retained, and
`weather_scout/status` says `online` / `offline`, so entities go unavailable if Weather Scout
stops. When Home Assistant restarts, discovery is sent again.

Topics, if you want to use them directly:

| Topic | Payload |
| --- | --- |
| `weather_scout/status` | `online` or `offline` |
| `weather_scout/home/state` | JSON: `temperature`, `feels_like`, `humidity`, ..., `severe_warning` (`ON`/`OFF`) |
| `weather_scout/home/attributes` | JSON: `alerts`, `recess_reasons`, `checklist` |
| `weather_scout/station/<id>/state` | JSON: `temperature`, `humidity`, `rain_today`, ... |

Example automation, flashing the hallway light for a warning:

```yaml
automation:
  - alias: Severe weather warning
    trigger:
      - platform: state
        entity_id: binary_sensor.weather_scout_home_severe_warning
        to: "on"
    action:
      - service: notify.mobile_app_phone
        data:
          title: "{{ state_attr('binary_sensor.weather_scout_home_severe_warning', 'alerts')[0].event }}"
          message: "{{ state_attr('binary_sensor.weather_scout_home_severe_warning', 'alerts')[0].kid }}"
```

### REST (no MQTT broker)

Make a long-lived access token in Home Assistant (your profile → **Security**) and set `HA_URL`
(for example `http://homeassistant.local:8123`) and `HA_TOKEN`. Weather Scout then sets the same
sensors (`sensor.weather_scout_home_temperature`, `binary_sensor.weather_scout_home_severe_warning`,
...) every `HA_PUBLISH_SECONDS`. Home Assistant forgets these between its own restarts until the
next update, and they can't be edited in the UI. MQTT doesn't have those limits.

You can also pull the kid-friendly summary with Home Assistant's `rest` sensor; see
[CONNECT.md](CONNECT.md).

### Settings

| Setting | Default | What |
| --- | --- | --- |
| `MQTT_URL` | (blank) | e.g. `mqtt://192.168.1.10:1883`. Blank = MQTT off |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | (blank) | Broker login |
| `MQTT_TOPIC_PREFIX` | `weather_scout` | |
| `MQTT_DISCOVERY_PREFIX` | `homeassistant` | Home Assistant's discovery prefix |
| `HA_URL`, `HA_TOKEN` | (blank) | REST instead of (or as well as) MQTT |
| `HA_PUBLISH_SECONDS` | `300` | How often the home forecast is sent (60 or more) |

Units follow `DEFAULT_UNITS`. Pressure is always hPa.
