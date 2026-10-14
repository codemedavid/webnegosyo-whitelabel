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

/** One contribution to a slice: a ledger row, or the money settled beyond it. */
interface PaymentPart extends Method {
  cents: number
  /** When it was named: the ledger row's time, or the order's for the settled rest. */
  at: number
}

function orderPaymentParts(order: ReportOrder, figures: OrderFigures): PaymentPart[] {
  const own = methodOf(order.methodId, order.methodName)
  const fromLedger = order.payments.map((payment) => ({
    ...paymentMethod(payment, own),
    cents: toCents(payment.amount) * (isRefund(payment) ? -1 : 1),
    at: payment.at,
  }))
  const ledgerCents = fromLedger.reduce((sum, part) => sum + part.cents, 0)
  const settledBeyondLedger = figures.collectedCents - ledgerCents
  return settledBeyondLedger !== 0 ? [...fromLedger, { ...own, cents: settledBeyondLedger, at: order.at }] : fromLedger
}

const NAME_KEY_PREFIX = 'name:'
const ID_KEY_PREFIX = 'id:'

/**
 * One method is often recorded by id on some orders and by name alone on
 * others (web checkout stores the id, the register only the word "Cash").
 * A name-only key joins the id key whose parts carry that name, when exactly
 * ONE id does in the window; two methods sharing a name stay apart. The SQL
 * `report_payments` (20261014150000) applies the same rule.
 */
function nameAliases(parts: readonly PaymentPart[]): Map<string, Method> {
  const idsByName = new Map<string, Map<string, Method>>()
  for (const part of parts) {
    if (!part.key.startsWith(ID_KEY_PREFIX) || part.label === UNSPECIFIED_METHOD_LABEL) continue
    const nameKey = `${NAME_KEY_PREFIX}${foldMethodName(part.label)}`
    const ids = idsByName.get(nameKey) ?? new Map<string, Method>()
    idsByName.set(nameKey, ids.set(part.key, { key: part.key, label: part.label, methodId: part.methodId }))
  }
  return new Map(
    [...idsByName].flatMap(([nameKey, ids]) => (ids.size === 1 ? [[nameKey, [...ids.values()][0]] as const] : [])),
  )
}

function withAliases(parts: readonly PaymentPart[], aliases: ReadonlyMap<string, Method>): PaymentPart[] {
  return parts.map((part) => {
    const target = aliases.get(part.key)
    return target ? { ...part, key: target.key, methodId: target.methodId } : part
  })
}

/** Groups parts by method; slices that net to nothing are dropped. */
function groupParts(parts: readonly PaymentPart[]): Map<string, PaymentPart[]> {
  const byKey = new Map<string, PaymentPart[]>()
  for (const part of parts) byKey.set(part.key, [...(byKey.get(part.key) ?? []), part])
  return new Map([...byKey].filter(([, group]) => group.reduce((sum, part) => sum + part.cents, 0) !== 0))
}

/**
 * The name a method is shown under: the most recently used real name, and on
 * a tie the first in code-point order, so it never depends on the order rows
 * were read in (the SQL `report_payments` applies the same rule). A nameless
 * part never beats a named one, however recent.
 */
function isBetterLabel(candidate: Pick<PaymentPart, 'label' | 'at'>, current: Pick<PaymentPart, 'label' | 'at'>): boolean {
  const candidateNamed = candidate.label !== UNSPECIFIED_METHOD_LABEL
  const currentNamed = current.label !== UNSPECIFIED_METHOD_LABEL
  if (candidateNamed !== currentNamed) return candidateNamed
  if (candidate.at !== current.at) return candidate.at > current.at
  return candidate.label < current.label
}

function bestLabel(parts: readonly PaymentPart[]): Pick<PaymentPart, 'label' | 'at'> {
  return parts.reduce<Pick<PaymentPart, 'label' | 'at'>>((best, part) => (isBetterLabel(part, best) ? part : best), parts[0])
}

/** One live order's collected money by method. Σ = `figures.collectedCents`. */
export function orderPaymentSlices(order: ReportOrder, figures: OrderFigures = orderFigures(order)): PaymentSlice[] {
  if (!figures.isLive) return []
  return [...groupParts(orderPaymentParts(order, figures))].map(([key, parts]) => ({
    key,
    label: bestLabel(parts).label,
    methodId: parts[0].methodId,
    cents: parts.reduce((sum, part) => sum + part.cents, 0),
  }))
}

/** Largest first, then label, then key: a total order, so two readers list buckets alike. */
export function byCentsThenLabel(a: PaymentBucket, b: PaymentBucket): number {
  return b.cents - a.cents || a.label.localeCompare(b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

interface Accumulator {
  bucket: PaymentBucket
  best: Pick<PaymentPart, 'label' | 'at'>
}

export function bucketPayments(orders: readonly ReportOrder[]): PaymentBuckets {
  const byKey = new Map<string, Accumulator>()
  let collectedCents = 0
  let unpaidCents = 0
  let overpaidCents = 0

  const liveOrders = orders.flatMap((order) => {
    const figures = orderFigures(order)
    return figures.isLive ? [{ figures, parts: orderPaymentParts(order, figures) }] : []
  })
  const aliases = nameAliases(liveOrders.flatMap(({ parts }) => parts))

  for (const { figures, parts: orderParts } of liveOrders) {
    collectedCents += figures.collectedCents
    unpaidCents += figures.unpaidCents
    overpaidCents += figures.overpaidCents

    for (const [key, parts] of groupParts(withAliases(orderParts, aliases))) {
      const previous = byKey.get(key)
      const candidate = bestLabel(parts)
      const best = previous && !isBetterLabel(candidate, previous.best) ? previous.best : candidate
      byKey.set(key, {
        best,
        bucket: {
          key,
          label: best.label,
          type: normalizePayment(best.label === UNSPECIFIED_METHOD_LABEL ? null : best.label),
          methodId: parts[0].methodId,
          cents: (previous?.bucket.cents ?? 0) + parts.reduce((sum, part) => sum + part.cents, 0),
          orders: (previous?.bucket.orders ?? 0) + 1,
        },
      })
    }
  }

  const buckets = [...byKey.values()]
    .map(({ bucket }) => bucket)
    .sort(byCentsThenLabel)
  return { buckets, collectedCents, unpaidCents, overpaidCents }
}
