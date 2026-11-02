// Open-Meteo: free, no API key, blends national models (GFS, HRRR, ECMWF, ICON...)
// and picks the best one for each location automatically.
import { fetchJson } from '../cache.js';
import { describeCode } from '../weathercodes.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
  'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'dew_point_2m', 'uv_index', 'visibility',
];
const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'rain',
  'snowfall', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
  'dew_point_2m', 'relative_humidity_2m', 'pressure_msl', 'uv_index', 'cloud_cover', 'is_day',
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max',
  'apparent_temperature_min', 'precipitation_probability_max', 'precipitation_sum', 'snowfall_sum',
  'uv_index_max', 'sunrise', 'sunset', 'wind_speed_10m_max', 'wind_gusts_10m_max',
];

export function unitParams(units) {
  return units === 'metric'
    ? { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm' }
    : { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' };
}

export function forecastUrl(lat, lon, units) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    minutely_15: 'precipitation,weather_code',
    forecast_days: '10',
    past_days: '1',
    forecast_minutely_15: '8',
    past_minutely_15: '0',
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${FORECAST_URL}?${p}`;
}

// Open-Meteo returns column arrays; turn them into row objects.
function rows(block, keys, rename) {
  if (!block?.time) return [];
  return block.time.map((time, i) => {
    const r = { time };
    for (const k of keys) r[rename[k] || k] = block[k]?.[i] ?? null;
    return r;
  });
}

const RENAME = {
  temperature_2m: 'temp', apparent_temperature: 'feelsLike', precipitation_probability: 'precipChance',
  precipitation: 'precip', weather_code: 'code', wind_speed_10m: 'windSpeed', wind_gusts_10m: 'windGust',
  wind_direction_10m: 'windDir', dew_point_2m: 'dewPoint', relative_humidity_2m: 'humidity',
  pressure_msl: 'pressure', uv_index: 'uv', cloud_cover: 'cloudCover', is_day: 'isDay',
  temperature_2m_max: 'high', temperature_2m_min: 'low', apparent_temperature_max: 'feelsLikeHigh',
  apparent_temperature_min: 'feelsLikeLow', precipitation_probability_max: 'precipChance',
  precipitation_sum: 'precipTotal', snowfall_sum: 'snowTotal', uv_index_max: 'uvMax',
  wind_speed_10m_max: 'windMax', wind_gusts_10m_max: 'gustMax', snowfall: 'snow',
};

export function normalizeForecast(raw, units, now = Date.now()) {
  const tz = raw.timezone;
  const offsetMs = (raw.utc_offset_seconds || 0) * 1000;
  // Open-Meteo times are local wall-clock strings without an offset.
  const toEpoch = (t) => Date.parse(`${t}Z`) - offsetMs;
  const c = raw.current || {};
  const current = {
    time: c.time,
    temp: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    dewPoint: c.dew_point_2m,
    pressure: c.pressure_msl,
    windSpeed: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    windGust: c.wind_gusts_10m,
    uv: c.uv_index,
    cloudCover: c.cloud_cover,
    visibility: c.visibility,
    precip: c.precipitation,
    isDay: !!c.is_day,
    ...describeCode(c.weather_code),
  };
  const allHourly = rows(raw.hourly, HOURLY, RENAME).map((h) => ({ ...h, epoch: toEpoch(h.time), isDay: !!h.isDay, ...describeCode(h.code) }));
  const hourAgo = now - 3600_000;
  const hourly = allHourly.filter((h) => h.epoch >= hourAgo).slice(0, 48);
  const past = allHourly.filter((h) => h.epoch < now && h.epoch >= now - 24 * 3600_000);
  const daily = rows(raw.daily, DAILY, RENAME)
    .map((d) => ({ ...d, ...describeCode(d.code) }))
    .filter((d) => d.time >= (c.time || '').slice(0, 10))
    .slice(0, 10);
  const minutely = rows(raw.minutely_15, ['precipitation', 'weather_code'], { precipitation: 'precip', weather_code: 'code' });
  const pressures = allHourly.filter((h) => h.epoch <= now && h.pressure != null).slice(-4);
  const pressureTrend = pressures.length >= 2 ? +(pressures.at(-1).pressure - pressures[0].pressure).toFixed(1) : null;
  return {
    timezone: tz,
    utcOffsetSeconds: raw.utc_offset_seconds || 0,
    units: unitLabels(units),
    current: { ...current, pressureTrend3h: pressureTrend },
    minutely,
    hourly,
    daily,
    recent: {
      precipLast24h: +past.reduce((s, h) => s + (h.precip || 0), 0).toFixed(2),
      precipLast6h: +past.filter((h) => h.epoch >= now - 6 * 3600_000).reduce((s, h) => s + (h.precip || 0), 0).toFixed(2),
    },
    source: 'Open-Meteo (best-match blend of GFS, HRRR, ECMWF, ICON and other national models)',
  };
}

export function unitLabels(units) {
  return units === 'metric'
    ? { temp: '°C', wind: 'km/h', precip: 'mm', pressure: 'hPa' }
    : { temp: '°F', wind: 'mph', precip: 'in', pressure: 'hPa' };
}

export async function getForecast({ lat, lon, units }, fetchImpl) {
  const raw = await fetchJson(forecastUrl(lat, lon, units), { source: 'open-meteo', fetchImpl });
  return normalizeForecast(raw, units);
}

export function aqiCategory(aqi) {
  if (aqi == null) return null;
  const bands = [
    [50, 'Good', 'green', 'Great air for playing outside!'],
    [100, 'Moderate', 'yellow', 'Air is okay for most people.'],
    [150, 'Unhealthy for sensitive groups', 'orange', 'Kids with asthma should take it easy outside.'],
    [200, 'Unhealthy', 'red', 'Better to play inside today.'],
    [300, 'Very unhealthy', 'purple', 'Stay inside, the air is not healthy.'],
    [Infinity, 'Hazardous', 'maroon', 'Stay inside with windows closed.'],
  ];
  const [, label, color, kid] = bands.find(([max]) => aqi <= max);
  return { label, color, kid };
}

export async function getAirQuality({ lat, lon }, fetchImpl) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,uv_index',
    timezone: 'auto',
  });
  const raw = await fetchJson(`${AIR_URL}?${p}`, { source: 'open-meteo-air', fetchImpl });
  const c = raw.current || {};
  return {
    aqi: c.us_aqi ?? null,
    category: aqiCategory(c.us_aqi),
    pm25: c.pm2_5 ?? null,
    pm10: c.pm10 ?? null,
    ozone: c.ozone ?? null,
    no2: c.nitrogen_dioxide ?? null,
    uv: c.uv_index ?? null,
    source: 'Open-Meteo Air Quality (CAMS)',
  };
}

export async function geocode(query, fetchImpl) {
  const p = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' });
  const raw = await fetchJson(`${GEO_URL}?${p}`, { source: 'open-meteo-geocoding', fetchImpl });
  return (raw.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country_code === 'US' ? null : r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    country: r.country_code,
    timezone: r.timezone,
  }));
}
