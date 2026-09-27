/**
 * "Ready to go" — offers the merchant can turn on with one tap.
 *
 * Built from what the store actually sells: when order history exists, from
 * what customers order together; otherwise from what each dish is (a main
 * wants a side and a drink) and the merchant's own menu order (the first side
 * they list is their signature side). Nothing here invents a number: a reason
 * cites real history or a plain rule, never a projected lift.
 *
 * Pure and deterministic — the same menu always yields the same idea ids, so a
 * dismissal survives a reload.
 */

import { classifyMenuRole, type MenuRole } from './menu-roles'
import { topPartners, type BasketStats } from './basket-stats'
import { comboRegularPrice, describeSavings, suggestComboPrice, type Savings } from './pricing'

export interface IdeaItem {
  id: string
  name: string
  price: number
  categoryId: string | null
  categoryName: string | null
  imageUrl?: string | null
  isAvailable: boolean
  isFeatured?: boolean
  /** The merchant's display order. */
  order?: number
}

export interface ExistingOffers {
  comboItemIds?: ReadonlySet<string>
  upgradeSourceIds?: ReadonlySet<string>
  pairingSourceIds?: ReadonlySet<string>
  lastCallEnabled?: boolean
}

export interface IdeaInput {
  items: readonly IdeaItem[]
  stats?: BasketStats | null
  existing?: ExistingOffers
  dismissedIds?: ReadonlySet<string>
  limit?: number
}

interface IdeaBase {
  id: string
  title: string
  reason: string
  /** Dishes to picture on the idea card, most important first. */
  itemIds: string[]
}

export interface ComboPickIdea {
  label: string
  itemIds: string[]
  /** How many the customer takes from this line; 1 when absent. */
  count?: number
}

export interface ComboIdea extends IdeaBase {
  kind: 'combo'
  name: string
  picks: ComboPickIdea[]
  regularPrice: number
  price: number
  savings: Savings | null
}

export interface UpgradeIdea extends IdeaBase {
  kind: 'upgrade'
  sourceId: string
  targetId: string
  header: string
  priceDifference: number
}

export interface PairingIdea extends IdeaBase {
  kind: 'pairing'
  sourceIds: string[]
  targetIds: string[]
  categoryName: string
}

export interface LastCallIdea extends IdeaBase {
  kind: 'last_call'
}

export type BoostIdea = ComboIdea | UpgradeIdea | PairingIdea | LastCallIdea
export type BoostIdeaKind = BoostIdea['kind']

const DEFAULT_LIMIT = 6
const MAX_COMBO_IDEAS = 2
const MAX_UPGRADE_IDEAS = 2
const MAX_PAIRING_IDEAS = 2
const MAX_PAIRING_TARGETS = 3
const MAX_LAST_CALL_ITEMS = 4
/** Fewer shared orders than this is coincidence, not a pattern. */
const MIN_ORDERS_TOGETHER = 2

const MEAL_WORDS = new Set(['meal', 'meals', 'combo', 'set', 'value', 'with', 'w', 'bundle'])
const SIZE_WORDS = new Set([
  'large', 'jumbo', 'upsize', 'grande', 'venti', 'xl', 'big', 'double', 'family',
  'party', 'bucket', 'overload', 'deluxe', 'supreme', 'plus', 'special',
])

interface RankedItem extends IdeaItem {
  role: MenuRole
  orders: number
}

interface PartnerPick {
  item: RankedItem
  share: number | null
}

type AnchorRole = 'main' | 'drink'

/**
 * What the menu is built around. Most menus sell mains, and everything else
 * rides along; a café sells drinks, and food is the add-on. Ideas anchor on
 * whichever the menu actually has, so a drinks-only café still gets ideas.
 */
function anchorRoleOf(ranked: readonly RankedItem[]): AnchorRole | null {
  if (ranked.some((item) => item.role === 'main')) return 'main'
  if (ranked.some((item) => item.role === 'drink')) return 'drink'
  return null
}

/** What rides along with the anchor, in the order a combo or pairing takes it. */
const COMPANION_ROLES: Record<AnchorRole, readonly MenuRole[]> = {
  main: ['side', 'drink', 'dessert'],
  drink: ['dessert', 'side'],
}

/** A combo of "any N" needs at least this many interchangeable choices. */
const MIN_ANY_TWO_CHOICES = 2
const MAX_ANY_TWO_CHOICES = 12

function tokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function isMealLike(name: string): boolean {
  return tokens(name).some((word) => MEAL_WORDS.has(word))
}

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}

function byPopularity(a: RankedItem, b: RankedItem): number {
  return (
    b.orders - a.orders ||
    Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false) ||
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id)
  )
}

function rankItems(items: readonly IdeaItem[], stats: BasketStats | null | undefined): RankedItem[] {
  return items
    .filter((item) => item.isAvailable && item.price >= 0)
    .map((item) => ({
      ...item,
      role: classifyMenuRole({ categoryName: item.categoryName, itemName: item.name }),
      orders: stats?.itemOrders.get(item.id) ?? 0,
    }))
    .sort(byPopularity)
}

/** The candidate customers most often add to `anchor`, else the top-ranked one. */
function pickPartner(
  anchor: RankedItem,
  candidates: readonly RankedItem[],
  stats: BasketStats | null | undefined
): PartnerPick | null {
  if (candidates.length === 0) return null
  if (stats) {
    const ids = new Set(candidates.map((c) => c.id))
    const [best] = topPartners(stats, anchor.id, {
      limit: 1,
      filter: (id) => ids.has(id),
      minTogether: MIN_ORDERS_TOGETHER,
    })
    const match = best && candidates.find((c) => c.id === best.itemId)
    if (match) return { item: match, share: best.share }
  }
  return { item: candidates[0], share: null }
}

function buildAnchoredCombo(
  anchor: RankedItem,
  anchorRole: AnchorRole,
  ranked: readonly RankedItem[],
  stats: BasketStats | null | undefined
): ComboIdea | null {
  // A meal takes a side AND a drink; a drink takes one thing to eat.
  const partnerRoles = anchorRole === 'main' ? (['side', 'drink'] as const) : (['dessert', 'side'] as const)
  const partners: { label: string; pick: PartnerPick }[] = []
  for (const role of partnerRoles) {
    const pick = pickPartner(anchor, ranked.filter((i) => i.role === role), stats)
    if (pick) partners.push({ label: role.charAt(0).toUpperCase() + role.slice(1), pick })
    if (anchorRole === 'drink' && partners.length > 0) break
  }
  if (partners.length === 0) return null

  const parts = [{ label: anchor.name, item: anchor }, ...partners.map((p) => ({ label: p.label, item: p.pick.item }))]
  const regularPrice = comboRegularPrice(parts.map((p) => ({ prices: [p.item.price], count: 1 })))
  const price = suggestComboPrice(regularPrice)
  const name = anchorRole === 'main' ? `${anchor.name} Meal` : `${anchor.name} + ${partners[0].pick.item.name}`

  const historyPick = partners.map((p) => p.pick).find((p) => p.share != null)
  const reason = historyPick?.share != null
    ? `${historyPick.item.name} is ordered together with ${anchor.name} in ${Math.round(historyPick.share * 100)}% of its orders`
    : anchorRole === 'drink'
      ? 'A drink and something to eat at one easy price'
      : partners.length > 1
        ? 'A main, a side and a drink at one easy price — the combo customers expect'
        : `${anchor.name} with a ${partners[0].label.toLowerCase()} at one easy price`

  return {
    kind: 'combo',
    id: `combo:${parts.map((p) => p.item.id).join(':')}`,
    title: name,
    reason,
    itemIds: parts.map((p) => p.item.id),
    name,
    picks: parts.map((p) => ({ label: p.label, itemIds: [p.item.id] })),
    regularPrice,
    price,
    savings: describeSavings(regularPrice, price),
  }
}

/**
 * "Any 2 Frappes" — for a menu with nothing to pair (a drinks-only café).
 * Choices are the category's most common price, so no pick costs the store
 * more than the price the deal was worked out from.
 */
function buildAnyTwoCombos(anchors: readonly RankedItem[], limit: number): ComboIdea[] {
  const byCategory = new Map<string, RankedItem[]>()
  for (const item of anchors) {
    if (!item.categoryId) continue
    byCategory.set(item.categoryId, [...(byCategory.get(item.categoryId) ?? []), item])
  }

  const groups = [...byCategory.values()].flatMap((items) => {
    const byPrice = new Map<number, RankedItem[]>()
    for (const item of items) byPrice.set(item.price, [...(byPrice.get(item.price) ?? []), item])
    const [best] = [...byPrice.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    return best && best[1].length >= MIN_ANY_TWO_CHOICES && best[0] > 0 ? [{ price: best[0], items: best[1] }] : []
  })

  return groups
    .sort((a, b) => b.items.length - a.items.length || byPopularity(a.items[0], b.items[0]))
    .slice(0, limit)
    .map(({ price: unitPrice, items }) => {
      const choices = items.slice(0, MAX_ANY_TWO_CHOICES)
      const categoryName = choices[0].categoryName ?? 'favourites'
      const regularPrice = unitPrice * 2
      const price = suggestComboPrice(regularPrice)
      const ids = choices.map((i) => i.id).sort()
      return {
        kind: 'combo' as const,
        id: `combo:any2:${ids.join(':')}`,
        title: `Any 2 ${categoryName}`,
        reason: `Two of the same-priced ${categoryName.toLowerCase()} for less — the easiest reason to order a second`,
        itemIds: choices.slice(0, 3).map((i) => i.id),
        name: `Any 2 ${categoryName}`,
        picks: [{ label: categoryName, itemIds: ids, count: 2 }],
        regularPrice,
        price,
        savings: describeSavings(regularPrice, price),
      }
    })
}

function buildComboIdeas(ranked: readonly RankedItem[], input: IdeaInput): ComboIdea[] {
  const anchorRole = anchorRoleOf(ranked)
  if (!anchorRole) return []
  const taken = input.existing?.comboItemIds ?? new Set<string>()
  const anchors = ranked.filter((i) => i.role === anchorRole && !isMealLike(i.name) && !taken.has(i.id))

  const anchored = anchors
    .map((anchor) => buildAnchoredCombo(anchor, anchorRole, ranked, input.stats))
    .filter((idea): idea is ComboIdea => idea !== null)
    .slice(0, MAX_COMBO_IDEAS)
  if (anchored.length > 0) return anchored
  return buildAnyTwoCombos(anchors, MAX_COMBO_IDEAS)
}

function upgradeHeader(extraWords: readonly string[]): string {
  if (extraWords.some((w) => MEAL_WORDS.has(w))) return 'Make it a meal?'
  if (extraWords.some((w) => SIZE_WORDS.has(w))) return 'Go bigger?'
  return 'Upgrade it?'
}

function buildUpgradeIdeas(ranked: readonly RankedItem[], input: IdeaInput): UpgradeIdea[] {
  const taken = input.existing?.upgradeSourceIds ?? new Set<string>()
  const ideas: UpgradeIdea[] = []

  for (const source of ranked) {
    if (ideas.length >= MAX_UPGRADE_IDEAS) break
    if (taken.has(source.id)) continue
    const sourceWords = new Set(tokens(source.name))
    if (sourceWords.size === 0) continue

    const candidates = ranked
      .filter((target) => target.id !== source.id && target.price > source.price)
      .map((target) => {
        const words = tokens(target.name)
        const extra = words.filter((w) => !sourceWords.has(w))
        const containsSource = [...sourceWords].every((w) => words.includes(w))
        const isUpgrade = extra.some((w) => MEAL_WORDS.has(w) || SIZE_WORDS.has(w))
        return containsSource && isUpgrade ? { target, extra } : null
      })
      .filter((c): c is { target: RankedItem; extra: string[] } => c !== null)
      .sort((a, b) => a.target.price - b.target.price || byPopularity(a.target, b.target))

    const best = candidates[0]
    if (!best) continue
    const difference = best.target.price - source.price
    ideas.push({
      kind: 'upgrade',
      id: `upgrade:${source.id}:${best.target.id}`,
      title: `${source.name} → ${best.target.name}`,
      reason: `${best.target.name} is the bigger version of ${source.name}, for ${peso(difference)} more`,
      itemIds: [source.id, best.target.id],
      sourceId: source.id,
      targetId: best.target.id,
      header: upgradeHeader(best.extra),
      priceDifference: difference,
    })
  }

  return ideas
}

interface CategoryGroup {
  categoryId: string
  categoryName: string
  mains: RankedItem[]
  orders: number
}

function groupAnchorsByCategory(
  ranked: readonly RankedItem[],
  anchorRole: AnchorRole,
  taken: ReadonlySet<string>
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>()
  for (const item of ranked) {
    if (item.role !== anchorRole || !item.categoryId || taken.has(item.id)) continue
    const group = groups.get(item.categoryId) ?? {
      categoryId: item.categoryId,
      categoryName: item.categoryName ?? 'these dishes',
      mains: [],
      orders: 0,
    }
    groups.set(item.categoryId, { ...group, mains: [...group.mains, item], orders: group.orders + item.orders })
  }
  return [...groups.values()].sort(
    (a, b) => b.orders - a.orders || byPopularity(a.mains[0], b.mains[0])
  )
}

function pairingTargets(
  group: CategoryGroup,
  extras: readonly RankedItem[],
  fillRoles: readonly MenuRole[],
  stats: BasketStats | null | undefined
) {
  const sourceIds = new Set(group.mains.map((m) => m.id))
  const extraIds = new Set(extras.map((e) => e.id))
  const fromHistory = new Map<string, number>()

  if (stats) {
    for (const main of group.mains) {
      for (const partner of topPartners(stats, main.id, {
        limit: MAX_PAIRING_TARGETS * 2,
        filter: (id) => extraIds.has(id) && !sourceIds.has(id),
        minTogether: MIN_ORDERS_TOGETHER,
      })) {
        fromHistory.set(partner.itemId, (fromHistory.get(partner.itemId) ?? 0) + partner.together)
      }
    }
  }

  const chosen = [...fromHistory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
    .slice(0, MAX_PAIRING_TARGETS)
  const usedHistory = chosen.length > 0

  // Fill with one of each role the history did not cover, e.g. a drink, a side, a dessert.
  for (const role of fillRoles) {
    if (chosen.length >= MAX_PAIRING_TARGETS) break
    const coveredRoles = new Set(chosen.map((id) => extras.find((e) => e.id === id)?.role))
    if (coveredRoles.has(role)) continue
    const pick = extras.find((e) => e.role === role && !chosen.includes(e.id))
    if (pick) chosen.push(pick.id)
  }

  return { targetIds: chosen, usedHistory }
}

function buildPairingIdeas(ranked: readonly RankedItem[], input: IdeaInput): PairingIdea[] {
  const anchorRole = anchorRoleOf(ranked)
  if (!anchorRole) return []
  const companionRoles = COMPANION_ROLES[anchorRole]
  const extras = ranked.filter((i) => companionRoles.includes(i.role))
  if (extras.length === 0) return []
  const byName = new Map(ranked.map((i) => [i.id, i.name]))
  const fillRoles = anchorRole === 'main' ? (['drink', 'side', 'dessert'] as const) : companionRoles

  return groupAnchorsByCategory(ranked, anchorRole, input.existing?.pairingSourceIds ?? new Set())
    .slice(0, MAX_PAIRING_IDEAS)
    .flatMap((group): PairingIdea[] => {
      const { targetIds, usedHistory } = pairingTargets(group, extras, fillRoles, input.stats)
      if (targetIds.length === 0) return []
      const sourceIds = group.mains.map((m) => m.id).sort()
      const names = targetIds.map((id) => byName.get(id)).filter(Boolean).join(', ')
      return [{
        kind: 'pairing',
        id: `pairing:${group.categoryId}:${targetIds.join(',')}`,
        title: `After ${group.categoryName}, suggest ${names}`,
        reason: usedHistory
          ? `What ${group.categoryName} customers add most often`
          : anchorRole === 'main'
            ? 'A drink, a side or a dessert is the easiest yes right after a main'
            : 'Something to eat is the easiest yes right after a drink',
        itemIds: [group.mains[0].id, ...targetIds],
        sourceIds,
        targetIds,
        categoryName: group.categoryName,
      }]
    })
}

function buildLastCallIdea(ranked: readonly RankedItem[], input: IdeaInput): LastCallIdea[] {
  if (input.existing?.lastCallEnabled) return []
  const quickAdds = ranked
    .filter((i) => i.role === 'drink' || i.role === 'dessert' || i.role === 'side')
    .slice(0, MAX_LAST_CALL_ITEMS)
  if (quickAdds.length === 0) return []
  return [{
    kind: 'last_call',
    id: 'last_call',
    title: 'Add to your order',
    reason: 'A row of quick add-ons in the cart, right before checkout — picked for each cart automatically',
    itemIds: quickAdds.map((i) => i.id),
  }]
}

/** Alternate kinds so the first few cards show the range, not three combos. */
function interleave(lists: readonly (readonly BoostIdea[])[]): BoostIdea[] {
  const out: BoostIdea[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let round = 0; round < longest; round += 1) {
    for (const list of lists) {
      if (list[round]) out.push(list[round])
    }
  }
  return out
}

export function buildBoostIdeas(input: IdeaInput): BoostIdea[] {
  const ranked = rankItems(input.items, input.stats)
  if (ranked.length === 0) return []

  const all = interleave([
    buildComboIdeas(ranked, input),
    buildPairingIdeas(ranked, input),
    buildUpgradeIdeas(ranked, input),
    buildLastCallIdea(ranked, input),
  ])
  const dismissed = input.dismissedIds ?? new Set<string>()
  return all.filter((idea) => !dismissed.has(idea.id)).slice(0, input.limit ?? DEFAULT_LIMIT)
}
