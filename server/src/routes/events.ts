import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';

const router = Router();

interface EventDbRow {
  event_id: string;
  title: string;
  summary: string;
  speaker_highlights: string | null;
  source_chat_id: string | null;
  source_contact_id: string | null;
  occurred_at: string;
  timeline_hidden: number | null;
  topic_ids: string | null;
}

function replaceEventTopics(eventId: string, topicIds: string[]) {
  const db = getDb();
  db.prepare('DELETE FROM event_topics WHERE event_id = ?').run(eventId);
  const ins = db.prepare('INSERT OR IGNORE INTO event_topics (event_id, topic_id) VALUES (?, ?)');
  for (const tid of topicIds) {
    const t = typeof tid === 'string' ? tid.trim() : '';
    if (t) ins.run(eventId, t);
  }
}

function mapRow(row: EventDbRow) {
  return {
    id: row.event_id,
    title: row.title,
    summary: row.summary ?? '',
    speaker_highlights: row.speaker_highlights ?? '',
    topics: row.topic_ids ? row.topic_ids.split(',').filter(Boolean) : [],
    occurred_at: row.occurred_at,
    source_contact_id: row.source_contact_id ?? undefined,
    source_chat_id: row.source_chat_id ?? undefined,
    timeline_hidden: Boolean(row.timeline_hidden),
  };
}

/** 列表/单条查询共用（子查询聚合主题，避免 GROUP BY 与列兼容问题） */
function baseSelectSql(): string {
  return `
    SELECT e.event_id, e.title, e.summary, COALESCE(e.speaker_highlights, '') AS speaker_highlights,
           e.source_chat_id, e.source_contact_id, e.occurred_at,
           COALESCE(e.timeline_hidden, 0) AS timeline_hidden,
           (SELECT GROUP_CONCAT(et.topic_id) FROM event_topics et WHERE et.event_id = e.event_id) AS topic_ids
    FROM events e
  `;
}

// GET /api/events?limit=500&offset=0
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(2000, Math.max(1, parseInt(String(req.query.limit ?? '500'), 10) || 500));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
  const rows = db
    .prepare(`${baseSelectSql()} ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as unknown as EventDbRow[];
  res.json({ events: rows.map(mapRow) });
});

// POST /api/events/bulk-delete  （须放在 /:eventId 之前）
router.post('/bulk-delete', (req, res) => {
  const db = getDb();
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids (string[]) is required' });
    return;
  }
  const delEt = db.prepare('DELETE FROM event_topics WHERE event_id = ?');
  const delEv = db.prepare('DELETE FROM events WHERE event_id = ?');
  let deleted = 0;
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) continue;
    delEt.run(id);
    delEv.run(id);
    deleted++;
  }
  res.json({ success: true, deleted });
});

// POST /api/events — 新增
router.post('/', (req, res) => {
  const db = getDb();
  const body = req.body as {
    title?: string;
    summary?: string;
    speaker_highlights?: string;
    occurred_at?: string;
    topic_ids?: string[];
    timeline_hidden?: boolean;
    source_chat_id?: string | null;
    source_contact_id?: string | null;
  };
  if (!body.title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const occurredAt = body.occurred_at?.trim() || new Date().toISOString();
  const hidden = body.timeline_hidden ? 1 : 0;
  db.prepare(
    `INSERT INTO events (event_id, title, summary, speaker_highlights, source_chat_id, source_contact_id, occurred_at, timeline_hidden)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    body.title.trim(),
    body.summary?.trim() ?? '',
    body.speaker_highlights?.trim() ?? '',
    body.source_chat_id ?? null,
    body.source_contact_id ?? null,
    occurredAt,
    hidden
  );
  if (Array.isArray(body.topic_ids) && body.topic_ids.length > 0) {
    replaceEventTopics(eventId, body.topic_ids);
  }
  const row = db.prepare(`${baseSelectSql()} WHERE e.event_id = ?`).get(eventId) as unknown as EventDbRow | undefined;
  res.status(201).json(row ? mapRow(row) : { id: eventId });
});

// GET /api/events/:eventId
router.get('/:eventId', (req, res) => {
  const db = getDb();
  const row = db
    .prepare(`${baseSelectSql()} WHERE e.event_id = ?`)
    .get(req.params.eventId) as unknown as EventDbRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(mapRow(row));
});

// PATCH /api/events/:eventId
router.patch('/:eventId', (req, res) => {
  const db = getDb();
  const { eventId } = req.params;
  const body = req.body as {
    title?: string;
    summary?: string;
    speaker_highlights?: string;
    occurred_at?: string;
    timeline_hidden?: boolean;
    topic_ids?: string[];
    source_chat_id?: string | null;
    source_contact_id?: string | null;
  };
  const exists = db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId);
  if (!exists) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  if (body.title !== undefined) {
    updates.push('title = ?');
    params.push(body.title);
  }
  if (body.summary !== undefined) {
    updates.push('summary = ?');
    params.push(body.summary);
  }
  if (body.speaker_highlights !== undefined) {
    updates.push('speaker_highlights = ?');
    params.push(body.speaker_highlights);
  }
  if (body.occurred_at !== undefined) {
    updates.push('occurred_at = ?');
    params.push(body.occurred_at);
  }
  if (body.timeline_hidden !== undefined) {
    updates.push('timeline_hidden = ?');
    params.push(body.timeline_hidden ? 1 : 0);
  }
  if (body.source_chat_id !== undefined) {
    updates.push('source_chat_id = ?');
    params.push(body.source_chat_id);
  }
  if (body.source_contact_id !== undefined) {
    updates.push('source_contact_id = ?');
    params.push(body.source_contact_id);
  }

  if (updates.length) {
    params.push(eventId);
    db.prepare(`UPDATE events SET ${updates.join(', ')} WHERE event_id = ?`).run(...params);
  }
  if (body.topic_ids !== undefined) {
    replaceEventTopics(eventId, Array.isArray(body.topic_ids) ? body.topic_ids : []);
  }

  const row = db.prepare(`${baseSelectSql()} WHERE e.event_id = ?`).get(eventId) as unknown as EventDbRow;
  res.json(mapRow(row));
});

// DELETE /api/events/:eventId — 从数据库彻底删除
router.delete('/:eventId', (req, res) => {
  const db = getDb();
  const { eventId } = req.params;
  const existed = db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId);
  if (!existed) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  db.prepare('DELETE FROM event_topics WHERE event_id = ?').run(eventId);
  db.prepare('DELETE FROM events WHERE event_id = ?').run(eventId);
  res.json({ success: true });
});

export default router;
