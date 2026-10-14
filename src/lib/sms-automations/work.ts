/**
 * One automation + one store's data → the guests who qualify. Pure.
 *
 * The loaders read each store once; this routes the rows to the right
 * candidate builder so the tick, "Run now" and the preview all agree.
 */

import {
  almostThereCandidates,
  guestCandidates,
  reviewCandidates,
  reviewCandidatesFromVisits,
  rewardExpiringCandidates,
  rewardWaitingCandidates,
  type BalanceRow,
  type EntitlementRow,
  type OrderRow,
} from './candidates'
import { getRecipe } from './recipes'
import type { AutomationRow, Candidate, GuestProfile } from './types'

export interface StoreData {
  /** Guests with a phone number. */
  guests: readonly GuestProfile[]
  /** Recent orders with a guest attached; null when the store's orders live off the platform. */
  orders: readonly OrderRow[] | null
  /** Stamp-card balances of live programs. */
  balances: readonly BalanceRow[]
  /** Rewards still claimable (issued or restored, not expired). */
  entitlements: readonly EntitlementRow[]
  /** loyalty_enabled and not in shadow mode. */
  loyaltyOn: boolean
}

export function candidatesFor(automation: AutomationRow, data: StoreData, now: Date): Candidate[] {
  const { recipe, params } = automation
  if (getRecipe(recipe).needsLoyalty && !data.loyaltyOn) return []
  const byId = new Map(data.guests.map((guest) => [guest.id, guest]))
  const byPhone = new Map(data.guests.flatMap((guest) => (guest.phone ? [[guest.phone, guest] as const] : [])))

  switch (recipe) {
    case 'win_back':
    case 'regulars_gone_quiet':
    case 'first_visit_followup':
      return guestCandidates(recipe, params, data.guests, now)
    case 'review_request':
      return data.orders
        ? reviewCandidates(params, data.orders, byId, now)
        : reviewCandidatesFromVisits(params, data.guests, now)
    case 'loyalty_almost_there':
      return almostThereCandidates(params, data.balances, byId, now)
    case 'loyalty_reward_waiting':
      return rewardWaitingCandidates(params, data.entitlements, byPhone, now)
    case 'loyalty_reward_expiring':
      return rewardExpiringCandidates(params, data.entitlements, byPhone, now)
  }
}
