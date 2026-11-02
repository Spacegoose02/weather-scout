// Personal weather stations: the family's own backyard sensors, shown next to the
// forecast as an extra data source and passed on to Home Assistant.
//
// Ways a station can reach us:
//   - Local push (no cloud): Ecowitt gateways/consoles ("Customized" upload, Ecowitt
//     protocol), Ambient Weather consoles ("Customized" server) and anything that
//     speaks the Weather Underground upload protocol send readings to
//     /api/stations/push.
//   - Tempest (WeatherFlow) hubs broadcast UDP on the LAN (port 50222).
//   - Cloud polling: the Ambient Weather REST API and the Tempest REST API.
//
// Everything is kept in imperial units internally (most stations send those) and
// converted per request.
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { fetchJson } from './cache.js';

export const STALE_MS = 15 * 60_000;
const MAX_STATIONS = 12;

const SOURCES = {
  ecowitt: 'Ecowitt',
  ambient: 'Ambient Weather',
  wunderground: 'Weather station',
  tempest: 'Tempest',
};

// ---- unit helpers -------------------------------------------------------------
const n = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  // -9999 is the "sensor missing" value in the Weather Underground protocol.
  return Number.isFinite(x) && x > -999 ? x : null;
};
const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
const fToC = (f) => (f == null ? null : (f - 32) * 5 / 9);
const msToMph = (v) => (v == null ? null : v * 2.236936);
const mmToIn = (v) => (v == null ? null : v / 25.4);
const kmToMi = (v) => (v == null ? null : v * 0.621371);
const hpaToInHg = (v) => (v == null ? null : v / 33.8639);
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export function dewPointF(tempF, rh) {
  if (tempF == null || rh == null || rh <= 0) return null;
  const t = fToC(tempF);
  const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
  return cToF((243.12 * g) / (17.62 - g));
}

// NWS wind chill below 50 °F with some wind, heat index above 80 °F.
export function feelsLikeF(tempF, rh, windMph) {
  if (tempF == null) return null;
  if (tempF <= 50 && windMph != null && windMph > 3) {
    const v = windMph ** 0.16;
    return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
  }
  if (tempF >= 80 && rh != null) {
    const T = tempF;
    const R = rh;
    return -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T
      - 0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  }
  return tempF;
}

// Sea-level pressure from station pressure and elevation (hypsometric approximation).
export function seaLevelHpa(stationHpa, elevationM, tempC = 15) {
  if (stationHpa == null || elevationM == null) return null;
  return stationHpa * (1 - (0.0065 * elevationM) / (tempC + 0.0065 * elevationM + 273.15)) ** -5.257;
}

function finish(r) {
  const out = { ...r };
  if (out.dewPointF == null) out.dewPointF = dewPointF(out.tempF, out.humidity);
  if (out.feelsLikeF == null) out.feelsLikeF = feelsLikeF(out.tempF, out.humidity, out.windMph);
  return out;
}

// ---- parsers ----------------------------------------------------------------------
const lower = (params) => Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
const shortHash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// Ecowitt, Ambient Weather and Weather Underground uploads use (mostly) the same
// field names, all imperial.
export function parsePush(params) {
  const p = lower(params);
  const type = String(p.stationtype || p.softwaretype || '');
  let source;
  if (/^amb/i.test(type)) source = 'ambient';
  else if (p.passkey) source = 'ecowitt';
  else if (p.id || p.tempf != null) source = 'wunderground';
  else return null;
  const ident = p.passkey || p.mac || p.id || type || 'station';
  const reading = finish({
    tempF: n(p.tempf),
    humidity: n(p.humidity),
    dewPointF: n(p.dewptf),
    feelsLikeF: n(p.feelslike),
    windMph: n(p.windspeedmph),
    gustMph: n(p.windgustmph),
    windDir: n(p.winddir),
    pressureInHg: n(p.baromrelin) ?? n(p.baromin) ?? n(p.baromabsin),
    // WU's "rainin" is rain over the past hour, which is the closest thing it has to a rate.
    rainRateIn: n(p.rainratein) ?? n(p.hourlyrainin) ?? n(p.rainin),
    rainTodayIn: n(p.dailyrainin),
    uv: n(p.uv) ?? n(p.uvindex),
    solarWm2: n(p.solarradiation),
    lightningCount: source === 'ecowitt' ? n(p.lightning_num) : n(p.lightning_day),
    // Ecowitt documents "lightning" as the last strike's distance in km.
    lightningDistMi: source === 'ecowitt' ? kmToMi(n(p.lightning)) : null,
    indoorTempF: n(p.tempinf),
    indoorHumidity: n(p.humidityin),
  });
  return { source, id: `${source}_${shortHash(ident)}`, model: type || SOURCES[source], reading };
}

// Tempest REST: /swd/rest/observations/station/{id} (metric).
export function parseTempestObs(o, { elevationM } = {}) {
  if (!o) return null;
  const tempC = n(o.air_temperature);
  return finish({
    tempF: cToF(tempC),
    humidity: n(o.relative_humidity),
    dewPointF: cToF(n(o.dew_point)),
    feelsLikeF: cToF(n(o.feels_like)),
    windMph: msToMph(n(o.wind_avg)),
    gustMph: msToMph(n(o.wind_gust)),
    windDir: n(o.wind_direction),
    pressureInHg: hpaToInHg(n(o.sea_level_pressure) ?? seaLevelHpa(n(o.station_pressure), elevationM, tempC ?? 15)),
    rainRateIn: o.precip != null ? mmToIn(n(o.precip) * 60) : null,
    rainTodayIn: mmToIn(n(o.precip_accum_local_day)),
    uv: n(o.uv),
    solarWm2: n(o.solar_radiation),
    lightningCount: n(o.lightning_strike_count_last_1hr),
    lightningDistMi: kmToMi(n(o.lightning_strike_last_distance)),
    indoorTempF: null,
    indoorHumidity: null,
  });
}

// Tempest UDP "obs_st" message. Positions are from the WeatherFlow UDP reference.
export function parseTempestUdp(msg, { elevationM, rainSoFarMm = 0 } = {}) {
  if (msg?.type !== 'obs_st' || !Array.isArray(msg.obs?.[0])) return null;
  const o = msg.obs[0];
  const tempC = n(o[7]);
  const intervalMin = n(o[17]) || 1;
  const rainMm = n(o[12]) || 0;
  const strikes = n(o[15]);
  return {
    time: n(o[0]),
    rainMm,
    reading: finish({
      tempF: cToF(tempC),
      humidity: n(o[8]),
      dewPointF: null,
      feelsLikeF: null,
      windMph: msToMph(n(o[2])),
      gustMph: msToMph(n(o[3])),
      windDir: n(o[4]),
      pressureInHg: hpaToInHg(seaLevelHpa(n(o[6]), elevationM, tempC ?? 15)),
      rainRateIn: mmToIn((rainMm / intervalMin) * 60),
      rainTodayIn: mmToIn(rainSoFarMm + rainMm),
      uv: n(o[10]),
      solarWm2: n(o[11]),
      lightningCount: strikes,
      lightningDistMi: strikes ? kmToMi(n(o[14])) : null,
      indoorTempF: null,
      indoorHumidity: null,
    }),
  };
}

// Ambient Weather REST: /v1/devices returns each station with its lastData.
export function parseAmbientDevice(d) {
  const ld = d?.lastData;
  if (!ld) return null;
  return {
    id: `ambient_${shortHash(d.macAddress || d.info?.name || 'station')}`,
    name: d.info?.name || 'Ambient Weather station',
    time: n(ld.dateutc),
    reading: finish({
      tempF: n(ld.tempf),
      humidity: n(ld.humidity),
      dewPointF: n(ld.dewPoint),
      feelsLikeF: n(ld.feelsLike),
      windMph: n(ld.windspeedmph),
      gustMph: n(ld.windgustmph),
      windDir: n(ld.winddir),
      pressureInHg: n(ld.baromrelin) ?? n(ld.baromabsin),
      rainRateIn: n(ld.hourlyrainin),
      rainTodayIn: n(ld.dailyrainin),
      uv: n(ld.uv),
      solarWm2: n(ld.solarradiation),
      lightningCount: n(ld.lightning_day),
      lightningDistMi: null,
      indoorTempF: n(ld.tempinf),
      indoorHumidity: n(ld.humidityin),
    }),
  };
}

// ---- output ---------------------------------------------------------------------
export function unitsFor(units) {
  return units === 'metric'
    ? { temp: '°C', wind: 'km/h', precip: 'mm', rate: 'mm/h', pressure: 'hPa', distance: 'km' }
    : { temp: '°F', wind: 'mph', precip: 'in', rate: 'in/h', pressure: 'hPa', distance: 'mi' };
}

export function convertReading(r, units) {
  const m = units === 'metric';
  const t = (f) => round(m ? fToC(f) : f);
  const w = (mph) => round(m ? mph * 1.609344 : mph);
  const p = (inch) => (inch == null ? null : m ? round(inch * 25.4, 1) : round(inch, 2));
  const indoor = r.indoorTempF != null || r.indoorHumidity != null ? { temp: t(r.indoorTempF), humidity: round(r.indoorHumidity, 0) } : null;
  const lightning = r.lightningCount != null || r.lightningDistMi != null
    ? { count: r.lightningCount, distance: r.lightningDistMi == null ? null : round(m ? r.lightningDistMi / 0.621371 : r.lightningDistMi) }
    : null;
  return {
    temp: t(r.tempF),
    feelsLike: t(r.feelsLikeF),
    humidity: round(r.humidity, 0),
    dewPoint: t(r.dewPointF),
    windSpeed: w(r.windMph),
    windGust: w(r.gustMph),
    windDir: r.windDir == null ? null : Math.round(r.windDir),
    pressure: r.pressureInHg == null ? null : round(r.pressureInHg * 33.8639),
    rainRate: p(r.rainRateIn),
    rainToday: p(r.rainTodayIn),
    uv: round(r.uv),
    solar: r.solarWm2 == null ? null : Math.round(r.solarWm2),
    lightning,
    indoor,
  };
}

const PRIVATE_IP = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80:|::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i;
export const isPrivateIp = (ip) => PRIVATE_IP.test(String(ip || ''));

// ---- the service -----------------------------------------------------------------
export class StationService {
  constructor(cfg, { fetchImpl = fetch, log = console, now = () => Date.now() } = {}) {
    this.cfg = cfg.stations;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.now = now;
    this.stations = new Map();
    this.listeners = new Set();
    this.errors = {};
    this.timers = [];
    this.udpRain = { day: '', mm: 0 };
  }

  onReading(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Stations can be renamed with STATION_NAMES=ecowitt_1a2b3c4d=Backyard,...
  nameFor(id, fallback) {
    return this.cfg.names[id] || fallback;
  }

  ingest({ id, source, model, name, reading, time }) {
    if (!reading || reading.tempF == null && reading.humidity == null && reading.windMph == null) return null;
    if (!this.stations.has(id) && this.stations.size >= MAX_STATIONS) return null;
    const at = time && time > 1e12 ? time : time ? time * 1000 : this.now();
    const st = { id, source, model: model || SOURCES[source], name: this.nameFor(id, name || `${SOURCES[source]} station`), updatedAt: Math.min(at, this.now()), reading };
    this.stations.set(id, st);
    for (const fn of this.listeners) {
      try {
        fn(st);
      } catch (err) {
        this.log.warn?.({ err: err.message }, 'station listener failed');
      }
    }
    return st;
  }

  // A local push from Ecowitt / Ambient / Weather Underground protocol.
  push(params) {
    const parsed = parsePush(params);
    if (!parsed) return null;
    return this.ingest({ ...parsed, name: `${SOURCES[parsed.source]} station` });
  }

  publicStation(st, units) {
    const age = this.now() - st.updatedAt;
    return {
      id: st.id,
      name: st.name,
      source: st.source,
      sourceLabel: SOURCES[st.source],
      model: st.model,
      updatedAt: new Date(st.updatedAt).toISOString(),
      ageSeconds: Math.round(age / 1000),
      stale: age > STALE_MS,
      current: convertReading(st.reading, units),
    };
  }

  list(units) {
    return [...this.stations.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => this.publicStation(s, units));
  }

  // The station to show first: STATION_PRIMARY if it is fresh, otherwise the freshest one.
  primary(units) {
    const fresh = [...this.stations.values()].filter((s) => this.now() - s.updatedAt <= STALE_MS);
    if (!fresh.length) return null;
    const pick = fresh.find((s) => s.id === this.cfg.primary) || fresh.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return this.publicStation(pick, units);
  }

  // Check a push request: with STATION_PUSH_TOKEN set the token must match; without
  // one, only direct (not proxied) requests from the home network are accepted.
  allowPush({ token, remoteAddress, forwarded }) {
    const want = this.cfg.pushToken;
    if (want) {
      const a = Buffer.from(String(token || ''));
      const b = Buffer.from(want);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    return !forwarded && isPrivateIp(remoteAddress);
  }

  // ---- cloud polling and UDP --------------------------------------------------
  async pollAmbient() {
    const { apiKey, applicationKey } = this.cfg.ambient;
    const url = `https://rt.ambientweather.net/v1/devices?${new URLSearchParams({ apiKey, applicationKey })}`;
    try {
      const devices = await fetchJson(url, { source: 'Ambient Weather', fetchImpl: this.fetchImpl });
      for (const d of Array.isArray(devices) ? devices : []) {
        const p = parseAmbientDevice(d);
        if (p) this.ingest({ ...p, source: 'ambient', model: 'Ambient Weather (cloud)' });
      }
      delete this.errors.ambient;
    } catch (err) {
      this.errors.ambient = err.message;
      this.log.warn?.({ err: err.message }, 'Ambient Weather poll failed');
    }
  }

  async pollTempest() {
    const { token, stationIds, elevationM } = this.cfg.tempest;
    try {
      let ids = stationIds;
      if (!ids.length) {
        const r = await fetchJson(`https://swd.weatherflow.com/swd/rest/stations?token=${encodeURIComponent(token)}`, { source: 'Tempest', fetchImpl: this.fetchImpl });
        ids = (r.stations || []).map((s) => String(s.station_id));
        this.cfg.tempest.stationIds = ids;
      }
      for (const sid of ids) {
        const r = await fetchJson(`https://swd.weatherflow.com/swd/rest/observations/station/${encodeURIComponent(sid)}?token=${encodeURIComponent(token)}`, { source: 'Tempest', fetchImpl: this.fetchImpl });
        const obs = r.obs?.[0];
        const reading = parseTempestObs(obs, { elevationM: elevationM ?? r.station_units?.elevation ?? null });
        if (reading) this.ingest({ id: `tempest_${slug(sid)}`, source: 'tempest', model: 'Tempest (cloud)', name: r.public_name || r.station_name || 'Tempest station', time: obs.timestamp, reading });
      }
      delete this.errors.tempest;
    } catch (err) {
      this.errors.tempest = err.message;
      this.log.warn?.({ err: err.message }, 'Tempest poll failed');
    }
  }

  handleUdp(buf) {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      return null;
    }
    if (msg?.type !== 'obs_st') return null;
    const day = new Date(this.now()).toLocaleDateString('en-CA');
    if (this.udpRain.day !== day) this.udpRain = { day, mm: 0 };
    const p = parseTempestUdp(msg, { elevationM: this.cfg.tempest.elevationM, rainSoFarMm: this.udpRain.mm });
    if (!p) return null;
    this.udpRain.mm += p.rainMm;
    return this.ingest({ id: `tempest_${slug(msg.serial_number || 'udp')}`, source: 'tempest', model: 'Tempest (local)', name: 'Tempest station', time: p.time, reading: p.reading });
  }

  start() {
    const every = (fn, ms) => {
      const run = () => fn().catch(() => {});
      setTimeout(run, 2000).unref?.();
      const t = setInterval(run, ms);
      t.unref?.();
      this.timers.push(t);
    };
    const pollMs = this.cfg.pollSeconds * 1000;
    if (this.cfg.ambient.apiKey && this.cfg.ambient.applicationKey) every(() => this.pollAmbient(), pollMs);
    if (this.cfg.tempest.token) every(() => this.pollTempest(), pollMs);
    if (this.cfg.tempest.udpPort) {
      try {
        this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.udp.on('message', (b) => this.handleUdp(b));
        this.udp.on('error', (err) => {
          this.errors.tempestUdp = err.message;
          this.log.warn?.({ err: err.message }, 'Tempest UDP listener failed');
        });
        this.udp.bind(this.cfg.tempest.udpPort);
        this.udp.unref?.();
      } catch (err) {
        this.errors.tempestUdp = err.message;
      }
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try {
      this.udp?.close();
    } catch { /* already closed */ }
  }

  status(units) {
    return {
      tokenRequired: !!this.cfg.pushToken,
      ambientCloud: !!(this.cfg.ambient.apiKey && this.cfg.ambient.applicationKey),
      tempestCloud: !!this.cfg.tempest.token,
      tempestUdp: this.cfg.tempest.udpPort || null,
      errors: this.errors,
      stations: this.list(units),
    };
  }
}

// Fastify routes. The push endpoint accepts GET (Ambient, Weather Underground) and
// form POST (Ecowitt). The token can be the last path segment, ?token= or the WU
// PASSWORD field. Ambient consoles glue their parameters straight onto the path
// ("/api/stations/push/TOKEN&PASSKEY=..."), so the path is parsed by hand.
export function registerStations(app, { stations, cfg, requireAdmin }) {
  app.register(async (scope) => {
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 64 * 1024 }, (req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    });

    const handlePush = async (req, reply) => {
      const tail = String(req.params?.['*'] || '');
      const amp = tail.indexOf('&');
      const pathToken = (amp >= 0 ? tail.slice(0, amp) : tail).replace(/\/+$/, '');
      const params = {
        ...Object.fromEntries(new URLSearchParams(amp >= 0 ? tail.slice(amp + 1) : '')),
        ...(req.query || {}),
        ...(req.body && typeof req.body === 'object' ? req.body : {}),
      };
      const token = pathToken || params.token || params.PASSWORD || params.password;
      const ok = stations.allowPush({ token, remoteAddress: req.socket.remoteAddress, forwarded: !!(req.headers['x-forwarded-for'] || req.headers.forwarded) });
      if (!ok) return reply.code(401).type('text/plain').send('Station token is missing or wrong.');
      for (const k of ['token', 'PASSWORD', 'password']) delete params[k];
      const st = stations.push(params);
      if (!st) return reply.code(400).type('text/plain').send('No readings found in this upload.');
      // "success" is what Weather Underground stations expect back.
      return reply.type('text/plain').send('success');
    };
    for (const url of ['/api/stations/push', '/api/stations/push/*']) scope.route({ method: ['GET', 'POST'], url, handler: handlePush });

    const unitsQuery = { querystring: { type: 'object', properties: { units: { type: 'string', enum: ['imperial', 'metric'] } } } };
    scope.get('/api/stations', { schema: unitsQuery }, async (req) => {
      const units = req.query.units || cfg.units;
      return { units: unitsFor(units), stations: stations.list(units), primary: stations.primary(units)?.id || null };
    });
    scope.get('/api/admin/stations', { preHandler: requireAdmin, schema: unitsQuery }, async (req) => stations.status(req.query.units || cfg.units));
  });
}
