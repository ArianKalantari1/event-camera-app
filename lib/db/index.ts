import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * One pooled client per process.
 *
 * Next's dev server re-evaluates modules on every edit, so the client is parked
 * on globalThis — without it each hot reload opens another pool and Postgres
 * runs out of connections within a few minutes of editing.
 */

declare global {
  var __eventHubSql: ReturnType<typeof postgres> | undefined;
}

function client() {
  if (!globalThis.__eventHubSql) {
    globalThis.__eventHubSql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalThis.__eventHubSql;
}

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!cached) cached = drizzle(client(), { schema });
  return cached;
}

export { schema };
