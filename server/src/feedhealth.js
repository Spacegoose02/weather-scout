// Data-feed health: every upstream request the server makes goes through one
// wrapped fetch, which notes per service whether it answered, how fast, and
// when it last worked. Shown on the 📶 Data feeds page so a family (or the
// admin) can tell "the weather service is down" from "the app is broken".

// Hostnames -> what the family knows them as. Unknown hosts are grouped by host.
export const FEEDS = [
  [/^api\.open-meteo\.com$/, 'forecast', 'Forecast (Open-Meteo)'],
  [/^air-quality-api\.open-meteo\.com$/, 'air', 'Air quality model (Open-Meteo / CAMS)'],
  [/^ensemble-api\.open-meteo\.com$/, 'ensemble', 'Forecast odds (ECMWF and GFS ensembles)'],
  [/^marine-api\.open-meteo\.com$/, 'marine', 'Waves and water temperature (Open-Meteo Marine)'],
  [/^(previous-runs|historical-forecast|archive)-api\.open-meteo\.com$/, 'history', 'Model history (Open-Meteo)'],
  [/^geocoding-api\.open-meteo\.com$/, 'geocoding', 'Place search (Open-Meteo)'],
  [/open-meteo\.com$/, 'openmeteo', 'Open-Meteo (other)'],
  [/^api\.weather\.gov$/, 'nws', 'Alerts and forecasts (National Weather Service)'],
  [/^mesonet\.agron\.iastate\.edu$/, 'iem', 'Radar, storm cells and reports (Iowa Environmental Mesonet)'],
  [/nhc\.noaa\.gov$/, 'nhc', 'Hurricanes (National Hurricane Center)'],
  [/^api\.water\.noaa\.gov$/, 'rivers', 'River gauges (NOAA NWPS)'],
  [/cpc\.ncep\.noaa\.gov$/, 'cpc', 'El Niño and La Niña (NOAA Climate Prediction Center)'],
  [/droughtmonitor\.unl\.edu$/, 'drought', 'Drought (US Drought Monitor)'],
  [/wpc\.ncep\.noaa\.gov$/, 'wpc', 'Flash flood outlook (NOAA WPC)'],
  [/ndbc\.noaa\.gov$/, 'buoys', 'Buoys (NOAA NDBC)'],
  [/tidesandcurrents\.noaa\.gov$/, 'tides', 'Tides (NOAA CO-OPS)'],
  [/swpc\.noaa\.gov$/, 'space', 'Northern lights (NOAA SWPC)'],
  [/(^|\.)arcgis\.com$/, 'fires', 'Wildfires (NIFC)'],
  [/airnowapi\.org$/, 'airnow', 'Air monitors (EPA AirNow)'],
  [/purpleair\.com$/, 'purpleair', 'Air sensors (PurpleAir)'],
  [/rainviewer\.com$/, 'rainviewer', 'World radar (RainViewer)'],
  [/router\.project-osrm\.org$/, 'osrm', 'Trip routes (OSRM)'],
  [/googleapis\.com$/, 'google', 'Pollen (Google)'],
  [/windy\.com$/, 'windy', 'Webcams (Windy)'],
  [/goes|noaa-goes|amazonaws\.com$/, 'glm', 'Satellite lightning (NOAA GOES)'],
  [/anthropic\.com$/, 'ai', 'Ask Rocky (Anthropic)'],
  // State road camera systems all count as one feed.
  [/511|(^|\.)dot\.|gisserver|geodata|firstmap|iteris|traffic|cctv|camera|trafficland|skyvdn/i, 'cameras', 'Road cameras (state transportation departments)'],
];

export function feedFor(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [re, id, name] of FEEDS) if (re.test(host)) return { id, name };
  return { id: host, name: host };
}

const HOUR = 3600_000;

export class FeedHealth {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.feeds = new Map();
  }

  note(url, { ok, ms, status = null, error = null }) {
    const f = feedFor(url);
    if (!f) return;
    const t = this.now();
    const rec = this.feeds.get(f.id) || { id: f.id, name: f.name, lastOk: null, lastFail: null, lastError: null, recent: [] };
    if (ok) rec.lastOk = t;
    else {
      rec.lastFail = t;
      rec.lastError = error || (status ? `HTTP ${status}` : 'no answer');
    }
    rec.recent.push({ t, ok, ms });
    // Keep the last hour (and at most 200 calls) per feed.
    while (rec.recent.length > 200 || (rec.recent[0] && rec.recent[0].t < t - HOUR)) rec.recent.shift();
    this.feeds.set(f.id, rec);
  }

  // Wrap a fetch so every call is noted. Aborts and network errors count as failures.
  wrap(fetchImpl) {
    const wrapped = async (url, opts) => {
      const start = this.now();
      try {
        const res = await fetchImpl(url, opts);
        // 404s from "is this frame there yet?" style probes are answers, not outages.
        this.note(String(url), { ok: res.ok || res.status === 404, ms: this.now() - start, status: res.status });
        return res;
      } catch (err) {
        this.note(String(url), { ok: false, ms: this.now() - start, error: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out' : 'could not connect' });
        throw err;
      }
    };
    if (fetchImpl.calls) wrapped.calls = fetchImpl.calls; // test mocks keep their call log
    return wrapped;
  }

  // ok: worked last time; slow: worked but slowly or with some failures this hour;
  // down: the last call failed.
  report() {
    const t = this.now();
    return [...this.feeds.values()].map((r) => {
      const recent = r.recent.filter((x) => x.t >= t - HOUR);
      const fails = recent.filter((x) => !x.ok).length;
      const okMs = recent.filter((x) => x.ok).map((x) => x.ms).sort((a, b) => a - b);
      const median = okMs.length ? okMs[Math.floor(okMs.length / 2)] : null;
      const lastWasOk = (r.lastOk ?? 0) >= (r.lastFail ?? 0);
      const state = !lastWasOk ? 'down' : fails > 0 || (median != null && median > 5000) ? 'slow' : 'ok';
      return {
        id: r.id,
        name: r.name,
        state,
        lastOk: r.lastOk ? new Date(r.lastOk).toISOString() : null,
        lastFail: r.lastFail ? new Date(r.lastFail).toISOString() : null,
        lastError: lastWasOk && fails === 0 ? null : r.lastError,
        callsLastHour: recent.length,
        failsLastHour: fails,
        medianMs: median,
      };
    }).sort((a, b) => ({ down: 0, slow: 1, ok: 2 }[a.state] - { down: 0, slow: 1, ok: 2 }[b.state]) || a.name.localeCompare(b.name));
  }
}

export function registerFeedHealth(app, { health, extra = () => ({}) }) {
  app.get('/api/status', async () => {
    const feeds = health.report();
    return {
      overall: feeds.some((f) => f.state === 'down') ? 'some-down' : feeds.some((f) => f.state === 'slow') ? 'some-slow' : 'ok',
      feeds,
      ...extra(),
      checkedAt: new Date().toISOString(),
    };
  });
}
