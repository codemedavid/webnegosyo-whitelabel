import postgres from "postgres";
import type { SqlRunner } from "./supabase-deploy";

/**
 * DDL execution adapter for the per-tenant Supabase order backend.
 *
 * This is the ONLY module that depends on a Postgres driver. It implements the
 * `SqlRunner` seam that `deployOrderSchema` (in `supabase-deploy.ts`) accepts,
 * so the pure deploy orchestration stays driver-agnostic and unit-testable.
 *
 * We connect over the tenant project's Postgres connection string because the
 * anon/service keys go through PostgREST, which cannot run DDL. The connection
 * string works for separately-owned tenant projects (no shared Supabase org
 * required), which is the whole point of "each tenant its own project."
 */

/** The minimal slice of a postgres.js connection this adapter needs. */
export interface PgConnection {
  unsafe: (sql: string) => Promise<unknown>;
  end: (options?: { timeout?: number }) => Promise<void>;
}

/** Opens a connection to a Postgres database. Injected for testability. */
export type PgConnector = (dbUrl: string) => PgConnection;

// One-shot connection: single socket, short timeouts, no prepared statements
// (the bundle is multi-statement raw DDL run through the simple query protocol).
const CONNECTION_OPTIONS = {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 15,
  prepare: false,
} as const;

const defaultConnect: PgConnector = (dbUrl: string) =>
  postgres(dbUrl, CONNECTION_OPTIONS) as unknown as PgConnection;

/**
 * Apply a raw SQL bundle to a tenant's Supabase project over its connection
 * string. Opens a single connection, runs the bundle, and always closes the
 * connection — even on failure — so no socket leaks per deploy. Errors are
 * re-thrown for `deployOrderSchema` to normalize into a result.
 *
 * `connect` is injectable so the driver stays a swappable, mock-free seam.
 */
export async function applySupabaseSchema(
  dbUrl: string,
  bundleSql: string,
  connect: PgConnector = defaultConnect
): Promise<void> {
  const sql = connect(dbUrl);
  try {
    await sql.unsafe(bundleSql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Bind a tenant's connection string into a `SqlRunner` for `deployOrderSchema`.
 */
export function createSchemaRunner(
  dbUrl: string,
  connect: PgConnector = defaultConnect
): SqlRunner {
  return (bundleSql: string) => applySupabaseSchema(dbUrl, bundleSql, connect);
}
