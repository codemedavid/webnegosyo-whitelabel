/**
 * One-line title and detail for an offer idea, in the merchant's words.
 *
 * Shared by the Boost Sales screen and the merchant app's AI offer ideas
 * (served by `/api/boost/ai`), so an idea reads the same on both. Pure: the
 * caller passes whatever item lookup it has; only `name` is read.
 */

import type { BoostIdea } from './ideas'

export type NamedItemLookup = ReadonlyMap<string, { name: string }>

const UNKNOWN_ITEM = 'an item no longer on the menu'

export function peso(amount: number, hideSymbol = false): string {
  const rounded = Math.round(amount * 100) / 100
  const text = rounded.toLocaleString('en-PH', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return hideSymbol ? text : `₱${text}`
}

export function listNames(ids: readonly string[], items: NamedItemLookup, max = 3): string {
  const names = ids.map((id) => items.get(id)?.name).filter((name): name is string => !!name)
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`
}

function nameOf(id: string, items: NamedItemLookup): string {
  return items.get(id)?.name ?? UNKNOWN_ITEM
}

export function describeIdea(idea: BoostIdea, itemsById: NamedItemLookup): { title: string; detail: string } {
  switch (idea.kind) {
    case 'combo':
      return {
        title: idea.name,
        detail: [
          idea.picks
            .map((pick) => (pick.itemIds.length > 1
              ? `any ${pick.count ?? 1} ${pick.label.toLowerCase()}`
              : itemsById.get(pick.itemIds[0])?.name ?? pick.label))
            .join(' + '),
          `${peso(idea.price)}${idea.savings ? `, saves ${peso(idea.savings.amount)}` : ''}`,
        ].join(' · '),
      }
    case 'upgrade':
      return {
        title: `${nameOf(idea.sourceId, itemsById)} → ${nameOf(idea.targetId, itemsById)}`,
        detail: `“${idea.header}” · +${peso(idea.priceDifference)} each time`,
      }
    case 'pairing':
      return {
        title: `After any ${idea.categoryName}`,
        detail: `Suggest ${listNames(idea.targetIds, itemsById)}`,
      }
    case 'last_call':
      return idea.settings
        ? { title: `“${idea.settings.title}” in the cart`, detail: `Show ${listNames(idea.settings.pickedItemIds, itemsById)}` }
        : { title: 'Quick add-ons in the cart', detail: 'Picked for each cart automatically' }
  }
}
