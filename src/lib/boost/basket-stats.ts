/**
 * "What do people order together?" — counted from real order baskets.
 *
 * Counts ORDERS, not lines: a basket holding two burgers is one burger order,
 * so a party order cannot outweigh twenty ordinary ones.
 */

export interface BasketStats {
  orderCount: number
  /** Orders containing the item. */
  itemOrders: ReadonlyMap<string, number>
  /** Orders containing both items, keyed by `pairKey`. */
  pairOrders: ReadonlyMap<string, number>
}

export interface Partner {
  itemId: string
  /** Orders that contain both the anchor and this item. */
  together: number
  /** together / orders containing the anchor, 0–1. */
  share: number
}

export interface TopPartnersOptions {
  limit: number
  exclude?: ReadonlySet<string>
  filter?: (itemId: string) => boolean
  minTogether?: number
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function buildBasketStats(baskets: readonly (readonly string[])[]): BasketStats {
  const itemOrders = new Map<string, number>()
  const pairOrders = new Map<string, number>()
  let orderCount = 0

  for (const basket of baskets) {
    const unique = [...new Set(basket)].sort()
    if (unique.length === 0) continue
    orderCount += 1
    for (let i = 0; i < unique.length; i += 1) {
      itemOrders.set(unique[i], (itemOrders.get(unique[i]) ?? 0) + 1)
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = pairKey(unique[i], unique[j])
        pairOrders.set(key, (pairOrders.get(key) ?? 0) + 1)
      }
    }
  }

  return { orderCount, itemOrders, pairOrders }
}

export function ordersTogether(stats: BasketStats, a: string, b: string): number {
  return stats.pairOrders.get(pairKey(a, b)) ?? 0
}

export function topPartners(stats: BasketStats, itemId: string, options: TopPartnersOptions): Partner[] {
  const anchorOrders = stats.itemOrders.get(itemId) ?? 0
  if (anchorOrders === 0) return []
  const minTogether = options.minTogether ?? 1

  const partners: Partner[] = []
  for (const [key, together] of stats.pairOrders) {
    if (together < minTogether) continue
    const [a, b] = key.split('|')
    if (a !== itemId && b !== itemId) continue
    const other = a === itemId ? b : a
    if (options.exclude?.has(other)) continue
    if (options.filter && !options.filter(other)) continue
    partners.push({ itemId: other, together, share: together / anchorOrders })
  }

  return partners
    .sort((x, y) => y.together - x.together || x.itemId.localeCompare(y.itemId))
    .slice(0, options.limit)
}
