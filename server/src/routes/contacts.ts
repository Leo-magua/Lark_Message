import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { searchUsers, searchChats, getBestAvatar } from '../services/larkCli.js';
import { syncAllContacts } from '../services/syncContacts.js';
import { summarizeContactIntro } from '../services/contactIntroSummarize.js';
import { listEventsForContact } from '../repositories/eventsRead.js';
import { labelMessageAiStatusZh, normalizeMessageAiStatus } from '../constants/messageAiStatus.js';

const router = Router();

interface ContactRow {
  open_id: string;
  name: string;
  avatar_url: string;
  job_title: string | null;
  contact_type: string;
  tags: string;
  knows: string;
  last_talk: string;
  talk_count: number;
  auto_reply?: number;
  sync_mode?: string;
  sync_limit?: number;
  intro?: string | null;
}

/** Convert DB row → frontend Contact shape */
function rowToPerson(row: ContactRow) {
  return {
    id: row.open_id,
    name: row.name,
    avatar: row.avatar_url,
    title: row.job_title ?? undefined,
    contact_type: row.contact_type as 'person' | 'group',
    tags: JSON.parse(row.tags) as string[],
    knows: JSON.parse(row.knows) as string[],
    lastTalk: row.last_talk,
    talkCount: row.talk_count,
    autoReply: Boolean(row.auto_reply),
    syncMode: row.sync_mode === 'full' || row.sync_mode === 'latest'
      ? (row.sync_mode as 'latest' | 'full')
      : undefined,
    // `sync_limit` may be NULL => means "use global default" (frontend/server decide)
    syncLimit: row.sync_limit === null || row.sync_limit === undefined ? undefined : row.sync_limit,
    intro: row.intro ?? '',
  };
}

// ─── GET /api/contacts ────────────────────────────────────────────────────────
// Returns only DB-stored contacts (already added by user)
router.get('/', (req, res) => {
  const db = getDb();

  const rows = db.prepare(`
    SELECT *, COALESCE(auto_reply, 0) as auto_reply FROM contacts ORDER BY contact_type ASC, name ASC
  `).all() as unknown as ContactRow[];

  res.json({ contacts: rows.map(rowToPerson) });
});

// ─── GET /api/contacts/search?q=&type=person|group ────────────────────────────
// Live search via lark-cli — does NOT touch DB
router.get('/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() ?? '';
  const type = (req.query.type as string | undefined) ?? 'person';

  try {
    if (!q) {
      res.json({ contacts: [] });
      return;
    }

    if (type === 'group') {
      const chats = await searchChats(q);
      const contacts = chats.map(c => ({
        id: c.chat_id,
        name: c.name,
        avatar: c.avatar ?? '',
        contact_type: 'group' as const,
        member_count: c.member_count,
        tags: [] as string[],
        knows: [] as string[],
        lastTalk: '',
        talkCount: 0,
        autoReply: false,
      }));
      res.json({ contacts });
    } else {
      const users = await searchUsers(q, 20);
      const contacts = users.map(u => ({
        id: u.open_id,
        name: u.name,
        avatar: getBestAvatar(u),
        title: u.job_title,
        contact_type: 'person' as const,
        tags: [] as string[],
        knows: [] as string[],
        lastTalk: '',
        talkCount: 0,
        autoReply: false,
      }));
      res.json({ contacts });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/contacts/sync ──────────────────────────────────────────────────
// Sync all contacts from Feishu (upsert, default auto_reply=1)
router.post('/sync', async (_req, res) => {
  try {
    const result = await syncAllContacts();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/contacts/add ───────────────────────────────────────────────────
// Add a selected search result into the local DB
router.post('/add', (req, res) => {
  const db = getDb();
  const { id, name, avatar, title, contact_type, sync_mode, sync_limit } = req.body as {
    id: string;
    name: string;
    avatar: string;
    title?: string;
    contact_type: 'person' | 'group';
    sync_mode?: 'latest' | 'full';
    sync_limit?: number;
  };

  if (!id || !name) {
    res.status(400).json({ error: 'id and name are required' });
    return;
  }

  db.prepare(`
    INSERT OR REPLACE INTO contacts
      (open_id, name, avatar_url, job_title, contact_type, tags, knows, last_talk, talk_count,
       auto_reply, sync_mode, sync_limit, synced_at)
    VALUES
      (?, ?, ?, ?, ?, '[]', '[]', '', 0, 1,
       ?, ?,
       datetime('now'))
  `).run(
    id,
    name,
    avatar ?? '',
    title ?? null,
    contact_type ?? 'person',
    sync_mode ?? null,
    sync_limit ?? null
  );

  // Keep `chats` table in sync for group-type address book entries (chat_id == open_id for groups)
  if ((contact_type ?? 'person') === 'group') {
    db.prepare(`
      INSERT INTO chats (
        chat_id, name, chat_type, avatar,
        is_monitoring, auto_reply, has_alert,
        sync_mode, sync_limit,
        last_active_at, updated_at
      ) VALUES (
        ?, ?, 'group', ?,
        0, 1, 0,
        ?, ?,
        datetime('now'), datetime('now')
      )
      ON CONFLICT(chat_id) DO UPDATE SET
        name = excluded.name,
        chat_type = excluded.chat_type,
        avatar = excluded.avatar,
        sync_mode = excluded.sync_mode,
        sync_limit = excluded.sync_limit,
        updated_at = datetime('now')
    `).run(
      id,
      name,
      avatar ?? '',
      sync_mode ?? null,
      sync_limit ?? null,
    );
  }

  res.json({ success: true });
});

// ─── DELETE /api/contacts/:id ─────────────────────────────────────────────────
// Remove a contact from DB
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE open_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── PATCH /api/contacts/:id ──────────────────────────────────────────────────
// Update local enrichment fields (tags, knows, lastTalk, talkCount)
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { tags, knows, lastTalk, talkCount, autoReply, syncMode, syncLimit, intro } = req.body as {
    tags?: string[];
    knows?: string[];
    lastTalk?: string;
    talkCount?: number;
    autoReply?: boolean;
    syncMode?: 'latest' | 'full' | null;
    syncLimit?: number | null;
    intro?: string;
  };

  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { open_id: id };

  if (tags !== undefined) {
    updates.push('tags = :tags');
    params.tags = JSON.stringify(tags);
  }
  if (knows !== undefined) {
    updates.push('knows = :knows');
    params.knows = JSON.stringify(knows);
  }
  if (lastTalk !== undefined) {
    updates.push('last_talk = :lastTalk');
    params.lastTalk = lastTalk;
  }
  if (autoReply !== undefined) {
    updates.push('auto_reply = :autoReply');
    params.autoReply = autoReply ? 1 : 0;
  }
  if (syncMode !== undefined) {
    if (syncMode === null) {
      updates.push('sync_mode = NULL');
    } else {
      updates.push('sync_mode = :syncMode');
      params.syncMode = syncMode;
    }
  }
  if (syncLimit !== undefined) {
    if (syncLimit === null) {
      updates.push('sync_limit = NULL');
    } else {
      updates.push('sync_limit = :syncLimit');
      params.syncLimit = syncLimit;
    }
  }
  if (intro !== undefined) {
    updates.push('intro = :intro');
    params.intro = intro;
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' });
    return;
  }

  // Update contacts table
  db.prepare(`
    UPDATE contacts SET ${updates.join(', ')} WHERE open_id = :open_id
  `).run(params);

  // Sync auto_reply config: ensure config exists when auto_reply=1, remove when=0
  if (autoReply !== undefined) {
    if (autoReply) {
      // Create default config if not exists
      db.prepare(`
        INSERT OR IGNORE INTO auto_reply_config (channel_type, channel_id, template_id, knowledge_tags, custom_context, enabled)
        VALUES ('person', ?, NULL, '[]', '', 1)
      `).run(id);
    } else {
      // Remove config (or could just disable)
      db.prepare("DELETE FROM auto_reply_config WHERE channel_type = 'person' AND channel_id = ?").run(id);
    }
  }

  res.json({ success: true });
});

// POST /api/contacts/:id/intro-ai — 根据已同步消息生成简介（须放在 /:id/summary 之前注册顺序无影响，路径不同）
router.post('/:id/intro-ai', async (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const row = db
    .prepare('SELECT name, contact_type FROM contacts WHERE open_id = ?')
    .get(id) as { name: string; contact_type: string } | undefined;
  if (!row) {
    res.status(404).json({ success: false, error: 'Contact not found' });
    return;
  }
  const contactType = row.contact_type === 'group' ? 'group' : 'person';
  const result = await summarizeContactIntro({
    contactId: id,
    contactName: row.name,
    contactType,
  });
  if ('error' in result) {
    const code =
      result.error === 'API key not configured'
        ? 400
        : result.error === 'No messages to summarize'
          ? 400
          : 502;
    res.status(code).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, intro: result.intro });
});

// GET /api/contacts/:id/events — 该通讯录对象关联的 AI 事件（单聊写 source_contact_id；群可能写 source_chat_id 或 source_contact_id）
router.get('/:id/events', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const contact = db.prepare('SELECT 1 FROM contacts WHERE open_id = ?').get(id);
  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }

  const rows = listEventsForContact(id, 200);

  res.json({
    events: rows.map(r => ({
      id: r.event_id,
      title: r.title,
      summary: r.summary ?? '',
      speaker_highlights: r.speaker_highlights ?? '',
      occurred_at: r.occurred_at,
    })),
  });
});

// GET /api/contacts/:id/summary
router.get('/:id/summary', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  // Look up contact
  const contact = db.prepare('SELECT open_id, name, avatar_url, contact_type FROM contacts WHERE open_id = ?').get(id) as {
    open_id: string;
    name: string;
    avatar_url: string;
    contact_type: string;
  } | undefined;

  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }

  // Fetch last N messages（与同步存储一致：群 chat_id；P2P 可能 chat_id 或 sender_id）
  const messages = db.prepare(`
    SELECT id, sender_id, sender_name, content, created_at,
           COALESCE(ai_analysis_status, 'unprocessed') AS ai_analysis_status
    FROM messages
    WHERE chat_id = ? OR sender_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id, id) as Array<{
    id: number;
    sender_id: string;
    sender_name: string;
    content: string;
    created_at: string;
    ai_analysis_status: string;
  }>;

  const lastMessageAt = messages.length > 0 ? messages[0].created_at : '';

  res.json({
    contact_id: contact.open_id,
    name: contact.name,
    avatar: contact.avatar_url,
    contact_type: contact.contact_type,
    messages: messages.map(m => {
      const aiStatus = normalizeMessageAiStatus(m.ai_analysis_status);
      return {
        id: m.id,
        sender: m.sender_name || m.sender_id,
        content: m.content,
        time: m.created_at,
        ai_analysis_status: aiStatus,
        ai_analysis_status_label: labelMessageAiStatusZh(aiStatus),
      };
    }),
    last_message_at: lastMessageAt,
  });
});

export default router;
