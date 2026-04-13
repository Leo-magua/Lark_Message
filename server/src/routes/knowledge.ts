import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

interface KnowledgeRow {
  id: number;
  title: string;
  content: string;
  tags: string;
  created_at: string;
}

function rowToKnowledge(row: KnowledgeRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
  };
}

// GET /api/knowledge - list all
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM knowledge_base ORDER BY created_at DESC').all() as unknown as KnowledgeRow[];
  res.json({ knowledge: rows.map(rowToKnowledge) });
});

// POST /api/knowledge - create
router.post('/', (req, res) => {
  const db = getDb();
  const { title, content, tags = [] } = req.body as { title: string; content: string; tags?: string[] };

  if (!title || !content) {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }

  const tagsJson = JSON.stringify(tags);
  const info = db.prepare('INSERT INTO knowledge_base (title, content, tags) VALUES (?, ?, ?)').run(title, content, tagsJson);

  const newRow = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(info.lastInsertRowid) as KnowledgeRow | undefined;
  if (!newRow) {
    res.status(500).json({ error: 'Failed to create' });
    return;
  }

  res.json({ success: true, knowledge: rowToKnowledge(newRow) });
});

// PUT /api/knowledge/:id - update
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { title, content, tags } = req.body as { title?: string; content?: string; tags?: string[] };

  const existing = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) as KnowledgeRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { id };

  if (title !== undefined) { updates.push('title = :title'); params.title = title; }
  if (content !== undefined) { updates.push('content = :content'); params.content = content; }
  if (tags !== undefined) { updates.push('tags = :tags'); params.tags = JSON.stringify(tags); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  db.prepare(`UPDATE knowledge_base SET ${updates.join(', ')} WHERE id = :id`).run(params);

  const updated = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) as unknown as KnowledgeRow;
  res.json({ success: true, knowledge: rowToKnowledge(updated) });
});

// DELETE /api/knowledge/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM knowledge_base WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
