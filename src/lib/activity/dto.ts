/**
 * get_store_activity / get_store_activity_summary payloads → typed DTOs.
 *
 * Zod at the boundary. Rules (shared with the app's dependency-free copy in
 * webnegosyo-app/lib/activity/dto.ts, held equal by a parity test):
 * - a malformed payload throws (our own RPC returning junk is a bug, not data);
 * - a kind this build does not know (a newer server) is DROPPED, never crashes;
 * - a row whose category disagrees with its kind is dropped;
 * - unknown flags are filtered out; numeric strings become numbers.
 */

import { z } from 'zod'
import type {
  ActivityJson,
  StoreActivityActorTotal,
  StoreActivityDayTotal,
  StoreActivityEvent,
  StoreActivityKindTotal,
  StoreActivityRoutineTotal,
  StoreActivitySummary,
} from './store-event'
import { categoryOfKind, isActivityFlag, isActivityKind, isActivitySubjectType } from './taxonomy'

const numeric = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null || value === '') return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  })

const nullableText = z.string().nullable()
const json = z.record(z.string(), z.unknown()).nullable()
const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not a timestamp')

const rowSchema = z.object({
  id: z.string().min(1),
  outlet_id: nullableText,
  outlet_name: nullableText,
  occurred_at: isoTime,
  category: z.string(),
  kind: z.string(),
  is_routine: z.boolean(),
  actor_user_id: nullableText,
  actor_name: nullableText,
  approved_by_name: nullableText,
  amount: numeric,
  quantity: numeric,
  unit: nullableText,
  reason: nullableText,
  note: nullableText,
  subject_type: nullableText,
  subject_ref: nullableText,
  order_number: nullableText,
  before: json,
  after: json,
  summary: json,
  flags: z.array(z.string()).nullable(),
  reviewed_at: isoTime.nullable(),
  reviewed_by_name: nullableText,
})

type ActivityRow = z.infer<typeof rowSchema>

function fail(what: string, error: z.ZodError): never {
  const issue = error.issues[0]
  throw new Error(`Invalid store activity ${what}: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim())
}

function toIso(value: string): string {
  return new Date(Date.parse(value)).toISOString()
}

function toEvent(row: ActivityRow): StoreActivityEvent | null {
  if (!isActivityKind(row.kind)) return null
  const category = categoryOfKind(row.kind)
  if (row.category !== category) return null
  return {
    id: row.id,
    outletId: row.outlet_id,
    outletName: row.outlet_name,
    occurredAt: toIso(row.occurred_at),
    category,
    kind: row.kind,
    isRoutine: row.is_routine,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    approvedByName: row.approved_by_name,
    amount: row.amount,
    quantity: row.quantity,
    unit: row.unit,
    reason: row.reason,
    note: row.note,
    subjectType: isActivitySubjectType(row.subject_type) ? row.subject_type : null,
    subjectRef: row.subject_ref,
    orderNumber: row.order_number,
    before: row.before as ActivityJson | null,
    after: row.after as ActivityJson | null,
    summary: (row.summary ?? {}) as ActivityJson,
    flags: (row.flags ?? []).filter(isActivityFlag),
    reviewedAt: row.reviewed_at === null ? null : toIso(row.reviewed_at),
    reviewedByName: row.reviewed_by_name,
  }
}

/** One page of get_store_activity rows. `null` (no rows) is an empty page. */
export function parseStoreActivityRows(data: unknown): StoreActivityEvent[] {
  if (data === null || data === undefined) return []
  const parsed = z.array(rowSchema).safeParse(data)
  if (!parsed.success) fail('rows', parsed.error)
  return parsed.data.map(toEvent).filter((event): event is StoreActivityEvent => event !== null)
}

const kindTotalSchema = z.object({
  kind: z.string(),
  statutory: z.boolean().nullable().optional(),
  count: numeric,
  amount: numeric,
  quantity: numeric,
})
const actorTotalSchema = z.object({
  actorUserId: nullableText,
  actorName: nullableText,
  kind: z.string(),
  count: numeric,
  amount: numeric,
})
const dayTotalSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.string(),
  count: numeric,
  amount: numeric,
})
const routineTotalSchema = z.object({
  kind: z.string(),
  count: numeric,
  amount: numeric,
})
const summarySchema = z.object({
  byKind: z.array(kindTotalSchema),
  byActor: z.array(actorTotalSchema),
  byDay: z.array(dayTotalSchema),
  routine: z.array(routineTotalSchema).optional(),
  flaggedOpen: numeric,
})

export function parseStoreActivitySummary(data: unknown): StoreActivitySummary {
  const parsed = summarySchema.safeParse(data)
  if (!parsed.success) fail('summary', parsed.error)
  const { byKind, byActor, byDay, routine, flaggedOpen } = parsed.data
  return {
    byKind: byKind.flatMap((entry): StoreActivityKindTotal[] =>
      isActivityKind(entry.kind)
        ? [{ kind: entry.kind, statutory: entry.statutory === true, count: entry.count ?? 0, amount: entry.amount, quantity: entry.quantity }]
        : [],
    ),
    byActor: byActor.flatMap((entry): StoreActivityActorTotal[] =>
      isActivityKind(entry.kind)
        ? [{ actorUserId: entry.actorUserId, actorName: entry.actorName, kind: entry.kind, count: entry.count ?? 0, amount: entry.amount }]
        : [],
    ),
    byDay: byDay.flatMap((entry): StoreActivityDayTotal[] =>
      isActivityKind(entry.kind) ? [{ day: entry.day, kind: entry.kind, count: entry.count ?? 0, amount: entry.amount }] : [],
    ),
    routine: (routine ?? []).flatMap((entry): StoreActivityRoutineTotal[] =>
      isActivityKind(entry.kind) ? [{ kind: entry.kind, count: entry.count ?? 0, amount: entry.amount }] : [],
    ),
    flaggedOpen: flaggedOpen ?? 0,
  }
}
