import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LarkGetUserResponse, LarkSearchUsersResponse, LarkUser } from '../types/lark.js';

const execFileAsync = promisify(execFile);

// On Windows, .cmd files require shell:true to spawn correctly
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? 'C:\\Users\\74116\\AppData\\Roaming\\npm\\lark-cli.cmd'
  : 'lark-cli';

async function runLarkCli(args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await execFileAsync(LARK_CLI, args, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      shell: IS_WIN, // .cmd files need shell on Windows
    });

    if (stderr) {
      console.warn('[lark-cli] stderr:', stderr.trim());
    }

    return JSON.parse(stdout);
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: string; stdout?: string };
    const detail = e.stderr ?? e.stdout ?? '';
    throw new Error(`lark-cli failed: ${e.message ?? String(err)}${detail ? `\n${detail}` : ''}`);
  }
}

/** Get the currently authenticated user */
export async function getCurrentUser(): Promise<LarkUser> {
  const result = await runLarkCli([
    'contact', '+get-user', '--format', 'json', '--as', 'user',
  ]) as LarkGetUserResponse;
  return result.data.user;
}

/** Search contacts by keyword, up to pageSize results */
export async function searchUsers(query: string, pageSize = 50): Promise<LarkUser[]> {
  const result = await runLarkCli([
    'contact', '+search-user',
    '--query', query,
    '--page-size', String(pageSize),
    '--format', 'json',
    '--as', 'user',
  ]) as LarkSearchUsersResponse;
  return result.data?.users ?? [];
}

/** Get a specific user by open_id */
export async function getUserById(openId: string): Promise<LarkUser> {
  const result = await runLarkCli([
    'contact', '+get-user',
    '--user-id', openId,
    '--user-id-type', 'open_id',
    '--format', 'json',
    '--as', 'user',
  ]) as LarkGetUserResponse;
  return result.data.user;
}

/** Pick the best available avatar URL from a LarkUser */
export function getBestAvatar(user: LarkUser): string {
  return (
    user.avatar_middle ??
    user.avatar?.avatar_middle ??
    user.avatar_thumb ??
    user.avatar?.avatar_thumb ??
    user.avatar_url ??
    user.avatar?.avatar_origin ??
    ''
  );
}

// ─── Chat search types ─────────────────────────────────────────────────────

interface LarkChatItem {
  chat_id: string;
  name: string;
  avatar?: string;
  member_count?: number;
}

interface LarkChatsListResponse {
  data?: {
    items?: LarkChatItem[];
    has_more?: boolean;
    page_token?: string;
  };
}

/** Search group chats by name (fetches all and filters client-side) */
export async function searchChats(
  query: string,
): Promise<Array<{ chat_id: string; name: string; avatar?: string; member_count?: number }>> {
  const result = await runLarkCli([
    'im', 'chats', 'list',
    '--format', 'json',
    '--as', 'user',
  ]) as LarkChatsListResponse;

  const items = result.data?.items ?? [];
  if (!query.trim()) return items;

  const lq = query.toLowerCase();
  return items.filter(c => c.name?.toLowerCase().includes(lq));
}

// ─── P2P message types ────────────────────────────────────────────────────

/** Fetch P2P messages with a specific user (by open_id) */
export async function getP2PMessages(openId: string, pageSize = 50): Promise<unknown> {
  return runLarkCli([
    'im', '+chat-messages-list',
    '--user-id', openId,
    '--sort', 'desc',
    '--page-size', String(pageSize),
    '--format', 'json',
    '--as', 'user',
  ]);
}
