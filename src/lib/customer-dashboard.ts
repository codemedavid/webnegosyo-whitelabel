/**
 * The merchant app's Reports dashboard: the store's money, told through the
 * people who paid it.
 *
 * A sales total says how much came in. It cannot say whether the store is
 * building a base of regulars or renting strangers one order at a time — and
 * that is the question a restaurant's growth turns on. So every figure here is
 * cut by WHO: repeat orders (regulars), first orders (first-timers), and orders
 * nobody put a name to.
 *
 * Only qualified orders count and a guest is a customer row or else a phone
 * number (`customer-order-facts.ts`). The split is per ORDER: a guest's first
 * ever order is first-timer money, every later one is a regular's — even in
 * the same week. Measured per customer ("had they been before the window?")
 * every store with a few weeks of named history read 0% regulars while its
 * best guest was on a sixteenth visit; checked against live stores 2026-10-06.
 *
 * Pure and clock-injected; the route does the reading.
 */

import {
  factTime,
  identifiedKey,
  isQualifiedOrderFact,
  rankCustomerItems,
  type CustomerOrderFact,
  type RankedCustomerItem,
} from '@/lib/customer-order-facts'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOWS: ReadonlyArray<7 | 30 | 90> = [7, 30, 90]
const FAVOURITE_LIMIT = 5
const TOP_CUSTOMER_LIMIT = 5
/** Quiet past 1.5× their own rhythm: slipping. Past 3×: gone quiet. */
const SLIPPING_FACTOR = 1.5
const LAPSED_FACTOR = 3
/** Beyond this, a guest is history rather than someone a text can win back. */
const WINNABLE_SILENCE_DAYS = 180
const PHONE_TAIL_LENGTH = 4

export interface RevenueSplit {
  total: number
  /** Repeat orders: a named guest's second order onwards. */
  returning: number
  /** First orders: a named guest's first ever order, when it fell in the window. */
  new: number
  /** Orders with no name or number. Always 0 where the till is not fully visible. */
  unknown: number
}

export interface DashboardCustomer {
  key: string
  customerId: string | null
  /** Filled by `attachCustomerNames`; null when the guest has no saved name. */
  name: string | null
  /** Last digits of the number for a guest known only by phone. */
  phoneTail: string | null
  visits: number
  spend: number
  lastVisitAt: string
}

export interface CustomerDashboardWindow {
  days: 7 | 30 | 90
  revenue: RevenueSplit
  previousRevenue: number
  orders: number
  previousOrders: number
  /** Orders that carried a name or number. */
  knownOrders: number
  customers: number
  previousCustomers: number
  /** Guests who ordered again in the window (after their first ever order). */
  returningCustomers: number
  /** Guests whose first ever order fell in the window. Can overlap the above. */
  newCustomers: number
  /** Returning guests as a share of every named guest in the window. */
  repeatRate: number
  previousRepeatRate: number
  /** Guests whose one and only visit fell in this window: the second-visit audience. */
  oneTimers: number
  favourites: { returning: RankedCustomerItem[]; new: RankedCustomerItem[] }
  topCustomers: DashboardCustomer[]
}

export interface CustomerDashboard {
  windows: CustomerDashboardWindow[]
  /** Regulars quiet for longer than their own rhythm, not yet gone. */
  slipping: number
  /** Regulars quiet for over three of their own gaps, still recent enough to win back. */
  lapsed: number
  /** Average lifetime spend of a guest who came back versus one who did not. */
  lifetimeValue: { regular: number | null; oneTime: number | null }
  /**
   * True when the facts hold EVERY order, named or not (the platform reads the
   * orders table). The ledger behind other backends records only named guests,
   * so there the unnamed share is unknowable rather than zero.
   */
  tillComplete: boolean
}

interface Visit {
  fact: CustomerOrderFact
  time: number
  key: string | null
  /** A named guest's order after their first ever one. */
  isRepeat: boolean
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function sum(visits: readonly Visit[]): number {
  return round2(visits.reduce((total, visit) => total + visit.fact.netTotal, 0))
}

function inRange(visit: Visit, start: number, end: number): boolean {
  return visit.time >= start && visit.time < end
}

function isEarlier(a: { time: number; fact: CustomerOrderFact }, b: { time: number; fact: CustomerOrderFact }): boolean {
  return a.time < b.time || (a.time === b.time && a.fact.externalOrderId < b.fact.externalOrderId)
}

/** Qualified orders, each marked as a named guest's first ever order or a repeat. */
function qualifiedVisits(facts: readonly CustomerOrderFact[]): Visit[] {
  const visits = facts.flatMap((fact) => {
    const time = factTime(fact)
    return isQualifiedOrderFact(fact) && time !== null ? [{ fact, time, key: identifiedKey(fact) }] : []
  })
  const firstByGuest = new Map<string, (typeof visits)[number]>()
  for (const visit of visits) {
    if (!visit.key) continue
    const first = firstByGuest.get(visit.key)
    if (!first || isEarlier(visit, first)) firstByGuest.set(visit.key, visit)
  }
  return visits.map((visit) => ({
    ...visit,
    isRepeat: visit.key !== null && firstByGuest.get(visit.key) !== visit,
  }))
}

/** Every named guest's visit times, oldest first. */
function visitTimesByGuest(visits: readonly Visit[]): Map<string, number[]> {
  // Built locally and handed back sorted; nothing outside sees it mid-build.
  const byGuest = new Map<string, number[]>()
  for (const visit of visits) {
    if (!visit.key) continue
    const times = byGuest.get(visit.key)
    if (times) times.push(visit.time)
    else byGuest.set(visit.key, [visit.time])
  }
  for (const times of byGuest.values()) times.sort((a, b) => a - b)
  return byGuest
}

function phoneTail(fact: CustomerOrderFact): string | null {
  const digits = fact.phoneE164?.replace(/\D/g, '') ?? ''
  return digits.length >= PHONE_TAIL_LENGTH ? digits.slice(-PHONE_TAIL_LENGTH) : null
}

function topCustomers(period: readonly Visit[]): DashboardCustomer[] {
  const byGuest = new Map<string, DashboardCustomer>()
  for (const visit of period) {
    if (!visit.key) continue
    const existing = byGuest.get(visit.key)
    const visitAt = new Date(visit.time).toISOString()
    byGuest.set(visit.key, {
      key: visit.key,
      customerId: existing?.customerId ?? visit.fact.customerId?.trim() ?? null,
      name: null,
      phoneTail: existing?.phoneTail ?? phoneTail(visit.fact),
      visits: (existing?.visits ?? 0) + 1,
      spend: round2((existing?.spend ?? 0) + visit.fact.netTotal),
      lastVisitAt: existing && existing.lastVisitAt > visitAt ? existing.lastVisitAt : visitAt,
    })
  }
  return [...byGuest.values()]
    .sort((a, b) => b.spend - a.spend || a.key.localeCompare(b.key))
    .slice(0, TOP_CUSTOMER_LIMIT)
}

/** The guests in a range: everyone, those who ordered again in it, and those whose first order fell in it. */
function guestsIn(
  visits: readonly Visit[],
  start: number,
  end: number,
): { all: Set<string>; returning: Set<string>; fresh: Set<string> } {
  const all = new Set<string>()
  const returning = new Set<string>()
  const fresh = new Set<string>()
  for (const visit of visits) {
    if (!visit.key || !inRange(visit, start, end)) continue
    all.add(visit.key)
    ;(visit.isRepeat ? returning : fresh).add(visit.key)
  }
  return { all, returning, fresh }
}

function repeatRate(guests: { all: Set<string>; returning: Set<string> }): number {
  return guests.all.size > 0 ? round2((guests.returning.size / guests.all.size) * 100) : 0
}

function computeWindow(
  visits: readonly Visit[],
  timesByGuest: ReadonlyMap<string, number[]>,
  days: 7 | 30 | 90,
  end: number,
): CustomerDashboardWindow {
  const start = end - days * DAY_MS
  const previousStart = start - days * DAY_MS

  const period = visits.filter((visit) => inRange(visit, start, end))
  const previous = visits.filter((visit) => inRange(visit, previousStart, start))
  const guests = guestsIn(visits, start, end)
  const previousGuests = guestsIn(visits, previousStart, start)

  const returningVisits = period.filter((visit) => visit.isRepeat)
  const newVisits = period.filter((visit) => visit.key && !visit.isRepeat)
  const oneTimers = [...guests.all].filter((key) => (timesByGuest.get(key)?.length ?? 0) === 1).length

  return {
    days,
    revenue: {
      total: sum(period),
      returning: sum(returningVisits),
      new: sum(newVisits),
      unknown: sum(period.filter((visit) => !visit.key)),
    },
    previousRevenue: sum(previous),
    orders: period.length,
    previousOrders: previous.length,
    knownOrders: period.filter((visit) => visit.key).length,
    customers: guests.all.size,
    previousCustomers: previousGuests.all.size,
    returningCustomers: guests.returning.size,
    newCustomers: guests.fresh.size,
    repeatRate: repeatRate(guests),
    previousRepeatRate: repeatRate(previousGuests),
    oneTimers,
    favourites: {
      returning: rankCustomerItems(returningVisits.map((visit) => visit.fact), FAVOURITE_LIMIT),
      new: rankCustomerItems(newVisits.map((visit) => visit.fact), FAVOURITE_LIMIT),
    },
    topCustomers: topCustomers(period),
  }
}

/** Slipping and lapsed regulars, each judged against their own rhythm. */
function quietRegulars(timesByGuest: ReadonlyMap<string, number[]>, end: number): { slipping: number; lapsed: number } {
  let slipping = 0
  let lapsed = 0
  for (const times of timesByGuest.values()) {
    if (times.length < 2) continue
    const last = times[times.length - 1]
    const cadence = (last - times[0]) / (times.length - 1)
    const silence = end - last
    if (cadence <= 0) continue
    if (silence > cadence * SLIPPING_FACTOR && silence <= cadence * LAPSED_FACTOR) slipping += 1
    else if (silence > cadence * LAPSED_FACTOR && silence <= WINNABLE_SILENCE_DAYS * DAY_MS) lapsed += 1
  }
  return { slipping, lapsed }
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? round2(values.reduce((total, value) => total + value, 0) / values.length) : null
}

function lifetimeValue(visits: readonly Visit[], timesByGuest: ReadonlyMap<string, number[]>): CustomerDashboard['lifetimeValue'] {
  const spendByGuest = new Map<string, number>()
  for (const visit of visits) {
    if (visit.key) spendByGuest.set(visit.key, (spendByGuest.get(visit.key) ?? 0) + visit.fact.netTotal)
  }
  const regular: number[] = []
  const oneTime: number[] = []
  for (const [key, spend] of spendByGuest) {
    ;((timesByGuest.get(key)?.length ?? 0) > 1 ? regular : oneTime).push(spend)
  }
  return { regular: average(regular), oneTime: average(oneTime) }
}

export function buildCustomerDashboard(
  facts: readonly CustomerOrderFact[],
  options: { now?: Date; tillComplete: boolean },
): CustomerDashboard {
  const end = (options.now ?? new Date()).getTime()
  const visits = qualifiedVisits(facts)
  const timesByGuest = visitTimesByGuest(visits)

  return {
    windows: WINDOWS.map((days) => computeWindow(visits, timesByGuest, days, end)),
    ...quietRegulars(timesByGuest, end),
    lifetimeValue: lifetimeValue(visits, timesByGuest),
    tillComplete: options.tillComplete,
  }
}

/** A copy of the dashboard with saved names put on its best customers. */
export function attachCustomerNames(
  dashboard: CustomerDashboard,
  namesById: ReadonlyMap<string, string>,
): CustomerDashboard {
  return {
    ...dashboard,
    windows: dashboard.windows.map((window) => ({
      ...window,
      topCustomers: window.topCustomers.map((customer) => ({
        ...customer,
        name: (customer.customerId && namesById.get(customer.customerId)?.trim()) || null,
      })),
    })),
  }
}

/** Every customer row id the dashboard would like a name for. */
export function topCustomerIds(dashboard: CustomerDashboard): string[] {
  const ids = dashboard.windows.flatMap((window) =>
    window.topCustomers.flatMap((customer) => (customer.customerId ? [customer.customerId] : [])),
  )
  return [...new Set(ids)]
}

/**
 * Whether a store gets customer figures at all.
 *
 * The `customer_hub_enabled` switch exists for stores whose orders live in
 * their own Convex or Supabase: there, identity comes from a ledger that has to
 * be checked before its repeat rate can be trusted. A platform store's figures
 * are read straight from its own orders table, so there is nothing to check
 * and the switch would only hide them. Mirrored in the merchant app's session.
 */
export function isCustomerHubOn(
  tenant: OrderBackendTenantFields & { customer_hub_enabled?: boolean | null },
): boolean {
  return tenant.customer_hub_enabled === true || resolveOrderBackend(tenant) === 'platform'
}
