// Wildfire details: everything a fire's own daily update usually tells you
// (size, containment, crews, where it is, closures, smoke and safety), pulled
// together from two free public feeds:
//  - NIFC WFIGS incident records (the same national dataset the map pins use),
//    which carry the numbers: acres, percent contained, people assigned, cause,
//    fire behavior, fuels, who manages it.
//  - InciWeb's incident feed, which carries the written overview fire teams post,
//    where road and trail closures, evacuations and smoke notes live.
// Pure functions only, shared by the server and the web app.
import { compassWord } from './lightning.js';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const when = (v) => (num(v) == null ? null : new Date(num(v)).toISOString());
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const titleCase = (s) => clean(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
export const fireTitle = (s) => {
  const n = titleCase(s || 'Unnamed');
  return /fire$|complex$/i.test(n) ? n : `${n} Fire`;
};

const AGENCIES = {
  USFS: 'U.S. Forest Service', BLM: 'Bureau of Land Management', NPS: 'National Park Service', BIA: 'Bureau of Indian Affairs',
  FWS: 'U.S. Fish and Wildlife Service', DOD: 'Department of Defense', DOE: 'Department of Energy', ST: 'State', CNTY: 'County',
  CITY: 'City', OTHR: 'Other', PRIV: 'Private', TRIBE: 'Tribal', 'ST/C&L': 'State and local', ANCSA: 'Alaska Native land', BOR: 'Bureau of Reclamation',
};
const LAND = {
  USFS: 'national forest land', BLM: 'Bureau of Land Management land', NPS: 'national park land', BIA: 'tribal trust land', FWS: 'national wildlife refuge land',
  DOD: 'military land', ST: 'state land', CNTY: 'county land', CITY: 'city land', PRIV: 'private land', OTHR: 'other land', TRIBE: 'tribal land',
};
export const agencyName = (code) => AGENCIES[String(code || '').toUpperCase()] || clean(code) || null;

// One WFIGS incident record (GeoJSON feature, or an Esri JSON feature) -> the details card.
export function parseFireDetail(feature) {
  if (!feature) return null;
  const p = feature.properties || feature.attributes || {};
  const g = feature.geometry || {};
  const [lon, lat] = Array.isArray(g.coordinates) ? g.coordinates : [g.x, g.y];
  const status = num(p.FireOutDateTime) ? 'out' : num(p.ControlDateTime) ? 'controlled' : num(p.ContainmentDateTime) || num(p.PercentContained) === 100 ? 'contained' : 'active';
  const behavior = [p.FireBehaviorGeneral, p.FireBehaviorGeneral1, p.FireBehaviorGeneral2, p.FireBehaviorGeneral3].map(clean).filter(Boolean);
  const land = String(p.POOLandownerCategory || '').toUpperCase();
  const acres = num(p.IncidentSize ?? p.DailyAcres);
  const pct = num(p.PercentContained);
  return {
    id: String(p.IrwinID || p.UniqueFireIdentifier || p.OBJECTID || ''),
    name: fireTitle(p.IncidentName),
    lat: num(lat ?? p.InitialLatitude),
    lon: num(lon ?? p.InitialLongitude),
    state: String(p.POOState || '').replace(/^US-/, ''),
    county: clean(p.POOCounty) || null,
    city: clean(p.POOCity) || null,
    near: clean(p.IncidentShortDescription) || null,
    acres: acres == null ? null : Math.round(acres),
    startAcres: num(p.DiscoveryAcres),
    contained: pct == null ? null : Math.round(pct),
    personnel: num(p.TotalIncidentPersonnel),
    status,
    started: when(p.FireDiscoveryDateTime),
    containedAt: when(p.ContainmentDateTime),
    controlledAt: when(p.ControlDateTime),
    outAt: when(p.FireOutDateTime),
    reportAt: when(p.ICS209ReportDateTime),
    updated: when(p.ModifiedOnDateTime_dt ?? p.ModifiedOnDateTime),
    cause: clean(p.FireCauseGeneral) || clean(p.FireCause) || null,
    behavior: [...new Set(behavior)],
    fuels: [p.PrimaryFuelModel, p.SecondaryFuelModel].map(clean).filter(Boolean),
    land: LAND[land] || null,
    agency: agencyName(p.POOProtectingAgency || p.POOJurisdictionalAgency),
    unit: clean(p.POOProtectingUnit || p.POOJurisdictionalUnit).toUpperCase() || null,
    team: clean(p.IncidentComplexityLevel) || clean(p.IncidentManagementOrganization) || null,
    costToDate: num(p.EstimatedCostToDate),
    complex: clean(p.CpxName) || null,
    fireId: clean(p.UniqueFireIdentifier) || null,
  };
}

// ---- InciWeb ----------------------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
// The feed double-escapes some entities (&amp;nbsp;), so decode twice.
const decode = (s) => {
  let out = String(s ?? '');
  for (let i = 0; i < 2; i++) out = out.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => (ENTITIES[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m)));
  return out;
};
const tag = (item, name) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
};
const field = (text, label) => {
  const m = text.match(new RegExp(`${label}:\\s*([^\\n]*)`, 'i'));
  return m ? clean(m[1]) : '';
};
// "Latitude: 41° 57 7.2  Longitude: 78° 54 45.3" (InciWeb leaves off the minus sign for west).
const dms = (s) => {
  const parts = String(s || '').match(/-?\d+(?:\.\d+)?/g);
  if (!parts) return null;
  const [d, m = 0, sec = 0] = parts.map(Number);
  return Math.sign(d || 1) * (Math.abs(d) + m / 60 + sec / 3600);
};

// InciWeb's incident RSS feed -> one entry per incident with its written overview.
export function parseInciweb(xml) {
  const out = [];
  for (const raw of String(xml || '').split(/<item>/i).slice(1)) {
    const item = raw.split(/<\/item>/i)[0];
    const title = clean(tag(item, 'title'));
    const desc = tag(item, 'description').replace(/<[^>]+>/g, ' ');
    const m = title.match(/^([A-Z]{2}[A-Z0-9]{2,5})\s+(.+)$/);
    const type = field(desc, 'The type of incident is').replace(/\s+and involves.*$/i, '');
    const coords = desc.match(/Latitude:\s*([^L]*?)\s+Longitude:\s*([^\n]*)/i);
    const lat = coords ? dms(coords[1]) : null;
    let lon = coords ? dms(coords[2]) : null;
    if (lon != null && lon > 0) lon = -lon; // every InciWeb incident is in the western hemisphere
    const overview = clean(decode((desc.split(/Incident Overview:/i)[1] || '')).replace(/ /g, ' '));
    out.push({
      unit: m ? m[1] : null,
      name: clean(m ? m[2] : title),
      url: tag(item, 'link').trim().replace(/^http:/, 'https:'),
      type: type || null,
      wildfire: /wildfire/i.test(type) || (!type && !/prescribed|\brx\b|pile/i.test(title)),
      state: field(desc, 'State') || null,
      updated: field(desc, 'Last updated') || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      overview,
    });
  }
  return out;
}

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};
const core = (s) => String(s || '').toLowerCase().replace(/\b(wild)?fire\b|\bcomplex\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// The InciWeb entry for a WFIGS fire: same fire name, and the same unit or state.
export function matchInciweb(items, fire) {
  if (!fire) return null;
  const name = core(fire.name);
  if (!name) return null;
  const stateName = STATE_NAMES[fire.state] || fire.state;
  return (items || []).find((i) => {
    if (core(i.name) !== name) return false;
    if (fire.unit && i.unit && fire.unit === i.unit) return true;
    return !!stateName && String(i.state || '').toLowerCase() === String(stateName).toLowerCase();
  }) || null;
}

const sentences = (text) => clean(text).split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map((s) => s.trim()).filter((s) => s.length > 8);
const pick = (list, re, max = 3) => [...new Set(list.filter((s) => re.test(s)))].slice(-max).map((s) => (s.length > 320 ? `${s.slice(0, 317)}…` : s));

// Split an overview into the parts people look for in a fire update.
export function fireHighlights(text) {
  const t = clean(text);
  if (!t) return { latest: null, closures: [], evacuations: [], smoke: [], safety: [] };
  // Many teams append "11/5, 5:30 PM - UPDATE: ..." paragraphs; the last one is the news.
  const parts = t.split(/(?=\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?,?\s+\d{1,2}:\d{2}\s*[AP]\.?M\.?\s*[-–—]\s*UPDATE:)/i);
  const latestRaw = parts.length > 1 ? parts[parts.length - 1] : null;
  const latest = latestRaw ? clean(latestRaw) : null;
  const all = sentences(t);
  return {
    latest: latest && latest.length > 600 ? `${latest.slice(0, 597)}…` : latest,
    closures: pick(all, /\bclos(ure|ures|ed)\b|trail advisory|area (is )?closed|road (is )?closed/i),
    evacuations: pick(all, /evacuat|\bshelter\b|\bready,? set,? go\b|structures? (are )?(threatened|at risk)/i, 2),
    smoke: pick(all, /\bsmoke\b|air quality|visibility|\bhaz[ey]\b/i, 2),
    safety: pick(all, /\bdrones?\b|\baircraft\b|\bcaution\b|\bTFR\b|flight restriction/i, 2),
  };
}

// ---- smoke and safety ------------------------------------------------------------
// Where today's wind carries a fire's smoke. windFrom is degrees the wind blows FROM.
export function smokeDrift(windFrom, mph) {
  if (windFrom == null || !Number.isFinite(Number(windFrom))) return null;
  const from = compassWord(Number(windFrom));
  const toward = compassWord((Number(windFrom) + 180) % 360);
  const calm = mph != null && mph < 4;
  return {
    from, toward, mph: mph == null ? null : Math.round(mph), calm,
    text: calm
      ? `Winds near the fire are light, so smoke may hang around and settle into valleys, especially overnight and early in the morning.`
      : `Wind near the fire blows from the ${from}${mph != null ? ` at about ${Math.round(mph)} mph` : ''}, pushing smoke toward the ${toward}.`,
  };
}

// Safety notes that fit this fire and how close it is.
export function fireSafety({ miles = null, upwind = false, airAqi = null, status = 'active' } = {}) {
  const out = [];
  const near = miles != null && miles <= 30;
  if (status === 'active' || status === 'contained') out.push({ id: 'drones', emoji: '🚁', text: 'Drones and private aircraft are not allowed near wildfires. If a drone flies, firefighting aircraft have to land.' });
  if (near) {
    out.push({ id: 'ready', emoji: '🎒', text: 'Know two ways out of your neighborhood and keep a go-bag ready. Follow local officials if they call for evacuations.' });
    out.push({ id: 'roads', emoji: '🚗', text: 'Smoke can cut visibility on nearby roads, especially at night and early morning. Slow down and use low-beam headlights.' });
  }
  if (near || upwind || (airAqi != null && airAqi > 100)) {
    out.push({ id: 'indoors', emoji: '🏠', text: 'When it smells smoky, keep windows closed, run the AC on recirculate or a HEPA air cleaner, and save hard exercise for cleaner air.' });
  }
  out.push({ id: 'closures', emoji: '⛔', text: 'Closed roads and trails near a fire are closed for firefighters’ safety, even if you can’t see flames.' });
  return out;
}

// ---- Rocky explains --------------------------------------------------------------
const FIELD_ACRES = 1.32; // an American football field with end zones
const BEHAVIOR_KID = {
  active: 'still burning and moving', creeping: 'creeping slowly along the ground', backing: 'burning slowly backward against the wind or downhill',
  smoldering: 'mostly smoldering, like a campfire’s glowing coals', running: 'running fast', torching: 'sometimes flaring up into single trees',
  minimal: 'barely moving', wind: 'being pushed by the wind', flanking: 'spreading sideways',
};

export function fireKid(f, { drift = null } = {}) {
  if (!f) return [];
  const lines = [];
  if (f.acres != null) {
    const fields = Math.max(1, Math.round(f.acres / FIELD_ACRES));
    lines.push(`🏈 The ${f.name} has burned about ${f.acres.toLocaleString('en-US')} acres. That’s as big as about ${fields.toLocaleString('en-US')} football fields!`);
  }
  if (f.status === 'out') lines.push('✅ Firefighters say this fire is out. Great job, crews!');
  else if (f.status === 'controlled') lines.push('✅ This fire is “controlled”: firefighters are sure it can’t grow any more. They keep watching for hot spots.');
  else if (f.contained != null) {
    lines.push(f.contained >= 100
      ? '🧱 It’s 100% contained. Firefighters built a fire-stopping line all the way around it, like a dirt fence the fire can’t cross.'
      : `🧱 It’s ${f.contained}% contained. That means firefighters have built a fire-stopping line, like a dirt fence, around ${f.contained >= 45 && f.contained <= 55 ? 'about half' : `${f.contained} out of every 100 steps`} of the fire’s edge.`);
  }
  if (f.personnel) {
    const buses = Math.max(1, Math.round(f.personnel / 50));
    lines.push(`👩‍🚒 ${f.personnel.toLocaleString('en-US')} people are working on it${f.personnel >= 40 ? `, enough to fill ${buses === 1 ? 'a school bus' : `about ${buses} school buses`}` : ''}: hand crews with shovels and saws, fire engines, bulldozers and sometimes helicopters.`);
  }
  const moves = f.behavior.length > 1 ? f.behavior.filter((b) => b.toLowerCase() !== 'active') : f.behavior;
  const how = moves.map((b) => BEHAVIOR_KID[b.toLowerCase()] || null).filter(Boolean);
  if (how.length && f.status !== 'out') lines.push(`🔥 Right now the fire is ${how.slice(0, 2).join(' and ')}.`);
  if (drift) lines.push(drift.calm ? '🌫️ The wind is calm, so smoke can pile up in valleys at night and in the morning.' : `💨 The wind is pushing its smoke toward the ${drift.toward}.`);
  lines.push('🛡️ If you smell smoke, play inside and close the windows. Never fly a drone near a fire: helicopters have to stop dropping water until it’s gone.');
  return lines;
}

// Fire words, for grown-ups and kids alike.
export const FIRE_WORDS = [
  { word: 'Contained', text: 'Crews have a line around that share of the fire’s edge that they expect to hold. The fire can still burn inside it.' },
  { word: 'Controlled', text: 'The whole line is finished and secure; the fire is not expected to grow.' },
  { word: 'Out', text: 'No heat or smoke is left. Big fires can take weeks to be called out.' },
  { word: 'Firing operation', text: 'Firefighters carefully burn the fuel between the fire and their line on purpose, so the main fire has nothing left to burn when it gets there.' },
  { word: 'Mop-up', text: 'Putting out hot spots near the edge so nothing sneaks across the line.' },
];
