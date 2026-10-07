/**
 * Customer backfill orchestration (web / Supabase side).
 *
 * Pure over the `CustomerStore` port so it is unit-testable with an in-memory
 * fake and shared by the CLI script (`scripts/backfill-customers.ts`). It walks a
 * tenant's historical orders and rolls each identifiable one into its customer
 * profile via `upsertCustomerFromOrder`.
 *
 * Why it exists beyond the first rollout: checkout captures a customer only for
 * orders it writes itself. Anything inserted straight into `orders` — the
 * Convex→platform history imports above all — never passes through that
 * capture, so those phone numbers sit unlinked until this runs. Run it for the
 * tenant after every bulk import.
 *
 * Idempotency is inherited, not re-invented: `upsertCustomerFromOrder` recomputes
 * the profile from the full linked order set on every call, so re-running the
 * backfill — or interleaving it with live going-forward upserts — never
 * double-counts. Phone normalization stays single-sourced in
 * `resolveCustomerIdentity` (→ src/lib/phone.ts); it is not duplicated here.
 */

import { resolveCustomerIdentity, type CustomerIdentity } from '@/lib/customer-identity'
import { REVERSED_STATUSES } from '@/lib/customer-order-facts'
import { upsertCustomerFromOrder, type CustomerStore } from '@/lib/customers-service'

/** A historical order reduced to the identity + link inputs the backfill needs. */
export interface BackfillOrderRow {
  id: string
  name: string | null
  contact: string | null
  customerData: Record<string, unknown> | null
  /** The profile the order is already linked to; such orders are left alone. */
  customerId?: string | null
  /** Order status; cancelled / refunded / voided orders are never linked. */
  status?: string | null
}

/** Summary of a backfill pass, printed by the CLI and asserted by tests. */
export interface BackfillReport {
  /** Orders examined. */
  scanned: number
  /** Orders already linked to a profile — nothing to do. */
  alreadyLinked: number
  /** Cancelled / refunded / voided orders — not sales, never linked. */
  reversed: number
  /** Unlinked orders that resolved to a real identity: linked (or would be). */
  identifiable: number
  /** Orders with no usable contact (walk-in, blank, malformed). */
  skipped: number
  /** Distinct customers the identifiable orders map to. */
  customersTouched: number
  /** Of those, how many had no profile yet and are (or would be) created. */
  newCustomers: number
  /** True when nothing was written (default). */
  dryRun: boolean
}

export interface BackfillOptions {
  /** When true, persist profiles; otherwise report only (default). */
  execute?: boolean
}

type OrderDisposition = 'alreadyLinked' | 'reversed' | 'skipped' | 'link'

function isReversed(status: string | null | undefined): boolean {
  return REVERSED_STATUSES.has(status?.trim().toLowerCase() ?? '')
}

function dispositionOf(order: BackfillOrderRow, identity: CustomerIdentity): OrderDisposition {
  if (order.customerId) return 'alreadyLinked'
  if (isReversed(order.status)) return 'reversed'
  if (!identity.identityKey) return 'skipped'
  return 'link'
}

/**
 * Roll a tenant's historical orders into customer profiles.
 *
 * Dry-run by default: it resolves identities and reports counts but writes
 * nothing (the only store calls it makes are read-only lookups, to tell new
 * profiles from existing ones). Pass `{ execute: true }` to persist. Safe to
 * re-run.
 */
export async function backfillCustomers(
  store: CustomerStore,
  tenantId: string,
  orders: BackfillOrderRow[],
  options: BackfillOptions = {}
): Promise<BackfillReport> {
  const execute = options.execute === true
  const counts = { alreadyLinked: 0, reversed: 0, skipped: 0, link: 0 }
  const identities = new Set<string>()
  let newCustomers = 0

  for (const order of orders) {
    const identity = resolveCustomerIdentity({
      name: order.name,
      contact: order.contact,
      customerData: order.customerData,
    })
    const disposition = dispositionOf(order, identity)
    counts[disposition]++
    if (disposition !== 'link' || !identity.identityKey) continue

    // Looked up BEFORE this order's upsert, once per identity, so an execute
    // pass reports the same "new" count its dry run predicted.
    if (!identities.has(identity.identityKey)) {
      identities.add(identity.identityKey)
      const existing = await store.findCustomerId(tenantId, identity.phoneE164, identity.email)
      if (!existing) newCustomers++
    }

    if (execute) {
      await upsertCustomerFromOrder(store, tenantId, {
        orderId: order.id,
        name: order.name,
        contact: order.contact,
        customerData: order.customerData,
      })
    }
  }

  return {
    scanned: orders.length,
    alreadyLinked: counts.alreadyLinked,
    reversed: counts.reversed,
    identifiable: counts.link,
    skipped: counts.skipped,
    customersTouched: identities.size,
    newCustomers,
    dryRun: !execute,
  }
}
