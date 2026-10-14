/**
 * Store activity reads and the one review write, against the platform RPCs
 * (supabase/migrations/20261012151500_store_activity_rpcs.sql).
 *
 * The app calls them with the signed-in user's own session: the functions
 * decide visibility from auth.uid() (own rows always, the store's rows only
 * with activity_view / approve_requests / owner, flags stripped otherwise), so
 * nothing here filters for privacy — a client filter is never a boundary.
 *
 * The client is injected so the tests can record exactly what is sent.
 */

import { parseStoreActivityRows, parseStoreActivitySummary } from "./dto";
import type { StoreActivityEvent, StoreActivitySummary } from "./store-event";
import type { ActivityCategory, ActivitySubjectType } from "./taxonomy";

export const ACTIVITY_PAGE_SIZE = 50;
/** get_store_activity clamps to this; asking for more only hides the clamp. */
export const ACTIVITY_MAX_PAGE_SIZE = 100;

/** Codes meaning "this database has no activity functions yet" (migration not applied). */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set(["PGRST202", "42883"]);
const NOT_ALLOWED_CODE = "42501";

export interface RpcError {
  message: string;
  code?: string;
}

export interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

/** The slice of a supabase-js client these reads use. */
export interface ActivityRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
}

/** Keyset cursor: the last row's RAW occurred_at (microseconds kept) and id. */
export interface ActivityCursor {
  occurredAt: string;
  id: string;
}

export interface ActivityQuery {
  tenantId: string;
  limit?: number;
  cursor?: ActivityCursor | null;
  since?: string | null;
  until?: string | null;
  /** Empty or absent = every category the caller may see. */
  categories?: readonly ActivityCategory[] | null;
  /** Only ever narrows; the server decides what the account may reach. */
  outletId?: string | null;
  actorUserId?: string | null;
  flaggedOnly?: boolean;
  includeRoutine?: boolean;
  search?: string | null;
  subjectType?: ActivitySubjectType | null;
  subjectRef?: string | null;
}

export interface ActivityPage {
  events: StoreActivityEvent[];
  nextCursor: ActivityCursor | null;
}

export interface ActivitySummaryQuery {
  tenantId: string;
  since: string;
  until: string;
  outletId?: string | null;
}

export class ActivityRepoError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "ActivityRepoError";
    this.code = code;
  }
}

/** True when the platform database does not have the activity functions yet. */
export function isActivityUnavailable(error: unknown): boolean {
  return error instanceof ActivityRepoError && error.code !== null && UNAVAILABLE_CODES.has(error.code);
}

function requireTenant(tenantId: string): string {
  if (!tenantId || !tenantId.trim()) throw new ActivityRepoError("No store is selected.");
  return tenantId;
}

function toRepoError(error: RpcError): ActivityRepoError {
  const code = error.code ?? null;
  if (code === NOT_ALLOWED_CODE) {
    return new ActivityRepoError("Not allowed to see this store's activity.", code);
  }
  if (code !== null && UNAVAILABLE_CODES.has(code)) {
    return new ActivityRepoError("Store activity isn't switched on for this store yet.", code);
  }
  return new ActivityRepoError(error.message || "Couldn't load activity.", code);
}

async function call(client: ActivityRpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw toRepoError(error);
  return data;
}

function pageSize(limit: number | undefined): number {
  const wanted = Math.floor(limit ?? ACTIVITY_PAGE_SIZE);
  return Math.min(Math.max(wanted, 1), ACTIVITY_MAX_PAGE_SIZE);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function cursorFromRaw(rows: readonly unknown[], limit: number): ActivityCursor | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1] as Record<string, unknown> | null;
  const occurredAt = last?.occurred_at;
  const id = last?.id;
  return typeof occurredAt === "string" && typeof id === "string" ? { occurredAt, id } : null;
}

export async function fetchActivityPage(client: ActivityRpcClient, query: ActivityQuery): Promise<ActivityPage> {
  const tenantId = requireTenant(query.tenantId);
  const limit = pageSize(query.limit);
  const categories = query.categories && query.categories.length > 0 ? [...query.categories] : null;
  const data = await call(client, "get_store_activity", {
    p_tenant_id: tenantId,
    p_limit: limit,
    p_before_occurred_at: query.cursor?.occurredAt ?? null,
    p_before_id: query.cursor?.id ?? null,
    p_since: query.since ?? null,
    p_until: query.until ?? null,
    p_categories: categories,
    p_outlet_id: query.outletId ?? null,
    p_actor_user_id: query.actorUserId ?? null,
    p_flagged_only: query.flaggedOnly === true,
    p_include_routine: query.includeRoutine === true,
    p_search: blankToNull(query.search),
    p_subject_type: query.subjectType ?? null,
    p_subject_ref: query.subjectRef ?? null,
  });
  const events = parseStoreActivityRows(data);
  const rows = Array.isArray(data) ? data : [];
  return { events, nextCursor: cursorFromRaw(rows, limit) };
}

export async function fetchActivitySummary(
  client: ActivityRpcClient,
  query: ActivitySummaryQuery,
): Promise<StoreActivitySummary> {
  const data = await call(client, "get_store_activity_summary", {
    p_tenant_id: requireTenant(query.tenantId),
    p_since: query.since,
    p_until: query.until,
    p_outlet_id: query.outletId ?? null,
  });
  return parseStoreActivitySummary(data);
}

/** Marks one flagged row reviewed; resolves with the (first) review time. */
export async function markActivityReviewed(client: ActivityRpcClient, id: string): Promise<string> {
  const data = await call(client, "mark_store_activity_reviewed", { p_id: id });
  const ms = typeof data === "string" ? Date.parse(data) : Number.NaN;
  if (Number.isNaN(ms)) throw new ActivityRepoError("Couldn't mark this reviewed. Try again.");
  return new Date(ms).toISOString();
}
