/**
 * What the owner wants from their store, and where they are today.
 *
 * Asked first in the set-up (the "About you" chapter) so everything after it
 * can be framed around their own words: the plan screen, the Start-here path
 * and the goal trackers. Pure; every label the owner reads lives here.
 *
 * Honesty rule: nothing here promises a result. The plan describes what we set
 * up; results only ever come from the store's own data.
 */

import { STARTER_STAMP_THRESHOLD } from '@/lib/loyalty/starter-program'

export const GOAL_IDS = ['ordering', 'bigger_orders', 'regulars', 'faster_counter'] as const
export type GoalId = (typeof GOAL_IDS)[number]

export interface GoalCopy {
  title: string
  description: string
}

export const GOALS: Record<GoalId, GoalCopy> = {
  ordering: { title: 'Better ordering experience', description: 'A clear menu and easy checkout. No chat back-and-forth' },
  bigger_orders: { title: 'Bigger orders', description: 'Customers add a drink, a side, a combo' },
  regulars: { title: 'More regulars', description: 'First-timers come back again and again' },
  faster_counter: { title: 'Faster counter', description: 'Walk-ins and kitchen chits in seconds' },
}

export const CHANNEL_IDS = ['walk_in', 'facebook', 'delivery_apps', 'text', 'not_open'] as const
export type ChannelId = (typeof CHANNEL_IDS)[number]

export const CHANNELS: Record<ChannelId, GoalCopy> = {
  walk_in: { title: 'Walk-ins', description: 'People order at the counter' },
  facebook: { title: 'Facebook & Messenger', description: 'Orders come in by chat' },
  delivery_apps: { title: 'Grab or foodpanda', description: 'Through a delivery app' },
  text: { title: 'Text or Viber', description: 'Regulars message you directly' },
  not_open: { title: 'Not open yet', description: 'This store is brand new' },
}

export const DAILY_ORDER_IDS = ['none', 'under_10', '10_30', '30_60', 'over_60'] as const
export type DailyOrders = (typeof DAILY_ORDER_IDS)[number]

export const DAILY_ORDERS: Record<DailyOrders, string> = {
  none: 'Not open yet',
  under_10: 'Under 10',
  '10_30': '10 to 30',
  '30_60': '30 to 60',
  over_60: 'More than 60',
}

export const TYPICAL_ORDER_IDS = ['under_100', '100_200', '200_400', 'over_400'] as const
export type TypicalOrder = (typeof TYPICAL_ORDER_IDS)[number]

export const TYPICAL_ORDERS: Record<TypicalOrder, string> = {
  under_100: 'Under ₱100',
  '100_200': '₱100 to ₱200',
  '200_400': '₱200 to ₱400',
  over_400: 'More than ₱400',
}

/** A figure inside each bucket, used only to size the stamp-card reward and its minimum spend. */
const TYPICAL_ORDER_PESOS: Record<TypicalOrder, number> = {
  under_100: 80,
  '100_200': 150,
  '200_400': 300,
  over_400: 500,
}

export function typicalOrderPesos(bucket: TypicalOrder | null | undefined): number | null {
  return bucket ? TYPICAL_ORDER_PESOS[bucket] : null
}

/** The listed order, each goal once: "Bigger orders · More regulars", however they were tapped. */
export function orderGoals(goals: readonly GoalId[]): GoalId[] {
  const picked = new Set(goals)
  return GOAL_IDS.filter((goal) => picked.has(goal))
}

export interface PlanRow {
  goal: GoalId
  title: string
  detail: string
}

export interface LaunchPlan {
  /** The goals' titles, for the tags above the plan. */
  goals: string[]
  rows: PlanRow[]
  /** What we set up anyway, said once and quietly; null when every goal was picked. */
  alsoReady: string | null
}

const MOVES: Record<GoalId, ReadonlyArray<Omit<PlanRow, 'goal'>>> = {
  ordering: [
    { title: 'Your menu online, easy to order from', detail: 'One link for Facebook, Messenger and a QR on your counter' },
    { title: 'Every order arrives complete', detail: 'Items, payment and pickup time in one place. No chat back-and-forth' },
  ],
  bigger_orders: [
    { title: 'Combos on your menu', detail: 'Built from your best sellers. You approve each one first' },
    { title: '"Upgrade it?" and a cart add-on', detail: 'Shown as customers order, never a pop-up' },
  ],
  regulars: [
    { title: 'A stamp card', detail: `${STARTER_STAMP_THRESHOLD} orders, then a free treat they will want` },
    { title: '4 ready-made text messages', detail: 'To bring first-timers back. You turn them on' },
  ],
  faster_counter: [
    { title: 'A register in the app', detail: 'Walk-ins and online orders in one list' },
    { title: 'Kitchen chits from your phone', detail: 'Print to a Bluetooth printer as orders come in' },
  ],
}

const ALSO_READY: Record<GoalId, string> = {
  ordering: 'your online menu',
  bigger_orders: 'combos and upsells',
  regulars: 'a stamp card and text messages',
  faster_counter: 'the counter register',
}

const MAX_GOALS_WITH_TWO_MOVES = 3

function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function buildLaunchPlan(picked: readonly GoalId[]): LaunchPlan {
  const goals = orderGoals(picked)
  const leading: GoalId[] = goals.length > 0 ? goals : ['ordering']
  const rest = GOAL_IDS.filter((goal) => !leading.includes(goal))
  return {
    goals: goals.map((goal) => GOALS[goal].title),
    // Two moves a goal, or the strongest one each when all four were picked: the plan stays one screen.
    rows: leading.flatMap((goal) => MOVES[goal].slice(0, leading.length > MAX_GOALS_WITH_TWO_MOVES ? 1 : 2).map((move) => ({ goal, ...move }))),
    alsoReady: rest.length > 0 ? `Also ready: ${joinWithAnd(rest.map((goal) => ALSO_READY[goal]))}.` : null,
  }
}
