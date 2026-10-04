// The small database surface the app uses, so the same queries run on Railway's Postgres
// (postgres.js) and on PGlite (in-process Postgres) for local development and tests.

export type Row = Record<string, unknown>;

export interface Queryable {
  /** Runs one parameterised statement ($1, $2, …) and returns its rows. */
  query<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs a multi-statement script with no parameters (migrations, seeds). */
  script(text: string): Promise<void>;
}

export interface Database {
  /** Runs `fn` in a transaction; commits if it resolves, rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Runs a multi-statement SQL script with no parameters (migrations, seeds). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Timestamps come back as Date from both drivers; screens work with ISO strings. */
export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}
