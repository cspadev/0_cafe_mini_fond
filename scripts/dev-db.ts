import { neonDb, type Db } from '../server/db.ts';
import { pgliteDb } from '../server/pglite.ts';
import { migrate } from '../server/schema.ts';

/** The database of the local tooling: Postgres/Neon when DEV_DATABASE_URL is set, otherwise an in-process one kept in .devdb/ (one process at a time). */
export async function openDevDb(): Promise<Db & { close?: () => Promise<void> }> {
  const url = process.env.DEV_DATABASE_URL;
  const db: Db & { close?: () => Promise<void> } = url ? neonDb(url) : await pgliteDb(process.env.DEV_DB_DIR ?? '.devdb');
  await migrate(db);
  return db;
}
