import '../db/schema.js'; // ensure types are loaded
import { getDb } from '../db/connection.js';
import { runMigrations } from '../db/schema.js';
import { syncAllContacts } from '../services/syncContacts.js';

runMigrations();

console.log('Syncing contacts from Feishu...');

syncAllContacts().then(result => {
  console.log(`Done! Synced ${result.synced} contacts`);
  if (result.errors.length) {
    console.log(`  ${result.errors.length} error(s):`);
    result.errors.forEach(e => console.log(' -', e));
  }
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
