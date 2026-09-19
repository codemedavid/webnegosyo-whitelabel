/**
 * The primitives every platform-Supabase adapter module shares.
 *
 * Split out of `supabase-adapter.ts` so the analytics and product-cost
 * modules can use the same narrow client, the same tenant guard and the same
 * branch scoping WITHOUT importing the order adapter (which imports them back
 * for dispatch — a cycle otherwise).
 */

import type { BranchScope } from "../branch-scope";

/**
 * The slice of supabase-js the adapters use. Narrow on purpose: it keeps the
 * query shapes assertable against a recording fake, and documents exactly what
 * the adapters are allowed to do.
 */
export interface PlatformClient {
  from(table: string): PlatformQueryBuilder;
}

export interface PlatformQueryBuilder {
  select(columns?: string): PlatformQueryBuilder;
  eq(column: string, value: unknown): PlatformQueryBuilder;
  or(filters: string): PlatformQueryBuilder;
  neq(column: string, value: unknown): PlatformQueryBuilder;
  in(column: string, values: readonly unknown[]): PlatformQueryBuilder;
  gte(column: string, value: unknown): PlatformQueryBuilder;
  lte(column: string, value: unknown): PlatformQueryBuilder;
  /** Strictly less than — the exclusive upper end of a half-open window. */
  lt(column: string, value: unknown): PlatformQueryBuilder;
  order(column: string, options: { ascending: boolean }): PlatformQueryBuilder;
  limit(count: number): PlatformQueryBuilder;
  insert(values: unknown): PlatformQueryBuilder;
  update(values: unknown): PlatformQueryBuilder;
  upsert(values: unknown, options?: { onConflict?: string }): PlatformQueryBuilder;
  // Only ever used to replace an edited order's items, and always narrowed by
  // order_id. Widening this interface widens what the adapter can destroy.
  delete(): PlatformQueryBuilder;
  maybeSingle(): PlatformQueryBuilder;
  single(): PlatformQueryBuilder;
  then<TResult>(
    onfulfilled: (value: { data: unknown; error: { message: string } | null }) => TResult,
    onrejected?: (reason: unknown) => TResult
  ): Promise<TResult>;
}

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

/** Safety cap for bulk reads, mirroring Convex's QUERY_LIMIT. */
export const STATS_LIMIT = 10000;

/** A store-wide account, and the default for every caller that passes no scope. */
export const STORE_WIDE: BranchScope = { kind: "all" };

/** Unwrap a PostgREST result, turning an error into a throw. */
export async function unwrap<T>(builder: PlatformQueryBuilder): Promise<T> {
  const { data, error } = (await builder) as unknown as QueryResult<T>;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The tenant every adapter read and write is scoped to. RLS alone is not
 * enough — the `*_select_by_tenant` policies grant a SUPERADMIN every tenant's
 * rows, so an unscoped query would render another merchant's data inside an
 * impersonated store. Fails loudly rather than querying unscoped.
 */
export function requireTenant(tenantId: string): string {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("No tenant is selected — refusing to query the platform database.");
  }
  return tenantId;
}

export function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" ? (args as Record<string, unknown>) : {};
}

/**
 * Narrow a query to one branch, when the account is confined to one.
 *
 * Layered ON TOP of the tenant filter, never instead of it: outlet ids are
 * unique today, but relying on that would put a cross-tenant leak one schema
 * change away. A store-wide account adds no clause at all.
 *
 * `column` is a parameter because `order_items` has no branch of its own and is
 * scoped through the join on its parent order — the same way its tenant is.
 */
export function scopeToBranch(
  builder: PlatformQueryBuilder,
  scope: BranchScope,
  column = "outlet_id"
): PlatformQueryBuilder {
  if (scope.kind === "all") return builder;
  return builder.eq(column, scope.outletId);
}

/**
 * Postgres `numeric` arrives as a string over PostgREST. Left uncoerced, money
 * totals would concatenate instead of add.
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** A non-empty string argument, or null for anything else a screen might send. */
export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * A bounded integer argument. Anything unparseable falls back to the default,
 * and the result is clamped so a malformed or hostile argument can never widen
 * a read past `max`.
 */
export function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
