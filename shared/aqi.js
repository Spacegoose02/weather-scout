// Air sensor math shared by the server and the web app: PM2.5 to the US AQI
// (EPA's 2024 breakpoints), the EPA correction for PurpleAir sensors, and the
// colors and words for each AQI band.

// [concentration low, high, AQI low, high] for 24-hour PM2.5 in µg/m³ (EPA, May 2024).
export const PM25_BREAKPOINTS = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

export function pm25Aqi(pm) {
  if (pm == null || !Number.isFinite(pm) || pm < 0) return null;
  const c = Math.floor(pm * 10) / 10; // EPA truncates to one decimal
  if (c > 325.4) return 500;
  const row = PM25_BREAKPOINTS.find(([lo, hi]) => c <= hi && c >= lo) || PM25_BREAKPOINTS.find(([, hi]) => c <= hi);
  const [lo, hi, alo, ahi] = row;
  return Math.round(((ahi - alo) / (hi - lo)) * (Math.max(lo, c) - lo) + alo);
}

// PurpleAir's laser counters read high in humid air and in smoke. EPA's US-wide
// correction (Barkjohn et al.), with the extra term for heavy smoke.
export function purpleAirCorrect(pa, rh) {
  if (pa == null || !Number.isFinite(pa) || pa < 0) return null;
  const h = Number.isFinite(rh) ? Math.min(100, Math.max(0, rh)) : 50;
  let v;
  if (pa < 343) v = 0.524 * pa - 0.0862 * h + 5.75;
  else v = 0.46 * pa + 3.93e-4 * pa * pa + 2.97;
  return Math.max(0, Math.round(v * 10) / 10);
}

export const AQI_LEVELS = [
  { max: 50, id: 'good', label: 'Good', color: '#2fa84f', kid: 'Great air for playing outside!' },
  { max: 100, id: 'moderate', label: 'Moderate', color: '#e6c619', kid: 'Air is okay for most people.' },
  { max: 150, id: 'usg', label: 'Unhealthy for sensitive groups', color: '#f08a24', kid: 'Kids with asthma should take it easy outside.' },
  { max: 200, id: 'unhealthy', label: 'Unhealthy', color: '#e0322b', kid: 'Better to play inside today.' },
  { max: 300, id: 'very', label: 'Very unhealthy', color: '#8f3f97', kid: 'Stay inside, the air is not healthy.' },
  { max: Infinity, id: 'hazardous', label: 'Hazardous', color: '#7e0023', kid: 'Stay inside with windows closed.' },
];

export const aqiLevel = (aqi) => (aqi == null ? null : AQI_LEVELS.find((l) => aqi <= l.max));

// The middle value, so one broken sensor can't swing the reading.
export function median(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// The AQI near you from the closest sensors: the median of the nearest few
// (within `miles`), with official monitors counted twice.
export function sensorConsensus(sensors, { miles = 10, take = 5 } = {}) {
  const near = sensors.filter((s) => s.aqi != null && s.miles <= miles).sort((a, b) => a.miles - b.miles).slice(0, take);
  if (!near.length) return null;
  const vals = near.flatMap((s) => (s.official ? [s.aqi, s.aqi] : [s.aqi]));
  const aqi = Math.round(median(vals));
  return { aqi, level: aqiLevel(aqi), count: near.length, miles: near.at(-1).miles, official: near.some((s) => s.official) };
}

// Smoke grid cells are AQI values; anything Good is left clear on the map.
export const SMOKE_MIN_AQI = 51;
