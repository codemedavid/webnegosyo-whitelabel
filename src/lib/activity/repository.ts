/**
 * Store activity reads — the three RPCs behind one small interface.
 *
 * The caller supplies the Supabase client (cookie session on the web, bearer in
 * routes); visibility is decided by the database from auth.uid(), so nothing
 * here filters by role. Inputs are validated before any network call.
 *
 * Until src/types/database.ts is regenerated with these RPCs, pass the client as
 * `supabase as unknown as ActivityRpcClient`.
 */

import { z } from 'zod'
import { parseStoreActivityRows, parseStoreActivitySummary } from './dto'
import type { StoreActivityEvent, StoreActivitySummary } from './store-event'
import { ACTIVITY_CATEGORIES, SUBJECT_TYPES, type ActivityCategory, type ActivitySubjectType } from './taxonomy'

export const MAX_ACTIVITY_PAGE = 100
export const DEFAULT_ACTIVITY_PAGE = 50
export const MAX_SUMMARY_DAYS = 93
const MAX_SEARCH_LENGTH = 80
const DAY_MS = 24 * 60 * 60 * 1000

export interface RpcResult {
  data: unknown
  error: { message: string; code?: string } | null
}

export interface ActivityRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>
}

export type StoreActivityErrorCode = 'invalid_input' | 'not_allowed' | 'server'

export class StoreActivityError extends Error {
  readonly code: StoreActivityErrorCode

  constructor(code: StoreActivityErrorCode, message: string) {
    super(message)
    this.name = 'StoreActivityError'
    this.code = code
  }
}

export interface ActivityCursor {
  occurredAt: string
  id: string
}

export interface StoreActivityQuery {
  limit?: number
  cursor?: ActivityCursor | null
  since?: string | null
  until?: string | null
  categories?: readonly ActivityCategory[] | null
  outletId?: string | null
  actorUserId?: string | null
  flaggedOnly?: boolean
  includeRoutine?: boolean
  search?: string | null
  subjectType?: ActivitySubjectType | null
  subjectRef?: string | null
}

export interface StoreActivityPage {
  events: StoreActivityEvent[]
  /** Pass back as `cursor` for the next (older) page; null when this was the last. */
  nextCursor: ActivityCursor | null
}

export interface ActivitySummaryWindow {
  since: string
  until: string
  outletId?: string | null
}

const uuid = z.string().uuid()
const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'must be a timestamp')

const querySchema = z.object({
  limit: z.number().int().min(1).max(MAX_ACTIVITY_PAGE).default(DEFAULT_ACTIVITY_PAGE),
  cursor: z.object({ occurredAt: timestamp, id: uuid }).nullable().default(null),
  since: timestamp.nullable().default(null),
  until: timestamp.nullable().default(null),
  categories: z.array(z.enum(ACTIVITY_CATEGORIES)).min(1).nullable().default(null),
  outletId: uuid.nullable().default(null),
  actorUserId: uuid.nullable().default(null),
  flaggedOnly: z.boolean().default(false),
  includeRoutine: z.boolean().default(false),
  search: z
    .string()
    .max(MAX_SEARCH_LENGTH)
    .transform((value) => value.trim() || null)
    .nullable()
    .default(null),
  subjectType: z.enum(SUBJECT_TYPES).nullable().default(null),
  subjectRef: z.string().min(1).max(200).nullable().default(null),
})

function validated<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new StoreActivityError('invalid_input', `Invalid ${what}: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim())
}

async function call(client: ActivityRpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args)
  if (!error) return data
  const code: StoreActivityErrorCode = error.code === '42501' ? 'not_allowed' : error.code === '22023' ? 'invalid_input' : 'server'
  throw new StoreActivityError(code, error.message || 'Could not load store activity.')
}

function lastCursor(raw: unknown): ActivityCursor | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const last = raw[raw.length - 1] as { id?: unknown; occurred_at?: unknown }
  if (typeof last.id !== 'string' || typeof last.occurred_at !== 'string') return null
  return { id: last.id, occurredAt: new Date(Date.parse(last.occurred_at)).toISOString() }
}

/** One keyset page, newest first. */
export async function fetchStoreActivity(
  client: ActivityRpcClient,
  tenantId: string,
  query: StoreActivityQuery = {},
): Promise<StoreActivityPage> {
  const tenant = validated(uuid, tenantId, 'tenant id')
  const q = validated(querySchema, query, 'activity query')
  const raw = await call(client, 'get_store_activity', {
    p_tenant_id: tenant,
    p_limit: q.limit,
    p_before_occurred_at: q.cursor?.occurredAt ?? null,
    p_before_id: q.cursor?.id ?? null,
    p_since: q.since,
    p_until: q.until,
    p_categories: q.categories,
    p_outlet_id: q.outletId,
    p_actor_user_id: q.actorUserId,
    p_flagged_only: q.flaggedOnly,
    p_include_routine: q.includeRoutine,
    p_search: q.search,
    p_subject_type: q.subjectType,
    p_subject_ref: q.subjectRef,
  })
  const events = parseStoreActivityRows(raw)
  // The cursor follows the RAW page: rows this build drops must not stall paging.
  const rawCount = Array.isArray(raw) ? raw.length : 0
  return { events, nextCursor: rawCount >= q.limit ? lastCursor(raw) : null }
}

/** Roll-ups for a window of at most 93 days. */
export async function fetchStoreActivitySummary(
  client: ActivityRpcClient,
  tenantId: string,
  window: ActivitySummaryWindow,
): Promise<StoreActivitySummary> {
  const tenant = validated(uuid, tenantId, 'tenant id')
  const since = validated(timestamp, window.since, 'since')
  const until = validated(timestamp, window.until, 'until')
  const outletId = validated(uuid.nullable(), window.outletId ?? null, 'outlet id')
  const span = Date.parse(until) - Date.parse(since)
  if (span <= 0) throw new StoreActivityError('invalid_input', 'The window must end after it starts.')
  if (span > MAX_SUMMARY_DAYS * DAY_MS) {
    throw new StoreActivityError('invalid_input', `The window may be at most ${MAX_SUMMARY_DAYS} days.`)
  }
  const raw = await call(client, 'get_store_activity_summary', {
    p_tenant_id: tenant,
    p_since: since,
    p_until: until,
    p_outlet_id: outletId,
  })
  return parseStoreActivitySummary(raw)
}

/** Marks one row reviewed (idempotent). Returns when it was reviewed, ISO. */
export async function markStoreActivityReviewed(client: ActivityRpcClient, id: string): Promise<string | null> {
  const rowId = validated(uuid, id, 'activity id')
  const raw = await call(client, 'mark_store_activity_reviewed', { p_id: rowId })
  return typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? new Date(Date.parse(raw)).toISOString() : null
}
