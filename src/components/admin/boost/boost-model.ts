import { ArrowUpRight, LayoutGrid, Plus, ShoppingBag, type LucideIcon } from 'lucide-react'
import type { BoostItem } from '@/lib/boost/workspace'
import type { BoostIdea } from '@/lib/boost/ideas'

/**
 * The four moments of the diner's journey. Every offer lives at exactly one,
 * and this order is the order the diner meets them — the organising spine of
 * the whole Boost Sales screen.
 */
export type BoostMoment = 'menu' | 'item' | 'added' | 'cart'
export type OfferKind = 'combo' | 'upgrade' | 'pairing' | 'last_call'

export interface MomentMeta {
  id: BoostMoment
  kind: OfferKind
  /** Where the diner meets it. */
  place: string
  /** What the merchant calls the offer. */
  offer: string
  /** One sentence, in the diner's terms. */
  blurb: string
  icon: LucideIcon
  addLabel: string
}

export const BOOST_MOMENTS: readonly MomentMeta[] = [
  {
    id: 'menu',
    kind: 'combo',
    place: 'On the menu',
    offer: 'Combos',
    blurb: 'Meal deals at one price, with their own cards at the top of your menu.',
    icon: LayoutGrid,
    addLabel: 'New combo',
  },
  {
    id: 'item',
    kind: 'upgrade',
    place: 'On the item page',
    offer: 'Upgrades',
    blurb: '“Make it a meal?” offered while they are choosing — never as a pop-up.',
    icon: ArrowUpRight,
    addLabel: 'New upgrade',
  },
  {
    id: 'added',
    kind: 'pairing',
    place: 'Right after adding',
    offer: 'Pairings',
    blurb: '“Goes well with” — a side, drink or dessert, one tap to add.',
    icon: Plus,
    addLabel: 'New pairing',
  },
  {
    id: 'cart',
    kind: 'last_call',
    place: 'In the cart',
    offer: 'Last call',
    blurb: 'A row of quick add-ons in the cart, right before checkout.',
    icon: ShoppingBag,
    addLabel: 'Set up',
  },
] as const

export const MOMENT_BY_KIND: Record<OfferKind, MomentMeta> = Object.fromEntries(
  BOOST_MOMENTS.map((moment) => [moment.kind, moment])
) as Record<OfferKind, MomentMeta>

/** What the editor sheet is working on. */
export type EditorTarget =
  | { kind: 'choose' }
  | { kind: 'combo'; comboId: string | null; fromIdea?: BoostIdea }
  | { kind: 'upgrade'; upgradeId: string | null; fromIdea?: BoostIdea }
  | { kind: 'pairing'; groupKey: string | null; fromIdea?: BoostIdea }
  | { kind: 'last_call' }

export type ItemLookup = ReadonlyMap<string, BoostItem>

export function peso(amount: number, hideSymbol = false): string {
  const rounded = Math.round(amount * 100) / 100
  const text = rounded.toLocaleString('en-PH', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return hideSymbol ? text : `₱${text}`
}

export function listNames(ids: readonly string[], items: ItemLookup, max = 3): string {
  const names = ids.map((id) => items.get(id)?.name).filter((name): name is string => !!name)
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`
}
