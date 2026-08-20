/**
 * Loyverse → SmartMenu payment-method sync planner.
 *
 * Pure module (no network, no Supabase) mirroring catalog-mapper.ts: the
 * server action fetches Loyverse payment types and the tenant's existing
 * payment_methods rows, and this decides what to write.
 *
 * Sync contract:
 * - Rows are matched on loyverse_payment_type_id (the idempotency key).
 * - Sync owns only `name` and liveness. Merchant-authored instruction fields
 *   (details, qr_code_url, require_payment_proof, order types) are never
 *   part of the plan.
 * - Methods removed in Loyverse are deactivated, never deleted — orders and
 *   order-type links may reference them.
 * - Methods with no Loyverse link are manual and untouched.
 */

import type { LoyversePaymentType } from '@/lib/loyverse/client'

/** Subset of payment_methods columns the planner needs. */
export interface SyncablePaymentMethod {
  id: string
  name: string
  is_active: boolean
  order_index: number
  loyverse_payment_type_id?: string | null
}

export interface PaymentMethodCreate {
  name: string
  loyverse_payment_type_id: string
  is_active: boolean
  order_index: number
}

export interface PaymentMethodRename {
  id: string
  name: string
}

export interface PaymentMethodSyncPlan {
  creates: PaymentMethodCreate[]
  renames: PaymentMethodRename[]
  /** Mapped rows to reactivate because their payment type exists again. */
  reactivates: string[]
  /** Mapped rows whose Loyverse payment type no longer exists. */
  deactivates: string[]
  warnings: string[]
}

export function planPaymentMethodSync(
  loyverseTypes: LoyversePaymentType[],
  existingMethods: SyncablePaymentMethod[]
): PaymentMethodSyncPlan {
  const byLoyverseId = new Map(
    existingMethods
      .filter((method) => method.loyverse_payment_type_id)
      .map((method) => [method.loyverse_payment_type_id as string, method])
  )

  const creates: PaymentMethodCreate[] = []
  const renames: PaymentMethodRename[] = []
  const reactivates: string[] = []
  const warnings: string[] = []
  const liveTypeIds = new Set<string>()

  let nextOrderIndex =
    existingMethods.length > 0
      ? Math.max(...existingMethods.map((method) => method.order_index)) + 1
      : 0

  for (const paymentType of loyverseTypes) {
    const name = paymentType.name?.trim()
    if (!name) {
      warnings.push(`Skipped Loyverse payment type ${paymentType.id}: blank name`)
      continue
    }
    liveTypeIds.add(paymentType.id)

    const existing = byLoyverseId.get(paymentType.id)
    if (!existing) {
      creates.push({
        name,
        loyverse_payment_type_id: paymentType.id,
        is_active: true,
        order_index: nextOrderIndex,
      })
      nextOrderIndex += 1
      continue
    }

    if (existing.name !== name) renames.push({ id: existing.id, name })
    if (!existing.is_active) reactivates.push(existing.id)
  }

  const deactivates = existingMethods
    .filter(
      (method) =>
        method.loyverse_payment_type_id &&
        method.is_active &&
        !liveTypeIds.has(method.loyverse_payment_type_id)
    )
    .map((method) => method.id)

  return { creates, renames, reactivates, deactivates, warnings }
}
