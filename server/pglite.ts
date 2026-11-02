import { PGlite } from '@electric-sql/pglite';
import type { Db } from './db.ts';

/** In-process Postgres (WASM) behind the same interface as Neon: for tests and the local dev server. Without `dataDir` it lives in memory. */
export async function pgliteDb(dataDir?: string): Promise<Db & { close(): Promise<void> }> {
  const pg = await PGlite.create(dataDir);
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows as never,
    close: () => pg.close(),
  };
}
