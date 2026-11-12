/**
 * The signed-in customer's loyalty card, projected for the app: the wallet
 * rows `app_customer_loyalty` returns (the same selects as the web rewards
 * page's `lookup_loyalty_wallet`) and the customer's ledger events, mapped
 * onto the app contract. Pure; explicit projections only, so a new database
 * field can never reach a phone by accident.
 */

import type { AppLoyaltyActivity, AppLoyaltyProgram, AppReward } from '@/lib/app-contract'
import type { LoyaltyActivityEvent } from '@/lib/loyalty/activity'
import { rewardEmoji, rewardSteps } from '@/lib/loyalty/ladder'
import { describeLoyaltyReward } from '@/lib/loyalty/offer'
import { parseLoyaltyRules } from '@/lib/loyalty/rules'

/** The most ledger events the Rewards screen lists. */
export const APP_ACTIVITY_LIMIT = 30

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** A program the customer can see; ended cards with a balance stay visible. Unreadable rules are skipped. */
export function projectPrograms(rows: readonly Row[]): AppLoyaltyProgram[] {
  return rows.flatMap((row) => {
    const rules = parseLoyaltyRules(row.rules)
    const id = text(row.id)
    const name = text(row.name)
    if (!rules.ok || !id || !name) return []
    const balance = Number(row.balance)
    return [{
      id,
      name,
      earnMode: rules.value.earnMode,
      threshold: rules.value.threshold,
      balance: Number.isFinite(balance) ? Math.trunc(balance) : 0,
      rewardLabel: describeLoyaltyReward(rules.value.reward),
      minSpend: rules.value.minSpend ?? null,
      branchName: text(row.branchName),
      rewardSteps: rewardSteps(rules.value).map((step) => ({
        at: step.at,
        label: step.label,
        emoji: step.emoji,
        imageUrl: step.imageUrl,
        isFinal: step.isFinal,
      })),
    }]
  })
}

/** Unlocked rewards that are still usable (issued or restored, not expired). */
export function projectRewards(rows: readonly Row[]): AppReward[] {
  return rows.flatMap((row) => {
    const terms = (row.terms ?? {}) as Row
    const rules = parseLoyaltyRules({ earnMode: 'stamp', threshold: 1, reward: terms.reward })
    const id = text(row.id)
    if (!rules.ok || !id) return []
    const reward = rules.value.reward
    const expiresAt = text(row.expiresAt)
    return [{
      id,
      programName: text(terms.programName) ?? 'Rewards',
      label: describeLoyaltyReward(reward),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      branchName: text(row.branchName),
      emoji: rewardEmoji(reward),
      imageUrl: reward.type === 'free_item' ? reward.imageUrl ?? null : null,
    }]
  })
}

/**
 * The customer's history in their own words. Holds, restores and snapshot
 * rows are bookkeeping the customer never acted on, so they are left out.
 */
export function projectActivity(events: readonly LoyaltyActivityEvent[]): AppLoyaltyActivity[] {
  return events.flatMap((event): AppLoyaltyActivity[] => {
    const reward = event.rewardLabel ?? 'Reward'
    const delta = event.delta === null || !Number.isFinite(event.delta) ? 0 : Math.trunc(event.delta)
    const base = { id: event.id, delta, occurredAt: new Date(event.occurredAt).toISOString() }
    switch (event.kind) {
      case 'earn':
        return [{ ...base, kind: 'earn', label: event.programName }]
      case 'reverse':
        return [{ ...base, kind: 'reverse', label: 'Order refunded or cancelled' }]
      case 'redeem':
        return [{ ...base, kind: 'redeem', label: `Used on ${event.programName}` }]
      case 'correction':
        return [{ ...base, kind: 'correction', label: 'Adjusted by the store' }]
      case 'reward_issued':
        return [{ ...base, kind: 'reward_issued', label: `${reward} unlocked` }]
      case 'reward_consumed':
        return [{ ...base, kind: 'redeem', label: `${reward} used` }]
      case 'reward_expired':
        return [{ ...base, kind: 'reward_expired', label: `${reward} expired` }]
      case 'reward_voided':
        return [{ ...base, kind: 'reward_expired', label: `${reward} cancelled by the store` }]
      default:
        return []
    }
  })
}

/**
 * The program the member QR is issued under: the first ACTIVE one (the oldest,
 * as the wallet lists them). Identify returns the phone, so one code earns on
 * every program. Null = no live program, so no member code yet.
 */
export function memberProgramId(rows: readonly Row[]): string | null {
  const active = rows.find((row) => row.status === 'active' && text(row.id))
  return active ? String(active.id) : null
}
