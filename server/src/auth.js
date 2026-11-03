// Two ways to sign in, usable together:
//  1. tinyauth (or any forward-auth proxy) SSO: the proxy authenticates the
//     person and passes Remote-User / Remote-Email headers. We only trust those
//     headers when AUTH_TRUST_PROXY_HEADERS=true.
//  2. Local username + password, stored hashed with scrypt.
// An admin can link an SSO identity to an existing local username.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { publicUser } from './db.js';

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE = 'ws_session';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function validateUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9._-]{2,32}$/.test(u);
}

export function validatePassword(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 200;
}

export class AuthService {
  constructor(db, cfg) {
    this.db = db;
    this.cfg = cfg;
    this.failures = new Map(); // username -> { count, until }
  }

  userById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  userByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  userCount() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  }

  async createUser({ username, password, displayName, isAdmin = false, ssoSubject = null }) {
    if (!validateUsername(username)) throw new AuthError(400, 'Usernames are 2-32 letters, numbers, dots, dashes or underscores.');
    if (password != null && !validatePassword(password)) throw new AuthError(400, 'Passwords need at least 8 characters.');
    if (this.userByUsername(username)) throw new AuthError(409, 'That username is taken.');
    const hash = password != null ? await hashPassword(password) : null;
    const info = this.db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_admin, sso_subject) VALUES (?, ?, ?, ?, ?)')
      .run(username, cleanDisplayName(displayName) || username, hash, isAdmin ? 1 : 0, ssoSubject || null);
    return this.userById(Number(info.lastInsertRowid));
  }

  async updateUser(id, patch) {
    const user = this.userById(id);
    if (!user) throw new AuthError(404, 'No such user.');
    if (patch.displayName !== undefined) {
      this.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(cleanDisplayName(patch.displayName) || user.username, id);
    }
    if (patch.isAdmin !== undefined) {
      if (!patch.isAdmin && user.is_admin && this.adminCount() <= 1) throw new AuthError(400, 'At least one admin must remain.');
      this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(patch.isAdmin ? 1 : 0, id);
    }
    if (patch.ssoSubject !== undefined) {
      const subject = patch.ssoSubject ? String(patch.ssoSubject).trim() : null;
      if (subject) {
        const other = this.db.prepare('SELECT id FROM users WHERE sso_subject = ? AND id != ?').get(subject, id);
        if (other) throw new AuthError(409, 'That SSO identity is already linked to another user.');
      }
      this.db.prepare('UPDATE users SET sso_subject = ? WHERE id = ?').run(subject, id);
    }
    if (patch.password !== undefined) {
      if (!validatePassword(patch.password)) throw new AuthError(400, 'Passwords need at least 8 characters.');
      this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(patch.password), id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    return this.userById(id);
  }

  deleteUser(id) {
    const user = this.userById(id);
    if (!user) throw new AuthError(404, 'No such user.');
    if (user.is_admin && this.adminCount() <= 1) throw new AuthError(400, 'At least one admin must remain.');
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  adminCount() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY username').all().map(publicUser);
  }

  setPreferences(id, prefs) {
    const json = JSON.stringify(prefs ?? {});
    if (json.length > 20000) throw new AuthError(413, 'Preferences are too large.');
    this.db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(json, id);
    return this.userById(id);
  }

  async login(username, password) {
    const key = String(username || '').toLowerCase();
    const f = this.failures.get(key);
    if (f && f.until > Date.now()) throw new AuthError(429, 'Too many tries. Wait a minute and try again.');
    const user = this.userByUsername(String(username || ''));
    const ok = user && (await verifyPassword(String(password || ''), user.password_hash));
    if (!ok) {
      const count = (f?.count || 0) + 1;
      this.failures.set(key, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
      throw new AuthError(401, 'Wrong username or password.');
    }
    this.failures.delete(key);
    return this.createSession(user.id);
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now() + this.cfg.auth.sessionDays * 86400_000;
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
    return { token, expires };
  }

  destroySession(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  userFromSession(token) {
    if (!token) return null;
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (!row || row.expires_at < Date.now()) return null;
    return this.userById(row.user_id) || null;
  }

  async userFromProxyHeaders(headers) {
    if (!this.cfg.auth.trustProxyHeaders) return null;
    const subject = String(headers[this.cfg.auth.userHeader] || '').trim();
    if (!subject) return null;
    const existing = this.db.prepare('SELECT * FROM users WHERE sso_subject = ?').get(subject);
    if (existing) return existing;
    if (!this.cfg.auth.autoCreateSsoUsers) return null;
    const name = String(headers[this.cfg.auth.nameHeader] || '').trim() || subject.split('@')[0];
    let base = subject.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 28) || 'user';
    if (base.length < 2) base = `${base}user`;
    let username = base;
    for (let i = 2; this.userByUsername(username); i++) username = `${base}${i}`;
    const isAdmin = this.userCount() === 0; // the very first person in becomes admin
    return this.createUser({ username, password: null, displayName: name, isAdmin, ssoSubject: subject });
  }

  async bootstrapAdmin() {
    const { adminUsername, adminPassword } = this.cfg.auth;
    if (!adminUsername || !adminPassword) return null;
    const existing = this.userByUsername(adminUsername);
    if (existing) return existing;
    return this.createUser({ username: adminUsername, password: adminPassword, isAdmin: true, displayName: adminUsername });
  }
}

// Friendly name Rocky uses in greetings. Collapses whitespace, drops control
// characters and caps the length; an empty result falls back to the username.
export function cleanDisplayName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}
