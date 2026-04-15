import { DEFAULT_MODEL_ID } from '../constants/defaultModelId.js';
import { getDb } from '../db/connection.js';
import { getCurrentUser } from './larkCli.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\\74116\\AppData\\Roaming\\npm\\lark-cli.cmd`
  : 'lark-cli';

// ─── Self open_id cache ───────────────────────────────────────────────────────

let cachedSelfOpenId: string | null = null;

async function getSelfOpenId(): Promise<string> {
  if (cachedSelfOpenId) return cachedSelfOpenId;

  // Try DB first (persisted from a previous run)
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'selfOpenId'`).get() as { value: string } | undefined;
  if (row?.value) {
    cachedSelfOpenId = row.value;
    return cachedSelfOpenId;
  }

  // Fetch from lark-cli and persist
  try {
    const user = await getCurrentUser();
    const openId = user.open_id;
    if (openId) {
      cachedSelfOpenId = openId;
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('selfOpenId', ?)`).run(openId);
      console.log(`[autoReply] Resolved self open_id: ${openId}`);
    }
    return openId ?? '';
  } catch (err) {
    console.warn('[autoReply] Could not resolve self open_id:', err);
    return '';
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

// ─── Auto-reply channel config ────────────────────────────────────────────────

interface AutoReplyConfig {
  id: number;
  templateId: number | null;
  knowledgeTags: string[];
  customContext: string;
  systemPrompt: string;
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
    systemPrompt: row.system_prompt || '',
    enabled: row.enabled,
  };
}

// ─── Knowledge base ───────────────────────────────────────────────────────────

function getKnowledgeByTags(tags: string[]): string {
  if (!tags.length) return '';

  const db = getDb();
  const rows = db.prepare(`SELECT title, content FROM knowledge_base WHERE 1=0 ${tags.map(() => `OR tags LIKE '%' || ? || '%'`).join('')}`).all(...tags) as { title: string; content: string }[];
  if (!rows.length) return '';

  const sections = rows.map(k => `【${k.title}】\n${k.content}`).join('\n\n');
  return `相关知识库：\n${sections}\n\n`;
}

// ─── Template ─────────────────────────────────────────────────────────────────

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
    const row = db.prepare('SELECT * FROM reply_templates WHERE is_default = 1 LIMIT 1').get() as any;
    if (!row) return null;
    return { id: row.id, name: row.name, systemPrompt: row.system_prompt, description: row.description || '', isDefault: true };
  }

  const row = db.prepare('SELECT * FROM reply_templates WHERE id = ?').get(id) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, systemPrompt: row.system_prompt, description: row.description || '', isDefault: Boolean(row.is_default) };
}

function buildSystemPrompt(config: AutoReplyConfig | null, globalPrompt: string): string {
  // Priority: channel system_prompt > template system_prompt > global prompt
  let basePrompt = globalPrompt;

  if (config) {
    if (config.systemPrompt) {
      basePrompt = config.systemPrompt;
    } else {
      const template = getTemplate(config.templateId);
      if (template) {
        basePrompt = template.systemPrompt;
      }
    }
  }

  const parts: string[] = [basePrompt];

  if (config) {
    if (config.knowledgeTags.length > 0) {
      const kb = getKnowledgeByTags(config.knowledgeTags);
      if (kb) parts.push(kb);
    }
    if (config.customContext) {
      parts.push(`补充信息：\n${config.customContext}`);
    }
  }

  return parts.join('\n');
}

// ─── AI call ──────────────────────────────────────────────────────────────────

async function callOpenAI(userText: string, systemPrompt: string): Promise<string> {
  const apiKey = getSetting('openaiKey');
  const baseUrl = getSetting('openaiUrl') || 'https://api.openai.com/v1';
  const modelId = getSetting('modelId') || DEFAULT_MODEL_ID;

  if (!apiKey) {
    console.log('[autoReply] No API key configured, using fallback reply');
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
    console.error('[autoReply] AI API error:', response.status, await response.text());
    return '';
  }

  const data = await response.json() as any;
  const message = data?.choices?.[0]?.message ?? {};
  const c = message.content;
  const r = message.reasoning;
  const rc = message.reasoning_content;
  const text =
    (typeof c === 'string' ? c : '') ||
    (typeof r === 'string' ? r : '') ||
    (typeof rc === 'string' ? rc : '');
  return text;
}

// ─── Lark send helpers ────────────────────────────────────────────────────────

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

// ─── Core logic ───────────────────────────────────────────────────────────────

interface MessageRow {
  id: number;
  message_id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  auto_replied: number;
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

  const selfOpenId = await getSelfOpenId();

  /** 群会话：通讯录里开启自动回复的群在 `contacts`（open_id=chat_id），`chats` 表可能未同步 auto_reply，两处都要扫 */
  const autoReplyChats = db.prepare(
    `SELECT chat_id, chat_type FROM chats WHERE auto_reply = 1`
  ).all() as unknown as ChatAutoReplyRow[];

  const groupContacts = db.prepare(
    `SELECT open_id FROM contacts WHERE contact_type = 'group' AND COALESCE(auto_reply, 0) = 1`
  ).all() as unknown as ContactRow[];

  const personContacts = db.prepare(
    `SELECT open_id FROM contacts WHERE contact_type = 'person' AND COALESCE(auto_reply, 0) = 1`
  ).all() as unknown as ContactRow[];

  const seenGroupChatIds = new Set<string>();

  console.log(
    `[autoReply] Checking ${autoReplyChats.length} chats(auto_reply) + ${groupContacts.length} group contacts + ${personContacts.length} person contacts`
  );

  for (const chat of autoReplyChats) {
    if (seenGroupChatIds.has(chat.chat_id)) continue;
    seenGroupChatIds.add(chat.chat_id);
    try {
      await processAutoReplyForChat(chat.chat_id, 'group', selfOpenId);
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('[autoReply] Error processing chat ' + chat.chat_id + ':', err);
    }
  }

  for (const { open_id } of groupContacts) {
    if (seenGroupChatIds.has(open_id)) continue;
    seenGroupChatIds.add(open_id);
    try {
      await processAutoReplyForChat(open_id, 'group', selfOpenId);
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('[autoReply] Error processing group contact ' + open_id + ':', err);
    }
  }

  for (const contact of personContacts) {
    try {
      await processAutoReplyForChat(contact.open_id, 'p2p', selfOpenId);
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error('[autoReply] Error processing contact ' + contact.open_id + ':', err);
    }
  }
}

async function processAutoReplyForChat(chatId: string, mode: 'group' | 'p2p', selfOpenId: string): Promise<void> {
  const db = getDb();

  // 最旧一条未处理消息（FIFO），避免一次把多条标成已回复却只回了一条
  const pendingMsg = db.prepare(`
    SELECT id, message_id, chat_id, sender_id, content, created_at, auto_replied
    FROM messages
    WHERE chat_id = ?
      AND COALESCE(auto_replied, 0) = 0
      AND (sender_id IS NULL OR sender_id != ?)
      AND content IS NOT NULL
      AND content != ''
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 1
  `).get(chatId, selfOpenId) as unknown as MessageRow | undefined;

  if (!pendingMsg) {
    return; // No unread messages from others
  }

  // Get channel config
  const channelType = mode === 'group' ? 'group' : 'person';
  const config = getChannelConfig(channelType, chatId);

  // If config exists and is explicitly disabled, skip
  if (config && !config.enabled) {
    return;
  }

  // Build system prompt
  const globalPrompt = getSetting('autoReplySystemPrompt') || '你是一个飞书助手，请根据消息内容简洁友好地回复。';
  const systemPrompt = buildSystemPrompt(config, globalPrompt);

  // Call AI
  let reply = await callOpenAI(pendingMsg.content, systemPrompt);
  if (!reply) reply = '收到，稍后回复';

  // Send
  if (mode === 'group') {
    await sendToGroupChat(chatId, reply);
  } else {
    await sendToP2P(chatId, reply);
  }

  db.prepare(`UPDATE messages SET auto_replied = 1 WHERE id = ?`).run(pendingMsg.id);

  console.log(`[autoReply] Replied to ${mode}:${chatId} (msg: ${pendingMsg.message_id})`);
}

export type AutoReplyTestResult =
  | { ok: true; reply: string; messageCount: number; sent: boolean; sendError?: string }
  | { ok: false; error: string };

export interface AutoReplyTestOptions {
  /** 与弹窗草稿一致：传入则用该字符串作为 channel 级 system_prompt（空字符串表示不覆盖，走模板/全局） */
  systemPromptDraft?: string;
  /** 为 true 时在本机通过 lark-cli 发送回复到该会话（不写 messages.auto_replied） */
  send?: boolean;
}

/**
 * 基于本地已同步消息 + 与正式自动回复相同的系统提示词，调用 LLM 生成「下一条回复」。
 * 默认仅预览；`send: true` 时再通过 lark-cli 发到飞书。均不写入 auto_replied。
 */
export async function runAutoReplyTest(
  channelType: 'person' | 'group',
  channelId: string,
  limit = 30,
  options?: AutoReplyTestOptions
): Promise<AutoReplyTestResult> {
  const db = getDb();
  const lim = Math.max(1, Math.min(80, Math.floor(Number(limit)) || 30));

  const rows = db
    .prepare(
      `
    SELECT sender_name, sender_id, content, created_at
    FROM messages
    WHERE chat_id = ?
      AND content IS NOT NULL
      AND TRIM(content) != ''
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `
    )
    .all(channelId, lim) as Array<{
    sender_name: string | null;
    sender_id: string | null;
    content: string;
    created_at: string | null;
  }>;

  if (rows.length === 0) {
    return { ok: false, error: '本地暂无该会话的消息，请先同步消息后再试' };
  }

  const chronological = [...rows].reverse();
  const lines = chronological.map(m => {
    const who = (m.sender_name && m.sender_name.trim()) || m.sender_id || '未知';
    const t = m.created_at ?? '';
    return `[${t}] ${who}: ${m.content}`;
  });

  let config = getChannelConfig(channelType, channelId);
  if (options?.systemPromptDraft !== undefined) {
    const draft = options.systemPromptDraft;
    if (config) {
      config = { ...config, systemPrompt: draft };
    } else {
      config = {
        id: 0,
        templateId: null,
        knowledgeTags: [],
        customContext: '',
        systemPrompt: draft,
        enabled: 1,
      };
    }
  }

  const globalPrompt = getSetting('autoReplySystemPrompt') || '你是一个飞书助手，请根据消息内容简洁友好地回复。';
  const systemPrompt = buildSystemPrompt(config, globalPrompt);

  const userBlock = `以下是该会话最近已同步到本地的聊天记录（按时间从早到晚）。请根据系统提示中的角色与要求，生成你作为助手应当发送的「下一条」回复内容。

要求：只输出回复正文本身，不要复述对话、不要加「回复：」等前缀、不要使用 Markdown 代码块。

--- 聊天记录 ---
${lines.join('\n')}`;

  const raw = await callOpenAI(userBlock, systemPrompt);
  const reply = typeof raw === 'string' ? raw.trim() : '';
  if (!reply) {
    return { ok: false, error: '模型未返回有效内容，请检查设置中的 API Key / 模型与网络' };
  }

  if (!options?.send) {
    return { ok: true, reply, messageCount: rows.length, sent: false };
  }

  try {
    if (channelType === 'group') {
      await sendToGroupChat(channelId, reply);
    } else {
      await sendToP2P(channelId, reply);
    }
    return { ok: true, reply, messageCount: rows.length, sent: true };
  } catch (e) {
    const msg = String(e);
    console.error('[autoReply] Test send to Lark failed:', msg);
    return { ok: true, reply, messageCount: rows.length, sent: false, sendError: msg };
  }
}
