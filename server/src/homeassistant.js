// Home Assistant integration.
//
// MQTT (recommended): publishes the home forecast, NWS alerts, Rocky's checklist and
// every personal weather station as MQTT sensors, with Home Assistant MQTT discovery
// so they show up as devices without any YAML. Retained, with an availability topic.
//
// REST (no MQTT broker): sets the same sensors straight in Home Assistant through its
// REST API with a long-lived access token. Home Assistant forgets these states when
// it restarts, and they come back on the next publish.
import mqtt from 'mqtt';
import { alertLevel } from './push.js';
import { unitsFor } from './stations.js';

const textState = (s) => (s == null ? null : String(s).slice(0, 250));

// What Home Assistant gets for the home location.
export function homeState({ forecast: fc, alerts = [], air, kid }) {
  const c = fc.current || {};
  const today = fc.daily?.[0] || {};
  const warnings = alerts.filter((a) => alertLevel(a) === 'warning');
  const top = warnings[0] || alerts[0];
  return {
    temperature: c.temp ?? null,
    feels_like: c.feelsLike ?? null,
    humidity: c.humidity ?? null,
    dew_point: c.dewPoint ?? null,
    pressure: c.pressure ?? null,
    wind_speed: c.windSpeed ?? null,
    wind_gust: c.windGust ?? null,
    wind_direction: c.windDir ?? null,
    uv_index: c.uv ?? null,
    cloud_cover: c.cloudCover ?? null,
    condition: textState(c.label),
    kid_condition: textState(c.kidLabel),
    icon: c.icon ?? null,
    today_high: today.high ?? null,
    today_low: today.low ?? null,
    rain_chance_today: today.precipChance ?? null,
    air_quality: air?.aqi ?? null,
    air_quality_label: textState(air?.category?.label),
    alert_count: alerts.length,
    top_alert: textState(top?.event || 'None'),
    severe_warning: warnings.length ? 'ON' : 'OFF',
    recess: kid?.playground?.rating ?? null,
    rocky_outfit: textState((kid?.checklist || []).map((i) => i.label).join(', ') || 'Nothing special'),
  };
}

export function homeAttributes({ alerts = [], kid }) {
  return {
    alerts: alerts.map((a) => ({ event: a.event, severity: a.severity, level: alertLevel(a), headline: a.headline, kid: a.kid, ends: a.ends })),
    recess_reasons: kid?.playground?.reasons || [],
    checklist: (kid?.checklist || []).map((i) => ({ label: i.label, why: i.why })),
  };
}

export function stationState(st) {
  const c = st.current;
  return {
    temperature: c.temp, feels_like: c.feelsLike, humidity: c.humidity, dew_point: c.dewPoint,
    wind_speed: c.windSpeed, wind_gust: c.windGust, wind_direction: c.windDir, pressure: c.pressure,
    rain_rate: c.rainRate, rain_today: c.rainToday, uv_index: c.uv, solar_radiation: c.solar,
    lightning_count: c.lightning?.count ?? null, lightning_distance: c.lightning?.distance ?? null,
    indoor_temperature: c.indoor?.temp ?? null, indoor_humidity: c.indoor?.humidity ?? null,
    updated: st.updatedAt,
  };
}

// Sensor definitions: key in the state JSON, display name, unit and HA classes.
const M = 'measurement';
export function homeSensors(u) {
  return [
    { key: 'temperature', name: 'Temperature', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'feels_like', name: 'Feels like', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'humidity', name: 'Humidity', unit: '%', dc: 'humidity', sc: M },
    { key: 'dew_point', name: 'Dew point', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'pressure', name: 'Pressure', unit: 'hPa', dc: 'atmospheric_pressure', sc: M },
    { key: 'wind_speed', name: 'Wind speed', unit: u.wind, dc: 'wind_speed', sc: M },
    { key: 'wind_gust', name: 'Wind gust', unit: u.wind, dc: 'wind_speed', sc: M },
    { key: 'wind_direction', name: 'Wind direction', unit: '°', icon: 'mdi:compass-outline' },
    { key: 'uv_index', name: 'UV index', icon: 'mdi:weather-sunny-alert', sc: M },
    { key: 'cloud_cover', name: 'Cloud cover', unit: '%', icon: 'mdi:cloud-percent', sc: M },
    { key: 'condition', name: 'Condition', icon: 'mdi:weather-partly-cloudy' },
    { key: 'kid_condition', name: 'Rocky says', icon: 'mdi:emoticon-happy-outline' },
    { key: 'today_high', name: 'High today', unit: u.temp, dc: 'temperature' },
    { key: 'today_low', name: 'Low today', unit: u.temp, dc: 'temperature' },
    { key: 'rain_chance_today', name: 'Rain chance today', unit: '%', icon: 'mdi:umbrella-outline' },
    { key: 'air_quality', name: 'Air quality index', dc: 'aqi', sc: M },
    { key: 'alert_count', name: 'Weather alerts', icon: 'mdi:alert-outline', attrs: true },
    { key: 'top_alert', name: 'Top weather alert', icon: 'mdi:alert', attrs: true },
    { key: 'recess', name: 'Recess check', icon: 'mdi:slide', attrs: true },
    { key: 'rocky_outfit', name: 'What to wear', icon: 'mdi:tshirt-crew-outline', attrs: true },
    { key: 'severe_warning', name: 'Severe weather warning', component: 'binary_sensor', dc: 'safety', attrs: true },
  ];
}

export function stationSensors(u) {
  return [
    { key: 'temperature', name: 'Temperature', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'feels_like', name: 'Feels like', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'humidity', name: 'Humidity', unit: '%', dc: 'humidity', sc: M },
    { key: 'dew_point', name: 'Dew point', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'wind_speed', name: 'Wind speed', unit: u.wind, dc: 'wind_speed', sc: M },
    { key: 'wind_gust', name: 'Wind gust', unit: u.wind, dc: 'wind_speed', sc: M },
    { key: 'wind_direction', name: 'Wind direction', unit: '°', icon: 'mdi:compass-outline' },
    { key: 'pressure', name: 'Pressure', unit: 'hPa', dc: 'atmospheric_pressure', sc: M },
    { key: 'rain_rate', name: 'Rain rate', unit: u.rate, dc: 'precipitation_intensity', sc: M },
    { key: 'rain_today', name: 'Rain today', unit: u.precip, dc: 'precipitation', sc: 'total_increasing' },
    { key: 'uv_index', name: 'UV index', icon: 'mdi:weather-sunny-alert', sc: M },
    { key: 'solar_radiation', name: 'Solar radiation', unit: 'W/m²', dc: 'irradiance', sc: M },
    { key: 'lightning_count', name: 'Lightning strikes', icon: 'mdi:flash' },
    { key: 'lightning_distance', name: 'Lightning distance', unit: u.distance, dc: 'distance' },
    { key: 'indoor_temperature', name: 'Indoor temperature', unit: u.temp, dc: 'temperature', sc: M },
    { key: 'indoor_humidity', name: 'Indoor humidity', unit: '%', dc: 'humidity', sc: M },
  ];
}

const cleanId = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_');

export class HomeAssistantService {
  // snapshot(): resolves to { forecast, alerts, air, kid } for the home location.
  constructor(cfg, { stations, snapshot, fetchImpl = fetch, log = console, connect = mqtt.connect, version = '0.1.0' } = {}) {
    this.ha = cfg.homeAssistant;
    this.units = cfg.units;
    this.u = unitsFor(cfg.units);
    this.home = cfg.defaultLocation;
    this.stations = stations;
    this.snapshot = snapshot;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.connectImpl = connect;
    this.version = version;
    this.prefix = this.ha.topicPrefix;
    this.disc = this.ha.discoveryPrefix;
    this.announced = new Set();
    this.lastStationPublish = new Map();
    this.state = { mqtt: { connected: false, lastPublishAt: null, lastError: null }, rest: { lastPublishAt: null, lastError: null } };
  }

  get mqttEnabled() {
    return !!this.ha.mqttUrl;
  }

  get restEnabled() {
    return !!(this.ha.restUrl && this.ha.restToken);
  }

  get enabled() {
    return this.mqttEnabled || this.restEnabled;
  }

  get availability() {
    return `${this.prefix}/status`;
  }

  device(id, name, model) {
    return { identifiers: [id], name, manufacturer: 'Weather Scout', model, sw_version: this.version };
  }

  // ---- MQTT ---------------------------------------------------------------------
  publish(topic, payload, retain = true) {
    if (!this.client?.connected) return;
    this.client.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), { retain, qos: 0 });
  }

  discoveryConfigs(objId, deviceInfo, sensors, stateTopic, attrTopic, values) {
    return sensors
      .filter((s) => values[s.key] != null)
      .map((s) => {
        const component = s.component || 'sensor';
        const uid = `weather_scout_${objId}_${s.key}`;
        const conf = {
          name: s.name,
          unique_id: uid,
          default_entity_id: `${component}.${uid}`,
          state_topic: stateTopic,
          value_template: `{{ value_json.${s.key} }}`,
          availability_topic: this.availability,
          device: deviceInfo,
        };
        if (s.unit) conf.unit_of_measurement = s.unit;
        if (s.dc) conf.device_class = s.dc;
        if (s.sc) conf.state_class = s.sc;
        if (s.icon) conf.icon = s.icon;
        if (s.attrs && attrTopic) conf.json_attributes_topic = attrTopic;
        if (component === 'binary_sensor') Object.assign(conf, { payload_on: 'ON', payload_off: 'OFF' });
        return { topic: `${this.disc}/${component}/weather_scout/${objId}_${s.key}/config`, conf, uid };
      });
  }

  announce(configs) {
    for (const c of configs) {
      if (this.announced.has(c.uid)) continue;
      this.publish(c.topic, c.conf);
      this.announced.add(c.uid);
    }
  }

  startMqtt() {
    const opts = {
      clientId: `weather-scout-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 15_000,
      connectTimeout: 15_000,
      will: { topic: this.availability, payload: 'offline', retain: true, qos: 1 },
    };
    if (this.ha.mqttUsername) opts.username = this.ha.mqttUsername;
    if (this.ha.mqttPassword) opts.password = this.ha.mqttPassword;
    this.client = this.connectImpl(this.ha.mqttUrl, opts);
    this.client.on('connect', () => {
      this.state.mqtt.connected = true;
      this.state.mqtt.lastError = null;
      this.announced.clear();
      this.publish(this.availability, 'online');
      // Home Assistant sends "online" here when it restarts: announce everything again.
      this.client.subscribe(`${this.disc}/status`);
      this.publishAll().catch(() => {});
    });
    this.client.on('message', (topic, payload) => {
      if (topic === `${this.disc}/status` && String(payload) === 'online') {
        this.announced.clear();
        this.publishAll().catch(() => {});
      }
    });
    this.client.on('close', () => { this.state.mqtt.connected = false; });
    this.client.on('error', (err) => {
      this.state.mqtt.lastError = err.message;
      this.log.warn?.({ err: err.message }, 'MQTT error');
    });
  }

  mqttHome(snap) {
    const values = homeState(snap);
    const stateTopic = `${this.prefix}/home/state`;
    const attrTopic = `${this.prefix}/home/attributes`;
    const dev = this.device('weather_scout_home', `Weather Scout (${this.home.name})`, 'Forecast, NWS alerts and Kid Zone');
    this.announce(this.discoveryConfigs('home', dev, homeSensors(this.u), stateTopic, attrTopic, values));
    this.publish(stateTopic, values);
    this.publish(attrTopic, homeAttributes(snap));
  }

  mqttStation(st) {
    const id = cleanId(st.id);
    const values = stationState(st);
    const stateTopic = `${this.prefix}/station/${id}/state`;
    const dev = this.device(`weather_scout_station_${id}`, st.name, st.model || st.sourceLabel);
    this.announce(this.discoveryConfigs(`station_${id}`, dev, stationSensors(this.u), stateTopic, null, values));
    this.publish(stateTopic, values);
  }

  // ---- REST ---------------------------------------------------------------------
  async restSet(entity, state, attributes) {
    const res = await this.fetchImpl(`${this.ha.restUrl}/api/states/${entity}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.ha.restToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state: state ?? 'unknown', attributes }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
  }

  async restSensors(objId, deviceName, sensors, values, extraAttrs = {}) {
    for (const s of sensors) {
      if (values[s.key] == null) continue;
      const domain = s.component === 'binary_sensor' ? 'binary_sensor' : 'sensor';
      const state = domain === 'binary_sensor' ? (values[s.key] === 'ON' ? 'on' : 'off') : values[s.key];
      const attributes = { friendly_name: `${deviceName} ${s.name}`, attribution: 'Weather Scout' };
      if (s.unit) attributes.unit_of_measurement = s.unit;
      if (s.dc) attributes.device_class = s.dc;
      if (s.sc) attributes.state_class = s.sc;
      if (s.icon) attributes.icon = s.icon;
      if (s.attrs) Object.assign(attributes, extraAttrs);
      await this.restSet(`${domain}.weather_scout_${objId}_${s.key}`, state, attributes);
    }
  }

  async restAll(snap) {
    try {
      if (snap) await this.restSensors('home', 'Weather Scout', homeSensors(this.u), homeState(snap), homeAttributes(snap));
      for (const st of this.stations?.list(this.units) || []) {
        if (!st.stale) await this.restSensors(`station_${cleanId(st.id)}`, st.name, stationSensors(this.u), stationState(st));
      }
      this.state.rest.lastPublishAt = new Date().toISOString();
      this.state.rest.lastError = null;
    } catch (err) {
      this.state.rest.lastError = err.message;
      this.log.warn?.({ err: err.message }, 'Home Assistant REST publish failed');
    }
  }

  // ---- loop ---------------------------------------------------------------------
  async publishAll() {
    let snap = null;
    try {
      snap = await this.snapshot();
    } catch (err) {
      this.log.warn?.({ err: err.message }, 'Home Assistant: could not get the forecast');
    }
    if (this.client?.connected) {
      if (snap) this.mqttHome(snap);
      for (const st of this.stations?.list(this.units) || []) if (!st.stale) this.mqttStation(st);
      this.state.mqtt.lastPublishAt = new Date().toISOString();
    }
    if (this.restEnabled) await this.restAll(snap);
  }

  // New station readings go to MQTT right away, at most every 30 seconds per station.
  stationUpdated(id) {
    if (!this.client?.connected) return;
    const last = this.lastStationPublish.get(id) || 0;
    if (Date.now() - last < 30_000) return;
    this.lastStationPublish.set(id, Date.now());
    const st = this.stations.list(this.units).find((s) => s.id === id);
    if (st) this.mqttStation(st);
  }

  start() {
    if (!this.enabled) return;
    if (this.mqttEnabled) this.startMqtt();
    this.unsubscribe = this.stations?.onReading((st) => this.stationUpdated(st.id));
    const run = () => this.publishAll().catch((err) => this.log.warn?.({ err: err.message }, 'Home Assistant publish failed'));
    if (!this.mqttEnabled) setTimeout(run, 5000).unref?.();
    this.timer = setInterval(run, this.ha.publishSeconds * 1000);
    this.timer.unref?.();
  }

  async stop() {
    clearInterval(this.timer);
    this.unsubscribe?.();
    if (this.client) {
      this.publish(this.availability, 'offline');
      await new Promise((resolve) => this.client.end(false, {}, resolve));
    }
  }

  status() {
    const safeUrl = (u) => {
      try {
        const x = new URL(u);
        x.username = '';
        x.password = '';
        return x.toString().replace(/\/$/, '');
      } catch {
        return u;
      }
    };
    return {
      mqtt: { enabled: this.mqttEnabled, url: this.mqttEnabled ? safeUrl(this.ha.mqttUrl) : null, topicPrefix: this.prefix, discoveryPrefix: this.disc, ...this.state.mqtt },
      rest: { enabled: this.restEnabled, url: this.restEnabled ? this.ha.restUrl : null, ...this.state.rest },
      publishSeconds: this.ha.publishSeconds,
    };
  }
}
