import { Router } from 'express';
import {
  analyzeContactMessages,
  analyzeAllContacts,
} from '../services/aiAnalyze.js';

const router = Router();

// POST /api/ai/analyze/:contactId
// Analyze recent messages for a specific contact/chat
router.post('/analyze/:contactId', async (req, res) => {
  const { contactId } = req.params;
  const { limit = 50 } = (req.body ?? {}) as { limit?: number };

  try {
    const result = await analyzeContactMessages(contactId, limit);

    if ('error' in result) {
      const statusCode = result.error === 'API key not configured' ? 400 : 500;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      events: result.events.length,
      topics: result.new_topics.length,
    });
  } catch (err) {
    console.error('[ai/analyze] Error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/ai/analyze-all
// Batch analyze all chats with recent messages
router.post('/analyze-all', async (req, res) => {
  const { limit = 50 } = (req.body ?? {}) as { limit?: number };

  try {
    const result = await analyzeAllContacts(limit);
    res.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[ai/analyze-all] Error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
