import path from 'path';
import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/schema.js';
import { getDb } from './db/connection.js';
import contactsRouter from './routes/contacts.js';
import chatsRouter from './routes/chats.js';
import messagesRouter from './routes/messages.js';
import settingsRouter from './routes/settings.js';
import aiRouter from './routes/ai.js';
import knowledgeRouter from './routes/knowledge.js';
import templatesRouter from './routes/templates.js';
import autoReplyConfigRouter from './routes/autoReplyConfig.js';
import { syncAllMonitoredChats } from './services/syncMessages.js';
import { checkAndAutoReplyAll, loadPollingInterval } from './services/autoReply.js';

const PORT = Number(process.env.PORT ?? 8001);

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:5174', 'http://localhost:8000'],
  credentials: true,
}));
app.use(express.json());

// ─── Static files (frontend build) ───────────────────────────────────────────
const frontendDist = path.join(import.meta.dirname, '..', '..', 'app', 'dist');
app.use(express.static(frontendDist));

// SPA fallback: serve index.html for any non-API route
app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  } else {
    next(); // Continue to let Express handle 404 for unknown API routes
  }
});

// Run DB migrations on startup
runMigrations();

// Load auto-reply polling interval
loadPollingInterval();

// Routes
app.use('/api/contacts', contactsRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/timeline', (_req, res, next) => {
  // Forward /api/timeline to messages timeline handler
  _req.url = '/timeline' + (_req.url === '/' ? '' : _req.url);
  messagesRouter(_req, res, next);
});
app.use('/api/topics', (req, res, next) => {
  req.url = '/topics' + (req.url === '/' ? '' : req.url);
  messagesRouter(req, res, next);
});
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/auto-reply', autoReplyConfigRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── Monitor Status ────────────────────────────────────────────────────────────
app.get('/api/monitor/status', (_req, res) => {
  const db = getDb();
  const chatsMonitored = (db.prepare(
    'SELECT COUNT(*) as n FROM chats WHERE is_monitoring = 1'
  ).get() as { n: number }).n;
  const contactsMonitored = (db.prepare(
    `SELECT COUNT(*) as n FROM contacts WHERE contact_type = 'person'`
  ).get() as { n: number }).n;

  res.json({
    polling: true,
    interval: 60,
    contacts_monitored: contactsMonitored,
    chats_monitored: chatsMonitored,
  });
});

// ─── Auto-reply manual trigger ────────────────────────────────────────────────
app.post('/api/auto-reply/trigger', async (_req, res) => {
  try {
    await checkAndAutoReplyAll();
    res.json({ success: true, message: '自动回复检查完成' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
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
  console.log('  POST /api/ai/analyze/:contactId      <- AI analyze single contact');
  console.log('  POST /api/ai/analyze-all             <- AI analyze all chats');
  console.log('  GET  /api/monitor/status             <- polling monitor status');
  console.log('  POST /api/auto-reply/trigger         <- manual auto-reply trigger');

  // ─── Background polling: start after 10s, then every 60s ──────────────────
  setTimeout(() => {
    console.log('[polling] Starting background message polling (every 60s)');

    const runPoll = async () => {
      try {
        console.log('[polling] Polling new messages for all monitored chats...');
        const { results, totalInserted } = await syncAllMonitoredChats(20);
        console.log(`[polling] Done. targets=${results.length} inserted=${totalInserted}`);

        // Also run auto-reply check after sync
        try {
          await checkAndAutoReplyAll();
        } catch (arErr) {
          console.error('[polling] Auto-reply check error:', arErr);
        }
      } catch (err) {
        console.error('[polling] Error during poll:', err);
      }
    };

    // First immediate run after 10s delay
    runPoll();
    setInterval(runPoll, 60_000);
  }, 10_000);
});
