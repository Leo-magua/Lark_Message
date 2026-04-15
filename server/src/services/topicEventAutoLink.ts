import { DEFAULT_MODEL_ID } from '../constants/defaultModelId.js';
import { getDb } from '../db/connection.js';

/** OpenAI 兼容 Chat Completions + 解析模型 JSON 输出（与 aiAnalyze 同配置源） */
function getAiSettings(): { openaiKey: string; openaiUrl: string; modelId: string } {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    openaiKey: map.openaiKey ?? '',
    openaiUrl: map.openaiUrl ?? 'https://api.openai.com/v1',
    modelId: map.modelId ?? DEFAULT_MODEL_ID,
  };
}

function stripCodeFences(s: string): string {
  let t = s.trim();
  t = t.replace(/^```(?:json)?\s*/i, '');
  t = t.replace(/```\s*$/i, '');
  return t.trim();
}

function relaxJsonCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

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
    return parts.join('');
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

async function callLlmJsonObject(userPrompt: string, systemPrompt: string): Promise<string | { error: string }> {
  const { openaiKey, openaiUrl, modelId } = getAiSettings();
  if (!openaiKey.trim()) {
    return { error: 'API key not configured' };
  }

  const endpoint = openaiUrl.replace(/\/$/, '') + '/chat/completions';
  const basePayload = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.15,
    max_tokens: 2048,
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
    return { error: `LLM API error: ${response.status} ${txt.slice(0, 400)}` };
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choices = data.choices;
  const first =
    Array.isArray(choices) && choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const text =
    concatModelOutputText(message).trim() ||
    (typeof first?.text === 'string' ? (first.text as string).trim() : '');
  if (!text) return { error: 'Empty model output' };
  return text;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const candidates = [
    extractBalancedJsonObject(stripCodeFences(trimmed)),
    extractBalancedJsonObject(trimmed),
    stripCodeFences(trimmed),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const smart = c.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    for (const variant of [c, smart, relaxJsonCommas(c), relaxJsonCommas(smart)]) {
      try {
        const parsed = JSON.parse(variant) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

export function replaceEventTopicsForEvent(eventId: string, topicIds: string[]): void {
  const db = getDb();
  db.prepare('DELETE FROM event_topics WHERE event_id = ?').run(eventId);
  const ins = db.prepare('INSERT OR IGNORE INTO event_topics (event_id, topic_id) VALUES (?, ?)');
  for (const tid of topicIds) {
    const t = typeof tid === 'string' ? tid.trim() : '';
    if (t) ins.run(eventId, t);
  }
}

interface TopicRow {
  topic_id: string;
  name: string;
  topic_context: string;
}

function loadAllTopics(): TopicRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT topic_id, name,
              COALESCE(topic_context, '') AS topic_context
       FROM topics ORDER BY id ASC`
    )
    .all() as unknown as TopicRow[];
}

/**
 * 根据当前事件正文，重新判断与**所有**主题的关联，并写回 event_topics（全量替换）。
 */
export async function relinkEventToAllTopics(
  eventId: string,
  opts?: { userSuggestedTopicIds?: string[] }
): Promise<{ topic_ids: string[]; error?: string }> {
  const db = getDb();
  const ev = db
    .prepare(
      `SELECT event_id, title, summary, COALESCE(speaker_highlights, '') AS speaker_highlights
       FROM events WHERE event_id = ?`
    )
    .get(eventId) as
    | { event_id: string; title: string; summary: string; speaker_highlights: string }
    | undefined;
  if (!ev) {
    return { topic_ids: [], error: 'Event not found' };
  }

  const topics = loadAllTopics();
  if (topics.length === 0) {
    replaceEventTopicsForEvent(eventId, []);
    return { topic_ids: [] };
  }

  const topicBlock = topics
    .map(
      (t, i) =>
        `${i + 1}. id=${t.topic_id} | 名称=${t.name}${t.topic_context ? ` | 说明=${t.topic_context.slice(0, 200)}` : ''}`
    )
    .join('\n');

  const hint =
    opts?.userSuggestedTopicIds?.length ?
      `\n用户曾勾选的主题 id（仅供参考，最终以事件内容为准）：${opts.userSuggestedTopicIds.join(', ')}`
      : '';

  const userPrompt = `主题列表（topic_ids 必须且只能从中选取）：
${topicBlock}

事件：
- id: ${ev.event_id}
- 标题: ${ev.title}
- 摘要: ${(ev.summary ?? '').slice(0, 800)}
- 发言要点: ${(ev.speaker_highlights ?? '').slice(0, 600)}${hint}

请输出 JSON：{"topic_ids":["..."]} ，只包含与事件**内容相关**的主题 id；完全无关不要选。`;

  const systemPrompt = `你是事件-主题分类器。只输出一个 JSON 对象，键名必须为 topic_ids，值为字符串数组（主题 id）。不要输出 Markdown。`;

  const raw = await callLlmJsonObject(userPrompt, systemPrompt);
  if (typeof raw !== 'string') {
    return { topic_ids: [], error: 'error' in raw ? raw.error : 'LLM error' };
  }

  const obj = parseJsonObject(raw);
  const arr = obj?.topic_ids;
  const allowed = new Set(topics.map(t => t.topic_id));
  const picked = Array.isArray(arr)
    ? (arr as unknown[]).filter((x): x is string => typeof x === 'string' && allowed.has(x.trim())).map(x => x.trim())
    : [];

  const unique = [...new Set(picked)];
  replaceEventTopicsForEvent(eventId, unique);
  return { topic_ids: unique };
}

const BATCH = 22;
const MAX_EVENTS_FOR_NEW_TOPIC = 2400;

/**
 * 新建主题后：对历史全量事件分批判断是否与该主题相关，写入 event_topics。
 */
export async function linkNewTopicAcrossAllEvents(newTopicId: string): Promise<{
  scanned: number;
  linked: number;
  batches: number;
  error?: string;
}> {
  const db = getDb();
  const topic = db
    .prepare(
      `SELECT topic_id, name, COALESCE(topic_context, '') AS topic_context FROM topics WHERE topic_id = ?`
    )
    .get(newTopicId) as TopicRow | undefined;
  if (!topic) {
    return { scanned: 0, linked: 0, batches: 0, error: 'Topic not found' };
  }

  const events = db
    .prepare(
      `SELECT event_id, title, summary, COALESCE(speaker_highlights, '') AS speaker_highlights
       FROM events ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(MAX_EVENTS_FOR_NEW_TOPIC) as Array<{
    event_id: string;
    title: string;
    summary: string;
    speaker_highlights: string;
  }>;

  if (events.length === 0) {
    return { scanned: 0, linked: 0, batches: 0 };
  }

  const topicDesc = `id=${topic.topic_id}\n名称=${topic.name}${topic.topic_context ? `\n说明=${topic.topic_context.slice(0, 500)}` : ''}`;

  let batches = 0;
  const ins = db.prepare('INSERT OR IGNORE INTO event_topics (event_id, topic_id) VALUES (?, ?)');

  for (let i = 0; i < events.length; i += BATCH) {
    const chunk = events.slice(i, i + BATCH);
    const idSet = new Set(chunk.map(e => e.event_id));
    const lines = chunk
      .map(
        e =>
          `- ${e.event_id} | ${e.title.slice(0, 80)} | ${(e.summary ?? '').slice(0, 120)} | ${(e.speaker_highlights ?? '').slice(0, 80)}`
      )
      .join('\n');

    const userPrompt = `新主题：
${topicDesc}

下列事件每行格式：event_id | 标题摘要片段 | 发言要点片段
请判断哪些事件**在内容上**与该主题相关（宁缺毋滥）。只输出 JSON：{"event_ids":["evt_...", ...]} ，event_ids 必须全部来自下面列表中的 id，不要编造 id。

事件列表：
${lines}`;

    const systemPrompt =
      '你是主题归类助手。只输出一个 JSON 对象，键名必须为 event_ids，值为字符串数组。不要输出 Markdown。';

    const raw = await callLlmJsonObject(userPrompt, systemPrompt);
    batches++;
    if (typeof raw !== 'string') {
      await new Promise(r => setTimeout(r, 150));
      continue;
    }
    const obj = parseJsonObject(raw);
    const arr = obj?.event_ids;
    const ids = Array.isArray(arr)
      ? (arr as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map(x => x.trim())
          .filter(id => idSet.has(id))
      : [];

    for (const eventId of [...new Set(ids)]) {
      try {
        ins.run(eventId, newTopicId);
      } catch {
        /* ignore */
      }
    }
    await new Promise(r => setTimeout(r, 120));
  }

  const linkedRow = db
    .prepare('SELECT COUNT(*) AS n FROM event_topics WHERE topic_id = ?')
    .get(newTopicId) as { n: number };
  const linked = linkedRow?.n ?? 0;

  return { scanned: events.length, linked, batches };
}
