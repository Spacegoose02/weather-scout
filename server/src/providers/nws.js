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
    forecastUrl: raw?.properties?.forecast || null,
  };
}

// The forecaster-written day and night periods ("Tonight: Showers likely,
// mainly between 10pm and 2am...") that weather.gov shows as its Detailed
// Forecast. US only: `available` is false anywhere NWS does not forecast.
export function normalizeTextForecast(raw) {
  const p = raw?.properties || {};
  const periods = (Array.isArray(p.periods) ? p.periods : [])
    .filter((x) => x && x.name && (x.detailedForecast || x.shortForecast))
    .map((x) => ({
      name: x.name,
      start: x.startTime || null,
      end: x.endTime || null,
      isDaytime: !!x.isDaytime,
      temp: Number.isFinite(x.temperature) ? x.temperature : null,
      tempUnit: x.temperatureUnit || null,
      precipChance: Number.isFinite(x.probabilityOfPrecipitation?.value) ? x.probabilityOfPrecipitation.value : null,
      wind: [x.windDirection, x.windSpeed].filter(Boolean).join(' ') || null,
      short: x.shortForecast || '',
      detailed: x.detailedForecast || x.shortForecast || '',
    }));
  return { available: periods.length > 0, periods, updatedAt: p.updateTime || p.generatedAt || null };
}

export async function getTextForecast({ lat, lon, units }, { userAgent, fetchImpl, point } = {}) {
  const headers = { 'User-Agent': userAgent, Accept: 'application/geo+json' };
  let place;
  try {
    place = point || (await reverseGeocode({ lat, lon }, { userAgent, fetchImpl }));
  } catch (err) {
    // NWS answers 404 for points outside the US and its waters.
    if (err.status === 404) return { available: false, periods: [], updatedAt: null, source: 'National Weather Service' };
    throw err;
  }
  if (!place?.forecastUrl) return { available: false, periods: [], updatedAt: null, source: 'National Weather Service' };
  const url = `${place.forecastUrl}${units === 'metric' ? '?units=si' : ''}`;
  const raw = await fetchJson(url, { source: 'nws', fetchImpl, headers, timeoutMs: 15000 });
  return { ...normalizeTextForecast(raw), office: place.office || null, place: place.name || null, source: 'National Weather Service' };
}
