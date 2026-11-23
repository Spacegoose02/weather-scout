import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFireDetail, parseInciweb, matchInciweb, fireHighlights, smokeDrift, fireSafety, fireKid } from '../../shared/fires.js';
import { cleanFireId, fireDetailUrl } from '../src/hazards.js';
import { testApp, mockFetch } from './helpers.js';

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

// The real WFIGS record for the White Oak Flat Fire (Alleghany County, VA), 22 Nov 2026 evening.
const whiteOak = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-79.862117, 37.8422] },
  properties: {
    ContainmentDateTime: null, ControlDateTime: null, FireOutDateTime: null, IncidentSize: 1800, DiscoveryAcres: 15, EstimatedCostToDate: 194350,
    FireBehaviorGeneral: 'Active', FireBehaviorGeneral1: null, FireBehaviorGeneral2: 'Backing', FireBehaviorGeneral3: 'Creeping',
    FireCause: 'Undetermined', FireCauseGeneral: null, FireDiscoveryDateTime: 1795193220000, ICS209ReportDateTime: 1795388694000,
    IncidentManagementOrganization: 'Type 3 IC', IncidentName: 'White Oak Flat', IncidentShortDescription: '2 Miles NW from Clifton Forge, VA',
    IncidentTypeCategory: 'WF', IrwinID: '{3D698F01-48D2-465E-BF20-A291A3639D96}', PercentContained: 49, POOCity: null, POOCounty: 'Alleghany',
    POOLandownerCategory: 'USFS', POOProtectingAgency: 'USFS', POOProtectingUnit: 'VAVAF', POOState: 'US-VA', PrimaryFuelModel: 'Hardwood Litter',
    SecondaryFuelModel: 'Brush (2 feet)', TotalIncidentPersonnel: 131, UniqueFireIdentifier: '2026-VAVAF-260136', ModifiedOnDateTime_dt: 1795391203987,
    IncidentComplexityLevel: 'Type 3 Incident', CpxName: null,
  },
};

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>InciWeb</title>
<item>
  <title>VAVAF White Oak Flat Fire</title>
  <link>http://inciweb.wildfire.gov/incident-information/vavaf-white-oak-flat-fire</link>
  <description>Last updated: 2026-11-22


--- 

The type of incident is Wildfire and involves the following unit(s) George Washington and Jefferson National Forest. 

--- 

State: Virginia

--- 

Coordinates:

Latitude: 37° 50 32  Longitude: 79° 51 43 

--- 

Incident Overview: The White Oak Flat Fire is on Fore Mountain, 2 miles northwest of Clifton Forge.&amp;amp;nbsp;No private lands or structures are currently threatened and no evacuations are in effect. 11/22, 9:00 PM - UPDATE:&amp;amp;nbsp;Firefighters conducted strategic firing operations today to strengthen containment lines. Closures remain in effect for Forest Service Road 125 (Dolly Ann Road), FS Roads 337 and 448, and Fore Mountain Trail. Smoke is visible from I-64 and US-60 and may be heavier overnight and in the early morning. All private aircraft, including drones, are prohibited in and near the fire area.</description>
  <pubDate>Sun, 22 Nov 2026 21:00:00 EST</pubDate>
</item>
<item>
  <title>MTLNF Lolo National Forest Prescribed Fire Operations</title>
  <link>http://inciweb.wildfire.gov/incident-information/mtlnf-lolo-national-forest-prescribed-fire-operations</link>
  <description>Last updated: 2026-11-20 --- The type of incident is Prescribed Fire and involves the following unit(s) Lolo National Forest. --- State: Montana</description>
</item>
</channel></rss>`;

test('a WFIGS record becomes the details a fire update gives', () => {
  const f = parseFireDetail(whiteOak);
  assert.equal(f.name, 'White Oak Flat Fire');
  assert.equal(f.acres, 1800);
  assert.equal(f.contained, 49);
  assert.equal(f.personnel, 131);
  assert.equal(f.county, 'Alleghany');
  assert.equal(f.state, 'VA');
  assert.equal(f.near, '2 Miles NW from Clifton Forge, VA');
  assert.equal(f.agency, 'U.S. Forest Service');
  assert.equal(f.land, 'national forest land');
  assert.equal(f.status, 'active');
  assert.deepEqual(f.behavior, ['Active', 'Backing', 'Creeping']);
  assert.deepEqual(f.fuels, ['Hardwood Litter', 'Brush (2 feet)']);
  assert.equal(f.cause, 'Undetermined');
  assert.equal(f.unit, 'VAVAF');
  assert.equal(f.lat, 37.8422);
  // Esri JSON works too, and out/controlled dates win over percent.
  const out = parseFireDetail({ attributes: { ...whiteOak.properties, FireOutDateTime: 1795391203987 }, geometry: { x: -79.86, y: 37.84 } });
  assert.equal(out.status, 'out');
  assert.equal(out.lon, -79.86);
  assert.equal(parseFireDetail(null), null);
});

test('InciWeb overviews are matched to the fire and split into closures, smoke and safety', () => {
  const items = parseInciweb(rss);
  assert.equal(items.length, 2);
  assert.equal(items[0].unit, 'VAVAF');
  assert.equal(items[0].url, 'https://inciweb.wildfire.gov/incident-information/vavaf-white-oak-flat-fire');
  assert.equal(items[0].wildfire, true);
  assert.equal(items[1].wildfire, false);
  assert.ok(Math.abs(items[0].lat - 37.842) < 0.01);
  assert.ok(items[0].lon < 0, 'western hemisphere');
  assert.doesNotMatch(items[0].overview, /&|nbsp/);
  const fire = parseFireDetail(whiteOak);
  assert.equal(matchInciweb(items, fire), items[0]);
  assert.equal(matchInciweb(items, { ...fire, unit: 'XXXXX' }), items[0], 'state match is enough');
  assert.equal(matchInciweb(items, { ...fire, unit: 'XXXXX', state: 'CA' }), null);
  assert.equal(matchInciweb(items, { ...fire, name: 'Other Fire' }), null);

  const h = fireHighlights(items[0].overview);
  assert.match(h.latest, /^11\/22, 9:00 PM - UPDATE:/);
  assert.match(h.closures[0], /Dolly Ann Road/);
  assert.match(h.evacuations[0], /no evacuations/);
  assert.match(h.smoke[0], /I-64/);
  assert.match(h.safety[0], /drones/);
  assert.deepEqual(fireHighlights(''), { latest: null, closures: [], evacuations: [], smoke: [], safety: [] });
});

test('smoke drift, safety notes and Rocky’s kid version', () => {
  const d = smokeDrift(315, 9.6);
  assert.equal(d.toward, 'southeast');
  assert.match(d.text, /from the northwest at about 10 mph/);
  assert.equal(smokeDrift(90, 2).calm, true);
  assert.equal(smokeDrift(null, 5), null);

  const far = fireSafety({ miles: 180 }).map((s) => s.id);
  assert.deepEqual(far, ['drones', 'closures']);
  const close = fireSafety({ miles: 12 }).map((s) => s.id);
  assert.ok(close.includes('ready') && close.includes('roads') && close.includes('indoors'));
  assert.ok(fireSafety({ miles: 120, airAqi: 160 }).some((s) => s.id === 'indoors'));
  assert.ok(!fireSafety({ status: 'out' }).some((s) => s.id === 'drones'));

  const kid = fireKid(parseFireDetail(whiteOak), { drift: d }).join('\n');
  assert.match(kid, /1,364 football fields/);
  assert.match(kid, /49% contained.*about half/);
  assert.match(kid, /131 people.*about 3 school buses/);
  assert.match(kid, /fire is burning slowly backward against the wind or downhill and creeping slowly along the ground\./);
  assert.match(kid, /toward the southeast/);
  assert.deepEqual(fireKid(null), []);
});

test('fire ids are checked before they go into a query', () => {
  assert.equal(cleanFireId('3d698f01-48d2-465e-bf20-a291a3639d96'), '{3D698F01-48D2-465E-BF20-A291A3639D96}');
  assert.equal(cleanFireId("x' OR 1=1"), null);
  assert.match(fireDetailUrl('{3D698F01-48D2-465E-BF20-A291A3639D96}'), /IrwinID%3D%27%7B3D698F01/);
});

test('/api/fires/detail puts the record, InciWeb notes, smoke and safety together', async () => {
  const { app, fetchImpl } = await testApp({ fetchImpl: mockFetch({
    WFIGS_Incident_Locations_Current: () => json({ type: 'FeatureCollection', features: [whiteOak] }),
    'inciweb.wildfire.gov': () => new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }),
  }) });
  const r = await app.inject({ url: '/api/fires/detail?id={3D698F01-48D2-465E-BF20-A291A3639D96}&lat=37.79&lon=-79.82' });
  assert.equal(r.statusCode, 200);
  const d = r.json();
  assert.equal(d.fire.personnel, 131);
  assert.equal(d.inciweb.url, 'https://inciweb.wildfire.gov/incident-information/vavaf-white-oak-flat-fire');
  assert.match(d.inciweb.closures[0], /Fore Mountain Trail/);
  assert.equal(d.drift.from, 'south', 'the mock forecast wind is from 180°');
  assert.equal(d.air.aqi, 42);
  assert.ok(d.you.miles <= 5);
  assert.ok(d.safety.some((s) => s.id === 'ready'));
  assert.ok(d.kid.length >= 4);
  assert.ok(d.sources.includes('InciWeb'));
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('outFields=*')));

  const bad = await app.inject({ url: "/api/fires/detail?id=nope" });
  assert.equal(bad.statusCode, 400);

  // InciWeb down: the numbers still come back.
  const { app: app2 } = await testApp({ fetchImpl: mockFetch({
    WFIGS_Incident_Locations_Current: () => json({ type: 'FeatureCollection', features: [whiteOak] }),
    'inciweb.wildfire.gov': () => new Response('down', { status: 503 }),
  }) });
  const d2 = (await app2.inject({ url: '/api/fires/detail?id={3D698F01-48D2-465E-BF20-A291A3639D96}' })).json();
  assert.equal(d2.fire.name, 'White Oak Flat Fire');
  assert.equal(d2.inciweb, null);
  assert.equal(d2.inciwebAvailable, false);
  assert.equal(d2.you, null);

  const { app: app3 } = await testApp({ fetchImpl: mockFetch({ WFIGS_Incident_Locations_Current: () => json({ type: 'FeatureCollection', features: [] }) }) });
  assert.equal((await app3.inject({ url: '/api/fires/detail?id={3D698F01-48D2-465E-BF20-A291A3639D96}' })).statusCode, 404);
});

test('Ask Rocky gets nearby wildfires in its live data', async () => {
  const { firesContext, weatherContext } = await import('../src/ai.js');
  const fires = [{ name: 'White Oak Flat Fire', state: 'VA', acres: 1800, contained: 49, personnel: 131, near: '2 Miles NW from Clifton Forge, VA', miles: 42, dir: 'west', upwind: true }];
  const txt = firesContext({ place: { name: 'Lexington' }, fires });
  assert.match(txt, /White Oak Flat Fire \(VA\); 1,800 acres; 49% contained; 131 personnel assigned; located 2 Miles NW from Clifton Forge, VA; 42 miles west of Lexington; .*smoke may drift here/);
  assert.match(firesContext({ fires: [] }), /none right now/);
  assert.match(firesContext({ fires: null }), /could not be loaded/);
  assert.match(weatherContext({ forecast: null, fires }), /White Oak Flat/);
  assert.doesNotMatch(weatherContext({ forecast: null }), /wildfire/i);
});
