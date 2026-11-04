// Pollen for places outside Europe (Open-Meteo's free pollen only covers Europe).
// Google's Pollen API covers the US and 65+ other countries with a daily tree,
// grass and weed index (Universal Pollen Index, 0-5). It needs a Google Maps
// Platform key with the Pollen API turned on; the free monthly allowance is far
// more than one home server uses with the 3-hour cache in app.js.
import { fetchJson } from '../cache.js';

const POLLEN_URL = 'https://pollen.googleapis.com/v1/forecast:lookup';
export const GOOGLE_POLLEN_ATTRIBUTION = 'Google Pollen API';

// UPI 0-5 to the same words the Europe counts use.
export function upiLevel(v) {
  if (v == null) return null;
  if (v <= 0) return 'None';
  if (v <= 2) return 'Low';
  if (v === 3) return 'Moderate';
  if (v === 4) return 'High';
  return 'Very high';
}

export function pollenUrl({ lat, lon }) {
  const p = new URLSearchParams({
    'location.latitude': lat.toFixed(4),
    'location.longitude': lon.toFixed(4),
    days: '1',
    languageCode: 'en',
    plantsDescription: 'false',
  });
  return `${POLLEN_URL}?${p}`;
}

// Today's tree/grass/weed in the { value, level } shape normalizeAir uses.
// Google leaves indexInfo out when a type is out of season and the count is low,
// which is the same as "none".
export function normalizeGooglePollen(raw) {
  const today = raw?.dailyInfo?.[0];
  const types = today?.pollenTypeInfo;
  if (!Array.isArray(types) || !types.length) return null;
  const pick = (code) => {
    const t = types.find((x) => x.code === code);
    if (!t) return { value: null, level: null };
    const value = t.indexInfo?.value ?? 0;
    return { value, level: upiLevel(value), inSeason: t.inSeason ?? null };
  };
  return { tree: pick('TREE'), grass: pick('GRASS'), weed: pick('WEED'), unit: 'index', scaleMax: 5, source: GOOGLE_POLLEN_ATTRIBUTION };
}

export async function getGooglePollen(l, key, fetchImpl) {
  // The key goes in a header so it never shows up in a logged URL.
  const raw = await fetchJson(pollenUrl(l), { source: 'google-pollen', headers: { 'x-goog-api-key': key }, fetchImpl });
  return normalizeGooglePollen(raw);
}
