/**
 * BCG menu-engineering classification, computed from real sales.
 *
 * Pure: menu + measured performance in, a quadrant per item out. The DB writes
 * live in `menu-engineering-service.ts`; the MCP op proposes with this module
 * first and only writes after the proposal is accepted.
 *
 * Two honesty constraints shape the whole file.
 *
 * PROFITABILITY IS USUALLY A GUESS. `menu_items` has no cost column, so true
 * contribution margin is unknowable unless the caller supplies costs. Without
 * them the profitability axis ranks items by PRICE, which is a different claim
 * entirely — a ₱500 steak with a ₱450 protein cost earns less than a ₱100 rice
 * bowl. So the basis is reported on every result and a partially-costed menu
 * falls back rather than mixing two scales on one axis.
 *
 * SILENCE IS NOT A ZERO. An item with no recorded sales and an item whose sales
 * the read could not see look identical here. When `coverage.complete` is false
 * the whole menu comes back `unclassified` with `canApply: false`, because the
 * alternative is labelling a busy restaurant's entire menu a dog.
 */

import type { BcgClassification } from '@/types/database'
import type { MenuPerformance } from '@/lib/queries/menu-performance-merge'

/** The menu-item fields classification needs. Structural, so tests stay plain. */
export interface ClassifiableItem {
  id: string
  name: string
  price: number
  categoryId?: string | null
}

export type MarginBasis = 'cost' | 'price_proxy'

export interface ItemClassification {
  itemId: string
  name: string
  classification: BcgClassification
  units: number
  revenue: number
  unitShare: number
  /** The share this item would hold if every item sold equally, × the 70% rule. */
  expectedShare: number
  isPopular: boolean
  isProfitable: boolean
  /** Price − cost when costs are known; otherwise the price itself. */
  contributionMargin: number
  averageContributionMargin: number
  reason: string
}

export interface MenuClassification {
  marginBasis: MarginBasis
  items: ItemClassification[]
  /** False when the evidence is too weak to write these classifications. */
  canApply: boolean
  warnings: string[]
}

export interface ClassifyMenuParams {
  items: readonly ClassifiableItem[]
  performance: MenuPerformance
  /** itemId → unit cost. Partial coverage is ignored (see marginBasis). */
  costs?: Record<string, number>
  /** Fraction of fair share an item must reach to count as popular. */
  popularityThreshold?: number
}

/**
 * Kasavana–Smith's 70% rule: an item is "popular" once it reaches 70% of the
 * share it would hold if every item sold equally. Using a plain average instead
 * would force exactly half the menu below the line by construction.
 */
const POPULARITY_THRESHOLD = 0.7

/**
 * Below this many units the window is anecdote, not evidence: a handful of
 * orders can make any item look like a star or a dog.
 */
const MIN_UNITS_TO_CLASSIFY = 20

function unclassified(
  item: ClassifiableItem,
  units: number,
  revenue: number,
  reason: string,
): ItemClassification {
  return {
    itemId: item.id,
    name: item.name,
    classification: 'unclassified',
    units,
    revenue,
    unitShare: 0,
    expectedShare: 0,
    isPopular: false,
    isProfitable: false,
    contributionMargin: 0,
    averageContributionMargin: 0,
    reason,
  }
}

/** star / plowhorse / puzzle / dog from the two axes. */
function quadrant(isPopular: boolean, isProfitable: boolean): BcgClassification {
  if (isPopular) return isProfitable ? 'star' : 'plowhorse'
  return isProfitable ? 'puzzle' : 'dog'
}

function describe(
  classification: BcgClassification,
  unitShare: number,
  expectedShare: number,
  margin: number,
  averageMargin: number,
  basis: MarginBasis,
): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const axis = basis === 'cost' ? 'contribution margin' : 'price (proxy for margin — no cost data)'
  return (
    `${classification}: ${pct(unitShare)} of units against a ${pct(expectedShare)} bar, ` +
    `and a ${axis} of ${margin.toFixed(2)} against a menu average of ${averageMargin.toFixed(2)}.`
  )
}

/**
 * True only when EVERY item has a usable cost. A half-costed menu would compare
 * real margins against prices on the same axis, which is worse than admitting
 * the proxy.
 */
function costsCoverEveryItem(
  items: readonly ClassifiableItem[],
  costs: Record<string, number> | undefined,
): boolean {
  if (!costs || items.length === 0) return false
  return items.every((item) => {
    const cost = costs[item.id]
    return typeof cost === 'number' && Number.isFinite(cost)
  })
}

/** Classify a menu against measured sales. Never mutates its inputs. */
export function classifyMenu({
  items,
  performance,
  costs,
  popularityThreshold = POPULARITY_THRESHOLD,
}: ClassifyMenuParams): MenuClassification {
  const warnings: string[] = []
  const salesByItem = new Map(performance.items.map((i) => [i.itemId ?? '', i]))
  const soldOf = (id: string) => salesByItem.get(id)

  const hasFullCosts = costsCoverEveryItem(items, costs)
  const marginBasis: MarginBasis = hasFullCosts ? 'cost' : 'price_proxy'

  if (!hasFullCosts) {
    warnings.push(
      costs && Object.keys(costs).length > 0
        ? 'Costs were supplied for only some items, so ALL items were ranked by price instead. Profitability here is a price proxy, not a real margin — supply a cost for every item to get true contribution margins.'
        : 'No item costs were supplied, so profitability is ranked by PRICE as a proxy. A high-priced dish with a high food cost will be overrated. Treat these margins as indicative, not accounting.',
    )
  }

  // Refuse before computing anything: a blind or thin read must not produce a
  // menu-wide verdict, however plausible the arithmetic would look.
  if (!performance.coverage.complete) {
    warnings.push(
      `Sales data is incomplete (${performance.coverage.note ?? 'unknown reason'}), so nothing was classified. ` +
        'This is an absence of evidence, not proof that items sold nothing.',
    )
    return {
      marginBasis,
      items: items.map((i) =>
        unclassified(i, soldOf(i.id)?.units ?? 0, soldOf(i.id)?.revenue ?? 0, 'Not classified: the sales read was incomplete.'),
      ),
      canApply: false,
      warnings,
    }
  }

  if (items.length === 0) {
    warnings.push('The menu has no items to classify.')
    return { marginBasis, items: [], canApply: false, warnings }
  }

  if (performance.totalUnits < MIN_UNITS_TO_CLASSIFY) {
    warnings.push(
      `Only ${performance.totalUnits} units sold in the last ${performance.windowDays} days — too few to classify a menu ` +
        `(minimum ${MIN_UNITS_TO_CLASSIFY}). Widen the window or wait for more orders.`,
    )
    return {
      marginBasis,
      items: items.map((i) =>
        unclassified(i, soldOf(i.id)?.units ?? 0, soldOf(i.id)?.revenue ?? 0, 'Not classified: too few sales in the window.'),
      ),
      canApply: false,
      warnings,
    }
  }

  const marginOf = (item: ClassifiableItem): number =>
    hasFullCosts ? item.price - (costs?.[item.id] ?? 0) : item.price

  const averageMargin = items.reduce((sum, i) => sum + marginOf(i), 0) / items.length
  const expectedShare = (1 / items.length) * popularityThreshold

  const classified = items.map((item) => {
    const sold = soldOf(item.id)
    const units = sold?.units ?? 0
    const revenue = sold?.revenue ?? 0
    const unitShare = performance.totalUnits > 0 ? units / performance.totalUnits : 0
    const margin = marginOf(item)

    const isPopular = unitShare >= expectedShare
    const isProfitable = margin >= averageMargin
    const classification = quadrant(isPopular, isProfitable)

    return {
      itemId: item.id,
      name: item.name,
      classification,
      units,
      revenue,
      unitShare,
      expectedShare,
      isPopular,
      isProfitable,
      contributionMargin: margin,
      averageContributionMargin: averageMargin,
      reason: describe(classification, unitShare, expectedShare, margin, averageMargin, marginBasis),
    }
  })

  return { marginBasis, items: classified, canApply: true, warnings }
}
