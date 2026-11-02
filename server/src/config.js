// Central configuration. Everything secret comes from the environment (or the
// /data volume), never from the repository. See .env.example for the full list.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || './data');
  const cfg = {
    port: num(env.PORT, 8080),
    host: env.HOST || '0.0.0.0',
    dataDir,
    webDist: path.resolve(env.WEB_DIST || new URL('../../web/dist', import.meta.url).pathname),
    defaultLocation: {
      name: env.DEFAULT_LOCATION_NAME || 'Richmond, VA',
      lat: num(env.DEFAULT_LAT, 37.5407),
      lon: num(env.DEFAULT_LON, -77.436),
    },
    units: env.DEFAULT_UNITS === 'metric' ? 'metric' : 'imperial',
    // NWS asks every client to send a User-Agent that identifies the app and a contact.
    nwsUserAgent: env.NWS_USER_AGENT || 'WeatherScout/0.1 (self-hosted; set NWS_USER_AGENT)',
    auth: {
      required: bool(env.AUTH_REQUIRED, false),
      trustProxyHeaders: bool(env.AUTH_TRUST_PROXY_HEADERS, false),
      userHeader: (env.AUTH_PROXY_USER_HEADER || 'remote-user').toLowerCase(),
      emailHeader: (env.AUTH_PROXY_EMAIL_HEADER || 'remote-email').toLowerCase(),
      nameHeader: (env.AUTH_PROXY_NAME_HEADER || 'remote-name').toLowerCase(),
      ssoLogoutUrl: env.SSO_LOGOUT_URL || '',
      autoCreateSsoUsers: bool(env.AUTH_AUTO_CREATE_SSO_USERS, true),
      adminUsername: env.ADMIN_USERNAME || '',
      adminPassword: env.ADMIN_PASSWORD || '',
      sessionDays: num(env.SESSION_DAYS, 30),
      secureCookies: bool(env.SECURE_COOKIES, false),
    },
    push: {
      enabled: bool(env.PUSH_ENABLED, true),
      pollSeconds: Math.max(60, num(env.PUSH_POLL_SECONDS, 120)),
    },
    // "Ask a weather expert" chat, cloud photo identifier and web search. Off without a key.
    ai: {
      // anthropic | ollama | off. Blank = whichever has a key/address (Claude first).
      provider: (env.AI_PROVIDER || '').toLowerCase(),
      apiKey: env.ANTHROPIC_API_KEY || '',
      ollama: {
        url: env.OLLAMA_URL || '',
        model: env.OLLAMA_MODEL || 'gemma3',
        visionModel: env.OLLAMA_VISION_MODEL || '',
        // Free ollama.com key, only for "Search the web" with Ollama.
        apiKey: env.OLLAMA_API_KEY || '',
      },
      model: env.AI_MODEL || 'claude-opus-5-5',
      webSearch: bool(env.AI_WEB_SEARCH, true),
      dailyLimit: Math.max(0, num(env.AI_DAILY_LIMIT, 40)),
    },
    // Kokoro text-to-speech (e.g. the Kokoro-FastAPI container) for read-aloud.
    tts: {
      url: (env.KOKORO_URL || '').replace(/\/+$/, ''),
      voice: env.KOKORO_VOICE || 'af_heart',
      speed: Math.min(2, Math.max(0.5, num(env.KOKORO_SPEED, 1))),
    },
    // Personal weather stations (Ecowitt, Ambient Weather, Tempest, Weather Underground protocol).
    stations: {
      // Needed in the push URL when uploads come through a reverse proxy or from outside
      // the home network. Without it, only direct LAN uploads are accepted.
      pushToken: env.STATION_PUSH_TOKEN || '',
      primary: env.STATION_PRIMARY || '',
      names: Object.fromEntries((env.STATION_NAMES || '').split(',').map((s) => s.split('=').map((x) => x.trim())).filter(([k, v]) => k && v)),
      pollSeconds: Math.max(60, num(env.STATION_POLL_SECONDS, 120)),
      ambient: { apiKey: env.AMBIENT_API_KEY || '', applicationKey: env.AMBIENT_APPLICATION_KEY || '' },
      tempest: {
        token: env.TEMPEST_TOKEN || '',
        stationIds: (env.TEMPEST_STATION_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
        // 50222 is the port Tempest hubs broadcast on. Needs host (or br0) networking in Docker.
        udpPort: bool(env.TEMPEST_UDP, false) ? num(env.TEMPEST_UDP_PORT, 50222) : 0,
        elevationM: env.STATION_ELEVATION_M === undefined || env.STATION_ELEVATION_M === '' ? null : num(env.STATION_ELEVATION_M, null),
      },
    },
    // Home Assistant: MQTT sensors with discovery, and/or direct REST state updates.
    homeAssistant: {
      mqttUrl: env.MQTT_URL || '',
      mqttUsername: env.MQTT_USERNAME || '',
      mqttPassword: env.MQTT_PASSWORD || '',
      topicPrefix: (env.MQTT_TOPIC_PREFIX || 'weather_scout').replace(/\/+$/, ''),
      discoveryPrefix: (env.MQTT_DISCOVERY_PREFIX || 'homeassistant').replace(/\/+$/, ''),
      restUrl: (env.HA_URL || '').replace(/\/+$/, ''),
      restToken: env.HA_TOKEN || '',
      publishSeconds: Math.max(60, num(env.HA_PUBLISH_SECONDS, 300)),
    },
    // Android app (Trusted Web Activity) link. Fingerprints come from the APK's
    // signing key; see docs/APPS.md. Comma-separated if you sign with more than one.
    android: {
      packageName: env.ANDROID_PACKAGE_NAME || 'app.weatherscout.android',
      certFingerprints: String(env.ANDROID_CERT_SHA256 || '').split(/[\s,]+/).map((f) => f.trim().toUpperCase()).filter(Boolean),
    },
    // Windy maps. Blank = the free Windy embed; a key turns on the Map Forecast API.
    windy: { mapKey: env.WINDY_MAP_KEY || '' },
    camerasFile: env.CAMERAS_FILE || path.join(dataDir, 'cameras.json'),
    env,
  };
  return cfg;
}

// A per-install secret used to sign session cookies. Generated on first start
// and stored in the data volume so it survives container upgrades.
export function loadOrCreateSecret(cfg) {
  if (cfg.env.SESSION_SECRET) return cfg.env.SESSION_SECRET;
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const file = path.join(cfg.dataDir, '.session-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
