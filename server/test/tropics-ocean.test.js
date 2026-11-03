import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { category, normalizeStorm, unzipFirst, kmlToFeatures, getStorms, milesBetween } from '../src/providers/tropics.js';
import { parseNdbc, inBox, nearestStation, normalizeTides, upcomingTides } from '../src/providers/ocean.js';
import { mockFetch, testApp } from './helpers.js';

// Minimal zip writer (one file, deflate) for KMZ fixtures.
export function zipOne(name, text) {
  const data = zlib.deflateRawSync(Buffer.from(text));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(Buffer.byteLength(text), 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(Buffer.byteLength(text), 24); central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = 30 + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nameBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

const CONE_KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><Placemark><name>Forecast cone</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-70,25,0 -72,30,0 -68,30,0 -70,25,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></Document></kml>`;
const TRACK_KML = `<kml><Document><Placemark><name>Track</name><LineString><coordinates>-70,25 -71,28 -72,31</coordinates></LineString></Placemark>
<Folder><Placemark><name>Fri 8 AM</name><Point><coordinates>-71,28,0</coordinates></Point></Placemark></Folder></Document></kml>`;

export const fakeStorms = {
  activeStorms: [{
    id: 'al052026', binNumber: 'AT5', name: 'Ernesto', classification: 'HU', intensity: '100', pressure: '960',
    latitudeNumeric: 25.1, longitudeNumeric: -70.2, movementDir: 340, movementSpeed: 12, lastUpdate: '2026-09-01T15:00:00Z',
    publicAdvisory: { url: 'https://www.nhc.noaa.gov/text/MIATCPAT5.shtml' },
    trackCone: { kmzFile: 'https://www.nhc.noaa.gov/storm_graphics/api/AL052026_017adv_CONE.kmz' },
    forecastTrack: { kmzFile: 'https://www.nhc.noaa.gov/storm_graphics/api/AL052026_017adv_TRACK.kmz' },
  }, {
    id: 'ep102026', binNumber: 'EP1', name: 'Kay', classification: 'TS', intensity: '45', latitudeNumeric: 15, longitudeNumeric: -110,
    publicAdvisory: { url: 'javascript:alert(1)' }, trackCone: { kmzFile: 'https://evil.example/x.kmz' },
  }],
};

test('Saffir-Simpson categories', () => {
  assert.deepEqual([50, 64, 83, 96, 113, 137].map(category), [0, 1, 2, 3, 4, 5]);
});

test('storms are normalized, and only NHC links are kept', () => {
  const [a, b] = fakeStorms.activeStorms.map(normalizeStorm);
  assert.equal(a.kind, 'Major hurricane');
  assert.equal(a.category, 3);
  assert.equal(a.windMph, 115);
  assert.deepEqual(a.movement, { dir: 'NNW', mph: 12 });
  assert.equal(a.basin, 'Atlantic');
  assert.match(a.kid, /major hurricane/);
  assert.equal(b.kind, 'Tropical storm');
  assert.equal(b.advisoryUrl, null);
  assert.equal(b.coneKmz, null);
});

test('KMZ is unzipped and KML becomes GeoJSON', () => {
  const text = unzipFirst(zipOne('cone.kml', CONE_KML));
  const f = kmlToFeatures(text, { kind: 'cone' });
  assert.equal(f.length, 1);
  assert.equal(f[0].geometry.type, 'Polygon');
  assert.deepEqual(f[0].geometry.coordinates[0][0], [-70, 25]);
  const t = kmlToFeatures(TRACK_KML, { kind: 'track' });
  assert.deepEqual(t.map((x) => x.geometry.type), ['LineString', 'Point']);
  assert.equal(t[1].properties.name, 'Fri 8 AM');
  assert.throws(() => unzipFirst(Buffer.from('not a zip at all, sorry........')));
});

test('getStorms loads cones and tracks and survives a broken KMZ', async () => {
  const fetchImpl = mockFetch({
    'CurrentStorms.json': () => Response.json(fakeStorms),
    '_CONE.kmz': () => new Response(zipOne('a.kml', CONE_KML)),
    '_TRACK.kmz': () => new Response('garbage'),
  });
  const warns = [];
  const r = await getStorms(fetchImpl, { log: { warn: (o) => warns.push(o) } });
  assert.equal(r.storms.length, 2);
  assert.equal(r.features.features.length, 1);
  assert.equal(r.features.features[0].properties.storm, 'al052026');
  assert.equal(warns.length, 1);
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('evil.example')));
  assert.ok(!('coneKmz' in r.storms[0]));
});

test('distance in miles', () => {
  const d = milesBetween({ lat: 37.54, lon: -77.43 }, { lat: 25.76, lon: -80.19 });
  assert.ok(d > 800 && d < 840, String(d));
});

export const NDBC = `#STN     LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text    deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
44014   36.603  -74.837 2026 11 02 18 50  200  7.0   9.0  1.5   8 6.1 110 1015.2 -1.1  18.0  20.0  12.0   MM     MM
44099   36.915  -75.720 2026 11 02 18 56   MM   MM    MM  1.0  10 5.5 100     MM   MM    MM  19.5    MM   MM     MM
XXXXX   10.000   10.000 2026 11 02 18 56   MM   MM    MM   MM  MM  MM  MM     MM   MM    MM    MM    MM   MM     MM
`;

test('NDBC latest observations parse by column name and convert units', () => {
  const b = parseNdbc(NDBC, 'imperial');
  assert.equal(b.length, 2);
  assert.equal(b[0].id, '44014');
  assert.equal(b[0].waveHeight, 4.9);
  assert.equal(b[0].wind, 16);
  assert.equal(b[0].waterTemp, 68);
  assert.equal(b[0].time, '2026-11-02T18:50:00Z');
  assert.equal(b[1].wind, null);
  const m = parseNdbc(NDBC, 'metric');
  assert.equal(m[0].waveHeight, 1.5);
  assert.equal(m[0].wind, 25);
  assert.equal(inBox(b, { south: 36.7, west: -76, north: 37, east: -75 }).total, 1);
  assert.throws(() => parseNdbc('<html>oops</html>'));
});

test('tides: nearest station and upcoming highs and lows', () => {
  const stations = [{ id: '8638610', name: 'Sewells Point', lat: 36.95, lon: -76.33 }, { id: '8665530', name: 'Charleston', lat: 32.78, lon: -79.92 }];
  assert.equal(nearestStation(stations, { lat: 36.85, lon: -76.29 }).id, '8638610');
  assert.equal(nearestStation(stations, { lat: 39.1, lon: -84.5 }), null);
  const ev = normalizeTides({ predictions: [
    { t: '2026-11-02 05:00', v: '2.81', type: 'H' }, { t: '2026-11-02 11:10', v: '0.12', type: 'L' },
    { t: '2026-11-02 17:30', v: '2.95', type: 'H' }, { t: 'bad', v: 'x', type: 'L' },
  ] });
  assert.equal(ev.length, 3);
  const u = upcomingTides(ev, '2026-11-02T12:00');
  assert.equal(u.previous.type, 'low');
  assert.equal(u.next[0].time, '2026-11-02T17:30');
  assert.equal(u.state, 'rising');
});

test('API: /api/tropics, /api/buoys and /api/tides', async () => {
  const fetchImpl = mockFetch({
    'CurrentStorms.json': () => Response.json(fakeStorms),
    '.kmz': () => new Response(zipOne('a.kml', CONE_KML)),
    'latest_obs.txt': () => new Response(NDBC),
    'mdapi/prod/webapi/stations.json': () => Response.json({ stations: [{ id: '8638610', name: 'Sewells Point', lat: 36.95, lng: -76.33, state: 'VA' }] }),
    'datagetter': (u) => {
      assert.match(u, /station=8638610/);
      return Response.json({ predictions: [{ t: '2020-01-01 00:00', v: '1', type: 'L' }, { t: '2099-01-01 00:00', v: '2.5', type: 'H' }] });
    },
  });
  const { app } = await testApp({ fetchImpl });
  const t = (await app.inject('/api/tropics')).json();
  assert.equal(t.storms[0].name, 'Ernesto');
  assert.equal(t.features.type, 'FeatureCollection');
  const b = (await app.inject('/api/buoys?south=35&west=-80&north=38&east=-70')).json();
  assert.equal(b.total, 2);
  assert.equal((await app.inject('/api/buoys?south=35&west=-80')).statusCode, 400);
  const tide = (await app.inject('/api/tides?lat=36.85&lon=-76.29')).json();
  assert.equal(tide.station.name, 'Sewells Point');
  assert.equal(tide.next[0].type, 'high');
  assert.equal(tide.state, 'rising');
  assert.match(tide.link, /8638610/);
  assert.equal((await app.inject('/api/tides?lat=39.1&lon=-84.5')).json().station, null);
  const ts = (await app.inject('/api/tides/stations?south=35&west=-80&north=38&east=-70')).json();
  assert.equal(ts.total, 1);
  assert.equal(ts.stations[0].id, '8638610');
  assert.equal((await app.inject('/api/tides/stations?south=40&west=-80&north=42&east=-70')).json().total, 0);
  await app.close();
});
