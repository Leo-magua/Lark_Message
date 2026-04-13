import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

function getAllSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  const rawInterval = parseInt(map.messageSyncIntervalSec ?? '60', 10);
  const messageSyncIntervalSec = Math.max(30, Math.min(7200, Number.isFinite(rawInterval) ? rawInterval : 60));
  return {
    openaiKey: map.openaiKey ?? '',
    openaiUrl: map.openaiUrl ?? 'https://api.openai.com/v1',
    kimiCommand: map.kimiCommand ?? '请帮我分析这段对话的重点',
    modelId: map.modelId ?? 'step-3.5-flash-2603',
    messageSyncPollingEnabled: map.messageSyncPollingEnabled === 'true',
    messageSyncIntervalSec,
    defaultSyncMode: (map.defaultSyncMode === 'full' ? 'full' : 'latest') as 'latest' | 'full',
    defaultSyncLimit: Math.max(1, parseInt(map.defaultSyncLimit || '30', 10)),
    fullSyncCap: Math.max(1, parseInt(map.fullSyncCap || '5000', 10)),
  };
}

// GET /api/settings
router.get('/', (_req, res) => {
  res.json(getAllSettings());
});

// PUT /api/settings
router.put('/', (req, res) => {
  const db = getDb();
  const {
    openaiKey,
    openaiUrl,
    kimiCommand,
    modelId,
    messageSyncPollingEnabled,
    messageSyncIntervalSec,
    defaultSyncMode,
    defaultSyncLimit,
    fullSyncCap,
  } = req.body as {
    openaiKey?: string;
    openaiUrl?: string;
    kimiCommand?: string;
    modelId?: string;
    messageSyncPollingEnabled?: boolean;
    messageSyncIntervalSec?: number;
    defaultSyncMode?: 'latest' | 'full';
    defaultSyncLimit?: number;
    fullSyncCap?: number;
  };

  if (openaiKey !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('openaiKey', openaiKey);
  if (openaiUrl !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('openaiUrl', openaiUrl);
  if (kimiCommand !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('kimiCommand', kimiCommand);
  if (messageSyncPollingEnabled !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'messageSyncPollingEnabled',
      String(messageSyncPollingEnabled)
    );
  if (messageSyncIntervalSec !== undefined) {
    const n = Math.max(30, Math.min(7200, Number(messageSyncIntervalSec) || 60));
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('messageSyncIntervalSec', String(n));
  }

  if (defaultSyncMode !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('defaultSyncMode', defaultSyncMode);

  if (defaultSyncLimit !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('defaultSyncLimit', String(defaultSyncLimit));

  if (fullSyncCap !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('fullSyncCap', String(fullSyncCap));

  res.json(getAllSettings());
});

export default router;
