import { getDb } from '../db/connection.js';

interface AnalyzeResult {
  events: Array<{
    event_id: string;
    title: string;
    summary: string;
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

消息记录：
${msgLines}`;
}

const SYSTEM_PROMPT = `你是一个消息分析助手，从飞书聊天记录中识别关键事件和主题。

要求：
1. 识别出 3-8 个关键事件（每个事件代表一个具体的事情/任务/讨论）
2. 为每个事件打上 1-3 个主题标签（优先复用已有主题，确实没有再创建新主题）
3. 返回严格的 JSON 格式，不要有多余文字

返回格式：
{
  "events": [
    {
      "event_id": "唯一ID（用数字或字母组合，不超过20字符）",
      "title": "事件简短标题（10字内）",
      "summary": "事件摘要（50字内）",
      "topics": ["主题1", "主题2"],
      "occurred_at": "ISO时间字符串"
    }
  ],
  "new_topics": ["新主题1", "新主题2"]
}`;

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

  let rawJson: string;
  try {
    const endpoint = openaiUrl.replace(/\/$/, '') + '/chat/completions';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[aiAnalyze] LLM API error:', response.status, errText);
      return { error: `LLM API error: ${response.status}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    // StepFun models may put output in 'reasoning' field for thinking models
    const message = data?.choices?.[0]?.message ?? {};
    rawJson = message.content || message.reasoning || '';
  } catch (err) {
    console.error('[aiAnalyze] Fetch error:', err);
    return { error: `Network error: ${String(err)}` };
  }

  // Parse JSON from LLM — strip markdown and extract JSON object
  let result: AnalyzeResult;
  try {
    // Remove markdown code fences
    let cleaned = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    
    // Try to find JSON object in the text (in case model adds explanatory text)
    const jsonMatch = cleaned.match(/\{.*\}/s);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    result = JSON.parse(cleaned) as AnalyzeResult;
  } catch (err) {
    console.error('[aiAnalyze] JSON parse error. Raw:', rawJson.slice(0, 200), err);
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
        INSERT OR IGNORE INTO events (event_id, title, summary, source_chat_id, source_contact_id, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, ev.title, ev.summary ?? '', chatId ?? null, contactId ?? null, occurredAt);
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
  const messages = db.prepare(`
    SELECT sender_name, created_at, content, chat_id
    FROM messages
    WHERE chat_id = ? OR sender_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(contactId, contactId, limit) as unknown as MessageRow[];

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
