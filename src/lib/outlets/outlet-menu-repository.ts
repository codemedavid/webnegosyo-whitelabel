/**
 * The one way anything reads or writes per-branch menu overrides.
 *
 * Same arrangement as `outlet-repository.ts`: an interface plus the validation,
 * so every backend rejects exactly the same inputs, and no path can persist a
 * combination the resolver in `outlet-menu-overrides.ts` cannot make sense of.
 *
 * The defining behaviour of this store is that it holds DIFFERENCES. Writing a
 * branch back to the store-wide values does not store a row of defaults — it
 * removes the row. Rows of defaults would be invisible to the customer and
 * highly visible to the owner, whose cross-branch views count rows to answer
 * "has anyone changed this dish anywhere?".
 */

import type { OutletMenuOverride } from '@/types/database'

export type { OutletMenuOverride } from '@/types/database'

/**
 * Columns every implementation must return.
 *
 * Spelled out rather than `*` for the reason `menu-item-select.ts` exists: a
 * column the app reads but the query never selects resolves to `undefined` at
 * runtime and silently falls back to a default. The projection test asserts
 * this list matches the type.
 */
export const OUTLET_MENU_OVERRIDE_SELECT = `
  id, tenant_id, outlet_id, menu_item_id,
  is_listed, is_available, price, discounted_price, discount_cleared,
  created_at, updated_at
`

/**
 * A partial edit of one branch's opinion. Absent keys are left exactly as they
 * are; there is no way to express "unset" other than by value (`price: null`
 * means inherit, which is the unset).
 */
export interface OutletMenuOverridePatch {
  is_listed?: boolean
  is_available?: boolean
  price?: number | null
  discounted_price?: number | null
  discount_cleared?: boolean
}

export interface OutletMenuRepository {
  /** Every override the tenant has, for the storefront's one-query index. */
  listByTenant(tenantId: string): Promise<OutletMenuOverride[]>
  /** One branch's whole opinion — the branch's Menu tab. */
  listByOutlet(tenantId: string, outletId: string): Promise<OutletMenuOverride[]>
  /** One dish across every branch — the item's Branches tab. */
  listByMenuItem(tenantId: string, menuItemId: string): Promise<OutletMenuOverride[]>
  /**
   * Merge a patch over this branch's opinion.
   *
   * Returns the stored row, or null when the result overrides nothing and the
   * branch is therefore back on the store-wide menu.
   */
  save(
    tenantId: string,
    outletId: string,
    menuItemId: string,
    patch: OutletMenuOverridePatch
  ): Promise<OutletMenuOverride | null>
  /** Return this branch to the store-wide menu outright. */
  clear(tenantId: string, outletId: string, menuItemId: string): Promise<void>
}

/** Raised for input a merchant can fix; safe to show verbatim in the UI. */
export class OutletMenuValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutletMenuValidationError'
  }
}

/** The stored shape of an override, before it gets an id and timestamps. */
export interface OutletMenuOverrideValues {
  is_listed: boolean
  is_available: boolean
  price: number | null
  discounted_price: number | null
  discount_cleared: boolean
}

/** What a branch with no opinion looks like — the store-wide menu. */
export const INHERITED_OVERRIDE: OutletMenuOverrideValues = {
  is_listed: true,
  is_available: true,
  price: null,
  discounted_price: null,
  discount_cleared: false,
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function validateMoney(value: number | null | undefined, label: string): void {
  if (value === undefined || value === null) return
  if (!isFiniteNumber(value) || value < 0) {
    throw new OutletMenuValidationError(`${label} must be zero or more.`)
  }
}

/**
 * Merge a patch over the current values and check the result.
 *
 * Validating the MERGED row rather than the patch is what catches the case a
 * two-step edit would otherwise sneak past: setting a discount of 150 today and
 * dropping the branch price to 100 tomorrow is the same broken state as doing
 * both at once.
 */
export function mergeOutletMenuOverride(
  current: OutletMenuOverrideValues,
  patch: OutletMenuOverridePatch
): OutletMenuOverrideValues {
  validateMoney(patch.price, 'Branch price')
  validateMoney(patch.discounted_price, 'Branch sale price')

  const merged: OutletMenuOverrideValues = {
    is_listed: patch.is_listed ?? current.is_listed,
    is_available: patch.is_available ?? current.is_available,
    price: patch.price !== undefined ? patch.price : current.price,
    discounted_price:
      patch.discounted_price !== undefined ? patch.discounted_price : current.discounted_price,
    discount_cleared: patch.discount_cleared ?? current.discount_cleared,
  }

  // Mirrors `outlet_menu_items_discount_exclusive_ck`.
  if (merged.discount_cleared && merged.discounted_price !== null) {
    throw new OutletMenuValidationError(
      'A branch either sets its own sale price or opts out of the sale — not both.'
    )
  }

  if (
    merged.price !== null &&
    merged.discounted_price !== null &&
    merged.discounted_price > merged.price
  ) {
    throw new OutletMenuValidationError(
      'The branch sale price must not be higher than the branch price.'
    )
  }

  return merged
}

/**
 * Whether this row still says anything.
 *
 * A row equal to the store-wide defaults is a row that changes nothing for a
 * customer, so it should not exist — see the module comment.
 */
export function overridesNothing(values: OutletMenuOverrideValues): boolean {
  return (
    values.is_listed === INHERITED_OVERRIDE.is_listed &&
    values.is_available === INHERITED_OVERRIDE.is_available &&
    values.price === null &&
    values.discounted_price === null &&
    values.discount_cleared === false
  )
}
