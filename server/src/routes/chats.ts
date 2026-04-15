import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

interface ChatRow {
  id: number;
  chat_id: string;
  name: string | null;
  chat_type: string | null;
  avatar: string | null;
  member_count: number;
  is_monitoring: number;
  auto_reply: number;
  has_alert: number;
  last_summary: string | null;
  last_active_at: string | null;
  updated_at: string | null;
  sync_mode?: string;
  sync_limit?: number;
}

function rowToChannel(row: ChatRow) {
  const lastActive = row.last_active_at ? formatRelativeTime(row.last_active_at) : '未知';
  return {
    id: row.chat_id,
    type: (row.chat_type === 'p2p' ? 'person' : 'group') as 'group' | 'person',
    name: row.name ?? '未知群组',
    avatar: row.avatar ?? undefined,
    members: row.member_count > 0 ? row.member_count : undefined,
    isMonitoring: Boolean(row.is_monitoring),
    autoReply: Boolean(row.auto_reply),
    hasAlert: Boolean(row.has_alert),
    summary: row.last_summary ?? '',
    lastActive,
    syncMode: (row.sync_mode as 'latest' | 'full') || 'latest',
    syncLimit: row.sync_limit || 20,
  };
}

function formatRelativeTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return '昨天';
  if (diffD < 7) return `${diffD}天前`;
  return d.toLocaleDateString('zh-CN');
}

// GET /api/chats
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM chats ORDER BY last_active_at DESC').all() as unknown as ChatRow[];
  res.json(rows.map(rowToChannel));
});

// PUT /api/chats/:chatId
router.put('/:chatId', (req, res) => {
  const db = getDb();
  const { chatId } = req.params;
  const { isMonitoring, autoReply, hasAlert, syncMode, syncLimit } = req.body as {
    isMonitoring?: boolean;
    autoReply?: boolean;
    hasAlert?: boolean;
    syncMode?: 'latest' | 'full';
    syncLimit?: number;
  };

  const updates: string[] = ["updated_at = datetime('now')"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { chat_id: chatId };

  if (isMonitoring !== undefined) {
    updates.push('is_monitoring = :isMonitoring');
    params.isMonitoring = isMonitoring ? 1 : 0;
  }
  if (autoReply !== undefined) {
    updates.push('auto_reply = :autoReply');
    params.autoReply = autoReply ? 1 : 0;
  }
  if (hasAlert !== undefined) {
    updates.push('has_alert = :hasAlert');
    params.hasAlert = hasAlert ? 1 : 0;
  }
  if (syncMode !== undefined) {
    updates.push('sync_mode = :syncMode');
    params.syncMode = syncMode;
  }
  if (syncLimit !== undefined) {
    updates.push('sync_limit = :syncLimit');
    params.syncLimit = syncLimit;
  }

  db.prepare(`UPDATE chats SET ${updates.join(', ')} WHERE chat_id = :chat_id`).run(params);

  // Sync auto_reply config: ensure config exists when auto_reply=1, remove when=0
  if (autoReply !== undefined) {
    if (autoReply) {
      db.prepare(`
        INSERT OR IGNORE INTO auto_reply_config (channel_type, channel_id, template_id, knowledge_tags, custom_context, system_prompt, enabled)
        VALUES ('group', ?, NULL, '[]', '', '', 1)
      `).run(chatId);
    } else {
      db.prepare("DELETE FROM auto_reply_config WHERE channel_type = 'group' AND channel_id = ?").run(chatId);
    }
  }

  const row = db.prepare('SELECT * FROM chats WHERE chat_id = ?').get(chatId) as ChatRow | undefined;
  if (!row) { res.status(404).json({ error: 'Chat not found' }); return; }
  res.json(rowToChannel(row));
});

// POST /api/chats/sync - sync chats list from lark-cli
router.post('/sync', async (_req, res) => {
  try {
    const { syncChats } = await import('../services/syncChats.js');
    const result = await syncChats();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/chats/:chatId/sync-messages - sync messages for a specific chat
router.post('/:chatId/sync-messages', async (req, res) => {
  const { chatId } = req.params;
  const { maxMessages = 100 } = (req.body ?? {}) as { maxMessages?: number };
  try {
    const { syncChatMessages } = await import('../services/syncMessages.js');
    const result = await syncChatMessages(chatId, maxMessages);
    res.json({ success: !result.error, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
