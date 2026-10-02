/**
 * Validates the `rules` jsonb a program version stores.
 *
 * The engine trusts this shape completely, so it is checked once, at write
 * time, and refused with a reason a merchant can act on. A malformed blob that
 * slipped through would otherwise surface as a customer earning nothing, or
 * everything, with no error anywhere.
 */

import type { LoyaltyMilestone, LoyaltyReward, LoyaltyRules } from './types'

export type LoyaltyRulesParse =
  | { ok: true; value: LoyaltyRules }
  | { ok: false; error: string }

const MAX_PERCENT = 100
/** Rewards on the way to the top one. Five rungs in total is already a long card. */
export const MAX_LOYALTY_MILESTONES = 4
/** One or two emoji, including ZWJ sequences; anything longer is not a stamp. */
const MAX_EMOJI_LENGTH = 16
const MAX_IMAGE_URL_LENGTH = 1000

function refuse(error: string): LoyaltyRulesParse {
  return { ok: false, error }
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isMoney(value: number): boolean {
  return value <= 9_999_999.99 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

function optionalNonNegative(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** The cosmetic fields, kept only when present so stored rules stay byte-stable. */
function parseLook(reward: Record<string, unknown>): Parsed<{ emoji?: string }> {
  if (reward.emoji === undefined || reward.emoji === null || reward.emoji === '') return { ok: true, value: {} }
  if (typeof reward.emoji !== 'string') return { ok: false, error: 'A reward icon must be text.' }
  const emoji = reward.emoji.trim()
  if (!emoji || emoji.length > MAX_EMOJI_LENGTH) return { ok: false, error: 'Pick a single emoji for the reward icon.' }
  return { ok: true, value: { emoji } }
}

function parseImageUrl(raw: unknown): Parsed<{ imageUrl?: string }> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: {} }
  if (typeof raw !== 'string' || raw.length > MAX_IMAGE_URL_LENGTH || !/^https:\/\/[^\s"'<>]+$/.test(raw)) {
    return { ok: false, error: 'The reward photo must be an https link.' }
  }
  return { ok: true, value: { imageUrl: raw } }
}

function parseReward(raw: unknown): Parsed<LoyaltyReward> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A reward is required.' }
  const reward = raw as Record<string, unknown>
  const look = parseLook(reward)
  if (!look.ok) return look

  switch (reward.type) {
    case 'fixed': {
      if (!isPositive(reward.amount) || !isMoney(reward.amount)) return { ok: false, error: 'A fixed reward needs a positive amount with at most two decimal places.' }
      return { ok: true, value: { type: 'fixed', amount: reward.amount, ...look.value } }
    }
    case 'percent': {
      if (!isPositive(reward.percent) || reward.percent > MAX_PERCENT) {
        return { ok: false, error: 'A percent reward must be between 0 and 100.' }
      }
      const maxAmount = optionalNonNegative(reward.maxAmount)
      if (maxAmount === undefined || (maxAmount !== null && !isMoney(maxAmount))) return { ok: false, error: 'The percent cap must be an amount with at most two decimal places.' }
      return { ok: true, value: { type: 'percent', percent: reward.percent, maxAmount: maxAmount || null, ...look.value } }
    }
    case 'free_item': {
      const menuItemId = typeof reward.menuItemId === 'string' ? reward.menuItemId.trim() : ''
      const itemName = typeof reward.itemName === 'string' ? reward.itemName.trim() : ''
      if (!menuItemId) return { ok: false, error: 'A free-item reward needs the menu item.' }
      const image = parseImageUrl(reward.imageUrl)
      if (!image.ok) return image
      return { ok: true, value: { type: 'free_item', menuItemId, itemName: itemName || 'Free item', ...image.value, ...look.value } }
    }
    default:
      return { ok: false, error: 'Reward type must be fixed, percent or free_item.' }
  }
}

/**
 * Mid-card rungs. Each sits strictly inside the card (the top rung is the
 * program's own `reward`), on its own slot, and in whole stamps for a stamp
 * card — a rung at 2.5 stamps could never be reached.
 */
function parseMilestones(raw: unknown, threshold: number, isStamp: boolean): Parsed<LoyaltyMilestone[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: 'Milestones must be a list.' }
  if (raw.length > MAX_LOYALTY_MILESTONES) {
    return { ok: false, error: `A card holds at most ${MAX_LOYALTY_MILESTONES + 1} rewards.` }
  }

  const milestones: LoyaltyMilestone[] = []
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>
    if (!isPositive(item.at) || item.at >= threshold) {
      return { ok: false, error: 'Each extra reward must sit between the first stamp and the last.' }
    }
    if (isStamp && !Number.isSafeInteger(item.at)) return { ok: false, error: 'Rewards sit on whole stamps.' }
    const reward = parseReward(item.reward)
    if (!reward.ok) return reward
    milestones.push({ at: item.at, reward: reward.value })
  }

  const sorted = [...milestones].sort((a, b) => a.at - b.at)
  if (sorted.some((milestone, index) => index > 0 && milestone.at === sorted[index - 1].at)) {
    return { ok: false, error: 'Two rewards cannot share one stamp.' }
  }
  return { ok: true, value: sorted }
}

export function parseLoyaltyRules(raw: unknown): LoyaltyRulesParse {
  if (!raw || typeof raw !== 'object') return refuse('Rules must be an object.')
  const input = raw as Record<string, unknown>

  if (input.earnMode !== 'stamp' && input.earnMode !== 'points') {
    return refuse('earnMode must be stamp or points.')
  }
  if (!isPositive(input.threshold)) return refuse('threshold must be above zero.')
  if (input.earnMode === 'stamp' && !Number.isSafeInteger(input.threshold)) return refuse('Orders per reward must be a whole number.')

  const pointsPerPeso = input.earnMode === 'points' ? input.pointsPerPeso : null
  if (input.earnMode === 'points' && !isPositive(pointsPerPeso)) {
    return refuse('A points program needs pointsPerPeso above zero.')
  }

  const minSpend = optionalNonNegative(input.minSpend)
  if (minSpend === undefined) return refuse('minSpend cannot be negative.')

  const rewardExpiryDays = optionalNonNegative(input.rewardExpiryDays)
  if (rewardExpiryDays === undefined) return refuse('rewardExpiryDays cannot be negative.')
  if (rewardExpiryDays !== null && !Number.isSafeInteger(rewardExpiryDays)) return refuse('Reward expiry must be a whole number of days.')

  const reward = parseReward(input.reward)
  if (!reward.ok) return refuse(reward.error)

  const milestones = parseMilestones(input.milestones, input.threshold, input.earnMode === 'stamp')
  if (!milestones.ok) return refuse(milestones.error)

  return {
    ok: true,
    value: {
      earnMode: input.earnMode,
      threshold: input.threshold,
      pointsPerPeso: typeof pointsPerPeso === 'number' ? pointsPerPeso : null,
      minSpend: minSpend || null,
      reward: reward.value,
      ...(milestones.value.length ? { milestones: milestones.value } : {}),
      rewardExpiryDays: rewardExpiryDays || null,
      // Exclusive unless the merchant says otherwise: a reward quietly stacking
      // on a voucher is how an order gets given away.
      isExclusive: input.isExclusive !== false,
    },
  }
}
