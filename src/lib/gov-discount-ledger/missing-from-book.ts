/**
 * Orders whose Senior/PWD discount never reached the sales book.
 *
 * Online checkout files its grant right after the order row is written, and
 * that write is best-effort (the customer has already ordered). A failure
 * there used to leave an order carrying a Senior/PWD block with no ledger row
 * and nothing pointing at it. This finds those orders (platform stores — the
 * only backend the server can read) and builds the record from the STORED
 * order, so "Record now" goes through the same re-pricing as the register's
 * record (`record-service.ts`); the owner is never asked to type amounts.
 *
 * Data access is injected (`MissingStore`) so the rules are testable without
 * a database; `supabase-missing-store.ts` is the real one.
 */

import type { RecordGovDiscountRequest, StoredGovDiscount } from '@/lib/gov-discount'
import type { BranchScope } from '@/lib/outlets/branch-scope'

/** An order as the reconcile reads it. */
export interface BookOrder {
  id: string
  createdAt: string
  status: string
  outletId: string | null
  dailyNumber: number | null
  total: number
  serviceCharge: number
  deliveryFee: number
  source: 'pos' | 'online'
  revision: number
  government: StoredGovDiscount | null
  /** In the order's own line order — the claim's `line-<index>` keys follow it. */
  items: { menuItemId: string | null; name: string; quantity: number; subtotal: number }[]
}

export interface MissingStore {
  /** Platform orders in the window carrying a discount (bounded, paged). */
  listDiscountedOrders(tenantId: string, startIso: string, endIso: string): Promise<BookOrder[]>
  /** Which of these orders already have any grant in the sales book. */
  recordedOrderIds(tenantId: string, orderIds: readonly string[]): Promise<Set<string>>
}

export interface MissingOrder {
  orderId: string
  label: string | null
  occurredAt: string
  outletId: string | null
  total: number
  claimantCount: number
  /** What the order took off for Senior/PWD, as stored on it. */
  reduction: number
}

function labelOf(order: BookOrder): string | null {
  return order.dailyNumber === null ? null : `#${order.dailyNumber}`
}

function isInScope(order: BookOrder, scope: BranchScope): boolean {
  return scope.kind === 'all' || order.outletId === scope.outletId
}

function hasClaim(order: BookOrder): order is BookOrder & { government: StoredGovDiscount } {
  return (order.government?.claimants.length ?? 0) > 0
}

export async function findMissingFromBook(
  store: MissingStore,
  tenantId: string,
  period: { startIso: string; endIso: string },
  scope: BranchScope,
): Promise<MissingOrder[]> {
  const candidates = (await store.listDiscountedOrders(tenantId, period.startIso, period.endIso)).filter(
    (order) => hasClaim(order) && order.status !== 'cancelled' && isInScope(order, scope),
  )
  if (candidates.length === 0) return []

  const recorded = await store.recordedOrderIds(
    tenantId,
    candidates.map((order) => order.id),
  )
  return candidates
    .filter((order) => !recorded.has(order.id))
    .map((order) => ({
      orderId: order.id,
      label: labelOf(order),
      occurredAt: order.createdAt,
      outletId: order.outletId,
      total: order.total,
      claimantCount: order.government?.claimants.length ?? 0,
      reduction: Math.round((order.government?.claimants ?? []).reduce((sum, c) => sum + c.reduction, 0) * 100) / 100,
    }))
}

/** The sales-book record for a stored order, or null when it carries no claim. */
export function recordRequestFromOrder(tenantId: string, order: BookOrder): RecordGovDiscountRequest | null {
  if (!hasClaim(order)) return null
  const government = order.government
  return {
    tenantId,
    backend: 'platform_supabase',
    externalOrderId: order.id,
    orderLabel: labelOf(order),
    outletId: order.outletId,
    revision: order.revision,
    occurredAt: order.createdAt,
    orderTotal: order.total,
    source: order.source,
    lines: order.items.map((item, index) => ({
      key: `line-${index}`,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      amount: item.subtotal,
    })),
    serviceCharge: order.serviceCharge,
    deliveryFee: order.deliveryFee,
    allowShared: government.claimants.some((claimant) => claimant.allocation.mode === 'shared'),
    government,
    approvalId: null,
    approvalSkippedOffline: false,
  }
}
