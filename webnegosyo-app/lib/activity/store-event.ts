/**
 * The store activity DTO (contract: docs/plans/store-activity/contract.md).
 *
 * One row of get_store_activity in camelCase. Customer data in `summary` is
 * already masked by the database; flags and reviewed_* arrive empty for a
 * caller who only sees their own rows.
 *
 * Kept byte-identical in webnegosyo-app/lib/activity/store-event.ts (parity test).
 */

import type { ActivityCategory, ActivityFlag, ActivityKind, ActivitySubjectType } from './taxonomy'

export type ActivityJson = Readonly<Record<string, unknown>>

export interface StoreActivityEvent {
  id: string
  outletId: string | null
  outletName: string | null
  /** ISO 8601, UTC. */
  occurredAt: string
  category: ActivityCategory
  kind: ActivityKind
  isRoutine: boolean
  actorUserId: string | null
  actorName: string | null
  approvedByName: string | null
  /** Pesos, signed from the store's point of view: money out is negative. */
  amount: number | null
  quantity: number | null
  unit: string | null
  reason: string | null
  note: string | null
  subjectType: ActivitySubjectType | null
  subjectRef: string | null
  orderNumber: string | null
  before: ActivityJson | null
  after: ActivityJson | null
  summary: ActivityJson
  flags: readonly ActivityFlag[]
  reviewedAt: string | null
  reviewedByName: string | null
}

export interface StoreActivityKindTotal {
  kind: ActivityKind
  /** Senior/PWD discounts: never money lost. Only ever true for discount.applied. */
  statutory: boolean
  count: number
  amount: number | null
  quantity: number | null
}

export interface StoreActivityActorTotal {
  actorUserId: string | null
  actorName: string | null
  kind: ActivityKind
  count: number
  amount: number | null
}

export interface StoreActivityDayTotal {
  /** Asia/Manila calendar day, YYYY-MM-DD. */
  day: string
  kind: ActivityKind
  count: number
  amount: number | null
}

export interface StoreActivitySummary {
  byKind: readonly StoreActivityKindTotal[]
  byActor: readonly StoreActivityActorTotal[]
  byDay: readonly StoreActivityDayTotal[]
  /** Open (unreviewed) flagged rows; 0 for callers who cannot see flags. */
  flaggedOpen: number
}
