/**
 * Apply pending migrations then seed. Run via `npm run db:migrate`, and
 * automatically at server startup (see hooks.server.ts).
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index';
import { seed } from './seed';

export async function runMigrations() {
  migrate(db, { migrationsFolder: './drizzle' });
  await seed();
}

// Allow running directly: `node --import tsx src/lib/server/db/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('[migrate] done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
