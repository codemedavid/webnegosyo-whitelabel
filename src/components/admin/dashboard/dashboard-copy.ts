/**
 * Short words for the dashboard: tile-sized changes and a ranked to-do list,
 * written for an owner who has never read an analytics report.
 *
 * Pure (no 'use client'), so server and client components share it.
 */

import type { CaptureScore } from '@/lib/growth/growth-metrics'
import type { LoyaltyActions } from '@/lib/dashboard/read-customer-signals'
import { formatCount, formatPeso } from './dashboard-format'

/** Below this a percentage exaggerates ("+150%" for 2 → 5); show the difference instead. */
const SMALL_COUNT = 20
/** Past this a percentage only says "the baseline was tiny". */
const MAX_SHOWN_PERCENT = 999
/** Share of orders with no phone number past which the dashboard suggests asking for one. */
const NO_PHONE_TIP_PERCENT = 20
const MINUS = '\u2212'

export type ChangeDirection = 'up' | 'down' | 'flat' | 'none'

export interface ChangeNote {
  direction: ChangeDirection
  text: string
}

interface ChangeInput {
  current: number
  previous: number
  kind: 'money' | 'count'
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`
}

/** A tile-sized change: "+3" for small counts, "−12%" otherwise, "New" with nothing before. */
export function shortChange({ current, previous, kind }: ChangeInput): ChangeNote {
  const isSmallCount = kind === 'count' && previous < SMALL_COUNT
  if (current === previous) return { direction: 'flat', text: isSmallCount ? '0' : '0%' }

  const direction: ChangeDirection = current > previous ? 'up' : 'down'
  const sign = direction === 'up' ? '+' : MINUS
  if (isSmallCount) return { direction, text: `${sign}${formatCount(Math.abs(current - previous))}` }
  if (previous <= 0) return { direction: 'none', text: 'New' }

  const percent = Math.round(Math.abs(((current - previous) / previous) * 100))
  if (percent === 0) return { direction: 'flat', text: '0%' }
  return { direction, text: percent > MAX_SHOWN_PERCENT ? `${sign}${MAX_SHOWN_PERCENT}%+` : `${sign}${percent}%` }
}

export type GrowthActionKey = 'reward-ready' | 'slipping' | 'first-timers' | 'almost-there' | 'capture' | 'stamp-card'

export interface GrowthAction {
  key: GrowthActionKey
  title: string
  detail: string
  href: string | null
  cta: string | null
}

interface GrowthActionsInput {
  actions: { firstTimersNotBack: number; slippingAway: number }
  loyalty: LoyaltyActions | null
  capture: CaptureScore
  hasLoyaltyProgram: boolean
  /** One-branch accounts cannot set up a store-wide stamp card. */
  isBranchView: boolean
  hrefs: { customers: string; loyalty: string }
}

/** What the owner can do today to grow, most valuable first. Empty means all caught up. */
export function buildGrowthActions(input: GrowthActionsInput): GrowthAction[] {
  const { actions, loyalty, capture, hrefs } = input
  const list: GrowthAction[] = []

  if (loyalty && loyalty.rewardReady > 0) {
    list.push({
      key: 'reward-ready',
      title: `${plural(loyalty.rewardReady, 'customer has', 'customers have')} a reward waiting`,
      detail: 'Remind them to come in and claim it.',
      href: hrefs.loyalty,
      cta: 'See who',
    })
  }
  if (actions.slippingAway > 0) {
    list.push({
      key: 'slipping',
      title: `${plural(actions.slippingAway, 'regular is', 'regulars are')} overdue for a visit`,
      detail: 'They usually order again by now. Send a friendly message.',
      href: hrefs.customers,
      cta: 'See who',
    })
  }
  if (actions.firstTimersNotBack > 0) {
    list.push({
      key: 'first-timers',
      title: `${plural(actions.firstTimersNotBack, "first-timer hasn't", "first-timers haven't")} come back`,
      detail: 'Ordered once, 2 to 8 weeks ago. Try a small offer.',
      href: hrefs.customers,
      cta: 'See who',
    })
  }
  if (loyalty && loyalty.almostThere > 0) {
    list.push({
      key: 'almost-there',
      title: `${plural(loyalty.almostThere, 'customer is', 'customers are')} one visit from a reward`,
      detail: 'Tell them they are close to a free reward.',
      href: hrefs.loyalty,
      cta: 'See who',
    })
  }

  const noPhonePercent = Math.round(100 - capture.rate)
  if (capture.guestOrders > 0 && noPhonePercent >= NO_PHONE_TIP_PERCENT) {
    list.push({
      key: 'capture',
      title: `${noPhonePercent}% of orders left no phone number`,
      detail: `${formatPeso(capture.guestSales)} from people you can't invite back. Ask for a number at checkout.`,
      href: null,
      cta: null,
    })
  }
  if (!input.hasLoyaltyProgram && !input.isBranchView) {
    list.push({
      key: 'stamp-card',
      title: 'Start a stamp card',
      detail: 'Stamps bring customers back, and they share their number to get them.',
      href: hrefs.loyalty,
      cta: 'Set it up',
    })
  }
  return list
}
