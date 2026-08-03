/**
 * Recording that a merchant paid.
 *
 * Pure business logic over an injected store, the same arrangement as
 * `staff-service.ts`: the arithmetic and the ordering are unit-tested against
 * an in-memory fake, and only the server action layer holds Supabase.
 *
 * There is no payment gateway. Someone sends GCash or a bank transfer, and the
 * platform owner writes it down here. The ledger columns (`method`,
 * `reference`) are shaped so a gateway webhook can write the same rows later
 * without a migration.
 */

import { BILLING_PERIOD_MONTHS, MONTHLY_PRICE_PHP } from '@/lib/billing/plan'
import { resolveAnchoredPeriod } from '@/lib/billing/billing-anchor'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

/** The subset of a `tenant_subscriptions` row this module reads and writes. */
export interface SubscriptionRow {
  tenant_id: string
  status: string
  monthly_price_php: number
  paid_through: string | null
  grace_days: number
  /**
   * The date this client's month turns over, or null.
   *
   * Null is the norm and means "no anchor": periods start the day the merchant
   * pays, exactly as they did before anchors existed.
   */
  billing_anchor_date: string | null
}

/** A row in `subscription_payments`. */
export interface PaymentRow {
  tenant_id: string
  amount_php: number
  period_start: string
  period_end: string
  method: string | null
  reference: string | null
  recorded_by: string | null
  note: string | null
}

export interface SubscriptionStore {
  getSubscription(tenantId: string): Promise<SubscriptionRow | null>
  upsertSubscription(tenantId: string, patch: Partial<SubscriptionRow>): Promise<void>
  insertPayment(row: PaymentRow): Promise<void>
}

export interface MarkPaidInput {
  tenantId: string
  /** Defaults to the standard monthly price. Zero is allowed — a comped month. */
  amountPhp?: number
  /** How many months this payment buys. */
  periodMonths?: number
  method?: string | null
  reference?: string | null
  note?: string | null
  /** The superadmin writing it down. */
  recordedBy?: string | null
}

export interface MarkPaidResult {
  periodStart: string
  periodEnd: string
}

/** Blank string → null; trimmed value otherwise. Mirrors `outlet-form.ts`. */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function assertValidInput(input: MarkPaidInput, amountPhp: number, periodMonths: number): void {
  if (typeof input.tenantId !== 'string' || input.tenantId.trim() === '') {
    throw new Error('A tenant is required to record a payment')
  }
  if (!Number.isFinite(amountPhp) || amountPhp < 0) {
    throw new Error('Payment amount must be zero or more')
  }
  if (!Number.isInteger(periodMonths) || periodMonths < 1) {
    throw new Error('A payment must cover at least one month')
  }
}

/**
 * Records a payment and extends the merchant's access.
 *
 * The ledger row is written BEFORE the subscription is advanced. If that order
 * were reversed and the ledger write failed, the merchant would hold access
 * nobody had a record of paying for — the one failure mode that loses money
 * without leaving a trace to chase.
 */
export async function markPaid(
  store: SubscriptionStore,
  input: MarkPaidInput,
  nowIso: string
): Promise<MarkPaidResult> {
  const amountPhp = input.amountPhp ?? MONTHLY_PRICE_PHP
  const periodMonths = input.periodMonths ?? BILLING_PERIOD_MONTHS

  assertValidInput(input, amountPhp, periodMonths)

  const tenantId = input.tenantId.trim()
  const today = toBusinessDayKey(nowIso)

  const existing = await store.getSubscription(tenantId)

  // The anchor decides the period; this module decides only that a payment
  // happened. Keeping the calendar in one pure module is what stops the ledger
  // and the access date from ever disagreeing about which month was bought.
  const { periodStart, periodEnd } = resolveAnchoredPeriod(
    existing?.billing_anchor_date,
    existing?.paid_through,
    today,
    periodMonths
  )

  await store.insertPayment({
    tenant_id: tenantId,
    amount_php: amountPhp,
    period_start: periodStart,
    period_end: periodEnd,
    method: nullableText(input.method),
    reference: nullableText(input.reference),
    recorded_by: nullableText(input.recordedBy),
    note: nullableText(input.note),
  })

  await store.upsertSubscription(tenantId, {
    status: 'active',
    paid_through: periodEnd,
  })

  return { periodStart, periodEnd }
}
