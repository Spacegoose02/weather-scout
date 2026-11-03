// SQLite storage via Node's built-in node:sqlite (no native build step, so the
// Docker image stays small and works on any Unraid CPU).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  sso_subject TEXT UNIQUE COLLATE NOCASE,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS app_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  hint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  place_name TEXT NOT NULL DEFAULT '',
  levels TEXT NOT NULL DEFAULT '["warning"]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT
);
CREATE TABLE IF NOT EXISTS push_sent (
  subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscription_id, alert_id)
);
CREATE TABLE IF NOT EXISTS media_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'youtube')),
  title TEXT NOT NULL,
  url TEXT,
  channel_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS media_hidden (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  hidden_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Columns added after the first release. SQLite has no ADD COLUMN IF NOT EXISTS.
const ADDED_COLUMNS = {
  push_subscriptions: [
    ['briefing_time', 'TEXT'], // "HH:MM" local time for Rocky's morning briefing, or NULL
    ['briefing_sent', 'TEXT'], // local date (YYYY-MM-DD) of the last briefing sent
    ['utc_offset', 'INTEGER'], // the place's UTC offset in seconds, from the last forecast
    ['lightning_miles', 'INTEGER'], // alert when lightning strikes this close, or NULL for off
    ['lightning_alert_at', 'INTEGER'], // ms: when the current "lightning nearby" alert went out (NULL = all clear)
    ['lightning_last_strike', 'INTEGER'], // ms: newest strike inside the circle since that alert
  ],
  media_feeds: [
    ['scope', "TEXT NOT NULL DEFAULT 'national'"], // local | national
    ['kid_safe', 'INTEGER NOT NULL DEFAULT 1'], // shown in Kid Mode
    ['enabled', 'INTEGER NOT NULL DEFAULT 1'],
    ['yt_type', "TEXT NOT NULL DEFAULT 'channel'"], // channel | playlist | video (YouTube only)
  ],
};

function migrate(db) {
  for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, def] of cols) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

export function openDb(dataDir) {
  let file = ':memory:';
  if (dataDir !== ':memory:') {
    fs.mkdirSync(dataDir, { recursive: true });
    file = path.join(dataDir, 'weather-scout.db');
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: !!row.is_admin,
    ssoSubject: row.sso_subject || null,
    hasPassword: !!row.password_hash,
    preferences: safeJson(row.preferences),
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}
