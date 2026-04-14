import { getDb } from './connection.js';
import { backfillDirectoryFromStoredRawEvents, relabelAllMessages } from '../services/senderDirectory.js';

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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id   TEXT NOT NULL UNIQUE,
      platform     TEXT NOT NULL DEFAULT 'lark',
      chat_id      TEXT NOT NULL,
      sender_id    TEXT,
      sender_name  TEXT,
      content      TEXT,
      message_type TEXT,
      topic_id     TEXT,
      root_id      TEXT,
      parent_id    TEXT,
      created_at   TEXT,
      raw_event    TEXT
    );

    CREATE TABLE IF NOT EXISTS topics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id       TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL,
      topic_context  TEXT NOT NULL DEFAULT '',
      color          TEXT DEFAULT '0',
      visible        INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id          TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      summary           TEXT DEFAULT '',
      source_chat_id    TEXT,
      source_contact_id TEXT,
      occurred_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_topics (
      event_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      PRIMARY KEY (event_id, topic_id)
    );

    CREATE TABLE IF NOT EXISTS auto_reply_config (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_type   TEXT NOT NULL, -- 'person' | 'group'
      channel_id     TEXT NOT NULL,
      template_id    INTEGER,
      knowledge_tags TEXT NOT NULL DEFAULT '[]',
      custom_context TEXT NOT NULL DEFAULT '',
      enabled        INTEGER NOT NULL DEFAULT 1,
      updated_at     TEXT DEFAULT (datetime('now')),
      UNIQUE (channel_type, channel_id)
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      tags       TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reply_templates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      is_default    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );
`);

  console.log('[DB] Migrations complete');

  // ─── ALTER TABLE migrations (safe for existing DB) ────────────────────────
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN auto_reply INTEGER DEFAULT 0`);
    console.log('[DB] Added auto_reply column to contacts');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'person'`);
    console.log('[DB] Added contact_type column to contacts');
  } catch { /* Column already exists — ignore */ }

  try {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('modelId', 'step-3.5-flash-2603')`).run();
  } catch { /* Ignore */ }

  try {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('defaultSyncMode', 'latest')`).run();
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('defaultSyncLimit', '30')`).run();
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('fullSyncCap', '5000')`).run();
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
    db.exec(`ALTER TABLE chats ADD COLUMN chat_type TEXT DEFAULT 'group'`);
    console.log('[DB] Added chat_type column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN member_count INTEGER DEFAULT 0`);
    console.log('[DB] Added member_count column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN is_monitoring INTEGER DEFAULT 0`);
    console.log('[DB] Added is_monitoring column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN auto_reply INTEGER DEFAULT 0`);
    console.log('[DB] Added auto_reply column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN has_alert INTEGER DEFAULT 0`);
    console.log('[DB] Added has_alert column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN last_summary TEXT DEFAULT ''`);
    console.log('[DB] Added last_summary column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN last_active_at TEXT`);
    console.log('[DB] Added last_active_at column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN updated_at TEXT`);
    console.log('[DB] Added updated_at column to chats');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE chats ADD COLUMN sync_mode TEXT DEFAULT 'latest'`);
    db.exec(`ALTER TABLE chats ADD COLUMN sync_limit INTEGER DEFAULT 20`);
    console.log('[DB] Added sync columns to chats');
  } catch { /* Columns already exist */ }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN timeline_hidden INTEGER NOT NULL DEFAULT 0`);
    console.log('[DB] Added timeline_hidden to events');
  } catch { /* Column already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN intro TEXT NOT NULL DEFAULT ''`);
    console.log('[DB] Added intro to contacts');
  } catch { /* Column already exists */ }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sender_directory (
        open_id       TEXT PRIMARY KEY,
        display_name  TEXT NOT NULL,
        source          TEXT NOT NULL DEFAULT 'mention',
        updated_at      TEXT DEFAULT (datetime('now'))
      );
    `);
    console.log('[DB] sender_directory table ready');
  } catch (e) {
    console.warn('[DB] sender_directory create failed:', e);
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN speaker_highlights TEXT NOT NULL DEFAULT ''`);
    console.log('[DB] Added speaker_highlights to events');
  } catch { /* Column already exists */ }

  try {
    const gate = db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get('sender_directory_backfill_v1') as { value: string } | undefined;
    if (!gate) {
      backfillDirectoryFromStoredRawEvents();
      relabelAllMessages();
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('sender_directory_backfill_v1', '1')`).run();
      console.log('[DB] sender_directory: scanned raw_event + relabeled all messages');
    }
  } catch (e) {
    console.warn('[DB] sender_directory backfill:', e);
  }

  try {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('messageSyncPollingEnabled', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('messageSyncIntervalSec', '60')`).run();
  } catch {
    /* ignore */
  }

  try {
    db.exec(`
      ALTER TABLE messages ADD COLUMN ai_analysis_status TEXT NOT NULL DEFAULT 'unprocessed'
    `);
    console.log('[DB] Added messages.ai_analysis_status (AI 分析状态：未处理 / 单对话 / 全局)');
  } catch {
    /* Column already exists */
  }

  try {
    db.exec(`ALTER TABLE messages ADD COLUMN platform TEXT NOT NULL DEFAULT 'lark'`);
    console.log('[DB] Added messages.platform (原始消息来源平台，当前默认 lark)');
  } catch {
    /* Column already exists */
  }

  try {
    db.exec(`ALTER TABLE topics ADD COLUMN topic_context TEXT NOT NULL DEFAULT ''`);
    console.log('[DB] Added topics.topic_context（主题说明，供自动归类 LLM 使用）');
  } catch {
    /* Column already exists */
  }
}
