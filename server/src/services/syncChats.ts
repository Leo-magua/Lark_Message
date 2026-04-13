import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from '../db/connection.js';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\74116\AppData\Roaming\npm\lark-cli.cmd`
  : 'lark-cli';

interface LarkChat {
  chat_id: string;
  name: string;
  chat_type?: 'group' | 'p2p';
  description?: string;
  avatar?: string;
  chat_status?: string;
  external?: boolean;
  tenant_key?: string;
}

interface LarkChatListResponse {
  code?: number;
  ok?: boolean;
  data: {
    items: LarkChat[];
    has_more: boolean;
    page_token?: string;
  };
  msg?: string;
}

async function runLarkCli(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(LARK_CLI, args, {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    shell: IS_WIN,
  });
  return JSON.parse(stdout);
}

export async function syncChats(): Promise<{ synced: number; errors: string[] }> {
  const db = getDb();
  const errors: string[] = [];
  let synced = 0;

  try {
    // Use --page-all to fetch all chats in one call
    const result = await runLarkCli(['im', 'chats', 'list', '--format', 'json', '--page-all', '--as', 'user']) as LarkChatListResponse;
    const items = result.data?.items ?? [];

    for (const chat of items) {
      const chatType = chat.chat_type ?? 'group';
      const avatar = typeof chat.avatar === 'string' ? chat.avatar : null;
      // Upsert chat with default settings
      db.prepare(`
        INSERT INTO chats (
          chat_id, name, chat_type, avatar,
          is_monitoring, auto_reply, has_alert,
          sync_mode, sync_limit,
          last_active_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, 0, 'latest', 20, datetime('now'), datetime('now'))
        ON CONFLICT(chat_id) DO UPDATE SET
          name = excluded.name,
          chat_type = excluded.chat_type,
          avatar = excluded.avatar,
          updated_at = datetime('now')
      `).run(chat.chat_id, chat.name ?? '未命名', chatType, avatar);

      // Ensure auto-reply config exists for this chat (if auto_reply=1)
      db.prepare(`
        INSERT OR IGNORE INTO auto_reply_config (channel_type, channel_id, template_id, knowledge_tags, custom_context, enabled)
        VALUES ('group', ?, NULL, '[]', '', 1)
      `).run(chat.chat_id);

      synced++;
    }
  } catch (e) {
    errors.push(String(e));
  }

  console.log(`[syncChats] Upserted ${synced} chats`);
  return { synced, errors };
}
