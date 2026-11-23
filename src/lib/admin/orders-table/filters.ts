/**
 * The Orders table's filters, kept in the page address.
 *
 * The address is the state: Back, refresh and a shared link all reopen the
 * same view, and the server reads the same values to filter IN THE QUERY. The
 * old list filtered the 20 rows it had already loaded, so "Cancelled" showed
 * nothing whenever the cancelled order was not among the newest 20.
 *
 * Everything arriving here is untrusted text from a URL; every parser falls
 * back to the default instead of throwing, so a hand-edited link still opens.
 *
 * Pure: the clock and the store's business day are passed in.
 */

import { previousBusinessDayKey } from '@/lib/inventory/business-day'
import { tradingDayOf, tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { OUTLET_FILTER_UNASSIGNED } from '@/lib/outlets/order-outlet-display'
import { isOrderStatus, type OrderStatus } from './status'

export const DATE_RANGES = ['today', 'yesterday', '7d', '30d', 'all'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export const DATE_RANGE_LABELS: Readonly<Record<DateRange, string>> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}

export const PAYMENT_FILTERS = ['all', 'paid', 'unpaid', 'proof'] as const
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

export const PAYMENT_FILTER_LABELS: Readonly<Record<PaymentFilter, string>> = {
  all: 'Any payment',
  paid: 'Paid',
  unpaid: 'Not paid',
  proof: 'Proof to check',
}

export const ORDERS_PAGE_SIZE = 25

/** Longest search kept; anything past it is a paste, not a name or number. */
export const SEARCH_MAX_LENGTH = 60

export interface OrdersTableFilters {
  status: OrderStatus | 'all'
  range: DateRange
  /** Order type NAME as stored on `orders.order_type`; null = every type. */
  type: string | null
  /** Branch id, `OUTLET_FILTER_UNASSIGNED`, or null = every branch. */
  branch: string | null
  payment: PaymentFilter
  q: string
  page: number
}

/**
 * Opens on the last 7 business days, not today: an order still waiting from
 * late last night (or a pre-order placed days ago) must not vanish from the
 * landing view and the New count when the day rolls over. Still bounded, so
 * the counts stay cheap on the shared database.
 */
export const DEFAULT_ORDERS_FILTERS: Readonly<OrdersTableFilters> = Object.freeze({
  status: 'all',
  range: '7d',
  type: null,
  branch: null,
  payment: 'all',
  q: '',
  page: 1,
})

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * A branch id must be a uuid: the column is uuid-typed and a stray value would
 * make Postgres refuse the whole page read instead of showing nothing.
 */
function parseBranch(value: string): string | null {
  if (value === OUTLET_FILTER_UNASSIGNED) return value
  return UUID.test(value) ? value.toLowerCase() : null
}

function parsePage(value: string): number {
  if (!/^\d{1,5}$/.test(value)) return 1
  const page = Number(value)
  return page >= 1 ? page : 1
}

export function parseOrdersTableFilters(params: RawParams): OrdersTableFilters {
  const status = first(params.status)
  const type = first(params.type).trim().slice(0, 80)
  return {
    status: isOrderStatus(status) ? status : 'all',
    range: oneOf(first(params.range), DATE_RANGES, DEFAULT_ORDERS_FILTERS.range),
    type: type === '' ? null : type,
    branch: parseBranch(first(params.branch)),
    payment: oneOf(first(params.payment), PAYMENT_FILTERS, 'all'),
    q: first(params.q).slice(0, SEARCH_MAX_LENGTH),
    page: parsePage(first(params.page)),
  }
}

/**
 * The address for `filters` with `patch` applied. Any change other than the
 * page itself returns to page 1: page 4 of "All" is not page 4 of "New".
 * Defaults are left out so the plain page stays `/orders`.
 */
export function ordersTableHref(
  basePath: string,
  filters: OrdersTableFilters,
  patch: Partial<OrdersTableFilters> = {},
): string {
  const next: OrdersTableFilters = { ...filters, ...patch }
  if (!('page' in patch)) next.page = 1

  const params = new URLSearchParams()
  if (next.status !== DEFAULT_ORDERS_FILTERS.status) params.set('status', next.status)
  if (next.range !== DEFAULT_ORDERS_FILTERS.range) params.set('range', next.range)
  if (next.type) params.set('type', next.type)
  if (next.branch) params.set('branch', next.branch)
  if (next.payment !== 'all') params.set('payment', next.payment)
  const q = next.q.trim()
  if (q) params.set('q', q)
  if (next.page > 1) params.set('page', String(next.page))

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/** Whether anything beyond the status tab and date narrows the list. */
export function hasNarrowingFilters(filters: OrdersTableFilters): boolean {
  return Boolean(filters.type || filters.branch || filters.payment !== 'all' || filters.q.trim())
}

export interface TimeWindow {
  /** Inclusive. */
  startIso: string
  /** Exclusive. */
  endIso: string
}

function daysBack(dayKey: string, count: number): string {
  let key = dayKey
  for (let i = 0; i < count; i += 1) key = previousBusinessDayKey(key)
  return key
}

/**
 * The half-open window a date range covers, in the store's own business days
 * (a bar whose day ends at 2 AM keeps its late orders on "Today"). `all` has
 * no window.
 */
export function dateRangeWindow(range: DateRange, nowMs: number, schedule: CutoffSchedule): TimeWindow | null {
  if (range === 'all') return null
  const today = tradingDayOf(new Date(nowMs).toISOString(), schedule)
  const todayWindow = tradingDayWindow(today, schedule)
  switch (range) {
    case 'today':
      return todayWindow
    case 'yesterday':
      return tradingDayWindow(previousBusinessDayKey(today), schedule)
    case '7d':
      return { startIso: tradingDayWindow(daysBack(today, 6), schedule).startIso, endIso: todayWindow.endIso }
    case '30d':
      return { startIso: tradingDayWindow(daysBack(today, 29), schedule).startIso, endIso: todayWindow.endIso }
  }
}

export interface OrderSearch {
  /** Cleaned text for a name / phone match; empty = no text search. */
  text: string
  /** A daily order number, when the search is one ("#12", "12"). */
  orderNumber: number | null
}

/**
 * What a typed search can safely ask the database.
 *
 * The text goes into a PostgREST `or=(…)` filter, where `,` `(` `)` `"` and
 * `\` are syntax and `%` `_` `*` are wildcards. Only letters, digits, spaces
 * and the characters names and phone numbers actually use survive; the rest
 * become spaces, so "Ana (table 4)" still finds Ana.
 */
export function parseOrderSearch(raw: string): OrderSearch {
  const trimmed = raw.trim().slice(0, SEARCH_MAX_LENGTH)
  const withoutHash = trimmed.replace(/^#\s*/, '')
  const orderNumber = /^\d{1,6}$/.test(withoutHash) ? Number(withoutHash) : null
  const text = withoutHash
    .replace(/[^\p{L}\p{N} .+@'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, orderNumber: orderNumber && orderNumber > 0 ? orderNumber : null }
}
