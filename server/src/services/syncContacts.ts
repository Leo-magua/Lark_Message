import { getDb } from '../db/connection.js';
import { searchUsers, getCurrentUser, getBestAvatar } from './larkCli.js';
import type { LarkUser } from '../types/lark.js';

function toDbRow(user: LarkUser) {
  return {
    open_id: user.open_id,
    name: user.name,
    avatar_url: getBestAvatar(user),
    job_title: user.job_title ?? null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Upsert a Feishu user into contacts table.
 * Only updates Feishu-owned fields — preserves tags/knows/stats.
 */
function upsertContact(user: LarkUser): void {
  const db = getDb();
  const row = toDbRow(user);

  // Create new row with defaults if not exists (auto_reply=1, sync_mode='latest', sync_limit=20)
  db.prepare(`
    INSERT OR IGNORE INTO contacts
      (open_id, name, avatar_url, job_title, contact_type, tags, knows, last_talk, talk_count,
       auto_reply, sync_mode, sync_limit, synced_at)
    VALUES
      (:open_id, :name, :avatar_url, :job_title, 'person', '[]', '[]', '', 0, 1, 'latest', 20, :synced_at)
  `).run(row);

  // Update only Feishu-owned fields (never overwrite tags/knows)
  db.prepare(`
    UPDATE contacts
    SET name       = :name,
        avatar_url = :avatar_url,
        job_title  = :job_title,
        synced_at  = :synced_at
    WHERE open_id  = :open_id
  `).run(row);

  // Ensure auto-reply config exists for contacts with auto_reply=1 (new default)
  // This creates a default config so the contact appears in auto-reply channels immediately
  db.prepare(`
    INSERT OR IGNORE INTO auto_reply_config (channel_type, channel_id, template_id, knowledge_tags, custom_context, enabled)
    VALUES ('person', :open_id, NULL, '[]', '', 1)
  `).run({ open_id: row.open_id });
}

export interface SyncResult {
  synced: number;
  errors: string[];
}

/**
 * Full sync:
 * 1. Include authenticated user themselves
 * 2. Search with common Chinese surnames to approximate "list all"
 * 3. Deduplicate by open_id, upsert all
 */
export async function syncAllContacts(queries?: string[]): Promise<SyncResult> {
  const errors: string[] = [];
  const seen = new Map<string, LarkUser>();

  // Always include current user
  try {
    const self = await getCurrentUser();
    seen.set(self.open_id, self);
    console.log(`[sync] current user: ${self.name} (${self.open_id})`);
  } catch (e) {
    errors.push(`getCurrentUser: ${String(e)}`);
  }

  // Default to common surnames for broad coverage
  const searchTerms = queries ?? ['张', '李', '王', '刘', '陈', '杨', '赵'];

  for (const term of searchTerms) {
    try {
      const users = await searchUsers(term, 50);
      for (const u of users) {
        seen.set(u.open_id, u);
      }
      console.log(`[sync] search("${term}"): ${users.length} results`);
    } catch (e) {
      errors.push(`search("${term}"): ${String(e)}`);
    }
  }

  // Upsert all deduplicated contacts
  for (const u of seen.values()) {
    upsertContact(u);
  }

  console.log(`[sync] Upserted ${seen.size} contacts (${errors.length} errors)`);
  return { synced: seen.size, errors };
}
