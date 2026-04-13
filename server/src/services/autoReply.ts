import { getDb } from '../db/connection.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\\74116\\AppData\\Roaming\\npm\\lark-cli.cmd`
  : 'lark-cli';

/** Minimum gap between auto-replies to the same chat (ms) */
const MIN_REPLY_INTERVAL_MS = 5 * 60 * 1000;

/** In-memory tracking of last auto-reply timestamp per chatId */
const lastRepliedAt: Map<string, number> = new Map();

// DB helpers

function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

// Auto-reply channel config

interface AutoReplyConfig {
  id: number;
  templateId: number | null;
  knowledgeTags: string[];
  customContext: string;
  enabled: number;
}

function getChannelConfig(channelType: 'person' | 'group', channelId: string): AutoReplyConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM auto_reply_config WHERE channel_type = ? AND channel_id = ?')
    .get(channelType, channelId) as any;
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    knowledgeTags: JSON.parse(row.knowledge_tags || '[]'),
    customContext: row.custom_context || '',
    enabled: row.enabled,
  };
}

// Knowledge base

function getKnowledgeByTags(tags: string[]): string {
  if (!tags.length) return '';

  const db = getDb();
  const placeholders = tags.map(() => '?').join(',');
  const rows = db.prepare(`SELECT title, content FROM knowledge_base WHERE 1=0 ${tags.map(t => `OR tags LIKE '%' || ? || '%'`).join('')}`).all(...tags) as { title: string; content: string }[];
  if (!rows.length) return '';

  const sections = rows.map(k => `【${k.title}】\n${k.content}`).join('\n\n');
  return `相关知识库：\n${sections}\n\n`;
}

// Template

interface Template {
  id: number;
  name: string;
  systemPrompt: string;
  description: string;
  isDefault: boolean;
}

function getTemplate(id: number | null): Template | null {
  const db = getDb();
  if (!id) {
    // Get default template
    const row = db.prepare('SELECT * FROM reply_templates WHERE is_default = 1 LIMIT 1').get() as any;
    if (!row) return null;
    return { id: row.id, name: row.name, systemPrompt: row.system_prompt, description: row.description || '', isDefault: true };
  }

  const row = db.prepare('SELECT * FROM reply_templates WHERE id = ?').get(id) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, systemPrompt: row.system_prompt, description: row.description || '', isDefault: Boolean(row.is_default) };
}

function buildSystemPrompt(config: AutoReplyConfig | null, basePrompt: string): string {
  const parts: string[] = [basePrompt];

  if (config) {
    // Template
    const template = getTemplate(config.templateId);
    if (template) {
      parts.push(`\n回复模板【${template.name}】：${template.systemPrompt}`);
    }

    // Knowledge base
    if (config.knowledgeTags.length > 0) {
      const kb = getKnowledgeByTags(config.knowledgeTags);
      if (kb) parts.push(kb);
    }

    // Custom context
    if (config.customContext) {
      parts.push(`补充信息：\n${config.customContext}`);
    }
  }

  return parts.join('\n');
}

// AI call

async function callOpenAI(userText: string, systemPrompt: string): Promise<string> {
  const apiKey = getSetting('openaiKey');
  const baseUrl = getSetting('openaiUrl') || 'https://api.openai.com/v1';
  const modelId = getSetting('modelId') || 'gpt-4o-mini';

  if (!apiKey) {
    console.log('[autoReply] No API key configured, using default reply');
    return '';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    console.error('[autoReply] OpenAI error:', response.status, await response.text());
    return '';
  }

  const data = await response.json() as any;
  // StepFun thinking models: content may be empty, check reasoning
  const message = data?.choices?.[0]?.message ?? {};
  return message.content || message.reasoning || '';
}

// Lark send helpers

async function sendToGroupChat(chatId: string, text: string): Promise<void> {
  await execFileAsync(LARK_CLI, [
    'im', '+messages-send',
    '--chat-id', chatId,
    '--msg-type', 'text',
    '--text', text,
    '--as', 'user',
  ], { shell: IS_WIN, timeout: 15_000 });
}

async function sendToP2P(openId: string, text: string): Promise<void> {
  await execFileAsync(LARK_CLI, [
    'im', '+messages-send',
    '--user-id', openId,
    '--msg-type', 'text',
    '--text', text,
    '--as', 'user',
  ], { shell: IS_WIN, timeout: 15_000 });
}

// ─── Batch auto-reply check ───────────────────────────────────────────────────

interface MessageRow {
  message_id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatAutoReplyRow {
  chat_id: string;
  chat_type: string | null;
}

interface ContactRow {
  open_id: string;
}

export async function checkAndAutoReplyAll(): Promise<void> {
  const db = getDb();

  const autoReplyChats = db.prepare(
    `SELECT chat_id, chat_type FROM chats WHERE auto_reply = 1`
  ).all() as unknown as ChatAutoReplyRow[];

  const personContacts = db.prepare(
    `SELECT open_id FROM contacts WHERE contact_type = 'person' AND COALESCE(auto_reply, 0) = 1`
  ).all() as unknown as ContactRow[];

  console.log(`[autoReply] Checking ${autoReplyChats.length} group chats + ${personContacts.length} person contacts`);

  for (const chat of autoReplyChats) {
    try {
      await processAutoReplyForChat(chat.chat_id, 'group');
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('[autoReply] Error processing chat ' + chat.chat_id + ':', err);
    }
  }

  for (const contact of personContacts) {
    try {
      await processAutoReplyForChat(contact.open_id, 'p2p');
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('[autoReply] Error processing contact ' + contact.open_id + ':', err);
    }
  }
}

async function processAutoReplyForChat(chatId: string, mode: 'group' | 'p2p'): Promise<void> {
  const lastTime = lastRepliedAt.get(chatId) ?? 0;
  if (Date.now() - lastTime < MIN_REPLY_INTERVAL_MS) {
    console.log(`[autoReply] Skipping ${chatId}: within ${MIN_REPLY_INTERVAL_MS / 60000}min cooldown`);
    return;
  }

  const db = getDb();

  const latestMsg = db.prepare(
    'SELECT message_id, chat_id, sender_id, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(chatId) as unknown as MessageRow | undefined;

  if (!latestMsg) return;
  if (!latestMsg.sender_id || latestMsg.content.length === 0) return;

  // Check if sender is self (skip own messages) — placeholder row open_id = 'me' if present
  const selfRow = db.prepare("SELECT open_id FROM contacts WHERE open_id = 'me'").get() as unknown as
    | { open_id: string }
    | undefined;
  if (selfRow && latestMsg.sender_id === selfRow.open_id) {
    return;
  }

  // Get channel config
  const channelType = mode === 'group' ? 'group' : 'person';
  const config = getChannelConfig(channelType, chatId);

  // If config exists and is disabled, skip
  if (config && !config.enabled) {
    return;
  }

  // Build system prompt
  const basePrompt = getSetting('kimiCommand') || '你是一个飞书助手，请简洁回复。';
  const systemPrompt = buildSystemPrompt(config, basePrompt);

  // Call AI
  let reply = systemPrompt ? await callOpenAI(latestMsg.content, systemPrompt) : '';
  if (!reply) reply = '收到，稍后回复';

  // Send
  if (mode === 'group') {
    await sendToGroupChat(chatId, reply);
  } else {
    await sendToP2P(chatId, reply);
  }

  lastRepliedAt.set(chatId, Date.now());
  console.log('[autoReply] Replied to ' + mode + ':' + chatId);
}
