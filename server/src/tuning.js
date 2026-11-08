// Backyard-tuned forecast: learns how the family's own weather station differs
// from the forecast at home (see shared/tuning.js) and corrects the next 48
// hours with it. One sample every 15 minutes while a station is reporting,
// kept for 14 days in SQLite. Only used for places near home, since the
// station only knows its own yard.
import { biasModel, tuneHourly, tunedDays, yardText, forecastAt, KEEP_DAYS } from '../../shared/tuning.js';
import { distanceMiles } from '../../shared/lightning.js';

const MIN = 60_000;
export const SAMPLE_MS = 15 * MIN;
export const NEAR_HOME_MILES = 15;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS backyard_samples (
  at INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  obs REAL NOT NULL,
  fc REAL NOT NULL
);`;

export class BackyardTuning {
  constructor(db, { stations, forecast, home, log = console, now = () => Date.now() }) {
    Object.assign(this, { db, stations, forecast, home, log, now });
    db.exec(SCHEMA);
    this.timer = null;
  }

  // Note the station-minus-forecast error now (°F). Returns the sample or null.
  async sample() {
    const st = this.stations.primary('imperial');
    const obs = st?.current?.temp;
    if (!st || st.stale || obs == null) return null;
    const home = this.home();
    const fc = await this.forecast({ lat: home.lat, lon: home.lon, units: 'imperial' });
    const at = this.now();
    const f = forecastAt(fc?.hourly, at);
    if (f == null || Math.abs(obs - f) > 30) return null; // a 30° miss is a broken sensor, not weather
    const row = { at: Math.floor(at / MIN) * MIN, station: st.id, obs, fc: Math.round(f * 10) / 10 };
    this.db.prepare('INSERT OR REPLACE INTO backyard_samples (at, station, obs, fc) VALUES (?, ?, ?, ?)').run(row.at, row.station, row.obs, row.fc);
    this.db.prepare('DELETE FROM backyard_samples WHERE at < ?').run(at - KEEP_DAYS * 24 * 60 * MIN);
    return row;
  }

  samples() {
    return this.db.prepare('SELECT at, station, obs, fc FROM backyard_samples ORDER BY at').all().map((r) => ({ at: r.at, err: r.obs - r.fc, station: r.station }));
  }

  model(offsetSec = 0) {
    return biasModel(this.samples(), { now: this.now(), offsetSec });
  }

  start() {
    if (this.timer) return;
    const tick = () => this.sample().catch((err) => this.log.warn?.({ err: err.message }, 'backyard sample failed'));
    this.first = setTimeout(tick, 60_000);
    this.timer = setInterval(tick, SAMPLE_MS);
    this.first.unref?.();
    this.timer.unref?.();
  }

  stop() {
    clearTimeout(this.first);
    clearInterval(this.timer);
    this.timer = null;
  }

  // The tuned forecast for a place, or why there isn't one.
  async tuned(place) {
    const home = this.home();
    const miles = distanceMiles(home, place);
    const st = this.stations.primary(place.units);
    if (miles > NEAR_HOME_MILES) return { available: false, reason: 'far', text: `Backyard tuning works within ${NEAR_HOME_MILES} miles of home, where your weather station is.` };
    const fc = await this.forecast(place);
    const offsetSec = fc.utcOffsetSeconds || 0;
    const m = this.model(offsetSec);
    if (!m.samples) {
      return {
        available: false,
        reason: st ? 'learning' : 'no-station',
        station: st ? { name: st.name, temp: st.current?.temp ?? null } : null,
        text: st ? 'Learning your yard. The first tuned forecast shows up after an hour or so of readings.' : 'Connect a weather station (Ecowitt, Ambient, Tempest or Home Assistant) in Family & settings and the forecast will learn your yard.',
      };
    }
    const now = this.now();
    const hours = tuneHourly(fc.hourly, m, { now, offsetSec, units: place.units });
    const scale = place.units === 'metric' ? 5 / 9 : 1;
    const r1 = (v) => (v == null ? null : Math.round(v * scale * 10) / 10);
    return {
      available: true,
      units: fc.units,
      station: st ? { name: st.name, temp: st.current?.temp ?? null, stale: st.stale } : null,
      learned: { samples: m.samples, days: m.days, recent: r1(m.recent), overall: r1(m.overall), averageMiss: r1(m.mae), byHour: m.byHour.map(r1) },
      text: yardText(m, { units: place.units }),
      now: hours[0] ? { model: hours.find((h) => h.epoch >= now - 30 * MIN)?.temp ?? null, tuned: hours.find((h) => h.epoch >= now - 30 * MIN)?.tuned ?? null } : null,
      hours: hours.slice(0, 48),
      days: tunedDays(hours),
    };
  }
}

export function registerTuning(app, { tuning, latLonSchema, loc }) {
  app.get('/api/forecast/backyard', { schema: latLonSchema }, async (req) => ({ ...(await tuning.tuned(loc(req.query))), source: 'Your weather station compared with Open-Meteo, every 15 minutes for the last 14 days' }));
}
