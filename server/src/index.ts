import path from 'path';
import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/schema.js';
import { getDb } from './db/connection.js';

// Global error handlers to prevent process crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  console.error('[FATAL] Stack:', err.stack);
  // Don't exit - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise);
  console.error('[FATAL] Reason:', reason);
  // Don't exit - log and continue
});

process.on('warning', (warning) => {
  console.warn('[WARN] Process warning:', warning);
});

// Log memory usage periodically
setInterval(() => {
  const mem = process.memoryUsage();
  console.log('[MEMORY] rss:', (mem.rss / 1024 / 1024).toFixed(1), 'MB, heapUsed:', (mem.heapUsed / 1024 / 1024).toFixed(1), 'MB');
}, 10000);

// Log when process receives SIGTERM/SIGINT (but NOT SIGKILL - it can't be caught)
process.on('SIGTERM', () => {
  console.error('[SIGNAL] Received SIGTERM - ignoring (stability mode)');
  // process.exit(0);
});
process.on('SIGINT', () => {
  console.error('[SIGNAL] Received SIGINT - ignoring (stability mode)');
  // process.exit(0);
});
import contactsRouter from './routes/contacts.js';
import chatsRouter from './routes/chats.js';
import messagesRouter from './routes/messages.js';
import settingsRouter from './routes/settings.js';
import aiRouter from './routes/ai.js';
import knowledgeRouter from './routes/knowledge.js';
import templatesRouter from './routes/templates.js';
import autoReplyConfigRouter, { postAutoReplyTest, postSendManual } from './routes/autoReplyConfig.js';
import eventsRouter from './routes/events.js';
import { syncAllMonitoredChats } from './services/syncMessages.js';
import { checkAndAutoReplyAll } from './services/autoReply.js';

const PORT = Number(process.env.PORT ?? 8001);

function readMessageSyncPollingFromDb(): { enabled: boolean; intervalSec: number } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN ('messageSyncPollingEnabled', 'messageSyncIntervalSec')`
    )
    .all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const enabled = map.messageSyncPollingEnabled === 'true';
  const raw = parseInt(map.messageSyncIntervalSec ?? '60', 10);
  const intervalSec = Math.max(30, Math.min(7200, Number.isFinite(raw) ? raw : 60));
  return { enabled, intervalSec };
}

/** 从设置页读取开关与间隔；关闭时每 5 秒重新读库以便无需重启即可开启 */
function startBackgroundMessageSyncScheduler(): void {
  const INITIAL_DELAY_MS = 10_000;
  const RECHECK_WHEN_OFF_MS = 5_000;

  const loop = async () => {
    try {
      const { enabled, intervalSec } = readMessageSyncPollingFromDb();
      if (!enabled) {
        setTimeout(loop, RECHECK_WHEN_OFF_MS);
        return;
      }
      try {
        console.log('[messageSync] Background sync: fetching monitored chats...');
        const { results, totalInserted } = await syncAllMonitoredChats();
        console.log(`[messageSync] Done. targets=${results.length} inserted=${totalInserted}`);
        // After sync, also run auto-reply to process any newly fetched messages
        try {
          await checkAndAutoReplyAll();
        } catch (arErr) {
          console.error('[messageSync] Auto-reply check error:', arErr);
        }
      } catch (err) {
        console.error('[messageSync] Sync error:', err);
      }
      setTimeout(loop, intervalSec * 1000);
    } catch (e) {
      console.error('[messageSync] Scheduler error:', e);
      setTimeout(loop, RECHECK_WHEN_OFF_MS);
    }
  };

  console.log('[messageSync] Scheduler started (interval & switch from 设置)');
  setTimeout(loop, INITIAL_DELAY_MS);
}

/** 独立的自动回复调度器：每 60 秒处理一次已入库但未回复的消息。
 *  不依赖「后台同步」开关 — 只要有消息（手动同步进来的也算）就会触发。 */
function startAutoReplyScheduler(): void {
  const INTERVAL_MS = 300_000; // 5 minutes - very conservative to avoid OOM
  const INITIAL_DELAY_MS = 30_000;

  const loop = async () => {
    try {
      console.log('[autoReply] Scheduler: starting check');
      await checkAndAutoReplyAll();
      console.log('[autoReply] Scheduler: check completed');
    } catch (err) {
      console.error('[autoReply] Scheduler CRITICAL error:', err);
    }
    setTimeout(loop, INTERVAL_MS);
  };

  console.log('[autoReply] Scheduler started (every 5min, conservative mode)');
  setTimeout(loop, INITIAL_DELAY_MS);
}

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:5174',
    'http://localhost:8000',
    'http://localhost:8001',
  ],
  credentials: true,
}));
app.use(express.json());

// Run DB migrations before routes (same process as server)
runMigrations();

const frontendDist = path.join(import.meta.dirname, '..', '..', 'app', 'dist');

// ─── API routes 必须注册在 static / SPA fallback 之前，否则部分 POST 无法匹配到子路由 ───
app.use('/api/contacts', contactsRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/timeline', (_req, res, next) => {
  _req.url = '/timeline' + (_req.url === '/' ? '' : _req.url);
  messagesRouter(_req, res, next);
});
app.use('/api/topics', (req, res, next) => {
  req.url = '/topics' + (req.url === '/' ? '' : req.url);
  messagesRouter(req, res, next);
});
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/templates', templatesRouter);
// DISABLED for stability:
// app.post('/api/auto-reply/test', postAutoReplyTest);
// app.post('/api/auto-reply/send-manual', postSendManual);
// app.post('/api/auto-reply/trigger', async (_req, res) => {
//   try {
//     await checkAndAutoReplyAll();
//     res.json({ success: true, message: 'Auto-reply check triggered' });
//   } catch (err) {
//     console.error('[autoReply-trigger] Error:', err);
//     res.status(500).json({ ok: false, error: String(err) });
//   }
// });
app.use('/api/auto-reply', autoReplyConfigRouter);

app.get('/api/monitor/status', (_req, res) => {
  const db = getDb();
  const chatsMonitored = (db.prepare(
    'SELECT COUNT(*) as n FROM chats WHERE is_monitoring = 1'
  ).get() as { n: number }).n;
  const contactsMonitored = (db.prepare(
    `SELECT COUNT(*) as n FROM contacts WHERE contact_type = 'person'`
  ).get() as { n: number }).n;

  const { enabled, intervalSec } = readMessageSyncPollingFromDb();
  res.json({
    message_sync_polling: enabled,
    message_sync_interval_sec: enabled ? intervalSec : 0,
    contacts_monitored: contactsMonitored,
    chats_monitored: chatsMonitored,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── Static + SPA（放在所有 /api 之后）────────────────────────────────────────
app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Serving frontend from ${frontendDist}`);
  console.log('[server] Routes:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/chats');
  console.log('  PUT  /api/chats/:chatId');
  console.log('  POST /api/chats/sync');
  console.log('  POST /api/chats/:chatId/sync-messages');
  console.log('  GET  /api/messages');
  console.log('  POST /api/messages/sync              <- sync all monitored chats');
  console.log('  POST /api/messages/sync/:chatId      <- sync single chat');
  console.log('  GET  /api/timeline                   <- events + topics');
  console.log('  GET  /api/topics');
  console.log('  POST /api/topics');
  console.log('  GET  /api/contacts');
  console.log('  POST /api/contacts/sync');
  console.log('  GET  /api/contacts/:id/summary       <- recent messages summary');
  console.log('  GET  /api/settings');
  console.log('  PUT  /api/settings');
  console.log('  GET  /api/events                     <- list all events (admin table)');
  console.log('  POST /api/ai/analyze/:contactId      <- AI analyze single contact');
  console.log('  POST /api/ai/analyze-all             <- AI analyze all chats');
  console.log('  GET  /api/monitor/status             <- message sync polling status');
  //   console.log('  POST /api/auto-reply/trigger         <- manual auto-reply trigger');
  //   console.log('  POST /api/auto-reply/test            <- LLM from local messages; body.send=true -> lark-cli send');

  // startBackgroundMessageSyncScheduler(); // DISABLED - OOM
  // startAutoReplyScheduler(); // DISABLED - OOM
  console.log('[server] All background schedulers DISABLED for stability');
});
