/**
 * "Missing from sales book": find the orders, and record one from the stored
 * order. Shared by the web admin page (server action) and the merchant app
 * (`/api/gov-discounts/missing`). Callers have already checked the person may
 * review discounts; the branch scope narrows what they see and may record.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import { findMissingFromBook, recordRequestFromOrder, type MissingOrder } from './missing-from-book'
import { recordGovDiscount, type LedgerActor } from './record-service'
import { createSupabaseLedgerStore } from './supabase-store'
import { createSupabaseMissingStore, isPlatformStore, loadBookOrder } from './supabase-missing-store'

type Db = SupabaseClient<Database>

/** Orders in the window whose Senior/PWD discount is not in the book ([] off-platform). */
export async function loadMissingFromBook(
  db: Db,
  tenantId: string,
  period: { startIso: string; endIso: string },
  scope: BranchScope,
): Promise<MissingOrder[]> {
  if (!(await isPlatformStore(db, tenantId))) return []
  return findMissingFromBook(createSupabaseMissingStore(db), tenantId, period, scope)
}

export type RecordMissingOutcome = 'recorded' | 'already_recorded' | 'not_found' | 'nothing_to_record'

/**
 * Record one order's Senior/PWD grant from what the order itself stores. The
 * person recording signs it as "recorded later"; the server re-prices and
 * flags it like any other record (it will read as `late_sync`).
 */
export async function recordMissingOrder(
  db: Db,
  args: { tenantId: string; orderId: string; scope: BranchScope; actor: LedgerActor; now: Date },
): Promise<RecordMissingOutcome> {
  if (!(await isPlatformStore(db, args.tenantId))) return 'not_found'
  const order = await loadBookOrder(db, args.tenantId, args.orderId)
  if (!order || (args.scope.kind === 'branch' && order.outletId !== args.scope.outletId)) return 'not_found'
  if (order.status === 'cancelled') return 'nothing_to_record'
  const request = recordRequestFromOrder(args.tenantId, order)
  if (!request) return 'nothing_to_record'

  const recorded = await createSupabaseMissingStore(db).recordedOrderIds(args.tenantId, [order.id])
  if (recorded.has(order.id)) return 'already_recorded'

  const actor: LedgerActor = { userId: args.actor.userId, name: `${args.actor.name} (recorded later)` }
  await recordGovDiscount(createSupabaseLedgerStore(db), request, actor, args.now)
  return 'recorded'
}

export const RECORD_MISSING_MESSAGES: Readonly<Record<Exclude<RecordMissingOutcome, 'recorded'>, string>> = {
  already_recorded: 'This order is already in the sales book.',
  not_found: 'That order could not be found.',
  nothing_to_record: 'This order has no Senior/PWD discount to record.',
}
