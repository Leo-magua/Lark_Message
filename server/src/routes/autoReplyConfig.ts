import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/connection.js';
import { runAutoReplyTest, sendManualMessage } from '../services/autoReply.js';

const router = Router();

interface ConfigRow {
  id: number;
  channel_type: string;
  channel_id: string;
  template_id: number | null;
  knowledge_tags: string;
  custom_context: string;
  system_prompt: string;
  enabled: number;
  updated_at: string;
}

function rowToConfig(row: ConfigRow) {
  return {
    id: row.id,
    channelType: row.channel_type as 'person' | 'group',
    channelId: row.channel_id,
    templateId: row.template_id,
    knowledgeTags: JSON.parse(row.knowledge_tags) as string[],
    customContext: row.custom_context,
    systemPrompt: row.system_prompt || '',
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

// GET /api/auto-reply/channels - list all auto-reply channels (only contacts that are in address book)
router.get('/channels', (_req, res) => {
  const db = getDb();

  // Get all contacts with auto_reply=1 (both person and group)
  // Only returns contacts that are explicitly added to the address book
  const contacts = db.prepare(`
    SELECT open_id as id, name, avatar_url as avatar, contact_type as type, auto_reply
    FROM contacts WHERE COALESCE(auto_reply, 0) = 1
  `).all() as Array<{ id: string; name: string; avatar: string; type: string; auto_reply: number }>;

  // Get all configs
  const configs = db.prepare('SELECT * FROM auto_reply_config').all() as unknown as ConfigRow[];
  const configMap = new Map<string, ConfigRow>();
  for (const c of configs) {
    const key = `${c.channel_type}:${c.channel_id}`;
    configMap.set(key, c);
  }

  const channels = contacts.map(c => {
    const cfgRow = configMap.get(`${c.type}:${c.id}`);
    const configObj = cfgRow ? rowToConfig(cfgRow) : null;
    const modeEnabled = configObj ? Boolean(configObj.enabled) : true;
    return {
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      type: c.type as 'person' | 'group',
      autoReply: true,
      enabled: modeEnabled,
      isMonitoring: false,
      hasAlert: false,
      lastActive: '',
      summary: '',
      config: configObj,
    };
  });

  res.json({ channels });
});

// POST /api/auto-reply/toggle/:channelId - toggle auto-reply for a channel
router.post('/toggle/:channelId', (req, res) => {
  const db = getDb();
  const { channelId } = req.params;

  try {
    // Get current contact by open_id
    const contact = db.prepare('SELECT * FROM contacts WHERE open_id = ?').get(channelId) as
      { id: number; open_id: string; auto_reply: number } | undefined;

    if (!contact) {
      console.error('[toggle] Contact not found:', channelId);
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const newValue = contact.auto_reply ? 0 : 1;
    // Update auto_reply and synced_at timestamp (contacts table has synced_at, not updated_at)
    db.prepare('UPDATE contacts SET auto_reply = ?, synced_at = datetime(\'now\') WHERE open_id = ?').run(newValue, channelId);

    res.json({ success: true, autoReply: Boolean(newValue) });
  } catch (err) {
    console.error('[toggle] Error:', err);
    res.status(500).json({ error: 'Database error', details: String(err) });
  }
});

// GET /api/auto-reply/config/:channelType/:channelId
router.get('/config/:channelType/:channelId', (req, res) => {
  const db = getDb();
  const { channelType, channelId } = req.params;

  if (channelType !== 'person' && channelType !== 'group') {
    res.status(400).json({ error: 'Invalid channelType' });
    return;
  }

  const row = db.prepare('SELECT * FROM auto_reply_config WHERE channel_type = ? AND channel_id = ?')
    .get(channelType, channelId) as ConfigRow | undefined;

  if (!row) {
    // Return default config
    res.json({
      config: {
        id: null,
        channelType,
        channelId,
        templateId: null,
        knowledgeTags: [],
        customContext: '',
        systemPrompt: '',
        enabled: true,
        updatedAt: null,
      }
    });
    return;
  }

  res.json({ config: rowToConfig(row) });
});

// PUT /api/auto-reply/config/:channelType/:channelId
router.put('/config/:channelType/:channelId', (req, res) => {
  const db = getDb();
  const { channelType, channelId } = req.params;
  const { templateId, knowledgeTags, customContext, systemPrompt, enabled } = req.body as {
    templateId?: number | null;
    knowledgeTags?: string[];
    customContext?: string;
    systemPrompt?: string;
    enabled?: boolean;
  };

  if (channelType !== 'person' && channelType !== 'group') {
    res.status(400).json({ error: 'Invalid channelType' });
    return;
  }

  const existing = db.prepare('SELECT * FROM auto_reply_config WHERE channel_type = ? AND channel_id = ?')
    .get(channelType, channelId) as ConfigRow | undefined;

  if (existing) {
    const updates: string[] = [];
    const params: Record<string, any> = { id: existing.id };

    if (templateId !== undefined) { updates.push('template_id = :templateId'); params.templateId = templateId; }
    if (knowledgeTags !== undefined) { updates.push('knowledge_tags = :knowledgeTags'); params.knowledgeTags = JSON.stringify(knowledgeTags); }
    if (customContext !== undefined) { updates.push('custom_context = :customContext'); params.customContext = customContext; }
    if (systemPrompt !== undefined) { updates.push('system_prompt = :systemPrompt'); params.systemPrompt = systemPrompt; }
    if (enabled !== undefined) { updates.push('enabled = :enabled'); params.enabled = enabled ? 1 : 0; }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE auto_reply_config SET ${updates.join(', ')} WHERE id = :id`).run(params);

    const updated = db.prepare('SELECT * FROM auto_reply_config WHERE id = ?').get(existing.id) as unknown as ConfigRow;
    res.json({ success: true, config: rowToConfig(updated) });
  } else {
    // Insert new
    const info = db.prepare(`
      INSERT INTO auto_reply_config (channel_type, channel_id, template_id, knowledge_tags, custom_context, system_prompt, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      channelType,
      channelId,
      templateId ?? null,
      JSON.stringify(knowledgeTags || []),
      customContext || '',
      systemPrompt || '',
      enabled !== false ? 1 : 0
    );

    const newRow = db.prepare('SELECT * FROM auto_reply_config WHERE id = ?').get(info.lastInsertRowid) as unknown as ConfigRow;
    res.json({ success: true, config: rowToConfig(newRow) });
  }
});

/** POST /api/auto-reply/test — 在 index 顶层注册，避免仅挂在子 Router 时部分环境出现 404 */
export async function postAutoReplyTest(req: Request, res: Response): Promise<void> {
  const { channelType, channelId, limit, systemPromptDraft, send } = req.body as {
    channelType?: string;
    channelId?: string;
    limit?: number;
    systemPromptDraft?: string;
    send?: boolean;
  };

  if (channelType !== 'person' && channelType !== 'group') {
    res.status(400).json({ success: false, error: 'channelType 须为 person 或 group' });
    return;
  }
  if (!channelId || typeof channelId !== 'string') {
    res.status(400).json({ success: false, error: '缺少 channelId' });
    return;
  }

  const testOpts: { systemPromptDraft?: string; send?: boolean } = {};
  if (typeof systemPromptDraft === 'string') testOpts.systemPromptDraft = systemPromptDraft;
  if (send === true) testOpts.send = true;

  try {
    const result = await runAutoReplyTest(channelType, channelId, limit, testOpts);
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({
      success: true,
      reply: result.reply,
      messageCount: result.messageCount,
      sent: result.sent,
      ...(result.sendError ? { sendError: result.sendError } : {}),
    });
  } catch (e) {
    console.error('[auto-reply/test]', e);
    res.status(500).json({ success: false, error: String(e) });
  }
}

export default router;

/** POST /api/auto-reply/send-manual — 直接发送指定文本到飞书会话（不走 AI） */
export async function postSendManual(req: Request, res: Response): Promise<void> {
  const { channelType, channelId, text } = req.body as {
    channelType?: string;
    channelId?: string;
    text?: string;
  };

  if (channelType !== 'person' && channelType !== 'group') {
    res.status(400).json({ success: false, error: 'channelType 须为 person 或 group' });
    return;
  }
  if (!channelId || typeof channelId !== 'string') {
    res.status(400).json({ success: false, error: '缺少 channelId' });
    return;
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ success: false, error: '消息内容不能为空' });
    return;
  }

  try {
    await sendManualMessage(channelType as 'person' | 'group', channelId, text.trim());
    res.json({ success: true });
  } catch (e) {
    console.error('[auto-reply/send-manual]', e);
    res.status(500).json({ success: false, error: String(e) });
  }
}
