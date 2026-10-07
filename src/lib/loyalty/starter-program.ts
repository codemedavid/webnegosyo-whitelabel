/**
 * The stamp card a brand-new store launches with, so loyalty is live from its
 * first order instead of waiting for the merchant to design one.
 *
 * Pure: it picks the reward and shapes a program that `parseLoyaltyProgramInput`
 * accepts. The I/O (catalog check, create, activate) lives in
 * `src/lib/onboarding/launch-loyalty.ts`.
 */

/** Orders a customer makes before the free item. */
export const STARTER_STAMP_THRESHOLD = 8
/** Days an earned free item stays claimable. */
const STARTER_REWARD_EXPIRY_DAYS = 30
const MAX_PROGRAM_NAME = 80
const NAME_SUFFIX = 'Stamp Card'

export interface StarterLoyaltyItem {
  id: string
  name: string
  price: number
  isAvailable: boolean
}

export interface StarterLoyaltyInput {
  storeName: string
  items: ReadonlyArray<StarterLoyaltyItem>
  bestSellerIds: readonly string[]
}

export interface StarterLoyaltyProgram {
  program: Record<string, unknown>
  rewardItemId: string | null
  rewardLabel: string
}

function isRewardable(item: StarterLoyaltyItem): boolean {
  return item.isAvailable && Number.isFinite(item.price) && item.price > 0
}

function cheapest(items: readonly StarterLoyaltyItem[]): StarterLoyaltyItem | null {
  return items.reduce<StarterLoyaltyItem | null>(
    (best, item) => (best === null || item.price < best.price ? item : best),
    null,
  )
}

/**
 * The cheapest available best seller: a reward customers already want that
 * costs the store the least. Without one, the cheapest paid item on the menu.
 */
function pickRewardItem(input: StarterLoyaltyInput): StarterLoyaltyItem | null {
  const rewardable = input.items.filter(isRewardable)
  const bestSellers = new Set(input.bestSellerIds)
  return cheapest(rewardable.filter((item) => bestSellers.has(item.id))) ?? cheapest(rewardable)
}

function programName(storeName: string): string {
  const store = storeName.trim()
  if (!store) return NAME_SUFFIX
  const maxStoreLength = MAX_PROGRAM_NAME - NAME_SUFFIX.length - 1
  return `${store.slice(0, maxStoreLength).trim()} ${NAME_SUFFIX}`
}

export function buildStarterLoyaltyProgram(input: StarterLoyaltyInput): StarterLoyaltyProgram | null {
  const reward = pickRewardItem(input)
  if (!reward) return null

  const itemName = reward.name.trim() || 'Free item'
  return {
    rewardItemId: reward.id,
    rewardLabel: `Free ${itemName}`,
    program: {
      name: programName(input.storeName),
      description: `Get a free ${itemName} after ${STARTER_STAMP_THRESHOLD} orders.`,
      scope: 'business',
      outletId: null,
      activatesAt: null,
      endsAt: null,
      rules: {
        earnMode: 'stamp',
        threshold: STARTER_STAMP_THRESHOLD,
        pointsPerPeso: null,
        minSpend: null,
        reward: { type: 'free_item', menuItemId: reward.id, itemName },
        rewardExpiryDays: STARTER_REWARD_EXPIRY_DAYS,
        isExclusive: true,
      },
    },
  }
}
