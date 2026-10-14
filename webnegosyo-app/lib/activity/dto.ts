/**
 * get_store_activity / get_store_activity_summary payloads → typed DTOs.
 *
 * The app has no zod, so this is the hand-written twin of the web's
 * src/lib/activity/dto.ts; tests/unit/activity/store-activity-app-parity.test.ts
 * holds the two to the same output on the same fixtures. Rules:
 * - a malformed payload throws (our own RPC returning junk is a bug, not data);
 * - a kind this build does not know (a newer server) is DROPPED, never crashes;
 * - a row whose category disagrees with its kind is dropped;
 * - unknown flags are filtered out; numeric strings become numbers.
 */

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

type Raw = Record<string, unknown>

function fail(what: string, path: string, message: string): never {
  throw new Error(`Invalid store activity ${what}: ${path} ${message}`)
}

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOrNull(row: Raw, key: string, what: string, path: string): string | null {
  const value = row[key]
  if (value === undefined) fail(what, `${path}.${key}`, 'is missing')
  if (value === null) return null
  if (typeof value !== 'string') fail(what, `${path}.${key}`, 'must be text')
  return value
}

function requiredText(row: Raw, key: string, what: string, path: string): string {
  const value = textOrNull(row, key, what, path)
  if (value === null || value === '') fail(what, `${path}.${key}`, 'is required')
  return value
}

function numericOrNull(row: Raw, key: string, what: string, path: string): number | null {
  const value = row[key]
  if (value === undefined) fail(what, `${path}.${key}`, 'is missing')
  if (value === null || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') fail(what, `${path}.${key}`, 'must be a number')
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function timeOrNull(row: Raw, key: string, what: string, path: string): string | null {
  const value = textOrNull(row, key, what, path)
  if (value === null) return null
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) fail(what, `${path}.${key}`, 'not a timestamp')
  return new Date(ms).toISOString()
}

function jsonOrNull(row: Raw, key: string, what: string, path: string): ActivityJson | null {
  const value = row[key]
  if (value === undefined) fail(what, `${path}.${key}`, 'is missing')
  if (value === null) return null
  if (!isObject(value)) fail(what, `${path}.${key}`, 'must be an object')
  return value
}

function toEvent(value: unknown, index: number): StoreActivityEvent | null {
  const path = String(index)
  if (!isObject(value)) fail('rows', path, 'must be an object')
  const row = value
  const id = requiredText(row, 'id', 'rows', path)
  const occurredAt = timeOrNull(row, 'occurred_at', 'rows', path)
  if (occurredAt === null) fail('rows', `${path}.occurred_at`, 'is required')
  const kind = requiredText(row, 'kind', 'rows', path)
  const categoryText = requiredText(row, 'category', 'rows', path)
  if (typeof row.is_routine !== 'boolean') fail('rows', `${path}.is_routine`, 'must be a boolean')
  const flagsValue = row.flags
  if (flagsValue !== null && !Array.isArray(flagsValue)) {
    fail('rows', `${path}.flags`, 'must be a list')
  }
  const event = {
    id,
    outletId: textOrNull(row, 'outlet_id', 'rows', path),
    outletName: textOrNull(row, 'outlet_name', 'rows', path),
    occurredAt,
    actorUserId: textOrNull(row, 'actor_user_id', 'rows', path),
    actorName: textOrNull(row, 'actor_name', 'rows', path),
    approvedByName: textOrNull(row, 'approved_by_name', 'rows', path),
    amount: numericOrNull(row, 'amount', 'rows', path),
    quantity: numericOrNull(row, 'quantity', 'rows', path),
    unit: textOrNull(row, 'unit', 'rows', path),
    reason: textOrNull(row, 'reason', 'rows', path),
    note: textOrNull(row, 'note', 'rows', path),
    subjectType: textOrNull(row, 'subject_type', 'rows', path),
    subjectRef: textOrNull(row, 'subject_ref', 'rows', path),
    orderNumber: textOrNull(row, 'order_number', 'rows', path),
    before: jsonOrNull(row, 'before', 'rows', path),
    after: jsonOrNull(row, 'after', 'rows', path),
    summary: jsonOrNull(row, 'summary', 'rows', path) ?? {},
    flags: (Array.isArray(flagsValue) ? flagsValue : []).filter(isActivityFlag),
    reviewedAt: timeOrNull(row, 'reviewed_at', 'rows', path),
    reviewedByName: textOrNull(row, 'reviewed_by_name', 'rows', path),
  }
  if (!isActivityKind(kind)) return null
  const category = categoryOfKind(kind)
  if (categoryText !== category) return null
  return {
    id: event.id,
    outletId: event.outletId,
    outletName: event.outletName,
    occurredAt: event.occurredAt,
    category,
    kind,
    isRoutine: row.is_routine,
    actorUserId: event.actorUserId,
    actorName: event.actorName,
    approvedByName: event.approvedByName,
    amount: event.amount,
    quantity: event.quantity,
    unit: event.unit,
    reason: event.reason,
    note: event.note,
    subjectType: isActivitySubjectType(event.subjectType) ? event.subjectType : null,
    subjectRef: event.subjectRef,
    orderNumber: event.orderNumber,
    before: event.before,
    after: event.after,
    summary: event.summary,
    flags: event.flags,
    reviewedAt: event.reviewedAt,
    reviewedByName: event.reviewedByName,
  }
}

/** One page of get_store_activity rows. `null` (no rows) is an empty page. */
export function parseStoreActivityRows(data: unknown): StoreActivityEvent[] {
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) fail('rows', '(root)', 'must be a list')
  return data.map(toEvent).filter((event): event is StoreActivityEvent => event !== null)
}

function list(data: Raw, key: string): Raw[] {
  const value = data[key]
  if (!Array.isArray(value) || !value.every(isObject)) fail('summary', key, 'must be a list of objects')
  return value
}

export function parseStoreActivitySummary(data: unknown): StoreActivitySummary {
  if (!isObject(data)) fail('summary', '(root)', 'must be an object')
  const byKind = list(data, 'byKind').flatMap((entry, i): StoreActivityKindTotal[] => {
    const kind = requiredText(entry, 'kind', 'summary', `byKind.${i}`)
    return isActivityKind(kind)
      ? [{
          kind,
          statutory: entry.statutory === true,
          count: numericOrNull(entry, 'count', 'summary', `byKind.${i}`) ?? 0,
          amount: numericOrNull(entry, 'amount', 'summary', `byKind.${i}`),
          quantity: numericOrNull(entry, 'quantity', 'summary', `byKind.${i}`),
        }]
      : []
  })
  const byActor = list(data, 'byActor').flatMap((entry, i): StoreActivityActorTotal[] => {
    const kind = requiredText(entry, 'kind', 'summary', `byActor.${i}`)
    return isActivityKind(kind)
      ? [{
          actorUserId: textOrNull(entry, 'actorUserId', 'summary', `byActor.${i}`),
          actorName: textOrNull(entry, 'actorName', 'summary', `byActor.${i}`),
          kind,
          count: numericOrNull(entry, 'count', 'summary', `byActor.${i}`) ?? 0,
          amount: numericOrNull(entry, 'amount', 'summary', `byActor.${i}`),
        }]
      : []
  })
  const byDay = list(data, 'byDay').flatMap((entry, i): StoreActivityDayTotal[] => {
    const kind = requiredText(entry, 'kind', 'summary', `byDay.${i}`)
    const day = requiredText(entry, 'day', 'summary', `byDay.${i}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('summary', `byDay.${i}.day`, 'must be YYYY-MM-DD')
    return isActivityKind(kind)
      ? [{ day, kind, count: numericOrNull(entry, 'count', 'summary', `byDay.${i}`) ?? 0, amount: numericOrNull(entry, 'amount', 'summary', `byDay.${i}`) }]
      : []
  })
  // `routine` is optional (older servers did not send it).
  const routine = (data.routine === undefined ? [] : list(data, 'routine')).flatMap((entry, i): StoreActivityRoutineTotal[] => {
    const kind = requiredText(entry, 'kind', 'summary', `routine.${i}`)
    return isActivityKind(kind)
      ? [{ kind, count: numericOrNull(entry, 'count', 'summary', `routine.${i}`) ?? 0, amount: numericOrNull(entry, 'amount', 'summary', `routine.${i}`) }]
      : []
  })
  return { byKind, byActor, byDay, routine, flaggedOpen: numericOrNull(data, 'flaggedOpen', 'summary', 'flaggedOpen') ?? 0 }
}
