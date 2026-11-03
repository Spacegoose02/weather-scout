// Settings an admin can change from Family & settings, so the Unraid template
// (or .env) only needs what must exist before the app starts. Saved values live
// in the database in the data volume, under the same names as the environment
// variables, and win over them; clearing one falls back to the env var (or the
// built-in default). Secrets are write-only: the API only says whether one is set
// and shows its last 4 characters.
//
// Kept in the environment on purpose (not editable here):
//   PORT, HOST, DATA_DIR, WEB_DIST - needed before the app can start or find its database.
//   ADMIN_USERNAME, ADMIN_PASSWORD - create the first admin, before anyone can sign in.
//   AUTH_REQUIRED, AUTH_TRUST_PROXY_HEADERS, AUTH_PROXY_*_HEADER, AUTH_AUTO_CREATE_SSO_USERS,
//   SECURE_COOKIES, SESSION_SECRET, SESSION_DAYS - decide who can reach this page at all and
//   depend on the reverse proxy; a wrong value saved in the app could lock everyone out or let
//   anyone in, with no way back except the container settings.
//   VAPID_* - generated on first start and kept in /data; changing them breaks every subscription.
//   CAMERA_FEEDS_JSON, CAMERAS_FILE, IP_LOCATION, CAMERA_RETRY_DELAY_MS - advanced/testing.
import { loadConfig } from './config.js';
import { CHASER_LIST } from './chasers.js';

const MODEL = /^[\w.:@/-]{1,100}$/;

// group: which part of the app it belongs to. Labels/help are what the admin page shows.
export const SETTINGS = [
  // ---- AI helper and read-aloud (own panel) ----
  { key: 'AI_PROVIDER', group: 'ai', options: ['', 'anthropic', 'ollama', 'off'] },
  { key: 'ANTHROPIC_API_KEY', group: 'ai', secret: true },
  { key: 'AI_MODEL', group: 'ai', pattern: MODEL },
  { key: 'OLLAMA_URL', group: 'ai', url: ['http:', 'https:'] },
  { key: 'OLLAMA_MODEL', group: 'ai', pattern: MODEL },
  { key: 'OLLAMA_VISION_MODEL', group: 'ai', pattern: MODEL },
  { key: 'OLLAMA_API_KEY', group: 'ai', secret: true },
  { key: 'AI_WEB_SEARCH', group: 'ai', options: ['true', 'false'] },
  { key: 'AI_DAILY_LIMIT', group: 'ai', range: [0, 99999], integer: true },
  { key: 'KOKORO_URL', group: 'ai', url: ['http:', 'https:'] },
  { key: 'KOKORO_VOICE', group: 'ai', pattern: /^[a-z]{2}_[a-z0-9]+(?:[+][a-z]{2}_[a-z0-9]+)*$/ },
  { key: 'KOKORO_SPEED', group: 'ai', range: [0.5, 2] },
  { key: 'KOKORO_FALLBACK', group: 'ai', options: ['browser', 'off'] },
  // Live storm chaser streams (shown in the AI panel, saved with it).
  { key: 'YOUTUBE_API_KEY', group: 'ai', secret: true },
  { key: 'STORM_CHASER_CHANNELS', group: 'ai', pattern: CHASER_LIST },
  { key: 'STORM_CHASER_SEARCH', group: 'ai', options: ['', 'true', 'false'] },

  // ---- home place ----
  { key: 'DEFAULT_LOCATION_NAME', group: 'home', label: 'Home name', placeholder: 'Richmond, VA', max: 80 },
  { key: 'DEFAULT_LAT', group: 'home', label: 'Latitude', range: [-90, 90], placeholder: '37.5407' },
  { key: 'DEFAULT_LON', group: 'home', label: 'Longitude', range: [-180, 180], placeholder: '-77.436' },
  { key: 'DEFAULT_UNITS', group: 'home', label: 'Units', options: ['imperial', 'metric'], choices: ['°F, mph, inches', '°C, km/h, mm'] },
  { key: 'NWS_USER_AGENT', group: 'home', label: 'Contact for the National Weather Service', placeholder: 'WeatherScout (you@example.com)', max: 200, help: 'NWS asks every app for a name and an email so they can reach you if something goes wrong.' },

  // ---- road cameras ----
  { key: 'CAMERAS_DEFAULT_FEEDS', group: 'cameras', label: 'Built-in camera feeds', placeholder: 'true', pattern: /^[\w\s,]{0,200}$/, help: 'true for all of them, false for none, or a list like va,md,nc.' },
  { key: 'NC_DRIVENC_API_KEY', group: 'cameras', label: 'North Carolina (DriveNC) key', secret: true, test: 'camera:nc', signup: 'https://www.drivenc.gov/developers/doc' },
  { key: 'NY511_API_KEY', group: 'cameras', label: 'New York (511NY) key', secret: true, test: 'camera:ny', signup: 'https://511ny.org/developers/doc' },
  { key: 'GA511_API_KEY', group: 'cameras', label: 'Georgia (511GA) key', secret: true, test: 'camera:ga', signup: 'https://511ga.org/developers/doc' },
  { key: 'OHGO_API_KEY', group: 'cameras', label: 'Ohio (OHGO) key', secret: true, test: 'camera:oh', signup: 'https://publicapi.ohgo.com/docs/registration' },

  // ---- maps ----
  { key: 'WINDY_MAP_KEY', group: 'maps', label: 'Windy Map Forecast key', secret: true, signup: 'https://api.windy.com/keys', help: 'Optional. Blank uses the free Windy embed.' },
  { key: 'WINDY_WEBCAMS_KEY', group: 'maps', label: 'Windy Webcams key', secret: true, test: 'webcams', signup: 'https://api.windy.com/keys', help: 'Optional, and a different key from the map one (pick Webcams API when you make it). Adds public webcams from around the world to the Radar & Cams map. Stays on the server.' },

  // ---- live lightning ----
  { key: 'LIGHTNING_GLM', group: 'lightning', label: 'NOAA GOES satellite lightning', options: ['true', 'false'], choices: ['On (free, no key)', 'Off'], help: 'Strikes across the Americas about a minute after they happen. Only downloaded (about 1 MB a minute) while someone is watching or a device has lightning alerts on.' },
  { key: 'LIGHTNING_GLM_SATELLITE', group: 'lightning', label: 'Satellite', options: ['goes19', 'goes18'], choices: ['GOES-East (most of the US)', 'GOES-West (Alaska, Hawaii, Pacific)'] },
  { key: 'LIGHTNING_BACKFILL_MIN', group: 'lightning', label: 'Minutes to load when the map opens', range: [0, 30], integer: true, placeholder: '10' },
  { key: 'BLITZORTUNG_ENABLED', group: 'lightning', label: 'Blitzortung.org ground sensors', options: ['false', 'true'], choices: ['Off', 'On (private, non-commercial use only)'], help: 'Faster and more precise volunteer network. Free only for private, non-commercial use, which fits a home server; credited on the map.', signup: 'https://www.blitzortung.org/en/cover_your_area.php' },

  // ---- weather stations ----
  { key: 'STATION_PUSH_TOKEN', group: 'stations', label: 'Station upload token', secret: true, pattern: /^[\w-]{0,100}$/, help: 'Needed when your station uploads through a reverse proxy or from outside your home network. Letters, numbers, - and _.' },
  { key: 'STATION_NAMES', group: 'stations', label: 'Station names', placeholder: 'ecowitt_1a2b3c4d=Backyard', max: 500, help: 'id=Name pairs, separated by commas.' },
  { key: 'STATION_PRIMARY', group: 'stations', label: 'Main station id', max: 100, help: 'Blank uses whichever reported last.' },
  { key: 'STATION_ELEVATION_M', group: 'stations', label: 'Station elevation (meters)', range: [-500, 9000], help: 'For Tempest pressure. Blank asks Tempest.' },
  { key: 'STATION_POLL_SECONDS', group: 'stations', label: 'Cloud check interval (seconds)', range: [60, 86400], integer: true, placeholder: '120' },
  { key: 'AMBIENT_API_KEY', group: 'stations', label: 'Ambient Weather API key', secret: true, test: 'ambient' },
  { key: 'AMBIENT_APPLICATION_KEY', group: 'stations', label: 'Ambient Weather application key', secret: true, test: 'ambient' },
  { key: 'TEMPEST_TOKEN', group: 'stations', label: 'Tempest token', secret: true, test: 'tempest', signup: 'https://tempestwx.com/settings/tokens' },
  { key: 'TEMPEST_STATION_IDS', group: 'stations', label: 'Tempest station ids', placeholder: 'all on the account', pattern: /^[\d\s,]{0,200}$/ },
  { key: 'TEMPEST_UDP', group: 'stations', label: 'Listen for a Tempest hub on the home network', options: ['false', 'true'], choices: ['Off', 'On (needs host or br0 networking)'] },
  { key: 'TEMPEST_UDP_PORT', group: 'stations', label: 'Tempest UDP port', range: [1, 65535], integer: true, placeholder: '50222' },

  // ---- Home Assistant ----
  { key: 'MQTT_URL', group: 'homeassistant', label: 'MQTT broker', url: ['mqtt:', 'mqtts:', 'ws:', 'wss:'], placeholder: 'mqtt://192.168.1.10:1883', test: 'mqtt' },
  { key: 'MQTT_USERNAME', group: 'homeassistant', label: 'MQTT username', max: 200 },
  { key: 'MQTT_PASSWORD', group: 'homeassistant', label: 'MQTT password', secret: true },
  { key: 'MQTT_TOPIC_PREFIX', group: 'homeassistant', label: 'MQTT topic prefix', placeholder: 'weather_scout', pattern: /^[\w/-]{0,100}$/ },
  { key: 'MQTT_DISCOVERY_PREFIX', group: 'homeassistant', label: 'Discovery prefix', placeholder: 'homeassistant', pattern: /^[\w/-]{0,100}$/ },
  { key: 'HA_URL', group: 'homeassistant', label: 'Home Assistant address (REST)', url: ['http:', 'https:'], placeholder: 'http://192.168.1.10:8123', test: 'homeassistant' },
  { key: 'HA_TOKEN', group: 'homeassistant', label: 'Home Assistant long-lived token', secret: true, test: 'homeassistant' },
  { key: 'HA_PUBLISH_SECONDS', group: 'homeassistant', label: 'Send every (seconds)', range: [60, 86400], integer: true, placeholder: '300' },

  // ---- alerts, sign-in and apps ----
  { key: 'PUSH_ENABLED', group: 'apps', label: 'Severe weather push alerts', options: ['true', 'false'], choices: ['On', 'Off'] },
  { key: 'PUSH_POLL_SECONDS', group: 'apps', label: 'Check alerts every (seconds)', range: [60, 3600], integer: true, placeholder: '120' },
  { key: 'SSO_LOGOUT_URL', group: 'apps', label: 'SSO sign-out address', url: ['http:', 'https:'], placeholder: 'https://auth.example.com/logout', help: 'Where Sign out sends people when they signed in through tinyauth or another SSO.' },
  { key: 'ANDROID_CERT_SHA256', group: 'apps', label: 'Android app fingerprint (SHA-256)', pattern: /^[\s,:0-9A-Fa-f]{0,800}$/, help: 'From the APK signing key, so the Android app opens full screen. See docs/APPS.md.' },
  { key: 'ANDROID_PACKAGE_NAME', group: 'apps', label: 'Android package name', placeholder: 'app.weatherscout.android', pattern: /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/ },
];
const BY_KEY = new Map(SETTINGS.map((f) => [f.key, f]));
export const settingOf = (key) => BY_KEY.get(key);

export class SettingsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function validate(key, raw) {
  const f = BY_KEY.get(key);
  if (!f) throw new SettingsError(`Unknown setting ${key}.`);
  const name = f.label || key;
  const v = String(raw ?? '').trim();
  if (v.length > (f.max || 500)) throw new SettingsError(`${name} is too long.`);
  if (f.options) {
    if (!f.options.includes(v.toLowerCase())) throw new SettingsError(`${name} must be one of: ${f.options.filter(Boolean).join(', ')}.`);
    return v.toLowerCase();
  }
  if (!v) return v;
  if (f.pattern && !f.pattern.test(v)) throw new SettingsError(`${name} doesn't look right.`);
  if (f.range) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < f.range[0] || n > f.range[1] || (f.integer && !Number.isInteger(n))) {
      throw new SettingsError(`${name} must be ${f.integer ? 'a whole number ' : ''}between ${f.range[0]} and ${f.range[1]}.`);
    }
  }
  if (f.url) {
    let u;
    try {
      u = new URL(v);
    } catch {
      throw new SettingsError(`${name} must be a full address like ${f.placeholder || 'http://192.168.1.20:8080'}`);
    }
    if (!f.url.includes(u.protocol)) throw new SettingsError(`${name} must start with ${f.url.map((p) => `${p}//`).join(' or ')}`);
    if ((u.username || u.password) && f.url.includes('http:')) throw new SettingsError(`${name} can't include a username or password.`);
  }
  return v;
}

// The parts of the live config that saved settings can change. Services keep
// references to these objects, so they are updated in place.
const LIVE_OBJECTS = ['ai', 'tts', 'youtube', 'defaultLocation', 'windy', 'android', 'stations', 'homeAssistant', 'push', 'lightning'];

export class Settings {
  constructor(db, cfg) {
    this.db = db;
    this.cfg = cfg;
    // What the container was started with, before anything saved here.
    this.baseEnv = { ...cfg.env };
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
    this.listeners = [];
  }

  saved() {
    const out = {};
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) if (BY_KEY.has(r.key)) out[r.key] = r.value;
    return out;
  }

  // The env plus saved values (plus any unsaved form values), parsed like a fresh start.
  merged(extra = {}) {
    return loadConfig({ ...this.baseEnv, ...this.saved(), ...extra });
  }

  // Push the saved values into the live config, then tell the services.
  apply() {
    const before = this.snapshot();
    const m = this.merged();
    for (const k of LIVE_OBJECTS) Object.assign(this.cfg[k], m[k]);
    this.cfg.units = m.units;
    this.cfg.nwsUserAgent = m.nwsUserAgent;
    this.cfg.auth.ssoLogoutUrl = m.auth.ssoLogoutUrl;
    this.cfg.env = m.env; // camera keys are read from here
    const after = this.snapshot();
    const changed = new Set(Object.keys(after).filter((g) => JSON.stringify(after[g]) !== JSON.stringify(before[g])));
    for (const fn of this.listeners) fn(changed);
  }

  // Values per group, to tell listeners which parts changed.
  snapshot() {
    const env = this.cfg.env;
    const out = {};
    for (const f of SETTINGS) (out[f.group] ||= {})[f.key] = env[f.key] ?? '';
    return out;
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  // What the admin page shows. Secrets only say whether they're set.
  view(group) {
    const saved = this.saved();
    const env = this.baseEnv;
    return SETTINGS.filter((f) => !group || (Array.isArray(group) ? group.includes(f.group) : f.group === group)).map((f) => {
      const { key, secret } = f;
      const envSet = env[key] !== undefined && env[key] !== '';
      const source = key in saved ? 'saved' : envSet ? 'env' : 'default';
      const value = saved[key] ?? (envSet ? env[key] : '');
      const row = { key, group: f.group, secret: !!secret, source, envSet };
      for (const p of ['label', 'help', 'placeholder', 'options', 'choices', 'signup', 'test']) if (f[p] !== undefined) row[p] = f[p];
      if (f.range) row.type = 'number';
      if (f.url) row.type = 'url';
      if (secret) return { ...row, set: !!value, hint: value ? value.slice(-4) : '' };
      return { ...row, value };
    });
  }

  // values: { KEY: string } saves; { KEY: null } clears back to the env/default.
  // A blank secret clears the saved one too; leaving a secret out keeps it.
  update(values, { only } = {}) {
    if (!values || typeof values !== 'object') throw new SettingsError('Nothing to save.');
    const writes = Object.entries(values).map(([k, v]) => {
      const f = BY_KEY.get(k);
      if (!f || (only && !only.includes(f.group))) throw new SettingsError(`Unknown setting ${k}.`);
      if (v === null || (f.secret && String(v).trim() === '')) return [k, null];
      return [k, validate(k, v)];
    });
    const put = this.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    const del = this.db.prepare('DELETE FROM settings WHERE key = ?');
    this.db.exec('BEGIN');
    try {
      for (const [k, v] of writes) (v === null ? del.run(k) : put.run(k, v));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.apply();
  }

  // Form values the admin hasn't saved yet, for Test and Preview. Blank secrets mean "use the saved one".
  draft(values = {}) {
    const extra = {};
    for (const [k, v] of Object.entries(values || {})) {
      if (v === null || v === undefined) continue;
      if (BY_KEY.get(k)?.secret && String(v).trim() === '') continue;
      extra[k] = validate(k, v);
    }
    return this.merged(extra);
  }
}
