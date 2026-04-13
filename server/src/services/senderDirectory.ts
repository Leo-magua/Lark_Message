import { getDb } from '../db/connection.js';

/**
 * 非通讯录显式的 open_id → 展示名映射（主要来自群消息里的 @提及 等），
 * 用于群聊中未加入通讯录的成员在 AI / 摘要中的可读名称。
 */
export function recordSenderAlias(openId: string, displayName: string, source: string): void {
  const id = (openId ?? '').trim();
  const name = (displayName ?? '').trim();
  if (!id || !name || name === id) return;
  const db = getDb();
  db.prepare(
    `
    INSERT INTO sender_directory (open_id, display_name, source, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(open_id) DO UPDATE SET
      display_name = excluded.display_name,
      source = excluded.source,
      updated_at = excluded.updated_at
  `
  ).run(id, name, source.slice(0, 32));
}

function readMentionOpenId(m: Record<string, unknown>): string {
  const id = m.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (id && typeof id === 'object') {
    const o = id as Record<string, unknown>;
    const v = o.open_id ?? o.user_id ?? o.openid;
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

/** 从单条飞书消息 JSON 提取可学习的 id→姓名（mentions、sender 扩展字段） */
export function ingestAliasesFromMessage(msg: unknown): void {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as Record<string, unknown>;

  const mentions = m.mentions;
  if (Array.isArray(mentions)) {
    for (const item of mentions) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const openId = readMentionOpenId(row);
      const n = row.name;
      if (openId && typeof n === 'string' && n.trim()) recordSenderAlias(openId, n.trim(), 'mention');
    }
  }

  const sender = m.sender;
  if (sender && typeof sender === 'object') {
    const s = sender as Record<string, unknown>;
    const sid = typeof s.id === 'string' ? s.id.trim() : '';
    const nm =
      (typeof s.name === 'string' && s.name.trim()) ||
      (typeof s.username === 'string' && s.username.trim()) ||
      (typeof s.en_name === 'string' && s.en_name.trim()) ||
      '';
    if (sid && nm) recordSenderAlias(sid, nm, 'payload');
  }
}

export function resolveSenderDisplayName(openId: string): string {
  const id = (openId ?? '').trim();
  if (!id) return '';
  const db = getDb();
  const contact = db.prepare('SELECT name FROM contacts WHERE open_id = ?').get(id) as { name: string } | undefined;
  if (contact?.name?.trim()) return contact.name.trim();
  const alias = db
    .prepare('SELECT display_name FROM sender_directory WHERE open_id = ?')
    .get(id) as { display_name: string } | undefined;
  if (alias?.display_name?.trim()) return alias.display_name.trim();
  return id;
}

/** 将某会话下所有消息的 sender_name 按当前通讯录 + 映射表重算（同步后调用） */
export function relabelMessagesInChat(chatId: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE messages SET sender_name = (
      SELECT COALESCE(
        (SELECT name FROM contacts WHERE open_id = messages.sender_id LIMIT 1),
        (SELECT display_name FROM sender_directory WHERE open_id = messages.sender_id LIMIT 1),
        messages.sender_id
      )
    )
    WHERE chat_id = ? AND sender_id IS NOT NULL AND trim(sender_id) != ''
  `
  ).run(chatId);
}

/** 全表重算 sender_name（迁移 / 手工回填映射后） */
export function relabelAllMessages(): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE messages SET sender_name = (
      SELECT COALESCE(
        (SELECT name FROM contacts WHERE open_id = messages.sender_id LIMIT 1),
        (SELECT display_name FROM sender_directory WHERE open_id = messages.sender_id LIMIT 1),
        messages.sender_id
      )
    )
    WHERE sender_id IS NOT NULL AND trim(sender_id) != ''
  `
  ).run();
}

/** 扫描已落库的 raw_event，补全映射表（不修改消息正文） */
export function backfillDirectoryFromStoredRawEvents(): void {
  const db = getDb();
  let offset = 0;
  const page = 400;
  for (;;) {
    const rows = db
      .prepare(
        `SELECT raw_event FROM messages WHERE raw_event IS NOT NULL AND length(trim(raw_event)) > 2 LIMIT ? OFFSET ?`
      )
      .all(page, offset) as { raw_event: string }[];
    if (rows.length === 0) break;
    for (const { raw_event } of rows) {
      try {
        const msg = JSON.parse(raw_event) as unknown;
        ingestAliasesFromMessage(msg);
      } catch {
        /* ignore */
      }
    }
    offset += page;
  }
}
