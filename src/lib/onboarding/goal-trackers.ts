/**
 * One tracker per goal the owner picked, measured against the "before"
 * numbers they gave us at set-up. Honest by construction: every figure is a
 * count or an average of the store's own orders since it opened, and a
 * comparison is only made against the owner's own answer (a range), never a
 * promised lift. Pure.
 */

import {
  DAILY_ORDERS,
  GOALS,
  TYPICAL_ORDERS,
  orderGoals,
  type DailyOrders,
  type GoalId,
  type TypicalOrder,
} from './goals'

export interface TrackedOrder {
  total: number
  source: string | null
  /** A stable key for the customer (phone/contact), null when unnamed. */
  customerKey: string | null
}

export interface TrackerInput {
  goals: readonly GoalId[]
  dailyOrders: DailyOrders | null
  typicalOrder: TypicalOrder | null
  /** Orders since the store opened; null when they could not be read. */
  orders: readonly TrackedOrder[] | null
}

export interface GoalTracker {
  goal: GoalId
  title: string
  label: string
  value: string
  caption: string
  /** The owner's own "before", in their words; null when we have none. */
  before: string | null
  /** How the figure sits against the owner's own answer; null when there is nothing to compare yet. */
  comparison: string | null
}

/** An average of fewer orders than this says more about luck than the store. */
export const MIN_ORDERS_FOR_AVERAGE = 5

const TYPICAL_RANGES: Record<TypicalOrder, [number, number]> = {
  under_100: [0, 100],
  '100_200': [100, 200],
  '200_400': [200, 400],
  over_400: [400, Number.POSITIVE_INFINITY],
}

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`
}

function averageComparison(average: number, typical: TypicalOrder | null): string | null {
  if (!typical) return null
  const [low, high] = TYPICAL_RANGES[typical]
  if (average > high) return 'Above your usual order'
  if (average < low) return 'Below your usual order'
  return 'Within your usual order'
}

const UNKNOWN = '—'

function tracker(goal: GoalId, input: TrackerInput): GoalTracker {
  const orders = input.orders
  const title = GOALS[goal].title
  switch (goal) {
    case 'ordering': {
      const online = orders?.filter((order) => order.source !== 'pos').length ?? null
      return {
        goal, title, label: 'Online orders',
        value: online === null ? UNKNOWN : String(online),
        caption: online === null ? 'Not available for this store yet' : 'since you opened',
        before: input.dailyOrders && input.dailyOrders !== 'none' ? `${DAILY_ORDERS[input.dailyOrders]} orders a day, all channels` : null,
        comparison: null,
      }
    }
    case 'bigger_orders': {
      const totals = orders?.map((order) => order.total).filter((total) => Number.isFinite(total) && total > 0) ?? null
      const hasEnough = !!totals && totals.length >= MIN_ORDERS_FOR_AVERAGE
      const average = hasEnough ? totals!.reduce((sum, total) => sum + total, 0) / totals!.length : null
      return {
        goal, title, label: 'Average order',
        value: average === null ? '₱—' : peso(average),
        caption: totals === null
          ? 'Not available for this store yet'
          : hasEnough ? `across ${count(totals.length, 'order', 'orders')}` : `Shows after ${MIN_ORDERS_FOR_AVERAGE} orders`,
        before: input.typicalOrder ? TYPICAL_ORDERS[input.typicalOrder] : null,
        comparison: average === null ? null : averageComparison(average, input.typicalOrder),
      }
    }
    case 'regulars': {
      const seen = new Map<string, number>()
      for (const order of orders ?? []) {
        if (order.customerKey) seen.set(order.customerKey, (seen.get(order.customerKey) ?? 0) + 1)
      }
      const returning = orders ? [...seen.values()].filter((orderCount) => orderCount >= 2).length : null
      return {
        goal, title, label: 'Customers who came back',
        value: returning === null ? UNKNOWN : String(returning),
        caption: returning === null ? 'Not available for this store yet' : `of ${count(seen.size, 'named customer', 'named customers')}`,
        before: null,
        comparison: null,
      }
    }
    case 'faster_counter': {
      const register = orders?.filter((order) => order.source === 'pos').length ?? null
      return {
        goal, title, label: 'Register sales',
        value: register === null ? UNKNOWN : String(register),
        caption: register === null ? 'Not available for this store yet' : 'rung up in the app since you opened',
        before: null,
        comparison: null,
      }
    }
  }
}

export function buildGoalTrackers(input: TrackerInput): GoalTracker[] {
  return orderGoals(input.goals).map((goal) => tracker(goal, input))
}
