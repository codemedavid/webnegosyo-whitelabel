/**
 * The combo editor's model: "picks" in the merchant's words, converted to and
 * from the stored bundle/slot shape.
 *
 * A pick is one line of the combo — "1 × Burger" or "1 × any drink (Coke,
 * Iced Tea)". It becomes one `bundle_slots` row with an explicit item list, so
 * the merchant never meets "slots", "pick counts" or "price overrides".
 */

import type { BundleInput } from '@/lib/bundles-service'
import type { BundleWithSlots } from '@/types/database'
import type { ComboIdea } from './ideas'
import type { MenuRole } from './menu-roles'
import { comboRegularPrice } from './pricing'

export interface ComboDraftItem {
  id: string
  name: string
  price: number
  categoryId: string | null
  categoryName: string | null
  role: MenuRole
}

export interface ComboPickDraft {
  key: string
  /** What the customer sees for this line, e.g. "Drink". */
  label: string
  itemIds: string[]
  /** How many the customer takes from this line. */
  count: number
  /** Extra charge per choice, e.g. { largeFriesId: 20 }. */
  surcharges: Record<string, number>
}

export type ComboPriceMode = 'fixed' | 'percent'

export interface ComboDraft {
  name: string
  description: string
  imageUrl: string
  picks: ComboPickDraft[]
  priceMode: ComboPriceMode
  /** Kept as typed text so the field can be empty while editing. */
  price: string
  percent: string
  showOnMenu: boolean
  showAsSuggestion: boolean
  isActive: boolean
}

export type ComboDraftErrors = Partial<Record<'name' | 'picks' | 'price', string>>

export type ComboDraftResult =
  | { ok: true; input: BundleInput }
  | { ok: false; errors: ComboDraftErrors }

type ItemLookup = ReadonlyMap<string, ComboDraftItem>

const DEFAULT_PERCENT = '10'
const MIN_NAME_LENGTH = 2

let keySeed = 0
export function newPickKey(): string {
  keySeed += 1
  return `pick-${Date.now().toString(36)}-${keySeed}`
}

export function emptyComboDraft(): ComboDraft {
  return {
    name: '',
    description: '',
    imageUrl: '',
    picks: [],
    priceMode: 'fixed',
    price: '',
    percent: DEFAULT_PERCENT,
    showOnMenu: true,
    showAsSuggestion: true,
    isActive: true,
  }
}

function knownIds(ids: readonly string[], items: ItemLookup): string[] {
  return ids.filter((id) => items.has(id))
}

function parseAmount(text: string): number | null {
  if (!text.trim()) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function comboDraftRegularPrice(draft: ComboDraft, items: ItemLookup): number {
  return comboRegularPrice(
    draft.picks.map((pick) => ({
      prices: knownIds(pick.itemIds, items).map((id) => items.get(id)?.price ?? 0),
      count: pick.count,
    }))
  )
}

/** What the customer pays for the base combo; null while the price is unset. */
export function comboDraftPrice(draft: ComboDraft, items: ItemLookup): number | null {
  if (draft.priceMode === 'fixed') return parseAmount(draft.price)
  const percent = parseAmount(draft.percent)
  if (percent === null) return null
  const regular = comboDraftRegularPrice(draft, items)
  return Math.round(regular * (1 - Math.min(Math.max(percent, 0), 100) / 100) * 100) / 100
}

function validatePicks(draft: ComboDraft, items: ItemLookup): string | undefined {
  if (draft.picks.length === 0) return 'Add at least one item to the combo'
  for (const pick of draft.picks) {
    const ids = knownIds(pick.itemIds, items)
    if (ids.length === 0) return 'Every line of the combo needs at least one item'
    if (!ids.some((id) => items.get(id)?.categoryId)) {
      const name = items.get(ids[0])?.name ?? 'This item'
      return `${name} has no category yet — put it in a category on your Menu page first`
    }
  }
  return undefined
}

function validatePrice(draft: ComboDraft, items: ItemLookup): string | undefined {
  if (draft.priceMode === 'percent') {
    const percent = parseAmount(draft.percent)
    if (percent === null || percent < 1 || percent > 100) return 'Pick a discount between 1% and 100%'
    return undefined
  }
  const price = parseAmount(draft.price)
  if (price === null || price < 0) return 'Set the combo price'
  const regular = comboDraftRegularPrice(draft, items)
  if (regular > 0 && price > regular) {
    return `That is more than ordering separately (₱${regular.toLocaleString('en-PH')}), so nobody saves`
  }
  return undefined
}

export function comboDraftToInput(draft: ComboDraft, items: ItemLookup): ComboDraftResult {
  const errors: ComboDraftErrors = {}
  if (draft.name.trim().length < MIN_NAME_LENGTH) errors.name = 'Give your combo a name'
  const picksError = validatePicks(draft, items)
  if (picksError) errors.picks = picksError
  const priceError = validatePrice(draft, items)
  if (priceError) errors.price = priceError
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const isFixed = draft.priceMode === 'fixed'
  return {
    ok: true,
    input: {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      image_url: draft.imageUrl.trim(),
      pricing_type: isFixed ? 'fixed' : 'discount',
      fixed_price: isFixed ? parseAmount(draft.price) : null,
      discount_percent: isFixed ? null : parseAmount(draft.percent),
      is_active: draft.isActive,
      show_on_menu: draft.showOnMenu,
      show_as_upsell: draft.showAsSuggestion,
      display_order: 0,
      slots: draft.picks.map((pick, index) => {
        const ids = knownIds(pick.itemIds, items)
        const categoryId = ids.map((id) => items.get(id)?.categoryId).find(Boolean) as string
        return {
          name: pick.label.trim() || items.get(ids[0])?.name || `Choice ${index + 1}`,
          category_id: categoryId,
          pick_count: Math.max(1, Math.round(pick.count)),
          sort_order: index,
          included_item_ids: ids,
          price_overrides: ids
            .filter((id) => (pick.surcharges[id] ?? 0) > 0)
            .map((id) => ({ menu_item_id: id, price_override: pick.surcharges[id] })),
        }
      }),
    },
  }
}

export function comboDraftFromBundle(bundle: BundleWithSlots, items: readonly ComboDraftItem[]): ComboDraft {
  const lookup = new Map(items.map((item) => [item.id, item]))
  const slots = [...(bundle.slots ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const isFixed = bundle.pricing_type !== 'discount'

  return {
    name: bundle.name ?? '',
    description: bundle.description ?? '',
    imageUrl: bundle.image_url ?? '',
    priceMode: isFixed ? 'fixed' : 'percent',
    price: isFixed && bundle.fixed_price != null ? String(bundle.fixed_price) : '',
    percent: !isFixed && bundle.discount_percent != null ? String(bundle.discount_percent) : DEFAULT_PERCENT,
    showOnMenu: bundle.show_on_menu !== false,
    showAsSuggestion: bundle.show_as_upsell !== false,
    isActive: bundle.is_active !== false,
    picks: slots.map((slot) => {
      const explicit = slot.included_item_ids?.length ? slot.included_item_ids : null
      const itemIds = explicit
        ? knownIds(explicit, lookup)
        : items.filter((item) => item.categoryId === slot.category_id).map((item) => item.id)
      const surcharges = Object.fromEntries(
        (slot.price_overrides ?? [])
          .filter((override) => override.price_override > 0)
          .map((override) => [override.menu_item_id, Number(override.price_override)])
      )
      return { key: slot.id, label: slot.name ?? '', itemIds, count: slot.pick_count ?? 1, surcharges }
    }),
  }
}

export function comboDraftFromIdea(idea: ComboIdea): ComboDraft {
  return {
    ...emptyComboDraft(),
    name: idea.name,
    price: String(idea.price),
    picks: idea.picks.map((pick) => ({
      key: newPickKey(),
      label: pick.label,
      itemIds: [...pick.itemIds],
      count: pick.count ?? 1,
      surcharges: {},
    })),
  }
}
