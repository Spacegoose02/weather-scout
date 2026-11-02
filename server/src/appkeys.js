// Keys for other family apps (Den-Duty, Home Assistant, scripts) to read the
// weather summary. Only a SHA-256 of each key is stored; the key is shown once.
import crypto from 'node:crypto';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export class AppKeys {
  constructor(db) {
    this.db = db;
  }

  create(name) {
    const clean = String(name || '').trim().slice(0, 60) || 'App';
    const key = `wsk_${crypto.randomBytes(24).toString('base64url')}`;
    const info = this.db.prepare('INSERT INTO app_keys (name, key_hash, hint) VALUES (?, ?, ?)').run(clean, sha256(key), key.slice(-4));
    return { id: Number(info.lastInsertRowid), name: clean, key };
  }

  list() {
    return this.db.prepare('SELECT id, name, hint, created_at AS createdAt, last_used_at AS lastUsedAt FROM app_keys ORDER BY id').all()
      .map((r) => ({ ...r }));
  }

  revoke(id) {
    return this.db.prepare('DELETE FROM app_keys WHERE id = ?').run(id).changes > 0;
  }

  // Returns the key's row for a valid "Authorization: Bearer wsk_..." header.
  check(header) {
    const m = /^Bearer\s+(wsk_[A-Za-z0-9_-]{20,})$/.exec(String(header || '').trim());
    if (!m) return null;
    const row = this.db.prepare('SELECT id, name FROM app_keys WHERE key_hash = ?').get(sha256(m[1]));
    if (row) this.db.prepare("UPDATE app_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
    return row ? { ...row } : null;
  }
}
