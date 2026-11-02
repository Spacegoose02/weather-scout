import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { parsePush, parseTempestObs, parseTempestUdp, parseAmbientDevice, convertReading, dewPointF, feelsLikeF, StationService } from '../src/stations.js';
import { homeState } from '../src/homeassistant.js';
import { loadConfig } from '../src/config.js';
import { testApp, mockFetch } from './helpers.js';

const ecowittBody = 'PASSKEY=ABCDEF0123456789&stationtype=GW2000A_V3.1.2&dateutc=2026-11-02+20:00:00&tempinf=71.4&humidityin=44&baromrelin=30.012&baromabsin=29.4&tempf=58.6&humidity=63&winddir=225&windspeedmph=4.5&windgustmph=8.1&rainratein=0.000&dailyrainin=0.120&solarradiation=210.5&uv=2&lightning_num=3&lightning=12&model=GW2000A';

test('Ecowitt, Ambient and Weather Underground uploads are understood', () => {
  const eco = parsePush(Object.fromEntries(new URLSearchParams(ecowittBody)));
  assert.equal(eco.source, 'ecowitt');
  assert.match(eco.id, /^ecowitt_[0-9a-f]{8}$/);
  assert.ok(!eco.id.includes('ABCDEF'), 'passkey is not exposed');
  assert.equal(eco.reading.tempF, 58.6);
  assert.equal(eco.reading.rainTodayIn, 0.12);
  assert.equal(eco.reading.indoorTempF, 71.4);
  assert.ok(Math.abs(eco.reading.lightningDistMi - 7.46) < 0.01);

  const amb = parsePush({ PASSKEY: 'AA:BB', stationtype: 'AMBWeatherV4.3.4', tempf: '90', humidity: '50', windspeedmph: '2', hourlyrainin: '0.1' });
  assert.equal(amb.source, 'ambient');
  assert.equal(amb.reading.rainRateIn, 0.1);
  assert.ok(amb.reading.feelsLikeF > 90, 'heat index is worked out');

  const wu = parsePush({ ID: 'KVARICH12', PASSWORD: 'x', tempf: '30', dewptf: '-9999', windspeedmph: '15', baromin: '29.9' });
  assert.equal(wu.source, 'wunderground');
  assert.ok(wu.reading.feelsLikeF < 30, 'wind chill is worked out');
  assert.equal(wu.reading.pressureInHg, 29.9);
  assert.equal(parsePush({ hello: 'world' }), null);
});

test('Tempest (REST and UDP) and Ambient cloud readings', () => {
  const r = parseTempestObs({ air_temperature: 20, relative_humidity: 50, wind_avg: 2, wind_gust: 5, wind_direction: 90, sea_level_pressure: 1015, precip: 0.05, precip_accum_local_day: 2.54, uv: 3, solar_radiation: 400, lightning_strike_count_last_1hr: 0 });
  assert.equal(r.tempF, 68);
  assert.ok(Math.abs(r.windMph - 4.47) < 0.01);
  assert.ok(Math.abs(r.rainTodayIn - 0.1) < 1e-9);
  assert.ok(Math.abs(r.rainRateIn - 0.118) < 0.001);

  const udp = parseTempestUdp({ type: 'obs_st', serial_number: 'ST-1', obs: [[1700000000, 0.2, 1, 2, 180, 3, 1000, 10, 80, 0, 0, 0, 0.5, 1, 0, 0, 2.6, 1]] }, { elevationM: 100, rainSoFarMm: 2 });
  assert.equal(udp.reading.tempF, 50);
  assert.ok(udp.reading.pressureInHg > 29.8 && udp.reading.pressureInHg < 29.9, 'station pressure is corrected to sea level');
  assert.ok(Math.abs(udp.reading.rainTodayIn - 2.5 / 25.4) < 1e-9);
  assert.equal(udp.reading.lightningDistMi, null);
  assert.equal(parseTempestUdp({ type: 'rapid_wind' }), null);

  const a = parseAmbientDevice({ macAddress: '00:11', info: { name: 'Backyard' }, lastData: { dateutc: 1700000000000, tempf: 41, humidity: 70, dailyrainin: 0.3 } });
  assert.equal(a.name, 'Backyard');
  assert.equal(a.reading.rainTodayIn, 0.3);
});

test('unit conversion and derived values', () => {
  assert.ok(Math.abs(dewPointF(68, 50) - 48.7) < 0.3);
  assert.equal(feelsLikeF(65, 50, 10), 65);
  const m = convertReading({ tempF: 50, humidity: 50, windMph: 10, gustMph: null, pressureInHg: 30, rainTodayIn: 1, rainRateIn: 0, lightningCount: null, lightningDistMi: null }, 'metric');
  assert.equal(m.temp, 10);
  assert.equal(m.windSpeed, 16.1);
  assert.equal(m.rainToday, 25.4);
  assert.equal(m.pressure, 1015.9);
  assert.equal(m.lightning, null);
  assert.equal(m.indoor, null);
});

test('stations go stale, can be renamed, and the primary one is picked', () => {
  let now = 1_000_000_000_000;
  const cfg = loadConfig({ DATA_DIR: '/tmp/none', STATION_NAMES: 'wunderground_aaaaaaaa=Ignored' });
  const svc = new StationService(cfg, { now: () => now, log: {} });
  const st = svc.push({ ID: 'K1', tempf: '60' });
  svc.cfg.names[st.id] = 'Backyard';
  svc.push({ ID: 'K1', tempf: '61' });
  assert.equal(svc.list('imperial')[0].name, 'Backyard');
  assert.equal(svc.primary('imperial').current.temp, 61);
  now += 16 * 60_000;
  assert.equal(svc.primary('imperial'), null);
  assert.equal(svc.list('imperial')[0].stale, true);
});

test('push endpoint: LAN without a token, token required when set', async () => {
  const { app } = await testApp({ env: { AUTH_REQUIRED: 'true' } });
  // inject() comes from 127.0.0.1, which counts as the home network.
  const post = await app.inject({ method: 'POST', url: '/api/stations/push', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: ecowittBody });
  assert.equal(post.statusCode, 200);
  assert.equal(post.body, 'success');
  // Proxied requests are not trusted without a token.
  const proxied = await app.inject({ url: '/api/stations/push?ID=K1&tempf=50', headers: { 'x-forwarded-for': '192.168.1.5' } });
  assert.equal(proxied.statusCode, 401);
  // Reading stations still needs sign-in when AUTH_REQUIRED is on.
  assert.equal((await app.inject({ url: '/api/stations' })).statusCode, 401);
  await app.close();

  const t = await testApp({ env: { STATION_PUSH_TOKEN: 'sekrit-token' } });
  assert.equal((await t.app.inject({ url: '/api/stations/push?ID=K1&tempf=50' })).statusCode, 401);
  assert.equal((await t.app.inject({ url: '/api/stations/push/wrong?ID=K1&tempf=50' })).statusCode, 401);
  // Ambient glues its fields straight onto the path.
  const amb = await t.app.inject({ url: '/api/stations/push/sekrit-token&PASSKEY=AA&stationtype=AMBWeatherV4&tempf=72.5&humidity=40' });
  assert.equal(amb.statusCode, 200);
  const wu = await t.app.inject({ url: '/api/stations/push?ID=KTEST&PASSWORD=sekrit-token&tempf=40&windspeedmph=12' });
  assert.equal(wu.statusCode, 200);
  assert.equal((await t.app.inject({ url: '/api/stations/push/sekrit-token?nothing=1' })).statusCode, 400);

  const list = (await t.app.inject({ url: '/api/stations?units=metric' })).json();
  assert.equal(list.stations.length, 2);
  assert.equal(list.units.temp, '°C');
  const ambient = list.stations.find((s) => s.source === 'ambient');
  assert.equal(ambient.current.temp, 22.5);
  assert.ok(list.primary);
  await t.app.close();
});

test('the connected-app summary includes the home station', async () => {
  const { app } = await testApp();
  await app.inject({ url: '/api/stations/push?ID=K1&tempf=55&humidity=60' });
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'password123' } });
  const cookie = setup.headers['set-cookie'].split(';')[0];
  const { key } = (await app.inject({ method: 'POST', url: '/api/admin/app-keys', headers: { cookie }, payload: { name: 'HA' } })).json();
  const sum = (await app.inject({ url: '/api/connect/summary', headers: { authorization: `Bearer ${key}` } })).json();
  assert.equal(sum.station.current.temp, 55);
  const integ = (await app.inject({ url: '/api/admin/integrations', headers: { cookie } })).json();
  assert.equal(integ.homeAssistant.mqtt.enabled, false);
  assert.equal(integ.stations.stations.length, 1);
  await app.close();
});

class FakeMqtt extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.published = [];
    this.subs = [];
  }
  publish(topic, payload, opts) { this.published.push({ topic, payload, opts }); }
  subscribe(t) { this.subs.push(t); }
  end(force, opts, cb) { this.connected = false; cb?.(); }
}

test('MQTT: Home Assistant discovery, state, availability and station sensors', async () => {
  const fake = new FakeMqtt();
  let connectArgs;
  const { app } = await testApp({
    env: { MQTT_URL: 'mqtt://user:pw@broker.local:1883', MQTT_USERNAME: 'ha', MQTT_PASSWORD: 'pw' },
    mqttConnect: (url, opts) => { connectArgs = { url, opts }; return fake; },
  });
  const ha = app.homeAssistant;
  ha.start();
  assert.equal(connectArgs.opts.username, 'ha');
  assert.deepEqual(connectArgs.opts.will, { topic: 'weather_scout/status', payload: 'offline', retain: true, qos: 1 });

  app.stations.push({ ID: 'K1', tempf: '55', humidity: '60', dailyrainin: '0.2' });
  fake.connected = true;
  fake.emit('connect');
  await ha.publishAll();

  const topics = fake.published.map((p) => p.topic);
  assert.ok(topics.includes('weather_scout/status'));
  assert.deepEqual(fake.subs, ['homeassistant/status']);
  const temp = fake.published.find((p) => p.topic === 'homeassistant/sensor/weather_scout/home_temperature/config');
  const conf = JSON.parse(temp.payload);
  assert.equal(conf.state_topic, 'weather_scout/home/state');
  assert.equal(conf.unit_of_measurement, '°F');
  assert.equal(conf.device_class, 'temperature');
  assert.equal(conf.availability_topic, 'weather_scout/status');
  assert.equal(temp.opts.retain, true);
  assert.ok(topics.includes('homeassistant/binary_sensor/weather_scout/home_severe_warning/config'));
  const state = JSON.parse(fake.published.findLast((p) => p.topic === 'weather_scout/home/state').payload);
  assert.equal(state.temperature, 70);
  assert.equal(state.severe_warning, 'ON', 'the fake Tornado Warning counts');
  assert.equal(state.alert_count, 2);

  const stTopic = topics.find((t) => /^weather_scout\/station\/wunderground_[0-9a-f]+\/state$/.test(t));
  assert.ok(stTopic, 'station state is published');
  assert.ok(topics.some((t) => /station_wunderground_[0-9a-f]+_rain_today\/config$/.test(t)));
  assert.ok(!topics.some((t) => /station_.*_solar_radiation\/config$/.test(t)), 'sensors the station lacks are not announced');

  // Discovery is sent once, then again when Home Assistant restarts.
  const count = () => fake.published.filter((p) => p.topic.endsWith('home_temperature/config')).length;
  const before = count();
  await ha.publishAll();
  assert.equal(count(), before);
  fake.emit('message', 'homeassistant/status', Buffer.from('online'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(count(), before + 1);

  assert.equal(ha.status().mqtt.url, 'mqtt://broker.local:1883', 'credentials are not shown');
  await app.close();
  assert.equal(fake.published.at(-1).payload, 'offline');
});

test('Home Assistant REST sets sensor states with a token', async () => {
  const posts = [];
  const fetchImpl = mockFetch({
    'ha.local:8123/api/states/': async (url, opts) => {
      posts.push({ url, auth: opts.headers.authorization, body: JSON.parse(opts.body) });
      return new Response('{}', { status: 200 });
    },
  });
  const { app } = await testApp({ env: { HA_URL: 'http://ha.local:8123/', HA_TOKEN: 'llat' }, fetchImpl });
  await app.homeAssistant.publishAll();
  const t = posts.find((p) => p.url.endsWith('/api/states/sensor.weather_scout_home_temperature'));
  assert.equal(t.auth, 'Bearer llat');
  assert.equal(t.body.state, 70);
  assert.equal(t.body.attributes.unit_of_measurement, '°F');
  const w = posts.find((p) => p.url.endsWith('binary_sensor.weather_scout_home_severe_warning'));
  assert.equal(w.body.state, 'on');
  assert.equal(w.body.attributes.alerts.length, 2);
  assert.ok(app.homeAssistant.status().rest.lastPublishAt);
  await app.close();
});

test('homeState handles a quiet day', () => {
  const s = homeState({ forecast: { current: { temp: 60, label: 'Clear' }, daily: [] }, alerts: [] });
  assert.equal(s.severe_warning, 'OFF');
  assert.equal(s.top_alert, 'None');
  assert.equal(s.today_high, null);
});
