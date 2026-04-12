import { getDb } from './connection.js';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      open_id       TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      avatar_url    TEXT NOT NULL DEFAULT '',
      job_title     TEXT,
      contact_type  TEXT NOT NULL DEFAULT 'person',
      tags          TEXT NOT NULL DEFAULT '[]',
      knows         TEXT NOT NULL DEFAULT '[]',
      last_talk     TEXT NOT NULL DEFAULT '',
      talk_count    INTEGER NOT NULL DEFAULT 0,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

    CREATE TABLE IF NOT EXISTS messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id    TEXT UNIQUE NOT NULL,
      chat_id       TEXT NOT NULL,
      sender_id     TEXT,
      sender_name   TEXT,
      content       TEXT,
      message_type  TEXT DEFAULT 'text',
      topic_id      TEXT,
      root_id       TEXT,
      parent_id     TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      raw_event     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS chats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id       TEXT UNIQUE NOT NULL,
      name          TEXT,
      chat_type     TEXT DEFAULT 'group',
      avatar        TEXT,
      member_count  INTEGER DEFAULT 0,
      is_monitoring INTEGER DEFAULT 1,
      auto_reply    INTEGER DEFAULT 0,
      has_alert     INTEGER DEFAULT 0,
      last_summary  TEXT DEFAULT '',
      last_active_at TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS topics (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id  TEXT UNIQUE NOT NULL,
      name      TEXT NOT NULL,
      color     TEXT DEFAULT '0',
      visible   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('openaiKey', ''),
      ('openaiUrl', 'https://api.openai.com/v1'),
      ('kimiCommand', '请帮我分析这段对话的重点'),
      ('autoReplyEnabled', 'true'),
      ('modelId', 'step-3.5-flash-2603');

    INSERT OR IGNORE INTO topics (topic_id, name, color, visible) VALUES
      ('topic1', '飞书消息', '0', 1),
      ('topic2', '工作事项', '1', 1),
      ('topic3', '会议记录', '2', 1);

    CREATE TABLE IF NOT EXISTS events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id          TEXT UNIQUE NOT NULL,
      title             TEXT NOT NULL,
      summary           TEXT DEFAULT '',
      source_chat_id    TEXT,
      source_contact_id TEXT,
      occurred_at       TEXT NOT NULL DEFAULT (datetime('now')),
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_topics (
      event_id  TEXT NOT NULL,
      topic_id  TEXT NOT NULL,
      PRIMARY KEY (event_id, topic_id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_event_topics_topic ON event_topics(topic_id);
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
}
