/**
 * PORTED from `src/lib/outlets/outlet-menu-overrides.ts` — keep the two in sync,
 * the same arrangement `staff-permissions.ts` and `branch-scope.ts` use here.
 *
 * The register has to price a dish exactly as the storefront does, or a walk-in
 * is charged one price and the same dish ordered online another.
 *
 * What one branch charges for a dish, and whether it carries it at all.
 *
 * `outlet_menu_items` is an override table: a row exists only because a branch
 * differs from the store-wide menu. Everything else — no row, an unknown
 * branch, no branch selected yet, a failed override query — must resolve to the
 * store-wide menu, unchanged. That is the behaviour every tenant has today, and
 * getting it wrong is not one wrong price at one shop, it is a wrong price
 * everywhere.
 *
 * The decision lives in a pure module for the same reason `branch-scope.ts` and
 * `staff-permissions.ts` do: the web storefront, the web admin, the merchant
 * app and the POS all have to reach the same answer, and three sets of
 * conditionals drift apart. Nothing here queries, throws, or mutates its input.
 *
 * The resolved values are written back onto the item's own `price` /
 * `discounted_price` / `is_available` fields rather than exposed as a parallel
 * shape. Every card template, cart utility and price formatter downstream then
 * keeps working untouched — the branch is applied at the seam, not at fifty
 * call sites.
 */

/** The override columns this module reads. A subset of `OutletMenuOverride`. */
export interface OutletMenuOverrideRow {
  outlet_id: string
  menu_item_id: string
  is_listed: boolean
  is_available: boolean
  price: number | null
  discounted_price: number | null
  discount_cleared: boolean
}

/** The item fields a branch can override. Anything else passes through. */
export interface OverridableMenuItem {
  id: string
  price: number
  discounted_price?: number | null
  is_available?: boolean | null
}

/** A branch as the owner-facing summary needs it. */
export interface NamedBranch {
  id: string
  name: string
}

/** Branch id → item id → override. Built once per render, read per item. */
export type OutletMenuIndex = ReadonlyMap<string, ReadonlyMap<string, OutletMenuOverrideRow>>

/** What the owner sees about one dish across the whole chain. */
export interface BranchMenuSummary {
  /** Branches the tenant has. Zero means the summary says nothing. */
  branchCount: number
  /** How many of them carry the dish. */
  listedCount: number
  /** Every branch carries it — the quiet, uninteresting case. */
  isEverywhere: boolean
  /** Any branch sets its own price or declines the store-wide discount. */
  hasPriceOverrides: boolean
  /** Effective price spread across the branches that carry it. Null if none do. */
  priceRange: { min: number; max: number } | null
  /** Names, for a tooltip the owner can read without opening each branch. */
  unlistedBranchNames: string[]
  unavailableBranchNames: string[]
}

/**
 * Index the tenant's override rows.
 *
 * Tolerates null/undefined because the storefront carries a failed override
 * query as an empty result rather than blanking the menu — the same shape
 * `menu-server.tsx` already uses for a failed outlet query.
 */
export function buildOutletMenuIndex(
  rows: readonly OutletMenuOverrideRow[] | null | undefined
): OutletMenuIndex {
  const index = new Map<string, Map<string, OutletMenuOverrideRow>>()

  for (const row of rows ?? []) {
    let byItem = index.get(row.outlet_id)
    if (!byItem) {
      byItem = new Map<string, OutletMenuOverrideRow>()
      index.set(row.outlet_id, byItem)
    }
    byItem.set(row.menu_item_id, row)
  }

  return index
}

/** The branch's opinion about this dish, or null when it has none. */
export function findOutletMenuOverride(
  index: OutletMenuIndex,
  outletId: string | null | undefined,
  menuItemId: string
): OutletMenuOverrideRow | null {
  if (!outletId) return null
  return index.get(outletId)?.get(menuItemId) ?? null
}

/** Whether the branch carries the dish. No opinion means it does. */
export function isItemListedAtOutlet(override: OutletMenuOverrideRow | null): boolean {
  return override ? override.is_listed : true
}

/**
 * The dish as this branch sells it.
 *
 * Returns a new object; the store-wide item is never mutated, because the same
 * array is rendered for other branches and for the owner's cross-branch views.
 *
 * Two asymmetries are deliberate:
 *  - a null branch price means "inherit", but zero does not — zero is a real
 *    giveaway price a merchant can set, and reading it as unset would charge
 *    for it;
 *  - `is_available` composes with AND rather than being replaced. A dish the
 *    merchant took off the whole menu stays off; a branch cannot un-86 it.
 */
export function resolveItemForOutlet<T extends OverridableMenuItem>(
  item: T,
  override: OutletMenuOverrideRow | null
): T {
  if (!override) return item

  const discounted = override.discount_cleared
    ? null
    : override.discounted_price ?? item.discounted_price ?? null

  return {
    ...item,
    price: override.price ?? item.price,
    discounted_price: discounted,
    is_available: item.is_available !== false && override.is_available,
  }
}

/**
 * The menu one branch shows: its dishes, at its prices.
 *
 * A null branch returns the store-wide menu untouched — that is the state of
 * every single-location tenant, and of a multi-branch storefront before the
 * customer has chosen (tenants using `outlet_selection_timing = 'after'` render
 * this way until checkout).
 */
export function resolveMenuForOutlet<T extends OverridableMenuItem>(
  items: readonly T[],
  index: OutletMenuIndex,
  outletId: string | null | undefined
): T[] {
  if (!outletId) return [...items]

  const resolved: T[] = []
  for (const item of items) {
    const override = findOutletMenuOverride(index, outletId, item.id)
    if (!isItemListedAtOutlet(override)) continue
    resolved.push(resolveItemForOutlet(item, override))
  }

  return resolved
}

/** The one line a menu card shows about branches, or nothing. */
export interface BranchSummaryLabel {
  text: string
  detail: string
  tone: 'neutral' | 'warning'
}

/**
 * Turn a summary into the line the owner reads while scanning the menu list.
 *
 * Returns null when there is nothing to say. A dish sold everywhere at one
 * price is the normal case, and badging it would bury the handful of dishes
 * that actually differ — which is the only reason the owner is scanning.
 *
 * Order matters: "not carried here" outranks "priced differently", because a
 * missing dish is a bigger fact than a price spread among the branches that
 * do carry it.
 */
export function describeBranchSummary(summary: BranchMenuSummary): BranchSummaryLabel | null {
  if (summary.branchCount === 0) return null

  if (summary.listedCount === 0) {
    return {
      text: 'No branches',
      detail: `Not on the menu at ${summary.unlistedBranchNames.join(', ')}.`,
      tone: 'warning',
    }
  }

  if (!summary.isEverywhere) {
    return {
      text: `${summary.listedCount} of ${summary.branchCount} branches`,
      detail: `Not on the menu at ${summary.unlistedBranchNames.join(', ')}.`,
      tone: 'neutral',
    }
  }

  if (summary.unavailableBranchNames.length > 0) {
    return {
      text: `Out of stock at ${summary.unavailableBranchNames.length}`,
      detail: `Currently unavailable at ${summary.unavailableBranchNames.join(', ')}.`,
      tone: 'warning',
    }
  }

  if (summary.hasPriceOverrides) {
    return {
      text: 'Prices vary',
      detail: summary.priceRange
        ? `From ${summary.priceRange.min} to ${summary.priceRange.max} across branches.`
        : 'Priced differently at some branches.',
      tone: 'neutral',
    }
  }

  return null
}

/** The effective selling price at a branch — the discount when there is one. */
function effectivePrice(item: OverridableMenuItem): number {
  return typeof item.discounted_price === 'number' ? item.discounted_price : item.price
}

/**
 * One dish, seen across every branch — the owner's view.
 *
 * Built from the same resolution the customer gets, so the badge on the menu
 * list can never disagree with the price on the storefront.
 */
export function summarizeItemAcrossBranches<T extends OverridableMenuItem>(
  item: T,
  branches: readonly NamedBranch[],
  index: OutletMenuIndex
): BranchMenuSummary {
  const unlistedBranchNames: string[] = []
  const unavailableBranchNames: string[] = []
  const prices: number[] = []
  let hasPriceOverrides = false
  let listedCount = 0

  for (const branch of branches) {
    const override = findOutletMenuOverride(index, branch.id, item.id)

    if (!isItemListedAtOutlet(override)) {
      unlistedBranchNames.push(branch.name)
      continue
    }

    listedCount += 1
    const resolved = resolveItemForOutlet(item, override)

    if (override && (override.price !== null || override.discounted_price !== null || override.discount_cleared)) {
      hasPriceOverrides = true
    }
    if (resolved.is_available === false && item.is_available !== false) {
      unavailableBranchNames.push(branch.name)
    }

    prices.push(effectivePrice(resolved))
  }

  return {
    branchCount: branches.length,
    listedCount,
    isEverywhere: branches.length > 0 && listedCount === branches.length,
    hasPriceOverrides,
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    unlistedBranchNames,
    unavailableBranchNames,
  }
}
