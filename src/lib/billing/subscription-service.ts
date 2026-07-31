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
import { addDays } from '@/lib/billing/subscription-status'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

/** The subset of a `tenant_subscriptions` row this module reads and writes. */
export interface SubscriptionRow {
  tenant_id: string
  status: string
  monthly_price_php: number
  paid_through: string | null
  grace_days: number
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

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Blank string → null; trimmed value otherwise. Mirrors `outlet-form.ts`. */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * A whole number of months later, clamped to the end of a shorter month.
 *
 * 31 January plus one month is 28 February, not 3 March. Letting the date roll
 * over would hand out free days every time a long month met a short one, and
 * the drift compounds across a year of renewals.
 */
export function addMonths(dayKey: string, months: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)

  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  // JS `%` keeps the sign of the dividend, so a negative month needs wrapping.
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12

  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  const shifted = new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth))
  )
  return shifted.toISOString().slice(0, 10)
}

/** The day-of-month, as a number. */
function dayOfMonth(dayKey: string): number {
  return Number(dayKey.slice(8, 10))
}

/**
 * The last day the merchant has bought.
 *
 * Normally the day before the same date next month, so consecutive periods tile
 * without a paid day belonging to two of them: 10 August plus a month runs to 9
 * September.
 *
 * When the month arithmetic CLAMPED — 31 January plus a month is 28 February —
 * that clamp has already consumed the boundary, and subtracting a further day
 * would end the period on the 27th and quietly sell the merchant a 28-day
 * month. In that case the clamped date is itself the end.
 */
function resolvePeriodEnd(periodStart: string, periodMonths: number): string {
  const sameDateNextPeriod = addMonths(periodStart, periodMonths)

  if (dayOfMonth(sameDateNextPeriod) < dayOfMonth(periodStart)) {
    return sameDateNextPeriod
  }

  return addDays(sameDateNextPeriod, -1)
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
 * Where the newly-bought period starts.
 *
 * The day after the current paid-through date when that is still ahead, so a
 * merchant paying early STACKS the new month onto the old one. Resetting to
 * "a month from today" would quietly burn the days they had already paid for.
 * A lapsed merchant starts today instead: charging them again for a month that
 * has already gone by would be selling them nothing.
 */
function resolvePeriodStart(paidThrough: string | null | undefined, today: string): string {
  if (isDayKey(paidThrough) && paidThrough >= today) return addDays(paidThrough, 1)
  return today
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
  const periodStart = resolvePeriodStart(existing?.paid_through, today)

  const periodEnd = resolvePeriodEnd(periodStart, periodMonths)

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
