/**
 * Storage-neutral customer/order facts used by Customer Hub and loyalty.
 *
 * All order backends project into this shape.  Analytics and earning operate on
 * qualified facts only, so a pending ticket, replayed scan, cancellation, or
 * refund cannot accidentally look like a completed customer visit.
 */

import { resolveCustomerIdentity } from '@/lib/customer-identity'

export type OrderFactsBackend = 'platform_supabase' | 'convex' | 'tenant_supabase'
export type OrderSource = 'pos' | 'online'

export interface CustomerOrderFactItem {
  menuItemId?: string | null
  name: string
  quantity: number
  /** Base item amount before paid upgrades and add-ons. */
  baseUnitPrice?: number | null
  unitPrice?: number | null
}

export interface CustomerOrderFact {
  backend: OrderFactsBackend
  externalOrderId: string
  customerId: string | null
  phoneE164: string | null
  source: OrderSource
  status: string
  paymentStatus: string | null
  branchId: string | null
  netTotal: number
  orderedAt: string
  completedAt: string | null
  updatedAt: string
  items: CustomerOrderFactItem[]
}

export interface CustomerOverviewWindow {
  days: 7 | 30 | 90
  periodStart: string
  periodEnd: string
  identifiedCustomers: number
  returningCustomers: number
  newCustomers: number
  repeatRate: number
  previousRepeatRate: number
  repeatRateChange: number
  identifiedOrders: number
  qualifiedOrders: number
  identifiedOrderCoverage: number
  atRiskCustomers: number
}

export interface RankedCustomerItem {
  key: string
  menuItemId: string | null
  name: string
  quantity: number
}

const POS_SETTLED = new Set(['paid', 'verified', 'settled'])
const ONLINE_FULFILLED = new Set(['delivered', 'collected', 'completed', 'complete'])
const REVERSED = new Set(['cancelled', 'canceled', 'refunded', 'voided'])
const DAY_MS = 24 * 60 * 60 * 1000

function finiteNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function status(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/** POS earns at settlement; online earns only at confirmed delivery/collection. */
export function isQualifiedOrderFact(fact: CustomerOrderFact): boolean {
  if (REVERSED.has(status(fact.status)) || fact.netTotal < 0) return false
  return fact.source === 'pos'
    ? POS_SETTLED.has(status(fact.paymentStatus))
    : ONLINE_FULFILLED.has(status(fact.status))
}

function factTime(fact: CustomerOrderFact): number | null {
  const ms = new Date(fact.completedAt ?? fact.orderedAt).getTime()
  return Number.isNaN(ms) ? null : ms
}

function identifiedKey(fact: CustomerOrderFact): string | null {
  if (fact.customerId?.trim()) return `customer:${fact.customerId.trim()}`
  if (fact.phoneE164?.trim()) return `phone:${fact.phoneE164.trim()}`
  return null
}

function repeatStats(
  qualified: Array<{ fact: CustomerOrderFact; time: number }>,
  start: number,
  end: number,
): { identified: number; returning: number; fresh: number; rate: number } {
  const inPeriod = new Map<string, number>()
  const earliest = new Map<string, number>()

  for (const entry of qualified) {
    const key = identifiedKey(entry.fact)
    if (!key) continue
    earliest.set(key, Math.min(earliest.get(key) ?? Number.POSITIVE_INFINITY, entry.time))
    if (entry.time >= start && entry.time < end) {
      inPeriod.set(key, Math.min(inPeriod.get(key) ?? Number.POSITIVE_INFINITY, entry.time))
    }
  }

  let returning = 0
  for (const [key, firstInPeriod] of inPeriod) {
    if ((earliest.get(key) ?? firstInPeriod) < firstInPeriod) returning += 1
  }
  const identified = inPeriod.size
  return {
    identified,
    returning,
    fresh: identified - returning,
    rate: identified > 0 ? round2((returning / identified) * 100) : 0,
  }
}

/**
 * Repeat rate = identified customers ordering in the period who also have an
 * earlier qualified order / all identified customers ordering in the period.
 */
export function computeCustomerOverview(
  facts: CustomerOrderFact[],
  options: { days: 7 | 30 | 90; now?: Date },
): CustomerOverviewWindow {
  const end = (options.now ?? new Date()).getTime()
  const start = end - options.days * DAY_MS
  const previousStart = start - options.days * DAY_MS
  const qualified = facts.flatMap((fact) => {
    const time = factTime(fact)
    return isQualifiedOrderFact(fact) && time !== null ? [{ fact, time }] : []
  })
  const current = repeatStats(qualified, start, end)
  const previous = repeatStats(qualified, previousStart, start)
  const periodFacts = qualified.filter(({ time }) => time >= start && time < end)
  const identifiedOrders = periodFacts.filter(({ fact }) => identifiedKey(fact) !== null).length

  const customerTimes = new Map<string, number[]>()
  for (const entry of qualified) {
    const key = identifiedKey(entry.fact)
    if (!key) continue
    const values = customerTimes.get(key) ?? []
    values.push(entry.time)
    customerTimes.set(key, values)
  }
  let atRiskCustomers = 0
  for (const values of customerTimes.values()) {
    if (values.length < 2) continue
    values.sort((a, b) => a - b)
    const cadence = (values[values.length - 1] - values[0]) / (values.length - 1)
    const silence = end - values[values.length - 1]
    if (cadence > 0 && silence > cadence * 1.5 && silence <= cadence * 3) atRiskCustomers += 1
  }

  return {
    days: options.days,
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(),
    identifiedCustomers: current.identified,
    returningCustomers: current.returning,
    newCustomers: current.fresh,
    repeatRate: current.rate,
    previousRepeatRate: previous.rate,
    repeatRateChange: round2(current.rate - previous.rate),
    identifiedOrders,
    qualifiedOrders: periodFacts.length,
    identifiedOrderCoverage:
      periodFacts.length > 0 ? round2((identifiedOrders / periodFacts.length) * 100) : 0,
    atRiskCustomers,
  }
}

function normalizeLegacyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-PH')
}

function displayLegacyName(name: string): string {
  return normalizeLegacyName(name).replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en-PH'))
}

/** Rank fulfilled item units, preferring immutable menu ids over mutable names. */
export function rankCustomerItems(
  facts: CustomerOrderFact[],
  limit: number = 3,
): RankedCustomerItem[] {
  const totals = new Map<string, RankedCustomerItem>()

  for (const fact of facts) {
    if (!isQualifiedOrderFact(fact)) continue
    for (const item of fact.items) {
      const menuItemId = item.menuItemId?.trim() || null
      const normalizedName = normalizeLegacyName(item.name)
      if (!menuItemId && !normalizedName) continue
      const key = menuItemId ? `id:${menuItemId}` : `name:${normalizedName}`
      const existing = totals.get(key)
      totals.set(key, {
        key,
        menuItemId,
        name: existing?.name ?? (menuItemId ? item.name.trim() : displayLegacyName(item.name)),
        quantity: finiteNumber(existing?.quantity) + Math.max(0, finiteNumber(item.quantity)),
      })
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.quantity - a.quantity || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, limit))
}

/* ---------------------------------------------------------------------------
 * Projections: each backend's row shape into the one storage-neutral fact.
 *
 * Everything above this line is pure arithmetic over `CustomerOrderFact`. These
 * two functions are the only places that know what a stored order looks like,
 * so a backend's column naming never leaks into the metrics.
 * ------------------------------------------------------------------------- */

/** A row of `public.customer_external_orders` (Convex / tenant-Supabase tenants). */
export interface ExternalLedgerFactRow {
  backend: 'convex' | 'tenant_supabase'
  external_order_id: string
  customer_id: string | null
  source: string | null
  status: string | null
  payment_status: string | null
  outlet_id: string | null
  /** PostgREST serializes `numeric` as a string. */
  total: number | string | null
  ordered_at: string
  completed_at: string | null
  updated_at: string | null
  items: Array<{ name?: string | null; quantity?: number | string | null; menuItemId?: string | null }> | null
}

/** A row of `public.orders` on the platform database. */
export interface PlatformOrderFactRow {
  id: string
  customer_id: string | null
  customer_contact: string | null
  status: string | null
  payment_status: string | null
  outlet_id: string | null
  total: number | string | null
  created_at: string
  updated_at: string | null
  /** `web` | `mobile` | `qr_handoff` | `pos`; null on legacy rows. */
  source: string | null
}

/** A row of `public.order_items`; `menu_item_id` is nulled when an item is deleted. */
export interface PlatformOrderItemFactRow {
  menu_item_id: string | null
  menu_item_name: string | null
  quantity: number | string | null
  price: number | string | null
}

/** Statuses that mean the order is finished and the visit really happened. */
const COMPLETED_STATUSES = ONLINE_FULFILLED

function normalizeSource(value: string | null | undefined): OrderSource {
  return status(value) === 'pos' ? 'pos' : 'online'
}

function toItem(
  menuItemId: string | null | undefined,
  name: string | null | undefined,
  quantity: unknown,
  unitPrice: unknown,
): CustomerOrderFactItem {
  const price = unitPrice === null || unitPrice === undefined ? null : finiteNumber(unitPrice)
  return {
    menuItemId: menuItemId?.trim() || null,
    name: name?.trim() ?? '',
    quantity: finiteNumber(quantity),
    unitPrice: price,
    // Add-ons and paid upgrades are billed as their own lines everywhere in this
    // codebase, so a line's price IS its base price. Loyalty's free-item reward
    // waives only this amount.
    baseUnitPrice: price,
  }
}

export function ledgerRowToFact(row: ExternalLedgerFactRow): CustomerOrderFact {
  return {
    backend: row.backend,
    externalOrderId: row.external_order_id,
    customerId: row.customer_id,
    // The ledger stores identity as a customer row, never a raw phone — the
    // capture path resolved it server-side before the row was written.
    phoneE164: null,
    source: normalizeSource(row.source),
    status: row.status ?? '',
    paymentStatus: row.payment_status,
    branchId: row.outlet_id,
    netTotal: round2(finiteNumber(row.total)),
    orderedAt: row.ordered_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at ?? row.completed_at ?? row.ordered_at,
    items: (row.items ?? []).map((item) =>
      toItem(item?.menuItemId, item?.name, item?.quantity, null),
    ),
  }
}

export function platformOrderToFact(
  order: PlatformOrderFactRow,
  items: PlatformOrderItemFactRow[],
): CustomerOrderFact {
  const orderStatus = status(order.status)
  const source = normalizeSource(order.source)
  const completed = !REVERSED.has(orderStatus) && (source === 'pos'
    ? POS_SETTLED.has(status(order.payment_status))
    : COMPLETED_STATUSES.has(orderStatus))

  return {
    backend: 'platform_supabase',
    externalOrderId: order.id,
    customerId: order.customer_id,
    // Unlike the ledger, a platform order keeps the raw contact, and an order
    // placed before customer capture existed has no customer_id at all. Reuse
    // the one identity resolver so a walk-in placeholder never becomes a phone.
    phoneE164: resolveCustomerIdentity({ contact: order.customer_contact }).phoneE164,
    source,
    status: order.status ?? '',
    paymentStatus: order.payment_status,
    branchId: order.outlet_id,
    netTotal: round2(finiteNumber(order.total)),
    orderedAt: order.created_at,
    // `orders` has no completion timestamp. `updated_at` is the moment the row
    // last changed, which for a finished order is the fulfilment write — so it
    // is the closest honest answer, and null while the order is still open
    // rather than a guess that would date the visit wrongly.
    completedAt: completed ? order.updated_at ?? order.created_at : null,
    updatedAt: order.updated_at ?? order.created_at,
    items: items.map((item) =>
      toItem(item.menu_item_id, item.menu_item_name, item.quantity, item.price),
    ),
  }
}
