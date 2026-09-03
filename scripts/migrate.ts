import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applies pending migrations, then exits. Uses its own single-connection client
 * rather than the app pool — a migration must not share a pool that other work
 * is using, and `max: 1` keeps the statements strictly ordered.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required. See .env.example.');

  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
    console.log('migrations applied');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
