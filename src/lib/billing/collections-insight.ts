/**
 * Joins who owes (the roster) with who pays (the ledger) and who trades
 * (order activity), so the collections screen can say what is going on.
 *
 * Pure. The distinction this exists for: 150-odd tenants share a backfilled
 * paid-through date and read as "Lapsed". Some of them take orders every day
 * on a product they are not paying for; most closed months ago. Those are two
 * different lists — one to ring today, one to tidy up — and the date alone
 * cannot tell them apart.
 */

import type { RosterRow } from '@/lib/billing/subscription-roster'
import type { TenantPaymentSummary } from '@/lib/billing/payment-history'
import type { ActivitySource } from '@/lib/activity/tenant-activity'

/** No order in this many days and a store counts as dormant. */
export const DORMANT_AFTER_DAYS = 30

export interface TenantActivitySnapshot {
  source: ActivitySource
  /** Non-cancelled orders in the last `DORMANT_AFTER_DAYS` days. */
  orders30d: number
  lastOrderAt: string | null
}

export interface CollectionsInsight {
  payment: TenantPaymentSummary | null
  /** Null when activity was not loaded for this screen. */
  activity: TenantActivitySnapshot | null
  /** Took an order in the last 30 days. False when unknown. */
  isTrading: boolean
  /** Readable, and no order in the last 30 days. False when unknown. */
  isDormant: boolean
  /** Trading while not paid up (late, lapsed, or never billed). */
  isTradingUnpaid: boolean
  /** No payment in the ledger, whatever the paid-through date says. */
  hasNeverPaid: boolean
}

export interface CollectionsSummary {
  tradingUnpaid: number
  /** One month's price for each trading-unpaid store. */
  tradingUnpaidPhp: number
  neverPaid: number
  dormant: number
  /** Whether any store's activity could be read at all. */
  isActivityKnown: boolean
}

/** Not paid up, and not a relationship the owner already ended. */
function owesForUse(row: RosterRow): boolean {
  if (row.manualBlock === 'cancelled') return false
  return row.state !== 'active' || row.isUnbilled
}

function toInsight(
  row: RosterRow,
  payment: TenantPaymentSummary | undefined,
  activity: TenantActivitySnapshot | null
): CollectionsInsight {
  const isReadable = activity?.source === 'ok'
  const isTrading = isReadable && activity.orders30d > 0

  return {
    payment: payment ?? null,
    activity,
    isTrading,
    isDormant: isReadable && activity.orders30d === 0,
    isTradingUnpaid: isTrading && owesForUse(row),
    hasNeverPaid: !payment || payment.paymentCount === 0,
  }
}

/**
 * Keyed by tenant id, as a plain record so it crosses the server → client
 * boundary untouched.
 */
export function buildCollectionsInsights(
  roster: readonly RosterRow[],
  payments: ReadonlyMap<string, TenantPaymentSummary>,
  activity: ReadonlyMap<string, TenantActivitySnapshot> | null
): Record<string, CollectionsInsight> {
  return Object.fromEntries(
    roster.map((row) => [
      row.tenantId,
      toInsight(row, payments.get(row.tenantId), activity?.get(row.tenantId) ?? null),
    ])
  )
}

export function summarizeCollections(
  roster: readonly RosterRow[],
  insights: Readonly<Record<string, CollectionsInsight>>
): CollectionsSummary {
  return roster.reduce<CollectionsSummary>(
    (acc, row) => {
      const insight = insights[row.tenantId]
      if (!insight) return acc
      return {
        tradingUnpaid: acc.tradingUnpaid + (insight.isTradingUnpaid ? 1 : 0),
        tradingUnpaidPhp:
          acc.tradingUnpaidPhp + (insight.isTradingUnpaid ? row.monthlyPricePhp : 0),
        neverPaid: acc.neverPaid + (insight.hasNeverPaid ? 1 : 0),
        dormant: acc.dormant + (insight.isDormant ? 1 : 0),
        isActivityKnown: acc.isActivityKnown || insight.activity?.source === 'ok',
      }
    },
    {
      tradingUnpaid: 0,
      tradingUnpaidPhp: 0,
      neverPaid: 0,
      dormant: 0,
      isActivityKnown: false,
    }
  )
}
