/**
 * Turning a store's loyalty on when the merchant activates a program.
 *
 * `loyalty_enabled` and `loyalty_shadow` were rollout switches with no UI
 * anywhere: a merchant could build a programme, activate it, watch it say
 * "Live" — and no customer ever saw a stamp, because the store was still
 * disabled and in shadow. Activation is the merchant saying "go", so it is
 * what flips both.
 *
 * Deactivation is deliberately NOT the mirror image. Pausing a programme
 * already stops earning (no active programme qualifies), and clearing the
 * flags as well would silently drop the replays that make earning idempotent.
 */

import type { LoyaltyTenantFlags } from './store'

export interface LoyaltyGoLivePatch {
  loyalty_enabled?: true
  loyalty_shadow?: false
}

/**
 * What the tenant row needs so an activated programme actually earns.
 * Null when the store is already live — nothing to write.
 */
export function decideLoyaltyGoLive(flags: LoyaltyTenantFlags): LoyaltyGoLivePatch | null {
  const patch: LoyaltyGoLivePatch = {}
  if (!flags.isEnabled) patch.loyalty_enabled = true
  if (flags.isShadow) patch.loyalty_shadow = false
  return Object.keys(patch).length > 0 ? patch : null
}
