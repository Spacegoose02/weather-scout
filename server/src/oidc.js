// Sign in with OpenID Connect: Tinyauth, Authelia, Authentik, Pocket ID, Google…
// An admin adds providers in Family & settings. Each one gets a "Sign in with …"
// button. We use the authorization code flow with PKCE, swap the code for an ID
// token on the back channel and check its signature, issuer, audience, expiry
// and nonce before trusting anything in it.
//
// This works next to the tinyauth forward-auth headers (AUTH_TRUST_PROXY_HEADERS)
// and local passwords; any of them can be used.
import crypto from 'node:crypto';
import { AuthError } from './auth.js';

export const OIDC_COOKIE = 'ws_oidc';
export const CALLBACK_PATH = '/api/auth/oidc/callback';
const DISCOVERY_TTL = 60 * 60_000;
const FLOW_TTL = 10 * 60_000;
const BASE_SCOPES = ['openid', 'profile', 'email'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oidc_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL DEFAULT '',
  scopes TEXT NOT NULL DEFAULT '',
  auto_create INTEGER NOT NULL DEFAULT 0,
  show_on_login INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oidc_identities (
  provider_id INTEGER NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider_id, subject)
);
CREATE INDEX IF NOT EXISTS oidc_identities_user ON oidc_identities(user_id);
`;

const bad = (msg, status = 400) => new AuthError(status, msg);

export function cleanIssuer(raw) {
  const s = String(raw ?? '').trim().replace(/\/+$/, '');
  let u;
  try {
    u = new URL(s);
  } catch {
    throw bad('The issuer URL should look like https://auth.example.com');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad('The issuer URL should start with https://');
  if (u.username || u.password || u.search || u.hash) throw bad('The issuer URL should be just the address, like https://auth.example.com');
  return s;
}

// Extra scopes beyond openid/profile/email, as a clean space-separated string.
export function cleanScopes(raw) {
  const list = String(raw ?? '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  for (const s of list) if (!/^[\x21\x23-\x5b\x5d-\x7e]{1,80}$/.test(s)) throw bad(`"${s}" is not a valid scope.`);
  return [...new Set(list.filter((s) => !BASE_SCOPES.includes(s)))].join(' ');
}

function publicProvider(row) {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    clientId: row.client_id,
    hasSecret: !!row.client_secret, // the secret itself never leaves the server
    scopes: row.scopes,
    autoCreate: !!row.auto_create,
    showOnLogin: !!row.show_on_login,
  };
}

// ---- JWT checks -------------------------------------------------------------
const ALGS = {
  RS256: { hash: 'sha256', kty: 'RSA' }, RS384: { hash: 'sha384', kty: 'RSA' }, RS512: { hash: 'sha512', kty: 'RSA' },
  PS256: { hash: 'sha256', kty: 'RSA', pss: true }, PS384: { hash: 'sha384', kty: 'RSA', pss: true }, PS512: { hash: 'sha512', kty: 'RSA', pss: true },
  ES256: { hash: 'sha256', kty: 'EC' }, ES384: { hash: 'sha384', kty: 'EC' }, ES512: { hash: 'sha512', kty: 'EC' },
  EdDSA: { hash: null, kty: 'OKP' },
  HS256: { hmac: 'sha256' }, HS384: { hmac: 'sha384' }, HS512: { hmac: 'sha512' },
};

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw bad('The sign-in provider sent a token we could not read.', 502);
  }
}

export function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw bad('The sign-in provider sent a token we could not read.', 502);
  return { header: decodePart(parts[0]), payload: decodePart(parts[1]), signed: `${parts[0]}.${parts[1]}`, sig: Buffer.from(parts[2], 'base64url') };
}

function verifySignature({ header, signed, sig }, { keys, secret }) {
  const alg = ALGS[header.alg];
  if (!alg) throw bad(`The sign-in provider signs tokens with ${header.alg || 'no algorithm'}, which Weather Scout does not accept.`, 502);
  if (alg.hmac) {
    if (!secret) throw bad('The provider signs tokens with the client secret, but none is saved.', 502);
    const expected = crypto.createHmac(alg.hmac, secret).update(signed).digest();
    return expected.length === sig.length && crypto.timingSafeEqual(expected, sig);
  }
  const candidates = keys.filter((k) => k.kty === alg.kty && (!header.kid || k.kid === header.kid) && (!k.use || k.use === 'sig'));
  for (const jwk of candidates) {
    let key;
    try {
      key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } catch {
      continue;
    }
    const opts = { key };
    if (alg.pss) Object.assign(opts, { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
    if (alg.kty === 'EC') opts.dsaEncoding = 'ieee-p1363';
    if (crypto.verify(alg.hash, Buffer.from(signed), opts, sig)) return true;
  }
  return false;
}

export function checkClaims(payload, { issuer, clientId, nonce, now = Date.now() }) {
  const skew = 120;
  const t = Math.floor(now / 1000);
  if (String(payload.iss || '').replace(/\/+$/, '') !== issuer) throw bad('The sign-in token came from a different issuer than the one set up.', 502);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw bad('The sign-in token was made for a different client ID.', 502);
  if (aud.length > 1 && payload.azp && payload.azp !== clientId) throw bad('The sign-in token was made for a different client ID.', 502);
  if (typeof payload.exp !== 'number' || payload.exp + skew < t) throw bad('The sign-in token has expired. Try again.', 502);
  if (typeof payload.iat === 'number' && payload.iat - skew > t) throw bad('The sign-in token is from the future. Check the server clocks.', 502);
  if (payload.nonce !== nonce) throw bad('The sign-in token did not match this sign-in. Try again.', 502);
  if (!payload.sub) throw bad('The sign-in provider did not say who you are.', 502);
}

// The name someone has at the provider, for showing which account is linked.
function handleOf(claims) {
  return [claims.preferred_username, claims.email, claims.name].find((x) => typeof x === 'string' && x.trim())?.trim() || '';
}

// ---- service ----------------------------------------------------------------
export class OidcService {
  constructor(db, cfg, { fetchImpl = fetch, auth }) {
    this.db = db;
    this.cfg = cfg;
    this.fetch = fetchImpl;
    this.auth = auth;
    this.discovery = new Map(); // issuer -> { at, doc, keys, keysAt }
    db.exec(SCHEMA);
    // v0.14 tables had no label column: the name the person has at the provider.
    const cols = new Set(db.prepare('PRAGMA table_info(oidc_identities)').all().map((c) => c.name));
    if (!cols.has('label')) db.exec("ALTER TABLE oidc_identities ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  }

  row(id) {
    return this.db.prepare('SELECT * FROM oidc_providers WHERE id = ?').get(Number(id));
  }

  list() {
    return this.db.prepare('SELECT * FROM oidc_providers ORDER BY name COLLATE NOCASE, id').all().map(publicProvider);
  }

  // The buttons on the sign-in page.
  buttons() {
    return this.db.prepare('SELECT id, name FROM oidc_providers WHERE show_on_login = 1 ORDER BY name COLLATE NOCASE, id').all()
      .map((r) => ({ id: r.id, name: r.name }));
  }

  clean(body, existing) {
    const out = {};
    if (body.name !== undefined || !existing) {
      out.name = String(body.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!out.name) throw bad('Give the sign-in button a name.');
    }
    if (body.issuer !== undefined || !existing) out.issuer = cleanIssuer(body.issuer);
    if (body.clientId !== undefined || !existing) {
      out.clientId = String(body.clientId ?? '').trim();
      if (!out.clientId || out.clientId.length > 300) throw bad('Add the client ID from your sign-in provider.');
    }
    // Empty secret on an edit keeps the saved one; null clears it (public clients).
    if (body.clientSecret === null) out.clientSecret = '';
    else if (typeof body.clientSecret === 'string' && body.clientSecret.trim()) {
      out.clientSecret = body.clientSecret.trim();
      if (out.clientSecret.length > 500) throw bad('That client secret is too long.');
    }
    if (body.scopes !== undefined) out.scopes = cleanScopes(body.scopes);
    if (body.autoCreate !== undefined) out.autoCreate = body.autoCreate ? 1 : 0;
    if (body.showOnLogin !== undefined) out.showOnLogin = body.showOnLogin ? 1 : 0;
    return out;
  }

  async create(body) {
    const c = this.clean(body, null);
    await this.discover(c.issuer, { fresh: true });
    const info = this.db.prepare(
      'INSERT INTO oidc_providers (name, issuer, client_id, client_secret, scopes, auto_create, show_on_login) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(c.name, c.issuer, c.clientId, c.clientSecret || '', c.scopes || '', c.autoCreate ?? 0, c.showOnLogin ?? 1);
    return publicProvider(this.row(info.lastInsertRowid));
  }

  async update(id, body) {
    const row = this.row(id);
    if (!row) throw bad('No such sign-in provider.', 404);
    const c = this.clean(body, row);
    if (c.issuer && c.issuer !== row.issuer) await this.discover(c.issuer, { fresh: true });
    const cols = { name: 'name', issuer: 'issuer', clientId: 'client_id', clientSecret: 'client_secret', scopes: 'scopes', autoCreate: 'auto_create', showOnLogin: 'show_on_login' };
    for (const [k, col] of Object.entries(cols)) {
      if (c[k] !== undefined) this.db.prepare(`UPDATE oidc_providers SET ${col} = ? WHERE id = ?`).run(c[k], row.id);
    }
    return publicProvider(this.row(row.id));
  }

  remove(id) {
    const info = this.db.prepare('DELETE FROM oidc_providers WHERE id = ?').run(Number(id));
    if (!info.changes) throw bad('No such sign-in provider.', 404);
  }

  async getJson(url, what) {
    let res;
    try {
      res = await this.fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw bad(`Could not reach ${what} (${e.cause?.code || e.message}).`, 502);
    }
    if (!res.ok) throw bad(`${what} answered ${res.status}.`, 502);
    try {
      return await res.json();
    } catch {
      throw bad(`${what} did not send JSON.`, 502);
    }
  }

  async discover(issuer, { fresh = false } = {}) {
    const hit = this.discovery.get(issuer);
    if (hit && !fresh && Date.now() - hit.at < DISCOVERY_TTL) return hit;
    const url = `${issuer}/.well-known/openid-configuration`;
    const doc = await this.getJson(url, url);
    if (String(doc.issuer || '').replace(/\/+$/, '') !== issuer) {
      throw bad(`${url} says its issuer is "${doc.issuer}". Use exactly that as the issuer URL.`);
    }
    if (!doc.authorization_endpoint || !doc.token_endpoint) throw bad(`${url} is missing the sign-in or token address.`);
    const entry = { at: Date.now(), doc, keys: null, keysAt: 0 };
    this.discovery.set(issuer, entry);
    return entry;
  }

  async keys(entry, { fresh = false } = {}) {
    if (!entry.doc.jwks_uri) return [];
    if (!entry.keys || fresh || Date.now() - entry.keysAt > DISCOVERY_TTL) {
      const jwks = await this.getJson(entry.doc.jwks_uri, 'the provider\'s signing keys');
      entry.keys = Array.isArray(jwks.keys) ? jwks.keys : [];
      entry.keysAt = Date.now();
    }
    return entry.keys;
  }

  // Where the provider sends people back. PUBLIC_URL wins so it matches what
  // the admin registered, even when the app is reached by several names.
  callbackUrl(req) {
    const base = String(this.cfg.env?.PUBLIC_URL || '').trim().replace(/\/+$/, '') || `${req.protocol}://${req.host}`;
    return `${base}${CALLBACK_PATH}`;
  }

  // linkUserId: a signed-in person is adding this provider to their own profile.
  async start(id, req, { linkUserId = null } = {}) {
    const p = this.row(id);
    if (!p) throw bad('That sign-in option is gone. Reload the page.', 404);
    const { doc } = await this.discover(p.issuer);
    const verifier = crypto.randomBytes(32).toString('base64url');
    const flow = {
      p: p.id,
      s: crypto.randomBytes(16).toString('base64url'),
      n: crypto.randomBytes(16).toString('base64url'),
      v: verifier,
      r: this.callbackUrl(req),
      t: Date.now(),
      l: linkUserId,
    };
    const url = new URL(doc.authorization_endpoint);
    const params = {
      response_type: 'code',
      client_id: p.client_id,
      redirect_uri: flow.r,
      scope: [...BASE_SCOPES, ...p.scopes.split(' ').filter(Boolean)].join(' '),
      state: flow.s,
      nonce: flow.n,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return { url: url.toString(), flow };
  }

  async finish(flow, query) {
    if (!flow || typeof flow !== 'object' || Date.now() - Number(flow.t) > FLOW_TTL) throw bad('That sign-in took too long or was started in another browser. Try again.');
    if (!query.state || query.state !== flow.s) throw bad('That sign-in did not match. Try again.');
    if (query.error) throw bad(`The sign-in provider said: ${String(query.error_description || query.error).slice(0, 200)}`, 401);
    if (!query.code) throw bad('The sign-in provider did not send a code. Try again.');
    const p = this.row(flow.p);
    if (!p) throw bad('That sign-in option was removed. Reload the page.', 404);
    const entry = await this.discover(p.issuer);
    const tokens = await this.exchange(p, entry.doc, query.code, flow);
    if (!tokens.id_token) throw bad('The sign-in provider did not send an ID token. Is "openid" allowed for this client?', 502);
    const jwt = decodeJwt(tokens.id_token);
    let ok = verifySignature(jwt, { keys: await this.keys(entry), secret: p.client_secret });
    if (!ok && !ALGS[jwt.header.alg]?.hmac) ok = verifySignature(jwt, { keys: await this.keys(entry, { fresh: true }), secret: p.client_secret }); // keys rotated
    if (!ok) throw bad('The sign-in token\'s signature did not check out.', 502);
    checkClaims(jwt.payload, { issuer: p.issuer, clientId: p.client_id, nonce: flow.n });
    let claims = { ...jwt.payload };
    // Some providers only put the email and name in userinfo.
    if ((!claims.email || !claims.name) && entry.doc.userinfo_endpoint && tokens.access_token) {
      try {
        const res = await this.fetch(entry.doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const info = await res.json();
          if (info.sub === claims.sub) claims = { ...info, ...claims };
        }
      } catch { /* the ID token is enough */ }
    }
    if (flow.l) return { user: this.attach(p, claims, Number(flow.l)), linked: p.name };
    return { user: await this.userFor(p, claims) };
  }

  // "Link Tinyauth" from someone's own profile.
  attach(p, claims, userId) {
    const user = this.auth.userById(userId);
    if (!user) throw bad('Sign in again, then link the account.', 401);
    const sub = String(claims.sub);
    const known = this.db.prepare('SELECT user_id FROM oidc_identities WHERE provider_id = ? AND subject = ?').get(p.id, sub);
    if (known && known.user_id !== userId) {
      const other = this.auth.userById(known.user_id);
      throw bad(`That ${p.name} account is already linked to ${other ? other.display_name : 'another profile'}. An admin can unlink it in Family & settings, People.`, 409);
    }
    // One account per provider per profile: linking again swaps it.
    this.db.prepare('DELETE FROM oidc_identities WHERE provider_id = ? AND user_id = ? AND subject != ?').run(p.id, userId, sub);
    this.link(p.id, sub, userId, handleOf(claims));
    return user;
  }

  async exchange(p, doc, code, flow) {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: flow.r, code_verifier: flow.v });
    const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    const methods = doc.token_endpoint_auth_methods_supported || ['client_secret_basic'];
    if (p.client_secret && methods.includes('client_secret_basic')) {
      const enc = (s) => encodeURIComponent(s);
      headers.authorization = `Basic ${Buffer.from(`${enc(p.client_id)}:${enc(p.client_secret)}`).toString('base64')}`;
    } else {
      body.set('client_id', p.client_id);
      if (p.client_secret) body.set('client_secret', p.client_secret);
    }
    let res;
    try {
      res = await this.fetch(doc.token_endpoint, { method: 'POST', headers, body: body.toString(), signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw bad(`Could not reach the sign-in provider (${e.cause?.code || e.message}).`, 502);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const why = data.error_description || data.error || `status ${res.status}`;
      throw bad(`The sign-in provider turned down the code: ${String(why).slice(0, 200)}. Check the client ID and secret.`, 502);
    }
    return data;
  }

  // Find (or make) the Weather Scout profile for this person.
  async userFor(p, claims) {
    const sub = String(claims.sub);
    const known = this.db.prepare('SELECT user_id FROM oidc_identities WHERE provider_id = ? AND subject = ?').get(p.id, sub);
    if (known) {
      const user = this.auth.userById(known.user_id);
      if (user) {
        this.db.prepare('UPDATE oidc_identities SET label = ? WHERE provider_id = ? AND subject = ?').run(handleOf(claims), p.id, sub);
        return user;
      }
    }
    // The admin's "SSO link" (the tinyauth username or email) links this sign-in
    // to an existing profile, the same as the tinyauth headers do.
    const handles = [claims.preferred_username, claims.email_verified === false ? null : claims.email]
      .map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    for (const h of handles) {
      const user = this.db.prepare('SELECT * FROM users WHERE sso_subject = ?').get(h);
      if (user) {
        this.link(p.id, sub, user.id, handleOf(claims));
        return user;
      }
    }
    if (!p.auto_create) {
      throw bad(`No Weather Scout profile is linked to your ${p.name} account${handles[0] ? ` (${handles[0]})` : ''}. Ask a grown-up to link it in Family & settings, People.`, 403);
    }
    const handle = handles[0] || '';
    const name = String(claims.name || claims.given_name || handle.split('@')[0] || p.name).trim();
    let base = (handle.split('@')[0] || name).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 28) || 'user';
    if (base.length < 2) base = `${base}user`;
    let username = base;
    for (let i = 2; this.auth.userByUsername(username); i++) username = `${base}${i}`;
    const freeHandle = handle && !this.db.prepare('SELECT id FROM users WHERE sso_subject = ?').get(handle) ? handle : null;
    const user = await this.auth.createUser({
      username, password: null, displayName: name, isAdmin: this.auth.userCount() === 0, ssoSubject: freeHandle,
    });
    this.link(p.id, sub, user.id, handleOf(claims));
    return user;
  }

  link(providerId, subject, userId, label = '') {
    this.db.prepare('INSERT OR REPLACE INTO oidc_identities (provider_id, subject, user_id, label) VALUES (?, ?, ?, ?)').run(providerId, subject, userId, String(label || '').slice(0, 200));
  }

  // The sign-in accounts linked to one profile.
  identitiesFor(userId) {
    return this.db.prepare(
      'SELECT i.provider_id, i.label, i.created_at, p.name FROM oidc_identities i JOIN oidc_providers p ON p.id = i.provider_id WHERE i.user_id = ? ORDER BY p.name',
    ).all(Number(userId)).map((r) => ({ providerId: r.provider_id, name: r.name, label: r.label, linkedAt: r.created_at }));
  }

  // Same, for every profile at once (the People table).
  identitiesByUser() {
    const rows = this.db.prepare('SELECT i.user_id, i.provider_id, i.label, p.name FROM oidc_identities i JOIN oidc_providers p ON p.id = i.provider_id ORDER BY p.name').all();
    const out = {};
    for (const r of rows) (out[r.user_id] ||= []).push({ providerId: r.provider_id, name: r.name, label: r.label });
    return out;
  }

  // byAdmin: admins may remove anyone's link. People removing their own can't
  // remove their last way in (no password and no other linked account).
  unlink(userId, providerId, { byAdmin = false } = {}) {
    const user = this.auth.userById(Number(userId));
    if (!user) throw bad('No such user.', 404);
    const mine = this.identitiesFor(user.id);
    if (!mine.some((i) => i.providerId === Number(providerId))) throw bad('That account is not linked.', 404);
    if (!byAdmin && !user.password_hash && mine.length <= 1 && !(this.cfg.auth.trustProxyHeaders && user.sso_subject)) {
      throw bad('This is your only way to sign in. Ask an admin to give you a password first, or link another account.', 400);
    }
    this.db.prepare('DELETE FROM oidc_identities WHERE user_id = ? AND provider_id = ?').run(user.id, Number(providerId));
  }
}

// Fastify routes. setSession is the same helper password sign-in uses.
export function registerOidc(app, { oidc, auth, cfg, requireAdmin, setSession }) {
  const flowCookie = (req) => ({ path: '/api/auth/oidc', httpOnly: true, sameSite: 'lax', secure: cfg.auth.secureCookies || req.protocol === 'https', signed: true });
  const backHome = (reply, error) => reply.redirect(error ? `/?signin_error=${encodeURIComponent(error)}` : '/', 302);
  // Linking happens from the profile window, so problems and success go back there.
  const backToAccounts = (reply, error, linked) => reply.redirect(error
    ? `/?accounts_error=${encodeURIComponent(error)}`
    : `/?accounts_linked=${encodeURIComponent(linked || '')}`, 302);
  const go = async (req, reply, opts) => {
    const { url, flow } = await oidc.start(req.params.id, req, opts);
    reply.setCookie(OIDC_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), { ...flowCookie(req), maxAge: FLOW_TTL / 1000 });
    return reply.redirect(url, 302);
  };

  app.get('/api/auth/oidc/:id/login', async (req, reply) => {
    try {
      return await go(req, reply);
    } catch (e) {
      req.log.warn({ err: e }, 'OIDC sign-in could not start');
      return backHome(reply, e instanceof AuthError ? e.message : 'Sign-in could not start. Try again.');
    }
  });

  // "Link Tinyauth" in someone's profile: the same trip, but the account found
  // at the end is attached to the profile that is signed in now.
  app.get('/api/auth/oidc/:id/link', async (req, reply) => {
    if (!req.user) return backHome(reply, 'Sign in first, then link the account from your profile.');
    try {
      return await go(req, reply, { linkUserId: req.user.id });
    } catch (e) {
      req.log.warn({ err: e }, 'OIDC link could not start');
      return backToAccounts(reply, e instanceof AuthError ? e.message : 'Linking could not start. Try again.');
    }
  });

  app.get(CALLBACK_PATH, async (req, reply) => {
    const raw = req.cookies[OIDC_COOKIE];
    const unsigned = raw ? req.unsignCookie(raw) : null;
    reply.clearCookie(OIDC_COOKIE, flowCookie(req));
    let flow = null;
    if (unsigned?.valid) {
      try {
        flow = JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8'));
      } catch { /* treated as missing */ }
    }
    const linking = !!flow?.l;
    try {
      // The link must finish in the same signed-in session that started it.
      if (linking && req.user?.id !== Number(flow.l)) throw new AuthError(401, 'You were signed out while linking. Sign in and try again.');
      const { user, linked } = await oidc.finish(flow, req.query || {});
      if (linking) return backToAccounts(reply, null, linked);
      setSession(reply, auth.createSession(user.id));
      return backHome(reply);
    } catch (e) {
      req.log.warn({ err: e }, linking ? 'OIDC link failed' : 'OIDC sign-in failed');
      const msg = e instanceof AuthError ? e.message : 'Sign-in failed. Try again.';
      return linking ? backToAccounts(reply, msg) : backHome(reply, msg);
    }
  });

  // ---- linked accounts --------------------------------------------------------
  app.get('/api/me/identities', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Please sign in.' });
    return {
      linked: oidc.identitiesFor(req.user.id),
      providers: oidc.list().map((p) => ({ id: p.id, name: p.name })),
      hasPassword: !!req.user.password_hash,
    };
  });
  app.delete('/api/me/identities/:providerId', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Please sign in.' });
    oidc.unlink(req.user.id, req.params.providerId);
    return { ok: true, linked: oidc.identitiesFor(req.user.id) };
  });
  app.delete('/api/admin/users/:id/identities/:providerId', { preHandler: requireAdmin }, async (req) => {
    oidc.unlink(req.params.id, req.params.providerId, { byAdmin: true });
    return { ok: true };
  });

  const providerBody = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 80 },
      issuer: { type: 'string', maxLength: 500 },
      clientId: { type: 'string', maxLength: 300 },
      clientSecret: { type: ['string', 'null'], maxLength: 500 },
      scopes: { type: 'string', maxLength: 500 },
      autoCreate: { type: 'boolean' },
      showOnLogin: { type: 'boolean' },
    },
  };
  app.get('/api/admin/oidc-providers', { preHandler: requireAdmin }, async (req) => ({
    providers: oidc.list(),
    callbackUrl: oidc.callbackUrl(req),
  }));
  app.post('/api/admin/oidc-providers', { preHandler: requireAdmin, schema: { body: { ...providerBody, required: ['name', 'issuer', 'clientId'] } } }, async (req, reply) =>
    reply.code(201).send({ provider: await oidc.create(req.body) }));
  app.patch('/api/admin/oidc-providers/:id', { preHandler: requireAdmin, schema: { body: providerBody } }, async (req) =>
    ({ provider: await oidc.update(req.params.id, req.body) }));
  app.delete('/api/admin/oidc-providers/:id', { preHandler: requireAdmin }, async (req) => {
    oidc.remove(req.params.id);
    return { ok: true };
  });
}
