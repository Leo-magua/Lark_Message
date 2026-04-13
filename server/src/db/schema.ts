import { getDb } from './connection.js';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      open_id       TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      avatar_url    TEXT DEFAULT '',
      job_title     TEXT,
      contact_type  TEXT DEFAULT 'person',
      tags          TEXT DEFAULT '[]',
      knows         TEXT DEFAULT '[]',
      last_talk     TEXT DEFAULT '',
      talk_count    INTEGER DEFAULT 0,
      auto_reply    INTEGER DEFAULT 0,
      sync_mode     TEXT DEFAULT 'latest',  -- 'latest' | 'full'
      sync_limit    INTEGER DEFAULT 20,      -- number of messages to sync when mode='latest'
      synced_at     TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chats (
      chat_id       TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      avatar        TEXT,
      is_monitoring INTEGER DEFAULT 0,
      auto_reply    INTEGER DEFAULT 0,
      sync_mode     TEXT DEFAULT 'latest',  -- 'latest' | 'full'
      sync_limit    INTEGER DEFAULT 20,      -- number of messages to sync when mode='latest'
      synced_at     TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
`);

  console.log('[DB] Migrations complete');

  // ─── ALTER TABLE migrations (safe for existing DB) ────────────────────────
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'person'`);
    console.log('[DB] Added contact_type column to contacts');
  } catch { /* Column already exists — ignore */ }

  try {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('modelId', 'step-3.5-flash-2603')`).run();
  } catch { /* Ignore */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN last_summary TEXT DEFAULT ''`);
    console.log('[DB] Added last_summary column to contacts');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN last_message_at TEXT DEFAULT ''`);
    console.log('[DB] Added last_message_at column to contacts');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN message_count INTEGER DEFAULT 0`);
    console.log('[DB] Added message_count column to contacts');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN sync_mode TEXT DEFAULT 'latest'`);
    db.exec(`ALTER TABLE contacts ADD COLUMN sync_limit INTEGER DEFAULT 20`);
    console.log('[DB] Added sync columns to contacts');
  } catch { /* Columns already exist */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN sync_mode TEXT DEFAULT 'latest'`);
    db.exec(`ALTER TABLE chats ADD COLUMN sync_limit INTEGER DEFAULT 20`);
    console.log('[DB] Added sync columns to chats');
  } catch { /* Columns already exist */ }
}
