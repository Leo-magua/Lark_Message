import { getDb } from '../db/connection.js';

function getLlmSettings(): { openaiKey: string; openaiUrl: string; modelId: string } {
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

/**
 * 根据本地已同步消息，用 LLM 生成一段「简介」纯文本（写入 contacts.intro 由路由负责）
 */
export async function summarizeContactIntro(params: {
  contactId: string;
  contactName: string;
  contactType: 'person' | 'group';
}): Promise<{ intro: string } | { error: string }> {
  const { openaiKey, openaiUrl, modelId } = getLlmSettings();
  if (!openaiKey) return { error: 'API key not configured' };

  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT sender_name, content, created_at
    FROM messages
    WHERE chat_id = ? OR sender_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `
    )
    .all(params.contactId, params.contactId) as Array<{
    sender_name: string | null;
    content: string | null;
    created_at: string | null;
  }>;

  if (rows.length === 0) return { error: 'No messages to summarize' };

  const chron = [...rows].reverse();
  const lines = chron
    .map(m => {
      const who = m.sender_name?.trim() || '未知';
      const t = m.created_at ?? '';
      const body = (m.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
      return `[${t}] ${who}: ${body}`;
    })
    .join('\n');

  const typeLabel = params.contactType === 'group' ? '群聊' : '单聊/联系人';
  const system = `你是助手。请根据用户提供的聊天记录，用中文写一段「简介」（纯文本，不要 markdown，不要标题）。
要求：3～8 句，概括对话主要话题、氛围、关键事项；不要逐条复述消息；不要编造聊天记录里没有的事实。`;

  const user = `对象名称：${params.contactName}\n类型：${typeLabel}\n\n近期消息（按时间顺序）：\n${lines}`;

  const endpoint = openaiUrl.replace(/\/$/, '') + '/chat/completions';
  const basePayload = {
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
    max_tokens: 1200,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(basePayload),
    });
    if (!response.ok) {
      const t = await response.text();
      console.error('[contactIntroSummarize] LLM error:', response.status, t.slice(0, 500));
      return { error: `LLM API error: ${response.status}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices;
    const first =
      Array.isArray(choices) && choices.length > 0 ? (choices[0] as Record<string, unknown>) : undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    let text = concatModelOutputText(message);
    if (!text.trim()) {
      const legacy = first?.text;
      text = typeof legacy === 'string' ? legacy : '';
    }
    text = text.replace(/^```[\s\S]*?```/m, '').trim();
    if (!text) return { error: 'LLM returned empty text' };
    return { intro: text };
  } catch (e) {
    console.error('[contactIntroSummarize] fetch', e);
    return { error: `Network error: ${String(e)}` };
  }
}
