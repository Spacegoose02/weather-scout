// "Test" buttons in Family & settings for road-camera keys, weather station
// clouds and Home Assistant, run with the admin's unsaved form values.
import mqtt from 'mqtt';
import { DEFAULT_FEEDS } from './providers/cameras/index.js';
import { reach } from './aisettings.js';

const json = async (res) => res.json().catch(() => null);

// Never throws: resolves to { ok, message }.
export async function testIntegration(target, draft, { fetchImpl, cameras, connect = mqtt.connect }) {
  try {
    if (target.startsWith('camera:')) {
      const feed = DEFAULT_FEEDS.find((f) => f.id === target.slice(7));
      if (!feed) return { ok: false, message: 'Unknown camera feed.' };
      if (!draft.env[feed.keyEnv]) return { ok: false, message: `Add the ${feed.region} key first.` };
      try {
        const cams = await cameras.fetchFeed(feed, draft.env, { tries: 1 });
        return { ok: true, message: `Connected. ${cams.length} ${feed.region} cameras.` };
      } catch (err) {
        const msg = String(err.message || err);
        if (/40[13]/.test(msg)) return { ok: false, message: `${feed.name} turned that key down. Check it, or that it's been approved.` };
        return { ok: false, message: `${feed.name} didn't answer: ${msg.slice(0, 160)}` };
      }
    }

    if (target === 'ambient') {
      const { apiKey, applicationKey } = draft.stations.ambient;
      if (!apiKey || !applicationKey) return { ok: false, message: 'Ambient needs both the API key and the application key.' };
      const res = await fetchImpl(`https://rt.ambientweather.net/v1/devices?${new URLSearchParams({ apiKey, applicationKey })}`, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Ambient Weather turned those keys down.' };
      if (!res.ok) return { ok: false, message: `Ambient Weather answered ${res.status}.` };
      const devices = await json(res);
      const n = Array.isArray(devices) ? devices.length : 0;
      return { ok: true, message: n ? `Connected. Found ${n} station${n === 1 ? '' : 's'}.` : 'The keys work, but no stations are on that account yet.' };
    }

    if (target === 'tempest') {
      const { token } = draft.stations.tempest;
      if (!token) return { ok: false, message: 'Add the Tempest token first.' };
      const res = await fetchImpl(`https://swd.weatherflow.com/swd/rest/stations?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Tempest turned that token down.' };
      if (!res.ok) return { ok: false, message: `Tempest answered ${res.status}.` };
      const list = (await json(res))?.stations || [];
      return { ok: true, message: list.length ? `Connected. ${list.map((s) => `${s.name || s.public_name || 'Station'} (${s.station_id})`).join(', ')}.` : 'The token works, but no stations are on that account.' };
    }

    if (target === 'homeassistant') {
      const { restUrl, restToken } = draft.homeAssistant;
      if (!restUrl || !restToken) return { ok: false, message: 'Add the Home Assistant address and a long-lived token first.' };
      let res;
      try {
        res = await fetchImpl(`${restUrl}/api/`, { headers: { authorization: `Bearer ${restToken}` }, signal: AbortSignal.timeout(8000) });
      } catch (err) {
        return { ok: false, message: reach(err, 'Home Assistant', restUrl) };
      }
      if (res.status === 401) return { ok: false, message: 'Home Assistant turned that token down. Make a new long-lived token in your HA profile.' };
      if (!res.ok) return { ok: false, message: `Home Assistant answered ${res.status}. Is that the right address (usually port 8123)?` };
      return { ok: true, message: 'Connected to Home Assistant.' };
    }

    if (target === 'mqtt') {
      const { mqttUrl, mqttUsername, mqttPassword } = draft.homeAssistant;
      if (!mqttUrl) return { ok: false, message: 'Add the MQTT broker address first.' };
      return await new Promise((resolve) => {
        const client = connect(mqttUrl, {
          clientId: `weather-scout-test-${Math.random().toString(16).slice(2, 8)}`,
          connectTimeout: 8000,
          reconnectPeriod: 0,
          ...(mqttUsername ? { username: mqttUsername } : {}),
          ...(mqttPassword ? { password: mqttPassword } : {}),
        });
        const done = (r) => {
          clearTimeout(timer);
          try {
            client.end(true);
          } catch { /* already closed */ }
          resolve(r);
        };
        const timer = setTimeout(() => done({ ok: false, message: `The MQTT broker at ${mqttUrl} didn't answer in time.` }), 9000);
        client.on('connect', () => done({ ok: true, message: 'Connected to the MQTT broker.' }));
        client.on('error', (err) => done({
          ok: false,
          message: /auth|not authorized|bad user/i.test(err.message) ? 'The MQTT broker turned that username or password down.' : `Could not connect to the MQTT broker: ${err.message.slice(0, 120)}`,
        }));
      });
    }

    return { ok: false, message: 'Unknown test.' };
  } catch (err) {
    return { ok: false, message: `Test failed: ${String(err.message || err).slice(0, 160)}` };
  }
}
