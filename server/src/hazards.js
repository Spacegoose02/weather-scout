// v0.7 "Every hazard": crowd reports, rivers and flash floods, wildfires.
//
// Crowd reports: anyone signed in can say what is falling where they are
// (stored here, kept 30 days, shown for 24 hours). Next to them, the National
// Weather Service's local storm reports from spotters, via the Iowa
// Environmental Mesonet.
// Rivers: NOAA National Water Prediction Service gauges (stage, flood category
// and forecast). Flash floods: NOAA WPC Excessive Rainfall Outlook, days 1-2.
// Wildfires: NIFC WFIGS current wildfire incidents.
// All free and keyless.
import { fetchJson } from './cache.js';
import {
  REPORT_KIND, HAIL_SIZES, REPORT_HOURS, cleanNote, parseLsr, reportsNear,
  parseGauges, gaugesNear, eroAt, parseFires, firesNear,
} from '../../shared/hazards.js';
import { inBox, boxAround } from '../../shared/lightning.js';

const MIN = 60_000;
export const LSR_URL = 'https://mesonet.agron.iastate.edu/geojson/lsr.php';
export const NWPS_URL = 'https://api.water.noaa.gov/nwps/v1/gauges';
export const ERO_URL = (day) => `https://www.wpc.ncep.noaa.gov/exper/eromap/geojson/Day${day}_Latest.geojson`;
export const FIRES_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const KEEP_DAYS = 30;
const POST_GAP_MS = 2 * MIN; // one report per person every 2 minutes
const MAX_BOX_ITEMS = 1500;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS crowd_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  hail REAL,
  note TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crowd_reports_time ON crowd_reports(created_at);
`;

const bad = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });
const r2 = (n) => Math.round(n * 100) / 100; // about a kilometer: close enough, not someone's front door

export function lsrUrl(hours = REPORT_HOURS) {
  return `${LSR_URL}?${new URLSearchParams({ inc_ap: 'yes', hours: String(hours) })}`;
}

export function gaugesUrl(box) {
  const p = new URLSearchParams({
    'bbox.xmin': box.west.toFixed(2), 'bbox.ymin': box.south.toFixed(2),
    'bbox.xmax': box.east.toFixed(2), 'bbox.ymax': box.north.toFixed(2),
    srid: 'EPSG_4326',
  });
  return `${NWPS_URL}?${p}`;
}

export function firesUrl(box) {
  const p = new URLSearchParams({
    where: "IncidentTypeCategory='WF'",
    outFields: 'IncidentName,IncidentSize,PercentContained,FireDiscoveryDateTime,POOState,IncidentTypeCategory,IrwinID',
    geometry: [box.west, box.south, box.east, box.north].map((n) => n.toFixed(2)).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    resultRecordCount: '500',
    f: 'geojson',
  });
  return `${FIRES_URL}?${p}`;
}

// Snap a box outward to whole degrees so nearby views share one cached answer.
const snap = (b) => ({ south: Math.floor(b.south), west: Math.floor(b.west), north: Math.ceil(b.north), east: Math.ceil(b.east) });
const snapKey = (b) => `${b.south},${b.west},${b.north},${b.east}`;

export class HazardService {
  constructor(db, cache, fetchImpl, { log = console, userAgent = 'WeatherScout' } = {}) {
    this.db = db;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.userAgent = userAgent;
    db.exec(SCHEMA);
  }

  // ---- crowd reports ----
  addReport(user, { kind, hail, note, lat, lon }, now = Date.now()) {
    if (!REPORT_KIND[kind]) throw bad('Pick what you see.');
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw bad('Pick a place for the report.');
    let size = null;
    if (REPORT_KIND[kind].hail) {
      size = Number(hail);
      if (!HAIL_SIZES.some((h) => h.in === size)) throw bad('Pick a hail size.');
    }
    const last = this.db.prepare('SELECT created_at FROM crowd_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id);
    if (last && now - last.created_at < POST_GAP_MS) throw bad('Thanks! You just sent a report. Try again in a couple of minutes.', 429);
    const info = this.db.prepare('INSERT INTO crowd_reports (user_id, kind, hail, note, lat, lon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(user.id, kind, size, cleanNote(note), r2(la), r2(lo), now);
    this.db.prepare('DELETE FROM crowd_reports WHERE created_at < ?').run(now - KEEP_DAYS * 86400_000);
    return this.ownReport(Number(info.lastInsertRowid));
  }

  ownReport(id) {
    const r = this.db.prepare('SELECT c.*, u.display_name FROM crowd_reports c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(id);
    return r ? this.toReport(r) : null;
  }

  toReport(r) {
    const k = REPORT_KIND[r.kind] || { emoji: '📍', label: r.kind };
    return {
      id: `own:${r.id}`,
      source: 'family',
      kind: r.kind,
      emoji: k.emoji,
      label: k.label,
      magnitude: r.hail ?? null,
      unit: r.hail ? 'in' : '',
      remark: r.note || '',
      by: (r.display_name || 'Someone').split(/\s+/)[0], // first name only
      userId: r.user_id,
      lat: r.lat,
      lon: r.lon,
      t: r.created_at,
    };
  }

  deleteReport(user, id) {
    const n = Number(String(id).replace(/^own:/, ''));
    const r = this.db.prepare('SELECT user_id FROM crowd_reports WHERE id = ?').get(n);
    if (!r) throw bad('That report is already gone.', 404);
    if (r.user_id !== user.id && !user.is_admin) throw bad('You can only remove your own reports.', 403);
    this.db.prepare('DELETE FROM crowd_reports WHERE id = ?').run(n);
    return { ok: true };
  }

  familyReports(now = Date.now()) {
    return this.db.prepare('SELECT c.*, u.display_name FROM crowd_reports c LEFT JOIN users u ON u.id = c.user_id WHERE c.created_at >= ? ORDER BY c.created_at DESC LIMIT 2000')
      .all(now - REPORT_HOURS * 3600_000).map((r) => this.toReport(r));
  }

  async nwsReports() {
    try {
      return await this.cache.wrap('lsr:24h', 10 * MIN, async () => parseLsr(await fetchJson(lsrUrl(), { source: 'iem-lsr', fetchImpl: this.fetchImpl })));
    } catch (err) {
      this.log.warn?.({ err: err.message }, 'storm reports unavailable');
      return null;
    }
  }

  async reportsInBox(box, now = Date.now()) {
    const nws = await this.nwsReports();
    const all = [...this.familyReports(now), ...(nws || [])].filter((r) => inBox(r, box));
    return { reports: all.slice(0, MAX_BOX_ITEMS), total: all.length, nwsAvailable: !!nws };
  }

  async reportsNearPlace(place, miles, now = Date.now()) {
    const nws = await this.nwsReports();
    const list = reportsNear([...this.familyReports(now), ...(nws || [])], place, { miles, now });
    return { reports: list.slice(0, 50), total: list.length, miles, nwsAvailable: !!nws };
  }

  // ---- rivers ----
  async gaugesInBox(box) {
    const s = snap(box);
    return this.cache.wrap(`gauges:${snapKey(s)}`, 15 * MIN, async () => parseGauges(await fetchJson(gaugesUrl(s), { source: 'nwps', fetchImpl: this.fetchImpl, timeoutMs: 15000 })));
  }

  async rivers(place, miles = 40) {
    const gauges = await this.gaugesInBox(boxAround(place, miles));
    return gaugesNear(gauges, place, { miles }).slice(0, 12);
  }

  async ero(day) {
    try {
      return await this.cache.wrap(`ero:${day}`, 30 * MIN, () => fetchJson(ERO_URL(day), { source: 'wpc-ero', fetchImpl: this.fetchImpl, timeoutMs: 15000 }));
    } catch (err) {
      this.log.warn?.({ err: err.message, day }, 'excessive rainfall outlook unavailable');
      return null;
    }
  }

  async floodOutlook(place) {
    const [d1, d2] = await Promise.all([this.ero(1), this.ero(2)]);
    return {
      today: d1 ? eroAt(d1, place) : null,
      tomorrow: d2 ? eroAt(d2, place) : null,
    };
  }

  // ---- wildfires ----
  async firesInBox(box) {
    const s = snap(box);
    return this.cache.wrap(`fires:${snapKey(s)}`, 15 * MIN, async () => parseFires(await fetchJson(firesUrl(s), { source: 'nifc', fetchImpl: this.fetchImpl, timeoutMs: 15000 })));
  }

  async firesNearPlace(place, { miles = 200, windFrom = null } = {}) {
    const fires = await this.firesInBox(boxAround(place, miles));
    return firesNear(fires, place, { miles, windFrom }).slice(0, 15);
  }
}

export function registerHazards(app, { hazards, requireUser, latLonSchema, loc, boxSchema, forecast, settle }) {
  const near = { ...latLonSchema.querystring.properties, miles: { type: 'number', minimum: 1, maximum: 300 } };
  const nearSchema = { querystring: { ...latLonSchema.querystring, properties: near } };
  const box = (q) => ({ south: q.south, north: q.north, west: Math.max(-180, q.west), east: Math.min(180, q.east) });

  // Crowd reports
  app.get('/api/reports', { schema: boxSchema }, async (req) => ({ ...(await hazards.reportsInBox(box(req.query))), hours: REPORT_HOURS }));
  app.get('/api/reports/near', { schema: nearSchema }, async (req) => {
    const l = loc(req.query);
    return { ...(await hazards.reportsNearPlace(l, req.query.miles || 25)), hours: REPORT_HOURS, me: req.user?.id ?? null };
  });
  app.post('/api/reports', {
    preHandler: requireUser,
    schema: { body: { type: 'object', required: ['kind', 'lat', 'lon'], properties: { kind: { type: 'string', maxLength: 20 }, hail: { type: ['number', 'null'] }, note: { type: 'string', maxLength: 400 }, lat: { type: 'number' }, lon: { type: 'number' } } } },
  }, async (req, reply) => reply.code(201).send(hazards.addReport(req.user, req.body)));
  app.delete('/api/reports/:id', { preHandler: requireUser }, async (req) => hazards.deleteReport(req.user, req.params.id));

  // Rivers and flash floods
  app.get('/api/rivers', { schema: boxSchema }, async (req) => {
    const all = await hazards.gaugesInBox(box(req.query));
    const inView = all.filter((g) => inBox(g, box(req.query)));
    return { gauges: inView.slice(0, MAX_BOX_ITEMS), total: inView.length, source: 'NOAA National Water Prediction Service' };
  });
  app.get('/api/flood', { schema: nearSchema }, async (req) => {
    const l = loc(req.query);
    const [gauges, outlook] = await Promise.all([settle(hazards.rivers(l, req.query.miles || 40)), hazards.floodOutlook(l)]);
    return { gauges, gaugesAvailable: gauges != null, outlook, source: 'NOAA National Water Prediction Service and Weather Prediction Center' };
  });

  // Wildfires and smoke
  app.get('/api/fires', { schema: boxSchema }, async (req) => {
    const all = await hazards.firesInBox(box(req.query));
    const inView = all.filter((f) => inBox(f, box(req.query)));
    return { fires: inView, total: inView.length, source: 'National Interagency Fire Center (WFIGS)' };
  });
  app.get('/api/fires/near', { schema: nearSchema }, async (req) => {
    const l = loc(req.query);
    const fc = await settle(forecast(l));
    const windFrom = fc?.current?.windDir ?? null;
    const fires = await hazards.firesNearPlace(l, { miles: req.query.miles || 200, windFrom });
    return { fires, windFrom, source: 'National Interagency Fire Center (WFIGS)' };
  });
}
