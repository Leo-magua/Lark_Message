import { getDb } from '../db/connection.js';

/** 与 `events` + `event_topics` 表一致的行结构（列表/详情共用） */
export interface EventDbRow {
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

/** 列表/单条查询共用（子查询聚合主题） */
function baseSelectSql(): string {
  return `
    SELECT e.event_id, e.title, e.summary, COALESCE(e.speaker_highlights, '') AS speaker_highlights,
           e.source_chat_id, e.source_contact_id, e.occurred_at,
           COALESCE(e.timeline_hidden, 0) AS timeline_hidden,
           (SELECT GROUP_CONCAT(et.topic_id) FROM event_topics et WHERE et.event_id = e.event_id) AS topic_ids
    FROM events e
  `;
}

/**
 * 统一从 SQLite 读取事件（时间轴、事件管理、通讯录详情均走此逻辑，避免各路由 SQL 分叉）
 */
export function listEvents(opts: {
  /** true 时仅返回未从时间轴隐藏的条目（与 GET /api/timeline 一致） */
  onlyTimelineVisible?: boolean;
  limit: number;
  offset?: number;
}): EventDbRow[] {
  const db = getDb();
  const offset = Math.max(0, opts.offset ?? 0);
  const where = opts.onlyTimelineVisible ? ' WHERE COALESCE(e.timeline_hidden, 0) = 0' : '';
  return db
    .prepare(`${baseSelectSql()}${where} ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?`)
    .all(opts.limit, offset) as unknown as EventDbRow[];
}

/** 通讯录 open_id：与 AI 写入的 source_contact_id / source_chat_id 对齐 */
export function listEventsForContact(contactOpenId: string, limit: number): EventDbRow[] {
  const db = getDb();
  const lim = Math.max(1, Math.min(2000, limit));
  return db
    .prepare(
      `${baseSelectSql()}
       WHERE e.source_contact_id = ? OR e.source_chat_id = ?
       ORDER BY e.occurred_at DESC
       LIMIT ?`
    )
    .all(contactOpenId, contactOpenId, lim) as unknown as EventDbRow[];
}

export function getEventById(eventId: string): EventDbRow | undefined {
  const db = getDb();
  return db.prepare(`${baseSelectSql()} WHERE e.event_id = ?`).get(eventId) as unknown as EventDbRow | undefined;
}
