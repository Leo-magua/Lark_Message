import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from '../db/connection.js';
import { ingestAliasesFromMessage, relabelMessagesInChat, resolveSenderDisplayName } from './senderDirectory.js';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\74116\AppData\Roaming\npm\lark-cli.cmd`
  : 'lark-cli';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LarkMessageSender {
  id: string;
  id_type: string;
  sender_type: string;
  tenant_key?: string;
}

interface LarkMessageBody {
  content: string; // JSON string
}

interface LarkMessage {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  thread_id?: string;
  msg_type: string;
  create_time: string; // epoch ms string
  update_time?: string;
  deleted?: boolean;
  upper_message_id?: string;
  chat_id: string;
  sender: LarkMessageSender;
  body: LarkMessageBody;
  mentions?: Array<{ key: string; id: { open_id: string }; name: string }>;
}

interface LarkMessageListResponse {
  ok?: boolean;
  code?: number;
  data: {
    messages: LarkMessage[];
    has_more: boolean;
    page_token?: string;
  };
  msg?: string;
}

interface LarkErrorResponse {
  ok: false;
  error: { code: number; message: string };
}

// ─── lark-cli runner ──────────────────────────────────────────────────────────

async function runLarkCli(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(LARK_CLI, args, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    shell: IS_WIN,
  });
  return JSON.parse(stdout);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSettingInt(key: string, fallback: number): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  const n = parseInt(row?.value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Extract plain text from a Feishu message body.content JSON.
 * Handles text, post (rich text), and falls back to raw JSON for others.
 */
function extractText(msg: any): string {
  const msgType = msg.msg_type || 'unknown';
  const content = msg.content;

  // For text messages, content is already plain text
  if (msgType === 'text') {
    return (typeof content === 'string') ? content : '';
  }

  // For post (rich text), content is JSON string
  if (msgType === 'post') {
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      const lang = (parsed as Record<string, { title?: string; content?: Array<Array<{ tag: string; text?: string }>> }>);
      const doc = lang.zh_cn ?? lang.en_us ?? Object.values(lang)[0];
      if (!doc) return '[富文本]';
      const lines = (doc.content ?? []).map(row =>
        row.filter(el => el.tag === 'text').map(el => el.text ?? '').join('')
      );
      const title = doc.title ? `【${doc.title}】` : '';
      return (title + lines.join('\n')).trim() || '[富文本]';
    } catch {
      return '[富文本]';
    }
  }

  if (msgType === 'image') return '[图片]';
  if (msgType === 'file') return '[文件]';
  if (msgType === 'audio') return '[音频]';
  if (msgType === 'video') return '[视频]';
  if (msgType === 'sticker') return '[表情包]';
  if (msgType === 'system') {
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      return (parsed as { text?: string }).text ?? '[系统消息]';
    } catch {
      return '[系统消息]';
    }
  }

  return `[${msgType}]`;
}

function epochMsToIso(timeStr: string): string {
  // lark-cli returns either epoch ms string or formatted datetime like "2026-04-10 17:43"
  const ts = Number(timeStr);
  if (!isNaN(ts) && ts > 1_000_000_000_000) {
    // Epoch milliseconds
    return new Date(ts).toISOString();
  }
  // Assume it's already a formatted date string; return as-is or convert to ISO if possible
  // For simplicity, return the string wrapped as ISO-like (will be stored as text)
  // Actually SQLite stores as TEXT, we can store the original string
  return timeStr;
}

// ─── Core fetch function ──────────────────────────────────────────────────────

/**
 * Fetch up to `maxMessages` recent messages from a chat.
 * Paginates automatically using page_token.
 * When mode='p2p', uses --user-id instead of --chat-id.
 */
async function fetchChatMessages(
  chatId: string,
  maxMessages = 50,
  mode: 'group' | 'p2p' = 'group',
  openId?: string,
): Promise<LarkMessage[]> {
  const allItems: LarkMessage[] = [];
  let pageToken: string | undefined;

  while (allItems.length < maxMessages) {
    const remaining = maxMessages - allItems.length;
    const pageSize = Math.min(remaining, 50);

    let args: string[];
    if (mode === 'p2p' && openId) {
      args = [
        'im', '+chat-messages-list',
        '--user-id', openId,
        '--page-size', String(pageSize),
        '--sort', 'desc',
        '--format', 'json',
        '--as', 'user',
      ];
    } else {
      args = [
        'im', '+chat-messages-list',
        '--chat-id', chatId,
        '--page-size', String(pageSize),
        '--sort', 'desc',
        '--format', 'json',
        '--as', 'user',
      ];
    }
    if (pageToken) args.push('--page-token', pageToken);

    const result = await runLarkCli(args) as LarkMessageListResponse | LarkErrorResponse;

    // Check for API error
    if ('ok' in result && result.ok === false) {
      const err = (result as LarkErrorResponse).error;
      throw new Error(`lark-cli error ${err.code}: ${err.message}`);
    }

    const resp = result as LarkMessageListResponse;
    const items = resp.data?.messages ?? [];
    allItems.push(...items);

    if (!resp.data?.has_more || !resp.data?.page_token) break;
    pageToken = resp.data.page_token;
  }

  return allItems;
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

function upsertMessage(msg: any, senderId: string, senderName: string, storeChatId: string): void {
  const db = getDb();
  const content = extractText(msg);
  const createdAt = epochMsToIso(msg.create_time);

  db.prepare(`
    INSERT OR IGNORE INTO messages
      (message_id, platform, chat_id, sender_id, sender_name, content, message_type,
       root_id, parent_id, created_at, raw_event)
    VALUES
      (?, 'lark', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.message_id,
    storeChatId,
    senderId,
    senderName,
    content,
    msg.msg_type,
    msg.root_id ?? null,
    msg.parent_id ?? null,
    createdAt,
    JSON.stringify(msg),
  );
}

function getSenderName(msg: any): { senderId: string; senderName: string } {
  ingestAliasesFromMessage(msg);
  const senderId = (msg.sender?.id ?? '').trim();
  const senderName = resolveSenderDisplayName(senderId);
  return { senderId, senderName };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MessageSyncResult {
  chatId: string;
  fetched: number;
  inserted: number;
  error?: string;
}

/**
 * Sync messages for a single chat.
 * Returns how many were fetched from lark-cli and how many were new inserts.
 * When mode='p2p', uses the openId to fetch P2P messages.
 */
export async function syncChatMessages(
  chatId: string,
  maxMessages = 50,
  mode: 'group' | 'p2p' = 'group',
  openId?: string,
): Promise<MessageSyncResult> {
  const db = getDb();
  // For P2P mode, the effective chatId stored in messages is the openId
  const effectiveChatId = mode === 'p2p' && openId ? openId : chatId;

  try {
    const messages = await fetchChatMessages(chatId, maxMessages, mode, openId);

    let inserted = 0;
    for (const msg of messages) {
      // Skip deleted messages
      if (msg.deleted) continue;

      const { senderId, senderName } = getSenderName(msg);

      // For P2P mode, store messages under the contact's open_id; for group chats use the chat_id
      const storeChatId = mode === 'p2p' && openId ? openId : chatId;
      const msgToStore = msg;

      const before = (db.prepare('SELECT COUNT(*) as n FROM messages WHERE message_id = ?').get(msg.message_id) as { n: number }).n;
      upsertMessage(msgToStore, senderId, senderName, storeChatId);
      const after = (db.prepare('SELECT COUNT(*) as n FROM messages WHERE message_id = ?').get(msg.message_id) as { n: number }).n;

      if (after > before) inserted++;
    }

    // Update chat last_active_at based on newest message (only for group chats)
    if (messages.length > 0 && mode === 'group') {
      const newest = messages.reduce((a, b) => {
        const ta = new Date(a.create_time).getTime();
        const tb = new Date(b.create_time).getTime();
        return ta > tb ? a : b;
      });
      db.prepare(
        `UPDATE chats SET last_active_at = ? WHERE chat_id = ?`
      ).run(newest.create_time, chatId);
    }

    relabelMessagesInChat(effectiveChatId);

    console.log(`[syncMessages] ${effectiveChatId}: fetched=${messages.length} inserted=${inserted}`);
    return { chatId: effectiveChatId, fetched: messages.length, inserted };

  } catch (e) {
    const error = String(e);
    console.error(`[syncMessages] ${effectiveChatId}: ERROR ${error}`);
    return { chatId: effectiveChatId, fetched: 0, inserted: 0, error };
  }
}

/**
 * Sync messages for entries in the local address book (`contacts` table).
 *
 * Notes:
 * - "Added to address book" == present in `contacts`.
 * - Person chats use lark-cli P2P mode (`--user-id`).
 * - Group chats use lark-cli group mode (`--chat-id`) with `open_id` holding the chat id (`oc_...`).
 */
export async function syncAllMonitoredChats(opts?: {
  /** Override settings.fullSyncCap for this run */
  fullSyncCap?: number;
}): Promise<{ results: MessageSyncResult[]; totalInserted: number }> {
  const db = getDb();

  const defaultLatest = getSettingInt('defaultSyncLimit', 5); // Very conservative: 5 messages
  const fullCap = opts?.fullSyncCap ?? getSettingInt('fullSyncCap', 100); // Max 100 messages for full sync
  const defaultModeRaw = (() => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('defaultSyncMode') as { value: string } | undefined;
    const v = (row?.value ?? 'latest').toLowerCase();
    return v === 'full' ? 'full' : 'latest';
  })();

  const rows = db.prepare(`
    SELECT open_id, contact_type, sync_mode, sync_limit
    FROM contacts
    ORDER BY contact_type ASC, name ASC
  `).all() as Array<{ open_id: string; contact_type: string; sync_mode: string | null; sync_limit: number | null }>;

  console.log(`[syncMessages] Syncing messages for ${rows.length} address-book contacts (person+group)`);

  const results: MessageSyncResult[] = [];

  for (const row of rows) {
    const mode = (row.sync_mode === 'full' || row.sync_mode === 'latest'
      ? row.sync_mode
      : defaultModeRaw) as 'latest' | 'full';
    const latestN =
      row.sync_limit === null || row.sync_limit === undefined
        ? defaultLatest
        : Math.max(1, Number(row.sync_limit));

    const perLimit = mode === 'full' ? fullCap : latestN;

    if (row.contact_type === 'group') {
      const result = await syncChatMessages(row.open_id, perLimit, 'group');
      results.push(result);
    } else {
      const result = await syncChatMessages(row.open_id, perLimit, 'p2p', row.open_id);
      results.push(result);
    }

    // Very long delay (3s) between contacts to prevent OOM
    await new Promise(r => setTimeout(r, 3000));
  }

  const totalInserted = results.reduce((sum, r) => sum + (r.inserted || 0), 0);
  console.log(`[syncMessages] Done. ${rows.length} targets. Total inserted: ${totalInserted}`);
  return { results, totalInserted };
}
