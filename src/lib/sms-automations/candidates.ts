/**
 * Who qualifies for each recipe — pure, from rows the loaders already read.
 *
 * Each candidate carries an OCCURRENCE KEY, and a guest can only ever get one
 * text per (automation, key). The keys are chosen so the right thing happens
 * without bookkeeping:
 *   - win-back / regulars: `lapse:<last order>` — one text per absence; a new
 *     order starts a new absence.
 *   - review: `order:<id>` — one ask per order.
 *   - first-timers: `first_visit` — once per guest, ever.
 *   - almost there: `step:<program>:<card>:<rung>` — once per rung per card.
 *   - rewards: `reward:<id>` / `expiring:<id>` — once per reward.
 *
 * Every recipe also has a BACKLOG bound: "Run now" may reach guests who
 * qualified weeks ago, but never someone who left a year ago and would not
 * recognise the store's name.
 */

import { nextRewardStep } from '@/lib/loyalty/ladder'
import { describeLoyaltyReward } from '@/lib/loyalty/reward-label'
import type { LoyaltyReward, LoyaltyRules } from '@/lib/loyalty/types'
import { resolveParams } from './recipes'
import { toSmsSafe } from './template'
import type { AutomationParams, Candidate, GuestProfile, RecipeId } from './types'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** How far past the line a lapsed guest may still be texted. */
const LAPSE_BACKLOG_DAYS = 120
const FIRST_VISIT_BACKLOG_DAYS = 60
const ALMOST_THERE_BACKLOG_DAYS = 60
const REVIEW_VALID_HOURS = 24
const REWARD_WAITING_BACKLOG_DAYS = 60

const iso = (ms: number) => new Date(ms).toISOString()

function isDue(dueMs: number, expiresMs: number, now: Date): boolean {
  return Number.isFinite(dueMs) && dueMs <= now.getTime() && expiresMs > now.getTime()
}

/** Guest-profile recipes: win-back, regulars gone quiet, first-timers. */
export function guestCandidates(
  recipe: Extract<RecipeId, 'win_back' | 'regulars_gone_quiet' | 'first_visit_followup'>,
  params: AutomationParams,
  guests: readonly GuestProfile[],
  now: Date,
): Candidate[] {
  const p = resolveParams(recipe, params)
  const found: Candidate[] = []
  for (const guest of guests) {
    if (recipe === 'first_visit_followup') {
      if (guest.orderCount !== 1 || !guest.firstOrderAt) continue
      const dueMs = Date.parse(guest.firstOrderAt) + p.delayDays * DAY_MS
      const expiresMs = dueMs + FIRST_VISIT_BACKLOG_DAYS * DAY_MS
      if (!isDue(dueMs, expiresMs, now)) continue
      found.push({ guest, occurrenceKey: 'first_visit', dueAt: iso(dueMs), expiresAt: iso(expiresMs) })
      continue
    }
    if (!guest.lastOrderAt) continue
    if (recipe === 'regulars_gone_quiet' && guest.orderCount < p.minOrderCount) continue
    const dueMs = Date.parse(guest.lastOrderAt) + p.inactiveDays * DAY_MS
    const expiresMs = dueMs + LAPSE_BACKLOG_DAYS * DAY_MS
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push({ guest, occurrenceKey: `lapse:${guest.lastOrderAt}`, dueAt: iso(dueMs), expiresAt: iso(expiresMs) })
  }
  return found
}

export interface OrderRow {
  id: string
  customerId: string
  createdAt: string
}

function reviewWindow(createdAt: string, delayHours: number): { dueMs: number; expiresMs: number } {
  const dueMs = Date.parse(createdAt) + delayHours * HOUR_MS
  return { dueMs, expiresMs: dueMs + REVIEW_VALID_HOURS * HOUR_MS }
}

/** Platform stores: one ask per (not cancelled) order, N hours after it was placed. */
export function reviewCandidates(
  params: AutomationParams,
  orders: readonly OrderRow[],
  guestsById: ReadonlyMap<string, GuestProfile>,
  now: Date,
): Candidate[] {
  const p = resolveParams('review_request', params)
  const found: Candidate[] = []
  for (const order of orders) {
    const guest = guestsById.get(order.customerId)
    if (!guest || guest.orderCount < p.minOrderCount) continue
    const { dueMs, expiresMs } = reviewWindow(order.createdAt, p.delayHours)
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push({ guest, occurrenceKey: `order:${order.id}`, dueAt: iso(dueMs), expiresAt: iso(expiresMs) })
  }
  return found
}

/**
 * Stores whose orders live elsewhere (Convex, their own Supabase): the shared
 * customers table still knows each guest's latest visit, which is all a review
 * request needs.
 */
export function reviewCandidatesFromVisits(
  params: AutomationParams,
  guests: readonly GuestProfile[],
  now: Date,
): Candidate[] {
  const p = resolveParams('review_request', params)
  const found: Candidate[] = []
  for (const guest of guests) {
    if (!guest.lastOrderAt || guest.orderCount < p.minOrderCount) continue
    const { dueMs, expiresMs } = reviewWindow(guest.lastOrderAt, p.delayHours)
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push({ guest, occurrenceKey: `visit:${guest.lastOrderAt}`, dueAt: iso(dueMs), expiresAt: iso(expiresMs) })
  }
  return found
}

export interface BalanceRow {
  customerId: string
  programId: string
  balance: number
  cycle: number
  /** Last change to the card — the latest stamp, in practice. */
  updatedAt: string
  rules: LoyaltyRules
}

function rewardName(reward: LoyaltyReward): string {
  return toSmsSafe(describeLoyaltyReward(reward))
}

/**
 * Guests a few stamps from their next reward. Stamp cards only: "2 points
 * left" on a 500-point card is noise, not a nudge.
 */
export function almostThereCandidates(
  params: AutomationParams,
  balances: readonly BalanceRow[],
  guestsById: ReadonlyMap<string, GuestProfile>,
  now: Date,
): Candidate[] {
  const p = resolveParams('loyalty_almost_there', params)
  const found: Candidate[] = []
  for (const row of balances) {
    if (row.rules.earnMode !== 'stamp') continue
    const guest = guestsById.get(row.customerId)
    const next = nextRewardStep(row.rules, row.balance)
    if (!guest || !next || next.remaining <= 0 || next.remaining > p.remainingAtMost) continue
    const dueMs = Date.parse(row.updatedAt) + p.delayDays * DAY_MS
    const expiresMs = dueMs + ALMOST_THERE_BACKLOG_DAYS * DAY_MS
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push({
      guest,
      occurrenceKey: `step:${row.programId}:${row.cycle}:${next.step.at}`,
      dueAt: iso(dueMs),
      expiresAt: iso(expiresMs),
      loyalty: {
        remaining: next.remaining,
        progressLeft: `${next.remaining} ${next.remaining === 1 ? 'stamp' : 'stamps'}`,
        rewardName: toSmsSafe(next.step.label),
        rewardExpiresAt: null,
      },
    })
  }
  return found
}

export interface EntitlementRow {
  id: string
  /** `phone:+639…` for phone members; anything else is not textable. */
  customerKey: string
  issuedAt: string
  expiresAt: string | null
  terms: { reward: LoyaltyReward }
}

function phoneOf(customerKey: string): string | null {
  return customerKey.startsWith('phone:') ? customerKey.slice('phone:'.length) : null
}

function rewardCandidate(
  row: EntitlementRow, guest: GuestProfile, key: string, dueMs: number, expiresMs: number,
): Candidate {
  return {
    guest,
    occurrenceKey: key,
    dueAt: iso(dueMs),
    expiresAt: iso(expiresMs),
    entitlementId: row.id,
    loyalty: { remaining: 0, progressLeft: '', rewardName: rewardName(row.terms.reward), rewardExpiresAt: row.expiresAt },
  }
}

/** An issued reward nobody has used for N days. Only `issued` rows are passed in. */
export function rewardWaitingCandidates(
  params: AutomationParams,
  entitlements: readonly EntitlementRow[],
  guestsByPhone: ReadonlyMap<string, GuestProfile>,
  now: Date,
): Candidate[] {
  const p = resolveParams('loyalty_reward_waiting', params)
  const found: Candidate[] = []
  for (const row of entitlements) {
    const phone = phoneOf(row.customerKey)
    const guest = phone ? guestsByPhone.get(phone) : undefined
    if (!guest) continue
    const dueMs = Date.parse(row.issuedAt) + p.delayDays * DAY_MS
    const backlogMs = dueMs + REWARD_WAITING_BACKLOG_DAYS * DAY_MS
    const expiresMs = row.expiresAt ? Math.min(Date.parse(row.expiresAt), backlogMs) : backlogMs
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push(rewardCandidate(row, guest, `reward:${row.id}`, dueMs, expiresMs))
  }
  return found
}

/** An issued reward that stops being claimable within N days. */
export function rewardExpiringCandidates(
  params: AutomationParams,
  entitlements: readonly EntitlementRow[],
  guestsByPhone: ReadonlyMap<string, GuestProfile>,
  now: Date,
): Candidate[] {
  const p = resolveParams('loyalty_reward_expiring', params)
  const found: Candidate[] = []
  for (const row of entitlements) {
    if (!row.expiresAt) continue
    const phone = phoneOf(row.customerKey)
    const guest = phone ? guestsByPhone.get(phone) : undefined
    if (!guest) continue
    const expiresMs = Date.parse(row.expiresAt)
    const dueMs = Math.max(Date.parse(row.issuedAt), expiresMs - p.delayDays * DAY_MS)
    if (!isDue(dueMs, expiresMs, now)) continue
    found.push(rewardCandidate(row, guest, `expiring:${row.id}`, dueMs, expiresMs))
  }
  return found
}
