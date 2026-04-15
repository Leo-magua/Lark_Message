/**
 * 修复丢失的 topics 数据：从 event_topics 提取 topic_id，在 topics 表补全记录。
 *
 * 运行：npm run cli:fix-topics（在 server 目录下）
 */
import { getDb } from '../db/connection.js';

function main(): void {
  const db = getDb();

  const allTopicIds = db.prepare('SELECT DISTINCT topic_id FROM event_topics').all() as { topic_id: string }[];
  const existingTopicIds = db.prepare('SELECT topic_id FROM topics').all() as { topic_id: string }[];
  const existingSet = new Set(existingTopicIds.map((t) => t.topic_id));

  console.log(`[Fix] Found ${allTopicIds.length} unique topic_ids in event_topics`);
  console.log(`[Fix] Existing topics in table: ${existingTopicIds.length}`);

  const defaultColor = '0';
  const insert = db.prepare(`
    INSERT OR IGNORE INTO topics (topic_id, name, color, visible, topic_context)
    VALUES (?, ?, ?, 1, '')
  `);

  let created = 0;
  for (const { topic_id } of allTopicIds) {
    if (existingSet.has(topic_id)) continue;

    let name: string;
    if (topic_id.startsWith('topic_')) {
      const suffix = topic_id.slice(6);
      name = suffix.length > 10 ? `主题 ${suffix.slice(0, 8)}` : `主题 ${suffix}`;
    } else if (topic_id === 'topic2') {
      name = '主题 2';
    } else {
      name = topic_id.length > 15 ? topic_id.slice(0, 12) + '...' : topic_id;
    }

    insert.run(topic_id, name, defaultColor);
    created++;
    console.log(`[Fix] Created topic: ${topic_id} → "${name}"`);
  }

  console.log(`[Fix] Done. Created ${created} missing topic records.`);

  const count = db.prepare('SELECT COUNT(*) as c FROM topics').get() as { c: number };
  console.log(`[Fix] Total topics in table now: ${count.c}`);
}

try {
  main();
} catch (e) {
  console.error('[Fix] Error:', e);
  process.exit(1);
}
