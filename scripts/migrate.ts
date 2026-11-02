// Creates the database tables (idempotent): npm run db:migrate. `--if-configured` skips quietly without DATABASE_URL (used by the Vercel build).
import { databaseUrl, neonDb } from '../server/db.ts';
import { migrate } from '../server/schema.ts';

const url = databaseUrl();
if (!url) {
  if (process.argv.includes('--if-configured')) {
    console.log('db:migrate: DATABASE_URL is not set, skipping');
    process.exit(0);
  }
  console.error('db:migrate: set DATABASE_URL (vercel env pull .env.local)');
  process.exit(1);
}

await migrate(neonDb(url));
console.log('db:migrate: schema is up to date');
