/**
 * Customer backfill orchestration (web / Supabase side).
 *
 * Pure over the `CustomerStore` port so it is unit-testable with an in-memory
 * fake and shared by the CLI script (`scripts/backfill-customers.ts`). It walks a
 * tenant's historical orders and rolls each identifiable one into its customer
 * profile via `upsertCustomerFromOrder`.
 *
 * Idempotency is inherited, not re-invented: `upsertCustomerFromOrder` recomputes
 * the profile from the full linked order set on every call, so re-running the
 * backfill — or interleaving it with live going-forward upserts — never
 * double-counts. Phone normalization stays single-sourced in
 * `resolveCustomerIdentity` (→ src/lib/phone.ts); it is not duplicated here.
 */

import { resolveCustomerIdentity } from '@/lib/customer-identity'
import { upsertCustomerFromOrder, type CustomerStore } from '@/lib/customers-service'

/** A historical order reduced to the identity + link inputs the backfill needs. */
export interface BackfillOrderRow {
  id: string
  name: string | null
  contact: string | null
  customerData: Record<string, unknown> | null
}

/** Summary of a backfill pass, printed by the CLI and asserted by tests. */
export interface BackfillReport {
  /** Orders examined. */
  scanned: number
  /** Orders that resolved to a real identity (phone or email). */
  identifiable: number
  /** Orders with no usable contact (walk-in, blank, malformed). */
  skipped: number
  /** Distinct customers the identifiable orders map to. */
  customersTouched: number
  /** True when nothing was written (default). */
  dryRun: boolean
}

export interface BackfillOptions {
  /** When true, persist profiles; otherwise report only (default). */
  execute?: boolean
}

/**
 * Roll a tenant's historical orders into customer profiles.
 *
 * Dry-run by default: it resolves identities and reports counts but writes
 * nothing. Pass `{ execute: true }` to persist. Safe to re-run.
 */
export async function backfillCustomers(
  store: CustomerStore,
  tenantId: string,
  orders: BackfillOrderRow[],
  options: BackfillOptions = {}
): Promise<BackfillReport> {
  const execute = options.execute === true
  const identities = new Set<string>()
  let identifiable = 0
  let skipped = 0

  for (const order of orders) {
    const identity = resolveCustomerIdentity({
      name: order.name,
      contact: order.contact,
      customerData: order.customerData,
    })

    if (!identity.identityKey) {
      skipped++
      continue
    }

    identifiable++
    identities.add(identity.identityKey)

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
    identifiable,
    skipped,
    customersTouched: identities.size,
    dryRun: !execute,
  }
}
