/**
 * The PII-free snapshot the AI reads: the menu, what sells, what is ordered
 * together, and what is already set up.
 *
 * Items travel as short refs ("i12"), never UUIDs — models garble long ids,
 * and a garbled id must fail validation rather than point at another dish.
 * `refToId` maps them back.
 */

import type { MenuRole } from '../menu-roles'
import type { PickedTogetherPair } from '../pair-insights'

export interface AiFactItem {
  id: string
  name: string
  price: number
  categoryName: string | null
  role: MenuRole
  /** Orders containing the item in the read window. */
  orders: number
  isAvailable: boolean
}

export interface AiExistingOffers {
  /** Each combo's items. */
  combos: readonly (readonly string[])[]
  upgrades: readonly { sourceId: string; targetId: string }[]
  pairingSourceIds: readonly string[]
  lastCallEnabled: boolean
}

export interface AiFactsInput {
  items: readonly AiFactItem[]
  pairs: readonly PickedTogetherPair[]
  orderCount: number
  /** e.g. "last 90 days" — said to the model so reasons cite the right window. */
  windowLabel: string
  existing: AiExistingOffers
}

export interface AiFactsPayload {
  orders: { count: number; window: string }
  items: { ref: string; name: string; price: number; category: string; role: MenuRole; orders: number }[]
  pickedTogether: { a: string; b: string; together: number; aShare: number; bShare: number; lift: number }[]
  existing: {
    combos: string[][]
    upgrades: { from: string; to: string }[]
    pairedItems: string[]
    lastCallOn: boolean
  }
}

export interface BoostAiFacts {
  payload: AiFactsPayload
  refToId: Record<string, string>
}

/** Keeps the prompt small on huge menus; the best sellers matter most. */
export const MAX_FACT_ITEMS = 150
export const MAX_FACT_PAIRS = 40

function percent(value: number): number {
  return Math.round(value * 100)
}

export function buildBoostAiFacts(input: AiFactsInput): BoostAiFacts {
  const chosen = input.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.isAvailable && item.price >= 0)
    .sort((a, b) => b.item.orders - a.item.orders || a.index - b.index)
    .slice(0, MAX_FACT_ITEMS)
    .map(({ item }) => item)

  const refToId: Record<string, string> = {}
  const idToRef = new Map<string, string>()
  chosen.forEach((item, index) => {
    const ref = `i${index + 1}`
    refToId[ref] = item.id
    idToRef.set(item.id, ref)
  })

  const refsOf = (ids: readonly string[]) =>
    ids.map((id) => idToRef.get(id)).filter((ref): ref is string => !!ref)

  const pickedTogether = input.pairs
    .filter((pair) => idToRef.has(pair.anchorId) && idToRef.has(pair.partnerId))
    .slice(0, MAX_FACT_PAIRS)
    .map((pair) => ({
      a: idToRef.get(pair.anchorId) as string,
      b: idToRef.get(pair.partnerId) as string,
      together: pair.together,
      aShare: percent(pair.share),
      bShare: percent(pair.reverseShare),
      lift: pair.lift,
    }))

  return {
    refToId,
    payload: {
      orders: { count: input.orderCount, window: input.windowLabel },
      items: chosen.map((item) => ({
        ref: idToRef.get(item.id) as string,
        name: item.name,
        price: item.price,
        category: item.categoryName ?? 'Uncategorised',
        role: item.role,
        orders: item.orders,
      })),
      pickedTogether,
      existing: {
        combos: input.existing.combos.map(refsOf).filter((refs) => refs.length > 0),
        upgrades: input.existing.upgrades
          .filter((u) => idToRef.has(u.sourceId) && idToRef.has(u.targetId))
          .map((u) => ({ from: idToRef.get(u.sourceId) as string, to: idToRef.get(u.targetId) as string })),
        pairedItems: refsOf(input.existing.pairingSourceIds),
        lastCallOn: input.existing.lastCallEnabled,
      },
    },
  }
}
