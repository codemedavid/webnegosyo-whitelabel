/**
 * Money by payment method: what was actually received through each method.
 *
 * Settlement ledger rows (split tender: ₱120 GCash + the rest cash) go to the
 * method they were taken through; a refund comes out of the method it went
 * back through; a row with no method falls back to the order's own. An order
 * settled without a full ledger (paid online, handed over) is collected under
 * the method picked at checkout. What is still owed is NOT put under that
 * method (the old slices did, so "GCash ₱X" included money never received):
 * it is the report's "Unpaid" figure.
 *
 * Methods are identified by their `payment_methods` row when the money carries
 * one, else by the folded name ("GCash  payment" = "gcash payment"). Live data
 * has 76 spellings across stores, so the label shown is the most recent name a
 * method was paid under; `type` groups them (GCash, Cash, Bank Transfer …)
 * with the platform's existing normalisation.
 *
 * Σ buckets = collected (sales-model). The merchant app and Convex keep their
 * own copies of the old slices for their analytics; those move to this rule in
 * Phase 7 and are parity-tested against it then.
 */

import { normalizePayment } from '@/lib/queries/platform-analytics-merge'
import { toCents } from './money'
import { orderFigures, type OrderFigures, type ReportOrder, type ReportPayment } from './sales-model'

export const UNSPECIFIED_METHOD_KEY = 'unspecified'
export const UNSPECIFIED_METHOD_LABEL = 'Not recorded'

export interface PaymentSlice {
  key: string
  label: string
  methodId: string | null
  cents: number
}

export interface PaymentBucket {
  key: string
  label: string
  /** GCash, Cash, Bank Transfer … (`normalizePayment`). */
  type: string
  methodId: string | null
  cents: number
  /** Orders with money in this bucket. */
  orders: number
}

export interface PaymentBuckets {
  /** Largest first. */
  buckets: PaymentBucket[]
  collectedCents: number
  unpaidCents: number
  overpaidCents: number
}

export function foldMethodName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function methodKey(methodId: string | null | undefined, methodName: string | null | undefined): string {
  if (methodId) return `id:${methodId}`
  const folded = foldMethodName(methodName)
  return folded ? `name:${folded}` : UNSPECIFIED_METHOD_KEY
}

interface Method {
  key: string
  label: string
  methodId: string | null
}

function methodOf(methodId: string | null, methodName: string | null): Method {
  const label = methodName?.trim() || UNSPECIFIED_METHOD_LABEL
  return { key: methodKey(methodId, methodName), label, methodId: methodId ?? null }
}

/**
 * The method a ledger row went through. A row with no method uses the
 * order's; a row naming the order's method by id alone borrows its name.
 */
function paymentMethod(payment: ReportPayment, own: Method): Method {
  const name = payment.methodName?.trim()
  if (!payment.methodId && !name) return own
  if (!name && payment.methodId === own.methodId) return own
  return methodOf(payment.methodId, payment.methodName)
}

function isRefund(payment: ReportPayment): boolean {
  return (payment.kind ?? '').trim().toLowerCase() === 'refund'
}

function addSlice(slices: readonly PaymentSlice[], method: Method, cents: number): PaymentSlice[] {
  const index = slices.findIndex((slice) => slice.key === method.key)
  if (index < 0) return [...slices, { ...method, cents }]
  return slices.map((slice, i) => (i === index ? { ...slice, cents: slice.cents + cents } : slice))
}

/** One live order's collected money by method. Σ = `figures.collectedCents`. */
export function orderPaymentSlices(order: ReportOrder, figures: OrderFigures = orderFigures(order)): PaymentSlice[] {
  if (!figures.isLive) return []
  const own = methodOf(order.methodId, order.methodName)

  const fromLedger = order.payments.reduce<PaymentSlice[]>(
    (slices, payment) => addSlice(slices, paymentMethod(payment, own), toCents(payment.amount) * (isRefund(payment) ? -1 : 1)),
    [],
  )

  const ledgerCents = fromLedger.reduce((sum, slice) => sum + slice.cents, 0)
  const settledBeyondLedger = figures.collectedCents - ledgerCents
  const slices = settledBeyondLedger !== 0 ? addSlice(fromLedger, own, settledBeyondLedger) : fromLedger
  return slices.filter((slice) => slice.cents !== 0)
}

interface Accumulator {
  bucket: PaymentBucket
  labelAt: number
}

export function bucketPayments(orders: readonly ReportOrder[]): PaymentBuckets {
  const byKey = new Map<string, Accumulator>()
  let collectedCents = 0
  let unpaidCents = 0
  let overpaidCents = 0

  for (const order of orders) {
    const figures = orderFigures(order)
    if (!figures.isLive) continue
    collectedCents += figures.collectedCents
    unpaidCents += figures.unpaidCents
    overpaidCents += figures.overpaidCents

    const namedAt = new Map(order.payments.map((p) => [methodKey(p.methodId, p.methodName), p.at]))
    for (const slice of orderPaymentSlices(order, figures)) {
      const at = namedAt.get(slice.key) ?? order.at
      const previous = byKey.get(slice.key)
      // A nameless slice never replaces a real name, however recent.
      const hasName = slice.label !== UNSPECIFIED_METHOD_LABEL
      const isNewerName = !previous || (hasName && (at >= previous.labelAt || previous.bucket.label === UNSPECIFIED_METHOD_LABEL))
      const label = isNewerName ? slice.label : previous.bucket.label
      byKey.set(slice.key, {
        labelAt: isNewerName ? at : previous.labelAt,
        bucket: {
          key: slice.key,
          label,
          type: normalizePayment(label === UNSPECIFIED_METHOD_LABEL ? null : label),
          methodId: slice.methodId,
          cents: (previous?.bucket.cents ?? 0) + slice.cents,
          orders: (previous?.bucket.orders ?? 0) + 1,
        },
      })
    }
  }

  const buckets = [...byKey.values()]
    .map(({ bucket }) => bucket)
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label))
  return { buckets, collectedCents, unpaidCents, overpaidCents }
}
