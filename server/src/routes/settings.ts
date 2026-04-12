import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

function getAllSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    openaiKey: map.openaiKey ?? '',
    openaiUrl: map.openaiUrl ?? 'https://api.openai.com/v1',
    kimiCommand: map.kimiCommand ?? '请帮我分析这段对话的重点',
    autoReplyEnabled: map.autoReplyEnabled === 'true',
    modelId: map.modelId ?? 'step-3.5-flash-2603',
  };
}

// GET /api/settings
router.get('/', (_req, res) => {
  res.json(getAllSettings());
});

// PUT /api/settings
router.put('/', (req, res) => {
  const db = getDb();
  const { openaiKey, openaiUrl, kimiCommand, autoReplyEnabled, modelId } = req.body as {
    openaiKey?: string;
    openaiUrl?: string;
    kimiCommand?: string;
    autoReplyEnabled?: boolean;
    modelId?: string;
  };

  if (openaiKey !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('openaiKey', openaiKey);
  if (openaiUrl !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('openaiUrl', openaiUrl);
  if (kimiCommand !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('kimiCommand', kimiCommand);
  if (autoReplyEnabled !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoReplyEnabled', String(autoReplyEnabled));
  if (modelId !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('modelId', modelId);

  res.json(getAllSettings());
});

export default router;
