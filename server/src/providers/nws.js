// National Weather Service (api.weather.gov): official US watches, warnings and
// advisories. No key, but NWS requires a descriptive User-Agent.
import { fetchJson } from '../cache.js';

const BASE = 'https://api.weather.gov';
const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

// Plain-language versions of the most common alerts, for Kid Mode.
const KID_ALERTS = [
  [/tornado warning/i, 'A tornado may be close. Go to the lowest floor, away from windows, with a grown-up right now.'],
  [/tornado watch/i, 'Storms today could make tornadoes. Know where your safe spot is.'],
  [/severe thunderstorm warning/i, 'A big storm is coming with strong winds or hail. Stay inside.'],
  [/severe thunderstorm watch/i, 'Big storms could pop up later. Keep an eye on the sky.'],
  [/flash flood warning/i, 'Water is rising fast in some places. Never walk or ride through flood water.'],
  [/flood/i, 'There could be flooding. Stay away from creeks and big puddles on roads.'],
  [/winter storm|blizzard|ice storm/i, 'Lots of snow or ice is coming. Roads may be slippery.'],
  [/wind chill|extreme cold|freeze|frost/i, 'It will be very cold. Bundle up in layers, hats and mittens.'],
  [/heat/i, 'It will be very hot. Drink lots of water and rest in the shade.'],
  [/wind/i, 'It will be very windy. Hold on to your hat!'],
  [/fog/i, 'Thick fog makes it hard to see. Grown-ups should drive slowly.'],
  [/air quality|smoke/i, 'The air is not very clean right now. Play inside if you can.'],
  [/hurricane|tropical storm/i, 'A tropical storm is nearby with heavy rain and wind. Listen to your grown-ups.'],
];

export function kidSummary(event) {
  const hit = KID_ALERTS.find(([re]) => re.test(event || ''));
  return hit ? hit[1] : 'The weather service sent an important message. Ask a grown-up to read it.';
}

export function normalizeAlerts(raw) {
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return features
    .map((f) => {
      const p = f.properties || {};
      return {
        id: p.id || f.id,
        event: p.event,
        headline: p.headline,
        severity: p.severity || 'Unknown',
        urgency: p.urgency,
        certainty: p.certainty,
        description: p.description,
        instruction: p.instruction,
        areaDesc: p.areaDesc,
        sender: p.senderName,
        onset: p.onset || p.effective,
        ends: p.ends || p.expires,
        geometry: f.geometry || null,
        kid: kidSummary(p.event),
      };
    })
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
}

export async function getAlerts({ lat, lon }, { userAgent, fetchImpl } = {}) {
  const url = `${BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const raw = await fetchJson(url, {
    source: 'nws',
    fetchImpl,
    headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' },
  });
  return { alerts: normalizeAlerts(raw), source: 'National Weather Service' };
}

// Turn a lat/lon into "City, ST" using the NWS points endpoint (US only).
export async function reverseGeocode({ lat, lon }, { userAgent, fetchImpl } = {}) {
  const raw = await fetchJson(`${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
    source: 'nws',
    fetchImpl,
    headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' },
  });
  const rel = raw?.properties?.relativeLocation?.properties;
  return {
    name: rel ? `${rel.city}, ${rel.state}` : null,
    office: raw?.properties?.cwa || null,
    radarStation: raw?.properties?.radarStation || null,
  };
}
