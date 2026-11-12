import { addonLabel, MAX_ADDON_QUANTITY } from '@/lib/addon-quantity'
import type { AppOrderDraft } from '@/lib/app-contract'
import type { CartLineOrderItem } from '@/lib/checkout/order-items-payload'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import { isOptionAvailable } from '@/lib/modifier-groups'
import { collectLinkedItemIds } from '@/lib/modifier-linked-options'
import { MAX_LINE_QUANTITY } from '@/lib/order-line-price-floor'
import {
  findOutletMenuOverride,
  isItemListedAtOutlet,
  resolveItemForOutlet,
  type OutletMenuIndex,
} from '@/lib/outlets/outlet-menu-overrides'
import type { Category, MenuItem, ModifierGroup, ModifierOption } from '@/lib/app-api/store-types'
import { appModifierGroups, groupSelectLimits, linkedItemsAtBranch, modifierGroupsFor } from '../item-modifier-groups'

/**
 * The app's order draft (ids only) → the order lines `createOrderAction` /
 * `parseOrderLines` take, built exactly as the web checkout builds them
 * (`buildCartLineOrderItem`), so the kitchen ticket, receipts, Messenger and
 * inventory read an app order the same way as a web one.
 *
 * Groups are read through `item-modifier-groups.ts`, the SAME path the app's
 * catalog is projected with, so every id the app was shown resolves here.
 *
 * Split of picks, mirroring the web cart (`mapSelectionToCartFormat` /
 * `useVariationState` → `extractSelectionIds`): a single-select choice group
 * (max 1: variation types, legacy flat variations, unified "pick one") is a
 * VARIATION — its option ids go to `option_ids` and its names to `variation`;
 * every other group (multi-select choice, quantity/add-on groups) is ADD-ONS —
 * `addon_ids`, `addons` labels (`Name ×2` for portions) and, for quantity
 * groups, `addon_quantities` when the portions are not 1.
 *
 * Prices are not sent: every line goes out at price 0 / subtotal 0, and
 * `resolveOrderLinePrice` floors a submitted price at the dish's branch price
 * plus `priceLineModifiers`' delta — a claim can only raise the charge, so 0
 * yields exactly the server's price.
 *
 * Pure: the caller loads the rows (tenant-scoped). Never throws, never mutates.
 */

export interface DraftLinesInput {
  lines: AppOrderDraft['lines']
  /** The store's rows for the draft's dishes AND every dish their linked options point at. */
  menuItems: ReadonlyMap<string, MenuItem>
  /** The store's categories; a dish whose category is missing or inactive is off the menu. */
  categories: readonly Category[]
  tenant: Record<string, unknown>
  branchIndex: OutletMenuIndex
  outletId: string | null
}

export type DraftLinesResult = { ok: true; lines: CartLineOrderItem[] } | { ok: false; error: string }

type Refusal = { ok: false; error: string }

const GONE_FROM_MENU = 'One of the dishes in your bag is no longer on the menu. Remove it and try again.'

const refuse = (error: string): Refusal => ({ ok: false, error })

const isSingleSelect = (group: ModifierGroup): boolean => group.selection_mode !== 'quantity' && group.max_select === 1

/** Ids of the dishes the draft's linked options point at, so the caller can load them too. */
export function linkedItemIdsForDraft(dishes: readonly MenuItem[], categories: readonly Category[], tenant: Record<string, unknown>): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  return [...new Set(dishes.flatMap((dish) => collectLinkedItemIds(modifierGroupsFor(dish, byId.get(dish.category_id), tenant))))]
}

interface ChosenOption {
  option: ModifierOption
  count: number
}

/** The picks of one group, in the group's option order; a refusal names the dish. */
function readGroupPicks(dish: string, group: ModifierGroup, picked: Record<string, number>, quantity: number): ChosenOption[] | Refusal {
  const picks: ChosenOption[] = []
  for (const [optionId, count] of Object.entries(picked)) {
    const option = group.options.find((candidate) => candidate.id === optionId)
    if (!option) return refuse(`One of your choices for ${dish} is no longer on the menu. Remove it and add it again.`)
    if (!isOptionAvailable(option)) return refuse(`${option.name} for ${dish} is sold out right now.`)
    if (group.selection_mode !== 'quantity' && count !== 1) return refuse(`Choose ${option.name} only once for ${dish}.`)
    if (count > MAX_ADDON_QUANTITY) return refuse(`That is too many ${option.name} for ${dish}.`)
    if (option.stock_mode === 'simple' && count * quantity > (option.stock_qty ?? 0)) return refuse(`Not enough ${option.name} left for ${dish}.`)
    picks.push({ option, count })
  }
  return group.options.flatMap((option) => picks.filter((pick) => pick.option.id === option.id))
}

/** The group's min/max, counted as the web counts them (portions for quantity groups). */
function checkLimits(dish: string, group: ModifierGroup, picks: readonly ChosenOption[]): Refusal | null {
  const { minSelect, maxSelect } = groupSelectLimits(group)
  const total = picks.reduce((sum, pick) => sum + pick.count, 0)
  if (total < minSelect) {
    return refuse(minSelect === 1 ? `Choose an option for ${group.name} on ${dish}.` : `Choose at least ${minSelect} for ${group.name} on ${dish}.`)
  }
  if (maxSelect !== null && total > maxSelect) return refuse(`Choose at most ${maxSelect} for ${group.name} on ${dish}.`)
  return null
}

/** Every group of the dish, with its picks; unknown group ids are refused. */
function readSelections(dish: string, groups: readonly ModifierGroup[], line: AppOrderDraft['lines'][number]) {
  const known = new Set(groups.map((group) => group.id))
  if (Object.keys(line.selections).some((groupId) => !known.has(groupId))) {
    return refuse(`One of your choices for ${dish} is no longer on the menu. Remove it and add it again.`)
  }
  const chosen: { group: ModifierGroup; picks: ChosenOption[] }[] = []
  for (const group of groups) {
    const picked = Object.prototype.hasOwnProperty.call(line.selections, group.id) ? line.selections[group.id] : {}
    const picks = readGroupPicks(dish, group, picked, line.quantity)
    if (!Array.isArray(picks)) return picks
    const limits = checkLimits(dish, group, picks)
    if (limits) return limits
    chosen.push({ group, picks })
  }
  return { ok: true as const, chosen }
}

function toOrderLine(dish: MenuItem, quantity: number, chosen: readonly { group: ModifierGroup; picks: ChosenOption[] }[]): CartLineOrderItem {
  const variations = chosen.filter(({ group }) => isSingleSelect(group)).flatMap(({ picks }) => picks)
  const addons = chosen
    .filter(({ group }) => !isSingleSelect(group))
    .flatMap(({ group, picks }) => picks.map((pick) => ({ ...pick, isPortioned: group.selection_mode === 'quantity' })))
  const quantities = addons.filter((addon) => addon.isPortioned && addon.count !== 1).map((addon) => [addon.option.id, addon.count] as const)
  const variation = variations.map(({ option }) => option.name).join(', ')
  return {
    menu_item_id: dish.id,
    menu_item_name: dish.name,
    variation: variation || undefined,
    addons: addons.map(({ option, count, isPortioned }) => addonLabel({ name: option.name, quantity: isPortioned ? count : undefined })),
    quantity,
    price: 0,
    subtotal: 0,
    option_ids: variations.map(({ option }) => option.id),
    addon_ids: addons.map(({ option }) => option.id),
    ...(quantities.length > 0 ? { addon_quantities: Object.fromEntries(quantities) } : {}),
  }
}

/** The dish as the chosen branch sells it, or why it cannot be ordered. */
function resolveDish(input: DraftLinesInput, itemId: string, activeCategories: ReadonlyMap<string, Category>) {
  const dish = input.menuItems.get(itemId)
  const category = dish ? activeCategories.get(dish.category_id) : undefined
  if (!dish || !category) return refuse(GONE_FROM_MENU)
  if (dish.presell_enabled === true) return refuse(`${dish.name} needs a pickup date and can't be ordered in the app yet.`)
  const override = findOutletMenuOverride(input.branchIndex, input.outletId, dish.id)
  if (!isItemListedAtOutlet(override)) return refuse(`${dish.name} is not offered at the branch you picked.`)
  if (!isMenuItemOrderable(resolveItemForOutlet(dish, override))) return refuse(`${dish.name} is sold out right now.`)
  return { ok: true as const, dish, category }
}

export function draftToOrderLines(input: DraftLinesInput): DraftLinesResult {
  const activeCategories = new Map(input.categories.filter((category) => category.is_active).map((category) => [category.id, category]))
  const lines: CartLineOrderItem[] = []
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      return refuse(`You can order 1 to ${MAX_LINE_QUANTITY} of a dish at a time.`)
    }
    const resolved = resolveDish(input, line.itemId, activeCategories)
    if (!resolved.ok) return resolved
    const { dish, category } = resolved
    const ownGroups = modifierGroupsFor(dish, category, input.tenant)
    const linked = linkedItemsAtBranch([ownGroups], [...input.menuItems.values()], input.branchIndex, input.outletId)
    const selections = readSelections(dish.name, appModifierGroups(dish, category, input.tenant, linked), line)
    if (!selections.ok) return selections
    lines.push(toOrderLine(dish, line.quantity, selections.chosen))
  }
  return { ok: true, lines }
}
