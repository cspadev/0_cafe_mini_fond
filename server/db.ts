import { neon } from '@neondatabase/serverless';

/** The little of a SQL client the server needs; Neon serves production, PGlite the tests and local development. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Connection string given by the Vercel / Neon integration. */
export const databaseUrl = (env: Record<string, string | undefined> = process.env): string | undefined =>
  env.DATABASE_URL ?? env.POSTGRES_URL;

export function neonDb(url: string): Db {
  const sql = neon(url);
  return { query: (text, params = []) => sql.query(text, params) as unknown as Promise<never[]> };
}

/** Postgres error code of a unique-key violation. */
export const isDuplicate = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505';
