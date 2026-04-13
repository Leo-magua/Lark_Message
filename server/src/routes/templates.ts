import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

interface TemplateRow {
  id: number;
  name: string;
  system_prompt: string;
  description: string;
  is_default: number;
  created_at: string;
}

function rowToTemplate(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    description: row.description,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

// GET /api/templates
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM reply_templates ORDER BY is_default DESC, created_at ASC').all() as unknown as TemplateRow[];
  res.json({ templates: rows.map(rowToTemplate) });
});

// POST /api/templates
router.post('/', (req, res) => {
  const db = getDb();
  const { name, systemPrompt, description = '', isDefault = false } = req.body as {
    name: string;
    systemPrompt: string;
    description?: string;
    isDefault?: boolean;
  };

  if (!name || !systemPrompt) {
    res.status(400).json({ error: 'name and systemPrompt are required' });
    return;
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    db.prepare("UPDATE reply_templates SET is_default = 0 WHERE is_default = 1").run();
  }

  const info = db.prepare('INSERT INTO reply_templates (name, system_prompt, description, is_default) VALUES (?, ?, ?, ?)')
    .run(name, systemPrompt, description, isDefault ? 1 : 0);

  const newRow = db.prepare('SELECT * FROM reply_templates WHERE id = ?').get(info.lastInsertRowid) as TemplateRow | undefined;
  if (!newRow) {
    res.status(500).json({ error: 'Failed to create' });
    return;
  }

  res.json({ success: true, template: rowToTemplate(newRow) });
});

// PUT /api/templates/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { name, systemPrompt, description, isDefault } = req.body as {
    name?: string;
    systemPrompt?: string;
    description?: string;
    isDefault?: boolean;
  };

  const existing = db.prepare('SELECT * FROM reply_templates WHERE id = ?').get(id) as TemplateRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (isDefault) {
    db.prepare("UPDATE reply_templates SET is_default = 0 WHERE is_default = 1").run();
  }

  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { id };

  if (name !== undefined) { updates.push('name = :name'); params.name = name; }
  if (systemPrompt !== undefined) { updates.push('system_prompt = :systemPrompt'); params.systemPrompt = systemPrompt; }
  if (description !== undefined) { updates.push('description = :description'); params.description = description; }
  if (isDefault !== undefined) { updates.push('is_default = :isDefault'); params.isDefault = isDefault ? 1 : 0; }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  db.prepare(`UPDATE reply_templates SET ${updates.join(', ')} WHERE id = :id`).run(params);

  const updated = db.prepare('SELECT * FROM reply_templates WHERE id = ?').get(id) as unknown as TemplateRow;
  res.json({ success: true, template: rowToTemplate(updated) });
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT id FROM reply_templates WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  db.prepare('DELETE FROM reply_templates WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
