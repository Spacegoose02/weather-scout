import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Build a synthetic Open-Meteo response around "now" so tests don't depend on the network.
export function fakeForecast({ code = 0, temp = 70, feels = temp, chance = 10, uv = 3, precip = 0, gust = 10, dew = 50, pressureDrop = 0, offset = -18000 } = {}) {
  const now = Date.now();
  const hourMs = 3600_000;
  const start = Math.floor(now / hourMs) * hourMs - 24 * hourMs;
  const local = (ms) => new Date(ms + offset * 1000).toISOString().slice(0, 16);
  const hours = Array.from({ length: 24 * 11 }, (_, i) => start + i * hourMs);
  const days = Array.from({ length: 11 }, (_, i) => local(start + i * 24 * hourMs).slice(0, 10));
  const fill = (v) => hours.map(() => v);
  return {
    timezone: 'America/New_York',
    utc_offset_seconds: offset,
    current: {
      time: local(now), temperature_2m: temp, relative_humidity_2m: 60, apparent_temperature: feels, is_day: 1,
      precipitation: precip, weather_code: code, cloud_cover: 20, pressure_msl: 1015, wind_speed_10m: 5,
      wind_direction_10m: 180, wind_gusts_10m: gust, dew_point_2m: dew, uv_index: uv, visibility: 20000,
    },
    hourly: {
      time: hours.map(local), temperature_2m: fill(temp), apparent_temperature: fill(feels), precipitation_probability: fill(chance),
      precipitation: fill(precip), rain: fill(precip), snowfall: fill(0), weather_code: fill(code), wind_speed_10m: fill(5),
      wind_gusts_10m: fill(gust), wind_direction_10m: fill(180), dew_point_2m: fill(dew), relative_humidity_2m: fill(60),
      pressure_msl: hours.map((h) => (h <= now ? 1015 - pressureDrop * ((h - (now - 3 * hourMs)) / (3 * hourMs)) : 1015)),
      uv_index: fill(uv), cloud_cover: fill(20), is_day: fill(1),
    },
    daily: {
      time: days, weather_code: days.map(() => code), temperature_2m_max: days.map(() => temp + 8), temperature_2m_min: days.map(() => temp - 10),
      apparent_temperature_max: days.map(() => feels + 8), apparent_temperature_min: days.map(() => feels - 10),
      precipitation_probability_max: days.map(() => chance), precipitation_sum: days.map(() => 0), snowfall_sum: days.map(() => 0),
      uv_index_max: days.map(() => uv), sunrise: days.map((d) => `${d}T07:00`), sunset: days.map((d) => `${d}T17:30`),
      wind_speed_10m_max: days.map(() => 10), wind_gusts_10m_max: days.map(() => gust),
    },
    minutely_15: { time: [local(now)], precipitation: [0], weather_code: [code] },
  };
}

export const fakeAlerts = {
  features: [
    { id: 'a1', geometry: null, properties: { id: 'a1', event: 'Wind Advisory', severity: 'Minor', headline: 'Wind Advisory until 6 PM' } },
    { id: 'a2', geometry: null, properties: { id: 'a2', event: 'Tornado Warning', severity: 'Extreme', headline: 'Tornado Warning until 4 PM' } },
  ],
};

export const fakeIbiCameras = [
  { ID: 1, Name: 'I-95 at Exit 74', Latitude: 37.55, Longitude: -77.44, Url: 'http://cams.example/1.jpg', RoadwayName: 'I-95', Disabled: false, Blocked: false },
  { ID: 2, Name: 'Broken cam', Latitude: 37.56, Longitude: -77.45, Url: 'http://cams.example/2.jpg', Disabled: true },
  { ID: 3, Name: 'Far away', Latitude: 40.7, Longitude: -74.0, Url: 'http://cams.example/3.jpg' },
];

export function mockFetch(overrides = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    for (const [match, handler] of Object.entries(overrides)) if (u.includes(match)) return handler(u, opts);
    if (u.includes('air-quality-api')) return json({ current: { us_aqi: 42, pm2_5: 8, pm10: 12, ozone: 60 } });
    if (u.includes('api.open-meteo.com')) return json(fakeForecast());
    if (u.includes('geocoding-api')) return json({ results: [{ name: 'Richmond', admin1: 'Virginia', country_code: 'US', latitude: 37.55, longitude: -77.46 }] });
    if (u.includes('api.weather.gov/alerts')) return json(fakeAlerts);
    if (u.includes('api.weather.gov/points')) return json({ properties: { cwa: 'AKQ', radarStation: 'KAKQ', relativeLocation: { properties: { city: 'Richmond', state: 'VA' } } } });
    if (u.includes('/api/getcameras')) return json(fakeIbiCameras);
    if (u.startsWith('http://cams.example/')) return new Response(Buffer.from([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });
    return json({ error: 'not mocked' }, 404);
  };
  fn.calls = calls;
  return fn;
}

export async function testApp({ env = {}, fetchImpl = mockFetch(), pushSend } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  const config = loadConfig({ DATA_DIR: dataDir, WEB_DIST: path.join(dataDir, 'no-web'), ...env });
  const app = await buildApp({ config, fetchImpl, logger: false, pushSend });
  return { app, fetchImpl, dataDir };
}

export function cookieFrom(res) {
  const c = res.headers['set-cookie'];
  return (Array.isArray(c) ? c[0] : c).split(';')[0];
}
