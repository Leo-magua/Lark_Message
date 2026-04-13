import { getDb } from '../db/connection.js';

interface AnalyzeResult {
  events: Array<{
    event_id: string;
    title: string;
    summary: string;
    /** 主要发言者及观点/原话要点，便于追溯「谁说了什么」 */
    speaker_highlights: string;
    topics: string[];
    occurred_at: string;
  }>;
  new_topics: string[];
}

interface MessageRow {
  sender_name: string | null;
  created_at: string | null;
  content: string | null;
  chat_id: string;
}

interface TopicRow {
  topic_id: string;
  name: string;
  color: string;
}

function getSettings(): { openaiKey: string; openaiUrl: string; modelId: string } {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    openaiKey: map.openaiKey ?? '',
    openaiUrl: map.openaiUrl ?? 'https://api.openai.com/v1',
    modelId: map.modelId ?? 'gpt-4o-mini',
  };
}

function getExistingTopics(): TopicRow[] {
  const db = getDb();
  return db.prepare('SELECT topic_id, name, color FROM topics ORDER BY id ASC').all() as unknown as TopicRow[];
}

function buildPrompt(messages: MessageRow[], existingTopics: TopicRow[]): string {
  const topicList = existingTopics.map(t => `"${t.name}"`).join('、') || '（暂无）';

  const msgLines = messages
    .slice(0, 50)
    .map(m => {
      const sender = m.sender_name ?? '未知';
      const time = m.created_at ?? '';
      const content = (m.content ?? '').slice(0, 200);
      return `[${time}] ${sender}: ${content}`;
    })
    .join('\n');

  return `当前已有主题：${topicList}

消息记录（每条前缀为发言者展示名，请据此识别「谁说了什么」）：
${msgLines}`;
}

const SYSTEM_PROMPT = `你是一个消息分析助手，从飞书聊天记录中识别关键事件和主题。

要求：
1. 识别出 3-8 个关键事件（每个事件代表一个具体的事情/任务/讨论）
2. 为每个事件打上 1-3 个主题标签（优先复用已有主题，确实没有再创建新主题）
3. 每个事件除概括事情外，必须在 speaker_highlights 中用中文简要写出：哪些人发表了什么观点或关键原话（可多条，用分号分隔；若记录中无法判断说话人则填「记录中发言者不明」）
4. 只输出一个 JSON 对象，不要使用 Markdown 代码块包裹，不要输出 JSON 以外的说明文字

返回格式：
{
  "events": [
    {
      "event_id": "唯一ID（用数字或字母组合，不超过20字符）",
      "title": "事件简短标题（10字内）",
      "summary": "事件摘要（50字内）",
      "speaker_highlights": "张三：支持方案A；李四：担心排期",
      "topics": ["主题1", "主题2"],
      "occurred_at": "ISO时间字符串"
    }
  ],
  "new_topics": ["新主题1", "新主题2"]
}`;

/** OpenAI 兼容：content 可能是 string 或 multimodal 片段数组 */
function extractMessageText(message: Record<string, unknown> | undefined): string {
  if (!message) return '';
  const c = message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const p of c) {
      if (!p || typeof p !== 'object') continue;
      const o = p as Record<string, unknown>;
      if (o.type === 'text' && typeof o.text === 'string') parts.push(o.text);
      else if (typeof o.content === 'string') parts.push(o.content);
    }
    return parts.join('\n');
  }
  return '';
}

function concatModelOutputText(message: Record<string, unknown> | undefined): string {
  if (!message) return '';
  const chunks = [
    extractMessageText(message),
    typeof message.reasoning === 'string' ? message.reasoning : '',
    typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
  ];
  return chunks.filter(Boolean).join('\n');
}

function stripCodeFences(s: string): string {
  let t = s.trim();
  t = t.replace(/^```(?:json)?\s*/i, '');
  t = t.replace(/```\s*$/i, '');
  return t.trim();
}

/** 从首个 { 起括号平衡截取，避免 /\\{.*\\}/s 在嵌套 JSON 上截断 */
function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 去掉模型偶发的尾随逗号 */
function relaxJsonCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

function normalizeAnalyzeEvents(raw: unknown): AnalyzeResult['events'] {
  if (!Array.isArray(raw)) return [];
  const out: AnalyzeResult['events'] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const event_id = String(e.event_id ?? '').trim();
    const title = String(e.title ?? '').trim();
    if (!event_id || !title) continue;
    const shRaw = e.speaker_highlights;
    const speaker_highlights =
      typeof shRaw === 'string' ? shRaw.trim() : String(shRaw ?? '').trim().slice(0, 800);
    out.push({
      event_id,
      title,
      summary: typeof e.summary === 'string' ? e.summary : '',
      speaker_highlights,
      topics: Array.isArray(e.topics)
        ? (e.topics as unknown[]).filter((t): t is string => typeof t === 'string')
        : [],
      occurred_at: typeof e.occurred_at === 'string' ? e.occurred_at : '',
    });
  }
  return out;
}

function parseAnalyzeResultFromModelText(rawJson: string): AnalyzeResult | null {
  const trimmed = rawJson.trim();
  if (!trimmed) return null;

  const tryParse = (s: string): AnalyzeResult | null => {
    for (const variant of [s, relaxJsonCommas(s)]) {
      try {
        const parsed = JSON.parse(variant) as unknown;
        if (!parsed || typeof parsed !== 'object') continue;
        const obj = parsed as Record<string, unknown>;
        return {
          events: normalizeAnalyzeEvents(obj.events),
          new_topics: Array.isArray(obj.new_topics) ? (obj.new_topics as string[]) : [],
        };
      } catch {
        /* try next variant */
      }
    }
    return null;
  };

  const cleaned = stripCodeFences(trimmed);
  const candidates = [
    extractBalancedJsonObject(cleaned),
    extractBalancedJsonObject(trimmed),
    cleaned,
    trimmed,
  ].filter((x): x is string => Boolean(x && x.trim()));

  for (const c of candidates) {
    const r = tryParse(c);
    if (r) return r;
  }
  return null;
}

export async function analyzeMessages(
  messages: MessageRow[],
  contactId?: string,
  chatId?: string
): Promise<AnalyzeResult | { error: string }> {
  const { openaiKey, openaiUrl, modelId } = getSettings();

  if (!openaiKey) {
    return { error: 'API key not configured' };
  }

  if (messages.length === 0) {
    return { error: 'No messages to analyze' };
  }

  const existingTopics = getExistingTopics();
  const userPrompt = buildPrompt(messages, existingTopics);

  let rawJson = '';
  try {
    const endpoint = openaiUrl.replace(/\/$/, '') + '/chat/completions';

    const basePayload = {
      model: modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    };

    const post = (extra: Record<string, unknown>) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({ ...basePayload, ...extra }),
      });

    let response = await post({ response_format: { type: 'json_object' } });
    let errBody = '';
    if (!response.ok) {
      errBody = await response.text();
      if (
        response.status === 400 &&
        /response_format|json_object|unsupported|unknown parameter|invalid/i.test(errBody)
      ) {
        response = await post({});
        errBody = '';
      }
    }
    if (!response.ok) {
      const txt = errBody || (await response.text());
      console.error('[aiAnalyze] LLM API error:', response.status, txt.slice(0, 1200));
      return { error: `LLM API error: ${response.status}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices;
    const first =
      Array.isArray(choices) && choices.length > 0
        ? (choices[0] as Record<string, unknown>)
        : undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    rawJson = concatModelOutputText(message);
    if (!rawJson.trim()) {
      const legacyText = first?.text;
      rawJson = typeof legacyText === 'string' ? legacyText : '';
    }
  } catch (err) {
    console.error('[aiAnalyze] Fetch error:', err);
    return { error: `Network error: ${String(err)}` };
  }

  const result = parseAnalyzeResultFromModelText(rawJson);
  if (!result) {
    console.error('[aiAnalyze] Non-JSON model output (first 1500 chars):', rawJson.slice(0, 1500));
    return { error: 'LLM returned non-JSON response' };
  }

  // Persist to DB
  const db = getDb();
  const existingTopicNames = new Set(existingTopics.map(t => t.name));

  // Insert new topics
  const newTopicNames = Array.isArray(result.new_topics) ? result.new_topics : [];
  const topicNameToId: Record<string, string> = {};

  // Seed existing topics into map
  for (const t of existingTopics) topicNameToId[t.name] = t.topic_id;

  for (const topicName of newTopicNames) {
    if (!existingTopicNames.has(topicName)) {
      const topicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const colorIndex = (existingTopics.length % 6).toString();
      try {
        db.prepare(
          'INSERT OR IGNORE INTO topics (topic_id, name, color, visible) VALUES (?, ?, ?, 1)'
        ).run(topicId, topicName, colorIndex);
        topicNameToId[topicName] = topicId;
        existingTopicNames.add(topicName);
        existingTopics.push({ topic_id: topicId, name: topicName, color: colorIndex });
        console.log(`[aiAnalyze] Created new topic: ${topicName} (${topicId})`);
      } catch (e) {
        console.warn('[aiAnalyze] Failed to insert topic:', topicName, e);
      }
    }
  }

  // Insert events and event_topics
  const events = Array.isArray(result.events) ? result.events : [];
  for (const ev of events) {
    if (!ev.event_id || !ev.title) continue;

    const eventId = ev.event_id;
    const occurredAt = ev.occurred_at || new Date().toISOString();

    try {
      db.prepare(`
        INSERT OR IGNORE INTO events (event_id, title, summary, speaker_highlights, source_chat_id, source_contact_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        ev.title,
        ev.summary ?? '',
        ev.speaker_highlights ?? '',
        chatId ?? null,
        contactId ?? null,
        occurredAt
      );
    } catch (e) {
      console.warn('[aiAnalyze] Failed to insert event:', eventId, e);
      continue;
    }

    // Link topics
    const topicNames = Array.isArray(ev.topics) ? ev.topics : [];
    for (const topicName of topicNames) {
      const topicId = topicNameToId[topicName];
      if (!topicId) continue;
      try {
        db.prepare(
          'INSERT OR IGNORE INTO event_topics (event_id, topic_id) VALUES (?, ?)'
        ).run(eventId, topicId);
      } catch (e) {
        console.warn('[aiAnalyze] Failed to insert event_topic:', eventId, topicId, e);
      }
    }
  }

  console.log(`[aiAnalyze] Done: ${events.length} events, ${newTopicNames.length} new topics`);
  return result;
}

export async function analyzeContactMessages(
  contactId: string,
  limit = 50
): Promise<AnalyzeResult | { error: string }> {
  const db = getDb();
  const lim = Math.max(1, Math.min(500, Number.isFinite(Number(limit)) ? Number(limit) : 50));
  const messages = db.prepare(`
    SELECT sender_name, created_at, content, chat_id
    FROM messages
    WHERE chat_id = ? OR sender_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(contactId, contactId, lim) as unknown as MessageRow[];

  return analyzeMessages(messages, contactId, undefined);
}

export async function analyzeAllContacts(limit = 50): Promise<{ processed: number; errors: string[] }> {
  const db = getDb();

  // Get all unique chat_ids that have messages
  const chatRows = db.prepare(`
    SELECT DISTINCT chat_id FROM messages ORDER BY chat_id
  `).all() as unknown as { chat_id: string }[];

  let processed = 0;
  const errors: string[] = [];

  for (const { chat_id } of chatRows) {
    const messages = db.prepare(`
      SELECT sender_name, created_at, content, chat_id
      FROM messages
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(chat_id, limit) as unknown as MessageRow[];

    const result = await analyzeMessages(messages, undefined, chat_id);
    if ('error' in result) {
      errors.push(`${chat_id}: ${result.error}`);
      // Stop on API key error
      if (result.error === 'API key not configured') break;
    } else {
      processed++;
    }
  }

  return { processed, errors };
}
