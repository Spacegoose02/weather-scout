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
