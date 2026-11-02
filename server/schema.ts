/**
 * Database schema, one statement per entry (the Neon HTTP driver runs one statement at a time). Idempotent: `npm run db:migrate`
 * can run on every deployment. Only additive changes belong here.
 *
 * `rounds` and `hazards` hold the final attempt of every played round: the main data. Attempts thrown away by a retry
 * never enter them; they live in `discarded_attempts`.
 */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS games (
    id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz NOT NULL,
    duration_s int NOT NULL,
    level smallint NOT NULL,
    planned_rounds smallint NOT NULL,
    ships0 int NOT NULL,
    capital int NOT NULL,
    retries_allowed smallint NOT NULL,
    seed bigint NOT NULL,
    ending text NOT NULL CHECK (ending IN ('completed', 'gaveUp', 'bankrupt')),
    rounds_played smallint NOT NULL,
    retries_used smallint NOT NULL,
    final_ships int NOT NULL,
    profit int NOT NULL,
    fleet_value int NOT NULL,
    total int NOT NULL,
    pearls int NOT NULL,
    success_rate float8 NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS games_setup ON games (level, planned_rounds, ships0, capital)`,
  `ALTER TABLE games ADD COLUMN IF NOT EXISTS score_version int NOT NULL DEFAULT 1`,
  `CREATE INDEX IF NOT EXISTS games_version_setup ON games (score_version, level, planned_rounds, ships0, capital)`,
  `CREATE TABLE IF NOT EXISTS rounds (
    game_id text NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    round smallint NOT NULL,
    attempts smallint NOT NULL,
    ships_start int NOT NULL,
    ships_end int NOT NULL,
    premium int NOT NULL,
    fund int NOT NULL,
    wrecked int NOT NULL,
    repaired int NOT NULL,
    lost int NOT NULL,
    unused_repairs int NOT NULL,
    pearls int NOT NULL,
    revenue int NOT NULL,
    profit int NOT NULL,
    value int NOT NULL,
    fund_status text NOT NULL,
    pirate_rows smallint NOT NULL,
    kraken_rows smallint NOT NULL,
    storm_rows smallint NOT NULL,
    PRIMARY KEY (game_id, round)
  )`,
  `CREATE TABLE IF NOT EXISTS hazards (
    game_id text NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    round smallint NOT NULL,
    idx smallint NOT NULL,
    formation text NOT NULL,
    kind text NOT NULL,
    cells text NOT NULL,
    entered int NOT NULL,
    survived int NOT NULL,
    after int[] NOT NULL,
    PRIMARY KEY (game_id, round, idx)
  )`,
  `CREATE INDEX IF NOT EXISTS hazards_formation ON hazards (formation)`,
  `CREATE TABLE IF NOT EXISTS discarded_attempts (
    game_id text NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    round smallint NOT NULL,
    attempt smallint NOT NULL,
    ships_start int NOT NULL,
    premium int NOT NULL,
    wrecked int NOT NULL,
    repaired int NOT NULL,
    lost int NOT NULL,
    pearls int NOT NULL,
    profit int NOT NULL,
    value int NOT NULL,
    hazards jsonb NOT NULL,
    PRIMARY KEY (game_id, round, attempt)
  )`,
];

export async function migrate(db: { query(text: string): Promise<unknown> }): Promise<void> {
  for (const statement of SCHEMA) await db.query(statement);
}
