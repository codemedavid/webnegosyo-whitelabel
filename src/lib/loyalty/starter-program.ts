/**
 * The stamp card a brand-new store launches with, so loyalty is live from its
 * first order instead of waiting for the merchant to design one.
 *
 * Pure: it picks the reward and shapes a program that `parseLoyaltyProgramInput`
 * accepts. The I/O (catalog check, create, activate) lives in
 * `src/lib/onboarding/launch-loyalty.ts`.
 */

import { classifyMenuRole } from '@/lib/boost/menu-roles'

/** Orders a customer makes before the free item. */
export const STARTER_STAMP_THRESHOLD = 8
/** Days an earned free item stays claimable. */
const STARTER_REWARD_EXPIRY_DAYS = 30
const MAX_PROGRAM_NAME = 80
const NAME_SUFFIX = 'Stamp Card'

/**
 * The reward is worth about a tenth of what 8 orders spend: 80% of one typical
 * order. Generous enough to come back for, cheap enough to give every week.
 */
const REWARD_SHARE_OF_TYPICAL_ORDER = 0.8
/** How far from that target a reward may land, as shares of it. */
const REWARD_BAND = { min: 0.4, max: 1.15 } as const
/** An order under half a typical order (a lone ₱25 water) earns no stamp. */
const MIN_SPEND_SHARE_OF_TYPICAL_ORDER = 0.5
const MIN_SPEND_STEP = 10
/** Below this a minimum spend only confuses: the whole menu is street food. */
const MIN_USEFUL_MIN_SPEND = 20

export interface StarterLoyaltyItem {
  id: string
  name: string
  price: number
  isAvailable: boolean
  categoryName?: string | null
}

export interface StarterLoyaltyInput {
  storeName: string
  items: ReadonlyArray<StarterLoyaltyItem>
  bestSellerIds: readonly string[]
  /** What one order usually costs, from the owner's own answer; absent = read from the menu. */
  typicalOrder?: number | null
}

export interface StarterLoyaltyProgram {
  program: Record<string, unknown>
  rewardItemId: string | null
  rewardLabel: string
  minSpend: number | null
}

function isRewardable(item: StarterLoyaltyItem): boolean {
  return item.isAvailable && Number.isFinite(item.price) && item.price > 0
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * What one order usually costs: the owner's answer, else the median main (or
 * drink, for a café), else the median of the whole menu.
 */
function typicalOrderOf(input: StarterLoyaltyInput, rewardable: readonly StarterLoyaltyItem[]): number | null {
  if (input.typicalOrder != null && Number.isFinite(input.typicalOrder) && input.typicalOrder > 0) return input.typicalOrder
  const roleOf = (item: StarterLoyaltyItem) => classifyMenuRole({ categoryName: item.categoryName, itemName: item.name })
  const mains = rewardable.filter((item) => roleOf(item) === 'main')
  const drinks = rewardable.filter((item) => roleOf(item) === 'drink')
  const anchors = mains.length > 0 ? mains : drinks.length > 0 ? drinks : rewardable
  return median(anchors.map((item) => item.price))
}

function closestTo(target: number, items: readonly StarterLoyaltyItem[]): StarterLoyaltyItem | null {
  return items.reduce<StarterLoyaltyItem | null>((best, item) => {
    if (best === null) return item
    const gap = Math.abs(item.price - target) - Math.abs(best.price - target)
    return gap < 0 || (gap === 0 && item.price < best.price) ? item : best
  }, null)
}

/**
 * A reward worth eight visits: the best seller nearest the target value, else
 * any item nearest it, else whatever comes closest. Never a ₱0 or sold-out item.
 */
function pickRewardItem(input: StarterLoyaltyInput, typicalOrder: number, rewardable: readonly StarterLoyaltyItem[]): StarterLoyaltyItem | null {
  const target = typicalOrder * REWARD_SHARE_OF_TYPICAL_ORDER
  const inBand = rewardable.filter((item) => item.price >= target * REWARD_BAND.min && item.price <= target * REWARD_BAND.max)
  const bestSellers = new Set(input.bestSellerIds)
  return closestTo(target, inBand.filter((item) => bestSellers.has(item.id)))
    ?? closestTo(target, inBand)
    ?? closestTo(target, rewardable)
}

function minSpendFor(typicalOrder: number): number | null {
  const amount = Math.floor((typicalOrder * MIN_SPEND_SHARE_OF_TYPICAL_ORDER) / MIN_SPEND_STEP) * MIN_SPEND_STEP
  return amount >= MIN_USEFUL_MIN_SPEND ? amount : null
}

function programName(storeName: string): string {
  const store = storeName.trim()
  if (!store) return NAME_SUFFIX
  const maxStoreLength = MAX_PROGRAM_NAME - NAME_SUFFIX.length - 1
  return `${store.slice(0, maxStoreLength).trim()} ${NAME_SUFFIX}`
}

export function buildStarterLoyaltyProgram(input: StarterLoyaltyInput): StarterLoyaltyProgram | null {
  const rewardable = input.items.filter(isRewardable)
  const typicalOrder = typicalOrderOf(input, rewardable)
  if (typicalOrder === null) return null
  const reward = pickRewardItem(input, typicalOrder, rewardable)
  if (!reward) return null
  const minSpend = minSpendFor(typicalOrder)

  const itemName = reward.name.trim() || 'Free item'
  return {
    rewardItemId: reward.id,
    rewardLabel: `Free ${itemName}`,
    minSpend,
    program: {
      name: programName(input.storeName),
      description: minSpend
        ? `Get a free ${itemName} after ${STARTER_STAMP_THRESHOLD} orders of ₱${minSpend} or more.`
        : `Get a free ${itemName} after ${STARTER_STAMP_THRESHOLD} orders.`,
      scope: 'business',
      outletId: null,
      activatesAt: null,
      endsAt: null,
      rules: {
        earnMode: 'stamp',
        threshold: STARTER_STAMP_THRESHOLD,
        pointsPerPeso: null,
        minSpend,
        reward: { type: 'free_item', menuItemId: reward.id, itemName },
        rewardExpiryDays: STARTER_REWARD_EXPIRY_DAYS,
        isExclusive: true,
      },
    },
  }
}
