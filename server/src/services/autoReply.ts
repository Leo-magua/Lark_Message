import { getDb } from '../db/connection.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\74116\AppData\Roaming\npm\lark-cli.cmd`
  : 'lark-cli';

/** Minimum gap between auto-replies to the same chat (ms) */
const MIN_REPLY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory tracking of last auto-reply timestamp per chatId */
const lastRepliedAt: Map<string, number> = new Map();

// DB helpers

function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

// AI call

async function callOpenAI(userText: string): Promise<string> {
  const apiKey = getSetting('openaiKey');
  const baseUrl = getSetting('openaiUrl') || 'https://api.openai.com/v1';
  const systemPrompt = getSetting('kimiCommand') || '你是一个飞书助手，请简洁回复。';
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

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

// Lark send helpers

async function sendToGroupChat(chatId: string, text: string): Promise<void> {
  await execFileAsync(LARK_CLI, [
    'im', '+messages-send',
    '--chat-id', chatId,
    '--msg-type', 'text',
    '--content', JSON.stringify({ text }),
    '--format', 'json',
  ], { shell: IS_WIN, timeout: 15_000 });
}

async function sendToP2P(openId: string, text: string): Promise<void> {
  await execFileAsync(LARK_CLI, [
    'im', '+messages-send',
    '--receive-id', openId,
    '--receive-id-type', 'open_id',
    '--msg-type', 'text',
    '--content', JSON.stringify({ text }),
    '--format', 'json',
  ], { shell: IS_WIN, timeout: 15_000 });
}

// Core auto-reply logic

export async function handleAutoReply(chatId: string, userText: string, _messageId: string): Promise<void> {
  const db = getDb();

  const globalEnabled = getSetting('autoReplyEnabled');
  if (globalEnabled !== 'true') return;

  const chat = db.prepare('SELECT auto_reply FROM chats WHERE chat_id = ?').get(chatId) as { auto_reply: number } | undefined;
  if (!chat?.auto_reply) return;

  const lastTime = lastRepliedAt.get(chatId) ?? 0;
  if (Date.now() - lastTime < MIN_REPLY_INTERVAL_MS) {
    console.log(`[autoReply] Skipping ${chatId}: within 5-min cooldown`);
    return;
  }

  try {
    const kimiCommand = getSetting('kimiCommand');
    let reply = kimiCommand ? await callOpenAI(userText) : '';
    if (!reply) reply = '收到，稍后回复';

    await sendToGroupChat(chatId, reply);
    lastRepliedAt.set(chatId, Date.now());
    console.log('[autoReply] Replied to chat ' + chatId);
  } catch (err) {
    console.error('[autoReply] Error:', err);
  }
}

// Batch auto-reply check

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
  const globalEnabled = getSetting('autoReplyEnabled');
  if (globalEnabled !== 'true') {
    console.log('[autoReply] Auto-reply globally disabled, skipping');
    return;
  }

  const db = getDb();

  const autoReplyChats = db.prepare(
    `SELECT chat_id, chat_type FROM chats WHERE auto_reply = 1`
  ).all() as unknown as ChatAutoReplyRow[];

  const personContacts = db.prepare(
    `SELECT open_id FROM contacts WHERE contact_type = 'person'`
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
  if (Date.now() - lastTime < MIN_REPLY_INTERVAL_MS) return;

  const db = getDb();

  const latestMsg = db.prepare(
    'SELECT message_id, chat_id, sender_id, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(chatId) as MessageRow | undefined;

  if (!latestMsg) return;
  if (!latestMsg.sender_id || latestMsg.content.length === 0) return;

  const kimiCommand = getSetting('kimiCommand');
  let replyText = kimiCommand ? await callOpenAI(latestMsg.content) : '';
  if (!replyText) replyText = '收到，稍后回复';

  if (mode === 'group') {
    await sendToGroupChat(chatId, replyText);
  } else {
    await sendToP2P(chatId, replyText);
  }

  lastRepliedAt.set(chatId, Date.now());
  console.log('[autoReply] Auto-replied to ' + mode + ':' + chatId);
}
