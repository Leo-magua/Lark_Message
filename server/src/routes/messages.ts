import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { listEvents } from '../repositories/eventsRead.js';
import { syncAllMonitoredChats, syncChatMessages } from '../services/syncMessages.js';

const router = Router();

interface MessageRow {
  id: number;
  message_id: string;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string | null;
  message_type: string | null;
  topic_id: string | null;
  created_at: string | null;
}

interface TopicRow {
  id: number;
  topic_id: string;
  name: string;
  color: string;
  visible: number;
}

// GET /api/messages?chatId=&limit=50&offset=0
router.get('/', (req, res) => {
  const db = getDb();
  const { chatId, limit = '50', offset = '0' } = req.query as Record<string, string>;

  let rows: MessageRow[];
  if (chatId) {
    rows = db.prepare(`
      SELECT * FROM messages WHERE chat_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(chatId, Number(limit), Number(offset)) as unknown as MessageRow[];
  } else {
    rows = db.prepare(`
      SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(Number(limit), Number(offset)) as unknown as MessageRow[];
  }

  res.json(rows);
});

// GET /api/timeline
// Returns AI-analyzed events and all topics（事件行与 GET /api/events 同源，仅多过滤 timeline_hidden）
router.get('/timeline', (_req, res) => {
  const db = getDb();

  const TIMELINE_EVENT_LIMIT = 2000;
  const eventRows = listEvents({
    onlyTimelineVisible: true,
    limit: TIMELINE_EVENT_LIMIT,
    offset: 0,
  });

  // Fetch all topics
  const topicRows = db.prepare(
    'SELECT id, topic_id, name, color, visible FROM topics ORDER BY id ASC'
  ).all() as unknown as TopicRow[];

  const events = eventRows.map(row => ({
    id: row.event_id,
    title: row.title,
    summary: row.summary ?? '',
    speaker_highlights: row.speaker_highlights ?? '',
    topics: row.topic_ids ? row.topic_ids.split(',').filter(Boolean) : [],
    occurred_at: row.occurred_at,
    source_contact_id: row.source_contact_id ?? undefined,
    source_chat_id: row.source_chat_id ?? undefined,
  }));

  const topics = topicRows.map(r => ({
    id: String(r.id),
    topic_id: r.topic_id,
    name: r.name,
    color: r.color,
    visible: Boolean(r.visible),
  }));

  res.json({ events, topics });
});

// GET /api/topics
router.get('/topics', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, topic_id, name, color, visible FROM topics ORDER BY id ASC').all() as unknown as TopicRow[];
  res.json(rows.map(r => ({
    id: r.topic_id,
    topic_id: r.topic_id,
    name: r.name,
    color: r.color,
    visible: Boolean(r.visible),
  })));
});

// POST /api/topics
router.post('/topics', (req, res) => {
  const db = getDb();
  const { name, color = '0' } = req.body as { name: string; color?: string };
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const topicId = `topic_${Date.now()}`;
  db.prepare('INSERT INTO topics (topic_id, name, color, visible) VALUES (?, ?, ?, 1)').run(topicId, name, color);
  res.json({ id: topicId, topic_id: topicId, name, color, visible: true });
});

// DELETE /api/topics/:topicId
router.delete('/topics/:topicId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM topics WHERE topic_id = ?').run(req.params.topicId);
  res.json({ success: true });
});

// PATCH /api/topics/:topicId
router.patch('/topics/:topicId', (req, res) => {
  const db = getDb();
  const { visible, name } = req.body as { visible?: boolean; name?: string };
  const { topicId } = req.params;
  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  if (visible !== undefined) { updates.push('visible = ?'); params.push(visible ? 1 : 0); }
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (!updates.length) { res.status(400).json({ error: 'nothing to update' }); return; }
  params.push(topicId);
  db.prepare(`UPDATE topics SET ${updates.join(', ')} WHERE topic_id = ?`).run(...params);
  res.json({ success: true });
});

// POST /api/messages/sync - sync messages for all monitored chats
router.post('/sync', async (req, res) => {
  const { fullSyncCap } = (req.body ?? {}) as { fullSyncCap?: number };
  try {
    const cap = fullSyncCap === undefined ? undefined : Number(fullSyncCap);
    const result = await syncAllMonitoredChats(Number.isFinite(cap) ? { fullSyncCap: cap } : undefined);
    res.json({
      success: true,
      totalInserted: result.totalInserted,
      chats: result.results.length,
      results: result.results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/messages/sync/:chatId - sync messages for a single chat
router.post('/sync/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const { maxMessages = 50 } = (req.body ?? {}) as { maxMessages?: number };
  try {
    const result = await syncChatMessages(chatId, maxMessages);
    res.json({ success: !result.error, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/messages/sync-contact/:contactId - sync P2P messages for a person contact
router.post('/sync-contact/:contactId', async (req, res) => {
  const { contactId } = req.params;
  const { maxMessages = 50 } = (req.body ?? {}) as { maxMessages?: number };
  try {
    const result = await syncChatMessages(contactId, maxMessages, 'p2p', contactId);
    res.json({ success: !result.error, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// DELETE /api/messages/:id - delete a single message
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  db.prepare('DELETE FROM messages WHERE id = ?').run(Number(id));
  res.json({ success: true });
});

// POST /api/messages/bulk-delete - delete multiple messages by IDs
router.post('/bulk-delete', (req, res) => {
  const db = getDb();
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array is required' });
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
  res.json({ success: true, deleted: ids.length });
});

export default router;
